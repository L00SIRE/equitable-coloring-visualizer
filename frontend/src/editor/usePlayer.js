import { useCallback, useEffect, useMemo, useState } from 'react';

export const SPEEDS = [
  { label: '0.5×', ms: 1800 },
  { label: '1×', ms: 900 },
  { label: '2×', ms: 450 },
  { label: '4×', ms: 220 },
  { label: '8×', ms: 100 },
];

/** Step playback over a list of steps. `index` is -1 when no run is loaded. */
export default function usePlayer(steps) {
  const count = steps ? steps.length : 0;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  /* A new run (new steps array) starts at the first step, paused. */
  useEffect(() => { setIndex(0); setPlaying(false); }, [steps]);

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= count - 1) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, count - 1)), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, index, count, speed]);

  const goto = useCallback((i) => { setPlaying(false); setIndex(Math.max(0, Math.min(count - 1, i))); }, [count]);
  const next = useCallback(() => { setPlaying(false); setIndex((i) => Math.min(i + 1, count - 1)); }, [count]);
  const prev = useCallback(() => { setPlaying(false); setIndex((i) => Math.max(i - 1, 0)); }, []);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && index >= count - 1) { setIndex(0); return true; }
      return !p;
    });
  }, [index, count]);

  return useMemo(() => ({
    index, count, playing, speed, setSpeed, goto, next, prev, toggle,
    first: () => goto(0), lastStep: () => goto(count - 1),
    atStart: index <= 0, atEnd: index >= count - 1,
    step: count ? steps[Math.min(index, count - 1)] : null,
  }), [index, count, playing, speed, goto, next, prev, toggle, steps]);
}
