import { runBFS } from './bfs';
import { runDFS } from './dfs';
import { runBipartite } from './bipartite';
import { runGreedy, undirectedAdjacency, chromaticNumber, cliqueNumber, ORDERINGS } from './coloring';
import { runEdgeColoring } from './edgeColoring';
import { runFourColor } from './fourColor';
import { runMatching } from './hall';
import * as gen from '../graph/generators';
import { adjacency, edgeKey, maxDegree } from '../graph/model';
import { TRAVERSAL_DEMO, DIRECTED_DEMO, ODD_CYCLE_DEMO, MAP_DEMO, HALL_PERFECT, HALL_VIOLATION } from '../graph/samples';

const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const last = (r) => r.steps[r.steps.length - 1];

/* ── BFS ── */
describe('BFS', () => {
  const refDist = (g, s) => {
    const adj = adjacency(g); const d = { [s]: 0 }; const q = [s];
    while (q.length) { const u = q.shift(); for (const v of adj.get(u)) if (!(v in d)) { d[v] = d[u] + 1; q.push(v); } }
    return d;
  };
  test('distances agree with an independent computation on random graphs', () => {
    const r = rng(11);
    for (let t = 0; t < 200; t++) {
      const g = gen.gnp(4 + Math.floor(r() * 12), 0.25, r);
      const res = runBFS(g, 0);
      expect(res.summary.dist).toEqual(refDist(g, 0));
    }
  });
  test('target path is a shortest path', () => {
    const res = runBFS(TRAVERSAL_DEMO, 0, 10);
    const p = res.summary.path;
    expect(p[0]).toBe(0); expect(p[p.length - 1]).toBe(10);
    expect(p.length - 1).toBe(refDist(TRAVERSAL_DEMO, 0)[10]);
    for (let i = 0; i + 1 < p.length; i++) {
      expect(adjacency(TRAVERSAL_DEMO).get(p[i])).toContain(p[i + 1]);
    }
  });
  test('unreachable target and bad input', () => {
    const g = { nodes: [{ id: 0 }, { id: 1 }], edges: [], directed: false };
    expect(runBFS(g, 0, 1).summary.found).toBe(false);
    expect(runBFS(g, 5).error).toBeTruthy();
  });
  test('respects edge direction', () => {
    const g = { nodes: [{ id: 0 }, { id: 1 }], edges: [{ a: 1, b: 0 }], directed: true };
    expect(runBFS(g, 0, 1).summary.found).toBe(false);
    expect(runBFS(g, 1, 0).summary.found).toBe(true);
  });
  test('every step points at a pseudocode line', () => {
    runBFS(TRAVERSAL_DEMO, 0, 10).steps.forEach((s) => { expect(s.line).toBeGreaterThanOrEqual(0); expect(s.line).toBeLessThan(10); });
  });
});

/* ── DFS ── */
describe('DFS', () => {
  test('discovery/finish times are properly nested and distinct', () => {
    const r = rng(5);
    for (let t = 0; t < 150; t++) {
      const g = gen.gnp(3 + Math.floor(r() * 10), 0.3, r);
      const { summary } = runDFS(g, 0);
      const times = [...Object.values(summary.d), ...Object.values(summary.f)];
      expect(new Set(times).size).toBe(times.length);
      expect(times).toHaveLength(2 * g.nodes.length);
      for (const u of g.nodes) for (const v of g.nodes) {
        if (u.id === v.id) continue;
        const [du, fu, dv, fv] = [summary.d[u.id], summary.f[u.id], summary.d[v.id], summary.f[v.id]];
        const nested = (du < dv && fv < fu) || (dv < du && fu < fv);
        const disjoint = fu < dv || fv < du;
        expect(nested || disjoint).toBe(true);
      }
    }
  });
  test('undirected: back edge iff cycle; forests have none', () => {
    expect(runDFS(gen.path(6), 0).summary.hasCycle).toBe(false);
    expect(runDFS(gen.cycle(5), 0).summary.hasCycle).toBe(true);
    expect(runDFS(gen.randomTree(9, rng(2)), 0).summary.counts.back).toBe(0);
  });
  test('directed demo has a cycle and shows all four edge classes', () => {
    const { summary } = runDFS(DIRECTED_DEMO, 0);
    expect(summary.hasCycle).toBe(true);
    expect(summary.topoOrder).toBeNull();
    expect(summary.roots).toEqual([0, 7]);
    expect(Object.keys(summary.edgeClass)).toHaveLength(DIRECTED_DEMO.edges.length);
    ['tree', 'back', 'forward', 'cross'].forEach((c) => expect(summary.counts[c]).toBeGreaterThan(0));
  });
  test('topological order is valid on random DAGs', () => {
    const r = rng(9);
    for (let t = 0; t < 100; t++) {
      const n = 3 + Math.floor(r() * 9);
      const edges = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < 0.3) edges.push({ a: i, b: j });
      const g = { nodes: Array.from({ length: n }, (_, id) => ({ id })), edges, directed: true };
      const { summary } = runDFS(g, 0);
      expect(summary.hasCycle).toBe(false);
      const pos = Object.fromEntries(summary.topoOrder.map((v, i) => [v, i]));
      edges.forEach(({ a, b }) => expect(pos[a]).toBeLessThan(pos[b]));
    }
  });
});

/* ── bipartite ── */
describe('bipartite test', () => {
  const validWitness = (g, s) => {
    if (s.bipartite) return g.edges.every(({ a, b }) => s.color[a] !== s.color[b]);
    const adj = adjacency(g);
    const c = s.cycle;
    return c.length % 2 === 1 && new Set(c).size === c.length && c.every((v, i) => adj.get(v).includes(c[(i + 1) % c.length]));
  };
  const isBip = (g) => {
    const adj = adjacency({ ...g, directed: false }); const c = {};
    for (const n of g.nodes) {
      if (n.id in c) continue;
      c[n.id] = 0; const q = [n.id];
      while (q.length) { const u = q.shift(); for (const v of adj.get(u)) { if (!(v in c)) { c[v] = 1 - c[u]; q.push(v); } else if (c[v] === c[u]) return false; } }
    }
    return true;
  };
  test('agrees with an independent test and returns a valid witness', () => {
    const r = rng(21);
    for (let t = 0; t < 250; t++) {
      const g = gen.gnp(3 + Math.floor(r() * 10), 0.22, r);
      const res = runBipartite(g);
      expect(res.summary.bipartite).toBe(isBip(g));
      expect(validWitness(g, res.summary)).toBe(true);
    }
  });
  test('demos', () => {
    expect(runBipartite(ODD_CYCLE_DEMO).summary.cycle).toHaveLength(5);
    expect(runBipartite(gen.completeBipartite(3, 3)).summary.bipartite).toBe(true);
    expect(runBipartite(gen.cycle(6)).summary.bipartite).toBe(true);
    expect(runBipartite(gen.cycle(7)).summary.bipartite).toBe(false);
  });
});

/* ── greedy & exact colouring ── */
describe('vertex colouring', () => {
  const proper = (g, col) => g.edges.forEach(({ a, b }) => expect(col[a]).not.toBe(col[b]));
  test('every strategy is proper and within Δ + 1', () => {
    const r = rng(33);
    for (let t = 0; t < 120; t++) {
      const g = gen.gnp(3 + Math.floor(r() * 12), 0.3, r);
      for (const { id } of ORDERINGS) {
        const res = runGreedy(g, id, r);
        proper(g, res.summary.coloring);
        expect(res.summary.colors).toBeLessThanOrEqual(maxDegree(g) + 1);
        expect(res.summary.colors).toBeGreaterThanOrEqual(res.summary.omega);
        expect(res.summary.chi == null || res.summary.colors >= res.summary.chi).toBe(true);
      }
    }
  });
  test('known chromatic numbers', () => {
    const chi = (g) => { const a = undirectedAdjacency(g); return chromaticNumber(a, cliqueNumber(a), a.size); };
    expect(chi(gen.complete(5))).toBe(5);
    expect(chi(gen.cycle(5))).toBe(3);
    expect(chi(gen.cycle(6))).toBe(2);
    expect(chi(gen.petersen())).toBe(3);
    expect(chi(gen.wheel(5))).toBe(4);
    expect(chi(gen.grid(4, 4))).toBe(2);
  });
  test('smallest-last uses at most degeneracy + 1 colours', () => {
    const r = rng(8);
    for (let t = 0; t < 60; t++) {
      const res = runGreedy(gen.gnp(12, 0.3, r), 'smallest-last');
      expect(res.summary.colors).toBeLessThanOrEqual(res.summary.degeneracy + 1);
    }
  });
  test('Brooks classification', () => {
    expect(runGreedy(gen.complete(4)).summary.brooks).toBe('complete');
    expect(runGreedy(gen.cycle(5)).summary.brooks).toBe('odd cycle');
    expect(runGreedy(gen.petersen()).summary.upper).toBe(3);
  });
});

/* ── Misra–Gries ── */
describe('edge colouring (Misra–Gries)', () => {
  const check = (g, res) => {
    const delta = maxDegree(g);
    const col = res.summary.coloring;
    expect(Object.keys(col)).toHaveLength(g.edges.length);
    const at = new Map();
    g.edges.forEach((e) => {
      const c = col[edgeKey(e.a, e.b)];
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(delta);
      for (const x of [e.a, e.b]) {
        if (!at.has(x)) at.set(x, new Set());
        expect(at.get(x).has(c)).toBe(false);
        at.get(x).add(c);
      }
    });
    expect(res.summary.colors).toBeLessThanOrEqual(delta + 1);
  };
  test('proper with at most Δ + 1 colours on thousands of random graphs', () => {
    const r = rng(77);
    let inversions = 0;
    for (let t = 0; t < 1500; t++) {
      const n = 3 + Math.floor(r() * 11);
      const g = gen.gnp(n, 0.2 + r() * 0.7, r);
      if (!g.edges.length) continue;
      const res = runEdgeColoring(g, r() < 0.5 ? 'insertion' : 'random', r);
      check(g, res);
      inversions += res.summary.stats.inversions;
    }
    expect(inversions).toBeGreaterThan(0); // the hard path (fan + inversion) really runs
  });
  test('complete graphs, Petersen, bipartite', () => {
    for (const n of [3, 4, 5, 6, 7, 8]) check(gen.complete(n), runEdgeColoring(gen.complete(n)));
    const p = runEdgeColoring(gen.petersen());
    check(gen.petersen(), p);
    expect(p.summary.chromaticIndex).toBe(4);            // Petersen is class 2
    expect(runEdgeColoring(gen.complete(4)).summary.chromaticIndex).toBe(3);
    expect(runEdgeColoring(gen.complete(5)).summary.chromaticIndex).toBe(5); // odd order: class 2
    expect(runEdgeColoring(gen.completeBipartite(3, 4)).summary.chromaticIndex).toBe(4); // König
  });
  test('empty graph is reported, not crashed', () => {
    expect(runEdgeColoring({ nodes: [{ id: 0 }], edges: [], directed: false }).error).toBeTruthy();
  });
});

/* ── four colours ── */
describe('four colour search', () => {
  const proper = (g, col) => g.edges.forEach(({ a, b }) => expect(col[a]).not.toBe(col[b]));
  test('planar graphs get a proper coloring with at most 4 colours', () => {
    for (const g of [MAP_DEMO, gen.wheel(5), gen.wheel(7), gen.grid(4, 5), gen.complete(4), gen.petersen()]) {
      const res = runFourColor(g);
      expect(res.summary.colorable).toBe(true);
      proper(g, res.summary.coloring);
      expect(res.summary.used).toBeLessThanOrEqual(4);
      expect(res.steps.length).toBeLessThanOrEqual(602);
    }
  });
  test('K5 is not 4-colourable and Euler says non-planar', () => {
    const res = runFourColor(gen.complete(5));
    expect(res.summary.colorable).toBe(false);
    expect(res.summary.planar.ok).toBe(false);
    expect(last(res).kind).toBe('fail');
  });
  test('wheel on an odd rim needs all four colours', () => {
    expect(runFourColor(gen.wheel(5)).summary.used).toBe(4);
  });
});

/* ── Hall ── */
describe('matching and Hall violators', () => {
  const brute = (g) => {
    const A = g.nodes.filter((n) => n.kind === 'A').map((n) => n.id);
    const adj = adjacency(g);
    let best = 0;
    const go = (i, used, size) => {
      best = Math.max(best, size);
      if (i === A.length) return;
      go(i + 1, used, size);
      for (const b of adj.get(A[i])) if (!used.has(b)) go(i + 1, new Set([...used, b]), size + 1);
    };
    go(0, new Set(), 0);
    return best;
  };
  const violatorOk = (g, s) => {
    if (s.perfect) return true;
    const { S, N } = s.violator;
    const adj = adjacency(g);
    const NS = [...new Set(S.flatMap((a) => adj.get(a)))].sort((x, y) => x - y);
    return JSON.stringify(NS) === JSON.stringify(N) && N.length < S.length;
  };
  test('matching size equals brute force; violator is a genuine Hall violator', () => {
    const r = rng(14);
    for (let t = 0; t < 250; t++) {
      const g = gen.randomBipartite(2 + Math.floor(r() * 5), 2 + Math.floor(r() * 5), 0.15 + r() * 0.5, r);
      const res = runMatching(g);
      if (res.error) continue;
      expect(res.summary.size).toBe(brute(g));
      const used = new Set();
      let disjoint = true;
      res.summary.matching.forEach(({ a, b }) => { if (used.has(a) || used.has(b)) disjoint = false; used.add(a); used.add(b); });
      expect(disjoint).toBe(true);
      expect(violatorOk(g, res.summary)).toBe(true);
    }
  });
  test('demo graphs', () => {
    expect(runMatching(HALL_PERFECT).summary.perfect).toBe(true);
    const v = runMatching(HALL_VIOLATION).summary;
    expect(v.perfect).toBe(false);
    expect(v.deficiency).toBe(1);
  });
  test('needs both sides', () => {
    expect(runMatching({ nodes: [{ id: 0, kind: 'A' }], edges: [], directed: false }).error).toBeTruthy();
  });
});
