// Compute: a shader that writes a picture into a texture one pixel at a time
// instead of colouring the pixels a triangle covers. There is no triangle here
// and no fragment stage at all, so the frame this file makes is a texture the
// backend copies out rather than something drawn into the screen.

// Uniform block: WGSL gathers the values a shader is given into one struct, and
// where each field sits is fixed by its type rather than by the order alone. A
// vec2<f32> starts on a multiple of 8, so u_resolution begins at byte 8 and the
// four bytes after u_time go unused.
struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;

// Storage texture: the picture this shader writes. `write` is the whole of what
// it may do to it, because a texture being written by the running program cannot
// also be read by it, and it cannot be the thing the pass draws into either,
// which is why the frame says this is the picture and the backend copies it.
@binding(1) @group(0) var picture: texture_storage_2d<rgba8unorm, write>;

// Wave sources: two points the ripples start from, as a fraction of the frame,
// so they sit in the same place whatever size the picture is.
const FIRST_SOURCE = vec2<f32>(0.34, 0.42);
const SECOND_SOURCE = vec2<f32>(0.68, 0.58);

// Ripple spacing: how many wave crests fit across the frame. A larger number is
// finer stripes, and past about 120 the stripes are thinner than a pixel and the
// picture turns to noise.
const CREST_COUNT = 34.0;

// Ripple speed: how fast the crests travel outward, in crests a second.
const RIPPLE_SPEED = 1.6;

// One wave, measured at a point: the height of the water at that point given how
// far it is from where the ripple started. Subtracting time from the distance is
// what makes the crests travel away from the source rather than stand still.
fn wave(at: vec2<f32>, source: vec2<f32>, time: f32) -> f32 {
    let reach = distance(at, source);
    return sin(reach * CREST_COUNT - time * RIPPLE_SPEED * 6.2831853);
}

// Workgroup size: the block of pixels one run of this program covers, which is
// 8 by 8 here. The dispatch count is worked out from these two numbers, so the
// whole picture is covered by whole blocks and a frame whose width does not
// divide by 8 is covered by a block that runs off the edge.
@compute @workgroup_size(8, 8)
fn paint(@builtin(global_invocation_id) pixel: vec3<u32>) {
    let size = textureDimensions(picture);

    // Edge guard: the last block of a row runs past the picture when the width
    // does not divide by the block size, and a write outside the texture is
    // thrown away by the card rather than reported, so the pixels that are not
    // there return before doing the work.
    if (pixel.x >= size.x || pixel.y >= size.y) {
        return;
    }

    // Screen position as a fraction: the pixel counted from a corner divided by
    // the picture size, which gives 0 to 1 across the frame whatever its size.
    let at = vec2<f32>(f32(pixel.x), f32(pixel.y)) / vec2<f32>(f32(size.x), f32(size.y));

    // Interference: two waves added together. Where two crests meet, the sum is
    // twice as high as either; where a crest meets a trough they cancel to
    // nothing. That pattern of bright and dark bands is the whole picture.
    let both = wave(at, FIRST_SOURCE, uniforms.u_time) + wave(at, SECOND_SOURCE, uniforms.u_time);

    // Height as brightness: the sum runs from -2 to 2 and a colour channel runs
    // from 0 to 1, so half of it moved up by a half lands in range. Squaring it
    // afterwards darkens the middle of the range more than the ends, which is
    // what leaves the cancelling bands black rather than grey.
    let height = 0.5 + 0.25 * both;
    let bright = height * height;

    // Colour: warm where the waves add and cold where they cancel, which reads
    // as light through water rather than as a grey plot of a sum.
    let colour = mix(vec3<f32>(0.02, 0.04, 0.12), vec3<f32>(1.0, 0.72, 0.35), bright);

    textureStore(picture, vec2<i32>(i32(pixel.x), i32(pixel.y)), vec4<f32>(colour, 1.0));
}
