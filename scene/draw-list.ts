/**
 * The draw list the engine turns a scene into: the objects a frame draws, in the
 * order they draw, with the ones marked hidden left out. A scene is what exists
 * and a draw list is what is drawn this frame, so the two are kept apart: a scene
 * can carry an anchor that only positions its children without the frame having
 * to know that anchor is not a picture, and the order objects reach the card is a
 * rule stated here rather than whatever order they happen to sit in the scene.
 *
 * It imports only the scene and maths modules beside it, which is D88's rule that
 * nothing shipping in the library reaches the site.
 */

import type { Mat4 } from './maths.js';
import { type Scene, worldMatrix } from './scene.js';

/**
 * One object a frame draws: which entity it is, and where the engine placed it in
 * the world, which is the entity's own transform with every parent's applied over
 * the top, ready to hand the card as a model matrix.
 */
export type Draw = {
  id: string;
  world: Mat4;
};

/**
 * The scene's visible entities, in draw order. A hidden entity is left out while
 * its transform still counts, so a hidden parent positions a visible child rather
 * than taking it out of the world. The order is a lower `order` first, and
 * entities sharing an order draw in the order they were declared in the scene,
 * which is what keeps the rule the scene's own order rather than the sort's tie
 * break. Each draw carries the world matrix `worldMatrix` computes, so a wrong
 * matrix is caught by the same walk that places the single object today.
 */
export function drawList(scene: Scene): Draw[] {
  const drawn = scene.entities.filter((entity) => entity.visible !== false);
  const ordered = drawn.map((entity, declaration) => ({ entity, declaration }));
  ordered.sort((a, b) => {
    const byOrder = (a.entity.order ?? 0) - (b.entity.order ?? 0);
    return byOrder !== 0 ? byOrder : a.declaration - b.declaration;
  });
  return ordered.map(({ entity }) => ({ id: entity.id, world: worldMatrix(scene, entity.id) }));
}
