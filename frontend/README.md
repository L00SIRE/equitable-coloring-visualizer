# Designing a Graph Theory Visualizer: Making Abstract Structures Tangible

**Suman Dangal\*** · **Saharsha Pandey** · **Chhandak Roy '24**

Advisor: Dr. Tyler Markenen

## The Abstract

Graph theory fundamentally deals with dynamic, evolving structures, yet we
still largely teach it using static textbook diagrams and chalkboard
proofs. For students, mentally simulating how a complex algorithm alters a
network step-by-step can be exhausting. This cognitive overload often
leads to an "illusion of understanding," where learners passively watch a
process without truly grasping the underlying logic.

To bridge this gap, we introduce a highly interactive visualization system
that turns graph theory from a passive reading exercise into a hands-on,
exploratory lab. Powered by a click-and-control layout engine, the tool
allows users to build graphs on a canvas and manipulate them in real time.
Our platform goes beyond traversal algorithms like Breadth-First and
Depth-First Search, uniquely extending into advanced combinatorics. It
enables the user to visualize complex proofs, like Hall's marriage
theorem, the four color theorem, Vizing's theorem, and the
polynomial-time Kierstead–Kostochka algorithm for the Hajnal–Szemerédi
Theorem — by translating dense algebraic logic into intuitive spatial
puzzles.

We let software do the heavy lifting of tracking the algorithm's state,
so that students' brains can actually grasp the concept. Ultimately, this
active approach fosters a more collaborative and inclusive learning
environment. This helps to access advanced discrete mathematics allowing
students to see algorithmic state: step-by-step.

## How the site is organized

There is no landing page. The site opens directly on a working tool, and every
page has the same layout: a **sidebar** to switch algorithms, a **canvas** in
the middle where you build the graph, and an **inspector** on the right with
the setup, the explanation of the current step, the algorithm's state and its
pseudocode. On a phone the sidebar becomes a menu and the inspector sits below
the canvas.

| Route | Page | What it shows |
| --- | --- | --- |
| `/bfs` | Breadth-first search | levels, queue, shortest path to a target |
| `/dfs` | Depth-first search | discovery/finish times, tree/back/forward/cross edges, cycles, topological order |
| `/bipartite` | Bipartite test | BFS 2-coloring, and an actual odd cycle when it fails |
| `/hall` | Matching and Hall's theorem | augmenting paths, and a Hall violator when no perfect matching exists |
| `/greedy-color` | Greedy vertex coloring | five vertex orders, plus exact χ(G), clique and Brooks bounds |
| `/edge-color` | Edge coloring (Vizing) | the Misra–Gries algorithm: fans, path flips, at most Δ + 1 colors |
| `/four-color` | Four colors | exact DSATUR search with backtracking on maps and planar graphs |
| `/hs-algo` | Equitable coloring (H–S) | the Kierstead–Kostochka algorithm, see below |

Light and dark themes are available from the sidebar (it follows your system
setting at first).

## Working with the canvas

The canvas is an unbounded plane. Scrolling zooms around the cursor and does
not scroll the page; **Fit** (or `F`) brings the whole graph back into view.

| Tool | Key | What it does |
| --- | --- | --- |
| Select | `V` | click or drag vertices; click an edge; drag empty space to box-select (shift adds); `Delete` removes |
| Vertex | `N` | click empty space to place a vertex |
| Edge | `E` | drag from one vertex to another, or click one and then the other; `Esc` cancels |
| Hand | `H` | drag to move the view (on a touch screen, dragging empty space pans and two fingers pinch to zoom) |

`Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` undo and redo every edit (a drag counts as
one step), and `Ctrl/Cmd+A` selects all.

The **Graph** menu on the canvas holds everything else:

- **Examples** curated for the page you are on;
- **Generate** graph families (paths, cycles, complete and complete bipartite
  graphs, grids, wheels, crown graphs, Petersen, random trees, G(n, p), random
  graphs with Δ ≤ r and random bipartite graphs);
- **Layout**: circle, two columns (bipartite pages) or **Untangle**, a
  force-directed layout that pushes crossing edges apart. It reduces crossings
  but is not a planarity test;
- **Directed edges** on the traversal pages;
- an **edge list** box (`0-1, 1-2, 2-0`) to type a graph in or copy one out;
- **Export / Import** as JSON (older files with `from`/`to` edges still load).

### Running an algorithm

**Run** computes every step of the algorithm for the current graph and loads it
into the player below the canvas. While a run is loaded the structure is
frozen (you can still drag vertices and move the view); **Stop** or **Edit
graph** goes back to editing, and loading another graph ends the run.

- Play / pause (`Space`), previous / next (`←` / `→`), first / last
  (`Home` / `End`), a scrubber and a speed control from 0.5× to 8×.
- The inspector shows what the current step does and which line of the
  pseudocode it is, a legend for the colors on the canvas, and the algorithm's
  state (queue, stack, color counts, matching, auxiliary digraph …).
- Changing a setting while a run is loaded recomputes it.

## The algorithms

Each algorithm lives in `src/algorithms/` as a pure function that returns a
list of steps; the page decides how a step is drawn. Where the old pages
simplified or over-claimed, we replaced them:

- **Bipartite test** previously reported only the bad edge. It now returns the
  odd cycle: the two BFS-tree paths from the ends of the bad edge, up to their
  lowest common ancestor.
- **Edge coloring** was a greedy coloring labelled "Vizing", which can use up
  to 2Δ − 1 colors. It is now **Misra–Gries**, the constructive proof of
  Vizing's theorem. When no color is free at both ends of an edge (u, v), it
  builds a fan of u, flips the cd-path starting at u to free a color, rotates
  the fan, and so always stays within Δ + 1 colors. The page also decides
  exactly whether the graph is class 1 (χ′ = Δ) or class 2 (χ′ = Δ + 1), for
  up to 36 edges, by searching for a Δ-coloring of the line graph.
- **Four colors** now uses an exact DSATUR search with backtracking (the old
  heuristic could fail on planar graphs). It does not reproduce the
  computer-assisted proof of the theorem; if every branch fails for k = 4 the
  graph is not planar. Euler's bound |E| ≤ 3|V| − 6 is shown as a quick check.
- **Greedy coloring** offers vertex number, largest-first, smallest-last,
  DSATUR and random orders, and compares the result with the exact χ(G), the
  clique number, Δ + 1, degeneracy + 1 and Brooks' theorem. The default example
  is a crown graph, where numeric order uses as many colors as there are pairs
  although χ = 2.
- **DFS** classifies edges as tree, back, forward or cross, restarts to build a
  full DFS forest, detects cycles, and gives a topological order for DAGs.
- **Hall's theorem** runs Kuhn's augmenting-path matching and, if some vertex of
  A stays unmatched, returns the set S of vertices reachable by alternating
  paths: a Hall violator with |N(S)| < |S|.

## H-S Algorithm Simulator

The H-S page animates the Kierstead–Kostochka algorithm that proves the
Hajnal–Szemerédi theorem: every graph with maximum degree Δ(G) ≤ r has an
**equitable (r+1)-coloring**, meaning a proper coloring whose color classes
differ in size by at most one. Δ(G) is the largest number of edges meeting at
one vertex.

The algorithm itself is `src/algorithms/hajnalSzemeredi.js`. It is a pure
module: it takes the vertices, edges and `r` and returns every snapshot
(coloring, highlighted vertices and edges, the auxiliary digraph, and a message
citing the paper). `src/algos/hs.jsx` draws those snapshots.

### Why we rewrote it

The first version implemented only Lemma 2.1. Whenever V+ could not reach V−
in the auxiliary digraph, it fell back to moves that are not in the paper
(direct moves, two-hop chains, swaps and finally a greedy recolor). On the
paper graph that fallback looped: vertex 0 bounced between two classes until a
300-iteration cap, which produced **956 animation steps** and ended in an
error. The paper graph is exactly the case where V+ is blocked, so it needs the
full argument of Theorem 2.4. The new version implements the whole proof, and
the same graph now finishes in **8 steps**.

### The algorithm as implemented

**Setup.** Let k = r + 1 and s = n / k. If n is not a multiple of k, we add p
padding vertices that form a clique K_p, exactly as in the proof of
Theorem 2.4. K_p never pushes a degree above r, and the padding vertices are
dropped at the end. They are drawn below the graph during playback.

**Algorithm P (Theorem 3.2).**

1. Remove every edge and color v_i with class (i − 1) mod k. With no edges,
   this coloring is proper and equitable.
2. For i = 2, …, n, add back the edges from v_i to v_1, …, v_{i−1}. Every new
   edge touches v_i, so v_i is the only vertex that can end up on an
   *improper edge* (both ends the same color).
3. If it does, move v_i to a class where it has no neighbors. One always exists:
   v_i has at most r neighbors and one of them is in its own class. The
   coloring is now *nearly equitable*: one class V+ has s + 1 vertices, one
   class V− has s − 1, and the rest have s. Run P′.

The paper phrases step 2 as "add back all edges incident with v_i". Adding the
edges back to earlier vertices (so G_i is the subgraph induced by the first i
vertices) keeps the property the proof needs, namely that every new edge
touches v_i, and it matches the edge order of the paper graph in our notes.

**Algorithm P′ (Theorems 2.4 and 3.1).**

- Build the auxiliary digraph H(G, f): one node per color class, and an arc
  V → W when some y ∈ V has no neighbor in W (y is *movable* to W). Let A be the
  classes that can reach V− and B the rest, with m = |A| − 1 and q = r − m.
- **Lemma 2.1.** If V+ ∈ A, take a shortest path V+ → … → V− and move one
  movable vertex along every arc at the same time. The coloring becomes
  equitable.
- **V+ blocked.** Otherwise no vertex of B can move into A, so each one has a
  neighbor in every class of A and at most q − 1 neighbors inside B
  (inequality 2.1). We pick the non-terminal class U whose removal cuts off
  the fewest classes from V−. Those classes form A′, and every class in A′ is
  terminal.
- **Lemma 2.3.** Find a *solo* vertex z ∈ W ∈ A′ (some y ∈ B has z as its only
  neighbor in W) that either can move to another class X of A, or has two
  non-adjacent special neighbors y₁, y₂ ∈ B.
- **Recursive call.** Set y₁ aside and make G[B − y₁] equitable with its q
  colors by calling P′ on it. When y₁ comes from V+ this is already the case
  and the call is skipped.
- **Case 1** (z can move to X): move z to X and drop y₁ into W. X ∪ {z} is
  accessible inside A, so Lemma 2.1 finishes.
- **Case 2** (z cannot move inside A): move z into a class of B where it has no
  neighbor and drop y₁ into W. That class is the new V+. y₂ can now move into
  W, so A grows and q strictly drops. Repeat.

Each Case 2 lowers q, so P′ stops after at most r rounds. The finished coloring
is checked (proper on G, class sizes within one of each other). If any
invariant from the proof ever failed, the run would end with an explicit
error instead of improvising.

**Choices inside Lemma 2.3.** Lemma 2.3 often allows several (z, y₁, X)
choices. With **Shortest route** on (the default), we take the one with the
least work: Case 1 if possible, y₁ from V+ (no recursive call) and X = V− (no
extra path). With it off, the preferences flip, which is the way to watch
Case 2 and the recursive call.

### Sample graphs

- **Sample Graph 1** (the graph from our notes): 16 vertices, 22 edges, Δ = 3,
  k = 4.
  - Stages 2–15 add no improper edge.
  - Stage 16 adds {9,15}, {11,15} and {14,15}; {11,15} is improper, so 15
    moves to Red, giving V+ = Red (5 vertices) and V− = Yellow (3 vertices).
  - Red is blocked: A = {Yellow, Blue}, B = {Red, Green}, A′ = {Blue}.
  - Lemma 2.3 picks z = 9 ∈ Blue with y₁ = 8. That is Case 1: 9 → Yellow and
    8 → Blue, after which every class has 4 vertices. **8 steps.**
  - With Shortest route off, y₁ = 6 comes from Green, so we first recurse on
    G[B − 6] (vertex 0 shifts Red → Green) and then finish with Case 1.
    **10 steps.**
- **Sample Graph 2**: 15 vertices, 25 edges, Δ = 4, k = 5. The mod-5 start
  stays proper until the last stage, which blocks V+.
  - With Shortest route off it runs **Case 2**: z = 11, and its special
    neighbors y₁ = 13 and y₂ = 14 are non-adjacent.
  - The recursive call shifts 0 Red → Yellow; then 11 → Yellow and 13 → Blue.
  - A final Lemma 2.1 shift along Yellow → Red → Blue → Purple makes it
    equitable. **12 steps.**
  - With Shortest route on, the same graph takes Case 1.
- **Petersen** (10 vertices, r = 3, so padding K₂ is added), **Cycle C₈** and
  **K₃,₃**.

### On the H-S page

- **r** is the degree bound. It is raised automatically to Δ(G) if the graph
  needs it, and k = r + 1 colors are used.
- **Merge quiet stages** folds consecutive stages that create no improper edge
  into one step. **Shortest route** is described above.
- **All steps** lists every step as a chip. Click one to jump to it.
- Each step shows a badge, the part of the paper it comes from (for example
  `Lemma 2.3` or `Thm 2.4, Case 2`), and which level of the algorithm it
  belongs to: P, P′, or P′ on G[B − y₁].
- The **State** panel shows each color class with its size and its role in the
  current step (V+, V−, A, B, A′, U, W, X, Y) and the auxiliary digraph H(G, f)
  with V+ (blue ring), V− (amber ring), the accessible classes (dashed green
  ring) and the path being used (violet).
- On the canvas, edges added in the current step are green, an improper edge
  is red, moved vertices are ringed in green, z, y₁ and y₂ are labelled, a
  vertex set aside for the recursive call is dashed, and edges that have not
  been added yet are drawn faintly.

## Project layout

```
src/
  algorithms/   pure algorithm modules (no React) and their tests
  graph/        graph model, generators, layouts, JSON / edge-list IO, sample graphs
  editor/       the canvas, the editing hook (undo, selection, tools), the Graph menu
  ui/           app shell, workbench layout, player bar, shared panels
  algos/        one file per page: parameters, how a step is drawn, explanation
  theme/        colors and the categorical palette
```

A page is a plain object: `compute(graph, params)` calls an algorithm,
`visualize(step, graph, params)` returns how each vertex and edge looks, and
`Params`, `Panels`, `Result` and `About` are small components. Adding an
algorithm means writing that object and adding it to `src/algos/registry.js`.

## Tests

```bash
npm test -- --watchAll=false
```

- **Algorithms:** BFS distances against an independent computation; DFS
  intervals properly nested and topological orders valid on random DAGs; the
  bipartite verdict against an independent test with a checked witness; greedy
  colorings proper and within the Δ + 1 and degeneracy + 1 bounds; Misra–Gries
  proper and within Δ + 1 colors on 1,500 random graphs, with the fan and
  inversion path exercised; the four-color search on planar and non-planar
  graphs; Hall matching sizes against brute force; and the H-S algorithm on both
  sample graphs, padding, random graphs and 1,500 constructed "V+ blocked"
  colorings so that Case 1, Case 2 and the recursion all run.
- **Pages:** every example graph on every page is run and every step is drawn,
  and each step's visuals may only refer to vertices and edges that exist.
- **Editor:** undo/redo, edge rules, deletion, drag as one undo step.
- **App:** `/` opens a tool, every algorithm is in the sidebar, and
  Run / keyboard stepping / Stop work.

## Reference

- H. A. Kierstead & A. V. Kostochka, *A Short Proof of the
  Hajnal–Szemerédi Theorem on Equitable Colouring*, Combinatorics, Probability
  and Computing 17 (2008), 265–270.
  <https://doi.org/10.1017/S0963548307008619>
- J. Misra & D. Gries, *A constructive proof of Vizing's theorem*,
  Information Processing Letters 41 (1992), 131–133.

## Getting started

You need Node.js (with npm) and, for the Python option, Python 3. The commands
below assume you start in the folder you cloned (the one that contains
`frontend/`).

### Option 1: development server (hot reload)

```bash
cd frontend
npm install
npm start
```

Open <http://localhost:3000>. It opens straight into the breadth-first search
tool.

### Option 2: build once, serve with Python

```bash
cd frontend
npm install
npm run build
cd build
python3 -m http.server 8000
```

Open <http://localhost:8000>. Stop the server with `Ctrl+C`.

Notes for the Python option:

- Run `npm run build` first. The `frontend/build/` folder that is checked in
  may be an old version of the site.
- Always serve from the `build` folder and open the root address. Python's
  server does not know about the site's page routes, so reloading the browser
  on an address like `/dfs` gives a 404. Open `/` again and use the sidebar.
- If port 8000 is busy, use another one, for example
  `python3 -m http.server 8080`.

## Available Scripts

- `npm start` — dev server with hot reload
- `npm test` — Jest test runner
- `npm run build` — production build

## Notes / To-Do's:

Done:
- [x] Link to the K-K paper, what Δ(G) means, r = Δ and k = r + 1 shown, "improper edge" wording on the H-S page.
- [x] Light mode.
- [x] Select multiple vertices (shift-click and box select), delete, undo and redo.
- [x] Save / download / load a graph (JSON export and import, and edge-list text).
- [x] "New random graph" on every page: the **Generate** section of the Graph menu.
- [x] Canvas is no longer limited: it is an unbounded plane with zoom about the cursor.
- [x] "Double-click to add a vertex" was glitchy: replaced by the Vertex tool.
- [x] Scroll to zoom no longer scrolls the page.
- [x] "Draw as planar as possible": **Untangle** layout (it reduces crossings; it does not test planarity).
- [x] The paper graph ("Sample Graph 1") now works: see "Why we rewrote it".
- [x] Remove the landing page; the site opens on a tool.

Still open:
- [ ] A real planarity test for the four-color page (Euler's bound is only a necessary condition).
- [ ] Weighted graphs and shortest-path algorithms (Dijkstra, Bellman–Ford).
- [ ] Share a graph by link.
