/**
 * The corpus this package measures itself against, and the data three of its
 * fixtures are drawn from.
 *
 * Every scene, camera and material here exists so a fixture has something to
 * draw. None of it is published: this directory is outside what the build config
 * compiles, so nothing under it reaches a consumer.
 */
import type { DeclaredFrame } from './declared-frame';
import { mat4, vec3 } from '@altpsyche/engine';
import { type Camera, type Scene, viewProjection, worldMatrix } from '@altpsyche/engine';
import { drawList } from '@altpsyche/engine';
import { type Material, batchOnePipeline } from '@altpsyche/engine';

/**
 * The scene the `core-scene` fixture draws, and the camera that watches it. It is
 * fixture data rather than content the package ships, since nothing under this
 * directory is published, and it is the whole reason the fixture draws what it
 * draws: the two matrices its block carries are worked out from this by the
 * engine below, so the object on screen sits where these transforms put it.
 *
 * The object hangs off a parent, so its place in the world is the two transforms
 * multiplied rather than its own alone, which is what makes the preset exercise
 * the hierarchy rather than a single matrix.
 */
export const SCENE_CAMERA: Camera = {
  eye: vec3(0, 0, 0),
  target: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  fovY: Math.PI / 3,
  aspect: 1,
  near: 0.5,
  far: 5,
};

export const SCENE: Scene = {
  entities: [
    {
      id: 'anchor',
      transform: { position: vec3(0.15, 0, -2.3), rotation: mat4.rotationY(0.6), scale: vec3(1, 1, 1) },
    },
    {
      id: 'panel',
      parent: 'anchor',
      transform: { position: vec3(0, 0, 0), rotation: mat4.rotationX(-0.4), scale: vec3(0.75, 0.75, 0.75) },
    },
  ],
};

/** The object the preset draws, named so the entry and the test that guards it
 * ask the scene for the same one. */
export const SCENE_OBJECT = 'panel';

// Sixteen column-major numbers each, which is what a mat4x4 uniform holds, so the
// two matrices the scene produces go into the block as their own bytes.
const SCENE_VIEW = Array.from(mat4.pack(viewProjection(SCENE_CAMERA)));
const SCENE_MODEL = Array.from(mat4.pack(worldMatrix(SCENE, SCENE_OBJECT)));

/**
 * The scene the `core-draw-list` preset draws, and the camera that watches it.
 * Where `core-scene` places one object through the block, this places several and
 * hands the card a whole draw list: a hidden anchor sits in front of the camera
 * and positions three sheets hanging off it, so the engine's `drawList` leaves the
 * anchor out of the picture while its transform still places the sheets, and the
 * frame draws exactly the three visible objects.
 *
 * It lives here beside `SCENE` because every fixture scene has one home in this
 * catalog. The build fills the per-object buffer from it
 * through the `draw-list-models` generator, which reads this same scene rather
 * than a copy of it.
 */
export const DRAW_LIST_CAMERA: Camera = {
  eye: vec3(0, 0, 0),
  target: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  fovY: Math.PI / 3,
  aspect: 1,
  near: 0.5,
  far: 6,
};

export const DRAW_LIST_SCENE: Scene = {
  entities: [
    {
      id: 'rack',
      visible: false,
      transform: { position: vec3(0, 0, -3.2), rotation: mat4.rotationY(0.35), scale: vec3(1, 1, 1) },
    },
    {
      id: 'left',
      parent: 'rack',
      order: 0,
      transform: { position: vec3(-1.05, 0, 0), rotation: mat4.rotationX(-0.35), scale: vec3(0.5, 0.5, 0.5) },
    },
    {
      id: 'middle',
      parent: 'rack',
      order: 1,
      transform: { position: vec3(0, 0, 0.35), rotation: mat4.rotationX(-0.1), scale: vec3(0.5, 0.5, 0.5) },
    },
    {
      id: 'right',
      parent: 'rack',
      order: 2,
      transform: { position: vec3(1.05, 0, 0), rotation: mat4.rotationX(0.35), scale: vec3(0.5, 0.5, 0.5) },
    },
  ],
};

// How many objects the scene draws, which is its visible entities, and how big the
// per-object buffer is, one sixty-four-byte mat4 apiece. Both come off the engine's
// draw list rather than being counted by hand, so the instance count, the buffer
// size and the bytes the build writes cannot fall out of step with the scene.
const DRAW_LIST_MAT4_BYTES = 64;
export const DRAW_LIST_OBJECTS = drawList(DRAW_LIST_SCENE).length;
const DRAW_LIST_BYTES = DRAW_LIST_OBJECTS * DRAW_LIST_MAT4_BYTES;
const DRAW_LIST_VIEW = Array.from(mat4.pack(viewProjection(DRAW_LIST_CAMERA)));

/**
 * The scene, the camera and the materials the `core-material` preset draws. Where
 * `core-draw-list` hands every object a model matrix and colours it by its place
 * in the order, this hands each object a material, and the material is what
 * colours it: two panels share one pipeline and differ only in the colour their
 * material feeds them, which is the whole of a material and the reason no shader
 * variant is generated per object.
 *
 * The colour is the material's own value here, so a scene entity names a material
 * and the table below turns that name into a pipeline and a colour. The build
 * fills the per-object buffer from this scene and this table through the engine's
 * `batch` and the `material-objects` generator, reading the same scene the camera
 * is aimed at rather than a copy of it.
 */
export const MATERIAL_CAMERA: Camera = {
  eye: vec3(0, 0, 0),
  target: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  fovY: Math.PI / 3,
  aspect: 1,
  near: 0.5,
  far: 6,
};

/** What a panel's material feeds its pipeline, which is a colour and nothing
 * else. A separate type so the buffer generator and the tests read the same
 * shape the shader's `Object` struct lays out. */
export type PanelMaterial = { tint: [number, number, number] };

/** Two materials naming one pipeline, so the batch that draws them is one
 * pipeline drawing two objects that differ only in their colour. */
export const MATERIALS: Record<string, Material<PanelMaterial>> = {
  warm: { pipeline: 'surface', values: { tint: [0.9, 0.45, 0.3] } },
  cool: { pipeline: 'surface', values: { tint: [0.3, 0.55, 0.9] } },
};

export const MATERIAL_SCENE: Scene = {
  entities: [
    {
      id: 'stage',
      visible: false,
      transform: { position: vec3(0, 0, -3), rotation: mat4.rotationY(0.2), scale: vec3(1, 1, 1) },
    },
    {
      id: 'left',
      parent: 'stage',
      material: 'warm',
      order: 0,
      transform: { position: vec3(-0.8, 0, 0), rotation: mat4.rotationX(-0.2), scale: vec3(0.6, 0.6, 0.6) },
    },
    {
      id: 'right',
      parent: 'stage',
      material: 'cool',
      order: 1,
      transform: { position: vec3(0.8, 0, 0), rotation: mat4.rotationX(0.2), scale: vec3(0.6, 0.6, 0.6) },
    },
  ],
};

// The batch the scene and the materials produce, worked out once so the pass
// pipeline, the instance count and the buffer size all come off it rather than
// being written by hand. The pipeline the pass names is the batch's shared one,
// so an object naming a different pipeline stops the preset here rather than
// drawing on the wrong program.
export const MATERIAL_BATCH = batchOnePipeline(MATERIAL_SCENE, MATERIALS);
export const MATERIAL_OBJECTS = MATERIAL_BATCH.draws.length;
// A model matrix of sixteen floats and a colour of three with a padding word, one
// eighty-byte Object apiece, which is what the shader's `array<Object>` element is.
const MATERIAL_OBJECT_BYTES = 80;
const MATERIAL_BYTES = MATERIAL_OBJECTS * MATERIAL_OBJECT_BYTES;
const MATERIAL_VIEW = Array.from(mat4.pack(viewProjection(MATERIAL_CAMERA)));

/**
 * The shaders that exist to exercise one capability of the renderer.
 *
 * Each one is reached by nothing a reader can click. They are here so the gates
 * that draw every graph have something to draw for every capability, which is
 * the condition a capability built ahead of a lesson is worth having under, and a
 * gate reading these rather than some website's build is what lets a clone of this
 * package measure itself with nothing else on the machine.
 *
 * An entry carries only what a source cannot say about itself: which file it is,
 * which language it is in, the values its uniforms start at, and its frame. The
 * fields a website's own corpus needs, a title, a summary, a date and a category,
 * are not here, because a library that knew a content schema would be a library
 * some website had reached into.
 */
export interface CapabilityFixture {
  id: string;
  language: 'wgsl';
  /** The file under `source/`, written out rather than derived from the id, so a
   * reader of an entry can see which file it draws without knowing a rule. */
  source: string;
  uniforms: { name: string; type: string; value: number | number[] }[];
  /** Required rather than optional, because a shader with nothing to declare is
   * one pass over the whole frame and there is no capability in that to draw. */
  frame: DeclaredFrame;
}

export const CAPABILITY_FIXTURES: CapabilityFixture[] = [
  {
    id: 'core-compute',
    language: 'wgsl',
    source: 'core-compute.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // As big as the picture, so the texture is rebuilt when the reader resizes
      // the window and what it held is gone, which is what a shader writing every
      // pixel of it every frame wants.
      textures: [{ name: 'picture', size: ['frame', 'frame'] }],
      // The whole frame in blocks of the size the source declares, so an edge
      // that does not divide by that size is covered by a block running past it
      // rather than left unwritten.
      passes: [{ pipeline: 'paint', dispatch: 'frame' }],
      present: 'picture',
    },
  },
  {
    id: 'core-texture',
    language: 'wgsl',
    source: 'core-texture.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Sixty-four pixels square, which is small enough that a reader downloads
      // 16 KB for it and large enough that three octaves of noise have somewhere
      // to put their finest one. It is a fixed size rather than the frame's,
      // because the bytes arrive once and a texture following the frame is
      // thrown away on every resize.
      textures: [{ name: 'grain', size: [64, 64], content: 'value-noise' }],
      // Smooth, because the picture is stretched over a frame many times its own
      // size and reading the nearest pixel would show it as squares. Repeating,
      // because the source tiles the picture three times across and the value
      // noise is generated to join up with itself.
      samplers: [{ name: 'grainSampler', filter: 'linear', wrap: 'repeat' }],
      passes: [{ pipeline: 'fragMain' }],
    },
  },
  {
    id: 'core-state',
    language: 'wgsl',
    source: 'core-state.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Two hundred and fifty-six cells square, which is a fixed size rather
      // than the frame's for the reason the whole shader exists: a texture that
      // follows the frame is thrown away when the reader drags the window and
      // everything the field had grown goes with it. The pattern's features are
      // also a few cells across, so how coarse the picture looks is this number
      // rather than the window's.
      pairs: [{ read: 'previous', write: 'next', size: [256, 256] }],
      // Smooth, because a grid of 256 is stretched over a frame hundreds of
      // pixels across and reading the nearest cell would show it as squares.
      // Held at the edge rather than repeating, since the picture covers the
      // frame exactly once.
      samplers: [{ name: 'stateSampler', filter: 'linear', wrap: 'clamp' }],
      // The grid in blocks of the size the source declares, then the frame drawn
      // from what that pass left behind. The order is what makes it a field
      // rather than two unrelated pictures.
      passes: [{ pipeline: 'step', dispatch: { over: 'next' } }, { pipeline: 'shade' }],
    },
  },
  {
    id: 'core-geometry',
    language: 'wgsl',
    source: 'core-geometry.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Sixteen quads across and down, which is enough corners for a ridge to
      // read as a curve rather than as a fold and few enough that the whole
      // primitive is 400 vertices.
      geometry: [{ name: 'grid', primitive: 'quad-grid', size: [16, 16] }],
      // Three copies side by side, each one out of step with the last, which is
      // what makes the instance count something a reader can see.
      passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'grid', instances: 3 }],
    },
  },
  {
    id: 'core-perdraw',
    language: 'wgsl',
    source: 'core-perdraw.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Sixteen quads across and down, which is the grid the geometry preset
      // draws: enough corners for a ridge to read as a curve and few enough that
      // the whole primitive is 400 vertices.
      geometry: [{ name: 'grid', primitive: 'quad-grid', size: [16, 16] }],
      // Four copies' worth of numbers, sixteen bytes a copy, filled by the build
      // rather than worked out on the card. A read-only storage buffer the source
      // binds in a group of its own, so the draw sets it once and every copy reads
      // its own slice of it by which copy is being drawn.
      buffers: [{ name: 'copies', bytes: 64, content: 'copy-tints' }],
      // Four copies side by side, each one out of step with the last and coloured
      // by the numbers it was handed, which is what makes per-copy data something a
      // reader can see rather than only trace.
      passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'grid', instances: 4 }],
    },
  },
  {
    id: 'core-depth',
    language: 'wgsl',
    source: 'core-depth.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // A projection reaching from half a unit in front of the camera to five,
      // over sixty degrees of view, written column by column because that is the
      // order the card reads a matrix out of memory. It is fed rather than worked
      // out in the shader so that where the pair is seen from is the caller's,
      // and a stride the layout got wrong shows up as a picture with nothing in
      // it rather than only as a failing test.
      {
        name: 'u_place',
        type: 'mat4',
        value: [1.7320508, 0, 0, 0, 0, 1.7320508, 0, 0, 0, 0, -1.1111111, -1, 0, 0, -0.5555556, 0],
      },
    ],
    frame: {
      // Sixteen quads across and down, which is the same grid the geometry preset
      // draws: enough corners that a leaning sheet reads as a surface and few
      // enough that the whole primitive is 289 corners.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
      // Both pictures follow the frame, so they are rebuilt when the reader
      // resizes the window, and so does the depth: a distance kept at one size
      // and tested at another would decide which surface is in front out of the
      // wrong pixels.
      attachments: [
        { name: 'picture', size: ['frame', 'frame'], format: 'rgba8unorm' },
        { name: 'distance', size: ['frame', 'frame'], format: 'rgba8unorm' },
        { name: 'depth', size: ['frame', 'frame'], format: 'depth24plus' },
      ],
      passes: [
        // The sheet leaning away first, emptying both pictures and the depth. Its
        // distances are what the second pass is tested against, which is why it
        // leaves them behind.
        {
          pipeline: 'farther',
          vertex: 'away',
          geometry: 'sheet',
          colour: [
            { resource: 'picture', clear: [0, 0, 0, 1] },
            { resource: 'distance', clear: [0, 0, 0, 1] },
          ],
          depth: { resource: 'depth', clear: 1, compare: 'less', write: true },
        },
        // The sheet leaning toward the camera second, drawn only where it is
        // nearer than the first and mixed into what is already there. Its depth
        // is not written, so the sheet behind it is still what the picture holds
        // underneath rather than being hidden by a surface you can see through.
        {
          pipeline: 'nearer',
          vertex: 'toward',
          geometry: 'sheet',
          colour: [{ resource: 'picture', blend: 'over' }, { resource: 'distance' }],
          depth: { resource: 'depth', compare: 'less', write: false },
        },
      ],
      present: 'picture',
    },
  },
  {
    id: 'core-target',
    language: 'wgsl',
    source: 'core-target.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Twenty-four quads across and down, which is fine enough that the grid
      // lines the second pass sharpens are worth sharpening.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [24, 24] }],
      // The frame's own size, so a pixel of the picture the first pass drew is a
      // pixel of the frame the second pass writes and nothing is softened between
      // the two. The entry declares how big it is and what it holds because no
      // source can say either, and that the second pass reads it is the source's
      // own sampled declaration rather than a word repeated here.
      attachments: [{ name: 'scene', size: ['frame', 'frame'], format: 'rgba8unorm' }],
      // Held at the edge rather than repeating, since the picture covers the frame
      // exactly once and a vignette reads right up to it.
      samplers: [{ name: 'sceneSampler', filter: 'linear', wrap: 'clamp' }],
      passes: [
        // The sheet into the texture first, emptied to black so the margin around
        // it is something the second pass can darken.
        {
          pipeline: 'paint',
          vertex: 'warp',
          geometry: 'sheet',
          colour: [{ resource: 'scene', clear: [0, 0, 0, 1] }],
        },
        // Then the frame itself, covered by the backend's three corners, which is
        // the pass that reads the picture back. It names no attachment, so what it
        // writes is the frame the reader sees.
        { pipeline: 'grade' },
      ],
    },
  },
  {
    id: 'core-mips',
    language: 'wgsl',
    source: 'core-mips.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Two hundred and fifty-six pixels square, which is nine levels of ladder:
      // enough steps that the climb across the frame has somewhere to go, where the
      // sampling preset's 64 would run out after seven. The backend draws every
      // level below the first, and how many there are comes off this size.
      textures: [{ name: 'grain', size: [256, 256], content: 'value-noise', mips: 'generate' }],
      // Smooth, because a level between two whole numbers is a mix of the two
      // copies either side of it and reading the nearest pixel would show the steps
      // as hard edges. Repeating, because the source tiles the picture three times
      // across and the value noise joins up with itself.
      samplers: [{ name: 'grainSampler', filter: 'linear', wrap: 'repeat' }],
      passes: [{ pipeline: 'fragMain' }],
    },
  },
  {
    id: 'core-multisample',
    language: 'wgsl',
    source: 'core-multisample.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // The same projection the depth preset is aimed with, reaching from half a
      // unit in front of the camera to five over sixty degrees of view, written
      // column by column because that is the order the card reads a matrix out of
      // memory. It is what leaves the sheet's edges at an angle to the pixels,
      // which is the only place averaging several readings shows.
      {
        name: 'u_place',
        type: 'mat4',
        value: [1.7320508, 0, 0, 0, 0, 1.7320508, 0, 0, 0, 0, -1.1111111, -1, 0, 0, -0.5555556, 0],
      },
    ],
    frame: {
      // Sixteen quads across and down, which is the grid the geometry and depth
      // presets draw. What matters here is the outline rather than the corners
      // inside it, since that outline is the only edge the card can average.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
      // Both follow the frame, so both are rebuilt when the reader resizes the
      // window: an average and the readings it came from have to be the same
      // picture, and a pair of textures one of which followed the window would
      // stop being that after the first drag.
      attachments: [
        { name: 'edges', size: ['frame', 'frame'], format: 'rgba8unorm', samples: 4 },
        { name: 'flat', size: ['frame', 'frame'], format: 'rgba8unorm' },
      ],
      // Emptied to nothing at all rather than to black, so a pixel the outline
      // crosses comes back with the fraction of itself the sheet covered sitting
      // in its fourth channel, where a picture cleared to opaque black would give
      // every pixel the same one.
      passes: [
        {
          pipeline: 'shade',
          vertex: 'lean',
          geometry: 'sheet',
          colour: [{ resource: 'edges', clear: [0, 0, 0, 0], resolve: 'flat' }],
        },
      ],
      present: 'flat',
    },
  },
  {
    id: 'core-indirect',
    language: 'wgsl',
    source: 'core-indirect.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
    ],
    frame: {
      // Three words for the dispatch and four for the draw, which are the two
      // fixed arrangements the card reads counts in. They are two buffers rather
      // than one because a pass reads from the start of the buffer it names, so a
      // second set of words after the first could not be reached.
      buffers: [
        { name: 'blocks', bytes: 12 },
        { name: 'copies', bytes: 16 },
      ],
      // Two hundred and fifty-six cells square, which is a fixed size rather than
      // the frame's for the reason the pair exists: what the painting pass leaves
      // outside the band it covered is what the frame before it drew, and a
      // texture following the window would throw that away on every drag.
      pairs: [{ read: 'shown', write: 'painted', size: [256, 256] }],
      // Smooth, because a grid of 256 is stretched over a frame hundreds of pixels
      // across and reading the nearest cell would show it as squares. Held at the
      // edge, since the grid covers the frame exactly once.
      samplers: [{ name: 'shownSampler', filter: 'linear', wrap: 'clamp' }],
      // The planning pass first, at one block because the words it writes are one
      // small piece of work. Then the painting pass over however many blocks it
      // asked for, and then the frame itself, drawn as much as the other set of
      // words says.
      passes: [
        { pipeline: 'plan', dispatch: [1, 1, 1] },
        { pipeline: 'paint', dispatch: { indirect: 'blocks' } },
        { pipeline: 'shade', indirect: 'copies' },
      ],
    },
  },
  {
    id: 'core-report',
    language: 'wgsl',
    source: 'core-report.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // The same projection the depth preset is aimed with, written column by
      // column because that is the order the card reads a matrix out of memory.
      {
        name: 'u_place',
        type: 'mat4',
        value: [1.7320508, 0, 0, 0, 0, 1.7320508, 0, 0, 0, 0, -1.1111111, -1, 0, 0, -0.5555556, 0],
      },
      // Centred over the sheet behind it to begin with, so the count starts low
      // and climbs as this is fed down towards nothing.
      { name: 'u_cover', type: 'float', value: 1 },
    ],
    frame: {
      // Twelve quads across and down, which is enough corners for a sheet to read
      // as a surface and few enough that the whole primitive is 169 of them.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [12, 12] }],
      // Sixteen bytes for the pair of times and eight for the count, which are
      // what the card writes each answer as. Neither is bound by the source: the
      // card writes them and a caller reads them back, so nothing in the shader
      // touches either.
      buffers: [
        { name: 'took', bytes: 16 },
        { name: 'seen', bytes: 8 },
      ],
      // The picture and the distances both follow the frame, so a reader resizing
      // the window gets a depth kept at the size it is tested at.
      attachments: [
        { name: 'picture', size: ['frame', 'frame'], format: 'rgba8unorm' },
        { name: 'depth', size: ['frame', 'frame'], format: 'depth24plus' },
      ],
      passes: [
        // The near sheet first, emptying the picture and the depth, and leaving its
        // distances behind for the pass after it to be tested against.
        {
          pipeline: 'nearer',
          vertex: 'front',
          geometry: 'sheet',
          colour: [{ resource: 'picture', clear: [0, 0, 0, 1] }],
          depth: { resource: 'depth', clear: 1, compare: 'less', write: true },
        },
        // The far sheet second, drawn only where the near one is not already in
        // front of it, which is what makes the count of samples worth taking: it
        // falls as the near sheet covers more of this one. The times are taken at
        // the two ends of this pass rather than the first, so what they measure is
        // the work the count is about.
        {
          pipeline: 'farther',
          vertex: 'behind',
          geometry: 'sheet',
          colour: [{ resource: 'picture' }],
          depth: { resource: 'depth', compare: 'less', write: false },
          visible: 'seen',
          timed: 'took',
        },
      ],
      present: 'picture',
    },
  },
  {
    id: 'core-stencil',
    language: 'wgsl',
    source: 'core-stencil.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // The same projection the depth preset is aimed with, written column by
      // column because that is the order the card reads a matrix out of memory.
      {
        name: 'u_place',
        type: 'mat4',
        value: [1.7320508, 0, 0, 0, 0, 1.7320508, 0, 0, 0, 0, -1.1111111, -1, 0, 0, -0.5555556, 0],
      },
    ],
    frame: {
      // Eight quads across and down, which is enough corners for the mark to have
      // a straight edge once the sheet is turned.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [8, 8] }],
      // The mask keeps no distances at all, since nothing here is behind anything
      // else: what the second pass tests is whether the first one drew, not how
      // far away it was. Both follow the frame, so a reader resizing the window
      // gets a mask the size of the picture it cuts.
      attachments: [
        { name: 'picture', size: ['frame', 'frame'], format: 'rgba8unorm' },
        { name: 'mask', size: ['frame', 'frame'], format: 'stencil8' },
      ],
      passes: [
        // The sheet first, emptying the picture and the mask and leaving the mark
        // wherever it drew. Its own colour is what a reader sees outside the cut.
        {
          pipeline: 'marking',
          vertex: 'shape',
          geometry: 'sheet',
          colour: [{ resource: 'picture', clear: [0, 0, 0, 1] }],
          depth: { resource: 'mask', stencilClear: 0, stencil: 'mark' },
        },
        // The field second, over the backend's own three corners so it covers the
        // frame, drawn only where the mark is and keeping the mask as it found it.
        // It keeps the picture as well, so what it does not reach is the sheet.
        {
          pipeline: 'filling',
          colour: [{ resource: 'picture' }],
          depth: { resource: 'mask', stencil: 'inside' },
        },
      ],
      present: 'picture',
    },
  },
  {
    id: 'core-scene',
    language: 'wgsl',
    source: 'core-scene.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // The camera as one matrix, where it stands and the lens it looks through,
      // the engine's `viewProjection` of the scene's camera. It is written column
      // by column because that is the order the card reads a matrix out of memory,
      // and it is fed rather than worked out in the shader so the scene can be
      // aimed from outside it.
      { name: 'u_view', type: 'mat4', value: SCENE_VIEW },
      // Where the object sits in the world, the engine's `worldMatrix` for it,
      // which is its own transform with its parent's applied over the top. This is
      // the value the whole preset exists to show landing in the block.
      { name: 'u_model', type: 'mat4', value: SCENE_MODEL },
    ],
    frame: {
      // Sixteen quads across and down, which is the grid the geometry preset
      // draws: enough corners that a tilted sheet reads as a surface and few enough
      // that the whole primitive is 289 of them.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
      // One object, so one instance: the count is left out, which the frame reads
      // as one.
      passes: [{ pipeline: 'surface', vertex: 'project', geometry: 'sheet' }],
    },
  },
  {
    id: 'core-draw-list',
    language: 'wgsl',
    source: 'core-draw-list.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // The camera as one matrix, where it stands and the lens it looks through,
      // the engine's `viewProjection` of the scene's camera. It is written column
      // by column because that is the order the card reads a matrix out of memory,
      // and it is fed rather than worked out in the shader so the scene can be aimed
      // from outside it. The per-object model matrices are not here: they are in the
      // buffer below, one per drawn object.
      { name: 'u_view', type: 'mat4', value: DRAW_LIST_VIEW },
    ],
    frame: {
      // Sixteen quads across and down, which is the grid the scene preset draws:
      // enough corners that a tilted sheet reads as a surface and few enough that
      // the whole primitive is 289 of them.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
      // One model matrix per drawn object, sixty-four bytes apiece, filled by the
      // build from the engine's draw list of the scene rather than worked out on the
      // card. A read-only storage buffer the source binds in a group of its own, so
      // the draw sets it once and every copy reads its own matrix by which copy is
      // being drawn.
      buffers: [{ name: 'models', bytes: DRAW_LIST_BYTES, content: 'draw-list-models' }],
      // As many copies as the scene has visible objects, each reading its own model
      // matrix, which is what turns a draw list into a frame.
      passes: [{ pipeline: 'surface', vertex: 'project', geometry: 'sheet', instances: DRAW_LIST_OBJECTS }],
    },
  },
  {
    id: 'core-material',
    language: 'wgsl',
    source: 'core-material.wgsl',
    uniforms: [
      { name: 'u_time', type: 'float', value: 0 },
      { name: 'u_resolution', type: 'vec2', value: [800, 600] },
      // The camera as one matrix, the engine's `viewProjection` of the scene's
      // camera, written column by column because that is the order the card reads a
      // matrix out of memory and fed rather than worked out here so the scene can
      // be aimed from outside the shader. The per-object matrices and colours are
      // not here: they are in the buffer below, one Object per drawn object.
      { name: 'u_view', type: 'mat4', value: MATERIAL_VIEW },
    ],
    frame: {
      // Sixteen quads across and down, the grid the scene preset draws: enough
      // corners that a tilted sheet reads as a surface and few enough that the whole
      // primitive is 289 of them.
      geometry: [{ name: 'sheet', primitive: 'quad-grid', size: [16, 16] }],
      // One Object per drawn object, eighty bytes apiece, filled by the build from
      // the engine's batch of the scene and the materials rather than worked out on
      // the card. A read-only storage buffer the source binds in a group of its
      // own, so the draw sets it once and every copy reads its own matrix and
      // colour by which copy is being drawn.
      buffers: [{ name: 'objects', bytes: MATERIAL_BYTES, content: 'material-objects' }],
      // As many copies as the batch has objects, each reading its own material's
      // values, which is what makes two objects sharing a pipeline read apart.
      passes: [
        { pipeline: MATERIAL_BATCH.pipeline, vertex: 'project', geometry: 'sheet', instances: MATERIAL_OBJECTS },
      ],
    },
  },
];

export const isCapabilityFixture = (id: string): boolean => CAPABILITY_FIXTURES.some((one) => one.id === id);
