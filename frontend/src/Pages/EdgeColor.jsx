import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import GraphToolbar from "../Components/GraphToolbar";
import { buildGraphPayload, downloadGraphJson, toFromToEdges } from "../canvas/graphIO";
import { layoutPlanarAsPossible } from "../canvas/planarLayout";

/* ----------------------------- Constants ----------------------------- */

const SVG_W = 800;
const SVG_H = 500;
const NODE_R = 22;

const PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#84cc16", // lime
  "#a855f7", // purple
  "#f59e0b", // amber
];

const PSEUDOCODE = [
  "function greedyEdgeColor(G):",
  "  order ← chooseEdgeOrder(G)",
  "  for each edge e = (u, v) in order:",
  "    banned ← {color(f) : f incident to u or v, colored}",
  "    c ← smallest non-negative integer not in banned",
  "    color(e) ← c",
  "  return color",
];

/* ----------------------------- Utilities ----------------------------- */

const uid = (() => {
  let i = 1;
  return () => i++;
})();

function smallestMissing(set) {
  let c = 0;
  while (set.has(c)) c++;
  return c;
}

function degreeMap(nodes, edges) {
  const deg = new Map();
  nodes.forEach((n) => deg.set(n.id, 0));
  edges.forEach((e) => {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  });
  return deg;
}

function maxDegree(deg) {
  let m = 0;
  deg.forEach((v) => (m = Math.max(m, v)));
  return m;
}

function circularLayout(n, cx = SVG_W / 2, cy = SVG_H / 2, r = 180) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    arr.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return arr;
}

function buildHistory(edges, order, adjacency) {
  // Pre-compute step-by-step color assignments.
  // Each step stores: {edgeId, banned:number[], chosen:number, colorsSoFar: Map<edgeId,color>}
  const incident = new Map(); // nodeId -> list of edge ids
  adjacency.forEach((_, k) => incident.set(k, []));
  edges.forEach((e) => {
    if (!incident.has(e.from)) incident.set(e.from, []);
    if (!incident.has(e.to)) incident.set(e.to, []);
    incident.get(e.from).push(e.id);
    incident.get(e.to).push(e.id);
  });

  const color = new Map();
  const history = [];
  for (const eid of order) {
    const e = edges.find((x) => x.id === eid);
    if (!e) continue;
    const banned = new Set();
    const neighEdges = [
      ...(incident.get(e.from) || []),
      ...(incident.get(e.to) || []),
    ];
    neighEdges.forEach((fid) => {
      if (fid !== eid && color.has(fid)) banned.add(color.get(fid));
    });
    const c = smallestMissing(banned);
    color.set(eid, c);
    history.push({
      edgeId: eid,
      banned: [...banned].sort((a, b) => a - b),
      chosen: c,
      snapshot: new Map(color),
    });
  }
  return history;
}

/* ----------------------------- Graph Generators ----------------------------- */

function genRandom(nCount = 7, p = 0.35) {
  const pts = circularLayout(nCount);
  const nodes = pts.map((p2, i) => ({ id: i + 1, x: p2.x, y: p2.y }));
  const edges = [];
  for (let i = 0; i < nCount; i++) {
    for (let j = i + 1; j < nCount; j++) {
      if (Math.random() < p) {
        edges.push({ id: uid(), from: i + 1, to: j + 1 });
      }
    }
  }
  return { nodes, edges };
}

function genKn(n) {
  const pts = circularLayout(n);
  const nodes = pts.map((p, i) => ({ id: i + 1, x: p.x, y: p.y }));
  const edges = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      edges.push({ id: uid(), from: i + 1, to: j + 1 });
  return { nodes, edges };
}

function genKmn(m, n) {
  const nodes = [];
  const leftX = SVG_W / 2 - 180;
  const rightX = SVG_W / 2 + 180;
  for (let i = 0; i < m; i++) {
    const y = ((i + 1) * SVG_H) / (m + 1);
    nodes.push({ id: i + 1, x: leftX, y });
  }
  for (let j = 0; j < n; j++) {
    const y = ((j + 1) * SVG_H) / (n + 1);
    nodes.push({ id: m + j + 1, x: rightX, y });
  }
  const edges = [];
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      edges.push({ id: uid(), from: i + 1, to: m + j + 1 });
  return { nodes, edges };
}

function genPetersen() {
  // 10 vertices: outer 5-cycle + inner 5-star (pentagram), connected as spokes
  const cx = SVG_W / 2;
  const cy = SVG_H / 2;
  const outerR = 200;
  const innerR = 90;
  const nodes = [];
  for (let i = 0; i < 5; i++) {
    const a = (2 * Math.PI * i) / 5 - Math.PI / 2;
    nodes.push({
      id: i + 1,
      x: cx + outerR * Math.cos(a),
      y: cy + outerR * Math.sin(a),
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = (2 * Math.PI * i) / 5 - Math.PI / 2;
    nodes.push({
      id: i + 6,
      x: cx + innerR * Math.cos(a),
      y: cy + innerR * Math.sin(a),
    });
  }
  const edges = [];
  // outer cycle
  for (let i = 0; i < 5; i++)
    edges.push({ id: uid(), from: i + 1, to: ((i + 1) % 5) + 1 });
  // spokes
  for (let i = 0; i < 5; i++)
    edges.push({ id: uid(), from: i + 1, to: i + 6 });
  // inner pentagram (each inner connects to inner+2 mod 5)
  for (let i = 0; i < 5; i++)
    edges.push({ id: uid(), from: i + 6, to: ((i + 2) % 5) + 6 });
  return { nodes, edges };
}

/* ----------------------------- Subcomponents ----------------------------- */

const Pseudocode = memo(function Pseudocode({ activeLine }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-4 text-xs font-mono shadow-sm">
      <div className="text-teal-300 mb-2 text-[11px] uppercase tracking-wider">
        Pseudocode
      </div>
      {PSEUDOCODE.map((line, i) => (
        <div
          key={i}
          className={`px-2 py-0.5 rounded ${
            i === activeLine
              ? "bg-amber-400/20 text-amber-200 border-l-2 border-amber-400"
              : ""
          }`}
        >
          <span className="text-slate-400 mr-2">{String(i + 1).padStart(2, " ")}</span>
          {line}
        </div>
      ))}
    </div>
  );
});

const Legend = memo(function Legend({ counts }) {
  const entries = Object.entries(counts).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );
  if (entries.length === 0)
    return (
      <div className="text-xs text-slate-400 italic">No colors used yet.</div>
    );
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([c, count]) => (
        <div
          key={c}
          className="flex items-center gap-1.5 bg-slate-800 border border-slate-600 rounded-full px-2.5 py-1 text-xs shadow-sm"
        >
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: PALETTE[Number(c) % PALETTE.length] }}
          />
          <span className="font-medium text-slate-300">c{c}</span>
          <span className="text-slate-400">×{count}</span>
        </div>
      ))}
    </div>
  );
});

/* ----------------------------- Main Component ----------------------------- */

// Seed with K_4 so the canvas has something to show on mount.
const SEED_NODES = [
  { id: 1, x: 250, y: 120 },
  { id: 2, x: 550, y: 120 },
  { id: 3, x: 550, y: 380 },
  { id: 4, x: 250, y: 380 },
];
const SEED_EDGES = [
  { id: 1, from: 1, to: 2 },
  { id: 2, from: 1, to: 3 },
  { id: 3, from: 1, to: 4 },
  { id: 4, from: 2, to: 3 },
  { id: 5, from: 2, to: 4 },
  { id: 6, from: 3, to: 4 },
];

export default function EdgeColor() {
  const [nodes, setNodes] = useState(SEED_NODES);
  const [edges, setEdges] = useState(SEED_EDGES);
  const [history, setHistory] = useState([]);
  const [stepIdx, setStepIdx] = useState(-1); // -1 means before any step
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(700); // ms per step
  const [order, setOrder] = useState("insertion");
  const [error, setError] = useState("");

  // input fields
  const [newNodeId, setNewNodeId] = useState("");
  const [bulkN, setBulkN] = useState("");
  const [edgeU, setEdgeU] = useState("");
  const [edgeV, setEdgeV] = useState("");
  const [delEdgeU, setDelEdgeU] = useState("");
  const [delEdgeV, setDelEdgeV] = useState("");
  const [delNodeId, setDelNodeId] = useState("");
  const [knN, setKnN] = useState("5");
  const [kmnM, setKmnM] = useState("3");
  const [kmnN, setKmnN] = useState("3");

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const timerRef = useRef(null);

  /* ------------------- Derived ------------------- */

  const adjacency = (() => {
    const m = new Map();
    nodes.forEach((n) => m.set(n.id, []));
    edges.forEach((e) => {
      if (m.has(e.from)) m.get(e.from).push(e.to);
      if (m.has(e.to)) m.get(e.to).push(e.from);
    });
    return m;
  })();

  const deg = degreeMap(nodes, edges);
  const delta = maxDegree(deg);

  const currentColors = (() => {
    if (stepIdx < 0) return new Map();
    return history[stepIdx]?.snapshot || new Map();
  })();

  const chiPrime = (() => {
    let max = -1;
    currentColors.forEach((v) => (max = Math.max(max, v)));
    return max + 1; // number of distinct colors used so far
  })();

  const finished = stepIdx === history.length - 1 && history.length > 0;

  const colorCounts = (() => {
    const counts = {};
    currentColors.forEach((c) => {
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  })();

  const activeLine = (() => {
    if (stepIdx < 0) return 0;
    if (finished) return 6;
    return 3 + ((stepIdx % 3) % 3); // cycle through lines 3-5 during iteration
  })();

  /* ------------------- Ordering ------------------- */

  const computeOrder = useCallback(() => {
    const ids = edges.map((e) => e.id);
    if (order === "random") {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      return ids;
    }
    if (order === "degree") {
      return [...ids].sort((a, b) => {
        const ea = edges.find((x) => x.id === a);
        const eb = edges.find((x) => x.id === b);
        const da = (deg.get(ea.from) || 0) + (deg.get(ea.to) || 0);
        const db = (deg.get(eb.from) || 0) + (deg.get(eb.to) || 0);
        return db - da;
      });
    }
    return ids; // insertion
  }, [edges, order, deg]);

  /* ------------------- History build ------------------- */

  const rebuildHistory = useCallback(() => {
    const ord = computeOrder();
    const h = buildHistory(edges, ord, adjacency);
    setHistory(h);
    setStepIdx(-1);
    setRunning(false);
  }, [edges, computeOrder, adjacency]);

  useEffect(() => {
    rebuildHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, order]);

  /* ------------------- Animation ------------------- */

  useEffect(() => {
    if (!running) return;
    if (stepIdx >= history.length - 1) {
      setRunning(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setStepIdx((s) => s + 1);
    }, speed);
    return () => clearTimeout(timerRef.current);
  }, [running, stepIdx, history, speed]);

  /* ------------------- Controls ------------------- */

  const handleRun = () => {
    if (history.length === 0) {
      setError("No edges to color.");
      return;
    }
    setError("");
    if (stepIdx >= history.length - 1) setStepIdx(-1);
    setRunning(true);
  };
  const handlePause = () => setRunning(false);
  const handleStepFwd = () => {
    if (stepIdx < history.length - 1) setStepIdx((s) => s + 1);
  };
  const handleStepBack = () => {
    if (stepIdx >= 0) setStepIdx((s) => s - 1);
  };
  const handleReset = () => {
    setStepIdx(-1);
    setRunning(false);
  };

  /* ------------------- Graph editing ------------------- */

  const addNode = () => {
    const raw = newNodeId.trim();
    if (!raw) {
      setError("Enter a node ID.");
      return;
    }
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      setError("Node ID must be a positive integer.");
      return;
    }
    if (nodes.find((n) => n.id === id)) {
      setError(`Node ${id} already exists.`);
      return;
    }
    const angle = Math.random() * 2 * Math.PI;
    const r = 150;
    setNodes((ns) => [
      ...ns,
      {
        id,
        x: SVG_W / 2 + r * Math.cos(angle),
        y: SVG_H / 2 + r * Math.sin(angle),
      },
    ]);
    setNewNodeId("");
    setError("");
  };

  const bulkAddNodes = () => {
    const n = Number(bulkN);
    if (!Number.isInteger(n) || n <= 0 || n > 50) {
      setError("Bulk count must be 1..50.");
      return;
    }
    const existingIds = new Set(nodes.map((x) => x.id));
    let id = 1;
    const added = [];
    while (added.length < n) {
      if (!existingIds.has(id)) {
        added.push(id);
        existingIds.add(id);
      }
      id++;
    }
    const pts = circularLayout(added.length);
    const newNodes = added.map((i, k) => ({ id: i, x: pts[k].x, y: pts[k].y }));
    setNodes(newNodes);
    setEdges([]);
    setBulkN("");
    setError("");
  };

  const addEdge = () => {
    const u = Number(edgeU);
    const v = Number(edgeV);
    if (!nodes.find((n) => n.id === u) || !nodes.find((n) => n.id === v)) {
      setError("Both endpoints must exist.");
      return;
    }
    if (u === v) {
      setError("Self-loops not supported.");
      return;
    }
    if (
      edges.find(
        (e) =>
          (e.from === u && e.to === v) || (e.from === v && e.to === u)
      )
    ) {
      setError("Edge already exists.");
      return;
    }
    setEdges((es) => [...es, { id: uid(), from: u, to: v }]);
    setEdgeU("");
    setEdgeV("");
    setError("");
  };

  const deleteEdge = () => {
    const u = Number(delEdgeU);
    const v = Number(delEdgeV);
    const idx = edges.findIndex(
      (e) => (e.from === u && e.to === v) || (e.from === v && e.to === u)
    );
    if (idx < 0) {
      setError("Edge not found.");
      return;
    }
    setEdges((es) => es.filter((_, i) => i !== idx));
    setDelEdgeU("");
    setDelEdgeV("");
    setError("");
  };

  const deleteNode = () => {
    const id = Number(delNodeId);
    if (!nodes.find((n) => n.id === id)) {
      setError("Node not found.");
      return;
    }
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setDelNodeId("");
    setError("");
  };

  const clearAll = () => {
    setNodes([]);
    setEdges([]);
    setError("");
  };

  const loadKn = () => {
    const n = Number(knN);
    if (!Number.isInteger(n) || n < 2 || n > 12) {
      setError("K_n: n must be 2..12.");
      return;
    }
    const g = genKn(n);
    setNodes(g.nodes);
    setEdges(g.edges);
    setError("");
  };

  const loadKmn = () => {
    const m = Number(kmnM);
    const n = Number(kmnN);
    if (
      !Number.isInteger(m) ||
      !Number.isInteger(n) ||
      m < 1 ||
      n < 1 ||
      m + n > 12
    ) {
      setError("K_{m,n}: m,n ≥ 1 and m+n ≤ 12.");
      return;
    }
    const g = genKmn(m, n);
    setNodes(g.nodes);
    setEdges(g.edges);
    setError("");
  };

  const loadRandom = () => {
    const n = 5 + Math.floor(Math.random() * 4);
    const g = genRandom(n, 0.4);
    setNodes(g.nodes);
    setEdges(g.edges);
    setError("");
  };

  const downloadCurrentGraph = () => {
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
        page: "edge-color",
      }),
      "edge-color-graph.json"
    );
    setError("");
  };

  const loadGraphFromFile = (graph, err) => {
    if (err || !graph) {
      setError(err?.message || "Failed to load graph.");
      return;
    }
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
    setEdges(
      toFromToEdges(graph.edges, { withIds: true }).map((e, i) => ({
        ...e,
        id: e.id ?? i + 1,
      }))
    );
    setError("");
  };

  const drawPlanarAsPossible = () => {
    if (nodes.length < 2) {
      setError("Need at least 2 nodes to layout.");
      return;
    }
    const { nodes: next } = layoutPlanarAsPossible(nodes, edges, {
      width: SVG_W,
      height: SVG_H,
    });
    setNodes(next);
    setError("");
  };

  const loadPetersen = () => {
    const g = genPetersen();
    setNodes(g.nodes);
    setEdges(g.edges);
    setError("");
  };

  /* ------------------- Drag ------------------- */

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

  const onMouseDown = (e, id) => {
    e.preventDefault();
    dragRef.current = { id };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    if (e.touches) e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === dragRef.current.id
          ? {
              ...n,
              x: Math.max(NODE_R, Math.min(SVG_W - NODE_R, pt.x)),
              y: Math.max(NODE_R, Math.min(SVG_H - NODE_R, pt.y)),
            }
          : n
      )
    );
  };
  const onMouseUp = () => {
    dragRef.current = null;
  };

  /* ------------------- Verdict ------------------- */

  const verdict = (() => {
    if (!finished || edges.length === 0 || delta === 0) return null;
    if (chiPrime === delta)
      return {
        label: `Class 1 (χ' = Δ = ${delta})`,
        tone: "bg-teal-100 text-teal-800 border-teal-300",
      };
    if (chiPrime === delta + 1)
      return {
        label: `Class 2 (χ' = Δ+1 = ${delta + 1})`,
        tone: "bg-rose-100 text-rose-800 border-rose-300",
      };
    return {
      label: `Greedy over-colored: used ${chiPrime} > Δ+1. True χ' may be lower.`,
      tone: "bg-amber-100 text-amber-800 border-amber-300",
    };
  })();

  /* ------------------- Render helpers ------------------- */

  const currentStep = stepIdx >= 0 ? history[stepIdx] : null;
  const currentEdgeId = currentStep?.edgeId;

  const edgeColorOf = (eid) => {
    if (!currentColors.has(eid)) return null;
    return currentColors.get(eid);
  };

  /* ------------------- JSX ------------------- */

  return (
    <div className="algo-dark min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">
            Edge Coloring — Vizing's Theorem
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl">
            Assign colors to edges so no two edges sharing a vertex get the same
            color. Vizing says you need only &Delta; or &Delta;+1 colors.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Controls */}
          <aside className="lg:col-span-1 space-y-4">
            {/* Editing */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Graph editing
              </h2>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="Node ID (e.g. 7)"
                    value={newNodeId}
                    onChange={(e) => setNewNodeId(e.target.value)}
                  />
                  <button
                    onClick={addNode}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1 rounded"
                  >
                    Add
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="Bulk add count"
                    value={bulkN}
                    onChange={(e) => setBulkN(e.target.value)}
                  />
                  <button
                    onClick={bulkAddNodes}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-3 py-1 rounded"
                  >
                    Bulk
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    className="w-16 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="u"
                    value={edgeU}
                    onChange={(e) => setEdgeU(e.target.value)}
                  />
                  <input
                    className="w-16 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="v"
                    value={edgeV}
                    onChange={(e) => setEdgeV(e.target.value)}
                  />
                  <button
                    onClick={addEdge}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1 rounded"
                  >
                    Add edge
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    className="w-16 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="u"
                    value={delEdgeU}
                    onChange={(e) => setDelEdgeU(e.target.value)}
                  />
                  <input
                    className="w-16 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="v"
                    value={delEdgeV}
                    onChange={(e) => setDelEdgeV(e.target.value)}
                  />
                  <button
                    onClick={deleteEdge}
                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-sm px-3 py-1 rounded"
                  >
                    Delete edge
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-slate-600 rounded px-2 py-1 text-sm"
                    placeholder="Node ID to delete"
                    value={delNodeId}
                    onChange={(e) => setDelNodeId(e.target.value)}
                  />
                  <button
                    onClick={deleteNode}
                    className="bg-rose-500 hover:bg-rose-600 text-white text-sm px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </div>

                <button
                  onClick={clearAll}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-300 text-sm px-3 py-1 rounded"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Generators */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Generators
              </h2>
              <div className="space-y-2">
                <GraphToolbar
                  onNewRandom={loadRandom}
                  onPlanarLayout={drawPlanarAsPossible}
                  onDownload={downloadCurrentGraph}
                  onLoad={loadGraphFromFile}
                />
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-slate-400">K_n n=</label>
                  <input
                    className="w-14 border border-slate-600 rounded px-2 py-1 text-sm"
                    value={knN}
                    onChange={(e) => setKnN(e.target.value)}
                  />
                  <button
                    onClick={loadKn}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1 rounded"
                  >
                    Complete K_n
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-slate-400">K_{`{m,n}`}</label>
                  <input
                    className="w-12 border border-slate-600 rounded px-2 py-1 text-sm"
                    value={kmnM}
                    onChange={(e) => setKmnM(e.target.value)}
                  />
                  <input
                    className="w-12 border border-slate-600 rounded px-2 py-1 text-sm"
                    value={kmnN}
                    onChange={(e) => setKmnN(e.target.value)}
                  />
                  <button
                    onClick={loadKmn}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1 rounded"
                  >
                    Bipartite
                  </button>
                </div>
                <button
                  onClick={loadPetersen}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 py-1.5 rounded"
                >
                  Petersen graph
                </button>
              </div>
            </div>

            {/* Algorithm controls */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Algorithm
              </h2>

              <label className="block text-xs text-slate-400 mb-1">
                Edge order
              </label>
              <select
                className="w-full border border-slate-600 rounded px-2 py-1 text-sm mb-3"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="insertion">By insertion</option>
                <option value="random">Random</option>
                <option value="degree">
                  Greedy by endpoint-degree sum (desc)
                </option>
              </select>

              <div className="grid grid-cols-4 gap-2 mb-3">
                <button
                  onClick={handleStepBack}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-300 text-sm px-2 py-1.5 rounded"
                  disabled={stepIdx < 0}
                >◀</button>
                {!running ? (
                  <button
                    onClick={handleRun}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1.5 rounded col-span-2"
                  >▶ Run</button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 py-1.5 rounded col-span-2"
                  >❚❚ Pause</button>
                )}
                <button
                  onClick={handleStepFwd}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-300 text-sm px-2 py-1.5 rounded"
                  disabled={stepIdx >= history.length - 1}
                >▶</button>
                <button
                  onClick={handleReset}
                  className="bg-rose-500 hover:bg-rose-600 text-white text-sm px-3 py-1.5 rounded col-span-4"
                >⟲ Reset</button>
              </div>

              <label className="block text-xs text-slate-400 mb-1">
                Speed: {speed} ms/step
              </label>
              <input
                type="range"
                min="120"
                max="1600"
                step="40"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            {/* Stats */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Live stats
              </h2>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-xs text-slate-400">Δ(G)</div>
                  <div className="text-xl font-bold text-slate-100">
                    {delta}
                  </div>
                </div>
                <div className="bg-teal-50 rounded p-2">
                  <div className="text-xs text-teal-600">χ' used</div>
                  <div className="text-xl font-bold text-teal-700">
                    {chiPrime}
                  </div>
                </div>
                <div className="bg-cyan-50 rounded p-2">
                  <div className="text-xs text-cyan-600">bound</div>
                  <div className="text-sm font-bold text-cyan-700 mt-1">
                    {delta}..{delta + 1}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-2">
                Vizing: Δ ≤ χ'(G) ≤ Δ+1
              </div>
              {verdict && (
                <div
                  className={`border rounded-lg px-3 py-2 text-xs font-medium ${verdict.tone}`}
                >
                  {verdict.label}
                </div>
              )}
              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-1">Color legend</div>
                <Legend counts={colorCounts} />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-sm px-3 py-2">
                {error}
              </div>
            )}
          </aside>

          {/* SVG + panels */}
          <section className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-400">
                  Step{" "}
                  <span className="font-mono text-slate-100">
                    {stepIdx + 1}
                  </span>{" "}
                  / {history.length}
                </div>
                {currentStep && (
                  <div className="text-xs text-slate-400">
                    banned:&nbsp;
                    {currentStep.banned.length === 0 ? (
                      <span className="italic text-slate-400">∅</span>
                    ) : (
                      currentStep.banned.map((b) => (
                        <span
                          key={b}
                          className="inline-block mx-0.5 px-1.5 py-0.5 rounded text-white text-[10px]"
                          style={{
                            background: PALETTE[b % PALETTE.length],
                          }}
                        >
                          c{b}
                        </span>
                      ))
                    )}
                    &nbsp;→ chose{" "}
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-white text-[10px]"
                      style={{
                        background:
                          PALETTE[currentStep.chosen % PALETTE.length],
                      }}
                    >
                      c{currentStep.chosen}
                    </span>
                  </div>
                )}
              </div>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                preserveAspectRatio="xMidYMid meet"
                width="100%"
                height="500"
                className="bg-slate-800 rounded-lg touch-none select-none"
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchMove={onMouseMove}
                onTouchEnd={onMouseUp}
                onTouchCancel={onMouseUp}
              >
                {/* Edges */}
                {edges.map((e) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const color = edgeColorOf(e.id);
                  const isCurrent = e.id === currentEdgeId && !finished;
                  const stroke =
                    color != null
                      ? PALETTE[color % PALETTE.length]
                      : isCurrent
                      ? "#334155"
                      : "#cbd5e1";
                  const width = color != null ? 4 : isCurrent ? 5 : 2;
                  return (
                    <g key={e.id}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={stroke}
                        strokeWidth={width}
                        strokeLinecap="round"
                        opacity={isCurrent ? 0.95 : 1}
                      >
                        {isCurrent && (
                          <animate
                            attributeName="stroke-opacity"
                            values="1;0.4;1"
                            dur="0.9s"
                            repeatCount="indefinite"
                          />
                        )}
                      </line>
                    </g>
                  );
                })}
                {/* Nodes */}
                {nodes.map((n) => (
                  <g
                    key={n.id}
                    onMouseDown={(e) => onMouseDown(e, n.id)}
                    onTouchStart={(e) => onMouseDown(e, n.id)}
                    style={{ cursor: "grab", touchAction: "none" }}
                  >
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={NODE_R}
                      fill="#94a3b8"
                      stroke="#475569"
                      strokeWidth={2}
                    />
                    <text
                      x={n.x}
                      y={n.y + 5}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="700"
                      fill="white"
                    >
                      {n.id}
                    </text>
                  </g>
                ))}
                {nodes.length === 0 && (
                  <text
                    x={SVG_W / 2}
                    y={SVG_H / 2}
                    textAnchor="middle"
                    fontSize="16"
                    fill="#94a3b8"
                  >
                    Empty graph — add nodes or load a generator.
                  </text>
                )}
              </svg>
            </div>

            <Pseudocode activeLine={activeLine} />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="text-sm font-semibold text-amber-800 mb-1 uppercase tracking-wider">
                Real-world applications
              </div>
              <p className="text-sm text-amber-900">
                Round-robin tournament scheduling, optical network wavelength
                assignment, classroom timetabling (teacher-class edges), Latin
                squares. Edge coloring turns conflict-free scheduling problems
                into a coloring instance where colors map to time slots,
                wavelengths, or periods.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
