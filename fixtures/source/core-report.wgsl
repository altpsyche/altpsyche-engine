// What the card says about the work it did: two sheets facing the camera at two
// distances, where the near one is drawn first and the far one after it, so the
// far one is only painted where the near one is not already in front. The card
// counts how many samples of that second sheet got through and writes down when
// the pass started and when it finished, and neither number is in the picture:
// slide the near sheet aside and the count climbs while the frame looks much the
// same. Every other shader here is judged by what it draws, and this one is
// judged by what the card reports about drawing it.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // Place: turns a corner in front of the camera into a corner on the screen,
    // which is where near and far come from at all. It is fed rather than worked
    // out here because a shader that computes its own cannot be aimed from
    // outside.
    u_place: mat4x4<f32>,
    // Cover: how much of the far sheet the near one stands in front of, from 0
    // with the near sheet pushed off to the side to 1 with it centred. It is the
    // one value the count of samples depends on, and it moves nothing else.
    u_cover: f32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Span: half the width a sheet covers, so a pair of them fills the frame without
// either running off the edge.
const SPAN: f32 = 0.8;

// Near and far: how far in front of the camera each sheet sits. Both are between
// whatever the projection fed in treats as its nearest and its furthest, so
// neither is cut away, and the gap between them is what makes one cover the other.
const NEAR: f32 = 1.6;
const FAR: f32 = 2.6;

// Aside: how far the near sheet slides when nothing is covered, which is wide
// enough to clear the far sheet completely at this pair of distances.
const ASIDE: f32 = 2.2;

// Drift: how fast the pair rises and falls, which keeps the picture moving without
// changing how much of the far sheet is covered.
const DRIFT: f32 = 0.12;

// Cells: how many squares the grid lines mark out along each edge of a sheet.
const CELLS: f32 = 12.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in its own sheet, from one edge to the other,
    // so the grid lines are drawn by the geometry rather than by the pixel it
    // landed on.
    @location(0) place: vec2<f32>,
};

/// Where one corner of a sheet lands on the screen, at the distance given and
/// slid sideways by the amount given.
fn placed(corner: vec2<f32>, place: vec2<f32>, away: f32, slide: f32) -> Surface {
    let flat = corner * SPAN;
    let rise = sin(uniforms.u_time * DRIFT) * 0.1;

    // Depth sign: negative z is in front of the camera, which is the direction
    // the projection fed in was built for.
    var at = uniforms.u_place * vec4<f32>(flat.x + slide, flat.y + rise, -away, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a
    // frame wider than it is tall. It is done here rather than inside the
    // projection so one projection works at any window size.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place);
}

@vertex
fn front(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    // Slide: moves the near sheet out of the way as cover falls, which is the one
    // thing that changes how many samples of the sheet behind it survive.
    return placed(corner, place, NEAR, (1.0 - uniforms.u_cover) * ASIDE);
}

@vertex
fn behind(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    return placed(corner, place, FAR, 0.0);
}

/// How strongly the grid lines mark a point inside a sheet, from 0 between them to
/// 1 on one.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.09, min(toEdge, 1.0 - toEdge));
}

@fragment
fn nearer(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.55, 0.24, 0.10), vec3<f32>(0.95, 0.70, 0.28), shaded.place.y);
    return vec4<f32>(mix(body, vec3<f32>(1.0, 0.96, 0.88), lines(shaded.place) * 0.5), 1.0);
}

@fragment
fn farther(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.06, 0.13, 0.30), vec3<f32>(0.18, 0.42, 0.72), shaded.place.y);
    return vec4<f32>(mix(body, vec3<f32>(0.85, 0.92, 1.0), lines(shaded.place) * 0.5), 1.0);
}
