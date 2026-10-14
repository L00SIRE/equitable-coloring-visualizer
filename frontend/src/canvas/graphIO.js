/**
 * Graph serialization helpers (download / load JSON).
 *
 * Canonical shape:
 * {
 *   version: 1,
 *   app: "graph-theory-visualizer",
 *   width?, height?,
 *   nodes: [{ id, x, y, label? }],
 *   edges: [{ a, b }],
 *   meta?: object
 * }
 */

export const GRAPH_FILE_VERSION = 1;
export const GRAPH_FILE_APP = 'graph-theory-visualizer';

export function normalizeEdge(edge) {
  if (!edge || typeof edge !== 'object') return null;
  const u = edge.a ?? edge.from ?? edge.source ?? edge.u;
  const v = edge.b ?? edge.to ?? edge.target ?? edge.v;
  if (u == null || v == null || u === v) return null;
  // Keep comparable ordering for numeric ids; leave strings as min/max by locale.
  if (typeof u === 'number' && typeof v === 'number') {
    return { a: Math.min(u, v), b: Math.max(u, v) };
  }
  const as = String(u);
  const bs = String(v);
  return as <= bs ? { a: u, b: v } : { a: v, b: u };
}

export function normalizeEdges(edges = []) {
  const out = [];
  const seen = new Set();
  for (const raw of edges) {
    const e = normalizeEdge(raw);
    if (!e) continue;
    const key = `${e.a}|${e.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function buildGraphPayload({
  nodes,
  edges,
  width,
  height,
  meta,
  page,
} = {}) {
  return {
    version: GRAPH_FILE_VERSION,
    app: GRAPH_FILE_APP,
    page: page || undefined,
    width: width || undefined,
    height: height || undefined,
    nodes: (nodes || []).map((n) => ({
      id: n.id,
      x: Number(n.x),
      y: Number(n.y),
      ...(n.label != null ? { label: n.label } : {}),
    })),
    edges: normalizeEdges(edges),
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
}

export function parseGraphPayload(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') throw new Error('Invalid graph file.');
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Graph file must include nodes[] and edges[].');
  }

  const nodes = data.nodes.map((n, i) => {
    if (n == null || n.id == null) throw new Error(`Node at index ${i} is missing id.`);
    return {
      id: n.id,
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      ...(n.label != null ? { label: n.label } : {}),
    };
  });

  const idSet = new Set(nodes.map((n) => n.id));
  const edges = normalizeEdges(data.edges).filter((e) => idSet.has(e.a) && idSet.has(e.b));

  return {
    version: data.version ?? GRAPH_FILE_VERSION,
    page: data.page,
    width: data.width,
    height: data.height,
    nodes,
    edges,
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
  };
}

export function downloadGraphJson(payload, filename = 'graph.json') {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readGraphFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseGraphPayload(String(reader.result || '')));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/** Map canonical edges to page-local {from,to} (optional id). */
export function toFromToEdges(edges, { withIds = false } = {}) {
  return edges.map((e, i) => {
    const base = { from: e.a, to: e.b };
    return withIds ? { id: i + 1, ...base } : base;
  });
}
