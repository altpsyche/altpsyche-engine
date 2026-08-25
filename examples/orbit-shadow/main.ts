/**
 * The fifth example, and Phase 4's exit criterion: an orbit camera, one
 * shadow-casting light, and around fifty objects — a scene, drawn through the
 * scene tier's producer.
 *
 * Where `instanced-cubes` (item 30) hand-wrote its build-time frame because no
 * producer existed yet, this is what Phase 4 built: `sceneView(arena, options)`
 * (item 32) turns a world and the cameras watching it into a frame, and the
 * one-pipeline restriction is gone (item 33), so the scene spans two pipelines —
 * one drawing each object's shadow flattened onto the ground, one drawing the lit
 * object over it. The producer decides the order those two passes run in, which is
 * the whole of what item 33 unlocked, and it is spelled here as the order the
 * pipelines are listed: shadows first, lit objects on top.
 *
 * **The shadow is a planar projection, which is a shadow-casting light expressed
 * in the vocabulary the producer has today.** A directional light casts each
 * object's shadow onto the ground plane `y = 0`; the matrix that flattens a world
 * position onto that plane along the light is worked out on the CPU
 * (`groundShadow`) and baked into the shadow pipeline's per-object buffer. So the
 * light moving would move every shadow, and it is data the graph carries rather
 * than a second render target — which is what lets the whole picture stay a
 * function of the world and the light, snapshot-diffable the way item 34's presets
 * are.
 *
 * **The camera orbits by rebuilding the graph.** `sceneView` bakes each view's
 * matrix into a storage buffer rather than feeding it as a uniform, on purpose
 * (item 32), so a moving camera is a new graph each frame rather than a new
 * uniform — `surface.setGraph(build(theta))` on every animation frame, off one
 * arena whose resident buffers are reused while the world keeps its shape. That is
 * the honest cost of a producer whose output is data, and driving it here is what
 * the exit criterion is for: if it were painful the API would be wrong, and this
 * is the cheap moment to find out.
 *
 * **"Both backends" is two authorings of one idea**, as in `instanced-cubes`: a
 * frame is one language and each backend speaks one, so this ships a WGSL scene
 * (`selectBackend` routes it to WebGPU) and a GLSL fullscreen approximation
 * (routed to WebGL 2), and draws whichever the device offers. The two are not the
 * same picture: the WebGL 2 backend draws one fullscreen pass and has no vertex
 * buffer or storage buffer of its own until Phase 5 (items 46–49), so the scene
 * tier's real home is WebGPU today and the GLSL arm stands in for it with an
 * analytic orbit-and-shadow drawn in the fragment stage. That asymmetry is the
 * backend's, not the example's.
 *
 * Like every example it reaches the library through the one door and nothing under
 * it. The door ships no scene-authoring builder beyond `sceneView`, so the world,
 * the materials and the pipelines are written by hand — the honest test of what a
 * consumer authoring a scene does today.
 */
import {
  Arena,
  cost,
  createSurface,
  glslFrame,
  mat4,
  requestWebGPUDevice,
  sceneView,
  selectBackend,
  vec3,
} from '@altpsyche/engine';
import type {
  Camera,
  Entity,
  Material,
  MaterialDraw,
  Mat4,
  ModuleSpec,
  RenderPipelineSpec,
  Scene,
  SceneViewOptions,
  FrameGraph,
} from '@altpsyche/engine';

/** The grid the objects stand on: seven by seven is forty-nine, which is "around
 * fifty" and lays out as a square a camera can orbit and read at a glance. */
const SIDE = 7;
const SPACING = 1.6;

/** A material here feeds one colour and nothing else — the shape the shader's
 * per-object struct reads after the model matrix. The shadow material carries one
 * too so both pipelines pack the same eighty-byte record; its colour is unread. */
type Panel = { tint: [number, number, number] };

/** One object's record for a storage buffer: its model matrix (a `mat4x4<f32>`,
 * sixty-four bytes) then its colour as a `vec4<f32>` (the fourth lane padding the
 * `vec3` out to sixteen bytes, which is the alignment a storage struct gives it). */
const MODEL_BYTES = 64;
const OBJECT_BYTES = 80;

/** The direction the light travels — down and a little to one side, so a shadow
 * falls away from each object rather than straight under it. */
const LIGHT = vec3.normalize(vec3(0.35, -1, 0.25));

/**
 * The matrix that flattens a world position onto the ground plane `y = 0` along
 * the light, which is the classic planar-shadow projection. A point `p` casts its
 * shadow where the ray from `p` along the light meets `y = 0`: `p - (p.y / L.y) L`.
 * Column-major, so the y-column carries the shear that collapses height into the
 * ground and every other column is the identity's.
 */
function groundShadow(light: { x: number; y: number; z: number }): Mat4 {
  const a = light.x / light.y;
  const b = light.z / light.y;
  return [1, 0, 0, 0, -a, 0, -b, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

const SHADOW = groundShadow(LIGHT);

/** Sixteen little-endian floats — what a `mat4x4<f32>` reads out of a buffer — as
 * the bytes a record begins with. */
function matBytes(m: Mat4): Uint8Array {
  return new Uint8Array(mat4.pack(m).buffer);
}

/** A lit object's record: its own world matrix, then its colour. */
const packLit = (draw: MaterialDraw<Panel>): Uint8Array => {
  const out = new Uint8Array(OBJECT_BYTES);
  out.set(matBytes(draw.world), 0);
  out.set(new Uint8Array(Float32Array.from([...draw.values.tint, 0]).buffer), MODEL_BYTES);
  return out;
};

/** A shadow's record: the same object flattened onto the ground along the light,
 * so the shadow pipeline draws the object's silhouette lying on `y = 0`. The
 * colour lane is left zero; the shadow fragment reads a fixed dark colour instead. */
const packShadow = (draw: MaterialDraw<Panel>): Uint8Array => {
  const out = new Uint8Array(OBJECT_BYTES);
  out.set(matBytes(mat4.multiply(SHADOW, draw.world)), 0);
  return out;
};

/**
 * The scene: a lit object and its shadow at every grid cell, so the shadow is a
 * second entity sharing the lit one's place. Both name the same transform, and the
 * shadow pipeline's `pack` is what turns that place into a silhouette on the
 * ground — the object is not moved, only projected. Forty-nine cells, ninety-eight
 * entities, drawn as two instanced passes of forty-nine.
 */
function world(): Scene {
  const entities: Entity[] = [];
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      const height = 0.4 + 0.35 * (((row * SIDE + col) % 4) / 3);
      const transform = {
        position: vec3((col - (SIDE - 1) / 2) * SPACING, height, (row - (SIDE - 1) / 2) * SPACING),
        rotation: mat4.rotationY((row + col) * 0.4),
        scale: vec3(0.4, height, 0.4),
      };
      const tone = (row + col) % 3;
      entities.push({ id: `cube-${row}-${col}`, material: `lit-${tone}`, transform });
      entities.push({ id: `shadow-${row}-${col}`, material: 'shadow', transform });
    }
  }
  return { entities };
}

// Three lit materials all naming the one lit pipeline, so the grid has colour
// without a second pipeline — a material is one pipeline handed different numbers,
// never a different program. The shadow material names the shadow pipeline.
const MATERIALS: Record<string, Material<Panel>> = {
  'lit-0': { pipeline: 'lit', values: { tint: [0.92, 0.5, 0.35] } },
  'lit-1': { pipeline: 'lit', values: { tint: [0.4, 0.7, 0.55] } },
  'lit-2': { pipeline: 'lit', values: { tint: [0.45, 0.55, 0.95] } },
  shadow: { pipeline: 'shadow', values: { tint: [0, 0, 0] } },
};

// One module holds all three entry points. The vertex stage `project` reads the
// object matrix out of whichever storage buffer is bound at group 0 binding 0 —
// the lit pipeline binds `objects`, the shadow pipeline binds `shadowObjects` —
// and the view-projection out of the shared `views` buffer, indexing the first
// (and only) view. `shade` lights a face; `shadow` fills a flat dark silhouette.
const SCENE_WGSL = `
struct Object {
  model: mat4x4<f32>,
  tint: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> objects: array<Object>;
@group(0) @binding(1) var<storage, read> views: array<mat4x4<f32>>;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) tint: vec3<f32>,
};

@vertex
fn project(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(instance_index) i: u32) -> VsOut {
  let obj = objects[i];
  let world = obj.model * vec4<f32>(position, 1.0);
  var out: VsOut;
  out.clip = views[0] * world;
  out.normal = (obj.model * vec4<f32>(normal, 0.0)).xyz;
  out.tint = obj.tint.xyz;
  return out;
}

@fragment
fn shade(in: VsOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let toLight = normalize(vec3<f32>(-0.35, 1.0, -0.25));
  let lambert = max(dot(n, toLight), 0.0);
  return vec4<f32>(in.tint * (0.3 + 0.7 * lambert), 1.0);
}

@fragment
fn shadow(in: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(0.06, 0.06, 0.09, 1.0);
}`;

const MODULE: ModuleSpec = { name: 'scene', code: SCENE_WGSL };

/** The eight corners of a unit cube and its six faces as two triangles each:
 * thirty-six vertices of position and face normal, twenty-four bytes apiece. No
 * source file holds geometry — it is numbers, generated here — and both pipelines
 * read this one buffer. */
function cubeVertices(): Uint8Array<ArrayBuffer> {
  const face = (normal: number[], a: number[], b: number[], c: number[], d: number[]) =>
    [a, b, c, a, c, d].map((corner) => [...corner, ...normal]);
  const p = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const faces = [
    face([0, 0, 1], p[4]!, p[5]!, p[6]!, p[7]!),
    face([0, 0, -1], p[1]!, p[0]!, p[3]!, p[2]!),
    face([1, 0, 0], p[5]!, p[1]!, p[2]!, p[6]!),
    face([-1, 0, 0], p[0]!, p[4]!, p[7]!, p[3]!),
    face([0, 1, 0], p[7]!, p[6]!, p[2]!, p[3]!),
    face([0, -1, 0], p[0]!, p[1]!, p[5]!, p[4]!),
  ];
  return new Uint8Array(Float32Array.from(faces.flat().flat()).buffer);
}

const VERTICES = cubeVertices();
const VERTEX_STRIDE = 24;

const litPipeline: RenderPipelineSpec = {
  kind: 'render',
  name: 'lit',
  vertex: { module: 'scene', entry: 'project' },
  fragment: { module: 'scene', entry: 'shade' },
  geometry: 'cube',
  bindings: [
    { group: 0, binding: 0, resource: 'objects', visibility: ['vertex'] },
    { group: 0, binding: 1, resource: 'views', visibility: ['vertex'] },
  ],
};

const shadowPipeline: RenderPipelineSpec = {
  kind: 'render',
  name: 'shadow',
  vertex: { module: 'scene', entry: 'project' },
  fragment: { module: 'scene', entry: 'shadow' },
  geometry: 'cube',
  bindings: [
    { group: 0, binding: 0, resource: 'shadowObjects', visibility: ['vertex'] },
    { group: 0, binding: 1, resource: 'views', visibility: ['vertex'] },
  ],
};

const options: SceneViewOptions<Panel> = {
  id: 'orbit-shadow',
  target: 'wgsl',
  modules: [MODULE],
  // Shadows first, lit objects on top: the producer's ordering decision (item 33),
  // spelled as the order the pipelines are listed.
  pipelines: [
    { pipeline: shadowPipeline, objects: { buffer: 'shadowObjects', pack: packShadow } },
    { pipeline: litPipeline, objects: { buffer: 'objects', pack: packLit } },
  ],
  materials: MATERIALS,
  requires: ['storage-buffer'],
  resources: [
    {
      kind: 'vertices',
      name: 'cube',
      stride: VERTEX_STRIDE,
      attributes: [
        { location: 0, offset: 0, format: 'float32x3' },
        { location: 1, offset: 12, format: 'float32x3' },
      ],
      topology: 'triangle-list',
      count: VERTICES.byteLength / VERTEX_STRIDE,
      source: 'cube',
      data: VERTICES,
    },
  ],
  views: { buffer: 'views' },
};

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// The camera watching the grid from an orbit: it circles the origin at a fixed
// height and radius, aimed a little above the ground so the objects sit in the
// lower two-thirds of the frame. `theta` is the angle around the grid, advanced by
// the clock so the scene turns.
function orbit(theta: number): Camera {
  const radius = 9;
  const width = canvas.clientWidth || canvas.width || 800;
  const height = canvas.clientHeight || canvas.height || 600;
  return {
    eye: vec3(Math.cos(theta) * radius, 5.5, Math.sin(theta) * radius),
    target: vec3(0, 1, 0),
    up: vec3(0, 1, 0),
    fovY: Math.PI / 4,
    aspect: width / Math.max(height, 1),
    near: 0.5,
    far: 100,
  };
}

// One arena for every frame the WGSL scene builds: its resident buffers are
// allocated once and refilled while the world keeps its shape, so an orbiting
// camera is a new graph over reused buffers rather than a fresh pair each frame.
// The scene holds only byte buffers, so there is nothing to dispose.
const arena = new Arena<Uint8Array>(() => {});
const scene = world();
const producer = sceneView(arena, options);
const build = (theta: number): FrameGraph => producer.graph(scene, [orbit(theta)]);

// The WebGL 2 stand-in: a fullscreen fragment that draws the same idea — a grid of
// lit blocks with shadows cast along the light — analytically, because that
// backend has no scene tier of its own yet (Phase 5). It orbits on `seconds`.
const GLSL_VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const GLSL_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 viewport;
uniform float seconds;
out vec4 colour;

// A cheap top-down look at the grid: the plane is tilted back and turned by the
// clock, each cell drawn as a rounded block with a shadow offset along the light.
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * viewport) / viewport.y;
  float a = seconds * 0.3;
  mat2 turn = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 ground = turn * (uv * 12.0);

  vec3 sky = mix(vec3(0.06, 0.07, 0.10), vec3(0.11, 0.13, 0.18), 0.5 + 0.5 * uv.y);
  vec3 col = sky;
  vec2 light = vec2(0.35, 0.25) * 1.4;

  for (int row = 0; row < 7; row++) {
    for (int cell = 0; cell < 7; cell++) {
      vec2 centre = (vec2(float(cell), float(row)) - 3.0) * 1.6;
      float shadow = smoothstep(0.9, 0.5, length(ground - centre - light));
      col = mix(col, col * 0.45, shadow);
    }
  }
  for (int row = 0; row < 7; row++) {
    for (int cell = 0; cell < 7; cell++) {
      vec2 centre = (vec2(float(cell), float(row)) - 3.0) * 1.6;
      float block = smoothstep(0.62, 0.5, length(ground - centre));
      int tone = (row + cell) - 3 * ((row + cell) / 3);
      vec3 tint = tone == 0 ? vec3(0.92, 0.5, 0.35) : tone == 1 ? vec3(0.4, 0.7, 0.55) : vec3(0.45, 0.55, 0.95);
      col = mix(col, tint, block);
    }
  }
  colour = vec4(col, 1.0);
}`;

const glslFrameOf = glslFrame('orbit-shadow', GLSL_VERTEX, GLSL_FRAGMENT);

// The cost of the scene is a fact about its structure — two passes, one instanced
// draw each — the same on any machine, so it is worth printing whichever backend
// draws. The WGSL scene is measured off a built frame; the GLSL frame is one pass.
const size = { width: canvas.width || 800, height: canvas.height || 600 };
console.log('WebGPU scene cost', cost(build(0), size));
console.log('WebGL 2 cost', cost(glslFrameOf, size));

// Ask for a WebGPU card first, because whether asking returns one is the fact
// selection reads; a WebGL 2 context is offered wherever the canvas gives one.
const device = await requestWebGPUDevice();
const offer = {
  webgpu: device !== null,
  webgl2: canvas.getContext('webgl2') !== null,
};

const wgpu = selectBackend(build(0), offer);
if ('backend' in wgpu && device) {
  // The scene tier on WebGPU: rebuild the graph each frame with the camera one
  // step further round its orbit, and swap it in. `setGraph` draws the new
  // graph, so this drives the loop itself rather than calling `start()` — a moving
  // camera is a new graph, not a new uniform (item 32).
  const surface = await createSurface(canvas, build(0), {
    backend: 'webgpu',
    device,
    uniforms: () => ({}),
    onError: (message) => showMessage(message),
  });
  if (!surface) {
    showMessage('WebGPU could not give this page a device');
  } else {
    const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
    addEventListener('resize', fit);
    fit();
    const orbitLoop = (now: number) => {
      surface.setGraph(build(now * 0.0003));
      requestAnimationFrame(orbitLoop);
    };
    requestAnimationFrame(orbitLoop);
  }
} else {
  const gl = selectBackend(glslFrameOf, offer);
  if ('backend' in gl) {
    const surface = await createSurface(canvas, glslFrameOf, {
      uniforms: (elapsedSeconds) => ({
        viewport: [canvas.width, canvas.height],
        seconds: elapsedSeconds,
      }),
      onError: (message) => showMessage(message),
    });
    if (!surface) {
      showMessage('WebGL 2 could not give this page a context');
    } else {
      const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
      addEventListener('resize', fit);
      fit();
      surface.start();
    }
  } else {
    // Neither backend is offered here, which is the one arm that draws nothing.
    showMessage('refusal' in wgpu ? wgpu.refusal : 'no backend can draw this frame');
  }
}

/** Show a line of text over the canvas, which is what a refusal reads as: the page
 * said why rather than showing a black rectangle. */
function showMessage(message: string): void {
  console.error(message);
  const banner = document.createElement('pre');
  banner.textContent = message;
  banner.style.cssText =
    'position:fixed;inset:0;margin:auto;max-width:40rem;height:max-content;' +
    'padding:1.5rem;color:#eee;font:16px/1.5 ui-monospace,monospace;white-space:pre-wrap;';
  document.body.appendChild(banner);
}
