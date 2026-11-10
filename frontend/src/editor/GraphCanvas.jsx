import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import { keyOf } from '../graph/model';
import { NODE_RADIUS as R } from '../graph/layout';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const css = (name, alpha) => (alpha == null ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${alpha})`);

/* ── edge geometry in world space ── */
function edgeShape(p, q, directed, curved) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (!curved) {
    const x1 = p.x + ux * R, y1 = p.y + uy * R, x2 = q.x - ux * (R + 1), y2 = q.y - uy * (R + 1);
    return { d: `M${x1} ${y1}L${x2} ${y2}`, end: { x: x2, y: y2 }, dir: { x: ux, y: uy }, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  }
  const off = Math.min(34, len * 0.2);
  const cx = (p.x + q.x) / 2 - uy * off, cy = (p.y + q.y) / 2 + ux * off;
  const sx = cx - p.x, sy = cy - p.y, sl = Math.hypot(sx, sy) || 1;
  const ex = q.x - cx, ey = q.y - cy, el = Math.hypot(ex, ey) || 1;
  const x1 = p.x + (sx / sl) * R, y1 = p.y + (sy / sl) * R;
  const x2 = q.x - (ex / el) * (R + 1), y2 = q.y - (ey / el) * (R + 1);
  return {
    d: `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`,
    end: { x: x2, y: y2 }, dir: { x: ex / el, y: ey / el },
    mid: { x: 0.25 * x1 + 0.5 * cx + 0.25 * x2, y: 0.25 * y1 + 0.5 * cy + 0.25 * y2 },
  };
}

const arrowPath = (end, dir, size = 11) => {
  const bx = end.x - dir.x * size, by = end.y - dir.y * size;
  const nx = -dir.y * (size * 0.45), ny = dir.x * (size * 0.45);
  return `M${end.x} ${end.y}L${bx + nx} ${by + ny}L${bx - nx} ${by - ny}Z`;
};

/**
 * The drawing surface. World coordinates are unbounded; `view` maps them to the
 * screen (screen = world × k + (x, y)). Zoom is about the cursor.
 *
 * Gestures
 *   wheel / pinch      zoom           drag empty space   marquee (select tool) or pan
 *   Hand tool, middle button, touch   pan
 *   Vertex tool        click empty space to add
 *   Edge tool          drag from a vertex to another, or click one then the other
 *   Select tool        click / shift-click / drag vertices, click an edge
 *
 * `locked` freezes the graph structure (while an algorithm run is loaded).
 * Vertices can still be dragged and the view still moves.
 */
const GraphCanvas = forwardRef(function GraphCanvas(
  { editor, visuals, locked = false, extraPoints, onZoom, className = '' },
  ref,
) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState({ x: 0, y: 0, k: 1 });
  const [marquee, setMarquee] = useState(null);
  const [rubber, setRubber] = useState(null);           // { from, x, y } in world space
  const [pendingFrom, setPendingFrom] = useState(null); // edge tool: first vertex of a click-click edge
  const [panning, setPanning] = useState(false);

  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const editorRef = useRef(editor);
  const lockedRef = useRef(locked);
  const extraRef = useRef(extraPoints);
  const onZoomRef = useRef(onZoom);
  const pendingRef = useRef(null);
  const fittedRef = useRef(false);
  const touchedRef = useRef(false); // the user moved the view, so resizes must not refit
  editorRef.current = editor;
  lockedRef.current = locked;
  extraRef.current = extraPoints;
  onZoomRef.current = onZoom;
  pendingRef.current = pendingFrom;
  sizeRef.current = size;

  const setView = useCallback((v, byUser = true) => {
    viewRef.current = v;
    touchedRef.current = byUser;
    setViewState(v);
    onZoomRef.current?.(v.k);
  }, []);

  /* ── view helpers ── */
  const toWorld = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  }, []);

  const zoomAt = useCallback((sx, sy, factor) => {
    const v = viewRef.current;
    const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
    const r = k / v.k;
    setView({ k, x: sx - (sx - v.x) * r, y: sy - (sy - v.y) * r });
  }, [setView]);

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const pts = [...editorRef.current.graph.nodes, ...(extraRef.current || [])];
    if (!pts.length) { setView({ x: w / 2, y: h / 2, k: 1 }, false); return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - R, maxX = Math.max(...xs) + R, minY = Math.min(...ys) - R - 14, maxY = Math.max(...ys) + R + 20;
    // leave room for the toolbar (top) and the zoom controls (bottom), scaled to the canvas
    const padX = clamp(w * 0.08, 24, 56), padTop = clamp(h * 0.2, 60, 104), padBottom = clamp(h * 0.14, 48, 76);
    const availW = Math.max(80, w - 2 * padX), availH = Math.max(80, h - padTop - padBottom);
    const k = clamp(Math.min(availW / (maxX - minX), availH / (maxY - minY)), 0.15, 1.5);
    const cx = padX + availW / 2, cy = padTop + availH / 2;
    setView({ k, x: cx - ((minX + maxX) / 2) * k, y: cy - ((minY + maxY) / 2) * k }, false);
    fittedRef.current = true;
  }, [setView]);

  useImperativeHandle(ref, () => ({
    fit,
    zoomBy: (factor) => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, factor),
  }), [fit, zoomAt]);

  /* measure the container, fit once there is a size */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      sizeRef.current = { w, h };
      setSize({ w, h });
      if (w && h && (!fittedRef.current || !touchedRef.current)) fit();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useLayoutEffect(() => { fit(); }, [editor.fitVersion, fit]);

  /* wheel zoom: native listener so we can preventDefault (React's is passive) */
  useEffect(() => {
    const svg = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : 1;
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* ── pointer gestures ── */
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const nodeAt = useCallback((wx, wy) => {
    const nodes = editorRef.current.graph.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (Math.hypot(nodes[i].x - wx, nodes[i].y - wy) <= R + 4) return nodes[i];
    }
    return null;
  }, []);

  const endGesture = useCallback(() => {
    gesture.current = null;
    setMarquee(null);
    setRubber(null);
    setPanning(false);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!pointers.current.has(e.pointerId)) {
        // hover: keep the click-click rubber band attached to the cursor
        if (pendingRef.current != null && svgRef.current?.contains(e.target)) {
          const p = toWorld(e.clientX, e.clientY);
          setRubber({ from: pendingRef.current, x: p.x, y: p.y });
        }
        return;
      }
      const prev = pointers.current.get(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g) return;
      const ed = editorRef.current;

      if (g.mode === 'pinch') {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const rect = svgRef.current.getBoundingClientRect();
        const mx = (pts[0].x + pts[1].x) / 2 - rect.left, my = (pts[0].y + pts[1].y) / 2 - rect.top;
        const v = viewRef.current;
        const k = clamp(v.k * (dist / g.dist), MIN_ZOOM, MAX_ZOOM);
        const r = k / v.k;
        // keep the world point that was under the old midpoint under the new one
        setView({ k, x: mx - (g.mx - v.x) * r, y: my - (g.my - v.y) * r });
        g.dist = dist; g.mx = mx; g.my = my;
        return;
      }
      if (e.pointerId !== g.pointerId) return;

      const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!g.moved) {
        g.moved = true;
        if (g.mode === 'node') {
          ed.beginMove();
          const sel = ed.selection.nodes;
          const ids = sel.has(g.nodeId) ? [...sel] : [g.nodeId];
          g.origins = new Map(ids.map((id) => {
            const n = ed.graph.nodes.find((m) => m.id === id);
            return [id, { x: n.x, y: n.y }];
          }));
        }
        if (g.mode === 'pan') setPanning(true);
      }

      if (g.mode === 'pan') {
        const v = viewRef.current;
        setView({ ...v, x: v.x + (e.clientX - prev.x), y: v.y + (e.clientY - prev.y) });
      } else if (g.mode === 'marquee') {
        const p = toWorld(e.clientX, e.clientY);
        setMarquee({ x1: g.world.x, y1: g.world.y, x2: p.x, y2: p.y });
      } else if (g.mode === 'node') {
        const p = toWorld(e.clientX, e.clientY);
        const ddx = p.x - g.world.x, ddy = p.y - g.world.y;
        ed.moveNodes(new Map([...g.origins].map(([id, o]) => [id, { x: o.x + ddx, y: o.y + ddy }])));
      } else if (g.mode === 'edge') {
        const p = toWorld(e.clientX, e.clientY);
        setRubber({ from: g.nodeId, x: p.x, y: p.y });
      }
    };

    const onUp = (e) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      if (!g) return;
      if (g.mode === 'pinch') { if (pointers.current.size < 2) endGesture(); return; }
      if (e.pointerId !== g.pointerId) return;
      const ed = editorRef.current;
      const p = toWorld(e.clientX, e.clientY);

      if (g.mode === 'node') {
        if (!g.moved && !g.shift && ed.selection.nodes.size > 1) {
          ed.select({ nodes: new Set([g.nodeId]), edges: new Set() });
        }
      } else if (g.mode === 'edge') {
        const target = nodeAt(p.x, p.y);
        if (g.moved) {
          if (target && target.id !== g.nodeId) ed.addEdge(g.nodeId, target.id);
          setPendingFrom(null);
        } else if (pendingRef.current == null) {
          setPendingFrom(g.nodeId);
          setRubber({ from: g.nodeId, x: p.x, y: p.y });
          g.keepRubber = true;
        } else if (pendingRef.current !== g.nodeId) {
          ed.addEdge(pendingRef.current, g.nodeId);
          setPendingFrom(null);
        } else {
          setPendingFrom(null);
        }
      } else if (g.mode === 'marquee') {
        if (g.moved) {
          const x1 = Math.min(g.world.x, p.x), x2 = Math.max(g.world.x, p.x);
          const y1 = Math.min(g.world.y, p.y), y2 = Math.max(g.world.y, p.y);
          const hit = ed.graph.nodes.filter((n) => n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2).map((n) => n.id);
          const base = g.shift ? ed.selection.nodes : new Set();
          ed.select({ nodes: new Set([...base, ...hit]), edges: g.shift ? ed.selection.edges : new Set() });
        } else {
          if (!g.shift) ed.clearSelection();
          setPendingFrom(null);
        }
      } else if (g.mode === 'pan' && !g.moved) {
        // a click on empty space
        if (g.tool === 'vertex' && !lockedRef.current) ed.addNode(p.x, p.y);
        else if (g.tool === 'edge') setPendingFrom(null);
        else if (!g.shift) ed.clearSelection();
      } else if (g.mode === 'edgeclick' && !g.moved) {
        const sel = ed.selection;
        const edges = new Set(g.shift ? sel.edges : []);
        if (edges.has(g.edgeKey)) edges.delete(g.edgeKey); else edges.add(g.edgeKey);
        ed.select({ nodes: g.shift ? sel.nodes : new Set(), edges });
      }
      const keep = g.keepRubber;
      gesture.current = null;
      setMarquee(null);
      setPanning(false);
      if (!keep) setRubber(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [endGesture, nodeAt, setView, toWorld]);

  /* Esc cancels a half-drawn edge */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setPendingFrom(null); setRubber(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (editor.tool !== 'edge') { setPendingFrom(null); setRubber(null); } }, [editor.tool]);

  const onPointerDown = (e) => {
    if (e.button === 2) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const rect = svgRef.current.getBoundingClientRect();
      gesture.current = {
        mode: 'pinch',
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        mx: (pts[0].x + pts[1].x) / 2 - rect.left, my: (pts[0].y + pts[1].y) / 2 - rect.top,
      };
      setMarquee(null);
      return;
    }
    if (pointers.current.size > 2) return;

    const ed = editorRef.current;
    const nodeEl = e.target.closest('[data-node-id]');
    const edgeEl = e.target.closest('[data-edge-key]');
    const tool = e.button === 1 ? 'pan' : ed.tool;
    const world = toWorld(e.clientX, e.clientY);
    const isLocked = lockedRef.current;
    const g = {
      pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false,
      shift: e.shiftKey, tool, world,
    };

    if (tool === 'pan') {
      g.mode = 'pan';
    } else if (nodeEl) {
      const id = Number(nodeEl.getAttribute('data-node-id'));
      g.nodeId = id;
      if (tool === 'edge' && !isLocked) {
        g.mode = 'edge';
      } else {
        g.mode = 'node';
        const sel = ed.selection;
        if (e.shiftKey) {
          const nodes = new Set(sel.nodes);
          if (nodes.has(id)) nodes.delete(id); else nodes.add(id);
          ed.select({ nodes, edges: sel.edges });
        } else if (!sel.nodes.has(id)) {
          ed.select({ nodes: new Set([id]), edges: new Set() });
        }
      }
    } else if (edgeEl && tool !== 'vertex' && !isLocked) {
      g.mode = 'edgeclick';
      g.edgeKey = edgeEl.getAttribute('data-edge-key');
    } else if (tool === 'select' && !isLocked && e.pointerType === 'mouse') {
      g.mode = 'marquee';
    } else {
      g.mode = 'pan';
    }
    gesture.current = g;
  };

  /* ── drawing ── */
  const g = editor.graph;
  const pos = new Map(g.nodes.map((n) => [n.id, n]));
  const eVis = visuals?.edges ?? {};
  const nVis = visuals?.nodes ?? {};
  const directedKeys = new Set(g.edges.map((e) => `${e.a}>${e.b}`));
  const dimAll = !!visuals?.dim;

  const cursor = panning ? 'grabbing'
    : editor.tool === 'pan' ? 'grab'
    : editor.tool === 'select' ? 'default' : 'crosshair';

  const mq = marquee && {
    x: Math.min(marquee.x1, marquee.x2), y: Math.min(marquee.y1, marquee.y2),
    w: Math.abs(marquee.x2 - marquee.x1), h: Math.abs(marquee.y2 - marquee.y1),
  };
  const rubberFrom = rubber && pos.get(rubber.from);

  return (
    <div ref={wrapRef} className={`relative h-full w-full overflow-hidden bg-canvas ${className}`}>
      <svg
        ref={svgRef}
        className="graph-surface absolute inset-0 h-full w-full"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        role="application"
        aria-label="Graph canvas"
        data-testid="graph-canvas"
      >
        <defs>
          <pattern
            id="grid-dots" width={32 * view.k} height={32 * view.k}
            patternUnits="userSpaceOnUse" x={view.x} y={view.y}
          >
            <circle cx={1} cy={1} r={1} style={{ fill: css('grid') }} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`} data-testid="world">
          {/* edges */}
          {g.edges.map((e) => {
            const p = pos.get(e.a), q = pos.get(e.b);
            if (!p || !q) return null;
            const key = keyOf(e, g.directed);
            const v = eVis[key] ?? {};
            const curved = g.directed && directedKeys.has(`${e.b}>${e.a}`);
            const s = edgeShape(p, q, g.directed, curved);
            const selected = editor.selection.edges.has(key);
            const stroke = selected ? css('accent') : v.stroke ?? css('line-strong');
            const width = v.width ?? 2;
            return (
              <g key={key} opacity={v.opacity ?? (dimAll ? 0.5 : 1)}>
                <path d={s.d} fill="none" stroke="transparent" strokeWidth={16} data-edge-key={key} style={{ cursor: 'pointer' }} />
                {selected && <path d={s.d} fill="none" stroke={css('accent', 0.25)} strokeWidth={width + 7} strokeLinecap="round" />}
                <path d={s.d} fill="none" strokeLinecap="round" strokeDasharray={v.dash}
                  style={{ stroke, strokeWidth: width, transition: 'stroke 0.2s, stroke-width 0.2s' }} />
                {g.directed && <path d={arrowPath(s.end, s.dir)} style={{ fill: stroke }} />}
                {v.label != null && (
                  <g transform={`translate(${s.mid.x} ${s.mid.y})`}>
                    <rect x={-9} y={-9} width={18} height={18} rx={4} style={{ fill: css('surface'), stroke: stroke, strokeWidth: 1 }} />
                    <text textAnchor="middle" dy=".35em" fontSize={11} fontWeight={600} style={{ fill: css('ink') }}>{v.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {visuals?.overlay}

          {/* rubber band for the edge tool */}
          {rubberFrom && (
            <line x1={rubberFrom.x} y1={rubberFrom.y} x2={rubber.x} y2={rubber.y}
              strokeDasharray="6 5" strokeWidth={2} style={{ stroke: css('accent') }} pointerEvents="none" />
          )}

          {/* vertices */}
          {g.nodes.map((n) => {
            const v = nVis[n.id] ?? {};
            const selected = editor.selection.nodes.has(n.id);
            const isPending = pendingFrom === n.id;
            const fill = v.fill ?? css('surface');
            const bottom = v.bottom ?? n.label;
            return (
              <g key={n.id} data-node-id={n.id} transform={`translate(${n.x} ${n.y})`}
                opacity={v.opacity ?? (dimAll ? 0.5 : 1)} style={{ cursor: editor.tool === 'edge' && !locked ? 'crosshair' : editor.tool === 'pan' ? 'grab' : 'pointer' }}>
                {v.halo && <circle r={R + 8} fill="none" strokeWidth={3} opacity={0.55} style={{ stroke: v.halo }} />}
                {(selected || isPending) && <circle r={R + 5} fill="none" strokeWidth={2.5} style={{ stroke: css('accent') }} />}
                <circle r={R} strokeDasharray={v.dashed ? '4 3' : undefined}
                  style={{ fill, stroke: v.ring ?? css('line-strong'), strokeWidth: v.ringWidth ?? 2, transition: 'fill 0.25s, stroke 0.25s' }} />
                <text textAnchor="middle" dy=".35em" fontSize={13} fontWeight={600}
                  style={{ fill: v.text ?? css('ink') }}>{v.text2 ?? n.id}</text>
                {v.top != null && (
                  <text y={-R - 9} textAnchor="middle" fontSize={11} fontWeight={600}
                    style={{ fill: v.topColor ?? css('muted') }}>{v.top}</text>
                )}
                {bottom != null && (
                  <text y={R + 16} textAnchor="middle" fontSize={11}
                    style={{ fill: v.bottomColor ?? css('muted') }}>{bottom}</text>
                )}
              </g>
            );
          })}

          {mq && (
            <rect x={mq.x} y={mq.y} width={mq.w} height={mq.h} strokeDasharray="5 4"
              style={{ fill: css('accent', 0.1), stroke: css('accent'), strokeWidth: 1 / view.k }} pointerEvents="none" />
          )}
        </g>
      </svg>

      {g.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          <div>
            <p className="font-medium text-ink">The canvas is empty</p>
            <p className="mt-1">Pick the Vertex tool and click to place vertices, or load a preset from the Graph menu.</p>
          </div>
        </div>
      )}
    </div>
  );
});

export default GraphCanvas;
