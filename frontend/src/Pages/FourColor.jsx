import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import GraphToolbar from '../Components/GraphToolbar';
import { createRandomGraph } from '../canvas/randomGraph';
import { buildGraphPayload, downloadGraphJson, toFromToEdges } from '../canvas/graphIO';
import { layoutPlanarAsPossible } from '../canvas/planarLayout';

const SVG_W = 800;
const SVG_H = 500;
const NODE_R = 22;

// Four distinct high-contrast colors
const FOUR = ['#EF4444', '#3B82F6', '#F59E0B', '#10B981'];
const FOUR_NAMES = ['Red', 'Blue', 'Yellow', 'Green'];

const PSEUDOCODE = [
  'input: planar graph G = (V, E)',
  'order vertices by heuristic (DSATUR / largest-first)',
  'for each vertex v in order:',
  '  used ← colors of neighbors already colored',
  '  assign smallest c ∈ {1,2,3,4} with c ∉ used',
  '  if no such c: backtrack (swap a Kempe chain)',
  'return proper 4-coloring',
];

// ---------- Planar presets ----------
function makeUSMap() {
  // Simplified US-state adjacency (subset): 10 vertices arranged roughly
  // geographically; planar by construction.
  const ns = [
    { id: 1, label: 'WA', x: 120, y: 110 },
    { id: 2, label: 'OR', x: 110, y: 180 },
    { id: 3, label: 'CA', x: 120, y: 280 },
    { id: 4, label: 'NV', x: 200, y: 230 },
    { id: 5, label: 'ID', x: 210, y: 150 },
    { id: 6, label: 'UT', x: 280, y: 250 },
    { id: 7, label: 'AZ', x: 260, y: 340 },
    { id: 8, label: 'CO', x: 360, y: 260 },
    { id: 9, label: 'NM', x: 360, y: 350 },
    { id: 10, label: 'WY', x: 340, y: 170 },
    { id: 11, label: 'MT', x: 300, y: 100 },
    { id: 12, label: 'TX', x: 480, y: 400 },
    { id: 13, label: 'OK', x: 500, y: 320 },
    { id: 14, label: 'KS', x: 500, y: 260 },
  ];
  const pairs = [
    [1, 2], [1, 5], [2, 3], [2, 4], [2, 5], [3, 4], [3, 7],
    [4, 5], [4, 6], [4, 7], [5, 10], [5, 11], [6, 7], [6, 8],
    [6, 10], [7, 9], [8, 9], [8, 10], [8, 14], [9, 12], [9, 13],
    [10, 11], [12, 13], [13, 14], [11, 10],
  ];
  const es = pairs.map((p, i) => ({ id: i + 1, from: p[0], to: p[1] }));
  return { ns, es };
}

function makeOctahedron() {
  // K_{2,2,2} — planar, χ = 3
  const cx = SVG_W / 2, cy = SVG_H / 2;
  const ns = [
    { id: 1, label: '1', x: cx, y: cy - 160 },
    { id: 2, label: '2', x: cx, y: cy + 160 },
    { id: 3, label: '3', x: cx - 160, y: cy },
    { id: 4, label: '4', x: cx + 160, y: cy },
    { id: 5, label: '5', x: cx - 90, y: cy - 70 },
    { id: 6, label: '6', x: cx + 90, y: cy + 70 },
  ];
  const pairs = [
    [1, 3], [1, 4], [1, 5], [1, 6],
    [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 5], [3, 6], [4, 5], [4, 6],
  ];
  const es = pairs.map((p, i) => ({ id: i + 1, from: p[0], to: p[1] }));
  return { ns, es };
}

function makeWheel() {
  // W_5: hub + 5-cycle. χ = 4 (odd wheel).
  const cx = SVG_W / 2, cy = SVG_H / 2;
  const ns = [{ id: 1, label: 'h', x: cx, y: cy }];
  for (let i = 0; i < 5; i++) {
    ns.push({
      id: i + 2,
      label: `${i + 1}`,
      x: cx + 170 * Math.cos((2 * Math.PI * i) / 5 - Math.PI / 2),
      y: cy + 170 * Math.sin((2 * Math.PI * i) / 5 - Math.PI / 2),
    });
  }
  const es = [];
  let id = 1;
  for (let i = 0; i < 5; i++) es.push({ id: id++, from: 1, to: i + 2 }); // spokes
  for (let i = 0; i < 5; i++) es.push({ id: id++, from: i + 2, to: ((i + 1) % 5) + 2 }); // rim
  return { ns, es };
}

function makeK4() {
  const ns = [
    { id: 1, label: '1', x: 400, y: 120 },
    { id: 2, label: '2', x: 240, y: 330 },
    { id: 3, label: '3', x: 560, y: 330 },
    { id: 4, label: '4', x: 400, y: 260 },
  ];
  const es = [];
  let id = 1;
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++)
      es.push({ id: id++, from: ns[i].id, to: ns[j].id });
  return { ns, es };
}

// ---------- Planarity sanity check (not full Kuratowski) ----------
// Euler-bound heuristic: a simple planar graph with n ≥ 3 has |E| ≤ 3n − 6.
function planarityHint(n, m) {
  if (n < 3) return { ok: true, msg: 'Trivially planar (n < 3).' };
  const bound = 3 * n - 6;
  if (m <= bound) return { ok: true, msg: `|E|=${m} ≤ 3n−6=${bound}. Planar under Euler bound.` };
  return { ok: false, msg: `|E|=${m} > 3n−6=${bound}. Graph cannot be planar.` };
}

// ---------- DSATUR + 4-color greedy with limited backtracking ----------
function fourColorWithSteps(nodes, edges) {
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, new Set()));
  edges.forEach((e) => {
    if (adj.has(e.from)) adj.get(e.from).add(e.to);
    if (adj.has(e.to)) adj.get(e.to).add(e.from);
  });
  const steps = [];
  const color = new Map(); // id -> 1..4
  nodes.forEach((n) => color.set(n.id, 0));
  steps.push({ color: new Map(color), current: null, line: 0, label: 'Start: no colors assigned.' });

  // DSATUR ordering dynamically
  const uncolored = new Set(nodes.map((n) => n.id));
  const saturation = (id) => {
    const s = new Set();
    adj.get(id).forEach((x) => { if (color.get(x)) s.add(color.get(x)); });
    return s.size;
  };
  const pickNext = () => {
    let best = null, bestSat = -1, bestDeg = -1;
    uncolored.forEach((id) => {
      const sat = saturation(id);
      const deg = adj.get(id).size;
      if (sat > bestSat || (sat === bestSat && deg > bestDeg) || (sat === bestSat && deg === bestDeg && best != null && id < best)) {
        best = id; bestSat = sat; bestDeg = deg;
      }
    });
    return best;
  };

  let conflict = null;
  while (uncolored.size) {
    const v = pickNext();
    steps.push({ color: new Map(color), current: v, line: 2, label: `Selected v=${v} (sat=${saturation(v)}, deg=${adj.get(v).size}).` });
    const used = new Set();
    adj.get(v).forEach((x) => { if (color.get(x)) used.add(color.get(x)); });
    steps.push({ color: new Map(color), current: v, used: new Set(used), line: 3, label: `Neighbor colors used: {${[...used].join(', ') || '∅'}}.` });
    let c = 0;
    for (let k = 1; k <= 4; k++) { if (!used.has(k)) { c = k; break; } }
    if (!c) {
      // Attempt simple Kempe chain swap on v's first neighbor pair that can free a color.
      const cands = [1, 2, 3, 4];
      let recovered = false;
      for (const a of cands) {
        for (const b of cands) {
          if (a === b) continue;
          // Find a neighbor of v colored 'a'. Kempe-swap the (a,b) chain from that neighbor.
          const start = [...adj.get(v)].find((x) => color.get(x) === a);
          if (!start) continue;
          // BFS the (a,b)-component containing start.
          const chain = new Set([start]);
          const q = [start];
          while (q.length) {
            const u = q.shift();
            adj.get(u).forEach((w) => {
              if (!chain.has(w) && (color.get(w) === a || color.get(w) === b)) {
                chain.add(w); q.push(w);
              }
            });
          }
          // If v has no neighbor of color 'b' outside the chain, swap and retry.
          const neighborsB = [...adj.get(v)].filter((x) => color.get(x) === b);
          if (neighborsB.every((x) => chain.has(x) === false)) {
            chain.forEach((u) => color.set(u, color.get(u) === a ? b : a));
            steps.push({ color: new Map(color), current: v, line: 5, label: `Kempe chain swap (${FOUR_NAMES[a - 1]} ↔ ${FOUR_NAMES[b - 1]}) on component of size ${chain.size}.` });
            const used2 = new Set();
            adj.get(v).forEach((x) => { if (color.get(x)) used2.add(color.get(x)); });
            for (let k = 1; k <= 4; k++) { if (!used2.has(k)) { c = k; break; } }
            if (c) { recovered = true; break; }
          }
        }
        if (recovered) break;
      }
      if (!c) {
        conflict = v;
        steps.push({ color: new Map(color), current: v, line: 5, label: `No free color at v=${v}. Likely non-planar or K_5-minor present.` });
        break;
      }
    }
    color.set(v, c);
    uncolored.delete(v);
    steps.push({ color: new Map(color), current: v, assigned: c, line: 4, label: `Assigned v=${v} → ${FOUR_NAMES[c - 1]}.` });
  }

  steps.push({ color: new Map(color), current: null, line: 6, label: conflict ? 'Incomplete — no 4-coloring found.' : 'Complete 4-coloring.' });
  return { steps, conflict };
}

const NodeDot = memo(function NodeDot({ n, fill, ring, onDown }) {
  return (
    <g onMouseDown={(e) => onDown(e, n.id)} onTouchStart={(e) => onDown(e, n.id)} style={{ cursor: 'grab', touchAction: 'none' }}>
      <circle cx={n.x} cy={n.y} r={NODE_R} fill={fill} stroke={ring || '#334155'} strokeWidth={ring ? 4 : 2} />
      <text x={n.x} y={n.y} textAnchor="middle" dy=".35em" fontSize={12} fontWeight="700"
            fill={fill === '#cbd5e1' ? '#0F172A' : '#fff'} className="select-none pointer-events-none">
        {n.label ?? n.id}
      </text>
    </g>
  );
});

export default function FourColor() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [history, setHistory] = useState([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');
  const [err, setErr] = useState('');
  const svgRef = useRef(null);
  const dragRef = useRef({ id: null, ox: 0, oy: 0 });

  useEffect(() => {
    const { ns, es } = makeUSMap();
    setNodes(ns); setEdges(es);
  }, []);

  // --- drag with boundary clamping
  const getSvgPoint = (event) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return null;
    const source = event.touches && event.touches[0]
      ? event.touches[0]
      : (event.changedTouches && event.changedTouches[0]) || event;
    const scaleX = SVG_W / svgRect.width;
    const scaleY = SVG_H / svgRect.height;
    return {
      x: (source.clientX - svgRect.left) * scaleX,
      y: (source.clientY - svgRect.top) * scaleY,
    };
  };
  const onDown = (e, id) => {
    e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    const n = nodes.find((n) => n.id === id); if (!n) return;
    dragRef.current = { id, ox: pt.x - n.x, oy: pt.y - n.y };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
  };
  const onMove = useCallback((e) => {
    if (dragRef.current.id === null) return;
    if (e.touches) e.preventDefault();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const source = e.touches && e.touches[0]
      ? e.touches[0]
      : (e.changedTouches && e.changedTouches[0]) || e;
    const scaleX = SVG_W / svgRect.width;
    const scaleY = SVG_H / svgRect.height;
    const sx = (source.clientX - svgRect.left) * scaleX;
    const sy = (source.clientY - svgRect.top) * scaleY;
    const x = Math.max(NODE_R, Math.min(SVG_W - NODE_R, sx - dragRef.current.ox));
    const y = Math.max(NODE_R, Math.min(SVG_H - NODE_R, sy - dragRef.current.oy));
    const id = dragRef.current.id;
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);
  const onUp = useCallback(() => {
    dragRef.current = { id: null, ox: 0, oy: 0 };
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    window.removeEventListener('touchcancel', onUp);
  }, [onMove]);
  useEffect(() => () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    window.removeEventListener('touchcancel', onUp);
  }, [onMove, onUp]);

  // --- graph editing
  const nextId = nodes.length ? Math.max(...nodes.map((n) => n.id)) + 1 : 1;
  const nextEId = edges.length ? Math.max(...edges.map((e) => e.id)) + 1 : 1;

  const addNode = () => {
    const id = nextId;
    let x = 0, y = 0;
    for (let tries = 0; tries < 50; tries++) {
      const cx = NODE_R + Math.random() * (SVG_W - 2 * NODE_R);
      const cy = NODE_R + Math.random() * (SVG_H - 2 * NODE_R);
      x = cx; y = cy;
      const collides = nodes.some((nn) => Math.hypot(nn.x - cx, nn.y - cy) < 55);
      if (!collides) break;
    }
    setNodes([...nodes, { id, label: String(id), x, y }]);
  };
  const addEdge = () => {
    const a = parseInt(tempFrom), b = parseInt(tempTo);
    if (!a || !b || a === b) { setErr('Bad endpoints'); return; }
    if (!nodes.find((n) => n.id === a) || !nodes.find((n) => n.id === b)) { setErr('Node not found'); return; }
    if (edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))) { setErr('Edge exists'); return; }
    setEdges([...edges, { id: nextEId, from: a, to: b }]);
    setTempFrom(''); setTempTo(''); setErr('');
  };
  const delEdge = () => {
    const a = parseInt(tempFrom), b = parseInt(tempTo);
    setEdges(edges.filter((e) => !((e.from === a && e.to === b) || (e.from === b && e.to === a))));
    setTempFrom(''); setTempTo('');
  };
  const delNode = (id) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
  };
  const clearAll = () => { setNodes([]); setEdges([]); setHistory([]); setStepIdx(0); };

  const newRandomGraph = () => {
    const g = createRandomGraph({
      n: 8 + Math.floor(Math.random() * 4),
      edgeCount: 12,
      width: SVG_W,
      height: SVG_H,
      idStart: 1,
    });
    setNodes(g.nodes.map((n) => ({ ...n, label: String(n.id) })));
    setEdges(g.edges.map((e, i) => ({ id: i + 1, from: e.a, to: e.b })));
    setHistory([]);
    setStepIdx(0);
    setErr('');
  };

  const downloadCurrentGraph = () => {
    if (nodes.length === 0) { setErr('Nothing to download.'); return; }
    downloadGraphJson(
      buildGraphPayload({
        nodes,
        edges,
        width: SVG_W,
        height: SVG_H,
        page: 'four-color',
      }),
      'four-color-graph.json',
    );
    setErr('');
  };

  const loadGraphFromFile = (graph, errMsg) => {
    if (errMsg || !graph) { setErr(errMsg?.message || 'Failed to load graph.'); return; }
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, label: n.label ?? String(n.id) })));
    setEdges(toFromToEdges(graph.edges, { withIds: true }));
    setHistory([]);
    setStepIdx(0);
    setErr('');
  };

  const drawPlanarAsPossible = () => {
    if (nodes.length < 2) { setErr('Need at least 2 nodes to layout.'); return; }
    const { nodes: next } = layoutPlanarAsPossible(nodes, edges, {
      width: SVG_W,
      height: SVG_H,
    });
    setNodes(next);
    setErr('');
  };

  const run = () => {
    const { steps } = fourColorWithSteps(nodes, edges);
    setHistory(steps);
    setStepIdx(0);
  };

  useEffect(() => {
    if (!playing || !history.length) return;
    if (stepIdx >= history.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStepIdx((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, stepIdx, history, speed]);

  const state = history[stepIdx] || { color: new Map(), current: null, line: 0, label: 'Load a planar preset or build your own, then run.' };
  const hint = planarityHint(nodes.length, edges.length);
  const usedColors = new Set([...state.color.values()].filter(Boolean));

  // Color-class counts
  const counts = [0, 0, 0, 0];
  state.color.forEach((c) => { if (c) counts[c - 1]++; });

  return (
    <div className="algo-dark min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">Four Color Theorem</h1>
          <p className="text-slate-400 text-sm mt-1">
            Every planar graph is 4-colorable (Appel &amp; Haken 1976).
            DSATUR + Kempe-chain recolorings when the greedy step gets boxed in.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Presets */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Planar Presets</h3>
              <div className="space-y-2">
                <button onClick={() => { const { ns, es } = makeUSMap(); setNodes(ns); setEdges(es); setHistory([]); setStepIdx(0); }}
                        className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
                  🗺️ US Western States Map
                </button>
                <button onClick={() => { const { ns, es } = makeOctahedron(); setNodes(ns); setEdges(es); setHistory([]); setStepIdx(0); }}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                  ◇ Octahedron K_{'{'}2,2,2{'}'} (χ = 3)
                </button>
                <button onClick={() => { const { ns, es } = makeWheel(); setNodes(ns); setEdges(es); setHistory([]); setStepIdx(0); }}
                        className="w-full px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium">
                  ⊛ Odd Wheel W_5 (χ = 4)
                </button>
                <button onClick={() => { const { ns, es } = makeK4(); setNodes(ns); setEdges(es); setHistory([]); setStepIdx(0); }}
                        className="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
                  △ K_4 (χ = 4)
                </button>
              </div>
            </div>

            {/* Editor */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="font-bold text-slate-100 mb-3 pb-2 border-b-2 border-red-800">Editor</h3>
              <button onClick={addNode} className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm mb-2">+ Add Node</button>
              <div className="flex gap-2 mb-2">
                <input type="number" value={tempFrom} onChange={(e) => setTempFrom(e.target.value)} placeholder="from" className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-slate-200" />
                <input type="number" value={tempTo} onChange={(e) => setTempTo(e.target.value)} placeholder="to" className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-slate-200" />
              </div>
              <div className="flex gap-2 mb-2">
                <button onClick={addEdge} className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">+ Edge</button>
                <button onClick={delEdge} className="flex-1 px-3 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 text-sm">− Edge</button>
              </div>
              <button onClick={clearAll} className="w-full px-3 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 text-sm">Clear All</button>
              <GraphToolbar
                className="mt-2"
                onNewRandom={newRandomGraph}
                onPlanarLayout={drawPlanarAsPossible}
                onDownload={downloadCurrentGraph}
                onLoad={loadGraphFromFile}
              />
              {err && <div className="mt-2 text-xs text-rose-400 bg-rose-900/30 border border-rose-700 rounded p-2">⚠ {err}</div>}
              <div className="mt-2 text-xs text-slate-400">Right-click a node to delete it.</div>
            </div>

            {/* Algorithm */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="font-bold text-slate-100 mb-3 pb-2 border-b-2 border-red-800">Run</h3>
              <button onClick={run} className="w-full px-3 py-2 bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 text-white rounded-lg text-sm font-bold mb-2">▶ Compute 4-Coloring</button>
              <div className="flex gap-2 mb-2">
                <button onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={!history.length} className="flex-1 px-2 py-1.5 bg-slate-200 rounded text-sm disabled:opacity-50">◀</button>
                <button onClick={() => setPlaying((p) => !p)} disabled={!history.length} className="flex-1 px-2 py-1.5 bg-emerald-500 text-white rounded text-sm disabled:opacity-50">{playing ? '❚❚' : '▶ Run'}</button>
                <button onClick={() => setStepIdx((i) => Math.min(history.length - 1, i + 1))} disabled={!history.length} className="flex-1 px-2 py-1.5 bg-slate-200 rounded text-sm disabled:opacity-50">▶</button>
                <button onClick={() => { setStepIdx(0); setPlaying(false); }} disabled={!history.length} className="flex-1 px-2 py-1.5 bg-amber-500 text-white rounded text-sm disabled:opacity-50">⟲</button>
              </div>
              <label className="block text-xs text-slate-400 mb-1">Speed: {speed}ms</label>
              <input type="range" min={150} max={1500} step={50} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="w-full" />
              <div className="mt-2 text-xs text-slate-400">Step {history.length ? stepIdx + 1 : 0} / {history.length}</div>
            </div>

            {/* Stats */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="font-bold text-slate-100 mb-3 pb-2 border-b-2 border-red-800">Stats</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-800 rounded p-2"><div className="text-xs text-slate-400">|V|</div><div className="font-bold">{nodes.length}</div></div>
                <div className="bg-slate-800 rounded p-2"><div className="text-xs text-slate-400">|E|</div><div className="font-bold">{edges.length}</div></div>
                <div className="bg-slate-800 rounded p-2 col-span-2"><div className="text-xs text-slate-400">Colors in use</div><div className="font-bold text-red-700">{usedColors.size} / 4</div></div>
              </div>
              <div className={`mt-2 p-2 rounded border text-xs ${hint.ok ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' : 'bg-rose-900/30 border-rose-700 text-rose-300'}`}>
                {hint.ok ? '✓' : '✗'} {hint.msg}
              </div>
              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-1">Color-class sizes</div>
                <div className="flex gap-1">
                  {FOUR.map((c, i) => (
                    <div key={c} className="flex-1 text-center">
                      <div className="h-4 rounded" style={{ background: c }}></div>
                      <div className="text-xs font-mono mt-1">{counts[i]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Canvas + overlays */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-300">{state.label}</div>
                <div className="text-xs text-slate-400">Drag nodes freely • right-click to delete</div>
              </div>
              <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%"
                   preserveAspectRatio="xMidYMid meet"
                   className="border border-slate-700 rounded-lg bg-slate-800 touch-none select-none">
                {edges.map((e) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94A3B8" strokeWidth={2} />;
                })}
                {nodes.map((n) => {
                  const c = state.color.get(n.id);
                  const fill = c ? FOUR[c - 1] : '#cbd5e1';
                  const ring = state.current === n.id ? '#0F172A' : null;
                  return (
                    <g key={n.id} onContextMenu={(e) => { e.preventDefault(); delNode(n.id); }}>
                      <NodeDot n={n} fill={fill} ring={ring} onDown={onDown} />
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pseudocode */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <h3 className="font-bold text-slate-100 mb-2">Pseudocode</h3>
                <pre className="text-xs font-mono leading-relaxed">
                  {PSEUDOCODE.map((l, i) => (
                    <div key={i} className={`px-1 py-0.5 rounded ${i === state.line ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-300'}`}>{l}</div>
                  ))}
                </pre>
              </div>

              {/* Palette legend */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <h3 className="font-bold text-slate-100 mb-2">Four-Color Palette</h3>
                <div className="space-y-2">
                  {FOUR.map((c, i) => (
                    <div key={c} className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 rounded" style={{ background: c }}></span>
                      <span className="text-sm font-mono">{i + 1}. {FOUR_NAMES[i]}</span>
                      <span className="text-xs text-slate-400 ml-auto">{counts[i]} vertices</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-700 text-xs text-slate-400">
                  <b>Theorem (Appel–Haken, 1976):</b> χ(G) ≤ 4 for every planar graph G.
                  For non-planar graphs, 4 colors may not suffice — try K_5.
                </div>
              </div>
            </div>

            {/* Applications */}
            <div className="bg-gradient-to-r from-red-50 via-amber-50 to-emerald-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-bold text-amber-900 mb-1 flex items-center gap-2">🌐 Real-world Applications</h3>
              <p className="text-sm text-amber-900/90">
                Political map coloring, mobile-network frequency reuse, compiler register allocation on interference graphs
                with small structural width, Sudoku constraint propagation, and adjacency-aware UI theme generation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
