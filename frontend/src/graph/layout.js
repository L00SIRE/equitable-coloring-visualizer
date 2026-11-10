/*
 * Layouts work in world coordinates centred on the origin; the canvas fits the
 * view afterwards, so nothing here knows the screen size.
 */

export const NODE_RADIUS = 20;

export function circular(ids, radius) {
  const n = ids.length;
  const r = radius ?? Math.max(110, n * 24);
  return new Map(ids.map((id, i) => {
    const t = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
    return [id, { x: r * Math.cos(t), y: r * Math.sin(t) }];
  }));
}

/** Two columns: kind 'A' on the left, everything else on the right. */
export function bipartiteColumns(nodes, { gapX = 340, gapY = 84 } = {}) {
  const left = nodes.filter((n) => n.kind === 'A');
  const right = nodes.filter((n) => n.kind !== 'A');
  const out = new Map();
  const place = (list, x) => list.forEach((n, i) => {
    out.set(n.id, { x, y: (i - (list.length - 1) / 2) * gapY });
  });
  place(left, -gapX / 2);
  place(right, gapX / 2);
  return out;
}

/* ── crossing counting ── */

function cross(p1, p2, p3, p4) {
  const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function countCrossings(nodes, edges) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i], f = edges[j];
      if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
      const p = [pos.get(e.a), pos.get(e.b), pos.get(f.a), pos.get(f.b)];
      if (p.every(Boolean) && cross(...p)) count++;
    }
  }
  return count;
}

/**
 * Force-directed layout with an extra push on crossing edges
 * (Fruchterman–Reingold plus untangling). Not a planarity test: it only tries
 * to reduce crossings. Returns { positions: Map(id → {x,y}), before, after }.
 */
export function forceLayout(nodes, edges, { iterations = 260, size = 520, rng = Math.random, tries = 6 } = {}) {
  const before = countCrossings(nodes, edges);
  if (nodes.length === 0) return { positions: new Map(), before, after: 0 };
  if (nodes.length === 1) return { positions: new Map([[nodes[0].id, { x: 0, y: 0 }]]), before, after: 0 };

  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const es = edges.filter((e) => index.has(e.a) && index.has(e.b));
  const n = nodes.length;
  const k = Math.sqrt((size * size) / n) * 0.9;

  const run = () => {
    const ring = circular(nodes.map((v) => v.id), size / 2);
    const pts = nodes.map((v) => {
      const p = ring.get(v.id);
      return { x: p.x + (rng() - 0.5) * 30, y: p.y + (rng() - 0.5) * 30 };
    });
    const temp0 = size / 8;
    for (let it = 0; it < iterations; it++) {
      const disp = pts.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy) || 0.01;
          const f = (k * k) / d;
          dx = (dx / d) * f; dy = (dy / d) * f;
          disp[i].x += dx; disp[i].y += dy; disp[j].x -= dx; disp[j].y -= dy;
        }
      }
      for (const e of es) {
        const i = index.get(e.a), j = index.get(e.b);
        let dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = (d * d) / k;
        dx = (dx / d) * f; dy = (dy / d) * f;
        disp[i].x -= dx; disp[i].y -= dy; disp[j].x += dx; disp[j].y += dy;
      }
      if (es.length < 150 && it > iterations * 0.3) {
        for (let a = 0; a < es.length; a++) {
          for (let b = a + 1; b < es.length; b++) {
            const e = es[a], f = es[b];
            if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
            const i1 = index.get(e.a), i2 = index.get(e.b), j1 = index.get(f.a), j2 = index.get(f.b);
            if (!cross(pts[i1], pts[i2], pts[j1], pts[j2])) continue;
            const mx = (pts[i1].x + pts[i2].x - pts[j1].x - pts[j2].x) / 2;
            const my = (pts[i1].y + pts[i2].y - pts[j1].y - pts[j2].y) / 2;
            const d = Math.hypot(mx, my) || 0.01;
            const push = (k * 0.6) / d;
            const px = (mx / d) * push * 0.5, py = (my / d) * push * 0.5;
            disp[i1].x += px; disp[i1].y += py; disp[i2].x += px; disp[i2].y += py;
            disp[j1].x -= px; disp[j1].y -= py; disp[j2].x -= px; disp[j2].y -= py;
          }
        }
      }
      const temp = temp0 * (1 - it / iterations) + 0.5;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(disp[i].x, disp[i].y) || 1;
        const m = Math.min(d, temp);
        pts[i].x += (disp[i].x / d) * m;
        pts[i].y += (disp[i].y / d) * m;
      }
    }
    // centre and fit into size × size
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(size / Math.max(1e-6, maxX - minX), size / Math.max(1e-6, maxY - minY));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const placed = nodes.map((v, i) => ({ id: v.id, x: (pts[i].x - cx) * scale, y: (pts[i].y - cy) * scale }));
    return { placed, crossings: countCrossings(placed, es) };
  };

  let best = null;
  for (let t = 0; t < tries; t++) {
    const r = run();
    if (!best || r.crossings < best.crossings) best = r;
    if (best.crossings === 0) break;
  }
  return {
    positions: new Map(best.placed.map((p) => [p.id, { x: p.x, y: p.y }])),
    before,
    after: best.crossings,
  };
}
