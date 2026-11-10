export const BIPARTITE_PSEUDO = [
  'IsBipartite(G):',
  '  color = {}',
  '  for each vertex s with no color:',
  '    color[s] = 0; Q = [s]',
  '    while Q is not empty:',
  '      u = dequeue(Q)',
  '      for each neighbor v of u:',
  '        if v has no color: color[v] = 1 − color[u]; enqueue(Q, v)',
  '        else if color[v] = color[u]: return ODD CYCLE through (u, v)',
  '  return BIPARTITE (the two color classes)',
];

/**
 * BFS two-colouring. Edge directions are ignored. On a conflict the BFS tree
 * gives an actual odd cycle: climb from both ends of the bad edge to their
 * lowest common ancestor.
 */
export function runBipartite(graph, source = null) {
  const ids = graph.nodes.map((n) => n.id).sort((a, b) => a - b);
  if (ids.length === 0) return { steps: [], error: 'Add some vertices first.' };
  if (source != null && !ids.includes(source)) return { steps: [], error: 'The start vertex is not in the graph.' };

  const adj = new Map(ids.map((v) => [v, []]));
  for (const { a, b } of graph.edges) {
    if (adj.has(a) && adj.has(b)) { adj.get(a).push(b); adj.get(b).push(a); }
  }
  for (const l of adj.values()) l.sort((x, y) => x - y);

  const color = {};
  const parent = {};
  const depth = {};
  const queue = [];
  const steps = [];
  const push = (line, kind, message, extra = {}) => {
    steps.push({
      line, kind, message, current: null, examining: null, conflict: null, cycle: [],
      color: { ...color }, queue: [...queue], ...extra,
    });
  };

  push(1, 'init', 'No vertex has a color yet. We 2-color each component with a BFS: neighbors always get the opposite color.');
  const order = source != null ? [source, ...ids.filter((v) => v !== source)] : ids;
  let components = 0;
  for (const s of order) {
    if (s in color) continue;
    components++;
    color[s] = 0; parent[s] = null; depth[s] = 0;
    queue.push(s);
    push(3, 'root', `${s} is uncolored: give it color 0 and start a BFS${components > 1 ? ' in the next component' : ''}.`, { current: s });
    while (queue.length) {
      const u = queue.shift();
      push(5, 'dequeue', `Dequeue ${u} (color ${color[u]}).`, { current: u });
      for (const v of adj.get(u)) {
        if (!(v in color)) {
          color[v] = 1 - color[u]; parent[v] = u; depth[v] = depth[u] + 1;
          queue.push(v);
          push(7, 'color', `${v} is uncolored: give it color ${color[v]}, the opposite of ${u}. Enqueue ${v}.`,
            { current: u, examining: { a: u, b: v } });
        } else if (color[v] === color[u]) {
          // odd cycle: u … lca … v plus the edge (v, u)
          const up = [u], vp = [v];
          let x = u, y = v;
          while (depth[x] > depth[y]) { x = parent[x]; up.push(x); }
          while (depth[y] > depth[x]) { y = parent[y]; vp.push(y); }
          while (x !== y) { x = parent[x]; y = parent[y]; up.push(x); vp.push(y); }
          vp.pop();
          const cycle = [...up, ...vp.reverse()];
          push(8, 'conflict',
            `${u} and ${v} are adjacent but both have color ${color[u]}. Joining their BFS-tree paths through ${up[up.length - 1]} gives the odd cycle ${cycle.join(' – ')} – ${cycle[0]} of length ${cycle.length}, so G is not bipartite.`,
            { current: u, examining: { a: u, b: v }, conflict: { a: u, b: v }, cycle });
          return { steps, summary: { bipartite: false, cycle, conflict: { a: u, b: v }, color }, error: null };
        } else {
          push(7, 'ok', `${v} already has color ${color[v]}, different from ${u}'s ${color[u]}: this edge is fine.`,
            { current: u, examining: { a: u, b: v } });
        }
      }
    }
  }

  const parts = [0, 1].map((c) => ids.filter((v) => color[v] === c));
  push(9, 'done', `Every edge joins different colors, so G is bipartite with parts {${parts[0].join(', ')}} and {${parts[1].join(', ')}}.`);
  return { steps, summary: { bipartite: true, parts, color, components }, error: null };
}
