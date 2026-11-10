/*
 * Vertex-colouring toolkit: an exact DSATUR backtracking solver (used by the
 * greedy page for χ(G) and by the four-colour page), greedy colouring under
 * several vertex orderings, and the bounds shown next to the result.
 * Colours are integers 0, 1, 2, … and edge direction is ignored.
 */

export function undirectedAdjacency(graph) {
  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const { a, b } of graph.edges) {
    if (a !== b && adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); }
  }
  return new Map([...adj].map(([v, s]) => [v, [...s].sort((x, y) => x - y)]));
}

/* ── exact search ── */

/**
 * Is G k-colourable? DSATUR branching (most saturated vertex first), colours
 * introduced in order so symmetric branches are skipped. `onEvent` receives
 * select / assign / backtrack / deadend events for visualisation.
 * Returns { coloring: Map | null, exhausted, nodes }. `exhausted` means the
 * node budget ran out, so a null colouring then proves nothing.
 */
export function colorWithAtMost(adj, k, { budget = 200000, onEvent } = {}) {
  const ids = [...adj.keys()].sort((a, b) => a - b);
  const color = new Map(ids.map((v) => [v, -1]));
  let nodes = 0;
  let exhausted = false;

  const usedAround = (v) => new Set(adj.get(v).map((u) => color.get(u)).filter((c) => c >= 0));
  const pick = () => {
    let best = null, bestSat = -1, bestDeg = -1;
    for (const v of ids) {
      if (color.get(v) >= 0) continue;
      const sat = usedAround(v).size;
      const deg = adj.get(v).filter((u) => color.get(u) < 0).length;
      if (sat > bestSat || (sat === bestSat && deg > bestDeg)) { best = v; bestSat = sat; bestDeg = deg; }
    }
    return { v: best, sat: bestSat, deg: bestDeg };
  };

  const rec = (done, maxUsed) => {
    if (done === ids.length) return true;
    if (++nodes > budget) { exhausted = true; return false; }
    const { v, sat, deg } = pick();
    const used = usedAround(v);
    onEvent?.({ type: 'select', v, sat, deg, used: [...used].sort((a, b) => a - b), color });
    for (let c = 0; c <= Math.min(k - 1, maxUsed + 1); c++) {
      if (used.has(c)) continue;
      color.set(v, c);
      onEvent?.({ type: 'assign', v, c, color });
      if (rec(done + 1, Math.max(maxUsed, c))) return true;
      color.set(v, -1);
      if (exhausted) return false;
      onEvent?.({ type: 'backtrack', v, c, color });
    }
    onEvent?.({ type: 'deadend', v, used: [...used].sort((a, b) => a - b), color });
    return false;
  };

  const ok = rec(0, -1);
  return { coloring: ok ? new Map(color) : null, exhausted, nodes };
}

/** Exact χ(G) between `lo` and `hi`, or null if the budget runs out first. */
export function chromaticNumber(adj, lo, hi, budget = 60000) {
  if (adj.size === 0) return 0;
  for (let k = Math.max(1, lo); k < hi; k++) {
    const r = colorWithAtMost(adj, k, { budget });
    if (r.coloring) return k;
    if (r.exhausted) return null;
  }
  return hi;
}

/** Size of a largest clique (Bron–Kerbosch with pivoting); a lower bound for χ. */
export function cliqueNumber(adj) {
  const sets = new Map([...adj].map(([v, l]) => [v, new Set(l)]));
  let best = adj.size ? 1 : 0;
  const bk = (r, p, x) => {
    if (p.size === 0 && x.size === 0) { best = Math.max(best, r); return; }
    if (r + p.size <= best) return;
    const pivot = [...p, ...x].reduce((a, b) => (sets.get(a).size >= sets.get(b).size ? a : b));
    for (const v of [...p].filter((u) => !sets.get(pivot).has(u))) {
      const nv = sets.get(v);
      bk(r + 1, new Set([...p].filter((u) => nv.has(u))), new Set([...x].filter((u) => nv.has(u))));
      p.delete(v);
      x.add(v);
    }
  };
  if (adj.size <= 60) bk(0, new Set(adj.keys()), new Set());
  return best;
}

/** Smallest-last order and the degeneracy of G (every subgraph has a vertex of degree ≤ it). */
export function degeneracyOrder(adj) {
  const rem = new Map([...adj].map(([v, l]) => [v, new Set(l)]));
  const removed = [];
  let degeneracy = 0;
  while (rem.size) {
    let pick = null;
    for (const [v, s] of rem) if (pick === null || s.size < rem.get(pick).size || (s.size === rem.get(pick).size && v < pick)) pick = v;
    degeneracy = Math.max(degeneracy, rem.get(pick).size);
    for (const u of rem.get(pick)) rem.get(u).delete(pick);
    rem.delete(pick);
    removed.push(pick);
  }
  return { order: removed.reverse(), degeneracy };
}

/* ── greedy colouring ── */

export const GREEDY_PSEUDO = [
  'GreedyColor(G, order):',
  '  color[v] = none for every vertex',
  '  for v in order:',
  '    used = { color[u] : u a neighbor of v, u colored }',
  '    color[v] = smallest c ≥ 0 not in used',
  '  return color',
];

export const ORDERINGS = [
  { id: 'id', label: 'By vertex number' },
  { id: 'largest-first', label: 'Largest degree first' },
  { id: 'smallest-last', label: 'Smallest-last (degeneracy)' },
  { id: 'dsatur', label: 'DSATUR (most saturated first)' },
  { id: 'random', label: 'Random' },
];

const isConnected = (adj) => {
  const ids = [...adj.keys()];
  if (!ids.length) return true;
  const seen = new Set([ids[0]]);
  const st = [ids[0]];
  while (st.length) for (const u of adj.get(st.pop())) if (!seen.has(u)) { seen.add(u); st.push(u); }
  return seen.size === ids.length;
};

function brooksCase(adj) {
  const ids = [...adj.keys()];
  const n = ids.length;
  if (n < 2 || !isConnected(adj)) return null;
  const complete = ids.every((v) => adj.get(v).length === n - 1);
  const oddCycle = n % 2 === 1 && n >= 3 && ids.every((v) => adj.get(v).length === 2);
  return complete ? 'complete' : oddCycle ? 'odd cycle' : 'neither';
}

export function runGreedy(graph, strategy = 'id', rng = Math.random) {
  const adj = undirectedAdjacency(graph);
  const ids = [...adj.keys()].sort((a, b) => a - b);
  if (!ids.length) return { steps: [], error: 'Add some vertices first.' };

  const deg = (v) => adj.get(v).length;
  let staticOrder = null;
  if (strategy === 'id') staticOrder = ids;
  else if (strategy === 'largest-first') staticOrder = [...ids].sort((a, b) => deg(b) - deg(a) || a - b);
  else if (strategy === 'smallest-last') staticOrder = degeneracyOrder(adj).order;
  else if (strategy === 'random') {
    staticOrder = [...ids];
    for (let i = staticOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [staticOrder[i], staticOrder[j]] = [staticOrder[j], staticOrder[i]];
    }
  }

  const color = {};
  const remaining = new Set(ids);
  const order = [];
  const steps = [];
  const push = (line, kind, message, extra = {}) => {
    steps.push({ line, kind, message, current: null, used: [], assigned: null, color: { ...color }, order: [...order], ...extra });
  };
  const usedAround = (v) => [...new Set(adj.get(v).map((u) => color[u]).filter((c) => c !== undefined))].sort((a, b) => a - b);

  const label = ORDERINGS.find((o) => o.id === strategy)?.label ?? strategy;
  push(1, 'init', `No vertex is colored. Order: ${label.toLowerCase()}${staticOrder ? ` (${staticOrder.join(', ')})` : ', chosen one vertex at a time'}.`);

  while (remaining.size) {
    let v;
    if (staticOrder) v = staticOrder[order.length];
    else {
      let best = null, bs = -1, bd = -1;
      for (const w of [...remaining].sort((a, b) => a - b)) {
        const sat = usedAround(w).length;
        if (sat > bs || (sat === bs && deg(w) > bd)) { best = w; bs = sat; bd = deg(w); }
      }
      v = best;
      push(2, 'pick', `DSATUR picks ${v}: it sees ${bs} different color${bs === 1 ? '' : 's'} among its neighbors (ties go to the larger degree, ${bd}).`, { current: v });
    }
    order.push(v);
    remaining.delete(v);
    if (staticOrder) push(2, 'pick', `Next vertex in the order: ${v} (degree ${deg(v)}).`, { current: v });
    const used = usedAround(v);
    push(3, 'used', `Colors on the neighbors of ${v}: {${used.join(', ') || '∅'}}.`, { current: v, used });
    let c = 0;
    while (used.includes(c)) c++;
    color[v] = c;
    push(4, 'assign', `The smallest color not in that set is ${c}. Color ${v} with ${c}.`, { current: v, used, assigned: c });
  }

  const k = Math.max(...Object.values(color)) + 1;
  const delta = Math.max(0, ...ids.map(deg));
  const { degeneracy } = degeneracyOrder(adj);
  const omega = cliqueNumber(adj);
  const brooks = brooksCase(adj);
  const chi = ids.length <= 40 ? chromaticNumber(adj, omega, k) : null;
  const upper = brooks === 'neither' && delta >= 3 ? delta : delta + 1;
  const verdict = chi != null
    ? (k === chi ? `This is optimal: χ(G) = ${chi}.` : `The optimum is χ(G) = ${chi}, so this order wasted ${k - chi} color${k - chi === 1 ? '' : 's'}.`)
    : `χ(G) is between ${omega} and ${k}.`;
  push(5, 'done', `Done with ${k} color${k === 1 ? '' : 's'}. ${verdict}`);
  return { steps, summary: { colors: k, delta, degeneracy, omega, chi, brooks, upper, order, coloring: color }, error: null };
}
