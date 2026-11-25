---
name: decoder
description: Describe a mechanical, optical, biological or electronic system as a .decoder.json exhibit, then validate, simulate, illustrate and package it as an offline interactive 3D HTML page with primitive / decoder. Use when someone wants to explain how a machine, device or organ works as an explorable 3D model, technical plate or exploded view.
---

# primitive / decoder

Decoder turns a structured description of a system into an interactive 3D exhibit: procedural geometry, an exploded view, typed relationships between parts, a declarative simulation, a vector technical plate, and a standalone HTML page that runs offline.

## Where the tool lives

All commands run from the root of a decoder checkout.

1. If `DECODER_HOME.txt` sits next to this file, it holds the checkout path. Use it.
2. Otherwise clone `https://github.com/Primitivelabai/decoder`, then run `npm install` in it.

Node.js 22.12 or newer is required.

## Core rule

Never edit renderer, Studio or runtime code to represent a subject. Everything about a subject goes in its `.decoder.json` file, using the schema in `src/engine/schema.ts` and the procedural geometry vocabulary. If a subject seems to need engine changes, simplify the model instead and record the simplification as an assumption.

## Workflow

1. **Start a project.**
   `npm run decoder -- init <name>.decoder.json "<Title>"`
   Study a built-in exhibit in `src/projects/` that is close to the subject before writing your own.

2. **Describe three synchronised layers.**
   - `components`: nested parts, each with `geometry`, `materialId`, `transform`, `disassembly` and `evidence`.
   - `relationships`: typed edges between parts: `force`, `torque`, `rotation`, `translation`, `electrical_power`, `information`, `signal`, `liquid_flow`, `gas_flow`, `heat`, `chemical_exchange`, `optical_transmission`, `control`, `feedback`, `logical_dependency`.
   - `simulation` and `behaviours`: safe declarative expressions (`sin`, `cos`, `clamp`, `lerp`, `if`, `mod`, `sliderCrank`, `conrodAngle`, lookup tables, ODEs and state machines). No code is ever evaluated.

3. **Validate until clean.**
   `npm run decoder -- validate <name>.decoder.json`
   Fix every error on the component it names (`MISSING_MATERIAL`, `INVALID_GEOMETRY_DIMENSION`, `INVALID_EXPRESSION`, `BROKEN_PARENT_REFERENCE` and so on). Treat warnings as work to do, not noise.

4. **Inspect and simulate.**
   `npm run decoder -- inspect <name>.decoder.json` prints diagnostics, bounds and the disassembly plan.
   `npm run decoder -- preview <name>.decoder.json` steps one cycle and prints the state table. Check that the numbers make physical sense and that units match their labels.

5. **Produce outputs.**
   - Technical plate: `npm run decoder -- render <name>.decoder.json plate.svg <aesthetic>` where aesthetic is `patent`, `museum_plate`, `industrial_manual`, `scientific_journal`, `minimal_editorial` or `technical_atlas`.
   - Offline exhibit: `npm run decoder -- package <name>.decoder.json exhibit.html`
   - Geometry: `npm run decoder -- export <name>.decoder.json <svg|obj|stl|step|json>`
   - Full check: `npm run decoder -- test <name>.decoder.json`

6. **Show it.** `npm run dev` opens the Studio at `http://127.0.0.1:3000`. Use **Studio → Import JSON** to load the project.

## Evidence discipline

Every component, relationship and project summary declares `evidence.classification`:

- `observed`: measured or directly visible.
- `documented`: taken from a schematic, datasheet or specification.
- `inferred`: deduced from context or neighbouring parts.
- `illustrative`: a teaching simplification. List its `assumptions`.
- `unknown`: not verified.

`observed` and `documented` require non-empty `sources`. Without a real source, use `inferred` or `illustrative`. Visual effects such as flow particles or heat glow are illustrative, never validated physics; say so. Runtime arithmetic errors must be fixed, not suppressed.

## Before handing over

- `validate` reports no errors.
- `preview` outputs are finite and their units are right.
- The packaged HTML opens with the network off and plays.
- Run `npm run test:core` and `npm test` if you changed anything outside the project file.
