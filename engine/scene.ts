/**
 * The scene model the engine turns into a frame. A scene is a flat list of
 * entities, each carrying where it sits and, if it has one, the entity it hangs
 * off. There is no class and no hidden state: a scene is data and the functions
 * here read it, which is what lets an episode open a scene as a plain object and
 * lets the whole engine be lifted into a library later.
 *
 * A parent moves its children. An entity's place in the world is its own local
 * transform with every ancestor's transform applied over the top, so parenting a
 * hand to an arm and the arm to a body means moving the body moves all three.
 *
 * It imports nothing from the site, only the maths module beside it.
 */

import { type Mat4, type Vec3, mat4 } from './maths.js';

/**
 * Where an entity sits, how it is turned, and how big it is, all relative to its
 * parent. The rotation is a matrix rather than three angles so the order the
 * angles turn in stays the caller's choice: build it from the maths module's
 * `rotationX`, `rotationY` and `rotationZ` and `multiply` them in whatever order
 * the scene wants, and no order is baked in here.
 */
export type Transform = {
  position: Vec3;
  rotation: Mat4;
  scale: Vec3;
};

/**
 * A thing in the scene. The id is how a child names its parent and how a caller
 * asks for a world matrix. A root entity has no parent, so the field is left off
 * rather than set to a placeholder.
 *
 * `visible` and `order` describe whether the thing is drawn and when, which the
 * draw list reads. Both are left off for the common case: an entity is drawn
 * unless it says `visible: false`, which is how a pure transform node such as an
 * anchor that only positions its children stays out of the picture; and it draws
 * at order 0 unless it says otherwise, a lower order reaching the card first.
 * They sit here rather than on the transform because they are facts about the
 * object rather than about where it sits.
 *
 * `material` names which material draws the object, read by the batch that turns
 * a scene into one pipeline drawing several objects. It is left off for an entity
 * that only positions its children, since a hidden anchor is never drawn and so
 * never needs one, and it is a name into a table the caller holds rather than the
 * material itself so a scene stays plain data.
 */
export type Entity = {
  id: string;
  transform: Transform;
  parent?: string;
  visible?: boolean;
  order?: number;
  material?: string;
};

export type Scene = {
  entities: readonly Entity[];
};

/**
 * The camera that watches the scene. `eye`, `target` and `up` place it and aim
 * it the way `lookAt` reads them, and the four numbers below shape the lens the
 * way `perspective` reads them, `fovY` in radians and `aspect` as width over
 * height.
 */
export type Camera = {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  fovY: number;
  aspect: number;
  near: number;
  far: number;
};

// The single matrix an entity's own transform makes, before any parent is
// applied. Scale first, then rotate, then move: `mat4.multiply(a, b)` applies `b`
// before `a`, so translation is outermost and scaling innermost.
export function localMatrix(t: Transform): Mat4 {
  return mat4.multiply(mat4.translation(t.position), mat4.multiply(t.rotation, mat4.scaling(t.scale)));
}

// The entity's place in the world, its own local transform with every ancestor's
// applied over it. An unknown id, a parent that names no entity, and a cycle
// through the parents are each refused by name rather than drawn in the wrong
// place or looped forever.
export function worldMatrix(scene: Scene, id: string): Mat4 {
  const index = new Map(scene.entities.map((entity) => [entity.id, entity]));
  return worldFrom(index, id, new Set<string>());
}

function worldFrom(index: Map<string, Entity>, id: string, seen: Set<string>): Mat4 {
  if (seen.has(id)) throw new Error(`the scene has a parent cycle through "${id}"`);
  const entity = index.get(id);
  if (!entity) throw new Error(`the scene has no entity "${id}"`);
  const local = localMatrix(entity.transform);
  if (entity.parent === undefined) return local;
  seen.add(id);
  return mat4.multiply(worldFrom(index, entity.parent, seen), local);
}

// The view-projection matrix a camera becomes: projection times view, so a point
// is moved into the camera's own space first and projected into clip space after.
export function viewProjection(camera: Camera): Mat4 {
  const view = mat4.lookAt(camera.eye, camera.target, camera.up);
  const projection = mat4.perspective(camera.fovY, camera.aspect, camera.near, camera.far);
  return mat4.multiply(projection, view);
}
