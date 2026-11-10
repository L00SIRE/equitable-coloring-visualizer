import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Close, External, Menu, Moon, Sun } from './icons';
import { GROUPS, ALGORITHMS } from '../algos/registry';

const SOURCE_URL = 'https://github.com/L00SIRE/Graph_Theory_Visualizer';

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gtv-theme', next); } catch (e) { /* storage may be unavailable */ }
    setTheme(next);
  };
  return [theme, toggle];
}

function Nav({ onNavigate }) {
  return (
    <nav aria-label="Algorithms" className="flex-1 overflow-y-auto px-2 py-3">
      {GROUPS.map((group) => (
        <div key={group.id} className="mb-4">
          <h2 className="label px-2 pb-1">{group.label}</h2>
          <ul>
            {ALGORITHMS.filter((a) => a.group === group.id).map((a) => (
              <li key={a.path}>
                <NavLink to={a.path} onClick={onNavigate}
                  className={({ isActive }) => `block rounded-md px-2 py-1.5 text-[13px] transition-colors ${isActive ? 'bg-accent/10 font-semibold text-accent' : 'text-ink hover:bg-surface-2'}`}>
                  {a.nav}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const [theme, toggle] = useTheme();
  return (
    <div className="flex items-center justify-between border-t border-line px-3 py-2">
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
        Source <External width={12} height={12} />
      </a>
      <button type="button" className="btn btn-icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light / dark">
        {theme === 'dark' ? <Sun /> : <Moon />}
      </button>
    </div>
  );
}

const Brand = () => (
  <div className="px-4 py-3">
    <p className="text-[15px] font-semibold leading-tight tracking-tight">Graph Theory Visualizer</p>
    <p className="text-[12px] text-muted">Build a graph. Run it. Step through it.</p>
  </div>
);

export default function Shell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const current = ALGORITHMS.find((a) => a.path === pathname);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { document.title = current ? `${current.nav} · Graph Theory Visualizer` : 'Graph Theory Visualizer'; }, [current]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* desktop sidebar */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface lg:flex xl:w-60">
        <Brand />
        <Nav />
        <SidebarFooter />
      </aside>

      {/* mobile top bar + drawer */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 lg:hidden">
        <button type="button" className="btn btn-icon" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Menu /></button>
        <p className="truncate text-[14px] font-semibold">{current?.nav ?? 'Graph Theory Visualizer'}</p>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-start justify-between pr-2"><Brand />
              <button type="button" className="btn btn-icon mt-2" onClick={() => setOpen(false)} aria-label="Close menu"><Close /></button>
            </div>
            <Nav onNavigate={() => setOpen(false)} />
            <SidebarFooter />
          </div>
        </div>
      )}

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
