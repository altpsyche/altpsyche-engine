#version 300 es
// Hand-authored GLSL ES 3.00 for core-draw-list's `project` vertex (item 105).
//
// naga refuses this stage for WebGL 2: it reads `@group(1) @binding(0)
// var<storage, read> models: array<mat4x4<f32>>`, and GLSL ES 3.00 has no storage
// buffer, so the build's naga pass records it as a `storage-buffer` skip. This is the
// item 92 raster path hand-authored for this preset — a read-only storage buffer
// bound whole as a std140 uniform block and indexed by `gl_InstanceID` — so a WGSL
// scene's read-only storage buffer has a WebGL 2 translation and item 91's selection
// routes the frame here rather than refusing it.
//
// The shared uniform block follows naga's own es300 shape for the corpus (see
// core-scene's baked `project`). The storage buffer takes item 92's raster path: a
// std140 uniform block whose member carries the binding's `_group_1_binding_0` tag,
// which `resolveBlocks` binds whole to its own point, indexed by `gl_InstanceID`. The
// `models` array is sized to the preset's three visible objects, so the block's
// std140 size (3 * 64 bytes) equals the buffer the build packs. The per-object shade
// is computed from the copy index, exactly as the WGSL colours each object by its
// place in the draw order.

precision highp float;
precision highp int;

struct Uniforms {
    float u_time;
    vec2 u_resolution;
    mat4x4 u_view;
};

layout(std140) uniform Uniforms_block_0Vertex { Uniforms _group_0_binding_0_vs; };
layout(std140) uniform Models_block_1Vertex { mat4x4 _group_1_binding_0[3]; };

layout(location = 0) in vec2 _p2vs_location0;
layout(location = 1) in vec2 _p2vs_location1;
smooth out vec2 _vs2fs_location0;
smooth out vec3 _vs2fs_location1;

void main() {
    vec2 corner = _p2vs_location0;
    vec2 place = _p2vs_location1;
    mat4x4 model = _group_1_binding_0[gl_InstanceID];
    vec4 at = ((_group_0_binding_0_vs.u_view * model) * vec4(corner.x, corner.y, 0.0, 1.0));
    at.x = ((at.x * _group_0_binding_0_vs.u_resolution.y) / _group_0_binding_0_vs.u_resolution.x);
    float tone = (float(gl_InstanceID) * 2.4);
    vec3 shade = (vec3(0.5) + (vec3(0.4) * cos(vec3(tone, tone + 2.1, tone + 4.2))));
    gl_Position = at;
    _vs2fs_location0 = place;
    _vs2fs_location1 = shade;
    gl_Position.yz = vec2(-gl_Position.y, gl_Position.z * 2.0 - gl_Position.w);
}
