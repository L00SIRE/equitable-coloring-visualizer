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

// ---------- constants ----------
const SVG_W = 800;
const SVG_H = 500;
const R = 25;
const COLOR_BLUE = "#3B82F6";
const COLOR_ROSE = "#F43F5E";
const COLOR_GRAY = "#94A3B8";
const COLOR_AMBER = "#F59E0B";

const PSEUDO = [
  "function isBipartite(G):",
  "  color = {} // map: node -> {0,1}",
  "  for each node s in G:",
  "    if s not in color:",
  "      color[s] = 0",
  "      Q = queue([s])",
  "      while Q not empty:",
  "        u = Q.pop()",
  "        for v in neighbors(u):",
  "          if v not in color:",
  "            color[v] = 1 - color[u]",
  "            Q.push(v)",
  "          else if color[v] == color[u]:",
  "            return CONFLICT(u,v) // odd cycle",
  "  return BIPARTITE(color)",
];

function buildAdj(nodes, edges) {
  const adj = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    if (adj[e.from] && adj[e.to]) {
      adj[e.from].push(e.to);
      adj[e.to].push(e.from);
    }
  });
  return adj;
}

function computeHistory(nodes, edges, startId) {
  const adj = buildAdj(nodes, edges);
  const color = {};
  const steps = [];
  const visited = new Set();
  let conflictEdge = null;

  const nodeOrder = [];
  if (startId && nodes.find((n) => n.id === startId)) nodeOrder.push(startId);
  nodes.forEach((n) => {
    if (!nodeOrder.includes(n.id)) nodeOrder.push(n.id);
  });

  steps.push({
    line: 0,
    queue: [],
    visited: [],
    color: {},
    current: null,
    examined: null,
    conflict: null,
    msg: "Start: BFS-based 2-coloring.",
  });

  outer: for (const s of nodeOrder) {
    if (color[s] !== undefined) continue;
    color[s] = 0;
    visited.add(s);
    const Q = [s];

    steps.push({
      line: 4,
      queue: [...Q],
      visited: [...visited],
      color: { ...color },
      current: s,
      examined: null,
      conflict: null,
      msg: `Pick unvisited node ${s}, color it BLUE (0).`,
    });

    while (Q.length) {
      const u = Q.shift();
      steps.push({
        line: 7,
        queue: [...Q],
        visited: [...visited],
        color: { ...color },
        current: u,
        examined: null,
        conflict: null,
        msg: `Dequeue ${u}.`,
      });

      for (const v of adj[u]) {
        steps.push({
          line: 8,
          queue: [...Q],
          visited: [...visited],
          color: { ...color },
          current: u,
          examined: { from: u, to: v },
          conflict: null,
          msg: `Examine edge (${u}, ${v}).`,
        });

        if (color[v] === undefined) {
          color[v] = 1 - color[u];
          visited.add(v);
          Q.push(v);
          steps.push({
            line: 10,
            queue: [...Q],
            visited: [...visited],
            color: { ...color },
            current: u,
            examined: { from: u, to: v },
            conflict: null,
            msg: `Color ${v} = ${
              color[v] === 0 ? "BLUE" : "ROSE"
            } (opposite of ${u}), enqueue.`,
          });
        } else if (color[v] === color[u]) {
          conflictEdge = { from: u, to: v };
          steps.push({
            line: 13,
            queue: [...Q],
            visited: [...visited],
            color: { ...color },
            current: u,
            examined: { from: u, to: v },
            conflict: { from: u, to: v },
            msg: `CONFLICT — odd cycle detected at edge (${u}, ${v}).`,
          });
          break outer;
        }
      }
    }
  }

  if (!conflictEdge) {
    steps.push({
      line: 14,
      queue: [],
      visited: [...visited],
      color: { ...color },
      current: null,
      examined: null,
      conflict: null,
      msg: "Graph is BIPARTITE. Partitions identified.",
    });
  }

  return { steps, conflictEdge, finalColor: color };
}

// ---------- memo primitives ----------
const Edge = memo(function Edge({
  x1,
  y1,
  x2,
  y2,
  examined,
  conflict,
  ghost,
}) {
  let stroke = ghost ? "#CBD5E1" : "#94A3B8";
  let width = 2;
  let dash = "none";
  if (examined) {
    stroke = "#475569";
    width = 3.5;
  }
  if (conflict) {
    stroke = "#EF4444";
    width = 4;
    dash = "6 4";
  }
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={dash}
      opacity={ghost ? 0.35 : 1}
    >
      {conflict && (
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="20"
          dur="0.6s"
          repeatCount="indefinite"
        />
      )}
    </line>
  );
});

const NodeCircle = memo(function NodeCircle({
  node,
  fill,
  isCurrent,
  isConflict,
  onMouseDown,
}) {
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onTouchStart={(e) => onMouseDown(e, node.id)}
      style={{ cursor: "grab", touchAction: "none" }}
    >
      {isCurrent && (
        <circle r={R + 6} fill="none" stroke={COLOR_AMBER} strokeWidth={3} />
      )}
      <circle
        r={R}
        fill={fill}
        stroke={isConflict ? "#B91C1C" : "#1E293B"}
        strokeWidth={isConflict ? 4 : 2}
      >
        {isConflict && (
          <animate
            attributeName="r"
            values={`${R};${R + 4};${R}`}
            dur="0.7s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      <text
        textAnchor="middle"
        dy="0.35em"
        fill="white"
        fontSize="14"
        fontWeight="700"
        pointerEvents="none"
      >
        {node.id}
      </text>
    </g>
  );
});

// ---------- main ----------
export default function Bipartite() {
  const [nodes, setNodes] = useState([
    { id: "A", x: 200, y: 150 },
    { id: "B", x: 400, y: 100 },
    { id: "C", x: 600, y: 150 },
    { id: "D", x: 200, y: 350 },
    { id: "E", x: 400, y: 400 },
    { id: "F", x: 600, y: 350 },
  ]);
  const [edges, setEdges] = useState([
    { from: "A", to: "B" },
    { from: "A", to: "E" },
    { from: "B", to: "D" },
    { from: "B", to: "F" },
    { from: "C", to: "D" },
    { from: "C", to: "E" },
  ]);

  const [history, setHistory] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [startNode, setStartNode] = useState("A");
  const [partitionView, setPartitionView] = useState(false);

  const [nodeInput, setNodeInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [delNode, setDelNode] = useState("");
  const [delEdgeFrom, setDelEdgeFrom] = useState("");
  const [delEdgeTo, setDelEdgeTo] = useState("");
  const [randN, setRandN] = useState(6);
  const [randE, setRandE] = useState(8);
  const [biM, setBiM] = useState(3);
  const [biN, setBiN] = useState(3);
  const [oddK, setOddK] = useState(5);
  const [err, setErr] = useState("");

  const svgRef = useRef(null);
  const drag = useRef(null);

  // recompute history on graph/start change
  useEffect(() => {
    const h = computeHistory(nodes, edges, startNode);
    setHistory(h);
    setStepIdx(0);
    setPlaying(false);
    setPartitionView(false);
  }, [nodes, edges, startNode]);

  // autoplay
  useEffect(() => {
    if (!playing || !history) return;
    if (stepIdx >= history.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStepIdx((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, stepIdx, speed, history]);

  // partition view auto-trigger
  useEffect(() => {
    if (!history) return;
    const last = history.steps[history.steps.length - 1];
    if (
      stepIdx === history.steps.length - 1 &&
      !history.conflictEdge &&
      last &&
      Object.keys(last.color).length > 0
    ) {
      const t = setTimeout(() => setPartitionView(true), 400);
      return () => clearTimeout(t);
    }
  }, [stepIdx, history]);

  const cur = history ? history.steps[stepIdx] : null;

  // ---------- graph ops ----------
  const clearErr = () => setErr("");

  const addNode = () => {
    clearErr();
    const id = nodeInput.trim();
    if (!id) return setErr("Node id cannot be empty.");
    if (nodes.find((n) => n.id === id))
      return setErr(`Node "${id}" already exists.`);
    setNodes([
      ...nodes,
      { id, x: 100 + Math.random() * (SVG_W - 200), y: 80 + Math.random() * (SVG_H - 160) },
    ]);
    setNodeInput("");
  };

  const bulkAdd = () => {
    clearErr();
    const ids = bulkInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return setErr("Provide comma/space-separated node ids.");
    const existing = new Set(nodes.map((n) => n.id));
    const fresh = [];
    for (const id of ids) {
      if (existing.has(id)) continue;
      existing.add(id);
      fresh.push({
        id,
        x: 100 + Math.random() * (SVG_W - 200),
        y: 80 + Math.random() * (SVG_H - 160),
      });
    }
    setNodes([...nodes, ...fresh]);
    setBulkInput("");
  };

  const addEdge = () => {
    clearErr();
    const a = edgeFrom.trim();
    const b = edgeTo.trim();
    if (!a || !b) return setErr("Both endpoints required.");
    if (a === b) return setErr("Self-loops not allowed.");
    if (!nodes.find((n) => n.id === a)) return setErr(`Node "${a}" not found.`);
    if (!nodes.find((n) => n.id === b)) return setErr(`Node "${b}" not found.`);
    if (
      edges.find(
        (e) =>
          (e.from === a && e.to === b) || (e.from === b && e.to === a)
      )
    )
      return setErr("Edge already exists.");
    setEdges([...edges, { from: a, to: b }]);
    setEdgeFrom("");
    setEdgeTo("");
  };

  const deleteNode = () => {
    clearErr();
    const id = delNode.trim();
    if (!id) return setErr("Enter a node id to delete.");
    if (!nodes.find((n) => n.id === id))
      return setErr(`Node "${id}" not found.`);
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
    setDelNode("");
  };

  const deleteEdge = () => {
    clearErr();
    const a = delEdgeFrom.trim();
    const b = delEdgeTo.trim();
    if (!a || !b) return setErr("Both endpoints required.");
    const before = edges.length;
    const next = edges.filter(
      (e) =>
        !(
          (e.from === a && e.to === b) ||
          (e.from === b && e.to === a)
        )
    );
    if (next.length === before) return setErr("Edge not found.");
    setEdges(next);
    setDelEdgeFrom("");
    setDelEdgeTo("");
  };

  const clearAll = () => {
    setNodes([]);
    setEdges([]);
    setErr("");
  };

  const genRandom = () => {
    clearErr();
    const n = Math.max(2, Math.min(20, Number(randN) || 6));
    const m = Math.max(0, Math.min((n * (n - 1)) / 2, Number(randE) || n));
    const labels = Array.from({ length: n }, (_, i) =>
      String.fromCharCode(65 + i)
    );
    const newNodes = labels.map((id, i) => {
      const a = (2 * Math.PI * i) / n;
      return {
        id,
        x: SVG_W / 2 + 180 * Math.cos(a),
        y: SVG_H / 2 + 160 * Math.sin(a),
      };
    });
    const pairs = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) pairs.push([labels[i], labels[j]]);
    pairs.sort(() => Math.random() - 0.5);
    const newEdges = pairs.slice(0, m).map(([a, b]) => ({ from: a, to: b }));
    setNodes(newNodes);
    setEdges(newEdges);
    setStartNode(labels[0]);
  };

  const downloadCurrentGraph = () => {
    clearErr();
    if (nodes.length === 0) return setErr("Nothing to download.");
    downloadGraphJson(
      buildGraphPayload({
        nodes,
        edges,
        width: SVG_W,
        height: SVG_H,
        page: "bipartite",
        meta: { startNode },
      }),
      "bipartite-graph.json"
    );
  };

  const loadGraphFromFile = (graph, err) => {
    clearErr();
    if (err || !graph) return setErr(err?.message || "Failed to load graph.");
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
    setEdges(toFromToEdges(graph.edges));
    setStartNode(graph.meta?.startNode ?? graph.nodes[0]?.id ?? "");
  };

  const drawPlanarAsPossible = () => {
    clearErr();
    if (nodes.length < 2) return setErr("Need at least 2 nodes to layout.");
    const { nodes: next } = layoutPlanarAsPossible(nodes, edges, {
      width: SVG_W,
      height: SVG_H,
    });
    setNodes(next);
  };

  const genBipartite = () => {
    clearErr();
    const m = Math.max(1, Math.min(10, Number(biM) || 3));
    const n = Math.max(1, Math.min(10, Number(biN) || 3));
    const left = Array.from({ length: m }, (_, i) => `L${i + 1}`);
    const right = Array.from({ length: n }, (_, i) => `R${i + 1}`);
    const newNodes = [
      ...left.map((id, i) => ({
        id,
        x: 200,
        y: 60 + ((SVG_H - 120) / Math.max(1, m - 1)) * i || SVG_H / 2,
      })),
      ...right.map((id, i) => ({
        id,
        x: 600,
        y: 60 + ((SVG_H - 120) / Math.max(1, n - 1)) * i || SVG_H / 2,
      })),
    ];
    // add random edges only across partitions
    const newEdges = [];
    for (const a of left)
      for (const b of right) if (Math.random() < 0.5) newEdges.push({ from: a, to: b });
    if (!newEdges.length && left.length && right.length)
      newEdges.push({ from: left[0], to: right[0] });
    setNodes(newNodes);
    setEdges(newEdges);
    setStartNode(left[0]);
  };

  const genOddCycle = () => {
    clearErr();
    let k = Math.max(3, Math.min(15, Number(oddK) || 5));
    if (k % 2 === 0) k += 1;
    const labels = Array.from({ length: k }, (_, i) => `N${i + 1}`);
    const newNodes = labels.map((id, i) => {
      const a = (2 * Math.PI * i) / k - Math.PI / 2;
      return {
        id,
        x: SVG_W / 2 + 180 * Math.cos(a),
        y: SVG_H / 2 + 160 * Math.sin(a),
      };
    });
    const newEdges = labels.map((id, i) => ({
      from: id,
      to: labels[(i + 1) % k],
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    setStartNode(labels[0]);
  };

  // ---------- drag ----------
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

  const liveNodesRef = useRef(nodes);
  liveNodesRef.current = nodes;

  function setNodesPositional(id, x, y) {
    const next = liveNodesRef.current.map((n) =>
      n.id === id
        ? {
            ...n,
            x: Math.max(R, Math.min(SVG_W - R, x)),
            y: Math.max(R, Math.min(SVG_H - R, y)),
          }
        : n
    );
    liveNodesRef.current = next;
    setNodes(next);
  }

  // Stable window listeners (refs) so unmount can always detach the same fns
  // that were attached during a mid-gesture route change.
  const dragMove = useCallback((e) => {
    if (!drag.current) return;
    if (e.touches) e.preventDefault();
    const p = getSvgPoint(e);
    if (!p) return;
    setNodesPositional(drag.current.id, p.x, p.y);
  }, []);

  const dragUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("mousemove", dragMove);
    window.removeEventListener("mouseup", dragUp);
    window.removeEventListener("touchmove", dragMove);
    window.removeEventListener("touchend", dragUp);
    window.removeEventListener("touchcancel", dragUp);
  }, [dragMove]);

  const onMouseDown = (e, id) => {
    e.preventDefault();
    const p = getSvgPoint(e);
    if (!p) return;
    drag.current = { id, dx: 0, dy: 0, startX: p.x, startY: p.y };
    window.addEventListener("mousemove", dragMove);
    window.addEventListener("mouseup", dragUp);
    window.addEventListener("touchmove", dragMove, { passive: false });
    window.addEventListener("touchend", dragUp);
    window.addEventListener("touchcancel", dragUp);
  };

  useEffect(() => () => dragUp(), [dragUp]);

  // ---------- partition layout ----------
  const partitionCoords = React.useMemo(() => {
    if (!cur || !cur.color) return {};
    const leftIds = [];
    const rightIds = [];
    nodes.forEach((n) => {
      if (cur.color[n.id] === 0) leftIds.push(n.id);
      else if (cur.color[n.id] === 1) rightIds.push(n.id);
    });
    const map = {};
    const yFor = (i, total) =>
      total <= 1 ? SVG_H / 2 : 60 + ((SVG_H - 120) / (total - 1)) * i;
    leftIds.forEach((id, i) => (map[id] = { x: 220, y: yFor(i, leftIds.length) }));
    rightIds.forEach(
      (id, i) => (map[id] = { x: 580, y: yFor(i, rightIds.length) })
    );
    return map;
  }, [cur, nodes]);

  // ---------- derived rendering positions ----------
  const displayPos = (n) => {
    if (partitionView && partitionCoords[n.id]) {
      return partitionCoords[n.id];
    }
    return { x: n.x, y: n.y };
  };

  // ---------- verdict ----------
  const isLast = history && stepIdx === history.steps.length - 1;
  const conflict = history?.conflictEdge;
  const partitionA =
    cur && cur.color
      ? Object.entries(cur.color).filter(([, v]) => v === 0).length
      : 0;
  const partitionB =
    cur && cur.color
      ? Object.entries(cur.color).filter(([, v]) => v === 1).length
      : 0;

  const nodeFill = (id) => {
    if (!cur) return COLOR_GRAY;
    const c = cur.color[id];
    if (c === 0) return COLOR_BLUE;
    if (c === 1) return COLOR_ROSE;
    return COLOR_GRAY;
  };

  const edgeKey = (e) => `${e.from}__${e.to}`;
  const isExamined = (e) =>
    cur?.examined &&
    ((cur.examined.from === e.from && cur.examined.to === e.to) ||
      (cur.examined.from === e.to && cur.examined.to === e.from));
  const isConflict = (e) =>
    cur?.conflict &&
    ((cur.conflict.from === e.from && cur.conflict.to === e.to) ||
      (cur.conflict.from === e.to && cur.conflict.to === e.from));

  return (
    <div className="algo-dark min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">
            Bipartite Detection & 2-Coloring
          </h1>
          <p className="mt-1 text-slate-400 text-sm">
            A BFS that colors as it goes. A clean result confirms the partition;
            a conflict shows exactly where and why it fails.
          </p>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <aside className="lg:col-span-1 space-y-4">
            {/* Playback */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">Playback</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={!history}
                  className="flex-1 px-3 py-2 rounded-md bg-slate-200 text-slate-100 text-sm font-medium hover:bg-slate-300 disabled:opacity-40"
                >◀</button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  disabled={!history}
                  className="flex-1 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                >
                  {playing ? "❚❚ Pause" : "▶ Run"}
                </button>
                <button
                  onClick={() => setStepIdx((i) => Math.min((history?.steps.length || 1) - 1, i + 1))}
                  disabled={!history}
                  className="flex-1 px-3 py-2 rounded-md bg-slate-200 text-slate-100 text-sm font-medium hover:bg-slate-300 disabled:opacity-40"
                >▶</button>
                <button
                  onClick={() => { setStepIdx(0); setPlaying(false); setPartitionView(false); }}
                  disabled={!history}
                  className="flex-1 px-3 py-2 rounded-md bg-slate-200 text-slate-100 text-sm font-medium hover:bg-slate-300 disabled:opacity-40"
                >⟲</button>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-slate-400 mb-1">
                  Speed: {speed}ms
                </label>
                <input
                  type="range"
                  min="150"
                  max="1500"
                  step="50"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="mt-3">
                <label className="block text-xs text-slate-400 mb-1">
                  Start node
                </label>
                <select
                  value={startNode}
                  onChange={(e) => setStartNode(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  id="pview"
                  type="checkbox"
                  checked={partitionView}
                  onChange={(e) => setPartitionView(e.target.checked)}
                />
                <label htmlFor="pview" className="text-xs text-slate-300">
                  Free layout ↔ Partition view
                </label>
              </div>
            </div>

            {/* Edit nodes */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">Nodes</h2>
              <div className="flex gap-2 mb-2">
                <input
                  value={nodeInput}
                  onChange={(e) => setNodeInput(e.target.value)}
                  placeholder="id"
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <button
                  onClick={addNode}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm"
                >
                  + Node
                </button>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="A,B,C"
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <button
                  onClick={bulkAdd}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm"
                >
                  Bulk
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={delNode}
                  onChange={(e) => setDelNode(e.target.value)}
                  placeholder="id to delete"
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <button
                  onClick={deleteNode}
                  className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm"
                >
                  − Node
                </button>
              </div>
            </div>

            {/* Edit edges */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">Edges</h2>
              <div className="flex gap-2 mb-2">
                <input
                  value={edgeFrom}
                  onChange={(e) => setEdgeFrom(e.target.value)}
                  placeholder="from"
                  className="w-1/3 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <input
                  value={edgeTo}
                  onChange={(e) => setEdgeTo(e.target.value)}
                  placeholder="to"
                  className="w-1/3 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <button
                  onClick={addEdge}
                  className="flex-1 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm"
                >
                  + Edge
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={delEdgeFrom}
                  onChange={(e) => setDelEdgeFrom(e.target.value)}
                  placeholder="from"
                  className="w-1/3 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <input
                  value={delEdgeTo}
                  onChange={(e) => setDelEdgeTo(e.target.value)}
                  placeholder="to"
                  className="w-1/3 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                />
                <button
                  onClick={deleteEdge}
                  className="flex-1 px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm"
                >
                  − Edge
                </button>
              </div>
            </div>

            {/* Generators */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">Generate</h2>

              <GraphToolbar
                className="mb-3"
                onNewRandom={genRandom}
                onPlanarLayout={drawPlanarAsPossible}
                onDownload={downloadCurrentGraph}
                onLoad={loadGraphFromFile}
              />

              <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1">
                  Random graph size (n, e)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={randN}
                    onChange={(e) => setRandN(e.target.value)}
                    placeholder="n"
                    className="w-16 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                  />
                  <input
                    type="number"
                    value={randE}
                    onChange={(e) => setRandE(e.target.value)}
                    placeholder="e"
                    className="w-16 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1">
                  Random bipartite K&#8322;,&#8322;
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={biM}
                    onChange={(e) => setBiM(e.target.value)}
                    placeholder="m"
                    className="w-16 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                  />
                  <input
                    type="number"
                    value={biN}
                    onChange={(e) => setBiN(e.target.value)}
                    placeholder="n"
                    className="w-16 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                  />
                  <button
                    onClick={genBipartite}
                    className="flex-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm"
                  >
                    Bipartite
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1">
                  Odd cycle C&#8342;
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={oddK}
                    onChange={(e) => setOddK(e.target.value)}
                    placeholder="k"
                    className="w-16 px-2 py-1.5 text-sm border border-slate-600 rounded-md"
                  />
                  <button
                    onClick={genOddCycle}
                    className="flex-1 px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm"
                  >
                    Odd cycle
                  </button>
                </div>
              </div>

              <button
                onClick={clearAll}
                className="w-full px-3 py-1.5 rounded-md bg-slate-700 text-white text-sm"
              >
                Clear All
              </button>
            </div>

            {err && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-md p-2 text-sm">
                {err}
              </div>
            )}

            {/* Applications */}
            <div className="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-100 rounded-xl p-4">
              <h3 className="font-semibold text-slate-100 mb-1">
                Applications
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Job assignment, stable matching prep, two-team scheduling, RNA
                secondary structure, register allocation in 2-color interference
                graphs.
              </p>
            </div>
          </aside>

          {/* Canvas + panels */}
          <main className="lg:col-span-2 space-y-4">
            {/* Verdict banner */}
            {history && isLast && (
              <div
                className={`rounded-xl p-3 font-medium text-sm ${
                  conflict
                    ? "bg-rose-50 border border-rose-300 text-rose-800"
                    : "bg-emerald-50 border border-emerald-300 text-emerald-800"
                }`}
              >
                {conflict
                  ? `Not bipartite — odd cycle via edge (${conflict.from}, ${conflict.to})`
                  : `Bipartite ✓ — partitions |A|=${partitionA}, |B|=${partitionB}`}
              </div>
            )}

            {/* SVG */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-2 overflow-hidden">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-auto bg-slate-800 rounded-lg touch-none select-none"
                style={{ userSelect: "none" }}
              >
                {/* partition columns guide */}
                {partitionView && (
                  <>
                    <rect
                      x={60}
                      y={20}
                      width={320}
                      height={SVG_H - 40}
                      fill="#DBEAFE"
                      opacity="0.35"
                      rx="12"
                    />
                    <rect
                      x={420}
                      y={20}
                      width={320}
                      height={SVG_H - 40}
                      fill="#FFE4E6"
                      opacity="0.35"
                      rx="12"
                    />
                    <text
                      x={220}
                      y={40}
                      textAnchor="middle"
                      fill="#1E40AF"
                      fontSize="14"
                      fontWeight="700"
                    >
                      Partition A (color 0)
                    </text>
                    <text
                      x={580}
                      y={40}
                      textAnchor="middle"
                      fill="#9F1239"
                      fontSize="14"
                      fontWeight="700"
                    >
                      Partition B (color 1)
                    </text>
                  </>
                )}

                {/* ghost edges in partition view */}
                {partitionView &&
                  edges.map((e) => {
                    const a = nodes.find((n) => n.id === e.from);
                    const b = nodes.find((n) => n.id === e.to);
                    if (!a || !b) return null;
                    return (
                      <Edge
                        key={"g" + edgeKey(e)}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        ghost
                      />
                    );
                  })}

                {/* live edges */}
                {edges.map((e) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const ap = displayPos(a);
                  const bp = displayPos(b);
                  return (
                    <Edge
                      key={edgeKey(e)}
                      x1={ap.x}
                      y1={ap.y}
                      x2={bp.x}
                      y2={bp.y}
                      examined={isExamined(e)}
                      conflict={isConflict(e)}
                    />
                  );
                })}

                {/* ghost nodes in partition view */}
                {partitionView &&
                  nodes.map((n) => (
                    <circle
                      key={"gn" + n.id}
                      cx={n.x}
                      cy={n.y}
                      r={R}
                      fill="#E2E8F0"
                      stroke="#CBD5E1"
                      opacity="0.5"
                    />
                  ))}

                {/* live nodes */}
                {nodes.map((n) => {
                  const p = displayPos(n);
                  const drawNode = { ...n, x: p.x, y: p.y };
                  return (
                    <g
                      key={n.id}
                      style={{ transition: "transform 800ms ease" }}
                    >
                      <NodeCircle
                        node={drawNode}
                        fill={nodeFill(n.id)}
                        isCurrent={cur?.current === n.id}
                        isConflict={
                          cur?.conflict &&
                          (cur.conflict.from === n.id ||
                            cur.conflict.to === n.id)
                        }
                        onMouseDown={onMouseDown}
                      />
                    </g>
                  );
                })}
              </svg>
              <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-400">
                <span>
                  Step {history ? stepIdx + 1 : 0} / {history?.steps.length || 0}
                </span>
                <span className="italic">{cur?.msg}</span>
              </div>
            </div>

            {/* Live state panel + pseudocode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Live state */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <h3 className="font-semibold text-slate-100 mb-2">
                  Live state
                </h3>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-slate-400">Queue (front→back): </span>
                    <span className="font-mono text-slate-100">
                      [{(cur?.queue || []).join(", ")}]
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Visited: </span>
                    <span className="font-mono text-slate-100">
                      {"{" + (cur?.visited || []).join(", ") + "}"}
                    </span>
                  </div>
                  {cur?.conflict && (
                    <div className="text-rose-700 font-medium">
                      Conflict edge: ({cur.conflict.from}, {cur.conflict.to})
                    </div>
                  )}
                  <div>
                    <div className="text-slate-400 mb-1">Colors:</div>
                    <div className="max-h-40 overflow-auto border border-slate-700 rounded-md">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-800">
                          <tr>
                            <th className="text-left px-2 py-1">Node</th>
                            <th className="text-left px-2 py-1">Color</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nodes.map((n) => {
                            const c = cur?.color?.[n.id];
                            return (
                              <tr key={n.id} className="border-t">
                                <td className="px-2 py-1 font-mono">{n.id}</td>
                                <td className="px-2 py-1">
                                  {c === 0 ? (
                                    <span className="text-blue-600 font-medium">
                                      blue
                                    </span>
                                  ) : c === 1 ? (
                                    <span className="text-rose-600 font-medium">
                                      rose
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">
                                      uncolored
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pseudocode */}
              <div className="bg-slate-900 rounded-xl shadow-sm p-4 font-mono text-xs leading-relaxed">
                {PSEUDO.map((line, i) => (
                  <div
                    key={i}
                    className={`px-2 py-0.5 rounded ${
                      cur?.line === i
                        ? "bg-amber-500/20 text-amber-200"
                        : "text-slate-300"
                    }`}
                  >
                    {line || "\u00A0"}
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
