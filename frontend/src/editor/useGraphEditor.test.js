import { act, renderHook } from '@testing-library/react';
import useGraphEditor from './useGraphEditor';
import { edgeKey } from '../graph/model';

const tri = () => ({
  nodes: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 100, y: 0 }, { id: 2, x: 50, y: 80 }],
  edges: [{ a: 0, b: 1 }],
  directed: false,
});
const setup = (opts) => renderHook(() => useGraphEditor(tri(), opts));

describe('useGraphEditor', () => {
  test('addNode picks the next id, selects it, and undo/redo round-trips', () => {
    const { result } = setup();
    act(() => { result.current.addNode(10, 20); });
    expect(result.current.graph.nodes.map((n) => n.id)).toEqual([0, 1, 2, 3]);
    expect([...result.current.selection.nodes]).toEqual([3]);
    act(() => result.current.undo());
    expect(result.current.graph.nodes).toHaveLength(3);
    act(() => result.current.redo());
    expect(result.current.graph.nodes).toHaveLength(4);
  });

  test('edges: no loops, no duplicates in either direction, custom rule with a hint', () => {
    const { result } = setup({ canConnect: (g, a, b) => !(a === 1 && b === 2), connectHint: 'not allowed' });
    let ok;
    act(() => { ok = result.current.addEdge(1, 1); });
    expect(ok).toBe(false);
    act(() => { ok = result.current.addEdge(1, 0); });          // reverse of an existing edge
    expect(ok).toBe(false);
    expect(result.current.notice).toMatch(/already exists/);
    act(() => { ok = result.current.addEdge(1, 2); });
    expect(ok).toBe(false);
    expect(result.current.notice).toBe('not allowed');
    act(() => { ok = result.current.addEdge(0, 2); });
    expect(ok).toBe(true);
    expect(result.current.graph.edges).toHaveLength(2);
    expect(result.current.notice).toBe('');
  });

  test('deleting a selection removes incident edges and one undo restores everything', () => {
    const { result } = setup();
    act(() => { result.current.addEdge(1, 2); });
    act(() => { result.current.select({ nodes: new Set([1]), edges: new Set() }); });
    act(() => result.current.deleteSelection());
    expect(result.current.graph.nodes.map((n) => n.id)).toEqual([0, 2]);
    expect(result.current.graph.edges).toHaveLength(0);
    act(() => result.current.undo());
    expect(result.current.graph.nodes).toHaveLength(3);
    expect(result.current.graph.edges).toHaveLength(2);
  });

  test('a drag is a single undo step', () => {
    const { result } = setup();
    act(() => result.current.beginMove());
    act(() => result.current.moveNodes(new Map([[0, { x: 5, y: 5 }]])));
    act(() => result.current.moveNodes(new Map([[0, { x: 9, y: 9 }]])));
    expect(result.current.graph.nodes[0]).toMatchObject({ x: 9, y: 9 });
    act(() => result.current.undo());
    expect(result.current.graph.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.current.canUndo).toBe(false);
  });

  test('loadGraph replaces the graph, clears history and asks for a refit', () => {
    const { result } = setup();
    const v0 = result.current.fitVersion;
    act(() => { result.current.addNode(1, 1); });
    act(() => result.current.loadGraph({ nodes: [{ id: 7, x: 0, y: 0 }], edges: [], directed: false }));
    expect(result.current.graph.nodes).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.fitVersion).toBe(v0 + 1);
  });

  test('new vertices take the current kind', () => {
    const { result } = setup({ newKind: 'B' });
    act(() => { result.current.addNode(0, 0); });
    expect(result.current.graph.nodes.at(-1).kind).toBe('B');
  });

  test('switching to undirected merges opposite arcs', () => {
    const { result } = renderHook(() => useGraphEditor({
      nodes: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 1, y: 1 }],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 0 }],
      directed: true,
    }));
    act(() => result.current.setDirected(false));
    expect(result.current.graph.directed).toBe(false);
    expect(result.current.graph.edges.map((e) => edgeKey(e.a, e.b))).toEqual(['0-1']);
  });
});
