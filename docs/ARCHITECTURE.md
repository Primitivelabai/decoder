# primitive / decoder: architecture

## Overview

Decoder separates **Subject Representation** (`.decoder.json` v1.0.0) from **Engine Infrastructure** (`/src/engine/`) and **Authoring/Presentation UI** (`/src/components/`).

## Module Separation

- `src/engine/types.ts` & `src/engine/schema.ts`: Versioned `.decoder.json` v1.0.0 contracts and formal JSON Schema (Ajv).
- `src/engine/geometry.ts`: Procedural geometry kernel (25+ primitives, 10 parameterized generators, `three-bvh-csg` Booleans, perforations/slots/grooves, instancing, diagnostics, and faceted STEP AP214 adapter).
- `src/engine/materials.ts`: 17 PBR material presets with procedural bump maps and 6 calibrated lighting presets.
- `src/engine/expressions.ts` & `src/engine/runtime.ts`: Sandboxed recursive-descent expression parser/evaluator (no `eval`), coupled midpoint RK2 ODE integration, lookup tables, state machines, and synchronized mechanical bindings.
- `src/engine/spatial.ts`: World transform resolution, bounding boxes, two-stage hierarchical explosion vectors, topological disassembly order, and 2D label overlap repulsion solver.
- `src/engine/relationships.ts`: Typed relationship graph engine with upstream/downstream BFS tracing and feedback loop cycle detection.
- `src/engine/effects.ts`: Path-constrained instanced particle/ray effects (`liquid_flow`, `steam_vapour`, `combustion`, `optical_ray`, `signal_pulse`, `heat_gradient`, etc.).
- `src/engine/illustration.ts`: Vector SVG generator extracting crease feature edges (`EdgesGeometry` threshold), backface culling, painter's depth sorting, hatching, and numbered callouts across 6 aesthetics.
- `src/engine/exporters.ts`: `.decoder.json`, validated `GLB`, `glTF`, `OBJ`, `STL`, `SVG`, `PNG`, faceted `STEP`, and self-contained `Standalone HTML`.
- `src/engine/renderer.ts`: Three.js WebGL2 viewport with software-WebGL adaptation, `RoomEnvironment` PMREM reflections, clipping planes, examination modes, and `TransformControls`.
- `src/sdk/index.ts` & `cli/decoder.ts`: Programmatic SDK and Node/TSX CLI.

## Capability Status

| Capability                                           | Status                 | Notes                                                                      |
| ---------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `.decoder.json` v1.0.0 Schema & Ajv Validation       | Implemented; tested    | Test cases in `src/engine/engine.test.ts`                                  |
| Procedural Primitives, Generators & CSG Booleans     | Implemented; tested    | Powered by Three.js + `three-bvh-csg`                                      |
| Sandboxed Expressions, ODEs & State Machines         | Implemented; tested    | Zero `eval` / `Function`                                                   |
| Hierarchical Explosion & Examination Modes           | Implemented; tested    | 12+ examination modes + real-time clipping planes                          |
| Scientific Visual Effects                            | Implemented            | Illustrative particle/spline shaders clearly separated from physics        |
| Technical Illustration SVG Pipeline (6 Aesthetics)   | Implemented; tested    | Derived directly from 3D geometry                                          |
| GLB/glTF, OBJ, STL, SVG, PNG, Standalone HTML Export | Implemented; tested    | GLB includes re-import validation                                          |
| STEP AP214 Export                                    | Experimental (Faceted) | Outputs polygonal shells via `CadStepAdapter` (not analytical NURBS B-Rep) |

## Checks

```bash
npm run check
npm run verify:exports
npm run decoder -- test <project.decoder.json>
```
