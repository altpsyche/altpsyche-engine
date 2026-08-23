// Geometry out of a buffer: a grid of quads the build wrote, lifted by a travelling
// ridge and drawn several times over. Every other shader here covers the frame
// with three corners the backend supplies and does its shaping in the fragment
// stage, so the picture is worked out per pixel. This one is shaped in the vertex
// stage instead: the card is handed a grid of corners, each one is moved, and the
// triangles between them are filled in with whatever the moved corners left.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Step: how far right each copy sits from the copy before it, so the count of
// copies never has to be written into this file to lay them out.
const STEP: f32 = 0.7;

// Span: half the width one copy covers, kept under half the step so two copies
// never touch and neither has to draw over the other.
const SPAN: f32 = 0.3;

// Ridge: how far the wave lifts a corner at its highest, as a share of the frame.
const RIDGE: f32 = 0.22;

// Turn: a whole circle in radians, which is the length of one wave along the grid.
const TURN: f32 = 6.283185307179586;

struct Shaded {
    @builtin(position) at: vec4<f32>,
    // Place: where the corner sits in the grid, from one edge to the other, so the
    // fragment stage shades by the geometry rather than by the pixel it landed on.
    @location(0) place: vec2<f32>,
    // Lift: how far the wave moved this corner, which the fragment stage has no way
    // of working out from the position it is handed.
    @location(1) lift: f32,
};

@vertex
fn warp(
    @location(0) corner: vec2<f32>,
    @location(1) place: vec2<f32>,
    @builtin(instance_index) copy: u32,
) -> Shaded {
    // Phase: where along the wave this corner sits, walked by the clock so the
    // ridge travels, and offset per copy so the copies are out of step.
    let phase = place.x * TURN + uniforms.u_time + f32(copy);
    let lift = sin(phase) * RIDGE * place.y;

    // Sideways: the left edge of the first copy, one step per copy after it.
    let sideways = f32(copy) * STEP - STEP;
    let at = vec2<f32>(corner.x * SPAN + sideways, corner.y * SPAN + lift);
    return Shaded(vec4<f32>(at, 0.0, 1.0), place, lift);
}

@fragment
fn shade(shaded: Shaded) -> @location(0) vec4<f32> {
    // Grid lines: the distance to the nearest cell edge, in cells, so the lines
    // stay the same width however far the corners around them moved.
    let cells = shaded.place * 16.0;
    let toEdge = min(fract(cells.x), fract(cells.y));
    let line = 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));

    // Height shading: the lift read back, so a raised part of the sheet is warm
    // and a lowered one is cold, which is what makes the wave readable as a shape.
    let warmth = clamp(shaded.lift / RIDGE * 0.5 + 0.5, 0.0, 1.0);
    let body = mix(vec3<f32>(0.10, 0.18, 0.38), vec3<f32>(0.95, 0.72, 0.35), warmth);
    return vec4<f32>(mix(body, vec3<f32>(1.0), line * 0.6), 1.0);
}
