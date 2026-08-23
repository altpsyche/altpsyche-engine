/**
 * The vector and matrix maths the engine places objects and cameras with. It is
 * written here rather than taken as a dependency so that every line an episode
 * explains is a line a reader can open, and it imports nothing from the site so
 * that it can be lifted out into a library later.
 *
 * Matrices are column-major, sixteen or nine numbers laid out the way WebGPU
 * reads a `mat4x4<f32>` or `mat3x3<f32>` from a buffer: the first four numbers
 * are the first column, not the first row. A number at flat index `col * 4 + row`
 * is the entry in that column and row. Keeping this order means a packed matrix
 * goes to the card as its own bytes with no transpose on the way.
 *
 * The projection puts clip-space depth in the range zero to one, which is what
 * WebGPU wants and what the WebGL fallback never sees, because everything above
 * the device layer is WebGPU only.
 */

export type Vec3 = { x: number; y: number; z: number };

// Sixteen numbers, column-major. A tuple rather than a bare array so that a
// literal index reads as a number the compiler knows is present.
export type Mat4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

// Nine numbers, column-major, three columns of three.
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

function makeVec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

// A zero-length vector normalises to zero rather than to not-a-number, so a
// degenerate camera basis produces a black frame rather than a crashed one.
function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return scale(v, 1 / len);
}

const IDENTITY_4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const IDENTITY_3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Column-major product: the entry at column c, row r is the r-th row of `a`
// dotted with the c-th column of `b`, so `multiply(a, b)` applies `b` first and
// then `a` when it multiplies a point.
function multiply(a: Mat4, b: Mat4): Mat4 {
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15] = a;
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15] = b;
  return [
    a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3,
    a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3,
    a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3,
    a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3,

    a0 * b4 + a4 * b5 + a8 * b6 + a12 * b7,
    a1 * b4 + a5 * b5 + a9 * b6 + a13 * b7,
    a2 * b4 + a6 * b5 + a10 * b6 + a14 * b7,
    a3 * b4 + a7 * b5 + a11 * b6 + a15 * b7,

    a0 * b8 + a4 * b9 + a8 * b10 + a12 * b11,
    a1 * b8 + a5 * b9 + a9 * b10 + a13 * b11,
    a2 * b8 + a6 * b9 + a10 * b10 + a14 * b11,
    a3 * b8 + a7 * b9 + a11 * b10 + a15 * b11,

    a0 * b12 + a4 * b13 + a8 * b14 + a12 * b15,
    a1 * b12 + a5 * b13 + a9 * b14 + a13 * b15,
    a2 * b12 + a6 * b13 + a10 * b14 + a14 * b15,
    a3 * b12 + a7 * b13 + a11 * b14 + a15 * b15,
  ];
}

// The last column carries the offset, so this moves a point by `v` and leaves a
// direction unchanged.
function translation(v: Vec3): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v.x, v.y, v.z, 1];
}

function scaling(v: Vec3): Mat4 {
  return [v.x, 0, 0, 0, 0, v.y, 0, 0, 0, 0, v.z, 0, 0, 0, 0, 1];
}

function rotationX(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function rotationY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function rotationZ(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Applies the matrix to a point, treating it as having a fourth coordinate of
// one, so translation is included. The result is divided by its own fourth
// coordinate, which is one for an affine matrix and the depth divisor for a
// projection, so a projected point comes back already in clip space.
function transformPoint(m: Mat4, v: Vec3): Vec3 {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15] = m;
  const x = m0 * v.x + m4 * v.y + m8 * v.z + m12;
  const y = m1 * v.x + m5 * v.y + m9 * v.z + m13;
  const z = m2 * v.x + m6 * v.y + m10 * v.z + m14;
  const w = m3 * v.x + m7 * v.y + m11 * v.z + m15;
  if (w === 0) return { x, y, z };
  return { x: x / w, y: y / w, z: z / w };
}

// A right-handed camera looking from `eye` towards `target`. The camera's own
// forward axis points away from the target, which is why the basis is built from
// `eye - target` rather than the other way round, and the last column undoes the
// eye's position so that the eye lands at the origin of view space.
function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

// A perspective projection whose depth output runs zero at the near plane to one
// at the far plane. `fovY` is the vertical field of view in radians and `aspect`
// is width over height.
function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const range = near - far;
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / range, -1, 0, 0, (near * far) / range, 0];
}

// The upper-left three by three of a four by four, which is the rotation and
// scale with the translation dropped.
function mat3FromMat4(m: Mat4): Mat3 {
  const [m0, m1, m2, , m4, m5, m6, , m8, m9, m10] = m;
  return [m0, m1, m2, m4, m5, m6, m8, m9, m10];
}

// The bytes a `mat4x4<f32>` occupies in a uniform block: sixteen floats, no
// padding, so the column-major numbers go straight across.
function packMat4(m: Mat4): Float32Array {
  return new Float32Array(m);
}

// The bytes a `mat3x3<f32>` occupies in a uniform block. WGSL and Slang pad each
// column of a matrix out to four components, so a three by three is twelve floats
// rather than nine: three columns of three numbers, each followed by a zero the
// shader never reads.
function packMat3(m: Mat3): Float32Array {
  const [c0x, c0y, c0z, c1x, c1y, c1z, c2x, c2y, c2z] = m;
  return new Float32Array([c0x, c0y, c0z, 0, c1x, c1y, c1z, 0, c2x, c2y, c2z, 0]);
}

/**
 * The three families a caller reaches, grouped so an import line says what each
 * name operates on. Flat, these read `add`, `length` and `scale`, which are clear
 * beside each other in one file and say nothing on the import line of a consumer
 * who also has a dozen other libraries in scope.
 *
 * `vec3` is both the constructor and the family, so building a vector stays the
 * short thing it was. The magnitude is not called `length`: a function's `length`
 * is how many arguments it takes, it is not writable, and assigning one in a
 * module throws, so the name a caller reads has to differ from the convention here.
 */
export const vec3 = Object.assign(makeVec3, {
  add,
  sub,
  scale,
  dot,
  cross,
  magnitude: length,
  normalize,
});

export const mat4 = {
  IDENTITY: IDENTITY_4,
  multiply,
  translation,
  scaling,
  rotationX,
  rotationY,
  rotationZ,
  transformPoint,
  lookAt,
  perspective,
  pack: packMat4,
};

export const mat3 = {
  IDENTITY: IDENTITY_3,
  fromMat4: mat3FromMat4,
  pack: packMat3,
};
