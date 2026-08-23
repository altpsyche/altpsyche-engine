// Material: two objects a scene placed, drawn as instances of one pipeline, where
// each reads its own model matrix and its own colour out of a buffer the build
// filled. The draw-list preset next to this one hands every copy a model matrix
// alone; here each copy also carries the colour its material feeds it, so one
// pipeline draws two objects that differ in the numbers they were handed rather
// than in their code, which is the whole of a material and the reason no shader
// variant is generated per object.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
    // View: the camera as one matrix, where it stands and the lens it looks
    // through, the engine's `viewProjection` of the scene's camera. It is fed
    // rather than worked out here so the scene can be aimed from outside the shader.
    u_view: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Object: what one drawn copy carries of its own, its place in the world and the
// colour its material feeds it. The model matrix aligns to sixteen and takes
// sixty-four, and the colour aligns to sixteen and takes twelve, so one Object is
// eighty bytes with four bytes of tail padding the shader never reads, which is
// std430 for a matrix followed by a vector of three.
struct Object {
    model: mat4x4<f32>,
    tint: vec3<f32>,
};

// Second bind group: one Object per drawn copy, in draw order, reached by which
// copy the card is drawing rather than by anything the geometry carries. It is
// read only, so the layout is a read-only storage buffer and nothing writes it.
@group(1) @binding(0) var<storage, read> objects: array<Object>;

// Cells: how many squares the grid lines mark out along each edge of a sheet, so
// the tilt the scene gave it reads as a surface rather than as a flat card.
const CELLS: f32 = 16.0;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in the sheet, from one edge to the other, so
    // the fragment stage shades by the geometry rather than by the pixel it landed
    // on.
    @location(0) place: vec2<f32>,
    // Shade: the colour this object's material feeds it, carried through so every
    // corner of one object shades the same and the two objects read apart.
    @location(1) shade: vec3<f32>,
};

@vertex
fn project(
    @location(0) corner: vec2<f32>,
    @location(1) place: vec2<f32>,
    @builtin(instance_index) copy: u32,
) -> Surface {
    // Mine: the object this copy is, read out of the second bind group by which
    // copy is being drawn, so its transform and its colour arrive together.
    let mine = objects[copy];

    // Model then view: the corner is moved into the world by this object's own
    // matrix and onto the screen by the camera after, which is the order a point
    // travels to a frame.
    var at = uniforms.u_view * mine.model * vec4<f32>(corner.x, corner.y, 0.0, 1.0);

    // Aspect: squeezes the picture across so a square sheet stays square on a frame
    // wider than it is tall, done here so the same camera works at any window size.
    at.x = at.x * uniforms.u_resolution.y / uniforms.u_resolution.x;
    return Surface(at, place, mine.tint);
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
    // the surface reads against the one beside it.
    let lit = mix(shaded.shade, vec3<f32>(0.95, 0.97, 1.0), lines(shaded.place) * 0.5);
    return vec4<f32>(lit, 1.0);
}
