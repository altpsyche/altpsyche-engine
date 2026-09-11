#version 300 es
// Hand-authored GLSL ES 3.00 for core-material's `project` vertex (item 105).
//
// naga refuses this stage for WebGL 2: it reads `@group(1) @binding(0)
// var<storage, read> objects: array<Object>`, and GLSL ES 3.00 has no storage
// buffer, so the build's naga pass records it as a `storage-buffer` skip
// (gates/translate.mjs). Item 92 landed the *backend* raster path for exactly this
// shape — a read-only storage buffer bound whole as a std140 uniform block and
// indexed by `gl_InstanceID`, GLSL ES 3.00's answer to a read-only `array<T>` — but
// proved it with hand-authored GLSL. This is that hand-authored bake for this
// preset, so a WGSL scene's read-only storage buffer finally has a WebGL 2
// translation and item 91's selection routes the frame here rather than refusing it.
//
// The shared uniform block follows naga's own es300 shape for the corpus (see
// core-scene's baked `project`, one of the WebGL 2 draws): a std140 block whose
// members `setUniforms` writes through the driver-reported offsets. The storage
// buffer takes item 92's raster path: a std140 uniform block whose member carries
// the binding's `_group_1_binding_0` tag, which `resolveBlocks` matches to bind the
// whole buffer to its own point, and the shader reads its own record by
// `gl_InstanceID`. The `objects` array is sized to the preset's two panels, so the
// block's std140 size (2 * 80 bytes) equals the buffer the build packs.

precision highp float;
precision highp int;

struct Uniforms {
    float u_time;
    vec2 u_resolution;
    mat4x4 u_view;
};
struct Object {
    mat4x4 model;
    vec3 tint;
};

layout(std140) uniform Uniforms_block_0Vertex { Uniforms _group_0_binding_0_vs; };
layout(std140) uniform Objects_block_1Vertex { Object _group_1_binding_0[2]; };

layout(location = 0) in vec2 _p2vs_location0;
layout(location = 1) in vec2 _p2vs_location1;
smooth out vec2 _vs2fs_location0;
smooth out vec3 _vs2fs_location1;

void main() {
    vec2 corner = _p2vs_location0;
    vec2 place = _p2vs_location1;
    Object mine = _group_1_binding_0[gl_InstanceID];
    vec4 at = ((_group_0_binding_0_vs.u_view * mine.model) * vec4(corner.x, corner.y, 0.0, 1.0));
    at.x = ((at.x * _group_0_binding_0_vs.u_resolution.y) / _group_0_binding_0_vs.u_resolution.x);
    gl_Position = at;
    _vs2fs_location0 = place;
    _vs2fs_location1 = mine.tint;
    // Both axes, the same line the translator emits for every other stage
    // (item 20). These files stand in for translator output where GLSL ES 3.00
    // has no syntax for a storage buffer, so they must follow its conventions
    // exactly — a stand-in that clips space differently from the stages beside it
    // is a frame drawn two ways.
    //
    // **This said "Z only, never Y (item 107): the readback already turns the
    // frame over."** Both halves of that stopped being true. WGSL's
    // `@builtin(position)` counts rows from the top and GLSL ES 3.00's
    // `gl_FragCoord` counts from the bottom, and the negation is half of the only
    // way WebGL 2 has of reconciling them; the readback no longer turns a
    // translated frame over, because the negation has already left it top-first.
    gl_Position.yz = vec2(-gl_Position.y, gl_Position.z * 2.0 - gl_Position.w);
}
