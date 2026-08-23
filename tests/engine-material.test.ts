import { describe, expect, it } from 'vitest';
import { vec3, mat4, type Material, batchOnePipeline } from '@altpsyche/engine';
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
