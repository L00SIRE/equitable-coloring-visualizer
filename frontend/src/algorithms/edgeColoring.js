import { edgeKey, maxDegree } from '../graph/model';
import { colorWithAtMost } from './coloring';

export const MISRA_GRIES_PSEUDO = [
  'MisraGries(G):  // Vizing\'s theorem: Δ + 1 colors suffice',
  '  for each uncolored edge (u, v):',
  '    if some color is free at both u and v: use it',
  '    else',
  '      F = maximal fan of u starting at v',
  '      c = a color free at u;  d = a color free at the last fan vertex',
  '      invert the cd-path that starts at u (swap c and d along it)',
  '      w = first fan vertex that is still a fan end with d free',
  '      rotate the fan up to w, then color (u, w) with d',
  '  return color',
];

/**
 * Misra–Gries edge colouring (the constructive proof of Vizing's theorem).
 * Always uses at most Δ + 1 colours, 0 … Δ. Edge direction is ignored.
 */
export function runEdgeColoring(graph, order = 'insertion', rng = Math.random) {
  const seen = new Set();
  const edges = [];
  for (const e of graph.edges) {
    const k = edgeKey(e.a, e.b);
    if (e.a !== e.b && !seen.has(k)) { seen.add(k); edges.push({ a: e.a, b: e.b, key: k }); }
  }
  if (!edges.length) return { steps: [], error: 'Add some edges first.' };

  const delta = maxDegree({ nodes: graph.nodes, edges, directed: false });
  const palette = delta + 1;

  const seq = [...edges];
  if (order === 'random') {
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
  }

  const at = new Map(graph.nodes.map((n) => [n.id, new Map()])); // vertex → (color → neighbour)
  const colorOf = new Map();                                     // edge key → color
  const eColor = (x, y) => colorOf.get(edgeKey(x, y));
  const setC = (x, y, c) => { colorOf.set(edgeKey(x, y), c); at.get(x).set(c, y); at.get(y).set(c, x); };
  const clearC = (x, y) => {
    const c = eColor(x, y);
    if (c === undefined) return;
    colorOf.delete(edgeKey(x, y));
    at.get(x).delete(c); at.get(y).delete(c);
  };
  const isFree = (x, c) => !at.get(x).has(c);
  const freeAt = (x) => { let c = 0; while (!isFree(x, c)) c++; return c; };

  const steps = [];
  const push = (line, kind, message, extra = {}) => {
    steps.push({
      line, kind, message, edge: null, fan: [], hub: null, cd: null, path: [], moved: [],
      colors: Object.fromEntries(colorOf), ...extra,
    });
  };
  const ek = (x, y) => `${x}–${y}`;

  push(1, 'init', `Δ = ${delta}, so Vizing's theorem gives a proper edge coloring with at most ${palette} colors. ${edges.length} edges to color.`);

  const stats = { simple: 0, fans: 0, inversions: 0, rotations: 0 };
  for (const { a: u, b: v } of seq) {
    push(1, 'select', `Next uncolored edge: (${u}, ${v}).`, { edge: [u, v] });
    let common = -1;
    for (let c = 0; c < palette && common < 0; c++) if (isFree(u, c) && isFree(v, c)) common = c;
    if (common >= 0) {
      setC(u, v, common);
      stats.simple++;
      push(2, 'assign', `Color ${common} is free at both ${u} and ${v}: use it.`, { edge: [u, v], moved: [[u, v]] });
      continue;
    }

    /* maximal fan of u starting at v */
    const fan = [v];
    for (;;) {
      const last = fan[fan.length - 1];
      let next = null;
      for (let c = 0; c < palette && next === null; c++) {
        if (!isFree(last, c)) continue;
        const w = at.get(u).get(c);
        if (w !== undefined && !fan.includes(w)) next = w;
      }
      if (next === null) break;
      fan.push(next);
    }
    stats.fans++;
    const last = fan[fan.length - 1];
    const c = freeAt(u);
    const d = freeAt(last);
    push(4, 'fan', `No color is free at both ends. Build the fan of ${u}: [${fan.join(', ')}]. Each edge (${u}, f) after the first has a color that is free at the previous fan vertex.`,
      { edge: [u, v], fan: [...fan], hub: u });
    push(5, 'choose', `c = ${c} is free at ${u}; d = ${d} is free at ${last}, the end of the fan.`,
      { edge: [u, v], fan: [...fan], hub: u, cd: [c, d] });

    /* invert the cd path from u */
    const pathEdges = [];
    const pathVerts = [u];
    let x = u, want = d;
    for (;;) {
      const y = at.get(x).get(want);
      if (y === undefined) break;
      pathEdges.push([x, y, want]);
      pathVerts.push(y);
      x = y;
      want = want === d ? c : d;
    }
    if (pathEdges.length && c !== d) {
      pathEdges.forEach(([p, q]) => clearC(p, q));
      pathEdges.forEach(([p, q, col]) => setC(p, q, col === d ? c : d));
      stats.inversions++;
      push(6, 'invert', `Invert the ${c}/${d}-path from ${u}: ${pathVerts.join(' – ')}. Colors ${c} and ${d} swap along it, so d = ${d} becomes free at ${u}.`,
        { edge: [u, v], fan: [...fan], hub: u, cd: [c, d], path: pathVerts, moved: pathEdges.map(([p, q]) => [p, q]) });
    } else {
      push(6, 'invert', `d = ${d} is already free at ${u}, so the ${c}/${d}-path is empty and nothing needs to be inverted.`,
        { edge: [u, v], fan: [...fan], hub: u, cd: [c, d] });
    }

    /* shortest valid prefix of the fan that ends at a vertex where d is free */
    let wIdx = -1;
    for (let i = 0; i < fan.length && wIdx < 0; i++) {
      let prefixOk = true;
      for (let j = 0; j < i; j++) {
        const col = eColor(u, fan[j + 1]);
        if (col === undefined || !isFree(fan[j], col)) { prefixOk = false; break; }
      }
      if (prefixOk && isFree(fan[i], d)) wIdx = i;
    }
    if (wIdx < 0) throw new Error('Misra–Gries invariant failed: no fan prefix ends at a vertex where d is free.');
    const w = fan[wIdx];

    const cols = [];
    for (let j = 1; j <= wIdx; j++) cols.push(eColor(u, fan[j]));
    for (let j = 1; j <= wIdx; j++) clearC(u, fan[j]);
    for (let j = 0; j < wIdx; j++) setC(u, fan[j], cols[j]);
    setC(u, w, d);
    stats.rotations++;
    const rotated = fan.slice(0, wIdx + 1);
    push(8, 'rotate', wIdx === 0
      ? `d = ${d} is free at ${w} = ${v}: color (${u}, ${v}) with ${d}.`
      : `Rotate the fan up to w = ${w}: each edge takes the color of the next one (${rotated.slice(0, -1).map((f, j) => `${ek(u, f)} → ${cols[j]}`).join(', ')}), then color (${u}, ${w}) with d = ${d}.`,
      { edge: [u, v], fan: rotated, hub: u, cd: [c, d], moved: rotated.map((f) => [u, f]) });
  }

  const used = new Set(colorOf.values()).size;
  push(9, 'done', `Done: ${used} color${used === 1 ? '' : 's'} used (Δ = ${delta}, so at most ${palette}).`);

  /* exact chromatic index: χ'(G) = χ(L(G)), found by searching for a Δ-colouring */
  let chromaticIndex = null;
  if (edges.length <= 36) {
    const line = new Map(edges.map((e) => [e.key, []]));
    for (const e of edges) for (const f of edges) {
      if (e !== f && (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b)) line.get(e.key).push(f.key);
    }
    const r = colorWithAtMost(new Map([...line].map(([k2, l]) => [k2, l])), delta, { budget: 40000 });
    chromaticIndex = r.coloring ? delta : r.exhausted ? null : delta + 1;
  }
  const last2 = steps[steps.length - 1];
  last2.message += chromaticIndex === delta
    ? ` The exact chromatic index is Δ = ${delta} (class 1).`
    : chromaticIndex === delta + 1
      ? ` No ${delta}-edge-coloring exists, so the chromatic index is Δ + 1 = ${palette} (class 2).`
      : '';
  return { steps, summary: { colors: used, delta, palette, chromaticIndex, stats, coloring: Object.fromEntries(colorOf) }, error: null };
}
