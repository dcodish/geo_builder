/**
 * Figure (Phase 2) — declarative SVG view of the engine's output.
 *
 * The engine is the single source of truth; this component renders its computed
 * figure with no imperative reconciler (JSXGraph is gone — docs/04-design.md
 * §Rendering). Fit-to-view is recomputed from the data; an additional
 * pan/zoom layer (a `<g transform>`) lets the user explore without touching the
 * world→screen fit. The whole renderer is swappable behind this props shape.
 */

import { useMemo, useRef, useState } from 'react';
import type { Construction, Id, Vec } from '@/engine/types';
import { buildScene, scenePositions } from './scene';
import { fitTransform } from './transform';

export interface FigureProps {
  construction: Construction;
  positions: Map<Id, Vec>;
  width?: number;
  height?: number;
  padding?: number;
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const IDENTITY: View = { zoom: 1, panX: 0, panY: 0 };

export function Figure({
  construction,
  positions,
  width = 600,
  height = 600,
  padding = 48,
}: FigureProps) {
  const [view, setView] = useState<View>(IDENTITY);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const { scene, transform } = useMemo(() => {
    const s = buildScene(construction, positions);
    const t = fitTransform(scenePositions(s), { width, height, padding });
    return { scene: s, transform: t };
  }, [construction, positions, width, height, padding]);

  // Point radius in px, kept visually constant by dividing out the pan/zoom scale.
  const r = 4 / view.zoom;
  const stroke = 1.5 / view.zoom;
  const fontSize = 14 / view.zoom;

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, zoom: clamp(v.zoom * factor, 0.2, 8) }));
  }
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, panX: d.panX + (e.clientX - d.x), panY: d.panY + (e.clientY - d.y) }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="geometry figure"
        style={{ touchAction: 'none', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          {scene.polygons.map((poly) => (
            <polygon
              key={poly.id}
              data-id={poly.id}
              points={poly.points.map((p) => screenStr(transform.toScreen(p))).join(' ')}
              fill="#3b82f6"
              fillOpacity={0.08}
              stroke="#2563eb"
              strokeWidth={stroke}
              strokeLinejoin="round"
            />
          ))}

          {scene.segments.map((seg) => {
            const a = transform.toScreen(seg.a);
            const b = transform.toScreen(seg.b);
            return (
              <line
                key={seg.id}
                data-id={seg.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#334155"
                strokeWidth={stroke}
                strokeLinecap="round"
              />
            );
          })}

          {scene.points.map((pt) => {
            const s = transform.toScreen(pt.pos);
            return (
              <g key={pt.id} data-id={pt.id}>
                <circle cx={s.x} cy={s.y} r={r} fill="#0f172a" />
                <text
                  x={s.x + r * 1.8}
                  y={s.y - r * 1.4}
                  fontSize={fontSize}
                  fontFamily="system-ui, sans-serif"
                  fill="#0f172a"
                >
                  {pt.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <button
        type="button"
        onClick={() => setView(IDENTITY)}
        style={{
          position: 'absolute',
          top: 8,
          insetInlineEnd: 8,
          padding: '4px 10px',
          fontSize: 12,
          borderRadius: 6,
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
          cursor: 'pointer',
        }}
      >
        Reset view
      </button>
    </div>
  );
}

const screenStr = (v: Vec): string => `${v.x},${v.y}`;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
