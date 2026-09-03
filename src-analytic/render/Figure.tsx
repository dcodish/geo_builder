/**
 * The SVG surface — a thin, pure consumer of `buildScene`. All geometry decisions live in
 * `scene.ts`; this file only paints.
 *
 * The drawing carries no text direction: every position is an absolute SVG coordinate, so the
 * plane cannot be mirrored by the RTL page around it (the #118 bidi lesson has no purchase here —
 * and `dir` is not an SVG attribute, so asserting it would only have been decoration).
 */
import type { Scene } from './scene';

const AXIS = '#64748b';
const GRID = '#e2e8f0';
const INK = '#0f172a';
const CURVE = '#2563eb';

export function Figure({ scene }: { scene: Scene }) {
  const { width, height, axes, curves, points } = scene;
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="figure"
      data-testid="analytic-figure"
      // `direction: ltr` is load-bearing, not cosmetic: inherited by every <text>, it sets each
      // label's bidi base direction. Without it the RTL page made "-6" render as "6-" — the axis
      // silently lying about its own coordinates, which is the worst class of bug this tool can have.
      style={{ display: 'block', background: '#fff', direction: 'ltr' }}
    >
      {/* grid */}
      <g stroke={GRID} strokeWidth={1}>
        {axes.xTicks.map((t) => (
          <line key={`gx${t.label}`} x1={t.pos} y1={0} x2={t.pos} y2={height} />
        ))}
        {axes.yTicks.map((t) => (
          <line key={`gy${t.label}`} x1={0} y1={t.pos} x2={width} y2={t.pos} />
        ))}
      </g>

      {/* axes */}
      <g stroke={AXIS} strokeWidth={1.5}>
        <line x1={0} y1={axes.xAxisY} x2={width} y2={axes.xAxisY} />
        <line x1={axes.yAxisX} y1={0} x2={axes.yAxisX} y2={height} />
      </g>
      <g fill={AXIS} fontSize={11} fontFamily="system-ui, sans-serif">
        {axes.xTicks.map((t) => (
          <text key={`tx${t.label}`} x={t.pos} y={axes.xAxisY + 14} textAnchor="middle">
            {t.label}
          </text>
        ))}
        {axes.yTicks.map((t) => (
          <text key={`ty${t.label}`} x={axes.yAxisX - 6} y={t.pos + 4} textAnchor="end">
            {t.label}
          </text>
        ))}
        <text x={axes.yAxisX - 6} y={axes.xAxisY + 14} textAnchor="end">
          O
        </text>
      </g>

      {/* curves */}
      <g fill="none" stroke={CURVE} strokeWidth={2}>
        {curves.map((c) => (
          <path key={c.id} d={c.d} data-kind={c.kind} data-id={c.id} />
        ))}
      </g>

      {/* points */}
      <g>
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={p.cx} cy={p.cy} r={3.5} fill={INK} />
            <text
              x={p.cx + 7}
              y={p.cy - 7}
              fontSize={13}
              fontFamily="system-ui, sans-serif"
              fill={INK}
            >
              {p.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
