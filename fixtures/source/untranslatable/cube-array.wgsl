// Item 43 fixture. Valid WGSL that naga's GLSL ES 3.00 writer refuses: a
// cube-array texture has no `samplerCubeArray` in GLSL ES 3.00 (it arrived in ES
// 3.2). naga refuses with `The selected version doesn't support
// Features(CUBE_TEXTURES_ARRAY)` — a genuine untranslatable construct, and NOT
// one of the three §10 capabilities (`compute` / `storage-buffer` /
// `storage-texture`) the build maps to a recorded skip. So it takes the build's
// `fail` path, and item 43 is that it is refused with the construct named.
//
// This file is deliberately NOT one of the 15 corpus presets under
// `fixtures/source/*.wgsl`: it lives in this subdirectory so the corpus build
// (`npm run translate`) never picks it up and never fails on it. It is a test
// fixture proving the refusal mechanism, driven by `tests/untranslatable.test.ts`.
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_cube_array<f32>;

@fragment
fn fs(@location(0) dir: vec3<f32>) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, dir, 0);
}
