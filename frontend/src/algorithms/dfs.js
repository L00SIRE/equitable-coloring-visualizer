import { adjacency, edgeKey } from '../graph/model';

export const DFS_PSEUDO = [
  'DFS(G, s):',
  '  for each vertex v: color[v] = WHITE',
  '  time = 0',
  '  for v in (s, then the other vertices): if color[v] = WHITE: visit(v)',
  'visit(u):',
  '  color[u] = GRAY; d[u] = ++time',
  '  for each edge (u, v):',
  '    classify (u, v) as tree / back / forward / cross',
  '    if color[v] = WHITE: parent[v] = u; visit(v)',
  '  color[u] = BLACK; f[u] = ++time',
  '  return',
];

/**
 * Depth-first search with discovery/finish times and edge classification.
 * Restarts from unvisited vertices, so the result is a DFS forest.
 * Undirected edges are only ever tree or back edges; directed graphs also get
 * forward and cross edges, cycle detection and a topological order.
 */
export function runDFS(graph, source) {
  const ids = graph.nodes.map((n) => n.id).sort((a, b) => a - b);
  if (!ids.includes(source)) return { steps: [], error: 'Pick a start vertex that is in the graph.' };

  const adj = adjacency(graph);
  const directed = graph.directed;
  const color = Object.fromEntries(ids.map((v) => [v, 'white']));
  const d = {};
  const f = {};
  const parent = {};
  const edgeClass = {};
  const roots = [];
  const counts = { tree: 0, back: 0, forward: 0, cross: 0 };
  const finishOrder = [];
  const callStack = [];
  let time = 0;
  const steps = [];

  const push = (line, kind, message, extra = {}) => {
    steps.push({
      line, kind, message,
      current: null, examining: null,
      stack: [...callStack], color: { ...color }, d: { ...d }, f: { ...f },
      edgeClass: { ...edgeClass }, time,
      ...extra,
    });
  };

  push(1, 'init', 'Every vertex starts WHITE (undiscovered).');
  push(2, 'init', 'time = 0.');

  const visitOrder = [source, ...ids.filter((v) => v !== source)];
  for (const root of visitOrder) {
    if (color[root] !== 'white') continue;
    roots.push(root);
    parent[root] = null;
    push(3, 'root', roots.length === 1
      ? `Start the search at ${root}.`
      : `${root} is still WHITE after the last tree finished, so it starts a new DFS tree.`, { current: root });

    const frames = [{ u: root, i: 0 }];
    callStack.push(root);
    color[root] = 'gray';
    d[root] = ++time;
    push(5, 'discover', `Discover ${root}: color GRAY, d[${root}] = ${time}.`, { current: root });

    while (frames.length) {
      const fr = frames[frames.length - 1];
      const nbrs = adj.get(fr.u);
      if (fr.i < nbrs.length) {
        const v = nbrs[fr.i++];
        const u = fr.u;
        if (!directed && v === parent[u]) continue; // the tree edge we came down
        const key = edgeKey(u, v, directed);
        if (!directed && key in edgeClass) continue; // classified from the other end
        let cls;
        if (color[v] === 'white') cls = 'tree';
        else if (color[v] === 'gray') cls = 'back';
        else cls = directed ? (d[u] < d[v] ? 'forward' : 'cross') : 'back';
        edgeClass[key] = cls;
        counts[cls]++;
        const why = {
          tree: `${v} is WHITE`,
          back: `${v} is GRAY, an ancestor still on the stack, so this closes a cycle`,
          forward: `${v} is BLACK and was discovered after ${u}, so it is a descendant`,
          cross: `${v} is BLACK and was discovered before ${u}`,
        }[cls];
        push(7, 'edge', `Edge ${u}${directed ? '→' : '–'}${v} is a ${cls.toUpperCase()} edge: ${why}.`,
          { current: u, examining: { a: u, b: v }, classified: cls });
        if (cls === 'tree') {
          parent[v] = u;
          color[v] = 'gray';
          d[v] = ++time;
          callStack.push(v);
          frames.push({ u: v, i: 0 });
          push(8, 'discover', `Recurse into ${v}: color GRAY, d[${v}] = ${time}, parent[${v}] = ${u}.`, { current: v });
        }
      } else {
        const u = fr.u;
        color[u] = 'black';
        f[u] = ++time;
        finishOrder.push(u);
        push(9, 'finish', `${u} has no more edges to explore: color BLACK, f[${u}] = ${time}.`, { current: u });
        frames.pop();
        callStack.pop();
        if (frames.length) {
          push(10, 'return', `Return to ${frames[frames.length - 1].u}.`, { current: frames[frames.length - 1].u });
        }
      }
    }
  }

  const hasCycle = counts.back > 0;
  const topoOrder = directed && !hasCycle ? [...finishOrder].reverse() : null;
  const bits = [`${roots.length} DFS tree${roots.length === 1 ? '' : 's'}`, `${counts.tree} tree`, `${counts.back} back`];
  if (directed) bits.push(`${counts.forward} forward`, `${counts.cross} cross`);
  const verdict = directed
    ? (hasCycle ? 'A back edge exists, so the digraph has a directed cycle.' : `No back edge: the digraph is acyclic and the reverse finishing order ${topoOrder.join(', ')} is a topological order.`)
    : (hasCycle ? 'A back edge exists, so the graph contains a cycle.' : 'No back edge: the graph is a forest.');
  push(0, 'done', `Done: ${bits.join(', ')} edges. ${verdict}`);
  return { steps, summary: { roots, counts, hasCycle, topoOrder, d, f, parent, edgeClass }, error: null };
}
