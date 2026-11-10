import React from 'react';

export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/** Vertex picker with a shortcut that takes the currently selected vertex. */
export function VertexSelect({ label, value, onChange, graph, selection, allowNone = false, hint }) {
  const ids = graph.nodes.map((n) => n.id).sort((a, b) => a - b);
  const selected = selection?.nodes?.size === 1 ? [...selection.nodes][0] : null;
  return (
    <Field label={label} hint={hint}>
      <span className="flex gap-1">
        <select className="field min-w-0 flex-1" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
          {allowNone && <option value="">none</option>}
          {ids.map((id) => <option key={id} value={id}>{graph.nodes.find((n) => n.id === id)?.label ?? id}{graph.nodes.find((n) => n.id === id)?.label ? ` (${id})` : ''}</option>)}
        </select>
        <button type="button" className="btn" disabled={selected == null} onClick={() => onChange(selected)}
          title="Use the vertex currently selected on the canvas">Use selected</button>
      </span>
    </Field>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children, title }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px]" title={title}>
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
