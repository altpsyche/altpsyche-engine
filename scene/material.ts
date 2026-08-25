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

import type { Scene } from './scene.js';
import { type Draw, drawList } from './draw-list.js';

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

// The material a drawn object carries, resolved from the entity that made the
// draw. An object with no material and one naming a material the table does not
// carry are each refused by name — the two refusals `batchOnePipeline` and
// `batchScene` share, kept in one place so a scene tells an author the same thing
// either way it is grouped.
function withMaterial<V>(
  entities: Map<string, { material?: string }>,
  materials: Record<string, Material<V>>,
  draw: Draw
): MaterialDraw<V> {
  const name = entities.get(draw.id)?.material;
  if (name === undefined) throw new Error(`the object "${draw.id}" has no material`);
  const material = materials[name];
  if (!material) {
    throw new Error(`the object "${draw.id}" names a material "${name}" the batch does not carry`);
  }
  return { ...draw, values: material.values };
}

/**
 * Turn a scene into one pipeline's batch. The name says the constraint: this is
 * the single-pipeline case, one pipeline drawing several objects that differ only
 * in their values, and it is the building block `batchScene` groups a many-pipeline
 * scene out of.
 *
 * Each entity names a material and the table below turns that name into a material,
 * so the values a copy reads are the material's rather than the entity's.
 *
 * Every object must name a material that names the same pipeline. An object with no
 * material, one naming a material the table does not carry, and one whose material
 * names a different pipeline than the objects before it are each refused by name,
 * because any of the three is a batch that cannot be drawn as instances of one
 * pipeline. A scene with nothing to draw is refused too, since a batch has no
 * pipeline to name without an object. A scene that genuinely spans two pipelines is
 * `batchScene`'s to group (item 33), where the second pipeline is a further batch
 * rather than this thrown error.
 */
export function batchOnePipeline<V>(scene: Scene, materials: Record<string, Material<V>>): Batch<V> {
  const entities = new Map(scene.entities.map((entity) => [entity.id, entity]));
  let pipeline: string | undefined;
  const withValues = drawList(scene).map((draw): MaterialDraw<V> => {
    const withValues = withMaterial(entities, materials, draw);
    const named = materials[entities.get(draw.id)!.material!]!.pipeline;
    if (pipeline === undefined) pipeline = named;
    else if (pipeline !== named) {
      throw new Error(
        `a batch draws one pipeline, but "${draw.id}" names "${named}" where an earlier object named "${pipeline}"`
      );
    }
    return withValues;
  });
  if (pipeline === undefined) throw new Error('a batch has no object to draw');
  return { pipeline, draws: withValues };
}

/**
 * Turn a scene into one batch per pipeline: `batchOnePipeline` with its one
 * restriction lifted (item 33). The reason for that restriction — a batch carried
 * no per-draw data, so two pipelines could not be told apart within one instanced
 * draw — is gone now that each object reads its own record out of a storage buffer
 * (item 27), so a scene spanning two pipelines is two instanced draws in one graph
 * rather than a thrown error.
 *
 * The batches come back in the order each pipeline is first drawn — the scene's own
 * `order` field, which is the producer's — so which pipeline's pass runs first is
 * decided by whoever built the scene rather than by a rule buried here. Each batch
 * keeps its objects in draw order.
 *
 * The two authoring refusals stand, shared with `batchOnePipeline`: an object with
 * no material and one naming a material the table does not carry are each refused by
 * name. What does *not* stand is the one-pipeline refusal — a second pipeline is a
 * further batch. A scene with nothing to draw comes back as an empty list rather
 * than a throw, because "no pipeline to name" is only an error where exactly one is
 * wanted, and the caller that wants exactly one is `batchOnePipeline`.
 */
export function batchScene<V>(scene: Scene, materials: Record<string, Material<V>>): Batch<V>[] {
  const entities = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const byPipeline = new Map<string, MaterialDraw<V>[]>();
  for (const draw of drawList(scene)) {
    const withValues = withMaterial(entities, materials, draw);
    const pipeline = materials[entities.get(draw.id)!.material!]!.pipeline;
    const group = byPipeline.get(pipeline);
    if (group) group.push(withValues);
    else byPipeline.set(pipeline, [withValues]);
  }
  return Array.from(byPipeline, ([pipeline, draws]) => ({ pipeline, draws }));
}
