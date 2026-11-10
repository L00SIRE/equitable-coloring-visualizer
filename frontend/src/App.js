import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Shell from './ui/Shell';
import Workbench from './ui/Workbench';
import { ALGORITHMS } from './algos/registry';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Shell />}>
          {ALGORITHMS.map(({ path, algo }) => (
            <Route key={path} path={path} element={<Workbench key={algo.id} algo={algo} />} />
          ))}
          <Route path="*" element={<Navigate to={ALGORITHMS[0].path} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
