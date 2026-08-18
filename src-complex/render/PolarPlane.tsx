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
const INK = {
  known: '#4c1d95',
  sampled: '#a78bfa',
  grid: '#e7e5e4',
  axis: '#78716c',
  faint: '#a8a29e',
  series: '#0f766e',
  rotation: '#b45309',
  cycle: '#1d4ed8',
  region: '#4c1d95',
};

/**
 * Every WORD this file prints, injected.
 *
 * The renderer is bilingual by not knowing which language it is in: a Hebrew string spelled here would
 * be a translation living outside `i18n/`, and RTL Hebrew is the product default (ADR-3D-001 §9). Math
 * text — `√2`, `45°`, `×2` — is not translated and arrives on the scene primitives, composed at
 * stage 5d where the numbers are.
 */
export interface PlaneLabels {
  readonly ratio: string;
  readonly limit: string;
  readonly closed: string;
}

const polar = (r: number, deg: number): [number, number] => {
  const t = (deg * Math.PI) / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
};

export function PolarPlane({
  scene,
  showGrid = true,
  labels,
}: {
  scene: Scene;
  showGrid?: boolean;
  labels: PlaneLabels;
}) {
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

      {/* regions (F12): the shaded interior goes down FIRST, so every later stroke sits on top of it */}
      {scene.regions.map((rg) => (
        <polygon
          key={rg.key}
          points={rg.vertices.map((v) => `${X(v.re)},${Y(v.im)}`).join(' ')}
          fill={INK.region}
          fillOpacity={rg.known ? 0.08 : 0.05}
          stroke="none"
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

      {/* the series pictures: the spiral through the terms, and the partial sums head to tail */}
      {scene.spirals.map((sp) => (
        <g key={sp.key}>
          <polyline
            points={sp.path.map((z) => `${X(z.re)},${Y(z.im)}`).join(' ')}
            fill="none"
            stroke={INK.series}
            strokeWidth={2}
            strokeOpacity={sp.known ? 0.9 : 0.5}
            strokeDasharray={sp.known ? undefined : '6 4'}
          />
          {sp.stepLabel && sp.path.length > 0 && (
            <text
              x={X(sp.path[Math.floor(sp.path.length / 2)].re) + 8}
              y={Y(sp.path[Math.floor(sp.path.length / 2)].im) - 8}
              fontSize={11}
              fill={INK.series}
            >
              {labels.ratio} {sp.stepLabel}
            </text>
          )}
        </g>
      ))}

      {scene.chains.map((ch) => (
        <g key={ch.key}>
          <polyline
            points={ch.vertices.map((z) => `${X(z.re)},${Y(z.im)}`).join(' ')}
            fill="none"
            stroke={INK.series}
            strokeWidth={1.5}
            strokeOpacity={0.75}
            strokeDasharray="2 3"
          />
          {ch.vertices.slice(1).map((z, i) => (
            <circle key={`${ch.key}-s${i}`} cx={X(z.re)} cy={Y(z.im)} r={3} fill={INK.series} />
          ))}
          {ch.limit && (
            <g>
              <circle
                cx={X(ch.limit.re)}
                cy={Y(ch.limit.im)}
                r={5}
                fill="none"
                stroke={INK.series}
                strokeWidth={1.5}
              />
              <text x={X(ch.limit.re) + 8} y={Y(ch.limit.im) + 4} fontSize={10} fill={INK.series}>
                {labels.limit}
              </text>
            </g>
          )}
          {ch.closes && (
            <text x={X(0) + 8} y={Y(0) + 16} fontSize={10} fill={INK.series}>
              {labels.closed}
            </text>
          )}
        </g>
      ))}

      {/* multiplication as rotation: the sweep from the number to its product, with the stretch */}
      {scene.rotations.map((r) => {
        const [lx, ly] = polar(r.radius * 1.06, (r.fromDeg + r.toDeg) / 2);
        return (
          <g key={r.key}>
            <path
              d={arcPath(r.radius, r.fromDeg, r.toDeg)}
              fill="none"
              stroke={INK.rotation}
              strokeWidth={2}
              strokeOpacity={r.known ? 0.95 : 0.55}
              strokeDasharray={r.known ? undefined : '5 4'}
            />
            <text x={X(lx)} y={Y(ly)} fontSize={11} fill={INK.rotation} textAnchor="middle">
              {r.turnLabel} {r.scaleLabel}
            </text>
          </g>
        );
      })}

      {/* the value cycle: the finite ring of directions a power visits, and where n is standing */}
      {scene.cycles.map((c) => (
        <g key={`cycle-${c.name}`}>
          <circle
            cx={X(0)}
            cy={Y(0)}
            r={c.radius * k}
            fill="none"
            stroke={INK.cycle}
            strokeWidth={1}
            strokeOpacity={0.4}
          />
          {c.powers.map((z, i) => (
            <circle
              key={`cy-${c.name}-${i}`}
              cx={X(z.re)}
              cy={Y(z.im)}
              r={i === c.current ? 6 : 3.5}
              fill={i === c.current ? INK.cycle : '#fff'}
              stroke={INK.cycle}
              strokeWidth={1.5}
            />
          ))}
          {c.powers.map((z, i) => (
            <text
              key={`cyl-${c.name}-${i}`}
              x={X(z.re * 1.12)}
              y={Y(z.im * 1.12) + 4}
              fontSize={10}
              fill={INK.cycle}
              textAnchor="middle"
            >
              {i + 1}
            </text>
          ))}
        </g>
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
              {/* B6 (#671, operator's de-clutter ruling): the canvas carries the NAME only — the
                  full reading (value, ~ marks) lives in the data panel's points section. Both still
                  print what derive2's stage 5d composed (#653/#675: one source, two surfaces). */}
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
