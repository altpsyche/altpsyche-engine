import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { Arena } from '../resource/arena';
import { buffer, moduleHandle, pipelineHandle, texture } from '../graph/handles.js';
import {
  type Camera,
  cost,
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

const SCENE_WGSL = '// authored once, fed by the producer';

// A pipeline carries no name now (item 87); the string a material selects it by
// lives on its `ScenePipeline.name` below. It carries its own source (item 99) and
// binds resources by handle: the shared views buffer sits at index 0 (no caller
// `resources`), this pipeline's own objects buffer at index 1.
const PIPELINE: RenderPipelineSpec = {
  kind: 'render',
  source: {
    vertex: { document: 'scene', text: SCENE_WGSL, entry: 'project' },
    fragment: { document: 'scene', text: SCENE_WGSL, entry: 'shade' },
  },
  bindings: [
    { group: 0, binding: 0, resource: buffer(1), visibility: ['vertex'] },
    { group: 0, binding: 1, resource: buffer(0), visibility: ['vertex'] },
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
  authored: 'wgsl',
  pipelines: [{ name: 'surface', pipeline: PIPELINE, objects: { buffer: 'objects', pack: packPanel } }],
  materials: MATERIALS,
  views: { buffer: 'views' },
};

// A second pipeline, to prove a scene spanning two pipelines is one graph rather
// than a thrown error (item 33). It draws the same per-object struct through a
// different program, reading its own objects buffer.
// glowObjects lands after the surface objects buffer when both draw, so it is
// resource 2; views stays at 0.
const GLOW: RenderPipelineSpec = {
  kind: 'render',
  source: {
    vertex: { document: 'scene', text: SCENE_WGSL, entry: 'project' },
    fragment: { document: 'scene', text: SCENE_WGSL, entry: 'bloom' },
  },
  bindings: [
    { group: 0, binding: 0, resource: buffer(2), visibility: ['vertex'] },
    { group: 0, binding: 1, resource: buffer(0), visibility: ['vertex'] },
  ],
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
    expect(frame.authored).toBe('wgsl');
    expect(frame.modules).toEqual([]);
    expect(frame.pipelines).toEqual([PIPELINE]);
    expect(frame.passes).toHaveLength(1);

    const pass = frame.passes[0]!;
    expect(isRenderPass(pass)).toBe(true);
    if (!isRenderPass(pass)) return;
    expect(pass.pipeline).toBe(pipelineHandle(0));
    // Two objects, one instanced draw, count reads off the batch not written twice.
    expect(pass.draws).toEqual([{ instances: 2 }]);
  });

  it('bakes each object its world matrix and its material colour, in draw order', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    const frame = view.graph(TWO_PANELS, [CAMERA]);

    // views is resource 0, this pipeline's objects buffer resource 1.
    const objects = frame.resources[1];
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
    const oneViews = one.resources[0]; // the shared views buffer sits first
    expect(oneViews?.kind === 'buffer' && oneViews.bytes).toBe(MODEL_BYTES);
    if (oneViews?.kind === 'buffer') {
      expect(floatsOf(oneViews.data!)).toEqual(Array.from(mat4.pack(viewProjection(CAMERA))));
    }

    // `views: Camera[]` is the whole point of the signature: a second camera lands
    // a second matrix after the first, so a stereo consumer never reshapes the call.
    const second: Camera = { ...CAMERA, eye: vec3(0.1, 0, 0) };
    const two = view.graph(TWO_PANELS, [CAMERA, second]);
    const twoViews = two.resources[0];
    expect(twoViews?.kind === 'buffer' && twoViews.bytes).toBe(2 * MODEL_BYTES);
    if (twoViews?.kind === 'buffer') {
      expect(floatsOf(twoViews.data!.subarray(0, MODEL_BYTES))).toEqual(Array.from(mat4.pack(viewProjection(CAMERA))));
      expect(floatsOf(twoViews.data!.subarray(MODEL_BYTES))).toEqual(Array.from(mat4.pack(viewProjection(second))));
    }
  });

  it('carries the caller resources and the present target onto the frame', () => {
    const withExtras = sceneView(new Arena<Uint8Array>(() => undefined as never), {
      ...OPTIONS,
      resources: [{ kind: 'uniform' }],
      requires: ['depth-clamp'],
      present: texture(3),
    });
    const frame = withExtras.graph(TWO_PANELS, [CAMERA]);
    // The caller resource leads the layout, so the uniform block is resource 0.
    expect(frame.resources[0]?.kind).toBe('uniform');
    expect(frame.requires).toEqual(['depth-clamp']);
    expect(frame.present).toBe(texture(3));
  });

  it('refuses a graph with no view to draw from, by name', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    expect(() => view.graph(TWO_PANELS, [])).toThrow(/"panels" needs at least one view/);
  });

  it('lets the batch refuse a scene with an object that has no material, by name', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), OPTIONS);
    const bare: Scene = {
      entities: [{ id: 'x', transform: { position: vec3(0, 0, -1), rotation: mat4.rotationX(0), scale: vec3(1, 1, 1) } }],
    };
    expect(() => view.graph(bare, [CAMERA])).toThrow(/"x" has no material/);
  });
});

describe('sceneView spans two pipelines in one graph, the producer deciding order (item 33)', () => {
  // warm/cool draw through 'surface', bright through 'glow' — a scene on two
  // pipelines, which item 32 refused and item 33 makes one graph.
  const MATERIALS_TWO: Record<string, Material<Panel>> = {
    ...MATERIALS,
    bright: { pipeline: 'glow', values: { tint: [1, 1, 0.6] } },
  };
  const SPANNING: Scene = {
    entities: [
      { id: 'lit', material: 'warm', order: 1, transform: { position: vec3(-0.5, 0, -3), rotation: mat4.rotationX(0), scale: vec3(0.6, 0.6, 0.6) } },
      { id: 'glowA', material: 'bright', order: 0, transform: { position: vec3(0.5, 0, -3), rotation: mat4.rotationX(0), scale: vec3(0.6, 0.6, 0.6) } },
      { id: 'glowB', material: 'bright', order: 2, transform: { position: vec3(0, 0.5, -3), rotation: mat4.rotationX(0), scale: vec3(0.4, 0.4, 0.4) } },
    ],
  };

  const nameOf = (pipeline: RenderPipelineSpec): string => (pipeline === GLOW ? 'glow' : 'surface');
  const optionsFor = (order: RenderPipelineSpec[]): SceneViewOptions<Panel> => ({
    id: 'spanning',
    authored: 'wgsl',
    pipelines: order.map((pipeline) => ({
      name: nameOf(pipeline),
      pipeline,
      objects: { buffer: nameOf(pipeline) === 'glow' ? 'glowObjects' : 'objects', pack: packPanel },
    })),
    materials: MATERIALS_TWO,
    views: { buffer: 'views' },
  });

  it('produces one graph of two instanced passes, one per pipeline, not a throw', () => {
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), optionsFor([PIPELINE, GLOW]));
    const frame = view.graph(SPANNING, [CAMERA]);

    // One frame, both pipelines, one pass each — a scene spanning two pipelines is
    // one graph (item 33's Done-when), the passes in the producer's listed order.
    expect(frame.pipelines).toEqual([PIPELINE, GLOW]);
    expect(frame.passes).toHaveLength(2);
    // A pass names its pipeline by the handle of its slot in `pipelines`, so the two
    // passes name pipelines 0 and 1; the ordering itself is asserted on `pipelines`.
    expect(frame.passes.map((pass) => (isRenderPass(pass) ? pass.pipeline : undefined))).toEqual([
      pipelineHandle(0),
      pipelineHandle(1),
    ]);
    // The surface pass draws its one lit object; the glow pass its two, each group
    // one instanced draw counting only its own objects.
    expect(frame.passes.map((pass) => (isRenderPass(pass) ? pass.draws : undefined))).toEqual([
      [{ instances: 1 }],
      [{ instances: 2 }],
    ]);
    // Each pipeline reads its own objects buffer, sized to its own object count:
    // views 0, the surface objects 1, the glow objects 2.
    const surfaceObjects = frame.resources[1];
    const glowObjects = frame.resources[2];
    expect(surfaceObjects?.kind === 'buffer' && surfaceObjects.bytes).toBe(OBJECT_BYTES);
    expect(glowObjects?.kind === 'buffer' && glowObjects.bytes).toBe(2 * OBJECT_BYTES);
  });

  it('runs the passes in the order the producer lists the pipelines, not the scene order', () => {
    // Same scene, pipelines listed glow-first: the pass order flips, so ordering is
    // the producer's to decide rather than baked into the scene or the batch.
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), optionsFor([GLOW, PIPELINE]));
    const frame = view.graph(SPANNING, [CAMERA]);
    // The pipeline order flips with the list order; the passes still name their
    // slots 0 and 1, so the flip is read off `pipelines` rather than the handles.
    expect(frame.pipelines).toEqual([GLOW, PIPELINE]);
    expect(frame.passes.map((pass) => (isRenderPass(pass) ? pass.pipeline : undefined))).toEqual([
      pipelineHandle(0),
      pipelineHandle(1),
    ]);
  });

  it('emits no pass for a listed pipeline no object draws through this frame', () => {
    // The glow pipeline is listed but this frame's scene draws only 'surface'
    // objects, so only the surface pass is emitted — a producer may list pipelines a
    // given frame does not use.
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), optionsFor([PIPELINE, GLOW]));
    const frame = view.graph(TWO_PANELS, [CAMERA]);
    expect(frame.pipelines).toEqual([PIPELINE]);
    expect(frame.passes.map((pass) => (isRenderPass(pass) ? pass.pipeline : undefined))).toEqual([pipelineHandle(0)]);
    // Only the surface pipeline draws, so only its two buffers exist — views and the
    // surface objects — and no glow objects buffer is laid out.
    expect(frame.resources).toHaveLength(2);
  });

  it('refuses a material that names a pipeline the producer did not list, by name', () => {
    // 'glow' is drawn by 'bright' but only 'surface' is listed: a drawn pipeline
    // with no pass to run in is refused, naming the pipeline.
    const view = sceneView(new Arena<Uint8Array>(() => undefined as never), optionsFor([PIPELINE]));
    expect(() => view.graph(SPANNING, [CAMERA])).toThrow(/draws a pipeline "glow" it was not given/);
  });

  it('refuses two pipeline groups that name one objects buffer, at construction, by name', () => {
    // Two groups sharing a buffer name would have the second group's records clobber
    // the first's within a frame — a silent wrong picture, refused where the options
    // are fixed rather than left to draw wrong.
    expect(() =>
      sceneView(new Arena<Uint8Array>(() => undefined as never), {
        id: 'clash',
        authored: 'wgsl',
        pipelines: [
          { name: 'surface', pipeline: PIPELINE, objects: { buffer: 'shared', pack: packPanel } },
          { name: 'glow', pipeline: GLOW, objects: { buffer: 'shared', pack: packPanel } },
        ],
        materials: MATERIALS_TWO,
        views: { buffer: 'views' },
      })
    ).toThrow(/names the buffer "shared" twice/);
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

describe('sceneView declares a shared depth attachment so solids order by depth, not draw order (item 65)', () => {
  // Two pipelines, one per object, each depth-testing: a `less` compare that writes
  // the depth it passes. Each reads its own objects buffer, both share the views
  // buffer, and both test into the one depth attachment sceneView declares.
  // views 0, nearObjects 1, farObjects 2 when both draw (near listed first).
  const NEAR: RenderPipelineSpec = {
    kind: 'render',
    source: {
      vertex: { document: 'scene', text: SCENE_WGSL, entry: 'project' },
      fragment: { document: 'scene', text: SCENE_WGSL, entry: 'shade' },
    },
    bindings: [
      { group: 0, binding: 0, resource: buffer(1), visibility: ['vertex'] },
      { group: 0, binding: 1, resource: buffer(0), visibility: ['vertex'] },
    ],
    depth: { format: 'depth24plus', compare: 'less', write: true },
  };
  const FAR: RenderPipelineSpec = {
    ...NEAR,
    bindings: [
      { group: 0, binding: 0, resource: buffer(2), visibility: ['vertex'] },
      { group: 0, binding: 1, resource: buffer(0), visibility: ['vertex'] },
    ],
  };
  const SOLIDS: Record<string, Material<Panel>> = {
    front: { pipeline: 'near', values: { tint: [1, 0, 0] } },
    back: { pipeline: 'far', values: { tint: [0, 0, 1] } },
  };
  // 'front' sits nearer the camera (a smaller distance along -z) than 'back', so a
  // correct picture shows the red front over the blue back from this camera whatever
  // order the two pipelines' passes run in.
  const SOLIDS_SCENE: Scene = {
    entities: [
      { id: 'front', material: 'front', transform: { position: vec3(0, 0, -2), rotation: mat4.rotationX(0), scale: vec3(0.8, 0.8, 0.8) } },
      { id: 'back', material: 'back', transform: { position: vec3(0, 0, -4), rotation: mat4.rotationX(0), scale: vec3(0.8, 0.8, 0.8) } },
    ],
  };
  // Removing the depth means removing it in both places at once — the shared
  // attachment and each pipeline's compare/write — or the graph is one `plan.ts`
  // refuses (a pipeline testing depth with no attachment to keep it in). So the
  // flat case strips `depth` off the pipelines too, leaving a valid draw-order graph.
  const flatten = (pipeline: RenderPipelineSpec): RenderPipelineSpec => {
    const { depth: _dropped, ...rest } = pipeline;
    return rest;
  };
  const nameOf = (pipeline: RenderPipelineSpec): string => (pipeline === NEAR ? 'near' : 'far');
  const optionsFor = (order: RenderPipelineSpec[], withDepth: boolean): SceneViewOptions<Panel> => ({
    id: 'solids',
    authored: 'wgsl',
    pipelines: order.map((pipeline) => ({
      name: nameOf(pipeline),
      pipeline: withDepth ? pipeline : flatten(pipeline),
      objects: { buffer: nameOf(pipeline) === 'near' ? 'nearObjects' : 'farObjects', pack: packPanel },
    })),
    materials: SOLIDS,
    views: { buffer: 'views' },
    ...(withDepth ? { depth: { texture: 'depth', format: 'depth24plus' as const } } : {}),
  });

  const build = (order: RenderPipelineSpec[], withDepth: boolean) =>
    sceneView(new Arena<Uint8Array>(() => undefined as never), optionsFor(order, withDepth)).graph(SOLIDS_SCENE, [CAMERA]);

  it('emits one frame-sized depth attachment the passes share, cleared once and loaded after', () => {
    // Listed near-first, so painter order alone would draw the far object last and
    // over the near one — the case depth exists to fix.
    const frame = build([NEAR, FAR], true);

    // views 0, nearObjects 1, farObjects 2, the shared depth target 3.
    const depth = frame.resources[3];
    expect(depth?.kind).toBe('texture');
    if (depth?.kind !== 'texture') return;
    expect(depth.size).toEqual({ scale: 1 });
    expect(depth.format).toBe('depth24plus');
    expect(depth.use).toEqual(['attachment']);
    // A transient: no first contents of its own, so item 1 discards the store no
    // pass reads and `cost()` counts its bytes as transient.
    expect(depth.source).toBeUndefined();
    expect(depth.data).toBeUndefined();

    // Every pass names the one shared attachment; the first clears it, every later
    // pass loads it (names no clear) so each surface tests against what came before.
    const depths = frame.passes.map((pass) => (isRenderPass(pass) ? pass.depth : undefined));
    expect(depths).toEqual([{ resource: texture(3), clear: 1 }, { resource: texture(3) }]);
  });

  it('carries a depth compare and write on each emitted pipeline', () => {
    const frame = build([NEAR, FAR], true);
    for (const spec of frame.pipelines) {
      expect(spec.kind === 'render' && spec.depth).toEqual({ format: 'depth24plus', compare: 'less', write: true });
    }
  });

  it('emits the same depth-tested graph whatever order the objects sit in — the test resolves order, not the graph', () => {
    // Near-first and far-first list the passes in opposite orders; with depth, both
    // emit the shared attachment and both test into it, so the picture is the depth's
    // to decide rather than the pass order's. The only difference is which pass runs
    // first, and depth makes that not decide the picture.
    const nearFirst = build([NEAR, FAR], true);
    const farFirst = build([FAR, NEAR], true);
    for (const frame of [nearFirst, farFirst]) {
      // The shared depth target sits at resource 3 in both orders.
      expect(frame.resources[3]?.kind).toBe('texture');
      const depths = frame.passes.map((pass) => (isRenderPass(pass) ? pass.depth : undefined));
      expect(depths).toEqual([expect.objectContaining({ resource: texture(3), clear: 1 }), { resource: texture(3) }]);
    }
    // The pipeline order does flip with the list order — depth is what makes that
    // flip stop mattering to the picture.
    expect(nearFirst.pipelines).toEqual([NEAR, FAR]);
    expect(farFirst.pipelines).toEqual([FAR, NEAR]);
  });

  it("counts the depth's one load and one store in cost(), against a scene with the depth removed", () => {
    const size = { width: 800, height: 600 };
    const withDepth = cost(build([NEAR, FAR], true), size);
    // The shared depth: the first pass clears it (no load) but its depth is stored
    // for the second pass to test against, and the second pass loads it (no clear)
    // and discards it, nothing reading it after — one depth load and one depth store.
    // The two colour stores are the frame target each pass presents into.
    expect(withDepth.attachmentLoads).toBe(1);
    expect(withDepth.attachmentStores).toBe(3);
    // Its transient bytes are the frame-sized depth24plus target, four bytes a pixel.
    expect(withDepth.transientBytes).toBe(4 * 800 * 600);

    // With the depth removed the graph carries no depth attachment and its passes
    // name none, so the near-over-far ordering falls back to draw order — the
    // regression this attachment exists to prevent. The depth load and the depth
    // store both vanish from the cost, and the frame declares no transient.
    const flat = build([NEAR, FAR], false);
    // No depth option means no depth attachment — the frame carries only buffers.
    expect(flat.resources.some((r) => r.kind === 'texture')).toBe(false);
    expect(flat.passes.every((pass) => isRenderPass(pass) && pass.depth === undefined)).toBe(true);
    const noDepth = cost(flat, size);
    expect(noDepth.attachmentLoads).toBe(0);
    expect(noDepth.attachmentStores).toBe(2);
    expect(noDepth.transientBytes).toBe(0);
  });

  it('refuses a depth target that shares a name with a scene buffer, at construction, by name', () => {
    expect(() =>
      sceneView(new Arena<Uint8Array>(() => undefined as never), optionsFor([NEAR, FAR], false)).graph(SOLIDS_SCENE, [CAMERA])
    ).not.toThrow();
    expect(() =>
      sceneView(new Arena<Uint8Array>(() => undefined as never), {
        ...optionsFor([NEAR, FAR], true),
        depth: { texture: 'views', format: 'depth24plus' },
      })
    ).toThrow(/names the buffer "views" twice/);
  });
});

describe('sceneView is a producer, not a backend', () => {
  it('imports nothing from submit/ or a gpu/ backend', () => {
    const ROOT = resolve(__dirname, '..');
    const file = resolve(ROOT, 'scene/scene-view.ts');
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
