import React from 'react';
import { runBipartite, BIPARTITE_PSEUDO } from '../algorithms/bipartite';
import { pick } from '../graph/families';
import { ODD_CYCLE_DEMO } from '../graph/samples';
import { cycle, grid } from '../graph/generators';
import { VertexSelect } from '../ui/controls';
import { Callout, Facts, Tokens } from '../ui/panels';
import { E, V, clone, edgeLookup, hasNode } from './visual';
import { colorHex, tok } from '../theme/palette';

const SIDE = [colorHex(1), colorHex(5)];   // blue, orange

function Params({ params, update, graph, selection }) {
  return (
    <VertexSelect label="Start vertex (optional)" value={params.source} onChange={(source) => update({ source })}
      graph={graph} selection={selection} allowNone hint="Components not containing it are colored afterwards." />
  );
}

function Panels({ step }) {
  const part = (c) => Object.entries(step.color).filter(([, v]) => v === c).map(([k]) => Number(k)).sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3">
      <Tokens label="Queue (front → back)" items={step.queue} />
      <Facts rows={[['Color 0', part(0).join(', ') || '—'], ['Color 1', part(1).join(', ') || '—']]} />
    </div>
  );
}

function Result({ summary }) {
  if (summary.bipartite) {
    return <Facts rows={[['Verdict', 'bipartite'], ['Part 0', summary.parts[0].join(', ') || '—'], ['Part 1', summary.parts[1].join(', ') || '—']]} />;
  }
  return (
    <Callout tone="bad" title="Not bipartite">
      Odd cycle of length {summary.cycle.length}: {[...summary.cycle, summary.cycle[0]].join(' – ')}.
    </Callout>
  );
}

function About() {
  return (
    <>
      <p>A graph is bipartite if its vertices split into two sets with every edge going between them, equivalently if it can be properly colored with two colors. König's theorem says this happens exactly when the graph has <b>no odd cycle</b>.</p>
      <p>The test is a BFS that gives each new vertex the opposite color of its parent. If an edge ever joins two vertices of the same color, the two BFS-tree paths from its ends meet at a common ancestor and, together with that edge, form an odd cycle. The page shows that cycle, not just the bad edge. Time <code>O(|V| + |E|)</code>.</p>
    </>
  );
}

const bipartite = {
  id: 'bipartite',
  title: 'Bipartite test',
  tagline: 'Two-color by BFS, or find an odd cycle that proves it impossible.',
  defaultParams: { source: null },
  initialGraph: () => clone(ODD_CYCLE_DEMO),
  normalizeParams: (p, g) => ({ source: hasNode(g, p.source) ? p.source : null }),
  presets: [
    { label: 'Pentagon with a tail', note: 'has an odd cycle', make: () => clone(ODD_CYCLE_DEMO) },
    { label: 'Even cycle C₆', note: 'bipartite', make: () => cycle(6) },
    { label: 'Grid 3 × 4', note: 'bipartite', make: () => grid(3, 4) },
    { label: 'Odd cycle C₇', make: () => cycle(7) },
  ],
  families: pick('cycle', 'grid', 'tree', 'bipartite', 'gnp', 'complete', 'petersen'),
  compute: (g, p) => runBipartite(g, p.source),
  pseudocode: BIPARTITE_PSEUDO,
  legend: [
    { fill: SIDE[0], ring: tok('ink', 0.5), label: 'color 0' },
    { fill: SIDE[1], ring: tok('ink', 0.5), label: 'color 1' },
    { fill: tok('surface'), ring: tok('warn'), label: 'queued' },
    { line: tok('bad'), label: 'odd cycle', thick: true },
  ],
  visualize: (step, g) => {
    const key = edgeLookup(g);
    const queued = new Set(step.queue);
    const inCycle = new Set(step.cycle);
    const nodes = {};
    for (const n of g.nodes) {
      const c = step.color[n.id];
      let v = {};
      if (c !== undefined) v = { fill: SIDE[c], text: '#14181f', ring: tok('ink', 0.45), top: c };
      if (queued.has(n.id)) v = { ...v, ring: tok('warn'), ringWidth: 4 };
      if (n.id === step.current) v = { ...v, ring: tok('accent'), ringWidth: 4, halo: tok('accent') };
      if (inCycle.has(n.id)) v = { ...v, ...V.bad, ring: tok('bad') };
      nodes[n.id] = v;
    }
    const edges = {};
    if (step.examining) { const k = key(step.examining.a, step.examining.b); if (k) edges[k] = { ...E.active }; }
    step.cycle.forEach((v, i) => {
      const k = key(v, step.cycle[(i + 1) % step.cycle.length]);
      if (k) edges[k] = { ...E.bad, dash: undefined, width: 5 };
    });
    return { nodes, edges };
  },
  Params, Panels, Result, About,
};

export default bipartite;
