import React from 'react';
import { runFourColor, eulerBound, FOUR_COLOR_PSEUDO } from '../algorithms/fourColor';
import { pick } from '../graph/families';
import { MAP_DEMO } from '../graph/samples';
import { circular } from '../graph/layout';
import { complete, grid, petersen, wheel } from '../graph/generators';
import { Field } from '../ui/controls';
import { Callout, Facts, Swatch } from '../ui/panels';
import { clone, colored } from './visual';
import { colorHex, colorName, tok } from '../theme/palette';

const octahedron = () => {
  const pos = circular([0, 1, 2, 3, 4, 5], 190);
  const apart = new Set(['0-3', '1-4', '2-5']);
  const edges = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (!apart.has(`${i}-${j}`)) edges.push({ a: i, b: j });
  return { nodes: [0, 1, 2, 3, 4, 5].map((id) => ({ id, ...pos.get(id) })), edges, directed: false };
};

function Params({ params, update }) {
  return (
    <Field label="Colors available" hint="The theorem is about 4. Try 3 on an odd wheel, or 4 on K₅.">
      <select className="field" value={params.k} onChange={(e) => update({ k: Number(e.target.value) })}>
        {[3, 4, 5].map((k) => <option key={k} value={k}>{k} colors</option>)}
      </select>
    </Field>
  );
}

function Panels({ step, params }) {
  const used = new Set(Object.values(step.color));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-[11px] text-muted">Colors seen by the current vertex</div>
        {step.used.length
          ? <div className="flex flex-wrap gap-2">{step.used.map((c) => <span key={c} className="flex items-center gap-1 text-[12px]"><Swatch color={colorHex(c)} />{colorName(c)}</span>)}</div>
          : <span className="text-[12px] italic text-muted">none</span>}
      </div>
      <Facts rows={[['Vertices colored', Object.keys(step.color).length], ['Colors in use', `${used.size} of ${params.k}`]]} />
    </div>
  );
}

function Result({ summary, params }) {
  return (
    <div className="flex flex-col gap-3">
      <Facts rows={[
        ['Verdict', summary.colorable === true ? `colorable with ${params.k} colors (used ${summary.used})` : summary.colorable === false ? `not ${params.k}-colorable` : 'undecided (search limit)'],
        ['Search nodes', summary.nodes],
        ['Euler bound', summary.planar.text],
      ]} />
      {summary.colorable === false && <Callout tone="bad">No proper coloring with {params.k} colors exists. For 4 colors that means the graph is not planar.</Callout>}
    </div>
  );
}

function About() {
  return (
    <>
      <p>The <b>Four Color Theorem</b> says every planar graph (a map whose regions are the vertices, with an edge between neighboring regions) can be properly colored with four colors. The only known proofs are computer-assisted.</p>
      <p>This page does not reproduce that proof. It finds a coloring by <b>exact DSATUR search</b>: always color the vertex that sees the most distinct colors, try each allowed color, and back up when a vertex has none left. If every branch fails, no coloring exists, so for k = 4 the graph cannot be planar (K₅ and the Petersen graph are examples of non-planar graphs; Petersen is nevertheless 3-colorable).</p>
      <p>Euler's bound <code>|E| ≤ 3|V| − 6</code> is a quick necessary condition for planarity. The trace is capped at 600 steps so hard inputs stay readable.</p>
    </>
  );
}

const fourColor = {
  id: 'four-color',
  title: 'Four colors',
  tagline: 'Color a map so neighbors differ, with search and backtracking.',
  defaultParams: { k: 4 },
  initialGraph: () => clone(MAP_DEMO),
  presets: [
    { label: 'Western US map', note: '14 states, planar', make: () => clone(MAP_DEMO), params: { k: 4 } },
    { label: 'Wheel W₅', note: 'odd wheel: needs all 4 colors', make: () => wheel(5), params: { k: 4 } },
    { label: 'Octahedron', note: 'planar, 3-colorable', make: () => octahedron(), params: { k: 3 } },
    { label: 'Complete graph K₅', note: 'not planar, not 4-colorable', make: () => complete(5), params: { k: 4 } },
    { label: 'Petersen graph', note: 'not planar, yet 3-colorable', make: () => petersen(), params: { k: 3 } },
    { label: 'Grid 4 × 5', make: () => grid(4, 5), params: { k: 4 } },
  ],
  families: pick('wheel', 'grid', 'complete', 'cycle', 'petersen', 'gnp', 'tree'),
  assumption: (g) => eulerBound(g.nodes.length, g.edges.length).text,
  compute: (g, p) => runFourColor(g, { k: p.k }),
  pseudocode: FOUR_COLOR_PSEUDO,
  legend: [
    { fill: tok('surface'), ring: tok('accent'), label: 'current vertex' },
    { fill: tok('surface'), ring: tok('bad'), label: 'dead end' },
    ...[0, 1, 2, 3].map((c) => ({ fill: colorHex(c), ring: tok('ink', 0.5), label: colorName(c) })),
  ],
  visualize: (step, g) => {
    const nodes = {};
    for (const n of g.nodes) {
      const c = step.color[n.id];
      let v = c !== undefined ? colored(c) : {};
      if (n.id === step.current) {
        v = step.kind === 'deadend' ? { ...v, ring: tok('bad'), ringWidth: 4, halo: tok('bad') } : { ...v, ring: tok('accent'), ringWidth: 4, halo: tok('accent') };
      }
      nodes[n.id] = v;
    }
    return { nodes, edges: {} };
  },
  Params, Panels, Result, About,
};

export default fourColor;
