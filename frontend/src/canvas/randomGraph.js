/**
 * Shared undirected random-graph generator with optional max-degree cap.
 * Returns canonical edges as { a, b } with a < b.
 */
export function createRandomGraph({
  n = 10,
  edgeCount,
  maxDegree = Infinity,
  width = 820,
  height = 520,
  idStart = 0,
  padding = 70,
} = {}) {
  const count = Math.max(2, Math.min(40, Math.floor(n)));
  const nodes = [];
  for (let i = 0; i < count; i += 1) {
    nodes.push({
      id: idStart + i,
      x: Math.round(padding + Math.random() * (width - 2 * padding)),
      y: Math.round(padding + Math.random() * (height - 2 * padding)),
    });
  }

  const deg = new Map(nodes.map((node) => [node.id, 0]));
  const keys = new Set();
  const edges = [];

  const maxPossible = (count * (count - 1)) / 2;
  const cappedByDegree =
    Number.isFinite(maxDegree) && maxDegree > 0
      ? Math.floor((count * maxDegree) / 2)
      : maxPossible;
  const budget = Math.max(
    0,
    Math.min(
      maxPossible,
      cappedByDegree,
      edgeCount != null ? Math.floor(edgeCount) : Math.round(count * 1.4),
    ),
  );

  let guard = 0;
  while (edges.length < budget && guard < budget * 40) {
    guard += 1;
    const u = nodes[Math.floor(Math.random() * nodes.length)].id;
    const v = nodes[Math.floor(Math.random() * nodes.length)].id;
    if (u === v) continue;
    if ((deg.get(u) || 0) >= maxDegree || (deg.get(v) || 0) >= maxDegree) continue;
    const a = Math.min(u, v);
    const b = Math.max(u, v);
    const key = `${a}-${b}`;
    if (keys.has(key)) continue;
    keys.add(key);
    deg.set(u, (deg.get(u) || 0) + 1);
    deg.set(v, (deg.get(v) || 0) + 1);
    edges.push({ a, b });
  }

  return { nodes, edges };
}

/** Convert canonical {a,b} edges to {from,to}. */
export function edgesToFromTo(edges) {
  return edges.map(({ a, b }, i) => ({ id: i + 1, from: a, to: b }));
}
