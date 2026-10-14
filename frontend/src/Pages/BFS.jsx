import React, { useEffect, useMemo, useRef, useState } from 'react';
import GraphToolbar from '../Components/GraphToolbar';
import { createRandomGraph, edgesToFromTo } from '../canvas/randomGraph';
import { buildGraphPayload, downloadGraphJson, toFromToEdges } from '../canvas/graphIO';
import { layoutPlanarAsPossible } from '../canvas/planarLayout';

const SVG_WIDTH = 860;
const SVG_HEIGHT = 520;
const NODE_RADIUS = 24;

const buttonBase =
  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

const BFS_PSEUDOCODE = [
  { line: 1, text: 'Initialize queue Q' },
  { line: 2, text: 'Mark source as visited' },
  { line: 3, text: 'Set distance[source] = 0' },
  { line: 4, text: 'Enqueue source into Q' },
  { line: 5, text: 'While Q is not empty:' },
  { line: 6, text: '    Dequeue node u from Q' },
  { line: 7, text: '    For each neighbor v of u:' },
  { line: 8, text: '        If v is not visited:' },
  { line: 9, text: '            Mark v as visited' },
  { line: 10, text: '            Set parent[v] = u' },
  { line: 11, text: '            Set distance[v] = distance[u] + 1' },
  { line: 12, text: '            Enqueue v into Q' },
];

const toEdgeKey = (a, b) => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}-${hi}`;
};

const sortNumeric = (arr) => [...arr].sort((a, b) => a - b);
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const buildAdjacency = (nodes, edges) => {
  const adj = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
  });

  edges.forEach((edge) => {
    if (adj[edge.from] && adj[edge.to]) {
      adj[edge.from].push(edge.to);
      adj[edge.to].push(edge.from);
    }
  });

  Object.keys(adj).forEach((id) => {
    adj[id] = sortNumeric(adj[id]);
  });

  return adj;
};

const getExampleGraph = () => ({
  nodes: [
    { id: 6, x: 110, y: 110 },
    { id: 5, x: 220, y: 110 },
    { id: 4, x: 330, y: 110 },
    { id: 3, x: 440, y: 110 },
    { id: 8, x: 560, y: 110 },
    { id: 7, x: 110, y: 220 },
    { id: 0, x: 220, y: 220 },
    { id: 1, x: 330, y: 220 },
    { id: 2, x: 440, y: 220 },
    { id: 12, x: 110, y: 360 },
    { id: 13, x: 220, y: 360 },
    { id: 14, x: 330, y: 360 },
    { id: 15, x: 500, y: 305 },
    { id: 11, x: 500, y: 360 },
    { id: 10, x: 620, y: 360 },
    { id: 9, x: 620, y: 250 },
  ],
  edges: [
    { from: 6, to: 5 },
    { from: 5, to: 4 },
    { from: 4, to: 3 },
    { from: 3, to: 8 },
    { from: 6, to: 7 },
    { from: 5, to: 0 },
    { from: 4, to: 1 },
    { from: 3, to: 2 },
    { from: 8, to: 9 },
    { from: 7, to: 0 },
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 7, to: 12 },
    { from: 12, to: 13 },
    { from: 13, to: 14 },
    { from: 14, to: 11 },
    { from: 11, to: 10 },
    { from: 2, to: 15 },
    { from: 2, to: 13 },
    { from: 15, to: 14 },
    { from: 15, to: 9 },
    { from: 15, to: 11 },
    { from: 9, to: 10 },
  ],
  source: 6,
  target: 10,
});

const generateSteps = (nodes, edges, source, target) => {
  const sourceId = Number(source);
  const targetId = Number(target);

  if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) {
    return { steps: [], error: 'Source and target must be valid node IDs.' };
  }

  const ids = new Set(nodes.map((n) => n.id));
  if (!ids.has(sourceId) || !ids.has(targetId)) {
    return { steps: [], error: 'Source or target is missing from the graph.' };
  }

  const adj = buildAdjacency(nodes, edges);
  const queue = [sourceId];
  const visited = new Set([sourceId]);
  const parent = { [sourceId]: null };
  const distances = { [sourceId]: 0 };
  const treeEdgeKeys = [];
  const steps = [];

  const snapshot = ({
    action,
    narration,
    pseudoLine,
    current = null,
    newlyDiscovered = [],
    dequeued = null,
    enqueued = [],
    phase = 'search',
    pathNodes = [],
    pathEdges = [],
  }) => {
    const levelMap = {};
    Object.entries(distances).forEach(([nodeId, d]) => {
      if (!levelMap[d]) levelMap[d] = [];
      levelMap[d].push(Number(nodeId));
    });

    Object.keys(levelMap).forEach((lvl) => {
      levelMap[lvl] = sortNumeric(levelMap[lvl]);
    });

    const currentLevel =
      current !== null && distances[current] !== undefined ? distances[current] : null;

    steps.push({
      stepNumber: steps.length,
      action,
      narration,
      explanation: narration,
      pseudoLine,
      phase,
      current,
      currentLevel,
      queue: [...queue],
      visited: sortNumeric([...visited]),
      parent: { ...parent },
      distances: { ...distances },
      treeEdges: [...treeEdgeKeys],
      newlyDiscovered: [...newlyDiscovered],
      dequeued,
      enqueued: [...enqueued],
      pathNodes: [...pathNodes],
      path: [...pathNodes],
      pathEdges: [...pathEdges],
      levelMap,
    });
  };

  snapshot({
    action: 'initialize-queue',
    narration: 'Initialize empty queue Q.',
    pseudoLine: 1,
    current: null,
  });

  snapshot({
    action: 'mark-source',
    narration: `Mark source ${sourceId} as visited.`,
    pseudoLine: 2,
    current: sourceId,
    newlyDiscovered: [sourceId],
  });

  snapshot({
    action: 'distance-source',
    narration: `Set distance[${sourceId}] = 0.`,
    pseudoLine: 3,
    current: sourceId,
  });

  snapshot({
    action: 'enqueue-source',
    narration: `Enqueue source ${sourceId} into Q.`,
    pseudoLine: 4,
    current: sourceId,
    enqueued: [sourceId],
  });

  if (sourceId === targetId) {
    snapshot({
      action: 'target-found',
      narration: `Source equals target (${sourceId}). Shortest path is length 0.`,
      pseudoLine: 5,
      current: sourceId,
      phase: 'path',
      pathNodes: [sourceId],
      pathEdges: [],
    });

    return { steps, error: null };
  }

  while (queue.length > 0) {
    const u = queue.shift();

    snapshot({
      action: 'dequeue',
      narration: `Dequeued node ${u} from the front of the queue.`,
      pseudoLine: 6,
      current: u,
      dequeued: u,
    });

    let discoveredAny = false;

    for (const v of adj[u] || []) {
      if (visited.has(v)) continue;

      discoveredAny = true;
      visited.add(v);
      parent[v] = u;
      distances[v] = distances[u] + 1;
      queue.push(v);

      const treeKey = toEdgeKey(u, v);
      treeEdgeKeys.push(treeKey);

      snapshot({
        action: 'discover',
        narration: `Discovered node ${v} from node ${u}. Assigned distance ${distances[v]} and parent ${u}.`,
        pseudoLine: 12,
        current: u,
        newlyDiscovered: [v],
        enqueued: [v],
      });

      if (v === targetId) {
        const pathNodes = [];
        let cursor = targetId;
        while (cursor !== null) {
          pathNodes.unshift(cursor);
          cursor = parent[cursor];
        }

        const pathEdges = [];
        for (let i = 0; i < pathNodes.length - 1; i += 1) {
          pathEdges.push(toEdgeKey(pathNodes[i], pathNodes[i + 1]));
        }

        snapshot({
          action: 'reconstruct-path',
          narration: `Target ${targetId} found. Reconstructing shortest path from parent pointers.`,
          pseudoLine: 5,
          current: v,
          phase: 'path',
          pathNodes,
          pathEdges,
        });

        return { steps, error: null };
      }
    }

    if (!discoveredAny) {
      snapshot({
        action: 'no-new-discovery',
        narration: `Node ${u} produced no new discoveries; continue with the remaining frontier.`,
        pseudoLine: 7,
        current: u,
      });
    }
  }

  snapshot({
    action: 'no-path',
    narration: `Queue exhausted. No path exists from ${sourceId} to ${targetId}.`,
    pseudoLine: 5,
    current: null,
    phase: 'path',
    pathNodes: [],
    pathEdges: [],
  });

  return { steps, error: null };
};

const StatChip = ({ label, value }) => (
  <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
    <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-sm font-semibold text-slate-100">{value}</p>
  </div>
);

const PseudocodePanel = ({ activeLine }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Pseudocode</h3>
    <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1 font-mono text-xs md:max-h-none">
      {BFS_PSEUDOCODE.map((row) => {
        const active = row.line === activeLine;
        return (
          <div
            key={row.line}
            className={`flex items-start gap-2 rounded-md px-2 py-1 transition-colors duration-200 ${
              active
                ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-500/40'
                : 'text-slate-400 hover:bg-slate-800/70'
            }`}
          >
            <span className={`w-6 text-right ${active ? 'text-sky-200' : 'text-slate-500'}`}>{row.line}</span>
            <span className="whitespace-pre-wrap">{row.text}</span>
          </div>
        );
      })}
    </div>
  </div>
);

const StepExplanationPanel = ({ currentStep, message }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Current Step</h3>
    <p className="mt-2 text-sm leading-6 text-slate-200">{currentStep?.explanation || message}</p>
    {currentStep && (
      <p className="mt-2 text-xs text-slate-400">
        Action: <span className="font-semibold text-slate-300">{currentStep.action}</span>
      </p>
    )}
  </div>
);

const QueuePanel = ({ queue }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Queue (Front → Back)</h3>
    {queue?.length ? (
      <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto pb-1 transition-all duration-200">
        {queue.map((id, idx) => (
          <div
            key={`q-${id}-${idx}`}
            className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200"
          >
            {idx === 0 ? 'FRONT ' : ''}
            {id}
            {idx === queue.length - 1 ? ' BACK' : ''}
          </div>
        ))}
      </div>
    ) : (
      <p className="mt-2 text-sm text-slate-400">Queue is empty.</p>
    )}
  </div>
);

const LevelsPanel = ({ currentStep }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Levels by Distance</h3>
    {currentStep?.levelMap && Object.keys(currentStep.levelMap).length > 0 ? (
      <div className="mt-2 space-y-2">
        {Object.entries(currentStep.levelMap)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([lvl, ids]) => {
            const isActive = Number(lvl) === currentStep.currentLevel;
            return (
              <div
                key={`lvl-${lvl}`}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isActive
                    ? 'border-sky-500/60 bg-sky-500/20 text-sky-100'
                    : 'border-slate-700 bg-slate-800/80 text-slate-300'
                }`}
              >
                Level {lvl}: [{ids.join(', ')}]
              </div>
            );
          })}
      </div>
    ) : (
      <p className="mt-2 text-sm text-slate-400">Run BFS to see level expansion.</p>
    )}
  </div>
);

const ParentPanel = ({ parent }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Parent Map (BFS Tree)</h3>
    {parent && Object.keys(parent).length > 0 ? (
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        {Object.entries(parent)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([child, par]) => (
            <div key={`p-${child}`} className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-slate-200">
              {child} ← {par === null ? 'root' : par}
            </div>
          ))}
      </div>
    ) : (
      <p className="mt-2 text-sm text-slate-400">No tree yet.</p>
    )}
  </div>
);

const LegendPanel = () => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Legend</h3>
    <div className="mt-2 grid gap-2 text-xs text-slate-300">
      <p><span className="inline-block h-2 w-8 rounded bg-slate-600" /> Neutral graph edge</p>
      <p><span className="inline-block h-2 w-8 rounded bg-cyan-400" /> BFS discovery/tree edge</p>
      <p><span className="inline-block h-2 w-8 rounded bg-rose-400" /> Final shortest-path edge</p>
      <p><span className="inline-block h-3 w-3 rounded-full bg-sky-700" /> Source node</p>
      <p><span className="inline-block h-3 w-3 rounded-full bg-rose-800" /> Target node</p>
      <p><span className="inline-block h-3 w-3 rounded-full bg-teal-700" /> Current node</p>
      <p><span className="inline-block h-3 w-3 rounded-full bg-amber-700" /> Queue/frontier node</p>
      <p><span className="inline-block h-3 w-3 rounded-full bg-blue-700" /> Visited/discovered node</p>
      <p><span className="inline-block h-3 w-3 rounded-full bg-rose-700" /> Final path node</p>
    </div>
  </div>
);

export default function BFS() {
  const example = useMemo(() => getExampleGraph(), []);

  const [nodes, setNodes] = useState(example.nodes);
  const [edges, setEdges] = useState(example.edges);
  const [source, setSource] = useState(example.source);
  const [target, setTarget] = useState(example.target);
  const [edgeFrom, setEdgeFrom] = useState('');
  const [edgeTo, setEdgeTo] = useState('');
  const [bulkNodeCount, setBulkNodeCount] = useState('5');
  const [randomEdgeCount, setRandomEdgeCount] = useState('6');
  const [removeNodeId, setRemoveNodeId] = useState('');
  const [removeEdgeFrom, setRemoveEdgeFrom] = useState('');
  const [removeEdgeTo, setRemoveEdgeTo] = useState('');
  const [autoConnectNewNodes, setAutoConnectNewNodes] = useState(true);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(850);
  const [message, setMessage] = useState('Load a graph, choose source/target, then start BFS.');

  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const nodeMap = useMemo(() => {
    const map = {};
    nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [nodes]);

  const edgeKeys = useMemo(() => new Set(edges.map((e) => toEdgeKey(e.from, e.to))), [edges]);

  const currentStep = steps[stepIndex] || null;
  const pathLength = currentStep?.pathNodes?.length ? currentStep.pathNodes.length - 1 : null;

  const allIds = useMemo(() => sortNumeric(nodes.map((n) => n.id)), [nodes]);

  useEffect(() => {
    if (!isPlaying || steps.length === 0 || stepIndex >= steps.length - 1) return undefined;

    const timer = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, speedMs);

    return () => clearInterval(timer);
  }, [isPlaying, speedMs, stepIndex, steps.length]);

  useEffect(() => {
    if (!currentStep) return;
    setMessage(currentStep.narration);
    if (stepIndex >= steps.length - 1) {
      setIsPlaying(false);
    }
  }, [currentStep, stepIndex, steps.length]);

  useEffect(() => {
    if (nodes.length === 0) {
      setSource('');
      setTarget('');
      return;
    }

    const ids = new Set(nodes.map((n) => n.id));
    const sorted = sortNumeric([...ids]);

    if (!ids.has(Number(source))) {
      setSource(sorted[0]);
    }
    if (!ids.has(Number(target))) {
      setTarget(sorted[sorted.length - 1]);
    }
  }, [nodes, source, target]);

  const resetTraversalState = () => {
    setSteps([]);
    setStepIndex(0);
    setIsPlaying(false);
  };

  const addNode = () => {
    const nextId = nodes.length ? Math.max(...nodes.map((n) => n.id)) + 1 : 1;

    let x = 80;
    let y = 80;
    let attempts = 0;

    while (attempts < 160) {
      const candidateX = Math.round(Math.random() * (SVG_WIDTH - 140) + 70);
      const candidateY = Math.round(Math.random() * (SVG_HEIGHT - 140) + 70);

      const overlaps = nodes.some((n) => {
        const dx = n.x - candidateX;
        const dy = n.y - candidateY;
        return Math.hypot(dx, dy) < NODE_RADIUS * 2.5;
      });

      if (!overlaps) {
        x = candidateX;
        y = candidateY;
        break;
      }

      attempts += 1;
    }

    const newNode = { id: nextId, x, y };
    const updatedNodes = [...nodes, newNode];
    let nextEdges = [...edges];
    let attached = 0;

    if (autoConnectNewNodes && nodes.length > 0) {
      const candidates = shuffle(nodes.map((n) => n.id));
      const picked = candidates[0];
      const key = toEdgeKey(nextId, picked);
      if (!edgeKeys.has(key)) {
        nextEdges.push({ from: nextId, to: picked });
        attached = 1;
      }
    }

    setNodes(updatedNodes);
    setEdges(nextEdges);
    resetTraversalState();
    setMessage(
      attached > 0
        ? `Added node ${nextId} and connected it to node ${nextEdges[nextEdges.length - 1].to}.`
        : `Added node ${nextId}.`
    );
  };

  const addBulkNodes = () => {
    const count = Number(bulkNodeCount);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      setMessage('Bulk add expects an integer between 1 and 50.');
      return;
    }

    const nextIdStart = nodes.length ? Math.max(...nodes.map((n) => n.id)) + 1 : 1;
    const added = [];

    for (let i = 0; i < count; i += 1) {
      let x = 80;
      let y = 80;
      let attempts = 0;

      while (attempts < 180) {
        const candidateX = Math.round(Math.random() * (SVG_WIDTH - 140) + 70);
        const candidateY = Math.round(Math.random() * (SVG_HEIGHT - 140) + 70);

        const overlaps = [...nodes, ...added].some((n) => {
          const dx = n.x - candidateX;
          const dy = n.y - candidateY;
          return Math.hypot(dx, dy) < NODE_RADIUS * 2.4;
        });

        if (!overlaps) {
          x = candidateX;
          y = candidateY;
          break;
        }
        attempts += 1;
      }

      added.push({ id: nextIdStart + i, x, y });
    }

    const updatedNodes = [...nodes, ...added];
    let nextEdges = [...edges];
    let attachedCount = 0;

    if (autoConnectNewNodes && updatedNodes.length > 1) {
      const used = new Set(nextEdges.map((e) => toEdgeKey(e.from, e.to)));
      added.forEach((newNode, idx) => {
        const pool = shuffle(
          updatedNodes
            .filter((n) => n.id !== newNode.id)
            .map((n) => n.id)
        );
        const desired = pool.length > 3 ? 2 : 1;
        let made = 0;

        for (let i = 0; i < pool.length && made < desired; i += 1) {
          const candidate = pool[i];
          const key = toEdgeKey(newNode.id, candidate);
          if (used.has(key)) continue;
          used.add(key);
          nextEdges.push({ from: newNode.id, to: candidate });
          made += 1;
          attachedCount += 1;
        }

        if (idx === 0 && made === 0 && nodes.length > 0) {
          const fallback = nodes[0].id;
          const key = toEdgeKey(newNode.id, fallback);
          if (!used.has(key)) {
            used.add(key);
            nextEdges.push({ from: newNode.id, to: fallback });
            attachedCount += 1;
          }
        }
      });
    }

    setNodes(updatedNodes);
    setEdges(nextEdges);
    resetTraversalState();
    setMessage(
      attachedCount > 0
        ? `Added ${added.length} nodes (${added[0].id}..${added[added.length - 1].id}) with ${attachedCount} random connecting edge(s).`
        : `Added ${added.length} nodes (${added[0].id}..${added[added.length - 1].id}).`
    );
  };

  const addEdge = () => {
    const from = Number(edgeFrom);
    const to = Number(edgeTo);

    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      setMessage('Enter valid and distinct node IDs for the edge.');
      return;
    }

    if (!nodeMap[from] || !nodeMap[to]) {
      setMessage('Cannot add edge: one or both nodes are missing.');
      return;
    }

    const key = toEdgeKey(from, to);
    if (edgeKeys.has(key)) {
      setMessage(`Edge (${from}, ${to}) already exists.`);
      return;
    }

    setEdges((prev) => [...prev, { from, to }]);
    resetTraversalState();
    setEdgeFrom('');
    setEdgeTo('');
    setMessage(`Added edge (${from}, ${to}).`);
  };

  const clearGraph = () => {
    setNodes([]);
    setEdges([]);
    setEdgeFrom('');
    setEdgeTo('');
    setRemoveNodeId('');
    setRemoveEdgeFrom('');
    setRemoveEdgeTo('');
    resetTraversalState();
    setMessage('Graph cleared.');
  };

  const loadExample = () => {
    const ex = getExampleGraph();
    setNodes(ex.nodes);
    setEdges(ex.edges);
    setSource(ex.source);
    setTarget(ex.target);
    resetTraversalState();
    setMessage('Loaded example graph (deterministic traversal).');
  };

  const addRandomEdges = () => {
    if (nodes.length < 2) {
      setMessage('Need at least 2 nodes to generate random edges.');
      return;
    }

    const requestCount = Number(randomEdgeCount);
    if (!Number.isInteger(requestCount) || requestCount < 1) {
      setMessage('Random edge count must be a positive integer.');
      return;
    }

    const maxPossible = (nodes.length * (nodes.length - 1)) / 2;
    const available = maxPossible - edges.length;
    if (available <= 0) {
      setMessage('Graph already has all possible undirected edges.');
      return;
    }

    const toAdd = Math.min(requestCount, available);
    const existing = new Set(edges.map((e) => toEdgeKey(e.from, e.to)));
    const nextEdges = [...edges];
    let added = 0;
    let attempts = 0;
    const maxAttempts = toAdd * 40;

    while (added < toAdd && attempts < maxAttempts) {
      const a = nodes[Math.floor(Math.random() * nodes.length)].id;
      const b = nodes[Math.floor(Math.random() * nodes.length)].id;
      attempts += 1;
      if (a === b) continue;

      const key = toEdgeKey(a, b);
      if (existing.has(key)) continue;

      existing.add(key);
      nextEdges.push({ from: a, to: b });
      added += 1;
    }

    setEdges(nextEdges);
    resetTraversalState();
    setMessage(`Added ${added} random edges (${requestCount} requested).`);
  };

  const removeNode = () => {
    const id = Number(removeNodeId);
    if (!Number.isFinite(id)) {
      setMessage('Provide a valid node ID to remove.');
      return;
    }

    if (!nodeMap[id]) {
      setMessage(`Node ${id} does not exist.`);
      return;
    }

    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    resetTraversalState();
    setRemoveNodeId('');
    setMessage(`Removed node ${id} and its incident edges.`);
  };

  const removeEdge = () => {
    const from = Number(removeEdgeFrom);
    const to = Number(removeEdgeTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      setMessage('Enter distinct endpoint IDs to remove an edge.');
      return;
    }

    const key = toEdgeKey(from, to);
    if (!edgeKeys.has(key)) {
      setMessage(`Edge (${from}, ${to}) does not exist.`);
      return;
    }

    setEdges((prev) =>
      prev.filter((e) => !(toEdgeKey(e.from, e.to) === key))
    );
    resetTraversalState();
    setRemoveEdgeFrom('');
    setRemoveEdgeTo('');
    setMessage(`Removed edge (${from}, ${to}).`);
  };

  const randomizeGraph = () => {
    const g = createRandomGraph({
      n: 10,
      edgeCount: 14,
      width: SVG_WIDTH,
      height: SVG_HEIGHT,
      idStart: 1,
    });
    const randomNodes = g.nodes;
    const randomEdges = edgesToFromTo(g.edges);

    setNodes(randomNodes);
    setEdges(randomEdges);
    setSource(randomNodes[0]?.id ?? '');
    setTarget(randomNodes[randomNodes.length - 1]?.id ?? '');
    resetTraversalState();
    setMessage('Generated a random graph with guarded undirected edges.');
  };

  const downloadCurrentGraph = () => {
    if (nodes.length === 0) {
      setMessage('Nothing to download — add nodes first.');
      return;
    }
    downloadGraphJson(
      buildGraphPayload({
        nodes,
        edges,
        width: SVG_WIDTH,
        height: SVG_HEIGHT,
        page: 'bfs',
        meta: { source, target },
      }),
      'bfs-graph.json',
    );
    setMessage('Downloaded graph JSON.');
  };

  const loadGraphFromFile = (graph, err) => {
    if (err || !graph) {
      setMessage(err?.message || 'Failed to load graph.');
      return;
    }
    setNodes(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
    setEdges(toFromToEdges(graph.edges));
    const ids = graph.nodes.map((n) => n.id);
    setSource(graph.meta?.source ?? ids[0] ?? '');
    setTarget(graph.meta?.target ?? ids[ids.length - 1] ?? '');
    resetTraversalState();
    setMessage(`Loaded graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
  };

  const drawPlanarAsPossible = () => {
    if (nodes.length < 2) {
      setMessage('Need at least 2 nodes to layout.');
      return;
    }
    const { nodes: next, crossingsBefore, crossingsAfter } = layoutPlanarAsPossible(nodes, edges, {
      width: SVG_WIDTH,
      height: SVG_HEIGHT,
    });
    setNodes(next);
    setMessage(
      crossingsAfter < crossingsBefore
        ? `Planar-ish layout: crossings ${crossingsBefore} → ${crossingsAfter}.`
        : crossingsAfter === 0
          ? 'Planar-ish layout: crossing-free drawing.'
          : `Planar-ish layout: ${crossingsAfter} crossing(s) remain.`,
    );
  };

  const startBfs = () => {
    if (nodes.length === 0) {
      setMessage('Add nodes first.');
      return;
    }

    if (source === '' || target === '') {
      setMessage('Select valid source and target nodes.');
      return;
    }

    const { steps: generated, error } = generateSteps(nodes, edges, source, target);
    if (error) {
      setMessage(error);
      return;
    }

    setSteps(generated);
    setStepIndex(0);
    setIsPlaying(true);
    setMessage(generated[0]?.narration || 'BFS initialized.');
  };

  const pause = () => setIsPlaying(false);
  const play = () => {
    if (steps.length === 0 || stepIndex >= steps.length - 1) return;
    setIsPlaying(true);
  };

  const stepBackward = () => {
    setIsPlaying(false);
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const stepForward = () => {
    setIsPlaying(false);
    setStepIndex((prev) => Math.min(prev + 1, Math.max(steps.length - 1, 0)));
  };

  const resetPlayback = () => {
    setIsPlaying(false);
    setStepIndex(0);
    if (steps[0]) setMessage(steps[0].narration);
  };

  // Convert a pointer/touch/mouse event into SVG-space coordinates
  // (accounts for CSS scaling of the SVG vs. its viewBox intrinsic size).
  const getSvgPoint = (event) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return null;
    const source = event.touches && event.touches[0]
      ? event.touches[0]
      : (event.changedTouches && event.changedTouches[0]) || event;
    const scaleX = SVG_WIDTH / svgRect.width;
    const scaleY = SVG_HEIGHT / svgRect.height;
    return {
      x: (source.clientX - svgRect.left) * scaleX,
      y: (source.clientY - svgRect.top) * scaleY,
    };
  };

  const handleNodeMouseDown = (event, nodeId) => {
    event.preventDefault();
    event.stopPropagation();

    const node = nodeMap[nodeId];
    const pt = getSvgPoint(event);
    if (!node || !pt) return;

    setDraggingId(nodeId);
    setDragOffset({ x: pt.x - node.x, y: pt.y - node.y });
  };

  const handleMouseMove = (event) => {
    if (!draggingId) return;
    // Block scroll/zoom while dragging on touch devices.
    if (event.touches) event.preventDefault();

    const pt = getSvgPoint(event);
    if (!pt) return;

    const x = Math.max(NODE_RADIUS, Math.min(SVG_WIDTH - NODE_RADIUS, pt.x - dragOffset.x));
    const y = Math.max(NODE_RADIUS, Math.min(SVG_HEIGHT - NODE_RADIUS, pt.y - dragOffset.y));

    setNodes((prev) => prev.map((n) => (n.id === draggingId ? { ...n, x, y } : n)));
  };

  const handleMouseUp = () => {
    if (!draggingId) return;
    setDraggingId(null);
  };

  const renderOverlayEdge = (edgeKey, stroke, width) => {
    if (!edgeKeys.has(edgeKey)) return null;

    const [a, b] = edgeKey.split('-').map(Number);
    const n1 = nodeMap[a];
    const n2 = nodeMap[b];
    if (!n1 || !n2) return null;

    return (
      <line
        key={`${stroke}-${edgeKey}`}
        x1={n1.x}
        y1={n1.y}
        x2={n2.x}
        y2={n2.y}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
      />
    );
  };

  return (
    <div className="algo-dark min-h-screen">
      <div className="mx-auto w-full max-w-[1520px] px-4 py-6 lg:px-6">
        <header className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-elevation-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Breadth-First Search</h1>
              <p className="mt-1 text-sm text-slate-400">
                Level-order shortest path in an unweighted graph with explicit queue, tree, and path phases.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatChip label="Nodes" value={nodes.length} />
              <StatChip label="Edges" value={edges.length} />
              <StatChip label="Step" value={steps.length ? `${stepIndex + 1}/${steps.length}` : '0/0'} />
              <StatChip label="Path Length" value={pathLength ?? '-'} />
            </div>
          </div>
        </header>

        <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Graph Controls</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Build</p>
                <div className="mt-2 space-y-2">
                  <button className={`${buttonBase} w-full bg-sky-600 text-white hover:bg-sky-500`} onClick={addNode}>
                    Add Single Node
                  </button>
                  <label className="block text-xs text-slate-300">
                    Bulk Add Nodes (1-50)
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={bulkNodeCount}
                        onChange={(e) => setBulkNodeCount(e.target.value)}
                      />
                      <button className={`${buttonBase} shrink-0 bg-cyan-700 text-white hover:bg-cyan-600`} onClick={addBulkNodes}>
                        Add
                      </button>
                    </div>
                  </label>
                  <button className={`${buttonBase} w-full bg-indigo-600 text-white hover:bg-indigo-500`} onClick={loadExample}>
                    Load Example Graph
                  </button>
                  <GraphToolbar
                    className="w-full [&>button]:flex-1 [&>button]:w-full"
                    onNewRandom={randomizeGraph}
                    onPlanarLayout={drawPlanarAsPossible}
                    onDownload={downloadCurrentGraph}
                    onLoad={loadGraphFromFile}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Modify</p>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoConnectNewNodes}
                      onChange={(e) => setAutoConnectNewNodes(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="min-w-0 leading-snug">Auto-connect newly added nodes with random edges</span>
                  </label>
                  <label className="block text-xs text-slate-300">
                    Add Edge (u, v)
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={edgeFrom}
                        onChange={(e) => setEdgeFrom(e.target.value)}
                        placeholder="from"
                      />
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={edgeTo}
                        onChange={(e) => setEdgeTo(e.target.value)}
                        placeholder="to"
                      />
                      <button className={`${buttonBase} shrink-0 bg-emerald-600 text-white hover:bg-emerald-500`} onClick={addEdge}>
                        Add
                      </button>
                    </div>
                  </label>
                  <label className="block text-xs text-slate-300">
                    Add Random Edges
                    <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                      <input
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={randomEdgeCount}
                        onChange={(e) => setRandomEdgeCount(e.target.value)}
                        placeholder="count"
                      />
                      <button className={`${buttonBase} bg-teal-600 text-white hover:bg-teal-500`} onClick={addRandomEdges}>
                        Generate
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Remove / Reset</p>
                <div className="mt-2 space-y-2">
                  <label className="block text-xs text-slate-300">
                    Remove Node
                    <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={removeNodeId}
                        onChange={(e) => setRemoveNodeId(e.target.value)}
                        placeholder="node id"
                      />
                      <button className={`${buttonBase} bg-rose-700 text-white hover:bg-rose-600`} onClick={removeNode}>
                        Remove
                      </button>
                    </div>
                  </label>
                  <label className="block text-xs text-slate-300">
                    Remove Edge (u, v)
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={removeEdgeFrom}
                        onChange={(e) => setRemoveEdgeFrom(e.target.value)}
                        placeholder="from"
                      />
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        value={removeEdgeTo}
                        onChange={(e) => setRemoveEdgeTo(e.target.value)}
                        placeholder="to"
                      />
                      <button className={`${buttonBase} shrink-0 bg-rose-700 text-white hover:bg-rose-600`} onClick={removeEdge}>
                        Remove
                      </button>
                    </div>
                  </label>
                  <button className={`${buttonBase} w-full bg-rose-800 text-white hover:bg-rose-700`} onClick={clearGraph}>
                    Clear Entire Graph
                  </button>
                </div>
              </div>
            </div>
            <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
              Traversal order is deterministic: adjacency lists are sorted by node ID.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Playback Controls</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="col-span-1 text-xs text-slate-300">
                Source
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={source}
                  onChange={(e) => setSource(Number(e.target.value))}
                  disabled={allIds.length === 0}
                >
                  {allIds.map((id) => (
                    <option key={`src-${id}`} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-1 text-xs text-slate-300">
                Target
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  disabled={allIds.length === 0}
                >
                  {allIds.map((id) => (
                    <option key={`tgt-${id}`} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <button className={`${buttonBase} bg-blue-600 text-white hover:bg-blue-500`} onClick={startBfs}>
                Start BFS
              </button>
              <button
                className={`${buttonBase} bg-amber-600 text-white hover:bg-amber-500`}
                onClick={play}
                disabled={steps.length === 0 || stepIndex >= steps.length - 1 || isPlaying}
              >
                Play
              </button>
              <button
                className={`${buttonBase} bg-orange-600 text-white hover:bg-orange-500`}
                onClick={pause}
                disabled={steps.length === 0 || !isPlaying}
              >
                Pause
              </button>
              <button
                className={`${buttonBase} bg-sky-700 text-white hover:bg-sky-600`}
                onClick={stepBackward}
                disabled={steps.length === 0 || stepIndex <= 0}
              >
                Step Backward
              </button>
              <button
                className={`${buttonBase} bg-violet-600 text-white hover:bg-violet-500`}
                onClick={stepForward}
                disabled={steps.length === 0 || stepIndex >= steps.length - 1}
              >
                Step Forward
              </button>
              <button
                className={`${buttonBase} bg-slate-700 text-slate-100 hover:bg-slate-600`}
                onClick={resetPlayback}
                disabled={steps.length === 0}
              >
                Reset
              </button>
            </div>
            <label className="mt-3 block text-xs text-slate-300">
              Speed ({(1000 / speedMs).toFixed(2)}x)
              <input
                type="range"
                min="250"
                max="1600"
                step="50"
                value={speedMs}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-elevation-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Graph View</h2>
              {currentStep && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300">
                  Phase: {currentStep.phase === 'path' ? 'Final Path' : 'Search'}
                </span>
              )}
            </div>
            <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-2">
              <svg
                ref={svgRef}
                width={SVG_WIDTH}
                height={SVG_HEIGHT}
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                className="h-auto w-full touch-none select-none"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                onTouchCancel={handleMouseUp}
              >
                {edges.map((edge) => {
                  const n1 = nodeMap[edge.from];
                  const n2 = nodeMap[edge.to];
                  if (!n1 || !n2) return null;

                  return (
                    <line
                      key={`base-${toEdgeKey(edge.from, edge.to)}`}
                      x1={n1.x}
                      y1={n1.y}
                      x2={n2.x}
                      y2={n2.y}
                      stroke="#334155"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  );
                })}

                {currentStep?.treeEdges?.map((key) => renderOverlayEdge(key, '#22d3ee', 3))}
                {currentStep?.pathEdges?.map((key) => renderOverlayEdge(key, '#fb7185', 5))}

                {nodes.map((node) => {
                  const isSource = Number(source) === node.id;
                  const isTarget = Number(target) === node.id;
                  const inPath = (currentStep?.pathNodes || []).includes(node.id);
                  const isCurrent = currentStep?.current === node.id;
                  const isQueued = (currentStep?.queue || []).includes(node.id);
                  const isVisited = (currentStep?.visited || []).includes(node.id);
                  const isNew = (currentStep?.newlyDiscovered || []).includes(node.id);
                  const distance = currentStep?.distances?.[node.id];
                  const isCurrentLevel =
                    currentStep?.currentLevel !== null &&
                    currentStep?.currentLevel !== undefined &&
                    distance === currentStep.currentLevel;

                  let fill = '#1f2937';
                  let stroke = '#64748b';
                  let strokeWidth = 2;

                  if (isVisited) {
                    fill = '#1d4ed8';
                    stroke = '#60a5fa';
                  }
                  if (isQueued) {
                    fill = '#a16207';
                    stroke = '#fbbf24';
                  }
                  if (isCurrent) {
                    fill = '#0f766e';
                    stroke = '#2dd4bf';
                    strokeWidth = 4;
                  }
                  if (inPath) {
                    fill = '#be123c';
                    stroke = '#fb7185';
                    strokeWidth = 4;
                  }

                  return (
                    <g
                      key={node.id}
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      onTouchStart={(e) => handleNodeMouseDown(e, node.id)}
                      style={{ cursor: 'grab', touchAction: 'none' }}
                    >
                      {isCurrentLevel && !inPath && (
                        <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 9} fill="none" stroke="#0ea5e9" strokeWidth={2} opacity={0.55} />
                      )}
                      {isNew && (
                        <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 5} fill="none" stroke="#22d3ee" strokeWidth={2} opacity={0.8} />
                      )}

                      <circle cx={node.x} cy={node.y} r={NODE_RADIUS} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />

                      <text
                        x={node.x}
                        y={node.y}
                        dy="0.35em"
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="700"
                        fill="#f8fafc"
                      >
                        {node.id}
                      </text>

                      {distance !== undefined && (
                        <g>
                          <rect
                            x={node.x - 16}
                            y={node.y - 44}
                            width="32"
                            height="16"
                            rx="8"
                            fill="#0f172a"
                            stroke="#475569"
                          />
                          <text x={node.x} y={node.y - 32} textAnchor="middle" fontSize="10" fill="#cbd5e1">
                            d={distance}
                          </text>
                        </g>
                      )}

                      {isSource && (
                        <g>
                          <circle cx={node.x - 22} cy={node.y - 22} r="9" fill="#0369a1" />
                          <text x={node.x - 22} y={node.y - 19} textAnchor="middle" fontSize="10" fill="#e0f2fe" fontWeight="700">
                            S
                          </text>
                        </g>
                      )}

                      {isTarget && (
                        <g>
                          <circle cx={node.x + 22} cy={node.y - 22} r="9" fill="#9f1239" />
                          <text x={node.x + 22} y={node.y - 19} textAnchor="middle" fontSize="10" fill="#ffe4e6" fontWeight="700">
                            T
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <aside className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <StepExplanationPanel currentStep={currentStep} message={message} />
            <QueuePanel queue={currentStep?.queue || []} />
            <LevelsPanel currentStep={currentStep} />
            <ParentPanel parent={currentStep?.parent} />
            <LegendPanel />
            <PseudocodePanel activeLine={currentStep?.pseudoLine} />
          </aside>
        </section>
      </div>
    </div>
  );
}
