/**
 * The ways of mixing a colour with what its attachment already held that are worth
 * a name, each spelled as the card's own factors and operations.
 *
 * **It is a table to read from and not a vocabulary to declare in.** Everything
 * that carries a blend — `RenderPipelineSpec.targets[].blend` and the frame
 * declaration's `colour[].blend` both — carries a `GPUBlendState`, so a consumer
 * may write any blend the card expresses and the two backends refuse by named
 * capability what they cannot draw (`per-target-blend`, `dual-source-blend`). A
 * declaration narrowed to these names would be the one place in this package where
 * the authoring path expresses less than the graph it builds, which is the opposite
 * of what an authoring path is for.
 *
 * What it is for is that the common blends are easy to spell wrongly and the
 * mistake is silent. `over` written with `src-alpha` where the picture is already
 * premultiplied doubles the alpha and comes out dark at every edge, and nothing
 * refuses it, because four valid factors are four valid factors. So the ones worth
 * naming are written once, here, and `BLEND_MODE.over` is both the value and the
 * definition of what the word means. Spreading one to vary it — `{ ...BLEND_MODE.over,
 * alpha: … }` — is the intended way to reach a blend that has no name yet.
 *
 * `BlendMode` is the key type, so it grows as entries do and a caller may hold a
 * name. It is not a bound on anything.
 */
export type BlendMode = 'over';

export const BLEND_MODE: Record<BlendMode, GPUBlendState> = {
  // Over: the new colour by its own alpha, plus what was there by whatever alpha
  // is left. It is the mix that makes an alpha under one read as see-through, and
  // the alpha channel is kept the same way so a picture drawn over twice does not
  // end up more opaque than either layer.
  over: {
    color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
    alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  },
};
