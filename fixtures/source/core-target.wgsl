// A picture drawn once and then worked on: the first pass draws a sheet lifted
// into a travelling ridge into a texture of its own rather than onto the screen,
// and the second pass covers the frame with three corners, reads that texture back
// and grades and darkens it toward the edges. Every other shader here finishes its
// picture in one go, so anything it wants to do to the whole frame it has to do
// while working out each pixel. This one can look at the finished picture, which is
// what lets an effect depend on the picture as a whole rather than on one pixel.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Scene: the picture the first pass drew, read back by the second. It is the same
// size as the frame, so a pixel of it is a pixel of the picture and nothing is
// softened on the way through.
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var sceneSampler: sampler;

// Span: half the width the sheet covers, leaving a margin so the darkening at the
// edges has something other than the sheet to fall off over.
const SPAN: f32 = 0.72;

// Ridge: how far the wave lifts a corner at its highest, as a share of the frame.
const RIDGE: f32 = 0.26;

// Turn: a whole circle in radians, which is the length of one wave along the sheet.
const TURN: f32 = 6.283185307179586;

// Cells: how many squares the grid lines mark out along each edge of the sheet.
const CELLS: f32 = 24.0;

// Reach: how far from the middle the darkening starts, as a share of half the
// frame's diagonal, so a corner is darkened and the middle is left alone.
const REACH: f32 = 0.55;

struct Shaded {
    @builtin(position) at: vec4<f32>,
    // Place: where the corner sits in the sheet, from one edge to the other.
    @location(0) place: vec2<f32>,
    // Lift: how far the wave moved this corner, which the fragment stage cannot
    // work out from the position it is handed.
    @location(1) lift: f32,
};

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Shaded {
    // Phase: where along the wave this corner sits, walked by the clock so the
    // ridge travels across the sheet.
    let phase = place.x * TURN + uniforms.u_time;
    let lift = sin(phase) * RIDGE * place.y;
    let at = vec2<f32>(corner.x * SPAN, corner.y * SPAN + lift);
    return Shaded(vec4<f32>(at, 0.0, 1.0), place, lift);
}

@fragment
fn paint(shaded: Shaded) -> @location(0) vec4<f32> {
    // Grid lines: the distance to the nearest cell edge, in cells, so the lines
    // stay the same width however far the corners around them moved.
    let cells = shaded.place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    let line = 1.0 - smoothstep(0.0, 0.06, min(toEdge, 1.0 - toEdge));

    let warmth = clamp(shaded.lift / RIDGE * 0.5 + 0.5, 0.0, 1.0);
    let body = mix(vec3<f32>(0.08, 0.16, 0.34), vec3<f32>(0.34, 0.62, 0.84), warmth);
    return vec4<f32>(mix(body, vec3<f32>(0.92, 0.97, 1.0), line * 0.55), 1.0);
}

@fragment
fn grade(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
    let across = at.xy / uniforms.u_resolution;
    let drawn = textureSample(scene, sceneSampler, across).rgb;

    // Luminance: how bright a colour looks rather than how large its numbers are,
    // weighted the way the eye weighs the three channels, Rec. 601.
    let luminance = dot(drawn, vec3<f32>(0.299, 0.587, 0.114));

    // Grade: pushes every colour away from its own brightness, which is contrast,
    // and then tints what is left warm. Neither can be done while the first pass
    // is drawing, because both need the finished colour.
    let harder = clamp(mix(vec3<f32>(luminance), drawn, 1.6), vec3<f32>(0.0), vec3<f32>(1.0));
    let tinted = harder * vec3<f32>(1.06, 0.98, 0.88);

    // Vignette: darkens the frame toward its corners by how far a pixel is from the
    // middle, which is a fact about where a pixel sits in the whole picture rather
    // than about anything drawn at it.
    let fromMiddle = length(across - vec2<f32>(0.5)) / length(vec2<f32>(0.5));
    let shade = 1.0 - smoothstep(REACH, 1.0, fromMiddle) * 0.85;

    return vec4<f32>(tinted * shade, 1.0);
}
