// A picture kept at every size it might be read at: the shader reads one texture at
// a level of detail that climbs from the left edge of the frame to the right, so a
// single frame shows the whole ladder. A picture read smaller than it is drawn
// sparkles, because each pixel of the frame lands on one pixel of the picture and
// the ones in between are never seen. The answer is a stack of copies, each one
// half the size of the copy above it and each pixel of it an average of four, and
// reading the copy that matches the size wanted is what makes a shrinking picture
// hold still instead of flickering.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Grain: the picture, and every smaller copy of it the backend drew.
@group(0) @binding(1) var grain: texture_2d<f32>;
@group(0) @binding(2) var grainSampler: sampler;

// Steps: how far up the ladder the right edge of the frame reads. A 256 pixel
// picture has nine levels, so this stops short of the smallest ones, which are too
// few pixels to look like anything.
const STEPS: f32 = 6.0;

// Tiles: how many times the picture is repeated across the frame, which is what
// gives a level something to average away.
const TILES: f32 = 3.0;

// Drift: how fast the picture slides across the frame, so the whole ladder moves
// rather than the frame being a still.
const DRIFT: f32 = 0.04;

@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
    let across = at.xy / uniforms.u_resolution;

    // Level: which copy of the picture this pixel reads, from the full-size one at
    // the left edge to a small one at the right. Whole numbers land exactly on a
    // copy and the values between them are a mix of the two either side, which is
    // what makes the change across the frame smooth rather than banded.
    let level = across.x * STEPS;

    let slid = vec2<f32>(across.x * TILES + uniforms.u_time * DRIFT, across.y * TILES);
    let read = textureSampleLevel(grain, grainSampler, slid, level).rgb;

    // Marks: a thin line wherever the level crosses a whole number, so a reader can
    // see where one copy of the picture gives way to the next.
    let toStep = abs(fract(level) - 0.5) * 2.0;
    let mark = smoothstep(0.97, 1.0, toStep);

    let tinted = read * vec3<f32>(0.72, 0.86, 1.0);
    return vec4<f32>(mix(tinted, vec3<f32>(1.0, 0.86, 0.55), mark * 0.55), 1.0);
}
