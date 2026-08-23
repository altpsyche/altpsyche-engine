// A shape cut out of a surface: the first pass draws a turning sheet and leaves a
// mark behind everywhere it landed, and the second covers the whole frame with a
// moving field and is drawn only where that mark is. Neither pass knows anything
// about the other. What connects them is a number the card keeps for every pixel,
// written by the first and compared by the second, so the field arrives already
// cut to the shape of the sheet without either shader being told what the shape
// is.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // Place: turns a corner in front of the camera into a corner on the screen,
    // which is what gives the sheet its lean. It is fed rather than worked out
    // here because a shader that computes its own cannot be aimed from outside.
    u_place: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Span: half the width the sheet covers before it is turned, so the mark leaves a
// good part of the frame outside it and the cut is easy to see.
const SPAN: f32 = 0.75;

// Distance: how far in front of the camera the sheet sits, which is between
// whatever the projection fed in treats as its nearest and its furthest.
const DISTANCE: f32 = 1.8;

// Turn rate: how fast the sheet swings about the upright axis, which is what makes
// the cut shape change while the field behind it moves on its own.
const TURN_RATE: f32 = 0.35;

// Rings: how many bands of the field fit across the frame, which is what makes the
// second pass a picture rather than a flat colour.
const RINGS: f32 = 9.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in the sheet, from one edge to the other, so
    // the marking pass can shade itself by the geometry rather than by the pixel.
    @location(0) place: vec2<f32>,
};

@vertex
fn shape(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    let flat = corner * SPAN;

    // Swing: rotates the sheet about the upright axis, which foreshortens it as it
    // turns away and is why the marked area changes size over time.
    let swing = uniforms.u_time * TURN_RATE;
    let turned = vec3<f32>(flat.x * cos(swing), flat.y, flat.x * sin(swing));

    // Depth sign: negative z is in front of the camera, which is the direction the
    // projection fed in was built for.
    var at = uniforms.u_place * vec4<f32>(turned.x, turned.y, turned.z - DISTANCE, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a
    // frame wider than it is tall.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place);
}

@fragment
fn marking(shaded: Surface) -> @location(0) vec4<f32> {
    // Backdrop: what a reader sees outside the cut, since the pass after this one
    // paints only inside the mark. It is dark so the field reads as light coming
    // through a hole rather than as a second surface on top.
    let edge = min(min(shaded.place.x, 1.0 - shaded.place.x), min(shaded.place.y, 1.0 - shaded.place.y));
    return vec4<f32>(vec3<f32>(0.04, 0.05, 0.09) + smoothstep(0.06, 0.0, edge) * 0.18, 1.0);
}

@fragment
fn filling(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
    // Rings: distance from the middle of the frame in bands, which gives the field
    // something moving for the mark to cut across.
    let middle = (at.xy - uniforms.u_resolution * 0.5) / uniforms.u_resolution.y;
    let bands = fract(length(middle) * RINGS - uniforms.u_time * 0.25);
    let warm = mix(vec3<f32>(0.98, 0.57, 0.24), vec3<f32>(0.99, 0.88, 0.62), bands);
    let cool = mix(vec3<f32>(0.18, 0.42, 0.72), vec3<f32>(0.62, 0.85, 0.98), bands);
    return vec4<f32>(mix(cool, warm, smoothstep(0.2, 0.8, bands)), 1.0);
}
