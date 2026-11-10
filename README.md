# Equitable Coloring Visualizer

**Live:** https://graph-theory-visualizer-self.vercel.app/

An interactive graph theory lab. You draw a graph on the canvas, pick an algorithm, and step through what it does to the graph one state change at a time.

The main piece is a complete, step-by-step implementation of the **Kierstead–Kostochka algorithm** for the **Hajnal–Szemerédi theorem**. That's the research I'm working on. The other pages cover the standard topics so the tool works for a whole discrete math course.

> **Hajnal–Szemerédi.** Every graph with maximum degree Δ ≤ r has a proper (r+1)-coloring whose color classes differ in size by at most one.

Kierstead & Kostochka's 2008 proof is constructive, which means it can be run as an algorithm. I wanted a version where you can watch every recolouring step, because reading the proof cold is hard.

## What the H-S page does

`frontend/src/algorithms/hajnalSzemeredi.js` follows the paper's structure directly:

- **Padding.** If |G| isn't a multiple of r+1, add a disjoint clique K_p (as in Thm 2.4) and drop it at the end.
- **Algorithm P (Thm 3.2).** Start edgeless with any equitable colouring and add edges back one vertex at a time. When the new vertex clashes, move it, which leaves a *nearly equitable* colouring.
- **Algorithm P′ (Thm 3.1 / 2.4).** Build the auxiliary digraph H(G, f) on the colour classes and find the classes A that can reach V⁻.
  - V⁺ ∈ A: shift one vertex along a V⁺ ⇝ V⁻ path (Lemma 2.1).
  - V⁺ ∉ A: pick a terminal family, a solo vertex z and a special neighbour y₁ (Lemma 2.3), then recurse on G[B − y₁]. After that comes Case 1 (z is movable) or Case 2 (the accessible family grows, so repeat).

The engine is pure. It returns every intermediate snapshot, and the page animates them. There's a compact mode and a detailed mode with one step per stage, plus an option to turn off shortcuts so you can force the recursive branch and see it run.

The tests (`hajnalSzemeredi.test.js`) cover Case 1, Case 2, the recursion, the Petersen graph with r = 3 (which adds K₂ and drops it), edgeless and tiny graphs, and a randomized check that every run ends both proper and equitable.

## Other modules

| Route | Topic |
|---|---|
| `/bfs`, `/dfs` | Traversals, with the frontier and visit order shown live |
| `/bipartite` | Bipartite check by live 2-colouring, highlighting odd cycles |
| `/greedy-color` | Greedy and DSATUR vertex colouring (Brooks' theorem context) |
| `/edge-color` | Edge colouring (Vizing's theorem) |
| `/four-color` | Four Color Theorem on planar graphs |
| `/hall` | Hall's marriage theorem: augmenting paths build the matching |
| `/hs-algo` | Hajnal–Szemerédi / Kierstead–Kostochka |

All the pages share one canvas (`frontend/src/canvas/`) with drag-to-place nodes, a planar layout, random graph generation, and JSON import/export of graphs.

## Run

```bash
cd frontend
npm install
npm start        # dev server
npm test         # algorithm tests
```

React 19, Tailwind, React Router, CRA.

## Team

Suman Dangal, Saharsha Pandey, Chhandak Roy. This started as a research poster at Springfield College, *Designing a Graph Theory Visualizer: Making Abstract Structures Tangible*. `frontend/README.md` has the abstract.

## Reference

H. A. Kierstead and A. V. Kostochka, "A Short Proof of the Hajnal–Szemerédi Theorem on Equitable Colouring," *Combinatorics, Probability and Computing* 17 (2008), 265–270.
