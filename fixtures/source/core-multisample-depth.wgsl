// Several readings of every pixel, and a depth kept at the same count: two flat
// sheets leaning opposite ways and crossing in the middle, where which one you see
// on each half is decided by how far each is from the camera. `core-multisample`
// averages four readings of one sheet's outline and `core-depth` lets two sheets
// decide a picture between them; neither draws the edge this one does, which is the
// one where the two sheets cross.
//
// That crossing is the whole point. It is an edge inside the picture rather than
// against the empty frame, and it exists only because the depth was tested — so a
// backend that kept one sample of the depth beside four of the colour would draw
// that edge as a staircase while the sheets' outer edges came out smooth, and a
// backend that dropped the depth entirely would draw whichever sheet was second.
// Both are visible in the picture rather than only in a call stream.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // Place: turns a corner in front of the camera into a corner on the screen,
    // which is where the near and far of a picture come from at all. Fed rather
    // than worked out here, so where the pair is seen from is the caller's.
    u_place: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Lean: how far each sheet tips away from facing the camera, in radians. The two
// tip by this much in opposite directions, so they meet along the line through the
// middle and one is in front of the other above and below it.
const LEAN: f32 = 0.6;

// Span: half the width one sheet covers before it is tipped. It is under one so
// there is empty frame around the pair, which leaves the outer edges something to
// be averaged against as well as the crossing.
const SPAN: f32 = 0.7;

// Distance: how far in front of the camera the middle of the pair sits. Whatever
// the projection fed in treats as its nearest and furthest, this is between them.
const DISTANCE: f32 = 2.0;

// Turn rate: how fast the pair swings about the upright axis, which keeps every
// edge sweeping across new pixels rather than covering the same ones every frame.
const TURN_RATE: f32 = 0.15;

// Cells: how many squares the grid lines mark out along each edge of a sheet. The
// lines are drawn by the shader rather than by the geometry, so they stay sharp
// however many readings a pixel gets and the only edges the card averages are the
// sheets' own.
const CELLS: f32 = 16.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in its own sheet, from one edge to the other.
    @location(0) place: vec2<f32>,
};

/// Where one corner of a leaning sheet lands on the screen.
fn placed(corner: vec2<f32>, place: vec2<f32>, lean: f32) -> Surface {
    let flat = corner * SPAN;

    // Lean: rotates the sheet about the horizontal axis, which trades height for
    // distance. The top edge of a sheet leaning away is further from the camera
    // than its bottom edge, and that difference is what the depth test reads.
    let leaning = vec3<f32>(flat.x, flat.y * cos(lean), flat.y * sin(lean));

    // Swing: rotates both sheets together about the upright axis, so the pair turns
    // as one and the crossing moves rather than sitting still.
    let swing = uniforms.u_time * TURN_RATE;
    let turned = vec3<f32>(
        leaning.x * cos(swing) + leaning.z * sin(swing),
        leaning.y,
        leaning.z * cos(swing) - leaning.x * sin(swing),
    );

    // Negative z is in front of the camera, which is the direction the projection
    // fed in was built for.
    var at = uniforms.u_place * vec4<f32>(turned.x, turned.y, turned.z - DISTANCE, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a frame
    // wider than it is tall. Done here rather than inside the projection so the
    // same projection works at any window size.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place);
}

@vertex
fn away(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    return placed(corner, place, LEAN);
}

@vertex
fn toward(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    return placed(corner, place, -LEAN);
}

/// How strongly the grid lines mark a point inside a sheet, from 0 between them to
/// 1 on one.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));
}

@fragment
fn farther(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.06, 0.13, 0.30), vec3<f32>(0.18, 0.42, 0.72), shaded.place.y);
    let lit = mix(body, vec3<f32>(0.85, 0.92, 1.0), lines(shaded.place) * 0.5);
    // Opaque, both of them: nothing is blended here, so what decides a pixel where
    // the sheets overlap is the depth test and nothing else. An alpha of one against
    // an attachment emptied to zero also leaves the fourth channel holding how much
    // of each edge pixel a sheet covered, which is the averaging made readable.
    return vec4<f32>(lit, 1.0);
}

@fragment
fn nearer(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.55, 0.24, 0.10), vec3<f32>(0.95, 0.70, 0.28), shaded.place.y);
    let lit = mix(body, vec3<f32>(1.0, 0.96, 0.88), lines(shaded.place) * 0.5);
    return vec4<f32>(lit, 1.0);
}
