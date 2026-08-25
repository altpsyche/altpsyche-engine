/**
 * How much of a captured frame carries a picture.
 *
 * A capture that comes back with a band of the frame left at one flat colour is
 * still a file, so counting files written says a run succeeded when half the
 * picture is missing. What separates the two is coverage: a painted frame has
 * something other than its commonest colour in every row and every column.
 *
 * The pixels have to come from the lossless screenshot rather than from the
 * encoded file. A strip ten pixels wide is narrower than webp's blocks, so the
 * encoder mixes it into its neighbours and a count taken off the written file
 * reports every column painted whatever was captured.
 */

export interface FrameCoverageInput {
  width: number;
  height: number;
  /** Bytes per pixel in the raw buffer, so an opaque screenshot and one carrying alpha both read. */
  channels: number;
}

export interface FrameCoverage {
  width: number;
  height: number;
  /** The commonest colour, one entry per channel. An unpainted region is made of this. */
  ground: number[];
  /** Share of the frame the ground colour covers, 0 to 1. */
  groundShare: number;
  paintedRows: number;
  paintedColumns: number;
  /** Rows carrying nothing but the ground colour, in order. */
  blankRows: number[];
  blankColumns: number[];
}

/**
 * One number per colour, so the tally is a numeric map rather than a map of
 * strings. Four channels of eight bits reach 2^32, which stays exact as a
 * double, and shifting would push the top channel into the sign bit.
 */
function packColour(pixels: Uint8Array | Uint8ClampedArray, at: number, channels: number): number {
  let key = 0;
  for (let c = 0; c < channels; c++) key = key * 256 + (pixels[at + c] ?? 0);
  return key;
}

function unpackColour(key: number, channels: number): number[] {
  const out: number[] = [];
  let rest = key;
  for (let c = 0; c < channels; c++) {
    out.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  }
  return out;
}

export function readFrameCoverage(
  pixels: Uint8Array | Uint8ClampedArray,
  { width, height, channels }: FrameCoverageInput
): FrameCoverage {
  const expected = width * height * channels;
  if (pixels.length < expected) {
    throw new Error(`frame is ${pixels.length} bytes, short of the ${expected} that ${width}x${height} needs`);
  }

  const tally = new Map<number, number>();
  for (let i = 0; i < expected; i += channels) {
    const key = packColour(pixels, i, channels);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  let ground = 0;
  let groundCount = -1;
  for (const [key, count] of tally) {
    if (count > groundCount) {
      ground = key;
      groundCount = count;
    }
  }

  const rowPainted = new Array<boolean>(height).fill(false);
  const columnPainted = new Array<boolean>(width).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (packColour(pixels, (y * width + x) * channels, channels) === ground) continue;
      rowPainted[y] = true;
      columnPainted[x] = true;
    }
  }

  const blankRows: number[] = [];
  const blankColumns: number[] = [];
  for (let y = 0; y < height; y++) if (!rowPainted[y]) blankRows.push(y);
  for (let x = 0; x < width; x++) if (!columnPainted[x]) blankColumns.push(x);

  return {
    width,
    height,
    ground: unpackColour(ground, channels),
    groundShare: groundCount / (width * height),
    paintedRows: height - blankRows.length,
    paintedColumns: width - blankColumns.length,
    blankRows,
    blankColumns,
  };
}

export function isFullyPainted(coverage: FrameCoverage): boolean {
  return coverage.blankRows.length === 0 && coverage.blankColumns.length === 0;
}

/** A run of consecutive indices printed as its two ends, so a blank band is one phrase rather than hundreds. */
function describeBand(indices: number[]): string {
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (first === undefined || last === undefined) return '';
  const contiguous = last - first + 1 === indices.length;
  return contiguous ? `${first} to ${last}` : `${first} to ${last}, with gaps`;
}

export function describeFrameCoverage(coverage: FrameCoverage): string {
  const { paintedRows, paintedColumns, height, width, ground, groundShare, blankRows, blankColumns } = coverage;
  const parts = [
    `${paintedRows} of ${height} rows and ${paintedColumns} of ${width} columns painted`,
    `ground colour ${ground.join(',')} over ${(groundShare * 100).toFixed(1)}% of the frame`,
  ];
  if (blankRows.length) parts.push(`blank rows ${describeBand(blankRows)}`);
  if (blankColumns.length) parts.push(`blank columns ${describeBand(blankColumns)}`);
  return parts.join(', ');
}
