import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { Arena } from '../resource/arena';
import {
  type Camera,
  type Material,
  type MaterialDraw,
  type ModuleSpec,
  type RenderPipelineSpec,
  type Scene,
  sceneView,
  type SceneViewOptions,
  isRenderPass,
  mat4,
  vec3,
  viewProjection,
  worldMatrix,
} from '@altpsyche/engine';

/**
 * `sceneView`, the scene tier's producer (ROADMAP item 32): a world and the
 * cameras watching it become a frame, with no GPU present at all. The producer is
 * handed an arena for the resident buffers it fills, takes `views: Camera[]` rather
 * than one camera, and reaches no device — so everything below is checked on plain
 * data, the way `cost()` and `validate` are, and the last block checks the layer
 * rule that keeps it a producer rather than a backend.
 */

// A panel's material feeds a colour and nothing else, the shape the shader's
// per-object struct reads after the model matrix.
type Panel = { tint: [number, number, number] };

const MODEL_BYTES = 64; // one mat4x4<f32>
const OBJECT_BYTES = 80; // model matrix, then a vec3 colour with a padding word

const MODULE: ModuleSpec = { name: 'scene', code: '// authored once, fed by the producer' };

const PIPELINE: RenderPipelineSpec = {
  kind: 'render',
  name: 'surface',
  vertex: { module: 'scene', entry: 'project' },
  fragment: { module: 'scene', entry: 'shade' },
  bindings: [
    { group: 0, binding: 0, resource: 'objects', visibility: ['vertex'] },
    { group: 0, binding: 1, resource: 'views', visibility: ['vertex'] },
  ],
};

const MATERIALS: Record<string, Material<Panel>> = {
  warm: { pipeline: 'surface', values: { tint: [0.9, 0.45, 0.3] } },
  cool: { pipeline: 'surface', values: { tint: [0.3, 0.55, 0.9] } },
};

// One object's record: its world matrix, then its colour and a padding word.
const packPanel = (draw: MaterialDraw<Panel>): Uint8Array => {
  const out = new Uint8Array(OBJECT_BYTES);
  out.set(new Uint8Array(mat4.pack(draw.world).buffer), 0);
  out.set(new Uint8Array(new Float32Array([...draw.values.tint, 0]).buffer), MODEL_BYTES);
  return out;
};

const OPTIONS: SceneViewOptions<Panel> = {
  id: 'panels',
  target: 'wgsl',
  modules: [MODULE],
  pipeline: PIPELINE,
  materials: MATERIALS,
  uniforms: [
    { name: 'u_time', type: 'float' },
    { name: 'u_resolution', type: 'vec2' },
  ],
  objects: { buffer: 'objects', pack: packPanel },
  views: { buffer: 'views' },
};

const CAMERA: Camera = {
  eye: vec3(0, 0, 0),
  target: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  fovY: Math.PI / 3,
  aspect: 1,
  near: 0.5,
  far: 6,
};

const TWO_PANELS: Scene = {
  entities: [
    { id: 'left', material: 'warm', transform: { position: vec3(-0.8, 0, -3), rotation: mat4.rotationX(-0.2), scale: vec3(0.6, 0.6, 0.6) } },
    { id: 'right', material: 'cool', transform: { position: vec3(0.8, 0, -3), rotation: mat4.rotationX(0.2), scale: vec3(0.6, 0.6, 0.6) } },
  ],
};

const floatsOf = (bytes: Uint8Array): number[] =>
  Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));

describe('sceneView turns a world and its cameras into a frame with no GPU', () => {
  it('emits one instanced pass drawing every object through the one pipeline', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    const frame = view.graph(TWO_PANELS, [CAMERA]);

    expect(frame.id).toBe('panels');
    expect(frame.target).toBe('wgsl');
    expect(frame.modules).toEqual([MODULE]);
    expect(frame.pipelines).toEqual([PIPELINE]);
    expect(frame.passes).toHaveLength(1);

    const pass = frame.passes[0]!;
    expect(isRenderPass(pass)).toBe(true);
    if (!isRenderPass(pass)) return;
    expect(pass.pipeline).toBe('surface');
    // Two objects, one instanced draw, count reads off the batch not written twice.
    expect(pass.draws).toEqual([{ instances: 2 }]);
  });

  it('bakes each object its world matrix and its material colour, in draw order', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    const frame = view.graph(TWO_PANELS, [CAMERA]);

    const objects = frame.resources.find((r) => r.name === 'objects');
    expect(objects?.kind).toBe('buffer');
    if (objects?.kind !== 'buffer') return;
    expect(objects.access).toBe('read');
    expect(objects.bytes).toBe(2 * OBJECT_BYTES);
    const data = objects.data!;

    // The left panel's record is its world matrix (the engine's, not a copy) then
    // its warm colour; the right panel's follows it.
    // The colours are compared against their own f32 round-trip, since a storage
    // buffer holds thirty-two-bit floats and 0.9 is not one of them exactly.
    const asF32 = (xs: number[]): number[] => Array.from(new Float32Array(xs));
    expect(floatsOf(data.subarray(0, MODEL_BYTES))).toEqual(Array.from(mat4.pack(worldMatrix(TWO_PANELS, 'left'))));
    expect(floatsOf(data.subarray(MODEL_BYTES, OBJECT_BYTES))).toEqual(asF32([0.9, 0.45, 0.3, 0]));
    expect(floatsOf(data.subarray(OBJECT_BYTES, OBJECT_BYTES + MODEL_BYTES))).toEqual(
      Array.from(mat4.pack(worldMatrix(TWO_PANELS, 'right')))
    );
    expect(floatsOf(data.subarray(OBJECT_BYTES + MODEL_BYTES, 2 * OBJECT_BYTES))).toEqual(asF32([0.3, 0.55, 0.9, 0]));
  });

  it('bakes one view-projection per camera into the views buffer, in the order given', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);

    const one = view.graph(TWO_PANELS, [CAMERA]);
    const oneViews = one.resources.find((r) => r.name === 'views');
    expect(oneViews?.kind === 'buffer' && oneViews.bytes).toBe(MODEL_BYTES);
    if (oneViews?.kind === 'buffer') {
      expect(floatsOf(oneViews.data!)).toEqual(Array.from(mat4.pack(viewProjection(CAMERA))));
    }

    // `views: Camera[]` is the whole point of the signature: a second camera lands
    // a second matrix after the first, so a stereo consumer never reshapes the call.
    const second: Camera = { ...CAMERA, eye: vec3(0.1, 0, 0) };
    const two = view.graph(TWO_PANELS, [CAMERA, second]);
    const twoViews = two.resources.find((r) => r.name === 'views');
    expect(twoViews?.kind === 'buffer' && twoViews.bytes).toBe(2 * MODEL_BYTES);
    if (twoViews?.kind === 'buffer') {
      expect(floatsOf(twoViews.data!.subarray(0, MODEL_BYTES))).toEqual(Array.from(mat4.pack(viewProjection(CAMERA))));
      expect(floatsOf(twoViews.data!.subarray(MODEL_BYTES))).toEqual(Array.from(mat4.pack(viewProjection(second))));
    }
  });

  it('carries the caller resources and uniforms and the present target onto the frame', () => {
    const withExtras = sceneView(new Arena<Uint8Array>(() => undefined as never), {
      ...OPTIONS,
      resources: [{ kind: 'uniform', name: 'uniforms' }],
      requires: ['depth-clamp'],
      present: 'picture',
    });
    const frame = withExtras.graph(TWO_PANELS, [CAMERA]);
    expect(frame.uniforms).toEqual(OPTIONS.uniforms);
    expect(frame.resources.find((r) => r.name === 'uniforms')?.kind).toBe('uniform');
    expect(frame.requires).toEqual(['depth-clamp']);
    expect(frame.present).toBe('picture');
  });

  it('refuses a graph with no view to draw from, by name', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    expect(() => view.graph(TWO_PANELS, [])).toThrow(/"panels" needs at least one view/);
  });

  it('lets the batch refuse a scene it cannot draw as one pipeline', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    const bare: Scene = {
      entities: [{ id: 'x', transform: { position: vec3(0, 0, -1), rotation: mat4.rotationX(0), scale: vec3(1, 1, 1) } }],
    };
    expect(() => view.graph(bare, [CAMERA])).toThrow(/"x" has no material/);
  });
});

describe('sceneView holds its buffers in the arena across frames', () => {
  it('reuses the same allocation while the world keeps its shape and reallocates when it changes', () => {
    // The disposer runs on a free, which a resize does to the buffer it replaces, so
    // counting disposals counts reallocations. First contents are `written`, a refill
    // of a reused buffer is `uploaded` — the two categories the arena keeps apart.
    let freed = 0;
    const arena = new Arena<Uint8Array>(() => {
      freed += 1;
    });
    const view = sceneView(arena, OPTIONS);

    // First frame: both buffers allocated, both filled as first contents, nothing
    // freed. Objects is two eighty-byte records, views is one sixty-four-byte matrix.
    view.graph(TWO_PANELS, [CAMERA]);
    expect(freed).toBe(0);
    expect(arena.traffic()).toEqual({ written: 2 * OBJECT_BYTES + MODEL_BYTES, uploaded: 0 });

    // A second frame of the same shape allocates nothing new — the resident buffers
    // are reused and refilled, which is `uploaded` and not `written`, and frees none.
    arena.resetTraffic();
    view.graph(TWO_PANELS, [CAMERA]);
    expect(freed).toBe(0);
    expect(arena.traffic()).toEqual({ written: 0, uploaded: 2 * OBJECT_BYTES + MODEL_BYTES });

    // A third frame with one fewer object resizes the objects buffer — one free and
    // one fresh first-contents write — while the one-view buffer keeps its shape and
    // is refilled.
    arena.resetTraffic();
    const onePanel: Scene = { entities: [TWO_PANELS.entities[0]!] };
    view.graph(onePanel, [CAMERA]);
    expect(freed).toBe(1);
    expect(arena.traffic()).toEqual({ written: OBJECT_BYTES, uploaded: MODEL_BYTES });
  });
});

describe('sceneView is a producer, not a backend', () => {
  it('imports nothing from submit/ or a gpu/ backend', () => {
    const ROOT = resolve(__dirname, '..');
    const file = resolve(ROOT, 'engine/scene-view.ts');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const specs: string[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specs.push(node.moduleSpecifier.text);
      } else if (node.kind === ts.SyntaxKind.CallExpression) {
        const call = node as ts.CallExpression;
        const arg = call.arguments[0];
        if (call.expression.kind === ts.SyntaxKind.ImportKeyword && arg && ts.isStringLiteral(arg)) specs.push(arg.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    const reaches = (spec: string, dir: string): boolean => {
      if (!spec.startsWith('.')) return false;
      const target = relative(ROOT, resolve(dirname(file), spec.replace(/\.js$/, '')));
      return target === dir || target.startsWith(`${dir}/`);
    };

    const forbidden = specs.filter((spec) => reaches(spec, 'submit') || reaches(spec, 'gpu'));
    expect(forbidden, `sceneView reaches ${forbidden.join(', ')}`).toEqual([]);
  });
});
