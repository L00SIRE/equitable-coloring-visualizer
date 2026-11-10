import { useCallback, useMemo, useRef, useState } from 'react';
import { cleanEdges, edgeKey, keyOf, nextNodeId, removeEdges, removeNodes } from '../graph/model';

const HISTORY_LIMIT = 100;
const EMPTY_SEL = { nodes: new Set(), edges: new Set() };

/**
 * All graph editing state for a page: the graph, the selection, the active tool
 * and undo/redo. Structural edits are recorded in history; dragging records one
 * entry per drag (call beginMove before the first moveNodes).
 *
 *   options.canConnect(graph, a, b) → boolean   extra rule for new edges (e.g. Hall: A–B only)
 *   options.newKind                 → kind given to new vertices (e.g. 'A' / 'B')
 */
export default function useGraphEditor(initial, options = {}) {
  const [graph, setGraphState] = useState(initial);
  const [selection, setSelectionState] = useState(EMPTY_SEL);
  const [tool, setTool] = useState('select');
  const [fitVersion, setFitVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [, setHistVersion] = useState(0);

  /* Refs hold the live values so handlers never read stale state and no state
     updater has side effects (StrictMode runs updaters twice). */
  const graphRef = useRef(initial);
  const selRef = useRef(EMPTY_SEL);
  const histRef = useRef({ past: [], future: [] });
  const optRef = useRef(options);
  optRef.current = options;

  const say = useCallback((msg) => setNotice(msg), []);
  const bumpHist = useCallback(() => setHistVersion((v) => v + 1), []);

  const setGraph = useCallback((g) => { graphRef.current = g; setGraphState(g); }, []);
  const select = useCallback((sel) => { selRef.current = sel; setSelectionState(sel); }, []);

  const record = useCallback(() => {
    const h = histRef.current;
    histRef.current = { past: [...h.past, graphRef.current].slice(-HISTORY_LIMIT), future: [] };
    bumpHist();
  }, [bumpHist]);

  /** Replace the whole graph (preset, import, generator). Resets history and refits the view. */
  const loadGraph = useCallback((g) => {
    setGraph(g);
    histRef.current = { past: [], future: [] };
    bumpHist();
    select(EMPTY_SEL);
    setFitVersion((v) => v + 1);
    setNotice('');
  }, [setGraph, select, bumpHist]);

  /** Apply a recorded structural change. */
  const edit = useCallback((fn) => {
    const next = fn(graphRef.current);
    if (!next || next === graphRef.current) return;
    record();
    setGraph(next);
  }, [record, setGraph]);

  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h.past.length) return;
    const prev = h.past[h.past.length - 1];
    histRef.current = { past: h.past.slice(0, -1), future: [graphRef.current, ...h.future] };
    setGraph(prev);
    select(EMPTY_SEL);
    bumpHist();
  }, [setGraph, select, bumpHist]);

  const redo = useCallback(() => {
    const h = histRef.current;
    if (!h.future.length) return;
    const [next, ...rest] = h.future;
    histRef.current = { past: [...h.past, graphRef.current], future: rest };
    setGraph(next);
    select(EMPTY_SEL);
    bumpHist();
  }, [setGraph, select, bumpHist]);

  const addNode = useCallback((x, y) => {
    const id = nextNodeId(graphRef.current.nodes);
    const kind = optRef.current.newKind;
    edit((g) => ({ ...g, nodes: [...g.nodes, { id, x, y, ...(kind ? { kind } : {}) }] }));
    select({ nodes: new Set([id]), edges: new Set() });
    return id;
  }, [edit, select]);

  const addEdge = useCallback((a, b) => {
    const g = graphRef.current;
    if (a === b) { say('A vertex cannot be joined to itself.'); return false; }
    if (g.edges.some((e) => keyOf(e, g.directed) === edgeKey(a, b, g.directed))) { say(`The edge ${a}–${b} already exists.`); return false; }
    const rule = optRef.current.canConnect;
    if (rule && !rule(g, a, b)) { say(optRef.current.connectHint || 'These two vertices cannot be joined.'); return false; }
    edit((gr) => ({ ...gr, edges: [...gr.edges, { a, b }] }));
    say('');
    return true;
  }, [edit, say]);

  const deleteSelection = useCallback(() => {
    const sel = selRef.current;
    if (!sel.nodes.size && !sel.edges.size) return;
    edit((g) => removeEdges(removeNodes(g, [...sel.nodes]), [...sel.edges]));
    select(EMPTY_SEL);
  }, [edit, select]);

  const beginMove = useCallback(() => record(), [record]);

  /** Move vertices to absolute positions: Map(id → {x,y}). Not recorded; call beginMove first. */
  const moveNodes = useCallback((positions) => {
    const g = graphRef.current;
    setGraph({ ...g, nodes: g.nodes.map((n) => (positions.has(n.id) ? { ...n, ...positions.get(n.id) } : n)) });
  }, [setGraph]);

  /** Positions from a layout, recorded as one undoable step. */
  const applyPositions = useCallback((positions) => {
    edit((g) => ({ ...g, nodes: g.nodes.map((n) => (positions.has(n.id) ? { ...n, ...positions.get(n.id) } : n)) }));
    setFitVersion((v) => v + 1);
  }, [edit]);

  const setDirected = useCallback((directed) => {
    edit((g) => (g.directed === directed ? g : { ...g, directed, edges: cleanEdges(g.nodes, g.edges, directed) }));
  }, [edit]);

  const setNodeKind = useCallback((ids, kind) => {
    const set = new Set(ids);
    edit((g) => ({ ...g, nodes: g.nodes.map((n) => (set.has(n.id) ? { ...n, kind } : n)) }));
  }, [edit]);

  const clear = useCallback(() => {
    edit((g) => ({ ...g, nodes: [], edges: [] }));
    select(EMPTY_SEL);
    setFitVersion((v) => v + 1);
  }, [edit, select]);

  const selectAll = useCallback(() => {
    select({ nodes: new Set(graphRef.current.nodes.map((n) => n.id)), edges: new Set() });
  }, [select]);
  const clearSelection = useCallback(() => select(EMPTY_SEL), [select]);
  const requestFit = useCallback(() => setFitVersion((v) => v + 1), []);

  const { past, future } = histRef.current;
  return useMemo(() => ({
    graph, selection, tool, setTool, fitVersion, notice, say,
    canUndo: past.length > 0, canRedo: future.length > 0,
    loadGraph, edit, undo, redo, addNode, addEdge, deleteSelection,
    beginMove, moveNodes, applyPositions, setDirected, setNodeKind, clear,
    select, selectAll, clearSelection, requestFit,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [graph, selection, tool, fitVersion, notice, past, future, say, loadGraph, edit, undo, redo, addNode, addEdge,
    deleteSelection, beginMove, moveNodes, applyPositions, setDirected, setNodeKind, clear, select, selectAll, clearSelection, requestFit]);
}
