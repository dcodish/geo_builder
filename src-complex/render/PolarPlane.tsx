/**
 * A dumb SVG map over {@link buildScene}'s output. It computes no geometry.
 *
 * That split is not stylistic: 2-D records the same defect four times (ADR-044, 201, 380, 423), the
 * sharpest of which says *"a circle's drawn extent was RENDERER-ONLY knowledge … no requirement or
 * sampling mechanism could have restricted anything to the ink, because the engine could not even ask
 * the question."* The engine owns what exists; this file owns where the ink goes.
 *
 * The `direction: ltr` on the `<svg>` root is deliberate and set once (ADR-3D-150): the plane is a
 * mathematical frame, not prose, and per-node opt-in isolates are what the sibling trees kept getting
 * wrong.
 */

import type { Scene } from '../scene/scene';

const W = 680;
const H = 620;

/** Stated values are solid and dark; sampled ones are dashed and muted — the honesty is visual. */
const INK = { known: '#4c1d95', sampled: '#a78bfa', grid: '#e7e5e4', axis: '#78716c', faint: '#a8a29e' };

const polar = (r: number, deg: number): [number, number] => {
  const t = (deg * Math.PI) / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
};

export function PolarPlane({ scene, showGrid = true }: { scene: Scene; showGrid?: boolean }) {
  const k = Math.min(W, H) / 2 / scene.extent;
  const X = (x: number) => W / 2 + x * k;
  const Y = (y: number) => H / 2 - y * k;

  /** An SVG arc from `fromDeg` to `toDeg` at radius `r`, the short way round when under a half turn. */
  const arcPath = (r: number, fromDeg: number, toDeg: number): string => {
    const [x0, y0] = polar(r, fromDeg);
    const [x1, y1] = polar(r, toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${X(x0)} ${Y(y0)} A ${r * k} ${r * k} 0 ${large} 0 ${X(x1)} ${Y(y1)}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gauss-plane" style={{ direction: 'ltr' }}>
      <rect width={W} height={H} fill="#fafaf9" />

      {showGrid && (
        <g>
          {/* concentric rings — constant modulus, the polar answer to a cartesian grid line */}
          {scene.grid.rings.map((r) => (
            <circle key={`ring${r}`} cx={X(0)} cy={Y(0)} r={r * k} fill="none" stroke={INK.grid} strokeWidth={1} />
          ))}
          {/* angular rays — constant argument */}
          {scene.grid.rays.map((d) => {
            const [x, y] = polar(scene.extent, d);
            return <line key={`ray${d}`} x1={X(0)} y1={Y(0)} x2={X(x)} y2={Y(y)} stroke={INK.grid} strokeWidth={1} />;
          })}
          {scene.grid.rings.map((r) => (
            <text key={`rl${r}`} x={X(r) + 3} y={Y(0) - 4} fontSize={10} fill={INK.faint}>
              {r}
            </text>
          ))}
          {scene.grid.rays
            .filter((d) => d % 90 !== 0)
            .map((d) => {
              const [x, y] = polar(scene.extent * 0.94, d);
              return (
                <text key={`rd${d}`} x={X(x)} y={Y(y)} fontSize={9} fill={INK.faint} textAnchor="middle">
                  {d}°
                </text>
              );
            })}
        </g>
      )}

      {/* axes */}
      <line x1={0} y1={Y(0)} x2={W} y2={Y(0)} stroke={INK.axis} strokeWidth={1.5} />
      <line x1={X(0)} y1={0} x2={X(0)} y2={H} stroke={INK.axis} strokeWidth={1.5} />
      <text x={W - 16} y={Y(0) - 6} fontSize={12} fill={INK.axis}>Re</text>
      <text x={X(0) + 6} y={14} fontSize={12} fill={INK.axis}>Im</text>
      <text x={X(0) - 12} y={Y(0) + 15} fontSize={12} fill={INK.axis}>O</text>

      {/* modulus rings: where else this magnitude could sit */}
      {scene.rings.map((ring) => (
        <circle
          key={`mod${ring.r}`}
          cx={X(0)}
          cy={Y(0)}
          r={ring.r * k}
          fill="none"
          stroke={ring.known ? INK.known : INK.sampled}
          strokeOpacity={0.3}
          strokeWidth={1.2}
          strokeDasharray={ring.known ? undefined : '5 4'}
        />
      ))}

      {/* stated objects (F6): segments, polygons, circles — under the numbers, so a vertex label
          always sits on top of the edge that meets it */}
      {scene.shapes.map((sh) =>
        sh.radius !== undefined && sh.center ? (
          <circle
            key={sh.key}
            cx={X(sh.center.re)}
            cy={Y(sh.center.im)}
            r={sh.radius * k}
            fill="none"
            stroke={sh.known ? INK.known : INK.sampled}
            strokeWidth={1.8}
            strokeDasharray={sh.known ? undefined : '6 4'}
          />
        ) : (
          <polyline
            key={sh.key}
            points={(sh.closed ? [...sh.vertices, sh.vertices[0]] : sh.vertices)
              .map((v) => `${X(v.re)},${Y(v.im)}`)
              .join(' ')}
            fill="none"
            stroke={sh.known ? INK.known : INK.sampled}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeDasharray={sh.known ? undefined : '6 4'}
          />
        ),
      )}

      {/* argument arcs: the direction, drawn as an angle */}
      {scene.arcs.map((a) => {
        const [lx, ly] = polar(a.radius * 1.12, a.toDeg / 2);
        return (
          <g key={`arc${a.name}`}>
            <path
              d={arcPath(a.radius, a.fromDeg, a.toDeg)}
              fill="none"
              stroke={a.known ? INK.known : INK.sampled}
              strokeWidth={1.5}
              strokeDasharray={a.known ? undefined : '4 3'}
            />
            <text x={X(lx)} y={Y(ly)} fontSize={11} fill={a.known ? INK.known : INK.sampled} textAnchor="middle">
              {a.label}
            </text>
          </g>
        );
      })}

      {/* radius vectors: the magnitude, drawn as a length */}
      {scene.radii.map((r) => (
        <line
          key={`rad${r.name}`}
          x1={X(0)}
          y1={Y(0)}
          x2={X(r.to.re)}
          y2={Y(r.to.im)}
          stroke={r.known ? INK.known : INK.sampled}
          strokeWidth={2}
          strokeDasharray={r.known ? undefined : '6 4'}
        />
      ))}

      {/* the numbers themselves */}
      {scene.points.map((p) => {
        const left = p.z.re < 0;
        return (
          <g key={p.name}>
            <circle cx={X(p.z.re)} cy={Y(p.z.im)} r={6} fill={INK.known} stroke="#fff" strokeWidth={1.5} />
            <text
              x={X(p.z.re) + (left ? -10 : 10)}
              y={Y(p.z.im) + (p.z.im >= 0 ? -10 : 18)}
              fontSize={13}
              fontWeight={600}
              fill={INK.known}
              textAnchor={left ? 'end' : 'start'}
              style={{ userSelect: 'none' }}
            >
              {p.reading}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
