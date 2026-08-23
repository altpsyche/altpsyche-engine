/**
 * A stand-in for a graphics card, so the fast suite can hold the backend to its
 * calls.
 *
 * There is no WebGPU in node. What this supplies is the answers a device would
 * give, which is a module that reports what it was told to report, a buffer that
 * hands back the bytes a test put there, and a texture that knows its own size.
 * It writes nothing down itself: the recording is `wrapDevice` in
 * `lib/renderer/trace.ts`, and the browser gate wraps a real device in that same
 * function, which is what stops this file drifting into fiction.
 *
 * Nothing here draws, so a trace says the right calls were made in the right
 * order and only a real frame says a picture came out, which is why every
 * capability also has a preset a browser gate draws.
 */
import { wrapDevice, type TraceEntry } from '@altpsyche/engine';

export type { TraceEntry };

export interface FakeGPU {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: { configured: number; unconfigured: number };
  trace: TraceEntry[];
  /** Every call of one kind, in order, which is what most assertions want. */
  calls(name: string): TraceEntry[];
  /** The bytes handed to `writeBuffer`, read as floats, which is how a uniform
   * block arrives. */
  written(): Float32Array | undefined;
  /** What the next `mapAsync` hands back, padded to the row stride a real
   * device pads to, so the repack the backend does is exercised rather than
   * assumed. */
  mapped: Uint8Array;
  /** What the next shader module reports about itself. Empty means it compiled. */
  compilation: GPUCompilationMessage[];
  /** The ceilings this device reports. A test varies them to stand for another
   * machine, since a report is the device's answer rather than this file's. */
  limits: Record<string, number>;
  /** The optional parts of the API this device has. Empty stands for a device
   * with nothing optional, which is a real device rather than a broken one. */
  features: Set<string>;
}

/**
 * The WebGPU enums, which are globals a browser supplies and node does not.
 *
 * The values are the specification's own bit flags. They matter to a test rather
 * than only to a device: a buffer created without `COPY_DST` cannot be written
 * to, and asserting the number is how a usage flag going missing is caught.
 */
export function installGPUConstants(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.GPUBufferUsage ??= {
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512,
  };
  globals.GPUTextureUsage ??= {
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16,
  };
  globals.GPUMapMode ??= { READ: 1, WRITE: 2 };
  // A binding's visibility is these flags combined, so a layout that named the
  // wrong stages is caught by the number rather than by a driver refusing it.
  globals.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
}

/** A canvas the backend can ask for a WebGPU context, which jsdom answers with
 * null for. `connected` is what decides whether the backend treats it as a
 * surface a reader can see.
 *
 * The context records itself rather than going through `wrapDevice`, because a
 * canvas is not part of a device and the browser gate draws on a detached one,
 * where none of these three calls happens on either side. */
function fakeCanvas(state: FakeGPU, connected: boolean, over?: HTMLCanvasElement): HTMLCanvasElement {
  const getContext = (kind: string) => {
    state.trace.push({ call: 'getContext', kind });
    return kind === 'webgpu' ? context : null;
  };

  const canvas = { width: 800, height: 600, isConnected: connected, getContext };

  const context = {
    configure(config: GPUCanvasConfiguration) {
      state.context.configured += 1;
      state.trace.push({ call: 'context.configure', format: config.format, usage: config.usage });
    },
    unconfigure() {
      state.context.unconfigured += 1;
      state.trace.push({ call: 'context.unconfigure' });
    },
    getCurrentTexture() {
      state.trace.push({ call: 'context.getCurrentTexture' });
      return { label: 'canvas' };
    },
  };

  // A real element where the caller has one, because a surface adds listeners to
  // its canvas and a plain object has nowhere to put them. Only the context is
  // the double's: the element stays the document's, so its size and its events
  // behave the way a page's do.
  if (over) {
    Object.defineProperty(over, 'getContext', { value: getContext, configurable: true });
    return over;
  }

  return canvas as unknown as HTMLCanvasElement;
}

/**
 * A device, a canvas and the trace of everything the backend did to them.
 *
 * `connected` is the one thing a caller usually varies, because a detached
 * canvas is the case a run collecting pixels uses and an attached one is the
 * case a page uses, and the backend behaves differently for each.
 */
export function createFakeGPU({
  connected = false,
  over,
}: { connected?: boolean; over?: HTMLCanvasElement } = {}): FakeGPU {
  installGPUConstants();

  const trace: TraceEntry[] = [];
  const state = {
    trace,
    context: { configured: 0, unconfigured: 0 },
    mapped: new Uint8Array(0),
    compilation: [] as GPUCompilationMessage[],
    // The specification's floors rather than any machine's, so a test reading one
    // is reading the least a device may report.
    limits: {
      maxTextureDimension2D: 8192,
      maxBindGroups: 4,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 134217728,
      maxComputeWorkgroupSizeX: 256,
      maxComputeInvocationsPerWorkgroup: 256,
      maxColorAttachments: 8,
    },
    features: new Set(['timestamp-query', 'depth-clip-control']),
  } as unknown as FakeGPU;

  // The answers a device would give, and nothing else. Every one of these is
  // reached through the recorder, so a call that is not written down here is a
  // call the recorder does not know about either.
  const bare = {
    // A device that is never taken away. A caller reads this the moment it is
    // handed a device, so a stand-in without one is a stand-in a surface cannot
    // be built over at all.
    lost: new Promise<GPUDeviceLostInfo>(() => {}),

    // A browser keeps its ceilings on the prototype of the object it hands back,
    // so an empty object over the state is what a report meets rather than the
    // state itself: a read of the object's own keys finds none of them here for
    // the same reason it finds none of them on a card. It is built per read so a
    // test standing for another machine is answered after the device was made.
    get limits() {
      return Object.create(state.limits) as Record<string, number>;
    },

    // A set rather than a list, the way a browser answers, so the sorting the
    // report does is exercised rather than assumed.
    get features() {
      return state.features;
    },

    createShaderModule() {
      return { getCompilationInfo: async () => ({ messages: state.compilation }) };
    },

    createBindGroupLayout() {
      return {};
    },

    createPipelineLayout() {
      return {};
    },

    createRenderPipeline() {
      return { getBindGroupLayout: (index: number) => ({ label: `layout${index}` }) };
    },

    createComputePipeline() {
      return {};
    },

    createBuffer(descriptor: GPUBufferDescriptor) {
      // Every range handed out, so giving the mapping up can take them away the
      // way a device does. A device detaches the memory behind a mapping on
      // `unmap`, and a stand-in that left it readable would let a caller hand back
      // a view of it and pass, while the same code reads zeroes off a card.
      let handed: ArrayBuffer[] = [];
      return {
        size: descriptor.size,
        async mapAsync() {},
        getMappedRange() {
          const range = (state.mapped.buffer as ArrayBuffer).slice(
            state.mapped.byteOffset,
            state.mapped.byteOffset + state.mapped.byteLength
          );
          handed.push(range);
          return range;
        },
        unmap() {
          // Transferring a buffer to a clone nobody keeps is what detaches it,
          // since there is no other way to empty one from outside.
          for (const range of handed) structuredClone(range, { transfer: [range] });
          handed = [];
        },
        destroy() {},
      };
    },

    createBindGroup() {
      return {};
    },

    createTexture(descriptor: GPUTextureDescriptor) {
      const size = descriptor.size as number[];
      return {
        width: size[0],
        height: size[1],
        createView: () => ({}),
        destroy() {},
      };
    },

    createSampler() {
      return {};
    },

    createQuerySet(descriptor: GPUQuerySetDescriptor) {
      return { type: descriptor.type, count: descriptor.count, destroy() {} };
    },

    createCommandEncoder() {
      return {
        beginRenderPass: () => ({
          setPipeline() {},
          setBindGroup() {},
          setVertexBuffer() {},
          setIndexBuffer() {},
          draw() {},
          drawIndexed() {},
          drawIndirect() {},
          drawIndexedIndirect() {},
          setStencilReference() {},
          beginOcclusionQuery() {},
          endOcclusionQuery() {},
          executeBundles() {},
          end() {},
        }),
        beginComputePass: () => ({
          setPipeline() {},
          setBindGroup() {},
          dispatchWorkgroups() {},
          dispatchWorkgroupsIndirect() {},
          end() {},
        }),
        copyTextureToTexture() {},
        copyBufferToBuffer() {},
        resolveQuerySet() {},
        copyTextureToBuffer() {},
        finish: () => ({}),
      };
    },

    createRenderBundleEncoder() {
      return {
        setPipeline() {},
        setBindGroup() {},
        setVertexBuffer() {},
        setIndexBuffer() {},
        draw() {},
        drawIndexed() {},
        drawIndirect() {},
        drawIndexedIndirect() {},
        finish: () => ({}),
      };
    },

    queue: {
      writeBuffer() {},
      writeTexture() {},
      submit() {},
    },
  };

  state.device = wrapDevice(bare as unknown as GPUDevice, trace);
  state.canvas = fakeCanvas(state, connected, over);
  state.calls = (name: string) => trace.filter((entry) => entry.call === name);
  state.written = () => {
    const writes = trace.filter((entry) => entry.call === 'writeBuffer');
    return writes.length ? (writes[writes.length - 1]!.data as Float32Array) : undefined;
  };

  return state;
}

/** A frame padded the way a real device pads it, which is rows rounded up to 256
 * bytes. Each pixel carries the row it came from, so a repack that keeps the
 * padding or drops the wrong bytes is visible in the result. */
export function paddedFrame(width: number, height: number): Uint8Array {
  const stride = Math.ceil((width * 4) / 256) * 256;
  const padded = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width * 4; x++) padded[y * stride + x] = y + 1;
    for (let x = width * 4; x < stride; x++) padded[y * stride + x] = 255;
  }
  return padded;
}
