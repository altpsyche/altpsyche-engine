// Per-draw uniform slice: one grid of quads drawn several times over, where each
// draw reads its own record — a colour and how far right it sits — out of a
// uniform buffer by the byte offset the draw names, rather than out of anything
// the geometry carries. The `core-perdraw` shader next to this reads its per-copy
// numbers out of a read-only storage buffer indexed by the instance, which is a
// compute-tier feature GLSL ES 3.00 has no SSBO for; this reaches its record
// through a uniform bound one slice at a time instead, which is the raster path a
// per-draw slice takes — a dynamic offset on WebGPU, a `bindBufferRange` on
// WebGL 2, the same slice either way (§8). So one pipeline paints several quads
// that differ in the record each draw was pointed at rather than in their code.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Slice: the record one draw reads of its own. A three-vector for the colour
// aligns to sixteen and takes twelve, so the shift sits in the four bytes it
// leaves free and one Slice is a clean sixteen, which is what one draw's uniform
// range holds.
struct Slice {
    tint: vec3<f32>,
    shift: f32,
};
// The per-draw block: read by whichever slice the draw bound rather than by
// anything the geometry carries, so the same buffer feeds every draw and each
// reads the one record its offset points at. A uniform, not a storage buffer,
// because a per-draw slice is a uniform bound with a dynamic offset (§8) and
// WebGL 2 has that where it has no SSBO.
@group(1) @binding(0) var<uniform> slice: Slice;

// Span: half the width one draw's grid covers, kept clear of the step between
// draws so two of them never touch and neither draws over the other.
const SPAN: f32 = 0.28;

// Ridge: how far the wave lifts a corner at its highest, as a share of the frame,
// so the grid reads as a moving sheet rather than a flat rectangle.
const RIDGE: f32 = 0.16;

// Turn: a whole circle in radians, which is the length of one wave along the grid.
const TURN: f32 = 6.283185307179586;

struct Shaded {
    @builtin(position) at: vec4<f32>,
    // Place: where the corner sits in the grid, from one edge to the other, so the
    // fragment stage shades by the geometry rather than by the pixel it landed on.
    @location(0) place: vec2<f32>,
    // Tint: the colour this draw's record carried, passed through so the fragment
    // stage shades every corner of one draw the same way.
    @location(1) tint: vec3<f32>,
};

@vertex
fn warp(
    @location(0) corner: vec2<f32>,
    @location(1) place: vec2<f32>,
) -> Shaded {
    // Phase: where along the wave this corner sits, walked by the clock so the
    // ridge travels across every draw's grid together.
    let phase = place.x * TURN + uniforms.u_time;
    let lift = sin(phase) * RIDGE * place.y;
    // Sideways: the shift this draw's record named, so the same geometry lands in
    // a different place for each draw the buffer feeds.
    let at = vec2<f32>(corner.x * SPAN + slice.shift, corner.y * SPAN + lift);
    return Shaded(vec4<f32>(at, 0.0, 1.0), place, slice.tint);
}

@fragment
fn shade(shaded: Shaded) -> @location(0) vec4<f32> {
    // Grid lines: the distance to the nearest cell edge, in cells, so the lines
    // stay the same width however far the corners around them moved.
    let cells = shaded.place * 16.0;
    let toEdge = min(fract(cells.x), fract(cells.y));
    let line = 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));

    // Body: the draw's own colour, lifted toward white along the grid lines so the
    // shape of each draw reads against the ones beside it.
    return vec4<f32>(mix(shaded.tint, vec3<f32>(1.0), line * 0.5), 1.0);
}
