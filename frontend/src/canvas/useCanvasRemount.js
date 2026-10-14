import { useCallback, useState } from 'react';

/**
 * Bump `canvasKey` to force GraphCanvas to destroy its SVG and create a fresh one.
 * Call `remountCanvas()` on page resets, preset loads, or any full view rebuild.
 */
export default function useCanvasRemount(initial = 0) {
  const [canvasKey, setCanvasKey] = useState(initial);
  const remountCanvas = useCallback(() => {
    setCanvasKey((k) => k + 1);
  }, []);
  return { canvasKey, remountCanvas };
}
