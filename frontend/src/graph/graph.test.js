import { adjacency, cleanEdges, components, degrees, edgeKey, maxDegree, structureSignature, removeNodes } from './model';
import { deserialize, serialize, parseEdgeList, formatEdgeList } from './io';
import * as gen from './generators';
import { forceLayout, countCrossings } from './layout';
import { SAMPLE_1, SAMPLE_2, MAP_DEMO } from './samples';

const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

describe('model', () => {
  test('undirected keys ignore direction, directed keys do not', () => {
    expect(edgeKey(3, 1)).toBe(edgeKey(1, 3));
    expect(edgeKey(3, 1, true)).not.toBe(edgeKey(1, 3, true));
  });
  test('cleanEdges removes loops, duplicates and unknown ends', () => {
    const nodes = [{ id: 0 }, { id: 1 }, { id: 2 }];
    const out = cleanEdges(nodes, [{ a: 0, b: 1 }, { a: 1, b: 0 }, { a: 2, b: 2 }, { a: 0, b: 9 }]);
    expect(out).toEqual([{ a: 0, b: 1 }]);
  });
  test('adjacency, degrees, components', () => {
    const g = { nodes: [0, 1, 2, 3].map((id) => ({ id })), edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }], directed: false };
    expect(adjacency(g).get(1)).toEqual([0, 2]);
    expect(degrees(g).get(3)).toBe(0);
    expect(maxDegree(g)).toBe(2);
    expect(components(g)).toEqual([[0, 1, 2], [3]]);
  });
  test('structure signature ignores positions', () => {
    const g = gen.cycle(4);
    const moved = { ...g, nodes: g.nodes.map((n) => ({ ...n, x: n.x + 5 })) };
    expect(structureSignature(moved)).toBe(structureSignature(g));
    expect(structureSignature(removeNodes(g, [0]))).not.toBe(structureSignature(g));
  });
});

describe('io', () => {
  test('serialize / deserialize round trip', () => {
    const g = gen.completeBipartite(2, 3);
    const { graph } = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(graph.edges).toEqual(g.edges);
    expect(graph.nodes.map((n) => n.kind)).toEqual(['A', 'A', 'B', 'B', 'B']);
  });
  test('reads the old {from,to} format and rejects junk', () => {
    const { graph } = deserialize({ nodes: [{ id: 0 }, { id: 1 }], edges: [{ from: 0, to: 1 }] });
    expect(graph.edges).toEqual([{ a: 0, b: 1 }]);
    expect(() => deserialize({ nodes: 3 })).toThrow();
  });
  test('edge lists parse and format', () => {
    const { ids, edges } = parseEdgeList('0-1, 1-2\n2 3 # comment\n3:0');
    expect(ids).toEqual([0, 1, 2, 3]);
    expect(edges).toHaveLength(4);
    expect(formatEdgeList({ edges, directed: false })).toBe('0-1, 1-2, 2-3, 3-0');
    expect(() => parseEdgeList('a-b')).toThrow(/Cannot read/);
  });
});

describe('generators and samples', () => {
  test('families have the right size', () => {
    expect(gen.complete(5).edges).toHaveLength(10);
    expect(gen.cycle(7).edges).toHaveLength(7);
    expect(gen.grid(3, 4).edges).toHaveLength(17);
    expect(gen.petersen().edges).toHaveLength(15);
    expect(gen.wheel(5).edges).toHaveLength(10);
    expect(maxDegree(gen.petersen())).toBe(3);
  });
  test('randomBounded respects the degree cap', () => {
    for (let s = 1; s <= 30; s++) {
      const g = gen.randomBounded(12, 3, 18, rng(s));
      expect(maxDegree(g)).toBeLessThanOrEqual(3);
    }
  });
  test('samples keep their documented degree', () => {
    expect(maxDegree(SAMPLE_1)).toBe(3);
    expect(SAMPLE_1.edges).toHaveLength(22);
    expect(maxDegree(SAMPLE_2)).toBe(4);
    expect(SAMPLE_2.edges).toHaveLength(25);
    expect(MAP_DEMO.edges.length).toBeLessThanOrEqual(3 * MAP_DEMO.nodes.length - 6);
  });
});

describe('layout', () => {
  test('force layout untangles a grid scrambled by a bad starting layout', () => {
    const g = gen.grid(3, 3);
    const { positions, after } = forceLayout(g.nodes, g.edges, { rng: rng(3) });
    expect(positions.size).toBe(9);
    expect(after).toBe(0);
    const placed = g.nodes.map((n) => ({ ...n, ...positions.get(n.id) }));
    expect(countCrossings(placed, g.edges)).toBe(0);
  });
});
