/**
 * What a consumer of the published package can do with it, run against the tarball
 * rather than against these sources.
 *
 * `gates/pack.sh` packs the package, installs the tarball into a directory outside
 * this repository, copies this file and the device double in, and runs it.
 * Installing is what makes the check mean something: it reads `dist` and the
 * `exports` field the way a consumer's tooling will, so a file left out of `files`
 * or an entry pointing at nothing fails here and nowhere else.
 *
 * What this file cannot fail on is how the specifiers inside `dist` are written,
 * because it runs through tsx and tsx resolves a relative import with no extension.
 * The gate asks plain node to import the package before it runs this, which is the
 * question that separates a package anything can load from one only a bundler can.
 *
 * The device is the double beside it, copied in as the consumer's own file, and the
 * one import line is rewritten as it is copied. That double imports nothing but the
 * door, which is the point: a consumer can write one.
 *
 * It lives in the package rather than in this site's scripts so it travels with the
 * library, and so it reaches the double by a relative path rather than across the
 * package line, which the boundary check refuses and refused when it sat outside.
 */
import {
  createFrameRenderer,
  wgslFrame,
  uniformBlockOf,
  vec3,
  mat4,
  drawList,
  batchOnePipeline,
  compareTraces,
  type FrameGraph,
} from '@altpsyche/engine';
import { createFakeGPU, paddedFrame } from './support/fake-gpu';

const CODE = `
struct Uniforms { u_time: f32, u_resolution: vec2<f32> }
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(at.x / uniforms.u_resolution.x, uniforms.u_time, 1.0, 1.0);
}
`;

const BLOCK = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];
const UNIFORMS = [
  { name: 'u_time', type: 'float' },
  { name: 'u_resolution', type: 'vec2' },
];

const graph = (): FrameGraph => wgslFrame('consumer-check', CODE, BLOCK, UNIFORMS);

async function main(): Promise<void> {
  const failures: string[] = [];
  const check = (what: string, ok: boolean, saw: unknown): void => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${ok ? '' : `  saw ${JSON.stringify(saw)}`}`);
    if (!ok) failures.push(what);
  };

  // A frame drawn through the door, on a device the consumer brought.
  const gpu = createFakeGPU({ connected: true });
  const renderer = await createFrameRenderer(gpu.canvas, { backend: 'webgpu', device: gpu.device });
  if (!renderer) throw new Error('the door gave no renderer');
  renderer.resize(4, 3);
  gpu.mapped = paddedFrame(4, 3);
  const pixels = await renderer.frame(graph(), { u_time: 0.5, u_resolution: [4, 3] });

  check('the renderer reports the backend it built', renderer.backend === 'webgpu', renderer.backend);
  check('one draw reached the device', gpu.calls('draw').length === 1, gpu.calls('draw').length);
  check('a frame of pixels came back', pixels !== undefined && pixels.length === 4 * 3 * 4, pixels?.length);

  // The uniform layout a WGSL source lays out, computed off its struct.
  const block = uniformBlockOf(CODE);
  check(
    'the block names both members',
    block?.length === 2,
    block?.map((one) => one.name)
  );

  // The maths, reached as namespaces.
  const turned = mat4.multiply(mat4.rotationY(Math.PI / 2), mat4.IDENTITY);
  const moved = mat4.transformPoint(mat4.translation(vec3(1, 2, 3)), vec3(0, 0, 0));
  check('a matrix composes', turned.length === 16, turned.length);
  check('a point moves', moved.x === 1 && moved.y === 2 && moved.z === 3, moved);
  check('a vector measures', Math.abs(vec3.magnitude(vec3(3, 4, 0)) - 5) < 1e-9, vec3.magnitude(vec3(3, 4, 0)));

  // A scene becoming draws, and one pipeline's batch out of it.
  const scene = {
    entities: [
      {
        id: 'a',
        transform: { position: vec3(0, 0, 0), rotation: mat4.IDENTITY, scale: vec3(1, 1, 1) },
        material: 'red',
      },
      {
        id: 'b',
        parent: 'a',
        transform: { position: vec3(0, 1, 0), rotation: mat4.IDENTITY, scale: vec3(1, 1, 1) },
        material: 'red',
      },
    ],
    camera: {
      eye: vec3(0, 2, 5),
      target: vec3(0, 0, 0),
      up: vec3(0, 1, 0),
      fovY: 0.8,
      aspect: 1.5,
      near: 0.1,
      far: 100,
    },
  };
  check('a scene becomes draws', drawList(scene).length === 2, drawList(scene).length);
  const batch = batchOnePipeline(scene, { red: { pipeline: 'flat', values: { tint: 1 } } });
  check('a batch names its one pipeline', batch.pipeline === 'flat', batch.pipeline);

  // A mixed scene is refused, and the refusal is the reason rather than a crash.
  let refused = '';
  try {
    batchOnePipeline(scene, { red: { pipeline: 'flat', values: {} } } as never);
    batchOnePipeline(
      {
        ...scene,
        entities: [
          { ...scene.entities[0]!, material: 'red' },
          { ...scene.entities[1]!, material: 'blue' },
        ],
      },
      {
        red: { pipeline: 'flat', values: {} },
        blue: { pipeline: 'other', values: {} },
      }
    );
  } catch (error) {
    refused = (error as Error).message;
  }
  check('a two-pipeline scene is refused by name', refused.includes('one pipeline'), refused);

  // The recording double's comparison, which travels with the library.
  check('two identical traces agree', compareTraces([], []).length === 0, compareTraces([], []).length);

  console.log(
    failures.length === 0 ? `\nall ${11 - failures.length} of 11 checks passed` : `\n${failures.length} failed`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
