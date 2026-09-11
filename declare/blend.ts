/**
 * How a colour is mixed with what its attachment already held, by name.
 *
 * The numbers are the card's own factors and operations, and they are here rather
 * than in an entry for the reason a primitive's layout is: a description that
 * carried them could disagree with what the name means, and a reader of an entry
 * has no way to check four factors against each other. One name per way of
 * mixing, and the name is what an entry declares.
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
