import { describe, expect, it } from 'vitest';
import { namesReachedBy } from '@altpsyche/engine';

/**
 * Which of a source's bound variables one entry point reaches.
 *
 * The question matters because a file holding two entry points builds two
 * pipelines, and each pipeline's layout has to name the bindings its own stage
 * reads. A layout one short of that is a pipeline the driver refuses, so the cases
 * below are mostly about the ways a reference hides: two calls down, inside a loop,
 * behind a comment that names it and inside a function nothing calls.
 */

const TWO_STAGES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var next: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var stateSampler: sampler;

fn at(pixel: vec2<i32>) -> vec2<f32> {
  return textureLoad(previous, pixel, 0).rg;
}

fn neighbours(pixel: vec2<i32>) -> vec2<f32> {
  return at(pixel + vec2<i32>(1, 0)) + at(pixel - vec2<i32>(1, 0));
}

@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) cell: vec3<u32>) {
  let sum = neighbours(vec2<i32>(cell.xy));
  textureStore(next, vec2<i32>(cell.xy), vec4<f32>(sum, 0.0, 1.0));
}

@fragment
fn shade(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let field = textureSample(previous, stateSampler, pixel.xy / uniforms.u_resolution);
  return vec4<f32>(field.rg, 0.0, 1.0);
}`;

describe('the names one entry point reaches', () => {
  it('gives a compute entry the variables it writes and reads and nothing the other stage uses', () => {
    const reached = namesReachedBy(TWO_STAGES, 'step');

    expect(reached.has('next')).toBe(true);
    expect(reached.has('previous')).toBe(true);
    expect(reached.has('stateSampler')).toBe(false);
    expect(reached.has('uniforms')).toBe(false);
  });

  it('gives a fragment entry its sampler and its block and not the texture it never writes', () => {
    const reached = namesReachedBy(TWO_STAGES, 'shade');

    expect(reached.has('previous')).toBe(true);
    expect(reached.has('stateSampler')).toBe(true);
    expect(reached.has('uniforms')).toBe(true);
    expect(reached.has('next')).toBe(false);
  });

  it('follows a call two deep, which is where the read that a layout would miss sits', () => {
    // `previous` is read in `at`, `at` is called by `neighbours`, and only
    // `neighbours` appears in the entry point's own body.
    const body = /fn step[\s\S]*?\n}/.exec(TWO_STAGES)?.[0] as string;

    expect(body.includes('previous')).toBe(false);
    expect(namesReachedBy(TWO_STAGES, 'step').has('previous')).toBe(true);
  });

  it('reads nothing out of a function the entry point never calls', () => {
    const withOrphan = `${TWO_STAGES}

fn unused() -> f32 {
  return textureLoad(previous, vec2<i32>(0, 0), 0).r;
}`;

    expect(namesReachedBy(withOrphan, 'unused').has('previous')).toBe(true);
    expect(namesReachedBy(withOrphan, 'step').has('unused')).toBe(false);
  });

  it('reads nothing out of a comment inside the body, which is where this corpus names its bindings', () => {
    // The comment sits inside the compute entry point's own braces, which is the
    // only place a comment could reach a layout, and it names the two things that
    // stage does not touch.
    const commented = TWO_STAGES.replace(
      '  let sum = ',
      `  // The other stage reads stateSampler and uniforms. This one reads neither.
  let sum = `
    );

    const reached = namesReachedBy(commented, 'step');
    expect(reached.has('stateSampler')).toBe(false);
    expect(reached.has('uniforms')).toBe(false);
    expect(reached.has('next')).toBe(true);
  });

  it('reads a name written after a nested block closes rather than stopping at the first brace', () => {
    // The store sits below a loop, so a body that ended at the first closing
    // brace would hold the loop and miss the only line naming the texture.
    const looped = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8)
fn paint(@builtin(global_invocation_id) cell: vec3<u32>) {
  var total = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    total = total + f32(i);
  }
  textureStore(picture, vec2<i32>(i32(cell.x), 0), vec4<f32>(total));
}`;

    expect(namesReachedBy(looped, 'paint').has('picture')).toBe(true);
  });

  it('comes back empty for an entry point the source does not declare', () => {
    expect(namesReachedBy(TWO_STAGES, 'missing').size).toBe(0);
  });

  it('reads each function once, so a source that calls in a circle finishes rather than hanging', () => {
    const circular = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;

fn first() -> f32 { return second(); }
fn second() -> f32 { return first(); }

@compute @workgroup_size(8)
fn paint() { textureStore(picture, vec2<i32>(0, 0), vec4<f32>(first())); }`;

    expect(namesReachedBy(circular, 'paint').has('picture')).toBe(true);
  });
});

/**
 * The ways a name that is not a reference to a binding used to be read as one.
 *
 * Each of these widens a layout, and a layout one binding too wide is accepted by
 * the card while claiming a stage reads something it never touches, which is the
 * silent failure this reader exists to stop. A scan of the flat text passed all of
 * them, so the corpus only stayed correct because it never spelled a binding the
 * way one of these hides. The cases below refuse that dependence.
 */
describe('the names one entry point does not reach', () => {
  it('does not read the field after a dot as a binding of the same name', () => {
    // `v.next` is a field of a local, not the storage texture `next`. Counting it
    // put a texture the stage never writes into that stage's layout.
    const swizzled = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var next: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8)
fn paint(cell: vec3<u32>) {
  let v = vec4<f32>(1.0);
  textureStore(picture, vec2<i32>(0, 0), v.next);
}`;

    const reached = namesReachedBy(swizzled, 'paint');
    expect(reached.has('picture')).toBe(true);
    expect(reached.has('next')).toBe(false);
  });

  it('does not follow a dotted field into a helper it happens to be named after', () => {
    // `t.size` is a struct field, not a call to `size()`, so the binding `size()`
    // reads must not ride into a stage that only touches a struct member.
    const named = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var secret: texture_2d<f32>;

fn size() -> vec4<f32> { return textureLoad(secret, vec2<i32>(0, 0), 0); }

struct Thing { size: f32 };

@compute @workgroup_size(8)
fn paint(cell: vec3<u32>) {
  var t: Thing;
  textureStore(picture, vec2<i32>(0, 0), vec4<f32>(t.size));
}`;

    const reached = namesReachedBy(named, 'paint');
    expect(reached.has('picture')).toBe(true);
    expect(reached.has('secret')).toBe(false);
  });

  it('does not read a parameter that shares a binding name as the binding', () => {
    // `tint` takes a parameter it calls `previous`, which shadows the texture of
    // the same name. The reads inside `tint` are of the parameter, so no stage
    // that calls it touches the texture.
    const shadowed = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var previous: texture_2d<f32>;

fn tint(previous: f32) -> f32 { return previous * 2.0; }

@compute @workgroup_size(8)
fn paint(cell: vec3<u32>) {
  textureStore(picture, vec2<i32>(0, 0), vec4<f32>(tint(1.0)));
}`;

    const reached = namesReachedBy(shadowed, 'paint');
    expect(reached.has('picture')).toBe(true);
    expect(reached.has('tint')).toBe(true);
    expect(reached.has('previous')).toBe(false);
  });

  it('does not read a local that shares a binding name as the binding', () => {
    // The local `previous` shadows the texture for the rest of the function, so a
    // stage that only reads the local does not read the texture.
    const shadowed = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var previous: texture_2d<f32>;

@compute @workgroup_size(8)
fn paint(cell: vec3<u32>) {
  let previous = 1.0;
  textureStore(picture, vec2<i32>(0, 0), vec4<f32>(previous));
}`;

    const reached = namesReachedBy(shadowed, 'paint');
    expect(reached.has('picture')).toBe(true);
    expect(reached.has('previous')).toBe(false);
  });

  it('reads a binding used to size a local rather than losing it to the declaration', () => {
    // The name declared is the local, but the initialiser on its right is read
    // normally, so a binding that sizes a local is still in the layout.
    const sizedLocal = `@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var source: texture_2d<f32>;

@compute @workgroup_size(8)
fn paint(cell: vec3<u32>) {
  let seed = textureLoad(source, vec2<i32>(0, 0), 0);
  textureStore(picture, vec2<i32>(0, 0), seed);
}`;

    const reached = namesReachedBy(sizedLocal, 'paint');
    expect(reached.has('source')).toBe(true);
    expect(reached.has('picture')).toBe(true);
  });
});

/**
 * A parameter list is read to the brace that opens the body rather than to the
 * first bracket after the name.
 *
 * A parameter can carry an attribute of its own, and an attribute carries
 * parentheses, so reading to the first closing bracket ends the list inside
 * `@builtin(position)` and loses every parameter after it. The body is then read
 * from the wrong place, and a binding read in that body goes missing from the
 * layout, which the driver refuses by name.
 */
describe('reading past punctuation inside a parameter list', () => {
  it('reads a body that follows attributed parameters', () => {
    const attributed = `@group(0) @binding(1) var field: texture_2d<f32>;

@fragment
fn shade(@builtin(position) pixel: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureLoad(field, vec2<i32>(uv), 0);
}`;

    expect(namesReachedBy(attributed, 'shade').has('field')).toBe(true);
  });
});

/**
 * A source that cannot be read structurally is refused rather than read wrong.
 *
 * A half-parsed function yields a layout that looks plausible and is not, so the
 * reader stops with the reason rather than handing one back.
 */
describe('a source outside the subset it can read', () => {
  it('refuses a block comment that never closes', () => {
    expect(() => namesReachedBy('fn paint() { /* the field is', 'paint')).toThrow(/never closed/);
  });

  it('refuses a function whose body brace never closes', () => {
    expect(() => namesReachedBy('fn paint() { let x = 1;', 'paint')).toThrow(/never closed/);
  });

  it('refuses a parameter list whose bracket never closes', () => {
    expect(() => namesReachedBy('fn paint(a: f32 { }', 'paint')).toThrow(/never closed/);
  });
});

describe('a parameter attribute that shares a resource name', () => {
  const source = `
@group(0) @binding(0) var position: texture_2d<f32>;
@group(0) @binding(1) var grain: texture_2d<f32>;
@group(0) @binding(2) var grainSampler: sampler;

@fragment fn shade(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(grain, grainSampler, at.xy);
}
`;

  it('leaves a resource the stage never reads out of what it reached', () => {
    expect(namesReachedBy(source, 'shade').has('position')).toBe(false);
  });

  it('keeps the resources the body does read', () => {
    const reached = namesReachedBy(source, 'shade');
    expect(reached.has('grain')).toBe(true);
    expect(reached.has('grainSampler')).toBe(true);
  });
});
