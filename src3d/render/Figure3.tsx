/**
 * The 3-D canvas: a dumb SVG map over `buildScene3` output, plus view-only
 * interaction — drag to orbit, wheel to zoom, a reset-view button.
 * Orbit/zoom NEVER touch the figure (docs/20 §6.4); they live in local state,
 * outside the store and outside undo history.
 */

import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import type { PlaneDisplayMode3Map } from '../store/figureFile3';
import type { Resolved3 } from '../engine/evaluate';
import type { Construction3 } from '../engine/types';
import { HOME_CAMERA, MAX_PITCH, type Camera3 } from './camera';
import { buildScene3 } from './scene3';

export interface Figure3Props {
  construction: Construction3;
  resolved: Resolved3;
  width?: number;
  height?: number;
  /** Reset-view button label (i18n-injected so this component stays translation-free). */
  resetLabel?: string;
  /** id → coordinate label drawn under the point letter (the organize-your-data
   *  toggle). Knowledge only — a value identical in every sampled configuration;
   *  '?' marks a free component. Undetermined points carry no label (ADR-3D-030 Am.). */
  coordLabels?: Record<string, { text: string; kind: 'fact' | 'partial' }>;
  /** #318 + #395: per-plane patch display — 'face' draws a named plane's patch as exactly its
   *  defining polygon, 'hidden' draws no patch at all; absent = 'full' (the growing patch). */
  planeDisplay?: PlaneDisplayMode3Map;
  /** #397 (ADR-3D-108): draw the closest-point witness of every stated distance. Default true. */
  showWitnesses?: boolean;
}

/** Per-index plane patch colours (translucent — patches never occlude, docs/20 §11). */
const PLANE_COLORS = ['#0284c7', '#7c3aed', '#d97706'];

const ORBIT_SPEED = 0.011; // radians per px

/** Named vectors draw in their own colour (ADR-3D-003 Am.) so tail/head read instantly. */
const VECTOR_COLOR = '#0d9488';

/** Bidi-isolate a MATH string (coordinates, equations) so the RTL document can't visually
 *  reorder it — `(0, 7, 6)` used to render as `(6 ,7 ,0)` on the canvas (LRI…PDI). */
const ltr = (s: string) => `⁦${s}⁩`;

export default function Figure3({ construction, resolved, width = 640, height = 460, resetLabel = 'reset view', coordLabels, planeDisplay, showWitnesses = true }: Figure3Props) {
  const [cam, setCam] = useState<Camera3>(HOME_CAMERA);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const scene = useMemo(
    () => buildScene3(construction, resolved, cam, { width, height }, zoom, planeDisplay, showWitnesses),
    [construction, resolved, cam, width, height, zoom, planeDisplay, showWitnesses],
  );

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setCam((c) => ({
      yaw: c.yaw - dx * ORBIT_SPEED,
      pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, c.pitch + dy * ORBIT_SPEED)),
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: RWheelEvent<SVGSVGElement>) => {
    setZoom((z) => Math.max(0.3, Math.min(4, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
  };

  return (
    <div className="relative" data-testid="figure3">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="rounded-xl border border-slate-200 bg-white touch-none cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        {scene.axes.map((a) => (
          <g key={a.axis} data-testid={`axis-${a.axis}`}>
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#cbd5e1" strokeWidth={1.1} />
            <text x={a.labelX} y={a.labelY} fontSize={13} fontStyle="italic" fill="#94a3b8" textAnchor="middle" dominantBaseline="middle">
              {a.axis}
            </text>
          </g>
        ))}
        {scene.planes.map((p, i) => (
          <g key={p.name} data-testid={`plane-${p.name}`}>
            <polygon
              points={p.corners.map((c) => `${c.x},${c.y}`).join(' ')}
              fill={PLANE_COLORS[i % PLANE_COLORS.length]}
              fillOpacity={0.1}
              stroke={PLANE_COLORS[i % PLANE_COLORS.length]}
              strokeOpacity={0.35}
              strokeWidth={1}
            />
            <text
              x={p.labelX}
              y={p.labelY}
              fontSize={14}
              fill={PLANE_COLORS[i % PLANE_COLORS.length]}
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {p.name}
            </text>
          </g>
        ))}
        {scene.curves.map((cu, i) => (
          <polyline
            key={`curve-${i}`}
            points={cu.pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={cu.hidden ? '#94a3b8' : '#1e293b'}
            strokeWidth={cu.hidden ? 1.2 : 1.6}
            strokeDasharray={cu.hidden ? '7 5' : undefined}
            strokeLinecap="round"
          />
        ))}
        {scene.seams.map((s, i) => (
          <line
            key={`seam-${i}`}
            data-testid="seam"
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="#64748b"
            strokeWidth={1.2}
          />
        ))}
        {/* #397 (ADR-3D-108): the stated distance's WITNESS — dashed height/gap + its value.
            Dashed here means AUXILIARY, drawn in its own colour so it never reads as a hidden
            edge (the ADR-3D-104 lesson about dash semantics). */}
        {scene.witnesses.map((w, i) => (
          <g key={`witness-${i}`} data-testid="distance-witness">
            <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#d97706" strokeWidth={1.6} strokeDasharray="5 4" strokeLinecap="round" />
            <text x={w.labelX} y={w.labelY} fontSize={12} fill="#b45309" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
              {ltr(w.text)}
            </text>
          </g>
        ))}
        {scene.angles.map((a, i) => (
          <g key={`angle-${i}`} data-testid="plane-angle">
            <polyline
              points={a.pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#d97706"
              strokeWidth={1.5}
            />
            <text
              x={a.labelX}
              y={a.labelY}
              fontSize={13.5}
              fill="#b45309"
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {a.text}
            </text>
          </g>
        ))}
        {scene.lines.map((l) => (
          <g key={l.name} data-testid={`line-${l.name}`}>
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#475569" strokeWidth={1.5} />
            <text
              x={l.labelX}
              y={l.labelY}
              fontSize={12.5}
              fill="#475569"
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ltr(l.form)}
            </text>
          </g>
        ))}
        {scene.marks.map((m, i) => (
          <polyline
            key={i}
            points={m.pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#1e293b"
            strokeWidth={1.1}
          />
        ))}
        {scene.edges.map((e) => (
          <line
            key={e.id}
            data-testid={e.id}
            data-hidden={e.hidden ? 'true' : 'false'}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.hidden ? '#94a3b8' : '#1e293b'}
            strokeWidth={e.hidden ? 1.3 : 1.7}
            strokeDasharray={e.hidden ? '7 5' : undefined}
            strokeLinecap="round"
          />
        ))}
        {scene.vectors.map((v, vi) => (
          <g key={v.name || `arrow-${vi}`} data-testid={`vec-${v.name || `arrow-${vi}`}`}>
            {/* the vector itself, in its own colour: tail→head overlay, ARROWHEAD AT THE HEAD (`to`) */}
            <line
              x1={v.x1}
              y1={v.y1}
              x2={v.x2}
              y2={v.y2}
              stroke={VECTOR_COLOR}
              strokeWidth={2}
              strokeDasharray={v.hidden ? '7 5' : undefined}
              strokeLinecap="round"
            />
            <path
              d="M 0 0 L -9 -4.5 L -9 4.5 Z"
              transform={`translate(${v.x2} ${v.y2}) rotate(${v.angleDeg})`}
              fill={VECTOR_COLOR}
            />
            {/* the name in textbook vector notation: arrow above + underline (ADR-3D-003) —
                an UNNAMED ink arrow (#72 `חץ A'C`) draws no label */}
            {v.name && (
              <g transform={`translate(${v.labelX} ${v.labelY})`}>
                <text
                  x={0}
                  y={0}
                  fontSize={15}
                  fontStyle="italic"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fill={VECTOR_COLOR}
                  stroke="#ffffff"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {v.name}
                </text>
                <line x1={-6} y1={-11} x2={6.5} y2={-11} stroke={VECTOR_COLOR} strokeWidth={1.2} />
                <path d="M 6.5 -11 l -3.5 -2.3 M 6.5 -11 l -3.5 2.3" stroke={VECTOR_COLOR} strokeWidth={1.2} fill="none" strokeLinecap="round" />
                <line x1={-6} y1={9} x2={6} y2={9} stroke={VECTOR_COLOR} strokeWidth={1.2} />
              </g>
            )}
          </g>
        ))}
        {scene.points.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={3} fill="#0f172a" />
            <text
              x={p.x + p.labelDx}
              y={p.y + p.labelDy}
              fontSize={15}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill="#0f172a"
              stroke="#ffffff"
              strokeWidth={3.5}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {p.label}
            </text>
            {coordLabels?.[p.id] && (
              <text
                x={p.x + p.labelDx}
                y={p.y + p.labelDy + 13}
                fontSize={11}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fill="#0369a1"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {ltr(coordLabels[p.id].text)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <button
        type="button"
        aria-label={resetLabel}
        title={resetLabel}
        className="absolute top-2 end-2 rounded-lg border border-slate-300 bg-white/90 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        onClick={() => {
          setCam(HOME_CAMERA);
          setZoom(1);
        }}
      >
        ↺
      </button>
    </div>
  );
}
