# Designing a Graph Theory Visualizer: Making Abstract Structures Tangible

**Suman Dangal\*** · **Saharsha Pandey** · **Chhandak Roy '24**

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

## Pages

- `/` — landing page with project abstract and module launch cards
- `/bfs` — Breadth-First Search visualizer
- `/dfs` — Depth-First Search visualizer
- `/bipartite` — bipartite detection via live 2-coloring
- `/greedy-color` — greedy vertex coloring (Brooks context)
- `/edge-color` — edge coloring (Vizing's theorem)
- `/four-color` — Four Color Theorem on planar graphs
- `/hall` — Hall's Marriage Theorem via augmenting paths
- `/hs-algo` — Kierstead–Kostochka algorithm (Hajnal–Szemerédi)

## H-S Algorithm Simulator

The H-S page (`src/Pages/HSAlgo.jsx`) animates the Kierstead–Kostochka
algorithm that proves the Hajnal–Szemerédi theorem: every graph with maximum
degree Δ(G) ≤ r has an **equitable (r+1)-coloring**, meaning a proper coloring
whose color classes differ in size by at most one.

The algorithm itself lives in `src/algorithms/hajnalSzemeredi.js`. It is a pure
module with no React in it: it takes the vertices, edges and `r` and returns
every intermediate snapshot (coloring, highlighted vertices and edges, the
auxiliary digraph, and a message citing the paper), and the page plays those
snapshots back. It is covered by `src/algorithms/hajnalSzemeredi.test.js`.

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
dropped at the end. They appear in the bottom-right corner of the canvas
during playback.

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
**Error** step instead of improvising.

**Choices inside Lemma 2.3.** Lemma 2.3 often allows several (z, y₁, X)
choices. With **Shortest route** on (the default), we take the one with the
least work: Case 1 if possible, y₁ from V+ (no recursive call) and X = V− (no
extra path). With it off, the preferences flip, which is the way to watch
Case 2 and the recursive call.

### Sample graphs

- **Sample Graph 1** (the graph from our notes, previously "Paper Graph"):
  16 vertices, 22 edges, Δ = 3, k = 4.
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

### Using the page

- **Compute Steps** runs the algorithm on the current graph. **Recompute**
  re-runs it, and changing either option re-runs it automatically.
- **Play / Pause**, **◀ / ▶** (or the ← / → keys), **▶▶** (last step),
  **Reset** and a speed slider control playback.
- A **step timeline** lists every step as a chip colored by step type. Click a
  chip to jump to it; dashed chips are steps inside a recursive call.
- Each step shows a badge, the part of the paper it comes from (for example
  `Lemma 2.3` or `Thm 2.4, Case 2`), and which level of the algorithm it
  belongs to: P, P′, or P′ on G[B − y₁].
- **Merge quiet stages** folds consecutive stages that create no improper edge
  into one step. **Shortest route** is described above.
- The **Color Classes** banner shows each class size, plus tags for its role in
  the current step: V+, V−, A, B, A′, U, W, X and Y.
- The **Auxiliary Digraph H(G, f)** panel sits next to the graph. It shows arc
  directions, class sizes, V+ (blue ring), V− (amber ring), the accessible
  classes (dashed green ring) and the path being used (violet). Classes outside
  the current sub-problem are faded.
- On the canvas:
  - edges added in the current step are green, and an improper edge is red;
  - moved vertices pulse green;
  - z, y₁ and y₂ are labelled in amber;
  - a vertex set aside for the recursive call is drawn dashed.
- **How the algorithm works** is a collapsible summary of the proof on the page
  itself, with a link to the paper.

Graph editing is unchanged: presets, New Random Graph, Draw As Planar As
Possible, Download/Load JSON, bulk vertices, bulk edges (`0-1, 1-2, …`) with
the degree cap enforced, Connect Mode, shift-click/marquee selection and
delete, mod-k and greedy colorings, and zoom and pan.

### Tests

```bash
npm test -- --watchAll=false src/algorithms
```

The suite checks:

- the exact step sequence for Sample Graph 1;
- Case 2 and the recursive call on Sample Graph 2;
- padding;
- 400 random graphs;
- algorithm P′ on 1,500 constructed "V+ blocked" colorings, in both choice
  modes, so Case 1, Case 2 and the recursion are all exercised.

Every run must end proper and equitable.

## Reference

- H. A. Kierstead & A. V. Kostochka, *A Short Proof of the
  Hajnal–Szemerédi Theorem on Equitable Colouring*, Combinatorics, Probability
  and Computing 17 (2008), 265–270.

## Getting started

```bash
npm install
npm start
```

Open <http://localhost:3000> and navigate to `/hs-algo`.

## Available Scripts

- `npm start` — dev server with hot reload
- `npm test` — Jest test runner
- `npm run build` — production build

## Notes / To-Do's:
Superficial To Do's:
On H-S Page:
- [x] Include a link to the K-K paper.
- [x] Say what Delta(G) means.
- [x] Say (in the "Parameters" box) r = Delta and k = *r + 1* = 4 (or whatever number r + 1 is in the current context).
- [x] Replace "conflict" with "improper edge."
- [x] Make "Color Classes" as a horizontal/banner box so that the "Auxiliary Digraph" box can be directly next to the "Graph G" box.
- [ ] "Light mode" option?

Feature To Do's:
- [ ] "Select multiple vertices" feature?
- [ ] "Save/Download/Load Graph" feature?
- [ ] Include the "New Random Graph" button on the H-S page (and all the other applicable pages).
- [ ] Canvas is still limited
- [ ] "Double-click to add vertex" seems glitchy.
- [ ] Fix "scroll to zoom" feature -- scrolling currently both zooms *and* scrolls.
- [ ] Design a "Draw As Planar As Possible" feature.

Algorithm To Do's:
- [x] Doesn't seem to work on "Paper Graph" (Let's call it "Sample Graph 1"). Fixed: V+ is blocked at the
  last stage of that graph, which needs Lemma 2.3 and Case 1 of Theorem 2.4. Those are now implemented
  (see "Why we rewrote it" above), and the run takes 8 steps.
