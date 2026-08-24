/**
 * The second half of the executor: a plan already resolved to the resources it
 * draws with becomes one command encoder, submitted once.
 *
 * This is the "one encoder" of [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
 * §7's `submit/` layer. Every pass of the frame is recorded onto a single encoder
 * and the whole frame submitted once, exactly as the WebGPU backend's `draw` did
 * before this was its own layer. It lived inside `createProgram` until
 * [ROADMAP.md](../docs/ROADMAP.md) item 13 lifted it out, and item 16 moved the
 * last string lookups out of the frame loop: what this file reads is a
 * `ResolvedRun` per pass, carrying the pipeline, the bind groups, the attachment
 * textures and the query sets **as the objects themselves** rather than as names
 * the loop resolves against a map every frame. The backend resolves them once, per
 * turn, and hands the resolved list here; §3 row 7 — "a map lookup per draw per
 * frame" — is gone from the draw path, and reaching for a resource of the wrong
 * kind is a type error at the seam rather than a `Map.get` returning `undefined`.
 *
 * It reaches no DOM object, per §7 rule 3: the one place a frame touches the
 * canvas — configuring it and copying the finished picture onto it — is handed in
 * as `composite`, so the backend keeps the canvas and this keeps the encoder. What
 * `composite` receives is the finished target texture, and what it does with it is
 * the backend's business.
 */
import type { DrawSpec } from '../renderer/types.js';
import { drawsCorners, drawsIndirectly } from '../renderer/types.js';

/** One colour attachment of a pass, resolved to the textures it writes and
 * averages into. `texture` is already turned for the frame's swap, so the loop
 * neither looks a name up nor knows a swap happened. */
export interface ResolvedColour {
  texture: GPUTexture;
  /** Where this attachment's samples are averaged at the end of the pass, already
   * turned, or `undefined` where it keeps one sample a pixel. */
  resolveInto: GPUTexture | undefined;
  clear: [number, number, number, number] | undefined;
}

/** The depth attachment of a pass, resolved to the texture it keeps depth in.
 * `depthHalf` and `stencilHalf` say which halves the format carries, so each is
 * attached only where the card keeps it. */
export interface ResolvedDepth {
  texture: GPUTexture;
  clear: number | undefined;
  stencilClear: number | undefined;
  depthHalf: boolean;
  stencilHalf: boolean;
}

/** The geometry one inline draw walks, resolved to the buffers themselves. A
 * bundled pass records its draw with the same shape at build time, so this is
 * what both the executor and the bundle recorder hand `issueDraw`. */
export interface ResolvedGeometry {
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  index: { buffer: GPUBuffer; format: GPUIndexFormat; count: number } | undefined;
}

/** One pass of the plan, resolved to the resources it draws with. Everything a
 * name would have pointed at is here as the object itself, so the frame loop does
 * no lookup of its own. */
export interface ResolvedRun {
  kind: 'render' | 'compute';
  pipeline: GPURenderPipeline | GPUComputePipeline;
  bands: GPUBindGroup[];
  /** The pre-recorded draws of a bundled render pass, or `undefined` where the
   * pass draws inline (the one pass that counts its own samples, and every compute
   * pass). */
  bundle: GPURenderBundle | undefined;
  /** The set a timed pass writes a time into at each end, and the buffer those two
   * times resolve to. Both `undefined` where the pass is untimed or the device
   * cannot time a pass. */
  timesSet: GPUQuerySet | undefined;
  timedInto: GPUBuffer | undefined;
  /** The set the one counted pass opens an occlusion query on, and where its count
   * resolves. */
  countingSet: GPUQuerySet | undefined;
  visibleInto: GPUBuffer | undefined;
  /** For a compute pass: the workgroup counts already worked out, or the buffer the
   * card reads them from. `undefined` for a render pass. */
  dispatch: { blocks: [number, number, number] } | { indirect: GPUBuffer } | undefined;
  /** For a render pass: the colour attachments, or `undefined` where the pass
   * writes the frame the reader sees. */
  colour: ResolvedColour[] | undefined;
  depth: ResolvedDepth | undefined;
  /** For an inline render draw: the geometry buffers, and the buffer an indirect
   * draw reads its counts from. */
  geometry: ResolvedGeometry | undefined;
  indirect: GPUBuffer | undefined;
  /** What the render pass draws, kept for the shape of the draw — corners,
   * geometry or indirect — and the instance count. `undefined` for a compute pass. */
  draw: DrawSpec | undefined;
  /** Whether the pass sets a stencil reference before its draws, which a bundle
   * cannot hold. */
  stencil: boolean;
}

/** Everything one frame needs to become commands: the passes already resolved, the
 * resident uploads to flush, the target the frame is drawn into, and the two
 * callbacks that stay the backend's — `viewOf`, which caches a view per texture,
 * and `composite`, which knows the canvas. */
export interface FrameExecution {
  device: GPUDevice;
  /** Plays every queued resident upload against the frame about to be recorded,
   * so a write a pass reads has landed before the pass. It is the arena's, handed
   * in so this file allocates and owns nothing. */
  flush: () => void;
  runs: ResolvedRun[];
  /** The texture the frame is drawn into and read back from, and the default
   * attachment a pass writing no textures of its own opens with. */
  target: GPUTexture;
  viewOf: (texture: GPUTexture) => GPUTextureView;
  /** The texture a frame whose picture ended up in one of its own is copied out
   * of, already turned, or `undefined` where the passes drew straight into the
   * target. */
  picture: GPUTexture | undefined;
  width: number;
  height: number;
  /** Where the finished picture meets the canvas, if anyone is looking. Handed in
   * so this file names no DOM object. */
  composite: (encoder: GPUCommandEncoder, target: GPUTexture) => void;
}

/** The colour a pass writing no textures of its own clears the frame to. */
const BLACK: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Records one frame's passes onto a single encoder and submits it, exactly as the
 * WebGPU backend's `draw` did before this was its own layer. Every pass of the
 * plan runs in order on one encoder and the whole frame is submitted once, so a
 * frame with one pass in it makes exactly the calls a single draw made before.
 */
export function runFrame(exec: FrameExecution): void {
  const { device, runs, target, viewOf, picture, width, height, composite } = exec;

  // Every upload the frame queued lands here, before a pass is recorded and so
  // before any draw reads it. A resize that rebuilt the textures has already run
  // in the backend; the queued writes go in against the frame the encoder is
  // about to record, which is the ordering item 11 replaced the unsequenced
  // write-on-resize with.
  exec.flush();
  const encoder = device.createCommandEncoder();
  for (const run of runs) {
    /** What a pass is opened with so the card writes a time at each end of
     * it. A device without the feature gets nothing, which is the whole of
     * how a frame asking to be timed still draws on one. */
    const timestamps = run.timesSet
      ? { timestampWrites: { querySet: run.timesSet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
      : {};

    /** Every query this pass asked for, copied out of the sets into the
     * buffers the description named. It runs after the pass has ended and
     * on the frame's own encoder, because a resolve is a command the card
     * carries out in order rather than something a caller reads. */
    const resolve = () => {
      if (run.timesSet && run.timedInto) {
        encoder.resolveQuerySet(run.timesSet, 0, 2, run.timedInto, 0);
      }
      if (run.countingSet && run.visibleInto) {
        encoder.resolveQuerySet(run.countingSet, 0, 1, run.visibleInto, 0);
      }
    };

    if (run.kind === 'compute') {
      const compute = encoder.beginComputePass(timestamps);
      compute.setPipeline(run.pipeline as GPUComputePipeline);
      run.bands.forEach((band, at) => compute.setBindGroup(at, band));
      // A dispatch of `frame` covers the picture in whole blocks, so an
      // edge that does not divide by the workgroup size is covered by a
      // block that runs past it rather than left unwritten. Naming a
      // buffer hands the card the buffer and nothing else: the count is the
      // three words an earlier pass wrote at the start of it. Both are
      // worked out where the frame was resolved rather than here.
      const dispatch = run.dispatch as { blocks: [number, number, number] } | { indirect: GPUBuffer };
      if ('indirect' in dispatch) compute.dispatchWorkgroupsIndirect(dispatch.indirect, 0);
      else compute.dispatchWorkgroups(...dispatch.blocks);
      compute.end();
      resolve();
      continue;
    }

    const run_pass = encoder.beginRenderPass({
      ...timestamps,
      // The set the card counts into, given on the pass because a query is
      // opened inside one and the card has to be told where the answer goes
      // before anything is drawn.
      ...(run.countingSet ? { occlusionQuerySet: run.countingSet } : {}),
      // A pass naming its own textures writes those and not the frame. Each
      // was turned with the swap where the frame was resolved, so this
      // neither looks a name up nor knows a swap happened.
      colorAttachments: (
        run.colour ?? [{ texture: target, resolveInto: undefined, clear: BLACK }]
      ).map((attachment) => ({
        view: viewOf(attachment.texture),
        // Where the samples of this attachment are averaged at the end of
        // the pass, which is the only way anything reads a texture keeping
        // several of them.
        ...(attachment.resolveInto ? { resolveTarget: viewOf(attachment.resolveInto) } : {}),
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
      // remade by a resize is a new object, and the cache hands back a
      // fresh view for it because it is keyed on the object.
      ...(run.depth
        ? {
            depthStencilAttachment: {
              view: viewOf(run.depth.texture),
              // A half the format does not keep gets no operations at all,
              // which the card refuses rather than ignores, so each of the
              // two is attached only where the format has it.
              ...(run.depth.depthHalf
                ? {
                    ...(run.depth.clear === undefined
                      ? { depthLoadOp: 'load' as const }
                      : { depthClearValue: run.depth.clear, depthLoadOp: 'clear' as const }),
                    depthStoreOp: 'store' as const,
                  }
                : {}),
              ...(run.depth.stencilHalf
                ? {
                    ...(run.depth.stencilClear === undefined
                      ? { stencilLoadOp: 'load' as const }
                      : { stencilClearValue: run.depth.stencilClear, stencilLoadOp: 'clear' as const }),
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
    if (run.stencil) run_pass.setStencilReference(STENCIL_REFERENCE);
    if (run.bundle) run_pass.executeBundles([run.bundle]);
    else {
      // The one pass that counts its own samples draws inline, because the
      // query opens and closes around the draw on the pass rather than in
      // a bundle. The count is taken around the draw rather than around the
      // pass, since what the card counts is the samples of one draw that
      // got through everything already in the attachment.
      if (run.countingSet) run_pass.beginOcclusionQuery(0);
      issueDraw(run_pass, run.pipeline as GPURenderPipeline, run.bands, run.geometry, run.indirect, run.draw as DrawSpec);
      if (run.countingSet) run_pass.endOcclusionQuery();
    }
    run_pass.end();
    resolve();
  }

  // A frame whose picture ended up in a texture of its own is copied into
  // the target, which is what a compute pass writing a picture needs: it
  // writes a storage texture and a storage texture cannot be an
  // attachment in the same pass.
  if (picture) encoder.copyTextureToTexture({ texture: picture }, { texture: target }, [width, height]);

  // The one place a frame meets the canvas, handed back to the backend so this
  // file names no DOM object. It adds its copy to this same encoder, so the
  // whole frame — picture and present alike — is still submitted once.
  composite(encoder, target);

  device.queue.submit([encoder.finish()]);
}

/**
 * The pipeline, the bind groups and the draw one render pass issues, played into
 * either the pass itself or a bundle recording it. It reads the geometry buffers
 * as the objects themselves rather than by name, so the same function serves the
 * inline draw the executor issues and the bundle the backend records at build
 * time. It is the whole of what a bundle may hold: the value the mask is tested
 * against and the counting of a draw's surviving samples are pass state a bundle
 * cannot carry, so they stay on the pass and out of here.
 */
export function issueDraw(
  into: GPURenderPassEncoder | GPURenderBundleEncoder,
  pipeline: GPURenderPipeline,
  bands: GPUBindGroup[],
  geometry: ResolvedGeometry | undefined,
  indirect: GPUBuffer | undefined,
  draw: DrawSpec
): void {
  into.setPipeline(pipeline);
  bands.forEach((band, at) => into.setBindGroup(at, band));
  if (drawsIndirectly(draw)) {
    const counts = indirect as GPUBuffer;
    if (geometry) {
      into.setVertexBuffer(0, geometry.vertexBuffer);
      if (geometry.index) {
        into.setIndexBuffer(geometry.index.buffer, geometry.index.format);
        into.drawIndexedIndirect(counts, 0);
      } else into.drawIndirect(counts, 0);
    } else into.drawIndirect(counts, 0);
  } else if (drawsCorners(draw)) into.draw(draw.vertices, draw.instances);
  else if (geometry) {
    into.setVertexBuffer(0, geometry.vertexBuffer);
    if (geometry.index) {
      into.setIndexBuffer(geometry.index.buffer, geometry.index.format);
      into.drawIndexed(geometry.index.count, draw.instances);
    } else into.draw(geometry.vertexCount, draw.instances);
  }
}

/** The value a mask is marked with and tested against, the same one the pipeline
 * was built to compare. It is one number rather than a choice, because the mode a
 * pipeline names is what decides whether it is written or compared. Kept beside
 * the loop that sets it for the same reason it is one number: a second value
 * nothing reads differently would be a thing two places could disagree about. */
const STENCIL_REFERENCE = 1;
