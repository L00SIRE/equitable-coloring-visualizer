/*
 * Graph model shared by every page.
 *
 *   graph = { nodes: [{ id, x, y, kind?, label? }], edges: [{ a, b }], directed: boolean }
 *
 * Vertex ids are integers. Edges are stored as drawn; for an undirected graph
 * {a:1,b:2} and {a:2,b:1} are the same edge (see edgeKey).
 */

export const edgeKey = (a, b, directed = false) =>
  directed || a < b ? `${a}${directed ? '>' : '-'}${b}` : `${b}-${a}`;

export const keyOf = (e, directed = false) => edgeKey(e.a, e.b, directed);

export const emptyGraph = (directed = false) => ({ nodes: [], edges: [], directed });

export const nextNodeId = (nodes) => nodes.reduce((m, n) => Math.max(m, n.id + 1), 0);

export function hasEdge(graph, a, b) {
  const k = edgeKey(a, b, graph.directed);
  return graph.edges.some((e) => keyOf(e, graph.directed) === k);
}

/** Drop self-loops, duplicates and edges with unknown endpoints. */
export function cleanEdges(nodes, edges, directed = false) {
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    if (e.a === e.b || !ids.has(e.a) || !ids.has(e.b)) continue;
    const k = edgeKey(e.a, e.b, directed);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ a: e.a, b: e.b });
  }
  return out;
}

/** id → sorted neighbour ids (out-neighbours when directed). */
export function adjacency(graph) {
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const { a, b } of graph.edges) {
    if (!adj.has(a) || !adj.has(b)) continue;
    adj.get(a).push(b);
    if (!graph.directed) adj.get(b).push(a);
  }
  for (const list of adj.values()) list.sort((x, y) => x - y);
  return adj;
}

export function degrees(graph) {
  const deg = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const { a, b } of graph.edges) {
    if (deg.has(a)) deg.set(a, deg.get(a) + 1);
    if (deg.has(b)) deg.set(b, deg.get(b) + 1);
  }
  return deg;
}

export function maxDegree(graph) {
  let m = 0;
  for (const d of degrees(graph).values()) m = Math.max(m, d);
  return m;
}

/** Connected components (weak components when directed), each a sorted id list. */
export function components(graph) {
  const und = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const { a, b } of graph.edges) {
    if (und.has(a) && und.has(b)) { und.get(a).push(b); und.get(b).push(a); }
  }
  const seen = new Set();
  const out = [];
  for (const n of [...graph.nodes].sort((p, q) => p.id - q.id)) {
    if (seen.has(n.id)) continue;
    const comp = [];
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const u = stack.pop();
      comp.push(u);
      for (const v of und.get(u)) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
    out.push(comp.sort((x, y) => x - y));
  }
  return out;
}

/**
 * Structure signature: changes when vertices, edges, kinds or direction change,
 * but not when a vertex is merely dragged. Pages use it to invalidate a run.
 */
export function structureSignature(graph) {
  const ns = graph.nodes.map((n) => `${n.id}${n.kind ?? ''}`).join(',');
  const es = graph.edges.map((e) => `${e.a}${graph.directed ? '>' : '-'}${e.b}`).join(',');
  return `${graph.directed ? 'D' : 'U'}|${ns}|${es}`;
}

export function removeNodes(graph, ids) {
  const gone = new Set(ids);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !gone.has(n.id)),
    edges: graph.edges.filter((e) => !gone.has(e.a) && !gone.has(e.b)),
  };
}

export function removeEdges(graph, keys) {
  const gone = new Set(keys);
  return { ...graph, edges: graph.edges.filter((e) => !gone.has(keyOf(e, graph.directed))) };
}

/** Sorted unique pair list, handy for tests and exports. */
export const edgePairs = (graph) =>
  graph.edges
    .map((e) => (graph.directed || e.a < e.b ? [e.a, e.b] : [e.b, e.a]))
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

export const fromPairs = (n, pairs, directed = false) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: i, x: 0, y: 0 })),
  edges: pairs.map(([a, b]) => ({ a, b })),
  directed,
});
