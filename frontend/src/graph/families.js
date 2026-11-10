import * as gen from './generators';

const n = (key, label, def, min = 2, max = 40, step = 1) => ({ key, label, def, min, max, step });

/** Graph families offered in the Graph menu. `make(params, rng)` returns a graph. */
export const FAMILIES = {
  path: { id: 'path', label: 'Path Pₙ', params: [n('n', 'n', 6, 2, 30)], make: (p) => gen.path(p.n) },
  cycle: { id: 'cycle', label: 'Cycle Cₙ', params: [n('n', 'n', 6, 3, 30)], make: (p) => gen.cycle(p.n) },
  complete: { id: 'complete', label: 'Complete Kₙ', params: [n('n', 'n', 5, 2, 14)], make: (p) => gen.complete(p.n) },
  star: { id: 'star', label: 'Star', params: [n('n', 'leaves', 6, 2, 20)], make: (p) => gen.star(p.n) },
  wheel: { id: 'wheel', label: 'Wheel Wₙ', params: [n('n', 'rim', 5, 3, 16)], make: (p) => gen.wheel(p.n) },
  grid: { id: 'grid', label: 'Grid', params: [n('r', 'rows', 3, 1, 8), n('c', 'cols', 4, 1, 8)], make: (p) => gen.grid(p.r, p.c) },
  crown: { id: 'crown', label: 'Crown graph Sₙ', params: [n('n', 'n', 5, 3, 10)], make: (p) => gen.crown(p.n) },
  petersen: { id: 'petersen', label: 'Petersen graph', params: [], make: () => gen.petersen() },
  bipartite: { id: 'bipartite', label: 'Complete bipartite Kₘ,ₙ', params: [n('m', 'm', 3, 1, 10), n('n', 'n', 4, 1, 10)], make: (p) => gen.completeBipartite(p.m, p.n) },
  tree: { id: 'tree', label: 'Random tree', params: [n('n', 'n', 9, 2, 40)], make: (p, rng) => gen.randomTree(p.n, rng) },
  gnp: { id: 'gnp', label: 'Random G(n, p)', params: [n('n', 'n', 9, 2, 30), n('p', 'p', 0.3, 0.05, 1, 0.05)], make: (p, rng) => gen.gnp(p.n, p.p, rng) },
  randomBipartite: { id: 'randomBipartite', label: 'Random bipartite', params: [n('m', 'A', 5, 1, 12), n('n', 'B', 5, 1, 12), n('p', 'p', 0.4, 0.05, 1, 0.05)], make: (p, rng) => gen.randomBipartite(p.m, p.n, p.p, rng) },
};

export const pick = (...ids) => ids.map((id) => FAMILIES[id]);
