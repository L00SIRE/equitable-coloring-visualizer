import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import GraphToolbar from "../Components/GraphToolbar";
import { createRandomGraph } from "../canvas/randomGraph";
import { buildGraphPayload, downloadGraphJson, toFromToEdges } from "../canvas/graphIO";
import { layoutPlanarAsPossible } from "../canvas/planarLayout";

// 12-color palette (tailwind-inspired)
const PALETTE = [
  "#ef4444", // red-500
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#84cc16", // lime-500
  "#06b6d4", // cyan-500
  "#a855f7", // purple-500
];

const SVG_W = 800;
const SVG_H = 500;
const NODE_R = 25;

const PSEUDO = [
  "function greedyColor(G, order):",
  "  color[v] = 0 for all v",
  "  for v in order:",
  "    used = { color[u] : u in N(v), color[u] > 0 }",
  "    c = smallest positive int not in used",
  "    color[v] = c",
  "  return color",
];

// ---------- Graph utilities ----------
const adjacencyMap = (nodes, edges) => {
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, new Set()));
  edges.forEach((e) => {
    if (adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from).add(e.to);
      adj.get(e.to).add(e.from);
    }
  });
  return adj;
};

const degreeOf = (adj, id) => (adj.get(id) ? adj.get(id).size : 0);

const maxDegree = (adj) => {
  let d = 0;
  adj.forEach((s) => {
    if (s.size > d) d = s.size;
  });
  return d;
};

const isConnected = (nodes, adj) => {
  if (nodes.length === 0) return true;
  const start = nodes[0].id;
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const v = q.shift();
    adj.get(v).forEach((u) => {
      if (!seen.has(u)) {
        seen.add(u);
        q.push(u);
      }
    });
  }
  return seen.size === nodes.length;
};

const isCompleteGraph = (nodes, adj) => {
  const n = nodes.length;
  if (n < 2) return false;
  for (const node of nodes) {
    if (adj.get(node.id).size !== n - 1) return false;
  }
  return true;
};

// Odd cycle: every vertex has degree 2, graph is connected, odd # of vertices
const isOddCycle = (nodes, adj) => {
  const n = nodes.length;
  if (n < 3 || n % 2 === 0) return false;
  for (const node of nodes) {
    if (adj.get(node.id).size !== 2) return false;
  }
  return isConnected(nodes, adj);
};

// ---------- Ordering strategies ----------
const orderByID = (nodes) =>
  [...nodes].sort((a, b) => a.id - b.id).map((n) => n.id);

const orderRandom = (nodes) => {
  const arr = nodes.map((n) => n.id);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const orderLargestFirst = (nodes, adj) =>
  [...nodes]
    .sort((a, b) => degreeOf(adj, b.id) - degreeOf(adj, a.id) || a.id - b.id)
    .map((n) => n.id);

// Smallest-last: repeatedly remove vertex of smallest degree, prepend it
const orderSmallestLast = (nodes, adj) => {
  const remaining = new Map();
  nodes.forEach((n) => remaining.set(n.id, new Set(adj.get(n.id))));
  const result = [];
  while (remaining.size > 0) {
    let minId = null;
    let minDeg = Infinity;
    remaining.forEach((nbrs, id) => {
      if (nbrs.size < minDeg || (nbrs.size === minDeg && id < minId)) {
        minDeg = nbrs.size;
        minId = id;
      }
    });
    result.push(minId);
    const nbrs = remaining.get(minId);
    remaining.delete(minId);
    nbrs.forEach((u) => {
      if (remaining.has(u)) remaining.get(u).delete(minId);
    });
  }
  return result.reverse();
};

// DSATUR: at each step pick uncolored with highest saturation (distinct colors
// in neighborhood), tie-break by degree, then by id.
const orderDSATUR = (nodes, adj) => {
  const color = new Map();
  nodes.forEach((n) => color.set(n.id, 0));
  const remaining = new Set(nodes.map((n) => n.id));
  const order = [];
  while (remaining.size > 0) {
    let best = null;
    let bestSat = -1;
    let bestDeg = -1;
    remaining.forEach((id) => {
      const cols = new Set();
      adj.get(id).forEach((u) => {
        if (color.get(u) > 0) cols.add(color.get(u));
      });
      const sat = cols.size;
      const deg = adj.get(id).size;
      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && (best === null || id < best))
      ) {
        bestSat = sat;
        bestDeg = deg;
        best = id;
      }
    });
    order.push(best);
    remaining.delete(best);
    // assign greedy color so saturation updates make sense
    const used = new Set();
    adj.get(best).forEach((u) => {
      if (color.get(u) > 0) used.add(color.get(u));
    });
    let c = 1;
    while (used.has(c)) c++;
    color.set(best, c);
  }
  return order;
};

// ---------- Layout helpers ----------
const circularLayout = (n, cx = SVG_W / 2, cy = SVG_H / 2, r = 180) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n - Math.PI / 2;
    pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
  }
  return pts;
};

// ---------- Precompute step history ----------
const buildHistory = (nodes, adj, order) => {
  const history = [];
  const color = new Map();
  nodes.forEach((n) => color.set(n.id, 0));

  // initial state
  history.push({
    line: 1,
    current: null,
    used: [],
    assigned: null,
    colors: new Map(color),
    note: "Initialize all colors to 0 (uncolored).",
  });

  for (let i = 0; i < order.length; i++) {
    const v = order[i];
    history.push({
      line: 2,
      current: v,
      used: [],
      assigned: null,
      colors: new Map(color),
      note: `Visit vertex ${v}.`,
    });
    const used = new Set();
    adj.get(v).forEach((u) => {
      if (color.get(u) > 0) used.add(color.get(u));
    });
    const usedArr = [...used].sort((a, b) => a - b);
    history.push({
      line: 3,
      current: v,
      used: usedArr,
      assigned: null,
      colors: new Map(color),
      note: `Neighbor colors of ${v}: {${usedArr.join(", ") || "∅"}}.`,
    });
    let c = 1;
    while (used.has(c)) c++;
    color.set(v, c);
    history.push({
      line: 4,
      current: v,
      used: usedArr,
      assigned: c,
      colors: new Map(color),
      note: `Assign smallest available color ${c} to vertex ${v}.`,
    });
  }
  history.push({
    line: 5,
    current: null,
    used: [],
    assigned: null,
    colors: new Map(color),
    note: "Greedy coloring complete.",
  });
  return history;
};

// ---------- Sub-components ----------
const Btn = memo(function Btn({ onClick, children, variant = "indigo", title }) {
  const map = {
    indigo: "bg-indigo-600 hover:bg-indigo-700",
    violet: "bg-violet-600 hover:bg-violet-700",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    amber: "bg-amber-500 hover:bg-amber-600",
    slate: "bg-slate-8000 hover:bg-slate-600",
    red: "bg-red-500 hover:bg-red-600",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={`${map[variant]} text-white text-sm font-medium rounded-md px-3 py-1.5 shadow-sm transition-colors disabled:opacity-50`}
    >
      {children}
    </button>
  );
});

const TxtInput = memo(function TxtInput({ value, onChange, placeholder, className = "" }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border border-slate-600 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${className}`}
    />
  );
});

// ---------- Main component ----------
export default function GreedyColor() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [nextId, setNextId] = useState(1);

  // inputs
  const [bulkAddCount, setBulkAddCount] = useState("5");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [delNode, setDelNode] = useState("");
  const [kInput, setKInput] = useState("5");
  const [cycleInput, setCycleInput] = useState("5");
  const [regN, setRegN] = useState("6");
  const [regD, setRegD] = useState("3");
  const [error, setError] = useState("");

  // algorithm state
  const [strategy, setStrategy] = useState("id");
  const [order, setOrder] = useState([]);
  const [history, setHistory] = useState([]);
  const [step, setStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(700);
  const timerRef = useRef(null);

  // Setup demo graph on first mount
  useEffect(() => {
    const layout = circularLayout(5);
    const initialNodes = layout.map((p, i) => ({ id: i + 1, x: p.x, y: p.y }));
    const initialEdges = [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 5, to: 1 },
      { from: 1, to: 3 },
    ];
    setNodes(initialNodes);
    setEdges(initialEdges);
    setNextId(6);
    // eslint-disable-next-line
  }, []);

  // Compute adj whenever graph changes
  const adj = React.useMemo(() => adjacencyMap(nodes, edges), [nodes, edges]);
  const delta = React.useMemo(() => maxDegree(adj), [adj]);
  const connected = React.useMemo(() => isConnected(nodes, adj), [nodes, adj]);
  const completeG = React.useMemo(() => isCompleteGraph(nodes, adj), [nodes, adj]);
  const oddCyc = React.useMemo(() => isOddCycle(nodes, adj), [nodes, adj]);

  // Reset algorithm when graph changes
  useEffect(() => {
    setOrder([]);
    setHistory([]);
    setStep(0);
    setIsRunning(false);
  }, [nodes, edges, strategy]);

  // Animation tick
  useEffect(() => {
    if (!isRunning) return;
    if (step >= history.length - 1) {
      setIsRunning(false);
      return;
    }
    timerRef.current = setTimeout(() => setStep((s) => s + 1), speed);
    return () => clearTimeout(timerRef.current);
  }, [isRunning, step, history, speed]);

  // ---------- drag with boundary clamping ----------
  const svgRef = useRef(null);
  const dragRef = useRef({ id: null, ox: 0, oy: 0 });
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
  const onNodeDown = (e, id) => {
    e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    const n = nodes.find((n) => n.id === id);
    if (!n) return;
    dragRef.current = { id, ox: pt.x - n.x, oy: pt.y - n.y };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
  };
  const onMove = (e) => {
    if (dragRef.current.id === null) return;
    if (e.touches) e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    const x = Math.max(NODE_R, Math.min(SVG_W - NODE_R, pt.x - dragRef.current.ox));
    const y = Math.max(NODE_R, Math.min(SVG_H - NODE_R, pt.y - dragRef.current.oy));
    const id = dragRef.current.id;
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };
  const onUp = () => {
    dragRef.current = { id: null, ox: 0, oy: 0 };
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    window.removeEventListener("touchcancel", onUp);
  };
  useEffect(() => () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    window.removeEventListener("touchcancel", onUp);
    // eslint-disable-next-line
  }, []);

  // ---------- graph operations ----------
  const layoutNodes = useCallback((nodeList) => {
    const pts = circularLayout(nodeList.length);
    return nodeList.map((n, i) => ({ ...n, x: pts[i].x, y: pts[i].y }));
  }, []);

  const addNode = () => {
    setError("");
    const newNode = { id: nextId, x: SVG_W / 2, y: SVG_H / 2 };
    const all = [...nodes, newNode];
    setNodes(layoutNodes(all));
    setNextId(nextId + 1);
  };

  const bulkAdd = () => {
    setError("");
    const k = parseInt(bulkAddCount, 10);
    if (!Number.isFinite(k) || k <= 0 || k > 50) {
      setError("Bulk add: enter a positive integer ≤ 50.");
      return;
    }
    const all = [...nodes];
    let nid = nextId;
    for (let i = 0; i < k; i++) {
      all.push({ id: nid++, x: 0, y: 0 });
    }
    setNodes(layoutNodes(all));
    setNextId(nid);
  };

  const addEdge = () => {
    setError("");
    const a = parseInt(edgeFrom, 10);
    const b = parseInt(edgeTo, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      setError("Edge: provide two integer IDs.");
      return;
    }
    if (a === b) {
      setError("Edge: self-loops not allowed.");
      return;
    }
    if (!nodes.find((n) => n.id === a) || !nodes.find((n) => n.id === b)) {
      setError("Edge: one or both node IDs do not exist.");
      return;
    }
    if (
      edges.find(
        (e) =>
          (e.from === a && e.to === b) || (e.from === b && e.to === a)
      )
    ) {
      setError("Edge already exists.");
      return;
    }
    setEdges([...edges, { from: a, to: b }]);
    setEdgeFrom("");
    setEdgeTo("");
  };

  const deleteEdge = () => {
    setError("");
    const a = parseInt(edgeFrom, 10);
    const b = parseInt(edgeTo, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      setError("Delete edge: provide two integer IDs.");
      return;
    }
    const filtered = edges.filter(
      (e) => !((e.from === a && e.to === b) || (e.from === b && e.to === a))
    );
    if (filtered.length === edges.length) {
      setError("Edge not found.");
      return;
    }
    setEdges(filtered);
  };

  const deleteNode = () => {
    setError("");
    const id = parseInt(delNode, 10);
    if (!Number.isFinite(id)) {
      setError("Delete node: provide integer ID.");
      return;
    }
    if (!nodes.find((n) => n.id === id)) {
      setError("Node not found.");
      return;
    }
    const remaining = nodes.filter((n) => n.id !== id);
    setNodes(layoutNodes(remaining));
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
    setDelNode("");
  };

  const clearGraph = () => {
    setNodes([]);
    setEdges([]);
    setNextId(1);
    setError("");
  };

  const generateRandom = () => {
    setError("");
    const g = createRandomGraph({
      n: 6 + Math.floor(Math.random() * 4),
      width: SVG_W,
      height: SVG_H,
      idStart: 1,
      edgeCount: undefined,
    });
    // denser Erdős–Rényi-ish via probability overlay on shared positions
    const n = g.nodes.length;
    const newEdges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.random() < 0.4) newEdges.push({ from: g.nodes[i].id, to: g.nodes[j].id });
      }
    }
    setNodes(g.nodes);
    setEdges(newEdges);
    setNextId(n + 1);
  };

  const downloadCurrentGraph = () => {
    setError("");
    if (nodes.length === 0) {
      setError("Nothing to download.");
      return;
    }
    downloadGraphJson(
      buildGraphPayload({
        nodes,
        edges,
        width: SVG_W,
        height: SVG_H,
        page: "greedy-color",
      }),
      "greedy-color-graph.json"
    );
  };

  const loadGraphFromFile = (graph, err) => {
    setError("");
    if (err || !graph) {
      setError(err?.message || "Failed to load graph.");
      return;
    }
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
    setEdges(toFromToEdges(graph.edges));
    setNextId(graph.nodes.reduce((m, n) => Math.max(m, Number(n.id) || 0), 0) + 1);
  };

  const drawPlanarAsPossible = () => {
    setError("");
    if (nodes.length < 2) {
      setError("Need at least 2 nodes to layout.");
      return;
    }
    const { nodes: next } = layoutPlanarAsPossible(nodes, edges, {
      width: SVG_W,
      height: SVG_H,
    });
    setNodes(next);
  };

  const generateKn = () => {
    setError("");
    const n = parseInt(kInput, 10);
    if (!Number.isFinite(n) || n < 2 || n > 15) {
      setError("K_n: n must be between 2 and 15.");
      return;
    }
    const pts = circularLayout(n);
    const newNodes = pts.map((p, i) => ({ id: i + 1, x: p.x, y: p.y }));
    const newEdges = [];
    for (let i = 1; i <= n; i++)
      for (let j = i + 1; j <= n; j++) newEdges.push({ from: i, to: j });
    setNodes(newNodes);
    setEdges(newEdges);
    setNextId(n + 1);
  };

  const generateOddCycle = () => {
    setError("");
    const n = parseInt(cycleInput, 10);
    if (!Number.isFinite(n) || n < 3 || n % 2 === 0 || n > 21) {
      setError("Odd cycle: n must be odd and between 3 and 21.");
      return;
    }
    const pts = circularLayout(n);
    const newNodes = pts.map((p, i) => ({ id: i + 1, x: p.x, y: p.y }));
    const newEdges = [];
    for (let i = 1; i <= n; i++) newEdges.push({ from: i, to: (i % n) + 1 });
    setNodes(newNodes);
    setEdges(newEdges);
    setNextId(n + 1);
  };

  const generateRandomRegular = () => {
    setError("");
    const n = parseInt(regN, 10);
    const d = parseInt(regD, 10);
    if (!Number.isFinite(n) || !Number.isFinite(d) || n < 2 || d < 1 || d >= n) {
      setError("Regular: need 1 ≤ d < n, n ≤ 20.");
      return;
    }
    if ((n * d) % 2 !== 0) {
      setError("Regular: n*d must be even.");
      return;
    }
    // Attempt pairing model with retries
    const attempts = 100;
    let success = null;
    for (let t = 0; t < attempts; t++) {
      const stubs = [];
      for (let i = 1; i <= n; i++) for (let k = 0; k < d; k++) stubs.push(i);
      for (let i = stubs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [stubs[i], stubs[j]] = [stubs[j], stubs[i]];
      }
      const edgeSet = new Set();
      let bad = false;
      for (let i = 0; i < stubs.length; i += 2) {
        const a = stubs[i];
        const b = stubs[i + 1];
        if (a === b) {
          bad = true;
          break;
        }
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (edgeSet.has(key)) {
          bad = true;
          break;
        }
        edgeSet.add(key);
      }
      if (!bad) {
        success = [...edgeSet].map((k) => {
          const [a, b] = k.split("-").map(Number);
          return { from: a, to: b };
        });
        break;
      }
    }
    if (!success) {
      setError("Failed to generate regular graph, try different n, d.");
      return;
    }
    const pts = circularLayout(n);
    setNodes(pts.map((p, i) => ({ id: i + 1, x: p.x, y: p.y })));
    setEdges(success);
    setNextId(n + 1);
  };

  // ---------- Apply ordering & build history ----------
  const applyOrdering = () => {
    setError("");
    if (nodes.length === 0) {
      setError("Graph is empty.");
      return;
    }
    let ord = [];
    switch (strategy) {
      case "id":
        ord = orderByID(nodes);
        break;
      case "random":
        ord = orderRandom(nodes);
        break;
      case "largest":
        ord = orderLargestFirst(nodes, adj);
        break;
      case "smallest-last":
        ord = orderSmallestLast(nodes, adj);
        break;
      case "dsatur":
        ord = orderDSATUR(nodes, adj);
        break;
      default:
        ord = orderByID(nodes);
    }
    const hist = buildHistory(nodes, adj, ord);
    setOrder(ord);
    setHistory(hist);
    setStep(0);
  };

  const run = () => {
    if (history.length === 0) applyOrdering();
    setIsRunning(true);
  };

  const pause = () => setIsRunning(false);

  const stepForward = () => {
    if (history.length === 0) applyOrdering();
    setStep((s) => Math.min(s + 1, Math.max(0, history.length - 1)));
  };

  const stepBack = () => setStep((s) => Math.max(0, s - 1));

  const reset = () => {
    setStep(0);
    setIsRunning(false);
  };

  // ---------- Derived display state ----------
  const state = history[step] || {
    line: 0,
    current: null,
    used: [],
    assigned: null,
    colors: new Map(),
    note: "Apply an ordering to start.",
  };

  const colorMap = state.colors;
  const colorsUsed = React.useMemo(() => {
    const s = new Set();
    colorMap.forEach((c) => {
      if (c > 0) s.add(c);
    });
    return [...s].sort((a, b) => a - b);
  }, [colorMap]);

  const colorCounts = React.useMemo(() => {
    const m = new Map();
    colorMap.forEach((c) => {
      if (c > 0) m.set(c, (m.get(c) || 0) + 1);
    });
    return m;
  }, [colorMap]);

  // Brooks bound decision
  let brooksBound;
  let brooksLabel;
  if (completeG) {
    brooksBound = nodes.length;
    brooksLabel = `Complete graph Kₙ detected: χ = n = ${nodes.length}.`;
  } else if (oddCyc) {
    brooksBound = 3;
    brooksLabel = "Odd cycle detected: χ = 3.";
  } else if (nodes.length === 0) {
    brooksBound = 0;
    brooksLabel = "Empty graph.";
  } else {
    brooksBound = delta;
    brooksLabel = `Brooks' bound: χ ≤ Δ = ${delta} (since graph is neither Kₙ nor an odd cycle).`;
  }

  const trivialBound = delta + 1;
  const currentColorCount = colorsUsed.length;
  const allColored = nodes.length > 0 && colorsUsed.length > 0 && [...colorMap.values()].every((c) => c > 0);

  // ---------- Rendering ----------
  return (
    <div className="algo-dark min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">
            Greedy Vertex Coloring — Brooks' Theorem
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Color each vertex with the smallest color not used by its neighbors.
            For any connected graph that isn't a complete graph or an odd cycle,
            &chi;(G) &le; &Delta;(G).
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls column */}
          <div className="lg:col-span-1 space-y-4">
            {/* Graph editing */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-300 mb-2">Graph Editing</h2>
              <div className="flex gap-2 mb-2">
                <Btn onClick={addNode} variant="indigo">
                  + Add Node
                </Btn>
                <TxtInput
                  value={bulkAddCount}
                  onChange={setBulkAddCount}
                  placeholder="count"
                />
                <Btn onClick={bulkAdd} variant="violet">
                  Bulk
                </Btn>
              </div>
              <div className="flex gap-1 mb-2">
                <TxtInput value={edgeFrom} onChange={setEdgeFrom} placeholder="from" />
                <TxtInput value={edgeTo} onChange={setEdgeTo} placeholder="to" />
              </div>
              <div className="flex gap-2 mb-2">
                <Btn onClick={addEdge} variant="emerald">
                  + Edge
                </Btn>
                <Btn onClick={deleteEdge} variant="amber">
                  − Edge
                </Btn>
              </div>
              <div className="flex gap-2 mb-2">
                <TxtInput value={delNode} onChange={setDelNode} placeholder="node id" />
                <Btn onClick={deleteNode} variant="red">
                  − Node
                </Btn>
              </div>
              <div className="flex gap-2">
                <Btn onClick={clearGraph} variant="slate">
                  Clear
                </Btn>
              </div>
              <GraphToolbar
                className="mt-2"
                onNewRandom={generateRandom}
                onPlanarLayout={drawPlanarAsPossible}
                onDownload={downloadCurrentGraph}
                onLoad={loadGraphFromFile}
              />
            </div>

            {/* Generators */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-300 mb-2">Generators</h2>
              <div className="flex gap-1 mb-2 items-center">
                <label className="text-xs text-slate-400">Kₙ:</label>
                <TxtInput value={kInput} onChange={setKInput} placeholder="n" />
                <Btn onClick={generateKn} variant="violet">
                  Complete Kₙ
                </Btn>
              </div>
              <div className="flex gap-1 mb-2 items-center">
                <label className="text-xs text-slate-400">C<sub>2k+1</sub>:</label>
                <TxtInput value={cycleInput} onChange={setCycleInput} placeholder="odd n" />
                <Btn onClick={generateOddCycle} variant="violet">
                  Odd Cycle
                </Btn>
              </div>
              <div className="flex gap-1 items-center">
                <label className="text-xs text-slate-400">d-reg:</label>
                <TxtInput value={regN} onChange={setRegN} placeholder="n" />
                <TxtInput value={regD} onChange={setRegD} placeholder="d" />
                <Btn onClick={generateRandomRegular} variant="violet">
                  d-Regular
                </Btn>
              </div>
            </div>

            {/* Ordering + run controls */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-300 mb-2">Ordering & Run</h2>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full border border-slate-600 rounded-md px-2 py-1 text-sm mb-2"
              >
                <option value="id">By ID</option>
                <option value="random">Random</option>
                <option value="largest">Largest-first (Welsh-Powell)</option>
                <option value="smallest-last">Smallest-last</option>
                <option value="dsatur">DSATUR</option>
              </select>
              <div className="flex gap-2 mb-2 flex-wrap">
                <Btn onClick={applyOrdering} variant="emerald">
                  Apply Order
                </Btn>
                <Btn onClick={stepBack} variant="slate">◀</Btn>
                {!isRunning ? (
                  <Btn onClick={run} variant="indigo">▶ Run</Btn>
                ) : (
                  <Btn onClick={pause} variant="amber">❚❚ Pause</Btn>
                )}
                <Btn onClick={stepForward} variant="slate">▶</Btn>
                <Btn onClick={reset} variant="red">⟲</Btn>
              </div>
              <div>
                <label className="text-xs text-slate-400">
                  Speed: {speed} ms
                </label>
                <input
                  type="range"
                  min="100"
                  max="1500"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>
              {order.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-slate-400 mb-1">Ordered queue:</div>
                  <div className="flex flex-wrap gap-1">
                    {order.map((id, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs font-mono ${
                          state.current === id
                            ? "bg-amber-400 text-slate-900"
                            : "bg-slate-200 text-slate-300"
                        }`}
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-300 mb-2">Live Stats</h2>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>|V| = {nodes.length}, |E| = {edges.length}</li>
                <li>Δ(G) = {delta}</li>
                <li>Connected: {connected ? "yes" : "no"}</li>
                <li>Colors used: {currentColorCount}</li>
                <li>Trivial bound (Δ+1): {trivialBound}</li>
                <li>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      completeG
                        ? "bg-red-100 text-red-700"
                        : oddCyc
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {brooksLabel}
                  </span>
                </li>
                {allColored && (
                  <li
                    className={`mt-2 text-xs font-semibold ${
                      currentColorCount <= brooksBound
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {currentColorCount <= brooksBound
                      ? `Greedy achieved bound (${currentColorCount} ≤ ${brooksBound}).`
                      : `Greedy exceeded bound (${currentColorCount} > ${brooksBound}) — greedy is not optimal.`}
                  </li>
                )}
              </ul>
              {colorsUsed.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-slate-400 mb-1">Color legend:</div>
                  <div className="flex flex-wrap gap-2">
                    {colorsUsed.map((c) => (
                      <div key={c} className="flex items-center gap-1 text-xs">
                        <span
                          className="inline-block w-4 h-4 rounded"
                          style={{
                            backgroundColor: PALETTE[(c - 1) % PALETTE.length],
                          }}
                        />
                        <span>
                          c{c}: {colorCounts.get(c) || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
                {error}
              </div>
            )}
          </div>

          {/* SVG + panels column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2">
              <svg
                ref={svgRef}
                width="100%"
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="bg-slate-800 rounded touch-none select-none"
              >
                {/* edges */}
                {edges.map((e, i) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const highlight =
                    state.current !== null &&
                    (e.from === state.current || e.to === state.current);
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={highlight ? "#f59e0b" : "#94a3b8"}
                      strokeWidth={highlight ? 3 : 2}
                    />
                  );
                })}
                {/* nodes */}
                {nodes.map((n) => {
                  const c = colorMap.get(n.id) || 0;
                  const isCurrent = state.current === n.id;
                  const isNeighbor =
                    state.current !== null &&
                    adj.get(state.current) &&
                    adj.get(state.current).has(n.id);
                  const fill =
                    c > 0 ? PALETTE[(c - 1) % PALETTE.length] : "#cbd5e1";
                  return (
                    <g key={n.id} onMouseDown={(e) => onNodeDown(e, n.id)} onTouchStart={(e) => onNodeDown(e, n.id)} style={{ cursor: "grab", touchAction: "none" }}>
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={NODE_R}
                        fill={fill}
                        stroke={
                          isCurrent
                            ? "#f59e0b"
                            : isNeighbor
                            ? "#6366f1"
                            : "#334155"
                        }
                        strokeWidth={isCurrent || isNeighbor ? 4 : 2}
                      />
                      <text
                        x={n.x}
                        y={n.y + 5}
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="bold"
                        fill={c > 0 ? "#fff" : "#1e293b"}
                      >
                        {n.id}
                      </text>
                      {c > 0 && (
                        <g>
                          <circle
                            cx={n.x + NODE_R - 5}
                            cy={n.y - NODE_R + 5}
                            r={10}
                            fill="#0f172a"
                            stroke="#fff"
                            strokeWidth={1.5}
                          />
                          <text
                            x={n.x + NODE_R - 5}
                            y={n.y - NODE_R + 9}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="bold"
                            fill="#fff"
                          >
                            {c}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
              <div className="text-xs text-slate-400 mt-1 px-2 italic">
                {state.note}
                {state.used && state.used.length > 0 && (
                  <span>
                    {" "}
                    | forbidden = {"{"}
                    {state.used.join(", ")}
                    {"}"}
                  </span>
                )}
                {state.assigned && (
                  <span className="ml-1 font-semibold text-indigo-700">
                    → color {state.assigned}
                  </span>
                )}
              </div>
            </div>

            {/* Pseudocode */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-300 mb-2">Pseudocode</h2>
              <pre className="text-sm font-mono leading-relaxed bg-slate-800 rounded p-3 overflow-x-auto">
                {PSEUDO.map((ln, i) => (
                  <div
                    key={i}
                    className={`px-2 rounded ${
                      state.line === i
                        ? "bg-amber-200 text-slate-900 font-bold"
                        : "text-slate-300"
                    }`}
                  >
                    {ln}
                  </div>
                ))}
              </pre>
            </div>

            {/* Applications */}
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-lg p-4 border border-indigo-200">
              <h2 className="font-semibold text-indigo-800 mb-1">
                Real-world applications
              </h2>
              <p className="text-sm text-slate-300">
                Applications: register allocation, exam timetabling, frequency
                assignment, Sudoku constraints, map coloring.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
