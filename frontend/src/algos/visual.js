import { colorHex, inkOn, tok } from '../theme/palette';
import { keyOf } from '../graph/model';

/* Vertex looks shared by the pages. Every value is a CSS colour string. */
export const V = {
  current: { fill: tok('accent'), ring: tok('accent'), text: tok('accent-ink') },
  frontier: { fill: tok('warn', 0.28), ring: tok('warn'), ringWidth: 3 },
  done: { fill: tok('ok', 0.22), ring: tok('ok') },
  onPath: { fill: tok('violet', 0.35), ring: tok('violet'), ringWidth: 3 },
  bad: { ring: tok('bad'), ringWidth: 4, halo: tok('bad') },
  muted: { opacity: 0.45 },
};

/** A vertex filled with colour class `c`. */
export function colored(c, extra = {}) {
  const hex = colorHex(c);
  return hex ? { fill: hex, text: inkOn(hex), ring: tok('ink', 0.55), ...extra } : extra;
}

/* Edge looks. */
export const E = {
  tree: { stroke: tok('ok'), width: 3.5 },
  active: { stroke: tok('accent'), width: 4, dash: '7 5' },
  path: { stroke: tok('violet'), width: 5 },
  bad: { stroke: tok('bad'), width: 4, dash: '7 5' },
  faint: { opacity: 0.18, dash: '3 5' },
};

/** (a, b) → the key the canvas uses for that edge, whichever way it was drawn. */
export function edgeLookup(graph) {
  const m = new Map();
  for (const e of graph.edges) {
    const k = keyOf(e, graph.directed);
    m.set(`${e.a},${e.b}`, k);
    m.set(`${e.b},${e.a}`, k);
  }
  return (a, b) => m.get(`${a},${b}`);
}

export const clone = (g) => ({
  nodes: g.nodes.map((n) => ({ ...n })),
  edges: g.edges.map((e) => ({ ...e })),
  directed: !!g.directed,
});

export const minId = (graph) => (graph.nodes.length ? Math.min(...graph.nodes.map((n) => n.id)) : null);
export const hasNode = (graph, id) => id != null && graph.nodes.some((n) => n.id === id);
