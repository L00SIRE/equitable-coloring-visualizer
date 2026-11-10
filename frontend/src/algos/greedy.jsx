import React from 'react';
import { runGreedy, GREEDY_PSEUDO, ORDERINGS } from '../algorithms/coloring';
import { pick } from '../graph/families';
import { Field } from '../ui/controls';
import { Callout, Facts, Swatch, Tokens } from '../ui/panels';
import { colored } from './visual';
import { colorHex, colorName, tok } from '../theme/palette';
import { crown, complete, cycle, petersen, wheel, grid } from '../graph/generators';

function Params({ params, update }) {
  return (
    <Field label="Vertex order" hint="The order decides how many colors greedy uses. Random re-shuffles on every run.">
      <select className="field" value={params.order} onChange={(e) => update({ order: e.target.value })}>
        {ORDERINGS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function Panels({ step }) {
  const counts = {};
  Object.values(step.color).forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-[11px] text-muted">Colors on the current vertex's neighbors</div>
        {step.used.length
          ? <div className="flex flex-wrap gap-2">{step.used.map((c) => <span key={c} className="flex items-center gap-1 text-[12px]"><Swatch color={colorHex(c)} />{c} · {colorName(c)}</span>)}</div>
          : <span className="text-[12px] italic text-muted">none yet</span>}
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted">Colors in use</div>
        {Object.keys(counts).length
          ? <div className="flex flex-wrap gap-2">{Object.keys(counts).sort((a, b) => a - b).map((c) => <span key={c} className="flex items-center gap-1 text-[12px]"><Swatch color={colorHex(Number(c))} />{c} × {counts[c]}</span>)}</div>
          : <span className="text-[12px] italic text-muted">none yet</span>}
      </div>
      <Tokens label="Colored so far (in order)" items={step.order} />
    </div>
  );
}

function Result({ summary }) {
  const s = summary;
  return (
    <div className="flex flex-col gap-3">
      <Facts rows={[
        ['Colors used', s.colors],
        ['Optimal χ(G)', s.chi != null ? s.chi : `between ${s.omega} and ${s.colors}`],
        ['Clique lower bound ω', s.omega],
        ['Upper bound Δ + 1', s.delta + 1],
        ['Degeneracy + 1', s.degeneracy + 1],
        s.brooks && ['Brooks (connected)', s.brooks === 'neither' ? `χ ≤ Δ = ${s.delta}${s.delta < 3 ? ' (only for Δ ≥ 3)' : ''}` : `${s.brooks}: χ = Δ + 1 is possible`],
      ]} />
      {s.chi != null && s.colors > s.chi && (
        <Callout tone="warn">This order used {s.colors - s.chi} more color{s.colors - s.chi === 1 ? '' : 's'} than necessary. Try smallest-last or DSATUR.</Callout>
      )}
    </div>
  );
}

function About() {
  return (
    <>
      <p>Greedy coloring visits the vertices in some order and gives each the smallest color not used by an already colored neighbor. It never needs more than <code>Δ + 1</code> colors, and smallest-last order never needs more than <code>degeneracy + 1</code>.</p>
      <p><b>Brooks' theorem</b> sharpens the bound: a connected graph that is neither complete nor an odd cycle can be colored with <code>Δ</code> colors. Greedy in a bad order can still be far from optimal. In the crown graph (the default example) a bipartite graph with χ = 2 is forced to use as many colors as there are pairs, when vertices are taken in numeric order.</p>
      <p>The page also computes χ(G) exactly with a DSATUR branch-and-bound search (for up to 40 vertices) so you can see how far greedy is from optimal.</p>
    </>
  );
}

const greedy = {
  id: 'greedy',
  title: 'Greedy vertex coloring',
  tagline: 'How much does the vertex order matter?',
  defaultParams: { order: 'id' },
  initialGraph: () => crown(4),
  presets: [
    { label: 'Crown graph S₄', note: 'bipartite, but vertex order makes greedy use 4 colors', make: () => crown(4), params: { order: 'id' } },
    { label: 'Petersen graph', note: 'χ = 3, Δ = 3', make: () => petersen() },
    { label: 'Complete graph K₅', note: 'needs 5 colors', make: () => complete(5) },
    { label: 'Odd cycle C₅', note: 'χ = 3 although Δ = 2', make: () => cycle(5) },
    { label: 'Wheel W₅', make: () => wheel(5) },
    { label: 'Grid 4 × 4', make: () => grid(4, 4) },
  ],
  families: pick('crown', 'complete', 'cycle', 'wheel', 'grid', 'petersen', 'gnp', 'tree', 'bipartite'),
  compute: (g, p) => runGreedy(g, p.order),
  pseudocode: GREEDY_PSEUDO,
  legend: [{ fill: tok('surface'), ring: tok('accent'), label: 'current vertex' }, { fill: colorHex(0), ring: tok('ink', 0.5), label: 'colors from the palette' }],
  visualize: (step, g) => {
    const nodes = {};
    for (const n of g.nodes) {
      const c = step.color[n.id];
      let v = c !== undefined ? colored(c) : {};
      if (n.id === step.current) v = { ...v, ring: tok('accent'), ringWidth: 4, halo: tok('accent') };
      nodes[n.id] = v;
    }
    return { nodes, edges: {} };
  },
  Params, Panels, Result, About,
};

export default greedy;
