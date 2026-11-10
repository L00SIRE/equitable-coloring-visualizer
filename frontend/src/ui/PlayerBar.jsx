import React from 'react';
import { Pause, Play, StepBack, StepNext, ToEnd, ToStart } from './icons';
import { SPEEDS } from '../editor/usePlayer';

function Btn({ label, onClick, disabled, children, primary }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`btn btn-icon ${primary ? 'btn-primary' : ''}`}>
      {children}
    </button>
  );
}

export default function PlayerBar({ player, hasRun, onRun, canRun, onStop }) {
  if (!hasRun) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-3 py-2">
        <button type="button" className="btn btn-primary" onClick={onRun} disabled={!canRun}><Play /> Run</button>
        <p className="text-[12px] text-muted">Set up a graph, then run the algorithm to step through it.</p>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-1" role="group" aria-label="Playback">
        <Btn label="First step (Home)" onClick={player.first} disabled={player.atStart}><ToStart /></Btn>
        <Btn label="Previous step (←)" onClick={player.prev} disabled={player.atStart}><StepBack /></Btn>
        <Btn label={player.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={player.toggle} primary>
          {player.playing ? <Pause /> : <Play />}
        </Btn>
        <Btn label="Next step (→)" onClick={player.next} disabled={player.atEnd}><StepNext /></Btn>
        <Btn label="Last step (End)" onClick={player.lastStep} disabled={player.atEnd}><ToEnd /></Btn>
      </div>
      <input type="range" min={0} max={Math.max(0, player.count - 1)} value={player.index}
        onChange={(e) => player.goto(Number(e.target.value))} className="min-w-[120px] flex-1 accent-[rgb(var(--accent))]"
        aria-label="Step" />
      <span className="w-20 text-right font-mono text-[12px] text-muted" aria-live="polite">
        {player.index + 1} / {player.count}
      </span>
      <select className="field" value={player.speed} onChange={(e) => player.setSpeed(Number(e.target.value))} aria-label="Playback speed">
        {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
      </select>
      <button type="button" className="btn sm:hidden" onClick={onStop}>Edit graph</button>
    </div>
  );
}
