// Item 43 fixture. Valid WGSL that naga's GLSL ES 3.00 writer refuses: GLSL ES
// 3.00 has no 16-bit float type, so naga refuses with `GLSL has no 16-bit float
// type` — a genuine untranslatable construct, and NOT one of the three §10
// capabilities the build maps to a recorded skip. It takes the build's `fail`
// path and is refused with the construct named (item 43).
//
// Deliberately outside the 15 corpus presets — see cube-array.wgsl for why this
// subdirectory exists. Driven by `tests/untranslatable.test.ts`.
enable f16;

@fragment
fn fs() -> @location(0) vec4<f32> {
  let h: f16 = f16(1.0);
  return vec4<f32>(f32(h));
}
