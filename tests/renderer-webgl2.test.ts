import { describe, expect, it } from 'vitest';
import { createWebGL2Backend } from '../gpu/webgl2';
import { glslFrame, missing, cost, GEOMETRY_PRIMITIVE } from '@altpsyche/engine';
import type { RenderPipelineSpec, FrameGraph } from '@altpsyche/engine';
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
/** A fragment that reads what an earlier pass drew, sampling the texture named
 * `scene` — the second pass of the multi-pass chain (item 46). */
const FRAGMENT_SAMPLE =
  '#version 300 es\nprecision highp float;\nuniform sampler2D scene;\nout vec4 c;\nvoid main(){c=texture(scene,gl_FragCoord.xy/vec2(800.0,600.0));}';

/**
 * A two-pass chain the way a producer would author it: a first pass draws into a
 * frame-sized texture, a second pass samples that texture and draws the frame the
 * reader sees. `at` decides where the second pass's picture lands — the canvas
 * directly, or a second texture the frame `present`s by blitting it on.
 */
function twoPass(at: 'canvas' | 'present' = 'canvas'): FrameGraph {
  const resources: FrameGraph['resources'] = [
    { kind: 'uniform', name: 'uniforms' },
    { kind: 'texture', name: 'scene', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment', 'sample'] },
    { kind: 'sampler', name: 'smooth', filter: 'linear', wrap: 'clamp' },
  ];
  const second: FrameGraph['passes'][number] =
    at === 'present'
      ? { pipeline: 'second', draws: [{ vertices: 3 }], colour: [{ resource: 'shown' }] }
      : { pipeline: 'second', draws: [{ vertices: 3 }] };
  if (at === 'present') {
    resources.push({ kind: 'texture', name: 'shown', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] });
  }
  return {
    id: 'chain',
    target: 'glsl',
    resources,
    modules: [
      { name: 'vertex', code: VERTEX },
      { name: 'paint', code: FRAGMENT },
      { name: 'show', code: FRAGMENT_SAMPLE },
    ],
    pipelines: [
      {
        kind: 'render',
        name: 'first',
        vertex: { module: 'vertex', entry: 'main' },
        fragment: { module: 'paint', entry: 'main' },
        targets: [{ format: 'rgba8unorm' }],
        bindings: [],
      },
      {
        kind: 'render',
        name: 'second',
        vertex: { module: 'vertex', entry: 'main' },
        fragment: { module: 'show', entry: 'main' },
        ...(at === 'present' ? { targets: [{ format: 'rgba8unorm' as const }] } : {}),
        bindings: [{ group: 0, binding: 0, resource: 'scene', visibility: ['fragment'], reads: 'sample' }],
      },
    ],
    passes: [{ pipeline: 'first', draws: [{ vertices: 3 }], colour: [{ resource: 'scene', clear: [0, 0, 0, 1] }] }, second],
    ...(at === 'present' ? { present: 'shown' } : {}),
  };
}

/** The one-pass description of the fixture, built the way the build builds one,
 * so what these assert is the backend rather than a shape written here. */
const graph = (over: { vertex?: string; fragment?: string } = {}): FrameGraph =>
  glslFrame('fixture', over.vertex ?? VERTEX, over.fragment ?? FRAGMENT);

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
    const wgsl = { id: 'x', target: 'wgsl' } as FrameGraph;
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
  const glsl = (over: Partial<FrameGraph>): FrameGraph => ({ ...graph(), ...over });

  it('refuses a frame with no pass in it rather than drawing nothing', () => {
    const { backend } = backendOver();
    expect(() => backend.program(glsl({ passes: [] }))).toThrow(
      'the frame for "fixture" describes no pass this backend can draw'
    );
  });

  it('refuses a pass naming a pipeline the frame does not carry', () => {
    const { backend } = backendOver();
    const frame = graph();
    expect(() => backend.program(glsl({ passes: [{ pipeline: 'second', draws: [{ vertices: 3 }] }] }))).toThrow(
      'the frame for "fixture" describes no pass this backend can draw'
    );
    expect(frame.pipelines.map((pipeline) => pipeline.name)).not.toContain('second');
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
      'the frame for "fixture" names a document it does not carry'
    );
  });

  it('refuses a compute pass, which is the reason the other backend is here', () => {
    const { backend } = backendOver();
    const compute = {
      kind: 'compute' as const,
      name: 'field',
      compute: { module: 'fragment', entry: 'computeMain' },
      workgroup: [8, 8, 1] as [number, number, number],
      bindings: [],
    };
    expect(() =>
      backend.program(glsl({ pipelines: [compute], passes: [{ pipeline: 'field', groups: [1, 1, 1] }] }))
    ).toThrow('the frame for "fixture" runs compute work, and WebGL 2 has no compute stage');
  });

  it('refuses a pipeline that tests depth, since one surface covering the frame has nothing behind it', () => {
    const { backend } = backendOver();
    const tested = {
      ...(graph().pipelines[0] as RenderPipelineSpec),
      depth: { format: 'depth24plus' as const, compare: 'less' as const, write: true },
    };
    expect(() => backend.program(glsl({ pipelines: [tested] }))).toThrow(
      'the frame for "fixture" tests the depth of what it draws, and this backend keeps none'
    );
  });

  it('refuses a storage texture, since it has no compute to fill one (item 51 names it)', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      {
        kind: 'texture' as const,
        name: 'picture',
        size: { scale: 1 },
        format: 'rgba8unorm' as const,
        use: ['storage' as const],
      },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" writes "picture" as a storage texture, and this backend has no compute to fill one'
    );
  });

  it('refuses a texture with a ladder of levels, which is item 50', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      {
        kind: 'texture' as const,
        name: 'picture',
        size: { scale: 1 },
        format: 'rgba8unorm' as const,
        use: ['sample' as const],
        mips: 'generate' as const,
      },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" gives "picture" a ladder of levels, and this backend generates none'
    );
  });

  it('refuses a texture keeping several samples a pixel, which is item 48', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      {
        kind: 'texture' as const,
        name: 'picture',
        size: { scale: 1 },
        format: 'rgba8unorm' as const,
        use: ['attachment' as const],
        samples: 4 as const,
      },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" keeps several samples of "picture", and this backend keeps one'
    );
  });

  it('refuses a buffer resource, since a storage buffer is a compute output', () => {
    const { backend } = backendOver();
    const resources = [
      ...graph().resources,
      { kind: 'buffer' as const, name: 'counts', bytes: 16, access: 'read-write' as const },
    ];
    expect(() => backend.program(glsl({ resources }))).toThrow(
      'the frame for "fixture" declares a buffer resource, and this backend has none'
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
    backend.program({ ...graph(), passes: [{ pipeline: 'frame', draws: [{ vertices: 3 }, { vertices: 3 }] }] }).draw();

    expect(gl.of('drawArrays')).toHaveLength(2);
  });

  it('covers many instances with one drawArraysInstanced, not many draws (item 28)', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    // One corners-draw carrying an instance count: the card makes one draw call
    // that reads a thousand instances, rather than the count being silently
    // dropped and one copy drawn.
    backend.program({ ...graph(), passes: [{ pipeline: 'frame', draws: [{ vertices: 3, instances: 1000 }] }] }).draw();

    expect(gl.of('drawArrays')).toHaveLength(0);
    expect(gl.of('drawArraysInstanced')).toHaveLength(1);
    expect(gl.of('drawArraysInstanced').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3, instances: 1000 });
  });

  it('leaves a draw with no instance count a plain drawArrays, the call every shader on the site makes (item 28)', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    backend.program({ ...graph(), passes: [{ pipeline: 'frame', draws: [{ vertices: 3 }] }] }).draw();

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
  return {
    id: 'gbuffer',
    target: 'glsl',
    resources: [
      { kind: 'uniform', name: 'uniforms' },
      ...names.map((name) => ({
        kind: 'texture' as const,
        name,
        size: { scale: 1 } as const,
        format: 'rgba8unorm' as const,
        use: ['attachment' as const],
      })),
    ],
    modules: [
      { name: 'vertex', code: VERTEX },
      { name: 'paint', code: `#version 300 es\nprecision highp float;\n${outputs}\nvoid main(){${writes}}` },
    ],
    pipelines: [
      {
        kind: 'render',
        name: 'gather',
        vertex: { module: 'vertex', entry: 'main' },
        fragment: { module: 'paint', entry: 'main' },
        targets: names.map(() => ({ format: 'rgba8unorm' as const })),
        bindings: [],
      },
    ],
    passes: [
      {
        pipeline: 'gather',
        draws: [{ vertices: 3 }],
        colour: names.map((name, at) => ({ resource: name, clear: [at / 10, 0, 0, 1] as [number, number, number, number] })),
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
    target: 'glsl',
    resources: [
      { kind: 'uniform', name: 'uniforms' },
      {
        kind: 'vertices',
        name: 'grid',
        stride: grid.stride,
        attributes: grid.attributes,
        topology: grid.topology,
        count: made.vertexCount,
        indices: 'grid-index',
        data: made.vertices,
      },
      { kind: 'indices', name: 'grid-index', format: grid.indexFormat, count: made.indexCount, data: made.indices },
    ],
    modules: [
      { name: 'warp', code: GRID_VERTEX },
      { name: 'shade', code: FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        name: 'shade',
        vertex: { module: 'warp', entry: 'main' },
        fragment: { module: 'shade', entry: 'main' },
        geometry: 'grid',
        bindings: [],
      },
    ],
    passes: [{ pipeline: 'shade', draws: [{ instances }] }],
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
    const mixed: FrameGraph = { ...frame, passes: [{ pipeline: 'shade', draws: [{ vertices: 3 }, { instances: 3 }] }] };
    expect(() => backend.program(mixed)).toThrow(
      'the frame for "core-geometry" mixes its own corners into the geometry "grid", which it draws from one buffer'
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
  it('answers with none, since a frame this backend takes declares no buffer', async () => {
    // Not a refusal. A caller asking both backends the same question gets an
    // empty reading from the one that keeps no such numbers, so nothing has to
    // know which backend it holds before asking.
    const { backend } = backendOver();
    expect([...(await backend.program(graph()).readBuffer('counts'))]).toEqual([]);
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
