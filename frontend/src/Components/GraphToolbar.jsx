import React, { useRef } from 'react';
import { readGraphFile } from '../canvas/graphIO';

/**
 * Shared persistence / random-graph / layout controls for algorithm pages.
 */
export default function GraphToolbar({
  onNewRandom,
  onDownload,
  onLoad,
  onPlanarLayout,
  randomLabel = 'New Random Graph',
  downloadLabel = 'Download JSON',
  loadLabel = 'Load JSON',
  planarLabel = 'Draw As Planar As Possible',
  disabled = false,
  className = '',
}) {
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onLoad) return;
    try {
      const graph = await readGraphFile(file);
      onLoad(graph);
    } catch (err) {
      onLoad(null, err);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {onNewRandom && (
        <button
          type="button"
          disabled={disabled}
          onClick={onNewRandom}
          className="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
        >
          {randomLabel}
        </button>
      )}
      {onPlanarLayout && (
        <button
          type="button"
          disabled={disabled}
          onClick={onPlanarLayout}
          className="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white transition-colors"
          title="Rearrange vertices to reduce straight-line edge crossings"
        >
          {planarLabel}
        </button>
      )}
      {onDownload && (
        <button
          type="button"
          disabled={disabled}
          onClick={onDownload}
          className="text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors"
        >
          {downloadLabel}
        </button>
      )}
      {onLoad && (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors"
          >
            {loadLabel}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}
    </div>
  );
}
