import { describe, expect, it } from 'vitest';
import { vec3, mat4 } from '@altpsyche/engine';
import type { Entity, Scene, Transform } from '@altpsyche/engine';
import { worldMatrix } from '@altpsyche/engine';
import { drawList } from '@altpsyche/engine';

/**
 * The draw list is what turns a scene, which is everything that exists, into the
 * ordered set of objects a frame draws. What it has to get right is which objects
 * are in the picture and in what order, so it is held to both: the count against
 * what is visible, and the order against the rule the module states.
 */

const at = (x: number, y: number, z: number): Transform => ({
  position: vec3(x, y, z),
  rotation: mat4.IDENTITY,
  scale: vec3(1, 1, 1),
});

const entity = (id: string, rest: Partial<Entity> = {}): Entity => ({ id, transform: at(0, 0, 0), ...rest });

describe('the draw list turns a scene into ordered draws', () => {
  it('draws every entity that is not hidden, and only those', () => {
    const scene: Scene = {
      entities: [entity('a'), entity('anchor', { visible: false }), entity('b'), entity('c', { visible: false })],
    };
    const drawn = drawList(scene);
    expect(drawn.map((d) => d.id)).toEqual(['a', 'b']);
    expect(drawn).toHaveLength(scene.entities.filter((e) => e.visible !== false).length);
  });

  it('draws every entity when none is hidden', () => {
    const scene: Scene = { entities: [entity('a'), entity('b'), entity('c')] };
    expect(drawList(scene).map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders by a lower order first', () => {
    const scene: Scene = {
      entities: [entity('mid', { order: 1 }), entity('back', { order: -1 }), entity('front', { order: 5 })],
    };
    expect(drawList(scene).map((d) => d.id)).toEqual(['back', 'mid', 'front']);
  });

  it('breaks a tie by the order the scene declares them', () => {
    // Two at the same order and one omitting it, which reads as 0, so all three
    // share a rank and the scene's own order is the whole tiebreak.
    const scene: Scene = {
      entities: [entity('first', { order: 0 }), entity('second'), entity('third', { order: 0 })],
    };
    expect(drawList(scene).map((d) => d.id)).toEqual(['first', 'second', 'third']);
  });

  it("carries each draw's world matrix, which is what the frame hands the card", () => {
    const scene: Scene = { entities: [entity('solo', { transform: at(2, 3, 4) })] };
    const [draw] = drawList(scene);
    expect(draw?.world).toEqual(worldMatrix(scene, 'solo'));
    expect(mat4.transformPoint(draw!.world, vec3(0, 0, 0))).toEqual(vec3(2, 3, 4));
  });

  it('leaves a hidden parent out of the picture while its transform still places its child', () => {
    // The anchor is hidden, so it is not drawn, but the panel hangs off it and
    // inherits its position: hiding a thing takes it out of the picture, not out
    // of the world.
    const scene: Scene = {
      entities: [entity('anchor', { visible: false, transform: at(10, 0, 0) }), entity('panel', { parent: 'anchor' })],
    };
    const drawn = drawList(scene);
    expect(drawn.map((d) => d.id)).toEqual(['panel']);
    expect(mat4.transformPoint(drawn[0]!.world, vec3(0, 0, 0))).toEqual(vec3(10, 0, 0));
  });
});
