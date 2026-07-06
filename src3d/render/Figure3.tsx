/**
 * The 3-D canvas: a dumb SVG map over `buildScene3` output, plus view-only
 * interaction — drag to orbit, wheel to zoom, a reset-view button.
 * Orbit/zoom NEVER touch the figure (docs/20 §6.4); they live in local state,
 * outside the store and outside undo history.
 */

import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import type { Construction3, Positions3 } from '../engine/types';
import { HOME_CAMERA, MAX_PITCH, type Camera3 } from './camera';
import { buildScene3 } from './scene3';

export interface Figure3Props {
  construction: Construction3;
  positions: Positions3;
  width?: number;
  height?: number;
  /** Reset-view button label (i18n-injected so this component stays translation-free). */
  resetLabel?: string;
}

const ORBIT_SPEED = 0.011; // radians per px

/** Named vectors draw in their own colour (ADR-3D-003 Am.) so tail/head read instantly. */
const VECTOR_COLOR = '#0d9488';

export default function Figure3({ construction, positions, width = 640, height = 460, resetLabel = 'reset view' }: Figure3Props) {
  const [cam, setCam] = useState<Camera3>(HOME_CAMERA);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const scene = useMemo(
    () => buildScene3(construction, positions, cam, { width, height }, zoom),
    [construction, positions, cam, width, height, zoom],
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
        {scene.vectors.map((v) => (
          <g key={v.name} data-testid={`vec-${v.name}`}>
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
            {/* the name in textbook vector notation: arrow above + underline (ADR-3D-003) */}
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
