/**
 * A material the engine draws an object with: the shader that draws it and the
 * values that one object feeds that shader. That is the whole of a material here,
 * and it is deliberately the whole. There are no permutations and no generated
 * variants, which is the line this repo's shader system is already built on: a
 * material never becomes a different shader, only the same pipeline handed
 * different numbers. So two objects of two materials that name one pipeline are
 * one pipeline drawing two copies, each reading its own values, rather than two
 * pipelines compiled from one source.
 *
 * It imports only the scene and draw-list modules beside it, which is D88's rule
 * that nothing shipping in the library reaches the site.
 */

import type { Scene } from './scene';
import { type Draw, drawList } from './draw-list';

/**
 * A material: the pipeline that draws an object and the values that one object
 * feeds it. The values are the material's own data, whatever a shader reads per
 * object, and they are held apart from the pipeline because the pipeline is
 * shared and the values are not.
 */
export type Material<V = unknown> = {
  pipeline: string;
  values: V;
};

/**
 * One drawn object together with the material values it carries. It extends a
 * draw rather than replacing it, so the world matrix the draw list worked out is
 * still there beside the values the material feeds, which is what a per-object
 * buffer holding both a transform and a colour needs.
 */
export type MaterialDraw<V = unknown> = Draw & { values: V };

/**
 * What one pipeline's worth of a scene comes back as: the pipeline every drawn
 * object shares, and each object's draw carrying its material's values in draw
 * order. It is one pipeline rather than a whole scene, which is why it is not
 * called a frame or a scene: a scene on two pipelines is two of these, and the
 * order they run in is the caller's to decide.
 */
export type Batch<V = unknown> = { pipeline: string; draws: MaterialDraw<V>[] };

/**
 * Turn a scene into one pipeline's batch. The name says the constraint, because a
 * caller reading it decides how to group before calling rather than meeting the
 * rule as a thrown error: grouping draws across pipelines settles which pipeline
 * runs first, and that is a scheduling choice made with knowledge this has none of.
 * A scene on two pipelines is two calls, ordered by whoever made them.
 *
 * Each entity names
 * a material and the table below turns that name into a material, so the values a
 * copy reads are the material's rather than the entity's.
 *
 * A batch is one pipeline drawing several objects that differ only in their
 * values, so every object must name a material that names the same pipeline. An
 * object with no material, one naming a material the table does not carry, and
 * one whose material names a different pipeline than the objects before it are
 * each refused by name, because any of the three is a batch that cannot be drawn
 * as instances of one pipeline. A scene with nothing to draw is refused too,
 * since a batch has no pipeline to name without an object.
 */
export function batchOnePipeline<V>(scene: Scene, materials: Record<string, Material<V>>): Batch<V> {
  const entities = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const draws = drawList(scene);
  let pipeline: string | undefined;
  const withValues = draws.map((draw): MaterialDraw<V> => {
    const name = entities.get(draw.id)?.material;
    if (name === undefined) throw new Error(`the object "${draw.id}" has no material`);
    const material = materials[name];
    if (!material) {
      throw new Error(`the object "${draw.id}" names a material "${name}" the batch does not carry`);
    }
    if (pipeline === undefined) pipeline = material.pipeline;
    else if (pipeline !== material.pipeline) {
      throw new Error(
        `a batch draws one pipeline, but "${draw.id}" names "${material.pipeline}" where an earlier object named "${pipeline}"`
      );
    }
    return { ...draw, values: material.values };
  });
  if (pipeline === undefined) throw new Error('a batch has no object to draw');
  return { pipeline, draws: withValues };
}
