import { colorWithAtMost, undirectedAdjacency } from './coloring';

export const FOUR_COLOR_PSEUDO = [
  'FourColor(G):',
  '  repeat until every vertex is colored:',
  '    v = uncolored vertex that sees the most colors (ties: most uncolored neighbors)',
  '    for c in 0..3 not used by a neighbor of v:  color[v] = c; recurse',
  '    if no color works: dead end, undo the last choice (backtrack)',
  '  return color',
];

/** Euler's bound for simple planar graphs: |E| ≤ 3|V| − 6 when |V| ≥ 3. */
export function eulerBound(n, m) {
  if (n < 3) return { ok: true, text: 'With fewer than 3 vertices the graph is trivially planar.' };
  const bound = 3 * n - 6;
  return m <= bound
    ? { ok: true, text: `|E| = ${m} ≤ 3|V| − 6 = ${bound}: Euler's bound does not rule out planarity.` }
    : { ok: false, text: `|E| = ${m} > 3|V| − 6 = ${bound}: the graph cannot be planar.` };
}

/**
 * Exact 4-colouring by DSATUR backtracking. For planar graphs the Four Colour
 * Theorem says the search always succeeds; the search itself is not the
 * theorem's proof. The trace is capped so a hopeless input stays readable.
 */
export function runFourColor(graph, { k = 4, stepLimit = 600, budget = 20000 } = {}) {
  const adj = undirectedAdjacency(graph);
  if (!adj.size) return { steps: [], error: 'Add some vertices first.' };
  const n = adj.size;
  const m = graph.edges.length;
  const planar = eulerBound(n, m);

  const steps = [];
  let skipped = 0;
  const snap = (color) => Object.fromEntries([...color].filter(([, c]) => c >= 0));
  const push = (line, kind, message, color, extra = {}) => {
    if (steps.length >= stepLimit) { skipped++; return; }
    steps.push({ line, kind, message, current: null, color: snap(color), used: [], ...extra });
  };

  const blank = new Map([...adj.keys()].map((v) => [v, -1]));
  push(1, 'init', `Looking for a proper coloring with ${k} colors. ${planar.text}`, blank);

  let stack = 0;
  const result = colorWithAtMost(adj, k, {
    budget,
    onEvent: (ev) => {
      if (ev.type === 'select') {
        push(2, 'select', `Pick ${ev.v}: it sees ${ev.sat} color${ev.sat === 1 ? '' : 's'} (${ev.used.length ? `{${ev.used.join(', ')}}` : 'none yet'}) and has ${ev.deg} uncolored neighbor${ev.deg === 1 ? '' : 's'}.`,
          ev.color, { current: ev.v, used: ev.used });
      } else if (ev.type === 'assign') {
        stack++;
        push(3, 'assign', `Try color ${ev.c} on ${ev.v}.`, ev.color, { current: ev.v });
      } else if (ev.type === 'backtrack') {
        stack = Math.max(0, stack - 1);
        push(4, 'backtrack', `Everything below that choice failed: take color ${ev.c} off ${ev.v} and try the next one.`, ev.color, { current: ev.v });
      } else if (ev.type === 'deadend') {
        push(4, 'deadend', `Dead end at ${ev.v}: its neighbors already use ${ev.used.length ? `{${ev.used.join(', ')}}` : 'colors'} and no allowed color is left. Go back one step.`,
          ev.color, { current: ev.v, used: ev.used });
      }
    },
  });

  const trace = skipped ? ` (${skipped} further trace steps were skipped.)` : '';
  if (result.coloring) {
    const col = Object.fromEntries(result.coloring);
    const used = new Set(Object.values(col)).size;
    steps.push({ line: 5, kind: 'done', current: null, used: [], color: col,
      message: `Found a proper coloring with ${used} color${used === 1 ? '' : 's'} after exploring ${result.nodes} search node${result.nodes === 1 ? '' : 's'}.${trace}` });
    return { steps, summary: { colorable: true, used, nodes: result.nodes, planar, coloring: col, skipped }, error: null };
  }
  steps.push({ line: 5, kind: result.exhausted ? 'giveup' : 'fail', current: null, used: [], color: {},
    message: result.exhausted
      ? `The search stopped after ${budget} nodes without an answer.${trace}`
      : `Every branch failed: no proper ${k}-coloring exists. The Four Color Theorem says this cannot happen for a planar graph, so G is not planar${planar.ok ? ' (even though Euler\'s bound alone does not show it)' : ''}.${trace}` });
  return { steps, summary: { colorable: result.exhausted ? null : false, nodes: result.nodes, planar, coloring: {}, skipped }, error: null };
}
