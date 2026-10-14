import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

const MOVE_THRESHOLD_PX = 5;
const DBL_CLICK_MS = 350;
const DBL_CLICK_DIST_PX = 10;

const clientPoint = (event) => {
  if (event.touches && event.touches[0]) return event.touches[0];
  if (event.changedTouches && event.changedTouches[0]) return event.changedTouches[0];
  return event;
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Managed SVG graph host with destroy/recreate lifecycle and classified gestures:
 * - wheel zoom (non-passive; blocks page scroll)
 * - pan (drag empty space past a movement threshold)
 * - marquee select (Shift+drag empty space)
 * - double-click add (custom detector; ignored after drag/pan/marquee)
 */
const GraphCanvas = forwardRef(function GraphCanvas(
  {
    canvasKey = 0,
    width = 820,
    height = 520,
    enableZoomPan = false,
    enableMarquee = false,
    minZoom = 0.3,
    maxZoom = 4,
    cursor,
    className = '',
    tipLeft,
    tipRight,
    onBackgroundDoubleClick,
    onBackgroundClick,
    onMarqueeSelect,
    onZoomChange,
    children,
  },
  ref,
) {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [marquee, setMarquee] = useState(null); // { x1, y1, x2, y2 } in SVG space

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  const gestureRef = useRef(null);
  const lastClickRef = useRef(null); // { t, x, y } client coords for custom dblclick

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onBgDblClickRef = useRef(onBackgroundDoubleClick);
  onBgDblClickRef.current = onBackgroundDoubleClick;
  const onBgClickRef = useRef(onBackgroundClick);
  onBgClickRef.current = onBackgroundClick;
  const onMarqueeSelectRef = useRef(onMarqueeSelect);
  onMarqueeSelectRef.current = onMarqueeSelect;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    setMarquee(null);
    gestureRef.current = null;
    lastClickRef.current = null;
  }, []);

  useEffect(() => {
    resetView();
  }, [canvasKey, resetView]);

  useEffect(() => {
    onZoomChangeRef.current?.(zoom);
  }, [zoom]);

  const screenToViewBox = useCallback(
    (clientX, clientY) => {
      const el = svgRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const mx = (clientX - rect.left) * scaleX;
      const my = (clientY - rect.top) * scaleY;
      if (!enableZoomPan) return { x: mx, y: my };
      const z = zoomRef.current;
      const p = panRef.current;
      const cX = width / 2;
      const cY = height / 2;
      return {
        x: (mx - p.x - cX) / z + cX,
        y: (my - p.y - cY) / z + cY,
      };
    },
    [width, height, enableZoomPan],
  );

  const getSvgPoint = useCallback(
    (event) => {
      const source = clientPoint(event);
      if (!source) return null;
      return screenToViewBox(source.clientX, source.clientY);
    },
    [screenToViewBox],
  );

  useImperativeHandle(
    ref,
    () => ({
      getSvgElement: () => svgRef.current,
      getSvgPoint,
      getZoom: () => zoomRef.current,
      getPan: () => ({ ...panRef.current }),
      resetView,
    }),
    [getSvgPoint, resetView],
  );

  // Wheel on wrapper (covers overflow area) + SVG; non-passive blocks page scroll.
  useEffect(() => {
    if (!enableZoomPan) return undefined;
    const targets = [wrapperRef.current, svgRef.current].filter(Boolean);
    if (targets.length === 0) return undefined;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setZoom((z) =>
        Math.max(minZoom, Math.min(maxZoom, z + (e.deltaY > 0 ? -0.1 : 0.1))),
      );
    };

    targets.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => {
      targets.forEach((el) => el.removeEventListener('wheel', onWheel));
    };
  }, [canvasKey, enableZoomPan, minZoom, maxZoom]);

  // Background gesture: pan / marquee / click / double-click
  useEffect(() => {
    const onMove = (e) => {
      const g = gestureRef.current;
      if (!g) return;
      const src = clientPoint(e);
      if (!src) return;
      if (e.cancelable && e.touches) e.preventDefault();

      const client = { x: src.clientX, y: src.clientY };
      const moved = dist(client, g.startClient) >= MOVE_THRESHOLD_PX;

      if (!g.active) {
        if (!moved) return;
        g.active = true;
        g.mode = g.shift && enableMarquee ? 'marquee' : enableZoomPan ? 'pan' : null;
        if (g.mode === 'pan') setIsPanning(true);
        if (g.mode === 'marquee') {
          const pt = screenToViewBox(src.clientX, src.clientY);
          if (pt) setMarquee({ x1: g.startSvg.x, y1: g.startSvg.y, x2: pt.x, y2: pt.y });
        }
      }

      if (g.mode === 'pan') {
        setPan((p) => ({
          x: p.x + src.clientX - g.lastClient.x,
          y: p.y + src.clientY - g.lastClient.y,
        }));
        g.lastClient = client;
      } else if (g.mode === 'marquee') {
        const pt = screenToViewBox(src.clientX, src.clientY);
        if (pt) setMarquee({ x1: g.startSvg.x, y1: g.startSvg.y, x2: pt.x, y2: pt.y });
      }
    };

    const onUp = (e) => {
      const g = gestureRef.current;
      if (!g) return;
      gestureRef.current = null;

      const src = clientPoint(e) || g.lastClient;
      const client = { x: src.clientX ?? g.lastClient.x, y: src.clientY ?? g.lastClient.y };
      const wasActive = g.active;
      const mode = g.mode;

      setIsPanning(false);

      if (mode === 'marquee') {
        const endPt = screenToViewBox(client.x, client.y) || g.startSvg;
        const rect = {
          x1: Math.min(g.startSvg.x, endPt.x),
          y1: Math.min(g.startSvg.y, endPt.y),
          x2: Math.max(g.startSvg.x, endPt.x),
          y2: Math.max(g.startSvg.y, endPt.y),
        };
        setMarquee(null);
        onMarqueeSelectRef.current?.(rect, { additive: true });
        lastClickRef.current = null;
        return;
      }

      if (wasActive && mode === 'pan') {
        lastClickRef.current = null;
        return;
      }

      // Idle click on background: clear selection + custom double-click detect.
      onBgClickRef.current?.();

      const now = Date.now();
      const prev = lastClickRef.current;
      if (
        prev &&
        now - prev.t <= DBL_CLICK_MS &&
        dist(client, prev) <= DBL_CLICK_DIST_PX
      ) {
        lastClickRef.current = null;
        const pt = screenToViewBox(client.x, client.y);
        if (pt) onBgDblClickRef.current?.(pt, e);
      } else {
        lastClickRef.current = { t: now, x: client.x, y: client.y };
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [canvasKey, enableZoomPan, enableMarquee, screenToViewBox]);

  const onSvgPointerDown = (e) => {
    if (e.target.closest('g[data-node="true"]')) return;
    // Ignore non-primary mouse buttons
    if (e.button != null && e.button !== 0) return;

    const src = clientPoint(e);
    if (!src) return;
    const svgPt = screenToViewBox(src.clientX, src.clientY);
    if (!svgPt) return;

    const shift = !!(e.shiftKey || (e.touches && e.touches.length > 1));
    gestureRef.current = {
      startClient: { x: src.clientX, y: src.clientY },
      lastClient: { x: src.clientX, y: src.clientY },
      startSvg: svgPt,
      shift,
      active: false,
      mode: null,
    };
  };

  const busy = isPanning || !!marquee;
  const resolvedCursor =
    cursor ||
    (marquee
      ? 'crosshair'
      : enableZoomPan
        ? isPanning
          ? 'grabbing'
          : 'grab'
        : 'default');

  const svgStyle = enableZoomPan
    ? {
        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
        transformOrigin: 'center',
        transition: busy ? 'none' : 'transform 0.15s ease-out',
        cursor: resolvedCursor,
      }
    : { cursor: resolvedCursor };

  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.x1, marquee.x2),
        y: Math.min(marquee.y1, marquee.y2),
        w: Math.abs(marquee.x2 - marquee.x1),
        h: Math.abs(marquee.y2 - marquee.y1),
      }
    : null;

  return (
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800 ${className}`}
    >
      <svg
        key={canvasKey}
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block touch-none select-none"
        style={svgStyle}
        onMouseDown={onSvgPointerDown}
        onTouchStart={onSvgPointerDown}
      >
        {typeof children === 'function'
          ? children({ getSvgPoint, zoom, pan, svgRef })
          : children}

        {marqueeRect && (
          <rect
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.w}
            height={marqueeRect.h}
            fill="rgba(99, 102, 241, 0.15)"
            stroke="#818cf8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
      </svg>

      {(tipLeft || tipRight || enableZoomPan) && (
        <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px] text-slate-400 pointer-events-none">
          <span>{tipLeft || ''}</span>
          <span>
            {tipRight ||
              (enableZoomPan ? `Scroll to zoom · Drag to pan · ${zoom.toFixed(1)}x` : '')}
          </span>
        </div>
      )}
    </div>
  );
});

export default GraphCanvas;
