import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GraphEditor from '../editor/GraphEditor';
import useGraphEditor from '../editor/useGraphEditor';
import usePlayer from '../editor/usePlayer';
import { structureSignature } from '../graph/model';
import PlayerBar from './PlayerBar';
import { Callout, Chip, Legend, Pseudocode, Section } from './panels';
import { Play } from './icons';

const shallowEqual = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

const isFormTarget = (t) => t && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.isContentEditable);

const KIND_TONE = {
  conflict: 'bad', fail: 'bad', error: 'bad', deadend: 'bad', unmatched: 'bad', notfound: 'bad',
  done: 'ok', found: 'ok', matched: 'ok', augment: 'ok',
  discover: 'accent', color: 'accent', assign: 'accent',
  invert: 'violet', rotate: 'violet', fan: 'violet', choose: 'violet',
  blocked: 'warn', backtrack: 'warn', improper: 'bad', stage: 'ok', move: 'warn', aux: 'violet', shift: 'violet',
  solo: 'accent', case1: 'ok', case2: 'warn',
};

/**
 * One page = one `algo` config (see pages/*.jsx). The workbench owns the graph
 * editor, the run lifecycle and the layout; the config supplies the parameters,
 * the algorithm and how a step is drawn and explained.
 */
export default function Workbench({ algo }) {
  const [params, setParams] = useState(algo.defaultParams ?? {});
  const [newKind, setNewKind] = useState(algo.nodeKinds?.[0]?.key);
  const [initial] = useState(() => algo.initialGraph());
  const editor = useGraphEditor(initial, { canConnect: algo.canConnect, connectHint: algo.connectHint, newKind });
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const graph = editor.graph;

  const sig = useMemo(() => structureSignature(graph), [graph]);

  const runWith = useCallback((p, g) => {
    const res = algo.compute(g, p);
    if (res.error) { setError(res.error); setRun(null); return; }
    setError('');
    setRun({ steps: res.steps, summary: res.summary, sig: structureSignature(g) });
  }, [algo]);

  /* a structural edit ends the run; moving a vertex does not */
  useEffect(() => { setRun((r) => (r && r.sig !== sig ? null : r)); }, [sig]);
  useEffect(() => { setError(''); }, [sig]);

  /* keep parameters valid when vertices come and go (e.g. the source vertex was deleted) */
  useEffect(() => {
    if (!algo.normalizeParams) return;
    setParams((p) => { const n = algo.normalizeParams(p, graph); return shallowEqual(n, p) ? p : n; });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateParams = (patch) => {
    const next = { ...params, ...patch };
    setParams(next);
    if (run) runWith(next, graph);
  };

  const player = usePlayer(run ? run.steps : null);
  const step = run ? player.step : null;

  useEffect(() => {
    if (!run) return undefined;
    const onKey = (e) => {
      if (isFormTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player.prev(); }
      else if (e.key === 'Home') { e.preventDefault(); player.first(); }
      else if (e.key === 'End') { e.preventDefault(); player.lastStep(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, player]);

  const visuals = step
    ? algo.visualize(step, graph, params, run.summary)
    : (algo.idle ? algo.idle(graph, params, editor.selection) : {});

  const canRun = graph.nodes.length > 0;
  const doRun = () => runWith(params, graph);
  const stopRun = () => { setRun(null); };
  const { Params, Panels, Result } = algo;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* canvas column */}
      <div className="flex h-[74vh] min-h-[440px] min-w-0 flex-1 flex-col lg:h-auto lg:min-h-0">
        <div className="relative min-h-0 flex-1">
          <GraphEditor
            editor={editor}
            visuals={visuals}
            locked={!!run}
            extraPoints={visuals.extraPoints}
            onStopRun={stopRun}
            kinds={algo.nodeKinds}
            newKind={newKind}
            onNewKind={setNewKind}
            menu={{
              presets: algo.presets, families: algo.families, directedOption: algo.directedOption,
              hasKinds: !!algo.nodeKinds, exportMeta: { algorithm: algo.id },
              context: params,
              onPreset: (p) => { if (p.params) setParams((prev) => ({ ...prev, ...p.params })); },
            }}
          />
        </div>
        <PlayerBar player={player} hasRun={!!run} onRun={doRun} canRun={canRun} onStop={stopRun} />
      </div>

      {/* inspector */}
      <aside className="w-full shrink-0 border-t border-line bg-surface lg:w-[340px] lg:overflow-y-auto xl:w-[390px] lg:border-l lg:border-t-0" aria-label="Inspector">
        <header className="border-b border-line px-4 py-3">
          <h1 className="text-[17px] font-semibold leading-snug tracking-tight">{algo.title}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{algo.tagline}</p>
        </header>

        <Section title="Setup">
          <div className="flex flex-col gap-3">
            {Params && <Params params={params} update={updateParams} graph={graph} selection={editor.selection} running={!!run} editor={editor} />}
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={doRun} disabled={!canRun}>
                <Play /> {run ? 'Run again' : 'Run'}
              </button>
              {run && <button type="button" className="btn" onClick={stopRun}>Stop</button>}
              <span className="ml-auto font-mono text-[11px] text-muted">{graph.nodes.length} vertices · {graph.edges.length} edges</span>
            </div>
            {error && <Callout tone="bad">{error}</Callout>}
            {algo.assumption && !run && <p className="text-[12px] text-muted">{algo.assumption(graph, params)}</p>}
          </div>
        </Section>

        {run && step && (
          <>
            <Section title="This step" aside={`${player.index + 1} of ${player.count}`}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={KIND_TONE[step.kind] ?? 'neutral'}>{(algo.kindLabels?.[step.kind] ?? step.kind).toUpperCase()}</Chip>
                  {step.ref && <Chip>{step.ref}</Chip>}
                  {step.levelLabel && <Chip tone="accent">{step.levelLabel}</Chip>}
                </div>
                <p className="text-[14px] leading-relaxed" aria-live="polite">{step.message}</p>
                <Legend items={algo.legend} />
              </div>
            </Section>
            {player.atEnd && Result && (
              <Section title="Result"><Result summary={run.summary} step={step} graph={graph} params={params} /></Section>
            )}
            {Panels && <Section title="State"><Panels step={step} summary={run.summary} graph={graph} params={params} player={player} /></Section>}
            {algo.pseudocode && <Section title="Pseudocode"><Pseudocode lines={algo.pseudocode} active={step.line} /></Section>}
            {algo.timeline && (
              <Section title="All steps">
                <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {run.steps.map((s, i) => (
                    <button key={i} type="button" onClick={() => player.goto(i)} title={s.message}
                      className={`h-6 min-w-[1.6rem] rounded border px-1 font-mono text-[11px] ${i === player.index ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong text-muted hover:bg-surface-2'}`}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {!run && algo.legend && <Section title="Key"><Legend items={algo.legend} /></Section>}

        {algo.About && (
          <details className="border-b border-line px-4 py-3 text-[13px]" open={!run}>
            <summary className="label cursor-pointer select-none">About this algorithm</summary>
            <div className="mt-2 space-y-2 leading-relaxed text-ink [&_a]:text-accent [&_a]:underline [&_code]:font-mono [&_code]:text-[12px] [&_p]:text-[13px]">
              <algo.About />
            </div>
          </details>
        )}
      </aside>
    </div>
  );
}
