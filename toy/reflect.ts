/**
 * The uniforms a frame declares, read from its source rather than asked of a
 * compiled program.
 *
 * This replaces two runtime queries that a program could only answer once it was
 * built: a program's `unreached` query, which asked the linked program which
 * declared names it had nowhere to put, and `FrameGraph.uniforms`, the name-and-type list
 * a producer wrote down beside the source for a page to draw its controls from.
 * Both are the same fact — what a shader takes and what it calls each one — and a
 * fact about a source is answered from the source, not from a program built out
 * of it and not from a second list a hand can let drift.
 *
 * **What it cannot see, said out loud.** A GLSL compiler removes a uniform no line
 * reads, so the linked program `unreached` questioned could report a declared name
 * as having no home. `reflect` reads the declaration, so it counts a declared-but-
 * unread uniform as present where `unreached` counted it absent. For the toy tier
 * the two agree: a WGSL compiler does not strip a block member for going unread
 * (which is why the WebGPU backend already answered `unreached` from the computed
 * layout, not from the program), and the corpus is WGSL. Where a hand-authored
 * GLSL source declares a uniform it never reads, the compiler's answer and the
 * source's diverge, and this is the source's — the one a page drawing controls
 * wants, since a control feeds a value whether or not this frame's code path
 * reads it. See [ROADMAP.md](../docs/ROADMAP.md) item 69.
 *
 * It lives in `toy/` because the toy tier is what has one shader with one uniform
 * block, and it reads the frame's module text through the same parsers the layout
 * and binding readers use, carrying no new dependency.
 */
import type { FrameGraph, GlslRenderSource, WgslRenderSource } from '../graph/types.js';
import { moduleOf } from '../graph/types.js';
import { wgslUniformFields } from '../wgsl-layout.js';

/** One uniform a frame declares: the name a page feeds it by, and the type it was
 * declared as, in the common vocabulary GLSL already writes (`float`, `int`,
 * `vec2`…) so a WGSL frame and a GLSL frame answer alike. */
export interface Uniform {
  name: string;
  type: string;
}

/** WGSL spells its scalar and vector types differently from the vocabulary a page
 * reads — `f32` where a control wants `float`, `vec2<f32>` where it wants `vec2`.
 * A frame's uniforms are the same fact whichever language declared them, so the
 * WGSL spellings are mapped to the one vocabulary here; a name with no entry is
 * passed through unchanged rather than guessed at. */
const WGSL_TO_COMMON: Record<string, string> = {
  f32: 'float',
  i32: 'int',
  u32: 'uint',
  'vec2<f32>': 'vec2',
  'vec3<f32>': 'vec3',
  'vec4<f32>': 'vec4',
  'vec2<i32>': 'ivec2',
  'vec3<i32>': 'ivec3',
  'vec4<i32>': 'ivec4',
  'vec2<u32>': 'uvec2',
  'vec3<u32>': 'uvec3',
  'vec4<u32>': 'uvec4',
  'mat3x3<f32>': 'mat3',
  'mat4x4<f32>': 'mat4',
};

const commonType = (wgsl: string): string => WGSL_TO_COMMON[wgsl] ?? wgsl;

/** The uniforms one GLSL document declares, both the loose kind ES 3.0 allows
 * (`uniform vec2 viewport;`) and the members of a `std140` block a translated
 * source carries (`uniform Uniforms { float u_time; };`). Comments are stripped
 * first, because a commented-out declaration is not one, and an optional precision
 * qualifier is skipped, since it names how accurately a value is kept rather than
 * what it is. */
function glslUniforms(source: string): Uniform[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const found: Uniform[] = [];

  // A loose uniform: `uniform <type> <name>;`, the block form ruled out by the
  // `;` a member list opens with a `{` instead of.
  for (const decl of text.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/g)) {
    found.push({ name: decl[2] as string, type: decl[1] as string });
  }

  // A block's members, read from between its braces the way the WGSL struct
  // reader reads its fields.
  for (const block of text.matchAll(/\buniform\s+\w+\s*\{([\s\S]*?)\}/g)) {
    for (const member of (block[1] ?? '').matchAll(/(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/g)) {
      found.push({ name: member[2] as string, type: member[1] as string });
    }
  }

  return found;
}

/**
 * The uniforms a frame declares, merged across its documents and named once each.
 *
 * A WGSL frame is one document and a GLSL frame is a pair, and either half of the
 * pair may declare a uniform, so both are read and the first spelling of a name
 * wins — a name declared in the vertex and the fragment of one program is one
 * uniform, fed once. The order is the order the documents are read in, which is
 * the order a producer wrote them, so a page's controls appear as the source lays
 * them out.
 */
export function reflect(frame: FrameGraph): Uniform[] {
  const seen = new Set<string>();
  const uniforms: Uniform[] = [];
  // A render pipeline carries its two stages' text on its own source (item 99) and a
  // compute pipeline names its module; the source texts are gathered in producer
  // order, each distinct text once, so a document two pipelines share is read a
  // single time. `authored` is the one value the language is read off (item 94): a
  // WGSL frame's texts read by the WGSL field parser, a GLSL frame's by the GLSL one.
  const texts = sourceTexts(frame);
  const declared: Uniform[] =
    frame.authored === 'wgsl'
      ? texts.flatMap((text) =>
          wgslUniformFields(text).map((field) => ({ name: field.name, type: commonType(field.type) }))
        )
      : texts.flatMap((text) => glslUniforms(text));
  for (const uniform of declared) {
    if (seen.has(uniform.name)) continue;
    seen.add(uniform.name);
    uniforms.push(uniform);
  }
  return uniforms;
}

/** Every distinct source text a frame carries, in the order a producer wrote its
 * pipelines — each render pipeline's two stages (a fullscreen vertex naming none)
 * and each compute pipeline's module. A text two pipelines share appears once, so a
 * shared document is parsed a single time and the uniform order stays the producer's. */
function sourceTexts(frame: FrameGraph): string[] {
  const texts: string[] = [];
  const seen = new Set<string>();
  const add = (text: string): void => {
    if (seen.has(text)) return;
    seen.add(text);
    texts.push(text);
  };
  for (const spec of frame.pipelines) {
    if (spec.kind === 'render') {
      // A render pipeline's two stage texts ride its source pair (item 99/103), read
      // under the frame's authoring language (item 94). A fullscreen pipeline names
      // no vertex stage, so only its fragment is added.
      const pair =
        frame.authored === 'wgsl'
          ? (spec.source as WgslRenderSource).wgsl
          : (spec.source as GlslRenderSource).glsl;
      if (spec.vertex) add(pair.vertex);
      add(pair.fragment);
    } else {
      const module = moduleOf(frame, spec.compute.module);
      if (module) add((module as { wgsl: string }).wgsl);
    }
  }
  return texts;
}

/** Which of `names` the frame's source declares no uniform for, which is the
 * question the removed compiled-program query answered from a linked program.
 * Read from the source here (see the caveat on `reflect`), so a toy-tier caller
 * gets the same list the WGSL corpus gave, computed without a device. A caller
 * that wants the whole declared set reads `reflect` directly; this is the
 * one-line derivation over it, kept so the "which are missing" question has one
 * home rather than being re-filtered at each call site. */
export function missing(frame: FrameGraph, names: string[]): string[] {
  const declared = new Set(reflect(frame).map((uniform) => uniform.name));
  return names.filter((name) => !declared.has(name));
}
