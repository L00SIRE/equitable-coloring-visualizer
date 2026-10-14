import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import GraphToolbar from "../Components/GraphToolbar";
import { createRandomGraph, edgesToFromTo } from "../canvas/randomGraph";
import { buildGraphPayload, downloadGraphJson, toFromToEdges } from "../canvas/graphIO";
import { layoutPlanarAsPossible } from "../canvas/planarLayout";

const CANVAS_W = 800;
const CANVAS_H = 500;
const NODE_R = 25;
const MIN_DIST = 70;

const COLORS = {
  unvisited: "#E5E7EB",
  onStack: "#F59E0B",
  current: "#EF4444",
  visited: "#10B981",
  edgeBase: "#94A3B8",
  tree: "#10B981",
  back: "#EF4444",
  forward: "#3B82F6",
  cross: "#F59E0B",
};

const PSEUDOCODE = [
  "DFS(G, start):",
  "  for each vertex u in G: color[u] = WHITE",
  "  time = 0",
  "  stack = [start]",
  "  while stack not empty:",
  "    u = stack.top()",
  "    if color[u] == WHITE:",
  "      color[u] = GRAY; d[u] = ++time",
  "    found = false",
  "    for each edge (u, v):",
  "      classify edge (tree/back/forward/cross)",
  "      if color[v] == WHITE: push v; found = true; break",
  "    if not found:",
  "      color[u] = BLACK; f[u] = ++time; pop u",
];

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function placeRandom(existingNodes) {
  for (let i = 0; i < 200; i++) {
    const x = randBetween(NODE_R + 10, CANVAS_W - NODE_R - 10);
    const y = randBetween(NODE_R + 10, CANVAS_H - NODE_R - 10);
    let ok = true;
    for (const n of existingNodes) {
      if (distance(x, y, n.x, n.y) < MIN_DIST) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }
  return {
    x: randBetween(NODE_R + 10, CANVAS_W - NODE_R - 10),
    y: randBetween(NODE_R + 10, CANVAS_H - NODE_R - 10),
  };
}

// Iterative DFS with step history
function computeDFSSteps(nodes, edges, startId, directed) {
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    if (!adj.has(e.from) || !adj.has(e.to)) return;
    adj.get(e.from).push(e.to);
    if (!directed) adj.get(e.to).push(e.from);
  });

  const steps = [];
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map();
  const d = new Map();
  const f = new Map();
  const edgeClass = new Map(); // "from-to" -> type
  nodes.forEach((n) => color.set(n.id, WHITE));

  let time = 0;
  const iterIdx = new Map(); // next neighbor index for each node on stack
  const stack = [];

  const snapshot = (line, note, currentId = null) => {
    steps.push({
      line,
      note,
      stack: [...stack],
      color: new Map(color),
      d: new Map(d),
      f: new Map(f),
      edgeClass: new Map(edgeClass),
      current: currentId,
      time,
    });
  };

  snapshot(0, `DFS starting at ${startId}`);
  snapshot(1, "Initialize all colors to WHITE");
  snapshot(2, "time = 0");

  stack.push(startId);
  iterIdx.set(startId, 0);
  snapshot(3, `Push start ${startId} onto stack`, startId);

  while (stack.length > 0) {
    const u = stack[stack.length - 1];
    snapshot(4, `Top of stack: ${u}`, u);

    if (color.get(u) === WHITE) {
      color.set(u, GRAY);
      time += 1;
      d.set(u, time);
      snapshot(7, `Discover ${u}: d[${u}] = ${time}`, u);
    }

    const neighbors = adj.get(u) || [];
    let idx = iterIdx.get(u) || 0;
    let advanced = false;

    while (idx < neighbors.length) {
      const v = neighbors[idx];
      idx += 1;
      iterIdx.set(u, idx);

      // classify edge u->v
      const key = `${u}-${v}`;
      let type;
      if (color.get(v) === WHITE) type = "tree";
      else if (color.get(v) === GRAY) type = "back";
      else {
        // BLACK
        if (directed) {
          if ((d.get(u) || 0) < (d.get(v) || 0)) type = "forward";
          else type = "cross";
        } else {
          // already covered for undirected, skip display
          type = edgeClass.get(key) || edgeClass.get(`${v}-${u}`) || "tree";
        }
      }
      edgeClass.set(key, type);
      snapshot(10, `Edge ${u} -> ${v} classified as ${type}`, u);

      if (color.get(v) === WHITE) {
        stack.push(v);
        iterIdx.set(v, 0);
        snapshot(11, `Push ${v} onto stack (tree edge)`, v);
        advanced = true;
        break;
      }
    }

    if (!advanced) {
      color.set(u, BLACK);
      time += 1;
      f.set(u, time);
      snapshot(13, `Finish ${u}: f[${u}] = ${time}`, u);
      stack.pop();
      snapshot(14, `Pop ${u} from stack`, stack.length ? stack[stack.length - 1] : null);
    }
  }

  snapshot(0, "DFS complete");
  return steps;
}

// ---- Sub-components ----

const NodeCircle = memo(function NodeCircle({
  node,
  colorFill,
  label,
  dVal,
  fVal,
  onMouseDown,
}) {
  return (
    <g
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onTouchStart={(e) => onMouseDown(e, node.id)}
      style={{ cursor: "grab", touchAction: "none" }}
    >
      {(dVal !== undefined || fVal !== undefined) && (
        <text
          x={node.x}
          y={node.y - NODE_R - 8}
          textAnchor="middle"
          className="text-xs font-semibold"
          fill="#334155"
        >
          {(dVal ?? "?") + "/" + (fVal ?? "?")}
        </text>
      )}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_R}
        fill={colorFill}
        stroke="#1E293B"
        strokeWidth="2"
      />
      <text
        x={node.x}
        y={node.y + 5}
        textAnchor="middle"
        className="text-sm font-bold select-none"
        fill="#0F172A"
      >
        {label}
      </text>
    </g>
  );
});

export default function DFS() {
  const [nodes, setNodes] = useState([
    { id: 0, x: 150, y: 120 },
    { id: 1, x: 320, y: 100 },
    { id: 2, x: 500, y: 180 },
    { id: 3, x: 200, y: 300 },
    { id: 4, x: 400, y: 330 },
    { id: 5, x: 620, y: 340 },
  ]);
  const [edges, setEdges] = useState([
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 0, to: 3 },
    { from: 3, to: 4 },
    { from: 1, to: 4 },
    { from: 2, to: 5 },
    { from: 4, to: 5 },
  ]);
  const [nextId, setNextId] = useState(6);
  const [directed, setDirected] = useState(false);

  // edit form state
  const [bulkN, setBulkN] = useState(3);
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [delNodeId, setDelNodeId] = useState("");
  const [delEdgeFrom, setDelEdgeFrom] = useState("");
  const [delEdgeTo, setDelEdgeTo] = useState("");
  const [startId, setStartId] = useState(0);
  const [error, setError] = useState("");

  // DFS state
  const [steps, setSteps] = useState([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);

  const svgRef = useRef(null);
  const dragRef = useRef({ id: null, offsetX: 0, offsetY: 0 });

  const currentStep = steps[stepIdx];

  // playback
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    if (stepIdx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStepIdx((i) => Math.min(i + 1, steps.length - 1)), speed);
    return () => clearTimeout(t);
  }, [playing, stepIdx, steps, speed]);

  const resetRun = useCallback(() => {
    setSteps([]);
    setStepIdx(0);
    setPlaying(false);
  }, []);

  const clearError = () => setError("");

  // ---------- Graph editing ----------
  const addNode = () => {
    clearError();
    setNodes((ns) => {
      const pos = placeRandom(ns);
      return [...ns, { id: nextId, x: pos.x, y: pos.y }];
    });
    setNextId((i) => i + 1);
    resetRun();
  };

  const addBulkNodes = () => {
    clearError();
    const n = Math.max(1, Math.min(25, parseInt(bulkN) || 0));
    setNodes((ns) => {
      const out = [...ns];
      let id = nextId;
      for (let i = 0; i < n; i++) {
        const pos = placeRandom(out);
        out.push({ id: id++, x: pos.x, y: pos.y });
      }
      setNextId(id);
      return out;
    });
    resetRun();
  };

  const addEdge = () => {
    clearError();
    const a = parseInt(edgeFrom);
    const b = parseInt(edgeTo);
    if (isNaN(a) || isNaN(b)) return setError("Enter valid node IDs.");
    if (a === b) return setError("Self-loops not supported.");
    if (!nodes.find((n) => n.id === a) || !nodes.find((n) => n.id === b))
      return setError("Node IDs not found.");
    if (
      edges.find(
        (e) =>
          (e.from === a && e.to === b) || (!directed && e.from === b && e.to === a)
      )
    )
      return setError("Edge already exists.");
    setEdges((es) => [...es, { from: a, to: b }]);
    setEdgeFrom("");
    setEdgeTo("");
    resetRun();
  };

  const deleteNode = () => {
    clearError();
    const id = parseInt(delNodeId);
    if (isNaN(id) || !nodes.find((n) => n.id === id))
      return setError("Node ID not found.");
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setDelNodeId("");
    if (startId === id && nodes.length > 1) {
      const other = nodes.find((n) => n.id !== id);
      if (other) setStartId(other.id);
    }
    resetRun();
  };

  const deleteEdge = () => {
    clearError();
    const a = parseInt(delEdgeFrom);
    const b = parseInt(delEdgeTo);
    if (isNaN(a) || isNaN(b)) return setError("Enter valid node IDs.");
    setEdges((es) =>
      es.filter(
        (e) =>
          !(
            (e.from === a && e.to === b) ||
            (!directed && e.from === b && e.to === a)
          )
      )
    );
    setDelEdgeFrom("");
    setDelEdgeTo("");
    resetRun();
  };

  const clearAll = () => {
    clearError();
    setNodes([]);
    setEdges([]);
    setNextId(0);
    resetRun();
  };

  const newRandomGraph = () => {
    clearError();
    const g = createRandomGraph({
      n: 8 + Math.floor(Math.random() * 5),
      edgeCount: 12,
      width: CANVAS_W,
      height: CANVAS_H,
      idStart: 0,
    });
    setNodes(g.nodes);
    setEdges(edgesToFromTo(g.edges).map(({ from, to }) => ({ from, to })));
    setNextId(g.nodes.reduce((m, n) => Math.max(m, n.id), -1) + 1);
    setStartId(g.nodes[0]?.id ?? 0);
    resetRun();
  };

  const downloadCurrentGraph = () => {
    clearError();
    if (nodes.length === 0) return setError("Nothing to download.");
    downloadGraphJson(
      buildGraphPayload({
        nodes,
        edges,
        width: CANVAS_W,
        height: CANVAS_H,
        page: "dfs",
        meta: { startId, directed },
      }),
      "dfs-graph.json"
    );
  };

  const loadGraphFromFile = (graph, err) => {
    clearError();
    if (err || !graph) return setError(err?.message || "Failed to load graph.");
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
    setEdges(toFromToEdges(graph.edges));
    setNextId(graph.nodes.reduce((m, n) => Math.max(m, Number(n.id) || 0), -1) + 1);
    setStartId(graph.meta?.startId ?? graph.nodes[0]?.id ?? 0);
    if (typeof graph.meta?.directed === "boolean") {
      // directed is local state if exists — ignore if not controllable here
    }
    resetRun();
  };

  const drawPlanarAsPossible = () => {
    clearError();
    if (nodes.length < 2) return setError("Need at least 2 nodes to layout.");
    const { nodes: next } = layoutPlanarAsPossible(nodes, edges, {
      width: CANVAS_W,
      height: CANVAS_H,
    });
    setNodes(next);
  };

  const generateRandomEdges = () => {
    clearError();
    if (nodes.length < 2) return setError("Need at least 2 nodes.");
    const target = Math.min(nodes.length * 2, 20);
    const setKey = new Set(
      edges.map((e) => (directed ? `${e.from}-${e.to}` : [e.from, e.to].sort().join("-")))
    );
    const out = [...edges];
    let tries = 0;
    while (out.length < target && tries < 500) {
      tries++;
      const a = nodes[Math.floor(Math.random() * nodes.length)].id;
      const b = nodes[Math.floor(Math.random() * nodes.length)].id;
      if (a === b) continue;
      const k = directed ? `${a}-${b}` : [a, b].sort().join("-");
      if (setKey.has(k)) continue;
      setKey.add(k);
      out.push({ from: a, to: b });
    }
    setEdges(out);
    resetRun();
  };

  // ---------- DFS run ----------
  const runDFS = () => {
    clearError();
    if (nodes.length === 0) return setError("Graph is empty.");
    if (!nodes.find((n) => n.id === startId))
      return setError("Start node not in graph.");
    const s = computeDFSSteps(nodes, edges, startId, directed);
    setSteps(s);
    setStepIdx(0);
    setPlaying(false);
  };

  // ---------- Drag ----------
  const getSvgPoint = (event) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return null;
    const source = event.touches && event.touches[0]
      ? event.touches[0]
      : (event.changedTouches && event.changedTouches[0]) || event;
    const scaleX = CANVAS_W / svgRect.width;
    const scaleY = CANVAS_H / svgRect.height;
    return {
      x: (source.clientX - svgRect.left) * scaleX,
      y: (source.clientY - svgRect.top) * scaleY,
    };
  };

  const onNodeMouseDown = (e, id) => {
    e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    dragRef.current = {
      id,
      offsetX: pt.x - node.x,
      offsetY: pt.y - node.y,
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onMouseMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);
    window.addEventListener("touchcancel", onMouseUp);
  };

  const onMouseMove = (e) => {
    if (dragRef.current.id === null) return;
    if (e.touches) e.preventDefault();
    const pt = getSvgPoint(e);
    if (!pt) return;
    const x = Math.max(NODE_R, Math.min(CANVAS_W - NODE_R, pt.x - dragRef.current.offsetX));
    const y = Math.max(NODE_R, Math.min(CANVAS_H - NODE_R, pt.y - dragRef.current.offsetY));
    const id = dragRef.current.id;
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  const onMouseUp = () => {
    dragRef.current = { id: null, offsetX: 0, offsetY: 0 };
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("touchmove", onMouseMove);
    window.removeEventListener("touchend", onMouseUp);
    window.removeEventListener("touchcancel", onMouseUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onMouseMove);
      window.removeEventListener("touchend", onMouseUp);
      window.removeEventListener("touchcancel", onMouseUp);
    };
    // eslint-disable-next-line
  }, []);

  // ---------- Render helpers ----------
  const getNodeFill = (id) => {
    if (!currentStep) return COLORS.unvisited;
    if (currentStep.current === id) return COLORS.current;
    const c = currentStep.color.get(id);
    if (c === 2) return COLORS.visited;
    if (c === 1) return COLORS.onStack;
    // also highlight on-stack nodes
    if (currentStep.stack.includes(id)) return COLORS.onStack;
    return COLORS.unvisited;
  };

  const getEdgeStyle = (e) => {
    if (!currentStep) return { stroke: COLORS.edgeBase, strokeWidth: 2 };
    const key = `${e.from}-${e.to}`;
    const keyR = `${e.to}-${e.from}`;
    const t = currentStep.edgeClass.get(key) || (!directed && currentStep.edgeClass.get(keyR));
    if (!t) return { stroke: COLORS.edgeBase, strokeWidth: 2 };
    return { stroke: COLORS[t] || COLORS.edgeBase, strokeWidth: 3.5 };
  };

  const stackDisplay = currentStep ? [...currentStep.stack].reverse() : [];
  const visitedIds = currentStep
    ? [...currentStep.color.entries()].filter(([, v]) => v === 2).map(([k]) => k)
    : [];

  // ---------- Layout ----------
  return (
    <div className="algo-dark min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">Depth-First Search (DFS)</h1>
          <p className="text-slate-400 text-sm mt-1">
            DFS commits down a branch, hits a dead end, and climbs back.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Graph editing */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-slate-100 mb-3">Graph</h2>

              <div className="flex items-center gap-2 mb-3">
                <label className="text-sm text-slate-300">Directed</label>
                <input
                  type="checkbox"
                  checked={directed}
                  onChange={(e) => {
                    setDirected(e.target.checked);
                    resetRun();
                  }}
                  className="h-4 w-4"
                />
              </div>

              <div className="space-y-2">
                <button
                  onClick={addNode}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium shadow"
                >
                  + Add Node
                </button>

                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={bulkN}
                    onChange={(e) => setBulkN(e.target.value)}
                    className="flex-1 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={addBulkNodes}
                    className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-3 py-1 text-sm"
                  >
                    Add N
                  </button>
                </div>

                <div className="border-t border-slate-700 pt-2">
                  <p className="text-xs text-slate-400 mb-1">Add edge</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="from"
                      value={edgeFrom}
                      onChange={(e) => setEdgeFrom(e.target.value)}
                      className="w-1/2 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="to"
                      value={edgeTo}
                      onChange={(e) => setEdgeTo(e.target.value)}
                      className="w-1/2 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <button
                    onClick={addEdge}
                    className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-1 text-sm"
                  >
                    + Add Edge
                  </button>
                </div>

                <div className="border-t border-slate-700 pt-2">
                  <p className="text-xs text-slate-400 mb-1">Delete node</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="id"
                      value={delNodeId}
                      onChange={(e) => setDelNodeId(e.target.value)}
                      className="flex-1 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={deleteNode}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-2">
                  <p className="text-xs text-slate-400 mb-1">Delete edge</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="from"
                      value={delEdgeFrom}
                      onChange={(e) => setDelEdgeFrom(e.target.value)}
                      className="w-1/2 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="to"
                      value={delEdgeTo}
                      onChange={(e) => setDelEdgeTo(e.target.value)}
                      className="w-1/2 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <button
                    onClick={deleteEdge}
                    className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white rounded-lg py-1 text-sm"
                  >
                    Delete Edge
                  </button>
                </div>

                <div className="border-t border-slate-700 pt-2 space-y-2">
                  <GraphToolbar
                    onNewRandom={newRandomGraph}
                    onPlanarLayout={drawPlanarAsPossible}
                    onDownload={downloadCurrentGraph}
                    onLoad={loadGraphFromFile}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={generateRandomEdges}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-1 text-sm"
                    >
                      Random Edges
                    </button>
                    <button
                      onClick={clearAll}
                      className="flex-1 bg-slate-600 hover:bg-slate-700 text-white rounded-lg py-1 text-sm"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-3 text-sm text-red-600 bg-red-900/30 border border-red-700 rounded p-2 text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* DFS controls */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-slate-100 mb-3">DFS Controls</h2>
              <div className="flex gap-2 items-center mb-2">
                <label className="text-sm text-slate-300">Start</label>
                <select
                  value={startId}
                  onChange={(e) => setStartId(parseInt(e.target.value))}
                  className="flex-1 border border-slate-600 rounded-lg bg-slate-800 text-slate-200 px-2 py-1 text-sm"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runDFS}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-2 text-sm font-semibold shadow mb-2"
              >
                ▶ Run DFS
              </button>
              <div className="grid grid-cols-4 gap-1 mb-2">
                <button
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={steps.length === 0}
                  className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 rounded py-1 text-xs"
                >◀</button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  disabled={steps.length === 0}
                  className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded py-1 text-xs"
                >
                  {playing ? "❚❚" : "▶ Run"}
                </button>
                <button
                  onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                  disabled={steps.length === 0}
                  className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 rounded py-1 text-xs"
                >▶</button>
                <button
                  onClick={() => { setStepIdx(0); setPlaying(false); }}
                  disabled={steps.length === 0}
                  className="bg-red-400 hover:bg-red-500 disabled:opacity-50 text-white rounded py-1 text-xs"
                >⟲</button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Speed</label>
                <input
                  type="range"
                  min="200"
                  max="2000"
                  step="100"
                  value={speed}
                  onChange={(e) => setSpeed(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs text-slate-400">{speed}ms</span>
              </div>
              {steps.length > 0 && (
                <p className="text-xs text-slate-400 mt-2">
                  Step {stepIdx + 1} / {steps.length}
                </p>
              )}
            </div>

            {/* Legend */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 text-xs">
              <h3 className="font-semibold text-slate-100 mb-2">Legend</h3>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS.unvisited, border: "1px solid #334155" }} />
                  Unvisited
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS.onStack }} />
                  On stack
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS.current }} />
                  Current
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS.visited }} />
                  Finished
                </div>
                <div className="border-t border-slate-700 mt-2 pt-2">
                  <div className="flex items-center gap-2"><span className="w-4 h-1 inline-block" style={{ background: COLORS.tree }} />Tree edge</div>
                  <div className="flex items-center gap-2"><span className="w-4 h-1 inline-block" style={{ background: COLORS.back }} />Back edge</div>
                  <div className="flex items-center gap-2"><span className="w-4 h-1 inline-block" style={{ background: COLORS.forward }} />Forward edge</div>
                  <div className="flex items-center gap-2"><span className="w-4 h-1 inline-block" style={{ background: COLORS.cross }} />Cross edge</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Canvas + overlays */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <svg
                ref={svgRef}
                width="100%"
                preserveAspectRatio="xMidYMid meet"
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                className="w-full border border-slate-700 rounded-lg bg-slate-800 touch-none select-none"
              >
                {directed && (
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="10"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                    </marker>
                  </defs>
                )}

                {edges.map((e, i) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const style = getEdgeStyle(e);
                  // trim endpoints so arrows sit outside circle
                  const dx = b.x - a.x;
                  const dy = b.y - a.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const ux = dx / len;
                  const uy = dy / len;
                  const x1 = a.x + ux * NODE_R;
                  const y1 = a.y + uy * NODE_R;
                  const x2 = b.x - ux * NODE_R;
                  const y2 = b.y - uy * NODE_R;
                  return (
                    <line
                      key={`e-${i}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={style.stroke}
                      strokeWidth={style.strokeWidth}
                      markerEnd={directed ? "url(#arrow)" : undefined}
                    />
                  );
                })}

                {nodes.map((n) => (
                  <NodeCircle
                    key={n.id}
                    node={n}
                    colorFill={getNodeFill(n.id)}
                    label={n.id}
                    dVal={currentStep?.d.get(n.id)}
                    fVal={currentStep?.f.get(n.id)}
                    onMouseDown={onNodeMouseDown}
                  />
                ))}
              </svg>
              {currentStep?.note && (
                <div className="mt-3 text-sm text-slate-300 bg-blue-900/30 border border-blue-700 rounded px-3 py-2">
                  {currentStep.note}
                </div>
              )}
            </div>

            {/* Live state + pseudocode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <h3 className="font-semibold text-slate-100 mb-2">Live State</h3>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="font-semibold text-amber-600">Stack (top → bottom):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {stackDisplay.length === 0 ? (
                        <span className="text-slate-400 italic">empty</span>
                      ) : (
                        stackDisplay.map((id, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded text-xs font-mono ${
                              i === 0
                                ? "bg-red-500 text-white"
                                : "bg-amber-400 text-slate-900"
                            }`}
                          >
                            {id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-emerald-600">Visited/Finished:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {visitedIds.length === 0 ? (
                        <span className="text-slate-400 italic">none</span>
                      ) : (
                        visitedIds.map((id) => (
                          <span
                            key={id}
                            className="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500 text-white"
                          >
                            {id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-red-600">Current:</span>{" "}
                    <span className="font-mono">
                      {currentStep?.current ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-300">Time:</span>{" "}
                    <span className="font-mono">{currentStep?.time ?? 0}</span>
                  </div>
                  {currentStep && currentStep.d.size > 0 && (
                    <div>
                      <span className="font-semibold text-slate-300">d/f table:</span>
                      <div className="mt-1 grid grid-cols-4 gap-1 text-xs font-mono">
                        {[...currentStep.d.entries()].map(([id, dv]) => (
                          <span
                            key={id}
                            className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200"
                          >
                            {id}: {dv}/{currentStep.f.get(id) ?? "?"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <h3 className="font-semibold text-slate-100 mb-2">Pseudocode</h3>
                <pre className="text-xs font-mono leading-relaxed bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto">
                  {PSEUDOCODE.map((line, i) => (
                    <div
                      key={i}
                      className={
                        currentStep?.line === i
                          ? "bg-amber-500 text-slate-900 px-1 rounded"
                          : "px-1"
                      }
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              </div>
            </div>

            {/* Applications callout */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg shadow p-5">
              <h3 className="font-semibold text-purple-800 mb-1">Real-World Applications</h3>
              <p className="text-sm text-slate-300">
                Applications: topological sort, cycle detection, strongly connected
                components, maze solving, compiler call graphs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
