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
  declaredFrame,
  groupsToCover,
  openRenderer,
  wgslFrame,
  uniformBlockOf,
  vec3,
  mat4,
  drawList,
  batchOnePipeline,
  compareTraces,
  type DeclaredFrame,
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

const graph = (): FrameGraph => wgslFrame('consumer-check', CODE, BLOCK);

async function main(): Promise<void> {
  const failures: string[] = [];
  // Counted rather than written down. The total was the literal `11` in two places
  // at the end of this file, so a check added here printed "all 11 of 11" while
  // running thirteen — the gate reporting a number that was not the number it took,
  // which is the one thing a gate may not do. Item 12 added two checks and found it.
  let taken = 0;
  const check = (what: string, ok: boolean, saw: unknown): void => {
    taken += 1;
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

  // The door that chooses (item 12): one call from a canvas and a frame to a
  // renderer, with the card handed in rather than asked for, which is the shape a
  // page with more than one canvas uses. This is the check that says a consumer
  // outside this repository reaches a drawing renderer without running the four
  // steps itself.
  const opening = await openRenderer(gpu.canvas, graph(), { device: gpu.device });
  check(
    'one call reaches a renderer that draws',
    'renderer' in opening && opening.renderer.backend === 'webgpu',
    'refusal' in opening ? opening.refusal : 'renderer' in opening ? opening.renderer.backend : opening
  );
  check(
    'it hands back the frame that renderer draws',
    'frame' in opening && opening.frame.authored === 'wgsl',
    'frame' in opening ? opening.frame.authored : opening
  );
  if ('renderer' in opening) opening.renderer.dispose();

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

  // The frame declaration reader (item 1). This is the check the item's `Done when`
  // names: a consumer outside this repository turning a WGSL source and a declaration
  // into a `FrameGraph`, through the installed tarball rather than through an import
  // from inside the tree. Two passes, because one pass over the whole frame is what
  // `wgslFrame` already does and proves nothing about this path.
  //
  // Nothing here names a generator. The pair's size is declared, the dispatch count
  // is arithmetic on that size, and no fixture name crosses the door — which is the
  // other half of the `Done when` and is why this compiles at all.
  const FIELD = `
struct Uniforms { u_time: f32, u_resolution: vec2<f32> }
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var next: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var fieldSampler: sampler;
@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) cell: vec3<u32>) {
  let size = vec2<i32>(textureDimensions(next));
  let at = vec2<i32>(i32(cell.x), i32(cell.y));
  if (at.x >= size.x || at.y >= size.y) { return; }
  let was = textureLoad(previous, at, 0).rg;
  textureStore(next, at, vec4<f32>(was.r, was.g + uniforms.u_time * 0.0, 0.0, 1.0));
}
@fragment
fn shade(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let at = pixel.xy / uniforms.u_resolution;
  let level = textureSample(previous, fieldSampler, at).g;
  return vec4<f32>(level, level * 0.5, 1.0 - level, 1.0);
}
`;
  const GRID = { width: 256, height: 256 };
  const declared: DeclaredFrame = {
    pairs: [{ read: 'previous', write: 'next', size: GRID }],
    samplers: [{ name: 'fieldSampler', filter: 'linear', wrap: 'clamp' }],
    passes: [
      { pipeline: 'step', groups: groupsToCover(GRID, [8, 8, 1]) },
      { pipeline: 'shade' },
    ],
  };
  const declaredGraph = declaredFrame('field', FIELD, declared);

  check(
    'a declared frame of two passes becomes a graph',
    declaredGraph.passes.length === 2 && declaredGraph.resources.length === 4,
    { passes: declaredGraph.passes.length, resources: declaredGraph.resources.length }
  );
  check(
    'the stage each pipeline runs at came off the source rather than the declaration',
    declaredGraph.pipelines.map((one) => one.kind).join(',') === 'compute,render',
    declaredGraph.pipelines.map((one) => one.kind)
  );
  check(
    'it is the same kind of graph the builders make',
    declaredGraph.authored === wgslFrame('x', CODE, BLOCK).authored,
    declaredGraph.authored
  );

  // The half that is the reason the reader exists: a disagreement between the
  // declaration and the source stops here with a sentence naming it, rather than
  // reaching a driver that refuses the pipeline after the fact.
  let named = '';
  try {
    declaredFrame('field', FIELD, { ...declared, passes: [{ pipeline: 'absent' }] });
  } catch (error) {
    named = (error as Error).message;
  }
  check('an entry point the source does not declare is refused by name', named.includes('absent'), named);

  console.log(
    failures.length === 0 ? `\nall ${taken} of ${taken} checks passed` : `\n${failures.length} of ${taken} failed`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
