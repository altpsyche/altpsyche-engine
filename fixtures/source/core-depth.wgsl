// Depth and two pictures at once: two flat sheets leaning opposite ways, crossing
// in the middle, where which one you see on each half is decided by how far each
// is from the camera rather than by the order they were drawn. Every other shader
// here draws one thing over the whole frame, so nothing can be behind anything
// else and the last thing drawn always wins. This one draws twice into one
// picture, keeps how far away each pixel ended up in a picture of its own, and
// lets the far sheet show through the near one where the near one is in front.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // Place: turns a corner in front of the camera into a corner on the screen,
    // which is where the near and far of a picture come from at all. It is fed
    // rather than worked out here because a shader that computes its own is a
    // shader that cannot be aimed from outside.
    u_place: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Lean: how far each sheet tips away from facing the camera, in radians. The two
// sheets tip by this much in opposite directions, so they meet along the line
// through the middle and one is in front of the other above and below it.
const LEAN: f32 = 0.6;

// Span: half the width one sheet covers before it is tipped, so the pair fills
// the frame without either running off the edge once the tip has foreshortened it.
const SPAN: f32 = 0.85;

// Distance: how far in front of the camera the middle of the pair sits. Whatever
// the projection fed in treats as its nearest and furthest, this is between them,
// so no part of either sheet is cut away for being too close or too far.
const DISTANCE: f32 = 2.0;

// Turn rate: how fast the pair swings about the upright axis, which is what makes
// the crossing move rather than sit still.
const TURN_RATE: f32 = 0.15;

// Cells: how many squares the grid lines mark out along each edge of a sheet.
const CELLS: f32 = 16.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in its own sheet, from one edge to the other,
    // so the fragment stage draws grid lines by the geometry rather than by the
    // pixel it landed on.
    @location(0) place: vec2<f32>,
};

struct Pictures {
    // Picture: what a reader sees.
    @location(0) picture: vec4<f32>,
    // Distance: how far this pixel ended up from the camera, written as a grey so
    // it can be looked at as a picture. Nothing reads it back inside this shader:
    // it is here because a stage returning two colours at once is the thing being
    // drawn, and a second colour nobody can inspect proves nothing.
    @location(1) distance: vec4<f32>,
};

/// Where one corner of a leaning sheet lands on the screen.
fn placed(corner: vec2<f32>, place: vec2<f32>, lean: f32) -> Surface {
    let flat = corner * SPAN;

    // Lean: rotates the sheet about the horizontal axis, which trades height for
    // distance. The top edge of a sheet leaning away is further from the camera
    // than its bottom edge, and that difference is the whole picture.
    let leaning = vec3<f32>(flat.x, flat.y * cos(lean), flat.y * sin(lean));

    // Swing: rotates both sheets together about the upright axis, so the pair
    // turns as one and keeps crossing while it moves.
    let swing = uniforms.u_time * TURN_RATE;
    let turned = vec3<f32>(
        leaning.x * cos(swing) + leaning.z * sin(swing),
        leaning.y,
        leaning.z * cos(swing) - leaning.x * sin(swing),
    );

    // Negative z is in front of the camera, which is the direction the projection
    // fed in was built for.
    var at = uniforms.u_place * vec4<f32>(turned.x, turned.y, turned.z - DISTANCE, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a
    // frame that is wider than it is tall. It is done here rather than inside the
    // projection so the same projection works at any window size.
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

/// How strongly the grid lines mark a point inside a sheet, from 0 between them
/// to 1 on one.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));
}

@fragment
fn farther(shaded: Surface) -> Pictures {
    let body = mix(vec3<f32>(0.06, 0.13, 0.30), vec3<f32>(0.18, 0.42, 0.72), shaded.place.y);
    let lit = mix(body, vec3<f32>(0.85, 0.92, 1.0), lines(shaded.place) * 0.5);
    // The z a fragment stage is handed is how far away it ended up, from 0 at the
    // nearest the projection reaches to 1 at the furthest.
    return Pictures(vec4<f32>(lit, 1.0), vec4<f32>(vec3<f32>(shaded.at.z), 1.0));
}

@fragment
fn nearer(shaded: Surface) -> Pictures {
    let body = mix(vec3<f32>(0.55, 0.24, 0.10), vec3<f32>(0.95, 0.70, 0.28), shaded.place.y);
    let lit = mix(body, vec3<f32>(1.0, 0.96, 0.88), lines(shaded.place) * 0.5);
    // An alpha under one is what lets the sheet behind this one be seen through
    // it, and it only does anything because this stage is blended rather than
    // replacing what the attachment held.
    return Pictures(vec4<f32>(lit, 0.55), vec4<f32>(vec3<f32>(shaded.at.z), 1.0));
}
