# Examples

Everything else in these docs shows a fragment. This page is the whole of a working page,
start to finish, and then the six pages in this repository you can open and read.

## A first frame, complete

Four files. Nothing is elided and nothing is pseudocode.

```
hello-engine/
  package.json
  index.html
  main.ts
```

**`package.json`** — the package is ESM, so the project is too:

```json
{
  "name": "hello-engine",
  "private": true,
  "type": "module"
}
```

```bash
npm install @altpsyche/engine vite
```

You do need a bundler, and the reason is the one thing to know about this package: the two
backends are reached by `await import()`, so a bundler is what splits them into separate
files and lets the browser fetch only the one it can run. A browser with no WebGPU never
downloads the WebGPU backend. Any bundler does it; `vite` is here because it needs no
configuration.

The page below is TypeScript, which vite compiles with no setup — the package ships its own
declarations, so every call is typed without a `@types` package. Plain JavaScript works
identically: drop the one type assertion and rename the file.

**`index.html`** — a canvas and a module. The canvas is sized in CSS and the surface is told
what size that turned out to be, which is the division that lets a page lay out however it
likes:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>a first frame</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      canvas { display: block; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <canvas></canvas>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

**`main.ts`** — a GLSL pair and a running surface:

```ts
import { createSurface, glslFrame } from '@altpsyche/engine';

// The three corners are the backend's own, so the vertex half only forwards the
// position it is handed. `position` is the attribute name the WebGL 2 backend fills.
const VERTEX = `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 iResolution;
out vec4 fragColour;
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec3 colour = 0.5 + 0.5 * cos(uTime + uv.xyx * 6.283185 + vec3(0.0, 2.0, 4.0));
  fragColour = vec4(colour, 1.0);
}`;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// A GLSL pair is one frame graph: one pass, one pipeline, drawn over the canvas.
const frame = glslFrame('first-frame', VERTEX, FRAGMENT);

// `createSurface` is asynchronous because the backend behind it is a dynamic import.
const surface = await createSurface(canvas, frame, {
  uniforms: (elapsedSeconds) => ({
    uTime: elapsedSeconds,
    iResolution: [canvas.width, canvas.height, 1],
  }),
  onError: (message) => console.error(message),
});

if (!surface) {
  console.error('no backend on this browser would give the page a context');
} else {
  const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
  addEventListener('resize', fit);
  fit();
  surface.start();
}
```

```bash
npx vite
```

A rolling three-colour gradient fills the window, and it follows a resize.

### What that page actually did

- **`glslFrame` built a frame graph**, not a shader object. One pass, one pipeline, the
  backend's own three corners as its geometry. The same value could have been sent to a worker
  or handed to `cost` without a device existing.
- **`createSurface` awaited a dynamic import**, and this page fetched the WebGL 2 backend and
  nothing else. That is not a property of the machine: a GLSL-authored frame selects WebGL 2
  *even where WebGPU exists*, because the language it is written in is the capability it
  forfeits. [GUIDE-backends.md](GUIDE-backends.md) is that rule in full.
- **The uniform callback is handed elapsed seconds** and returns a plain object. The resolution
  it reads is the drawing buffer the surface sized, so a resize needs no shader code.
- **A `null` surface is an answer, not a crash.** Nothing throws at a caller who arrived on a
  browser that would not give a context.

To author in WGSL instead, `wgslFrame(id, code, block)` takes the source and the uniform
block that source implies — `uniformBlockOf(code)` reads that block off the source, so the
layout is never written twice. Two things it expects: the fragment entry point is called
`fragMain`, and the uniforms are one struct at group 0, binding 0. The README's tour shows
the call.

One caveat before you try it: a *fullscreen* WGSL frame has no vertex document for WebGL 2 to
link, so it draws on WebGPU and is refused by name elsewhere. A frame with real geometry has
both halves and reaches both backends.

## The six examples in this repository

These are full pages rather than snippets, each with its reasoning written above the code.

```bash
git clone https://github.com/altpsyche/altpsyche-engine
cd altpsyche-engine
npm install
npm run example orbit-shadow
```

That bundles the example with `@altpsyche/engine` aliased to the door — so it imports the
package by the name a stranger would — serves it over `http://localhost`, and opens it. It
needs a display, because these are pages and a page has to be looked at.

| `npm run example …` | what it is there to show |
| --- | --- |
| `fullscreen` | the page above: one GLSL pass, one surface, a resize |
| `glsl-fragment` | a fragment document a consumer wrote, drawn on WebGL 2 on a machine that has WebGPU — selection, seen from outside |
| `instanced-cubes` | a thousand objects with their own transforms, one pipeline, **one** instanced draw, and the same idea authored in both languages so either backend draws it |
| `orbit-shadow` | the scene tier: an orbit camera, a shadow-casting light, around fifty objects across two pipelines, with the pass order the producer's to choose |
| `compute-field` | a compute pass writing a storage texture the frame then shows — WebGPU only, and on WebGL 2 the page prints the refusal *naming* `compute` and `storage-texture` rather than drawing half a frame |
| `gltf-cube` | a mesh fetched after the page opened, parsed by the example, and drawn mid-session — the asset pipeline is deliberately **not** in this library, and this is the honest test of that |

`compute-field` is the one worth opening on two machines. The page that refuses is doing the
same work as the page that draws: reading a graph's declared capabilities against what a device
reported, and answering by name before a driver is reached.

## Where to go next

| you want | read |
| --- | --- |
| every exported name | [API.md](API.md) |
| more than one pass, real geometry, a depth buffer | [GUIDE-frame-graph.md](GUIDE-frame-graph.md) |
| which backend draws what, and why a frame was refused | [GUIDE-backends.md](GUIDE-backends.md) |
| why the shapes are the shapes | [ARCHITECTURE.md](ARCHITECTURE.md) |
