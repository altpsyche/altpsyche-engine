import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_FIXTURES,
  DRAW_LIST_CAMERA,
  DRAW_LIST_OBJECTS,
  DRAW_LIST_SCENE,
  MATERIAL_BATCH,
  MATERIAL_CAMERA,
  MATERIAL_OBJECTS,
  MATERIAL_SCENE,
  MATERIALS,
  SCENE,
  SCENE_CAMERA,
  SCENE_OBJECT,
} from '../fixtures/capability-fixtures';
import { mat4, vec3 } from '@altpsyche/engine';
import { viewProjection, worldMatrix } from '@altpsyche/engine';
import { drawList } from '@altpsyche/engine';
import { batchOnePipeline } from '@altpsyche/engine';
import { BUFFER_CONTENT } from '../fixtures/shader-content';

/**
 * The core-scene preset is the first thing the engine draws, and what it proves
 * is that the two matrices its block carries are the engine's arithmetic over a
 * scene rather than numbers written into the entry by hand. A wrong matrix here
 * is an object drawn in the wrong place with nothing failing, so the entry is
 * held to the scene it names.
 */

const preset = CAPABILITY_FIXTURES.find((p) => p.id === 'core-scene');
const uniform = (name: string) => preset?.uniforms?.find((u) => u.name === name);

describe('the core-scene preset is placed by the engine', () => {
  it('carries the camera and the model as mat4 members of its block', () => {
    for (const name of ['u_view', 'u_model']) {
      const u = uniform(name);
      expect(u?.type).toBe('mat4');
      expect(Array.isArray(u?.value) ? (u?.value as number[]).length : 0).toBe(16);
    }
  });

  it("feeds the object's world matrix, worked out by walking its parent", () => {
    const world = Array.from(mat4.pack(worldMatrix(SCENE, SCENE_OBJECT)));
    expect(uniform('u_model')?.value).toEqual(world);
  });

  it('feeds the camera as the engine viewProjection of the scene camera', () => {
    const view = Array.from(mat4.pack(viewProjection(SCENE_CAMERA)));
    expect(uniform('u_view')?.value).toEqual(view);
  });

  it('places the object where the hierarchy puts it, not at the origin', () => {
    // The object sits at its parent's origin, so its own origin moved into the
    // world lands at the parent's position: a child inherits where its parent is.
    const at = mat4.transformPoint(worldMatrix(SCENE, SCENE_OBJECT), vec3(0, 0, 0));
    expect(at.x).toBeCloseTo(0.15, 10);
    expect(at.y).toBeCloseTo(0, 10);
    expect(at.z).toBeCloseTo(-2.3, 10);
  });

  it('places the object in front of the camera, between the near and far planes', () => {
    // Negative z is in front of a camera looking down its own negative z, and the
    // depth is between 0.5 and 5, so the sheet draws rather than being clipped.
    const at = mat4.transformPoint(worldMatrix(SCENE, SCENE_OBJECT), vec3(0, 0, 0));
    expect(at.z).toBeLessThan(-SCENE_CAMERA.near);
    expect(at.z).toBeGreaterThan(-SCENE_CAMERA.far);
  });
});

/**
 * The core-draw-list preset is the engine's first many-object frame: a whole draw
 * list drawn as instances of one pipeline, where each copy reads its own model
 * matrix out of a buffer the build filled rather than one object placed by the
 * block. What it proves is that the instance count, the buffer size and the bytes
 * the build writes all come off the same scene the camera is aimed at, so a hidden
 * anchor stays out of the picture while still placing what hangs off it and a wrong
 * matrix is caught rather than drawn in the wrong place.
 */
const list = CAPABILITY_FIXTURES.find((p) => p.id === 'core-draw-list');
const listUniform = (name: string) => list?.uniforms?.find((u) => u.name === name);
const modelsBuffer = () => list?.frame?.buffers?.find((b) => b.name === 'models');

describe('the core-draw-list preset draws a scene as a draw list', () => {
  it('carries only the camera in its block, not any model matrix', () => {
    const view = listUniform('u_view');
    expect(view?.type).toBe('mat4');
    expect(Array.isArray(view?.value) ? (view?.value as number[]).length : 0).toBe(16);
    expect(listUniform('u_model')).toBeUndefined();
  });

  it('feeds the camera as the engine viewProjection of its scene camera', () => {
    const view = Array.from(mat4.pack(viewProjection(DRAW_LIST_CAMERA)));
    expect(listUniform('u_view')?.value).toEqual(view);
  });

  it('draws one instance per visible object, leaving the hidden anchor out', () => {
    // The scene has four entities and one is the hidden anchor, so the draw list is
    // three and the pass draws three copies rather than four.
    const drawn = drawList(DRAW_LIST_SCENE);
    expect(DRAW_LIST_OBJECTS).toBe(3);
    expect(drawn.length).toBe(3);
    expect(drawn.map((d) => d.id)).toEqual(['left', 'middle', 'right']);
    const pass = list?.frame?.passes?.[0];
    expect(pass?.instances).toBe(drawn.length);
  });

  it('sizes the buffer to one sixty-four-byte matrix per drawn object', () => {
    const buffer = modelsBuffer();
    expect(buffer?.content).toBe('draw-list-models');
    expect(buffer?.bytes).toBe(drawList(DRAW_LIST_SCENE).length * 64);
  });

  it('fills the buffer with the draw list world matrices, in draw order', () => {
    const buffer = modelsBuffer();
    const bytes = BUFFER_CONTENT['draw-list-models'].bytes(buffer?.bytes ?? 0);
    const packed = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const expected = drawList(DRAW_LIST_SCENE).flatMap((draw) => Array.from(mat4.pack(draw.world)));
    expect(Array.from(packed)).toEqual(expected);
  });

  it('refuses a buffer size that is not the scene draw list', () => {
    const objects = drawList(DRAW_LIST_SCENE).length;
    expect(() => BUFFER_CONTENT['draw-list-models'].bytes((objects - 1) * 64)).toThrow(/draw list is 3 objects/);
    expect(() => BUFFER_CONTENT['draw-list-models'].bytes(objects * 64)).not.toThrow();
  });

  it('writes the same bytes on two runs, so the build is byte-identical', () => {
    const size = drawList(DRAW_LIST_SCENE).length * 64;
    expect(BUFFER_CONTENT['draw-list-models'].bytes(size)).toEqual(BUFFER_CONTENT['draw-list-models'].bytes(size));
  });
});

/**
 * The core-material preset is the engine's first material: two objects a scene
 * placed, drawn as instances of one pipeline, where each reads its own model
 * matrix and the colour its material feeds it. What it proves is that a material
 * is a shader plus values rather than a generated variant, so two objects sharing
 * a pipeline differ only in the numbers they were handed, and that the batch, the
 * instance count, the buffer size and the bytes all come off one scene and one
 * table of materials.
 */
const material = CAPABILITY_FIXTURES.find((p) => p.id === 'core-material');
const materialUniform = (name: string) => material?.uniforms?.find((u) => u.name === name);
const objectsBuffer = () => material?.frame?.buffers?.find((b) => b.name === 'objects');
const OBJECT_BYTES = 80;
const OBJECT_FLOATS = 20;

describe('the core-material preset draws two objects sharing a pipeline', () => {
  it('carries only the camera in its block, not any model matrix', () => {
    const view = materialUniform('u_view');
    expect(view?.type).toBe('mat4');
    expect(Array.isArray(view?.value) ? (view?.value as number[]).length : 0).toBe(16);
    expect(materialUniform('u_model')).toBeUndefined();
  });

  it('feeds the camera as the engine viewProjection of its scene camera', () => {
    const view = Array.from(mat4.pack(viewProjection(MATERIAL_CAMERA)));
    expect(materialUniform('u_view')?.value).toEqual(view);
  });

  it('draws two objects as instances of the one pipeline the batch shares', () => {
    const drawn = batchOnePipeline(MATERIAL_SCENE, MATERIALS);
    expect(MATERIAL_OBJECTS).toBe(2);
    expect(drawn.draws.map((d) => d.id)).toEqual(['left', 'right']);
    const pass = material?.frame?.passes?.[0];
    expect(pass?.pipeline).toBe(drawn.pipeline);
    expect(pass?.instances).toBe(drawn.draws.length);
  });

  it('draws the two objects with different values, which is the whole finding', () => {
    const drawn = batchOnePipeline(MATERIAL_SCENE, MATERIALS);
    expect(drawn.draws[0]?.values.tint).not.toEqual(drawn.draws[1]?.values.tint);
    // Both objects name the same pipeline, so the difference is data rather than
    // a second compiled shader.
    expect(MATERIALS['warm']?.pipeline).toBe(MATERIALS['cool']?.pipeline);
  });

  it('sizes the buffer to one eighty-byte Object per drawn object', () => {
    const buffer = objectsBuffer();
    expect(buffer?.content).toBe('material-objects');
    expect(buffer?.bytes).toBe(MATERIAL_OBJECTS * OBJECT_BYTES);
  });

  it('fills the buffer with each object world matrix then its material colour', () => {
    const buffer = objectsBuffer();
    const bytes = BUFFER_CONTENT['material-objects'].bytes(buffer?.bytes ?? 0);
    const packed = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const drawn = batchOnePipeline(MATERIAL_SCENE, MATERIALS);
    drawn.draws.forEach((draw, index) => {
      const at = index * OBJECT_FLOATS;
      expect(Array.from(packed.slice(at, at + 16))).toEqual(Array.from(mat4.pack(draw.world)));
      expect([packed[at + 16], packed[at + 17], packed[at + 18]]).toEqual(draw.values.tint.map((c) => Math.fround(c)));
    });
  });

  it('refuses a buffer size that is not the batch, and repeats on two runs', () => {
    const objects = MATERIAL_OBJECTS;
    expect(() => BUFFER_CONTENT['material-objects'].bytes((objects - 1) * OBJECT_BYTES)).toThrow(
      /the batch is 2 objects/
    );
    expect(() => BUFFER_CONTENT['material-objects'].bytes(objects * OBJECT_BYTES)).not.toThrow();
    const size = objects * OBJECT_BYTES;
    expect(BUFFER_CONTENT['material-objects'].bytes(size)).toEqual(BUFFER_CONTENT['material-objects'].bytes(size));
  });

  it('uses the batch pipeline in the entry so the two cannot fall out of step', () => {
    expect(material?.frame?.passes?.[0]?.pipeline).toBe(MATERIAL_BATCH.pipeline);
  });
});
