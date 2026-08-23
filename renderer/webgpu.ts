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
  Dispatch,
  Extent,
  IndexResource,
  PassSpec,
  RenderPassSpec,
  RenderPipelineSpec,
  SamplerResource,
  ShaderFrame,
  StencilMode,
  ShaderProgram,
  TextureResource,
  UniformValue,
  VertexResource,
} from './types';
import {
  dispatchesIndirectly,
  drawsCorners,
  drawsIndirectly,
  isRenderPass,
  moduleOf,
  resourceOf,
  uniformResourceOf,
} from './types';
import { assertWholeWords, TIMED_QUERY_BYTES, VISIBLE_QUERY_BYTES } from './frame-rules';

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

/** The value a mask is marked with and tested against. It is one number rather
 * than a choice, because the mode a pipeline names is what decides whether it is
 * written or compared, and a second number nothing reads differently would be a
 * value two places could disagree about. */
const STENCIL_REFERENCE = 1;

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
      sampler: device.createSampler({ label: 'averaging', magFilter: 'linear', minFilter: 'linear' }),
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
      target?.destroy();
      target = device.createTexture({
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
    }
    return target;
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

    createProgram(frame: ShaderFrame): ShaderProgram {
      if (frame.target !== 'wgsl') throw new Error(`WebGPU was handed a ${frame.target} frame to draw`);

      const compiled = compileModules(device, frame, onRefused);

      // Which turn the next frame runs on, and the render bundles recorded per
      // turn. Both are decided as the frame is drawn rather than when its
      // resources are made, so they live out here where the draw reads them and a
      // resize rewrites them, not inside the builder below. A pair with nothing to
      // swap never leaves the first turn, so a frame with no pair makes exactly the
      // calls it made before any of this existed.
      let turn = 0;
      let bundles: Map<number, GPURenderBundle>[] = [];

      // Which passes the frame runs, held in a variable rather than a const so a
      // runtime pass change can reassign it and the draw below reads the new list
      // without the program being remade. It is filled by the builder that plans
      // the frame's passes and re-planned by `setPasses`.
      let runs: FramePlan;

      // Everything a program owns is made once, here, and handed to the per-frame
      // methods below rather than built alongside them. A resize is the one thing
      // that remakes any of it, and the draw calls the builders it hands back to do
      // that. Separating the two is what lets a later description change the frame
      // without remaking the card resources under it.
      const made_once = buildResources();
      const {
        values,
        buffer,
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
        geometryOf,
        blocks,
        turned,
        issueDraw,
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
        const buffer = device.createBuffer({
          size: Math.max(bytes, BLOCK_ALIGNMENT),
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Every buffer of geometry the description names, filled once from the bytes
        // that came with it. Neither buffer follows the frame, since geometry is the
        // same shape however big the window is and what moves it is the vertex stage.
        const buffers = new Map<string, GPUBuffer>();
        for (const resource of frame.resources) {
          if (resource.kind !== 'vertices' && resource.kind !== 'indices') continue;
          if (!resource.data) {
            throw new Error(`the frame for "${frame.id}" draws "${resource.name}" and carries no bytes for it`);
          }
          const built = device.createBuffer({
            label: resource.name,
            size: resource.data.byteLength,
            usage:
              (resource.kind === 'vertices' ? GPUBufferUsage.VERTEX : GPUBufferUsage.INDEX) | GPUBufferUsage.COPY_DST,
          });
          device.queue.writeBuffer(built, 0, resource.data);
          buffers.set(resource.name, built);
        }

        // Which buffers a pass reads its own counts out of, and how many bytes each
        // such read takes: four words for a draw, five where the geometry carries
        // indices, and three for a dispatch. The words are a fixed arrangement the
        // card reads, so a buffer shorter than the read is one the card refuses at
        // the call rather than where the size was declared.
        /** Which buffers a query resolves into, and how many bytes each resolve
         * writes: two answers for the pair of times a pass is opened and closed at,
         * and one for the samples a draw got through. A buffer named by both is
         * refused, because a resolve writes from the start of the buffer and the
         * second would land on top of the first. */
        const resolves = new Map<string, number>();
        const takes = (name: string, bytes: number) => {
          if (resolves.has(name)) {
            throw new Error(`the frame for "${frame.id}" resolves more than one query into "${name}"`);
          }
          resolves.set(name, bytes);
        };
        for (const pass of frame.passes) {
          if (pass.timed) takes(pass.timed, TIMED_QUERY_BYTES);
          if (isRenderPass(pass) && pass.visible) takes(pass.visible, VISIBLE_QUERY_BYTES);
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
            times.set(pass.timed, device.createQuerySet({ label: `${pass.timed}-times`, type: 'timestamp', count: 2 }));
          }
          if (isRenderPass(pass) && pass.visible) {
            counting.set(
              pass.visible,
              device.createQuerySet({ label: `${pass.visible}-samples`, type: 'occlusion', count: 1 })
            );
          }
        }

        const arguments_ = new Map<string, number>();
        for (const pass of frame.passes) {
          const named = isRenderPass(pass)
            ? drawsIndirectly(pass.draw)
              ? pass.draw.indirect
              : undefined
            : dispatchesIndirectly(pass.dispatch)
              ? pass.dispatch.indirect
              : undefined;
          if (named === undefined) continue;
          const spec = frame.pipelines.find((one) => one.name === pass.pipeline);
          const ordered = isRenderPass(pass) && spec?.kind === 'render' && spec.geometry !== undefined;
          const words = !isRenderPass(pass) ? 3 : ordered ? 5 : 4;
          arguments_.set(named, Math.max(arguments_.get(named) ?? 0, words * 4));
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

        // Every block of bytes the description names, handed out empty. WebGPU zeroes
        // a new buffer, so a pass reading one before anything has written it reads
        // zeros rather than whatever the memory held, which is what lets a frame
        // whose first pass fills it be the same picture on every run.
        for (const resource of frame.resources) {
          if (resource.kind !== 'buffer') continue;
          assertWholeWords(frame.id, resource.name, resource.bytes);
          // A buffer a query resolves into is refused where it is shorter than the
          // answer, because the card writes from the start of it and reports a
          // resolve running past the end with a message about a size that names
          // neither the query nor the pass that asked for it.
          const resolved = resolves.get(resource.name);
          if (resolved !== undefined && resource.bytes < resolved) {
            throw new Error(
              `the frame for "${frame.id}" resolves ${resolved} bytes of query into "${resource.name}", which holds ${resource.bytes}`
            );
          }
          const built = device.createBuffer({
            label: resource.name,
            size: resource.bytes,
            // A buffer a pass reads its counts out of carries the flag for that as
            // well as the one for the shader writing it, and a flag nothing asked
            // for is a call the card refuses over a usage rather than over the name
            // the description gave it. Every one of them may also be copied out of,
            // because a number the card worked out for itself is a number a caller
            // has no other way of seeing, and the copy is refused over a usage as
            // well. A buffer the build filled is written into once here, so it
            // carries the flag for that as the shader-written textures do.
            usage:
              GPUBufferUsage.STORAGE |
              GPUBufferUsage.COPY_SRC |
              (arguments_.has(resource.name) ? GPUBufferUsage.INDIRECT : 0) |
              (resolved === undefined ? 0 : GPUBufferUsage.QUERY_RESOLVE) |
              (resource.data ? GPUBufferUsage.COPY_DST : 0),
          });
          buffers.set(resource.name, built);
          // The contents the build wrote, uploaded once before anything reads them,
          // which is what a copy of a pipeline carrying its own numbers is handed.
          // A buffer arriving with contents is the one kind the page may write later,
          // so it is remembered as such: it carries COPY_DST for this first upload and
          // a scratch buffer the card fills does not.
          if (resource.data) {
            device.queue.writeBuffer(built, 0, resource.data);
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
        const span = (size: Extent, frameSize: number) => (size === 'frame' ? frameSize : size);
        const spansFrame = (resource: TextureResource) => resource.size[0] === 'frame' || resource.size[1] === 'frame';
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
            textures.get(resource.name)?.destroy();
            const across = span(resource.size[0], width);
            const down = span(resource.size[1], height);
            const levels = resource.mips ? levelsOf(across, down) : 1;
            const built = device.createTexture({
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
          samplers.set(
            resource.name,
            device.createSampler({
              label: resource.name,
              magFilter: resource.filter,
              minFilter: resource.filter,
              addressModeU: WRAPS[resource.wrap],
              addressModeV: WRAPS[resource.wrap],
            })
          );
        }

        const { pipelines, wired } = buildPipelines(device, frame, compiled, geometryOf, fullscreen);

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
          const shape = (resource: TextureResource) => `${resource.size.join('x')} ${resource.format}`;
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

        /** How many workgroups one dispatch runs, in whole blocks of the pipeline's
         * own size. Every count is worked out from a size the description already
         * carries, so nothing here is a number written down twice. */
        const blocks = (dispatch: Dispatch, workgroup: [number, number, number]): [number, number, number] => {
          if (Array.isArray(dispatch)) return dispatch;
          // A dispatch reading its count out of a buffer never reaches here, since
          // the count is the card's to read and there is nothing to work out.
          if (dispatchesIndirectly(dispatch)) {
            throw new Error(`the frame for "${frame.id}" counted the blocks of a dispatch it reads from a buffer`);
          }
          const over =
            dispatch === 'frame'
              ? [width, height]
              : (() => {
                  const resource = resourceOf(frame, dispatch.over);
                  if (!resource || resource.kind !== 'texture') {
                    throw new Error(
                      `the frame for "${frame.id}" dispatches over "${dispatch.over}", which is no texture`
                    );
                  }
                  return [span(resource.size[0], width), span(resource.size[1], height)];
                })();
          return [Math.ceil((over[0] as number) / workgroup[0]), Math.ceil((over[1] as number) / workgroup[1]), 1];
        };

        runs = planFramePasses(frame, geometryOf);

        /** The pipeline, the bind groups and the draw one render pass issues, played
         * into either the pass itself or a bundle recording it. It is the whole of
         * what a bundle may hold: the value the mask is tested against and the
         * counting of a draw's surviving samples are pass state a bundle cannot
         * carry, so they stay on the pass and out of here. */
        const issueDraw = (
          into: GPURenderPassEncoder | GPURenderBundleEncoder,
          pipeline: GPURenderPipeline,
          bands: GPUBindGroup[],
          drawn: DrawnGeometry | undefined,
          draw: RenderPassSpec['draw']
        ) => {
          into.setPipeline(pipeline);
          bands.forEach((band, at) => into.setBindGroup(at, band));
          if (drawsIndirectly(draw)) {
            const counts = buffers.get(draw.indirect) as GPUBuffer;
            if (drawn) {
              into.setVertexBuffer(0, buffers.get(drawn.vertices.name) as GPUBuffer);
              if (drawn.ordered) {
                into.setIndexBuffer(buffers.get(drawn.ordered.name) as GPUBuffer, drawn.ordered.format);
                into.drawIndexedIndirect(counts, 0);
              } else into.drawIndirect(counts, 0);
            } else into.drawIndirect(counts, 0);
          } else if (drawsCorners(draw)) into.draw(draw.vertices, draw.instances);
          else if (drawn) {
            into.setVertexBuffer(0, buffers.get(drawn.vertices.name) as GPUBuffer);
            if (drawn.ordered) {
              into.setIndexBuffer(buffers.get(drawn.ordered.name) as GPUBuffer, drawn.ordered.format);
              into.drawIndexed(drawn.ordered.count, draw.instances);
            } else into.draw(drawn.vertices.count, draw.instances);
          }
        };

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
              issueDraw(encoder, pipeline, bands, run.drawn, (run.pass as RenderPassSpec).draw);
              made.set(index, encoder.finish({ label: `${spec.name}-bundle-${turnIndex}` }));
            });
            return made;
          });
        };
        recordBundles();

        return {
          values,
          buffer,
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
          geometryOf,
          blocks,
          turned,
          issueDraw,
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
          device.queue.writeBuffer(buffer, 0, values);
        },

        // A field is in the block or it is not, and a WGSL compiler does not
        // remove one for going unread, so this answers the same question the
        // GLSL side does and answers it from the layout that was computed.
        unreached(names: string[]) {
          return names.filter((name) => !at.has(name));
        },

        draw() {
          const texture = surface();
          // A texture that follows the frame is rebuilt at the new size and what
          // was in it is gone, and every group holding a view of one is rebuilt
          // with it, because a view outlives nothing.
          if (declared.some(spansFrame) && (made.width !== width || made.height !== height)) {
            build(spansFrame);
            wire();
            // The bundles hold views the resize threw away, so they are recorded
            // again against the groups the resize rebuilt.
            recordBundles();
          }
          const swapped = turn === 1;
          const bound = groups[turn] as Map<string, GPUBindGroup[]>;
          const recorded = bundles[turn] as Map<number, GPURenderBundle>;
          if (partner.size > 0) turn = turn === 0 ? 1 : 0;
          const encoder = device.createCommandEncoder();
          // Every pass of the description runs in order on this one encoder and
          // the whole frame is submitted once, so a frame with one pass in it
          // makes exactly the calls a single draw made before.
          for (const [index, { pass, spec, drawn, depth, colour }] of runs.entries()) {
            const pipeline = pipelines.get(spec.name);
            const bands = bound.get(spec.name);
            if (!pipeline || !bands) throw new Error(`the frame names a pipeline "${spec.name}" it does not carry`);

            /** What a pass is opened with so the card writes a time at each end of
             * it. A device without the feature gets nothing, which is the whole of
             * how a frame asking to be timed still draws on one. */
            const timestamps = (name: string | undefined) => {
              const set = name === undefined ? undefined : times.get(name);
              return set
                ? { timestampWrites: { querySet: set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
                : {};
            };

            /** Every query this pass asked for, copied out of the sets into the
             * buffers the description named. It runs after the pass has ended and
             * on the frame's own encoder, because a resolve is a command the card
             * carries out in order rather than something a caller reads. */
            const resolve = () => {
              const timed = pass.timed === undefined ? undefined : times.get(pass.timed);
              if (timed && pass.timed) {
                encoder.resolveQuerySet(timed, 0, 2, buffers.get(pass.timed) as GPUBuffer, 0);
              }
              const counted = isRenderPass(pass) && pass.visible ? counting.get(pass.visible) : undefined;
              if (counted && isRenderPass(pass) && pass.visible) {
                encoder.resolveQuerySet(counted, 0, 1, buffers.get(pass.visible) as GPUBuffer, 0);
              }
            };

            if (!isRenderPass(pass) && spec.kind === 'compute') {
              const run = encoder.beginComputePass(timestamps(pass.timed));
              run.setPipeline(pipeline as GPUComputePipeline);
              bands.forEach((band, at) => run.setBindGroup(at, band));
              // A dispatch of `frame` covers the picture in whole blocks, so an
              // edge that does not divide by the workgroup size is covered by a
              // block that runs past it rather than left unwritten. Naming a
              // resource covers that texture the same way, which is what a pass
              // writing a grid of its own size wants. Naming a buffer hands the
              // card the buffer and nothing else: the count is the three words an
              // earlier pass wrote at the start of it.
              if (dispatchesIndirectly(pass.dispatch)) {
                run.dispatchWorkgroupsIndirect(buffers.get(pass.dispatch.indirect) as GPUBuffer, 0);
              } else run.dispatchWorkgroups(...blocks(pass.dispatch, spec.workgroup));
              run.end();
              resolve();
              continue;
            }

            if (!isRenderPass(pass)) continue;
            const samples = pass.visible === undefined ? undefined : counting.get(pass.visible);
            const run = encoder.beginRenderPass({
              ...timestamps(pass.timed),
              // The set the card counts into, named on the pass because a query is
              // opened inside one and the card has to be told where the answer goes
              // before anything is drawn.
              ...(samples ? { occlusionQuerySet: samples } : {}),
              // A pass naming its own textures writes those and not the frame,
              // and each of them is turned with the swap for the same reason a
              // binding is: writing the half a pipeline is sampling this frame is
              // a picture made out of itself.
              colorAttachments: (
                colour ?? [
                  { name: undefined, clear: [0, 0, 0, 1] as [number, number, number, number], resolve: undefined },
                ]
              ).map((attachment) => ({
                view: viewOf(
                  attachment.name === undefined
                    ? texture
                    : (textures.get(turned(attachment.name, swapped)) as GPUTexture)
                ),
                // Where the samples of this attachment are averaged at the end of
                // the pass, which is the only way anything reads a texture keeping
                // several of them. Turned with the swap for the same reason the
                // attachment is, since either may be half of a pair.
                ...(attachment.resolve
                  ? {
                      resolveTarget: viewOf(textures.get(turned(attachment.resolve, swapped)) as GPUTexture),
                    }
                  : {}),
                ...(attachment.clear
                  ? {
                      clearValue: {
                        r: attachment.clear[0],
                        g: attachment.clear[1],
                        b: attachment.clear[2],
                        a: attachment.clear[3],
                      },
                      loadOp: 'clear' as const,
                    }
                  : { loadOp: 'load' as const }),
                storeOp: 'store' as const,
              })),
              // Depth is stored rather than discarded, because what a later pass
              // over the same attachment tests against is what an earlier one
              // left there. Its view is cached like the colour one: a texture
              // following the frame is a new texture after a resize, and the cache
              // hands back a fresh view for it because it is keyed on the object.
              ...(depth
                ? {
                    depthStencilAttachment: {
                      view: viewOf(textures.get(depth.name) as GPUTexture),
                      // A half the format does not keep gets no operations at all,
                      // which the card refuses rather than ignores, so each of the
                      // two is attached only where the format has it.
                      ...(depth.depthHalf
                        ? {
                            ...(depth.clear === undefined
                              ? { depthLoadOp: 'load' as const }
                              : { depthClearValue: depth.clear, depthLoadOp: 'clear' as const }),
                            depthStoreOp: 'store' as const,
                          }
                        : {}),
                      ...(depth.stencilHalf
                        ? {
                            ...(depth.stencilClear === undefined
                              ? { stencilLoadOp: 'load' as const }
                              : { stencilClearValue: depth.stencilClear, stencilLoadOp: 'clear' as const }),
                            stencilStoreOp: 'store' as const,
                          }
                        : {}),
                    },
                  }
                : {}),
            });
            // The value the mask is written with and tested against, set on the
            // pass because that is where the card takes it: it is not compiled
            // into the pipeline, so a pass that never sets it masks against
            // whatever the last pass left. It is pass state a bundle cannot hold,
            // so it is set here before the recorded draws replay against it.
            if (spec.kind === 'render' && spec.depth?.stencil) run.setStencilReference(STENCIL_REFERENCE);
            const bundle = recorded?.get(index);
            if (bundle) run.executeBundles([bundle]);
            else {
              // The one pass that counts its own samples draws inline, because the
              // query opens and closes around the draw on the pass rather than in
              // a bundle. The count is taken around the draw rather than around the
              // pass, since what the card counts is the samples of one draw that
              // got through everything already in the attachment.
              if (samples) run.beginOcclusionQuery(0);
              issueDraw(run, pipeline as GPURenderPipeline, bands, drawn, pass.draw);
              if (samples) run.endOcclusionQuery();
            }
            run.end();
            resolve();
          }

          // A frame whose picture ended up in a texture of its own is copied into
          // the target, which is what a compute pass writing a picture needs: it
          // writes a storage texture and a storage texture cannot be an
          // attachment in the same pass.
          const picture = shown === undefined ? undefined : textures.get(turned(shown, swapped));
          if (picture) encoder.copyTextureToTexture({ texture: picture }, { texture }, [width, height]);

          if (onScreen()) {
            if (!configured) {
              context.configure({
                device,
                format: FORMAT,
                alphaMode: 'opaque',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
              });
              configured = true;
            }
            encoder.copyTextureToTexture({ texture }, { texture: context.getCurrentTexture() }, [width, height]);
          }

          device.queue.submit([encoder.finish()]);
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
          // so they are recorded again against the new one.
          runs = planFramePasses({ ...frame, passes }, geometryOf);
          recordBundles();
        },

        async readBuffer(name: string) {
          const held = buffers.get(name);
          if (!held) throw new Error(`the frame for "${frame.id}" declares no buffer called "${name}"`);

          // Copied into a buffer of its own rather than mapped where it is: a
          // buffer the shader writes cannot be mapped, and mapping the one the
          // frame uses would take it away from the next frame.
          const staging = device.createBuffer({
            label: `${name}-read`,
            size: held.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
          const encoder = device.createCommandEncoder();
          encoder.copyBufferToBuffer(held, 0, staging, 0, held.size);
          device.queue.submit([encoder.finish()]);

          await staging.mapAsync(GPUMapMode.READ);
          // Copied out of the mapping rather than handed over as a view of it,
          // since the memory behind a mapping is gone the moment it is unmapped
          // and a caller reading it afterwards reads nothing.
          const words = new Uint32Array(staging.getMappedRange().slice(0));
          staging.unmap();
          staging.destroy();
          return words;
        },

        dispose() {
          buffer.destroy();
          for (const set of times.values()) set.destroy();
          times.clear();
          for (const set of counting.values()) set.destroy();
          counting.clear();
          for (const texture of textures.values()) texture.destroy();
          textures.clear();
          for (const held of buffers.values()) held.destroy();
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

    async readPixels() {
      const source = target;
      if (!source) return new Uint8Array(width * height * 4);

      const stride = Math.ceil((width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
      const staging = device.createBuffer({
        size: stride * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
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
      staging.destroy();
      return rows;
    },

    dispose() {
      target?.destroy();
      target = null;
      if (configured) context.unconfigure();
    },
  };
}

/** The geometry one pipeline reads and the indices that order it, looked up where
 * a pipeline is made and where a pass is planned so the two agree on which
 * vertices a draw walks. */
type DrawnGeometry = { vertices: VertexResource; ordered: IndexResource | undefined };

/** One frame's passes read into the shape the draw loop replays: the pass, the
 * pipeline it names, the geometry it binds and the attachments it opens with.
 * Held as its own name because a program keeps it in a variable a runtime pass
 * change reassigns rather than in a const built once. */
type FramePlan = ReturnType<typeof planFramePasses>;

/** Every document of the frame is compiled, and each is asked about itself rather
 * than the pipeline being asked: a pipeline made from a module that did not
 * compile is invalid, and every later call on it reports the invalidity instead
 * of the reason for it. With more than one document the message has to say which,
 * so the module's name is what it is labelled with and what the refusal is
 * prefixed by. */
function compileModules(
  device: GPUDevice,
  frame: ShaderFrame,
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
  frame: ShaderFrame,
  compiled: Map<string, GPUShaderModule>,
  geometryOf: (name: string) => DrawnGeometry,
  fullscreen: GPUShaderModule
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
    wired.push({ name: spec.name, layouts, bands });
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
      const constants = moduleOf(frame, spec.compute.module)?.overrides;
      pipelines.set(
        spec.name,
        device.createComputePipeline({
          layout: pipelineLayout,
          compute: { ...stage(spec.compute), ...(constants ? { constants } : {}) },
        })
      );
      continue;
    }

    const constants = moduleOf(frame, spec.fragment.module)?.overrides;
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
    pipelines.set(
      spec.name,
      device.createRenderPipeline({
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
      })
    );
  }

  return { pipelines, wired };
}

/** The passes the frame draws, read once here into the shape the draw loop
 * replays every frame. Nothing here touches the card: each pass is checked
 * against its pipeline and against what earlier passes of the same frame have
 * written, so the loop that submits the frame does no lookups of its own. */
function planFramePasses(frame: ShaderFrame, geometryOf: (name: string) => DrawnGeometry) {
  /** Where one pass keeps the depth of what it draws, looked up once here
   * rather than every frame. The state and the attachment are given to the
   * card in two separate calls, so it reports a disagreement between them
   * against whichever of the two arrived second and names neither the
   * description nor the pass. */
  const depthOf = (pass: RenderPassSpec, spec: RenderPipelineSpec, filled: Set<string>) => {
    const tested = spec.depth;
    if (!pass.depth) {
      if (tested) throw new Error(`the pass on "${spec.name}" tests depth and attaches nothing to keep it in`);
      return undefined;
    }
    const named = pass.depth.resource;
    if (!tested) {
      throw new Error(`the pass on "${spec.name}" keeps depth in "${named}" and its pipeline tests none`);
    }
    // A format is one half, the other or both, and what a pipeline says about
    // each has to match what its format has: the card refuses a mask nobody
    // declared operations for, and refuses operations for a half the format
    // does not keep, both over the pipeline rather than over the description.
    const keepsStencil = tested.format.includes('stencil');
    if (keepsStencil && tested.stencil === undefined) {
      throw new Error(
        `the pass on "${spec.name}" keeps a stencil in ${tested.format} and its pipeline says nothing about the mask`
      );
    }
    if (!keepsStencil && tested.stencil !== undefined) {
      throw new Error(`the pass on "${spec.name}" masks with a stencil and keeps its depth as ${tested.format}`);
    }
    const keepsDepth = tested.format.startsWith('depth');
    if (!keepsDepth && tested.compare !== undefined) {
      throw new Error(`the pass on "${spec.name}" tests depth and keeps it as ${tested.format}, which keeps none`);
    }
    if (keepsDepth && tested.compare === undefined) {
      throw new Error(`the pass on "${spec.name}" keeps depth as ${tested.format} and tests none of it`);
    }
    const resource = resourceOf(frame, named);
    if (!resource || resource.kind !== 'texture') {
      throw new Error(`the frame for "${frame.id}" keeps depth in "${named}", which is no texture it declares`);
    }
    if (resource.format !== tested.format) {
      throw new Error(
        `the pass on "${spec.name}" tests depth as ${tested.format} and keeps it in "${named}", which is ${resource.format}`
      );
    }
    // A texture that never asked to be an attachment has no flag for it, and
    // the card refuses the pass over a usage rather than over the name of the
    // texture the description gave it.
    if (!resource.use.includes('attachment')) {
      throw new Error(`the frame for "${frame.id}" keeps depth in "${named}", which is no attachment it declares`);
    }
    // Every attachment of one pass keeps the same number of samples a pixel,
    // the depth among them, and the card refuses the pass over the count
    // without saying which attachment disagreed with which pipeline.
    if ((resource.samples ?? 1) !== (spec.samples ?? 1)) {
      throw new Error(
        `the pass on "${spec.name}" draws ${spec.samples ?? 1} samples a pixel and keeps depth in "${named}", which keeps ${resource.samples ?? 1}`
      );
    }
    // An attachment with no clear value keeps what is in it, which is what a
    // second surface tested against the first needs. Keeping what no earlier
    // pass wrote is a frame reading its own last one, which is a capability a
    // pair of textures exists for rather than something to arrive at by
    // leaving a value out.
    if (keepsDepth && pass.depth.clear === undefined && !filled.has(named)) {
      throw new Error(`the pass on "${spec.name}" keeps the depth in "${named}", which no earlier pass wrote`);
    }
    // The mask follows the same rule, so the pass that marks empties it and
    // the pass drawn inside the mark keeps what the marking pass left. A pass
    // keeping a mask nothing has written would be drawn wherever the memory
    // happened to hold the reference.
    if (keepsStencil && pass.depth.stencilClear === undefined && !filled.has(named)) {
      throw new Error(`the pass on "${spec.name}" keeps the mask in "${named}", which no earlier pass wrote`);
    }
    return {
      name: named,
      clear: pass.depth.clear,
      stencilClear: pass.depth.stencilClear,
      depthHalf: keepsDepth,
      stencilHalf: keepsStencil,
    };
  };

  /** Where the samples of one attachment are averaged, which is a texture of
   * the same size and format keeping one sample of each pixel. An attachment
   * keeping several has to name one, since nothing can read the attachment
   * itself: it cannot be copied out of and no binding here declares a
   * multisampled read. */
  const resolved = (
    spec: RenderPipelineSpec,
    attachment: { resource: string; resolve?: string },
    into: TextureResource
  ) => {
    if (into.samples === undefined) {
      if (attachment.resolve === undefined) return undefined;
      throw new Error(
        `the pass on "${spec.name}" averages "${attachment.resource}" into "${attachment.resolve}" and it keeps one sample a pixel`
      );
    }
    const name = attachment.resolve;
    if (name === undefined) {
      throw new Error(
        `the pass on "${spec.name}" keeps several samples a pixel in "${attachment.resource}" and averages them nowhere`
      );
    }
    const resource = resourceOf(frame, name);
    if (!resource || resource.kind !== 'texture') {
      throw new Error(
        `the frame for "${frame.id}" averages "${attachment.resource}" into "${name}", which is no texture it declares`
      );
    }
    if (!resource.use.includes('attachment')) {
      throw new Error(
        `the frame for "${frame.id}" averages "${attachment.resource}" into "${name}", which is no attachment it declares`
      );
    }
    // Same shape and same format, because averaging is a per-pixel read of the
    // samples of the pixel underneath it, and same single sample, because a
    // texture keeping several is what is being averaged rather than what an
    // average lands in.
    const shape = (resource: TextureResource) => `${resource.size.join('x')} ${resource.format}`;
    if (resource.samples !== undefined || shape(resource) !== shape(into)) {
      throw new Error(
        `the pass on "${spec.name}" averages "${attachment.resource}" into "${name}", which is not the same picture keeping one sample`
      );
    }
    return name;
  };

  /** Which textures one pass writes its colours into, looked up once here.
   * The count, the order and every format have to agree with what the
   * pipeline says it returns, and a card refuses the pass over the first
   * attachment that does not match without saying which description named
   * it. */
  const coloursOf = (pass: RenderPassSpec, spec: RenderPipelineSpec, filled: Set<string>) => {
    const written = spec.targets;
    if (!pass.colour) {
      if (written) throw new Error(`the pass on "${spec.name}" writes ${written.length} colours and attaches none`);
      // The frame the reader sees keeps one sample of each pixel, so there is
      // nothing for a pass drawing into it to average and no texture to
      // average it into.
      if (spec.samples) {
        throw new Error(`the pass on "${spec.name}" draws ${spec.samples} samples a pixel into the frame`);
      }
      return undefined;
    }
    if (!written) {
      throw new Error(
        `the pass on "${spec.name}" attaches ${pass.colour.length} textures and its pipeline writes the frame`
      );
    }
    if (written.length !== pass.colour.length) {
      throw new Error(
        `the pass on "${spec.name}" writes ${written.length} colours and attaches ${pass.colour.length} textures`
      );
    }
    return pass.colour.map((attachment, index) => {
      const target = written[index] as { format: GPUTextureFormat };
      const resource = resourceOf(frame, attachment.resource);
      if (!resource || resource.kind !== 'texture') {
        throw new Error(
          `the frame for "${frame.id}" writes colour into "${attachment.resource}", which is no texture it declares`
        );
      }
      if (resource.format !== target.format) {
        throw new Error(
          `the pass on "${spec.name}" writes colour ${index} as ${target.format} into "${attachment.resource}", which is ${resource.format}`
        );
      }
      if (!resource.use.includes('attachment')) {
        throw new Error(
          `the frame for "${frame.id}" writes colour into "${attachment.resource}", which is no attachment it declares`
        );
      }
      if (attachment.clear === undefined && !filled.has(attachment.resource)) {
        throw new Error(
          `the pass on "${spec.name}" keeps the colour in "${attachment.resource}", which no earlier pass wrote`
        );
      }
      if ((resource.samples ?? 1) !== (spec.samples ?? 1)) {
        throw new Error(
          `the pass on "${spec.name}" draws ${spec.samples ?? 1} samples a pixel into "${attachment.resource}", which keeps ${resource.samples ?? 1}`
        );
      }
      return { name: attachment.resource, clear: attachment.clear, resolve: resolved(spec, attachment, resource) };
    });
  };

  // What an earlier pass of this frame has already written, which is what
  // separates a pass keeping the picture so far from one keeping whatever was
  // left in a texture by the frame before it.
  const filled = new Set<string>();
  const read = (pass: RenderPassSpec, spec: RenderPipelineSpec, drawn: DrawnGeometry | undefined) => {
    const depth = depthOf(pass, spec, filled);
    const colour = coloursOf(pass, spec, filled);
    if (depth) filled.add(depth.name);
    for (const attachment of colour ?? []) filled.add(attachment.name);
    return { pass, spec, drawn, depth, colour };
  };

  return frame.passes.map((pass) => {
    const spec = frame.pipelines.find((candidate) => candidate.name === pass.pipeline);
    if (!spec) throw new Error(`the frame names a pipeline "${pass.pipeline}" it does not carry`);
    // The kind of pass is the pipeline's, and a pass carrying the other
    // kind's instruction is a description nothing could resolve: a draw
    // count means nothing to a compute pipeline and a dispatch means nothing
    // to a render one.
    if (isRenderPass(pass) !== (spec.kind === 'render')) {
      throw new Error(`the pass on "${spec.name}" asks for the other kind of work than the pipeline does`);
    }
    // A pass reading its counts out of a buffer says nothing about which
    // vertices are read, so its pipeline is still what decides whether there
    // is geometry to bind, and either answer is a frame that draws.
    if (isRenderPass(pass) && drawsIndirectly(pass.draw) && spec.kind === 'render') {
      const named = spec.geometry;
      return read(pass, spec, named === undefined ? undefined : geometryOf(named));
    }
    // A pass that counts instances alone draws whatever its pipeline reads, so
    // a pipeline reading no buffer has nothing for it to draw and says so here
    // rather than drawing nothing on the card.
    if (isRenderPass(pass) && !drawsCorners(pass.draw)) {
      if (spec.kind !== 'render' || spec.geometry === undefined) {
        throw new Error(`the pass on "${spec.name}" draws its pipeline's geometry and that pipeline reads none`);
      }
      return read(pass, spec, geometryOf(spec.geometry));
    }
    if (!isRenderPass(pass) || spec.kind !== 'render') {
      return { pass, spec, drawn: undefined, depth: undefined, colour: undefined };
    }
    return read(pass, spec, undefined);
  });
}
