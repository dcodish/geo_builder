/**
 * Phase-2 demo shell. The real app loop (store, input, theorem panel) is
 * Phase 3+; this wires the constructive engine straight to the SVG renderer so
 * the renderer can be eyeballed against the Phase-1 fixtures — including the
 * "show another configuration" alternatives toggle (F2). Old UI lives in
 * /archive for reference.
 */
import { useMemo, useState } from 'react';
import type { Command, Construction } from '@/engine';
import { build, cycleAlternative, evaluate } from '@/engine';
import { Figure } from '@/render';

// F2 fixture: isosceles triangle ABC by two distances — C has two valid
// branches (above / below AB), which the alternatives button cycles.
const DEMO: Command[] = [
  { type: 'free-point', id: 'A', x: 0, y: 0 },
  { type: 'free-point', id: 'B', x: 6, y: 0 },
  { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5, branch: 0 },
];

export default function App() {
  const [construction, setConstruction] = useState<Construction>(() => build(DEMO).construction);
  const positions = useMemo(() => {
    const e = evaluate(construction);
    return e.ok ? e.positions : new Map();
  }, [construction]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        color: '#0f172a',
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Geo Builder — engine + renderer (Phase 2 demo)</h1>
      <Figure construction={construction} positions={positions} />
      <button
        type="button"
        onClick={() => setConstruction((c) => cycleAlternative(c, 'C'))}
        style={{
          padding: '8px 16px',
          fontSize: 14,
          borderRadius: 8,
          border: '1px solid #2563eb',
          background: '#2563eb',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Show another configuration
      </button>
      <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
        Drag to pan · scroll to zoom · the figure is computed by the constructive engine.
      </p>
    </div>
  );
}
