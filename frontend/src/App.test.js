import { render, screen, within, fireEvent } from '@testing-library/react';
import App from './App';
import { ALGORITHMS } from './algos/registry';

const visit = (path) => { window.history.pushState({}, '', path); };

describe('app shell', () => {
  test('/ goes straight to a working tool, not a landing page', () => {
    visit('/');
    render(<App />);
    expect(window.location.pathname).toBe('/bfs');
    expect(screen.getByRole('heading', { level: 1, name: /breadth-first search/i })).toBeInTheDocument();
  });

  test('the sidebar lists every algorithm', () => {
    visit('/bfs');
    render(<App />);
    const nav = screen.getAllByRole('navigation', { name: /algorithms/i })[0];
    ALGORITHMS.forEach(({ nav: label }) => expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument());
    expect(within(nav).queryByRole('link', { name: /home/i })).toBeNull();
  });

  test('unknown URLs fall back to the first tool', () => {
    visit('/does-not-exist');
    render(<App />);
    expect(window.location.pathname).toBe('/bfs');
  });
});

describe('running an algorithm', () => {
  test('Run loads a step list that keyboard shortcuts walk through', () => {
    visit('/dfs');
    render(<App />);
    expect(screen.queryByText(/this step/i)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /^run$/i })[0]);
    expect(screen.getByText(/this step/i)).toBeInTheDocument();
    expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/^2 \/ \d+$/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'End' });
    expect(screen.getByRole('heading', { name: /^result$/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Home' });
    expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument();
  });

  test('Stop returns to editing', () => {
    visit('/bfs');
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /^run$/i })[0]);
    expect(screen.getByText(/editing is paused/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(screen.queryByText(/editing is paused/i)).toBeNull();
  });
});
