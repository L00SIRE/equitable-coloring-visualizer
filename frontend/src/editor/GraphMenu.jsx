import React, { useEffect, useRef, useState } from 'react';
import { Chevron, Download, Graph, Upload } from '../ui/icons';
import { circular, bipartiteColumns, forceLayout } from '../graph/layout';
import { deserialize, downloadJson, formatEdgeList, parseEdgeList, readFileAsText, serialize } from '../graph/io';

function Section({ title, children }) {
  return (
    <section className="border-t border-line px-3 py-3 first:border-t-0">
      <h3 className="label mb-2">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The Graph menu: presets, generated families, layouts, edge-list text and
 * JSON import/export. Every action replaces or rearranges the graph through
 * the editor, so a loaded run is cleared by the page as usual.
 */
export default function GraphMenu({ editor, presets = [], families = [], directedOption = false, hasKinds = false, exportMeta, onPreset, context }) {
  const [open, setOpen] = useState(false);
  const [famId, setFamId] = useState(families[0]?.id);
  const [values, setValues] = useState({});
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const g = editor.graph;

  useEffect(() => { if (open) setText(formatEdgeList(g)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { setMsg(''); }, [open]);

  const fam = families.find((f) => f.id === famId) ?? families[0];
  const paramVal = (p) => values[`${fam.id}.${p.key}`] ?? p.def;

  const generate = () => {
    const params = Object.fromEntries(fam.params.map((p) => [p.key, Number(paramVal(p))]));
    editor.loadGraph({ ...fam.make(params, Math.random, context), directed: false });
    setOpen(false);
  };

  const layout = (kind) => {
    const ids = g.nodes.map((n) => n.id);
    if (!ids.length) return;
    if (kind === 'circle') { editor.applyPositions(circular(ids)); setMsg('Arranged on a circle.'); return; }
    if (kind === 'columns') { editor.applyPositions(bipartiteColumns(g.nodes)); setMsg('Arranged in two columns.'); return; }
    const { positions, before, after } = forceLayout(g.nodes, g.edges);
    editor.applyPositions(positions);
    setMsg(after === 0 ? `Untangled: no edge crossings${before ? ` (was ${before})` : ''}.` : `Crossings ${before} → ${after}. The graph may not be planar.`);
  };

  const applyEdgeList = () => {
    try {
      const { ids, edges } = parseEdgeList(text, g.directed);
      const old = new Map(g.nodes.map((n) => [n.id, n]));
      const ring = circular(ids);
      const nodes = ids.map((id) => old.get(id) ?? { id, ...ring.get(id) });
      const base = { nodes, edges, directed: g.directed };
      const { positions } = forceLayout(nodes, edges);
      editor.loadGraph({ ...base, nodes: nodes.map((n) => (old.has(n.id) ? n : { ...n, ...positions.get(n.id) })) });
      setOpen(false);
    } catch (err) { setMsg(err.message); }
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { graph } = deserialize(await readFileAsText(file));
      editor.loadGraph(graph);
      setOpen(false);
    } catch (err) { setMsg(err.message); }
  };

  return (
    <div className="relative">
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label="Graph menu">
        <Graph /> <span className="hidden sm:inline">Graph</span> <Chevron className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-40 mt-1 max-h-[min(70vh,640px)] w-[320px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-lg" role="menu">
            {presets.length > 0 && (
              <Section title="Examples">
                <div className="flex flex-col gap-1">
                  {presets.map((p) => (
                    <button key={p.label} type="button" className="btn justify-start text-left" onClick={() => { editor.loadGraph(p.make()); onPreset?.(p); setOpen(false); }}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.label}</span>
                        {p.note && <span className="block truncate text-[11px] font-normal text-muted">{p.note}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {families.length > 0 && fam && (
              <Section title="Generate">
                <div className="flex flex-col gap-2">
                  <select className="field w-full" value={fam.id} onChange={(e) => setFamId(e.target.value)} aria-label="Graph family">
                    {families.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  {fam.params.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {fam.params.map((p) => (
                        <label key={p.key} className="flex items-center gap-1.5 text-[12px] text-muted">
                          {p.label}
                          <input type="number" className="field w-16" min={p.min} max={p.max} step={p.step} value={paramVal(p)}
                            onChange={(e) => setValues((v) => ({ ...v, [`${fam.id}.${p.key}`]: e.target.value }))} />
                        </label>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn btn-primary" onClick={generate}>Generate</button>
                </div>
              </Section>
            )}

            <Section title="Layout">
              <div className="flex flex-wrap gap-1">
                <button type="button" className="btn" onClick={() => layout('circle')}>Circle</button>
                <button type="button" className="btn" onClick={() => layout('force')} title="Force-directed layout that pushes crossing edges apart">Untangle</button>
                {hasKinds && <button type="button" className="btn" onClick={() => layout('columns')}>Two columns</button>}
              </div>
              {msg && <p className="mt-2 text-[12px] text-muted">{msg}</p>}
            </Section>

            {directedOption && (
              <Section title="Edges">
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={!!g.directed} onChange={(e) => editor.setDirected(e.target.checked)} />
                  Directed edges
                </label>
              </Section>
            )}

            <Section title="Edge list">
              <textarea className="field h-20 w-full resize-y font-mono text-[12px]" value={text} spellCheck={false}
                onChange={(e) => setText(e.target.value)} placeholder="0-1, 1-2, 2-0" aria-label="Edge list" />
              <button type="button" className="btn mt-2 w-full" onClick={applyEdgeList}>Replace graph with this list</button>
            </Section>

            <Section title="File">
              <div className="flex gap-1">
                <button type="button" className="btn flex-1" onClick={() => downloadJson(serialize(g, exportMeta), `graph-${g.nodes.length}v-${g.edges.length}e.json`)} disabled={!g.nodes.length}>
                  <Download /> Export
                </button>
                <button type="button" className="btn flex-1" onClick={() => fileRef.current?.click()}><Upload /> Import</button>
                <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importFile} />
              </div>
            </Section>

            <Section title="Graph">
              <button type="button" className="btn w-full text-bad" onClick={() => { editor.clear(); setOpen(false); }} disabled={!g.nodes.length}>Clear everything</button>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
