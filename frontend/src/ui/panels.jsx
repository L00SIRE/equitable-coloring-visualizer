import React from 'react';

export function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`border-b border-line px-4 py-3 ${className}`}>
      {(title || aside) && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          {title && <h2 className="label">{title}</h2>}
          {aside && <span className="text-[11px] text-muted">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  neutral: 'border-line-strong text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  bad: 'border-bad/40 bg-bad/10 text-bad',
  violet: 'border-violet/40 bg-violet/10 text-violet',
};

export function Chip({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-px text-[11px] font-semibold leading-4 ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Key/value rows for algorithm state. */
export function Facts({ rows }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
      {rows.filter(Boolean).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words font-mono text-[12px]">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function Swatch({ color, ring, dashed, round = true }) {
  return (
    <span className={`inline-block h-3 w-3 shrink-0 ${round ? 'rounded-full' : 'rounded-sm'}`}
      style={{ background: color ?? 'transparent', border: `2px ${dashed ? 'dashed' : 'solid'} ${ring ?? 'rgb(var(--line-strong))'}` }} />
  );
}

export function Legend({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.line
            ? <span className="inline-block h-0.5 w-4" style={{ background: it.line, height: it.thick ? 3 : 2 }} />
            : <Swatch color={it.fill} ring={it.ring} dashed={it.dashed} />}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function Pseudocode({ lines, active }) {
  if (!lines?.length) return null;
  return (
    <ol className="rounded-md border border-line bg-surface-2 py-1.5 font-mono text-[12px] leading-[1.35rem]">
      {lines.map((text, i) => (
        <li key={i}
          className={`flex gap-2 px-2 ${i === active ? 'bg-accent/15 text-ink' : 'text-muted'}`}
          aria-current={i === active ? 'step' : undefined}>
          <span className="w-4 shrink-0 select-none text-right text-[10px] leading-[1.35rem] opacity-60">{i + 1}</span>
          <span className={`min-w-0 whitespace-pre-wrap break-words ${i === active ? 'font-medium' : ''}`}>{text}</span>
        </li>
      ))}
    </ol>
  );
}

/** A row of vertices, e.g. a queue or stack. `end` labels the open end. */
export function Tokens({ items, empty = 'empty', render, label }) {
  return (
    <div>
      {label && <div className="mb-1 text-[11px] text-muted">{label}</div>}
      {items.length === 0
        ? <span className="text-[12px] italic text-muted">{empty}</span>
        : (
          <div className="flex flex-wrap gap-1">
            {items.map((it, i) => (
              <span key={`${it}-${i}`} className="inline-flex min-w-[1.75rem] items-center justify-center rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[12px]">
                {render ? render(it) : it}
              </span>
            ))}
          </div>
        )}
    </div>
  );
}

export function Callout({ tone = 'neutral', title, children }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-[13px] ${TONES[tone]} ${tone === 'neutral' ? 'bg-surface-2' : ''}`}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-ink">{children}</div>
    </div>
  );
}
