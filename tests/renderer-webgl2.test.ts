import type { GlslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGL2Backend } from '../gpu/webgl2';
import { glslFrame, missing, cost, GEOMETRY_PRIMITIVE } from '@altpsyche/engine';
import type { RenderPipelineSpec, FrameGraph, TextureResource } from '@altpsyche/engine';
import { texture, buffer, vertices, indices, moduleHandle, pipelineHandle } from '../graph/handles.js';
import { bottomUpFrame, createFakeGL } from './support/fake-gl';

/**
 * What the WebGL 2 backend does today, written down before a frame stops being
 * one draw.
 *
 * The interesting part of this backend is that it asks the linked program where
 * everything is instead of working it out from the source. A compiler gathers
 * uniforms into a block or leaves them loose, so only the program can say where a
 * value lands, and these hold what the backend does with each answer. What each
 * uniform was *declared as* is no longer asked of the program, though: `reflect`
 * reads that off the source (item 69), so the fixtures below declare their
 * uniforms in the GLSL they hand over rather than in a list beside it.
 *
 * The context is a stand-in because jsdom gives none at all. It is held by
 * `backends.mjs` drawing the corpus on a real one rather than by a trace
 * contract, since what a driver answers here is the driver's own.
 */

const VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

/** A fragment declaring one loose `int` uniform, so `reflect` reads its type off
 * the source the way item 61's int-through-uniform1i decision needs. */
const FRAGMENT_INT =
  '#version 300 es\nprecision highp float;\nuniform int u_frame;\nout vec4 c;\nvoid main(){c=vec4(float(u_frame));}';
/** A fragment declaring an `int` and a `float`, for the mixed cases. */
const FRAGMENT_MIXED =
  '#version 300 es\nprecision highp float;\nuniform int u_frame;\nuniform float u_time;\nout vec4 c;\nvoid main(){c=vec4(u_time*float(u_frame));}';
/** A fragment that reads what an earlier pass drew, sampling the scene texture
 * through the combined sampler its binding declares — group 0 binding 0, so the
 * GLSL variable is `_group_0_binding_0` rather than a resource name (item 87) — the
 * second pass of the multi-pass chain (item 46). */
const FRAGMENT_SAMPLE =
  '#version 300 es\nprecision highp float;\nuniform sampler2D _group_0_binding_0;\nout vec4 c;\nvoid main(){c=texture(_group_0_binding_0,gl_FragCoord.xy/vec2(800.0,600.0));}';

/**
 * A two-pass chain the way a producer would author it: a first pass draws into a
 * frame-sized texture, a second pass samples that texture and draws the frame the
 * reader sees. `at` decides where the second pass's picture lands — the canvas
 * directly, or a second texture the frame `present`s by blitting it on.
 */
function twoPass(at: 'canvas' | 'present' = 'canvas'): FrameGraph {
  // uniform 0, scene texture 1, sampler 2; a present frame adds the shown texture
  // at index 3. Each reference below names one of these by its handle.
  const resources: FrameGraph['resources'] = [
    { kind: 'uniform' },
    { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment', 'sample'] },
    { kind: 'sampler', filter: 'linear', wrap: 'clamp' },
  ];
  const second: FrameGraph['passes'][number] =
    at === 'present'
      ? { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }], colour: [{ resource: texture(3) }] }
      : { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] };
  if (at === 'present') {
    resources.push({ kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] });
  }
  return {
    id: 'chain',
    authored: 'glsl',
    resources,
    modules: [
      { name: 'vertex', glsl: VERTEX },
      { name: 'paint', glsl: FRAGMENT },
      { name: 'show', glsl: FRAGMENT_SAMPLE },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        targets: [{ format: 'rgba8unorm' }],
        bindings: [],
      },
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(2), entry: 'main' },
        ...(at === 'present' ? { targets: [{ format: 'rgba8unorm' as const }] } : {}),
        bindings: [{ group: 0, binding: 0, resource: texture(1), visibility: ['fragment'], reads: 'sample' }],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], colour: [{ resource: texture(1), clear: [0, 0, 0, 1] }] }, second],
    ...(at === 'present' ? { present: texture(3) } : {}),
  };
}

/** The one-pass description of the fixture, built the way the build builds one,
 * so what these assert is the backend rather than a shape written here. */
const graph = (over: { vertex?: string; fragment?: string } = {}): GlslFrameGraph =>
  glslFrame('fixture', over.vertex ?? VERTEX, over.fragment ?? FRAGMENT) as GlslFrameGraph;

function backendOver(setup: (gl: ReturnType<typeof createFakeGL>) => void = () => {}) {
  const gl = createFakeGL();
  setup(gl);
  const backend = createWebGL2Backend(gl.canvas);
  if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
  return { gl, backend };
}

describe('the context it asks for', () => {
  it('gives nothing back where there is no WebGL 2 to have', () => {
    const gl = createFakeGL({ context: false });
    expect(createWebGL2Backend(gl.canvas)).toBeNull();
  });

  it('leaves the browser free to throw a finished frame away', () => {
    const { gl } = backendOver();
    // Keeping every finished frame costs a copy per frame on every reader's
    // device so that a build script can screenshot after the fact, and a caller
    // that wants pixels draws and reads in the same step instead.
    expect(gl.attributes?.preserveDrawingBuffer).toBeUndefined();
    expect(gl.attributes).toEqual({ antialias: false, alpha: false });
  });

  it('names itself and the language its documents are written in', () => {
    const { backend } = backendOver();
    expect(backend.name).toBe('webgl2');
    expect(backend.target).toBe('glsl');
  });

  it('refuses a frame for the other backend by naming the target it got', () => {
    const { backend } = backendOver();
    const wgsl = { id: 'x', authored: 'wgsl' } as unknown as FrameGraph;
    expect(() => backend.program(wgsl)).toThrow('WebGL 2 was handed a wgsl frame to draw');
  });
});

/**
 * The subset this backend implements, and what it says about a description above
 * it.
 *
 * One render pass through one pipeline into the frame's own colour target is the
 * whole of it, and every capability above that line is the reason WebGPU is here.
 * Nothing branches on the backend to keep that true: a description above the
 * subset has no GLSL target, so `loadGraph` refuses it by name before a
 * program is asked for and this is the second door rather than the first.
 */
describe('a description above the subset', () => {
  const glsl = (over: Partial<GlslFrameGraph>): FrameGraph => ({ ...graph(), ...over });

  it('refuses a frame with no pass in it rather than drawing nothing', () => {
    const { backend } = backendOver();
    expect(() => backend.program(glsl({ passes: [] }))).toThrow(
      'the frame for "fixture" describes no pass this backend can draw'
    );
  });

  it('refuses a pass naming a pipeline the frame does not carry', () => {
    const { backend } = backendOver();
    const frame = graph();
    expect(() => backend.program(glsl({ passes: [{ pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] }] }))).toThrow(
      'the frame for "fixture" runs pipeline 1, which it does not declare'
    );
    expect(frame.pipelines[1]).toBeUndefined();
  });

  it('refuses a pipeline asking for a vertex program the shader does not supply', () => {
    const { backend } = backendOver();
    // A GLSL pair is two documents and the vertex half is the shader's own, so
    // `fullscreen` is a WGSL description that reached the wrong backend.
    const pipelines = graph().pipelines.map((pipeline) => ({ ...pipeline, vertex: 'fullscreen' as const }));
    expect(() => backend.program(glsl({ pipelines }))).toThrow(
      'the frame for "fixture" carries no vertex document'
    );
  });

  it('refuses a pipeline naming a document the frame does not carry', () => {
    const { backend } = backendOver();
    const modules = graph().modules.filter((document) => document.name !== 'vertex');
    expect(() => backend.program(glsl({ modules }))).toThrow(
      'the frame for "fixture" runs a fragment stage from module 1, which it does not declare'
    );
  });

  it('refuses a compute pass, which is the reason the other backend is here', () => {
    const { backend } = backendOver();
    const compute = {
      kind: 'compute' as const,
      compute: { module: moduleHandle(1), entry: 'computeMain' },
      workgroup: [8, 8, 1] as [number, number, number],
      bindings: [],
    };
    expect(() =>
      backend.program(glsl({ pipelines: [compute], passes: [{ pipeline: pipelineHandle(0), groups: [1, 1, 1] }] }))
    ).toThrow('the frame for "fixture" runs compute work, and WebGL 2 has no compute stage');
  });

  it('refuses a storage texture, since it has no compute to fill one (item 51 names it)', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      {
        kind: 'texture' as const,
        size: { scale: 1 },
        format: 'rgba8unorm' as const,
        use: ['storage' as const],
      },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" writes resource 1 as a storage texture, and this backend has no compute to fill one'
    );
  });

  it('refuses a ladder over a texture with no contents to build it from (item 50)', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      {
        kind: 'texture' as const,
        size: { scale: 1 },
        format: 'rgba8unorm' as const,
        use: ['sample' as const],
        mips: 'generate' as const,
      },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" gives resource 1 a ladder and no contents to build it from'
    );
  });

  it('refuses a ladder over an attachment a pass writes every frame (item 50)', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      {
        kind: 'texture' as const,
        size: { scale: 1 },
        format: 'rgba8unorm' as const,
        use: ['attachment' as const, 'sample' as const],
        mips: 'generate' as const,
      },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" gives resource 1 a ladder and writes it every frame'
    );
  });

  /**
   * A pass keeping four samples of every pixel in a multisample colour
   * renderbuffer, averaged into a single-sample resolve target through a blit —
   * the `msaa` capability item 80 lands on this backend. The shape mirrors the
   * `core-multisample` preset: one four-sample `edges` attachment resolved into a
   * single-sample `flat`, which the frame shows.
   *
   * Whether the resolved picture agrees with WebGPU's is a card's or a browser's
   * (§17 note 3); what these hold is that the backend keeps the samples in a
   * multisample renderbuffer and averages them through the resolve blit, and that
   * everything a multisample attachment cannot be is still refused by name.
   */
  const multisample = (over: Partial<GlslFrameGraph> = {}, edgesOver: Partial<TextureResource> = {}): FrameGraph => ({
    id: 'fixture',
    authored: 'glsl',
    // uniform 0, edges texture 1, flat texture 2.
    resources: [
      { kind: 'uniform' },
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'], samples: 4, ...edgesOver },
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] },
    ],
    modules: [
      { name: 'vertex', glsl: VERTEX },
      { name: 'fragment', glsl: FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        targets: [{ format: 'rgba8unorm' }],
        samples: 4,
        bindings: [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], colour: [{ resource: texture(1), clear: [0, 0, 0, 0], resolve: texture(2) }] }],
    present: texture(2),
    ...over,
  });

  it('keeps a multisample attachment in a multisample renderbuffer and resolves it through a blit (item 80)', () => {
    const { gl, backend } = backendOver();
    const program = backend.program(multisample());
    program.draw();
    // The four samples of `edges` are kept in a multisample renderbuffer sized to
    // the frame, at the four-sample count the attachment declared.
    const multisampled = gl.of('renderbufferStorageMultisample');
    expect(multisampled).toHaveLength(1);
    expect(multisampled[0]).toMatchObject({ samples: 4, width: 800, height: 600 });
    // The renderbuffer is attached to a framebuffer of its own at colour point 0.
    expect(gl.of('framebufferRenderbuffer').some((call) => call.attachment === 0x8ce0)).toBe(true);
    // Two blits: the resolve of `edges` into `flat`, then `flat` shown on the
    // canvas. A single-sample present frame issues one; the resolve is the second.
    expect(gl.of('blitFramebuffer')).toHaveLength(2);
    expect(gl.of('blitFramebuffer').every((call) => call.mask === 0x4000)).toBe(true);
  });

  it('refuses a multisample attachment that averages its samples nowhere (item 80)', () => {
    const { backend } = backendOver();
    const passes = [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], colour: [{ resource: texture(1), clear: [0, 0, 0, 0] as [number, number, number, number] }] }];
    expect(() => backend.program(multisample({ passes, present: undefined }))).toThrow(
      'the frame for "fixture" keeps several samples a pixel in resource 1 and averages them nowhere'
    );
  });

  it('refuses averaging a single-sample attachment, which has nothing to average (item 80)', () => {
    const { backend } = backendOver();
    expect(() => backend.program(multisample({}, { samples: undefined }))).toThrow(
      'the frame for "fixture" averages resource 1 into resource 2 and it keeps one sample a pixel'
    );
  });

  it('refuses a multisampled depth, which is item 80 colour-attachment scope alone', () => {
    const { backend } = backendOver();
    expect(() => backend.program(multisample({}, { format: 'depth24plus', use: ['attachment'] }))).toThrow(
      'the frame for "fixture" keeps several samples of the depth in resource 1, and this backend keeps one'
    );
  });

  it('refuses binding a multisample attachment to a shader, which cannot read one (item 80)', () => {
    const { backend } = backendOver();
    expect(() => backend.program(multisample({}, { use: ['attachment', 'sample'] }))).toThrow(
      'the frame for "fixture" binds resource 1, which keeps several samples a pixel'
    );
  });

  it('refuses showing a multisample attachment, which nothing copies out of (item 80)', () => {
    const { backend } = backendOver();
    expect(() => backend.program(multisample({ present: texture(1) }))).toThrow(
      'the frame for "fixture" shows resource 1, which keeps several samples a pixel'
    );
  });

  it('refuses a read-write storage buffer by name, since it has no compute to fill one (item 92)', () => {
    // A read-write storage buffer is a compute or fragment-stage output this backend
    // has no stage to fill. It is refused by name — the "or is refused by name" half
    // of item 92 — where a read-only one gets the uniform-block raster path below.
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      { kind: 'buffer' as const, bytes: 16, access: 'read-write' as const },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" writes resource 1 as a storage buffer, and this backend has no compute to fill one'
    );
  });

  it('compiles nothing at all where the description is refused', () => {
    const { gl, backend } = backendOver();
    expect(() => backend.program(glsl({ passes: [] }))).toThrow();
    // The refusal comes before anything is compiled or linked, because it is a
    // defect in the build rather than in a reader's source and a half-built
    // program would leave a shader and a program behind with nothing holding
    // them.
    expect(gl.of('shaderSource')).toHaveLength(0);
    expect(gl.of('linkProgram')).toHaveLength(0);
  });
});

describe('building a program', () => {
  it('compiles the vertex and the fragment the graph carries', () => {
    const { gl, backend } = backendOver();
    backend.program(graph());

    const sources = gl.of('shaderSource').map((entry) => entry.source as string);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain('in vec3 position');
    expect(sources[1]).toContain('out vec4 c');
  });

  it('throws the compiler own words when a shader will not compile', () => {
    expect(() =>
      backendOver((gl) => {
        gl.compileLog = 'ERROR: 0:8: syntax error';
      }).backend.program(graph())
    ).toThrow('ERROR: 0:8: syntax error');
  });

  it('throws the linker own words when the pair will not link', () => {
    expect(() =>
      backendOver((gl) => {
        gl.linkLog = 'the varyings do not match';
      }).backend.program(graph())
    ).toThrow('the varyings do not match');
  });

  it('deletes the shaders it attached, since the linked program holds what it needs', () => {
    const { gl, backend } = backendOver();
    backend.program(graph());
    expect(gl.of('deleteShader')).toHaveLength(2);
  });
});

describe('where the values go', () => {
  it('fills the block at the positions the linked program reports', () => {
    const { gl, backend } = backendOver((fake) => {
      // The driver decides the order, and it has been measured not to be the
      // source's, so the block below is deliberately the other way round.
      fake.block = [
        { name: 'u_resolution', offset: 0 },
        { name: 'u_time', offset: 8 },
      ];
      fake.blockBytes = 16;
    });

    backend.program(graph()).setUniforms({ u_time: 3, u_resolution: [7, 9] });

    const upload = gl.of('bufferData').at(-1)!;
    expect(upload.floats).toEqual([7, 9, 3, 0]);
    expect(gl.of('bindBufferBase').at(-1)!.index).toBe(0);
  });

  it('reads a block member by its own name, without the struct in front or the index behind', () => {
    const { gl, backend } = backendOver((fake) => {
      fake.block = [{ name: 'Uniforms.u_time_0', offset: 0 }];
      fake.blockBytes = 4;
    });

    backend.program(graph()).setUniforms({ u_time: 5 });
    expect(gl.of('bufferData').at(-1)!.floats).toEqual([5]);
  });

  it('goes through loose uniforms where the program reports no block', () => {
    const { gl, backend } = backendOver();
    backend.program(graph()).setUniforms({ u_time: 3, u_resolution: [7, 9] });

    expect(gl.of('uniform1f').at(-1)).toMatchObject({ name: 'u_time', value: 3 });
    expect(gl.of('uniform2fv').at(-1)).toMatchObject({ name: 'u_resolution', value: [7, 9] });
    expect(gl.of('bindBufferBase')).toHaveLength(0);
  });

  it('picks the loose call by how many components the value has', () => {
    const { gl, backend } = backendOver();
    backend.program(graph()).setUniforms({ a: [1, 2], b: [1, 2, 3], c: [1, 2, 3, 4] });

    expect(gl.of('uniform2fv')).toHaveLength(1);
    expect(gl.of('uniform3fv')).toHaveLength(1);
    expect(gl.of('uniform4fv')).toHaveLength(1);
  });

  it('feeds a loose uniform declared int through uniform1i, not uniform1f', () => {
    // Feeding an `int` uniform with gl.uniform1f is GL_INVALID_OPERATION, so it
    // keeps its default of 0 and the shader runs off a number nobody handed it.
    // The declared type is what decides the call; the value 4 alone cannot say
    // whether the source wants a float or an int (item 61).
    const intUniform = glslFrame('fixture', VERTEX, FRAGMENT_INT);
    const { gl, backend } = backendOver();
    backend.program(intUniform).setUniforms({ u_frame: 4 });

    expect(gl.of('uniform1i').at(-1)).toMatchObject({ name: 'u_frame', value: 4 });
    expect(gl.of('uniform1f')).toHaveLength(0);
  });

  it('feeds an int alongside a float, each through its own loose call', () => {
    const mixed = glslFrame('fixture', VERTEX, FRAGMENT_MIXED);
    const { gl, backend } = backendOver();
    backend.program(mixed).setUniforms({ u_frame: 4, u_time: 3 });

    expect(gl.of('uniform1i').at(-1)).toMatchObject({ name: 'u_frame', value: 4 });
    expect(gl.of('uniform1f').at(-1)).toMatchObject({ name: 'u_time', value: 3 });
  });

  it('writes a block member declared int as an integer word, not a float bit pattern', () => {
    // The block path writes members into a Float32Array too, so an int member
    // has the same defect by a different route: 4 written as a float is a bit
    // pattern the driver reads back as ~5.6e-45. The int lands through the
    // block's Int32Array view instead, while a float member beside it does not.
    const mixed = glslFrame('fixture', VERTEX, FRAGMENT_MIXED);
    const { gl, backend } = backendOver((fake) => {
      fake.block = [
        { name: 'u_frame', offset: 0 },
        { name: 'u_time', offset: 4 },
      ];
      fake.blockBytes = 8;
    });

    backend.program(mixed).setUniforms({ u_frame: 4, u_time: 3 });

    const upload = gl.of('bufferData').at(-1)!;
    // The int member reads back as the integer 4 through the word view, and the
    // float member reads back as 3 through the float view.
    expect((upload.words as number[])[0]).toBe(4);
    expect((upload.floats as number[])[1]).toBe(3);
  });

  it('writes nothing for a name the program has nowhere to put', () => {
    const { gl, backend } = backendOver((fake) => {
      fake.missing = ['u_dropped'];
    });

    backend.program(graph()).setUniforms({ u_dropped: 1 });
    expect(gl.of('uniform1f')).toHaveLength(0);
  });
});

describe('which names the source declares no place for', () => {
  // Read off the source by `reflect`, not off a linked program (item 69): no
  // backend is built to answer it, so these need no fake device.
  it('answers off a declared block member', () => {
    const declaring =
      '#version 300 es\nprecision highp float;\nuniform Uniforms { float u_time; };\nout vec4 c;\nvoid main(){c=vec4(u_time);}';
    expect(missing(glslFrame('fixture', VERTEX, declaring), ['u_time', 'u_gone'])).toEqual(['u_gone']);
  });

  it('answers off a loose declaration', () => {
    const declaring =
      '#version 300 es\nprecision highp float;\nuniform float u_time;\nout vec4 c;\nvoid main(){c=vec4(u_time);}';
    expect(missing(glslFrame('fixture', VERTEX, declaring), ['u_time', 'u_gone'])).toEqual(['u_gone']);
  });

  it('counts a declared-but-unread uniform as present, where the old query read the program that dropped it', () => {
    // The compiled-program query this replaced asked a linked program, which
    // removes a uniform no line reads; `reflect` reads the declaration, so a
    // declared uniform the compiler would drop is present here (item 69's
    // documented divergence — the answer a page drawing controls wants).
    const unread =
      '#version 300 es\nprecision highp float;\nuniform float u_unread;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';
    expect(missing(glslFrame('fixture', VERTEX, unread), ['u_unread'])).toEqual([]);
  });
});

describe('the frame it draws', () => {
  it('covers the frame with one triangle at the size it was resized to', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    backend.program(graph()).draw();

    expect(gl.of('viewport').at(-1)).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });
    expect(gl.of('drawArrays').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3 });
  });

  it('issues one drawArrays for each draw the pass carries (item 26)', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    // One fullscreen pass, two corners-draws: the backend draws each rather than
    // the first alone, so a pass carrying many draws is not merely typeable here.
    backend.program({ ...graph(), passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }, { vertices: 3 }] }] }).draw();

    expect(gl.of('drawArrays')).toHaveLength(2);
  });

  it('covers many instances with one drawArraysInstanced, not many draws (item 28)', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    // One corners-draw carrying an instance count: the card makes one draw call
    // that reads a thousand instances, rather than the count being silently
    // dropped and one copy drawn.
    backend.program({ ...graph(), passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3, instances: 1000 }] }] }).draw();

    expect(gl.of('drawArrays')).toHaveLength(0);
    expect(gl.of('drawArraysInstanced')).toHaveLength(1);
    expect(gl.of('drawArraysInstanced').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3, instances: 1000 });
  });

  it('leaves a draw with no instance count a plain drawArrays, the call every shader on the site makes (item 28)', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    backend.program({ ...graph(), passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }] }).draw();

    expect(gl.of('drawArraysInstanced')).toHaveLength(0);
    expect(gl.of('drawArrays')).toHaveLength(1);
  });

  it('hands the frame back top row first, because the driver gives it the other way up', async () => {
    const { gl, backend } = backendOver();
    backend.resize(2, 3);
    gl.frame = bottomUpFrame(2, 3);

    const pixels = await backend.readPixels();

    // The driver's bottom row carries 3 and its top row carries 1, so a caller
    // comparing this against the other backend would otherwise be comparing a
    // mirror.
    expect(pixels[0]).toBe(1);
    expect(pixels[pixels.length - 1]).toBe(3);
  });
});

describe('a graph of more than one pass (item 46)', () => {
  const FRAMEBUFFER = 0x8d40;
  const READ_FRAMEBUFFER = 0x8ca8;

  it('draws each pass, the count matching what cost() reads off the structure', () => {
    const { gl, backend } = backendOver();
    const program = backend.program(twoPass());
    // Only the binds the draw itself issues count as passes — the ones that
    // built the framebuffer at program time are before this mark.
    const before = gl.calls.length;
    program.draw();
    const passBinds = gl.calls
      .slice(before)
      .filter((entry) => entry.call === 'bindFramebuffer' && entry.target === FRAMEBUFFER);
    // Two passes issued, and cost() reads two off the same structure, so a change
    // that adds or drops a pass moves both together (the item's second clause).
    expect(passBinds).toHaveLength(cost(twoPass(), { width: 800, height: 600 }).passes);
    expect(passBinds).toHaveLength(2);
    // Both passes drew.
    expect(gl.of('drawArrays')).toHaveLength(2);
  });

  it('draws the first pass into a texture the second pass then samples', () => {
    const { gl, backend } = backendOver();
    backend.program(twoPass()).draw();
    // The first pass's target is a texture attached to a framebuffer at build.
    expect(gl.of('framebufferTexture2D')).toHaveLength(1);
    // The second pass binds that texture to a unit and points its sampler at it.
    expect(gl.of('bindTexture').length).toBeGreaterThan(0);
    expect(gl.of('activeTexture').at(-1)).toMatchObject({ unit: 0x84c0 });
    // The first pass cleared its attachment before drawing into it.
    expect(gl.of('clearColor').at(-1)).toMatchObject({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('shows the picture a frame presents by blitting its texture onto the canvas', () => {
    const { gl, backend } = backendOver();
    backend.program(twoPass('present')).draw();
    // The present texture is read into the canvas: a read-framebuffer bind and a
    // blit, where a frame drawing the canvas directly issues neither.
    expect(gl.of('bindFramebuffer').some((entry) => entry.target === READ_FRAMEBUFFER)).toBe(true);
    expect(gl.of('blitFramebuffer')).toHaveLength(1);
  });

  it('remakes a frame-following target at the new size before the next draw', () => {
    const { gl, backend } = backendOver();
    const program = backend.program(twoPass());
    const before = gl.calls.length;
    backend.resize(320, 180);
    program.draw();
    // The scene texture follows the frame, so a resize between build and draw
    // respecifies it at 320×180 before the first pass reads it as a target.
    expect(gl.calls.slice(before).some((entry) => entry.call === 'texImage2D' && entry.width === 320)).toBe(true);
    // And the first pass draws at that size.
    expect(gl.of('viewport').some((entry) => entry.width === 320 && entry.height === 180)).toBe(true);
  });

  it('gives every texture and framebuffer it made back when it is done', () => {
    const { gl, backend } = backendOver();
    backend.program(twoPass('present')).dispose();
    // Two textures (scene, shown) and their framebuffers freed through the arenas.
    expect(gl.of('deleteTexture')).toHaveLength(2);
    expect(gl.of('deleteFramebuffer')).toHaveLength(2);
  });
});

/**
 * A single pass writing `n` colour attachments, authored the way a producer of a
 * G-buffer would: one fragment declaring `n` outputs, `n` frame-sized attachment
 * textures, and a pipeline whose `targets` and pass whose `colour` both carry the
 * `n` of them. Item 47 draws several colours at once where item 46 drew one.
 */
function manyTargets(n: number): FrameGraph {
  const names = Array.from({ length: n }, (_ignored, at) => `g${at}`);
  const outputs = names.map((_name, at) => `layout(location=${at}) out vec4 c${at};`).join('\n');
  const writes = names.map((_name, at) => `c${at}=vec4(${at}.0);`).join('');
  // uniform 0, then the n attachment textures at indices 1..n, so g{at} is
  // resource at+1.
  return {
    id: 'gbuffer',
    authored: 'glsl',
    resources: [
      { kind: 'uniform' },
      ...names.map(() => ({
        kind: 'texture' as const,
        size: { scale: 1 } as const,
        format: 'rgba8unorm' as const,
        use: ['attachment' as const],
      })),
    ],
    modules: [
      { name: 'vertex', glsl: VERTEX },
      { name: 'paint', glsl: `#version 300 es\nprecision highp float;\n${outputs}\nvoid main(){${writes}}` },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        targets: names.map(() => ({ format: 'rgba8unorm' as const })),
        bindings: [],
      },
    ],
    passes: [
      {
        pipeline: pipelineHandle(0),
        draws: [{ vertices: 3 }],
        colour: names.map((_name, at) => ({ resource: texture(at + 1), clear: [at / 10, 0, 0, 1] as [number, number, number, number] })),
      },
    ],
  };
}

describe('a pass writing several colours at once (item 47)', () => {
  const COLOR = 0x1800;
  const COLOR_ATTACHMENT0 = 0x8ce0;

  it('draws a graph writing three attachments, one framebuffer carrying all three', () => {
    const { gl, backend } = backendOver();
    backend.program(manyTargets(3)).draw();

    // Each attachment texture is attached to a single-attachment framebuffer of
    // its own at build (item 46, point 0 each), then all three to the pass's own
    // framebuffer at three successive colour points — so the last three are the
    // multiple-target attach, and the fragment stage's outputs are named to them by
    // drawBuffers rather than everything past the first being thrown away.
    expect(gl.of('framebufferTexture2D').map((entry) => entry.attachment)).toEqual([
      COLOR_ATTACHMENT0,
      COLOR_ATTACHMENT0,
      COLOR_ATTACHMENT0,
      COLOR_ATTACHMENT0,
      COLOR_ATTACHMENT0 + 1,
      COLOR_ATTACHMENT0 + 2,
    ]);
    expect(gl.of('drawBuffers').at(-1)!.buffers).toEqual([
      COLOR_ATTACHMENT0,
      COLOR_ATTACHMENT0 + 1,
      COLOR_ATTACHMENT0 + 2,
    ]);
    // And the pass drew once, having wired all three targets.
    expect(gl.of('drawArrays')).toHaveLength(1);
  });

  it('clears each attachment through its own colour point, so two clear to different values', () => {
    const { gl, backend } = backendOver();
    backend.program(manyTargets(3)).draw();
    // clearColor empties every draw buffer to one colour; clearBufferfv empties one
    // point, so three attachments cleared to three values need three of them.
    expect(gl.of('clearBufferfv').map((entry) => ({ point: entry.drawbuffer, value: entry.values }))).toEqual([
      { point: 0, value: [0, 0, 0, 1] },
      { point: 1, value: [0.1, 0, 0, 1] },
      { point: 2, value: [0.2, 0, 0, 1] },
    ]);
    expect(gl.of('clearBufferfv').every((entry) => entry.buffer === COLOR)).toBe(true);
  });

  it('refuses a fourth attachment beyond the device it draws on, naming the ceiling it broke', () => {
    // The device reports three draw buffers, so a pass writing four is refused by
    // name rather than drawing three and dropping the fourth silently.
    const { backend } = backendOver((fake) => {
      fake.limits = { MAX_DRAW_BUFFERS: 3 };
    });
    expect(() => backend.program(manyTargets(4))).toThrow(
      'the frame for "gbuffer" writes 4 colours at once, and this device draws to 3'
    );
  });

  it('draws that same fourth attachment where the device draws to four', () => {
    // The specification's floor is four, which the fake reports, so the count the
    // line above refused now draws — the refusal is the device's ceiling, not a
    // fixed one.
    const { gl, backend } = backendOver();
    expect(() => backend.program(manyTargets(4)).draw()).not.toThrow();
    expect(gl.of('drawBuffers').at(-1)!.buffers).toHaveLength(4);
  });

  it('gives every framebuffer it made back when it is done, the pass framebuffer included', () => {
    const { gl, backend } = backendOver();
    backend.program(manyTargets(3)).dispose();
    // Three per-texture framebuffers and the one the pass drew through: four freed.
    expect(gl.of('deleteFramebuffer')).toHaveLength(4);
    expect(gl.of('deleteTexture')).toHaveLength(3);
  });
});

/**
 * A pass drawing the shader's own vertex geometry, authored the way the build
 * assembles `core-geometry`: the real `quad-grid` primitive's bytes, layout and
 * counts, a vertex stage reading its two attributes, and a pipeline naming the
 * geometry with a pass that counts instances alone. Item 77 draws this where the
 * backend drew only its own fullscreen corners before.
 *
 * The bytes and their layout come out of `GEOMETRY_PRIMITIVE` rather than being
 * written here, so what these assert is the backend reading a real primitive: a
 * 16×16 grid is 289 vertices and 1,536 indices at a 16-byte stride, two
 * `float32x2` attributes at offsets 0 and 8.
 */
const GRID_VERTEX =
  '#version 300 es\nlayout(location=0) in vec2 position;\nlayout(location=1) in vec2 grid;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';

function geometryFrame(instances = 3): FrameGraph {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);
  return {
    id: 'core-geometry',
    authored: 'glsl',
    // uniform 0, grid vertices 1, grid-index indices 2.
    resources: [
      { kind: 'uniform' },
      {
        kind: 'vertices',
        stride: grid.stride,
        attributes: grid.attributes,
        topology: grid.topology,
        count: made.vertexCount,
        indices: indices(2),
        data: made.vertices,
      },
      { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
    ],
    modules: [
      { name: 'warp', glsl: GRID_VERTEX },
      { name: 'shade', glsl: FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        geometry: vertices(1),
        bindings: [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ instances }] }],
  };
}

describe('a pass drawing the shader own geometry (item 77)', () => {
  const ARRAY_BUFFER = 0x8892;
  const ELEMENT_ARRAY_BUFFER = 0x8893;
  const UNSIGNED_SHORT = 0x1403;
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);

  it('no longer refuses geometry now that it has a buffer for it', () => {
    const { backend } = backendOver();
    expect(() => backend.program(geometryFrame()).draw()).not.toThrow();
  });

  it('uploads the vertex and index buffers of the geometry it draws', () => {
    const { gl, backend } = backendOver();
    backend.program(geometryFrame());
    // The vertex bytes reach the card through ARRAY_BUFFER and the indices through
    // ELEMENT_ARRAY_BUFFER, each the length the generator wrote. The backend's
    // shared fullscreen quad is an ARRAY_BUFFER upload too, so the vertex bytes are
    // the one of that length rather than merely the first.
    const arrayLengths = gl.of('bufferData').filter((entry) => entry.target === ARRAY_BUFFER).map((entry) => entry.byteLength);
    const indexUpload = gl.of('bufferData').find((entry) => entry.target === ELEMENT_ARRAY_BUFFER);
    expect(arrayLengths).toContain(made.vertices.byteLength);
    expect(indexUpload?.byteLength).toBe(made.indices.byteLength);
  });

  it('binds the attribute layout off the pipeline geometry, not the fullscreen quad', () => {
    const { gl, backend } = backendOver();
    backend.program(geometryFrame()).draw();
    // Two attributes, at the locations the source reads them, each two floats wide
    // and read at its own byte offset out of the 16-byte stride — the layout the
    // primitive carries rather than the three-float corner pointer.
    const pointers = gl.of('vertexAttribPointer');
    expect(pointers).toContainEqual(
      expect.objectContaining({ index: 0, size: 2, stride: grid.stride, offset: 0 })
    );
    expect(pointers).toContainEqual(
      expect.objectContaining({ index: 1, size: 2, stride: grid.stride, offset: 8 })
    );
  });

  it('draws the geometry with one drawElementsInstanced, the count and instances it was given', () => {
    const { gl, backend } = backendOver();
    backend.program(geometryFrame(3)).draw();
    // One draw call reading the index count and the instance count — the same one
    // draw the card makes however many instances it reads (item 28) — and it is a
    // drawElements, not the drawArrays a fullscreen corner pass makes.
    expect(gl.of('drawArrays')).toHaveLength(0);
    expect(gl.of('drawElementsInstanced')).toHaveLength(1);
    expect(gl.of('drawElementsInstanced').at(-1)).toMatchObject({
      mode: 0x0004,
      count: made.indexCount,
      type: UNSIGNED_SHORT,
      offset: 0,
      instances: 3,
    });
  });

  it('draws under the GL mode the declared topology maps to, not always TRIANGLES (item 83)', () => {
    const TRIANGLE_STRIP = 0x0005;
    const { gl, backend } = backendOver();
    // The same grid, re-declared as a triangle strip. A strip must reach the card
    // as TRIANGLE_STRIP: drawn as a triangle list of the same vertices it is a
    // different, wrong picture, which is the silent divergence item 83 closes.
    const base = geometryFrame(3);
    const strip: FrameGraph = {
      ...base,
      resources: base.resources.map((resource) =>
        resource.kind === 'vertices' ? { ...resource, topology: 'triangle-strip' } : resource
      ),
    };
    backend.program(strip).draw();
    expect(gl.of('drawElementsInstanced')).toHaveLength(1);
    expect(gl.of('drawElementsInstanced').at(-1)).toMatchObject({ mode: TRIANGLE_STRIP });
  });

  it('refuses a topology it has no GL mode for, naming the topology (item 83)', () => {
    const { backend } = backendOver();
    const base = geometryFrame();
    const bogus: FrameGraph = {
      ...base,
      resources: base.resources.map((resource) =>
        // A topology outside GPUPrimitiveTopology, cast past the type to prove the
        // default arm refuses by name rather than silently drawing triangles.
        resource.kind === 'vertices' ? { ...resource, topology: 'fan' as never } : resource
      ),
    };
    expect(() => backend.program(bogus).draw()).toThrow(
      'the geometry 1 on "core-geometry" declares topology "fan", which this backend does not draw'
    );
  });

  it('issues the draw count cost() reads off the same structure', () => {
    const { gl, backend } = backendOver();
    backend.program(geometryFrame()).draw();
    // The one draw call it makes is the one draw cost() counts for the pass, so a
    // change that adds or drops a draw moves both together (item 28 counts an
    // instanced draw as one).
    const draws = gl.of('drawElements').length + gl.of('drawElementsInstanced').length;
    expect(draws).toBe(cost(geometryFrame(), { width: 800, height: 600 }).draws);
    expect(draws).toBe(1);
  });

  it('gives the vertex and index buffers back when it is done', () => {
    const { gl, backend } = backendOver();
    backend.program(geometryFrame()).dispose();
    // The two geometry buffers go back to the arena on dispose. No uniform block is
    // reported for this frame, so the only buffers freed here are the geometry's.
    expect(gl.of('deleteBuffer')).toHaveLength(2);
  });

  it('refuses a pass mixing its own corners into the geometry it draws', () => {
    const { backend } = backendOver();
    const frame = geometryFrame();
    const mixed: FrameGraph = { ...frame, passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }, { instances: 3 }] }] };
    expect(() => backend.program(mixed)).toThrow(
      'the frame for "core-geometry" mixes its own corners into the geometry 1, which it draws from one buffer'
    );
  });
});

/**
 * A frame the scene tier emits (item 92): one instanced render pass drawing a mesh
 * once per object, each copy reading its own record out of a read-only storage
 * buffer by `instance_index`, and a shared views buffer beside it — the shape
 * `sceneView` builds ([scene/scene-view.ts](../scene/scene-view.ts)), authored the
 * way the build assembles `core-material`. GLSL ES 3.00 has no storage buffer, so
 * this backend takes the raster path of a uniform block indexed by `gl_InstanceID`:
 * the whole buffer bound once per pass, the shader reading `objects[gl_InstanceID]`
 * out of the array. Two read-only buffers — the per-object records and the shared
 * views — so the driver reports two blocks the backend binds to points of their
 * own, told apart by the `_group_G_binding_B` their members carry (item 87).
 *
 * The fake reports the two blocks the way a driver would (`gl.blocks`); what these
 * assert is the backend's calls, not a compiled shader, exactly as items 46/77/78
 * landed their WebGL 2 work through the node suite rather than a card. That the
 * per-instance picture agrees is a card's or a browser's per item 93 (§17 note 3).
 */
const SCENE_VERTEX =
  '#version 300 es\n' +
  'layout(location=0) in vec2 position;\n' +
  'struct Object { mat4 model; vec4 tint; };\n' +
  'layout(std140) uniform Objects { Object _group_0_binding_0[64]; };\n' +
  'layout(std140) uniform Views { mat4 _group_0_binding_1[2]; };\n' +
  'void main(){\n' +
  '  Object mine = _group_0_binding_0[gl_InstanceID];\n' +
  '  gl_Position = _group_0_binding_1[0] * mine.model * vec4(position, 0.0, 1.0);\n' +
  '}';

const OBJECT_BYTES = 80;
const SCENE_INSTANCES = 3;
const OBJECTS_BYTES = OBJECT_BYTES * SCENE_INSTANCES;
const VIEW_BYTES = 64;

/** The two blocks the linked scene program reports, one per read-only buffer, each
 * member qualified with the binding's `_group_G_binding_B` so `resolveBlocks` tells
 * them apart and from the (here absent) shared block. */
const withSceneBlocks = (gl: ReturnType<typeof createFakeGL>) => {
  gl.blocks = [
    { bytes: OBJECTS_BYTES, members: [{ name: 'Objects._group_0_binding_0[0].model', offset: 0 }] },
    { bytes: VIEW_BYTES, members: [{ name: 'Views._group_0_binding_1[0]', offset: 0 }] },
  ];
};

function sceneFrame(instances = SCENE_INSTANCES): FrameGraph {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);
  return {
    id: 'core-material',
    authored: 'glsl',
    // per-object records 0, shared views 1, grid vertices 2, grid-index indices 3.
    resources: [
      { kind: 'buffer', bytes: OBJECTS_BYTES, access: 'read', data: new Uint8Array(OBJECTS_BYTES) },
      { kind: 'buffer', bytes: VIEW_BYTES, access: 'read', data: new Uint8Array(VIEW_BYTES) },
      {
        kind: 'vertices',
        stride: grid.stride,
        attributes: grid.attributes,
        topology: grid.topology,
        count: made.vertexCount,
        indices: indices(3),
        data: made.vertices,
      },
      { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
    ],
    modules: [
      { name: 'project', glsl: SCENE_VERTEX },
      { name: 'shade', glsl: FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        geometry: vertices(2),
        bindings: [
          { group: 0, binding: 0, resource: buffer(0), visibility: ['vertex'] },
          { group: 0, binding: 1, resource: buffer(1), visibility: ['vertex'] },
        ],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ instances }] }],
  };
}

describe("the scene tier's per-instance read-only buffer (item 92)", () => {
  const UNIFORM_BUFFER = 0x8a11;
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);

  it('draws it where it refused a buffer before', () => {
    const { backend } = backendOver(withSceneBlocks);
    expect(() => backend.program(sceneFrame()).draw()).not.toThrow();
  });

  it('uploads the per-object records and the shared views as uniform buffers', () => {
    const { gl, backend } = backendOver(withSceneBlocks);
    backend.program(sceneFrame());
    // Each read-only buffer reaches the card through UNIFORM_BUFFER — the raster
    // path a storage buffer takes here — at the length the producer packed. The
    // geometry rides ARRAY_BUFFER beside them, so these are the uniform uploads
    // alone; no shared uniform block is reported, so the two lengths are the whole
    // of the uniform-buffer traffic.
    const uniformLengths = gl.of('bufferData').filter((entry) => entry.target === UNIFORM_BUFFER).map((entry) => entry.byteLength);
    expect(uniformLengths).toContain(OBJECTS_BYTES);
    expect(uniformLengths).toContain(VIEW_BYTES);
  });

  it('binds each read-only buffer whole to its own block point', () => {
    const { gl, backend } = backendOver(withSceneBlocks);
    backend.program(sceneFrame()).draw();
    // Each block is told its point at link (uniformBlockBinding) and the whole
    // buffer bound there before the draw (bindBufferBase). Points run from
    // STORAGE_POINT_BASE=2, above the shared (0) and per-draw (1) points, one per
    // read-only buffer in binding order: objects at 2, views at 3.
    const linked = gl.of('uniformBlockBinding').map((entry) => entry.binding);
    expect(linked).toContain(2);
    expect(linked).toContain(3);
    const bound = gl.of('bindBufferBase').map((entry) => entry.index);
    expect(bound).toContain(2);
    expect(bound).toContain(3);
  });

  it('draws the instances with one drawElementsInstanced, the count cost() reads off the same structure', () => {
    const { gl, backend } = backendOver(withSceneBlocks);
    backend.program(sceneFrame(5)).draw();
    // One draw call reading the mesh's index count and the object count as its
    // instance count — the same one draw the card makes however many instances it
    // reads (item 28) — and it is the one draw cost() counts for the pass.
    expect(gl.of('drawElementsInstanced')).toHaveLength(1);
    expect(gl.of('drawElementsInstanced').at(-1)).toMatchObject({ count: made.indexCount, instances: 5 });
    const draws = gl.of('drawElements').length + gl.of('drawElementsInstanced').length;
    expect(draws).toBe(cost(sceneFrame(5), { width: 800, height: 600 }).draws);
    expect(draws).toBe(1);
  });

  it('counts the records and views as resident bytes, none uploaded per frame', () => {
    const { backend } = backendOver(withSceneBlocks);
    // The quad the backend shares is written at construction; reset here so what is
    // measured is this frame's own uploads. The per-object records, the shared
    // views, and the geometry are all first contents of resident resources, counted
    // through `arena.wrote` (item 22); nothing is uploaded per frame, since no
    // shared uniform block is respecified.
    backend.resetTraffic();
    backend.program(sceneFrame());
    const traffic = backend.traffic();
    expect(traffic.written).toBe(OBJECTS_BYTES + VIEW_BYTES + made.vertices.byteLength + made.indices.byteLength);
    expect(traffic.uploaded).toBe(0);
  });

  it('gives the per-object and views buffers back on dispose', () => {
    const { gl, backend } = backendOver(withSceneBlocks);
    backend.program(sceneFrame()).dispose();
    // Two read-only storage buffers plus the two geometry buffers go back to the
    // arena; no shared uniform block is reported, so those four are the whole of it.
    expect(gl.of('deleteBuffer')).toHaveLength(4);
  });

  it('still refuses a read-write storage buffer among the scene buffers, by name', () => {
    const { backend } = backendOver(withSceneBlocks);
    // A read-write buffer bound beside the read-only ones is a compute or
    // fragment-stage output this backend has no stage to fill: refused by name where
    // its read-only siblings draw, so the reduced scene tier is honest about what it
    // cannot carry rather than dropping the data silently.
    const base = sceneFrame();
    const withRW: FrameGraph = {
      ...base,
      resources: base.resources.map((resource, at) =>
        at === 0 && resource.kind === 'buffer' ? { ...resource, access: 'read-write' as const } : resource
      ),
    };
    expect(() => backend.program(withRW)).toThrow(
      'the frame for "core-material" writes resource 0 as a storage buffer, and this backend has no compute to fill one'
    );
  });
});

/**
 * A frame that mixes the two arms of the WebGL 2 draw path in one pass list: a
 * first pass drawing the shader's own vertex geometry (the geometry arm, item 77)
 * into a frame-sized texture, and a second pass sampling that texture over the
 * backend's fullscreen corners (the corners arm). The two arms enable different
 * attribute locations, so before item 84 the second pass ran with the geometry
 * pass's arrays still enabled and still pointing at the geometry's buffer.
 */
function mixedArmsFrame(): FrameGraph {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);
  return {
    id: 'mixed-arms',
    authored: 'glsl',
    // uniform 0, grid vertices 1, grid-index indices 2, scene texture 3, sampler 4.
    resources: [
      { kind: 'uniform' },
      {
        kind: 'vertices',
        stride: grid.stride,
        attributes: grid.attributes,
        topology: grid.topology,
        count: made.vertexCount,
        indices: indices(2),
        data: made.vertices,
      },
      { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment', 'sample'] },
      { kind: 'sampler', filter: 'linear', wrap: 'clamp' },
    ],
    modules: [
      { name: 'warp', glsl: GRID_VERTEX },
      { name: 'shade', glsl: FRAGMENT },
      { name: 'vertex', glsl: VERTEX },
      { name: 'show', glsl: FRAGMENT_SAMPLE },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        geometry: vertices(1),
        targets: [{ format: 'rgba8unorm' }],
        bindings: [],
      },
      {
        kind: 'render',
        vertex: { module: moduleHandle(2), entry: 'main' },
        fragment: { module: moduleHandle(3), entry: 'main' },
        bindings: [{ group: 0, binding: 0, resource: texture(3), visibility: ['fragment'], reads: 'sample' }],
      },
    ],
    passes: [
      { pipeline: pipelineHandle(0), draws: [{ instances: 3 }], colour: [{ resource: texture(3), clear: [0, 0, 0, 1] }] },
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
    ],
  };
}

describe('a pass does not leak its vertex attribute arrays to the next (item 84)', () => {
  it('disables every attribute location it enabled, so no pass reads another pass layout', () => {
    const { gl, backend } = backendOver();
    backend.program(mixedArmsFrame()).draw();
    // Every location a pass enabled is disabled again by the end of its draws, so
    // the geometry pass's two locations and the corners pass's single one are all
    // cleared. The set of arrays left enabled across the whole frame is therefore
    // empty: no pass can observe an attribute array another pass turned on.
    const enabled = gl.of('enableVertexAttribArray').map((entry) => entry.index);
    const disabled = gl.of('disableVertexAttribArray').map((entry) => entry.index);
    expect(enabled.length).toBeGreaterThan(0);
    for (const index of enabled) expect(disabled).toContain(index);
  });

  it('clears the geometry arm arrays before the corners pass enables its own', () => {
    const { gl, backend } = backendOver();
    backend.program(mixedArmsFrame()).draw();
    // In call order: the geometry pass enables locations 0 and 1, draws, then
    // disables 0 and 1; only after that does the corners pass enable its single
    // location. So at the moment the corners pass draws, the geometry arm's arrays
    // are off rather than still pointing at the grid buffer.
    const order = gl.calls
      .filter((entry) => entry.call === 'enableVertexAttribArray' || entry.call === 'disableVertexAttribArray')
      .map((entry) => `${entry.call === 'enableVertexAttribArray' ? '+' : '-'}${entry.index as number}`);
    expect(order).toEqual(['+0', '+1', '-0', '-1', '+0', '-0']);
  });
});

/**
 * A fullscreen pass sampling a resident image, authored the way the build
 * assembles `core-texture`: a 64×64 `grain` texture arriving with its own bytes,
 * a `grainSampler` reading it smoothly and tiling it, and one pass that samples it
 * over the frame. Item 78 uploads that image where the backend filled a texture
 * only by drawing it before. The bytes are a real 16 KB image the size the fixture
 * uploads, so what these assert is the backend uploading a resident image rather
 * than a shape written here.
 */
const GRAIN_FRAGMENT =
  '#version 300 es\nprecision highp float;\nuniform sampler2D _group_0_binding_0;\nout vec4 c;\nvoid main(){c=texture(_group_0_binding_0,gl_FragCoord.xy/vec2(64.0));}';

/** Sixty-four pixels square at four bytes a pixel, the size and layout the
 * `core-texture` fixture's `value-noise` arrives in. */
const GRAIN_BYTES = 64 * 64 * 4;

function textureFrame(size: { width: number; height: number } | { scale: number } = { width: 64, height: 64 }): FrameGraph {
  return {
    id: 'core-texture',
    authored: 'glsl',
    // uniform 0, grain texture 1, sampler 2.
    resources: [
      { kind: 'uniform' },
      { kind: 'texture', size, format: 'rgba8unorm', use: ['sample'], data: new Uint8Array(GRAIN_BYTES) },
      { kind: 'sampler', filter: 'linear', wrap: 'repeat' },
    ],
    modules: [
      { name: 'vertex', glsl: VERTEX },
      { name: 'shade', glsl: GRAIN_FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        bindings: [{ group: 0, binding: 0, resource: texture(1), visibility: ['fragment'], reads: 'sample' }],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
  };
}

describe('a pass sampling a resident image (item 78)', () => {
  const TEXTURE_MIN_FILTER = 0x2801;
  const TEXTURE_WRAP_S = 0x2802;
  const LINEAR = 0x2601;
  const REPEAT = 0x2901;

  it('no longer refuses a texture arriving with contents now that it uploads them', () => {
    const { backend } = backendOver();
    expect(() => backend.program(textureFrame()).draw()).not.toThrow();
  });

  it('uploads the image at level 0 as the frame-sized resident bytes it arrived with', () => {
    const { gl, backend } = backendOver();
    backend.program(textureFrame());
    // The 16 KB image reaches the card through texImage2D at level 0 and the
    // texture's own size, where a scratch attachment built empty carries no bytes.
    const upload = gl.of('texImage2D').find((entry) => entry.byteLength === GRAIN_BYTES);
    expect(upload).toMatchObject({ level: 0, width: 64, height: 64 });
  });

  it('counts the uploaded image as resident traffic, written not uploaded (item 22)', () => {
    const { backend } = backendOver();
    // Reset past the shared fullscreen quad the backend wrote at creation, so what
    // is read is the image this frame uploaded and nothing before it.
    backend.resetTraffic();
    backend.program(textureFrame());
    expect(backend.traffic()).toEqual({ written: GRAIN_BYTES, uploaded: 0 });
  });

  it('reads the image between its pixels the way its sampler says — smooth and tiling', () => {
    const { gl, backend } = backendOver();
    backend.program(textureFrame());
    const params = gl.of('texParameteri');
    // The sampler is linear and repeating, so the texture is built with a LINEAR
    // min filter and a REPEAT wrap rather than the nearest/clamp default.
    expect(params).toContainEqual(expect.objectContaining({ pname: TEXTURE_MIN_FILTER, param: LINEAR }));
    expect(params).toContainEqual(expect.objectContaining({ pname: TEXTURE_WRAP_S, param: REPEAT }));
  });

  it('binds the sampled image to a unit and points the sampler at it', () => {
    const { gl, backend } = backendOver();
    backend.program(textureFrame()).draw();
    // The pass binds the uploaded texture and points its sampler uniform at the
    // unit, which is how a fragment reaches it (item 46's sampled-texture path).
    expect(gl.of('bindTexture').length).toBeGreaterThan(0);
    expect(gl.of('activeTexture').at(-1)).toMatchObject({ unit: 0x84c0 });
  });

  it('gives the image back when it is done', () => {
    const { gl, backend } = backendOver();
    backend.program(textureFrame()).dispose();
    // The one texture the frame declared goes back to the arena on dispose.
    expect(gl.of('deleteTexture')).toHaveLength(1);
  });

  it('refuses a content texture the frame own size, which a resize would throw away', () => {
    const { backend } = backendOver();
    expect(() => backend.program(textureFrame({ scale: 1 }))).toThrow(
      'the frame for "core-texture" gives resource 1 contents and the frame\'s own size, which is thrown away on a resize'
    );
  });
});

/**
 * A fullscreen pass sampling a resident image with a ladder generated off it, the
 * way the build assembles `core-mips`: a 256×256 `grain` texture arriving with its
 * own `value-noise` bytes and `mips: 'generate'`, a `grainSampler` reading it
 * smoothly and tiling it, and one pass that samples it. Item 50 generates the
 * ladder where the backend refused a laddered texture before. What the levels look
 * like is a picture a card or a browser answers (item 44); what these assert is
 * that the ladder is generated when the contents arrive and the texture is read
 * with the trilinear min filter a shrinking picture wants.
 */
const MIPS_SIDE = 256;
const MIPS_BYTES = MIPS_SIDE * MIPS_SIDE * 4;

function mipsFrame(over: Partial<TextureResource> = {}): FrameGraph {
  return {
    id: 'core-mips',
    authored: 'glsl',
    // uniform 0, grain texture 1, sampler 2.
    resources: [
      { kind: 'uniform' },
      {
        kind: 'texture',
        size: { width: MIPS_SIDE, height: MIPS_SIDE },
        format: 'rgba8unorm',
        use: ['sample'],
        mips: 'generate',
        data: new Uint8Array(MIPS_BYTES),
        ...over,
      },
      { kind: 'sampler', filter: 'linear', wrap: 'repeat' },
    ],
    modules: [
      { name: 'vertex', glsl: VERTEX },
      { name: 'shade', glsl: GRAIN_FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        vertex: { module: moduleHandle(0), entry: 'main' },
        fragment: { module: moduleHandle(1), entry: 'main' },
        bindings: [{ group: 0, binding: 0, resource: texture(1), visibility: ['fragment'], reads: 'sample' }],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
  };
}

describe('a pass sampling a laddered image (item 50)', () => {
  const TEXTURE_MIN_FILTER = 0x2801;
  const TEXTURE_MAG_FILTER = 0x2800;
  const LINEAR = 0x2601;
  const LINEAR_MIPMAP_LINEAR = 0x2703;

  it('no longer refuses a texture carrying a ladder now that it generates one', () => {
    const { backend } = backendOver();
    expect(() => backend.program(mipsFrame()).draw()).not.toThrow();
  });

  it('generates the ladder off the level-0 contents when they arrive', () => {
    const { gl, backend } = backendOver();
    backend.program(mipsFrame());
    // The contents reach level 0 through texImage2D, then the card averages the
    // ladder off them once — not a call per frame, since the content texture does
    // not follow the frame.
    const upload = gl.of('texImage2D').find((entry) => entry.byteLength === MIPS_BYTES);
    expect(upload).toMatchObject({ level: 0, width: MIPS_SIDE, height: MIPS_SIDE });
    expect(gl.of('generateMipmap')).toHaveLength(1);
    expect(gl.of('generateMipmap')[0]).toMatchObject({ target: 0x0de1 });
  });

  it('reads the ladder with the trilinear min filter a shrinking picture wants', () => {
    const { gl, backend } = backendOver();
    backend.program(mipsFrame());
    const params = gl.of('texParameteri');
    // The min filter mixes the two levels either side of the wanted size; the mag
    // filter has no levels to mix and stays the plain linear one.
    expect(params).toContainEqual(
      expect.objectContaining({ pname: TEXTURE_MIN_FILTER, param: LINEAR_MIPMAP_LINEAR })
    );
    expect(params).toContainEqual(expect.objectContaining({ pname: TEXTURE_MAG_FILTER, param: LINEAR }));
  });

  it('generates no ladder for a texture that carries none', () => {
    const { gl, backend } = backendOver();
    backend.program(mipsFrame({ mips: undefined }));
    // A texture with no ladder keeps its one level and its plain min filter.
    expect(gl.of('generateMipmap')).toHaveLength(0);
    const params = gl.of('texParameteri');
    expect(params).toContainEqual(expect.objectContaining({ pname: TEXTURE_MIN_FILTER, param: LINEAR }));
  });
});

/**
 * A depth-tested frame the way the build assembles `core-depth`, reduced to the
 * one capability item 48 lands: two passes draw the real `quad-grid` sheet into
 * one colour target sharing a depth renderbuffer, the first clearing the depth to
 * the far plane and writing distances under `less`, the second testing against
 * what the first left with its own write off, so a nearer surface shows and a
 * farther one does not. `present` blits the picture. The projection the fixture
 * aims the sheet with is a picture's concern, not a call's, so it is left out.
 *
 * A stencil frame the same way, from `core-stencil`: the first pass marks the mask
 * wherever its sheet draws, the second fills the frame's own corners only where the
 * mark is and leaves the mask as it found it.
 */
const SHEET_VERTEX =
  '#version 300 es\nlayout(location=0) in vec2 position;\nlayout(location=1) in vec2 grid;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';

function sheetResources(): FrameGraph['resources'] {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);
  // Both depthFrame and stencilFrame spread these after the uniform and two
  // textures, so the sheet vertices land at index 3 and the sheet indices at 4.
  return [
    { kind: 'vertices', stride: grid.stride, attributes: grid.attributes, topology: grid.topology, count: made.vertexCount, indices: indices(4), data: made.vertices },
    { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
  ];
}

function depthFrame(): FrameGraph {
  const pipelines: RenderPipelineSpec[] = [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'main' }, fragment: { module: moduleHandle(1), entry: 'main' },
      geometry: vertices(3), bindings: [], targets: [{ format: 'rgba8unorm' }],
      depth: { format: 'depth24plus', compare: 'less', write: true },
    },
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'main' }, fragment: { module: moduleHandle(1), entry: 'main' },
      geometry: vertices(3), bindings: [], targets: [{ format: 'rgba8unorm' }],
      depth: { format: 'depth24plus', compare: 'less', write: false },
    },
  ];
  // uniform 0, picture texture 1, depth texture 2, sheet vertices 3, sheet-index 4.
  return {
    id: 'core-depth', authored: 'glsl',
    resources: [
      { kind: 'uniform' },
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] },
      { kind: 'texture', size: { scale: 1 }, format: 'depth24plus', use: ['attachment'] },
      ...sheetResources(),
    ],
    modules: [
      { name: 'project', glsl: SHEET_VERTEX },
      { name: 'paint', glsl: FRAGMENT },
    ],
    pipelines,
    passes: [
      { pipeline: pipelineHandle(0), draws: [{ instances: 1 }], colour: [{ resource: texture(1), clear: [0, 0, 0, 1] }], depth: { resource: texture(2), clear: 1 } },
      { pipeline: pipelineHandle(1), draws: [{ instances: 1 }], colour: [{ resource: texture(1) }], depth: { resource: texture(2) } },
    ],
    present: texture(1),
  };
}

function stencilFrame(): FrameGraph {
  const pipelines: RenderPipelineSpec[] = [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'main' }, fragment: { module: moduleHandle(2), entry: 'main' },
      geometry: vertices(3), bindings: [], targets: [{ format: 'rgba8unorm' }],
      depth: { format: 'stencil8', stencil: 'mark' },
    },
    {
      kind: 'render',
      vertex: { module: moduleHandle(1), entry: 'main' }, fragment: { module: moduleHandle(2), entry: 'main' },
      bindings: [], targets: [{ format: 'rgba8unorm' }],
      depth: { format: 'stencil8', stencil: 'inside' },
    },
  ];
  // uniform 0, picture texture 1, mask texture 2, sheet vertices 3, sheet-index 4.
  return {
    id: 'core-stencil', authored: 'glsl',
    resources: [
      { kind: 'uniform' },
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] },
      { kind: 'texture', size: { scale: 1 }, format: 'stencil8', use: ['attachment'] },
      ...sheetResources(),
    ],
    modules: [
      { name: 'project', glsl: SHEET_VERTEX },
      { name: 'cover', glsl: VERTEX },
      { name: 'paint', glsl: FRAGMENT },
    ],
    pipelines,
    passes: [
      { pipeline: pipelineHandle(0), draws: [{ instances: 1 }], colour: [{ resource: texture(1), clear: [0, 0, 0, 1] }], depth: { resource: texture(2), stencilClear: 0 } },
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }], colour: [{ resource: texture(1) }], depth: { resource: texture(2) } },
    ],
    present: texture(1),
  };
}

describe('a pass that tests depth (item 48)', () => {
  const DEPTH_COMPONENT24 = 0x81a6;
  const DEPTH_ATTACHMENT = 0x8d00;
  const RENDERBUFFER = 0x8d41;
  const DEPTH = 0x1801;
  const DEPTH_TEST = 0x0b71;
  const LESS = 0x0201;

  it('no longer refuses depth now that it keeps a renderbuffer for it', () => {
    const { backend } = backendOver();
    expect(() => backend.program(depthFrame()).draw()).not.toThrow();
  });

  it('keeps the depth in a renderbuffer of its format, attached at the depth point', () => {
    const { gl, backend } = backendOver();
    backend.program(depthFrame());
    // The depth is a renderbuffer storing DEPTH_COMPONENT24 at the frame size, not
    // an RGBA8 texture, and it is attached to the colour target's framebuffer at the
    // depth point rather than a colour one.
    expect(gl.of('renderbufferStorage')).toContainEqual(
      expect.objectContaining({ target: RENDERBUFFER, internal: DEPTH_COMPONENT24, width: 800, height: 600 })
    );
    expect(gl.of('framebufferRenderbuffer')).toContainEqual(
      expect.objectContaining({ attachment: DEPTH_ATTACHMENT })
    );
  });

  it('enables the depth test and sets the compare and write the pipeline carries', () => {
    const { gl, backend } = backendOver();
    backend.program(depthFrame()).draw();
    expect(gl.of('enable')).toContainEqual(expect.objectContaining({ cap: DEPTH_TEST }));
    expect(gl.of('depthFunc')).toContainEqual(expect.objectContaining({ func: LESS }));
    // The first pass writes the distances it draws and the second, tested against
    // them, leaves them behind — so both a masked-on and a masked-off write reach
    // the card, which is what lets a nearer surface show over a farther one.
    const masks = gl.of('depthMask').map((entry) => entry.flag);
    expect(masks).toContain(true);
    expect(masks).toContain(false);
  });

  it('empties the depth to the far plane where the pass clears it', () => {
    const { gl, backend } = backendOver();
    backend.program(depthFrame()).draw();
    // The first pass clears the depth to 1, the far end of the range, so a first
    // surface at any distance is nearer than the empty attachment; the second keeps
    // what the first left and clears nothing.
    expect(gl.of('clearBufferfv')).toContainEqual(
      expect.objectContaining({ buffer: DEPTH, values: [1] })
    );
  });

  it('remakes the depth renderbuffer at the new size before the next draw', () => {
    const { gl, backend } = backendOver();
    const program = backend.program(depthFrame());
    program.draw();
    backend.resize(320, 180);
    program.draw();
    // The depth follows the frame, so a resize respecifies its storage at the new
    // size — a depth kept at one size and tested at another would decide which
    // surface is in front out of the wrong pixels.
    expect(gl.of('renderbufferStorage')).toContainEqual(
      expect.objectContaining({ internal: DEPTH_COMPONENT24, width: 320, height: 180 })
    );
  });

  it('gives the depth renderbuffer back when it is done', () => {
    const { gl, backend } = backendOver();
    backend.program(depthFrame()).dispose();
    // One depth renderbuffer, freed once through its own context call.
    expect(gl.of('deleteRenderbuffer')).toHaveLength(1);
  });
});

describe('a pass that masks with a stencil (item 48)', () => {
  const STENCIL_INDEX8 = 0x8d48;
  const STENCIL_ATTACHMENT = 0x8d20;
  const STENCIL = 0x1802;
  const STENCIL_TEST = 0x0b90;
  const ALWAYS = 0x0207;
  const EQUAL = 0x0202;
  const KEEP = 0x1e00;
  const REPLACE = 0x1e01;

  it('no longer refuses a stencil now that it keeps one', () => {
    const { backend } = backendOver();
    expect(() => backend.program(stencilFrame()).draw()).not.toThrow();
  });

  it('keeps the mask in a stencil renderbuffer attached at the stencil point', () => {
    const { gl, backend } = backendOver();
    backend.program(stencilFrame());
    expect(gl.of('renderbufferStorage')).toContainEqual(
      expect.objectContaining({ internal: STENCIL_INDEX8, width: 800, height: 600 })
    );
    expect(gl.of('framebufferRenderbuffer')).toContainEqual(
      expect.objectContaining({ attachment: STENCIL_ATTACHMENT })
    );
  });

  it('marks the mask everywhere the first pass draws and reads it where the second fills', () => {
    const { gl, backend } = backendOver();
    backend.program(stencilFrame()).draw();
    expect(gl.of('enable')).toContainEqual(expect.objectContaining({ cap: STENCIL_TEST }));
    // The mark pass replaces the reference everywhere it draws (compare always, the
    // whole mask writable); the fill pass draws only where the reference already is
    // and keeps the mask as it found it (compare equal, nothing writable). These are
    // the two modes' `stencilFunc`/`stencilOp`/`stencilMask` in the card's own fields.
    const funcs = gl.of('stencilFunc');
    expect(funcs).toContainEqual(expect.objectContaining({ func: ALWAYS, ref: 0xff, mask: 0xff }));
    expect(funcs).toContainEqual(expect.objectContaining({ func: EQUAL, ref: 0xff, mask: 0xff }));
    expect(gl.of('stencilOp')).toContainEqual(expect.objectContaining({ fail: KEEP, zfail: KEEP, zpass: REPLACE }));
    expect(gl.of('stencilOp')).toContainEqual(expect.objectContaining({ fail: KEEP, zfail: KEEP, zpass: KEEP }));
    const writeMasks = gl.of('stencilMask').map((entry) => entry.mask);
    expect(writeMasks).toContain(0xff);
    expect(writeMasks).toContain(0);
  });

  it('empties the mask where the marking pass clears it', () => {
    const { gl, backend } = backendOver();
    backend.program(stencilFrame()).draw();
    expect(gl.of('clearBufferiv')).toContainEqual(
      expect.objectContaining({ buffer: STENCIL, values: [0] })
    );
  });
});

describe('what it gives back when it is done', () => {
  it('deletes the program and the buffer it made for it', () => {
    const { gl, backend } = backendOver((fake) => {
      fake.block = [{ name: 'u_time', offset: 0 }];
      fake.blockBytes = 4;
    });

    backend.program(graph()).dispose();
    expect(gl.of('deleteProgram')).toHaveLength(1);
    expect(gl.of('deleteBuffer')).toHaveLength(1);
  });

  it('loses the context on purpose, so a canvas that stays cannot keep drawing into a dead one', () => {
    const { gl, backend } = backendOver();
    backend.dispose();
    expect(gl.lostContext).toBe(1);
  });
});

describe('the words a caller asks it for', () => {
  it('answers with none, since this backend keeps no buffer a page reads back', async () => {
    // Not a refusal. A caller reads a buffer back through the arena's own `read`
    // door now (§9, item 89) — the program's `readBuffer` method is gone (item 82) — and
    // this backend's arena reader (`readNoBuffer`) hands back no bytes whatever the
    // handle names, so the same read over either backend gets an empty reading from
    // the one that keeps no such numbers without knowing which backend it holds.
    // The reader ignores the resource, so any allocated handle drives it.
    const { backend } = backendOver();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arena = (backend as any).arena;
    const handle = arena.allocate(() => ({}));
    expect([...new Uint32Array(await arena.read(handle))]).toEqual([]);
  });
});

describe('a WebGPU texture handed to the WebGL 2 backend', () => {
  // A `GPUTexture` is a WebGPU thing, and a caller holding one has chosen the
  // backend it came from. Handing it here is the same class of caller mistake as
  // a frame of the wrong target, so both draw and read refuse it by name rather
  // than drop the frame into a picture nobody captured (item 29).
  const foreign = { label: 'someone-elses-texture' } as unknown as GPUTexture;

  it('refuses to draw a frame into it, naming what it cannot do', () => {
    const { backend } = backendOver();
    expect(() => backend.program(graph()).draw(foreign)).toThrow(
      'WebGL 2 was handed a WebGPU texture to draw into, which it cannot land a frame in'
    );
  });

  it('refuses to read a frame back out of it, naming what it cannot do', async () => {
    const { backend } = backendOver();
    await expect(backend.readPixels(foreign)).rejects.toThrow(
      'WebGL 2 was handed a WebGPU texture to read back, which it cannot read a frame from'
    );
  });

  it('draws and reads as before when it is handed none', async () => {
    const { backend } = backendOver();
    expect(() => backend.program(graph()).draw()).not.toThrow();
    expect(await backend.readPixels()).toHaveLength(800 * 600 * 4);
  });
});
