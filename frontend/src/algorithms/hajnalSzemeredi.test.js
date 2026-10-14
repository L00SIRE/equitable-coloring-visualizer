import { runHajnalSzemeredi, runAlgorithmPPrime, checkEquitable } from './hajnalSzemeredi';

const range = (n) => Array.from({ length: n }, (_, i) => i);
const toEdges = (pairs) => pairs.map(([a, b]) => ({ a: Math.min(a, b), b: Math.max(a, b) }));

/* the 16-vertex graph from the notes ("Sample Graph 1" on the page) */
const PAPER_EDGES = toEdges([
  [0, 1], [1, 2], [2, 3], [1, 4], [3, 4], [0, 5], [4, 5], [5, 6], [0, 7], [6, 7], [3, 8],
  [8, 9], [9, 10], [10, 11], [7, 12], [2, 13], [12, 13], [11, 14], [13, 14], [9, 15],
  [11, 15], [14, 15],
]);

/* "Sample Graph 2": blocked at the last stage, Case 2 when shortcuts are off */
const SAMPLE2_EDGES = toEdges([
  [0, 1], [1, 3], [0, 4], [3, 4], [1, 5], [4, 5], [5, 6], [0, 7], [5, 7], [6, 8], [8, 9],
  [1, 10], [2, 10], [9, 10], [7, 11], [9, 11], [3, 12], [8, 12], [9, 13], [10, 13],
  [11, 13], [12, 13], [4, 14], [11, 14], [12, 14],
]);

const PETERSEN_EDGES = toEdges([
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 4], [5, 7], [7, 9], [9, 6], [6, 8], [5, 8],
  [0, 5], [1, 6], [2, 7], [3, 8], [4, 9],
]);

/* tiny deterministic PRNG so failures are reproducible */
function prng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function randomGraph(rand, n, r, tries) {
  const deg = Array(n).fill(0);
  const seen = new Set();
  const edges = [];
  for (let t = 0; t < tries; t++) {
    const a = Math.floor(rand() * n);
    const b = Math.floor(rand() * n);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a === b || seen.has(key) || deg[a] >= r || deg[b] >= r) continue;
    seen.add(key);
    deg[a]++; deg[b]++;
    edges.push({ a: Math.min(a, b), b: Math.max(a, b) });
  }
  return edges;
}

/* A proper nearly equitable coloring in which V+ cannot reach V−: every vertex
   of B gets a neighbor in each class of A (the structure behind (2.1)). */
function blockedInstance(rand, r, s, extra) {
  const k = r + 1;
  const sizes = Array(k).fill(s);
  sizes[0] = s + 1;
  sizes[1] = s - 1;
  const col = {};
  const members = Array.from({ length: k }, () => []);
  let id = 0;
  for (let c = 0; c < k; c++) for (let j = 0; j < sizes[c]; j++) { col[id] = c; members[c].push(id); id++; }
  const n = id;
  const m = 1 + Math.floor(rand() * (r - 1));
  const others = range(r - 1).map((i) => i + 2);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const A = [1, ...others.slice(0, m)];
  const B = [0, ...others.slice(m)];
  const adj = range(n).map(() => new Set());
  const edges = [];
  const add = (a, b) => {
    if (a === b || adj[a].has(b) || col[a] === col[b] || adj[a].size >= r || adj[b].size >= r) return;
    adj[a].add(b); adj[b].add(a);
    edges.push({ a: Math.min(a, b), b: Math.max(a, b) });
  };
  for (const Bc of B) {
    for (const y of members[Bc]) {
      for (const Ac of A) {
        const cands = members[Ac].filter((x) => adj[x].size < r && !adj[y].has(x));
        if (!cands.length) return null;
        add(y, cands[Math.floor(rand() * cands.length)]);
      }
    }
  }
  for (let t = 0; t < extra * n; t++) add(Math.floor(rand() * n), Math.floor(rand() * n));
  return { n, edges, col };
}

const expectSolved = (ids, edges, res, k) => {
  const last = res.steps[res.steps.length - 1];
  expect(last.message).not.toMatch(/stopped/);
  expect(last.type).toBe('done');
  const chk = checkEquitable(ids, edges, res.coloring, k);
  expect(chk.proper).toBe(true);
  expect(chk.equitable).toBe(true);
};

describe('Sample Graph 1 (paper notes)', () => {
  test('finishes in a handful of steps through Case 1', () => {
    const res = runHajnalSzemeredi(range(16), PAPER_EDGES, 3);
    expectSolved(range(16), PAPER_EDGES, res, 4);
    expect(res.steps.length).toBeLessThanOrEqual(10);
    expect(res.stats.improper).toBe(1);
    expect(res.stats.case1).toBe(1);
    expect(res.steps.map((s) => s.type)).toEqual(
      ['init', 'stage', 'improper', 'move', 'blocked', 'solo', 'case1', 'done'],
    );
  });

  test('detailed mode shows one step per stage', () => {
    const res = runHajnalSzemeredi(range(16), PAPER_EDGES, 3, { compact: false });
    expectSolved(range(16), PAPER_EDGES, res, 4);
    expect(res.steps.filter((s) => s.type === 'stage')).toHaveLength(14);
  });

  test('without shortcuts it recurses into G[B − y1]', () => {
    const res = runHajnalSzemeredi(range(16), PAPER_EDGES, 3, { shortcuts: false });
    expectSolved(range(16), PAPER_EDGES, res, 4);
    expect(res.stats.maxDepth).toBe(2);
  });
});

describe('Sample Graph 2', () => {
  test('reaches Case 2 and the recursive call without shortcuts', () => {
    const res = runHajnalSzemeredi(range(15), SAMPLE2_EDGES, 4, { shortcuts: false });
    expectSolved(range(15), SAMPLE2_EDGES, res, 5);
    expect(res.stats.case2).toBe(1);
    expect(res.stats.maxDepth).toBe(2);
    const solo = res.steps.find((s) => s.type === 'solo');
    expect(solo.lifted).toEqual([solo.highlight.roles.y1]);
  });

  test('takes Case 1 with shortcuts', () => {
    const res = runHajnalSzemeredi(range(15), SAMPLE2_EDGES, 4);
    expectSolved(range(15), SAMPLE2_EDGES, res, 5);
    expect(res.stats.case1).toBe(1);
    expect(res.stats.case2).toBe(0);
  });
});

describe('padding (n not a multiple of r + 1)', () => {
  test('Petersen graph with r = 3 adds K2 and drops it again', () => {
    const res = runHajnalSzemeredi(range(10), PETERSEN_EDGES, 3);
    expect(res.dummyIds).toEqual([10, 11]);
    expectSolved(range(10), PETERSEN_EDGES, res, 4);
    expect(Object.keys(res.coloring)).toHaveLength(10);
  });

  test('edgeless and tiny graphs', () => {
    expectSolved([0], [], runHajnalSzemeredi([0], [], 2), 3);
    expectSolved(range(5), [], runHajnalSzemeredi(range(5), [], 1), 2);
    expectSolved([0, 1], [{ a: 0, b: 1 }], runHajnalSzemeredi([0, 1], [{ a: 0, b: 1 }], 1), 2);
  });
});

describe('random graphs', () => {
  test('every run ends proper and equitable', () => {
    const rand = prng(2024);
    for (let t = 0; t < 400; t++) {
      const r = 1 + Math.floor(rand() * 5);
      const n = 2 + Math.floor(rand() * 20);
      const edges = randomGraph(rand, n, r, n * r * 4);
      const res = runHajnalSzemeredi(range(n), edges, r, { shortcuts: rand() < 0.5 });
      expectSolved(range(n), edges, res, r + 1);
    }
  });
});

describe('algorithm P′ on blocked colorings', () => {
  test('Case 1, Case 2 and the recursion all end equitable', () => {
    const rand = prng(7);
    const seen = { case1: 0, case2: 0, nested: 0 };
    for (let t = 0; t < 1500; t++) {
      const r = 2 + Math.floor(rand() * 5);
      const inst = blockedInstance(rand, r, 2 + Math.floor(rand() * 3), rand() * 1.5);
      if (!inst) continue;
      for (const shortcuts of [true, false]) {
        const res = runAlgorithmPPrime(range(inst.n), inst.edges, r, inst.col, { shortcuts });
        expectSolved(range(inst.n), inst.edges, res, r + 1);
        seen.case1 += res.stats.case1;
        seen.case2 += res.stats.case2;
        if (res.stats.maxDepth >= 2) seen.nested++;
      }
    }
    expect(seen.case1).toBeGreaterThan(0);
    expect(seen.case2).toBeGreaterThan(0);
    expect(seen.nested).toBeGreaterThan(0);
  });

  test('rejects colorings that are not nearly equitable', () => {
    const col = { 0: 0, 1: 0, 2: 0 };
    const res = runAlgorithmPPrime(range(3), [], 2, col);
    expect(res.steps[res.steps.length - 1].type).toBe('error');
  });
});
