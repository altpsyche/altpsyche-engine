/**
 * What a fixture's entry declares about its frame, which is the handful of things
 * a shader source cannot say about itself.
 *
 * It lives beside the corpus rather than on the package door. Nothing a consumer
 * installs needs it today, because every shader outside this directory is one pass
 * over the whole frame, and a type on the door is a promise about a published
 * surface. A shader a reader can reach declaring a frame of its own is what would
 * move it.
 */
import type { Groups, GeometryPrimitive, StencilMode, TransientSize } from '@altpsyche/engine';
import type { TextureContent, BufferContent } from './shader-content';
import type { BlendMode } from './shader-blend';

/**
 * What a shader's entry says about its frame that its own source cannot.
 *
 * A source declares its bindings, the format of every texture it writes and the
 * block size a compute entry point runs in. What it cannot say is how big a
 * resource is, how much of a pipeline to run, and which resource a reader is
 * meant to see, so those three are declared here and nothing else is.
 *
 * Absent on every shader that is one pass over the whole frame, which is what the
 * build describes when this is not declared.
 */
export interface DeclaredFrame {
  /** Every texture the frame owns, by the name its source binds it under. A name
   * the source never writes stops the build rather than leaving a picture that is
   * whatever the memory held. */
  textures?: {
    name: string;
    size: TransientSize;
    /** Which picture the build writes into it before anything reads it, absent
     * for a texture the shader itself writes. A texture with contents is one the
     * source samples, and one without is one the source stores into, so this is
     * also what says which of the two a name is. */
    content?: TextureContent;
    /** Whether it carries a ladder of smaller copies of itself, each half the size
     * of the one above it, so it can be read at any size without the picture
     * sparkling as it shrinks. The backend draws the levels, and how many there
     * are comes off the size rather than being declared. */
    mips?: 'generate';
  }[];
  /** Two textures that trade places every frame, which is what a field growing
   * out of its own last state needs: a shader cannot read the texture it is
   * writing. The source samples the first name and stores into the second, and
   * the backend hands it a different one of the pair each frame. One declaration
   * rather than two, because both halves are the same size and the same format
   * and are used both ways, and saying that twice is saying it twice. */
  pairs?: { read: string; write: string; size: TransientSize }[];
  /** Every block of bytes the frame owns, by the name its source binds it under.
   * How big it is is here because the type a source declares may be an array with
   * no length at all, and whether the shader may write into it is the source's, so
   * nothing about it is said twice. It is where a number the card worked out for
   * itself lives, which is what a pass reading its own counts needs. */
  buffers?: {
    name: string;
    bytes: number;
    /** Which numbers the build writes into it before anything reads it, absent for
     * a buffer a pass fills or a query resolves into. A buffer with contents is one
     * the shader only reads, and it is what a copy of a pipeline is handed when it
     * carries numbers of its own rather than working them out from its number. */
    content?: BufferContent;
  }[];
  /** How the card reads a texture between its own pixels. The source declares
   * that a sampler exists and where it is bound and nothing else, so the two
   * choices a picture depends on are made here. */
  samplers?: { name: string; filter: 'nearest' | 'linear'; wrap: 'clamp' | 'repeat' | 'mirror' }[];
  /** Geometry the build generates, since a buffer's contents are numbers and no
   * source file holds them. The entry names a primitive and how big it is and the
   * build writes both buffers, their layout and their counts, so nothing about
   * the bytes is written down where it could disagree with them. One declaration
   * rather than one per buffer, because the indices address exactly these
   * vertices and saying that twice is saying it twice. */
  geometry?: {
    name: string;
    primitive: GeometryPrimitive;
    /** How many quads across and down, for a grid. What the two numbers mean is
     * the primitive's, since it is what turns them into vertices. */
    size: [number, number];
  }[];
  /** Every texture a pass draws into, which is the frame's colours and the depth
   * it keeps, by the name the pass gives it. They are declared apart from the
   * textures above because nothing binds them: a colour attachment is a number the
   * fragment stage returns and the depth is not in the source at all, so their
   * formats are the entry's answer rather than being read off a declaration. */
  attachments?: {
    name: string;
    size: TransientSize;
    format: GPUTextureFormat;
    /** How many readings of each pixel it keeps, absent for the one every other
     * attachment keeps. Four of them is what turns the staircase a slanted edge
     * comes out as into a gradient, because the average of four readings inside a
     * pixel is however much of that pixel the triangle covered.
     *
     * Nothing can read an attachment keeping several, so the pass writing it says
     * where they are averaged, and every attachment of one pass keeps the same
     * number. It is four or nothing because those are the two counts core WebGPU
     * guarantees. */
    samples?: 4;
  }[];
  /** The passes in the order they run. A pass names an entry point the source
   * declares, and a compute pass carries `groups`: the whole workgroup count a
   * producer worked out from the size it had (`groupsToCover` covers a pixel size
   * in whole blocks of the entry point's own workgroup size), or a buffer to read
   * that count from. A pass naming geometry draws it through a vertex entry point
   * of the shader's own, as many instances over as it asks for. A pass with none
   * of the three draws the backend's own three corners, and which kind of work a
   * pass is comes off the stage the source declares its entry point at. */
  passes: {
    pipeline: string;
    groups?: Groups;
    /** The vertex entry point the geometry is read by, which a drawn pass needs
     * because the frame's own corners are the backend's program rather than the
     * shader's. */
    vertex?: string;
    geometry?: string;
    /** How many copies of that geometry to draw. One where it is left out. */
    instances?: number;
    /** The buffer this pass reads its own counts out of, which is what an earlier
     * pass of the same frame wrote there. A pass naming one says nothing about how
     * much work it does, so it names no instance count either. */
    indirect?: string;
    /** The attachments this pass writes its colours into, in the order the
     * fragment stage returns them, absent where it writes the frame the reader
     * sees. An attachment with a clear value is emptied to it first and one
     * without keeps what the pass before it drew, which is what a surface drawn
     * over another one needs. `blend` is how the colour arrives in it. */
    colour?: {
      resource: string;
      clear?: [number, number, number, number];
      blend?: BlendMode;
      /** Where the readings an attachment keeps several of are averaged into one
       * picture, which is another attachment of the same size and format keeping
       * one. Absent for an attachment keeping one already, and required for one
       * keeping several, since nothing else can read it. */
      resolve?: string;
    }[];
    /** The buffer this pass writes the two times it took into: one as it opens
     * and one as it closes, so what lands there is a period rather than a clock
     * reading. It is 16 bytes, since each of the two is a count of 64 bits, and a
     * buffer holding fewer stops the build.
     *
     * A device without the optional part of the API for it draws the pass anyway
     * and leaves the buffer alone, so a frame asking to be timed is not a frame
     * only some cards can draw. */
    timed?: string;
    /** The buffer this pass writes the count of samples its draw got through
     * into, which is how much of what was drawn came out in front of everything
     * else. It is 8 bytes, one count of 64 bits, and a buffer holding fewer stops
     * the build. It is the one reading here that no picture shows: a sheet hidden
     * behind another one is a number that falls while the frame looks the same.
     *
     * A compute pass cannot have one, since nothing in one is drawn for something
     * else to cover. */
    visible?: string;
    /** Where this pass keeps how far away each pixel it drew is and the mask it
     * cuts with, which are one attachment on the card however many halves the
     * format has. `compare` and `write` are the depth half, absent for a format
     * that keeps no depth, and `write` is whether passing leaves the new distance
     * behind, so a nearer surface drawn with it off lets the further one show
     * through rather than hiding it. The format is the attachment's, so a pass and
     * a texture cannot disagree about it. */
    depth?: {
      resource: string;
      clear?: number;
      compare?: GPUCompareFunction;
      write?: boolean;
      /** What this pass does to the mask the attachment keeps, absent for an
       * attachment in a format that keeps none. `mark` leaves the mask behind
       * everywhere the pass draws and `inside` draws only where an earlier pass
       * marked, so a shape cut out of a surface is two passes over one
       * attachment.
       *
       * The value the mask carries is the mode's own rather than a number
       * declared here, so nothing can carry one that disagrees with the mode
       * beside it. */
      stencil?: StencilMode;
      /** What the mask is emptied to before this pass, absent for a pass that
       * keeps what the pass before it left. It is the same rule the colour and
       * depth halves follow, and keeping a mask nothing wrote is what the pass
       * drawn inside a mark needs. */
      stencilClear?: number;
    };
  }[];
  /** Which texture or attachment holds the picture once every pass has run. A compute pass
   * writes a texture rather than an attachment, and a storage texture cannot be
   * the attachment of the pass writing it, so the frame says which one is the
   * picture and the backend copies it out. */
  present?: string;
}
