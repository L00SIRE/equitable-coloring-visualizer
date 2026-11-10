import bfs from './bfs';
import dfs from './dfs';
import bipartite from './bipartite';
import hall from './hall';
import greedy from './greedy';
import edgeColor from './edgecolor';
import fourColor from './fourcolor';
import hs from './hs';

export const GROUPS = [
  { id: 'traversal', label: 'Traversal' },
  { id: 'structure', label: 'Structure' },
  { id: 'coloring', label: 'Coloring' },
];

export const ALGORITHMS = [
  { path: '/bfs', nav: 'Breadth-first search', group: 'traversal', algo: bfs },
  { path: '/dfs', nav: 'Depth-first search', group: 'traversal', algo: dfs },
  { path: '/bipartite', nav: 'Bipartite test', group: 'structure', algo: bipartite },
  { path: '/hall', nav: "Matching and Hall's theorem", group: 'structure', algo: hall },
  { path: '/greedy-color', nav: 'Greedy vertex coloring', group: 'coloring', algo: greedy },
  { path: '/edge-color', nav: 'Edge coloring (Vizing)', group: 'coloring', algo: edgeColor },
  { path: '/four-color', nav: 'Four colors', group: 'coloring', algo: fourColor },
  { path: '/hs-algo', nav: 'Equitable coloring (H–S)', group: 'coloring', algo: hs },
];
