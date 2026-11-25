import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, FileCode, Package, X } from 'lucide-react';
import {
  exportGLTF,
  exportOBJ,
  exportSTEP,
  exportSTL,
  exportSVG,
  packageStandaloneHtml,
  triggerBlobDownload,
  validateExportedGLB,
} from '../engine/exporters';
import { GeometryKernel, computeSceneDiagnostics } from '../engine/geometry';
import type { DecoderViewport } from '../engine/renderer';
import type { DecoderProject } from '../engine/types';
import { exhibitTitle } from './ui/labels';

interface ExportModalProps {
  project: DecoderProject;
  viewport: DecoderViewport | null;
  onClose: () => void;
}

export function ExportModal({ project, viewport, onClose }: ExportModalProps) {
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const diagnostics = useMemo(() => {
    const kernel = new GeometryKernel();
    const d = computeSceneDiagnostics(project, kernel);
    kernel.dispose();
    return d;
  }, [project]);

  const handleExport = async (kind: 'json' | 'html' | 'glb' | 'gltf' | 'obj' | 'stl' | 'svg' | 'png' | 'step') => {
    setBusy(true);
    setStatus(null);
    const setStatusMsg = (message: string) => setStatus({ tone: 'ok', message });
    const kernel = new GeometryKernel();
    try {
      if (kind === 'json') {
        triggerBlobDownload(JSON.stringify(project, null, 2), `${project.id}.decoder.json`, 'application/json');
        setStatusMsg('Saved the source file.');
      } else if (kind === 'html') {
        const html = packageStandaloneHtml(project, kernel);
        triggerBlobDownload(html, `${project.id}-exhibit.html`, 'text/html;charset=utf-8');
        setStatusMsg('Saved the standalone page.');
      } else if (kind === 'glb') {
        const buf = (await exportGLTF(project, kernel, true)) as ArrayBuffer;
        const check = await validateExportedGLB(buf);
        triggerBlobDownload(buf, `${project.id}.glb`, 'model/gltf-binary');
        setStatusMsg(
          `Saved a ${Math.round(buf.byteLength / 1024)} KB GLB and checked it opens again (${check.meshCount} meshes).`,
        );
      } else if (kind === 'gltf') {
        const json = await exportGLTF(project, kernel, false);
        triggerBlobDownload(JSON.stringify(json, null, 2), `${project.id}.gltf`, 'model/gltf+json');
        setStatusMsg('Saved the glTF file.');
      } else if (kind === 'obj') {
        const obj = exportOBJ(project, kernel);
        triggerBlobDownload(obj, `${project.id}.obj`, 'text/plain');
        setStatusMsg('Saved the OBJ file.');
      } else if (kind === 'stl') {
        const stl = exportSTL(project, kernel);
        triggerBlobDownload(stl, `${project.id}.stl`, 'model/stl');
        setStatusMsg('Saved the STL file.');
      } else if (kind === 'svg') {
        const svg = exportSVG(project, kernel, 'patent', 0.25);
        triggerBlobDownload(svg, `${project.id}-patent.svg`, 'image/svg+xml');
        setStatusMsg('Saved the SVG drawing.');
      } else if (kind === 'step') {
        const stp = exportSTEP(project, kernel);
        triggerBlobDownload(stp, `${project.id}.stp`, 'application/step');
        setStatusMsg('Saved the STEP file (faceted shells).');
      } else if (kind === 'png') {
        if (!viewport) {
          setStatus({ tone: 'error', message: 'A PNG needs the 3D view, which is not running here.' });
        } else {
          const dataUrl = viewport.capturePngDataUrl();
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `${project.id}.png`;
          a.click();
          setStatusMsg('Saved a PNG of this view.');
        }
      }
    } catch (err) {
      setStatus({ tone: 'error', message: `That export failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      kernel.dispose();
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stats = [
    { label: 'Meshes', value: diagnostics.meshCount.toLocaleString() },
    { label: 'Triangles', value: diagnostics.triangleCount.toLocaleString() },
    { label: 'Geometry', value: `${diagnostics.estimatedMemoryKB} KB` },
    { label: 'Draw calls', value: diagnostics.drawCallsEstimate.toLocaleString() },
  ];

  return (
    <div
      role="dialog"
      aria-label="Export"
      className="fixed inset-0 z-50 bg-chrome/80 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="dc-popover dc-anim-pop w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-ink/8">
          <div className="flex-1">
            <div className="dc-label">Export</div>
            <h2 className="mt-1 text-[20px] font-bold leading-[1.15] tracking-[-0.03em] text-ink">
              Take the {exhibitTitle(project).toLowerCase()} with you.
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export" className="dc-btn w-9 h-9 justify-center">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-ink/12">
            {stats.map((s, i) => (
              <div key={s.label} className={`pt-3 pr-3 ${i > 0 ? 'sm:pl-3 sm:border-l border-ink/12' : ''}`}>
                <div className="dc-label">{s.label}</div>
                <div className="mt-1 font-mono text-[18px] text-ink tracking-[-0.02em] tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(
              [
                {
                  id: 'html',
                  icon: Package,
                  title: 'Standalone page (.html)',
                  body: 'One file that opens offline: the 3D exhibit, its controls and a drawn fallback.',
                },
                {
                  id: 'json',
                  icon: FileCode,
                  title: 'Source file (.decoder.json)',
                  body: 'Every part, link, behaviour and source, ready to open in the Studio again.',
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => handleExport(item.id)}
                className="flex items-start gap-3 p-4 text-left rounded-xl border border-ink/18 hover:border-ink/28 hover:bg-ink/5 transition-colors disabled:opacity-40"
              >
                <item.icon size={18} strokeWidth={1.5} className="text-ink mt-0.5 shrink-0" />
                <span>
                  <span className="block text-ink font-medium">{item.title}</span>
                  <span className="block text-[13px] text-ink/60 mt-0.5">{item.body}</span>
                </span>
              </button>
            ))}
          </div>

          <div>
            <div className="dc-label mb-2">3D files and images</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {[
                { id: 'glb' as const, label: 'GLB, checked' },
                { id: 'gltf' as const, label: 'glTF' },
                { id: 'obj' as const, label: 'OBJ' },
                { id: 'stl' as const, label: 'STL for printing' },
                { id: 'step' as const, label: 'STEP (faceted)' },
                { id: 'svg' as const, label: 'SVG drawing' },
                { id: 'png' as const, label: 'PNG of this view' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleExport(item.id)}
                  className="dc-btn dc-btn-outline h-10 px-3.5 justify-between"
                >
                  <span className="truncate">{item.label}</span>
                  <Download size={16} strokeWidth={1.5} className="shrink-0" />
                </button>
              ))}
            </div>
            <p className="text-[12px] text-ink/50 mt-2.5">
              STEP files hold faceted shells made from the mesh, not smooth CAD surfaces.
            </p>
          </div>

          {status && (
            <div
              role={status.tone === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2.5 text-[13px] px-3.5 py-3 rounded-r-lg bg-ink/3 border-l-2 ${
                status.tone === 'error' ? 'border-danger text-ink' : 'border-ink/28 text-ink/72'
              }`}
            >
              {status.tone === 'error' ? (
                <AlertTriangle size={16} strokeWidth={1.5} className="shrink-0 mt-0.5 text-danger" />
              ) : (
                <Check size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
              )}
              <span>{status.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
