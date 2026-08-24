/**
 * The second half of the executor: a plan plus resident resources plus compiled
 * pipelines become one command encoder, submitted once.
 *
 * This is the "one encoder" of [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
 * §7's `submit/` layer. It reads the plan [plan.ts](plan.ts) built from the graph,
 * the buffers and textures the arena allocated, and the pipelines a compilation
 * produced, and it records every pass of the frame onto a single encoder and
 * submits it. It lived inside the WebGPU backend's `createProgram` until
 * [ROADMAP.md](../docs/ROADMAP.md) item 13 lifted it out; the calls it makes are
 * unchanged by the move, which is what keeps the twelve trace presets agreeing.
 *
 * It reaches no DOM object, per §7 rule 3: the one place a frame touches the
 * canvas — configuring it and copying the finished picture onto it — is handed in
 * as `composite`, so the backend keeps the canvas and this keeps the encoder. What
 * `composite` receives is the finished target texture, and what it does with it is
 * the backend's business.
 */
import type { Dispatch, RenderPassSpec } from '../renderer/types.js';
import { dispatchesIndirectly, isRenderPass } from '../renderer/types.js';
import type { DrawnGeometry, FramePlan } from './plan.js';

/** Everything one frame needs to become commands: the plan the graph produced,
 * the resident resources the arena resolved, the pipelines the cache built, and
 * the two callbacks that stay the backend's — `issueDraw`, which knows how a
 * pipeline's geometry is drawn, and `composite`, which knows the canvas. */
export interface FrameExecution {
  device: GPUDevice;
  /** Plays every queued resident upload against the frame about to be recorded,
   * so a write a pass reads has landed before the pass. It is the arena's, handed
   * in so this file allocates and owns nothing. */
  flush: () => void;
  runs: FramePlan;
  pipelines: Map<string, GPURenderPipeline | GPUComputePipeline>;
  /** The bind groups for this turn of the frame, one list per pipeline. */
  bound: Map<string, GPUBindGroup[]>;
  /** The pre-recorded draws of every bundled pass on this turn, by pass index. */
  recorded: Map<number, GPURenderBundle>;
  times: Map<string, GPUQuerySet>;
  counting: Map<string, GPUQuerySet>;
  buffers: Map<string, GPUBuffer>;
  textures: Map<string, GPUTexture>;
  /** The texture the frame is drawn into and read back from. */
  target: GPUTexture;
  viewOf: (texture: GPUTexture) => GPUTextureView;
  /** The name a binding or attachment points at on this turn, its partner on the
   * other. */
  turned: (name: string, swapped: boolean) => string;
  swapped: boolean;
  shown: string | undefined;
  width: number;
  height: number;
  /** How many workgroups a counted dispatch runs, in whole blocks of the
   * pipeline's own size. */
  blocks: (dispatch: Dispatch, workgroup: [number, number, number]) => [number, number, number];
  /** The pipeline, the bind groups and the draw one render pass issues, played
   * into the pass itself. Kept in the backend because it reads the geometry
   * buffers a pipeline walks. */
  issueDraw: (
    into: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    bands: GPUBindGroup[],
    drawn: DrawnGeometry | undefined,
    draw: RenderPassSpec['draw']
  ) => void;
  /** Where the finished picture meets the canvas, if anyone is looking. Handed in
   * so this file names no DOM object. */
  composite: (encoder: GPUCommandEncoder, target: GPUTexture) => void;
}

/**
 * Records one frame's passes onto a single encoder and submits it, exactly as the
 * WebGPU backend's `draw` did before this was its own layer. Every pass of the
 * plan runs in order on one encoder and the whole frame is submitted once, so a
 * frame with one pass in it makes exactly the calls a single draw made before.
 */
export function runFrame(exec: FrameExecution): void {
  const {
    device,
    runs,
    pipelines,
    bound,
    recorded,
    times,
    counting,
    buffers,
    textures,
    target,
    viewOf,
    turned,
    swapped,
    shown,
    width,
    height,
    blocks,
    issueDraw,
    composite,
  } = exec;

  // Every upload the frame queued lands here, before a pass is recorded and so
  // before any draw reads it. A resize that rebuilt the textures has already run
  // in the backend; the queued writes go in against the frame the encoder is
  // about to record, which is the ordering item 11 replaced the unsequenced
  // write-on-resize with.
  exec.flush();
  const encoder = device.createCommandEncoder();
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
            ? target
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
  if (picture) encoder.copyTextureToTexture({ texture: picture }, { texture: target }, [width, height]);

  // The one place a frame meets the canvas, handed back to the backend so this
  // file names no DOM object. It adds its copy to this same encoder, so the
  // whole frame — picture and present alike — is still submitted once.
  composite(encoder, target);

  device.queue.submit([encoder.finish()]);
}

/** The value a mask is marked with and tested against, the same one the pipeline
 * was built to compare. It is one number rather than a choice, because the mode a
 * pipeline names is what decides whether it is written or compared. Kept beside
 * the loop that sets it for the same reason it is one number: a second value
 * nothing reads differently would be a thing two places could disagree about. */
const STENCIL_REFERENCE = 1;
