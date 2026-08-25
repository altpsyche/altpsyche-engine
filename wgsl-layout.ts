/**
 * Where the fields of a WGSL uniform struct sit, computed from the struct.
 *
 * Every other language here has a compiler that reports this. Nothing compiles
 * WGSL, so a written-down layout was the one set of positions in this build with
 * nothing behind it, and a reader adding a field to the struct made it wrong
 * without anything noticing: a WebGPU pipeline has nothing to ask about where its
 * block members sit, so the buffer would be filled from the old positions and
 * every value after the new field would land in the wrong place while the shader
 * still compiled and still drew.
 *
 * The rules are WGSL's own, from the uniform address space: a type has a size and
 * an alignment, a field starts at the next multiple of its alignment, and the
 * alignment is what makes a `vec3<f32>` occupy twelve bytes and start on a
 * sixteen. They are held to the block Slang emits for the same fields, which is
 * the only thing that separates a correct layout from a plausible one.
 */
import type { UniformSlot } from './graph/types.js';

/**
 * The fields of the one uniform struct a WGSL source declares, in the order the
 * struct writes them.
 *
 * WGSL has no loose uniforms: every value a shader is given is a field of one
 * struct behind a `var<uniform>` binding, so reading the declarations means
 * finding which struct the binding names and then reading that struct's fields.
 * Comments are stripped first, because a commented-out field is not a field.
 *
 * This is the same read the site's `shader-declarations` does for its controls,
 * kept here so the library carries no dependency on the site's content layer. The
 * two are held apart by their own tests, so a drift on either side fails a test.
 */
function wgslUniformFields(source: string): { name: string; type: string }[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const binding = /var\s*<\s*uniform\s*>\s*\w+\s*:\s*(\w+)/.exec(text);
  if (!binding) return [];

  const struct = new RegExp(`struct[ \\t]+${binding[1]}[ \\t]*\\{([\\s\\S]*?)\\}`).exec(text);
  if (!struct) return [];

  return [...(struct[1] ?? '').matchAll(/(\w+)[ \t]*:[ \t]*([\w<>]+)/g)].map((field) => ({
    name: field[1] ?? '',
    type: field[2] ?? '',
  }));
}

/** Size and alignment per type, in bytes. A matrix is as many columns as it is
 * wide, each column padded to its own alignment, which is what makes a three by
 * three matrix 48 bytes rather than 36: its columns are three-component vectors
 * and each of those starts on a sixteen.
 *
 * A two by two matrix is absent, and it is the one type here with nothing behind
 * a layout for it. Slang stores every matrix column padded to four components, so
 * the block it emits for a two by two is 32 bytes on a sixteen where the language
 * asks for 16 bytes on an eight, and the two rules genuinely differ rather than
 * one of them being wrong. Nothing else can answer it, so it is refused by name
 * until something can. */
const SHAPES: Record<string, { size: number; align: number }> = {
  f32: { size: 4, align: 4 },
  i32: { size: 4, align: 4 },
  u32: { size: 4, align: 4 },
  'vec2<f32>': { size: 8, align: 8 },
  'vec2<i32>': { size: 8, align: 8 },
  'vec2<u32>': { size: 8, align: 8 },
  'vec3<f32>': { size: 12, align: 16 },
  'vec3<i32>': { size: 12, align: 16 },
  'vec3<u32>': { size: 12, align: 16 },
  'vec4<f32>': { size: 16, align: 16 },
  'vec4<i32>': { size: 16, align: 16 },
  'vec4<u32>': { size: 16, align: 16 },
  'mat3x3<f32>': { size: 48, align: 16 },
  'mat4x4<f32>': { size: 64, align: 16 },
};

const nextMultiple = (of: number, at: number): number => Math.ceil(at / of) * of;

/**
 * The block one WGSL source declares, in the order the struct writes its fields.
 *
 * A type the rules above do not cover stops the caller rather than being laid out
 * on a guess, because a wrong offset is a shader that draws the wrong picture
 * without failing anywhere.
 */
export function uniformBlockOf(source: string): UniformSlot[] {
  const slots: UniformSlot[] = [];
  let at = 0;

  for (const field of wgslUniformFields(source)) {
    const shape = SHAPES[field.type];
    if (!shape) {
      throw new Error(`the uniform "${field.name}" is a ${field.type}, and nothing here knows how WGSL lays that out`);
    }
    const offset = nextMultiple(shape.align, at);
    slots.push({ name: field.name, offset, size: shape.size });
    at = offset + shape.size;
  }

  return slots;
}
