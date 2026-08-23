import { describe, expect, it } from 'vitest';
import { vec3, mat4, mat3 } from '@altpsyche/engine';
import { uniformBlockOf } from '@altpsyche/engine';

/**
 * The maths the engine places objects and cameras with. A wrong entry here is a
 * scene drawn in the wrong place with nothing failing, the same class of quiet
 * defect the uniform block layout guards against, so the packing is held to the
 * byte layout that layout reader computes.
 */

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 10);
const closeVec = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  close(a.x, b.x);
  close(a.y, b.y);
  close(a.z, b.z);
};

// A struct with one matrix field so its size can be read the way a shader's is.
const block = (field: string) =>
  uniformBlockOf(`
struct Uniforms {
${field}
};
@binding(0) @group(0) var<uniform> uniforms: Uniforms;
`);

describe('vector maths', () => {
  it('adds, subtracts and scales component by component', () => {
    expect(vec3.add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
    expect(vec3.sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
    expect(vec3.scale(vec3(1, 2, 3), 2)).toEqual(vec3(2, 4, 6));
  });

  it('dots and takes length', () => {
    expect(vec3.dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
    close(vec3.magnitude(vec3(3, 4, 0)), 5);
  });

  it('crosses two axes into the third, right-handed', () => {
    expect(vec3.cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
  });

  it('normalises to unit length and leaves a zero vector at zero', () => {
    close(vec3.magnitude(vec3.normalize(vec3(0, 3, 4))), 1);
    expect(vec3.normalize(vec3(0, 0, 0))).toEqual(vec3(0, 0, 0));
  });
});

describe('matrix maths', () => {
  it('leaves a matrix unchanged when multiplied by the identity either way', () => {
    const m = mat4.translation(vec3(2, 3, 4));
    expect(mat4.multiply(mat4.IDENTITY, m)).toEqual(m);
    expect(mat4.multiply(m, mat4.IDENTITY)).toEqual(m);
  });

  it('moves a point by a translation and leaves the identity fixed', () => {
    closeVec(mat4.transformPoint(mat4.translation(vec3(2, 3, 4)), vec3(1, 1, 1)), vec3(3, 4, 5));
    closeVec(mat4.transformPoint(mat4.IDENTITY, vec3(5, 6, 7)), vec3(5, 6, 7));
  });

  it('scales a point away from the origin', () => {
    closeVec(mat4.transformPoint(mat4.scaling(vec3(2, 3, 4)), vec3(1, 1, 1)), vec3(2, 3, 4));
  });

  it('rotates a quarter turn about y, sending +z to +x', () => {
    closeVec(mat4.transformPoint(mat4.rotationY(Math.PI / 2), vec3(0, 0, 1)), vec3(1, 0, 0));
  });

  it('rotates a quarter turn about z, sending +x to +y', () => {
    closeVec(mat4.transformPoint(mat4.rotationZ(Math.PI / 2), vec3(1, 0, 0)), vec3(0, 1, 0));
  });

  it('composes a translation applied after a rotation', () => {
    // mat4.multiply(t, r) rotates first, then translates.
    const m = mat4.multiply(mat4.translation(vec3(10, 0, 0)), mat4.rotationY(Math.PI / 2));
    closeVec(mat4.transformPoint(m, vec3(0, 0, 1)), vec3(11, 0, 0));
  });

  it('takes the rotation-and-scale corner as a three by three', () => {
    expect(mat3.fromMat4(mat4.scaling(vec3(2, 3, 4)))).toEqual([2, 0, 0, 0, 3, 0, 0, 0, 4]);
  });
});

describe('the camera', () => {
  it('sends the eye to the origin of view space', () => {
    const view = mat4.lookAt(vec3(0, 0, 5), vec3(0, 0, 0), vec3(0, 1, 0));
    closeVec(mat4.transformPoint(view, vec3(0, 0, 5)), vec3(0, 0, 0));
  });

  it('puts what the eye looks at down the negative z axis', () => {
    const view = mat4.lookAt(vec3(0, 0, 5), vec3(0, 0, 0), vec3(0, 1, 0));
    const seen = mat4.transformPoint(view, vec3(0, 0, 0));
    close(seen.x, 0);
    close(seen.y, 0);
    expect(seen.z).toBeLessThan(0);
  });

  it('projects the near plane to depth zero and the far plane to depth one', () => {
    const proj = mat4.perspective(Math.PI / 2, 1, 1, 100);
    close(mat4.transformPoint(proj, vec3(0, 0, -1)).z, 0);
    close(mat4.transformPoint(proj, vec3(0, 0, -100)).z, 1);
  });
});

describe('packing against the layout Slang emits', () => {
  it('packs a four by four as sixteen floats, the size a mat4x4 field takes', () => {
    const bytes = mat4.pack(mat4.IDENTITY);
    expect(bytes.length).toBe(16);
    expect(bytes.byteLength).toBe(64);
    expect(block('    u_place: mat4x4<f32>,')).toEqual([{ name: 'u_place', offset: 0, size: 64 }]);
    expect(bytes.byteLength).toBe(64);
    expect(Array.from(bytes)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('packs a three by three as twelve floats with a padding word per column, the size a mat3x3 field takes', () => {
    const bytes = mat3.pack([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(bytes.length).toBe(12);
    expect(bytes.byteLength).toBe(48);
    expect(block('    u_turn: mat3x3<f32>,')).toEqual([{ name: 'u_turn', offset: 0, size: 48 }]);
    expect(bytes.byteLength).toBe(48);
    // Each column's fourth word is the padding the shader never reads.
    expect(Array.from(bytes)).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });
});
