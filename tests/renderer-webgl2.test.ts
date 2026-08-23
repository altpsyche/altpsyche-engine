import { describe, expect, it } from 'vitest';
import { createWebGL2Backend } from '../renderer/webgl2';
import { glslFrame } from '@altpsyche/engine';
import type { RenderPipelineSpec, ShaderFrame } from '@altpsyche/engine';
import { bottomUpFrame, createFakeGL } from './support/fake-gl';

/**
 * What the WebGL 2 backend does today, written down before a frame stops being
 * one draw.
 *
 * The interesting part of this backend is that it asks the linked program where
 * everything is instead of working it out from the source. A compiler gathers
 * uniforms into a block or leaves them loose, and it removes one no line reads,
 * so the source and the program disagree by design and only the program can say
 * how. These hold what the backend does with each answer.
 *
 * The context is a stand-in because jsdom gives none at all. It is held by
 * `backends.mjs` drawing the corpus on a real one rather than by a trace
 * contract, since what a driver answers here is the driver's own.
 */

const VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

const UNIFORMS = [
  { name: 'u_time', type: 'float' },
  { name: 'u_resolution', type: 'vec2' },
];

/** The one-pass description of the fixture, built the way the build builds one,
 * so what these assert is the backend rather than a shape written here. */
const artefact = (over: { vertex?: string; fragment?: string } = {}): ShaderFrame =>
  glslFrame('fixture', over.vertex ?? VERTEX, over.fragment ?? FRAGMENT, UNIFORMS);

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
    const wgsl = { id: 'x', target: 'wgsl' } as ShaderFrame;
    expect(() => backend.createProgram(wgsl)).toThrow('WebGL 2 was handed a wgsl frame to draw');
  });
});

/**
 * The subset this backend implements, and what it says about a description above
 * it.
 *
 * One render pass through one pipeline into the frame's own colour target is the
 * whole of it, and every capability above that line is the reason WebGPU is here.
 * Nothing branches on the backend to keep that true: a description above the
 * subset has no GLSL target, so `loadArtefact` refuses it by name before a
 * program is asked for and this is the second door rather than the first.
 */
describe('a description above the subset', () => {
  const glsl = (over: Partial<ShaderFrame>): ShaderFrame => ({ ...artefact(), ...over });

  it('refuses a frame with no pass in it rather than drawing nothing', () => {
    const { backend } = backendOver();
    expect(() => backend.createProgram(glsl({ passes: [] }))).toThrow(
      'the frame for "fixture" describes no pass this backend can draw'
    );
  });

  it('refuses a pass naming a pipeline the frame does not carry', () => {
    const { backend } = backendOver();
    const frame = artefact();
    expect(() => backend.createProgram(glsl({ passes: [{ pipeline: 'second', draw: { vertices: 3 } }] }))).toThrow(
      'the frame for "fixture" describes no pass this backend can draw'
    );
    expect(frame.pipelines.map((pipeline) => pipeline.name)).not.toContain('second');
  });

  it('refuses a pipeline asking for a vertex program the shader does not supply', () => {
    const { backend } = backendOver();
    // A GLSL pair is two documents and the vertex half is the shader's own, so
    // `fullscreen` is a WGSL description that reached the wrong backend.
    const pipelines = artefact().pipelines.map((pipeline) => ({ ...pipeline, vertex: 'fullscreen' as const }));
    expect(() => backend.createProgram(glsl({ pipelines }))).toThrow(
      'the frame for "fixture" carries no vertex document'
    );
  });

  it('refuses a pipeline naming a document the frame does not carry', () => {
    const { backend } = backendOver();
    const modules = artefact().modules.filter((document) => document.name !== 'vertex');
    expect(() => backend.createProgram(glsl({ modules }))).toThrow(
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
      backend.createProgram(glsl({ pipelines: [compute], passes: [{ pipeline: 'field', dispatch: 'frame' }] }))
    ).toThrow('the frame for "fixture" runs compute work, and WebGL 2 has no compute stage');
  });

  it('refuses a second pass rather than drawing the first and dropping the rest', () => {
    const { backend } = backendOver();
    const pass = artefact().passes[0]!;
    expect(() => backend.createProgram(glsl({ passes: [pass, pass] }))).toThrow(
      'the frame for "fixture" runs more than one pass'
    );
  });

  it('refuses a pipeline writing more than one colour, since the frame is the only one it has', () => {
    const { backend } = backendOver();
    const several = {
      ...(artefact().pipelines[0] as RenderPipelineSpec),
      targets: [{ format: 'rgba8unorm' as const }, { format: 'rgba8unorm' as const }],
    };
    expect(() => backend.createProgram(glsl({ pipelines: [several] }))).toThrow(
      'the frame for "fixture" writes 2 colours, and this backend writes the frame alone'
    );
  });

  it('refuses a pipeline that tests depth, since one surface covering the frame has nothing behind it', () => {
    const { backend } = backendOver();
    const tested = {
      ...(artefact().pipelines[0] as RenderPipelineSpec),
      depth: { format: 'depth24plus' as const, compare: 'less' as const, write: true },
    };
    expect(() => backend.createProgram(glsl({ pipelines: [tested] }))).toThrow(
      'the frame for "fixture" tests the depth of what it draws, and this backend keeps none'
    );
  });

  it('refuses a texture the description declares, since it has nowhere to write one', () => {
    const { backend } = backendOver();
    const resources = [
      ...artefact().resources,
      {
        kind: 'texture' as const,
        name: 'picture',
        size: ['frame', 'frame'] as ['frame', 'frame'],
        format: 'rgba8unorm' as const,
        use: ['storage' as const],
      },
    ];
    expect(() => backend.createProgram(glsl({ resources }))).toThrow(
      'the frame for "fixture" declares a texture resource, and this backend has none'
    );
  });

  it('compiles nothing at all where the description is refused', () => {
    const { gl, backend } = backendOver();
    expect(() => backend.createProgram(glsl({ passes: [] }))).toThrow();
    // The refusal comes before anything is compiled or linked, because it is a
    // defect in the build rather than in a reader's source and a half-built
    // program would leave a shader and a program behind with nothing holding
    // them.
    expect(gl.of('shaderSource')).toHaveLength(0);
    expect(gl.of('linkProgram')).toHaveLength(0);
  });
});

describe('building a program', () => {
  it('compiles the vertex and the fragment the artefact carries', () => {
    const { gl, backend } = backendOver();
    backend.createProgram(artefact());

    const sources = gl.of('shaderSource').map((entry) => entry.source as string);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain('in vec3 position');
    expect(sources[1]).toContain('out vec4 c');
  });

  it('throws the compiler own words when a shader will not compile', () => {
    expect(() =>
      backendOver((gl) => {
        gl.compileLog = 'ERROR: 0:8: syntax error';
      }).backend.createProgram(artefact())
    ).toThrow('ERROR: 0:8: syntax error');
  });

  it('throws the linker own words when the pair will not link', () => {
    expect(() =>
      backendOver((gl) => {
        gl.linkLog = 'the varyings do not match';
      }).backend.createProgram(artefact())
    ).toThrow('the varyings do not match');
  });

  it('deletes the shaders it attached, since the linked program holds what it needs', () => {
    const { gl, backend } = backendOver();
    backend.createProgram(artefact());
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

    backend.createProgram(artefact()).setUniforms({ u_time: 3, u_resolution: [7, 9] });

    const upload = gl.of('bufferData').at(-1)!;
    expect(upload.floats).toEqual([7, 9, 3, 0]);
    expect(gl.of('bindBufferBase').at(-1)!.index).toBe(0);
  });

  it('reads a block member by its own name, without the struct in front or the index behind', () => {
    const { gl, backend } = backendOver((fake) => {
      fake.block = [{ name: 'Uniforms.u_time_0', offset: 0 }];
      fake.blockBytes = 4;
    });

    backend.createProgram(artefact()).setUniforms({ u_time: 5 });
    expect(gl.of('bufferData').at(-1)!.floats).toEqual([5]);
  });

  it('goes through loose uniforms where the program reports no block', () => {
    const { gl, backend } = backendOver();
    backend.createProgram(artefact()).setUniforms({ u_time: 3, u_resolution: [7, 9] });

    expect(gl.of('uniform1f').at(-1)).toMatchObject({ name: 'u_time', value: 3 });
    expect(gl.of('uniform2fv').at(-1)).toMatchObject({ name: 'u_resolution', value: [7, 9] });
    expect(gl.of('bindBufferBase')).toHaveLength(0);
  });

  it('picks the loose call by how many components the value has', () => {
    const { gl, backend } = backendOver();
    backend.createProgram(artefact()).setUniforms({ a: [1, 2], b: [1, 2, 3], c: [1, 2, 3, 4] });

    expect(gl.of('uniform2fv')).toHaveLength(1);
    expect(gl.of('uniform3fv')).toHaveLength(1);
    expect(gl.of('uniform4fv')).toHaveLength(1);
  });

  it('writes nothing for a name the program has nowhere to put', () => {
    const { gl, backend } = backendOver((fake) => {
      fake.missing = ['u_dropped'];
    });

    backend.createProgram(artefact()).setUniforms({ u_dropped: 1 });
    expect(gl.of('uniform1f')).toHaveLength(0);
  });
});

describe('which names the program never got', () => {
  it('answers off the block where there is one', () => {
    const { backend } = backendOver((fake) => {
      fake.block = [{ name: 'u_time', offset: 0 }];
      fake.blockBytes = 4;
    });

    expect(backend.createProgram(artefact()).unreached(['u_time', 'u_gone'])).toEqual(['u_gone']);
  });

  it('answers off the locations where the uniforms are loose', () => {
    const { backend } = backendOver((fake) => {
      fake.missing = ['u_gone'];
    });

    expect(backend.createProgram(artefact()).unreached(['u_time', 'u_gone'])).toEqual(['u_gone']);
  });
});

describe('the frame it draws', () => {
  it('covers the frame with one triangle at the size it was resized to', () => {
    const { gl, backend } = backendOver();
    backend.resize(320, 180);
    backend.createProgram(artefact()).draw();

    expect(gl.of('viewport').at(-1)).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });
    expect(gl.of('drawArrays').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3 });
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

describe('what it gives back when it is done', () => {
  it('deletes the program and the buffer it made for it', () => {
    const { gl, backend } = backendOver((fake) => {
      fake.block = [{ name: 'u_time', offset: 0 }];
      fake.blockBytes = 4;
    });

    backend.createProgram(artefact()).dispose();
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
    expect([...(await backend.createProgram(artefact()).readBuffer('counts'))]).toEqual([]);
  });
});
