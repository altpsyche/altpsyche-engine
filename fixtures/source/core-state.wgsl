// State: a shader whose picture is made out of the picture it made last frame.
// Every other shader here works out each frame from nothing but the clock. This
// one reads the field it left behind, changes it a little, and writes it back, so
// the pattern on screen is the sum of every frame since the page opened rather
// than a function of the current time.

// Uniform block: WGSL gathers the values a shader is given into one struct, and
// where each field sits is fixed by its type rather than by the order alone. A
// vec2<f32> starts on a multiple of 8, so u_resolution begins at byte 8 and the
// four bytes after u_time go unused.
struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;

// Field to read: last frame's, taken one cell at a time by the pass that writes
// the next one and smoothly by the pass that draws it. It is declared as a
// sampled texture rather than a storage one because a shader cannot read the
// texture it is writing, which is the whole reason there are two of them.
@binding(1) @group(0) var previous: texture_2d<f32>;

// Field to write: this frame's. The two names are one pair, and the backend hands
// this pass a different one of the two textures each frame, so what was written
// through this name is what is read through the name above on the frame after.
@binding(2) @group(0) var next: texture_storage_2d<rgba16float, write>;

// Sampler: how the card reads the field between two of its cells, which is what
// stretches a grid of 256 over a frame hundreds of pixels across without showing
// it as squares.
@binding(3) @group(0) var stateSampler: sampler;

// Spreading speeds: how fast each of the two substances soaks through the grid,
// and the slower one is what the picture shows. A pattern only forms because the
// difference is this large, since at equal speeds the two mix evenly and the
// field goes flat.
const SPREAD_FED = 0.16;
const SPREAD_FORMED = 0.08;

// Feed: how much of the first substance is topped up each frame, as a fraction of
// what is missing. It is also what makes an empty field fill itself, since a grid
// of zeros is all missing.
const FEED = 0.055;

// Kill: how much of the second substance is taken away each frame. The pattern
// this pair of numbers makes is the one that grows worms rather than spots or a
// flat field, and moving either by about 0.005 is enough to change which.
const KILL = 0.062;

// Source path: where the second substance is put in, as a fraction of the grid
// from its middle, and how fast that point travels. Without it a field of zeros
// stays zero, because the first substance fills in and has nothing to react
// with.
const SOURCE_REACH = 0.24;
const SOURCE_SPEED = 0.11;

// Source size: how many cells across the injected patch is. Below about three
// cells the patch is smaller than the pattern's own smallest feature and the
// field swallows it.
const SOURCE_CELLS = 4.0;

// Palette: the two colours the field is painted between, dark first. The dark end
// is not black because an empty field is the picture on the first frame, and a
// frame of pure black reads as a shader that failed rather than one that has not
// started.
const DEEP = vec3<f32>(0.04, 0.06, 0.16);
const BRIGHT = vec3<f32>(0.96, 0.82, 0.45);

// Contrast: how much the second substance's reading is stretched before it
// chooses a colour. It sits between 0 and about 0.35 in a settled pattern, so the
// whole range of both colours would go unused without this.
const CONTRAST = 2.8;

// One cell: last frame's reading at a position, wrapped at the edges of the grid.
// Wrapping is what stops the pattern piling up against a wall, since a cell past
// the last column reads the first one and the field joins up with itself.
fn field(cell: vec2<i32>, size: vec2<i32>) -> vec2<f32> {
    let wrapped = ((cell % size) + size) % size;
    return textureLoad(previous, wrapped, 0).rg;
}

// Spreading: how much each substance is pulled towards its neighbours. The nine
// weights add up to one, and the corners count for a quarter of what the sides
// do, so a patch spreads as a circle rather than as a diamond pointing along the
// grid.
fn spread(cell: vec2<i32>, size: vec2<i32>) -> vec2<f32> {
    var sum = vec2<f32>(0.0, 0.0);
    sum += field(cell + vec2<i32>(-1, -1), size) * 0.05;
    sum += field(cell + vec2<i32>(0, -1), size) * 0.2;
    sum += field(cell + vec2<i32>(1, -1), size) * 0.05;
    sum += field(cell + vec2<i32>(-1, 0), size) * 0.2;
    sum += field(cell + vec2<i32>(1, 0), size) * 0.2;
    sum += field(cell + vec2<i32>(-1, 1), size) * 0.05;
    sum += field(cell + vec2<i32>(0, 1), size) * 0.2;
    sum += field(cell + vec2<i32>(1, 1), size) * 0.05;
    return sum - field(cell, size);
}

// Workgroup size: the block of cells one run of this program covers. The dispatch
// count is worked out from these two numbers and the grid's own size, so the
// whole grid is covered by whole blocks and a size that does not divide by 8 is
// covered by a block that runs off the edge.
@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) cell: vec3<u32>) {
    let size = vec2<i32>(textureDimensions(next));
    let at = vec2<i32>(i32(cell.x), i32(cell.y));

    // Edge guard: the last block of a row runs past the grid when its width does
    // not divide by the block size, and a write outside the texture is thrown
    // away by the card rather than reported, so the cells that are not there
    // return before doing the work.
    if (at.x >= size.x || at.y >= size.y) {
        return;
    }

    let was = field(at, size);
    let pull = spread(at, size);

    // The reaction: the second substance turns the first into more of itself, and
    // it needs two of itself present to do it. That square is why a patch grows
    // at its own edge instead of everywhere at once, and it is the whole of what
    // makes this a pattern rather than a blur.
    let reaction = was.r * was.g * was.g;

    var fed = was.r + SPREAD_FED * pull.r - reaction + FEED * (1.0 - was.r);
    var formed = was.g + SPREAD_FORMED * pull.g + reaction - (FEED + KILL) * was.g;

    // The source: a small patch of the second substance, kept topped up, at a
    // point that travels in a circle. It moves so that the pattern keeps being
    // started somewhere new rather than growing once from the middle and settling.
    let angle = uniforms.u_time * SOURCE_SPEED;
    let middle = vec2<f32>(f32(size.x), f32(size.y)) * 0.5;
    let travel = vec2<f32>(cos(angle), sin(angle)) * SOURCE_REACH * middle;
    if (distance(vec2<f32>(f32(at.x), f32(at.y)), middle + travel) < SOURCE_CELLS) {
        formed = 1.0;
    }

    // Range guard: both readings are held between nothing and one, because a 16
    // bit float has room for numbers far outside that, and one frame of
    // arithmetic running past the top is a cell that never comes back. It feeds
    // the next frame, which runs further past it.
    fed = clamp(fed, 0.0, 1.0);
    formed = clamp(formed, 0.0, 1.0);

    textureStore(next, at, vec4<f32>(fed, formed, 0.0, 1.0));
}

@fragment
fn shade(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
    // Screen position as a fraction: the pixel counted from a corner divided by
    // the frame size, which gives 0 to 1 across the frame whatever its size. The
    // grid is square and the frame usually is not, so the field is stretched to
    // fill it rather than sitting in a square with the frame showing around it.
    let at = pixel.xy / uniforms.u_resolution;

    // One frame behind: this reads the half the other pass is not writing, which
    // is the field as it stood a frame ago. A pass cannot read what another pass
    // is writing in the same frame, so the picture trails the arithmetic by one.
    let formed = textureSample(previous, stateSampler, at).g;

    let level = clamp(formed * CONTRAST, 0.0, 1.0);
    return vec4<f32>(mix(DEEP, BRIGHT, level), 1.0);
}
