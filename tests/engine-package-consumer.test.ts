import { describe, expect, it } from 'vitest';
import { createFrameRenderer, wgslFrame, uniformBlockOf, vec3, drawList, type FrameGraph } from '@altpsyche/engine';
import { createFakeGPU, paddedFrame } from './support/fake-gpu';

/**
 * A consumer standing outside the package, reaching the engine through its one
 * door and nothing else. Every name it uses comes from '@altpsyche/engine',
 * which is what proves the entry is the whole surface rather than a starting
 * point a caller then supplements with subpath imports. The device is a stand-in
 * because jsdom gives no real card, the same one the renderer's own suite draws
 * against; what is asserted is that the door hands back a renderer that draws,
 * not the pixels a real backend would paint.
 */

const CODE = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';

const BLOCK = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];

const graph = (): FrameGraph => wgslFrame('consumer-fixture', CODE, BLOCK);

describe('a consumer reaches the engine through its one entry point', () => {
  it('builds a renderer and draws a frame through the package door', async () => {
    const gpu = createFakeGPU({ connected: true });
    const renderer = await createFrameRenderer(gpu.canvas, { backend: 'webgpu', device: gpu.device });
    if (!renderer) throw new Error('the package gave no renderer');

    renderer.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);
    const pixels = await renderer.frame(graph(), { u_time: 1 });

    expect(renderer.backend).toBe('webgpu');
    expect(gpu.calls('draw')).toHaveLength(1);
    expect(pixels).toHaveLength(4 * 3 * 4);
  });

  it('exposes the description builder, the layout reader and the engine surface', () => {
    // A WGSL source with no uniform block lays out to nothing, which is the one
    // fact that proves uniformBlockOf came across the line and runs.
    expect(uniformBlockOf(CODE)).toEqual([]);
    // The engine maths and the scene-to-draws step are reachable through the same
    // door as the renderer.
    expect(vec3(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
    expect(drawList({ entities: [] })).toEqual([]);
  });
});
