import { useEffect } from 'react';
import { X } from 'lucide-react';

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Pick a part',
    body: 'Click it in the 3D view or in the parts list on the left. The eye hides a part so you can see inside.',
  },
  {
    title: 'Shape it',
    body: 'Shape sets the name, place, form and material. Move (G), Rotate (R) and Scale (S) drag it in 3D; Select (V) goes back.',
  },
  {
    title: 'Make it move',
    body: 'Behaviour holds the inputs and the readings they drive. Scrub the timeline or change the speed at the bottom.',
  },
  {
    title: 'Follow cause and effect',
    body: 'Flows, next to Parts, links parts by force, heat, liquid, signal and control. Select a part to trace what it affects.',
  },
  {
    title: 'Back it up and tell the story',
    body: 'Evidence records how sure we are and where it came from. Tour is the steps the exhibit walks a viewer through.',
  },
  {
    title: 'Check and ship',
    body: 'The status in the tool row lists any problems. Save keeps it in this browser; Export writes the page, 3D files or the .decoder.json.',
  },
];

interface StudioGuideProps {
  onClose: () => void;
}

/** How the studio works. Opened from the help button; shown once on the first visit. */
export function StudioGuide({ onClose }: StudioGuideProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="How the studio works"
      className="dc-popover dc-anim-pop absolute top-3 left-3 z-20 w-[min(380px,calc(100%-24px))] max-h-[calc(100%-24px)] overflow-y-auto"
    >
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <div className="flex-1">
          <div className="dc-label">Help</div>
          <h2 className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ink">How the studio works</h2>
          <p className="mt-1.5 mb-0 text-[13px] text-ink/60">
            Everything here edits one <span className="font-mono text-ink/72">.decoder.json</span> file: the parts, how
            they move and why. Changes show in the 3D view straight away.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          className="dc-btn w-9 h-9 justify-center shrink-0"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
      <ol className="m-0 px-5 pb-5 list-none flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-px w-6 h-6 shrink-0 rounded-full border border-ink/18 grid place-items-center font-mono text-[11px] text-ink/60">
              {i + 1}
            </span>
            <div>
              <div className="text-ink">{step.title}</div>
              <p className="m-0 text-[13px] text-ink/60">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
