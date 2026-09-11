/**
 * `refusal(graph, device)`: the third of the pure functions of
 * RoadToPureEngine.md §12, beside `validate` and
 * `cost`, per §10 and §17 decision 2 (item 24). It reads what a graph declares it
 * `requires` against what a device reports it has, and names every capability the
 * device is missing — or returns null where the device has them all.
 *
 * It touches no device. The device arrives as a plain record — the backend it is
 * and the capabilities it has — gathered elsewhere and handed in as data, which
 * is the same seam `selectBackend`, `validate` and `cost` take, and for the same
 * reason: a rule a card has to be present to check is a rule no test can pin down.
 * That is the whole point of §10 — capability lives in the data, never as a method
 * one backend answers by throwing — so the question of whether a graph runs here
 * is a reading over two records rather than a call that fails on one backend.
 *
 * **Selection comes before refusal, per §10.** `selectBackend` asks which backend
 * should draw a graph, across everything on offer, and a GLSL-authored graph gets
 * a picture rather than a lecture. `refusal` is what a caller reads only once
 * selection has come back empty: it names the missing capability rather than
 * gating a graph that draws. The message names the capability rather than the
 * backend, because the capability is the fact a caller can act on — a missing
 * `compute` is answered by not asking for compute, where the backend's name is
 * answered by nothing.
 */
import type { BackendName, FrameGraph, PipelineSpec, ResourceSpec } from './types.js';
import type { Capability } from './capability.js';

/** What a device is, for the one question this answers: which backend it is and
 * which capabilities it has. A plain record rather than a `Backend`, because a
 * capability is data (§10) and nothing here calls a card. `capabilities` is a set
 * so membership is one lookup and the order a device lists them in cannot matter. */
export interface DeviceCapabilities {
  backend: BackendName;
  capabilities: ReadonlySet<Capability>;
}

/** The capabilities a graph's resources imply, read from the data rather than
 * from the `requires` list a producer maintains by hand. A read-write buffer is a
 * storage buffer a compute or fragment stage fills, and its `access` is the fact
 * that says so, so the write arm `storage-buffer-readwrite` is derived from the
 * resource rather than trusted to be declared (item 97). This is what makes the
 * backend's read-write-storage-buffer throw ([gpu/webgl2.ts](../gpu/webgl2.ts))
 * unreachable by construction: a graph carrying such a buffer needs the write arm
 * whatever it wrote in `requires`, so `refusal` refuses it on any device without
 * the write arm — WebGL 2 — before a backend build is ever asked for. The read
 * arm is left to `requires`, because a read-only storage buffer WebGL 2 draws and
 * declaring it is the producer's own graceful-degradation choice (§10). */
function impliedCapabilities(
  resources: readonly ResourceSpec[],
  pipelines: readonly PipelineSpec[]
): Capability[] {
  const implied: Capability[] = [];
  for (const resource of resources) {
    if (resource.kind === 'buffer' && resource.access === 'read-write') implied.push('storage-buffer-readwrite');
  }
  // The two blend capabilities, read the same way and for the same reason (item
  // 11). A pipeline naming a `src1` factor blends against a fragment stage's
  // second output, which WebGPU gates behind a feature and WebGL 2 has no form
  // for; a pipeline whose `targets` name *different* blends needs one blend state
  // per draw buffer, which WebGPU has and WebGL 2 has not. Both are facts about
  // the pipeline rather than declarations, so neither is left to `requires`: a
  // caller who forgot to declare one would get a wrong picture instead of a
  // refusal, which is the whole of what this file exists to prevent.
  for (const spec of pipelines) {
    if (spec.kind !== 'render' || !spec.targets) continue;
    if (spec.targets.some((target) => target.blend !== undefined && namesDualSource(target.blend))) {
      implied.push('dual-source-blend');
    }
    // Every target is compared, **including the ones naming no blend**, because a
    // target written straight in is a different blend state from one mixed with
    // what was there — not the absence of a state. WebGL 2's one `enable(BLEND)`
    // covers every draw buffer at once, so a pass whose targets disagree cannot be
    // drawn there however few of them name a blend. Compared as canonical JSON
    // rather than by identity, because two targets carrying equal blends written as
    // two object literals are one state to a card and must not be refused as two.
    const states = spec.targets.map((target) => JSON.stringify(target.blend ?? null));
    if (new Set(states).size > 1) implied.push('per-target-blend');
  }
  return implied;
}

/** The blend factors that read a fragment stage's second output. Read off the
 * state's four factor fields rather than off a list of every field, because an
 * operation or a constant colour says nothing about dual-source. */
function namesDualSource(blend: GPUBlendState): boolean {
  const factors = [blend.color?.srcFactor, blend.color?.dstFactor, blend.alpha?.srcFactor, blend.alpha?.dstFactor];
  return factors.some((factor) => factor !== undefined && factor.startsWith('src1'));
}

/** Join capability names the way a sentence reads them: one alone, two with
 * `and`, three or more with commas and a final `and`. The names are the graph's
 * own vocabulary, so a reader searches the message for the one it declared. */
function andList(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** How a backend is said to lack the missing set, agreeing in number with it:
 * `does not have it` for one, `has neither` for two, `has none of them` for more.
 * The backend is named here and only here, after the capabilities, so the message
 * leads with the fact a caller can act on. */
function lacks(backend: BackendName, count: number): string {
  if (count === 1) return `${backend} does not have it`;
  if (count === 2) return `${backend} has neither`;
  return `${backend} has none of them`;
}

/**
 * Refuse a graph a device cannot draw, by naming every capability it needs and
 * the device lacks; return null where the device has them all. Pure and
 * device-free — it reads the graph's `requires` and the device's `capabilities`
 * and nothing else.
 *
 * A graph declaring no requirements is refused for nothing, whatever the device,
 * so this returns null at once. A graph whose every requirement the device has is
 * likewise null: the device can draw it, and refusal is silence.
 *
 * The requirements read are the ones the graph `requires` **and** the ones its
 * resources imply (`impliedCapabilities`): a read-write storage buffer needs the
 * write arm whether or not `requires` names it, so a device without the write arm
 * refuses it here rather than at a backend throw (item 97). A capability named
 * both ways is missing once, not twice.
 */
export function refusal(
  graph: Pick<FrameGraph, 'id' | 'requires'> & {
    resources?: readonly ResourceSpec[];
    pipelines?: readonly PipelineSpec[];
  },
  device: DeviceCapabilities
): string | null {
  const declared = graph.requires ?? [];
  const implied = impliedCapabilities(graph.resources ?? [], graph.pipelines ?? []);
  const required = [...new Set<Capability>([...declared, ...implied])];
  const missing = required.filter((capability) => !device.capabilities.has(capability));
  if (missing.length === 0) return null;
  return `the graph "${graph.id}" needs ${andList(missing)}; ${lacks(device.backend, missing.length)}`;
}
