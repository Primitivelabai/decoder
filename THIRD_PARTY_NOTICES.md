# Third-party notices

primitive / decoder is licensed under the Apache License 2.0 (see `LICENSE`). It bundles the open-source packages below into the Studio build and into every standalone HTML exhibit. Each remains under its own licence; full licence texts ship with each package in `node_modules/<package>/LICENSE` and at the linked repositories.

## Bundled at runtime

| Package                                                                                                   | Version | Licence      |
| --------------------------------------------------------------------------------------------------------- | ------- | ------------ |
| [three](https://github.com/mrdoob/three.js)                                                               | 0.187.0 | MIT          |
| [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg)                                               | 0.0.19  | MIT          |
| [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)                                 | 0.0.28  | MIT          |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)                                             | 0.10.0  | MIT          |
| [react](https://github.com/facebook/react), react-dom                                                     | 19.3.1  | MIT          |
| [scheduler](https://github.com/facebook/react)                                                            | 0.28.0  | MIT          |
| [lucide-react](https://github.com/lucide-icons/lucide)                                                    | 0.546.0 | ISC          |
| [ajv](https://github.com/ajv-validator/ajv)                                                               | 8.20.0  | MIT          |
| [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal)                                         | 3.1.3   | MIT          |
| [json-schema-traverse](https://github.com/epoberezkin/json-schema-traverse)                               | 1.0.0   | MIT          |
| [fast-uri](https://github.com/fastify/fast-uri)                                                           | 3.1.9   | BSD-3-Clause |
| [require-from-string](https://github.com/floatdrop/require-from-string)                                   | 2.0.2   | MIT          |
| [@fontsource/geist](https://github.com/fontsource/font-files) (Geist, by Vercel)                          | 5.3.0   | OFL-1.1      |
| [@fontsource/geist-mono](https://github.com/fontsource/font-files) (Geist Mono, by Vercel)                | 5.3.0   | OFL-1.1      |
| [@fontsource/space-grotesk](https://github.com/fontsource/font-files) (Space Grotesk, by Florian Karsten) | 5.3.0   | OFL-1.1      |

The Geist, Geist Mono and Space Grotesk font files are bundled into the web app build only (not into standalone exhibit pages) under the SIL Open Font License 1.1; the licence text ships in each package's `LICENSE` file.

## Build and test tools (not distributed)

Vite, @vitejs/plugin-react, Tailwind CSS, esbuild, tsx, Prettier and Playwright (MIT), and TypeScript (Apache-2.0).
