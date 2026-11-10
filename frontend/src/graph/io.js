import { cleanEdges, edgeKey } from './model';

export const FILE_VERSION = 2;

export function serialize(graph, meta) {
  return {
    version: FILE_VERSION,
    directed: !!graph.directed,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      ...(n.kind != null ? { kind: n.kind } : {}),
      ...(n.label != null ? { label: n.label } : {}),
    })),
    edges: graph.edges.map(({ a, b }) => ({ a, b })),
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
}

/** Accepts our own files and the older {from,to} / {a,b} files. */
export function deserialize(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Not a graph file: it needs "nodes" and "edges" arrays.');
  }
  const nodes = data.nodes.map((n, i) => {
    if (n == null || !Number.isInteger(Number(n.id))) throw new Error(`Vertex ${i} has no integer id.`);
    return {
      id: Number(n.id),
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      ...(n.kind != null ? { kind: n.kind } : {}),
      ...(n.label != null ? { label: n.label } : {}),
    };
  });
  const directed = !!data.directed;
  const pairs = data.edges.map((e) => ({
    a: Number(e.a ?? e.from ?? e.source ?? e.u),
    b: Number(e.b ?? e.to ?? e.target ?? e.v),
  }));
  return {
    graph: { nodes, edges: cleanEdges(nodes, pairs, directed), directed },
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
  };
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file selected.')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

/* ── edge-list text: "0-1, 1-2" / "0 1" / one pair per line, '#' comments ── */

export function parseEdgeList(text, directed = false) {
  const pairs = [];
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, ''));
  for (const line of lines) {
    for (const tok of line.split(/[,;]+/).map((t) => t.trim()).filter(Boolean)) {
      const m = tok.match(/^(\d+)\s*(?:->|-|:|\s)\s*(\d+)$/);
      if (!m) throw new Error(`Cannot read "${tok}". Use pairs like 0-1, 1-2.`);
      pairs.push([Number(m[1]), Number(m[2])]);
    }
  }
  const ids = [...new Set(pairs.flat())].sort((x, y) => x - y);
  const seen = new Set();
  const edges = [];
  for (const [a, b] of pairs) {
    if (a === b) continue;
    const k = edgeKey(a, b, directed);
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push({ a, b });
  }
  return { ids, edges };
}

export function formatEdgeList(graph) {
  return graph.edges.map((e) => `${e.a}${graph.directed ? '->' : '-'}${e.b}`).join(', ');
}
