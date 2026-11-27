/**
 * Capture matched standalone exhibit views and an engine disassembly video on a physical GPU.
 * Run `npm run bundle:standalone`, then `npx tsx scripts/capture-gpu-showcase.ts [output-directory]`.
 * Install Playwright Chromium and FFmpeg first, or use CHROMIUM_PATH for an installed Chromium.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import { BUILTIN_EXHIBITS } from '../src/projects/index';
import { DecoderSDK } from '../src/sdk/index';

const output = resolve(process.argv[2] ?? 'showcase-captures');
const exhibitIds = ['espresso_machine', 'mechanical_watch', 'four_stroke_engine'];
const fourStroke = 'four_stroke_engine';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadHardwareExhibit(page: Page, file: string): Promise<string> {
  await page.goto(pathToFileURL(file).href);
  const gpu = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#viewport canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return 'WebGL2 unavailable';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debug) return 'GPU identity unavailable';
    return String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  });
  if (
    !gpu.trim() ||
    /SwiftShader|llvmpipe|lavapipe|softpipe|software|basic render|unavailable/i.test(gpu) ||
    /^(ANGLE|WebKit WebGL|WebGL|unknown)$/i.test(gpu)
  ) {
    throw new Error(`A physical WebGL2 GPU is required. Chromium reported ${gpu}.`);
  }
  if (!(await page.locator('#play').isEnabled())) {
    throw new Error(await page.locator('#status').innerText());
  }
  return gpu;
}

async function updateSlider(page: Page, id: '#timeline' | '#explosion', value: number): Promise<void> {
  await page.locator(id).evaluate((input: HTMLInputElement, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input'));
  }, value);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  const sdk = new DecoderSDK();
  const tempDir = mkdtempSync(join(tmpdir(), 'decoder-gpu-shots-'));
  try {
    for (const id of exhibitIds) {
      const project = BUILTIN_EXHIBITS.find((exhibit) => exhibit.id === id);
      if (!project) throw new Error(`Missing built-in exhibit ${id}.`);
      const file = join(tempDir, `${id}.html`);
      writeFileSync(file, sdk.exportFormat(project, 'html'), 'utf8');
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        offline: true,
      });
      try {
        const page = await context.newPage();
        const gpu = await loadHardwareExhibit(page, file);
        console.log(`[${id}] ${gpu}`);
        mkdirSync(output, { recursive: true });
        await updateSlider(page, '#timeline', project.simulation.cycleDuration * 0.35);
        await wait(400);
        const viewport = page.locator('#viewport');
        await viewport.screenshot({ path: join(output, `${id}-assembled-gpu.png`) });
        await updateSlider(page, '#explosion', 0.62);
        await wait(1200);
        await viewport.screenshot({ path: join(output, `${id}-exploded-gpu.png`) });
      } finally {
        await context.close();
      }
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      offline: true,
      recordVideo: { dir: tempDir, size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();
    const video = page.video();
    try {
      await loadHardwareExhibit(page, join(tempDir, `${fourStroke}.html`));
      await page.click('#play');
      const steps = 90;
      for (let frame = 0; frame <= steps; frame++) {
        const phase = frame / steps;
        const explosion = Math.min(0.78, 0.44 * (1 - Math.cos(phase * Math.PI * 2)));
        await updateSlider(page, '#explosion', explosion);
        await wait(55);
      }
      await wait(700);
    } finally {
      await context.close();
    }
    if (!video) throw new Error('Browser video recording was unavailable.');
    await video.saveAs(join(output, `${fourStroke}-disassembly-gpu.webm`));
    console.log(`Saved GPU captures in ${output}`);
  } finally {
    await browser.close();
    sdk.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
