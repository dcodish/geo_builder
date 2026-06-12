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
import { findSegmentCrossings } from './intersections';
import type { Crossing } from './intersections';
import { fitTransform } from './transform';

export interface FigureProps {
  construction: Construction;
  positions: Map<Id, Vec>;
  width?: number;
  height?: number;
  padding?: number;
  /** Object ids to accent (e.g. those introduced by the selected fact). */
  highlight?: Set<Id>;
  /**
   * When provided, unmarked crossings of declared segments are offered as
   * hollow dots; clicking one calls this with the crossing so the host can
   * create a named intersection point. Omit to disable the affordance.
   */
  onPickIntersection?: (crossing: Crossing) => void;
  /** Tooltip for the crossing dots (host supplies the localized string). */
  intersectionLabel?: string;
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const IDENTITY: View = { zoom: 1, panX: 0, panY: 0 };

const ACCENT = '#f59e0b';

export function Figure({
  construction,
  positions,
  width = 600,
  height = 600,
  padding = 48,
  highlight,
  onPickIntersection,
  intersectionLabel,
}: FigureProps) {
  const lit = (id: string): boolean => !!highlight && highlight.has(id);
  const [view, setView] = useState<View>(IDENTITY);
  const [hotCross, setHotCross] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const { scene, transform, crossings } = useMemo(() => {
    const s = buildScene(construction, positions);
    const t = fitTransform(scenePositions(s), { width, height, padding });
    const x = onPickIntersection ? findSegmentCrossings(construction, positions) : [];
    return { scene: s, transform: t, crossings: x };
  }, [construction, positions, width, height, padding, onPickIntersection]);

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
          {/* Circles are drawn first (outline only) so chords/segments sit on top.
              The world→screen fit is isotropic, so a world radius scales by
              `transform.scale`. */}
          {scene.circles.map((circ) => {
            const c = transform.toScreen(circ.center);
            return (
              <circle
                key={circ.id}
                data-id={circ.id}
                cx={c.x}
                cy={c.y}
                r={circ.r * transform.scale}
                fill="none"
                stroke={lit(circ.id) ? ACCENT : '#334155'}
                strokeWidth={lit(circ.id) ? stroke * 2 : stroke}
              />
            );
          })}

          {/* Visible construction lines (a standalone tangent / bisector /
              perpendicular / parallel) — dashed, drawn behind segments. An
              infinite line is rendered as a long segment extended through its
              anchor along its (screen-space) direction; the SVG viewport clips it. */}
          {scene.lines.map((ln) => {
            const a = transform.toScreen(ln.anchor);
            const a2 = transform.toScreen({ x: ln.anchor.x + ln.dir.x, y: ln.anchor.y + ln.dir.y });
            const dx = a2.x - a.x;
            const dy = a2.y - a.y;
            const m = Math.hypot(dx, dy) || 1;
            const ux = (dx / m) * 6000;
            const uy = (dy / m) * 6000;
            return (
              <line
                key={ln.id}
                data-id={ln.id}
                x1={a.x - ux}
                y1={a.y - uy}
                x2={a.x + ux}
                y2={a.y + uy}
                stroke={lit(ln.id) ? ACCENT : '#64748b'}
                strokeWidth={lit(ln.id) ? stroke * 1.5 : stroke}
                strokeDasharray={`${6 / view.zoom} ${5 / view.zoom}`}
              />
            );
          })}

          {/* Shapes are drawn as outlines only: every edge is a `segment`, so the
              figure is just its lines. Polygons stay in the scene (for future
              hit-testing) but are not filled or stroked. A selected fact is shown
              by accenting its segments and points, not by a fill. */}
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
                stroke={lit(seg.id) ? ACCENT : '#334155'}
                strokeWidth={lit(seg.id) ? stroke * 2 : stroke}
                strokeLinecap="round"
              />
            );
          })}

          {/* Unmarked crossings of declared segments: faint hollow dots, brighter
              on hover; clicking promotes one to a real named intersection point. */}
          {onPickIntersection &&
            crossings.map((x, i) => {
              const s = transform.toScreen(x.pos);
              const hot = hotCross === i;
              return (
                <circle
                  key={`x-${x.a}${x.b}-${x.c}${x.d}`}
                  data-crossing={`${x.a}${x.b}x${x.c}${x.d}`}
                  cx={s.x}
                  cy={s.y}
                  r={hot ? r * 1.5 : r * 1.1}
                  fill="#fff"
                  stroke={hot ? '#2563eb' : '#93c5fd'}
                  strokeWidth={hot ? stroke * 1.5 : stroke}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHotCross(i)}
                  onMouseLeave={() => setHotCross((h) => (h === i ? null : h))}
                  onClick={() => onPickIntersection(x)}
                >
                  {intersectionLabel && <title>{intersectionLabel}</title>}
                </circle>
              );
            })}

          {scene.points.map((pt) => {
            const s = transform.toScreen(pt.pos);
            // World→screen is uniform scale + Y-flip, so a world direction maps
            // to (dx, −dy) on screen; place the label that way along labelDir.
            const sd = unitVec({ x: pt.labelDir.x, y: -pt.labelDir.y });
            const off = r * 2.6;
            const anchor = sd.x > 0.3 ? 'start' : sd.x < -0.3 ? 'end' : 'middle';
            const baseline = sd.y > 0.3 ? 'hanging' : sd.y < -0.3 ? 'auto' : 'middle';
            return (
              <g key={pt.id} data-id={pt.id}>
                <circle cx={s.x} cy={s.y} r={lit(pt.id) ? r * 1.6 : r} fill={lit(pt.id) ? ACCENT : '#0f172a'} />
                <text
                  x={s.x + sd.x * off}
                  y={s.y + sd.y * off}
                  textAnchor={anchor}
                  dominantBaseline={baseline}
                  fontSize={fontSize}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={lit(pt.id) ? 700 : 400}
                  fill={lit(pt.id) ? '#b45309' : '#0f172a'}
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

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const unitVec = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
