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
/** The construction is deliberately QUIETER than the figure: it is scaffolding a student reads,
 *  not part of the answer. Same hue, lighter, dashed. */
const SCAFFOLD = '#94a3b8';
/** The RATIO label is the teaching content, not context, so it is darker and larger than the lines
 *  it sits on — ADR-AG-010 R34 makes legibility at projection size a design condition for exactly
 *  this surface. */
const SCAFFOLD_TEXT = '#475569';

export function Figure({ scene, showConstruction = false }: { scene: Scene; showConstruction?: boolean }) {
  const { width, height, axes, curves, segments, construction, points } = scene;
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

      {/* construction — the medians, altitudes or bisectors that DEFINE a derived point (#1030).
          Drawn first so the figure proper sits on top of it, and only when asked for: the operator's
          ruling is a toggle, because three medians per derived point buries a real figure. */}
      {showConstruction && (
        <g data-testid="analytic-construction">
          <g stroke={SCAFFOLD} strokeWidth={1.5} strokeDasharray="5 4" fill="none">
            {construction.flatMap((c) =>
              c.lines.map((l, i) => (
                <line key={`${c.id}-l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
              )),
            )}
          </g>
          {/* The feet — a median's landing point on the opposite side. Hollow, so they read as
              scaffolding rather than as points the student named. */}
          <g fill="#fff" stroke={SCAFFOLD} strokeWidth={1.5}>
            {construction.flatMap((c) =>
              c.feet.map((f, i) => <circle key={`${c.id}-f${i}`} cx={f.cx} cy={f.cy} r={3} />),
            )}
          </g>
          {/* Painted stroke-then-fill so the label carries its own white halo: a ratio sitting on
              its own dashed median was legible on a laptop and muddy on a projector. */}
          <g
            fill={SCAFFOLD_TEXT}
            stroke="#fff"
            strokeWidth={4}
            strokeLinejoin="round"
            paintOrder="stroke"
            fontSize={15}
            fontWeight={700}
            textAnchor="middle"
          >
            {construction.flatMap((c) =>
              c.labels.map((l, i) => (
                <text key={`${c.id}-t${i}`} x={l.x} y={l.y - 6}>
                  {l.text}
                </text>
              )),
            )}
          </g>
        </g>
      )}

      {/* segments — stated segments and polygon sides (#1028). Drawn BEFORE the curves and points so
          a vertex dot and a curve both sit on top of the ink rather than under it. */}
      <g stroke={CURVE} strokeWidth={2} strokeLinecap="round">
        {segments.map((s) => (
          <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} data-id={s.id} />
        ))}
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
            {/*
              The label carries the point's STATED givens — `A(6,4)`, or `B(x_B, 0)` where only the
              `y` was given (#1032). What the solve derived stays in the data panel: the canvas is
              the question, the panel is the answer.

              Subscripts are <tspan> with a reduced size and a baseline offset, not MathML: MathML
              inside SVG needs <foreignObject>, is unevenly supported, and would not survive the
              image export this product already has. The rendered result is the same subscript.
            */}
            <text
              x={p.cx + 7}
              y={p.cy - 7}
              fontSize={13}
              fontFamily="system-ui, sans-serif"
              fill={INK}
              // A coordinate label lands ON the ink it describes — B sits on the axis, D on its own
              // segment. The halo is what keeps it readable at projection size (ADR-AG-010 R34),
              // the same treatment the construction ratios needed.
              stroke="#fff"
              strokeWidth={3}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {p.label}
              {p.coords && (
                <>
                  <tspan>(</tspan>
                  {p.coords.map((part, i) => (
                    <tspan key={i}>
                      {i > 0 && <tspan>, </tspan>}
                      <tspan fontStyle={part.sub ? 'italic' : undefined}>{part.text}</tspan>
                      {part.sub && (
                        <tspan fontSize={9} dy={3}>
                          {part.sub}
                        </tspan>
                      )}
                      {part.sub && <tspan dy={-3} />}
                    </tspan>
                  ))}
                  <tspan>)</tspan>
                </>
              )}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
