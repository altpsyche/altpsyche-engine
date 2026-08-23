/**
 * The recorder both halves of the trace contract share.
 *
 * There is no WebGPU in node, so the fast suite holds the backend to its calls
 * by handing it a device that writes them down. A device that writes them down
 * and invents its own answers is a second copy of this repo's assumptions, and a
 * copy nothing checks drifts: the carousel export restated the renderer's frame
 * type instead of importing it, a restated shape cannot disagree with itself,
 * and the export died on its first slide for a whole run of commits.
 *
 * So the recording lives here once. The fast suite wraps a device that fabricates
 * its answers, the browser gate wraps a real one, and the two produce traces of
 * the same shape that can be compared call for call.
 *
 * Nothing here draws or decides anything. Every method forwards to the device it
 * was given and writes down what it was asked for on the way through.
 */

/** One recorded call: what was asked for, and the arguments worth asserting. The
 * caller's own descriptor is kept beside the fields read out of it, so a test
 * reads whichever is closer to what it means and the contract compares the flat
 * ones. */
export interface TraceEntry {
  call: string;
  [field: string]: unknown;
}

/**
 * Which fields of each call the contract compares, and it is deliberately not
 * every field.
 *
 * A trace off a real device carries objects the driver made and a trace off the
 * double carries objects this file made, so comparing a descriptor whole would
 * report a difference on every call. What is compared is the flat reading taken
 * on the way through, which is the same on both sides when the backend asked for
 * the same thing.
 *
 * A call absent from here is compared on its name and its position alone.
 */
export const COMPARED: Record<string, readonly string[]> = {
  createShaderModule: ['label', 'code'],
  createBindGroupLayout: ['label', 'entries'],
  createPipelineLayout: ['label', 'bindGroupLayouts'],
  createRenderPipeline: [
    'layout',
    'vertexModule',
    'vertexEntry',
    'fragmentModule',
    'fragmentEntry',
    'constants',
    'targets',
    'topology',
    'depth',
    'samples',
  ],
  createComputePipeline: ['layout', 'computeModule', 'computeEntry', 'constants'],
  getBindGroupLayout: ['index'],
  createBuffer: ['label', 'size', 'usage'],
  createBindGroup: ['bindings'],
  createTexture: ['label', 'size', 'format', 'usage', 'levels', 'samples'],
  createSampler: ['label', 'magFilter', 'minFilter', 'addressModeU', 'addressModeV'],
  createView: ['label', 'level', 'levels'],
  beginRenderPass: ['colour', 'depth', 'times', 'counts'],
  beginComputePass: ['times'],
  dispatchWorkgroups: ['x', 'y', 'z'],
  setBindGroup: ['index', 'group'],
  setVertexBuffer: ['slot', 'buffer'],
  setIndexBuffer: ['buffer', 'format'],
  draw: ['count', 'instances'],
  drawIndexed: ['count', 'instances'],
  drawIndirect: ['buffer', 'offset'],
  drawIndexedIndirect: ['buffer', 'offset'],
  dispatchWorkgroupsIndirect: ['buffer', 'offset'],
  createRenderBundleEncoder: ['label', 'colorFormats', 'depthStencilFormat', 'sampleCount'],
  finishBundle: ['label'],
  executeBundles: ['bundles'],
  copyTextureToTexture: ['from', 'to'],
  copyTextureToBuffer: ['from', 'stride', 'size'],
  copyBufferToBuffer: ['from', 'to', 'size'],
  createQuerySet: ['label', 'type', 'count'],
  resolveQuerySet: ['set', 'first', 'count', 'into', 'offset'],
  beginOcclusionQuery: ['at'],
  setStencilReference: ['reference'],
  'querySet.destroy': ['label'],
  writeBuffer: ['label', 'offset', 'data'],
  writeTexture: ['label', 'bytes', 'stride', 'size'],
  mapAsync: ['label', 'mode'],
  getMappedRange: ['label'],
  unmap: ['label'],
  'buffer.destroy': ['label'],
  'texture.destroy': ['label'],
  submit: ['count'],
};

/**
 * The calls a canvas answers rather than a device.
 *
 * They are recorded into the same trace because a test reads one list, and they
 * are left out of the comparison because the contract is about what a device was
 * asked. The double stands in for the canvas as well and the browser gate uses a
 * real one, so a canvas call appears on one side and not the other, and one
 * unmatched entry at the front puts every call after it against the wrong
 * partner.
 */
export const CANVAS_CALLS = new Set([
  'getContext',
  'context.configure',
  'context.unconfigure',
  'context.getCurrentTexture',
]);

/** The device object each wrapper stands for. A wrapper is what the backend
 * holds and the device underneath is what the call has to reach, so anything
 * handed back to the device is unwrapped first. A value nobody wrapped is its
 * own answer, which is what lets one code path serve a real device and a
 * fabricated one. */
const behind = new WeakMap<object, unknown>();

const unwrap = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && behind.has(value) ? behind.get(value) : value;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A reading of one value that survives being compared against the same reading
 * off another device: numbers and strings as they are, arrays element by
 * element, typed arrays as plain numbers, and anything else by the label the
 * wrapper gave it. */
function flat(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(flat);
  if (!isObject(value)) return value;
  // A device object is unreadable from outside and a wrapper carries the label
  // this file gave it, so the label is the whole of what can be compared. Any
  // other object is a reading taken here and is compared field by field.
  if (typeof value.label === 'string') return value.label;
  if (behind.has(value)) return undefined;
  const fields: Record<string, unknown> = {};
  for (const [name, held] of Object.entries(value)) fields[name] = flat(held);
  return fields;
}

/**
 * A device that records what it is asked for and passes it on.
 *
 * `trace` is the caller's array so a test or a gate holds it directly. Labels are
 * given here rather than read off the device, because a real device labels
 * nothing by default and the contract compares them: a module the backend made
 * second is `module2` on both sides or the trace says nothing about order.
 */
export function wrapDevice(device: GPUDevice, trace: TraceEntry[]): GPUDevice {
  let modules = 0;
  let buffers = 0;
  let textures = 0;
  let bindGroupLayouts = 0;
  let pipelineLayouts = 0;

  const record = (entry: TraceEntry): TraceEntry => {
    trace.push(entry);
    return entry;
  };

  /** A device object with nothing on it worth reading, held only so a later call
   * naming it is compared by the label this file gave it rather than by an object
   * the driver made. */
  const wrapLabelled = <T extends object>(made: T, label: string) => {
    const wrapper = { label };
    behind.set(wrapper, made);
    return wrapper as unknown as T;
  };

  const wrapModule = (module: GPUShaderModule, label: string) => {
    const wrapper = {
      label,
      getCompilationInfo: () => module.getCompilationInfo(),
    };
    behind.set(wrapper, module);
    return wrapper;
  };

  const wrapBuffer = (buffer: GPUBuffer, label: string) => {
    const wrapper = {
      label,
      get size() {
        return buffer.size;
      },
      async mapAsync(mode: number) {
        record({ call: 'mapAsync', label, mode });
        return await buffer.mapAsync(mode);
      },
      getMappedRange() {
        record({ call: 'getMappedRange', label });
        return buffer.getMappedRange();
      },
      unmap() {
        record({ call: 'unmap', label });
        buffer.unmap();
      },
      destroy() {
        record({ call: 'buffer.destroy', label });
        buffer.destroy();
      },
    };
    behind.set(wrapper, buffer);
    return wrapper;
  };

  const wrapTexture = (texture: GPUTexture, label: string) => {
    const wrapper = {
      label,
      get width() {
        return texture.width;
      },
      get height() {
        return texture.height;
      },
      createView(descriptor?: GPUTextureViewDescriptor) {
        // Which levels of the ladder a view covers, read here because a view of
        // one level is how a level is both drawn into and read from, and a trace
        // that says only which texture cannot tell the two apart.
        record({
          call: 'createView',
          label,
          level: descriptor?.baseMipLevel,
          levels: descriptor?.mipLevelCount,
        });
        const view = texture.createView(descriptor);
        const viewWrapper = { label: `${label}.view` };
        behind.set(viewWrapper, view);
        return viewWrapper;
      },
      destroy() {
        record({ call: 'texture.destroy', label });
        texture.destroy();
      },
    };
    behind.set(wrapper, texture);
    return wrapper;
  };

  const wrapPipeline = (pipeline: GPURenderPipeline) => {
    const wrapper = {
      label: 'pipeline',
      getBindGroupLayout(index: number) {
        record({ call: 'getBindGroupLayout', index });
        const layout = pipeline.getBindGroupLayout(index);
        const layoutWrapper = { label: `layout${index}` };
        behind.set(layoutWrapper, layout);
        return layoutWrapper;
      },
    };
    behind.set(wrapper, pipeline);
    return wrapper;
  };

  const wrapPass = (pass: GPURenderPassEncoder) => ({
    setPipeline(pipeline: unknown) {
      record({ call: 'setPipeline' });
      pass.setPipeline(unwrap(pipeline) as GPURenderPipeline);
    },
    setBindGroup(index: number, group: unknown) {
      record({ call: 'setBindGroup', index, group: flat(group) });
      pass.setBindGroup(index, unwrap(group) as GPUBindGroup);
    },
    setVertexBuffer(slot: number, buffer: unknown) {
      record({ call: 'setVertexBuffer', slot, buffer: flat(buffer) });
      pass.setVertexBuffer(slot, unwrap(buffer) as GPUBuffer);
    },
    setIndexBuffer(buffer: unknown, format: GPUIndexFormat) {
      record({ call: 'setIndexBuffer', buffer: flat(buffer), format });
      pass.setIndexBuffer(unwrap(buffer) as GPUBuffer, format);
    },
    draw(count: number, instances?: number) {
      record({ call: 'draw', count, instances });
      pass.draw(count, instances);
    },
    drawIndexed(count: number, instances?: number) {
      record({ call: 'drawIndexed', count, instances });
      pass.drawIndexed(count, instances);
    },
    // The buffer is the whole of what a trace can say about an indirect draw. The
    // counts are in it rather than in the call, and nothing on this side of the
    // card ever reads them back, so what the two traces are compared on is which
    // buffer was handed over and at what offset.
    drawIndirect(buffer: unknown, offset: number) {
      record({ call: 'drawIndirect', buffer: flat(buffer), offset });
      pass.drawIndirect(unwrap(buffer) as GPUBuffer, offset);
    },
    drawIndexedIndirect(buffer: unknown, offset: number) {
      record({ call: 'drawIndexedIndirect', buffer: flat(buffer), offset });
      pass.drawIndexedIndirect(unwrap(buffer) as GPUBuffer, offset);
    },
    // The value the mask is written with and tested against. It is a pass call
    // rather than pipeline state on the card, so a trace is where a pipeline that
    // masks without one shows up.
    setStencilReference(reference: number) {
      record({ call: 'setStencilReference', reference });
      pass.setStencilReference(reference);
    },
    // Which slot of the set the samples of the next draw are counted into. There
    // is nothing else to say about it: the answer arrives in a buffer rather than
    // through the call, and the set was named when the pass was opened.
    beginOcclusionQuery(at: number) {
      record({ call: 'beginOcclusionQuery', at });
      pass.beginOcclusionQuery(at);
    },
    endOcclusionQuery() {
      record({ call: 'endOcclusionQuery' });
      pass.endOcclusionQuery();
    },
    // The draws a bundle recorded once, replayed here rather than re-issued every
    // frame. What a trace can say about it is which bundles were handed over and
    // in what order, each by the label its recording gave it, since the calls
    // inside a bundle were written down where it was recorded rather than here.
    executeBundles(bundles: unknown[]) {
      record({ call: 'executeBundles', bundles: bundles.map(flat) });
      pass.executeBundles(bundles.map((bundle) => unwrap(bundle)) as GPURenderBundle[]);
    },
    end() {
      record({ call: 'endPass' });
      pass.end();
    },
  });

  /** A recorder of the draws one render pass makes, played back into it with
   * `executeBundles`. It takes the same draw calls a pass does and writes them
   * down the same way, so a bundle and an inline draw read alike in the trace,
   * and its `finish` hands back a labelled bundle a later `executeBundles` names. */
  const wrapBundleEncoder = (encoder: GPURenderBundleEncoder) => ({
    setPipeline(pipeline: unknown) {
      record({ call: 'setPipeline' });
      encoder.setPipeline(unwrap(pipeline) as GPURenderPipeline);
    },
    setBindGroup(index: number, group: unknown) {
      record({ call: 'setBindGroup', index, group: flat(group) });
      encoder.setBindGroup(index, unwrap(group) as GPUBindGroup);
    },
    setVertexBuffer(slot: number, buffer: unknown) {
      record({ call: 'setVertexBuffer', slot, buffer: flat(buffer) });
      encoder.setVertexBuffer(slot, unwrap(buffer) as GPUBuffer);
    },
    setIndexBuffer(buffer: unknown, format: GPUIndexFormat) {
      record({ call: 'setIndexBuffer', buffer: flat(buffer), format });
      encoder.setIndexBuffer(unwrap(buffer) as GPUBuffer, format);
    },
    draw(count: number, instances?: number) {
      record({ call: 'draw', count, instances });
      encoder.draw(count, instances);
    },
    drawIndexed(count: number, instances?: number) {
      record({ call: 'drawIndexed', count, instances });
      encoder.drawIndexed(count, instances);
    },
    drawIndirect(buffer: unknown, offset: number) {
      record({ call: 'drawIndirect', buffer: flat(buffer), offset });
      encoder.drawIndirect(unwrap(buffer) as GPUBuffer, offset);
    },
    drawIndexedIndirect(buffer: unknown, offset: number) {
      record({ call: 'drawIndexedIndirect', buffer: flat(buffer), offset });
      encoder.drawIndexedIndirect(unwrap(buffer) as GPUBuffer, offset);
    },
    finish(descriptor?: GPURenderBundleDescriptor) {
      const label = descriptor?.label ?? 'bundle';
      record({ call: 'finishBundle', label });
      const bundle = encoder.finish(descriptor);
      const wrapper = { label };
      behind.set(wrapper, bundle);
      return wrapper as unknown as GPURenderBundle;
    },
  });

  const wrapComputePass = (pass: GPUComputePassEncoder) => ({
    setPipeline(pipeline: unknown) {
      record({ call: 'setPipeline' });
      pass.setPipeline(unwrap(pipeline) as GPUComputePipeline);
    },
    setBindGroup(index: number, group: unknown) {
      record({ call: 'setBindGroup', index, group: flat(group) });
      pass.setBindGroup(index, unwrap(group) as GPUBindGroup);
    },
    dispatchWorkgroups(x: number, y: number, z: number) {
      record({ call: 'dispatchWorkgroups', x, y, z });
      pass.dispatchWorkgroups(x, y, z);
    },
    dispatchWorkgroupsIndirect(buffer: unknown, offset: number) {
      record({ call: 'dispatchWorkgroupsIndirect', buffer: flat(buffer), offset });
      pass.dispatchWorkgroupsIndirect(unwrap(buffer) as GPUBuffer, offset);
    },
    end() {
      record({ call: 'endPass' });
      pass.end();
    },
  });

  const wrapEncoder = (encoder: GPUCommandEncoder) => ({
    beginRenderPass(descriptor: GPURenderPassDescriptor) {
      const attachments = [...descriptor.colorAttachments] as GPURenderPassColorAttachment[];
      const held = descriptor.depthStencilAttachment;
      record({
        call: 'beginRenderPass',
        attachments,
        colour: attachments.map((attachment) => ({
          view: flat(attachment.view),
          // Where the samples of this attachment are averaged, which is the only
          // reading that separates a pass keeping several samples of a pixel from
          // one keeping the picture itself.
          resolve: flat(attachment.resolveTarget),
          loadOp: attachment.loadOp,
          storeOp: attachment.storeOp,
          clearValue: flat(attachment.clearValue),
        })),
        depth: held
          ? {
              view: flat(held.view),
              loadOp: held.depthLoadOp,
              storeOp: held.depthStoreOp,
              clearValue: held.depthClearValue,
              // The mask is attached beside the depth and emptied or kept on its
              // own, so a pass that cleared the wrong half is a difference here
              // rather than a picture nobody compared.
              stencilLoadOp: held.stencilLoadOp,
              stencilStoreOp: held.stencilStoreOp,
              stencilClearValue: held.stencilClearValue,
            }
          : undefined,
        // Where a time is written at each end of this pass, and where the samples
        // of a draw inside it are counted, each by the label the set carries. A
        // pass nobody timed reads as nothing on both sides, which is what a device
        // without the feature produces.
        times: flat(descriptor.timestampWrites?.querySet),
        counts: flat(descriptor.occlusionQuerySet),
      });
      const timing = descriptor.timestampWrites;
      const passed = {
        ...descriptor,
        colorAttachments: attachments.map((attachment) => ({
          ...attachment,
          view: unwrap(attachment.view) as GPUTextureView,
          ...(attachment.resolveTarget ? { resolveTarget: unwrap(attachment.resolveTarget) as GPUTextureView } : {}),
        })),
        ...(held ? { depthStencilAttachment: { ...held, view: unwrap(held.view) as GPUTextureView } } : {}),
        ...(timing ? { timestampWrites: { ...timing, querySet: unwrap(timing.querySet) as GPUQuerySet } } : {}),
        ...(descriptor.occlusionQuerySet
          ? { occlusionQuerySet: unwrap(descriptor.occlusionQuerySet) as GPUQuerySet }
          : {}),
      };
      return wrapPass(encoder.beginRenderPass(passed));
    },
    beginComputePass(descriptor: GPUComputePassDescriptor = {}) {
      const timing = descriptor.timestampWrites;
      record({ call: 'beginComputePass', times: flat(timing?.querySet) });
      return wrapComputePass(
        encoder.beginComputePass(
          timing
            ? { ...descriptor, timestampWrites: { ...timing, querySet: unwrap(timing.querySet) as GPUQuerySet } }
            : descriptor
        )
      );
    },
    copyTextureToTexture(source: { texture: unknown }, destination: { texture: unknown }, size: number[]) {
      record({ call: 'copyTextureToTexture', from: flat(source.texture), to: flat(destination.texture) });
      encoder.copyTextureToTexture(
        { ...source, texture: unwrap(source.texture) as GPUTexture },
        { ...destination, texture: unwrap(destination.texture) as GPUTexture },
        size as unknown as GPUExtent3DStrict
      );
    },
    // A resolve is a command rather than a read, so it is on the frame's own
    // encoder and in order with the passes it copies the answers of.
    resolveQuerySet(set: unknown, first: number, count: number, into: unknown, offset: number) {
      record({ call: 'resolveQuerySet', set: flat(set), first, count, into: flat(into), offset });
      encoder.resolveQuerySet(unwrap(set) as GPUQuerySet, first, count, unwrap(into) as GPUBuffer, offset);
    },
    copyBufferToBuffer(source: unknown, sourceAt: number, destination: unknown, destinationAt: number, size: number) {
      record({ call: 'copyBufferToBuffer', from: flat(source), to: flat(destination), size });
      encoder.copyBufferToBuffer(
        unwrap(source) as GPUBuffer,
        sourceAt,
        unwrap(destination) as GPUBuffer,
        destinationAt,
        size
      );
    },
    copyTextureToBuffer(
      source: { texture: unknown },
      destination: { buffer: unknown; bytesPerRow: number },
      size: number[]
    ) {
      record({ call: 'copyTextureToBuffer', from: flat(source.texture), stride: destination.bytesPerRow, size });
      encoder.copyTextureToBuffer(
        { ...source, texture: unwrap(source.texture) as GPUTexture },
        { ...destination, buffer: unwrap(destination.buffer) as GPUBuffer },
        size as unknown as GPUExtent3DStrict
      );
    },
    finish() {
      record({ call: 'finish' });
      const commands = encoder.finish();
      const wrapper = { label: 'commands' };
      behind.set(wrapper, commands);
      return wrapper;
    },
  });

  const wrapper = {
    get lost() {
      return device.lost;
    },

    // The ceilings and the optional features are read straight off the device
    // rather than being copied here, because a read is not a call and there is
    // nothing to record. A read this wrapper does not forward comes back absent,
    // which reads as a device that can do nothing at all.
    get limits() {
      return device.limits;
    },

    get features() {
      return device.features;
    },

    createShaderModule(descriptor: GPUShaderModuleDescriptor) {
      const label = `module${(modules += 1)}`;
      record({ call: 'createShaderModule', label, code: descriptor.code });
      return wrapModule(device.createShaderModule(descriptor), label);
    },

    createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor) {
      const label = descriptor.label ?? `bindGroupLayout${(bindGroupLayouts += 1)}`;
      // The entries are the whole of what a layout is, and each is a flat reading
      // rather than the driver's object: a binding number, the stages allowed to
      // read it, and what kind of thing it is.
      record({
        call: 'createBindGroupLayout',
        label,
        entries: [...descriptor.entries].map((entry) => ({
          binding: entry.binding,
          visibility: entry.visibility,
          kind: entry.buffer
            ? `buffer:${entry.buffer.type ?? 'uniform'}`
            : entry.sampler
              ? 'sampler'
              : entry.storageTexture
                ? `storage:${entry.storageTexture.access ?? 'write-only'}:${entry.storageTexture.format}`
                : entry.texture
                  ? 'texture'
                  : 'other',
        })),
      });
      return wrapLabelled(device.createBindGroupLayout(descriptor), label);
    },

    createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor) {
      const label = descriptor.label ?? `pipelineLayout${(pipelineLayouts += 1)}`;
      record({
        call: 'createPipelineLayout',
        label,
        // Named by the labels above rather than compared as objects, so what the
        // contract reads is which layouts the backend put in which order.
        bindGroupLayouts: [...descriptor.bindGroupLayouts].map((one) => flat(one)),
      });
      const passed: GPUPipelineLayoutDescriptor = {
        ...descriptor,
        bindGroupLayouts: [...descriptor.bindGroupLayouts].map((one) => unwrap(one) as GPUBindGroupLayout),
      };
      return wrapLabelled(device.createPipelineLayout(passed), label);
    },

    createRenderPipeline(descriptor: GPURenderPipelineDescriptor) {
      const fragment = descriptor.fragment;
      record({
        call: 'createRenderPipeline',
        descriptor,
        // `auto` is the driver being asked where its bindings are, which is what
        // an explicit layout replaces, so the contract has to be able to tell the
        // two apart without comparing an object the driver made.
        layout: descriptor.layout === 'auto' ? 'auto' : flat(descriptor.layout),
        vertexModule: flat(descriptor.vertex.module),
        vertexEntry: descriptor.vertex.entryPoint,
        fragmentModule: fragment ? flat(fragment.module) : undefined,
        fragmentEntry: fragment?.entryPoint,
        constants: fragment?.constants,
        // Read per target rather than as a list of formats, because how a colour
        // is mixed with what the attachment held is as much a part of the
        // pipeline as the format it is written in.
        targets: fragment
          ? [...fragment.targets].map((target) => ({ format: target?.format, blend: flat(target?.blend) }))
          : undefined,
        topology: descriptor.primitive?.topology,
        depth: descriptor.depthStencil
          ? {
              format: descriptor.depthStencil.format,
              compare: descriptor.depthStencil.depthCompare,
              write: descriptor.depthStencil.depthWriteEnabled,
              // What this pipeline does to the mask, read as the card's own
              // fields rather than as the name the description used, since a name
              // turned into the wrong operations is exactly what a trace is for.
              stencil: flat(descriptor.depthStencil.stencilFront),
              stencilWrites: descriptor.depthStencil.stencilWriteMask,
            }
          : undefined,
        samples: descriptor.multisample?.count,
      });
      const passed: GPURenderPipelineDescriptor = {
        ...descriptor,
        layout: descriptor.layout === 'auto' ? 'auto' : (unwrap(descriptor.layout) as GPUPipelineLayout),
        vertex: { ...descriptor.vertex, module: unwrap(descriptor.vertex.module) as GPUShaderModule },
        ...(fragment ? { fragment: { ...fragment, module: unwrap(fragment.module) as GPUShaderModule } } : {}),
      };
      return wrapPipeline(device.createRenderPipeline(passed));
    },

    createComputePipeline(descriptor: GPUComputePipelineDescriptor) {
      record({
        call: 'createComputePipeline',
        descriptor,
        layout: descriptor.layout === 'auto' ? 'auto' : flat(descriptor.layout),
        computeModule: flat(descriptor.compute.module),
        computeEntry: descriptor.compute.entryPoint,
        constants: descriptor.compute.constants,
      });
      const passed: GPUComputePipelineDescriptor = {
        ...descriptor,
        layout: descriptor.layout === 'auto' ? 'auto' : (unwrap(descriptor.layout) as GPUPipelineLayout),
        compute: { ...descriptor.compute, module: unwrap(descriptor.compute.module) as GPUShaderModule },
      };
      const pipeline = device.createComputePipeline(passed);
      const wrapper = { label: 'pipeline' };
      behind.set(wrapper, pipeline);
      return wrapper;
    },

    createQuerySet(descriptor: GPUQuerySetDescriptor) {
      const label = descriptor.label ?? 'querySet';
      record({ call: 'createQuerySet', label, type: descriptor.type, count: descriptor.count });
      const made = device.createQuerySet(descriptor);
      const wrapper = {
        label,
        destroy() {
          record({ call: 'querySet.destroy', label });
          made.destroy();
        },
      };
      behind.set(wrapper, made);
      return wrapper as unknown as GPUQuerySet;
    },

    createBuffer(descriptor: GPUBufferDescriptor) {
      // The caller's own name where it gave one, the same as a texture, so a trace
      // of a frame holding vertices and indices says which buffer is which rather
      // than counting the order they were made in.
      const label = descriptor.label ?? `buffer${(buffers += 1)}`;
      record({ call: 'createBuffer', label, size: descriptor.size, usage: descriptor.usage });
      return wrapBuffer(device.createBuffer(descriptor), label);
    },

    createBindGroup(descriptor: GPUBindGroupDescriptor) {
      const entries = [...descriptor.entries] as GPUBindGroupEntry[];
      record({
        call: 'createBindGroup',
        descriptor,
        bindings: entries.map((entry) => ({
          binding: entry.binding,
          resource:
            isObject(entry.resource) && 'buffer' in entry.resource ? flat(entry.resource.buffer) : flat(entry.resource),
        })),
      });
      const passed: GPUBindGroupDescriptor = {
        ...descriptor,
        layout: unwrap(descriptor.layout) as GPUBindGroupLayout,
        entries: entries.map((entry) =>
          isObject(entry.resource) && 'buffer' in entry.resource
            ? { ...entry, resource: { ...entry.resource, buffer: unwrap(entry.resource.buffer) as GPUBuffer } }
            : { ...entry, resource: unwrap(entry.resource) as GPUBindingResource }
        ),
      };
      const group = device.createBindGroup(passed);
      // The caller's own name where it gave one, so a trace can say which group a
      // pass was handed. Without it every group reads the same and a frame that
      // binds a pair of textures the wrong way round is a trace that agrees.
      const groupWrapper = { label: descriptor.label ?? 'group' };
      behind.set(groupWrapper, group);
      return groupWrapper;
    },

    createTexture(descriptor: GPUTextureDescriptor) {
      // The caller's own name where it gave one, so a trace of a frame with
      // several textures in it says which is which rather than counting them.
      const label = descriptor.label ?? `texture${(textures += 1)}`;
      const size = descriptor.size as number[];
      record({
        call: 'createTexture',
        label,
        size,
        format: descriptor.format,
        usage: descriptor.usage,
        levels: descriptor.mipLevelCount,
        samples: descriptor.sampleCount,
      });
      return wrapTexture(device.createTexture(descriptor), label);
    },

    createSampler(descriptor: GPUSamplerDescriptor = {}) {
      record({
        call: 'createSampler',
        label: descriptor.label,
        magFilter: descriptor.magFilter,
        minFilter: descriptor.minFilter,
        addressModeU: descriptor.addressModeU,
        addressModeV: descriptor.addressModeV,
      });
      const sampler = device.createSampler(descriptor);
      const wrapper = { label: descriptor.label ?? 'sampler' };
      behind.set(wrapper, sampler);
      return wrapper;
    },

    createCommandEncoder() {
      record({ call: 'createCommandEncoder' });
      return wrapEncoder(device.createCommandEncoder());
    },

    createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor) {
      // The formats a bundle is recorded against are the whole of what it has to
      // match the pass replaying it, so they are what a trace reads: a bundle
      // built for the wrong attachments is a pass the card refuses.
      record({
        call: 'createRenderBundleEncoder',
        label: descriptor.label,
        colorFormats: [...descriptor.colorFormats],
        depthStencilFormat: descriptor.depthStencilFormat,
        sampleCount: descriptor.sampleCount,
      });
      return wrapBundleEncoder(device.createRenderBundleEncoder(descriptor));
    },

    queue: {
      writeBuffer(buffer: { label: string }, offset: number, data: Float32Array) {
        record({ call: 'writeBuffer', label: buffer.label, offset, data: Float32Array.from(data) });
        device.queue.writeBuffer(unwrap(buffer) as GPUBuffer, offset, data as unknown as GPUAllowSharedBufferSource);
      },
      // The bytes are recorded by their length and their first few values
      // rather than whole, because a texture's contents are kilobytes and a
      // trace is read by a person. What that catches is an upload going missing
      // or arriving at the wrong size, which is every way this call has failed.
      writeTexture(
        destination: { texture: { label: string } },
        data: Uint8Array,
        layout: GPUImageDataLayout,
        size: number[]
      ) {
        record({
          call: 'writeTexture',
          label: destination.texture.label,
          bytes: data.byteLength,
          stride: layout.bytesPerRow,
          size: [...size],
        });
        device.queue.writeTexture(
          { ...destination, texture: unwrap(destination.texture) as GPUTexture },
          data as unknown as GPUAllowSharedBufferSource,
          layout,
          size as GPUExtent3DStrict
        );
      },
      submit(commands: unknown[]) {
        record({ call: 'submit', count: commands.length });
        device.queue.submit(commands.map((command) => unwrap(command)) as GPUCommandBuffer[]);
      },
    },
  };

  return wrapper as unknown as GPUDevice;
}

/**
 * The trace as it can cross a boundary and be compared: the call's name and the
 * fields the contract reads, with every device object down to the label this
 * file gave it.
 *
 * It happens on both sides rather than only on the way out of the browser,
 * because a descriptor holds objects `JSON` turns into `{}` and a typed array is
 * one of them, so a trace that had not been through here would compare two empty
 * objects and agree.
 */
export function projectTrace(trace: TraceEntry[]): TraceEntry[] {
  return trace
    .filter((entry) => !CANVAS_CALLS.has(entry.call))
    .map((entry) => {
      const projected: TraceEntry = { call: entry.call };
      for (const field of COMPARED[entry.call] ?? []) projected[field] = flat(entry[field]) ?? null;
      return projected;
    });
}

/** Every difference between two projected traces, in the order they were
 * recorded, empty where the two agree. A difference is a call that is not there,
 * a call of another name at the same position, or a compared field reading
 * differently. */
export function compareTraces(expected: TraceEntry[], actual: TraceEntry[]): string[] {
  const differences: string[] = [];
  const length = Math.max(expected.length, actual.length);

  for (let at = 0; at < length; at++) {
    const one = expected[at];
    const other = actual[at];
    if (!one) {
      differences.push(`${at}: the double stopped and the device went on to ${other?.call}`);
      continue;
    }
    if (!other) {
      differences.push(`${at}: the device stopped and the double went on to ${one.call}`);
      continue;
    }
    if (one.call !== other.call) {
      differences.push(`${at}: the double called ${one.call} and the device called ${other.call}`);
      continue;
    }
    for (const field of COMPARED[one.call] ?? []) {
      const mine = JSON.stringify(one[field] ?? null);
      const theirs = JSON.stringify(other[field] ?? null);
      if (mine !== theirs)
        differences.push(`${at}: ${one.call}.${field} is ${mine} on the double and ${theirs} on the device`);
    }
  }

  return differences;
}
