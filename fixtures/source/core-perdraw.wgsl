// Per draw data: a grid of quads drawn several times over, where each copy reads
// its own colour and its own height out of a buffer the build wrote rather than
// working them out from the copy's number. The geometry preset next to this one
// draws several copies too, but they differ only in what the shader computes from
// the copy's number. Here the numbers are fed in: they reach a second bind group
// of their own, read by which copy the card is drawing, so one pipeline paints
// several things that differ in what they were handed rather than in their code.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Copy: the numbers one drawn copy carries of its own. A three-vector for the
// colour aligns to sixteen and takes twelve, so the height sits in the four bytes
// it leaves free and one Copy is a clean sixteen, which is std430 for a vector of
// three followed by a float.
struct Copy {
    tint: vec3<f32>,
    lift: f32,
};

// Second bind group: the per-copy numbers, one Copy after another, reached by
// which copy the card is drawing rather than by anything the geometry carries. It
// is read only, so the layout is a read-only storage buffer and nothing writes it.
@group(1) @binding(0) var<storage, read> copies: array<Copy>;

// Step: how far right each copy sits from the one before it, so the count of
// copies never has to be written into this file to lay them out.
const STEP: f32 = 0.7;

// Span: half the width one copy covers, kept under half the step so two copies
// never touch and neither has to draw over the other.
const SPAN: f32 = 0.3;

// Turn: a whole circle in radians, which is the length of one wave along the grid.
const TURN: f32 = 6.283185307179586;

struct Shaded {
    @builtin(position) at: vec4<f32>,
    // Place: where the corner sits in the grid, from one edge to the other, so the
    // fragment stage shades by the geometry rather than by the pixel it landed on.
    @location(0) place: vec2<f32>,
    // Tint: the colour this copy was handed, carried through so the fragment stage
    // shades every corner of one copy the same way.
    @location(1) tint: vec3<f32>,
};

@vertex
fn warp(
    @location(0) corner: vec2<f32>,
    @location(1) place: vec2<f32>,
    @builtin(instance_index) copy: u32,
) -> Shaded {
    // Mine: the numbers this copy was handed, read out of the second bind group by
    // which copy is being drawn.
    let mine = copies[copy];
    // Phase: where along the wave this corner sits, walked by the clock so the
    // ridge travels, and offset per copy so the copies are out of step.
    let phase = place.x * TURN + uniforms.u_time + f32(copy);
    let lift = sin(phase) * mine.lift * place.y;
    // Sideways: the left copy first, one step per copy after it, offset so four
    // copies sit centred on the frame.
    let sideways = f32(copy) * STEP - 1.5 * STEP;
    let at = vec2<f32>(corner.x * SPAN + sideways, corner.y * SPAN + lift);
    return Shaded(vec4<f32>(at, 0.0, 1.0), place, mine.tint);
}

@fragment
fn shade(shaded: Shaded) -> @location(0) vec4<f32> {
    // Grid lines: the distance to the nearest cell edge, in cells, so the lines
    // stay the same width however far the corners around them moved.
    let cells = shaded.place * 16.0;
    let toEdge = min(fract(cells.x), fract(cells.y));
    let line = 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));

    // Body: the copy's own colour, lifted toward white along the grid lines so the
    // shape of each copy reads against the ones beside it.
    return vec4<f32>(mix(shaded.tint, vec3<f32>(1.0), line * 0.6), 1.0);
}
