// Counts the card works out for itself: one pass writes down how much work the two
// after it will do, and neither of those two carries a number at all. Every other
// shader here says how much it draws when it is written, so the amount of work is
// fixed before the frame starts. Here the first pass writes three words that say
// how many blocks of the grid to paint and four that say how much to draw, and the
// card reads them out of those buffers a moment later. Nothing outside the card
// ever sees the numbers.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Blocks: the three words a dispatch is read from, which are how many blocks of
// work to run across, down and through. The card reads them in that order and
// nothing else may be in front of them.
@group(0) @binding(1) var<storage, read_write> blocks: array<u32>;

// Copies: the four words a draw is read from, which are how many corners to send
// through the vertex stage, how many copies of them to draw, and where in the
// buffers to start on each. Same arrangement, same order.
@group(0) @binding(2) var<storage, read_write> copies: array<u32>;

// Shown: the grid as the pass before this frame left it, which is what the picture
// is made of. The two halves of the pair trade places every frame, so the one
// being read is never the one being written.
@group(0) @binding(3) var shown: texture_2d<f32>;
@group(0) @binding(4) var painted: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(5) var shownSampler: sampler;

// Block: how many cells across and down one block of work covers. It must stay in
// step with the size declared on the painting stage below, because the count of
// blocks written here is what the card runs that stage over.
const BLOCK: u32 = 8u;

// Corners: how many corners cover the frame in one triangle. With a draw read out
// of a buffer this number lives here and nowhere else, since the description that
// used to carry it says nothing about how much is drawn any more.
const CORNERS: u32 = 3u;

// Sweep rate: how fast the painted band grows and shrinks, in radians a second.
const SWEEP_RATE: f32 = 0.6;

@compute @workgroup_size(1)
fn plan() {
    let across = textureDimensions(painted).x / BLOCK;
    let down = textureDimensions(painted).y / BLOCK;

    // Sweep: a share of the grid between none and all of it, swinging with the
    // clock, which is the one thing here that decides how much work happens.
    let sweep = 0.5 + 0.5 * sin(uniforms.u_time * SWEEP_RATE);
    let wide = 1u + u32(sweep * f32(across - 1u));

    blocks[0] = wide;
    blocks[1] = down;
    blocks[2] = 1u;

    copies[0] = CORNERS;
    copies[1] = 1u;
    copies[2] = 0u;
    copies[3] = 0u;
}

@compute @workgroup_size(8, 8)
fn paint(@builtin(global_invocation_id) at: vec3<u32>) {
    let size = textureDimensions(painted);
    // Edge: a block that runs past the grid writes nothing, since the count of
    // blocks is rounded up and the last one hangs over the edge.
    if (at.x >= size.x || at.y >= size.y) {
        return;
    }

    let place = vec2<f32>(at.xy) / vec2<f32>(size);
    // Bands: a value that climbs across the grid and rolls over, so how far the
    // painting reached is visible as where the bands stop rather than only as a
    // brightness.
    let bands = fract(place.x * 6.0 + uniforms.u_time * 0.1);
    let lit = mix(vec3<f32>(0.08, 0.20, 0.42), vec3<f32>(0.55, 0.85, 1.0), bands);
    textureStore(painted, vec2<i32>(at.xy), vec4<f32>(lit, 1.0));
}

// Ground: the colour under the grid, which is what shows wherever the painting
// pass did not reach. A cell nothing has written is empty rather than black, and
// empty in this format means an alpha of zero, so the two can be told apart.
const GROUND_TOP: vec3<f32> = vec3<f32>(0.05, 0.06, 0.10);
const GROUND_FOOT: vec3<f32> = vec3<f32>(0.10, 0.11, 0.16);

@fragment
fn shade(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
    let across = at.xy / uniforms.u_resolution;
    let ground = mix(GROUND_TOP, GROUND_FOOT, across.y);
    let grid = textureSample(shown, shownSampler, across);
    return vec4<f32>(mix(ground, grid.rgb, grid.a), 1.0);
}
