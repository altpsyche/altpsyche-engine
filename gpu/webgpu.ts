/**
 * The second backend, drawing the WGSL the build emits.
 *
 * The device arrives from outside rather than being asked for here, because
 * asking a browser for one is two awaits and every caller builds a renderer in
 * one call. The choice of backend and the device that comes with it are made
 * before the frame is fetched, since a reader is sent the target their
 * backend takes and not both.
 *
 * A shader that this refuses is refused after the fact. WebGPU reports a bad
 * pipeline through the device rather than by throwing where it was made, so the
 * message arrives a moment later, on the callback the caller hands in, carrying
 * the compiler's own line and column. A reader typing WGSL is exactly the case
 * that needs it, since the source on screen is theirs rather than one the gate
 * has drawn.
 */
import type {
  BindingSpec,
  Backend,
  DeviceReport,
  DrawSpec,
  IndexResource,
  PassSpec,
  RenderPassSpec,
  RenderPipelineSpec,
  SamplerResource,
  FrameGraph,
  StencilMode,
  ShaderProgram,
  TextureResource,
  UniformValue,
  VertexResource,
} from '../graph/types.js';
import {
  groupsIndirectly,
  drawsCorners,
  drawsIndirectly,
  isRenderPass,
  moduleOf,
  perDrawBinding,
  resourceOf,
  uniformResourceOf,
} from '../graph/types.js';
import type { FrameTraffic } from '../graph/types.js';
import { followsFrame, sizeAt, sizeKey } from '../graph/refs.js';
import { Arena } from '../resource/arena.js';
import type { Handle } from '../resource/arena.js';
import { planFramePasses } from '../submit/plan.js';
import type { DrawnGeometry, FramePlan } from '../submit/plan.js';
import { runFrame, issueDraws } from '../submit/execute.js';
import type { ResolvedGeometry, ResolvedRun } from '../submit/execute.js';
import { frameStores, mergeGroups } from '../graph/attachments.js';
import { PIPELINE_CACHE_LIMIT, PipelineCache, pipelineStructureOf } from '../pipeline/cache.js';

/** What the pipeline cache holds for one structure: the compiled pipeline and the
 * group-0 layouts its bindings ask for, plus the bands those layouts were built
 * from. All three are the static lifetime — they depend on the pipeline's
 * structure and nothing a program allocates — so they are cached together and a
 * program builds its own bind groups against the layouts. */
type CachedPipeline = {
  pipeline: GPURenderPipeline | GPUComputePipeline;
  layouts: GPUBindGroupLayout[];
  bands: BindingSpec[][];
};

/** What this backend allocates through the arena: the resident resources of §5,
 * which is everything with a lifetime longer than a compilation and shorter than
 * the program is not — a pipeline is the static lifetime and stays with the
 * pipeline cache. A sampler alone has no `destroy`, so the disposer skips it and
 * frees the rest through the object the way the backend used to. */
type GpuResource = GPUBuffer | GPUTexture | GPUSampler | GPUQuerySet;
const disposeGpuResource = (resource: GpuResource): void => {
  if ('destroy' in resource) (resource as GPUBuffer | GPUTexture | GPUQuerySet).destroy();
};

/** The three corners that cover the frame in one triangle, drawn whenever a
 * pipeline asks for `fullscreen` rather than naming a vertex document of its
 * own. It is written here rather than emitted per shader because it never
 * varies, and Slang emits a fragment entry point alone. */
const FULLSCREEN_TRIANGLE = `
@vertex
fn main(@builtin(vertex_index) corner : u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[corner], 0.0, 1.0);
}`;

/** The program that draws one level of a ladder from the level above it, which is
 * a read of the bigger level averaged into the smaller one by the sampler. It is
 * written here for the same reason the three corners are: nothing about it varies
 * per shader, and WebGPU makes no levels of its own.
 *
 * A sampled read at the middle of each of the smaller level's pixels is four
 * pixels of the bigger one averaged, because a linear sampler reads between
 * pixels and the smaller level's middles fall exactly between them. */
const DOWNSAMPLE = `
@group(0) @binding(0) var above : texture_2d<f32>;
@group(0) @binding(1) var averaging : sampler;

@fragment
fn main(@builtin(position) at : vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(above, 0)) * 0.5;
  return textureSample(above, averaging, at.xy / size);
}`;

/** Asked for rather than taking the browser's preferred format, so a frame read
 * back off this backend has its channels in the order WebGL hands them over and
 * the two can be compared byte for byte. The preferred format is the other order
 * on most machines. */
const FORMAT: GPUTextureFormat = 'rgba8unorm';

/** A texture is copied back in rows padded to this, so the rows are repacked
 * before anything reads them. */
const ROW_ALIGNMENT = 256;

/** A uniform block is written in whole 16 byte lumps whatever its members
 * measure, so the buffer is rounded up to one. */
const BLOCK_ALIGNMENT = 16;

/** Every bit of the mask, which is what both modes read and what marking writes.
 * A mask of several layers would need its own bits and its own reference, and
 * nothing here draws one. */
const STENCIL_BITS = 0xff;

/** What each mode does to the mask, in the card's own fields. Both faces of a
 * triangle get the same operations, since a mask has no front and back a picture
 * could tell apart, and only marking writes: a pass drawn inside the mask leaves
 * it exactly as it found it, so a third pass could be cut by the same shape. */
const STENCIL_MODES: Record<StencilMode, { face: GPUStencilFaceState; writes: number }> = {
  mark: {
    face: { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'replace' },
    writes: STENCIL_BITS,
  },
  inside: {
    face: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
    writes: 0,
  },
};

/** The optional part of the API a timed pass needs. A device without it draws the
 * pass and leaves its buffer alone, since a picture that arrives untimed is still
 * the picture. */
const TIMING = 'timestamp-query';

/** The compiler's own words about a module it would not take, in the shape an
 * editor shows a diagnostic: where it is, then what is wrong. Only errors are
 * passed on, since a warning is a module that still draws. */
function refusal(info: GPUCompilationInfo): string | null {
  const errors = info.messages.filter((message) => message.type === 'error');
  if (errors.length === 0) return null;
  return errors
    .map((message) =>
      message.lineNum > 0 ? `line ${message.lineNum}:${message.linePos}: ${message.message}` : message.message
    )
    .join('\n');
}

export function createWebGPUBackend(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  device: GPUDevice,
  onRefused?: (message: string) => void
): Backend | null {
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) return null;

  // One arena for the backend's whole life. Every buffer, texture, sampler and
  // query set it allocates is allocated through here and freed through here, so a
  // handle to a freed slot is caught rather than resolving to the slot's next
  // occupant. A program allocates into it and frees its own handles on dispose;
  // the backend's own target and averaging sampler outlive every program and are
  // freed when the backend is.
  const arena = new Arena<GpuResource>(disposeGpuResource);

  // One pipeline cache for the backend's whole life, shared across every program it
  // builds (item 63). Two programs whose frames differ only in resident data — one
  // material's pipeline drawn over two meshes — share the one pipeline their
  // structures key to, so the second compiles none. It is bounded so the sharing
  // cannot grow card memory without end: past `PIPELINE_CACHE_LIMIT` distinct
  // structures it frees the least-recently-requested. A WebGPU pipeline the GC
  // reclaims once nothing references it, so an eviction is a dropped reference with
  // no `onEvict`; a live program keeps its own reference to any pipeline it resolved,
  // so eviction bounds reuse, never liveness. Item 15 scoped this per program because
  // an unbounded shared cache was the hazard; the bound is what lets it be shared.
  const pipelineCache = new PipelineCache<CachedPipeline>({ bound: PIPELINE_CACHE_LIMIT });

  const fullscreen = device.createShaderModule({ code: FULLSCREEN_TRIANGLE });

  /** How many levels a texture of this size has, which is a halving at a time
   * until a side reaches one pixel. It is worked out from the size rather than
   * declared, because a count that disagrees with the size is a level the card
   * either refuses to make or never fills. */
  const levelsOf = (across: number, down: number) => Math.floor(Math.log2(Math.max(across, down))) + 1;

  /** The pipeline, the sampler and the layout the ladder is drawn with, built once
   * for the backend rather than per texture, since every ladder is drawn the same
   * way. It is built on the first ladder so a backend drawing none never makes it. */
  let ladder: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout; sampler: GPUSampler } | null = null;
  const ladderParts = () => {
    if (ladder) return ladder;
    const layout = device.createBindGroupLayout({
      label: 'ladder-bindings',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    ladder = {
      layout,
      sampler: arena.resolve(
        arena.allocate(() => device.createSampler({ label: 'averaging', magFilter: 'linear', minFilter: 'linear' }))
      ) as GPUSampler,
      pipeline: device.createRenderPipeline({
        layout: device.createPipelineLayout({ label: 'ladder-layout', bindGroupLayouts: [layout] }),
        vertex: { module: fullscreen, entryPoint: 'main' },
        fragment: {
          module: device.createShaderModule({ label: 'ladder', code: DOWNSAMPLE }),
          entryPoint: 'main',
          targets: [{ format: FORMAT }],
        },
      }),
    };
    return ladder;
  };

  /** Draws every level of one texture from the level above it, in order, since
   * each level reads what the pass before it wrote. It runs when the texture is
   * built rather than every frame, because the contents it averages arrive once. */
  const fillLadder = (texture: GPUTexture, levels: number) => {
    const parts = ladderParts();
    const encoder = device.createCommandEncoder();
    for (let level = 1; level < levels; level++) {
      const run = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            storeOp: 'store',
          },
        ],
      });
      run.setPipeline(parts.pipeline);
      run.setBindGroup(
        0,
        device.createBindGroup({
          layout: parts.layout,
          entries: [
            { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
            { binding: 1, resource: parts.sampler },
          ],
        })
      );
      run.draw(3);
      run.end();
    }
    device.queue.submit([encoder.finish()]);
  };

  let width = canvas.width;
  let height = canvas.height;

  // Every frame is drawn into a texture of the backend's own and then copied to
  // the canvas, rather than drawn straight into the canvas.
  //
  // Two things make that the shape. A read has to copy from the frame that was
  // drawn, and a canvas hands out a different texture once the browser has
  // presented, so a read that asked the canvas for one would get a cleared
  // frame. And in the browser the gates run, **a page that configures a canvas
  // for WebGPU at all can no longer wait on the card**: the next `mapAsync`
  // fails with `A valid external Instance reference no longer exists`, measured
  // on a bare page that drew one triangle, and it fails the same way whether the
  // frame was drawn into the canvas or merely copied there afterwards. A run
  // collecting pixels therefore must not configure one.
  let target: GPUTexture | null = null;
  let targetHandle: Handle | null = null;
  let configured = false;

  // A view is a handle onto a texture and it outlives nothing behind it, so one
  // is kept per texture and handed back until that texture is remade, which a
  // resize does by making a new object this map has never seen. It is what stops
  // the live loop building a fresh attachment view every pass every frame for as
  // long as it runs; a texture that is destroyed drops out of the map with it.
  const views = new WeakMap<GPUTexture, GPUTextureView>();
  const viewOf = (texture: GPUTexture) => {
    const held = views.get(texture);
    if (held) return held;
    const made = texture.createView();
    views.set(texture, made);
    return made;
  };

  /** Only a canvas someone can see is worth copying a frame into. A detached one
   * shows nobody anything, and configuring it would cost the reads above. */
  const onScreen = () => 'isConnected' in canvas && canvas.isConnected;

  const surface = () => {
    if (!target || target.width !== width || target.height !== height) {
      const make = () =>
        device.createTexture({
          label: 'frame',
          size: [width, height],
          format: FORMAT,
          // Copied out of by a read and by the canvas, and copied into by a frame
          // whose picture ended up in a texture of its own, which is what a compute
          // pass writing a storage texture is. A target without that last flag is
          // refused at the copy rather than where it was made, so the frame draws
          // and the picture never arrives.
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
        });
      // A resize frees the old frame and allocates the new through the arena, so
      // the target follows the arena's lifetime as every other texture does.
      targetHandle = targetHandle === null ? arena.allocate(make) : arena.resize(targetHandle, make);
      target = arena.resolve(targetHandle) as GPUTexture;
    }
    return target;
  };

  /** Where a finished frame meets the canvas, handed to the executor so `submit/`
   * names no DOM object of its own. On a canvas someone can see, the target is
   * configured once and the picture copied onto the current drawable, on the same
   * encoder the frame was recorded on so it is still submitted once; a detached
   * canvas is left alone, which is what keeps the pixel-reading path from
   * configuring one and paying the reads that costs. */
  const composite = (encoder: GPUCommandEncoder, source: GPUTexture): void => {
    if (!onScreen()) return;
    if (!configured) {
      context.configure({
        device,
        format: FORMAT,
        alphaMode: 'opaque',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
      });
      configured = true;
    }
    encoder.copyTextureToTexture({ texture: source }, { texture: context.getCurrentTexture() }, [width, height]);
  };

  return {
    name: 'webgpu',
    target: 'wgsl',

    report(): DeviceReport {
      const limits: Record<string, number> = {};
      // The ceilings sit on the prototype of what the device hands back, as
      // getters rather than as values on the object, so a walk of the object's
      // own keys finds none of them and only a walk of the chain reads them.
      const reported = device.limits as unknown as Record<string, unknown>;
      for (const name in reported) {
        const value = reported[name];
        if (typeof value === 'number') limits[name] = value;
      }
      // The features are a set rather than a list, so they come out in whatever
      // order the browser holds them and are sorted here.
      return { limits, features: [...device.features].sort() };
    },

    // The resident traffic this backend's arena has seen since the last reset,
    // bytes written and uploaded reported apart (item 22). It reads the arena
    // rather than the graph because per-frame uploads are a resident-lifetime
    // fact the graph does not carry, per §17 decision 9; a benchmark prints it
    // beside `cost()` and never summed with it.
    traffic(): FrameTraffic {
      return arena.traffic();
    },
    resetTraffic(): void {
      arena.resetTraffic();
    },

    program(frame: FrameGraph): ShaderProgram {
      if (frame.target !== 'wgsl') throw new Error(`WebGPU was handed a ${frame.target} frame to draw`);

      // The static lifetime of §5, owned by the pipeline cache rather than compiled
      // inline the way the fused `createProgram` did: a pipeline depends on nothing
      // but its own structure, and two pipelines keyed alike return one handle. The
      // cache is the backend's shared one (item 63), so a pipeline this program's
      // structure keys to is compiled once across every program that carries it and
      // this program compiles none the cache already holds; the bound on that cache
      // is what keeps the sharing from growing card memory without end.
      const compiled = compileModules(device, frame, onRefused);

      // Which turn the next frame runs on, and the render bundles recorded per
      // turn. Both are decided as the frame is drawn rather than when its
      // resources are made, so they live out here where the draw reads them and a
      // resize rewrites them, not inside the builder below. A pair with nothing to
      // swap never leaves the first turn, so a frame with no pair makes exactly the
      // calls it made before any of this existed.
      let turn = 0;
      let bundles: Map<number, GPURenderBundle>[] = [];

      // The passes resolved to the resources they draw with, one list per turn.
      // This is where item 16 moves the frame loop off names: `submit/`'s executor
      // reads objects rather than looking a name up in a map every frame, so this
      // holds the pipelines, bind groups, attachment textures and query sets
      // already resolved and already turned for each swap. It is rebuilt wherever
      // the bundles are — after a resize remakes the textures, and after a pass
      // change re-plans the frame — because both change what a name resolves to.
      let resolved: { runs: ResolvedRun[]; picture: GPUTexture | undefined }[] = [];

      // Which passes the frame runs, held in a variable rather than a const so a
      // runtime pass change can reassign it and the draw below reads the new list
      // without the program being remade. It is filled by the builder that plans
      // the frame's passes and re-planned by `setPasses`.
      let runs: FramePlan;

      // Every resident resource this program allocates goes through the arena and
      // is freed through it on dispose. `own` covers the ones freed only then —
      // the uniform block, the geometry and storage buffers, the samplers and the
      // query sets — by collecting their handles here. A texture is freed on a
      // resize as well as on dispose, so its handle is kept by name instead and
      // the resize frees the old before allocating the new.
      const owned: Handle[] = [];
      const own = <R extends GpuResource>(make: () => R): R => {
        const handle = arena.allocate(make);
        owned.push(handle);
        return arena.resolve(handle) as R;
      };
      const textureHandles = new Map<string, Handle>();

      // Everything a program owns is made once, here, and handed to the per-frame
      // methods below rather than built alongside them. A resize is the one thing
      // that remakes any of it, and the draw calls the builders it hands back to do
      // that. Separating the two is what lets a later description change the frame
      // without remaking the card resources under it.
      const made_once = buildResources();
      const {
        values,
        bufferHandle,
        buffers,
        textures,
        times,
        counting,
        partner,
        at,
        writable,
        declared,
        made,
        spansFrame,
        build,
        wire,
        recordBundles,
        resolveTurns,
        geometryOf,
      } = made_once;

      function buildResources() {
        const USES = {
          storage: GPUTextureUsage.STORAGE_BINDING,
          sample: GPUTextureUsage.TEXTURE_BINDING,
          attachment: GPUTextureUsage.RENDER_ATTACHMENT,
        };

        // What the specification calls each of the three ways of running off the
        // edge of a texture, which the description names in the words a reader of
        // it would use.
        const WRAPS: Record<SamplerResource['wrap'], GPUAddressMode> = {
          clamp: 'clamp-to-edge',
          repeat: 'repeat',
          mirror: 'mirror-repeat',
        };

        const block = uniformResourceOf(frame)?.block ?? [];
        const end = block.reduce((most, slot) => Math.max(most, slot.offset + slot.size), 0);
        const bytes = Math.ceil(end / BLOCK_ALIGNMENT) * BLOCK_ALIGNMENT;
        const values = new Float32Array(bytes / 4);
        // The uniform block's handle is kept, not just the resolved buffer, so
        // `setUniforms` can queue its write against the arena and the draw can
        // play it back in order rather than the write landing whenever the page
        // happened to hand the values in. It is `own`ed like any resident buffer.
        const bufferHandle = arena.allocate(() =>
          device.createBuffer({
            size: Math.max(bytes, BLOCK_ALIGNMENT),
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          })
        );
        owned.push(bufferHandle);
        const buffer = arena.resolve(bufferHandle) as GPUBuffer;

        // Every buffer of geometry the description names, filled once from the bytes
        // that came with it. Neither buffer follows the frame, since geometry is the
        // same shape however big the window is and what moves it is the vertex stage.
        const buffers = new Map<string, GPUBuffer>();
        for (const resource of frame.resources) {
          if (resource.kind !== 'vertices' && resource.kind !== 'indices') continue;
          if (!resource.data) {
            throw new Error(`the frame for "${frame.id}" draws "${resource.name}" and carries no bytes for it`);
          }
          const bytes = resource.data;
          const built = own(() =>
            device.createBuffer({
              label: resource.name,
              size: bytes.byteLength,
              usage:
                (resource.kind === 'vertices' ? GPUBufferUsage.VERTEX : GPUBufferUsage.INDEX) | GPUBufferUsage.COPY_DST,
            })
          );
          device.queue.writeBuffer(built, 0, bytes);
          arena.wrote(bytes.byteLength);
          buffers.set(resource.name, built);
        }

        // Which buffers a query resolves into, so each carries the usage flag for a
        // resolve. That two queries never share one buffer, and that each is long
        // enough for its answers, are graph rules `validate` owns (item 19); this
        // only reads which buffers are query targets, to build them with the right
        // usage.
        const queryTargets = new Set<string>();
        for (const pass of frame.passes) {
          if (pass.timed) queryTargets.add(pass.timed);
          if (isRenderPass(pass) && pass.visible) queryTargets.add(pass.visible);
        }

        // The query sets are the backend's own: nothing about how many answers a
        // pass needs, or which kind, is a choice a source or an entry could make, so
        // they are worked out from the passes and destroyed with the program. One set
        // per timed pass rather than one shared, because a pass writes its pair at
        // fixed places in the set it was given.
        const timing = device.features.has(TIMING);
        const times = new Map<string, GPUQuerySet>();
        const counting = new Map<string, GPUQuerySet>();
        for (const pass of frame.passes) {
          if (pass.timed && timing) {
            const timed = pass.timed;
            times.set(
              timed,
              own(() => device.createQuerySet({ label: `${timed}-times`, type: 'timestamp', count: 2 }))
            );
          }
          if (isRenderPass(pass) && pass.visible) {
            const visible = pass.visible;
            counting.set(
              visible,
              own(() => device.createQuerySet({ label: `${visible}-samples`, type: 'occlusion', count: 1 }))
            );
          }
        }

        const arguments_ = new Map<string, number>();
        // The buffers every indirect draw or dispatch reads its counts from, and
        // the space each needs. A render pass carries many draws (item 26), so
        // every indirect one it names is sized, not just the first.
        for (const pass of frame.passes) {
          const spec = frame.pipelines.find((one) => one.name === pass.pipeline);
          const ordered = isRenderPass(pass) && spec?.kind === 'render' && spec.geometry !== undefined;
          const named: string[] = isRenderPass(pass)
            ? pass.draws.filter(drawsIndirectly).map((draw) => draw.indirect)
            : groupsIndirectly(pass.groups)
              ? [pass.groups.indirect]
              : [];
          const words = !isRenderPass(pass) ? 3 : ordered ? 5 : 4;
          for (const name of named) arguments_.set(name, Math.max(arguments_.get(name) ?? 0, words * 4));
        }
        for (const [name, needed] of arguments_) {
          const resource = resourceOf(frame, name);
          if (!resource || resource.kind !== 'buffer') {
            throw new Error(
              `the frame for "${frame.id}" reads its counts from "${name}", which is no buffer it declares`
            );
          }
          if (resource.bytes < needed) {
            throw new Error(
              `the frame for "${frame.id}" reads ${needed} bytes of counts from "${name}", which is ${resource.bytes} bytes`
            );
          }
        }

        // The names of the buffers the page is allowed to write, which is the ones
        // the build gave first contents. A buffer the card fills for itself is not
        // among them, so a write aimed at one is refused before it reaches the card.
        const writable = new Set<string>();

        // Which buffers a pipeline reaches one per-draw slice of, so each is built
        // as a uniform bound with a dynamic offset rather than as a storage buffer
        // the shader writes (item 27). A per-draw buffer holds a record per draw and
        // the draw names which — a `hasDynamicOffset` uniform binding on WebGPU — so
        // its usage is UNIFORM rather than STORAGE, and it is not a query or indirect
        // target either.
        const perDrawBuffers = new Set<string>();
        for (const spec of frame.pipelines) {
          const slice = perDrawBinding(spec);
          if (slice) perDrawBuffers.add(slice.resource);
        }

        // Every block of bytes the description names, handed out empty. WebGPU zeroes
        // a new buffer, so a pass reading one before anything has written it reads
        // zeros rather than whatever the memory held, which is what lets a frame
        // whose first pass fills it be the same picture on every run.
        for (const resource of frame.resources) {
          if (resource.kind !== 'buffer') continue;
          // That a buffer is a whole number of four-byte words, and that a buffer
          // a query resolves into is long enough to hold its answers, are rules the
          // graph carries on its own; both are checked once in `validate`, reached
          // through `planFramePasses` before any of this builds (item 19).
          const spec = resource;
          const built = own(() =>
            device.createBuffer({
            label: spec.name,
            size: spec.bytes,
            // A buffer a pass reads its counts out of carries the flag for that as
            // well as the one for the shader writing it, and a flag nothing asked
            // for is a call the card refuses over a usage rather than over the name
            // the description gave it. Every one of them may also be copied out of,
            // because a number the card worked out for itself is a number a caller
            // has no other way of seeing, and the copy is refused over a usage as
            // well. A buffer the build filled is written into once here, so it
            // carries the flag for that as the shader-written textures do.
            usage: perDrawBuffers.has(spec.name)
              ? // A per-draw buffer is bound as a uniform and read one slice at a
                // time by a dynamic offset, so it carries UNIFORM rather than the
                // storage flags, and COPY_DST because its records arrive from this
                // side (its first contents, and any the page replaces later).
                GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
              : GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_SRC |
                (arguments_.has(spec.name) ? GPUBufferUsage.INDIRECT : 0) |
                (queryTargets.has(spec.name) ? GPUBufferUsage.QUERY_RESOLVE : 0) |
                (spec.data ? GPUBufferUsage.COPY_DST : 0),
            })
          );
          buffers.set(resource.name, built);
          // The contents the build wrote, uploaded once before anything reads them,
          // which is what a copy of a pipeline carrying its own numbers is handed.
          // A buffer arriving with contents is the one kind the page may write later,
          // so it is remembered as such: it carries COPY_DST for this first upload and
          // a scratch buffer the card fills does not.
          if (resource.data) {
            device.queue.writeBuffer(built, 0, resource.data);
            arena.wrote(resource.data.byteLength);
            writable.add(resource.name);
          }
        }

        /** The geometry one pipeline reads and the indices that order it, looked up
         * where the pipeline is made rather than where the pass draws, so a name
         * pointing at the wrong kind of resource is refused once and by name. */
        const geometryOf = (name: string) => {
          const vertices = resourceOf(frame, name);
          if (!vertices || vertices.kind !== 'vertices') {
            throw new Error(`the frame for "${frame.id}" draws "${name}", which is no geometry it declares`);
          }
          const ordered = vertices.indices === undefined ? undefined : resourceOf(frame, vertices.indices);
          if (vertices.indices !== undefined && ordered?.kind !== 'indices') {
            throw new Error(
              `the geometry "${name}" on "${frame.id}" orders itself by "${vertices.indices}", which it does not declare`
            );
          }
          return { vertices, ordered: ordered as IndexResource | undefined };
        };

        // A program owns every texture its description names, which is what lets it
        // be disposed on its own while the backend keeps the target it draws into.
        const declared = frame.resources.filter((resource): resource is TextureResource => resource.kind === 'texture');
        const shown = frame.present;
        if (shown !== undefined && !declared.some((resource) => resource.name === shown)) {
          throw new Error(`the frame for "${frame.id}" shows a resource "${shown}" it does not declare`);
        }

        const textures = new Map<string, GPUTexture>();
        const spansFrame = (resource: TextureResource) => followsFrame(resource.size);
        const made = { width: 0, height: 0 };

        // Contents and the frame's own size are a contradiction, because a texture
        // that follows the frame is thrown away and remade on every resize while
        // its contents arrived once. Refused here rather than left to upload bytes
        // of one size into a texture of another, which the card reports as a copy
        // out of range and no reader would trace back to the description.
        // A ladder over a texture a pass writes would be the levels of whatever was
        // in it when it was built, and every frame after the first would read a
        // ladder of a picture that is gone. The levels are drawn once because the
        // contents they average arrive once, so this is refused rather than left as
        // a picture that is right for one frame.
        const redrawn = declared.find(
          (resource) => resource.mips && (resource.use.includes('storage') || resource.use.includes('attachment'))
        );
        if (redrawn) {
          throw new Error(`the frame for "${frame.id}" gives "${redrawn.name}" a ladder and writes it every frame`);
        }
        const sourced = declared.find((resource) => resource.data && spansFrame(resource));
        if (sourced) {
          throw new Error(`the frame for "${frame.id}" gives "${sourced.name}" contents and the frame's own size`);
        }

        // A texture keeping several samples of a pixel is the narrowest kind there
        // is, and each of these is a call the card refuses over a usage flag or a
        // copy size rather than over the name the description gave it. Nothing can
        // write bytes into one from outside, nothing can copy out of one, and a
        // shader reads one only through a binding declared as multisampled, which no
        // source here has. A ladder over one needs no rule of its own, since the
        // check above already refuses a ladder over anything a pass writes.
        const multisampled = declared.filter((resource) => resource.samples !== undefined);
        const upload = multisampled.find((resource) => resource.data);
        if (upload) {
          throw new Error(`the frame for "${frame.id}" gives "${upload.name}" contents and several samples a pixel`);
        }
        const sampled = multisampled.find(
          (resource) => resource.use.includes('sample') || resource.use.includes('storage')
        );
        if (sampled) {
          throw new Error(`the frame for "${frame.id}" binds "${sampled.name}", which keeps several samples a pixel`);
        }
        const presented = multisampled.find((resource) => resource.name === shown);
        if (presented) {
          throw new Error(`the frame for "${frame.id}" shows "${presented.name}", which keeps several samples a pixel`);
        }

        const build = (which: (resource: TextureResource) => boolean) => {
          for (const resource of declared) {
            if (!which(resource)) continue;
            const { width: across, height: down } = sizeAt(resource.size, { width, height });
            const levels = resource.mips ? levelsOf(across, down) : 1;
            const make = () =>
              device.createTexture({
                label: resource.name,
                size: [across, down],
                format: resource.format,
                ...(levels > 1 ? { mipLevelCount: levels } : {}),
                ...(resource.samples ? { sampleCount: resource.samples } : {}),
                // The picture is copied out of whichever texture holds it at the
                // end of the frame, so that one is readable on top of whatever the
                // passes do with it, and a texture arriving with contents is copied
                // into once before anything reads it.
                usage: resource.use.reduce(
                  (mask, use) => mask | USES[use],
                  (resource.name === shown ? GPUTextureUsage.COPY_SRC : 0) |
                    (resource.data ? GPUTextureUsage.COPY_DST : 0) |
                    // Every level below the first is drawn rather than uploaded, so a
                    // texture carrying a ladder is an attachment as well as a picture.
                    (levels > 1 ? GPUTextureUsage.RENDER_ATTACHMENT : 0)
                ),
              });
            // A texture that follows the frame is freed and remade on every resize,
            // which is the arena's `resize`: the old slot's contents go with it and
            // the new handle is what the maps below read. The first build has no
            // prior handle for the name and allocates outright.
            const prior = textureHandles.get(resource.name);
            const handle = prior === undefined ? arena.allocate(make) : arena.resize(prior, make);
            textureHandles.set(resource.name, handle);
            const built = arena.resolve(handle) as GPUTexture;
            textures.set(resource.name, built);

            if (resource.data) {
              device.queue.writeTexture({ texture: built }, resource.data, { bytesPerRow: across * 4 }, [across, down]);
            }
            // After the contents, because each level is an average of the level
            // above it and the first level is what arrived.
            if (levels > 1) fillLadder(built, levels);
          }
          made.width = width;
          made.height = height;
        };

        // One sampler per name the description carries. A filtering layout takes
        // either kind of sampler where a non-filtering one refuses a smooth
        // sampler, so the layout below says filtering whatever this asks for and
        // the sampler alone decides whether the card reads between pixels.
        const samplers = new Map<string, GPUSampler>();
        for (const resource of frame.resources) {
          if (resource.kind !== 'sampler') continue;
          const spec = resource;
          samplers.set(
            spec.name,
            own(() =>
              device.createSampler({
                label: spec.name,
                magFilter: spec.filter,
                minFilter: spec.filter,
                addressModeU: WRAPS[spec.wrap],
                addressModeV: WRAPS[spec.wrap],
              })
            )
          );
        }

        const { pipelines, wired } = buildPipelines(device, frame, compiled, geometryOf, fullscreen, pipelineCache);

        // Which resource each name trades places with, if any. A pair is written by
        // one pass and read by the next frame's, so the two textures swap between
        // frames and the shader is handed one to read and one to write without ever
        // learning which of them it got.
        const partner = new Map<string, string>();
        for (const [one, other] of frame.swap ?? []) {
          const pair = [one, other].map((name) => declared.find((resource) => resource.name === name));
          const [first, second] = pair;
          const absent = [one, other][pair.findIndex((resource) => !resource)];
          if (absent !== undefined) {
            throw new Error(`the frame for "${frame.id}" swaps "${absent}", which is no texture it declares`);
          }
          // Both halves are the same shape, since the picture is read out of
          // whichever of them the frame ended on and either may be the one a pass
          // wrote. Refused here rather than left to a copy the card reports as out
          // of range on the frames that swap and not on the frames that do not.
          const shape = (resource: TextureResource) => `${sizeKey(resource.size)} ${resource.format}`;
          if (shape(first as TextureResource) !== shape(second as TextureResource)) {
            throw new Error(
              `the frame for "${frame.id}" swaps "${one}" and "${other}", which are not the same texture`
            );
          }
          partner.set(one, other);
          partner.set(other, one);
        }

        /** The name a binding points at on this turn of the frame, which is the
         * partner of what the source wrote on every other one. */
        const turned = (name: string, swapped: boolean) => (swapped ? (partner.get(name) ?? name) : name);

        // One set of bind groups per turn rather than one rebuilt every frame. A
        // bind group holds a view of the texture it was made with, so swapping by
        // rebuilding would make a group per pipeline per frame for as long as the
        // shader runs. A frame with nothing to swap has one turn, so it makes the
        // groups it made before any of this existed and no more.
        const groups: Map<string, GPUBindGroup[]>[] =
          partner.size > 0 ? [new Map(), new Map()] : [new Map<string, GPUBindGroup[]>()];
        const wire = () => {
          for (const [turn, made] of groups.entries()) {
            made.clear();
            for (const pipeline of wired) {
              made.set(
                pipeline.name,
                pipeline.bands.map((entries, band) =>
                  device.createBindGroup({
                    // Named for the pipeline and the turn, which is what lets a
                    // trace say which way round a swapping pair was bound rather
                    // than reporting that a group of some kind was set. The band is
                    // added where a pipeline binds more than one group, so the two
                    // are told apart, and left off where there is one so a shader
                    // with a single group makes the calls it made before.
                    label:
                      pipeline.bands.length > 1
                        ? `${pipeline.name}-group-${turn}-${band}`
                        : `${pipeline.name}-group-${turn}`,
                    layout: pipeline.layouts[band] as GPUBindGroupLayout,
                    entries: entries.map((at) => {
                      const name = turned(at.resource, turn === 1);
                      const bound = samplers.get(name) ?? textures.get(name)?.createView();
                      // A block of bytes is bound as itself, and the uniform block is
                      // what is left: a binding pointing at geometry never reaches
                      // here, since the lookup above refuses one by name.
                      const stored = buffers.get(name);
                      // A per-draw binding names one record's width, not the whole
                      // buffer, so the card reads exactly one slice and the offset
                      // to it arrives per draw (item 27). Every other binding reads
                      // its resource whole.
                      if (at.perDraw && stored) {
                        return { binding: at.binding, resource: { buffer: stored, offset: 0, size: at.perDraw.size } };
                      }
                      return { binding: at.binding, resource: bound ?? { buffer: stored ?? buffer } };
                    }),
                  })
                )
              );
            }
          }
        };

        build(() => true);
        wire();

        // Where each value goes is read off the layout the compiler reported, so
        // nothing here works a position out from the order the shader declares
        // its uniforms in. The driver decides that order and it has been measured
        // not to be the source's.
        const at = new Map(block.map((slot) => [slot.name, slot.offset / 4]));

        runs = planFramePasses(frame, geometryOf);

        /** The geometry an inline draw or a bundle walks, resolved from names to the
         * buffers the arena holds. Looked up here, at build and resize, rather than
         * every frame: this is item 16 moving `submit/`'s executor off names. The
         * count and format travel with the buffers so the loop that draws needs no
         * resource of the description in hand. */
        const drawGeometry = (drawn: DrawnGeometry | undefined): ResolvedGeometry | undefined =>
          drawn === undefined
            ? undefined
            : {
                vertexBuffer: buffers.get(drawn.vertices.name) as GPUBuffer,
                vertexCount: drawn.vertices.count,
                index:
                  drawn.ordered === undefined
                    ? undefined
                    : {
                        buffer: buffers.get(drawn.ordered.name) as GPUBuffer,
                        format: drawn.ordered.format,
                        count: drawn.ordered.count,
                      },
              };

        /** The buffer an indirect draw reads its counts from, resolved to the object
         * once rather than looked up by name at each frame. Absent for a draw whose
         * count this side already holds. */
        const drawIndirect = (draw: DrawSpec): GPUBuffer | undefined =>
          drawsIndirectly(draw) ? (buffers.get(draw.indirect) as GPUBuffer) : undefined;

        /** A render pass whose draws never change between frames, which is every one
         * that does not count its own samples: an occlusion query wraps the draw on
         * the pass rather than in the bundle, so a pass carrying one keeps drawing
         * inline. A compute pass records nothing here either, since a bundle holds
         * render work alone. */
        const isBundled = (run: FramePlan[number]) =>
          isRenderPass(run.pass) && run.spec.kind === 'render' && run.pass.visible === undefined;

        // The draws of every bundled pass, recorded once per turn rather than
        // re-issued every frame. A bundle holds the bind groups it was recorded
        // with, so a swap that hands a pass the other half of a pair is a second
        // bundle, one per turn the way the groups are, and a resize that rebuilds
        // the groups rebuilds these against them.
        const recordBundles = () => {
          bundles = groups.map((bound, turnIndex) => {
            const made = new Map<number, GPURenderBundle>();
            runs.forEach((run, index) => {
              if (!isBundled(run)) return;
              const spec = run.spec as RenderPipelineSpec;
              const pipeline = pipelines.get(spec.name) as GPURenderPipeline;
              const bands = bound.get(spec.name);
              if (!pipeline || !bands) throw new Error(`the frame names a pipeline "${spec.name}" it does not carry`);
              const encoder = device.createRenderBundleEncoder({
                label: `${spec.name}-bundle-${turnIndex}`,
                colorFormats: run.colour ? (spec.targets ?? []).map((target) => target.format) : [FORMAT],
                ...(run.depth && spec.depth ? { depthStencilFormat: spec.depth.format } : {}),
                ...(spec.samples ? { sampleCount: spec.samples } : {}),
              });
              const draws = (run.pass as RenderPassSpec).draws;
              // The per-draw group is set inside the bundle too, once per draw with
              // its offset, so a bundled pass slices its per-draw buffer the same
              // way an inline one does (item 27).
              issueDraws(
                encoder,
                pipeline,
                bands,
                drawGeometry(run.drawn),
                draws.map(drawIndirect),
                draws,
                perDrawBinding(spec)?.group
              );
              made.set(index, encoder.finish({ label: `${spec.name}-bundle-${turnIndex}` }));
            });
            return made;
          });
        };
        recordBundles();

        /** Every pass resolved to the resources it draws with, one list per turn, so
         * the executor reads objects rather than looking a name up in a map every
         * frame. It is the whole of item 16 on the WebGPU side: a name becomes a
         * pipeline, a bind group, a texture or a query set here — once per build, per
         * resize and per pass change — and turned for each swap, so the frame loop in
         * [submit/execute.ts](../submit/execute.ts) carries none. Rebuilt exactly
         * where the bundles are, because both depend on what a name resolves to and a
         * resize or a pass change moves that. */
        const resolveTurns = () => {
          // The graph as its passes now stand — `runs` is re-planned by a pass
          // change, so the current passes are read off it rather than off the
          // frame the program was built from. Which attachments store and which
          // consecutive passes merge are facts about these passes alone, so they
          // are decided once here, off names, and turned into resolved flags and
          // grouped runs below (item 1). Both are turn-independent: a swap moves
          // which texture a name resolves to, not whether the name is read again
          // or whether two passes share a render pass.
          const current: FrameGraph = { ...frame, passes: runs.map((run) => run.pass) };
          const stores = frameStores(current);
          const passGroups = mergeGroups(current);

          resolved = groups.map((bound, turnIndex) => {
            const swapped = turnIndex === 1;
            const recorded = bundles[turnIndex] ?? new Map<number, GPURenderBundle>();
            const turnRuns = runs.map((run, index): ResolvedRun => {
              const { pass, spec, drawn, depth, colour } = run;
              const pipeline = pipelines.get(spec.name);
              const bands = bound.get(spec.name);
              if (!pipeline || !bands) throw new Error(`the frame names a pipeline "${spec.name}" it does not carry`);
              const render = isRenderPass(pass) && spec.kind === 'render';
              const kept = stores[index] as { colour: boolean[]; depth: boolean; stencil: boolean };
              const timesSet = pass.timed === undefined ? undefined : times.get(pass.timed);
              const timedInto =
                pass.timed !== undefined && timesSet ? (buffers.get(pass.timed) as GPUBuffer) : undefined;
              const visible = isRenderPass(pass) ? pass.visible : undefined;
              const countingSet = visible === undefined ? undefined : counting.get(visible);
              const visibleInto =
                visible !== undefined && countingSet ? (buffers.get(visible) as GPUBuffer) : undefined;

              let dispatch: ResolvedRun['dispatch'];
              if (!isRenderPass(pass) && spec.kind === 'compute') {
                // The group count is the producer's, worked out from the size it
                // had (item 72): `groups` is either the count itself or a buffer
                // to read it from, so nothing here derives it from the frame size.
                dispatch = groupsIndirectly(pass.groups)
                  ? { indirect: buffers.get(pass.groups.indirect) as GPUBuffer }
                  : { blocks: pass.groups };
              }

              const recordedBundle = recorded.get(index);
              const draws = isRenderPass(pass) ? pass.draws : undefined;
              return {
                kind: render ? 'render' : 'compute',
                pipeline,
                bands,
                // Wrapped as a list so a merged group can replay several bundles
                // in one render pass; an inline or compute run carries none.
                bundle: recordedBundle === undefined ? undefined : [recordedBundle],
                timesSet,
                timedInto,
                countingSet,
                visibleInto,
                dispatch,
                colour:
                  colour === undefined
                    ? undefined
                    : colour.map((attachment, at) => ({
                        texture: textures.get(turned(attachment.name, swapped)) as GPUTexture,
                        resolveInto:
                          attachment.resolve === undefined
                            ? undefined
                            : (textures.get(turned(attachment.resolve, swapped)) as GPUTexture),
                        clear: attachment.clear,
                        store: kept.colour[at] ?? true,
                      })),
                depth:
                  depth === undefined
                    ? undefined
                    : {
                        texture: textures.get(depth.name) as GPUTexture,
                        clear: depth.clear,
                        stencilClear: depth.stencilClear,
                        depthHalf: depth.depthHalf,
                        stencilHalf: depth.stencilHalf,
                        storeDepth: kept.depth,
                        storeStencil: kept.stencil,
                      },
                geometry: render ? drawGeometry(drawn) : undefined,
                indirects: draws !== undefined ? draws.map(drawIndirect) : undefined,
                draws,
                // Which group the executor re-sets per draw with the draw's offset,
                // resolved from the pipeline once here rather than found again in
                // the loop (item 27). Absent where the pipeline binds no slice.
                perDrawBand: render ? perDrawBinding(spec)?.group : undefined,
                stencil: isRenderPass(pass) && spec.kind === 'render' && spec.depth?.stencil !== undefined,
              };
            });
            // Fold the consecutive passes a group names into one render pass. The
            // group's first run opens the pass — its load ops and its attachment
            // textures — and the last run decides the store ops, since a store is
            // about what is read after the whole group; the bundles of every
            // member replay in order. A group of one is left as it stands.
            const mergedRuns = passGroups.map((group): ResolvedRun => {
              if (group.length === 1) return turnRuns[group[0] as number] as ResolvedRun;
              const first = turnRuns[group[0] as number] as ResolvedRun;
              const lastKept = stores[group[group.length - 1] as number] as {
                colour: boolean[];
                depth: boolean;
                stencil: boolean;
              };
              return {
                ...first,
                bundle: group.flatMap((index) => turnRuns[index]?.bundle ?? []),
                colour: first.colour?.map((attachment, at) => ({ ...attachment, store: lastKept.colour[at] ?? true })),
                depth:
                  first.depth === undefined
                    ? undefined
                    : { ...first.depth, storeDepth: lastKept.depth, storeStencil: lastKept.stencil },
              };
            });
            const picture = shown === undefined ? undefined : (textures.get(turned(shown, swapped)) as GPUTexture);
            return { runs: mergedRuns, picture };
          });
        };
        resolveTurns();

        return {
          values,
          buffer,
          bufferHandle,
          buffers,
          textures,
          times,
          counting,
          pipelines,
          groups,
          partner,
          at,
          writable,
          declared,
          shown,
          made,
          spansFrame,
          build,
          wire,
          recordBundles,
          resolveTurns,
          geometryOf,
        };
      }

      return {
        setUniforms(feed: Record<string, UniformValue>) {
          for (const [name, value] of Object.entries(feed)) {
            const start = at.get(name);
            if (start === undefined) continue;
            if (Array.isArray(value)) value.forEach((component, index) => (values[start + index] = component));
            else values[start] = value;
          }
          // Queued rather than written here, so the draw plays it back against the
          // frame it feeds — the write lands before the pass that reads it because
          // the draw flushes before it records, not because the page happened to
          // call this before drawing.
          arena.upload(bufferHandle, values.byteLength, (target) =>
            device.queue.writeBuffer(target as GPUBuffer, 0, values)
          );
        },

        draw(into?: GPUTexture) {
          const texture = surface();
          // A texture that follows the frame is rebuilt at the new size and what
          // was in it is gone, and every group holding a view of one is rebuilt
          // with it, because a view outlives nothing. The bundles hold views the
          // resize threw away, so they are recorded again, and the resolved runs
          // point at the textures the resize replaced, so they are resolved again.
          //
          // The runs re-resolve on a size change so a rebuilt frame-sized texture's
          // new views reach them; a compute group count no longer follows the frame
          // (item 72 moved that to the producer), so a frame with no frame-sized
          // texture re-resolves to the same runs — harmless, and `made` still tracks
          // the size the runs were resolved at whether or not a texture was rebuilt.
          if (made.width !== width || made.height !== height) {
            if (declared.some(spansFrame)) {
              build(spansFrame);
              wire();
              recordBundles();
            } else {
              made.width = width;
              made.height = height;
            }
            resolveTurns();
          }
          const current = resolved[turn] as { runs: ResolvedRun[]; picture: GPUTexture | undefined };
          if (partner.size > 0) turn = turn === 0 ? 1 : 0;
          // The executor takes it from here: the passes this program already
          // resolved to their resources become one encoder, submitted once. Flushing
          // the queued uploads, opening the encoder, recording every pass and copying
          // the finished picture all live in `submit/` now, and it reads the objects
          // themselves rather than looking a name up per frame — item 16. The one
          // place a frame meets the canvas stays here as `composite`, so nothing in
          // `submit/` names a DOM object.
          runFrame({
            device,
            flush: () => arena.flush(),
            runs: current.runs,
            target: texture,
            viewOf,
            picture: current.picture,
            width,
            height,
            composite,
            into,
          });
        },

        writeBuffer(name: string, data: Uint8Array<ArrayBuffer>) {
          const held = buffers.get(name);
          if (!held) throw new Error(`the frame for "${frame.id}" declares no buffer called "${name}"`);
          if (!writable.has(name)) {
            throw new Error(
              `the frame for "${frame.id}" fills "${name}" on the card, so the page has no contents there to replace`
            );
          }
          if (data.byteLength % 4 !== 0) {
            throw new Error(
              `the frame for "${frame.id}" writes ${data.byteLength} bytes into "${name}", which is no whole number of four-byte words`
            );
          }
          if (data.byteLength > held.size) {
            throw new Error(
              `the frame for "${frame.id}" writes ${data.byteLength} bytes into "${name}", which holds ${held.size}`
            );
          }
          device.queue.writeBuffer(held, 0, data);
        },

        setPasses(passes: PassSpec[]) {
          // The same frame with a different pass list, planned over the modules,
          // the pipelines and the resources already built. `planFramePasses`
          // refuses a pass naming a pipeline this frame does not carry, so a pass
          // for a pipeline the program was not built with is caught by name here
          // rather than at the draw. The bundles hold the draws of the old list,
          // so they are recorded again against the new one, and the resolved runs
          // describe the old passes, so they are resolved again over the new plan.
          runs = planFramePasses({ ...frame, passes }, geometryOf);
          recordBundles();
          resolveTurns();
        },

        async readBuffer(name: string) {
          const held = buffers.get(name);
          if (!held) throw new Error(`the frame for "${frame.id}" declares no buffer called "${name}"`);

          // Copied into a buffer of its own rather than mapped where it is: a
          // buffer the shader writes cannot be mapped, and mapping the one the
          // frame uses would take it away from the next frame. It is allocated and
          // freed through the arena within this call, so the slot it took is
          // returned the moment the read is done.
          const stagingHandle = arena.allocate(() =>
            device.createBuffer({
              label: `${name}-read`,
              size: held.size,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            })
          );
          const staging = arena.resolve(stagingHandle) as GPUBuffer;
          const encoder = device.createCommandEncoder();
          encoder.copyBufferToBuffer(held, 0, staging, 0, held.size);
          device.queue.submit([encoder.finish()]);

          await staging.mapAsync(GPUMapMode.READ);
          // Copied out of the mapping rather than handed over as a view of it,
          // since the memory behind a mapping is gone the moment it is unmapped
          // and a caller reading it afterwards reads nothing.
          const words = new Uint32Array(staging.getMappedRange().slice(0));
          staging.unmap();
          arena.free(stagingHandle);
          return words;
        },

        dispose() {
          // Everything this program allocated is freed through the arena: the
          // handles `own` collected — the uniform block, the buffers, the samplers
          // and the query sets — and the textures kept by name. The object maps are
          // cleared after, since the objects behind them are gone with their slots.
          for (const handle of owned) arena.free(handle);
          owned.length = 0;
          for (const handle of textureHandles.values()) arena.free(handle);
          textureHandles.clear();
          times.clear();
          counting.clear();
          textures.clear();
          buffers.clear();
        },
      };
    },

    resize(w: number, h: number) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    },

    async readPixels(from?: GPUTexture) {
      // A caller reading back the texture a `draw(into)` landed the frame in
      // reads that one, and the row-stride repack below is the same either way,
      // so a capture never does the arithmetic itself (item 29). Absent, it is
      // the backend's own target, and an empty frame of the right size before
      // anything has drawn.
      const source = from ?? target;
      if (!source) return new Uint8Array(width * height * 4);

      const stride = Math.ceil((width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
      const stagingHandle = arena.allocate(() =>
        device.createBuffer({
          size: stride * height,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
      );
      const staging = arena.resolve(stagingHandle) as GPUBuffer;
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: source }, { buffer: staging, bytesPerRow: stride }, [width, height]);
      device.queue.submit([encoder.finish()]);

      await staging.mapAsync(GPUMapMode.READ);
      const padded = new Uint8Array(staging.getMappedRange());
      const rows = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        rows.set(padded.subarray(y * stride, y * stride + width * 4), y * width * 4);
      }
      staging.unmap();
      arena.free(stagingHandle);
      return rows;
    },

    dispose() {
      if (targetHandle !== null) arena.free(targetHandle);
      target = null;
      targetHandle = null;
      // The shared pipeline cache is emptied with the backend so the pipelines it
      // held across programs do not outlive the device they were compiled on.
      pipelineCache.clear();
      if (configured) context.unconfigure();
    },
  };
}

/** Every document of the frame is compiled, and each is asked about itself rather
 * than the pipeline being asked: a pipeline made from a module that did not
 * compile is invalid, and every later call on it reports the invalidity instead
 * of the reason for it. With more than one document the message has to say which,
 * so the module's name is what it is labelled with and what the refusal is
 * prefixed by. */
function compileModules(
  device: GPUDevice,
  frame: FrameGraph,
  onRefused?: (message: string) => void
): Map<string, GPUShaderModule> {
  const compiled = new Map<string, GPUShaderModule>();
  for (const document of frame.modules) {
    const built = device.createShaderModule({ label: document.name, code: document.code });
    compiled.set(document.name, built);
    void built.getCompilationInfo().then((info) => {
      const said = refusal(info);
      if (said) onRefused?.(frame.modules.length > 1 ? `${document.name}: ${said}` : said);
    });
  }
  return compiled;
}

/** The pipelines the frame names, each with the group-0 layout its own bindings
 * ask for. The layout is built from what the description says rather than
 * inferred, so two pipelines can share a resource without each inferring a layout
 * of its own, and the wired layouts are handed back so the bind groups can be
 * made against them. */
function buildPipelines(
  device: GPUDevice,
  frame: FrameGraph,
  compiled: Map<string, GPUShaderModule>,
  geometryOf: (name: string) => DrawnGeometry,
  fullscreen: GPUShaderModule,
  cache: PipelineCache<CachedPipeline>
): {
  pipelines: Map<string, GPURenderPipeline | GPUComputePipeline>;
  wired: { name: string; layouts: GPUBindGroupLayout[]; bands: BindingSpec[][] }[];
} {
  const stage = (named: { module: string; entry: string }) => {
    const built = compiled.get(named.module);
    if (!built) throw new Error(`the frame names a document "${named.module}" it does not carry`);
    return { module: built, entryPoint: named.entry };
  };

  const STAGES = {
    vertex: GPUShaderStage.VERTEX,
    fragment: GPUShaderStage.FRAGMENT,
    compute: GPUShaderStage.COMPUTE,
  };

  /** What one binding points at, which is read off the resource the frame
   * declares rather than off the binding, so a layout cannot claim one kind
   * of thing while the description declares another. */
  const pointsAt = (at: BindingSpec) => {
    const resource = resourceOf(frame, at.resource);
    if (!resource) throw new Error(`the frame for "${frame.id}" binds a resource "${at.resource}" it never declares`);
    if (resource.kind === 'texture' && !resource.use.includes('storage') && !resource.use.includes('sample')) {
      throw new Error(`the frame for "${frame.id}" binds "${at.resource}", which it neither writes nor samples`);
    }
    // Geometry is read one vertex at a time by the stage the pipeline names it
    // on, so it reaches a layout through the pipeline rather than through a
    // group, and a binding pointing at it is a layout entry with no kind.
    if (resource.kind === 'vertices' || resource.kind === 'indices') {
      throw new Error(`the frame for "${frame.id}" binds "${at.resource}", which is geometry rather than a binding`);
    }
    return resource;
  };

  /** What a layout says one binding is. A texture is written or read rather
   * than both, since a storage binding and a sampled binding are two entries
   * the card tells apart and a texture claiming neither reaches nothing. */
  const layoutEntry = (at: BindingSpec, visibility: number): GPUBindGroupLayoutEntry => {
    const resource = pointsAt(at);
    if (resource.kind === 'uniform') return { binding: at.binding, visibility, buffer: { type: 'uniform' } };
    if (resource.kind === 'sampler') return { binding: at.binding, visibility, sampler: { type: 'filtering' } };
    // A per-draw binding reads one slice of its buffer chosen by a dynamic
    // offset, which is a uniform binding the card is told to expect an offset for
    // rather than a storage binding it reads whole (item 27). The offset arrives
    // per draw at `setBindGroup`; the layout only has to declare that one comes.
    if (resource.kind === 'buffer' && at.perDraw) {
      return { binding: at.binding, visibility, buffer: { type: 'uniform', hasDynamicOffset: true } };
    }
    // A buffer the source only reads is a different entry from one it writes,
    // and a layout claiming the writable kind over a source that declared the
    // read-only one is a pipeline the card refuses by binding number.
    if (resource.kind === 'buffer') {
      return {
        binding: at.binding,
        visibility,
        buffer: { type: resource.access === 'read' ? 'read-only-storage' : 'storage' },
      };
    }
    // How the binding reads it wins over what the resource is used for, since
    // a texture used both ways says nothing on its own and the two kinds are
    // entries the card tells apart.
    if ((at.reads ?? (resource.use.includes('storage') ? 'storage' : 'sample')) === 'storage') {
      return {
        binding: at.binding,
        visibility,
        storageTexture: { access: 'write-only', format: resource.format },
      };
    }
    // Every format this corpus samples is one the card can read between
    // pixels of, and a sampled binding declared any other way needs a
    // sampler the layout above would refuse.
    return { binding: at.binding, visibility, texture: { sampleType: 'float' } };
  };

  const wired: { name: string; layouts: GPUBindGroupLayout[]; bands: BindingSpec[][] }[] = [];
  const pipelines = new Map<string, GPURenderPipeline | GPUComputePipeline>();

  for (const spec of frame.pipelines) {
    // A pipeline is compiled from its structure and nothing else, so the whole
    // build below runs once per distinct structure through the cache and a repeat
    // request — another frame drawing the same shader — returns the pipeline and
    // layouts already made rather than compiling a second. The `name` a frame gave
    // the pipeline is a per-frame fact and stays out here; the pipeline, its
    // layouts and the bands they were built from are the static lifetime the cache
    // owns. This is where item 15 moves compilation off `createProgram` and onto
    // the module that owns pipeline structure.
    const { pipeline, layouts, bands } = cache.resolve(cache.request(pipelineStructureOf(frame, spec), () => {
      // The layout is built from what the description says rather than
      // inferred from the pipeline. A layout the driver infers belongs to the
      // pipeline it was inferred from, so two pipelines cannot share one and a
      // compute pass and a render pass reading the same resource would each
      // need their own group over the same buffer.
      //
      // One layout per bind group the source binds at, so a resource every copy of
      // a pipeline reads can sit in a group of its own that the draw sets once
      // rather than once per copy. The groups have to run from zero with no gap,
      // since a pipeline layout is a list the card reads by position.
      const grouped: BindingSpec[][] = [];
      for (const at of spec.bindings) (grouped[at.group] ??= []).push(at);
      const gap = [...grouped.keys()].find((index) => grouped[index] === undefined);
      if (gap !== undefined) {
        throw new Error(`the frame for "${frame.id}" binds "${spec.name}" past group ${gap} with no group ${gap}`);
      }
      const bands = grouped.length === 0 ? [[]] : grouped;
      const layouts = bands.map((entries, band) =>
        device.createBindGroupLayout({
          // The band is left off the label of a pipeline that binds only group
          // zero, so a shader with one group makes the calls it made before groups
          // past the first existed.
          label: bands.length > 1 ? `${spec.name}-bindings-${band}` : `${spec.name}-bindings`,
          entries: entries.map((at) =>
            layoutEntry(
              at,
              at.visibility.reduce((mask, reader) => mask | STAGES[reader], 0)
            )
          ),
        })
      );
      const pipelineLayout = device.createPipelineLayout({
        label: `${spec.name}-layout`,
        bindGroupLayouts: layouts,
      });

      // The rung's numbers land here rather than in the text, because that is
      // where WGSL takes one: an `override` carries the source's own value
      // until a pipeline is created with another. Only the document the stage
      // names is given its own, since a constant naming nothing in the module
      // it is handed to is refused.
      if (spec.kind === 'compute') {
        const constants = moduleOf(frame, spec.compute.module)?.constants;
        return {
          pipeline: device.createComputePipeline({
            layout: pipelineLayout,
            compute: { ...stage(spec.compute), ...(constants ? { constants } : {}) },
          }),
          layouts,
          bands,
        };
      }

      const constants = moduleOf(frame, spec.fragment.module)?.constants;
      // How one vertex is read out of the buffer, which is spent when the
      // pipeline is made and cannot be given at the draw. A pipeline naming no
      // geometry reads no buffer at all, which is the frame's own corners.
      const drawn = spec.geometry === undefined ? undefined : geometryOf(spec.geometry);
      const reads: GPUVertexBufferLayout[] = drawn
        ? [
            {
              arrayStride: drawn.vertices.stride,
              attributes: drawn.vertices.attributes.map((field) => ({
                shaderLocation: field.location,
                offset: field.offset,
                format: field.format,
              })),
            },
          ]
        : [];
      return {
        pipeline: device.createRenderPipeline({
          layout: pipelineLayout,
          vertex:
            spec.vertex === 'fullscreen'
              ? { module: fullscreen, entryPoint: 'main' }
              : { ...stage(spec.vertex), ...(drawn ? { buffers: reads } : {}) },
          fragment: {
            ...stage(spec.fragment),
            // A pipeline naming its own targets writes textures rather than the
            // frame, so the frame's format is the backend's answer alone and a
            // description never carries a copy of it that could disagree.
            targets: spec.targets
              ? spec.targets.map((target) => ({
                  format: target.format,
                  ...(target.blend ? { blend: target.blend } : {}),
                }))
              : [{ format: FORMAT }],
            ...(constants ? { constants } : {}),
          },
          // The depth test is spent here for the same reason the vertex layout
          // is: the card compiles the comparison into the pipeline, so two
          // surfaces tested differently over one attachment are two pipelines
          // rather than one pipeline told twice.
          ...(spec.depth
            ? {
                depthStencil: {
                  format: spec.depth.format,
                  // The depth half is left out for a format that keeps none,
                  // where the card refuses a comparison rather than ignoring it.
                  ...(spec.depth.compare !== undefined
                    ? { depthCompare: spec.depth.compare, depthWriteEnabled: spec.depth.write ?? false }
                    : {}),
                  ...(spec.depth.stencil
                    ? {
                        stencilFront: STENCIL_MODES[spec.depth.stencil].face,
                        stencilBack: STENCIL_MODES[spec.depth.stencil].face,
                        stencilReadMask: STENCIL_BITS,
                        stencilWriteMask: STENCIL_MODES[spec.depth.stencil].writes,
                      }
                    : {}),
                },
              }
            : {}),
          primitive: { topology: drawn ? drawn.vertices.topology : 'triangle-list' },
          // The count is spent here as well as on the attachment, because the
          // card takes it twice and reports a disagreement against whichever
          // call arrived second. Which count it is comes off the attachments
          // the pass writes, and the two are compared where the pass is read.
          ...(spec.samples ? { multisample: { count: spec.samples } } : {}),
        }),
        layouts,
        bands,
      };
    }));
    pipelines.set(spec.name, pipeline);
    wired.push({ name: spec.name, layouts, bands });
  }

  return { pipelines, wired };
}

