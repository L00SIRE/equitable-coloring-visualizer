import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import GraphCanvas from '../canvas/GraphCanvas';
import useCanvasRemount from '../canvas/useCanvasRemount';
import { createRandomGraph } from '../canvas/randomGraph';
import { buildGraphPayload, downloadGraphJson } from '../canvas/graphIO';
import { layoutPlanarAsPossible } from '../canvas/planarLayout';
import GraphToolbar from '../Components/GraphToolbar';
import { runHajnalSzemeredi } from '../algorithms/hajnalSzemeredi';

/* ─────────────────── colour palette ─────────────────── */
const PALETTE = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308',
  '#a855f7', '#f97316', '#06b6d4', '#ec4899',
  '#14b8a6', '#f43f5e', '#84cc16', '#6366f1',
];
const palette = (k) =>
  k <= PALETTE.length
    ? PALETTE.slice(0, k)
    : Array.from({ length: k }, (_, i) =>
        `hsl(${Math.round((360 * i) / k)}, 65%, 52%)`
      );
const CLASS_NAMES = [
  'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange',
  'Cyan', 'Pink', 'Teal', 'Rose', 'Lime', 'Indigo',
];
const className = (c) => CLASS_NAMES[c] ?? `C${c}`;

const PAPER_URL = 'https://doi.org/10.1017/S0963548307008619';

/* badge colour + label for every step type produced by the algorithm */
const STEP_STYLE = {
  init: ['bg-slate-500/20 text-slate-200', 'Start'],
  stage: ['bg-emerald-500/15 text-emerald-300', 'Add edges'],
  improper: ['bg-red-500/20 text-red-300', 'Improper edge'],
  move: ['bg-amber-500/20 text-amber-300', 'Nearly equitable'],
  aux: ['bg-purple-500/20 text-purple-300', 'Path in H'],
  shift: ['bg-violet-500/20 text-violet-300', 'Lemma 2.1 shift'],
  blocked: ['bg-orange-500/20 text-orange-300', 'V+ blocked'],
  solo: ['bg-sky-500/20 text-sky-300', 'Lemma 2.3'],
  case1: ['bg-teal-500/20 text-teal-300', 'Case 1'],
  case2: ['bg-pink-500/20 text-pink-300', 'Case 2'],
  done: ['bg-green-500/20 text-green-300', 'Done'],
  error: ['bg-red-500/30 text-red-200', 'Error'],
};
const TAG_STYLE = {
  'V+': 'bg-blue-500/25 text-blue-200',
  'V−': 'bg-amber-500/25 text-amber-200',
  A: 'bg-emerald-500/20 text-emerald-200',
  B: 'bg-slate-600/60 text-slate-200',
  'A′': 'bg-sky-500/25 text-sky-200',
  U: 'bg-orange-500/25 text-orange-200',
  W: 'bg-pink-500/25 text-pink-200',
  X: 'bg-pink-500/25 text-pink-200',
  Y: 'bg-pink-500/25 text-pink-200',
};
const ROLE_LABEL = { z: 'z', y1: 'y₁', y2: 'y₂' };
const AUX_SIZE = 300;

const STEP_DOT = {
  init: 'bg-slate-400', stage: 'bg-emerald-400', improper: 'bg-red-400', move: 'bg-amber-400',
  aux: 'bg-purple-400', shift: 'bg-violet-400', blocked: 'bg-orange-400', solo: 'bg-sky-400',
  case1: 'bg-teal-400', case2: 'bg-pink-400', done: 'bg-green-400', error: 'bg-red-500',
};

/* ════════════════════════ COMPONENT ════════════════════════ */
export default function HSAlgo() {
  /* ─── state ─── */
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [coloring, setColoring] = useState({});
  const [maxDeg, setMaxDeg] = useState(3);

  const [connectMode, setConnectMode] = useState(false);
  const [connectSrc, setConnectSrc] = useState(null);

  const [dragId, setDragId] = useState(null);
  const [dragOff, setDragOff] = useState({ x: 0, y: 0 });
  const [zoomLabel, setZoomLabel] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [hsSteps, setHsSteps] = useState([]);
  const [hsIdx, setHsIdx] = useState(-1);
  const [hsPlaying, setHsPlaying] = useState(false);
  const [hsSpeed, setHsSpeed] = useState(2500);
  const [hsStats, setHsStats] = useState(null);
  const [hsDummies, setHsDummies] = useState([]);
  const [mergeQuiet, setMergeQuiet] = useState(true);
  const [shortcuts, setShortcuts] = useState(true);

  const [bulkText, setBulkText] = useState('');
  const [nodeCount, setNodeCount] = useState('');
  const [toast, setToast] = useState('');
  const [builderOpen, setBuilderOpen] = useState(true);
  const [explainOpen, setExplainOpen] = useState(true);

  const canvasRef = useRef(null);
  const { canvasKey, remountCanvas } = useCanvasRemount();
  const W = 820, H = 520;
  const NODE_R = 22;

  /* ─── derived ─── */
  const r = maxDeg;
  const k = r + 1;
  const pal = useMemo(() => palette(k), [k]);

  const adj = useMemo(() => {
    const m = new Map();
    nodes.forEach((n) => m.set(n.id, new Set()));
    edges.forEach(({ a, b }) => { m.get(a)?.add(b); m.get(b)?.add(a); });
    return m;
  }, [nodes, edges]);

  const actualMaxDeg = useMemo(() => {
    let mx = 0;
    for (const [, s] of adj) mx = Math.max(mx, s.size);
    return mx;
  }, [adj]);

  const classSizes = useMemo(() => {
    const s = Array(k).fill(0);
    nodes.forEach((n) => { const c = coloring[n.id]; if (c != null && c >= 0 && c < k) s[c]++; });
    return s;
  }, [nodes, coloring, k]);

  const isEquitable = useMemo(() => {
    if (nodes.length === 0) return true;
    return Math.max(...classSizes) - Math.min(...classSizes) <= 1;
  }, [classSizes, nodes.length]);

  /* snapshot display */
  const curStep = hsIdx >= 0 && hsIdx < hsSteps.length ? hsSteps[hsIdx] : null;
  const dispEdges = curStep ? curStep.edges : edges;
  const dispColoring = curStep ? curStep.coloring : coloring;
  const hl = curStep?.highlight ?? {};
  const aux = curStep?.aux ?? null;
  const liftedSet = useMemo(() => new Set(curStep?.lifted ?? []), [curStep]);
  const movedSet = useMemo(() => new Set((hl.moves ?? []).map((m) => m.v)), [hl.moves]);
  const roleOf = useMemo(() => {
    const m = new Map();
    Object.entries(hl.roles ?? {}).forEach(([role, v]) => m.set(v, role));
    return m;
  }, [hl.roles]);

  /* edges whose two ends currently share a colour */
  const improperCount = useMemo(() =>
    dispEdges.filter(({ a, b }) => dispColoring[a] != null && dispColoring[a] === dispColoring[b]).length,
  [dispEdges, dispColoring]);

  /* padding vertices (K_p) are drawn in the bottom-right corner while playing */
  const dummyNodes = useMemo(() =>
    (curStep ? hsDummies : []).map((id, j) => ({ id, label: `d${j + 1}`, x: W - 34 - j * 46, y: H - 66 })),
  [curStep, hsDummies, W, H]);

  /* role tags for each colour class in the current step */
  const classTags = useMemo(() => {
    const tags = Array.from({ length: k }, () => []);
    if (!aux) return tags;
    const add = (c, t) => { if (c != null && c < k) tags[c].push(t); };
    add(aux.vPlus, 'V+');
    add(aux.vMinus, 'V−');
    if (aux.A) {
      const A = new Set(aux.A);
      aux.classes.forEach((c) => add(c, A.has(c) ? 'A' : 'B'));
    }
    (aux.Aprime ?? []).forEach((c) => add(c, 'A′'));
    add(aux.U, 'U');
    Object.entries(aux.focus ?? {}).forEach(([t, c]) => add(c, t));
    return tags;
  }, [aux, k]);

  /* keep coloring in sync with k / nodes */
  useEffect(() => {
    if (!k) return;
    setColoring((prev) => {
      const next = {};
      let changed = false;
      for (const n of nodes) {
        const old = prev[n.id];
        if (old != null && old >= 0 && old < k) { next[n.id] = old; }
        else { next[n.id] = n.id % k; changed = true; }
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [nodes, k]);

  /* forget any computed run (graph or r changed) */
  const resetSteps = useCallback(() => {
    setHsSteps([]); setHsIdx(-1); setHsPlaying(false);
    setHsStats(null); setHsDummies([]);
  }, []);

  const graphSig = useMemo(
    () => `${nodes.map((n) => n.id).join(',')}|${edges.map((e) => `${e.a}-${e.b}`).join(',')}|${r}`,
    [nodes, edges, r],
  );
  useEffect(() => { resetSteps(); }, [graphSig, resetSteps]);

  /* toast helper */
  const flash = useCallback((msg) => {
    setToast(msg);
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, []);

  /* ─── graph ops ─── */
  const nextId = () => (nodes.length === 0 ? 0 : Math.max(...nodes.map((n) => n.id)) + 1);

  const addNodeAt = (x, y) => {
    const id = nextId();
    setNodes((prev) => [...prev, { id, x, y }]);
    setColoring((prev) => ({ ...prev, [id]: id % k }));
    flash(`Added vertex ${id}.`);
    return id;
  };

  const addBulkNodes = () => {
    const count = parseInt(nodeCount, 10);
    if (isNaN(count) || count < 1 || count > 100) { flash('Enter a number 1\u2013100.'); return; }
    const startId = nextId();
    const cols = Math.ceil(Math.sqrt(count));
    const gx = cols > 1 ? (W - 140) / (cols - 1) : 0;
    const rows = Math.ceil(count / cols);
    const gy = rows > 1 ? (H - 140) / (rows - 1) : 0;
    const nn = [];
    const nc = { ...coloring };
    for (let i = 0; i < count; i++) {
      const id = startId + i;
      nn.push({ id, x: 70 + (i % cols) * gx, y: 70 + Math.floor(i / cols) * gy });
      nc[id] = id % k;
    }
    setNodes((prev) => [...prev, ...nn]);
    setColoring(nc);
    setNodeCount('');
    flash(`Added ${count} vertices (${startId}\u2013${startId + count - 1}).`);
  };

  const tryAddEdge = useCallback((a, b) => {
    if (a === b) return false;
    const ea = Math.min(a, b), eb = Math.max(a, b);
    if (edges.some((e) => e.a === ea && e.b === eb)) { flash('Edge already exists.'); return false; }
    const degA = adj.get(a)?.size ?? 0;
    const degB = adj.get(b)?.size ?? 0;
    if (degA >= r) { flash(`Vertex ${a} already at max degree ${r}.`); return false; }
    if (degB >= r) { flash(`Vertex ${b} already at max degree ${r}.`); return false; }
    setEdges((prev) => [...prev, { a: ea, b: eb }]);
    flash(`Added edge {${ea},${eb}}.`);
    return true;
  }, [edges, adj, r, flash]);

  const clearAll = () => {
    setNodes([]); setEdges([]); setColoring({});
    resetSteps();
    setConnectMode(false); setConnectSrc(null);
    setDragId(null);
    setSelectedIds(new Set());
    remountCanvas();
    flash('Cleared.');
  };

  const newRandomGraph = () => {
    const n = 8 + Math.floor(Math.random() * 5); // 8–12
    const g = createRandomGraph({
      n,
      maxDegree: r,
      width: W,
      height: H,
      idStart: 0,
      edgeCount: Math.round(n * Math.min(1.5, r * 0.55)),
    });
    resetSteps();
    setConnectMode(false); setConnectSrc(null);
    setDragId(null);
    setSelectedIds(new Set());
    remountCanvas();
    setNodes(g.nodes);
    setEdges(g.edges);
    const c = {};
    g.nodes.forEach((node) => { c[node.id] = node.id % k; });
    setColoring(c);
    flash(`New random graph: ${g.nodes.length} vertices, ${g.edges.length} edges (Δ ≤ r=${r}).`);
  };

  const downloadCurrentGraph = () => {
    if (nodes.length === 0) { flash('Nothing to download — add vertices first.'); return; }
    const payload = buildGraphPayload({
      nodes,
      edges,
      width: W,
      height: H,
      page: 'hs-algo',
      meta: { maxDeg: r, coloring },
    });
    downloadGraphJson(payload, `hs-graph-${nodes.length}v.json`);
    flash('Downloaded graph JSON.');
  };

  const loadGraphFromFile = (graph, err) => {
    if (err || !graph) {
      flash(err?.message || 'Failed to load graph.');
      return;
    }
    const rv = Number(graph.meta?.maxDeg);
    if (Number.isFinite(rv) && rv >= 1) setMaxDeg(rv);
    const nextR = Number.isFinite(rv) && rv >= 1 ? rv : r;
    resetSteps();
    setConnectMode(false); setConnectSrc(null);
    setDragId(null);
    setSelectedIds(new Set());
    remountCanvas();
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
    setEdges(graph.edges.map((e) => ({ a: e.a, b: e.b })));
    const loadedColoring = graph.meta?.coloring;
    if (loadedColoring && typeof loadedColoring === 'object') {
      const c = {};
      graph.nodes.forEach((n) => {
        const v = loadedColoring[n.id] ?? loadedColoring[String(n.id)];
        c[n.id] = v != null ? v : n.id % (nextR + 1);
      });
      setColoring(c);
    } else {
      const c = {};
      graph.nodes.forEach((n) => { c[n.id] = n.id % (nextR + 1); });
      setColoring(c);
    }
    flash(`Loaded graph: ${graph.nodes.length} vertices, ${graph.edges.length} edges.`);
  };

  const drawPlanarAsPossible = () => {
    if (nodes.length < 2) { flash('Need at least 2 vertices to layout.'); return; }
    const { nodes: next, crossingsBefore, crossingsAfter } = layoutPlanarAsPossible(nodes, edges, {
      width: W,
      height: H,
    });
    setNodes(next);
    setSelectedIds(new Set());
    remountCanvas();
    flash(
      crossingsAfter < crossingsBefore
        ? `Layout updated: crossings ${crossingsBefore} → ${crossingsAfter}.`
        : crossingsAfter === 0
          ? 'Layout updated: drawing is crossing-free.'
          : `Layout updated: still ${crossingsAfter} crossing(s) (may be non-planar).`,
    );
  };

  const applyModColoring = () => {
    const c = {};
    nodes.forEach((n) => { c[n.id] = n.id % k; });
    setColoring(c);
    flash(`Applied mod-${k} coloring: vertex v \u2192 class (v mod ${k}).`);
  };

  const applyGreedyColoring = () => {
    const sorted = [...nodes].sort((a, b) => a.id - b.id);
    const c = {};
    for (const n of sorted) {
      const used = new Set();
      for (const nb of adj.get(n.id) || []) if (c[nb] != null) used.add(c[nb]);
      for (let cl = 0; cl < k; cl++) { if (!used.has(cl)) { c[n.id] = cl; break; } }
      if (c[n.id] == null) c[n.id] = 0;
    }
    setColoring(c);
    flash('Applied greedy proper coloring.');
  };

  /* ─── bulk edges ─── */
  const applyBulkEdges = () => {
    if (!bulkText.trim()) { flash('Paste edges like: 0-1, 1-2, 2-3'); return; }
    const idSet = new Set(nodes.map((n) => n.id));
    const pairs = [];
    try {
      for (const tok of bulkText.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)) {
        const m = tok.match(/^(\d+)\s*[-:]\s*(\d+)$/);
        if (!m) throw new Error(`Invalid: "${tok}"`);
        pairs.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
      }
    } catch (e) { flash(e.message); return; }
    const deg = new Map([...idSet].map((id) => [id, 0]));
    const uniq = new Set();
    const out = [];
    for (const [u, v] of pairs) {
      if (!idSet.has(u) || !idSet.has(v)) { flash(`Unknown vertex in ${u}-${v}.`); return; }
      if (u === v) { flash(`Self-loop: ${u}-${v}.`); return; }
      const key = `${Math.min(u, v)}-${Math.max(u, v)}`;
      if (uniq.has(key)) continue;
      uniq.add(key);
      const a = Math.min(u, v), b = Math.max(u, v);
      deg.set(a, deg.get(a) + 1);
      deg.set(b, deg.get(b) + 1);
      out.push({ a, b });
    }
    for (const [id, d] of deg) if (d > r) { flash(`Vertex ${id} degree ${d} exceeds r=${r}.`); return; }
    setEdges(out);
    setBulkText('');
    flash(`Applied ${out.length} edges.`);
  };

  /* ─── preset graphs ─── */
  const PAPER_NODES = [
    { id: 6, x: 110, y: 70 }, { id: 5, x: 230, y: 70 }, { id: 4, x: 350, y: 70 },
    { id: 3, x: 470, y: 70 }, { id: 8, x: 640, y: 70 }, { id: 7, x: 110, y: 190 },
    { id: 0, x: 230, y: 190 }, { id: 1, x: 350, y: 190 }, { id: 2, x: 470, y: 190 },
    { id: 15, x: 470, y: 310 }, { id: 9, x: 640, y: 310 }, { id: 12, x: 110, y: 430 },
    { id: 13, x: 230, y: 430 }, { id: 14, x: 350, y: 430 }, { id: 11, x: 470, y: 430 },
    { id: 10, x: 640, y: 430 },
  ];
  const PAPER_EDGES = [
    { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 1, b: 4 }, { a: 3, b: 4 },
    { a: 0, b: 5 }, { a: 4, b: 5 }, { a: 5, b: 6 }, { a: 0, b: 7 }, { a: 6, b: 7 },
    { a: 3, b: 8 }, { a: 8, b: 9 }, { a: 9, b: 10 }, { a: 10, b: 11 }, { a: 7, b: 12 },
    { a: 2, b: 13 }, { a: 12, b: 13 }, { a: 11, b: 14 }, { a: 13, b: 14 }, { a: 9, b: 15 },
    { a: 11, b: 15 }, { a: 14, b: 15 },
  ];

  /* Sample Graph 2: quiet until the last stage; then V+ is blocked and, with
     "shortest route" off, Lemma 2.3 lands in Case 2 with a recursive call. */
  const SAMPLE2_NODES = [
    { id: 0, x: 383, y: 460 }, { id: 1, x: 457, y: 331 }, { id: 2, x: 600, y: 80 },
    { id: 3, x: 522, y: 349 }, { id: 4, x: 444, y: 428 }, { id: 5, x: 334, y: 389 },
    { id: 6, x: 211, y: 303 }, { id: 7, x: 278, y: 387 }, { id: 8, x: 275, y: 191 },
    { id: 9, x: 360, y: 125 }, { id: 10, x: 500, y: 154 }, { id: 11, x: 333, y: 241 },
    { id: 12, x: 419, y: 239 }, { id: 13, x: 417, y: 146 }, { id: 14, x: 392, y: 326 },
  ];
  const SAMPLE2_EDGES = [
    [0, 1], [1, 3], [0, 4], [3, 4], [1, 5], [4, 5], [5, 6], [0, 7], [5, 7], [6, 8],
    [8, 9], [1, 10], [2, 10], [9, 10], [7, 11], [9, 11], [3, 12], [8, 12], [9, 13], [10, 13],
    [11, 13], [12, 13], [4, 14], [11, 14], [12, 14],
  ].map(([a, b]) => ({ a, b }));

  const PRESETS = [
    ['paper', 'Sample Graph 1 (paper, 16v, \u0394=3)'],
    ['sample2', 'Sample Graph 2 (15v, \u0394=4, Case 2)'],
    ['petersen', 'Petersen (10v, \u0394=3)'],
    ['cycle8', 'Cycle C\u2088 (8v, \u0394=2)'],
    ['k33', 'K\u2083,\u2083 (6v, \u0394=3)'],
  ];

  const loadPreset = (name) => {
    resetSteps();
    setConnectMode(false); setConnectSrc(null);
    setDragId(null);
    setSelectedIds(new Set());
    remountCanvas();
    let ns, es, rv;
    if (name === 'paper') {
      ns = PAPER_NODES.map((n) => ({ ...n }));
      es = PAPER_EDGES.map((e) => ({ ...e }));
      rv = 3;
    } else if (name === 'sample2') {
      ns = SAMPLE2_NODES.map((n) => ({ ...n }));
      es = SAMPLE2_EDGES.map((e) => ({ ...e }));
      rv = 4;
    } else if (name === 'petersen') {
      rv = 3;
      const R1 = 200, R2 = 90, cx = W / 2, cy = H / 2;
      ns = Array.from({ length: 10 }, (_, i) => {
        const angle = (i < 5 ? i : i - 5) * (2 * Math.PI / 5) - Math.PI / 2;
        const rad = i < 5 ? R1 : R2;
        return { id: i, x: cx + rad * Math.cos(angle), y: cy + rad * Math.sin(angle) };
      });
      es = [
        { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 0, b: 4 },
        { a: 5, b: 7 }, { a: 7, b: 9 }, { a: 9, b: 6 }, { a: 6, b: 8 }, { a: 5, b: 8 },
        { a: 0, b: 5 }, { a: 1, b: 6 }, { a: 2, b: 7 }, { a: 3, b: 8 }, { a: 4, b: 9 },
      ];
    } else if (name === 'cycle8') {
      rv = 2;
      const R = 200, cx = W / 2, cy = H / 2;
      ns = Array.from({ length: 8 }, (_, i) => ({
        id: i, x: cx + R * Math.cos(i * Math.PI / 4 - Math.PI / 2), y: cy + R * Math.sin(i * Math.PI / 4 - Math.PI / 2)
      }));
      es = Array.from({ length: 8 }, (_, i) => ({ a: i, b: (i + 1) % 8 }));
      es = es.map((e) => ({ a: Math.min(e.a, e.b), b: Math.max(e.a, e.b) }));
    } else if (name === 'k33') {
      rv = 3;
      ns = [
        { id: 0, x: 200, y: 120 }, { id: 1, x: 400, y: 120 }, { id: 2, x: 600, y: 120 },
        { id: 3, x: 200, y: 380 }, { id: 4, x: 400, y: 380 }, { id: 5, x: 600, y: 380 },
      ];
      es = [];
      for (let i = 0; i < 3; i++) for (let j = 3; j < 6; j++) es.push({ a: i, b: j });
    } else return;

    setMaxDeg(rv);
    setNodes(ns);
    setEdges(es);
    const c = {};
    ns.forEach((n) => { c[n.id] = n.id % (rv + 1); });
    setColoring(c);
    flash(`Loaded ${PRESETS.find(([id]) => id === name)[1]}: ${ns.length} vertices, ${es.length} edges.`);
  };

  /* ─── H-S playback ─── */
  const onCompute = (opts = {}) => {
    if (nodes.length === 0) { flash('Add vertices first.'); return; }
    if (actualMaxDeg > r) { flash(`\u0394(G) = ${actualMaxDeg} exceeds r = ${r}. Increase r or remove edges.`); return; }
    const res = runHajnalSzemeredi(nodes.map((n) => n.id), edges, r, {
      compact: opts.mergeQuiet ?? mergeQuiet,
      shortcuts: opts.shortcuts ?? shortcuts,
      className,
    });
    setHsSteps(res.steps);
    setHsStats(res.stats);
    setHsDummies(res.dummyIds);
    setHsIdx(0);
    setHsPlaying(false);
    const last = res.steps[res.steps.length - 1];
    flash(last.type === 'error' ? last.message : `Computed ${res.steps.length} steps.`);
  };

  /* changing an option re-runs the algorithm if a run is already loaded */
  const toggleMergeQuiet = () => {
    const next = !mergeQuiet;
    setMergeQuiet(next);
    if (hsSteps.length) onCompute({ mergeQuiet: next });
  };
  const toggleShortcuts = () => {
    const next = !shortcuts;
    setShortcuts(next);
    if (hsSteps.length) onCompute({ shortcuts: next });
  };

  const hsForward = () => {
    if (hsIdx + 1 < hsSteps.length) setHsIdx((i) => i + 1);
  };
  const hsBack = () => {
    if (hsIdx > -1) setHsIdx((i) => i - 1);
  };
  const hsRun = () => { if (hsSteps.length > 0) setHsPlaying(true); };
  const hsPause = () => setHsPlaying(false);
  const hsReset = () => { setHsPlaying(false); setHsIdx(-1); };
  const hsJumpToEnd = () => { setHsPlaying(false); setHsIdx(hsSteps.length - 1); };

  useEffect(() => {
    if (!hsPlaying) return;
    if (hsIdx + 1 >= hsSteps.length) { setHsPlaying(false); return; }
    const t = setTimeout(() => setHsIdx((i) => i + 1), hsSpeed);
    return () => clearTimeout(t);
  }, [hsPlaying, hsIdx, hsSteps.length, hsSpeed]);

  /* ← / → step through a computed run */
  useEffect(() => {
    if (hsSteps.length === 0) return undefined;
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); setHsPlaying(false); setHsIdx((i) => Math.min(i + 1, hsSteps.length - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setHsPlaying(false); setHsIdx((i) => Math.max(i - 1, -1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hsSteps.length]);

  /* ─── selection ─── */
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const deleteSelected = useCallback(() => {
    setSelectedIds((sel) => {
      if (sel.size === 0) return sel;
      const doomed = sel;
      setNodes((prev) => prev.filter((n) => !doomed.has(n.id)));
      setEdges((prev) => prev.filter((e) => !doomed.has(e.a) && !doomed.has(e.b)));
      setColoring((prev) => {
        const next = { ...prev };
        doomed.forEach((id) => { delete next[id]; });
        return next;
      });
      resetSteps();
      flash(`Deleted ${doomed.size} vertex${doomed.size === 1 ? '' : 'es'}.`);
      return new Set();
    });
  }, [flash, resetSteps]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName)) return;
      if (e.key === 'Escape') { clearSelection(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, clearSelection, deleteSelected]);

  const onMarqueeSelect = useCallback((rect) => {
    if (connectMode) return;
    const hit = new Set();
    nodes.forEach((n) => {
      if (n.x >= rect.x1 && n.x <= rect.x2 && n.y >= rect.y1 && n.y <= rect.y2) hit.add(n.id);
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      hit.forEach((id) => next.add(id));
      return next;
    });
  }, [nodes, connectMode]);

  /* ─── interaction ─── */
  const onNodeClick = useCallback((id) => {
    if (!connectMode) return;
    if (connectSrc === null) { setConnectSrc(id); return; }
    if (connectSrc === id) { setConnectSrc(null); return; }
    tryAddEdge(connectSrc, id);
    setConnectSrc(null);
  }, [connectMode, connectSrc, tryAddEdge]);

  const dragIdRef = useRef(dragId);
  const dragOffRef = useRef(dragOff);
  const selectedIdsRef = useRef(selectedIds);
  const nodeDragMetaRef = useRef(null); // { startClient, moved, originPositions }
  dragIdRef.current = dragId;
  dragOffRef.current = dragOff;
  selectedIdsRef.current = selectedIds;

  const onMouseDownNode = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    if (connectMode) { onNodeClick(node.id); return; }

    const shift = !!e.shiftKey;
    if (shift) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return; // Shift+click toggles only; no drag
    }

    // Plain click: if node not in selection, select only it; else keep multi-selection for group drag
    setSelectedIds((prev) => {
      if (prev.has(node.id) && prev.size > 1) return prev;
      return new Set([node.id]);
    });

    const pt = canvasRef.current?.getSvgPoint(e);
    if (!pt) return;
    const src = e.touches?.[0] || e;
    nodeDragMetaRef.current = {
      startClient: { x: src.clientX, y: src.clientY },
      moved: false,
      primaryId: node.id,
    };
    setDragId(node.id);
    setDragOff({ x: pt.x - node.x, y: pt.y - node.y });
  };

  // Window-level node drag (moves whole selection when primary is selected).
  useEffect(() => {
    if (dragId === null) return undefined;

    const onMove = (e) => {
      if (e.cancelable && e.touches) e.preventDefault();
      const pt = canvasRef.current?.getSvgPoint(e);
      if (!pt) return;
      const id = dragIdRef.current;
      const off = dragOffRef.current;
      if (id === null) return;

      const src = e.touches?.[0] || e;
      const meta = nodeDragMetaRef.current;
      if (meta && !meta.moved) {
        const d = Math.hypot(src.clientX - meta.startClient.x, src.clientY - meta.startClient.y);
        if (d < 5) return;
        meta.moved = true;
      }

      const nx = Math.max(NODE_R, Math.min(W - NODE_R, pt.x - off.x));
      const ny = Math.max(NODE_R, Math.min(H - NODE_R, pt.y - off.y));

      setNodes((prev) => {
        const primary = prev.find((n) => n.id === id);
        if (!primary) return prev;
        const dx = nx - primary.x;
        const dy = ny - primary.y;
        const sel = selectedIdsRef.current;
        const moving = sel.has(id) && sel.size > 1 ? sel : new Set([id]);
        return prev.map((n) => {
          if (!moving.has(n.id)) return n;
          if (n.id === id) return { ...n, x: nx, y: ny };
          return {
            ...n,
            x: Math.max(NODE_R, Math.min(W - NODE_R, n.x + dx)),
            y: Math.max(NODE_R, Math.min(H - NODE_R, n.y + dy)),
          };
        });
      });
    };
    const onUp = () => {
      nodeDragMetaRef.current = null;
      setDragId(null);
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
  }, [dragId, W, H, NODE_R]);

  /* ─── fill helper ─── */
  const getFill = (id) => {
    const c = dispColoring[id];
    return c != null && c >= 0 && c < pal.length ? pal[c] : '#334155';
  };

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const newEdgeSet = useMemo(
    () => new Set((hl.newEdges ?? []).map((e) => `${e.a}-${e.b}`)),
    [hl.newEdges],
  );

  /* ─── aux digraph layout: every colour class on a circle ─── */
  const auxR = k > 8 ? 14 : 19;
  const auxLayout = useMemo(() => {
    const m = new Map();
    const R = 100, c0 = AUX_SIZE / 2;
    for (let c = 0; c < k; c++) {
      const a = (c / k) * 2 * Math.PI - Math.PI / 2;
      m.set(c, { x: c0 + R * Math.cos(a), y: c0 + R * Math.sin(a) });
    }
    return m;
  }, [k]);

  const auxPathSet = useMemo(() => {
    const s = new Set();
    const path = aux?.path ?? [];
    for (let i = 0; i < path.length - 1; i++) s.add(`${path[i]}-${path[i + 1]}`);
    return s;
  }, [aux]);

  const stepBadge = (type) => {
    const [cls, label] = STEP_STYLE[type] || ['bg-slate-500/20 text-slate-300', type];
    return <span className={`inline-block shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
  };

  const levelLabel = (depth) =>
    depth === 0 ? 'Algorithm P' : depth === 1 ? 'Algorithm P′' : `P′ on G[B − y₁] · level ${depth - 1}`;

  const runSummary = hsStats && [
    `${hsStats.steps} steps`,
    `${hsStats.improper} improper edge${hsStats.improper === 1 ? '' : 's'} fixed`,
    `${hsStats.shifts} Lemma 2.1 shift${hsStats.shifts === 1 ? '' : 's'}`,
    hsStats.case1 ? `Case 1 ×${hsStats.case1}` : null,
    hsStats.case2 ? `Case 2 ×${hsStats.case2}` : null,
    hsStats.maxDepth >= 2 ? `recursion depth ${hsStats.maxDepth - 1}` : null,
  ].filter(Boolean).join(' · ');

  const padNeeded = nodes.length % k === 0 ? 0 : k - (nodes.length % k);

  /* ════════════════════════ RENDER ════════════════════════ */
  return (
    <>
      <main className="algo-dark min-h-screen">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* ── header ── */}
          <header className="mb-2">
            <h1 className="text-2xl font-bold text-slate-100">
              Hajnal–Szemerédi Equitable Coloring
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-4xl">
              Every graph with maximum degree &Delta;(G) &le; r has an <b className="text-slate-200">equitable</b> (r+1)-coloring:
              a proper coloring whose color classes differ in size by at most one. This page runs the
              polynomial-time algorithm from Kierstead &amp; Kostochka,{' '}
              <a href={PAPER_URL} target="_blank" rel="noopener noreferrer"
                className="text-indigo-300 underline decoration-indigo-500/50 hover:text-indigo-200">
                A Short Proof of the Hajnal–Szemerédi Theorem on Equitable Colouring
              </a>{' '}
              (Combin. Probab. Comput. 17, 2008).
            </p>
            <p className="text-slate-500 text-xs mt-1">
              &Delta;(G) is the maximum degree of G: the largest number of edges meeting at a single vertex.
            </p>
          </header>

          {/* ── toast ── */}
          {toast && (
            <div className="border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300">
              {toast}
            </div>
          )}

          {/* ── stats ── */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span>|V| = {nodes.length}</span>
            <span>|E| = {dispEdges.length}{curStep && dispEdges.length !== edges.length ? ` of ${edges.length}` : ''}</span>
            <span className={actualMaxDeg > r ? 'text-red-400' : ''}>
              &Delta;(G) = {actualMaxDeg}
            </span>
            <span>r = {r}, k = r + 1 = {k} colors</span>
            {curStep && <span className="text-indigo-300">Step {hsIdx + 1} / {hsSteps.length}</span>}
            <span className={improperCount > 0 ? 'text-red-400' : 'text-emerald-400'}>
              {improperCount > 0 ? `${improperCount} improper edge${improperCount > 1 ? 's' : ''}` : 'proper'}
            </span>
            {!curStep && nodes.length > 0 && (
              <span className={isEquitable ? 'text-emerald-400' : 'text-amber-400'}>
                {isEquitable ? 'equitable' : 'not equitable'}
              </span>
            )}
          </div>

          {/* ── algorithm controls ── */}
          <section className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-300">
                Algorithm P (Kierstead–Kostochka, Theorem 3.2)
              </h2>
              {runSummary && <span className="text-xs text-slate-400">{runSummary}</span>}
            </div>

            {/* presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Load&nbsp;preset:</span>
              {PRESETS.map(([id, label]) => (
                <button key={id} onClick={() => loadPreset(id)}
                  className="text-xs bg-slate-800 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-300 font-medium px-3 py-1.5 rounded-lg transition-colors">
                  {label}
                </button>
              ))}
            </div>

            <GraphToolbar
              onNewRandom={newRandomGraph}
              onPlanarLayout={drawPlanarAsPossible}
              onDownload={downloadCurrentGraph}
              onLoad={loadGraphFromFile}
            />

            {/* playback */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => onCompute()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors">
                {hsSteps.length ? 'Recompute' : 'Compute Steps'}
              </button>
              <div className="h-6 w-px bg-slate-700" />
              {!hsPlaying ? (
                <button onClick={hsRun} disabled={hsSteps.length === 0 || hsIdx + 1 >= hsSteps.length}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold px-3 py-2 rounded-lg shadow-sm transition-colors disabled:cursor-not-allowed">
                  &#9654; Play
                </button>
              ) : (
                <button onClick={hsPause}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-3 py-2 rounded-lg shadow-sm transition-colors">
                  &#9646;&#9646; Pause
                </button>
              )}
              <button onClick={hsBack} disabled={hsIdx <= -1 || hsPlaying} title="Previous step (←)"
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 disabled:text-slate-500 text-sm font-medium px-2.5 py-2 rounded-lg transition-colors disabled:cursor-not-allowed">
                &#9664;
              </button>
              <button onClick={hsForward} disabled={hsIdx + 1 >= hsSteps.length || hsPlaying} title="Next step (→)"
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 disabled:text-slate-500 text-sm font-medium px-2.5 py-2 rounded-lg transition-colors disabled:cursor-not-allowed">
                &#9654;
              </button>
              <button onClick={hsJumpToEnd} disabled={hsSteps.length === 0 || hsPlaying} title="Last step"
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 disabled:text-slate-500 text-sm font-medium px-2.5 py-2 rounded-lg transition-colors disabled:cursor-not-allowed">
                &#9654;&#9654;
              </button>
              <button onClick={hsReset} disabled={hsSteps.length === 0} title="Back to the graph you built"
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 disabled:text-slate-500 text-sm font-medium px-2.5 py-2 rounded-lg transition-colors disabled:cursor-not-allowed">
                &#8635; Reset
              </button>
              <div className="h-6 w-px bg-slate-700" />
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none"
                title="Fold consecutive stages that create no improper edge into a single step.">
                <input type="checkbox" checked={mergeQuiet} onChange={toggleMergeQuiet} className="accent-indigo-500" />
                Merge quiet stages
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none"
                title="Among the choices Lemma 2.3 allows, take the one with the least work (Case 1, y₁ from V+, X = V−). Turn off to see Case 2 and the recursive call on G[B − y₁].">
                <input type="checkbox" checked={shortcuts} onChange={toggleShortcuts} className="accent-indigo-500" />
                Shortest route
              </label>
              <div className="flex items-center gap-1.5 ml-auto">
                <label className="text-xs text-slate-400">Speed</label>
                <input type="range" min="500" max="6000" step="250" value={hsSpeed} onChange={(e) => setHsSpeed(Number(e.target.value))} className="w-24 accent-indigo-500" />
                <span className="text-xs text-slate-400 w-14 text-right">{(hsSpeed / 1000).toFixed(2)}s</span>
              </div>
            </div>

            {/* progress */}
            {hsSteps.length > 0 && (
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(0, ((hsIdx + 1) / hsSteps.length) * 100)}%` }} />
              </div>
            )}

            {/* step message */}
            {curStep && (
              <div className="bg-slate-800 rounded-xl px-4 py-3 border border-slate-700 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {stepBadge(curStep.type)}
                  {curStep.ref && (
                    <span className="text-[10px] font-mono text-slate-400 border border-slate-600 rounded px-1.5 py-0.5">{curStep.ref}</span>
                  )}
                  <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${curStep.depth >= 2 ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500'}`}>
                    {levelLabel(curStep.depth)}
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">{curStep.message}</p>
              </div>
            )}

            {/* step timeline */}
            {hsSteps.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Steps">
                {hsSteps.map((st, i) => (
                  <button key={i} onClick={() => { setHsPlaying(false); setHsIdx(i); }}
                    title={`${i + 1}. ${(STEP_STYLE[st.type] || ['', st.type])[1]} — ${levelLabel(st.depth)}`}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${i === hsIdx
                      ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'} ${st.depth >= 2 ? 'border-dashed' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STEP_DOT[st.type] || 'bg-slate-400'}`} />
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── colour classes banner ── */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-300">Color Classes</h3>
              <span className="text-[11px] text-slate-400">
                Equitable target: each class has {nodes.length > 0 ? <b>{Math.floor(nodes.length / k)}</b> : '?'}
                {nodes.length % k > 0 && <> or <b>{Math.floor(nodes.length / k) + 1}</b></>} vertices.
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
              {pal.map((c, i) => {
                const realCnt = nodes.reduce((acc, n) => acc + (dispColoring[n.id] === i ? 1 : 0), 0);
                const padCnt = dummyNodes.reduce((acc, d) => acc + (dispColoring[d.id] === i ? 1 : 0), 0);
                const outOfScope = aux && !aux.classes.includes(i);
                return (
                  <div key={i}
                    className={`flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 transition-opacity ${outOfScope ? 'opacity-40' : ''}`}>
                    <span className="w-4 h-4 rounded-full border border-black/20 shrink-0" style={{ background: c }} />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-300">
                        <b>{className(i)}</b> · {realCnt}
                        {padCnt > 0 && <span className="text-slate-500"> + {padCnt} pad</span>}
                      </div>
                      {classTags[i].length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {classTags[i].map((t) => (
                            <span key={t} className={`text-[9px] font-bold px-1 rounded ${TAG_STYLE[t] || 'bg-slate-700 text-slate-200'}`}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button onClick={applyModColoring} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors">
                Reset to mod-{k}
              </button>
              <button onClick={applyGreedyColoring} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors">
                Greedy proper
              </button>
              <span className="text-[10px] text-slate-500 ml-1">
                Tags: V+ / V− large and small class · A accessible · B the rest · A′ terminal family · U its cut class · W, X, Y classes used by Lemma 2.3.
              </span>
            </div>
          </section>

          {/* ── main content: graph + sidebar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ─ main graph ─ */}
            <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-300">Graph G</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setConnectMode((m) => !m); setConnectSrc(null); }}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${connectMode ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}>
                    {connectMode ? 'Connect ON' : 'Connect Mode'}
                  </button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-[10px] text-indigo-300">{selectedIds.size} selected</span>
                      <button onClick={deleteSelected}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-800/60 bg-red-950/40 text-red-300 hover:bg-red-900/50 transition-colors">
                        Delete
                      </button>
                      <button onClick={clearSelection}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">
                        Deselect
                      </button>
                    </>
                  )}
                  <span className="text-[10px] text-slate-400">Zoom {zoomLabel.toFixed(1)}x</span>
                </div>
              </div>

              <GraphCanvas
                ref={canvasRef}
                canvasKey={canvasKey}
                width={W}
                height={H}
                enableZoomPan
                enableMarquee={!connectMode}
                cursor={connectMode ? 'crosshair' : undefined}
                tipLeft="Double-click empty space to add · Shift+click / Shift+drag to select"
                tipRight="Scroll to zoom · Drag empty space to pan"
                onBackgroundDoubleClick={(pt) => { if (!connectMode) addNodeAt(pt.x, pt.y); }}
                onBackgroundClick={() => { if (!connectMode) clearSelection(); }}
                onMarqueeSelect={onMarqueeSelect}
                onZoomChange={setZoomLabel}
              >
                  {/* edges */}
                  {dispEdges.map(({ a, b }) => {
                    const na = nodeById.get(a);
                    const nb = nodeById.get(b);
                    if (!na || !nb) return null;
                    const isBad = hl.improperEdge && hl.improperEdge.a === Math.min(a, b) && hl.improperEdge.b === Math.max(a, b);
                    const isMono = dispColoring[a] != null && dispColoring[a] === dispColoring[b];
                    const isNew = newEdgeSet.has(`${Math.min(a, b)}-${Math.max(a, b)}`);
                    const touchesLifted = liftedSet.has(a) || liftedSet.has(b);
                    let stroke = '#cbd5e1'; let sw = 1.5;
                    if (isBad) { stroke = '#ef4444'; sw = 4; }
                    else if (isMono) { stroke = '#f87171'; sw = 2.5; }
                    else if (isNew) { stroke = '#34d399'; sw = 3; }
                    return (
                      <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={touchesLifted ? '5 4' : undefined}
                        opacity={touchesLifted ? 0.55 : 1}
                        style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }} />
                    );
                  })}

                  {/* padding vertices K_p (only while a run is shown) */}
                  {dummyNodes.length > 0 && (
                    <g style={{ pointerEvents: 'none' }}>
                      {dummyNodes.flatMap((d, i) => dummyNodes.slice(i + 1).map((e) => (
                        <line key={`pad-${d.id}-${e.id}`} x1={d.x} y1={d.y} x2={e.x} y2={e.y}
                          stroke="#64748b" strokeWidth={1.2} strokeDasharray="3 3" />
                      )))}
                      {dummyNodes.map((d) => (
                        <g key={`pad-${d.id}`}>
                          <circle cx={d.x} cy={d.y} r={15} fill={getFill(d.id)} fillOpacity={0.6}
                            stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 2"
                            style={{ transition: 'fill 0.4s ease' }} />
                          <text x={d.x} y={d.y} textAnchor="middle" dy=".35em" fontSize={10} fontWeight="700" fill="#fff">{d.label}</text>
                        </g>
                      ))}
                      <text x={W - 12} y={H - 90} textAnchor="end" fontSize={10} fill="#94a3b8">
                        padding K{dummyNodes.length}
                      </text>
                    </g>
                  )}

                  {/* connect-mode pending line */}
                  {connectMode && connectSrc !== null && (() => {
                    const src = nodeById.get(connectSrc);
                    if (!src) return null;
                    return <circle cx={src.x} cy={src.y} r={28} fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 3" className="animate-pulse-slow" />;
                  })()}

                  {/* nodes */}
                  {nodes.map((n) => {
                    const isMoved = movedSet.has(n.id);
                    const isProc = hl.processing === n.id;
                    const isLifted = liftedSet.has(n.id);
                    const role = roleOf.get(n.id);
                    const isSrc = connectSrc === n.id;
                    const isSel = selectedIds.has(n.id);
                    let ring = '#94a3b8', rw = 1.5;
                    if (isMoved) { ring = '#22c55e'; rw = 4; }
                    else if (role) { ring = '#fbbf24'; rw = 3; }
                    else if (isProc) { ring = '#6366f1'; rw = 3; }
                    else if (isSrc) { ring = '#22c55e'; rw = 3; }
                    else if (isSel) { ring = '#a5b4fc'; rw = 3; }
                    return (
                      <g key={n.id} data-node="true"
                        onMouseDown={(e) => onMouseDownNode(e, n)} onTouchStart={(e) => onMouseDownNode(e, n)}
                        style={{ cursor: connectMode ? 'pointer' : dragId === n.id ? 'grabbing' : 'grab', touchAction: 'none' }}>
                        {isMoved && <circle cx={n.x} cy={n.y} r={30} fill="none" stroke="#22c55e" strokeWidth={2} opacity={0.4} className="animate-pulse-slow" />}
                        {isSel && !isMoved && (
                          <circle cx={n.x} cy={n.y} r={NODE_R + 6} fill="none" stroke="#6366f1" strokeWidth={2} opacity={0.85} />
                        )}
                        <circle cx={n.x} cy={n.y} r={NODE_R} fill={isLifted ? '#0f172a' : getFill(n.id)} stroke={ring} strokeWidth={rw}
                          strokeDasharray={isLifted ? '4 3' : undefined}
                          style={{ transition: 'fill 0.4s ease, stroke 0.3s, stroke-width 0.3s' }} />
                        <text x={n.x} y={n.y} textAnchor="middle" dy=".35em" fontSize={12} fontWeight="700"
                          fill={isLifted ? '#cbd5e1' : '#fff'} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          {n.id}
                        </text>
                        {role && (
                          <text x={n.x} y={n.y - NODE_R - 7} textAnchor="middle" fontSize={13} fontWeight="800"
                            fill="#fbbf24" stroke="#0f172a" strokeWidth={3} paintOrder="stroke"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {ROLE_LABEL[role] || role}
                          </text>
                        )}
                        {isLifted && (
                          <text x={n.x} y={n.y + NODE_R + 13} textAnchor="middle" fontSize={9}
                            fill="#94a3b8" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            set aside
                          </text>
                        )}
                      </g>
                    );
                  })}
              </GraphCanvas>
              {curStep && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-400 inline-block" /> edges added this step</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-1 bg-red-500 inline-block" /> improper edge</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-green-500 inline-block" /> moved vertex</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 inline-block" /> z, y₁, y₂ (Lemma 2.3)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-400 inline-block" /> set aside / padding</span>
                </div>
              )}
            </div>

            {/* ─ sidebar ─ */}
            <div className="space-y-4">

              {/* auxiliary digraph H(G,f) */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
                <h3 className="text-sm font-bold text-slate-300 mb-1">Auxiliary Digraph H(G,&thinsp;f)</h3>
                <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                  One node per color class (the number is its size). An arc V&rarr;W means some vertex of V has
                  no neighbor in W, so it could move there. Classes that can reach V&minus; are <i>accessible</i>.
                </p>
                <svg viewBox={`0 0 ${AUX_SIZE} ${AUX_SIZE}`} className="w-full h-auto">
                  <defs>
                    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M0 0L10 5L0 10z" fill="#64748b" />
                    </marker>
                    <marker id="ahp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M0 0L10 5L0 10z" fill="#a78bfa" />
                    </marker>
                  </defs>

                  {!aux && (
                    <text x={AUX_SIZE / 2} y={AUX_SIZE / 2} textAnchor="middle" fontSize="12" fill="#94a3b8">
                      Compute steps to see H(G,f)
                    </text>
                  )}

                  {/* arcs */}
                  {aux && aux.arcs.map((e) => {
                    const p1 = auxLayout.get(e.from);
                    const p2 = auxLayout.get(e.to);
                    if (!p1 || !p2) return null;
                    const isP = auxPathSet.has(`${e.from}-${e.to}`);
                    const dx = p2.x - p1.x, dy = p2.y - p1.y;
                    const d = Math.hypot(dx, dy) || 1;
                    const off = auxR + 3;
                    const hasReverse = aux.arcs.some((o) => o.from === e.to && o.to === e.from);
                    const perp = hasReverse ? 4 : 0;
                    const nx = (-dy / d) * perp, ny = (dx / d) * perp;
                    return (
                      <line key={`${e.from}-${e.to}`}
                        x1={p1.x + (dx / d) * off + nx} y1={p1.y + (dy / d) * off + ny}
                        x2={p2.x - (dx / d) * off + nx} y2={p2.y - (dy / d) * off + ny}
                        stroke={isP ? '#a78bfa' : '#475569'} strokeWidth={isP ? 2.5 : 1}
                        markerEnd={isP ? 'url(#ahp)' : 'url(#ah)'}
                        style={{ transition: 'stroke 0.3s' }} />
                    );
                  })}

                  {/* classes */}
                  {aux && pal.map((fill, c) => {
                    const p = auxLayout.get(c);
                    const inScope = aux.classes.includes(c);
                    const inA = aux.A?.includes(c);
                    const onPath = aux.path.includes(c);
                    let stroke = '#475569', sw = 1.5;
                    if (c === aux.vPlus) { stroke = '#60a5fa'; sw = 3.5; }
                    else if (c === aux.vMinus) { stroke = '#fbbf24'; sw = 3.5; }
                    else if (onPath) { stroke = '#a78bfa'; sw = 3; }
                    const tags = classTags[c].filter((t) => t !== 'A' && t !== 'B');
                    return (
                      <g key={c} opacity={inScope ? 1 : 0.2} style={{ transition: 'opacity 0.3s' }}>
                        {inA && <circle cx={p.x} cy={p.y} r={auxR + 6} fill="none" stroke="#34d399" strokeWidth={1.5} strokeDasharray="3 3" />}
                        <circle cx={p.x} cy={p.y} r={auxR} fill={fill} stroke={stroke} strokeWidth={sw}
                          style={{ transition: 'stroke 0.3s' }} />
                        <text x={p.x} y={p.y} textAnchor="middle" dy=".35em" fontSize={11} fontWeight="700" fill="#fff"
                          style={{ pointerEvents: 'none' }}>
                          {curStep?.sizes?.[c] ?? ''}
                        </text>
                        <text x={p.x} y={p.y + auxR + 16} textAnchor="middle" fontSize={9} fill="#cbd5e1"
                          style={{ pointerEvents: 'none' }}>
                          {className(c)}{tags.length ? ` · ${tags.join(' ')}` : ''}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                {aux && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 inline-block" /> V+ (s+1)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 inline-block" /> V− (s−1)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-dashed border-emerald-400 inline-block" /> accessible (A)</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-violet-400 inline-block" /> path</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 opacity-40 inline-block" /> outside sub-problem</span>
                  </div>
                )}
              </div>

              {/* parameters */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2">
                <h3 className="text-sm font-bold text-slate-300">Parameters</h3>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  r =
                  <input type="number" min={1} max={20} value={maxDeg}
                    onChange={(e) => setMaxDeg(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-14 px-2 py-1 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 text-center text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                  <span className="text-slate-300">&rarr; k = r + 1 = <b>{k}</b> colors</span>
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  The theorem needs &Delta;(G) &le; r. Right now &Delta;(G) = {actualMaxDeg}
                  {actualMaxDeg > r
                    ? <span className="text-red-400">, which is larger than r: raise r or remove edges.</span>
                    : actualMaxDeg === r ? ', so r = Δ(G).' : `, so any r ≥ ${actualMaxDeg} works (the paper's r is Δ(G)).`}
                </p>
                {padNeeded > 0 && nodes.length > 0 && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    |V| = {nodes.length} is not a multiple of {k}, so the run adds {padNeeded} padding
                    vertices forming K<sub>{padNeeded}</sub> (proof of Theorem 2.4). They show up in the
                    bottom-right corner and are dropped at the end.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── how the algorithm works ── */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <button onClick={() => setExplainOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors">
              <span>How the algorithm works</span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${explainOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {explainOpen && (
              <div className="px-5 pb-5 pt-4 border-t border-slate-700 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 text-xs text-slate-400 leading-relaxed">
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Algorithm P (Theorem 3.2)</h4>
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>
                      Let k = r + 1 and s = n / k. If n is not a multiple of k, add p padding vertices that form a
                      clique K<sub>p</sub>. They keep &Delta; &le; r and are removed at the end.
                    </li>
                    <li>
                      Remove every edge and color v<sub>i</sub> with class (i − 1) mod k. With no edges this is
                      proper, and every class has exactly s vertices.
                    </li>
                    <li>
                      For i = 2, …, n, add back the edges from v<sub>i</sub> to v<sub>1</sub>, …, v<sub>i−1</sub>.
                      Every new edge touches v<sub>i</sub>, so v<sub>i</sub> is the only vertex that can now sit next to a
                      neighbor of the same color (an <b className="text-slate-300">improper edge</b>).
                    </li>
                    <li>
                      If it does, move v<sub>i</sub> to a class where it has no neighbors. One exists: v<sub>i</sub> has at most r
                      neighbors and one of them is in its own class. The coloring is now <b className="text-slate-300">nearly equitable</b>:
                      one class V+ has s + 1 vertices, one class V− has s − 1. Hand it to P′.
                    </li>
                  </ol>
                  <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider pt-1">Lemma 2.1: the easy case</h4>
                  <p>
                    Build H(G, f) on the color classes and let A be the classes that can reach V−. If V+ is in A, take a path
                    V+ = V<sub>1</sub> &rarr; … &rarr; V<sub>j</sub> = V− and move one movable vertex along every arc at the same time.
                    V+ shrinks, V− grows, and the classes in between keep their size, so the coloring is equitable again.
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Algorithm P′ when V+ is not accessible (Theorem 2.4)</h4>
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>
                      Let B be the classes outside A, m = |A| − 1 and q = r − m. No vertex of B can move into A, so each one has a
                      neighbor in every class of A and at most q − 1 neighbors inside B (inequality 2.1). G[B] is a smaller
                      instance of the same problem with q colors.
                    </li>
                    <li>
                      Pick the class U whose removal cuts the fewest classes off from V−. Those classes form A′. Every class in A′ is
                      <i> terminal</i>, and its vertices can only move inside A′ or into U.
                    </li>
                    <li>
                      An edge zy with z &isin; W &isin; A′ and y &isin; B is <i>solo</i> if z is y&apos;s only neighbor in W. Lemma 2.3
                      guarantees a solo vertex z that can either move to another class X of A, or has two non-adjacent special
                      neighbors y<sub>1</sub>, y<sub>2</sub> in B.
                    </li>
                    <li>
                      Set y<sub>1</sub> aside and make G[B − y<sub>1</sub>] equitable with its q colors by calling P′ on it. This is the
                      recursive call; it is skipped when y<sub>1</sub> came from V+.
                    </li>
                    <li>
                      <b className="text-slate-300">Case 1</b> (z can move to X): move z to X and y<sub>1</sub> into W. X is now the big class
                      and is accessible inside A, so Lemma 2.1 finishes.
                    </li>
                    <li>
                      <b className="text-slate-300">Case 2</b> (z cannot move inside A): move z into a class of B where it has no neighbor
                      and y<sub>1</sub> into W. That class becomes the new V+, y<sub>2</sub> can now move into W, and A grows, so q
                      strictly drops. Repeat. P′ needs at most r rounds, and the whole algorithm runs in O(n<sup>5</sup>).
                    </li>
                  </ol>
                  <p className="text-slate-500">
                    <b className="text-slate-400">Options.</b> <i>Merge quiet stages</i> folds stages without an improper edge into
                    one step. <i>Shortest route</i> chooses, among the options Lemma 2.3 allows, the one with the least work. Turn it
                    off to watch the recursive call and Case 2 (try Sample Graph 2).
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── graph builder ── */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <button onClick={() => setBuilderOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                Graph Builder
              </span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${builderOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {builderOpen && (
              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-slate-700 pt-4">
                {/* nodes */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vertices</h4>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Count" value={nodeCount} onChange={(e) => setNodeCount(e.target.value)} min={1} max={100}
                      onKeyDown={(e) => { if (e.key === 'Enter') addBulkNodes(); }}
                      className="flex-1 px-3 py-2 text-sm border border-slate-600 rounded-lg bg-slate-800 text-slate-200 focus:ring-2 focus:ring-indigo-300" />
                    <button onClick={addBulkNodes}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm">
                      Add
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Or double-click the canvas to place a vertex.</p>
                  <button onClick={clearAll}
                    className="w-full text-xs bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 py-2 rounded-lg transition-colors">
                    Clear Everything
                  </button>
                </div>

                {/* edges */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Edges</h4>
                  <div className="space-y-1">
                    <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={3} placeholder="0-1, 1-2, 2-3, ..."
                      className="w-full px-3 py-2 text-sm border border-slate-600 rounded-lg bg-slate-800 text-slate-200 focus:ring-2 focus:ring-indigo-300 font-mono" />
                    <button onClick={applyBulkEdges}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg transition-colors shadow-sm">
                      Apply Edges
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Or enable <b>Connect Mode</b> above, then click two vertices to connect.
                    Max degree r&nbsp;=&nbsp;{r} is enforced.
                  </p>
                </div>

                {/* info */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Reference</h4>
                  <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
                    <p><b>Hajnal–Szemerédi Theorem:</b> every graph with &Delta;(G)&nbsp;&le;&nbsp;r has an equitable (r+1)-coloring.</p>
                    <p><b>Equitable:</b> class sizes differ by at most 1. <b>Nearly equitable:</b> one class of s+1, one of s−1, the rest s.</p>
                    <p><b>Improper edge:</b> an edge whose two ends have the same color.</p>
                    <p><b>Mod coloring:</b> vertex v &rarr; class (v&nbsp;mod&nbsp;k). For k=4: {'{'}0,4,8,12{'}'} are Red, {'{'}1,5,9,13{'}'} Blue, etc.</p>
                  </div>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>
    </>
  );
}
