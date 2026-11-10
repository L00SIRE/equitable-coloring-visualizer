import { ALGORITHMS } from './registry';
import { keyOf, maxDegree } from '../graph/model';

/*
 * Every page, every example graph, every step: the algorithm must run and the
 * page's visuals may only refer to vertices and edges that exist.
 */
describe.each(ALGORITHMS.map((a) => [a.nav, a.algo]))('%s', (nav, algo) => {
  const starts = [{ label: '(initial graph)', make: algo.initialGraph, params: {} }, ...(algo.presets ?? [])];

  test.each(starts.map((p) => [p.label, p]))('preset %s runs and every step draws', (label, preset) => {
    const graph = preset.make();
    let params = { ...(algo.defaultParams ?? {}), ...(preset.params ?? {}) };
    if (algo.normalizeParams) params = algo.normalizeParams(params, graph);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const edgeKeys = new Set(graph.edges.map((e) => keyOf(e, graph.directed)));

    const idle = algo.idle ? algo.idle(graph, params, { nodes: new Set(), edges: new Set() }) : {};
    Object.keys(idle.nodes ?? {}).forEach((id) => expect(nodeIds.has(Number(id))).toBe(true));

    const res = algo.compute(graph, params);
    expect(res.error).toBeFalsy();
    expect(res.steps.length).toBeGreaterThan(0);

    const bad = [];
    res.steps.forEach((step, i) => {
      expect(typeof step.message).toBe('string');
      if (algo.pseudocode && step.line != null && step.line >= algo.pseudocode.length) bad.push(`step ${i}: pseudocode line ${step.line} does not exist`);
      const v = algo.visualize(step, graph, params, res.summary);
      Object.keys(v.nodes ?? {}).forEach((id) => { if (!nodeIds.has(Number(id))) bad.push(`step ${i}: unknown vertex ${id}`); });
      Object.keys(v.edges ?? {}).forEach((k) => { if (!edgeKeys.has(k)) bad.push(`step ${i}: unknown edge ${k}`); });
    });
    expect(bad).toEqual([]);
  });

  test('has the pieces the workbench needs', () => {
    expect(algo.title).toBeTruthy();
    expect(algo.tagline).toBeTruthy();
    expect(algo.About).toBeTruthy();
    expect(typeof algo.compute).toBe('function');
    expect(typeof algo.visualize).toBe('function');
  });
});

test('H-S page raises r to the maximum degree', () => {
  const hs = ALGORITHMS.find((a) => a.path === '/hs-algo').algo;
  const g = hs.initialGraph();
  expect(hs.normalizeParams({ r: 1, merge: true, shortcuts: true }, g).r).toBe(maxDegree(g));
});

test('routes are unique and every group has pages', () => {
  const paths = ALGORITHMS.map((a) => a.path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(new Set(ALGORITHMS.map((a) => a.algo.id)).size).toBe(paths.length);
});
