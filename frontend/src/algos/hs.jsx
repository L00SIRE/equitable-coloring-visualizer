import React from 'react';
import { runHajnalSzemeredi } from '../algorithms/hajnalSzemeredi';
import { pick } from '../graph/families';
import { SAMPLE_1, SAMPLE_2 } from '../graph/samples';
import { cycle, petersen, randomBounded, completeBipartite } from '../graph/generators';
import { maxDegree } from '../graph/model';
import { Field, Toggle } from '../ui/controls';
import { Callout, Facts, Swatch } from '../ui/panels';
import { E, clone, colored, edgeLookup } from './visual';
import { colorHex, colorName, inkOn, tok } from '../theme/palette';

const PAPER_URL = 'https://doi.org/10.1017/S0963548307008619';
const ROLE_LABEL = { z: 'z', y1: 'y₁', y2: 'y₂' };
const TAG_TONE = { 'V+': 'text-accent', 'V−': 'text-warn', A: 'text-ok', B: 'text-muted', 'A′': 'text-violet', U: 'text-warn', W: 'text-violet', X: 'text-violet', Y: 'text-violet' };

const levelLabel = (depth) => (depth <= 0 ? 'Algorithm P' : depth === 1 ? 'Algorithm P′' : `P′ on G[B − y₁], level ${depth - 1}`);

const KIND_LABELS = {
  init: 'start', stage: 'add edges', improper: 'improper edge', move: 'nearly equitable', aux: 'path in H',
  shift: 'Lemma 2.1 shift', blocked: 'V+ blocked', solo: 'solo vertex', case1: 'Case 1', case2: 'Case 2',
};

/* ── world-space overlay for the padding clique K_p ── */
function paddingLayout(graph, count) {
  if (!count) return [];
  const xs = graph.nodes.map((n) => n.x), ys = graph.nodes.map((n) => n.y);
  const right = xs.length ? Math.max(...xs) : 0, bottom = ys.length ? Math.max(...ys) : 0;
  return Array.from({ length: count }, (_, j) => ({ x: right - j * 56, y: bottom + 96 }));
}

function PaddingOverlay({ ids, spots, coloring }) {
  if (!ids.length) return null;
  const labelX = spots[0].x, labelY = spots[0].y - 28;
  return (
    <g pointerEvents="none">
      {spots.flatMap((p, i) => spots.slice(i + 1).map((q, j) => (
        <line key={`${i}-${j}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeDasharray="3 4" style={{ stroke: tok('muted'), strokeWidth: 1.5 }} />
      )))}
      {ids.map((id, j) => {
        const hex = colorHex(coloring[id]);
        return (
          <g key={id} transform={`translate(${spots[j].x} ${spots[j].y})`}>
            <circle r={17} strokeDasharray="4 3" style={{ fill: hex ?? tok('surface'), fillOpacity: 0.65, stroke: tok('muted'), strokeWidth: 2 }} />
            <text textAnchor="middle" dy=".35em" fontSize={11} fontWeight={700} style={{ fill: hex ? inkOn(hex) : tok('ink') }}>d{j + 1}</text>
          </g>
        );
      })}
      <text x={labelX} y={labelY} textAnchor="end" fontSize={11} style={{ fill: tok('muted') }}>padding K{ids.length}</text>
    </g>
  );
}

/* ── H(G, f) ── */
const AUX = 300;
function AuxDigraph({ aux, sizes, k }) {
  const R = 104, c0 = AUX / 2, nr = k > 8 ? 14 : 19;
  const pos = (c) => { const a = (c / k) * 2 * Math.PI - Math.PI / 2; return { x: c0 + R * Math.cos(a), y: c0 + R * Math.sin(a) }; };
  const inA = new Set(aux.A ?? []);
  const scope = new Set(aux.classes);
  const pathPairs = new Set(aux.path.slice(0, -1).map((c, i) => `${c}>${aux.path[i + 1]}`));
  const tags = (c) => {
    const t = [];
    if (c === aux.vPlus) t.push('V+');
    if (c === aux.vMinus) t.push('V−');
    if ((aux.Aprime ?? []).includes(c)) t.push('A′');
    if (c === aux.U) t.push('U');
    Object.entries(aux.focus ?? {}).forEach(([name, cl]) => { if (cl === c) t.push(name); });
    return t;
  };
  return (
    <svg viewBox={`0 0 ${AUX} ${AUX}`} className="h-auto w-full" role="img" aria-label="Auxiliary digraph H(G, f)">
      <defs>
        <marker id="aux-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style={{ fill: tok('muted') }} /></marker>
        <marker id="aux-arrow-path" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style={{ fill: tok('violet') }} /></marker>
      </defs>
      {aux.arcs.map((e) => {
        const p = pos(e.from), q = pos(e.to);
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
        const rev = aux.arcs.some((o) => o.from === e.to && o.to === e.from);
        const off = rev ? 4 : 0, nx = (-dy / d) * off, ny = (dx / d) * off;
        const onPath = pathPairs.has(`${e.from}>${e.to}`);
        return (
          <line key={`${e.from}-${e.to}`}
            x1={p.x + (dx / d) * (nr + 3) + nx} y1={p.y + (dy / d) * (nr + 3) + ny}
            x2={q.x - (dx / d) * (nr + 3) + nx} y2={q.y - (dy / d) * (nr + 3) + ny}
            markerEnd={onPath ? 'url(#aux-arrow-path)' : 'url(#aux-arrow)'}
            style={{ stroke: onPath ? tok('violet') : tok('line-strong'), strokeWidth: onPath ? 2.5 : 1 }} />
        );
      })}
      {Array.from({ length: k }, (_, c) => {
        const p = pos(c);
        let stroke = tok('line-strong'), sw = 1.5;
        if (c === aux.vPlus) { stroke = tok('accent'); sw = 3.5; } else if (c === aux.vMinus) { stroke = tok('warn'); sw = 3.5; } else if (aux.path.includes(c)) { stroke = tok('violet'); sw = 3; }
        const hex = colorHex(c);
        return (
          <g key={c} opacity={scope.has(c) ? 1 : 0.2}>
            {inA.has(c) && <circle cx={p.x} cy={p.y} r={nr + 6} fill="none" strokeDasharray="3 3" style={{ stroke: tok('ok'), strokeWidth: 1.5 }} />}
            <circle cx={p.x} cy={p.y} r={nr} style={{ fill: hex, stroke, strokeWidth: sw }} />
            <text x={p.x} y={p.y} textAnchor="middle" dy=".35em" fontSize={11} fontWeight={700} style={{ fill: inkOn(hex) }}>{sizes[c]}</text>
            <text x={p.x} y={p.y + nr + 14} textAnchor="middle" fontSize={9} style={{ fill: tok('ink', 0.8) }}>{colorName(c)}{tags(c).length ? ` · ${tags(c).join(' ')}` : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Panels({ step, graph, params, summary }) {
  const k = params.r + 1;
  const real = (id) => graph.nodes.some((n) => n.id === id);
  const sizeOf = (c) => Object.entries(step.coloring).filter(([id, col]) => col === c && real(Number(id))).length;
  const padOf = (c) => Object.entries(step.coloring).filter(([id, col]) => col === c && !real(Number(id))).length;
  const aux = step.aux;
  const tagsFor = (c) => {
    const t = [];
    if (c === aux.vPlus) t.push('V+');
    if (c === aux.vMinus) t.push('V−');
    if (aux.A) t.push(aux.A.includes(c) ? 'A' : 'B');
    if ((aux.Aprime ?? []).includes(c)) t.push('A′');
    if (c === aux.U) t.push('U');
    Object.entries(aux.focus ?? {}).forEach(([name, cl]) => { if (cl === c) t.push(name); });
    return t;
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-[11px] text-muted">Color classes (equitable target: {Math.floor(graph.nodes.length / k)}{graph.nodes.length % k ? ` or ${Math.floor(graph.nodes.length / k) + 1}` : ''} each)</div>
        <ul className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: k }, (_, c) => (
            <li key={c} className={`flex items-center gap-2 rounded-md border border-line px-2 py-1 text-[12px] ${aux.classes.includes(c) ? '' : 'opacity-40'}`}>
              <Swatch color={colorHex(c)} />
              <span className="min-w-0 flex-1 truncate"><b>{colorName(c)}</b> · {sizeOf(c)}{padOf(c) ? <span className="text-muted"> +{padOf(c)}</span> : null}</span>
              <span className="flex gap-1">{tagsFor(c).map((t) => <span key={t} className={`text-[10px] font-bold ${TAG_TONE[t] ?? ''}`}>{t}</span>)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted">Auxiliary digraph H(G, f): an arc V→W means some vertex of V has no neighbor in W. Class sizes inside the circles.</div>
        <AuxDigraph aux={aux} sizes={step.sizes} k={k} />
      </div>
      {summary.dummyIds.length > 0 && (
        <p className="text-[12px] text-muted">{summary.dummyIds.length} padding vertices (d1…) form a clique so that n is a multiple of {k}; they are drawn below the graph and dropped at the end.</p>
      )}
    </div>
  );
}

function Params({ params, update, graph }) {
  const delta = maxDegree(graph);
  const floor = Math.max(1, delta);
  return (
    <div className="flex flex-col gap-3">
      <Field label="r, the degree bound" hint={`Δ(G) = ${delta} is the largest number of edges at one vertex. The theorem needs Δ(G) ≤ r and gives k = r + 1 = ${params.r + 1} colors.`}>
        <input type="number" className="field w-24" min={floor} max={20} value={params.r}
          onChange={(e) => update({ r: Math.min(20, Math.max(floor, parseInt(e.target.value, 10) || floor)) })} />
      </Field>
      <Toggle checked={params.merge} onChange={(merge) => update({ merge })} title="Fold consecutive stages that create no improper edge into one step.">Merge quiet stages</Toggle>
      <Toggle checked={params.shortcuts} onChange={(shortcuts) => update({ shortcuts })}
        title="Among the choices Lemma 2.3 allows, take the one with the least work. Turn off to see Case 2 and the recursive call.">
        Shortest route <span className="text-muted">(off shows Case 2 and the recursion)</span>
      </Toggle>
    </div>
  );
}

function Result({ summary }) {
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="ok">Proper and equitable: a verified {summary.k}-coloring with class sizes {summary.sizes.join(', ')}.</Callout>
      <Facts rows={[
        ['Steps', summary.steps],
        ['Improper edges fixed', summary.improper],
        ['Lemma 2.1 shifts', summary.shifts],
        ['Case 1 / Case 2', `${summary.case1} / ${summary.case2}`],
        ['Recursion depth', Math.max(0, summary.maxDepth - 1)],
      ]} />
    </div>
  );
}

function About() {
  return (
    <>
      <p>Every graph with maximum degree Δ(G) ≤ r has an <b>equitable</b> (r+1)-coloring: a proper coloring whose color classes differ in size by at most one (Hajnal–Szemerédi, 1970). This page runs the polynomial-time algorithm from Kierstead and Kostochka, <a href={PAPER_URL} target="_blank" rel="noopener noreferrer">A Short Proof of the Hajnal–Szemerédi Theorem on Equitable Colouring</a> (Combin. Probab. Comput. 17, 2008).</p>
      <p><b>Algorithm P (Theorem 3.2).</b> Start from the edgeless graph colored v<sub>i</sub> → (i − 1) mod k, then add back the edges one vertex at a time. If v<sub>i</sub> lands on an improper edge, move it to a class where it has no neighbors. That leaves a nearly equitable coloring: one class V+ of size s + 1, one class V− of size s − 1.</p>
      <p><b>Algorithm P′</b> repairs it. Build the digraph H(G, f) on the classes (V → W when some vertex of V has no neighbor in W). If V+ can reach V−, <b>Lemma 2.1</b> shifts one vertex along the path. Otherwise the accessible classes A and the rest B split the problem: Lemma 2.3 finds a solo vertex z and a special neighbor y₁ ∈ B, G[B − y₁] is balanced recursively, and <b>Case 1</b> (z moves inside A) finishes with Lemma 2.1 while <b>Case 2</b> grows A and repeats. Total time O(n⁵).</p>
      <p>If n is not a multiple of k the proof pads the graph with a clique K<sub>p</sub>, shown below the canvas during the run.</p>
    </>
  );
}

const hs = {
  id: 'hs',
  title: 'Equitable coloring · Hajnal–Szemerédi',
  tagline: 'Balanced (Δ+1)-colorings by the Kierstead–Kostochka algorithm.',
  defaultParams: { r: 3, merge: true, shortcuts: true },
  initialGraph: () => clone(SAMPLE_1),
  normalizeParams: (p, g) => ({ ...p, r: Math.max(p.r, maxDegree(g), 1) }),
  presets: [
    { label: 'Sample Graph 1', note: '16 vertices, Δ = 3 (from the paper notes)', make: () => clone(SAMPLE_1), params: { r: 3 } },
    { label: 'Sample Graph 2', note: 'Δ = 4. Turn off "shortest route" to see Case 2', make: () => clone(SAMPLE_2), params: { r: 4 } },
    { label: 'Petersen graph', note: '10 vertices, so padding is needed', make: () => petersen(), params: { r: 3 } },
    { label: 'Cycle C₈', make: () => cycle(8), params: { r: 2 } },
    { label: 'K₃,₃', make: () => completeBipartite(3, 3), params: { r: 3 } },
  ],
  families: [
    { id: 'bounded', label: 'Random with Δ ≤ r', params: [{ key: 'n', label: 'n', def: 12, min: 3, max: 40, step: 1 }, { key: 'm', label: 'edges', def: 16, min: 1, max: 80, step: 1 }], make: (p, rng, ctx) => randomBounded(p.n, ctx?.r ?? 3, p.m, rng) },
    ...pick('cycle', 'grid', 'wheel', 'petersen', 'tree', 'bipartite'),
  ],
  assumption: (g, p) => {
    const k = p.r + 1;
    const pad = g.nodes.length % k === 0 ? 0 : k - (g.nodes.length % k);
    return pad ? `|V| = ${g.nodes.length} is not a multiple of ${k}, so the run adds ${pad} padding vertices (a clique K${pad}).` : `k = r + 1 = ${k} colors; every class will get ${g.nodes.length / k} vertices.`;
  },
  compute: (g, p) => {
    try {
      const res = runHajnalSzemeredi(g.nodes.map((n) => n.id), g.edges, p.r, { compact: p.merge, shortcuts: p.shortcuts, className: colorName });
      const steps = res.steps.map((s) => ({ ...s, kind: s.type, levelLabel: s.depth >= 1 ? levelLabel(s.depth) : levelLabel(0) }));
      const last = steps[steps.length - 1];
      if (last.type === 'error') return { error: last.message };
      const sizes = Array(res.k).fill(0);
      Object.values(res.coloring).forEach((c) => { sizes[c]++; });
      return { steps, summary: { ...res.stats, k: res.k, sizes, dummyIds: res.dummyIds, coloring: res.coloring } };
    } catch (err) { return { error: err.message }; }
  },
  kindLabels: KIND_LABELS,
  timeline: true,
  legend: [
    { line: tok('ok'), label: 'edges added', thick: true },
    { line: tok('bad'), label: 'improper edge', thick: true },
    { fill: tok('surface'), ring: tok('ok'), label: 'moved vertex' },
    { fill: tok('surface'), ring: tok('warn'), label: 'z, y₁, y₂' },
    { fill: tok('surface'), ring: tok('muted'), dashed: true, label: 'set aside / padding' },
    { line: tok('line-strong'), label: 'not added yet (faint)' },
  ],
  idle: (g, p) => {
    const k = p.r + 1;
    const ids = g.nodes.map((n) => n.id).sort((a, b) => a - b);
    return { nodes: Object.fromEntries(ids.map((id, i) => [id, colored(i % k)])) };
  },
  visualize: (step, g, p, summary) => {
    const key = edgeLookup(g);
    const added = new Set(step.edges.map((e) => `${e.a}-${e.b}`));
    const lifted = new Set(step.lifted);
    const movedIds = new Set(step.highlight.moves.map((m) => m.v));
    const roleOf = new Map(Object.entries(step.highlight.roles).map(([role, v]) => [v, role]));
    const newEdges = new Set(step.highlight.newEdges.map((e) => `${e.a}-${e.b}`));
    const bad = step.highlight.improperEdge;

    const nodes = {};
    for (const n of g.nodes) {
      const id = n.id;
      let v = lifted.has(id)
        ? { fill: 'transparent', dashed: true, ring: tok('muted'), bottom: 'set aside', bottomColor: tok('muted') }
        : colored(step.coloring[id]);
      if (movedIds.has(id)) v = { ...v, ring: tok('ok'), ringWidth: 4, halo: tok('ok') };
      if (roleOf.has(id)) v = { ...v, ring: tok('warn'), ringWidth: 4, top: ROLE_LABEL[roleOf.get(id)], topColor: tok('warn') };
      if (step.highlight.processing === id) v = { ...v, ring: tok('accent'), ringWidth: 4, halo: tok('accent') };
      nodes[id] = v;
    }

    const edges = {};
    for (const e of g.edges) {
      const lo = Math.min(e.a, e.b), hi = Math.max(e.a, e.b);
      const uk = `${lo}-${hi}`;
      const k = key(e.a, e.b);
      if (!added.has(uk)) { edges[k] = { ...E.faint }; continue; }
      const mono = step.coloring[e.a] != null && step.coloring[e.a] === step.coloring[e.b];
      let style = {};
      if (mono) style = { stroke: tok('bad'), width: 3 };
      if (newEdges.has(uk)) style = { stroke: tok('ok'), width: 3.5 };
      if (bad && bad.a === lo && bad.b === hi) style = { stroke: tok('bad'), width: 5 };
      if (lifted.has(e.a) || lifted.has(e.b)) style = { ...style, dash: '5 4', opacity: 0.55 };
      edges[k] = style;
    }

    const spots = paddingLayout(g, summary.dummyIds.length);
    return {
      nodes, edges,
      overlay: <PaddingOverlay ids={summary.dummyIds} spots={spots} coloring={step.coloring} />,
      extraPoints: spots,
    };
  },
  Params, Panels, Result, About,
};

export default hs;
