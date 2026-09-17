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

export function Figure({
  scene,
  showConstruction = false,
  onCrossing,
  onPick,
}: {
  scene: Scene;
  showConstruction?: boolean;
  /**
   * A crossing was clicked (#1025). The caller decides what that MEANS — this component knows only
   * that the student pointed at one, and hands back the sentence it was carrying.
   */
  /** The sentence this ring adds, and WHERE it is in the world (#1096). */
  onCrossing?: (sentence: string, at: { x: number; y: number }) => void;
  /**
   * CLICK AN OBJECT TO MEASURE IT (#1048) — the operator's *"clicking on a line itself should allow
   * us to either show the equation of the line or the distance between the two nodes"*.
   *
   * The renderer reports WHAT was clicked and WHERE on screen; which questions that object admits is
   * a matter for the construction, and belongs where the ask lane lives. A renderer that knew the
   * menu would be a second place deciding what is measurable.
   */
  onPick?: (what: { kind: 'point' | 'curve'; id: string }, screen: { x: number; y: number }) => void;
}) {
  const { width, height, axes, curves, segments, construction, points, crossings, measures, loci } = scene;
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

      {/*
        A segment's STATED length, drawn at its midpoint (#1065).

        Only lengths the student's own given pinned reach here — «AB = 10». A derived length is an
        answer and lives in the data panel instead (ADR-AG-016: the canvas shows the question). The
        text is nudged off the line so it does not sit on top of it, and carries the same paint-order
        halo the point labels use so it stays legible over a crossing side.
      */}
      <g fontSize={12} fill={INK} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3}>
        {segments
          .filter((s) => s.label)
          .map((s) => (
            <text key={`${s.id}-len`} x={s.label!.x} y={s.label!.y - 6} data-length-for={s.id}>
              {s.label!.text}
            </text>
          ))}
      </g>

      {/* curves */}
      <g fill="none" stroke={CURVE} strokeWidth={2}>
        {curves.map((c) => (
          <path key={c.id} d={c.d} data-kind={c.kind} data-id={c.id} />
        ))}
      </g>
      {/*
        THE HIT LAYER for clicking a curve (#1048). A 2px stroke is not a target anyone can hit, so
        each path is repeated transparent and fat. Separate from the drawn layer on purpose — the
        drawing keeps its exact width, and the hit area can grow without the figure getting heavier.

        `pointer-events: stroke` so only the line itself responds, not the area a closed conic
        encloses: clicking inside a circle is not clicking the circle.
      */}
      {onPick && (
        <g fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }}>
          {curves.map((c) => (
            <path
              key={`hit-${c.id}`}
              d={c.d}
              style={{ cursor: 'pointer' }}
              onClick={(e) => onPick({ kind: 'curve', id: c.id }, { x: e.clientX, y: e.clientY })}
            />
          ))}
        </g>
      )}

      {/*
        A circle's CENTRE (#1024) — operator: "in analytical geo the center is always important".

        Drawn as a cross rather than a filled dot, deliberately: a dot would read as one of the
        student's own points, and this is a feature of the circle that owns no letter.
      */}
      <g>
        {curves.map((c) =>
          c.centre ? (
            <g key={`${c.id}-centre`} data-centre={c.id}>
              <line
                x1={c.centre.cx - 4}
                y1={c.centre.cy}
                x2={c.centre.cx + 4}
                y2={c.centre.cy}
                stroke={INK}
                strokeWidth={1.5}
              />
              <line
                x1={c.centre.cx}
                y1={c.centre.cy - 4}
                x2={c.centre.cx}
                y2={c.centre.cy + 4}
                stroke={INK}
                strokeWidth={1.5}
              />
              {c.centre.label && (
                <text
                  x={c.centre.cx + 7}
                  y={c.centre.cy - 7}
                  fontSize={12}
                  fill={INK}
                  style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                >
                  {c.centre.label}
                </text>
              )}
            </g>
          ) : null,
        )}
      </g>

      {/*
        CROSSINGS the student may promote (#1025) — operator: "we need to see the dashed circle
        allowing us to create that point".

        A dashed ring, deliberately unlike the filled dot of a real point: it is an OFFER, not part of
        the figure. Drawn before the points so a real point always covers an offer at the same place.
      */}
      {/*
        THE HEIGHT FROM A POINT TO A LINE (#1048), drawn because it was ASKED for.

        Operator: *"the canvas should show the height from the point to the line"*. A distance
        reported as a number teaches nothing — the perpendicular, with its right angle at the foot,
        is the construction the student has to perform, and drawing it is what makes the number mean
        something (ADR-AG-014's principle).

        NOT behind «הצג בנייה». That toggle exists because three medians per derived point bury a
        figure; this is one segment that appears only while its question is on the panel, and hiding
        the answer to what was just asked would be the opposite of the operator's request.

        Drawn before the points, so a point always covers its own end of the perpendicular.
      */}
      {/*
        THE מקום גיאומטרי (#1137) — every position the point can take, drawn as one curve.

        BEFORE the measures and the points, so the traced curve sits behind the figure rather than
        over it: it is the answer's backdrop, not another object in the construction. Stroked in the
        scaffold colour and dashed for the same reason the perpendicular is — it is DECORATION, and a
        student must never mistake it for something they stated.
      */}
      <g data-testid="analytic-loci">
        {loci.map((l, i) => (
          <g key={`L${i}`}>
            <path
              d={l.d}
              fill="none"
              stroke={SCAFFOLD}
              strokeWidth={2}
              strokeDasharray="7 5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {l.label && (
              <text
                x={l.label.x}
                y={l.label.y}
                dx={6}
                dy={-6}
                fill={SCAFFOLD_TEXT}
                stroke="#fff"
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
                fontSize={14}
                fontWeight={700}
              >
                {l.label.text}
              </text>
            )}
          </g>
        ))}
      </g>
      <g data-testid="analytic-measures">
        {measures.map((m, i) => (
          <g key={`m${i}`}>
            <line
              x1={m.x1}
              y1={m.y1}
              x2={m.x2}
              y2={m.y2}
              stroke={SCAFFOLD}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            {m.tick && <path d={m.tick} fill="none" stroke={SCAFFOLD} strokeWidth={1.5} />}
            {m.label && (
              <text
                x={m.label.x}
                y={m.label.y}
                dx={6}
                dy={-4}
                fill={SCAFFOLD_TEXT}
                stroke="#fff"
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
                fontSize={14}
                fontWeight={700}
              >
                {m.label.text}
              </text>
            )}
          </g>
        ))}
      </g>
      <g>
        {crossings.map((k) => (
          <g key={k.id} data-crossing={k.id}>
            <title>{k.sentence}</title>
            <circle
              cx={k.cx}
              cy={k.cy}
              r={6}
              fill="#fff"
              fillOpacity={0.01}
              stroke={INK}
              strokeOpacity={0.55}
              strokeWidth={1.25}
              strokeDasharray="3 2"
              style={{ cursor: onCrossing ? 'pointer' : 'default' }}
              onClick={onCrossing ? () => onCrossing(k.sentence, { x: k.wx, y: k.wy }) : undefined}
            />
          </g>
        ))}
      </g>

      {/* points */}
      <g>
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={p.cx} cy={p.cy} r={3.5} fill={INK} />
            {/* The point's own hit ring — bigger than the dot, invisible, and only when a caller
                wants picks (#1048). */}
            {onPick && (
              <circle
                cx={p.cx}
                cy={p.cy}
                r={10}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(e) => onPick({ kind: 'point', id: p.id }, { x: e.clientX, y: e.clientY })}
              />
            )}
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
