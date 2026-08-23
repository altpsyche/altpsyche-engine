// Draw list: several objects a scene put in the world, drawn in one pass as
// instances, where each copy reads its own model matrix out of a buffer the build
// filled from the engine's draw list. The scene preset next to this one draws a
// single object whose model matrix rides in the uniform block; here the block
// carries only the camera, and the many model matrices reach a second bind group,
// one per drawn object, read by which copy the card is drawing. So one pipeline
// draws a whole scene rather than one object placed by the block.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // View: the camera as one matrix, where it stands and the lens it looks
    // through, the engine's `viewProjection` of the scene's camera. It is fed
    // rather than worked out here so the scene can be aimed from outside the shader.
    u_view: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Second bind group: one model matrix per drawn object, in draw order, the engine's
// `worldMatrix` for each. It is read only, so the layout is a read-only storage
// buffer and nothing writes it, and it is reached by which copy the card is drawing
// rather than by anything the geometry carries.
@group(1) @binding(0) var<storage, read> models: array<mat4x4<f32>>;

// Cells: how many squares the grid lines mark out along each edge of a sheet, so
// the tilt the scene gave it reads as a surface rather than as a flat card.
const CELLS: f32 = 16.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in the sheet, from one edge to the other, so
    // the fragment stage shades by the geometry rather than by the pixel it landed
    // on.
    @location(0) place: vec2<f32>,
    // Shade: a colour for this object worked out from which copy it is, carried
    // through so every corner of one object shades the same and the objects read
    // apart from one another.
    @location(1) shade: vec3<f32>,
};

@vertex
fn project(
    @location(0) corner: vec2<f32>,
    @location(1) place: vec2<f32>,
    @builtin(instance_index) copy: u32,
) -> Surface {
    // Model then view: the corner is moved into the world by this object's own
    // matrix, read out of the buffer by which copy is being drawn, and onto the
    // screen by the camera after, which is the order a point travels to a frame.
    var at = uniforms.u_view * models[copy] * vec4<f32>(corner.x, corner.y, 0.0, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a frame
    // wider than it is tall, done here so the same camera works at any window size.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;

    // Hue: each copy spread round the colour wheel from the one before it, so an
    // object's place in the draw order is what colours it.
    let tone = f32(copy) * 2.4;
    let shade = 0.5 + 0.4 * cos(vec3<f32>(tone, tone + 2.1, tone + 4.2));
    return Surface(at, place, shade);
}

// Lines: how strongly the grid lines mark a point inside the sheet, from 0 between
// them to 1 on one, so the tilt the scene gave a sheet reads.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.08, min(toEdge, 1.0 - toEdge));
}

@fragment
fn surface(shaded: Surface) -> @location(0) vec4<f32> {
    // Body: the object's own colour, lifted toward white along the grid lines so
    // the surface reads against the ones beside it.
    let lit = mix(shaded.shade, vec3<f32>(0.95, 0.97, 1.0), lines(shaded.place) * 0.5);
    return vec4<f32>(lit, 1.0);
}
