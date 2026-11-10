import React, { useCallback, useEffect, useRef, useState } from 'react';
import GraphCanvas from './GraphCanvas';
import GraphMenu from './GraphMenu';
import { Cursor, Edge, Fit, Hand, Minus, Plus, Redo, Trash, Undo, Vertex } from '../ui/icons';

const TOOLS = [
  { id: 'select', label: 'Select', key: 'V', Icon: Cursor, edits: false, hint: 'Click or drag vertices. Drag empty space to box-select, shift to add. Delete removes.' },
  { id: 'vertex', label: 'Vertex', key: 'N', Icon: Vertex, edits: true, hint: 'Click empty space to place a vertex.' },
  { id: 'edge', label: 'Edge', key: 'E', Icon: Edge, edits: true, hint: 'Drag from one vertex to another, or click one and then the other. Esc cancels.' },
  { id: 'pan', label: 'Hand', key: 'H', Icon: Hand, edits: false, hint: 'Drag to move the view. Scroll to zoom.' },
];

const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

function IconButton({ label, shortcut, active, disabled, onClick, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`btn btn-icon ${active ? 'border-accent bg-accent/10 text-accent' : ''}`}>
      {children}
    </button>
  );
}

/**
 * Canvas plus its chrome: tool palette, undo/redo, Graph menu, zoom controls,
 * keyboard shortcuts and the "run loaded" banner.
 */
export default function GraphEditor({
  editor, visuals, locked, extraPoints, onStopRun, menu, kinds, newKind, onNewKind,
}) {
  const canvas = useRef(null);
  const [zoom, setZoom] = useState(1);
  const { tool, setTool } = editor;

  /* a locked canvas can only select and pan */
  useEffect(() => { if (locked && (tool === 'vertex' || tool === 'edge')) setTool('select'); }, [locked, tool, setTool]);

  const zoomIn = useCallback(() => canvas.current?.zoomBy(1.25), []);
  const zoomOut = useCallback(() => canvas.current?.zoomBy(0.8), []);

  useEffect(() => {
    const onKey = (e) => {
      if (typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (!locked) (e.shiftKey ? editor.redo() : editor.undo()); return; }
      if (mod && k === 'y') { e.preventDefault(); if (!locked) editor.redo(); return; }
      if (mod && k === 'a') { e.preventDefault(); editor.selectAll(); return; }
      if (mod || e.altKey) return;
      if (k === 'v') setTool('select');
      else if (k === 'h') setTool('pan');
      else if (k === 'n' && !locked) setTool('vertex');
      else if (k === 'e' && !locked) setTool('edge');
      else if (k === 'f') editor.requestFit();
      else if (k === '+' || k === '=') zoomIn();
      else if (k === '-' || k === '_') zoomOut();
      else if ((k === 'delete' || k === 'backspace') && !locked) { e.preventDefault(); editor.deleteSelection(); }
      else if (k === 'escape') editor.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, locked, setTool, zoomIn, zoomOut]);

  const active = TOOLS.find((t) => t.id === tool);
  const hasSel = editor.selection.nodes.size + editor.selection.edges.size > 0;

  return (
    <div className="relative h-full w-full">
      <GraphCanvas ref={canvas} editor={editor} visuals={visuals} locked={locked} extraPoints={extraPoints} onZoom={setZoom} />

      {/* top-left: tools */}
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface/95 p-1 shadow-sm backdrop-blur" role="toolbar" aria-label="Tools">
        {TOOLS.filter((t) => !(locked && t.edits)).map(({ id, label, key, Icon }) => (
          <IconButton key={id} label={label} shortcut={key} active={tool === id} onClick={() => setTool(id)}>
            <Icon />
          </IconButton>
        ))}
        {!locked && (
          <>
            <span className="mx-0.5 h-5 w-px bg-line" />
            <IconButton label="Undo" shortcut="Ctrl+Z" disabled={!editor.canUndo} onClick={editor.undo}><Undo /></IconButton>
            <IconButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!editor.canRedo} onClick={editor.redo}><Redo /></IconButton>
            <IconButton label="Delete selection" shortcut="Del" disabled={!hasSel} onClick={editor.deleteSelection}><Trash /></IconButton>
          </>
        )}
      </div>

      {/* top-right: Graph menu */}
      <div className="absolute right-2 top-2"><GraphMenu editor={editor} {...menu} /></div>

      {kinds && !locked && (
        <div className="absolute left-2 top-[52px] flex items-center gap-2 rounded-lg border border-line bg-surface/95 px-2 py-1 text-[12px] shadow-sm backdrop-blur">
          <span className="text-muted">New vertex joins</span>
          {kinds.map((k) => (
            <button key={k.key} type="button" onClick={() => onNewKind(k.key)} aria-pressed={newKind === k.key}
              className={`rounded px-1.5 py-0.5 font-medium ${newKind === k.key ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-surface-2'}`}>
              {k.label}
            </button>
          ))}
        </div>
      )}

      {locked && (
        <div className="absolute left-2 top-[52px] hidden max-w-[calc(100%-1rem)] flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[12px] shadow-sm sm:flex">
          <span className="text-muted">A run is loaded, so editing is paused.</span>
          <button type="button" className="btn px-2 py-0.5 text-[12px]" onClick={onStopRun}>Stop run and edit</button>
        </div>
      )}

      {/* bottom-left: hint / notice */}
      <div className="pointer-events-none absolute bottom-2 left-2 hidden max-w-[60%] text-[12px] sm:block">
        {editor.notice
          ? <p className="rounded-md border border-bad/30 bg-surface/95 px-2 py-1 text-bad shadow-sm">{editor.notice}</p>
          : <p className="rounded-md bg-surface/80 px-2 py-1 text-muted backdrop-blur">{active?.hint}</p>}
      </div>

      {/* bottom-right: zoom */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg border border-line bg-surface/95 p-1 shadow-sm backdrop-blur">
        <IconButton label="Zoom out" shortcut="−" onClick={zoomOut}><Minus /></IconButton>
        <span className="w-11 text-center font-mono text-[12px] text-muted" aria-live="off">{Math.round(zoom * 100)}%</span>
        <IconButton label="Zoom in" shortcut="+" onClick={zoomIn}><Plus /></IconButton>
        <IconButton label="Fit graph to view" shortcut="F" onClick={editor.requestFit}><Fit /></IconButton>
      </div>
    </div>
  );
}
