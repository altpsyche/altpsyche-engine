import { describe, expect, it } from 'vitest';
import { declaredFrame, geometryFileName, textureFileName } from '../fixtures/shader-describe';
import { buffer, indices, moduleHandle, pipelineHandle, sampler, texture, uniform, vertices } from '../graph/handles.js';
import { TEXTURE_CONTENT } from '../fixtures/shader-content';
import type { DeclaredFrame } from '../fixtures/declared-frame';
import { BLEND_MODE } from '../fixtures/shader-blend';
import type {
  ComputePipelineSpec,
  IndexResource,
  RenderPassSpec,
  RenderPipelineSpec,
  TextureResource,
  VertexResource,
} from '@altpsyche/engine';

/**
 * What an entry may declare about its frame, and what the source has to agree
 * with before the build writes it.
 *
 * Every case below is a disagreement that is silent on the card: a picture that
 * stays whatever the memory held, a binding declared as the wrong kind of thing,
 * or a pipeline the driver refuses after the fact with a message about a stage
 * rather than about the description. So each one is a refusal here with the name
 * of what disagreed in it.
 */

const COMPUTE = `struct Uniforms { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn paint(@builtin(global_invocation_id) at: vec3<u32>) {
  textureStore(picture, vec2<i32>(at.xy), vec4<f32>(uniforms.u_time));
}`;

const SAMPLES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var grain: texture_2d<f32>;
@group(0) @binding(2) var grainSampler: sampler;

@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(grain, grainSampler, at.xy / uniforms.u_resolution);
}`;

const SAMPLING_FRAME: DeclaredFrame = {
  textures: [{ name: 'grain', size: { width: 64, height: 64 }, content: 'value-noise' }],
  samplers: [{ name: 'grainSampler', filter: 'linear', wrap: 'repeat' }],
  passes: [{ pipeline: 'fragMain' }],
};

const COMPUTE_FRAME: DeclaredFrame = {
  textures: [{ name: 'picture', size: { scale: 1 } }],
  passes: [{ pipeline: 'paint', groups: [1, 1, 1] }],
  present: 'picture',
};

describe('the pipeline kind a description takes off the source', () => {
  it('describes a render pipeline over the backend’s three corners for a fragment entry', () => {
    const frame = declaredFrame('core-texture', SAMPLES, SAMPLING_FRAME);
    const pipeline = frame.pipelines[0] as RenderPipelineSpec;

    expect(pipeline.kind).toBe('render');
    // The source lives on the pipeline now (item 99): its WGSL pair empty until a
    // loader fills it, no vertex stage (the fullscreen marker, item 103), and the
    // fragment naming the one WGSL document at its entry point.
    expect(pipeline.source).toEqual({ wgsl: { vertex: '', fragment: '' } });
    expect(pipeline.vertex).toBeUndefined();
    expect(pipeline.fragment).toEqual({ document: 'wgsl', entry: 'fragMain' });
    expect(frame.passes).toEqual([{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }]);
    // A render-only frame names no shared module — its source is the pipeline's own.
    expect(frame.modules).toEqual([]);
  });

  it('describes a compute pipeline for a compute entry, and calls its document by its language', () => {
    const frame = declaredFrame('core-compute', COMPUTE, COMPUTE_FRAME);

    expect(frame.pipelines[0]!.kind).toBe('compute');
    expect(frame.modules).toEqual([{ name: 'wgsl', wgsl: '' }]);
    expect(frame.passes).toEqual([{ pipeline: pipelineHandle(0), groups: [1, 1, 1] }]);
  });

  it('refuses a pass naming an entry point the source declares at neither stage', () => {
    expect(() => declaredFrame('x', SAMPLES, { ...SAMPLING_FRAME, passes: [{ pipeline: 'absent' }] })).toThrow(
      /runs "absent" and its source declares no such entry/
    );
  });

  it('refuses a compute entry run with no groups, since there is nothing to cover', () => {
    expect(() => declaredFrame('x', COMPUTE, { ...COMPUTE_FRAME, passes: [{ pipeline: 'paint' }] })).toThrow(
      /runs the compute entry "paint" with no groups/
    );
  });

  it('refuses a fragment entry given a group count, which is the other kind of work', () => {
    expect(() =>
      declaredFrame('x', SAMPLES, { ...SAMPLING_FRAME, passes: [{ pipeline: 'fragMain', groups: [1, 1, 1] }] })
    ).toThrow(/dispatches "fragMain", which its source declares as a fragment stage/);
  });
});

describe('the texture a description says the build writes', () => {
  it('carries the generator’s format and an address of its own, and is sampled rather than stored', () => {
    const frame = declaredFrame('core-texture', SAMPLES, SAMPLING_FRAME);
    // uniform block 0, grain texture 1, grainSampler 2.
    const grain = frame.resources[1] as TextureResource;

    expect(grain.format).toBe(TEXTURE_CONTENT['value-noise'].format);
    expect(grain.use).toEqual(['sample']);
    expect(grain.size).toEqual({ width: 64, height: 64 });
    expect(grain.source).toBe(textureFileName('core-texture', 'grain'));
    expect(grain.data).toBeUndefined();
  });

  it('leaves a stored texture the format its own declaration carries and no address at all', () => {
    // uniform block 0, picture texture 1.
    const picture = declaredFrame('core-compute', COMPUTE, COMPUTE_FRAME).resources[1] as TextureResource;

    expect(picture.use).toEqual(['storage']);
    expect(picture.format).toBe('rgba8unorm');
    expect(picture.source).toBeUndefined();
  });

  it('refuses contents for a name the source stores into rather than samples', () => {
    expect(() =>
      declaredFrame('x', COMPUTE, {
        ...COMPUTE_FRAME,
        textures: [{ name: 'picture', size: { width: 64, height: 64 }, content: 'value-noise' }],
      })
    ).toThrow(/sizes a texture "picture" its source never samples/);
  });

  it('refuses a size for a name the source samples rather than stores into', () => {
    expect(() =>
      declaredFrame('x', SAMPLES, { ...SAMPLING_FRAME, textures: [{ name: 'grain', size: { width: 64, height: 64 } }] })
    ).toThrow(/sizes a texture "grain" its source never writes/);
  });

  it('refuses contents and the frame’s own size together, since one arrives once and the other is remade', () => {
    expect(() =>
      declaredFrame('x', SAMPLES, {
        ...SAMPLING_FRAME,
        textures: [{ name: 'grain', size: { scale: 1 }, content: 'value-noise' }],
      })
    ).toThrow(/gives "grain" contents and the frame/);
  });
});

describe('the sampler a description names', () => {
  it('carries the filter and the wrap the entry chose, at the binding the source declares', () => {
    const frame = declaredFrame('core-texture', SAMPLES, SAMPLING_FRAME);

    expect(frame.resources).toContainEqual({
      kind: 'sampler',
      filter: 'linear',
      wrap: 'repeat',
    });
    expect((frame.pipelines[0] as RenderPipelineSpec).bindings).toEqual([
      { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] },
      { group: 0, binding: 1, resource: texture(1), visibility: ['fragment'], reads: 'sample' },
      { group: 0, binding: 2, resource: sampler(2), visibility: ['fragment'] },
    ]);
  });

  it('refuses a sampler the source never declares', () => {
    expect(() =>
      declaredFrame('x', SAMPLES, {
        ...SAMPLING_FRAME,
        samplers: [{ name: 'absent', filter: 'linear', wrap: 'repeat' }],
      })
    ).toThrow(/describes a sampler "absent" its source never declares/);
  });
});

describe('the picture the build generates', () => {
  it('is four bytes a pixel with every pixel opaque', () => {
    const bytes = TEXTURE_CONTENT['value-noise'].bytes(64, 64);

    expect(bytes).toHaveLength(64 * 64 * 4);
    expect([...bytes].filter((_, at) => at % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  });

  it('is the same bytes every time it is asked for, since two machines have to write one file', () => {
    expect(TEXTURE_CONTENT['value-noise'].bytes(64, 64)).toEqual(TEXTURE_CONTENT['value-noise'].bytes(64, 64));
  });

  it('is a picture rather than a flat colour, and no row or column of it is one level', () => {
    const bytes = TEXTURE_CONTENT['value-noise'].bytes(64, 64);
    const level = (x: number, y: number) => bytes[(y * 64 + x) * 4] as number;
    const axis = [...Array(64).keys()];
    const levels = (of: (at: number) => number) => new Set(axis.map(of)).size;

    expect(axis.filter((y) => levels((x) => level(x, y)) > 1)).toHaveLength(64);
    expect(axis.filter((x) => levels((y) => level(x, y)) > 1)).toHaveLength(64);
  });

  it('tiles, so a sampler set to repeat shows no seam where the picture meets itself', () => {
    const bytes = TEXTURE_CONTENT['value-noise'].bytes(64, 64);
    const level = (x: number, y: number) => bytes[(y * 64 + x) * 4] as number;

    // The step across the seam is no bigger than the biggest step inside the
    // picture, which is what a seam would break: a lattice that did not wrap
    // puts two unrelated corners next to each other there.
    const inside = Math.max(...[...Array(64).keys()].map((y) => Math.abs(level(1, y) - level(0, y))));
    const seam = Math.max(...[...Array(64).keys()].map((y) => Math.abs(level(0, y) - level(63, y))));
    expect(seam).toBeLessThanOrEqual(inside);
  });
});

describe('a resource the entry point never reads', () => {
  const WITH_SPARE = SAMPLES.replace(
    '@fragment',
    `@group(0) @binding(3) var spareSampler: sampler;

@fragment`
  );

  it('is refused with the name of the entry point that does not read it', () => {
    const frame: DeclaredFrame = {
      ...SAMPLING_FRAME,
      samplers: [
        { name: 'grainSampler', filter: 'linear', wrap: 'repeat' },
        { name: 'spareSampler', filter: 'nearest', wrap: 'clamp' },
      ],
    };

    expect(() => declaredFrame('core-texture', WITH_SPARE, frame)).toThrow(
      /describes "spareSampler", which no pass of it reads/
    );
  });

  it('leaves the layout naming only what the stage reaches', () => {
    const frame = declaredFrame('core-texture', WITH_SPARE, SAMPLING_FRAME);
    const pipeline = frame.pipelines[0] as RenderPipelineSpec;

    expect(pipeline.bindings.map((at) => at.resource)).toEqual([uniform(0), texture(1), sampler(2)]);
  });
});

describe('a frame of several passes', () => {
  const TWO_STAGES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var next: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var stateSampler: sampler;

@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) cell: vec3<u32>) {
  let was = textureLoad(previous, vec2<i32>(cell.xy), 0);
  textureStore(next, vec2<i32>(cell.xy), was);
}

@fragment
fn shade(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(previous, stateSampler, pixel.xy / uniforms.u_resolution);
}`;

  const TWO_PASSES: DeclaredFrame = {
    textures: [
      { name: 'previous', size: { width: 256, height: 256 }, content: 'value-noise' },
      { name: 'next', size: { width: 256, height: 256 } },
    ],
    samplers: [{ name: 'stateSampler', filter: 'linear', wrap: 'clamp' }],
    passes: [{ pipeline: 'step', groups: [32, 32, 1] }, { pipeline: 'shade' }],
  };

  it('builds one pipeline per entry point a pass names, each at its own stage', () => {
    const frame = declaredFrame('core-state', TWO_STAGES, TWO_PASSES);

    // A pipeline carries no name now (item 87); step is pipeline 0, shade pipeline 1,
    // named by the handle each pass holds below.
    expect(frame.pipelines.map((pipeline) => pipeline.kind)).toEqual(['compute', 'render']);
    expect(frame.modules).toEqual([{ name: 'wgsl', wgsl: '' }]);
    expect(frame.passes).toEqual([
      { pipeline: pipelineHandle(0), groups: [32, 32, 1] },
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
    ]);
  });

  it('gives each pipeline only the bindings its own entry point reaches', () => {
    const frame = declaredFrame('core-state', TWO_STAGES, TWO_PASSES);
    const [compute, render] = frame.pipelines as [ComputePipelineSpec, RenderPipelineSpec];

    // A layout naming a binding its stage does not read is accepted by the
    // driver while claiming it does, which is why these are two lists rather
    // than one shared between the pipelines.
    // uniform block 0, previous 1, next 2, stateSampler 3.
    expect(compute.bindings.map((at) => at.resource)).toEqual([texture(1), texture(2)]);
    expect(render.bindings.map((at) => at.resource)).toEqual([uniform(0), texture(1), sampler(3)]);
    expect(compute.bindings.every((at) => at.visibility[0] === 'compute')).toBe(true);
    expect(render.bindings.every((at) => at.visibility[0] === 'fragment')).toBe(true);
  });

  it('builds a pipeline two passes name once and runs it twice', () => {
    const frame = declaredFrame('core-state', TWO_STAGES, {
      ...TWO_PASSES,
      passes: [
        { pipeline: 'step', groups: [32, 32, 1] },
        { pipeline: 'step', groups: [32, 32, 1] },
        { pipeline: 'shade' },
      ],
    });

    expect(frame.pipelines).toHaveLength(2);
    expect(frame.passes).toHaveLength(3);
  });

  it('refuses a group count on the pass that draws, and a draw on the pass that dispatches', () => {
    expect(() =>
      declaredFrame('core-state', TWO_STAGES, {
        ...TWO_PASSES,
        passes: [
          { pipeline: 'step', groups: [32, 32, 1] },
          { pipeline: 'shade', groups: [1, 1, 1] },
        ],
      })
    ).toThrow(/dispatches "shade", which its source declares as a fragment stage/);

    expect(() =>
      declaredFrame('core-state', TWO_STAGES, {
        ...TWO_PASSES,
        passes: [{ pipeline: 'step' }, { pipeline: 'shade' }],
      })
    ).toThrow(/runs the compute entry "step" with no groups/);
  });
});

const DRAWS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Vertex {
  return Vertex(vec4<f32>(corner * uniforms.u_time, 0.0, 1.0), place);
}

@fragment
fn shade(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}`;

const DRAWN_FRAME: DeclaredFrame = {
  geometry: [{ name: 'grid', primitive: 'quad-grid', size: [16, 16] }],
  passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'grid', instances: 3 }],
};

describe('the geometry a description says the build writes', () => {
  it('carries the generator’s layout, both counts and an address for each buffer', () => {
    const frame = declaredFrame('core-geometry', DRAWS, DRAWN_FRAME);
    // uniform block 0, grid vertices 1, grid indices 2.
    const grid = frame.resources[1] as VertexResource;
    const gridIndices = frame.resources[2] as IndexResource;

    expect(grid.stride).toBe(16);
    expect(grid.attributes).toEqual([
      { location: 0, offset: 0, format: 'float32x2' },
      { location: 1, offset: 8, format: 'float32x2' },
    ]);
    expect(grid.topology).toBe('triangle-list');
    expect(grid.count).toBe(17 * 17);
    expect(grid.indices).toBe(indices(2));
    expect(grid.source).toBe(geometryFileName('core-geometry', 'grid', 'vertices'));
    expect(gridIndices.format).toBe('uint16');
    expect(gridIndices.count).toBe(16 * 16 * 6);
    expect(gridIndices.source).toBe(geometryFileName('core-geometry', 'grid', 'indices'));
  });

  it('runs the shader’s own vertex stage and names the geometry on the pipeline', () => {
    const pipeline = declaredFrame('core-geometry', DRAWS, DRAWN_FRAME).pipelines[0] as RenderPipelineSpec;

    expect(pipeline.source).toEqual({ wgsl: { vertex: '', fragment: '' } });
    expect(pipeline.vertex).toEqual({ document: 'wgsl', entry: 'warp' });
    expect(pipeline.fragment).toEqual({ document: 'wgsl', entry: 'shade' });
    expect(pipeline.geometry).toBe(vertices(1));
  });

  it('gives the block both stages that read it, since a layout is built once for the pair', () => {
    const pipeline = declaredFrame('core-geometry', DRAWS, DRAWN_FRAME).pipelines[0] as RenderPipelineSpec;

    expect(pipeline.bindings).toEqual([
      { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment', 'vertex'] },
    ]);
  });

  it('counts instances on the pass and leaves the count of vertices with the bytes', () => {
    const drawn = declaredFrame('core-geometry', DRAWS, DRAWN_FRAME).passes[0];
    const once = declaredFrame('core-geometry', DRAWS, {
      ...DRAWN_FRAME,
      passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'grid' }],
    }).passes[0];

    expect(drawn).toEqual({ pipeline: pipelineHandle(0), draws: [{ instances: 3 }] });
    expect(once).toEqual({ pipeline: pipelineHandle(0), draws: [{ instances: 1 }] });
  });

  it('refuses a pass naming one half of a drawn pass without the other', () => {
    expect(() =>
      declaredFrame('x', DRAWS, { ...DRAWN_FRAME, passes: [{ pipeline: 'shade', geometry: 'grid' }] })
    ).toThrow(/draws through a vertex stage it does not name/);
    expect(() =>
      declaredFrame('x', DRAWS, { ...DRAWN_FRAME, passes: [{ pipeline: 'shade', vertex: 'warp' }] })
    ).toThrow(/draws through a geometry it does not name/);
  });

  it('refuses a pass drawing geometry the frame never declares', () => {
    expect(() =>
      declaredFrame('x', DRAWS, {
        passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'absent' }],
      })
    ).toThrow(/draws "absent", which the frame never declares/);
  });

  it('refuses geometry no pass of the frame draws, since the entry sized it for something', () => {
    expect(() =>
      declaredFrame('x', DRAWS, {
        geometry: [
          { name: 'grid', primitive: 'quad-grid', size: [16, 16] },
          { name: 'spare', primitive: 'quad-grid', size: [2, 2] },
        ],
        passes: DRAWN_FRAME.passes,
      })
    ).toThrow(/declares geometry "spare" no pass of it draws/);
  });

  it('refuses a vertex stage that reads a field the bytes do not carry', () => {
    const wider = DRAWS.replace('@location(1) place: vec2<f32>', '@location(1) place: vec3<f32>');

    expect(() => declaredFrame('x', wider, DRAWN_FRAME)).toThrow(
      /reads 0:float32x2, 1:float32x3 and "grid" holds 0:float32x2, 1:float32x2/
    );
  });

  it('refuses geometry drawn through a compute stage', () => {
    const both = `${COMPUTE}

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(corner, place.x, 1.0);
}`;

    expect(() =>
      declaredFrame('x', both, {
        geometry: [{ name: 'grid', primitive: 'quad-grid', size: [2, 2] }],
        textures: [{ name: 'picture', size: { scale: 1 } }],
        passes: [{ pipeline: 'paint', vertex: 'warp', geometry: 'grid', groups: [1, 1, 1] }],
        present: 'picture',
      })
    ).toThrow(/draws geometry through "paint", which is a compute stage/);
  });
});

/**
 * What a pass draws into, which is the one part of a frame nothing in the source
 * names: a colour attachment is a number the fragment stage returns and the depth
 * is not in the file at all. So the entry declares both, and the formats it
 * declares are what reach the pipeline as well as the texture, since a format
 * written down twice is a pipeline the card refuses over a mismatch nobody chose.
 */
const LEANS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32>, u_place: mat4x4<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Surface { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };
struct Pictures { @location(0) picture: vec4<f32>, @location(1) distance: vec4<f32> };

@vertex
fn away(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
  return Surface(uniforms.u_place * vec4<f32>(corner, 0.0, 1.0), place);
}

@fragment
fn farther(shaded: Surface) -> Pictures {
  return Pictures(vec4<f32>(shaded.place, uniforms.u_time, 1.0), vec4<f32>(vec3<f32>(shaded.at.z), 1.0));
}

@fragment
fn nearer(shaded: Surface) -> Pictures {
  return Pictures(vec4<f32>(shaded.place.yx, 0.0, 0.55), vec4<f32>(vec3<f32>(shaded.at.z), 1.0));
}`;

const CROSSING: DeclaredFrame = {
  geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
  attachments: [
    { name: 'picture', size: { scale: 1 }, format: 'rgba8unorm' },
    { name: 'distance', size: { scale: 1 }, format: 'rgba8unorm' },
    { name: 'depth', size: { scale: 1 }, format: 'depth24plus' },
  ],
  passes: [
    {
      pipeline: 'farther',
      vertex: 'away',
      geometry: 'sheet',
      colour: [
        { resource: 'picture', clear: [0, 0, 0, 1] },
        { resource: 'distance', clear: [0, 0, 0, 1] },
      ],
      depth: { resource: 'depth', clear: 1, compare: 'less', write: true },
    },
    {
      pipeline: 'nearer',
      vertex: 'away',
      geometry: 'sheet',
      colour: [{ resource: 'picture', blend: 'over' }, { resource: 'distance' }],
      depth: { resource: 'depth', compare: 'less', write: false },
    },
  ],
  present: 'picture',
};

const crossing = (over: Partial<DeclaredFrame> = {}) => declaredFrame('core-depth', LEANS, { ...CROSSING, ...over });

describe('the attachments a description says a pass draws into', () => {
  it('are textures the frame owns, at the size and format the entry declares', () => {
    const written = crossing().resources.filter((one): one is TextureResource => one.kind === 'texture');

    // The attachments, in declaration order: picture 1, distance 2, depth 3.
    expect(written.map((one) => [one.size, one.format, one.use])).toEqual([
      [{ scale: 1 }, 'rgba8unorm', ['attachment']],
      [{ scale: 1 }, 'rgba8unorm', ['attachment']],
      [{ scale: 1 }, 'depth24plus', ['attachment']],
    ]);
  });

  it('reach the pipeline as the formats it writes and the test it runs, off the same declaration', () => {
    const [far, near] = crossing().pipelines as RenderPipelineSpec[];

    expect(far?.targets).toEqual([{ format: 'rgba8unorm' }, { format: 'rgba8unorm' }]);
    expect(far?.depth).toEqual({ format: 'depth24plus', compare: 'less', write: true });
    expect(near?.depth).toEqual({ format: 'depth24plus', compare: 'less', write: false });
  });

  it('carry the blend by name, so an entry never writes four factors of its own', () => {
    const [, near] = crossing().pipelines as RenderPipelineSpec[];

    expect(near?.targets?.[0]?.blend).toEqual(BLEND_MODE.over);
    expect(near?.targets?.[1]?.blend).toBeUndefined();
  });

  it('reach the pass as the textures it attaches, keeping what it named no value for', () => {
    const [first, second] = crossing().passes as RenderPassSpec[];

    expect(first?.colour).toEqual([
      { resource: texture(1), clear: [0, 0, 0, 1] },
      { resource: texture(2), clear: [0, 0, 0, 1] },
    ]);
    expect(first?.depth).toEqual({ resource: texture(3), clear: 1 });
    expect(second?.colour).toEqual([{ resource: texture(1) }, { resource: texture(2) }]);
    expect(second?.depth).toEqual({ resource: texture(3) });
  });

  it('may be the picture a reader sees, which no texture the source binds is here', () => {
    expect(crossing().present).toBe(texture(1));
  });

  it('refuses a pass writing into an attachment the frame never declares', () => {
    expect(() =>
      crossing({
        passes: [
          { ...(CROSSING.passes[0] as object), colour: [{ resource: 'absent' }] } as DeclaredFrame['passes'][number],
        ],
      })
    ).toThrow('the pass on "farther" of "core-depth" writes colour into "absent", which the frame never declares');
  });

  it('refuses a pass keeping depth in something that is no depth format', () => {
    expect(() =>
      crossing({
        passes: [
          {
            ...(CROSSING.passes[0] as object),
            depth: { resource: 'picture', clear: 1, compare: 'less', write: true },
          } as DeclaredFrame['passes'][number],
        ],
      })
    ).toThrow('the frame for "core-depth" keeps depth in "picture", which is no depth format');
  });

  it('refuses one pipeline asked to draw under two different sets of attachments', () => {
    const twice = CROSSING.passes.map((pass) => ({ ...pass, pipeline: 'farther' }));
    expect(() => crossing({ passes: twice })).toThrow(
      'the frame for "core-depth" runs "farther" under two different sets of attachments'
    );
  });

  it('refuses an attachment no pass of the frame writes', () => {
    expect(() =>
      crossing({
        attachments: [
          ...(CROSSING.attachments ?? []),
          { name: 'spare', size: { scale: 1 }, format: 'rgba8unorm' },
        ],
      })
    ).toThrow('the frame for "core-depth" declares an attachment "spare" no pass of it writes');
  });

  it('refuses a compute pass asked to draw attachments, since a dispatch writes no picture of its own', () => {
    expect(() =>
      declaredFrame('core-depth', COMPUTE, {
        textures: [{ name: 'picture', size: { scale: 1 } }],
        attachments: [{ name: 'held', size: { scale: 1 }, format: 'rgba8unorm' }],
        passes: [{ pipeline: 'paint', groups: [1, 1, 1], colour: [{ resource: 'held', clear: [0, 0, 0, 1] }] }],
        present: 'picture',
      })
    ).toThrow('the frame for "core-depth" draws attachments through "paint", which is a compute stage');
  });
});

/**
 * A texture one pass draws into and the next one reads.
 *
 * Both roles come off one declaration: the entry says how big it is and what
 * format it holds, because nothing in a source can, and the source's own sampled
 * declaration is what says a later pass reads it. A texture short of the flag for
 * either role is a pipeline the driver refuses over a usage, which names neither
 * the pass that wrote it nor the stage that read it.
 */
const GRADES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var sceneSampler: sampler;

struct Shaded { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Shaded {
  return Shaded(vec4<f32>(corner, 0.0, 1.0), place);
}

@fragment
fn paint(shaded: Shaded) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}

@fragment
fn grade(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(scene, sceneSampler, at.xy / uniforms.u_resolution);
}`;

const GRADED: DeclaredFrame = {
  geometry: [{ name: 'grid', primitive: 'quad-grid', size: [16, 16] }],
  attachments: [{ name: 'scene', size: { scale: 1 }, format: 'rgba8unorm' }],
  samplers: [{ name: 'sceneSampler', filter: 'linear', wrap: 'clamp' }],
  passes: [
    {
      pipeline: 'paint',
      vertex: 'warp',
      geometry: 'grid',
      colour: [{ resource: 'scene', clear: [0, 0, 0, 1] }],
    },
    { pipeline: 'grade' },
  ],
};

const graded = (over: Partial<DeclaredFrame> = {}) => declaredFrame('core-target', GRADES, { ...GRADED, ...over });

describe('an attachment a later pass samples', () => {
  it('carries both roles, off one declaration in the entry and one in the source', () => {
    // uniform block 0, sceneSampler 1, scene attachment 2.
    const scene = graded().resources[2] as TextureResource;

    expect(scene.use).toEqual(['attachment', 'sample']);
    expect(scene.size).toEqual({ scale: 1 });
    expect(scene.format).toBe('rgba8unorm');
  });

  it('is bound only on the pipeline whose stage reads it, and as a sampled picture', () => {
    const [first, second] = graded().pipelines as RenderPipelineSpec[];

    expect(first?.bindings.map((at) => at.resource)).toEqual([uniform(0)]);
    expect(second?.bindings).toEqual([
      { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] },
      { group: 0, binding: 1, resource: texture(2), visibility: ['fragment'], reads: 'sample' },
      { group: 0, binding: 2, resource: sampler(1), visibility: ['fragment'] },
    ]);
  });

  it('is written by the first pass and left off the second, which writes the frame itself', () => {
    const [first, second] = graded().passes as RenderPassSpec[];

    expect(first?.colour).toEqual([{ resource: texture(2), clear: [0, 0, 0, 1] }]);
    expect(second?.colour).toBeUndefined();
    expect(second?.draws).toEqual([{ vertices: 3 }]);
  });

  it('gets the writing flag alone where no source samples it', () => {
    const unread = declaredFrame('core-target', GRADES, {
      ...GRADED,
      attachments: [
        { name: 'scene', size: { scale: 1 }, format: 'rgba8unorm' },
        { name: 'spare', size: { scale: 1 }, format: 'rgba8unorm' },
      ],
      passes: [
        {
          ...(GRADED.passes[0] as object),
          colour: [
            { resource: 'scene', clear: [0, 0, 0, 1] },
            { resource: 'spare', clear: [0, 0, 0, 1] },
          ],
        } as DeclaredFrame['passes'][number],
        { pipeline: 'grade' },
      ],
    });
    // uniform 0, sceneSampler 1, scene 2, spare 3.
    const spare = unread.resources[3] as TextureResource;

    expect(spare.use).toEqual(['attachment']);
  });
});

const EDGES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32>, u_place: mat4x4<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Surface { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn lean(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
  return Surface(uniforms.u_place * vec4<f32>(corner, 0.0, 1.0), place);
}

@fragment
fn shade(shaded: Surface) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}`;

const AVERAGED: DeclaredFrame = {
  geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
  attachments: [
    { name: 'edges', size: { scale: 1 }, format: 'rgba8unorm', samples: 4 },
    { name: 'flat', size: { scale: 1 }, format: 'rgba8unorm' },
  ],
  passes: [
    {
      pipeline: 'shade',
      vertex: 'lean',
      geometry: 'sheet',
      colour: [{ resource: 'edges', clear: [0, 0, 0, 1], resolve: 'flat' }],
    },
  ],
  present: 'flat',
};

const averaged = (over: Partial<DeclaredFrame> = {}) =>
  declaredFrame('core-multisample', EDGES, { ...AVERAGED, ...over });

describe('an attachment keeping several readings of every pixel', () => {
  it('carries the count the entry declared, and the picture it is averaged into carries none', () => {
    const written = averaged().resources.filter((one): one is TextureResource => one.kind === 'texture');

    // The attachments in declaration order: edges 1 (four samples), flat 2 (one).
    expect(written.map((one) => one.samples)).toEqual([4, undefined]);
  });

  it('reaches the pipeline as the count it is built under, off that same declaration', () => {
    const [drawing] = averaged().pipelines as RenderPipelineSpec[];

    expect(drawing?.samples).toBe(4);
    expect(drawing?.targets).toEqual([{ format: 'rgba8unorm' }]);
  });

  it('leaves a frame keeping one reading everywhere with no count on either', () => {
    const single = averaged({
      attachments: [{ name: 'edges', size: { scale: 1 }, format: 'rgba8unorm' }],
      passes: [
        { pipeline: 'shade', vertex: 'lean', geometry: 'sheet', colour: [{ resource: 'edges', clear: [0, 0, 0, 1] }] },
      ],
      present: 'edges',
    });
    const [drawing] = single.pipelines as RenderPipelineSpec[];
    // uniform block 0, the one edges attachment 1.
    const edges = single.resources[1] as TextureResource;

    expect(drawing?.samples).toBeUndefined();
    expect(edges.samples).toBeUndefined();
  });

  it('says on the pass where its readings are averaged', () => {
    const [drawing] = averaged().passes as RenderPassSpec[];

    expect(drawing?.colour).toEqual([{ resource: texture(1), clear: [0, 0, 0, 1], resolve: texture(2) }]);
  });

  it('counts the picture it is averaged into as one a pass writes, since nothing else fills it', () => {
    expect(() => averaged()).not.toThrow();
  });

  it('is refused where the attachments of one pass disagree about the count', () => {
    expect(() =>
      averaged({
        attachments: [
          { name: 'edges', size: { scale: 1 }, format: 'rgba8unorm', samples: 4 },
          { name: 'flat', size: { scale: 1 }, format: 'rgba8unorm' },
          { name: 'depth', size: { scale: 1 }, format: 'depth24plus' },
        ],
        passes: [
          {
            pipeline: 'shade',
            vertex: 'lean',
            geometry: 'sheet',
            colour: [{ resource: 'edges', clear: [0, 0, 0, 1], resolve: 'flat' }],
            depth: { resource: 'depth', clear: 1, compare: 'less', write: true },
          },
        ],
      })
    ).toThrow('the frame for "core-multisample" draws "shade" into attachments keeping 1 and 4 samples a pixel');
  });

  it('is refused where the readings are averaged into something the entry never declared', () => {
    expect(() =>
      averaged({
        passes: [
          {
            pipeline: 'shade',
            vertex: 'lean',
            geometry: 'sheet',
            colour: [{ resource: 'edges', clear: [0, 0, 0, 1], resolve: 'elsewhere' }],
          },
        ],
      })
    ).toThrow('the pass on "shade" of "core-multisample" averages its samples into "elsewhere"');
  });

  it('is refused where the source samples it, which needs a declaration no source here writes', () => {
    expect(() =>
      graded({ attachments: [{ name: 'scene', size: { scale: 1 }, format: 'rgba8unorm', samples: 4 }] })
    ).toThrow('the frame for "core-target" samples "scene", which keeps several samples a pixel');
  });
});

const COUNTS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> counts: array<u32>;
@group(0) @binding(2) var picture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(1)
fn plan() {
  counts[0] = u32(uniforms.u_time);
  counts[1] = 1u;
  counts[2] = 1u;
  counts[3] = 0u;
}

@compute @workgroup_size(8, 8)
fn paint(@builtin(global_invocation_id) at: vec3<u32>) {
  textureStore(picture, vec2<i32>(at.xy), vec4<f32>(1.0));
}

@fragment
fn shade(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(at.xy / uniforms.u_resolution, 0.0, 1.0);
}`;

const PLANNED: DeclaredFrame = {
  buffers: [{ name: 'counts', bytes: 32 }],
  textures: [{ name: 'picture', size: { scale: 1 } }],
  passes: [
    { pipeline: 'plan', groups: [1, 1, 1] },
    { pipeline: 'paint', groups: { indirect: 'counts' } },
    { pipeline: 'shade', indirect: 'counts' },
  ],
  present: 'picture',
};

const planned = (over: Partial<DeclaredFrame> = {}) => declaredFrame('core-indirect', COUNTS, { ...PLANNED, ...over });

describe('a buffer the frame owns', () => {
  it('carries the size the entry gives and the access its source declares', () => {
    // uniform block 0, picture texture 1, counts buffer 2.
    const counts = planned().resources[2];

    expect(counts).toEqual({ kind: 'buffer', bytes: 32, access: 'read-write' });
  });

  it('carries whatever size the entry gives, since only the entry knows how many words a source needs', () => {
    const counts = planned({ buffers: [{ name: 'counts', bytes: 64 }] }).resources[2];

    expect(counts).toEqual({ kind: 'buffer', bytes: 64, access: 'read-write' });
  });

  it('is bound where its source binds it, on the pipeline whose stage reaches it', () => {
    const [plan, paint] = planned().pipelines;

    expect(plan?.bindings).toEqual([
      { group: 0, binding: 0, resource: uniform(0), visibility: ['compute'] },
      { group: 0, binding: 1, resource: buffer(2), visibility: ['compute'] },
    ]);
    expect(paint?.bindings.map((at) => at.resource)).toEqual([texture(1)]);
  });

  it('is refused where the source declares no such name', () => {
    expect(() => planned({ buffers: [{ name: 'plans', bytes: 32 }] })).toThrow(
      'the frame for "core-indirect" sizes a buffer "plans" its source never declares'
    );
  });

  it('is refused where the source declares one and the entry sizes none', () => {
    expect(() => planned({ buffers: [] })).toThrow(
      'the frame for "core-indirect" declares a buffer "counts" in its source and no size for it'
    );
  });

  // The size being a whole number of four-byte words is a graph rule the renderer's
  // `validate` now owns, checked at draw by tests/renderer-buffer.test.ts (item 19).
});

describe('a pass whose counts come out of a buffer', () => {
  it('carries the buffer on the draw rather than a count of anything', () => {
    const [, , drawing] = planned().passes;

    // plan pipeline 0, paint 1, shade 2; counts is buffer 2.
    expect(drawing).toEqual({ pipeline: pipelineHandle(2), draws: [{ indirect: buffer(2) }] });
  });

  it('carries the group count the entry wrote, which the renderer reads the same way', () => {
    const [, painting] = planned().passes;

    expect(painting).toEqual({ pipeline: pipelineHandle(1), groups: { indirect: buffer(2) } });
  });

  it('is refused where it reads them from something the frame never declares', () => {
    expect(() =>
      planned({
        passes: [
          { pipeline: 'plan', groups: [1, 1, 1] },
          { pipeline: 'paint', groups: [1, 1, 1] },
          { pipeline: 'shade', indirect: 'plans' },
        ],
      })
    ).toThrow('the pass on "shade" of "core-indirect" reads its counts from "plans", which the frame never declares');
  });

  it('is refused where it names an instance count beside them, which is two answers to one question', () => {
    expect(() =>
      planned({
        passes: [
          { pipeline: 'plan', groups: [1, 1, 1] },
          { pipeline: 'paint', groups: [1, 1, 1] },
          { pipeline: 'shade', indirect: 'counts', instances: 3 },
        ],
      })
    ).toThrow('the pass on "shade" of "core-indirect" reads its counts from "counts" and names an instance count');
  });

  it('is refused where the pipeline it draws is a compute stage', () => {
    expect(() =>
      planned({
        passes: [
          { pipeline: 'plan', groups: [1, 1, 1] },
          { pipeline: 'paint', groups: [1, 1, 1], indirect: 'counts' },
          { pipeline: 'shade' },
        ],
      })
    ).toThrow('the frame for "core-indirect" draws "paint" indirectly, which is a compute stage');
  });
});

const SHEETS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32>, u_place: mat4x4<f32>, u_cover: f32 };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Surface { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn front(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
  return Surface(uniforms.u_place * vec4<f32>(corner + uniforms.u_cover, -1.6, 1.0), place);
}

@vertex
fn behind(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
  return Surface(uniforms.u_place * vec4<f32>(corner, -2.6, 1.0), place);
}

@fragment
fn nearer(shaded: Surface) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, 0.0, 1.0);
}

@fragment
fn farther(shaded: Surface) -> @location(0) vec4<f32> {
  return vec4<f32>(0.0, shaded.place, 1.0);
}`;

const REPORTED: DeclaredFrame = {
  geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [12, 12] }],
  buffers: [
    { name: 'took', bytes: 16 },
    { name: 'seen', bytes: 8 },
  ],
  attachments: [
    { name: 'picture', size: { scale: 1 }, format: 'rgba8unorm' },
    { name: 'depth', size: { scale: 1 }, format: 'depth24plus' },
  ],
  passes: [
    {
      pipeline: 'nearer',
      vertex: 'front',
      geometry: 'sheet',
      colour: [{ resource: 'picture', clear: [0, 0, 0, 1] }],
      depth: { resource: 'depth', clear: 1, compare: 'less', write: true },
    },
    {
      pipeline: 'farther',
      vertex: 'behind',
      geometry: 'sheet',
      colour: [{ resource: 'picture' }],
      depth: { resource: 'depth', compare: 'less', write: false },
      visible: 'seen',
      timed: 'took',
    },
  ],
  present: 'picture',
};

const reported = (over: Partial<DeclaredFrame> = {}) => declaredFrame('core-report', SHEETS, { ...REPORTED, ...over });

describe('a pass the card is asked to report on', () => {
  it('carries the buffers its two answers land in, by the names the entry gave', () => {
    const pass = reported().passes[1];

    // uniform block 0, took buffer 1, seen buffer 2.
    expect(pass).toMatchObject({ timed: buffer(1), visible: buffer(2) });
  });

  it('leaves a pass nobody asked about carrying neither', () => {
    const pass = reported().passes[0] as { timed?: number; visible?: number };

    expect(pass.timed).toBeUndefined();
    expect(pass.visible).toBeUndefined();
  });

  it('sizes those buffers off the entry and takes the access that names no writing', () => {
    // Nothing in the source binds either of them: the card writes them and a
    // caller reads them back, so there is no declaration to read an access off.
    const resources = reported().resources;

    // took buffer 1, seen buffer 2.
    expect(resources[1]).toEqual({
      kind: 'buffer',
      bytes: 16,
      access: 'read',
    });
    expect(resources[2]).toEqual({
      kind: 'buffer',
      bytes: 8,
      access: 'read',
    });
  });

  it('names neither buffer in any pipeline layout, since no stage reads one', () => {
    const bound = reported().pipelines.flatMap((one) => one.bindings.map((binding) => binding.resource));

    expect(bound).not.toContain(buffer(1));
    expect(bound).not.toContain(buffer(2));
  });

  it('refuses a buffer the frame never declares', () => {
    expect(() =>
      reported({
        passes: [REPORTED.passes[0] as never, { ...(REPORTED.passes[1] as object), timed: 'elapsed' } as never],
      })
    ).toThrow('the pass on "farther" of "core-report" writes the two times it took into "elapsed"');
  });

  // A buffer being long enough for its query's answers, and two queries not landing
  // in one buffer, are graph rules the renderer's `validate` now owns, checked at
  // draw by tests/renderer-queries.test.ts (item 19).

  it('refuses a count of samples on a compute stage, which draws nothing to be covered', () => {
    expect(() =>
      planned({
        buffers: [{ name: 'counts', bytes: 32 }],
        passes: [
          { pipeline: 'plan', groups: [1, 1, 1], visible: 'counts' },
          { pipeline: 'paint', groups: [1, 1, 1] },
          { pipeline: 'shade', draws: undefined } as never,
        ],
      })
    ).toThrow('the frame for "core-indirect" counts the samples of "plan", which is a compute stage');
  });
});

const CUTS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn shape(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Vertex {
  return Vertex(vec4<f32>(corner, 0.5, 1.0), place);
}

@fragment
fn marking(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}

@fragment
fn filling(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(at.xy / uniforms.u_resolution, 1.0, 1.0);
}`;

const CUT: DeclaredFrame = {
  geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [8, 8] }],
  attachments: [
    { name: 'picture', size: { scale: 1 }, format: 'rgba8unorm' },
    { name: 'mask', size: { scale: 1 }, format: 'stencil8' },
  ],
  passes: [
    {
      pipeline: 'marking',
      vertex: 'shape',
      geometry: 'sheet',
      colour: [{ resource: 'picture', clear: [0, 0, 0, 1] }],
      depth: { resource: 'mask', stencilClear: 0, stencil: 'mark' },
    },
    {
      pipeline: 'filling',
      colour: [{ resource: 'picture' }],
      depth: { resource: 'mask', stencil: 'inside' },
    },
  ],
  present: 'picture',
};

const cut = (over: Partial<DeclaredFrame> = {}) => declaredFrame('core-stencil', CUTS, { ...CUT, ...over });

describe('a pass that cuts with a mask', () => {
  it('takes the format off the attachment and the mode off the pass', () => {
    const pipelines = cut().pipelines.filter((one) => one.kind === 'render');

    expect(pipelines.map((one) => one.depth)).toEqual([
      { format: 'stencil8', stencil: 'mark' },
      { format: 'stencil8', stencil: 'inside' },
    ]);
  });

  it('carries no depth test at all, since the format keeps no distances', () => {
    const depth = cut().pipelines.map((one) => (one.kind === 'render' ? one.depth : undefined))[0];

    expect(depth).not.toHaveProperty('compare');
    expect(depth).not.toHaveProperty('write');
  });

  it('empties the mask on the pass that marks and keeps it on the pass drawn inside the mark', () => {
    const passes = cut().passes.map((pass) => ('depth' in pass ? pass.depth : undefined));

    // uniform block 0, picture attachment 1, mask attachment 2.
    expect(passes).toEqual([{ resource: texture(2), stencilClear: 0 }, { resource: texture(2) }]);
  });

  it('keeps both halves where the format keeps both', () => {
    const both = 'depth24plus-stencil8' as const;
    const described = cut({
      attachments: [
        { name: 'picture', size: { scale: 1 }, format: 'rgba8unorm' },
        { name: 'mask', size: { scale: 1 }, format: both },
      ],
      passes: [
        {
          ...(CUT.passes[0] as object),
          depth: { resource: 'mask', clear: 1, compare: 'less', write: true, stencilClear: 0, stencil: 'mark' },
        } as never,
        {
          ...(CUT.passes[1] as object),
          depth: { resource: 'mask', compare: 'less', write: false, stencil: 'inside' },
        } as never,
      ],
    });

    expect(described.pipelines.map((one) => (one.kind === 'render' ? one.depth : undefined))[0]).toEqual({
      format: both,
      compare: 'less',
      write: true,
      stencil: 'mark',
    });
  });

  // That each half a pass names is a half the format keeps — a mask only over a
  // stencil format, a depth test only over a depth one — is a graph rule the
  // renderer's `validate` now owns, checked at draw by tests/renderer-stencil.test.ts
  // and tests/renderer-depth.test.ts (item 19). The build still refuses a depth
  // attachment in no depth format at all, which has only ever had this one home.
});

/**
 * Per-copy data: numbers a copy of a pipeline is handed rather than working out.
 *
 * The buffer is read by the vertex stage alone and bound in a group of its own,
 * which is the first resource here read by no fragment or compute entry point. So
 * the two things checked are that it survives the read-only check, which used to
 * see only the pipeline entry points, and that its binding carries the group the
 * source declared rather than being folded into group zero.
 */
const PER_DRAW = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
struct Copy { tint: vec3<f32>, lift: f32 };
@group(1) @binding(0) var<storage, read> copies: array<Copy>;

struct Shaded { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32>, @location(1) tint: vec3<f32> };

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>, @builtin(instance_index) copy: u32) -> Shaded {
  let mine = copies[copy];
  return Shaded(vec4<f32>(corner * 0.3, 0.0, 1.0) + vec4<f32>(0.0, mine.lift, 0.0, 0.0) * uniforms.u_time, place, mine.tint);
}

@fragment
fn shade(shaded: Shaded) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.tint, 1.0);
}`;

const PER_DRAW_FRAME: DeclaredFrame = {
  geometry: [{ name: 'grid', primitive: 'quad-grid', size: [16, 16] }],
  buffers: [{ name: 'copies', bytes: 64, content: 'copy-tints' }],
  passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'grid', instances: 4 }],
};

describe('a buffer of per-copy data read in a group of its own', () => {
  it('carries the address its bytes were written to, so the runtime fetches them', () => {
    const frame = declaredFrame('core-perdraw', PER_DRAW, PER_DRAW_FRAME);
    // uniform block 0, copies buffer 1.
    const copies = frame.resources[1];
    expect(copies).toEqual({
      kind: 'buffer',
      bytes: 64,
      access: 'read',
      source: 'core-perdraw-copies.buffer.bin',
    });
  });

  it('binds it at the group the source declares rather than folding it into group zero', () => {
    const frame = declaredFrame('core-perdraw', PER_DRAW, PER_DRAW_FRAME);
    const shade = frame.pipelines[0] as RenderPipelineSpec;
    const copies = shade.bindings.find((at) => at.resource === buffer(1));
    // Read by the vertex stage alone, so the visibility is vertex and not the
    // fragment stage the pipeline is named after.
    expect(copies).toEqual({ group: 1, binding: 0, resource: buffer(1), visibility: ['vertex'] });
    // The uniform block stays where it was, so the second group is an addition
    // rather than a move.
    expect(shade.bindings.find((at) => at.resource === uniform(0))?.group).toBe(0);
  });

  it('survives the read-only check, which a resource read by the vertex stage alone used to fail', () => {
    // Nothing in the fragment or compute entry points reaches this buffer, and the
    // check that refuses a resource no pass reads has to count the vertex stage or
    // it refuses a picture that draws.
    expect(() => declaredFrame('core-perdraw', PER_DRAW, PER_DRAW_FRAME)).not.toThrow();
  });
});
