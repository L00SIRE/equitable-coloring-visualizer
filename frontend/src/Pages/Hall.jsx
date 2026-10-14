import React, { useState, useEffect, useRef, memo } from "react";
import GraphToolbar from "../Components/GraphToolbar";
import { buildGraphPayload, downloadGraphJson } from "../canvas/graphIO";

// ---------------- Pseudocode ----------------
const PSEUDO = [
  "function maxBipartiteMatching(A, B, edges):",
  "  match = {}                       // b -> a",
  "  for each a in A:",
  "    visited = {}",
  "    if dfs(a, visited):",
  "      matchedCount++",
  "  return match",
  "",
  "function dfs(a, visited):",
  "  for each b in neighbors(a):",
  "    if b in visited: continue",
  "    visited.add(b)",
  "    if match[b] == null OR dfs(match[b], visited):",
  "      match[b] = a",
  "      return true",
  "  return false",
];

// ---------------- Presets ----------------
const PRESET_JOB = {
  nodesA: [
    { id: "a1", label: "Alice" },
    { id: "a2", label: "Bob" },
    { id: "a3", label: "Carol" },
    { id: "a4", label: "Dan" },
  ],
  nodesB: [
    { id: "b1", label: "Dev" },
    { id: "b2", label: "Design" },
    { id: "b3", label: "PM" },
    { id: "b4", label: "QA" },
  ],
  edges: [
    { from: "a1", to: "b1" },
    { from: "a1", to: "b3" },
    { from: "a2", to: "b1" },
    { from: "a2", to: "b2" },
    { from: "a3", to: "b2" },
    { from: "a3", to: "b4" },
    { from: "a4", to: "b3" },
    { from: "a4", to: "b4" },
  ],
};

const PRESET_FAIL = {
  nodesA: [
    { id: "a1", label: "App 1" },
    { id: "a2", label: "App 2" },
    { id: "a3", label: "App 3" },
  ],
  nodesB: [
    { id: "b1", label: "Job 1" },
    { id: "b2", label: "Job 2" },
  ],
  edges: [
    { from: "a1", to: "b1" },
    { from: "a1", to: "b2" },
    { from: "a2", to: "b1" },
    { from: "a2", to: "b2" },
    { from: "a3", to: "b1" },
    { from: "a3", to: "b2" },
  ],
};

// ---------------- Helpers ----------------
const LEFT_X = 200;
const RIGHT_X = 600;
const TOP_Y = 60;
const BOTTOM_Y = 440;

function layoutY(index, total) {
  if (total <= 1) return (TOP_Y + BOTTOM_Y) / 2;
  return TOP_Y + (index * (BOTTOM_Y - TOP_Y)) / (total - 1);
}

// ---------------- Algorithm: augmenting-path DFS w/ history ----------------
function computeSteps(nodesA, nodesB, edges) {
  const steps = [];
  const A = nodesA.map((n) => n.id);
  const B = nodesB.map((n) => n.id);
  const adj = {};
  A.forEach((a) => (adj[a] = []));
  edges.forEach((e) => {
    const aSide = A.includes(e.from) ? e.from : e.to;
    const bSide = B.includes(e.from) ? e.from : e.to;
    if (A.includes(aSide) && B.includes(bSide)) {
      if (!adj[aSide].includes(bSide)) adj[aSide].push(bSide);
    }
  });

  const matchB = {}; // b -> a
  steps.push({
    kind: "init",
    line: 0,
    currentA: null,
    path: [],
    matching: [],
    visited: [],
    note: "Initialize: matching M = ∅",
  });

  function pushMatching() {
    const pairs = [];
    for (const b in matchB) pairs.push({ a: matchB[b], b });
    return pairs;
  }

  for (const a of A) {
    steps.push({
      kind: "startA",
      line: 2,
      currentA: a,
      path: [a],
      matching: pushMatching(),
      visited: [],
      note: `Try to augment from ${a}`,
    });

    const visited = new Set();
    const path = [a];

    function dfs(u) {
      steps.push({
        kind: "enterDfs",
        line: 9,
        currentA: a,
        path: [...path],
        matching: pushMatching(),
        visited: [...visited],
        note: `DFS from ${u}`,
      });
      for (const v of adj[u]) {
        steps.push({
          kind: "tryEdge",
          line: 10,
          currentA: a,
          path: [...path, v],
          matching: pushMatching(),
          visited: [...visited],
          edge: { from: u, to: v },
          note: `Examine edge ${u}–${v}`,
        });
        if (visited.has(v)) {
          steps.push({
            kind: "skip",
            line: 11,
            currentA: a,
            path: [...path],
            matching: pushMatching(),
            visited: [...visited],
            note: `${v} already visited, skip`,
          });
          continue;
        }
        visited.add(v);
        path.push(v);
        steps.push({
          kind: "visit",
          line: 12,
          currentA: a,
          path: [...path],
          matching: pushMatching(),
          visited: [...visited],
          note: `Visit ${v}`,
        });
        if (matchB[v] == null) {
          matchB[v] = u;
          steps.push({
            kind: "augment",
            line: 14,
            currentA: a,
            path: [...path],
            matching: pushMatching(),
            visited: [...visited],
            augmentEdge: { a: u, b: v },
            note: `${v} was free → match ${u}–${v}`,
          });
          path.pop();
          return true;
        } else {
          const prevA = matchB[v];
          path.push(prevA);
          steps.push({
            kind: "recurse",
            line: 13,
            currentA: a,
            path: [...path],
            matching: pushMatching(),
            visited: [...visited],
            note: `${v} matched with ${prevA}; try to re-match ${prevA}`,
          });
          if (dfs(prevA)) {
            matchB[v] = u;
            steps.push({
              kind: "augment",
              line: 14,
              currentA: a,
              path: [...path],
              matching: pushMatching(),
              visited: [...visited],
              augmentEdge: { a: u, b: v },
              note: `Re-match ${u}–${v}`,
            });
            path.pop();
            path.pop();
            return true;
          }
          path.pop();
        }
        path.pop();
      }
      steps.push({
        kind: "failDfs",
        line: 16,
        currentA: a,
        path: [...path],
        matching: pushMatching(),
        visited: [...visited],
        note: `DFS from ${u} failed`,
      });
      return false;
    }

    const ok = dfs(a);
    steps.push({
      kind: ok ? "matchedA" : "unmatchedA",
      line: 5,
      currentA: a,
      path: [],
      matching: pushMatching(),
      visited: [...visited],
      note: ok ? `Augmenting path found for ${a}` : `No augmenting path for ${a}`,
    });
  }

  // Final: compute Hall blocker subset S (König-style)
  const finalMatching = pushMatching();
  const matchA = {}; // a -> b
  finalMatching.forEach((p) => {
    matchA[p.a] = p.b;
  });
  const unmatchedA = A.filter((a) => !matchA[a]);

  // Alternating-reachable sets from unmatched A
  const Zleft = new Set(unmatchedA);
  const Zright = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of Zleft) {
      for (const b of adj[a]) {
        if (!Zright.has(b)) {
          Zright.add(b);
          changed = true;
        }
      }
    }
    for (const b of Zright) {
      const a = matchB[b];
      if (a && !Zleft.has(a)) {
        Zleft.add(a);
        changed = true;
      }
    }
  }

  const perfect = unmatchedA.length === 0;
  let blocker = null;
  if (!perfect) {
    // S = Zleft (a subset of A). N(S) ⊆ Zright in this construction.
    const S = [...Zleft];
    const NS = new Set();
    S.forEach((a) => adj[a].forEach((b) => NS.add(b)));
    blocker = { S, NS: [...NS] };
  }

  steps.push({
    kind: "done",
    line: 6,
    currentA: null,
    path: [],
    matching: finalMatching,
    visited: [],
    perfect,
    blocker,
    note: perfect
      ? `Perfect matching found: |M| = ${finalMatching.length}`
      : `No perfect matching. Blocker S found.`,
  });

  return { steps, finalMatching, perfect, blocker };
}

// ---------------- Node component ----------------
const NodeCircle = memo(function NodeCircle({
  node,
  side,
  onMouseDown,
  onTouchStart,
  highlighted,
  currentA,
  inPath,
  inBlockerS,
  inBlockerN,
}) {
  const baseFill =
    side === "A" ? "#fce7f3" : "#e0e7ff";
  const stroke =
    side === "A" ? "#db2777" : "#4f46e5";
  let fill = baseFill;
  if (currentA) fill = "#fde68a";
  else if (inPath) fill = "#fef08a";
  return (
    <g
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{ cursor: "ns-resize", touchAction: "none" }}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={22}
        fill={fill}
        stroke={stroke}
        strokeWidth={highlighted ? 4 : 2}
      />
      {(inBlockerS || inBlockerN) && (
        <circle
          cx={node.x}
          cy={node.y}
          r={28}
          fill="none"
          stroke={inBlockerS ? "#dc2626" : "#f97316"}
          strokeWidth={2.5}
          strokeDasharray="5 3"
        />
      )}
      <text
        x={node.x}
        y={node.y + 4}
        textAnchor="middle"
        fontSize={11}
        fontWeight="600"
        fill="#1e293b"
      >
        {node.id}
      </text>
      {node.label && (
        <text
          x={node.x}
          y={node.y + 40}
          textAnchor="middle"
          fontSize={10}
          fill="#475569"
        >
          {node.label}
        </text>
      )}
    </g>
  );
});

// ---------------- Main ----------------
export default function Hall() {
  const [nodesA, setNodesA] = useState(PRESET_JOB.nodesA);
  const [nodesB, setNodesB] = useState(PRESET_JOB.nodesB);
  const [edges, setEdges] = useState(PRESET_JOB.edges);

  const [newAId, setNewAId] = useState("");
  const [newBId, setNewBId] = useState("");
  const [edgeA, setEdgeA] = useState("");
  const [edgeB, setEdgeB] = useState("");
  const [delNode, setDelNode] = useState("");
  const [delEdgeA, setDelEdgeA] = useState("");
  const [delEdgeB, setDelEdgeB] = useState("");
  const [error, setError] = useState("");

  const [randA, setRandA] = useState(5);
  const [randB, setRandB] = useState(5);
  const [randP, setRandP] = useState(0.45);

  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [yOffsets, setYOffsets] = useState({});
  const dragRef = useRef(null);

  const history = React.useMemo(
    () => computeSteps(nodesA, nodesB, edges),
    [nodesA, nodesB, edges]
  );
  const steps = history.steps;
  const current = steps[Math.min(stepIdx, steps.length - 1)] || steps[0];

  useEffect(() => {
    setStepIdx(0);
    setPlaying(false);
  }, [nodesA, nodesB, edges]);

  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStepIdx((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, stepIdx, steps.length, speed]);

  // Compute node positions
  const positionedA = nodesA.map((n, i) => ({
    ...n,
    x: LEFT_X,
    y: layoutY(i, nodesA.length) + (yOffsets[n.id] || 0),
  }));
  const positionedB = nodesB.map((n, i) => ({
    ...n,
    x: RIGHT_X,
    y: layoutY(i, nodesB.length) + (yOffsets[n.id] || 0),
  }));
  const allNodes = [...positionedA, ...positionedB];
  const nodeMap = Object.fromEntries(allNodes.map((n) => [n.id, n]));

  // ---------------- Editor handlers ----------------
  function clearError() {
    setError("");
  }
  function addA() {
    clearError();
    const id = newAId.trim();
    if (!id) return setError("Provide an A-node ID");
    if (nodesA.find((n) => n.id === id) || nodesB.find((n) => n.id === id))
      return setError("ID already exists");
    setNodesA([...nodesA, { id }]);
    setNewAId("");
  }
  function addB() {
    clearError();
    const id = newBId.trim();
    if (!id) return setError("Provide a B-node ID");
    if (nodesA.find((n) => n.id === id) || nodesB.find((n) => n.id === id))
      return setError("ID already exists");
    setNodesB([...nodesB, { id }]);
    setNewBId("");
  }
  function addEdge() {
    clearError();
    const a = edgeA.trim();
    const b = edgeB.trim();
    if (!a || !b) return setError("Provide both endpoints");
    const aInA = nodesA.find((n) => n.id === a);
    const aInB = nodesB.find((n) => n.id === a);
    const bInA = nodesA.find((n) => n.id === b);
    const bInB = nodesB.find((n) => n.id === b);
    if (!aInA && !aInB) return setError(`${a} does not exist`);
    if (!bInA && !bInB) return setError(`${b} does not exist`);
    if ((aInA && bInA) || (aInB && bInB))
      return setError("Edges must connect A-side to B-side");
    const from = aInA ? a : b;
    const to = aInA ? b : a;
    if (edges.find((e) => e.from === from && e.to === to))
      return setError("Edge already exists");
    setEdges([...edges, { from, to }]);
    setEdgeA("");
    setEdgeB("");
  }
  function deleteNode() {
    clearError();
    const id = delNode.trim();
    if (!id) return setError("Provide a node ID to delete");
    if (nodesA.find((n) => n.id === id)) {
      setNodesA(nodesA.filter((n) => n.id !== id));
    } else if (nodesB.find((n) => n.id === id)) {
      setNodesB(nodesB.filter((n) => n.id !== id));
    } else return setError("No such node");
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
    setDelNode("");
  }
  function deleteEdge() {
    clearError();
    const a = delEdgeA.trim();
    const b = delEdgeB.trim();
    if (!a || !b) return setError("Provide both endpoints");
    const before = edges.length;
    const next = edges.filter(
      (e) => !((e.from === a && e.to === b) || (e.from === b && e.to === a))
    );
    if (next.length === before) return setError("Edge not found");
    setEdges(next);
    setDelEdgeA("");
    setDelEdgeB("");
  }
  function clearAll() {
    setNodesA([]);
    setNodesB([]);
    setEdges([]);
    setYOffsets({});
    clearError();
  }
  function loadPreset(p) {
    setNodesA(p.nodesA);
    setNodesB(p.nodesB);
    setEdges(p.edges);
    setYOffsets({});
    clearError();
  }
  function randomGraph() {
    clearError();
    const a = Math.max(1, Math.min(10, Math.floor(randA)));
    const b = Math.max(1, Math.min(10, Math.floor(randB)));
    const p = Math.max(0, Math.min(1, randP));
    const na = Array.from({ length: a }, (_, i) => ({ id: `a${i + 1}` }));
    const nb = Array.from({ length: b }, (_, i) => ({ id: `b${i + 1}` }));
    const ne = [];
    na.forEach((x) =>
      nb.forEach((y) => {
        if (Math.random() < p) ne.push({ from: x.id, to: y.id });
      })
    );
    setNodesA(na);
    setNodesB(nb);
    setEdges(ne);
    setYOffsets({});
  }

  function downloadCurrentGraph() {
    clearError();
    if (nodesA.length + nodesB.length === 0) {
      setError("Nothing to download.");
      return;
    }
    // Embed bipartition in positions so a generic loader can still place nodes.
    const laidOut = [
      ...nodesA.map((n, i) => ({ id: n.id, x: 180, y: layoutY(i, nodesA.length) })),
      ...nodesB.map((n, i) => ({ id: n.id, x: 620, y: layoutY(i, nodesB.length) })),
    ];
    downloadGraphJson(
      buildGraphPayload({
        nodes: laidOut,
        edges,
        width: 800,
        height: 500,
        page: "hall",
        meta: {
          nodesA: nodesA.map((n) => n.id),
          nodesB: nodesB.map((n) => n.id),
        },
      }),
      "hall-graph.json"
    );
  }

  function loadGraphFromFile(graph, err) {
    clearError();
    if (err || !graph) {
      setError(err?.message || "Failed to load graph.");
      return;
    }
    const aIds = Array.isArray(graph.meta?.nodesA)
      ? graph.meta.nodesA
      : graph.nodes.filter((n) => String(n.id).startsWith("a")).map((n) => n.id);
    const bIds = Array.isArray(graph.meta?.nodesB)
      ? graph.meta.nodesB
      : graph.nodes.filter((n) => String(n.id).startsWith("b")).map((n) => n.id);
    // Fallback: split by x position if meta missing
    let na = aIds.map((id) => ({ id }));
    let nb = bIds.map((id) => ({ id }));
    if (na.length === 0 && nb.length === 0 && graph.nodes.length) {
      const mid = 400;
      na = graph.nodes.filter((n) => n.x < mid).map((n) => ({ id: n.id }));
      nb = graph.nodes.filter((n) => n.x >= mid).map((n) => ({ id: n.id }));
    }
    setNodesA(na);
    setNodesB(nb);
    setEdges(graph.edges.map((e) => ({ from: e.a, to: e.b })));
    setYOffsets({});
  }

  // ---------------- Drag (vertical only) ----------------
  const SVG_W_HALL = 800;
  const SVG_H_HALL = 500;
  function getHallSvgPoint(event) {
    const svg = document.getElementById("hall-svg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const source = event.touches && event.touches[0]
      ? event.touches[0]
      : (event.changedTouches && event.changedTouches[0]) || event;
    const scaleX = SVG_W_HALL / rect.width;
    const scaleY = SVG_H_HALL / rect.height;
    return {
      x: (source.clientX - rect.left) * scaleX,
      y: (source.clientY - rect.top) * scaleY,
    };
  }
  function onNodeMouseDown(e, nodeId) {
    e.preventDefault();
    const loc = getHallSvgPoint(e);
    if (!loc) return;
    const base = allNodes.find((n) => n.id === nodeId);
    if (!base) return;
    dragRef.current = { id: nodeId, startMouseY: loc.y, startNodeY: base.y };
  }
  useEffect(() => {
    function move(e) {
      if (!dragRef.current) return;
      if (e.touches) e.preventDefault();
      const loc = getHallSvgPoint(e);
      if (!loc) return;
      const { id, startMouseY, startNodeY } = dragRef.current;
      const dy = loc.y - startMouseY;
      const newY = Math.max(40, Math.min(460, startNodeY + dy));
      const inA = nodesA.findIndex((n) => n.id === id) !== -1;
      const idx = inA
        ? nodesA.findIndex((n) => n.id === id)
        : nodesB.findIndex((n) => n.id === id);
      const total = inA ? nodesA.length : nodesB.length;
      const base0 = layoutY(idx, total);
      setYOffsets((p) => ({ ...p, [id]: newY - base0 }));
    }
    function up() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [nodesA, nodesB]);

  // ---------------- Derived render data ----------------
  const matching = current.matching || [];
  const matchSet = new Set(matching.map((p) => `${p.a}|${p.b}`));
  const pathEdges = [];
  if (current.path && current.path.length >= 2) {
    for (let i = 0; i < current.path.length - 1; i++) {
      pathEdges.push([current.path[i], current.path[i + 1]]);
    }
  }
  const pathEdgeSet = new Set(
    pathEdges.map(([x, y]) =>
      x < y ? `${x}|${y}` : `${y}|${x}`
    )
  );
  const pathNodeSet = new Set(current.path || []);
  const augment = current.augmentEdge;
  const examinedEdge = current.edge;

  const finalStep = steps[steps.length - 1];
  const blockerS = new Set(finalStep?.blocker?.S || []);
  const blockerN = new Set(finalStep?.blocker?.NS || []);
  const showBlocker = current.kind === "done" && !current.perfect;

  // ---------------- Render ----------------
  return (
    <div className="algo-dark min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">
            Hall's Marriage Theorem — Bipartite Matching
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            A perfect matching from A to B exists iff every subset S &sube; A has
            |N(S)| &ge; |S|. Watch augmenting paths build the matching.
          </p>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ---------- Controls ---------- */}
          <div className="lg:col-span-1 space-y-4">
            <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">
                Graph Editor
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="A-node id"
                    value={newAId}
                    onChange={(e) => setNewAId(e.target.value)}
                  />
                  <button
                    className="px-3 py-1 bg-pink-500 text-white rounded hover:bg-pink-600"
                    onClick={addA}
                  >
                    + A
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="B-node id"
                    value={newBId}
                    onChange={(e) => setNewBId(e.target.value)}
                  />
                  <button
                    className="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                    onClick={addB}
                  >
                    + B
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded"
                    placeholder="A id"
                    value={edgeA}
                    onChange={(e) => setEdgeA(e.target.value)}
                  />
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded"
                    placeholder="B id"
                    value={edgeB}
                    onChange={(e) => setEdgeB(e.target.value)}
                  />
                  <button
                    className="px-3 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600"
                    onClick={addEdge}
                  >
                    + Edge
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded"
                    placeholder="node id"
                    value={delNode}
                    onChange={(e) => setDelNode(e.target.value)}
                  />
                  <button
                    className="px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-700"
                    onClick={deleteNode}
                  >
                    − Node
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded"
                    placeholder="A id"
                    value={delEdgeA}
                    onChange={(e) => setDelEdgeA(e.target.value)}
                  />
                  <input
                    className="flex-1 px-2 py-1 border border-slate-600 rounded"
                    placeholder="B id"
                    value={delEdgeB}
                    onChange={(e) => setDelEdgeB(e.target.value)}
                  />
                  <button
                    className="px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-700"
                    onClick={deleteEdge}
                  >
                    Del
                  </button>
                </div>
                <button
                  onClick={clearAll}
                  className="w-full px-3 py-1 bg-rose-500 text-white rounded hover:bg-rose-600"
                >
                  Clear All
                </button>
              </div>
            </section>

            <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">
                Generate & Presets
              </h2>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <label className="flex flex-col text-slate-400">
                  |A|
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={randA}
                    onChange={(e) => setRandA(+e.target.value)}
                    className="px-2 py-1 border border-slate-600 rounded"
                  />
                </label>
                <label className="flex flex-col text-slate-400">
                  |B|
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={randB}
                    onChange={(e) => setRandB(+e.target.value)}
                    className="px-2 py-1 border border-slate-600 rounded"
                  />
                </label>
                <label className="flex flex-col text-slate-400">
                  p
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={randP}
                    onChange={(e) => setRandP(+e.target.value)}
                    className="px-2 py-1 border border-slate-600 rounded"
                  />
                </label>
              </div>
              <GraphToolbar
                className="mt-2"
                onNewRandom={randomGraph}
                onDownload={downloadCurrentGraph}
                onLoad={loadGraphFromFile}
                randomLabel="New Random Graph"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => loadPreset(PRESET_JOB)}
                  className="px-3 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 text-sm"
                >
                  Job Assignment
                </button>
                <button
                  onClick={() => loadPreset(PRESET_FAIL)}
                  className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm"
                >
                  Hall Fails
                </button>
              </div>
            </section>

            <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-3">Playback</h2>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <button
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  className="px-3 py-1.5 bg-slate-200 text-slate-300 rounded hover:bg-slate-300"
                >◀</button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="col-span-2 px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  {playing ? "❚❚ Pause" : "▶ Run"}
                </button>
                <button
                  onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                  className="px-3 py-1.5 bg-slate-200 text-slate-300 rounded hover:bg-slate-300"
                >▶</button>
                <button
                  onClick={() => { setStepIdx(0); setPlaying(false); }}
                  className="col-span-4 px-3 py-1.5 bg-rose-500 text-white rounded hover:bg-rose-600"
                >⟲ Reset</button>
              </div>
              <label className="block mt-3 text-sm text-slate-400">
                Speed: {speed} ms
                <input
                  type="range"
                  min={100}
                  max={1500}
                  step={50}
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                  className="w-full"
                />
              </label>
              <div className="mt-2 text-xs text-slate-400">
                Step {Math.min(stepIdx + 1, steps.length)} / {steps.length}
              </div>
            </section>

            <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold text-slate-100 mb-2">Live State</h2>
              <div className="text-sm text-slate-300 space-y-1">
                <div>
                  <span className="font-medium">Current a:</span>{" "}
                  {current.currentA || "—"}
                </div>
                <div>
                  <span className="font-medium">DFS path:</span>{" "}
                  {current.path && current.path.length
                    ? current.path.join(" → ")
                    : "—"}
                </div>
                <div>
                  <span className="font-medium">|M|:</span> {matching.length}
                </div>
                <div>
                  <span className="font-medium">M:</span>{" "}
                  {matching.length
                    ? matching.map((p) => `${p.a}–${p.b}`).join(", ")
                    : "∅"}
                </div>
                <div className="italic text-slate-400">{current.note}</div>
              </div>
            </section>

            <section className="bg-gradient-to-r from-amber-50 to-pink-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-semibold text-slate-100 mb-1">
                Real-world applications
              </h3>
              <p className="text-sm text-slate-300">
                Job-candidate assignment, college admissions, kidney exchange
                networks, taxi dispatch, resource allocation.
              </p>
            </section>
          </div>

          {/* ---------- SVG + panels ---------- */}
          <div className="lg:col-span-2 space-y-4">
            {/* Verdict */}
            {current.kind === "done" && (
              <div
                className={`rounded-xl p-4 border shadow-sm ${
                  current.perfect
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {current.perfect ? (
                  <div className="font-semibold">
                    Perfect matching found ✓ |M| = {matching.length}
                  </div>
                ) : (
                  <div>
                    <div className="font-semibold">
                      Hall's condition fails — subset S of size{" "}
                      {current.blocker.S.length} has |N(S)| ={" "}
                      {current.blocker.NS.length}
                    </div>
                    <div className="text-sm mt-1">
                      S = {"{"} {current.blocker.S.join(", ")} {"}"} · N(S) ={" "}
                      {"{"} {current.blocker.NS.join(", ")} {"}"}
                    </div>
                    <div className="flex gap-4 mt-2 text-sm">
                      <span className="px-2 py-1 bg-rose-100 rounded">
                        |S| = {current.blocker.S.length}
                      </span>
                      <span className="px-2 py-1 bg-amber-100 rounded">
                        |N(S)| = {current.blocker.NS.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-900 rounded-xl border border-slate-800 p-2">
              <svg
                id="hall-svg"
                viewBox="0 0 800 500"
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-[500px] bg-slate-800 rounded-lg touch-none select-none"
              >
                {/* column labels */}
                <text
                  x={LEFT_X}
                  y={30}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="700"
                  fill="#db2777"
                >
                  A ({nodesA.length})
                </text>
                <text
                  x={RIGHT_X}
                  y={30}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="700"
                  fill="#4f46e5"
                >
                  B ({nodesB.length})
                </text>

                {/* Edges */}
                {edges.map((e, i) => {
                  const from = nodeMap[e.from];
                  const to = nodeMap[e.to];
                  if (!from || !to) return null;
                  const isMatched =
                    matchSet.has(`${e.from}|${e.to}`) ||
                    matchSet.has(`${e.to}|${e.from}`);
                  const keyAB =
                    e.from < e.to
                      ? `${e.from}|${e.to}`
                      : `${e.to}|${e.from}`;
                  const inPath = pathEdgeSet.has(keyAB);
                  const isExamined =
                    examinedEdge &&
                    ((examinedEdge.from === e.from &&
                      examinedEdge.to === e.to) ||
                      (examinedEdge.from === e.to &&
                        examinedEdge.to === e.from));
                  const isAugment =
                    augment &&
                    ((augment.a === e.from && augment.b === e.to) ||
                      (augment.a === e.to && augment.b === e.from));
                  let stroke = "#cbd5e1";
                  let width = 2;
                  if (isMatched) {
                    stroke = "#10b981";
                    width = 5;
                  }
                  if (inPath) {
                    stroke = "#eab308";
                    width = 4;
                  }
                  if (isExamined) {
                    stroke = "#64748b";
                    width = 3.5;
                  }
                  if (isAugment) {
                    stroke = "#10b981";
                    width = 6;
                  }
                  return (
                    <line
                      key={i}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={stroke}
                      strokeWidth={width}
                      opacity={0.9}
                    />
                  );
                })}

                {/* Nodes */}
                {positionedA.map((n) => (
                  <NodeCircle
                    key={n.id}
                    node={n}
                    side="A"
                    onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                    onTouchStart={(e) => onNodeMouseDown(e, n.id)}
                    highlighted={pathNodeSet.has(n.id)}
                    currentA={current.currentA === n.id}
                    inPath={pathNodeSet.has(n.id)}
                    inBlockerS={showBlocker && blockerS.has(n.id)}
                    inBlockerN={false}
                  />
                ))}
                {positionedB.map((n) => (
                  <NodeCircle
                    key={n.id}
                    node={n}
                    side="B"
                    onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                    onTouchStart={(e) => onNodeMouseDown(e, n.id)}
                    highlighted={pathNodeSet.has(n.id)}
                    currentA={false}
                    inPath={pathNodeSet.has(n.id)}
                    inBlockerS={false}
                    inBlockerN={showBlocker && blockerN.has(n.id)}
                  />
                ))}
              </svg>
            </div>

            {/* Pseudocode */}
            <div className="bg-slate-900 rounded-xl p-4 shadow-sm">
              <h3 className="text-slate-200 font-semibold mb-2">Pseudocode</h3>
              <pre className="text-xs leading-relaxed font-mono">
                {PSEUDO.map((line, i) => (
                  <div
                    key={i}
                    className={`px-2 py-0.5 rounded ${
                      current.line === i
                        ? "bg-amber-400/20 text-amber-200"
                        : "text-slate-300"
                    }`}
                  >
                    <span className="text-slate-400 mr-2">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {line || " "}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
