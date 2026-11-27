/**
 * Offline verification of standalone HTML exhibits.
 *
 * Packages every built-in exhibit (plus a hostile-title case) and opens each from
 * file:// in headless Chromium with networking disabled. Checks that nothing is
 * requested over the network and that playback, pause, seeking, explosion,
 * parameters and component selection work, then repeats with WebGL disabled to
 * confirm the vector fallback plate renders.
 *
 *   npx playwright install chromium   # once
 *   npm run verify:exports [-- --shots <dir>]
 *
 * Set CHROMIUM_PATH to use an existing Chromium or headless-shell binary.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { BUILTIN_EXHIBITS } from '../src/projects/index';
import { DecoderSDK } from '../src/sdk/index';
import type { DecoderProject } from '../src/engine/types';

const shotsArg = process.argv.indexOf('--shots');
const shotsDir = shotsArg > 0 ? process.argv[shotsArg + 1] : undefined;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isLocal = (url: string) => /^(file|data|blob):/.test(url);

function hostileProject(): DecoderProject {
  const project = structuredClone(BUILTIN_EXHIBITS.find((p) => p.id === 'four_stroke_engine') ?? BUILTIN_EXHIBITS[0]);
  project.id = 'hostile_title';
  project.title = 'Engine </script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2"> & </title>';
  project.components[0].name = '</script><script>window.__pwned=3</script>';
  project.components[0].description = '<img src=x onerror="window.__pwned=4">';
  return project;
}

async function frameHash(page: Page): Promise<number> {
  const buf = await page.locator('#viewport').screenshot();
  let hash = 0;
  for (let i = 0; i < buf.length; i += 97) hash = (hash * 31 + buf[i]) >>> 0;
  return hash;
}

/** Frame hash once rendering has caught up: two identical captures in a row (slow software GL needs this). */
async function settledHash(page: Page, timeoutMs = 15000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let previous = await frameHash(page);
  while (Date.now() < deadline) {
    await wait(250);
    const current = await frameHash(page);
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

/**
 * Rendering is on demand and can lag the input on software GL, so two identical captures may still
 * show the previous frame. Wait for the frame to move away from `from` first, then let it settle.
 */
async function changedHash(page: Page, from: number, timeoutMs = 15000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await frameHash(page)) !== from) break;
    await wait(250);
  }
  return settledHash(page);
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.locator('#timeline').evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input'));
  }, seconds);
  await wait(300);
}

async function verify(browser: Browser, file: string, webgl: boolean): Promise<Record<string, boolean>> {
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  await context.setOffline(true);
  const requests: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocal(url)) return route.continue();
    requests.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(pathToFileURL(file).href);
  await wait(2500);

  const checks: Record<string, boolean> = {};
  const outputs = () => page.locator('#outputs').innerText();
  const time = () => page.locator('#timeline').evaluate((el: HTMLInputElement) => Number(el.value));
  checks.injectionInert = (await page.evaluate(() => (window as { __pwned?: number }).__pwned)) === undefined;

  if (!webgl) {
    const [w, h] = await page
      .locator('#fallback')
      .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
    checks.fallbackVisible = await page.locator('#fallback').isVisible();
    checks.fallbackDecodes = w > 0 && h > 0;
    checks.fallbackExplained = /3D unavailable/.test(await page.locator('#status').innerText());
  } else {
    const project = await page.evaluate(
      () => JSON.parse(document.getElementById('decoder-project-data')!.textContent!) as DecoderProject,
    );
    checks.ready = (await page.locator('#play').isEnabled()) && (await page.locator('#viewport canvas').count()) === 1;
    checks.nonBoxGeometry = project.components.some((c) => !['box', 'rounded_box'].includes(c.geometry?.type ?? 'box'));

    const t0 = await time();
    await page.click('#play');
    // Software WebGL (SwiftShader) can take a few seconds to draw the first
    // frames of the heavier exhibits, so poll rather than sample once.
    let advanced = false;
    for (let waited = 0; waited < 5000 && !advanced; waited += 250) {
      await wait(250);
      advanced = (await time()) > t0;
    }
    checks.playAdvances = (await page.locator('#play').innerText()) === 'Pause' && advanced;
    await page.click('#play');
    const pausedAt = await time();
    const pausedOutputs = await outputs();
    await wait(800);
    checks.pauseHolds = (await time()) === pausedAt && (await outputs()) === pausedOutputs;

    const max = project.simulation.cycleDuration;
    await seek(page, max * 0.3);
    const first = await outputs();
    checks.seekHoldsTarget = Math.abs((await time()) - max * 0.3) < 0.02;
    const states = new Set<string>();
    let previous = await settledHash(page);
    for (const f of [0.1, 0.25, 0.4, 0.55, 0.85]) {
      await seek(page, max * f);
      previous = await changedHash(page, previous, 4000);
      states.add(`${await outputs()}|${previous}`);
    }
    await seek(page, max * 0.3);
    checks.seekDeterministic = (await outputs()) === first;
    checks.seekChangesState = states.size > 1;

    const assembled = await settledHash(page);
    await page.locator('#explosion').evaluate((el: HTMLInputElement) => {
      el.value = '1';
      el.dispatchEvent(new Event('input'));
    });
    checks.explosionMovesParts = (await changedHash(page, assembled)) !== assembled;
    if (shotsDir) await page.screenshot({ path: join(shotsDir, `${project.id}-exploded.png`) });
    await page.locator('#explosion').evaluate((el: HTMLInputElement) => {
      el.value = '0';
      el.dispatchEvent(new Event('input'));
    });
    await settledHash(page);

    const slider = page.locator('#parameters input[type=range]').first();
    if (await slider.count()) {
      const before = await outputs();
      await slider.evaluate((el: HTMLInputElement) => {
        el.value = el.max;
        el.dispatchEvent(new Event('input'));
      });
      await wait(400);
      checks.parameterChangesOutputs = (await outputs()) !== before;
    }

    const box = (await page.locator('#viewport').boundingBox())!;
    let picked = false;
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.5, 0.4],
      [0.45, 0.55],
      [0.55, 0.45],
      [0.5, 0.6],
    ]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await wait(300);
      if (!(await page.locator('#part').innerText()).startsWith('Select a component')) {
        picked = true;
        break;
      }
    }
    checks.selection = picked;
    checks.injectionInert &&= (await page.evaluate(() => (window as { __pwned?: number }).__pwned)) === undefined;
  }

  const expected = (e: string) => !webgl && /WebGL context could not be created|Error creating WebGL context/.test(e);
  checks.noNetwork = requests.length === 0;
  checks.noErrors = errors.filter((e) => !expected(e)).length === 0;
  await context.close();
  return checks;
}

const sdk = new DecoderSDK();
const dir = mkdtempSync(join(tmpdir(), 'decoder-exports-'));
const executablePath = process.env.CHROMIUM_PATH || undefined;
let failures = 0;

try {
  const files = [...BUILTIN_EXHIBITS, hostileProject()].map((project) => {
    const file = join(dir, `${project.id}.html`);
    writeFileSync(file, sdk.exportFormat(project, 'html'));
    return file;
  });

  const report = (file: string, webgl: boolean, checks: Record<string, boolean>) => {
    const failed = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    if (failed.length) failures++;
    const name = file.split(/[\\/]/).pop()!.padEnd(26);
    console.log(`${failed.length ? 'FAIL' : 'PASS'} ${name}${webgl ? '' : ' (no WebGL)'} ${failed.join(', ')}`);
  };

  const gpu = await chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const file of files) report(file, true, await verify(gpu, file, true));
  await gpu.close();

  const noGl = await chromium.launch({ executablePath, args: ['--disable-webgl', '--disable-3d-apis'] });
  for (const file of files.slice(0, 2)) report(file, false, await verify(noGl, file, false));
  await noGl.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `${failures} export check(s) failed` : 'All standalone exports verified offline.');
process.exit(failures ? 1 : 0);
