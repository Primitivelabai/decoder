import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DecoderViewport } from '../../engine/renderer';

const DURATION = 420;
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

export function useIsWide(query = '(min-width: 768px)'): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setWide(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return wide;
}

export interface ViewInsets {
  left: number;
  right: number;
}

const lerp = (a: ViewInsets, b: ViewInsets, t: number): ViewInsets => ({
  left: a.left + (b.left - a.left) * t,
  right: a.right + (b.right - a.right) * t,
});

/** Slides and scales the viewport's frame so the model fits in the space the overlays leave free. */
export function useViewInset(viewportRef: RefObject<DecoderViewport | null>, left: number, right: number): void {
  const current = useRef<ViewInsets>({ left: 0, right: 0 });
  useEffect(() => {
    const target = { left, right };
    const from = current.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instant = reduce || (from.left === left && from.right === right);
    const start = performance.now();
    let frame = 0;
    // The viewport can mount a few frames after this runs, so keep stepping until it has the insets.
    const step = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / DURATION);
      current.current = t >= 1 ? target : lerp(from, target, ease(t));
      const vp = viewportRef.current;
      vp?.setViewInset(current.current);
      if (t < 1 || (!vp && now - start < 5000)) frame = requestAnimationFrame(step);
    };
    step(start);
    return () => cancelAnimationFrame(frame);
  }, [viewportRef, left, right]);

  useEffect(
    () => () => {
      viewportRef.current?.setViewInset({ left: 0, right: 0 });
    },
    [viewportRef],
  );
}
