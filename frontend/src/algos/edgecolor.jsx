import React from 'react';
import { runEdgeColoring, MISRA_GRIES_PSEUDO } from '../algorithms/edgeColoring';
import { pick } from '../graph/families';
import { Field } from '../ui/controls';
import { Callout, Facts, Swatch } from '../ui/panels';
import { edgeLookup } from './visual';
import { colorHex, colorName, tok } from '../theme/palette';
import { complete, completeBipartite, cycle, petersen, randomBounded } from '../graph/generators';
import { maxDegree } from '../graph/model';

function Params({ params, update }) {
  return (
    <Field label="Edge order">
      <select className="field" value={params.order} onChange={(e) => update({ order: e.target.value })}>
        <option value="insertion">As drawn</option>
        <option value="random">Random (re-shuffles each run)</option>
      </select>
    </Field>
  );
}

function Panels({ step, summary }) {
  const counts = {};
  Object.values(step.colors).forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-[11px] text-muted">Edges per color (palette: 0 … {summary.palette - 1})</div>
        {Object.keys(counts).length
          ? <div className="flex flex-wrap gap-2">{Object.keys(counts).sort((a, b) => a - b).map((c) => <span key={c} className="flex items-center gap-1 text-[12px]"><Swatch color={colorHex(Number(c))} />{c} · {colorName(Number(c))} × {counts[c]}</span>)}</div>
          : <span className="text-[12px] italic text-muted">no edge colored yet</span>}
      </div>
      <Facts rows={[
        step.hub != null && ['Fan hub u', step.hub],
        step.fan.length > 0 && ['Fan', step.fan.join(', ')],
        step.cd && ['c (free at u)', <span key="c" className="inline-flex items-center gap-1"><Swatch color={colorHex(step.cd[0])} />{step.cd[0]}</span>],
        step.cd && ['d (free at fan end)', <span key="d" className="inline-flex items-center gap-1"><Swatch color={colorHex(step.cd[1])} />{step.cd[1]}</span>],
        step.path.length > 1 && ['cd-path', step.path.join(' – ')],
      ]} />
    </div>
  );
}

function Result({ summary }) {
  const s = summary;
  const klass = s.chromaticIndex == null ? null : s.chromaticIndex === s.delta ? 'class 1 (χ′ = Δ)' : 'class 2 (χ′ = Δ + 1)';
  return (
    <div className="flex flex-col gap-3">
      <Facts rows={[
        ['Colors used', s.colors],
        ['Max degree Δ', s.delta],
        ['Vizing bound Δ + 1', s.palette],
        ['Chromatic index χ′', s.chromaticIndex ?? 'not computed'],
        klass && ['Class', klass],
        ['Colored directly', `${s.stats.simple} edges`],
        ['Needed a fan', `${s.stats.fans} edges, ${s.stats.inversions} path inversion${s.stats.inversions === 1 ? '' : 's'}`],
      ]} />
      {s.colors > s.delta && s.chromaticIndex === s.delta && (
        <Callout tone="warn">This run used Δ + 1 colors, but a Δ-coloring exists. Misra–Gries only promises Δ + 1.</Callout>
      )}
    </div>
  );
}

function About() {
  return (
    <>
      <p>An edge coloring gives every edge a color so that edges sharing a vertex differ. At least Δ colors are needed. <b>Vizing's theorem</b> says Δ + 1 always suffice, so every graph is either <i>class 1</i> (χ′ = Δ) or <i>class 2</i> (χ′ = Δ + 1). Bipartite graphs are always class 1 (König).</p>
      <p>Plain greedy edge coloring can need up to 2Δ − 1 colors, so it does not prove Vizing's theorem. This page runs <b>Misra–Gries</b>, the constructive proof: when no color is free at both ends of an edge (u, v), it builds a <i>fan</i> of u, flips a two-colored <i>cd-path</i> to free a color, then rotates the fan. It always stays within Δ + 1 colors, in <code>O(|V|·|E|)</code> time.</p>
      <p>Whether the graph is class 1 or class 2 is decided exactly (for up to 36 edges) by searching for a Δ-edge-coloring of the line graph.</p>
    </>
  );
}

const edgeColor = {
  id: 'edge-color',
  title: 'Edge coloring · Vizing',
  tagline: 'Δ + 1 colors always suffice. Watch the fans and path flips that prove it.',
  defaultParams: { order: 'insertion' },
  initialGraph: () => complete(6),
  presets: [
    { label: 'Complete graph K₆', note: 'uses a fan and a path flip; χ′ = 5 but Misra–Gries ends with 6', make: () => complete(6) },
    { label: 'Complete graph K₅', note: 'two fans; class 2', make: () => complete(5) },
    { label: 'Petersen graph', note: 'class 2: Δ = 3 but χ′ = 4', make: () => petersen() },
    { label: 'Odd cycle C₇', note: 'class 2', make: () => cycle(7) },
    { label: 'K₃,₄', note: 'bipartite, so class 1', make: () => completeBipartite(3, 4) },
    { label: 'Random, Δ ≤ 4', make: () => randomBounded(9, 4, 16) },
  ],
  families: pick('complete', 'cycle', 'bipartite', 'wheel', 'grid', 'petersen', 'gnp', 'tree'),
  assumption: (g) => `Δ(G) = ${maxDegree(g)}, so Misra–Gries will use at most ${maxDegree(g) + 1} colors.`,
  compute: (g, p) => runEdgeColoring(g, p.order),
  pseudocode: MISRA_GRIES_PSEUDO,
  legend: [
    { line: tok('accent'), label: 'edge being colored', thick: true },
    { fill: tok('surface'), ring: tok('violet'), label: 'fan' },
    { fill: tok('surface'), ring: tok('accent'), label: 'fan hub u' },
    { line: colorHex(0), label: 'edge colors', thick: true },
  ],
  kindLabels: { simple: 'direct', fan: 'fan', choose: 'choose c, d', invert: 'invert path', rotate: 'rotate fan', assign: 'direct' },
  visualize: (step, g) => {
    const key = edgeLookup(g);
    const edges = {};
    g.edges.forEach((e) => { edges[key(e.a, e.b)] = { stroke: tok('line-strong'), width: 2, dash: '3 5', opacity: 0.55 }; });
    for (const [k, c] of Object.entries(step.colors)) {
      const [a, b] = k.split('-').map(Number);
      edges[key(a, b)] = { stroke: colorHex(c), width: 5, label: c };
    }
    (step.moved || []).forEach(([a, b]) => { const kk = key(a, b); if (kk) edges[kk] = { ...edges[kk], width: 8 }; });
    if (step.edge) {
      const [a, b] = step.edge;
      const kk = key(a, b);
      if (kk && !(`${Math.min(a, b)}-${Math.max(a, b)}` in step.colors)) edges[kk] = { stroke: tok('accent'), width: 5, dash: '8 5' };
    }
    const nodes = {};
    g.nodes.forEach((n) => { nodes[n.id] = {}; });
    step.fan.forEach((v) => { nodes[v] = { ring: tok('violet'), ringWidth: 4 }; });
    step.path.forEach((v) => { nodes[v] = { ...nodes[v], halo: tok('violet') }; });
    if (step.hub != null) nodes[step.hub] = { ring: tok('accent'), ringWidth: 5 };
    if (step.edge && step.hub == null) step.edge.forEach((v) => { nodes[v] = { ring: tok('accent'), ringWidth: 4 }; });
    return { nodes, edges };
  },
  Params, Panels, Result, About,
};

export default edgeColor;
