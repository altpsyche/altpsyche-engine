/**
 * The sixth example: a mesh that is not in the page when it opens, fetched as an
 * asset a moment later, parsed by this file, and drawn — the asset-loading tier.
 *
 * This is where [RoadToPureEngine.md](../../docs/RoadToPureEngine.md) §17 decision 5
 * lands: **the asset pipeline lives outside this library.** The arena takes bytes —
 * `ImageBitmap`, `ArrayBuffer`, typed arrays — and glTF parsing is a consumer's
 * business, so the library ships no parser and this example writes the small one its
 * own asset needs. That is the honest test of the decision: if drawing a loaded mesh
 * needed the library to grow a `gltf()` door, the decision would be wrong, and this
 * shows it does not.
 *
 * **The mesh arrives after the page opened, and appears mid-session.** The surface is
 * built and started on a "loading" frame first, so the page is live and drawing
 * before any mesh exists; then `loadCubeMesh()` fetches the glTF document and its
 * buffer (both `data:` URIs here, fetched asynchronously exactly as a network asset
 * would be, so the mesh is genuinely not present at first paint), parses them, and
 * `surface.setGraph` swaps in the scene that draws the mesh. The new geometry is
 * uploaded into the already-running surface, which is item 11's queued-upload path
 * ordering the vertex and index bytes before the draw that reads them.
 *
 * **The mesh is drawn through the scene tier's producer** (`sceneView`, item 32): the
 * loaded cube is one object in a one-entity world, its per-object record and the
 * camera's view-projection baked into storage buffers, emitted as one instanced pass.
 * A rotation rebuilt each frame turns the cube — a new graph over the arena's reused
 * buffers, the honest cost of a producer whose output is data (item 32).
 *
 * **"Both backends" is two authorings of one idea**, as in the scene examples: the
 * scene tier's storage buffers are WebGPU's today (WebGL 2 gains them in Phase 5), so
 * the WGSL scene draws the loaded mesh on WebGPU, and the WebGL 2 arm stands in with a
 * raymarched cube while still fetching the asset — proving the load itself is
 * cross-backend and only the mesh-tier draw is WebGPU's for now. That asymmetry is the
 * backend's, not this example's.
 *
 * Like every example it reaches the library through the one door and nothing under it,
 * and it names no parser the door does not ship because the door ships none.
 */
import {
  Arena,
  buffer,
  cost,
  createSurface,
  indices,
  mat4,
  moduleHandle,
  requestWebGPUDevice,
  sceneView,
  selectBackend,
  uniformBlockOf,
  vec3,
  vertices,
  glslFrame,
  wgslFrame,
} from '@altpsyche/engine';
import type {
  Camera,
  Material,
  MaterialDraw,
  ModuleSpec,
  RenderPipelineSpec,
  Scene,
  SceneViewOptions,
  FrameGraph,
} from '@altpsyche/engine';

/**
 * The asset: a standards-valid glTF 2.0 document for a unit cube with per-face
 * normals, its binary buffer embedded as a base64 `data:` URI the way glTF allows.
 * The whole document is itself a `data:model/gltf+json` URI so `fetch` loads it after
 * the page opens rather than the bundle carrying a parsed mesh — a `data:` URI is a
 * real asynchronous fetch, so the mesh is absent at first paint just as a networked
 * `.gltf` would be. Generated once, by hand-run, and pasted here; no source file holds
 * the geometry because geometry is numbers, and here they are the asset's numbers.
 */
const ASSET =
  'data:model/gltf+json;base64,eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIiwiZ2VuZXJhdG9yIjoiQGFsdHBzeWNoZS9lbmdpbmUgZXhhbXBsZXMvZ2x0Zi1jdWJlIn0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjY0OCwidXJpIjoiZGF0YTphcHBsaWNhdGlvbi9vY3RldC1zdHJlYW07YmFzZTY0LEFBQUF2d0FBQUw4QUFBQS9BQUFBUHdBQUFMOEFBQUEvQUFBQVB3QUFBRDhBQUFBL0FBQUF2d0FBQUQ4QUFBQS9BQUFBUHdBQUFMOEFBQUMvQUFBQXZ3QUFBTDhBQUFDL0FBQUF2d0FBQUQ4QUFBQy9BQUFBUHdBQUFEOEFBQUMvQUFBQVB3QUFBTDhBQUFBL0FBQUFQd0FBQUw4QUFBQy9BQUFBUHdBQUFEOEFBQUMvQUFBQVB3QUFBRDhBQUFBL0FBQUF2d0FBQUw4QUFBQy9BQUFBdndBQUFMOEFBQUEvQUFBQXZ3QUFBRDhBQUFBL0FBQUF2d0FBQUQ4QUFBQy9BQUFBdndBQUFEOEFBQUEvQUFBQVB3QUFBRDhBQUFBL0FBQUFQd0FBQUQ4QUFBQy9BQUFBdndBQUFEOEFBQUMvQUFBQXZ3QUFBTDhBQUFDL0FBQUFQd0FBQUw4QUFBQy9BQUFBUHdBQUFMOEFBQUEvQUFBQXZ3QUFBTDhBQUFBL0FBQUFBQUFBQUFBQUFJQS9BQUFBQUFBQUFBQUFBSUEvQUFBQUFBQUFBQUFBQUlBL0FBQUFBQUFBQUFBQUFJQS9BQUFBQUFBQUFBQUFBSUMvQUFBQUFBQUFBQUFBQUlDL0FBQUFBQUFBQUFBQUFJQy9BQUFBQUFBQUFBQUFBSUMvQUFDQVB3QUFBQUFBQUFBQUFBQ0FQd0FBQUFBQUFBQUFBQUNBUHdBQUFBQUFBQUFBQUFDQVB3QUFBQUFBQUFBQUFBQ0F2d0FBQUFBQUFBQUFBQUNBdndBQUFBQUFBQUFBQUFDQXZ3QUFBQUFBQUFBQUFBQ0F2d0FBQUFBQUFBQUFBQUFBQUFBQWdEOEFBQUFBQUFBQUFBQUFnRDhBQUFBQUFBQUFBQUFBZ0Q4QUFBQUFBQUFBQUFBQWdEOEFBQUFBQUFBQUFBQUFnTDhBQUFBQUFBQUFBQUFBZ0w4QUFBQUFBQUFBQUFBQWdMOEFBQUFBQUFBQUFBQUFnTDhBQUFBQUFBQUJBQUlBQUFBQ0FBTUFCQUFGQUFZQUJBQUdBQWNBQ0FBSkFBb0FDQUFLQUFzQURBQU5BQTRBREFBT0FBOEFFQUFSQUJJQUVBQVNBQk1BRkFBVkFCWUFGQUFXQUJjQSJ9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6Mjg4LCJ0YXJnZXQiOjM0OTYyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6Mjg4LCJieXRlTGVuZ3RoIjoyODgsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo1NzYsImJ5dGVMZW5ndGgiOjcyLCJ0YXJnZXQiOjM0OTYzfV0sImFjY2Vzc29ycyI6W3siYnVmZmVyVmlldyI6MCwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJ0eXBlIjoiVkVDMyIsIm1pbiI6Wy0wLjUsLTAuNSwtMC41XSwibWF4IjpbMC41LDAuNSwwLjVdfSx7ImJ1ZmZlclZpZXciOjEsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjIsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjozNiwidHlwZSI6IlNDQUxBUiJ9XSwibWVzaGVzIjpbeyJuYW1lIjoiY3ViZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sImluZGljZXMiOjJ9XX1dLCJub2RlcyI6W3sibWVzaCI6MCwibmFtZSI6ImN1YmUifV0sInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJzY2VuZSI6MH0=';

/** What one parsed primitive gives us: the interleaved vertex bytes the pipeline
 * reads (position then normal, twenty-four bytes a vertex), the index bytes, and the
 * two counts the geometry resources carry. */
type Mesh = { vertices: Uint8Array<ArrayBuffer>; indices: Uint8Array<ArrayBuffer>; vertexCount: number; indexCount: number };

// The two glTF component types this asset uses, and nothing else. A parser is a
// consumer's business (decision 5), so this one carries only what its own asset
// needs and refuses the rest by name rather than pretending to be a full loader.
const GL_FLOAT = 5126;
const GL_UNSIGNED_SHORT = 5123;

/**
 * Parse this asset's cube out of a fetched glTF document. It is deliberately the
 * minimum the asset needs — one mesh, one primitive, `POSITION` and `NORMAL` as
 * `float` `VEC3`, indices as `unsigned short` — and it reads each accessor through its
 * buffer view into the buffer bytes, the way the glTF spec lays them out. Anything the
 * asset does not use is refused by name, because a parser that guesses at what it
 * cannot read is how a wrong mesh draws in silence.
 */
async function loadCubeMesh(): Promise<Mesh> {
  const gltf = await fetch(ASSET).then((response) => response.json());
  // The buffers, each its own `data:` URI, fetched as bytes — `fetch` decodes a
  // base64 `data:` URI, so no hand-rolled base64 lives here.
  const buffers: ArrayBuffer[] = await Promise.all(
    (gltf.buffers as { uri: string }[]).map((buffer) => fetch(buffer.uri).then((response) => response.arrayBuffer()))
  );

  const read = (index: number, type: string, component: number): ArrayBufferView => {
    const accessor = gltf.accessors[index];
    if (accessor.type !== type || accessor.componentType !== component) {
      throw new Error(
        `gltf-cube: accessor ${index} is ${accessor.type}/${accessor.componentType}, this example reads only ${type}/${component}`
      );
    }
    const view = gltf.bufferViews[accessor.bufferView];
    const buffer = buffers[view.buffer]!;
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const components = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 0;
    if (components === 0) throw new Error(`gltf-cube: accessor type ${type} is not one this example reads`);
    if (component === GL_FLOAT) return new Float32Array(buffer, offset, accessor.count * components);
    if (component === GL_UNSIGNED_SHORT) return new Uint16Array(buffer, offset, accessor.count * components);
    throw new Error(`gltf-cube: component type ${component} is not one this example reads`);
  };

  const primitive = gltf.meshes[0].primitives[0];
  const positions = read(primitive.attributes.POSITION, 'VEC3', GL_FLOAT) as Float32Array;
  const normals = read(primitive.attributes.NORMAL, 'VEC3', GL_FLOAT) as Float32Array;
  const glIndices = read(primitive.indices, 'SCALAR', GL_UNSIGNED_SHORT) as Uint16Array;

  // Interleave position and normal into the stride-24 layout the pipeline declares —
  // three floats then three floats a vertex — rather than the two separate buffers
  // the glTF happens to store them in.
  const vertexCount = positions.length / 3;
  const interleaved = new Float32Array(vertexCount * 6);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    interleaved.set(positions.subarray(vertex * 3, vertex * 3 + 3), vertex * 6);
    interleaved.set(normals.subarray(vertex * 3, vertex * 3 + 3), vertex * 6 + 3);
  }
  const indexBytes = new Uint8Array(glIndices.length * 2);
  indexBytes.set(new Uint8Array(glIndices.buffer, glIndices.byteOffset, glIndices.byteLength));

  return {
    vertices: new Uint8Array(interleaved.buffer),
    indices: indexBytes,
    vertexCount,
    indexCount: glIndices.length,
  };
}

const VERTEX_STRIDE = 24;

/** A material here feeds one colour and nothing else — the shape the shader's
 * per-object struct reads after the model matrix. */
type Panel = { tint: [number, number, number] };

const MODEL_BYTES = 64;
const OBJECT_BYTES = 80;

/** Sixteen little-endian floats — what a `mat4x4<f32>` reads out of a buffer. */
function matBytes(m: readonly number[]): Uint8Array {
  return new Uint8Array(mat4.pack(m as never).buffer);
}

/** One lit object's record: its world matrix, then its colour padded to sixteen. */
const packLit = (draw: MaterialDraw<Panel>): Uint8Array => {
  const out = new Uint8Array(OBJECT_BYTES);
  out.set(matBytes(draw.world), 0);
  out.set(new Uint8Array(Float32Array.from([...draw.values.tint, 0]).buffer), MODEL_BYTES);
  return out;
};

// One lit material, one lit pipeline: the loaded cube draws through it, its transform
// spun each frame so the mesh turns once it appears.
const MATERIALS: Record<string, Material<Panel>> = {
  lit: { pipeline: 'lit', values: { tint: [0.9, 0.6, 0.4] } },
};

// The scene shader: the vertex stage reads the cube's model matrix out of the
// per-object storage buffer and the view-projection out of the shared views buffer,
// and the fragment stage lights the face. It is the lit half of `orbit-shadow`'s
// shader — the scene tier's storage-buffer shape, which is WebGPU's today.
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
  let toLight = normalize(vec3<f32>(0.4, 0.7, 0.6));
  let lambert = max(dot(n, toLight), 0.0);
  return vec4<f32>(in.tint * (0.25 + 0.75 * lambert), 1.0);
}`;

const MODULE: ModuleSpec = { name: 'scene', wgsl: SCENE_WGSL };

// The resource layout `sceneView` lays these bindings out against (item 87): the
// two `options.resources` entries are the cube geometry (resource 0) and its index
// buffer (resource 1), then the shared `views` buffer (resource 2), then this one
// group's object buffer (resource 3). Each binding names its resource by handle.
const litPipeline: RenderPipelineSpec = {
  kind: 'render',
  source: {
    vertex: { document: 'scene', text: SCENE_WGSL, entry: 'project' },
    fragment: { document: 'scene', text: SCENE_WGSL, entry: 'shade' },
  },
  geometry: vertices(0),
  bindings: [
    { group: 0, binding: 0, resource: buffer(3), visibility: ['vertex'] },
    { group: 0, binding: 1, resource: buffer(2), visibility: ['vertex'] },
  ],
};

/** The scene-view options for a loaded mesh: the geometry is the parsed cube, held as
 * a vertex resource naming its index resource so the pair cannot come apart. Built
 * only once the mesh has arrived, because the geometry is its bytes. */
function optionsFor(mesh: Mesh): SceneViewOptions<Panel> {
  return {
    id: 'gltf-cube',
    authored: 'wgsl',
    pipelines: [{ name: 'lit', pipeline: litPipeline, objects: { buffer: 'objects', pack: packLit } }],
    materials: MATERIALS,
    requires: ['storage-buffer'],
    resources: [
      {
        kind: 'vertices',
        stride: VERTEX_STRIDE,
        attributes: [
          { location: 0, offset: 0, format: 'float32x3' },
          { location: 1, offset: 12, format: 'float32x3' },
        ],
        topology: 'triangle-list',
        count: mesh.vertexCount,
        indices: indices(1),
        data: mesh.vertices,
      },
      { kind: 'indices', format: 'uint16', count: mesh.indexCount, data: mesh.indices },
    ],
    views: { buffer: 'views' },
  };
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

/** The camera watching the cube from a fixed three-quarter view; the cube itself
 * spins, so the camera is still. */
function camera(): Camera {
  const width = canvas.clientWidth || canvas.width || 800;
  const height = canvas.clientHeight || canvas.height || 600;
  return {
    eye: vec3(1.8, 1.4, 2.6),
    target: vec3(0, 0, 0),
    up: vec3(0, 1, 0),
    fovY: Math.PI / 4,
    aspect: width / Math.max(height, 1),
    near: 0.1,
    far: 100,
  };
}

/** The one-entity world, the cube spun by the clock so it turns once it appears. The
 * rotation is baked into the object buffer each frame, so a spinning cube is a new
 * graph over the arena's reused buffer (item 32) — and each rebuild re-uploads the
 * object bytes through item 11's queued path. */
function spinning(theta: number): Scene {
  return {
    entities: [
      {
        id: 'cube',
        material: 'lit',
        transform: { position: vec3(0, 0, 0), rotation: mat4.rotationY(theta), scale: vec3(1, 1, 1) },
      },
    ],
  };
}

// The frame shown while the mesh is loading: a WGSL fullscreen pulse, so the page is
// live and drawing before any mesh exists and the mesh's arrival is a visible swap
// rather than a first paint. `fragMain` is the fullscreen fragment entry the toy-tier
// WGSL frame builder expects.
const WAIT_WGSL = `
struct Uniforms { u_time: f32, u_resolution: vec2<f32> }
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = at.xy / uniforms.u_resolution;
  let pulse = 0.5 + 0.5 * sin(uniforms.u_time * 2.0);
  return vec4<f32>(vec3<f32>(0.05, 0.06, 0.09) + 0.06 * pulse * vec3<f32>(uv.x, uv.y, 1.0), 1.0);
}`;

const waitingFrame = wgslFrame('gltf-cube-loading', WAIT_WGSL, uniformBlockOf(WAIT_WGSL));

// The WebGL 2 stand-in: a raymarched cube, because that backend has no scene tier of
// its own until Phase 5 (items 46–49). It still fetches the asset below, so the load
// is exercised on either backend and only the mesh-tier draw is WebGPU's for now.
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

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

mat3 rotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * viewport) / viewport.y;
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv, -1.5));
  mat3 spin = rotY(seconds * 0.7) * rotX(seconds * 0.4);
  vec3 col = vec3(0.05, 0.06, 0.09);
  float t = 0.0;
  for (int i = 0; i < 80; i++) {
    vec3 p = spin * (ro + rd * t);
    float d = sdBox(p, vec3(0.7));
    if (d < 0.001) {
      vec2 e = vec2(0.001, 0.0);
      vec3 n = normalize(vec3(
        sdBox(p + e.xyy, vec3(0.7)) - sdBox(p - e.xyy, vec3(0.7)),
        sdBox(p + e.yxy, vec3(0.7)) - sdBox(p - e.yxy, vec3(0.7)),
        sdBox(p + e.yyx, vec3(0.7)) - sdBox(p - e.yyx, vec3(0.7))));
      float lambert = max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
      col = vec3(0.9, 0.6, 0.4) * (0.25 + 0.75 * lambert);
      break;
    }
    t += d;
    if (t > 10.0) break;
  }
  colour = vec4(col, 1.0);
}`;

const glslStandIn = glslFrame('gltf-cube', GLSL_VERTEX, GLSL_FRAGMENT);

// Ask for a WebGPU card first; a WebGL 2 context is offered wherever the canvas gives
// one. Which the device offers picks which arm draws.
const device = await requestWebGPUDevice();
const offer = { webgpu: device !== null, webgl2: canvas.getContext('webgl2') !== null };

const wgpu = selectBackend(waitingFrame, offer);
if ('backend' in wgpu && device) {
  await drawOnWebGPU(device);
} else {
  const gl = selectBackend(glslStandIn, offer);
  if ('backend' in gl) {
    drawOnWebGL2();
  } else {
    showMessage('refusal' in wgpu ? wgpu.refusal : 'no backend can draw this frame');
  }
}

/** The scene tier on WebGPU: show the loading frame live, load the mesh, then swap in
 * the scene that draws it and spin it. */
async function drawOnWebGPU(gpu: GPUDevice): Promise<void> {
  const surface = await createSurface(canvas, waitingFrame, {
    backend: 'webgpu',
    device: gpu,
    uniforms: (elapsedSeconds) => ({ u_time: elapsedSeconds, u_resolution: [canvas.width, canvas.height] }),
    onError: (message) => showMessage(message),
  });
  if (!surface) {
    showMessage('WebGPU could not give this page a device');
    return;
  }
  const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
  addEventListener('resize', fit);
  fit();
  surface.start();

  // The asset arrives here, after the page is already drawing the loading frame.
  const mesh = await loadCubeMesh();
  console.log(`gltf-cube: loaded ${mesh.vertexCount} vertices, ${mesh.indexCount} indices`);

  const arena = new Arena<Uint8Array>(() => {});
  const producer = sceneView(arena, optionsFor(mesh));
  const build = (theta: number): FrameGraph => producer.graph(spinning(theta), [camera()]);
  console.log('gltf-cube scene cost', cost(build(0), { width: canvas.width || 800, height: canvas.height || 600 }));

  // Stop the loading loop and drive the scene ourselves: a spinning cube is a new
  // graph each frame, swapped in by `setGraph` (item 32), and the first swap is
  // where the loaded mesh appears mid-session.
  surface.stop();
  const spin = (now: number) => {
    surface.setGraph(build(now * 0.0009));
    requestAnimationFrame(spin);
  };
  requestAnimationFrame(spin);
}

/** The WebGL 2 arm: fetch the asset too — so the load is proven cross-backend — then
 * draw the raymarched stand-in, because the mesh tier is WebGPU's until Phase 5. */
function drawOnWebGL2(): void {
  void loadCubeMesh().then(
    (mesh) => console.log(`gltf-cube: loaded ${mesh.vertexCount} vertices (WebGL 2 draws the stand-in until Phase 5)`),
    (error) => console.error(error)
  );
  void createSurface(canvas, glslStandIn, {
    uniforms: (elapsedSeconds) => ({ viewport: [canvas.width, canvas.height], seconds: elapsedSeconds }),
    onError: (message) => showMessage(message),
  }).then((surface) => {
    if (!surface) {
      showMessage('WebGL 2 could not give this page a context');
      return;
    }
    const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
    addEventListener('resize', fit);
    fit();
    surface.start();
  });
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
