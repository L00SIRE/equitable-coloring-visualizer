import { adjacency, edgeKey } from '../graph/model';

export const BFS_PSEUDO = [
  'BFS(G, s):',
  '  for each vertex v: dist[v] = ∞, parent[v] = nil',
  '  dist[s] = 0; Q = [s]',
  '  while Q is not empty:',
  '    u = dequeue(Q)',
  '    for each neighbor v of u:',
  '      if dist[v] = ∞:',
  '        dist[v] = dist[u] + 1; parent[v] = u',
  '        enqueue(Q, v)',
  '  return dist, parent',
];

/**
 * Breadth-first search from `source`. With a `target`, stops as soon as the
 * target is discovered and reports the shortest path (fewest edges).
 * Directed graphs follow edge direction.
 */
export function runBFS(graph, source, target = null) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (!ids.has(source)) return { steps: [], error: 'Pick a source vertex that is in the graph.' };
  if (target != null && !ids.has(target)) return { steps: [], error: 'The target vertex is not in the graph.' };

  const adj = adjacency(graph);
  const dist = { [source]: 0 };
  const parent = { [source]: null };
  const treeEdges = [];
  const queue = [source];
  const order = [];
  const steps = [];

  const pathTo = (t) => {
    const p = [];
    for (let c = t; c != null; c = parent[c]) p.unshift(c);
    return p;
  };

  const push = (line, kind, message, extra = {}) => {
    steps.push({
      line, kind, message,
      current: null, examining: null, discovered: null, path: [],
      queue: [...queue], dist: { ...dist }, parent: { ...parent },
      treeEdges: [...treeEdges], order: [...order],
      ...extra,
    });
  };

  push(1, 'init', `Every vertex starts unreached (dist = ∞). Source s = ${source}.`);
  push(2, 'init', `dist[${source}] = 0 and the queue is [${source}].`, { current: source, discovered: source });

  if (source === target) {
    push(9, 'found', `The source is the target: the shortest path has length 0.`, { current: source, path: [source] });
    return { steps, summary: { reached: 1, found: true, path: [source], length: 0, dist, parent }, error: null };
  }

  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    push(4, 'dequeue', `Dequeue ${u} (distance ${dist[u]}).`, { current: u });
    for (const v of adj.get(u)) {
      if (v in dist) {
        push(6, 'skip', `${v} was already reached (dist ${dist[v]}), so the edge ${u}${graph.directed ? '→' : '–'}${v} is not used.`,
          { current: u, examining: { a: u, b: v } });
        continue;
      }
      dist[v] = dist[u] + 1;
      parent[v] = u;
      treeEdges.push(edgeKey(u, v, graph.directed));
      queue.push(v);
      push(7, 'discover', `Discover ${v} from ${u}: dist[${v}] = ${dist[v]}, parent[${v}] = ${u}. Enqueue ${v}.`,
        { current: u, examining: { a: u, b: v }, discovered: v });
      if (v === target) {
        const path = pathTo(v);
        push(9, 'found', `Target ${target} reached. Following parents back gives the shortest path ${path.join(' → ')} (${path.length - 1} edge${path.length === 2 ? '' : 's'}).`,
          { current: v, path });
        return { steps, summary: { reached: Object.keys(dist).length, found: true, path, length: path.length - 1, dist, parent }, error: null };
      }
    }
  }

  const reached = Object.keys(dist).length;
  if (target != null) {
    push(9, 'notfound', `The queue is empty and ${target} was never reached: no path from ${source} to ${target}.`);
    return { steps, summary: { reached, found: false, path: [], length: null, dist, parent }, error: null };
  }
  const ecc = Math.max(...Object.values(dist));
  push(9, 'done', `The queue is empty. ${reached} of ${graph.nodes.length} vertices are reachable from ${source}; the farthest is ${ecc} edge${ecc === 1 ? '' : 's'} away.`);
  return { steps, summary: { reached, found: null, path: [], length: null, eccentricity: ecc, dist, parent }, error: null };
}
