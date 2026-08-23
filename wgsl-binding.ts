/**
 * Where a WGSL source says its uniform block is bound.
 *
 * It sits apart from `lib/wgsl-layout.ts`, which reads the other half of the same
 * declaration, and the reason is what each half costs a reader. The layout is
 * wanted by the build and by the playground, and it reads a struct through the
 * declaration machinery, so importing it drags that machinery along: putting this
 * function there and importing it from the description builder put **11,486 bytes
 * across eight route chunks** into the export, against **1,844** for this file
 * alone, and the homepage would have carried a WGSL parser for a shader written in
 * GLSL. This half is wanted by anything that draws, so it is written to need
 * nothing.
 */

/**
 * Which group and binding a WGSL source declares its uniform block at.
 *
 * Read off the source for the reason this file exists at all: a number written in
 * two places can disagree, and the failure is silent, because the pipeline is
 * built against the written layout and the shader still compiles and still draws
 * while reading a binding nothing filled.
 *
 * Both attribute orders are accepted, since a hand-written source in this corpus
 * opens `@binding(0) @group(0)` and so does the WGSL Slang emits, and neither
 * order means anything different. A source declaring no uniform block gets
 * nothing back rather than a guess, which is the case a fragment shader reading
 * only its pixel position is.
 */
export function uniformBindingOf(source: string): { group: number; binding: number; name: string } | undefined {
  // Anchored on the declaration rather than on the attributes, so an attribute
  // on some other kind of variable cannot be read as this one's. The variable's
  // own name comes back with the numbers because a frame of several pipelines
  // asks which of them reaches it, and that question is asked by name.
  const declaration = /((?:@\s*(?:group|binding)\s*\(\s*\d+\s*\)\s*)+)var\s*<\s*uniform\s*>\s*([A-Za-z_]\w*)/.exec(
    source
  );
  if (!declaration) return undefined;

  const attributes = declaration[1] ?? '';
  const group = /@\s*group\s*\(\s*(\d+)\s*\)/.exec(attributes)?.[1];
  const binding = /@\s*binding\s*\(\s*(\d+)\s*\)/.exec(attributes)?.[1];
  if (group === undefined || binding === undefined) {
    throw new Error('a WGSL uniform block declares one of @group and @binding without the other');
  }
  return { group: Number(group), binding: Number(binding), name: declaration[2] as string };
}
