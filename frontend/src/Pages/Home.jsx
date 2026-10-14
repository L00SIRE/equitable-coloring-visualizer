import React, { useState } from 'react';
import { Link } from 'react-router-dom';

/* ─── Algorithm tool palette data ─────────────────────────────────────── */
const TOOLS = [
  {
    id: 'bfs',
    to: '/bfs',
    label: 'BFS',
    name: 'Breadth-First Search',
    tag: 'Traversal',
    tagColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    desc: 'Wavefront expansion, level by level. Produces shortest-path distances in unweighted graphs. The queue state and distance labels are live overlays.',
    detail: 'Queue · Visited set · Distance labels · Shortest path highlight',
    app: 'Web crawling · Social network distance · Peer-to-peer routing',
  },
  {
    id: 'dfs',
    to: '/dfs',
    label: 'DFS',
    name: 'Depth-First Search',
    tag: 'Traversal',
    tagColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    desc: 'Commitment down a branch, backtrack on dead-ends. Assigns discovery / finish timestamps and classifies every edge as tree, back, forward, or cross.',
    detail: 'Stack · d/f timestamps · Edge classification · Directed toggle',
    app: 'Topological sort · Cycle detection · Compiler call graphs · Mazes',
  },
  {
    id: 'bipartite',
    to: '/bipartite',
    label: '2-Color',
    name: 'Bipartite Detection',
    tag: 'Coloring',
    tagColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    desc: 'BFS that colors as it goes. Clean result confirms the partition; conflict edge shows exactly where and why an odd cycle breaks bipartiteness.',
    detail: 'Live 2-coloring · Partition snap view · Odd-cycle conflict edge',
    app: 'Job assignment · Stable matching · RNA secondary structure',
  },
  {
    id: 'greedy-color',
    to: '/greedy-color',
    label: 'χ(G)',
    name: 'Greedy Vertex Coloring',
    tag: 'Coloring',
    tagColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    desc: "Five ordering strategies (DSATUR, Welsh-Powell, Smallest-last…). Result measured against Brooks' theorem bound — Kₙ and odd-cycle edge cases flagged explicitly.",
    detail: "DSATUR · Welsh-Powell · Brooks' bound · Color-class legend",
    app: 'Register allocation · Exam timetabling · Frequency assignment',
  },
  {
    id: 'edge-color',
    to: '/edge-color',
    label: "χ'(G)",
    name: 'Edge Coloring',
    tag: 'Coloring',
    tagColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    desc: "Greedy edge assignments; verdict badge reads Class 1 (χ'=Δ) or Class 2 (χ'=Δ+1). Presets include Kₙ, K_{m,n}, and the Petersen graph.",
    detail: "Vizing bound · Banned-set overlay · Class 1/2 detection",
    app: 'Round-robin scheduling · Wavelength assignment · Latin squares',
  },
  {
    id: 'four-color',
    to: '/four-color',
    label: '4C',
    name: 'Four Color Theorem',
    tag: 'Coloring',
    tagColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    desc: 'DSATUR drive with Kempe-chain recolorings when the greedy step gets boxed in. Appel–Haken (1976): every planar graph is 4-colorable.',
    detail: 'DSATUR · Kempe-chain swaps · Planarity Euler bound check',
    app: 'Political maps · Frequency reuse · Sudoku constraint propagation',
  },
  {
    id: 'hall',
    to: '/hall',
    label: 'Hall',
    name: "Hall's Marriage Theorem",
    tag: 'Matching',
    tagColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    desc: 'Augmenting-path bipartite matching. When no perfect matching exists, the tight subset S with |N(S)| < |S| is outlined as an explicit Hall blocker.',
    detail: 'Augmenting paths · Hall blocker highlight · Match size tracker',
    app: 'Job-candidate assignment · Kidney exchange · Taxi dispatch',
  },
  {
    id: 'hs-algo',
    to: '/hs-algo',
    label: 'H-S',
    name: 'Hajnal–Szemerédi (Equitable)',
    tag: 'Advanced',
    tagColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    desc: 'Kierstead–Kostochka algorithm for equitable (Δ+1)-coloring, one vertex at a time. The auxiliary digraph H(G,f), Lemma 2.1 and the Case 1 / Case 2 recursion of Theorem 2.4 are rendered live.',
    detail: 'Auxiliary digraph H(G,f) · Accessible classes A, B, A′ · Solo vertices & Lemma 2.3',
    app: 'Fair task distribution · Balanced scheduling · Load equalization',
  },
];

/* ─── H-S workflow steps ───────────────────────────────────────────────── */
const HS_STEPS = [
  { dot: 'bg-slate-500', label: 'G₀ — Empty', body: 'Start from the empty graph with an arbitrary equitable coloring f₀. Color classes are balanced to size ⌊n/(r+1)⌋.' },
  { dot: 'bg-cyan-400', label: 'Edge insertion', body: 'For each vertex vᵢ in order, add all edges from G that connect vᵢ to {v₁…vᵢ₋₁}. New edges are highlighted; quiet stages can be merged into one step.' },
  { dot: 'bg-red-400', label: 'Improper edge', body: 'If vᵢ shares a color with a neighbor, that improper edge turns red. vᵢ moves to a class with no neighbors, so the coloring is nearly equitable (V⁺ has s+1, V⁻ has s−1).' },
  { dot: 'bg-indigo-400', label: 'Auxiliary digraph', body: 'H(G, f) has an arc V→W when some vertex of V could move to W. A is the set of classes that can reach V⁻.' },
  { dot: 'bg-emerald-400', label: 'Lemma 2.1 path', body: 'If V⁺ ∈ A, a movable vertex is shifted along each arc of a path V⁺→…→V⁻, restoring equitability.' },
  { dot: 'bg-amber-400', label: 'V⁺ blocked', body: 'Otherwise Lemma 2.3 finds a solo vertex z and its special neighbor y₁. G[B − y₁] is colored recursively, then Case 1 finishes with Lemma 2.1 or Case 2 grows A and repeats.' },
  { dot: 'bg-slate-300', label: 'Gᵢ — Equitable', body: 'fᵢ is now a valid equitable (r+1)-coloring of Gᵢ. Repeat until all vertices of G are processed.' },
];

/* ─── Component ────────────────────────────────────────────────────────── */
export default function Home() {
  const [activeTool, setActiveTool] = useState('bfs');
  const tool = TOOLS.find(t => t.id === activeTool) || TOOLS[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-14 md:py-20">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Designing a Graph Theory Visualizer:
            <br />
            <span className="text-cyan-400">Making Abstract Structures Tangible</span>
          </h1>
          <p className="mt-4 font-mono text-sm text-slate-500">
            Suman Dangal* &middot; Saharsha Pandey &middot; Chhandak Roy '24
            <span className="mx-3 text-slate-700">|</span>
            Advisor: Dr. Tyler Markenen
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/bfs"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-medium hover:bg-cyan-500/20 transition-colors"
            >
              Open Visualizer &rarr;
            </Link>
            <a
              href="https://github.com/L00SIRE/Graph_Theory_Visualizer-1"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-slate-400 border border-slate-700 rounded-lg text-sm font-medium hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              Source
            </a>
          </div>
        </div>
      </section>

      {/* ── Abstract ──────────────────────────────────────────────────── */}
      <section className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <h2 className="font-mono text-xs tracking-widest text-slate-500 uppercase mb-4">Abstract</h2>
          <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
            <p>
              Graph theory fundamentally deals with dynamic and evolving structures.
              Yet it's still largely taught using static textbook diagrams and chalkboard
              proofs. For students, mentally simulating how a complex algorithm alters a
              network step-by-step can be exhausting. This cognitive overload often leads
              to an "illusion of understanding," where learners passively watch a process
              without truly grasping the underlying logic.
            </p>
            <p>
              To bridge this gap, we introduce a highly interactive visualization system
              that turns graph theory from a passive reading exercise into a hands-on,
              exploratory lab. Powered by a click-and-control layout engine, the tool
              allows users to build graphs on a canvas and manipulate them in real time.
              Our platform goes beyond traversal algorithms like breadth-first and
              depth-first search, uniquely extending into advanced combinatorics. It
              enables the user to visualize complex proofs — like Hall's marriage theorem,
              the four color theorem, Vizing's theorem for edge colorings, and the
              polynomial-time Kierstead-Kostochka algorithm for the Hajnal-Szemerédi
              Theorem — by translating dense algebraic logic into intuitive spatial puzzles.
            </p>
            <p>
              We let software do the heavy lifting to track the algorithm's states so
              that students can focus on the actual concepts. Ultimately, this active
              approach fosters a more collaborative and inclusive learning environment.
              It helps students access advanced mathematics, allowing them to see
              algorithms step by step.
            </p>
          </div>
        </div>
      </section>

      {/* ── H-S Workflow ──────────────────────────────────────────────── */}
      <section className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <h2 className="text-lg font-bold text-white mb-1">
            Kierstead–Kostochka — Color Legend &amp; Steps
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            Color coding maps directly to algorithmic role.
          </p>

          {/* Color legend */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            {[
              { dot: 'bg-cyan-400', ring: 'ring-cyan-400/30', label: 'Active edge', sub: 'currently being added' },
              { dot: 'bg-red-400', ring: 'ring-red-400/30', label: 'Improper edge', sub: 'both ends same color' },
              { dot: 'bg-indigo-400', ring: 'ring-indigo-400/30', label: 'Active vertex', sub: 'vᵢ being processed' },
              { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', label: 'Move target', sub: 'vertex being shifted' },
              { dot: 'bg-amber-400', ring: 'ring-amber-400/30', label: 'Lemma path', sub: 'V⁺ → … → V⁻' },
              { dot: 'bg-slate-500', ring: 'ring-slate-500/30', label: 'Settled', sub: 'equitable & stable' },
            ].map(({ dot, ring, label, sub }) => (
              <div key={label} className={`bg-slate-900 rounded-xl p-4 border border-slate-800 ring-1 ${ring}`}>
                <span className={`inline-block w-3 h-3 rounded-full ${dot} mb-2`} />
                <p className="text-sm font-semibold text-white leading-tight">{label}</p>
                <p className="text-xs text-slate-500 mt-1 font-mono">{sub}</p>
              </div>
            ))}
          </div>

          {/* Step timeline */}
          <div className="relative">
            {/* vertical line */}
            <div className="absolute left-[11px] top-0 bottom-0 w-px bg-slate-800" />
            <div className="space-y-0">
              {HS_STEPS.map((s, i) => (
                <div key={i} className="flex gap-5 pb-8 last:pb-0">
                  <div className="relative flex-none pt-0.5">
                    <span className={`block w-6 h-6 rounded-full border-2 border-slate-950 ${s.dot} z-10 relative`} />
                  </div>
                  <div className="pt-0.5">
                    <p className="font-mono text-sm font-semibold text-white">{s.label}</p>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-xl">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Playback controls diagram */}
          <div className="mt-10 bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Playback Controls</p>
            <div className="flex flex-wrap gap-3 items-center">
              {[
                { key: '◀', desc: 'Step back', accent: false },
                { key: '▶ Run', desc: 'Auto-play', accent: true },
                { key: '▶', desc: 'Step forward', accent: false },
                { key: '⟲', desc: 'Reset', accent: false },
                { key: '━━━━', desc: 'Speed slider (200 – 2000 ms)', accent: false, wide: true },
              ].map(({ key, desc, accent, wide }) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-mono font-semibold border ${wide ? 'min-w-[6rem]' : 'min-w-[3rem]'} ${accent ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                    {key}
                  </kbd>
                  <span className="text-xs text-slate-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tool Palette ──────────────────────────────────────────────── */}
      <section className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <h2 className="text-lg font-bold text-white mb-6">Algorithms</h2>

          <div className="flex flex-col lg:flex-row gap-0 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Left: tool list */}
            <nav className="lg:w-56 flex-none border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors border-b border-slate-800/60 last:border-b-0 focus:outline-none focus:ring-inset focus:ring-1 focus:ring-cyan-500 ${activeTool === t.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`font-mono text-xs font-bold w-8 text-center ${activeTool === t.id ? 'text-cyan-400' : 'text-slate-600'}`}>{t.label}</span>
                    <span className="text-sm font-medium truncate">{t.name.split(' ').slice(0, 2).join(' ')}</span>
                  </span>
                  {activeTool === t.id && (
                    <svg className="w-3.5 h-3.5 text-cyan-400 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              ))}
            </nav>

            {/* Right: detail panel */}
            <div className="flex-1 bg-slate-900/30 p-8">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${tool.tagColor}`}>{tool.tag}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">{tool.name}</h3>
                </div>
                <Link
                  to={tool.to}
                  className="flex-none inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-semibold hover:bg-cyan-500/20 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  Open
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              <p className="text-slate-300 leading-relaxed mb-6">{tool.desc}</p>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Live overlays</p>
                  <div className="flex flex-wrap gap-2">
                    {tool.detail.split(' · ').map(d => (
                      <span key={d} className="text-xs font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded border border-slate-700">{d}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-2">Applications</p>
                  <div className="flex flex-wrap gap-2">
                    {tool.app.split(' · ').map(a => (
                      <span key={a} className="text-xs font-mono bg-slate-800/50 text-slate-400 px-2.5 py-1 rounded border border-slate-800">{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600">
        <span className="font-mono">graph-theory-visualizer</span>
        <span>Suman Dangal · Saharsha Pandey · Chhandak Roy '24 · Dr. Tyler Markenen</span>
      </footer>
    </div>
  );
}
