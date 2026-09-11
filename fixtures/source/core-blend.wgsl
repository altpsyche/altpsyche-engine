// One picture drawn twice, where what a reader sees in the middle is neither of
// the two colours but a mix of them. Every other preset that leans on a blend also
// leans on something else — `core-depth` blends *and* tests distances *and* writes
// two colours at once — so a wrong blend there is hidden by whatever else was going
// on. This one does nothing but blend: two sheets, offset sideways so they overlap
// down the middle, the second drawn at an alpha under one over the first.
//
// **What it is for.** A backend that skips the blend draws the second sheet's
// colour flat over the first wherever they overlap, and the overlap reads as the
// second colour alone rather than as a mix. That is a difference any comparison
// between the two backends can see, and until this preset existed there was none:
// the cross-backend comparison covers the scene presets, none of which blends.
//
// **One colour target on purpose.** A pass whose targets draw under *different*
// blends needs `per-target-blend`, which WebGL 2 has not got, so a preset written
// that way is refused there and compares nothing. One target keeps this drawable on
// both backends, which is the whole point of it.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Span: half the width one sheet covers, so the pair fills most of the frame with
// a margin at each edge.
const SPAN: f32 = 0.55;

// Offset: how far each sheet is pushed sideways from the middle. The two are
// pushed opposite ways, so they overlap across the band between them — and that
// band is the only part of the picture a blend changes.
const OFFSET: f32 = 0.25;

// Drift: how far the pair slides back and forth, so the overlap moves and a frame
// captured at one moment is not the only frame this draws.
const DRIFT: f32 = 0.06;

// Alpha: what the second sheet is drawn at. Under one, so the first shows through
// it; well under one, so a blend that was skipped is a large difference rather than
// a subtle one.
const ALPHA: f32 = 0.5;

// Cells: how many squares the grid lines mark out along each edge of a sheet, so
// the sheets have structure a reader can see through the overlap.
const CELLS: f32 = 8.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in its own sheet, edge to edge, so the fragment
    // stage marks its grid by the geometry rather than by the pixel it landed on.
    @location(0) place: vec2<f32>,
};

/// Where one corner of a sheet lands, pushed sideways by `shift`.
fn placed(corner: vec2<f32>, place: vec2<f32>, shift: f32) -> Surface {
    let slide = shift + sin(uniforms.u_time) * DRIFT;
    var at = vec4<f32>(corner.x * SPAN + slide, corner.y * SPAN, 0.0, 1.0);
    // Aspect: squeezes across so a square sheet stays square on a frame wider than
    // it is tall, the same correction `core-depth` makes and for the same reason.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place);
}

@vertex
fn back(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    return placed(corner, place, -OFFSET);
}

@vertex
fn front(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    return placed(corner, place, OFFSET);
}

/// How strongly the grid lines mark a point inside a sheet, 0 between them to 1 on
/// one.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.1, min(toEdge, 1.0 - toEdge));
}

@fragment
fn under(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.06, 0.13, 0.30), vec3<f32>(0.18, 0.42, 0.72), shaded.place.y);
    let lit = mix(body, vec3<f32>(0.85, 0.92, 1.0), lines(shaded.place) * 0.5);
    // Opaque: this is what the overlap is blended *against*, so it must be all
    // there rather than partly transparent itself.
    return vec4<f32>(lit, 1.0);
}

@fragment
fn over(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.55, 0.24, 0.10), vec3<f32>(0.95, 0.70, 0.28), shaded.place.y);
    let lit = mix(body, vec3<f32>(1.0, 0.96, 0.88), lines(shaded.place) * 0.5);
    // The alpha the whole preset exists for. A backend applying the blend mixes
    // this with the sheet underneath across the overlap; one skipping it writes
    // this colour flat and the overlap reads as this sheet alone.
    return vec4<f32>(lit, ALPHA);
}
