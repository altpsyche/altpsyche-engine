// One object placed by a scene: a flat sheet the engine put in front of the
// camera by walking a parent hierarchy and multiplying the transforms, handed to
// the card as two matrices in the uniform block. Every other shader here either
// covers the whole frame or lays its own geometry out in the vertex stage from
// constants of its own. This one draws where a scene, worked out on the CPU by
// the engine in lib/engine, decided the object sits, so the shape on screen is
// that arithmetic rather than anything this file computes.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // View: the camera, both where it stands and the lens it looks through, as
    // one matrix that turns a point in the world into a point on the screen. It
    // is the engine's `viewProjection`, fed rather than worked out here so the
    // scene can be looked at from outside the shader.
    u_view: mat4x4<f32>,
    // Model: where the one object sits in the world, the engine's `worldMatrix`
    // for it, which is its own transform with every parent's applied over the top.
    // This is the whole point of the shader: the matrix that moves the sheet is
    // the scene's, not a constant in this file.
    u_model: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Cells: how many squares the grid lines mark out along each edge of the sheet,
// so the tilt the scene gave it reads as a surface rather than as a flat card.
const CELLS: f32 = 16.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in the sheet, from one edge to the other, so
    // the fragment stage shades by the geometry rather than by the pixel it landed
    // on.
    @location(0) place: vec2<f32>,
};

@vertex
fn project(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    // Model then view: the corner is moved into the world by the scene's matrix
    // first and onto the screen by the camera after, which is the order a point
    // travels from a scene to a frame.
    var at = uniforms.u_view * uniforms.u_model * vec4<f32>(corner.x, corner.y, 0.0, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a frame
    // wider than it is tall. It is done here rather than in the projection so the
    // same camera works at any window size.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place);
}

/// How strongly the grid lines mark a point inside the sheet, from 0 between them
/// to 1 on one.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));
}

@fragment
fn surface(shaded: Surface) -> @location(0) vec4<f32> {
    // Body: a gradient down the sheet, so which way the scene tipped it is legible
    // as one edge catching more light than the other.
    let body = mix(vec3<f32>(0.10, 0.16, 0.34), vec3<f32>(0.36, 0.62, 0.92), shaded.place.y);
    let lit = mix(body, vec3<f32>(0.90, 0.95, 1.0), lines(shaded.place) * 0.5);
    return vec4<f32>(lit, 1.0);
}
