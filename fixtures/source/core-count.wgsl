// A ring drawn by counting rather than by masking: two squares, one inside the
// other and wound the opposite way round, drawn in one pass that adds one to a
// counter for every front face it lands on and takes one back for every back
// face. Where the two squares overlap the count comes back to zero, so the second
// pass — drawn only where the counter is not zero — reaches the ring and not the
// hole, and neither pass is told where the hole is.
//
// **This is the picture a mask cannot draw** (item 2). `mark` leaves the reference
// behind everywhere a pass draws, so both squares mark and the hole is marked as
// solidly as the ring: a mode that masks fills the hole in. A winding number is
// what decides the interior of a filled path that crosses itself or carries a
// hole, and it is counted by letting the faces of the path's triangles cancel,
// which is what `GPUDepthStencilState` carries `stencilFront` and `stencilBack`
// separately in order to express.
//
// **Which face is the front is deliberately not relied on.** The two backends do
// not agree about it — a framebuffer's rows run the other way on one of them — so
// the same square is front-facing on one and back-facing on the other and the
// count in the ring is `+1` on one and `-1` on the other. `nonzero` asks whether
// the counter came back to zero rather than which way it went, so the two draw the
// same picture out of opposite counts. A mode testing for `1` would not, and that
// is the reason the mode is named for what it means rather than for a number.
//
// **No projection, deliberately.** Four projection literals copied across presets
// are item 6's subject and a fifth would have made it worse. The squares are
// axis-aligned and spent straight into clip space, which is also what keeps the
// two backends' rasterizers on the same pixels: an edge that no matrix has folded
// lands where the other backend's lands.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Outer: half the width of the square that encloses the ring, leaving a good part
// of the frame outside it so the clear colour is visible as a third region.
const OUTER: f32 = 0.72;

// Inner: half the width of the hole at its smallest, and how far it grows. The
// hole breathes rather than sitting still, because a preset that cannot move by
// construction proves less than one that can: a backend applying the counting
// mode to the first frame alone would go unnoticed in a still picture.
const INNER: f32 = 0.28;
const BREATH: f32 = 0.12;

// Breath rate: how fast the hole opens and closes, slow enough that a reader sees
// one shape rather than a flicker.
const BREATH_RATE: f32 = 0.6;

// Rings: how many bands of the field fit across the frame, which is what makes
// the second pass a picture rather than a flat colour.
const RINGS: f32 = 9.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in its own square, from one edge to the other,
    // so the counting pass can shade itself by the geometry rather than by the
    // pixel.
    @location(0) place: vec2<f32>,
};

@vertex
fn shape(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    // Two quads across: the left one becomes the outer square and the right one
    // the inner. Which quad a corner belongs to is read off `place`, the corner's
    // own position in the grid, rather than off its position — the position is
    // what this stage is about to replace.
    let inner = place.x > 0.5;
    let along = vec2<f32>(select(place.x, place.x - 0.5, inner) * 2.0, place.y);
    let edge = select(OUTER, INNER + BREATH * (0.5 + 0.5 * sin(uniforms.u_time * BREATH_RATE)), inner);

    // The inner square is spent with its horizontal axis negated, which reverses
    // the order its corners are traversed in and so reverses its winding. That is
    // the whole of how one square cancels the other: a shape wound the same way as
    // the one enclosing it would add to the count rather than take from it, and the
    // hole would fill.
    var flat = (along * 2.0 - 1.0) * edge;
    if (inner) { flat.x = -flat.x; }

    var at = vec4<f32>(flat, 0.5, 1.0);

    // Aspect: squeezes the picture across so a square stays square on a frame
    // wider than it is tall. It is a positive scale, so it moves no corner past
    // another and the winding above survives it.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, along);
}

@fragment
fn counting(shaded: Surface) -> @location(0) vec4<f32> {
    // What a reader sees through the hole, since the pass after this one paints
    // only the ring. Both squares draw it, so the hole and the ring arrive the
    // same colour and what separates them in the finished frame is the count
    // alone. A seam at the edges makes the two squares' own boundaries visible,
    // which is what shows that the hole was drawn rather than left out.
    let border = min(min(shaded.place.x, 1.0 - shaded.place.x), min(shaded.place.y, 1.0 - shaded.place.y));
    return vec4<f32>(vec3<f32>(0.06, 0.07, 0.11) + smoothstep(0.04, 0.0, border) * 0.2, 1.0);
}

// **The second pass draws its own corners rather than the backend's**, and that is
// not a style choice. A pipeline naming no vertex stage is the fullscreen frame
// `gates/corpus.mjs` cannot carry to WebGL 2 — there is no baked GLSL vertex for it
// to link — so the whole preset is skipped on that backend and compares nothing.
// `core-stencil` is skipped there for exactly that reason, which is half of why the
// two backends could disagree about the stencil reference unseen. A preset written
// to be compared has to be drawable by both, so this covers the frame out of the
// same two quads the counting pass shapes: one quad to each half, laid out edge to
// edge, which is the whole frame and no part of it twice.
@vertex
fn cover(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    let inner = place.x > 0.5;
    let along = vec2<f32>(select(place.x, place.x - 0.5, inner) * 2.0, place.y);
    // `place.x` runs 0 to 1 across both quads together, so spending it straight
    // into clip space puts the left quad on the left half and the right on the
    // right. No aspect correction: this covers the frame rather than being a shape
    // on it, and squeezing it would leave a band down each side undrawn.
    return Surface(vec4<f32>(place * 2.0 - 1.0, 0.5, 1.0), along);
}

@fragment
fn filling(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
    // Bands out from the middle of the frame, which gives the ring something
    // moving in it and makes a pass that drew where it should not have obvious.
    let middle = (at.xy - uniforms.u_resolution * 0.5) / uniforms.u_resolution.y;
    let bands = fract(length(middle) * RINGS - uniforms.u_time * 0.25);
    let warm = mix(vec3<f32>(0.98, 0.57, 0.24), vec3<f32>(0.99, 0.88, 0.62), bands);
    let cool = mix(vec3<f32>(0.18, 0.42, 0.72), vec3<f32>(0.62, 0.85, 0.98), bands);
    return vec4<f32>(mix(cool, warm, smoothstep(0.2, 0.8, bands)), 1.0);
}
