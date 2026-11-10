import React from 'react';
import { runDFS, DFS_PSEUDO } from '../algorithms/dfs';
import { pick } from '../graph/families';
import { DIRECTED_DEMO, TRAVERSAL_DEMO } from '../graph/samples';
import { cycle, randomTree } from '../graph/generators';
import { VertexSelect } from '../ui/controls';
import { Facts, Tokens } from '../ui/panels';
import { E, V, clone, edgeLookup, hasNode, minId } from './visual';
import { tok } from '../theme/palette';

const CLASS_STYLE = {
  tree: { ...E.tree },
  back: { stroke: tok('bad'), width: 3.5, dash: '7 5' },
  forward: { stroke: tok('violet'), width: 3.5 },
  cross: { stroke: tok('warn'), width: 3.5, dash: '3 5' },
};

function Params({ params, update, graph, selection }) {
  return (
    <div className="flex flex-col gap-3">
      <VertexSelect label="Start vertex" value={params.source} onChange={(source) => update({ source })} graph={graph} selection={selection} />
      <p className="text-[12px] text-muted">
        {graph.directed ? 'Edges are directed.' : 'Edges are undirected.'} Switch with <b>Graph → Directed edges</b>.
      </p>
    </div>
  );
}

function Panels({ step, graph }) {
  const counts = { tree: 0, back: 0, forward: 0, cross: 0 };
  Object.values(step.edgeClass).forEach((c) => { counts[c]++; });
  return (
    <div className="flex flex-col gap-3">
      <Tokens label="Call stack (bottom → top)" items={step.stack} />
      <Facts rows={[
        ['Clock', step.time],
        ['Tree edges', counts.tree],
        ['Back edges', counts.back],
        graph.directed && ['Forward edges', counts.forward],
        graph.directed && ['Cross edges', counts.cross],
      ]} />
    </div>
  );
}

function Result({ summary, graph }) {
  return (
    <Facts rows={[
      ['DFS trees', `${summary.roots.length} (roots ${summary.roots.join(', ')})`],
      ['Cycle', summary.hasCycle ? 'yes, a back edge exists' : 'none'],
      graph.directed && ['Topological order', summary.topoOrder ? summary.topoOrder.join(' → ') : 'does not exist (cycle)'],
    ]} />
  );
}

function About() {
  return (
    <>
      <p>Depth-first search follows an edge as deep as it can before backing up. Each vertex gets a <b>discovery time</b> <code>d</code> and a <b>finishing time</b> <code>f</code>, shown on the canvas as <code>d/f</code>. The intervals [d, f] of two vertices are either nested or disjoint.</p>
      <p>Every edge is classified when it is first looked at: a <b>tree</b> edge leads to a new vertex; a <b>back</b> edge leads to an ancestor that is still open, so it closes a cycle; <b>forward</b> and <b>cross</b> edges (directed graphs only) lead to a finished vertex.</p>
      <p>A directed graph is acyclic exactly when DFS finds no back edge, and then sorting by decreasing finishing time gives a topological order. Running time: <code>O(|V| + |E|)</code>.</p>
    </>
  );
}

const dfs = {
  id: 'dfs',
  title: 'Depth-first search',
  tagline: 'Discovery and finishing times, edge classes, cycles.',
  defaultParams: { source: 0 },
  initialGraph: () => clone(TRAVERSAL_DEMO),
  normalizeParams: (p, g) => ({ source: hasNode(g, p.source) ? p.source : minId(g) }),
  presets: [
    { label: 'Undirected demo', note: 'contains cycles, so back edges appear', make: () => clone(TRAVERSAL_DEMO), params: { source: 0 } },
    { label: 'Directed demo', note: 'tree, back, forward and cross edges; vertex 7 starts a second tree', make: () => clone(DIRECTED_DEMO), params: { source: 0 } },
    { label: 'Tree (no back edges)', make: () => randomTree(9), params: { source: 0 } },
    { label: 'Cycle C₆', make: () => cycle(6), params: { source: 0 } },
  ],
  families: pick('path', 'cycle', 'grid', 'tree', 'gnp', 'complete', 'petersen'),
  directedOption: true,
  compute: (g, p) => runDFS(g, p.source),
  pseudocode: DFS_PSEUDO,
  legend: [
    { fill: tok('accent'), ring: tok('accent'), label: 'current' },
    { fill: tok('warn', 0.28), ring: tok('warn'), label: 'open (GRAY)' },
    { fill: tok('ok', 0.22), ring: tok('ok'), label: 'finished (BLACK)' },
    { line: tok('ok'), label: 'tree', thick: true },
    { line: tok('bad'), label: 'back', thick: true },
    { line: tok('violet'), label: 'forward', thick: true },
    { line: tok('warn'), label: 'cross', thick: true },
  ],
  idle: (g, p) => ({ nodes: hasNode(g, p.source) ? { [p.source]: { ring: tok('accent'), ringWidth: 3, bottom: 'start', bottomColor: tok('accent') } } : {} }),
  visualize: (step, g) => {
    const key = edgeLookup(g);
    const onStack = new Set(step.stack);
    const nodes = {};
    for (const n of g.nodes) {
      const id = n.id;
      let v = {};
      if (step.color[id] === 'black') v = { ...V.done };
      else if (step.color[id] === 'gray' || onStack.has(id)) v = { ...V.frontier };
      if (id === step.current) v = { ...V.current };
      if (id in step.d) v.top = `${step.d[id]}/${step.f[id] ?? ''}`;
      nodes[id] = v;
    }
    const edges = {};
    for (const [k, cls] of Object.entries(step.edgeClass)) edges[k] = { ...CLASS_STYLE[cls] };
    if (step.examining) {
      const k = key(step.examining.a, step.examining.b);
      if (k) edges[k] = { ...(edges[k] ?? E.active), width: 6 };
    }
    return { nodes, edges };
  },
  Params, Panels, Result, About,
};

export default dfs;
