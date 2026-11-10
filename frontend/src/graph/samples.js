import { complete } from './generators';

const pairs = (list) => list.map(([a, b]) => ({ a, b }));

/* Sample Graph 1: the 16-vertex graph from the paper notes (Δ = 3). */
export const SAMPLE_1 = {
  nodes: [
    [6, -300, -180], [5, -180, -180], [4, -60, -180], [3, 60, -180], [8, 230, -180],
    [7, -300, -60], [0, -180, -60], [1, -60, -60], [2, 60, -60],
    [15, 60, 60], [9, 230, 60], [12, -300, 180], [13, -180, 180], [14, -60, 180],
    [11, 60, 180], [10, 230, 180],
  ].map(([id, x, y]) => ({ id, x, y })),
  edges: pairs([
    [0, 1], [1, 2], [2, 3], [1, 4], [3, 4], [0, 5], [4, 5], [5, 6], [0, 7], [6, 7], [3, 8],
    [8, 9], [9, 10], [10, 11], [7, 12], [2, 13], [12, 13], [11, 14], [13, 14], [9, 15],
    [11, 15], [14, 15],
  ]),
  directed: false,
};

/* Sample Graph 2: blocked at the last stage; Case 2 appears with "shortest route" off (Δ = 4). */
export const SAMPLE_2 = {
  nodes: [
    [0, 383, 460], [1, 457, 331], [2, 600, 80], [3, 522, 349], [4, 444, 428], [5, 334, 389],
    [6, 211, 303], [7, 278, 387], [8, 275, 191], [9, 360, 125], [10, 500, 154],
    [11, 333, 241], [12, 419, 239], [13, 417, 146], [14, 392, 326],
  ].map(([id, x, y]) => ({ id, x: x - 380, y: y - 260 })),
  edges: pairs([
    [0, 1], [1, 3], [0, 4], [3, 4], [1, 5], [4, 5], [5, 6], [0, 7], [5, 7], [6, 8],
    [8, 9], [1, 10], [2, 10], [9, 10], [7, 11], [9, 11], [3, 12], [8, 12], [9, 13], [10, 13],
    [11, 13], [12, 13], [4, 14], [11, 14], [12, 14],
  ]),
  directed: false,
};

/* A small connected graph for the traversal pages. */
export const TRAVERSAL_DEMO = {
  nodes: [
    [0, -240, -120], [1, -80, -170], [2, 90, -150], [3, 250, -110],
    [4, -250, 40], [5, -90, 0], [6, 90, 20], [7, 250, 60],
    [8, -170, 170], [9, 10, 180], [10, 190, 170],
  ].map(([id, x, y]) => ({ id, x, y })),
  edges: pairs([
    [0, 1], [0, 4], [1, 2], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [5, 6],
    [6, 7], [4, 8], [5, 9], [6, 9], [7, 10], [8, 9], [9, 10],
  ]),
  directed: false,
};

export const DIRECTED_DEMO = {
  nodes: [
    [0, -220, -100], [1, -60, -150], [2, 120, -110], [3, -230, 70],
    [4, -50, 40], [5, 140, 60], [6, 20, 180], [7, 290, -20],
  ].map(([id, x, y]) => ({ id, x, y })),
  edges: pairs([[0, 1], [1, 2], [0, 3], [3, 4], [1, 4], [4, 1], [2, 5], [4, 5], [5, 6], [6, 3], [0, 4], [7, 2], [7, 5]]),
  directed: true,
};

/* An odd cycle plus a pendant path, so the bipartite page has something to find. */
export const ODD_CYCLE_DEMO = {
  nodes: [
    [0, 0, -170], [1, 160, -50], [2, 100, 130], [3, -100, 130], [4, -160, -50],
    [5, 0, -300], [6, 250, 60],
  ].map(([id, x, y]) => ({ id, x, y })),
  edges: pairs([[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [1, 6]]),
  directed: false,
};

/* Matching demo for Hall's theorem: kind 'A' applicants, kind 'B' jobs. */
const hall = (aLabels, bLabels, links) => ({
  nodes: [
    ...aLabels.map((label, i) => ({ id: i, kind: 'A', label, x: -170, y: (i - (aLabels.length - 1) / 2) * 84 })),
    ...bLabels.map((label, j) => ({ id: aLabels.length + j, kind: 'B', label, x: 170, y: (j - (bLabels.length - 1) / 2) * 84 })),
  ],
  edges: pairs(links.map(([i, j]) => [i, aLabels.length + j])),
  directed: false,
});

export const HALL_PERFECT = hall(
  ['Alice', 'Bob', 'Carol', 'Dan'],
  ['Dev', 'Design', 'PM', 'QA'],
  [[0, 0], [0, 2], [1, 0], [1, 1], [2, 1], [2, 3], [3, 2], [3, 3]],
);

export const HALL_VIOLATION = hall(
  ['App 1', 'App 2', 'App 3', 'App 4'],
  ['Job 1', 'Job 2', 'Job 3'],
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 2]],
);

export const K4 = complete(4);

/* A planar map-like graph for the four-colour page. */
export const MAP_DEMO = {
  nodes: [
    ['WA', -300, -200], ['OR', -310, -90], ['CA', -300, 40], ['NV', -200, -30], ['ID', -190, -140],
    ['UT', -90, -20], ['AZ', -120, 110], ['CO', 20, -10], ['NM', 10, 120], ['WY', -20, -130],
    ['MT', -80, -230], ['KS', 150, -10], ['OK', 160, 90], ['TX', 120, 200],
  ].map(([label, x, y], id) => ({ id, label, x, y })),
  edges: pairs([
    [0, 1], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 6], [3, 4], [3, 5], [3, 6], [4, 9], [4, 10],
    [5, 6], [5, 7], [5, 9], [6, 8], [7, 8], [7, 9], [7, 11], [8, 13], [8, 12], [9, 10], [11, 12], [12, 13],
  ]),
  directed: false,
};
