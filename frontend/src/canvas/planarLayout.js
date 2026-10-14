/**
 * "Draw as planar as possible" — force-directed layout with crossing untangle.
 *
 * Not a full planarization algorithm (NP-hard in general). It:
 *  1. Runs a Fruchterman–Reingold–style spring layout for spacing
 *  2. Detects straight-line edge crossings and applies untangling forces
 *  3. Fits the result into the canvas with padding
 *
 * Accepts edges as {a,b} or {from,to}. Returns new node positions (ids preserved).
 */

function endpoint(edge) {
  const u = edge.a ?? edge.from;
  const v = edge.b ?? edge.to;
  if (u == null || v == null || u === v) return null;
  return u < v || String(u) < String(v) ? [u, v] : [v, u];
}

function normalizeEdgeList(edges = []) {
  const out = [];
  const seen = new Set();
  for (const raw of edges) {
    const ep = endpoint(raw);
    if (!ep) continue;
    const key = `${ep[0]}|${ep[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a: ep[0], b: ep[1] });
  }
  return out;
}

/** Proper segment intersection (excludes shared endpoints / touching at a vertex). */
function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function shareVertex(e1, e2) {
  return e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b;
}

export function countEdgeCrossings(nodes, edges) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const es = normalizeEdgeList(edges);
  let crossings = 0;
  for (let i = 0; i < es.length; i += 1) {
    for (let j = i + 1; j < es.length; j += 1) {
      if (shareVertex(es[i], es[j])) continue;
      const a = pos.get(es[i].a);
      const b = pos.get(es[i].b);
      const c = pos.get(es[j].a);
      const d = pos.get(es[j].b);
      if (!a || !b || !c || !d) continue;
      if (segmentsCross(a, b, c, d)) crossings += 1;
    }
  }
  return crossings;
}

function fitToCanvas(points, width, height, padding) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const innerW = Math.max(1, width - 2 * padding);
  const innerH = Math.max(1, height - 2 * padding);
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((p) => ({
    ...p,
    x: width / 2 + (p.x - cx) * scale,
    y: height / 2 + (p.y - cy) * scale,
  }));
}

/**
 * @param {Array<{id:any,x:number,y:number}>} nodes
 * @param {Array} edges
 * @param {{width?:number,height?:number,padding?:number,iterations?:number}} [opts]
 * @returns {{nodes: Array, crossingsBefore: number, crossingsAfter: number}}
 */
export function layoutPlanarAsPossible(nodes, edges, opts = {}) {
  const width = opts.width ?? 820;
  const height = opts.height ?? 520;
  const padding = opts.padding ?? 60;
  const iterations = opts.iterations ?? 220;

  if (!nodes || nodes.length === 0) {
    return { nodes: [], crossingsBefore: 0, crossingsAfter: 0 };
  }

  const es = normalizeEdgeList(edges);
  const crossingsBefore = countEdgeCrossings(nodes, es);

  // Working copies
  let pts = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    const jitter = 8;
    return {
      id: n.id,
      x: Number.isFinite(n.x) ? n.x : width / 2 + 120 * Math.cos(angle),
      y: Number.isFinite(n.y) ? n.y : height / 2 + 120 * Math.sin(angle),
      // tiny jitter avoids exact overlaps
      _jx: (Math.random() - 0.5) * jitter,
      _jy: (Math.random() - 0.5) * jitter,
    };
  });
  pts = pts.map((p) => ({ id: p.id, x: p.x + p._jx, y: p.y + p._jy }));

  const index = new Map(pts.map((p, i) => [p.id, i]));
  const n = pts.length;
  const area = width * height;
  const k = Math.sqrt(area / Math.max(1, n)); // ideal distance
  let temp = Math.min(width, height) / 10;

  const adj = new Map(pts.map((p) => [p.id, []]));
  es.forEach((e) => {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  });

  for (let iter = 0; iter < iterations; iter += 1) {
    const disp = pts.map(() => ({ x: 0, y: 0 }));

    // Node–node repulsion
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pts[i].x - pts[j].x;
        let dy = pts[i].y - pts[j].y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        disp[i].x += dx;
        disp[i].y += dy;
        disp[j].x -= dx;
        disp[j].y -= dy;
      }
    }

    // Edge attraction
    for (let eIdx = 0; eIdx < es.length; eIdx += 1) {
      const e = es[eIdx];
      const i = index.get(e.a);
      const j = index.get(e.b);
      if (i == null || j == null) continue;
      let dx = pts[i].x - pts[j].x;
      let dy = pts[i].y - pts[j].y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      disp[i].x -= dx;
      disp[i].y -= dy;
      disp[j].x += dx;
      disp[j].y += dy;
    }

    // Crossing untangle (stronger in the second half)
    const crossWeight = iter < iterations * 0.35 ? 0.15 : 0.85;
    if (crossWeight > 0 && es.length < 120) {
      for (let a = 0; a < es.length; a += 1) {
        for (let b = a + 1; b < es.length; b += 1) {
          if (shareVertex(es[a], es[b])) continue;
          const i1 = index.get(es[a].a);
          const i2 = index.get(es[a].b);
          const j1 = index.get(es[b].a);
          const j2 = index.get(es[b].b);
          if ([i1, i2, j1, j2].some((x) => x == null)) continue;
          const p1 = pts[i1];
          const p2 = pts[i2];
          const p3 = pts[j1];
          const p4 = pts[j2];
          if (!segmentsCross(p1, p2, p3, p4)) continue;

          // Midpoints of the two edges
          const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const m2 = { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 };
          let dx = m1.x - m2.x;
          let dy = m1.y - m2.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const push = (k * 0.55 * crossWeight) / dist;
          dx = (dx / dist) * push;
          dy = (dy / dist) * push;

          // Distribute to the four endpoints
          disp[i1].x += dx * 0.5;
          disp[i1].y += dy * 0.5;
          disp[i2].x += dx * 0.5;
          disp[i2].y += dy * 0.5;
          disp[j1].x -= dx * 0.5;
          disp[j1].y -= dy * 0.5;
          disp[j2].x -= dx * 0.5;
          disp[j2].y -= dy * 0.5;

          // Mild rotational nudge (swap tendency) along edge normals
          const ex1 = p2.x - p1.x;
          const ey1 = p2.y - p1.y;
          const nx1 = -ey1;
          const ny1 = ex1;
          const nl1 = Math.hypot(nx1, ny1) || 1;
          const twist = 0.12 * crossWeight * k;
          disp[i1].x += (nx1 / nl1) * twist;
          disp[i1].y += (ny1 / nl1) * twist;
          disp[i2].x -= (nx1 / nl1) * twist;
          disp[i2].y -= (ny1 / nl1) * twist;
        }
      }
    }

    // Apply with temperature cooling
    const cool = temp * (1 - iter / iterations);
    for (let i = 0; i < n; i += 1) {
      const d = Math.hypot(disp[i].x, disp[i].y) || 1;
      const limited = Math.min(d, Math.max(cool, 0.5));
      pts[i].x += (disp[i].x / d) * limited;
      pts[i].y += (disp[i].y / d) * limited;
    }
  }

  pts = fitToCanvas(pts, width, height, padding);

  // Preserve extra node fields (label, etc.)
  const byId = new Map(pts.map((p) => [p.id, p]));
  const nextNodes = nodes.map((n) => {
    const p = byId.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });

  const crossingsAfter = countEdgeCrossings(nextNodes, es);
  return { nodes: nextNodes, crossingsBefore, crossingsAfter };
}
