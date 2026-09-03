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
import { RadicalTspans } from './radicalText';

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

/** #722 — the ENRICHMENT layers, opt-in (operator: "I don't need all the values... all the
 *  dashed lines, the different colors — make it much simpler"). The DEFAULT canvas draws points,
 *  their radius arrows, stated regions and the grid; each S5 visualization layer renders only
 *  when its toggle is on. */
export interface CanvasLayers {
  /** #886 — the origin-to-point radius arrows. Opt-in since 2026-09-03: they were the last enrichment
   *  left in the default canvas, and the operator withdrew them ("it should only draw the points").
   *  A student who wants ONE of them writes «Oz2», which draws that segment and always did. */
  radii?: boolean;
  rings?: boolean; // «where else this magnitude could sit» circles
  angles?: boolean; // the stated/derived angle arcs near the origin
  rotations?: boolean; // multiplication-as-rotation sweeps
  cycles?: boolean; // the power-cycle ring and its stations
  series?: boolean; // the series spirals / partial sums
}

export function PolarPlane({
  scene,
  showGrid = true,
  mode = 'polar',
  layers = {},
  labels,
  zoom = 1,
  empty = false,
}: {
  scene: Scene;
  showGrid?: boolean;
  /** #703 — the view the toggle promises: 'polar' = rings/rays + cis readings; 'cart' = an x/y
   *  grid + a+bi readings. The prototype's cartesian Gauss plane died at the cutover with the
   *  toggle's cartesian half; this restores it inside the ONE canvas. */
  mode?: 'polar' | 'cart';
  layers?: CanvasLayers;
  labels: PlaneLabels;
  /** #742 / ADR-W-024: the corner cluster's zoom factor — multiplies the auto-fit scale. View
   *  state, so it lives in the HOST's local state (docs/20 §6.4), never in the store. */
  zoom?: number;
  /** #742: an EMPTY canvas is blank white like every builder's — the grid/axes appear with the
   *  first point (the empty-state overlay used to sit on a full coordinate plane, colliding). */
  empty?: boolean;
}) {
  const k = (Math.min(W, H) / 2 / scene.extent) * zoom;
  if (empty) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="gauss-plane" style={{ direction: 'ltr' }}>
        <rect width={W} height={H} fill="#fafaf9" />
      </svg>
    );
  }
  const X = (x: number) => W / 2 + x * k;
  const Y = (y: number) => H / 2 - y * k;
  const cart = mode === 'cart';
  /** The cartesian gridline positions — the same nice step the rings use, mirrored to negatives. */
  const cartSteps = (() => {
    if (!cart) return [];
    const step = scene.grid.rings[0] ?? 1;
    const out: number[] = [];
    for (let v = step; v <= scene.extent; v += step) out.push(v, -v);
    return out;
  })();

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

      {showGrid && !cart && (
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
      {cart && (
        <g data-testid="cart-grid">
          {/* #703 — the CARTESIAN grid: x/y gridlines at the same nice step the rings use, with
              numeric ticks on both axes (the Im ticks read as multiples of i on the axis). */}
          {cartSteps.map((v) => (
            <line key={`gx${v}`} x1={X(v)} y1={0} x2={X(v)} y2={H} stroke={INK.grid} strokeWidth={1} />
          ))}
          {cartSteps.map((v) => (
            <line key={`gy${v}`} x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke={INK.grid} strokeWidth={1} />
          ))}
          {cartSteps.map((v) => (
            <text key={`tx${v}`} x={X(v) + 2} y={Y(0) + 12} fontSize={10} fill={INK.faint}>
              {v}
            </text>
          ))}
          {cartSteps.map((v) => (
            <text key={`ty${v}`} x={X(0) + 4} y={Y(v) - 2} fontSize={10} fill={INK.faint}>
              {v}i
            </text>
          ))}
        </g>
      )}

      {/* axes */}
      <line x1={0} y1={Y(0)} x2={W} y2={Y(0)} stroke={INK.axis} strokeWidth={1.5} />
      <line x1={X(0)} y1={0} x2={X(0)} y2={H} stroke={INK.axis} strokeWidth={1.5} />
      <text x={W - 16} y={Y(0) - 6} fontSize={12} fill={INK.axis}>Re</text>
      <text x={X(0) + 6} y={14} fontSize={12} fill={INK.axis}>Im</text>
      <text x={X(0) - 12} y={Y(0) + 15} fontSize={12} fill={INK.axis}>O</text>

      {/* modulus rings: where else this magnitude could sit — the rings LAYER (#722, opt-in) */}
      {layers.rings && scene.rings.map((ring) => (
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

      {/* argument arcs: the direction, drawn as an angle — the angles LAYER (#722, opt-in) */}
      {layers.angles && scene.arcs.map((a) => {
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

      {/* radius vectors: the magnitude, drawn as a length. #886 — OPT-IN: withdrawn from the default
          canvas, because the per-point form «Oz2» was always available and is the one a student
          reasons with. The scene still BUILDS them (like every other layer); only the ink is gated. */}
      {layers.radii && scene.radii.map((r) => (
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

      {/* the series pictures — the series LAYER (#722, opt-in) */}
      {layers.series && scene.spirals.map((sp) => (
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

      {/* multiplication as rotation — the rotations LAYER (#722, opt-in) */}
      {layers.rotations && scene.rotations.map((r) => {
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

      {/* the value cycle — the cycles LAYER (#722, opt-in) */}
      {layers.cycles && scene.cycles.map((c) => (
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

      {/* the numbers themselves. #701 — the label PLACER: clamp into the viewport (w's label ran
          off-screen; anchor flips near the edges so the text extends inward) and nudge collisions
          apart (clustered points stacked their labels on one spot). Greedy: place in point order,
          push a colliding label down in 16px steps. */}
      {(() => {
        const placed: Array<{ x: number; y: number }> = [];
        return scene.points.map((p) => {
          const left = p.z.re < 0;
          let x = X(p.z.re) + (left ? -10 : 10);
          let y = Y(p.z.im) + (p.z.im >= 0 ? -10 : 18);
          const nearRight = x > W - 150;
          const nearLeft = x < 150;
          const anchor: 'start' | 'end' = nearRight ? 'end' : nearLeft ? 'start' : left ? 'end' : 'start';
          x = Math.min(Math.max(x, 8), W - 8);
          y = Math.min(Math.max(y, 14), H - 8);
          for (let guard = 0; guard < 8; guard++) {
            const hit = placed.find((q) => Math.abs(q.x - x) < 140 && Math.abs(q.y - y) < 15);
            if (!hit) break;
            y = Math.min(y + 16, H - 8);
            if (y >= H - 8) break;
          }
          placed.push({ x, y });
          return (
          <g key={p.name}>
            <circle cx={X(p.z.re)} cy={Y(p.z.im)} r={6} fill={INK.known} stroke="#fff" strokeWidth={1.5} />
            <text
              x={x}
              y={y}
              fontSize={13}
              fontWeight={600}
              fill={INK.known}
              textAnchor={anchor}
              style={{ userSelect: 'none' }}
            >
              {/* B6 follow-up (operator, 2026-08-18): the reading RETURNS to the canvas — with the
                  panel hidden it is the only check that z₁ landed right. The no-guess ruling makes
                  it safe: `readingOf` now composes a value only when the givens determine it, so an
                  undetermined point's reading IS the bare name — nothing sampled is ever printed.
                  (#653/#675: one source, two surfaces — both print stage 5d's composition.)
                  #703: the reading FOLLOWS THE VIEW — a+bi in the cartesian lens. */}
              {/* #727: the radical INDEX is drawn as a real digit, raised — the Unicode superscript
                  was hairline at this size and read as the retired ~ mark. */}
              <RadicalTspans text={cart ? p.readingCart : p.reading} />
            </text>
          </g>
          );
        });
      })()}
    </svg>
  );
}
