import { describe, expect, it } from 'vitest';
import { vec3, mat4, type Mat4 } from '@altpsyche/engine';
import { type Transform, type Scene, localMatrix, worldMatrix, viewProjection } from '@altpsyche/engine';

/**
 * The scene model. A wrong world matrix here is an object drawn in the wrong
 * place with nothing failing, so the hierarchy is held to the rule it is built
 * on, that a child's place is its parent's place applied over its own, and the
 * camera to the depths its projection is meant to produce.
 */

const closeMat = (a: Mat4, b: Mat4) => {
  for (let i = 0; i < 16; i++) expect(a[i]).toBeCloseTo(b[i] as number, 10);
};
const closeVec = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 10);
  expect(a.y).toBeCloseTo(b.y, 10);
  expect(a.z).toBeCloseTo(b.z, 10);
};

// A transform that only moves, which is enough to see the hierarchy compose.
const at = (x: number, y: number, z: number): Transform => ({
  position: vec3(x, y, z),
  rotation: mat4.IDENTITY,
  scale: vec3(1, 1, 1),
});

describe('the local transform', () => {
  it('is the identity when nothing is moved, turned or scaled', () => {
    closeMat(localMatrix(at(0, 0, 0)), mat4.IDENTITY);
  });

  it('scales, then rotates, then moves', () => {
    const t: Transform = { position: vec3(10, 0, 0), rotation: mat4.rotationY(Math.PI / 2), scale: vec3(2, 2, 2) };
    // A point on +z is scaled to (0,0,2), a quarter turn about y sends it to
    // (2,0,0), then the translation lands it at (12,0,0).
    closeVec(mat4.transformPoint(localMatrix(t), vec3(0, 0, 1)), vec3(12, 0, 0));
  });
});

describe('the transform hierarchy', () => {
  it('gives a root entity its own local transform for its world', () => {
    const scene: Scene = { entities: [{ id: 'body', transform: at(10, 0, 0) }] };
    closeMat(worldMatrix(scene, 'body'), localMatrix(at(10, 0, 0)));
  });

  it("makes a child's world its parent's world applied to its own local", () => {
    const scene: Scene = {
      entities: [
        { id: 'body', transform: at(10, 0, 0) },
        { id: 'arm', transform: at(0, 5, 0), parent: 'body' },
      ],
    };
    const expected = mat4.multiply(worldMatrix(scene, 'body'), localMatrix(at(0, 5, 0)));
    closeMat(worldMatrix(scene, 'arm'), expected);
    // And a point at the child's origin lands where both moves add up.
    closeVec(mat4.transformPoint(worldMatrix(scene, 'arm'), vec3(0, 0, 0)), vec3(10, 5, 0));
  });

  it('carries a parent through every generation below it', () => {
    const scene: Scene = {
      entities: [
        { id: 'body', transform: at(10, 0, 0) },
        { id: 'arm', transform: at(0, 5, 0), parent: 'body' },
        { id: 'hand', transform: at(0, 0, 3), parent: 'arm' },
      ],
    };
    closeVec(mat4.transformPoint(worldMatrix(scene, 'hand'), vec3(0, 0, 0)), vec3(10, 5, 3));
  });

  it('turns a child around when the parent turns, not just moves it', () => {
    const scene: Scene = {
      entities: [
        {
          id: 'body',
          transform: { position: vec3(0, 0, 0), rotation: mat4.rotationY(Math.PI / 2), scale: vec3(1, 1, 1) },
        },
        { id: 'arm', transform: at(0, 0, 1), parent: 'body' },
      ],
    };
    // The child sits one unit down +z of its parent; the parent's quarter turn
    // about y swings that offset onto +x.
    closeVec(mat4.transformPoint(worldMatrix(scene, 'arm'), vec3(0, 0, 0)), vec3(1, 0, 0));
  });

  it('refuses an unknown entity, an unknown parent and a cycle, each by name', () => {
    const missing: Scene = { entities: [] };
    expect(() => worldMatrix(missing, 'ghost')).toThrow('the scene has no entity "ghost"');

    const orphan: Scene = { entities: [{ id: 'arm', transform: at(0, 0, 0), parent: 'body' }] };
    expect(() => worldMatrix(orphan, 'arm')).toThrow('the scene has no entity "body"');

    const cycle: Scene = {
      entities: [
        { id: 'a', transform: at(0, 0, 0), parent: 'b' },
        { id: 'b', transform: at(0, 0, 0), parent: 'a' },
      ],
    };
    expect(() => worldMatrix(cycle, 'a')).toThrow('the scene has a parent cycle through "a"');
  });
});

describe('the camera', () => {
  const camera = {
    eye: vec3(0, 0, 5),
    target: vec3(0, 0, 0),
    up: vec3(0, 1, 0),
    fovY: Math.PI / 2,
    aspect: 1,
    near: 1,
    far: 100,
  };

  it('is the projection applied after the view', () => {
    const expected = mat4.multiply(
      mat4.perspective(camera.fovY, camera.aspect, camera.near, camera.far),
      mat4.lookAt(camera.eye, camera.target, camera.up)
    );
    closeMat(viewProjection(camera), expected);
  });

  it('sends a point on the near plane to clip depth zero', () => {
    const onNear = mat4.transformPoint(viewProjection(camera), vec3(0, 0, 4));
    expect(onNear.z).toBeCloseTo(0, 10);
    expect(onNear.x).toBeCloseTo(0, 10);
    expect(onNear.y).toBeCloseTo(0, 10);
  });

  it('sends a point on the far plane to clip depth one', () => {
    const onFar = mat4.transformPoint(viewProjection(camera), vec3(0, 0, -95));
    expect(onFar.z).toBeCloseTo(1, 10);
  });
});
