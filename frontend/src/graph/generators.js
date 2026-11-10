import { circular, bipartiteColumns } from './layout';
import { edgeKey } from './model';

const mk = (n, pos, edges, extra = {}) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: i, x: pos.get(i).x, y: pos.get(i).y, ...(extra.kinds ? { kind: extra.kinds[i] } : {}) })),
  edges: edges.map(([a, b]) => ({ a, b })),
  directed: !!extra.directed,
});

const ids = (n) => Array.from({ length: n }, (_, i) => i);

export const path = (n) => mk(n, new Map(ids(n).map((i) => [i, { x: (i - (n - 1) / 2) * 90, y: 0 }])), ids(n - 1).map((i) => [i, i + 1]));

export const cycle = (n) => mk(n, circular(ids(n)), ids(n).map((i) => [i, (i + 1) % n]));

export const complete = (n) => {
  const e = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e.push([i, j]);
  return mk(n, circular(ids(n), Math.max(120, n * 20)), e);
};

export const star = (leaves) => {
  const pos = circular(ids(leaves), 200);
  const all = new Map([[0, { x: 0, y: 0 }]]);
  ids(leaves).forEach((i) => all.set(i + 1, pos.get(i)));
  return mk(leaves + 1, all, ids(leaves).map((i) => [0, i + 1]));
};

export const wheel = (rim) => {
  const pos = circular(ids(rim), 200);
  const all = new Map([[0, { x: 0, y: 0 }]]);
  ids(rim).forEach((i) => all.set(i + 1, pos.get(i)));
  const e = ids(rim).map((i) => [0, i + 1]);
  ids(rim).forEach((i) => e.push([i + 1, ((i + 1) % rim) + 1]));
  return mk(rim + 1, all, e);
};

export const grid = (rows, cols) => {
  const pos = new Map();
  const e = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      pos.set(id, { x: (c - (cols - 1) / 2) * 90, y: (r - (rows - 1) / 2) * 90 });
      if (c + 1 < cols) e.push([id, id + 1]);
      if (r + 1 < rows) e.push([id, id + cols]);
    }
  }
  return mk(rows * cols, pos, e);
};

/** K_{m,n} with kind 'A' (size m) on the left and 'B' on the right. */
export const completeBipartite = (m, n) => {
  const kinds = [...Array(m).fill('A'), ...Array(n).fill('B')];
  const nodes = kinds.map((kind, id) => ({ id, kind, x: 0, y: 0 }));
  const pos = bipartiteColumns(nodes);
  const e = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) e.push([i, m + j]);
  return mk(m + n, pos, e, { kinds });
};

export const petersen = () => {
  const outer = circular(ids(5), 220);
  const inner = circular(ids(5), 100);
  const pos = new Map();
  ids(5).forEach((i) => { pos.set(i, outer.get(i)); pos.set(i + 5, inner.get(i)); });
  const e = [];
  ids(5).forEach((i) => { e.push([i, (i + 1) % 5], [i, i + 5], [i + 5, ((i + 2) % 5) + 5]); });
  return mk(10, pos, e);
};

/* ── random families (rng is injectable so tests are reproducible) ── */

export function gnp(n, p, rng = Math.random) {
  const e = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rng() < p) e.push([i, j]);
  return mk(n, circular(ids(n), Math.max(120, n * 22)), e);
}

/** Random graph with at most `maxDeg` edges at any vertex (the Δ ≤ r of the H-S theorem). */
export function randomBounded(n, maxDeg, edgeCount, rng = Math.random) {
  const deg = Array(n).fill(0);
  const seen = new Set();
  const e = [];
  const cap = Math.min(edgeCount, Math.floor((n * maxDeg) / 2), (n * (n - 1)) / 2);
  for (let guard = 0; e.length < cap && guard < cap * 60 + 200; guard++) {
    const a = Math.floor(rng() * n), b = Math.floor(rng() * n);
    if (a === b || deg[a] >= maxDeg || deg[b] >= maxDeg) continue;
    const k = edgeKey(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    deg[a]++; deg[b]++;
    e.push([Math.min(a, b), Math.max(a, b)]);
  }
  return mk(n, circular(ids(n), Math.max(120, n * 22)), e);
}

export function randomTree(n, rng = Math.random) {
  const e = [];
  for (let i = 1; i < n; i++) e.push([Math.floor(rng() * i), i]);
  return mk(n, circular(ids(n), Math.max(120, n * 22)), e);
}

/** Random bipartite graph with parts 'A' (m) and 'B' (n); each pair is an edge with probability p. */
export function randomBipartite(m, n, p, rng = Math.random) {
  const kinds = [...Array(m).fill('A'), ...Array(n).fill('B')];
  const nodes = kinds.map((kind, id) => ({ id, kind, x: 0, y: 0 }));
  const e = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (rng() < p) e.push([i, m + j]);
  return mk(m + n, bipartiteColumns(nodes), e, { kinds });
}

export const asDirected = (g) => ({ ...g, directed: true });

/**
 * Crown graph S_n: a_i – b_j for i ≠ j. It is bipartite (χ = 2), but greedy
 * colouring in the order a_0, b_0, a_1, b_1, … uses n colours.
 */
export const crown = (n) => {
  const nodes = [];
  const e = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ id: 2 * i, x: -170, y: (i - (n - 1) / 2) * 76 });
    nodes.push({ id: 2 * i + 1, x: 170, y: (i - (n - 1) / 2) * 76 });
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) e.push({ a: 2 * i, b: 2 * j + 1 });
  return { nodes, edges: e, directed: false };
};
