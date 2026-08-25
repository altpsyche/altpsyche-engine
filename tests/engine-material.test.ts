import { describe, expect, it } from 'vitest';
import { vec3, mat4, type Material, batchOnePipeline, batchScene } from '@altpsyche/engine';
import { type Scene, worldMatrix } from '@altpsyche/engine';

/**
 * A material is the pipeline that draws an object and the values that one object
 * feeds it, and a batch is one pipeline drawing several objects that differ only
 * in those values. What these hold is that the batch is one pipeline rather than
 * one per object, that each object's values are its material's, and that a batch
 * that could not be drawn as instances of one pipeline is refused by name rather
 * than drawn wrong.
 */

type Tint = { tint: [number, number, number] };

const at = (position: [number, number, number]) => ({
  position: vec3(...position),
  rotation: mat4.IDENTITY,
  scale: vec3(1, 1, 1),
});

const materials: Record<string, Material<Tint>> = {
  warm: { pipeline: 'surface', values: { tint: [0.9, 0.4, 0.3] } },
  cool: { pipeline: 'surface', values: { tint: [0.3, 0.5, 0.9] } },
};

describe('a batch is one pipeline drawing objects with their materials values', () => {
  it('shares one pipeline across two objects that name different materials', () => {
    const scene: Scene = {
      entities: [
        { id: 'a', material: 'warm', transform: at([-1, 0, 0]) },
        { id: 'b', material: 'cool', transform: at([1, 0, 0]) },
      ],
    };
    const result = batchOnePipeline(scene, materials);
    expect(result.pipeline).toBe('surface');
    expect(result.draws.map((d) => d.id)).toEqual(['a', 'b']);
    // The two objects differ in their values rather than in their pipeline, which
    // is the whole point of a material.
    expect(result.draws[0]?.values.tint).toEqual([0.9, 0.4, 0.3]);
    expect(result.draws[1]?.values.tint).toEqual([0.3, 0.5, 0.9]);
  });

  it('carries each object world matrix beside its values, in draw order', () => {
    const scene: Scene = {
      entities: [{ id: 'solo', material: 'warm', transform: at([2, 3, 4]) }],
    };
    const [draw] = batchOnePipeline(scene, materials).draws;
    const where = mat4.transformPoint(draw!.world, vec3(0, 0, 0));
    expect([where.x, where.y, where.z]).toEqual([2, 3, 4]);
    expect(draw!.world).toEqual(worldMatrix(scene, 'solo'));
  });

  it('leaves a hidden anchor out while it still places its child', () => {
    const scene: Scene = {
      entities: [
        { id: 'anchor', visible: false, transform: at([10, 0, 0]) },
        { id: 'child', parent: 'anchor', material: 'warm', transform: at([0, 0, 0]) },
      ],
    };
    const result = batchOnePipeline(scene, materials);
    expect(result.draws.map((d) => d.id)).toEqual(['child']);
    const where = mat4.transformPoint(result.draws[0]!.world, vec3(0, 0, 0));
    expect(where.x).toBe(10);
  });

  it('respects the draw order a lower order draws first', () => {
    const scene: Scene = {
      entities: [
        { id: 'back', order: 2, material: 'warm', transform: at([0, 0, 0]) },
        { id: 'front', order: 1, material: 'cool', transform: at([0, 0, 0]) },
      ],
    };
    expect(batchOnePipeline(scene, materials).draws.map((d) => d.id)).toEqual(['front', 'back']);
  });

  it('refuses a drawn object with no material', () => {
    const scene: Scene = { entities: [{ id: 'bare', transform: at([0, 0, 0]) }] };
    expect(() => batchOnePipeline(scene, materials)).toThrow(/"bare" has no material/);
  });

  it('refuses an object naming a material the batch does not carry', () => {
    const scene: Scene = { entities: [{ id: 'x', material: 'gone', transform: at([0, 0, 0]) }] };
    expect(() => batchOnePipeline(scene, materials)).toThrow(/names a material "gone"/);
  });

  it('refuses objects whose materials name different pipelines', () => {
    const twoPipelines: Record<string, Material<Tint>> = {
      warm: { pipeline: 'surface', values: { tint: [1, 0, 0] } },
      other: { pipeline: 'glow', values: { tint: [0, 0, 1] } },
    };
    const scene: Scene = {
      entities: [
        { id: 'a', material: 'warm', transform: at([0, 0, 0]) },
        { id: 'b', material: 'other', transform: at([0, 0, 0]) },
      ],
    };
    expect(() => batchOnePipeline(scene, twoPipelines)).toThrow(/one pipeline, but "b" names "glow"/);
  });

  it('refuses a scene with nothing to draw', () => {
    const scene: Scene = {
      entities: [{ id: 'anchor', visible: false, transform: at([0, 0, 0]) }],
    };
    expect(() => batchOnePipeline(scene, materials)).toThrow(/no object to draw/);
  });

  it('does not care what a rotation is, only that objects differ by their values', () => {
    const scene: Scene = {
      entities: [
        { id: 'a', material: 'warm', transform: { ...at([0, 0, 0]), rotation: mat4.rotationY(0.5) } },
        { id: 'b', material: 'warm', transform: at([1, 0, 0]) },
      ],
    };
    const result = batchOnePipeline(scene, materials);
    // Two objects of the same material are one pipeline with the same values: a
    // material is shared, not copied per object.
    expect(result.draws[0]?.values).toBe(result.draws[1]?.values);
  });
});

/**
 * `batchScene` is `batchOnePipeline` with its one restriction lifted (item 33): a
 * scene spanning two pipelines is one batch per pipeline rather than a thrown error,
 * so a producer can draw a scene on two programs in one graph. The two authoring
 * refusals stand; the one-pipeline refusal does not.
 */
describe('batchScene groups a scene into one batch per pipeline', () => {
  const twoPipelines: Record<string, Material<Tint>> = {
    warm: { pipeline: 'surface', values: { tint: [1, 0, 0] } },
    glow: { pipeline: 'glow', values: { tint: [0, 0, 1] } },
  };

  it('splits objects on two pipelines into two batches, each in draw order', () => {
    const scene: Scene = {
      entities: [
        { id: 'a', material: 'warm', order: 0, transform: at([0, 0, 0]) },
        { id: 'g1', material: 'glow', order: 1, transform: at([1, 0, 0]) },
        { id: 'b', material: 'warm', order: 2, transform: at([2, 0, 0]) },
        { id: 'g2', material: 'glow', order: 3, transform: at([3, 0, 0]) },
      ],
    };
    const batches = batchScene(scene, twoPipelines);
    // One batch per pipeline, in the order each is first drawn (draw order),
    // 'surface' first because 'a' at order 0 leads.
    expect(batches.map((b) => b.pipeline)).toEqual(['surface', 'glow']);
    expect(batches[0]!.draws.map((d) => d.id)).toEqual(['a', 'b']);
    expect(batches[1]!.draws.map((d) => d.id)).toEqual(['g1', 'g2']);
  });

  it('is one batch for a single-pipeline scene, agreeing with batchOnePipeline', () => {
    const scene: Scene = {
      entities: [
        { id: 'a', material: 'warm', transform: at([-1, 0, 0]) },
        { id: 'b', material: 'cool', transform: at([1, 0, 0]) },
      ],
    };
    const batches = batchScene(scene, materials);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(batchOnePipeline(scene, materials));
  });

  it('keeps the two authoring refusals but not the one-pipeline refusal', () => {
    const bare: Scene = { entities: [{ id: 'x', transform: at([0, 0, 0]) }] };
    expect(() => batchScene(bare, twoPipelines)).toThrow(/"x" has no material/);
    const gone: Scene = { entities: [{ id: 'x', material: 'gone', transform: at([0, 0, 0]) }] };
    expect(() => batchScene(gone, twoPipelines)).toThrow(/names a material "gone"/);
    // Where batchOnePipeline throws on a second pipeline, batchScene does not.
    const spanning: Scene = {
      entities: [
        { id: 'a', material: 'warm', transform: at([0, 0, 0]) },
        { id: 'g', material: 'glow', transform: at([1, 0, 0]) },
      ],
    };
    expect(() => batchScene(spanning, twoPipelines)).not.toThrow();
  });

  it('is an empty list for a scene with nothing to draw, not a throw', () => {
    const scene: Scene = { entities: [{ id: 'anchor', visible: false, transform: at([0, 0, 0]) }] };
    expect(batchScene(scene, twoPipelines)).toEqual([]);
  });
});
