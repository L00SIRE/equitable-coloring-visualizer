import React from 'react';
import { runMatching, HALL_PSEUDO } from '../algorithms/hall';
import { pick } from '../graph/families';
import { HALL_PERFECT, HALL_VIOLATION } from '../graph/samples';
import { Callout, Facts, Tokens } from '../ui/panels';
import { E, clone, edgeLookup } from './visual';
import { tok } from '../theme/palette';

const SIDE = {
  A: { fill: 'rgba(78,121,167,0.28)', ring: '#4e79a7' },
  B: { fill: 'rgba(242,142,43,0.30)', ring: '#f28e2b' },
};
const sideLook = (n) => ({ fill: SIDE[n.kind]?.fill, ring: SIDE[n.kind]?.ring, ringWidth: 2.5 });
const nameOf = (g, id) => g.nodes.find((n) => n.id === id)?.label ?? id;

function Panels({ step, graph }) {
  return (
    <div className="flex flex-col gap-3">
      <Facts rows={[
        ['Matching size', step.matching.length],
        ['Matched pairs', step.matching.length ? step.matching.map((m) => `${nameOf(graph, m.a)}–${nameOf(graph, m.b)}`).join(', ') : '—'],
      ]} />
      <Tokens label="Current alternating path" items={step.path} render={(id) => nameOf(graph, id)} empty="none" />
      <Tokens label="Visited on side B in this search" items={step.visited} render={(id) => nameOf(graph, id)} empty="none" />
    </div>
  );
}

function Result({ summary, graph }) {
  if (summary.perfect) {
    return <Facts rows={[['Verdict', "Hall's condition holds: every vertex of A is matched"], ['Matching', summary.matching.map((m) => `${nameOf(graph, m.a)}–${nameOf(graph, m.b)}`).join(', ')]]} />;
  }
  const { S, N } = summary.violator;
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="bad" title="Hall's condition fails">
        S = {'{'}{S.map((v) => nameOf(graph, v)).join(', ')}{'}'} has only N(S) = {'{'}{N.map((v) => nameOf(graph, v)).join(', ')}{'}'}: {S.length} vertices compete for {N.length} partners.
      </Callout>
      <Facts rows={[['Maximum matching', `${summary.size} of ${summary.size + summary.deficiency}`], ['Deficiency', summary.deficiency]]} />
    </div>
  );
}

function About() {
  return (
    <>
      <p><b>Hall's marriage theorem:</b> in a bipartite graph with sides A and B, every vertex of A can be matched to a distinct neighbor in B if and only if every subset S of A has at least |S| neighbors, that is <code>|N(S)| ≥ |S|</code>.</p>
      <p>The page finds a maximum matching with <b>augmenting paths</b> (Kuhn's algorithm): for each vertex a of A, search for an alternating path that ends at a free vertex of B, then flip it, which grows the matching by one. If some vertex of A cannot be matched, the vertices reachable from it by alternating paths form a set S that violates Hall's condition, a certificate that no perfect matching exists. Time <code>O(|V|·|E|)</code>.</p>
      <p>Click <b>New vertex joins</b> to add vertices to either side; edges can only join A to B.</p>
    </>
  );
}

const hall = {
  id: 'hall',
  title: "Matching and Hall's theorem",
  tagline: 'Match side A into side B, or find the group that blocks it.',
  defaultParams: {},
  initialGraph: () => clone(HALL_PERFECT),
  nodeKinds: [{ key: 'A', label: 'A (left)' }, { key: 'B', label: 'B (right)' }],
  canConnect: (g, a, b) => {
    const ka = g.nodes.find((n) => n.id === a)?.kind, kb = g.nodes.find((n) => n.id === b)?.kind;
    return ka && kb && ka !== kb;
  },
  connectHint: 'Edges must join side A to side B.',
  presets: [
    { label: 'Four people, four jobs', note: 'a perfect matching exists', make: () => clone(HALL_PERFECT) },
    { label: 'Four applicants, three jobs', note: "Hall's condition fails", make: () => clone(HALL_VIOLATION) },
  ],
  families: pick('bipartite', 'randomBipartite'),
  compute: (g) => runMatching(g),
  pseudocode: HALL_PSEUDO,
  legend: [
    { fill: SIDE.A.fill, ring: SIDE.A.ring, label: 'side A' },
    { fill: SIDE.B.fill, ring: SIDE.B.ring, label: 'side B' },
    { line: tok('ok'), label: 'matched', thick: true },
    { line: tok('violet'), label: 'alternating path', thick: true },
    { fill: tok('surface'), ring: tok('bad'), label: 'Hall violator S' },
  ],
  idle: (g) => ({ nodes: Object.fromEntries(g.nodes.map((n) => [n.id, sideLook(n)])) }),
  visualize: (step, g) => {
    const key = edgeLookup(g);
    const onPath = new Set(step.path);
    const visited = new Set(step.visited);
    const S = new Set(step.violator?.S ?? []);
    const N = new Set(step.violator?.N ?? []);
    const nodes = {};
    for (const n of g.nodes) {
      let v = sideLook(n);
      if (visited.has(n.id)) v = { ...v, dashed: true };
      if (onPath.has(n.id)) v = { ...v, ring: tok('violet'), ringWidth: 4 };
      if (n.id === step.root) v = { ...v, ring: tok('accent'), ringWidth: 5, halo: tok('accent') };
      if (S.has(n.id)) v = { ...v, ring: tok('bad'), ringWidth: 4, halo: tok('bad') };
      if (N.has(n.id)) v = { ...v, ring: tok('warn'), ringWidth: 4, halo: tok('warn') };
      nodes[n.id] = v;
    }
    const edges = {};
    step.matching.forEach(({ a, b }) => { const k = key(a, b); if (k) edges[k] = { ...E.tree, width: 5 }; });
    for (let i = 0; i + 1 < step.path.length; i++) {
      const k = key(step.path[i], step.path[i + 1]);
      if (k && !edges[k]) edges[k] = { stroke: tok('violet'), width: 4, dash: '7 5' };
    }
    if (step.examining) { const k = key(step.examining.a, step.examining.b); if (k && !edges[k]) edges[k] = { ...E.active }; }
    return { nodes, edges };
  },
  Panels, Result, About,
};

export default hall;
