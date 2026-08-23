// Several readings of every pixel: one flat sheet leaning away from the camera and
// slowly turning, drawn into a picture where the card takes four readings inside
// each pixel instead of one. A slanted edge covers part of every pixel it crosses,
// and one reading either fills such a pixel or leaves it empty, so the edge comes
// out as a staircase. Four readings averaged give how much of the pixel the sheet
// actually covered, which is a run of part-covered pixels along the edge instead.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // Place: turns a corner in front of the camera into a corner on the screen,
    // which is what leaves the sheet with edges running at an angle to the rows
    // and columns of pixels rather than along them.
    u_place: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Lean: how far the sheet tips away from facing the camera, in radians, so its top
// edge sits further from the camera than its bottom edge and none of the four
// edges lands square on the pixel grid.
const LEAN: f32 = 0.55;

// Span: half the width the sheet covers before it is tipped. It is under one so
// there is empty frame all the way round the sheet, and an edge with nothing
// behind it is an edge whose part-covered pixels can be counted.
const SPAN: f32 = 0.6;

// Distance: how far in front of the camera the middle of the sheet sits. Whatever
// the projection fed in treats as its nearest and furthest, this is between them,
// so no part of the sheet is cut away for being too close or too far.
const DISTANCE: f32 = 2.0;

// Turn rate: how fast the sheet swings about the upright axis, which keeps each
// edge sweeping across new pixels rather than covering the same ones every frame.
const TURN_RATE: f32 = 0.15;

// Cells: how many squares the grid lines mark out along each edge of the sheet.
const CELLS: f32 = 8.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in the sheet, from one edge to the other, so
    // the fragment stage shades by the geometry rather than by the pixel it
    // landed on.
    @location(0) place: vec2<f32>,
};

@vertex
fn lean(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    let flat = corner * SPAN;

    // Leaning: rotates the sheet about the horizontal axis, which trades height
    // for distance and is what tilts the top and bottom edges out of line with
    // the pixel rows.
    let leaning = vec3<f32>(flat.x, flat.y * cos(LEAN), flat.y * sin(LEAN));

    // Swing: rotates the sheet about the upright axis, so every edge is at a
    // different angle each frame and no single frame can be the one angle that
    // happens to line up.
    let swing = uniforms.u_time * TURN_RATE;
    let turned = vec3<f32>(
        leaning.x * cos(swing) + leaning.z * sin(swing),
        leaning.y,
        leaning.z * cos(swing) - leaning.x * sin(swing),
    );

    // Depth sign: negative z is in front of the camera, which is the direction
    // the projection fed in was built for.
    var at = uniforms.u_place * vec4<f32>(turned.x, turned.y, turned.z - DISTANCE, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a
    // frame that is wider than it is tall. It is done here rather than inside the
    // projection so the same projection works at any window size.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place);
}

// Lines: how strongly the grid marks a point inside the sheet, from 0 between the
// lines to 1 on one. They are drawn by the shader rather than by the geometry, so
// they stay sharp however many readings a pixel gets: the outline of the sheet is
// the only edge the card has anything to average across.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));
}

@fragment
fn shade(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.10, 0.36, 0.62), vec3<f32>(0.62, 0.86, 1.0), shaded.place.y);
    let lit = mix(body, vec3<f32>(1.0, 1.0, 1.0), lines(shaded.place) * 0.4);
    // Coverage: an alpha of one against an attachment emptied to zero, so a pixel
    // the outline crosses comes back holding the fraction of itself the sheet
    // covered. Nothing is blended here: each reading is written as it is, and the
    // averaging of the four is what mixes them.
    return vec4<f32>(lit, 1.0);
}
