/**
 * The fourth example, and Phase 3's exit criterion: a thousand objects, one
 * pipeline, each with its own transform, drawn in one pass by one instanced draw.
 *
 * This is the shape items 26–28 exist for. `RenderPass.draws` is a list (item 26),
 * a single draw covers many instances (item 28), and `cost()` counts that one call
 * as one draw however many instances it reads — so a thousand cubes is `draws: 1`,
 * `passes: 1`, which is what a budget (item 31) is then set against. Each cube's
 * transform is derived in the vertex shader from `@builtin(instance_index)` — a
 * grid cell plus a per-instance spin — so no per-instance buffer is needed and the
 * same one instanced draw runs on both backends.
 *
 * "Both backends" is two authorings of one idea, because a frame is one language
 * and each backend speaks one: `selectBackend` routes the WGSL frame to WebGPU and
 * the GLSL frame to WebGL 2, and this file draws whichever the device offers.
 *
 * The two are not the same picture, and that asymmetry is the WebGL 2 backend's
 * today rather than this example's: that backend draws one fullscreen pass and has
 * no vertex buffer of its own (item 49 is where it gains one), so on WebGPU each
 * object is a real depth-tested 3-D cube read out of a vertex buffer, and on
 * WebGL 2 each is one instance of the backend's own corners, shrunk and placed by
 * `gl_InstanceID`. Both are a thousand objects, one pipeline, one instanced draw,
 * one pass — which is the API this example is the exit criterion for.
 *
 * Like every example it reaches the library through the one door and nothing under
 * it. The door ships no instanced-geometry builder, so it writes the descriptions
 * by hand — the honest test of what a consumer authoring this today does.
 */
import {
  cost,
  createSurface,
  frameOf,
  moduleHandle,
  pipelineHandle,
  requestWebGPUDevice,
  selectBackend,
  texture,
  uniform,
  uniformBlockOf,
  vertices,
  WGSL_DOCUMENT,
} from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';

/** How many objects the one instanced draw covers. A thousand is Phase 3's bar. */
const COUNT = 1000;

// The WGSL source: one cube read out of a vertex buffer, placed by its instance.
// The vertex stage reads `position` and `normal` off the geometry and the instance
// index off the builtin, works out the cube's cell in a 10×10×10 grid and its own
// spin from the clock, and projects it with a zero-to-one perspective — the depth
// convention WebGPU keeps, so a `less` test orders nearer cubes over farther ones.
const WGSL_SOURCE = `
struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) tint: vec3<f32>,
};

fn rotY(a: f32) -> mat3x3<f32> {
    let c = cos(a);
    let s = sin(a);
    return mat3x3<f32>(vec3<f32>(c, 0.0, -s), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(s, 0.0, c));
}

fn rotX(a: f32) -> mat3x3<f32> {
    let c = cos(a);
    let s = sin(a);
    return mat3x3<f32>(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, c, s), vec3<f32>(0.0, -s, c));
}

@vertex
fn cube(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(instance_index) instance: u32) -> VsOut {
    let side = 10u;
    let gx = f32(instance % side);
    let gy = f32((instance / side) % side);
    let gz = f32(instance / (side * side));
    // Centre the grid on the origin, then space the cells apart.
    let cell = (vec3<f32>(gx, gy, gz) - vec3<f32>(4.5)) * 2.2;

    let t = uniforms.u_time;
    let spin = rotY(t + f32(instance) * 0.3) * rotX(t * 0.6 + f32(instance) * 0.1);

    let world = spin * (position * 0.5) + cell;

    // View space: the camera sits back on +z, so the grid is pushed in front of
    // it along -z.
    let view = vec4<f32>(world.x, world.y, world.z - 40.0, 1.0);

    let fov = 0.9;
    let near = 1.0;
    let far = 200.0;
    let g = 1.0 / tan(fov * 0.5);
    let aspect = uniforms.u_resolution.x / max(uniforms.u_resolution.y, 1.0);

    var out: VsOut;
    out.clip = vec4<f32>(
        g / aspect * view.x,
        g * view.y,
        far / (near - far) * view.z + far * near / (near - far),
        -view.z,
    );
    out.normal = spin * normal;
    out.tint = 0.5 + 0.5 * cos(f32(instance) * 0.11 + vec3<f32>(0.0, 2.1, 4.2));
    return out;
}

@fragment
fn shade(frag: VsOut) -> @location(0) vec4<f32> {
    let lambert = max(dot(normalize(frag.normal), normalize(vec3<f32>(0.4, 0.7, 0.6))), 0.0);
    return vec4<f32>(frag.tint * (0.25 + 0.75 * lambert), 1.0);
}`;

/** The eight corners of a unit cube centred on the origin, and the six faces as
 * two triangles each, so the buffer is thirty-six vertices of position and face
 * normal. No source file holds geometry — it is numbers, generated here. */
function cubeVertices(): Uint8Array<ArrayBuffer> {
  const face = (normal: [number, number, number], a: number[], b: number[], c: number[], d: number[]) =>
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
  const floats = Float32Array.from(faces.flat().flat());
  return new Uint8Array(floats.buffer);
}

const VERTICES = cubeVertices();
/** Position (three floats) then normal (three floats): twenty-four bytes a vertex. */
const VERTEX_STRIDE = 24;

// The WGSL frame's structure: one uniform block, one cube vertex buffer, one
// frame-sized depth attachment, one render pipeline reading the geometry and
// testing depth, and one pass issuing a single draw of `COUNT` instances into the
// frame's own colour target. `draws: [{ instances }]` is the one instanced draw —
// the vertex count is the geometry's, so it is not written a second time here.
const WGSL_DESCRIPTION: FrameGraph = {
  authored: 'wgsl',
  resources: [
    { kind: 'uniform' },
    {
      kind: 'vertices',
      stride: VERTEX_STRIDE,
      attributes: [
        { location: 0, offset: 0, format: 'float32x3' },
        { location: 1, offset: 12, format: 'float32x3' },
      ],
      topology: 'triangle-list',
      count: VERTICES.byteLength / VERTEX_STRIDE,
      source: 'cube',
    },
    // Frame-sized, so the depth follows a resize the way the colour does; it is
    // cleared each frame and read by nothing afterwards, so item 1 discards its
    // store rather than writing it back.
    { kind: 'texture', size: { scale: 1 }, format: 'depth24plus', use: ['attachment'] },
  ],
  modules: [{ name: WGSL_DOCUMENT, wgsl: '' }],
  pipelines: [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'cube' },
      fragment: { module: moduleHandle(0), entry: 'shade' },
      geometry: vertices(1),
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['vertex'] }],
      depth: { format: 'depth24plus', compare: 'less', write: true },
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: COUNT }], depth: { resource: texture(2), clear: 1 } }],
};

const wgslFrame = frameOf(
  'instanced-cubes',
  WGSL_DESCRIPTION,
  { [WGSL_DOCUMENT]: WGSL_SOURCE },
  uniformBlockOf(WGSL_SOURCE),
  undefined,
  new Map([[1, VERTICES]])
);

// The GLSL pair for WebGL 2. That backend draws the frame's own corners, so each
// object is one instance of the fullscreen triangle, shrunk and placed in a grid
// by `gl_InstanceID` and spun by the clock — the same one-instanced-draw idea the
// WGSL frame runs, in the geometry this backend has today.
const GLSL_VERTEX = `#version 300 es
in vec3 position;
uniform float uTime;
uniform vec2 uResolution;
out vec3 vTint;
void main() {
  int id = gl_InstanceID;
  int cols = 40;
  float gx = float(id % cols);
  float gy = float(id / cols);
  vec2 cell = (vec2(gx, gy) - vec2(19.5, 12.0)) * vec2(0.045, 0.07);
  float a = uTime + float(id) * 0.3;
  float c = cos(a);
  float s = sin(a);
  mat2 spin = mat2(c, -s, s, c);
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 local = spin * (position.xy * 0.03);
  vec2 p = cell + local;
  p.x /= aspect;
  gl_Position = vec4(p, 0.0, 1.0);
  vTint = 0.5 + 0.5 * cos(float(id) * 0.11 + vec3(0.0, 2.1, 4.2));
}`;

const GLSL_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vTint;
out vec4 colour;
void main() {
  colour = vec4(vTint, 1.0);
}`;

// The WebGL 2 backend draws its own corners, so the draw counts vertices and the
// instance count rides beside them: `{ vertices: 3, instances: COUNT }` is one
// `drawArraysInstanced` (item 28) covering the thousand objects in one pass.
const GLSL_DESCRIPTION: FrameGraph = {
  authored: 'glsl',
  resources: [{ kind: 'uniform' }],
  modules: [{ name: 'vertex', glsl: '' }, { name: 'fragment', glsl: '' }],
  pipelines: [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'main' },
      fragment: { module: moduleHandle(1), entry: 'main' },
      bindings: [],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3, instances: COUNT }] }],
};

const glslFrame = frameOf(
  'instanced-cubes',
  GLSL_DESCRIPTION,
  { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT }
);

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// The cost of a thousand objects is a fact about the frame's structure, not the
// device, so it is the same on either backend and worth printing whichever draws:
// one pass, one draw, and — on WebGPU — the bytes of the frame-sized depth target.
const size = { width: canvas.width || 800, height: canvas.height || 600 };
console.log('WebGPU cost', cost(wgslFrame, size));
console.log('WebGL 2 cost', cost(glslFrame, size));

// Ask for a WebGPU card first, because whether asking returns one is the fact
// selection reads. A WebGL 2 context is offered wherever the canvas gives one.
const device = await requestWebGPUDevice();
const offer = {
  webgpu: device !== null,
  webgl2: canvas.getContext('webgl2') !== null,
};

// Draw the frame the device can build. WGSL routes to WebGPU and GLSL to WebGL 2,
// so the offering picks which frame is drawn as much as which backend draws it.
const wgpu = selectBackend(wgslFrame, offer);
if ('backend' in wgpu && device) {
  const surface = await createSurface(canvas, wgslFrame, {
    backend: 'webgpu',
    device,
    uniforms: (elapsedSeconds) => ({
      u_time: elapsedSeconds,
      u_resolution: [canvas.width, canvas.height],
    }),
    onError: (message) => showMessage(message),
  });
  run(surface, 'WebGPU could not give this page a device');
} else {
  const gl = selectBackend(glslFrame, offer);
  if ('backend' in gl) {
    const surface = await createSurface(canvas, glslFrame, {
      uniforms: (elapsedSeconds) => ({
        uTime: elapsedSeconds,
        uResolution: [canvas.width, canvas.height],
      }),
      onError: (message) => showMessage(message),
    });
    run(surface, 'WebGL 2 could not give this page a context');
  } else {
    // Neither backend is offered here, which is the one arm that draws nothing.
    showMessage('refusal' in wgpu ? wgpu.refusal : 'no backend can draw this frame');
  }
}

/** Start a surface that fits the canvas and follows a resize, or say why it could
 * not be built rather than leaving a black rectangle. */
function run(surface: Awaited<ReturnType<typeof createSurface>>, whenAbsent: string): void {
  if (!surface) {
    showMessage(whenAbsent);
    return;
  }
  const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
  addEventListener('resize', fit);
  fit();
  surface.start();
}

/** Show a line of text over the canvas, which is what a refusal reads as: the
 * page said why rather than showing a black rectangle. */
function showMessage(message: string): void {
  console.error(message);
  const banner = document.createElement('pre');
  banner.textContent = message;
  banner.style.cssText =
    'position:fixed;inset:0;margin:auto;max-width:40rem;height:max-content;' +
    'padding:1.5rem;color:#eee;font:16px/1.5 ui-monospace,monospace;white-space:pre-wrap;';
  document.body.appendChild(banner);
}
