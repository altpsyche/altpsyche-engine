// Sampling: a shader that reads a picture the build wrote rather than working
// every pixel out from arithmetic. The picture is 64 pixels square and the frame
// is hundreds across, so almost every pixel here lands between two of the
// picture's own and the card mixes them, which is what a sampler decides.

// Uniform block: WGSL gathers the values a shader is given into one struct, and
// where each field sits is fixed by its type rather than by the order alone. A
// vec2<f32> starts on a multiple of 8, so u_resolution begins at byte 8 and the
// four bytes after u_time go unused.
struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;

// Sampled texture: the picture, declared with the kind of number that comes back
// out of it and nothing about how it is stored. That is the difference from a
// storage texture, which names its format because the shader writes into it, and
// it is why the frame this file belongs to says where the bytes come from.
@binding(1) @group(0) var grain: texture_2d<f32>;

// Sampler: how the card reads between two of the picture's pixels, and what it
// does past the last one. Neither is in this declaration: the frame says smooth
// and repeating, so this name is only where those two answers arrive.
@binding(2) @group(0) var grainSampler: sampler;

// Tiling: how many copies of the picture fit across the frame. The picture is
// made to join up with itself at its edges, so a whole number here leaves no
// seam where one copy meets the next.
const GRAIN_TILES = 3.0;

// Drift: how far the lookup slides across the picture each second. The picture
// itself never changes, so this is the whole of what makes the frame move.
const DRIFT_SPEED = 0.035;

// Warp depth: how far the first reading pushes the second one's lookup. Past
// about 0.3 the push is further than the distance between two of the picture's
// pixels and the result stops looking like a flow and starts looking torn.
const WARP_DEPTH = 0.14;

// Two colours the picture is painted between, dark first. Sampling gives one
// number a pixel and a colour needs three, so the number chooses a point on the
// line between these two.
const DEEP = vec3<f32>(0.03, 0.05, 0.14);
const BRIGHT = vec3<f32>(0.98, 0.78, 0.42);

@fragment
fn fragMain(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
    // Screen position as a fraction: the pixel counted from a corner divided by
    // the frame size, which gives 0 to 1 across the frame whatever its size.
    let at = pixel.xy / uniforms.u_resolution;

    // Aspect correction: the picture is square and the frame usually is not, so
    // a lookup taken straight from the fraction above would stretch it. Scaling
    // the across axis by the frame's shape keeps the grain the same size in both
    // directions.
    let shape = vec2<f32>(uniforms.u_resolution.x / uniforms.u_resolution.y, 1.0);
    let lookup = at * shape * GRAIN_TILES;

    // Domain warping: read the picture once, then use what came back to move
    // where the second reading looks. One picture read twice gives shapes
    // neither reading has on its own, which is the cheapest way to get a flowing
    // pattern out of a texture that never changes.
    let drift = uniforms.u_time * DRIFT_SPEED;
    let push = textureSample(grain, grainSampler, lookup * 0.5 + vec2<f32>(drift, -drift)).r;
    let flow = textureSample(grain, grainSampler, lookup + vec2<f32>(push, push) * WARP_DEPTH - drift).r;

    // Contrast: the reading runs from about 0.2 to 0.8 rather than the whole
    // way, because three octaves averaged together spend most of their time near
    // the middle. Pulling it apart around the middle uses the full range of both
    // colours instead of a band in the centre of them.
    let level = clamp((flow - 0.5) * 1.9 + 0.5, 0.0, 1.0);

    return vec4<f32>(mix(DEEP, BRIGHT, level), 1.0);
}
