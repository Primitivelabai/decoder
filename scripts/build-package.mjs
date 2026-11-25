// Builds the npm package: the SDK and the `decoder` command as ES modules in lib/,
// with type declarations for the SDK.
//
// Runtime dependencies stay external. The three.js add-ons (three-bvh-csg and friends)
// are bundled from their ES module builds, because Node would otherwise load their
// CommonJS builds and with them a second copy of three.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).flatMap((name) => [name, `${name}/*`]);

rmSync('lib', { recursive: true, force: true });

await build({
  entryPoints: { index: 'src/sdk/index.ts', cli: 'cli/decoder.ts' },
  outdir: 'lib',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  mainFields: ['module', 'main'],
  external,
  chunkNames: 'chunks/[name]-[hash]',
  legalComments: 'inline',
  logLevel: 'warning',
});

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.package.json'], {
  stdio: 'inherit',
});

// Node's ES module resolution needs explicit extensions in relative imports,
// including the ones inside declaration files.
const relativeImport = /(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;
for (const file of walk('lib/types')) {
  if (!file.endsWith('.d.ts')) continue;
  const source = readFileSync(file, 'utf8');
  const fixed = source.replace(relativeImport, (match, lead, quote, specifier) => {
    const target = resolve(dirname(file), specifier);
    if (existsSync(`${target}.d.ts`)) return `${lead}${quote}${specifier}.js${quote}`;
    if (existsSync(join(target, 'index.d.ts'))) return `${lead}${quote}${specifier}/index.js${quote}`;
    return match;
  });
  if (fixed !== source) writeFileSync(file, fixed);
}

console.log('Package built in lib/');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
