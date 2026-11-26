# Geometry vocabulary

Every component's `geometry` is `{ "type": ..., "params": { ... } }`, optionally with `modifiers` and `booleans`. Sizes are in scene units, the same units as `transform.position`. Each shape is centred on its own origin; round shapes stand along the Y axis, so rotate the component to lay them along X or Z.

Any param you leave out takes the default shown. Unknown params are ignored silently, so spell them exactly. Source of truth: `buildPrimitive` in `src/engine/geometry.ts`.

## Basic solids

| type                          | params (default)                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `box`                         | `width` 0.5, `height` 0.5, `depth` 0.5. Edges get a small automatic round unless a side is under 0.014. |
| `rounded_box`                 | `width` 0.5, `height` 0.5, `depth` 0.5, `radius` 0.05 (corner radius)                                   |
| `cylinder`                    | `radius` 0.25, `height` 0.6, `segments` 44 (min 24)                                                     |
| `tapered_cylinder`            | `radiusTop` 0.18, `radiusBottom` 0.3, `height` 0.6, `segments` 44                                       |
| `sphere`                      | `radius` 0.3, `widthSegments` 40, `heightSegments` 28                                                   |
| `ellipsoid`                   | `rx` 0.3, `ry` 0.4, `rz` 0.25 (semi-axes)                                                               |
| `cone`                        | `radius` 0.3, `height` 0.6                                                                              |
| `dome`                        | `radius` 0.35 (upper hemisphere)                                                                        |
| `torus`                       | `radius` 0.35 (ring), `tube` 0.08 (thickness), `segments` 64                                            |
| `hollow_vessel`, `thin_shell` | `outerRadius` 0.35, `innerRadius` 0.28, `height` 0.7, `openTop` true                                    |

## Profiles and paths

| type                                    | params (default)                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extrude`                               | `points` [[x,y], ...] closed 2D outline (default 0.6 × 0.4 rectangle), `depth` 0.2, `bevel` true, `bevelThickness` 0.016, `bevelSize` 0.016. Centred after extrusion. |
| `revolve`                               | `points` [[r,y], ...] half-profile turned about Y (r is distance from the axis), `segments` 48, `smooth` false (true splines the profile)                             |
| `loft`                                  | `sections` [{ `y`, `points` [[x,z], ...] }, ...]: at least 2, each with the same point count                                                                          |
| `sweep`                                 | `path` [[x,y,z], ...] (smooth curve through the points), `radius` 0.05                                                                                                |
| `tube`, `pipe_network`, `flexible_hose` | `points` [[x,y,z], ...], `radius` 0.04, `closed` false. Adds collars at the joints.                                                                                   |
| `rib`                                   | `width` 0.4, `height` 0.25, `thickness` 0.04 (right-triangle gusset)                                                                                                  |
| `custom_mesh`                           | `vertices` flat [x,y,z, ...], `indices` flat triangle list. Use sparingly; normals are computed.                                                                      |

## Mechanical parts

| type                 | params (default)                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `gear`               | `teeth` 18 (min 6), `module` 0.04 (pitch diameter = teeth × module), `thickness` 0.1, `boreRadius` 0.08 |
| `gear_train`         | `count` 3 (min 2), `module` 0.035. Meshed gears of 12 and 20 teeth alternating along X.                 |
| `spring`             | `radius` 0.18 (coil), `wireRadius` 0.022, `height` 0.5, `coils` 6                                       |
| `thread`             | `radius` 0.14, `pitch` 0.018 (ridge thickness, not the lead), `height` 0.4, `turns` 8                   |
| `bearing`            | `outerRadius` 0.32, `innerRadius` 0.16, `width` 0.12, `balls` 10 (min 6)                                |
| `fastener`           | `radius` 0.025 (shank), `headHeight` 0.024, `length` 0.06                                               |
| `flange`             | `outerRadius` 0.28, `innerRadius` 0.1, `thickness` 0.055, `bolts` 6 (min 3)                             |
| `gasket_ring`        | `radius` 0.24, `tube` 0.016, `segments` 44 (lies flat in XZ)                                            |
| `piston_cylinder`    | `radius` 0.32, `height` 0.36. A piston with ring lands, rings, pin and bosses.                          |
| `pump_unit`          | `radius` 0.22, `length` 0.6 (lies along X)                                                              |
| `electric_motor`     | `radius` 0.35, `length` 0.85 (lies along X, finned, shaft out both ends)                                |
| `hydraulic_manifold` | `width` 0.65, `height` 0.28, `depth` 0.35                                                               |
| `heat_exchanger`     | `width` 0.7, `height` 0.5, `depth` 0.35, `fins` 11 (min 4)                                              |

## Electronic, layered and organic

| type                                     | params (default)                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `circuit_board`                          | `width` 1.0, `height` 0.04 (board thickness), `depth` 0.7, `chips` 5 (min 2)    |
| `processor_die`                          | `width` 1.4, `height` 0.08, `depth` 1.4, `cores` 4 (min 2)                      |
| `layered_surface`                        | `layers` 4 (min 2), `width` 1.0, `depth` 1.0, `layerThickness` 0.04, `gap` 0.02 |
| `branching_structure`, `vascular_branch` | `length` 0.9, `radius` 0.09, `branches` 3 (min 2)                               |
| `molecular_lattice`                      | `atoms` 8 (min 4), `radius` 0.35 (ring radius)                                  |

## `instanced`

A small repeated part; the shape depends on which params you give:

- `coils` set: spring (`radius` 0.1, `wireRadius` 0.015, `height` 0.25, `coils`).
- else `tube` set: torus (`radius` 0.14, `tube`, `segments` 40).
- else `width` or `depth` set: rounded box (`width` 0.12, `height` 0.06, `depth` 0.08).
- otherwise: cylinder (`radius` 0.05, `height` 0.05).

An unknown `type` renders a 0.4 placeholder cube; `validate` reports it.

## Modifiers

`modifiers` is a list of `{ "kind": ..., ... }` applied in order. Shared fields: `axis` (`x`, `y` or `z`; default `y`) and `offset` [x,y,z].

| kind               | fields (default)                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `perforation`      | `count` 4 (1 to 20), `radius` 0.04, `depth` 1.2, `width` 0.25 (hole spacing)                                                   |
| `slot`, `groove`   | `width` 0.1, `depth` 0.08, `length` 0.6                                                                                        |
| `seam`             | with `radius`: a ring seam (`depth` 0.008). Without: a flat seam (`width` 0.65, `depth` 0.012, `length` 0.65).                 |
| `fasteners`        | `count` 4 (1 to 16), `boltRadius` 0.02. With `radius`: a bolt circle. Without: corner bolts across `width` 0.4 × `length` 0.4. |
| `gasket`, `o_ring` | `radius` 0.24, `width` 0.015 (cord thickness)                                                                                  |
| `ribs`             | `count` 6 (2 to 16), `radius` 0.26, `width` 0.06, `depth` 0.14, `length` 0.022 (rib thickness)                                 |
| `knurling`         | `radius` 0.17, `count` 10 (4 to 24), `length` 0.4, `depth` 0.006                                                               |
| `chamfer`, `bevel` | `radius` 0.2, `depth` 0.024 (adds a chamfered collar)                                                                          |

## Booleans

`booleans` is a list of `{ "op": "union" | "subtract" | "intersect", "target": <geometry spec>, "transform": <optional transform> }`, applied after modifiers. Use `subtract` for real bores and cut-outs (a cutaway, a hollow handle). Booleans are slower than modifiers, so prefer a modifier when one fits.
