// One sheet drawn twice over the whole frame, where the second time is clipped to a
// rectangle. What a reader sees is the second colour inside that rectangle and the
// first colour everywhere else, with a hard edge between them that no shader in this
// file draws.
//
// **What it is for.** A scissor is the one piece of core render-pass state whose
// effect is invisible in the shader: nothing here computes the rectangle, nothing
// samples it, and a backend that ignores `setScissorRect` or forgets
// `gl.enable(gl.SCISSOR_TEST)` draws the second colour over the whole frame and is
// wrong by most of the picture rather than subtly. A backend that applies the
// rectangle but flips it the wrong way round draws it in the wrong half, which is
// why the rectangle below is **off-centre in both axes**: a centred one would look
// identical under a wrong vertical flip and prove nothing.
//
// **Geometry rather than a fullscreen fragment frame, on purpose.** A fullscreen WGSL
// frame bakes no vertex stage for WebGL 2 to link, so the corpus skips it there and
// it compares nothing across the two backends — which is exactly what this preset
// exists to do. It draws the same quad grid the other geometry presets draw, so what
// is being compared is the scissor and not a primitive nothing else uses.
//
// **One entry point drawn twice, not two.** The two passes differ only in the colour
// they write and in the rectangle one of them is clipped to, and the colour comes off
// a uniform the frame already carries. Two pipelines over one pair of entry points
// keeps the difference between the passes down to the thing under test.

struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Surface {
    @builtin(position) at: vec4<f32>,
    // Place: where this corner sits in the sheet, edge to edge, so the fragment stage
    // shades by the geometry rather than by the pixel it landed on. A scissor does not
    // change this — it clips after shading — so the two passes shade a given pixel
    // identically and only one of them is allowed to keep it.
    @location(0) place: vec2<f32>,
};

@vertex
fn cover(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Surface {
    // The sheet covers the whole frame, so every pixel is shaded by both passes and
    // the only thing deciding what survives is the rectangle.
    return Surface(vec4<f32>(corner.x, corner.y, 0.0, 1.0), place);
}

// Cells: how many squares the grid lines mark out along each edge, so the picture has
// structure a comparison can see rather than being two flat fields.
const CELLS: f32 = 8.0;

/// How strongly the grid lines mark a point, 0 between them to 1 on one.
fn lines(place: vec2<f32>) -> f32 {
    let cells = place * CELLS;
    let toEdge = min(fract(cells.x), fract(cells.y));
    return 1.0 - smoothstep(0.0, 0.1, min(toEdge, 1.0 - toEdge));
}

@fragment
fn ground(shaded: Surface) -> @location(0) vec4<f32> {
    let body = mix(vec3<f32>(0.06, 0.13, 0.30), vec3<f32>(0.18, 0.42, 0.72), shaded.place.y);
    return vec4<f32>(mix(body, vec3<f32>(0.85, 0.92, 1.0), lines(shaded.place) * 0.5), 1.0);
}

@fragment
fn inset(shaded: Surface) -> @location(0) vec4<f32> {
    // A colour far from the ground's in every channel, so a scissor that was skipped
    // is a difference no tolerance absorbs.
    let body = mix(vec3<f32>(0.55, 0.16, 0.05), vec3<f32>(0.92, 0.62, 0.16), shaded.place.x);
    return vec4<f32>(mix(body, vec3<f32>(1.0, 0.97, 0.85), lines(shaded.place) * 0.5), 1.0);
}
