# Changelog

## 0.2.0 — Rendering upgrade

A big step up in how exhibits look, in the live viewer, in Studio and in standalone HTML exports. No changes to the `.decoder.json` format: existing exhibits render with the new engine as they are.

### Materials

- Richer physical materials across the library: brushed and anisotropic metals, clear-coated paint and plastics, sapphire glass with a thin anti-reflective film, and wet-looking tissue.
- Iridescence uses Three.js's supported thickness range, so the effect is consistent across browsers.
- Organ tissue stays opaque by default on software WebGL, so the heart reads correctly on machines without a GPU. Material overrides in an exhibit still win.

### Lighting and the viewer

- AgX tone mapping, a studio environment for reflections, soft key-light shadows and a contact shadow fitted to each model.
- A subtle bloom pass for emissive parts.
- Section views now draw a machined cap over the cut face instead of showing hollow geometry.
- Disassembly guides are drawn as real 3D rods with seated rings, so they stay visible on high-density screens and in small thumbnails.

### Effects and geometry

- Flow, flame and particle effects have new procedural textures and follow their paths more smoothly.
- More detailed procedural geometry for several part types, and matching updates to the vector illustrations.

### Path tracing (Studio)

- Deeper light bounces for metal and glass, fewer fireflies, sharper output on high-density screens and no tile seams on the first frame. Studio now converges to 128 samples.

### Tooling

- `scripts/capture-gpu-showcase.ts` captures matched stills and a disassembly video from the standalone viewer. It checks the browser's actual WebGL renderer and refuses to save anything unless it is running on a physical GPU, so captures are never mistaken for software renders.
- The export checks now wait for playback to start rather than sampling once, which keeps them reliable on software WebGL.

### Known limits

- Side-by-side comparisons so far were rendered with software WebGL (SwiftShader). A comparison on physical GPU hardware is still to come.

## 0.1.0

First public release.
