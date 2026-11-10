export const HALL_PSEUDO = [
  'MaxMatching(A, B):',
  '  match = {}              // b ↦ a',
  '  for each a in A:',
  '    visited = {}',
  '    if augment(a): |M| += 1',
  '  return M',
  'augment(a):',
  '  for each neighbor b of a, not yet visited:',
  '    visited.add(b)',
  '    if b is free, or augment(match[b]):',
  '      match[b] = a;  return true',
  '  return false',
];

/**
 * Maximum bipartite matching by augmenting paths (Kuhn's algorithm) between
 * the vertices of kind 'A' and kind 'B'. If some vertex of A stays unmatched,
 * the alternating-reachability set S from it is a Hall violator: |N(S)| < |S|.
 */
export function runMatching(graph) {
  const A = graph.nodes.filter((n) => n.kind === 'A').map((n) => n.id).sort((x, y) => x - y);
  const B = graph.nodes.filter((n) => n.kind === 'B').map((n) => n.id).sort((x, y) => x - y);
  if (!A.length || !B.length) return { steps: [], error: 'Both sides need at least one vertex (kinds A and B).' };
  const isA = new Set(A), isB = new Set(B);
  const names = new Map(graph.nodes.map((n) => [n.id, n.label ?? String(n.id)]));
  const nm = (id) => names.get(id);

  const nbrs = new Map(A.map((a) => [a, []]));
  for (const { a, b } of graph.edges) {
    const [x, y] = isA.has(a) && isB.has(b) ? [a, b] : isA.has(b) && isB.has(a) ? [b, a] : [null, null];
    if (x !== null && !nbrs.get(x).includes(y)) nbrs.get(x).push(y);
  }
  for (const l of nbrs.values()) l.sort((p, q) => p - q);

  const matchB = new Map(); // b → a
  const steps = [];
  const pairs = () => [...matchB].map(([b, a]) => ({ a, b })).sort((p, q) => p.a - q.a);
  const push = (line, kind, message, extra = {}) => {
    steps.push({ line, kind, message, root: null, path: [], visited: [], examining: null, matching: pairs(), violator: null, ...extra });
  };

  push(1, 'init', `Start with the empty matching. ${A.length} vertices on side A, ${B.length} on side B.`);

  for (const a of A) {
    push(2, 'start', `Try to match ${nm(a)}: look for an augmenting path that starts at ${nm(a)}.`, { root: a, path: [a] });
    const visited = new Set();
    const path = [a];

    const augment = (u) => {
      for (const b of nbrs.get(u)) {
        if (visited.has(b)) {
          push(7, 'skip', `${nm(b)} was already visited in this search, so skip the edge ${nm(u)} – ${nm(b)}.`, { root: a, path: [...path], visited: [...visited], examining: { a: u, b } });
          continue;
        }
        visited.add(b);
        path.push(b);
        push(8, 'try', `Try the edge ${nm(u)} – ${nm(b)}.`, { root: a, path: [...path], visited: [...visited], examining: { a: u, b } });
        const other = matchB.get(b);
        if (other === undefined) {
          matchB.set(b, u);
          push(10, 'augment', `${nm(b)} is free: match ${nm(u)} with ${nm(b)}.`, { root: a, path: [...path], visited: [...visited], examining: { a: u, b } });
          path.pop();
          return true;
        }
        path.push(other);
        push(9, 'recurse', `${nm(b)} is already matched to ${nm(other)}. Can ${nm(other)} move to another vertex?`, { root: a, path: [...path], visited: [...visited], examining: { a: u, b } });
        if (augment(other)) {
          matchB.set(b, u);
          push(10, 'augment', `${nm(other)} found a new partner, so ${nm(b)} is released: match ${nm(u)} with ${nm(b)}.`, { root: a, path: [...path], visited: [...visited], examining: { a: u, b } });
          path.pop(); path.pop();
          return true;
        }
        path.pop(); path.pop();
      }
      push(11, 'fail', `Every neighbor of ${nm(u)} has been tried: no augmenting path through ${nm(u)}.`, { root: a, path: [...path], visited: [...visited] });
      return false;
    };

    const ok = augment(a);
    push(4, ok ? 'matched' : 'unmatched',
      ok ? `Augmenting path found: ${nm(a)} is matched. |M| = ${matchB.size}.` : `No augmenting path from ${nm(a)}: it stays unmatched for now.`,
      { root: a, visited: [...visited] });
  }

  const matchA = new Map([...matchB].map(([b, a]) => [a, b]));
  const free = A.filter((a) => !matchA.has(a));
  if (!free.length) {
    push(5, 'done', `Every vertex of A is matched: |M| = ${matchB.size} = |A|. Hall's condition holds, so A can be matched into B.`);
    return { steps, summary: { perfect: true, size: matchB.size, matching: pairs(), violator: null }, error: null };
  }

  const S = new Set(free);
  const T = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const a of [...S]) for (const b of nbrs.get(a)) if (!T.has(b)) { T.add(b); grew = true; }
    for (const b of [...T]) { const a = matchB.get(b); if (a !== undefined && !S.has(a)) { S.add(a); grew = true; } }
  }
  const violator = { S: [...S].sort((x, y) => x - y), N: [...T].sort((x, y) => x - y) };
  push(5, 'done',
    `The matching is maximum, |M| = ${matchB.size} < |A| = ${A.length}. Alternating paths from the unmatched vertices reach S = {${violator.S.map(nm).join(', ')}}, whose neighbors are only N(S) = {${violator.N.map(nm).join(', ')}}: |S| = ${violator.S.length} > |N(S)| = ${violator.N.length}. Hall's condition fails.`,
    { violator });
  return { steps, summary: { perfect: false, size: matchB.size, matching: pairs(), violator, deficiency: A.length - matchB.size }, error: null };
}
