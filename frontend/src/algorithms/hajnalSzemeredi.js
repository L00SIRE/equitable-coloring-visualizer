/*
 * Kierstead–Kostochka algorithm for equitable (r+1)-coloring.
 *
 *   H. A. Kierstead & A. V. Kostochka, "A Short Proof of the Hajnal–Szemerédi
 *   Theorem on Equitable Colouring", Combin. Probab. Comput. 17 (2008) 265–270.
 *
 * Every graph G with Δ(G) ≤ r has a proper coloring with r+1 colors whose
 * classes differ in size by at most one. The proof is constructive:
 *
 *   Theorem 3.2 (algorithm P) – start from the edgeless graph with any
 *   equitable coloring and put the edges back one vertex at a time. When the
 *   newly added vertex v_i clashes with a neighbor, move it to a class where
 *   it has no neighbors. That leaves a *nearly equitable* coloring (one class
 *   V+ of size s+1, one class V− of size s−1, the rest of size s), which
 *   algorithm P′ turns back into an equitable one.
 *
 *   Theorem 3.1 / 2.4 (algorithm P′) – build the auxiliary digraph H(G, f) on
 *   the color classes (V → W iff some y ∈ V has no neighbor in W) and let A
 *   be the classes that can reach V−.
 *     • V+ ∈ A  → Lemma 2.1: shift one vertex along a V+ ⇝ V− path. Done.
 *     • V+ ∉ A  → pick a terminal family A′ ⊆ A, a solo vertex z ∈ W ∈ A′ and
 *       a special neighbor y1 ∈ B (Lemma 2.3). Recursively color G[B − y1]
 *       equitably with q = |B-classes| colors, then
 *         Case 1: z is movable to X ∈ A − W: z → X, y1 → W, Lemma 2.1 inside A.
 *         Case 2: otherwise: z → a class of B, y1 → W. The accessible family
 *                 grows (q drops), so repeat.
 *
 * If |G| is not a multiple of r+1 we add p disjoint "padding" vertices that
 * form a clique K_p, exactly as in the proof of Theorem 2.4. They never have
 * degree above r and are dropped from the final answer.
 *
 * runHajnalSzemeredi() is pure: it returns every intermediate snapshot so the
 * page can animate it.
 */

const setText = (items, name) => `{${items.map(name).join(', ')}}`;

function createEngine(nodeIds, edgeList, r, options = {}) {
  const { compact = true, shortcuts = true, className = (c) => `V${c}` } = options;
  const k = r + 1;

  const real = [...new Set(nodeIds)].sort((a, b) => a - b);
  const p = real.length % k === 0 ? 0 : k - (real.length % k);
  const firstDummy = real.length ? real[real.length - 1] + 1 : 0;
  const dummyIds = Array.from({ length: p }, (_, j) => firstDummy + j);
  const isDummy = new Set(dummyIds);
  const order = [...real, ...dummyIds];
  const n = order.length;
  const s = n / k;
  const allClasses = Array.from({ length: k }, (_, c) => c);

  const vn = (v) => (isDummy.has(v) ? `d${v - firstDummy + 1}` : String(v));
  const cn = (c) => className(c);
  const edgeText = (e) => `{${vn(e.a)},${vn(e.b)}}`;

  /* G' = G + K_p */
  const fullAdj = new Map(order.map((v) => [v, new Set()]));
  const link = (m, a, b) => { m.get(a).add(b); m.get(b).add(a); };
  for (const { a, b } of edgeList) {
    if (a !== b && fullAdj.has(a) && fullAdj.has(b)) link(fullAdj, a, b);
  }
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) link(fullAdj, dummyIds[i], dummyIds[j]);
  for (const v of real) {
    if (fullAdj.get(v).size > r) {
      throw new Error(`Vertex ${v} has degree ${fullAdj.get(v).size} > r = ${r}.`);
    }
  }

  /* working state: G_i, coloring f, lifted (temporarily uncolored) vertices */
  const adj = new Map(order.map((v) => [v, new Set()]));
  const activeEdges = [];
  const col = new Map(order.map((v, idx) => [v, idx % k]));
  const lifted = new Set();
  const steps = [];
  const stats = { stages: Math.max(0, n - 1), improper: 0, shifts: 0, case1: 0, case2: 0, maxDepth: 0 };

  /* ── helpers ── */
  const members = (c) => order.filter((v) => col.get(v) === c);
  const nbrsIn = (v, c) => [...adj.get(v)].filter((u) => col.get(u) === c);
  const movable = (v, c) => {
    for (const u of adj.get(v)) if (col.get(u) === c) return false;
    return true;
  };
  const sizes = () => {
    const sz = Array(k).fill(0);
    for (const v of order) { const c = col.get(v); if (c != null) sz[c]++; }
    return sz;
  };

  /* H(G, f) restricted to `classes`: from → Map(to → a vertex movable from→to) */
  const buildH = (classes) => {
    const H = new Map(classes.map((c) => [c, new Map()]));
    for (const V of classes) {
      for (const y of members(V)) {
        for (const W of classes) {
          if (W !== V && !H.get(V).has(W) && movable(y, W)) H.get(V).set(W, y);
        }
      }
    }
    return H;
  };
  const arcsOf = (H) => {
    const out = [];
    for (const [from, m] of H) for (const to of m.keys()) out.push({ from, to });
    return out;
  };

  /* classes (within `allowed`, minus `removed`) from which `target` is reachable */
  const canReach = (H, target, allowed, removed = null) => {
    const ok = new Set(allowed);
    if (removed != null) ok.delete(removed);
    if (!ok.has(target)) return new Set();
    const seen = new Set([target]);
    const queue = [target];
    while (queue.length) {
      const cur = queue.shift();
      for (const c of ok) {
        if (!seen.has(c) && H.get(c)?.has(cur)) { seen.add(c); queue.push(c); }
      }
    }
    return seen;
  };

  const findPath = (H, from, to, allowed) => {
    const ok = new Set(allowed);
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const nxt of H.get(cur).keys()) {
        if (ok.has(nxt) && !prev.has(nxt)) { prev.set(nxt, cur); queue.push(nxt); }
      }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let c = to; c != null; c = prev.get(c)) path.unshift(c);
    return path;
  };

  /* Lemma 2.1: move the witness of every arc on the path simultaneously */
  const shiftAlong = (H, path) => {
    const moves = [];
    for (let j = 0; j < path.length - 1; j++) {
      moves.push({ v: H.get(path[j]).get(path[j + 1]), from: path[j], to: path[j + 1] });
    }
    moves.forEach(({ v, to }) => col.set(v, to));
    return moves;
  };
  const movesText = (moves) => moves.map((m) => `${vn(m.v)}: ${cn(m.from)}→${cn(m.to)}`).join(', ');

  const nearly = (classes) => {
    const sz = sizes();
    return {
      vPlus: classes.find((c) => sz[c] === s + 1) ?? null,
      vMinus: classes.find((c) => sz[c] === s - 1) ?? null,
    };
  };

  const auxView = (classes, info = {}) => {
    const H = info.H ?? buildH(classes);
    const auto = info.vPlus === undefined ? nearly(classes) : {};
    return {
      classes: [...classes],
      arcs: arcsOf(H),
      vPlus: info.vPlus !== undefined ? info.vPlus : auto.vPlus,
      vMinus: info.vMinus !== undefined ? info.vMinus : auto.vMinus,
      A: info.A ? [...info.A] : null,
      Aprime: info.Aprime ?? null,
      U: info.U ?? null,
      path: info.path ?? [],
      focus: info.focus ?? {},
    };
  };

  const snapshot = (type, message, extra = {}) => {
    stats.maxDepth = Math.max(stats.maxDepth, extra.depth ?? 0);
    steps.push({
      type,
      message,
      ref: extra.ref ?? null,
      depth: extra.depth ?? 0,
      coloring: Object.fromEntries(col),
      edges: activeEdges.slice(),
      sizes: sizes(),
      lifted: [...lifted],
      highlight: {
        newEdges: [],
        improperEdge: null,
        moves: [],
        processing: null,
        roles: {},
        ...extra.highlight,
      },
      aux: extra.aux ?? auxView(extra.auxClasses ?? allClasses),
    });
  };

  /* ── Algorithm P′ (Theorems 2.4 / 3.1) on the classes in `classes` ── */
  const equalize = (classes, depth) => {
    const localR = classes.length - 1;
    for (let round = 0; round <= classes.length + 1; round++) {
      const sz = sizes();
      if (classes.every((c) => sz[c] === s)) return;
      const { vPlus, vMinus } = nearly(classes);
      if (vPlus == null || vMinus == null) throw new Error('Coloring is not nearly equitable.');

      const H = buildH(classes);
      const A = canReach(H, vMinus, classes);
      const scope = depth > 1 ? ` (inside the sub-problem, ${classes.length} colors)` : '';

      /* Lemma 2.1 */
      if (A.has(vPlus)) {
        const path = findPath(H, vPlus, vMinus, A);
        snapshot('aux',
          `Build H(G, f)${scope}. V+ = ${cn(vPlus)} can reach V− = ${cn(vMinus)}: `
          + `path ${path.map(cn).join(' → ')}.`,
          { depth, ref: 'Lemma 2.1', aux: auxView(classes, { H, vPlus, vMinus, A, path }) });
        const moves = shiftAlong(H, path);
        stats.shifts++;
        snapshot('shift',
          `Shift one vertex along each arc: ${movesText(moves)}. `
          + `V+ loses a vertex, V− gains one, every class now has ${s} vertices${scope}.`,
          { depth, ref: 'Lemma 2.1', highlight: { moves }, aux: auxView(classes, { vPlus: null, vMinus: null, path }) });
        return;
      }

      /* V+ is not accessible: A, B and the terminal family A′ */
      const Bcls = classes.filter((c) => !A.has(c));
      const m = A.size - 1;
      const q = localR - m;
      let U = null;
      let Aprime = null;
      for (const c of A) {
        const reach = canReach(H, vMinus, [...A], c);
        const T = [...A].filter((x) => x !== c && !reach.has(x));
        if (T.length > 0 && (Aprime == null || T.length < Aprime.length)) { U = c; Aprime = T; }
      }
      snapshot('blocked',
        `V+ = ${cn(vPlus)} cannot reach V− = ${cn(vMinus)} in H${scope}. `
        + `Accessible classes A = ${setText([...A], cn)} (m = ${m}); the rest B = ${setText(Bcls, cn)} (q = ${q}). `
        + `Every vertex of B has a neighbor in each class of A, so Δ(G[B]) ≤ q − 1. `
        + `Removing U = ${cn(U)} cuts A′ = ${setText(Aprime, cn)} off from V−, and every class in A′ is terminal.`,
        { depth, ref: '§2, (2.1)–(2.2)', aux: auxView(classes, { H, vPlus, vMinus, A, Aprime, U }) });

      /* Lemma 2.3: a solo vertex z ∈ W ∈ A′ that is movable inside A, or has two
         non-adjacent special neighbors in B. Among valid choices prefer ones
         that save work: Case 1, y1 ∈ V+ (then f|B−y1 is already equitable) and
         X = V−. With `shortcuts: false` the preferences flip, which the tests
         use to exercise Case 2 and the recursion. */
      const Bset = new Set(Bcls);
      const special = (z, W) => [...adj.get(z)].filter((y) => Bset.has(col.get(y)) && nbrsIn(y, W).length === 1);
      const sign = shortcuts ? 1 : -1;
      let choice = null;
      let best = -Infinity;
      const consider = (score, c) => { if (score > best) { best = score; choice = c; } };
      for (const W of Aprime) {
        for (const z of members(W)) {
          const Sz = special(z, W);
          if (Sz.length === 0) continue;
          const Xs = [...A].filter((c) => c !== W && movable(z, c));
          if (Xs.length > 0) {
            for (const y1 of Sz) {
              for (const X of Xs) {
                consider(sign * (10 + (col.get(y1) === vPlus ? 2 : 0) + (X === vMinus ? 1 : 0)),
                  { kase: 1, W, z, y1, X });
              }
            }
            continue;
          }
          for (let i = 0; i < Sz.length; i++) {
            for (let j = 0; j < Sz.length; j++) {
              if (i === j || adj.get(Sz[i]).has(Sz[j])) continue;
              consider(sign * (col.get(Sz[i]) === vPlus ? 1 : 0), { kase: 2, W, z, y1: Sz[i], y2: Sz[j] });
            }
          }
        }
      }
      if (!choice) throw new Error('Lemma 2.3 found no solo vertex (this should be impossible).');

      const { W, z, y1 } = choice;
      const Y1 = col.get(y1);
      const roles = { z, y1, ...(choice.kase === 2 ? { y2: choice.y2 } : {}) };
      const focus = { W, ...(choice.kase === 1 ? { X: choice.X } : {}) };
      const why = choice.kase === 1
        ? `z can move to ${cn(choice.X)} ∈ A, so this is Case 1.`
        : `z cannot move anywhere in A, but y1 and y2 = ${vn(choice.y2)} are both special neighbors of z and are not adjacent, so this is Case 2.`;
      col.set(y1, null);
      lifted.add(y1);
      const trivial = Y1 === vPlus;
      snapshot('solo',
        `Solo vertex z = ${vn(z)} ∈ W = ${cn(W)}: y1 = ${vn(y1)} ∈ B has z as its only neighbor in W. ${why} `
        + `Set y1 aside and color G[B − y1] equitably with the ${q} colors of B`
        + (trivial
          ? ` — y1 came from V+, so the remaining B-classes already have ${s} vertices each.`
          : ` — y1 came from ${cn(Y1)}, so recurse on that smaller problem.`),
        { depth, ref: 'Lemma 2.3', highlight: { roles },
          aux: auxView(classes, { vPlus, vMinus, A, Aprime, U, focus }) });
      if (!trivial) equalize(Bcls, depth + 1);

      if (choice.kase === 1) {
        const { X } = choice;
        col.set(z, X);
        col.set(y1, W);
        lifted.delete(y1);
        stats.case1++;
        const done = X === vMinus;
        snapshot('case1',
          `Case 1: move z = ${vn(z)} from ${cn(W)} to ${cn(X)} and drop y1 = ${vn(y1)} into ${cn(W)} `
          + `(z was its only neighbor there). `
          + (done
            ? `${cn(X)} was V−, so every class is back to ${s} vertices.`
            : `${cn(X)} is now the large class; W was terminal, so ${cn(X)} still reaches V− inside A.`),
          { depth, ref: 'Thm 2.4, Case 1', highlight: { roles, moves: [{ v: z, from: W, to: X }, { v: y1, from: Y1, to: W }] },
            aux: auxView(classes, { focus, ...(done ? { vPlus: null, vMinus: null } : {}) }) });
        if (!done) {
          const Acls = [...A];
          const H2 = buildH(Acls);
          const path = findPath(H2, X, vMinus, Acls);
          if (!path) throw new Error('Case 1: the new large class is not accessible.');
          const moves = shiftAlong(H2, path);
          stats.shifts++;
          snapshot('shift',
            `Lemma 2.1 inside A ∪ {y1}: ${path.map(cn).join(' → ')}; move ${movesText(moves)}. `
            + `Together with the equitable coloring of B − y1, every class has ${s} vertices.`,
            { depth, ref: 'Lemma 2.1', highlight: { moves }, aux: auxView(classes, { vPlus: null, vMinus: null, path }) });
        }
        const after = sizes();
        if (!classes.every((c) => after[c] === s)) throw new Error('Case 1 did not produce an equitable coloring.');
        return;
      }

      /* Case 2 */
      const Y = Bcls.find((c) => movable(z, c));
      if (Y == null) throw new Error('Case 2: z has a neighbor in every class of B.');
      col.set(z, Y);
      col.set(y1, W);
      lifted.delete(y1);
      stats.case2++;
      const next = nearly(classes);
      const nextA = canReach(buildH(classes), next.vMinus, classes);
      snapshot('case2',
        `Case 2: move z = ${vn(z)} into ${cn(Y)} (z has at most q − 1 neighbors in B − y1, so some B-class is free) `
        + `and drop y1 = ${vn(y1)} into W = ${cn(W)}. Now ${cn(Y)} is the large class V+. `
        + `y2 = ${vn(choice.y2)} can move into the new W, so the accessible family grows: q goes ${q} → ${localR - (nextA.size - 1)}. Repeat.`,
        { depth, ref: 'Thm 2.4, Case 2', highlight: { roles, moves: [{ v: z, from: W, to: Y }, { v: y1, from: Y1, to: W }] },
          aux: auxView(classes, { vPlus: next.vPlus, vMinus: next.vMinus, A: nextA, focus: { W, Y } }) });
    }
    throw new Error('P′ did not terminate within the expected number of rounds.');
  };

  const finish = () => {
    const coloring = {};
    real.forEach((v) => { coloring[v] = col.get(v); });
    return { steps, coloring, dummyIds, s, k, stats: { ...stats, steps: steps.length } };
  };

  /* final check on G itself (padding removed) */
  const verifyAndFinish = (what) => {
    const bad = edgeList.find(({ a, b }) => col.get(a) === col.get(b));
    const realSizes = Array(k).fill(0);
    real.forEach((v) => realSizes[col.get(v)]++);
    const spread = real.length ? Math.max(...realSizes) - Math.min(...realSizes) : 0;
    if (bad || spread > 1) throw new Error('Final coloring failed verification.');
    snapshot('done',
      `Done. f is a proper, equitable ${k}-coloring of G`
      + (p > 0 ? ` once the padding vertices are removed` : '')
      + `: class sizes [${realSizes.join(', ')}].`,
      { ref: what });
  };

  return {
    k, s, p, n, real, order, dummyIds, allClasses, fullAdj, adj, activeEdges, col, stats,
    vn, cn, edgeText, link, nbrsIn, movable, sizes, buildH, snapshot, equalize,
    verifyAndFinish, finish, compact,
  };
}

/* Algorithm P (Theorem 3.2): equitable (r+1)-coloring of any G with Δ(G) ≤ r. */
export function runHajnalSzemeredi(nodeIds, edgeList, r, options = {}) {
  const E = createEngine(nodeIds, edgeList, r, options);
  const { k, s, p, n, real, order, dummyIds, allClasses, fullAdj, adj, activeEdges, col, stats,
    vn, cn, edgeText, link, nbrsIn, movable, snapshot, equalize, compact } = E;

  const pad = p > 0
    ? ` |G| = ${real.length} is not a multiple of ${k}, so we add ${p} padding vertices `
      + `${setText(dummyIds, vn)} forming K${p} (Thm 2.4); they are dropped at the end.`
    : '';
  snapshot('init',
    `r = ${r}, so we look for an equitable ${k}-coloring with s = ${s} vertices per class.${pad} `
    + `Start from G with all edges removed and color v_i with class (i − 1) mod ${k}; that is trivially proper and equitable.`,
    { ref: 'Thm 3.2' });

  let quiet = null;
  const flushQuiet = () => {
    if (!quiet) return;
    const { first, last, edges } = quiet;
    const label = first === last ? `Stage ${first} (v = ${vn(order[first - 1])})` : `Stages ${first}–${last}`;
    snapshot('stage',
      `${label}: add back ${edges.length} edge${edges.length === 1 ? '' : 's'}`
      + (edges.length ? ` ${edges.map(edgeText).join(', ')}` : '')
      + `. No new edge joins two vertices of the same class, so f stays proper and equitable.`,
      { ref: 'Thm 3.2 (ii)', highlight: { newEdges: edges } });
    quiet = null;
  };

  try {
    for (let i = 1; i < n; i++) {
      const v = order[i];
      const stage = i + 1;
      const newEdges = [];
      for (let j = 0; j < i; j++) {
        const u = order[j];
        if (fullAdj.get(v).has(u)) {
          link(adj, u, v);
          const e = { a: Math.min(u, v), b: Math.max(u, v) };
          activeEdges.push(e);
          newEdges.push(e);
        }
      }

      const from = col.get(v);
      const clash = nbrsIn(v, from);
      if (clash.length === 0) {
        if (!quiet) quiet = { first: stage, last: stage, edges: [] };
        quiet.last = stage;
        quiet.edges.push(...newEdges);
        if (!compact) flushQuiet();
        continue;
      }

      flushQuiet();
      stats.improper++;
      const bad = { a: Math.min(v, clash[0]), b: Math.max(v, clash[0]) };
      snapshot('improper',
        `Stage ${stage} (v = ${vn(v)}): add back ${newEdges.map(edgeText).join(', ')}. `
        + `${edgeText(bad)} is an improper edge: both ends are in ${cn(from)}.`,
        { ref: 'Thm 3.2 (iii)', highlight: { newEdges, improperEdge: bad, processing: v } });

      const to = allClasses.find((c) => c !== from && movable(v, c));
      col.set(v, to);
      snapshot('move',
        `Move ${vn(v)} from ${cn(from)} to ${cn(to)}, where it has no neighbors (it has at most ${r} neighbors `
        + `and one of them is in ${cn(from)}). Now the coloring is nearly equitable: `
        + `V+ = ${cn(to)} has ${s + 1} vertices, V− = ${cn(from)} has ${s - 1}.`,
        { ref: 'Thm 3.2 (iii)', highlight: { processing: v, moves: [{ v, from, to }] } });

      equalize(allClasses, 1);
    }
    flushQuiet();
    E.verifyAndFinish('Thm 3.2');
  } catch (err) {
    snapshot('error', `Algorithm stopped: ${err.message}`);
  }
  return E.finish();
}

/* Algorithm P′ (Theorem 3.1) on its own: start from a given proper, nearly
   equitable coloring of the whole graph and make it equitable. */
export function runAlgorithmPPrime(nodeIds, edgeList, r, coloring, options = {}) {
  const E = createEngine(nodeIds, edgeList, r, options);
  const { k, s, p, real, fullAdj, adj, activeEdges, col, link, sizes, cn, snapshot, equalize, allClasses } = E;
  try {
    if (p > 0) throw new Error(`P′ needs |V| to be a multiple of r + 1 = ${k}.`);
    for (const v of real) {
      const c = coloring[v];
      if (!Number.isInteger(c) || c < 0 || c >= k) throw new Error(`Vertex ${v} has no color in 0…${k - 1}.`);
      col.set(v, c);
    }
    for (const v of real) {
      for (const u of fullAdj.get(v)) {
        if (u > v) { link(adj, u, v); activeEdges.push({ a: v, b: u }); }
      }
    }
    const clash = activeEdges.find(({ a, b }) => col.get(a) === col.get(b));
    if (clash) throw new Error(`The coloring is not proper: edge {${clash.a},${clash.b}} is improper.`);
    const sz = sizes();
    const big = allClasses.filter((c) => sz[c] === s + 1);
    const small = allClasses.filter((c) => sz[c] === s - 1);
    const equal = allClasses.filter((c) => sz[c] === s);
    if (big.length === 0 && small.length === 0) {
      snapshot('done', `The coloring is already equitable: every class has ${s} vertices.`, { ref: 'Thm 3.1' });
      return E.finish();
    }
    if (big.length !== 1 || small.length !== 1 || equal.length !== k - 2) {
      throw new Error(`P′ needs a nearly equitable coloring (one class of ${s + 1}, one of ${s - 1}, the rest ${s}); sizes are [${sz.join(', ')}].`);
    }
    snapshot('move',
      `Start from the current proper coloring. It is nearly equitable: V+ = ${cn(big[0])} has ${s + 1} vertices, `
      + `V− = ${cn(small[0])} has ${s - 1}.`,
      { ref: 'Thm 3.1' });
    equalize(allClasses, 1);
    E.verifyAndFinish('Thm 3.1');
  } catch (err) {
    snapshot('error', `Algorithm stopped: ${err.message}`);
  }
  return E.finish();
}

/* Verification helper used by the tests and the page. */
export function checkEquitable(nodeIds, edgeList, coloring, k) {
  const improper = edgeList.filter(({ a, b }) => coloring[a] === coloring[b]);
  const sz = Array(k).fill(0);
  nodeIds.forEach((v) => { sz[coloring[v]]++; });
  const spread = nodeIds.length ? Math.max(...sz) - Math.min(...sz) : 0;
  return { proper: improper.length === 0, equitable: spread <= 1, sizes: sz, improper };
}
