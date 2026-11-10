import React from 'react';
import { runBFS, BFS_PSEUDO } from '../algorithms/bfs';
import { pick } from '../graph/families';
import { TRAVERSAL_DEMO } from '../graph/samples';
import { path as pathGraph, grid } from '../graph/generators';
import { VertexSelect } from '../ui/controls';
import { Facts, Tokens } from '../ui/panels';
import { E, V, clone, edgeLookup, hasNode, minId } from './visual';
import { tok } from '../theme/palette';

function Params({ params, update, graph, selection }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <VertexSelect label="Source" value={params.source} onChange={(source) => update({ source })} graph={graph} selection={selection} />
      <VertexSelect label="Target (optional)" value={params.target} onChange={(target) => update({ target })} graph={graph} selection={selection}
        allowNone hint="With a target the search stops as soon as it is reached." />
    </div>
  );
}

function Panels({ step, summary }) {
  const levels = {};
  Object.entries(step.dist).forEach(([v, d]) => { (levels[d] ??= []).push(Number(v)); });
  return (
    <div className="flex flex-col gap-3">
      <Tokens label="Queue (front → back)" items={step.queue} />
      <div>
        <div className="mb-1 text-[11px] text-muted">Levels (distance from the source)</div>
        <ul className="space-y-1 text-[12px]">
          {Object.keys(levels).sort((a, b) => a - b).map((d) => (
            <li key={d} className="flex gap-2"><span className="w-12 shrink-0 text-muted">dist {d}</span>
              <span className="font-mono">{levels[d].sort((a, b) => a - b).join(', ')}</span></li>
          ))}
        </ul>
      </div>
      <Facts rows={[
        ['Dequeued so far', step.order.length ? step.order.join(', ') : '—'],
        step.current != null && ['Parent of current', step.parent[step.current] == null ? 'none (source)' : step.parent[step.current]],
      ]} />
      {summary.path?.length > 0 && step.path.length === 0 && null}
    </div>
  );
}

function Result({ summary, params }) {
  if (summary.found === true) {
    return <Facts rows={[['Shortest path', summary.path.join(' → ')], ['Length', `${summary.length} edge${summary.length === 1 ? '' : 's'}`], ['Reached', `${summary.reached} vertices before stopping`]]} />;
  }
  if (summary.found === false) return <p className="text-[13px]">There is no path from {params.source} to {params.target}.</p>;
  return <Facts rows={[['Reachable', `${summary.reached} vertices`], ['Farthest', `${summary.eccentricity} edge${summary.eccentricity === 1 ? '' : 's'} from the source`]]} />;
}

function About() {
  return (
    <>
      <p>Breadth-first search explores a graph in rings: first the source, then everything one edge away, then two edges away, and so on. It uses a queue, so a vertex is always handled after every closer vertex.</p>
      <p>Because of that, the first time BFS reaches a vertex it has found a <b>shortest path</b> (fewest edges) to it. Following the <code>parent</code> pointers back to the source recovers that path. The running time is <code>O(|V| + |E|)</code>.</p>
      <p>BFS only reaches the source's connected component, and in a directed graph only what can be reached along edge direction.</p>
    </>
  );
}

const bfs = {
  id: 'bfs',
  title: 'Breadth-first search',
  tagline: 'Shortest paths by edge count, one ring at a time.',
  defaultParams: { source: 0, target: 10 },
  initialGraph: () => clone(TRAVERSAL_DEMO),
  normalizeParams: (p, g) => ({
    source: hasNode(g, p.source) ? p.source : minId(g),
    target: hasNode(g, p.target) ? p.target : null,
  }),
  presets: [
    { label: 'Demo graph', note: '11 vertices, with a path from 0 to 10', make: () => clone(TRAVERSAL_DEMO), params: { source: 0, target: 10 } },
    { label: 'Grid 4 × 5', make: () => grid(4, 5), params: { source: 0, target: 19 } },
    { label: 'Path P₈', note: 'every level has one vertex', make: () => pathGraph(8), params: { source: 0, target: 7 } },
  ],
  families: pick('path', 'cycle', 'grid', 'tree', 'gnp', 'complete', 'petersen'),
  directedOption: true,
  compute: (g, p) => runBFS(g, p.source, p.target),
  pseudocode: BFS_PSEUDO,
  legend: [
    { fill: tok('accent'), ring: tok('accent'), label: 'being processed' },
    { fill: tok('warn', 0.28), ring: tok('warn'), label: 'in the queue' },
    { fill: tok('ok', 0.22), ring: tok('ok'), label: 'reached' },
    { line: tok('ok'), label: 'tree edge', thick: true },
    { line: tok('violet'), label: 'shortest path', thick: true },
  ],
  idle: (g, p) => {
    const nodes = {};
    if (hasNode(g, p.source)) nodes[p.source] = { ring: tok('accent'), ringWidth: 3, bottom: 'source', bottomColor: tok('accent') };
    if (hasNode(g, p.target) && p.target !== p.source) nodes[p.target] = { ring: tok('violet'), ringWidth: 3, bottom: 'target', bottomColor: tok('violet') };
    return { nodes };
  },
  visualize: (step, g, p) => {
    const key = edgeLookup(g);
    const inQueue = new Set(step.queue);
    const onPath = new Set(step.path);
    const nodes = {};
    for (const n of g.nodes) {
      const id = n.id;
      let v = {};
      if (id in step.dist) v = { ...V.done };
      if (inQueue.has(id)) v = { ...V.frontier };
      if (onPath.has(id)) v = { ...V.onPath };
      if (id === step.current) v = { ...V.current };
      if (id in step.dist) v.top = `d=${step.dist[id]}`;
      if (id === step.discovered && id !== step.current) v.halo = tok('ok');
      if (id === p.source) v.bottom = 'source';
      if (id === p.target && id !== p.source) { v.bottom = 'target'; if (!onPath.has(id)) v.ring = tok('violet'); }
      nodes[id] = v;
    }
    const edges = {};
    step.treeEdges.forEach((k) => { edges[k] = { ...E.tree }; });
    for (let i = 0; i + 1 < step.path.length; i++) {
      const k = key(step.path[i], step.path[i + 1]);
      if (k) edges[k] = { ...E.path };
    }
    if (step.examining) {
      const k = key(step.examining.a, step.examining.b);
      if (k && !edges[k]) edges[k] = { ...E.active };
    }
    return { nodes, edges };
  },
  Params, Panels, Result, About,
};

export default bfs;
