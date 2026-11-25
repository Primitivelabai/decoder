import { standaloneBundle } from '../generated/standalone';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { CadStepAdapter, GeometryKernel, createComponentMesh } from './geometry';
import { generateTechnicalIllustrationSVG } from './illustration';
import { MaterialLibrary } from './materials';
import type { DecoderProject, IllustrationAesthetic } from './types';

export type ExportFormat = 'decoder_json' | 'glb' | 'gltf' | 'obj' | 'stl' | 'svg' | 'step' | 'html' | 'png';

export function buildExportSceneGroup(project: DecoderProject, kernel: GeometryKernel): THREE.Group {
  const root = new THREE.Group();
  root.name = project.id;
  const matLib = new MaterialLibrary(true);
  const matMap = new Map(project.materials.map((m) => [m.id, m]));
  const nodeMap = new Map<string, THREE.Object3D>();

  for (const comp of project.components) {
    const matSpec = comp.materialId ? matMap.get(comp.materialId) : undefined;
    const mat = matLib.getMaterial(matSpec);
    const obj = createComponentMesh(comp, kernel, mat);
    obj.name = comp.id;
    if (comp.transform?.position) obj.position.set(...comp.transform.position);
    if (comp.transform?.rotation) obj.rotation.set(...comp.transform.rotation);
    if (comp.transform?.scale) obj.scale.set(...comp.transform.scale);
    nodeMap.set(comp.id, obj);
  }

  for (const comp of project.components) {
    const obj = nodeMap.get(comp.id)!;
    if (comp.parentId && nodeMap.has(comp.parentId)) {
      nodeMap.get(comp.parentId)!.add(obj);
    } else {
      root.add(obj);
    }
  }
  return root;
}

export async function exportGLTF(
  project: DecoderProject,
  kernel: GeometryKernel,
  binary: boolean,
): Promise<ArrayBuffer | Record<string, unknown>> {
  const group = buildExportSceneGroup(project, kernel);
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      group,
      (result) => resolve(result as ArrayBuffer | Record<string, unknown>),
      (err) => reject(err),
      { binary },
    );
  });
}

export async function validateExportedGLB(buffer: ArrayBuffer): Promise<{ valid: boolean; meshCount: number }> {
  const loader = new GLTFLoader();
  return new Promise((resolve) => {
    loader.parse(
      buffer,
      '',
      (gltf) => {
        let meshCount = 0;
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) meshCount++;
        });
        resolve({ valid: meshCount > 0, meshCount });
      },
      () => resolve({ valid: false, meshCount: 0 }),
    );
  });
}

export function exportOBJ(project: DecoderProject, kernel: GeometryKernel): string {
  const group = buildExportSceneGroup(project, kernel);
  const exporter = new OBJExporter();
  return exporter.parse(group);
}

export function exportSTL(project: DecoderProject, kernel: GeometryKernel): string {
  const group = buildExportSceneGroup(project, kernel);
  const exporter = new STLExporter();
  return exporter.parse(group, { binary: false }) as string;
}

export function exportSTEP(project: DecoderProject, kernel: GeometryKernel): string {
  return CadStepAdapter.exportFacetedStep(project, kernel);
}

export function exportSVG(
  project: DecoderProject,
  kernel: GeometryKernel,
  aesthetic: IllustrationAesthetic = 'patent',
  explosion = 0.25,
): string {
  return generateTechnicalIllustrationSVG(project, kernel, {
    aesthetic,
    projection: 'axonometric',
    explosion,
    showCallouts: true,
    showPartsList: true,
    showHatching: aesthetic === 'patent' || aesthetic === 'industrial_manual',
  });
}

export function packageStandaloneHtml(project: DecoderProject, kernel: GeometryKernel): string {
  if (!standaloneBundle) throw new Error('Standalone engine not bundled. Run npm run bundle:standalone.');
  const previewSvg = generateTechnicalIllustrationSVG(project, kernel, {
    aesthetic: 'technical_atlas',
    projection: 'axonometric',
    explosion: 0.22,
    width: 960,
    height: 620,
    showCallouts: true,
    showPartsList: true,
  });
  // Escape every HTML-significant character in untrusted project JSON; never inject it into executable JS.
  const serialized = JSON.stringify(project).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const title = project.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(previewSvg);
  const script = standaloneBundle.replace(/<\/script/gi, '<\\/script');
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${title} | primitive decoder</title>`,
    `<style>${STANDALONE_CSS}</style></head><body>`,
    '<header><strong><i class="pixel"></i>primitive / decoder</strong><span id="title"></span><span id="status" role="status"></span></header>',
    '<main><div id="viewport">',
    `<img id="fallback" src="${svgUrl}" alt="Technical illustration" hidden>`,
    '</div><aside>',
    '<h3>system outputs</h3><div id="outputs"></div>',
    '<h3>component</h3><div id="part">Select a component to inspect it.</div>',
    '<h3>parameters</h3><div id="parameters"></div>',
    '</aside></main>',
    '<footer><button id="play" disabled>Play</button>',
    '<label>Time <input id="timeline" type="range" min="0" step="0.01" value="0" disabled></label>',
    '<label>Explode <input id="explosion" type="range" min="0" max="1" step="0.01" value="0" disabled></label></footer>',
    `<script id="decoder-project-data" type="application/json">${serialized}</script>`,
    `<script>${script}</script></body></html>`,
  ].join('\n');
}

const STANDALONE_CSS = [
  '*{box-sizing:border-box}',
  'html,body{height:100%;margin:0;background:#101010;color:#f4f4f4;font:14px system-ui,sans-serif}',
  'body{display:flex;flex-direction:column}',
  'header,footer{padding:12px 16px;background:#171717;border-bottom:1px solid #333;display:flex;gap:16px;align-items:center;flex-wrap:wrap}',
  'main{flex:1;min-height:0;display:flex;position:relative}',
  '#viewport{flex:1;min-width:0;position:relative}',
  'aside{width:270px;overflow:auto;padding:16px;background:#171717;border-left:1px solid #333}',
  '#fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#101010}',
  '#fallback[hidden]{display:none}',
  'button{background:#ff4f9a;color:#111;border:0;padding:8px 14px;font-weight:700;cursor:pointer;border-radius:3px}',
  'input,select{accent-color:#ff4f9a;background:#222;color:#eee}',
  'label{display:block;margin:8px 0}',
  '#status{color:#aaa;font-size:12px}',
  '#outputs div{margin:6px 0;font:12px ui-monospace,monospace}',
  '.pixel{display:inline-block;width:9px;height:9px;background:#ff4f9a;margin-right:8px}',
  'strong{letter-spacing:-.03em}',
  '@media(max-width:650px){main{flex-direction:column}aside{width:100%;max-height:30vh}footer{gap:8px}}',
].join('');

export function triggerBlobDownload(content: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
