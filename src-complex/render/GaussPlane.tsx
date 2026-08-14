// Pure SVG Gauss-plane renderer for the C0 prototype: axes, grid, numbers as position
// vectors (D3: always visualize), root constellations with their circle, drag on free numbers.
import { useCallback, useRef } from 'react';
import { cx, formatCart, formatPolar, type Cx } from '../engine/complex';
import type { Scene } from '../engine/model';

const W = 680;
const H = 620;

const niceStep = (raw: number): number => {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};

const KIND_COLOR: Record<string, string> = {
  free: '#c2410c',
  def: '#1d4ed8',
  root: '#7c3aed',
};

interface Props {
  scene: Scene;
  view: 'cart' | 'polar';
  onDragFree: (name: string, z: Cx) => void;
}

export function GaussPlane({ scene, view, onDragFree }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragName = useRef<string | null>(null);

  // world extent: origin + every point + every root circle, padded, isotropic
  let ext = 3;
  for (const p of scene.points) ext = Math.max(ext, Math.abs(p.z.re), Math.abs(p.z.im));
  for (const c of scene.circles) ext = Math.max(ext, c.r);
  ext *= 1.25;
  const k = Math.min(W, H) / 2 / ext; // px per unit
  const toX = (x: number) => W / 2 + x * k;
  const toY = (y: number) => H / 2 - y * k;
  const fromScreen = useCallback(
    (clientX: number, clientY: number): Cx => {
      const rect = svgRef.current!.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * W;
      const sy = ((clientY - rect.top) / rect.height) * H;
      return cx((sx - W / 2) / k, (H / 2 - sy) / k);
    },
    [k],
  );

  const step = niceStep((2 * ext) / 8);
  const gridLines: number[] = [];
  for (let v = step; v <= ext; v += step) gridLines.push(v, -v);

  const fmt = view === 'cart' ? formatCart : formatPolar;

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragName.current) onDragFree(dragName.current, fromScreen(e.clientX, e.clientY));
  };
  const endDrag = (e: React.PointerEvent) => {
    dragName.current = null;
    (e.target as Element).hasPointerCapture?.(e.pointerId) &&
      (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="gauss-plane"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <rect width={W} height={H} fill="#fafaf9" />
      {gridLines.map((v) => (
        <g key={`g${v}`} stroke="#e7e5e4" strokeWidth={1}>
          <line x1={toX(v)} y1={0} x2={toX(v)} y2={H} />
          <line x1={0} y1={toY(v)} x2={W} y2={toY(v)} />
        </g>
      ))}
      {/* axes */}
      <line x1={0} y1={toY(0)} x2={W} y2={toY(0)} stroke="#78716c" strokeWidth={1.5} />
      <line x1={toX(0)} y1={0} x2={toX(0)} y2={H} stroke="#78716c" strokeWidth={1.5} />
      <text x={W - 14} y={toY(0) - 6} fontSize={13} fill="#57534e">Re</text>
      <text x={toX(0) + 6} y={14} fontSize={13} fill="#57534e">Im</text>
      <text x={toX(0) - 14} y={toY(0) + 16} fontSize={13} fill="#57534e">O</text>
      {gridLines
        .filter((v) => v > 0)
        .map((v) => (
          <g key={`t${v}`} fontSize={11} fill="#a8a29e">
            <text x={toX(v) - 4} y={toY(0) + 14}>{v}</text>
            <text x={toX(-v) - 8} y={toY(0) + 14}>-{v}</text>
            <text x={toX(0) + 5} y={toY(v) + 4}>{v}</text>
            <text x={toX(0) + 5} y={toY(-v) + 4}>-{v}</text>
          </g>
        ))}
      {/* root circles */}
      {scene.circles.map((c) => (
        <circle
          key={c.factId}
          cx={toX(0)}
          cy={toY(0)}
          r={c.r * k}
          fill="none"
          stroke={KIND_COLOR.root}
          strokeOpacity={0.35}
          strokeDasharray="6 5"
        />
      ))}
      {/* numbers as position vectors */}
      {scene.points.map((p) => {
        const px = toX(p.z.re);
        const py = toY(p.z.im);
        const color = KIND_COLOR[p.kind];
        const labelLeft = p.z.re < 0;
        return (
          <g key={p.key}>
            <line
              x1={toX(0)}
              y1={toY(0)}
              x2={px}
              y2={py}
              stroke={color}
              strokeOpacity={p.kind === 'root' ? 0.45 : 0.7}
              strokeWidth={1.4}
            />
            <circle
              cx={px}
              cy={py}
              r={p.kind === 'root' ? 4.5 : 6}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
              style={p.freeName ? { cursor: 'grab' } : undefined}
              onPointerDown={
                p.freeName
                  ? (e) => {
                      dragName.current = p.freeName!;
                      (e.target as Element).setPointerCapture(e.pointerId);
                    }
                  : undefined
              }
            />
            <text
              x={px + (labelLeft ? -10 : 10)}
              y={py + (p.z.im >= 0 ? -10 : 18)}
              fontSize={13.5}
              fontWeight={600}
              fill={color}
              textAnchor={labelLeft ? 'end' : 'start'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {p.label} = {fmt(p.z)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
