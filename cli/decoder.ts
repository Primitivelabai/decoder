#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DecoderSDK } from '../src/sdk/index';
import type { DecoderProject, IllustrationAesthetic } from '../src/engine/types';

function readProject(filePath: string): DecoderProject {
  const abs = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(abs, 'utf8')) as DecoderProject;
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const sdk = new DecoderSDK();

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(
      [
        'Decoder CLI — Universal System Visualisation Engine',
        '',
        'Commands:',
        '  decoder init <out.decoder.json> [title]       Create a valid starter .decoder.json project',
        '  decoder validate <file.decoder.json>          Run schema, expression, spatial & evidence checks',
        '  decoder inspect <file.decoder.json>           Print scene diagnostics, bounds, and disassembly plan',
        '  decoder render <file.decoder.json> [out.svg]  Generate publication-grade technical illustration SVG',
        '  decoder export <file.decoder.json> <fmt>      Export svg | obj | stl | step | json',
        '  decoder package <file.decoder.json> [out.html] Package standalone interactive HTML exhibit',
        '  decoder preview <file.decoder.json>           Simulate 1 cycle & output state table',
        '  decoder test <file.decoder.json>              Run full verification suite on project',
      ].join('\n'),
    );
    process.exit(0);
  }

  try {
    if (cmd === 'init') {
      const outFile = args[1] ?? 'project.decoder.json';
      const title = args[2] ?? 'Untitled System Exhibit';
      const id = path
        .basename(outFile, '.decoder.json')
        .replace(/[^a-z0-9_]/gi, '_')
        .toLowerCase();
      const proj = sdk.initProject(id || 'custom_exhibit', title);
      fs.writeFileSync(path.resolve(process.cwd(), outFile), JSON.stringify(proj, null, 2));
      console.log(JSON.stringify({ ok: true, file: outFile, id: proj.id }));
      return;
    }

    const fileArg = args[1];
    if (!fileArg) {
      console.error('Error: missing <file.decoder.json> argument');
      process.exit(1);
    }
    const project = readProject(fileArg);

    if (cmd === 'validate') {
      const report = sdk.validate(project);
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.valid ? 0 : 2);
    }

    const validation = sdk.validate(project);
    if (!validation.valid) {
      console.error(JSON.stringify(validation, null, 2));
      process.exitCode = 2;
      return;
    }

    if (cmd === 'inspect') {
      const info = sdk.inspect(project);
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    if (cmd === 'render') {
      const outPath = args[2] ?? `${project.id}.svg`;
      const aesthetic = (args[3] as IllustrationAesthetic | undefined) ?? 'patent';
      const svg = sdk.renderIllustrationSVG(project, {
        aesthetic,
        projection: 'axonometric',
        explosion: 0.25,
        showCallouts: true,
        showPartsList: true,
      });
      fs.writeFileSync(path.resolve(process.cwd(), outPath), svg, 'utf8');
      console.log(JSON.stringify({ ok: true, file: outPath, bytes: svg.length }));
      return;
    }

    if (cmd === 'export') {
      const fmt = (args[2] ?? 'svg') as 'json' | 'svg' | 'obj' | 'stl' | 'step' | 'html';
      const ext = fmt === 'json' ? 'decoder.json' : fmt;
      const outPath = args[3] ?? `${project.id}.${ext}`;
      const out = sdk.exportFormat(project, fmt);
      fs.writeFileSync(path.resolve(process.cwd(), outPath), out, 'utf8');
      console.log(JSON.stringify({ ok: true, format: fmt, file: outPath, bytes: out.length }));
      return;
    }

    if (cmd === 'package') {
      const outPath = args[2] ?? `${project.id}.html`;
      const html = sdk.exportFormat(project, 'html');
      fs.writeFileSync(path.resolve(process.cwd(), outPath), html, 'utf8');
      console.log(JSON.stringify({ ok: true, file: outPath, bytes: html.length }));
      return;
    }

    if (cmd === 'preview') {
      const samples = [0, 0.25, 0.5, 0.75].map((frac) => {
        const t = frac * project.simulation.cycleDuration;
        const st = sdk.simulateStep(project, t);
        return { time: t, cycleAngleDeg: st.cycleAngleDeg, outputs: st.outputs };
      });
      console.log(JSON.stringify({ id: project.id, samples }, null, 2));
      return;
    }

    if (cmd === 'test') {
      const report = sdk.validate(project);
      const info = sdk.inspect(project);
      const st = sdk.simulateStep(project, project.simulation.cycleDuration * 0.5);
      const svg = sdk.exportFormat(project, 'svg');
      const html = sdk.exportFormat(project, 'html');
      const ok =
        report.valid &&
        info.diagnostics.triangleCount > 0 &&
        svg.includes('<svg') &&
        html.includes('decoder-project-data');
      console.log(
        JSON.stringify(
          {
            ok,
            valid: report.valid,
            errors: report.errorCount,
            warnings: report.warningCount,
            triangles: info.diagnostics.triangleCount,
            outputsAtHalfCycle: st.outputs,
            svgBytes: svg.length,
            htmlBytes: html.length,
          },
          null,
          2,
        ),
      );
      process.exit(ok ? 0 : 2);
    }

    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  } finally {
    sdk.dispose();
  }
}

main();
