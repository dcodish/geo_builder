/**
 * The pure scene builder — world → screen, with the axes as first-class furniture.
 *
 * No React here, and no engine internals: it takes a `Figure` and produces drawable primitives.
 * The renderer is a pure consumer, so it stays swappable ([docs/19 §6](../../docs/19-analytic-geometry-tool.md)).
 *
 * The transform is **isotropic and Y-flipped** — one world unit is the same number of pixels on
 * both axes, or a circle draws as an ellipse and the whole product lies about its subject.
 */
import { polylines, type Box } from '../engine/curves';
import { markPoint } from '../engine/derived';
import { fmtAnalytic } from '../format';
import type { Figure } from '../engine/evaluate';
import type { CurveKind } from '../engine/types';

export interface Transform {
  sx: (x: number) => number;
  sy: (y: number) => number;
  /** Pixels per world unit — one number, because the transform is isotropic. */
  scale: number;
}

export function makeTransform(box: Box, width: number, height: number): Transform {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const scale = Math.min(width / w, height / h);
  const ox = (width - w * scale) / 2;
  const oy = (height - h * scale) / 2;
  return {
    sx: (x) => ox + (x - box.minX) * scale,
    sy: (y) => height - oy - (y - box.minY) * scale, // Y grows upward in the world, downward on screen
    scale,
  };
}

export interface AxisTick {
  /** Screen position along the axis. */
  pos: number;
  label: string;
}

export interface SceneAxes {
  /** Screen coordinate of the world x-axis (y = 0) and y-axis (x = 0). */
  xAxisY: number;
  yAxisX: number;
  xTicks: AxisTick[];
  yTicks: AxisTick[];
}

export interface SceneCurve {
  id: string;
  kind: CurveKind;
  name: string;
  /** SVG path data — one `M…L…` run per polyline. */
  d: string;
  /**
   * A circle`s CENTRE, in screen space (#1024).
   *
   * Operator, 2026-09-15: *"we need to draw the center. in analytical geo the center is always
   * important."* Every corpus question that names a circle names its centre («ומרכזו בנקודה K»),
   * and it is the one point of a circle a student always draws by hand.
   *
   * It is a FEATURE OF THE CURVE, never a point object. Minting a `GeoObject` for it would spend a
   * letter the student is about to use and put it in the M1 id space — the defect
   * [ADR-297](../../docs/06-decisions.md#adr-297) fixed in the 2-D tree.
   */
  centre?: { cx: number; cy: number; label?: string };
}

/**
 * One coordinate as the canvas should draw it: a number the givens fixed, or the component's own
 * SYMBOL when they did not (#1032). `sub` is drawn as a real subscript.
 */
export type ScenePart = { text: string; sub?: string };

export interface ScenePoint {
  id: string;
  cx: number;
  cy: number;
  label: string;
  /**
   * The point's stated coordinates — `A(6,4)`, or `B(x_B, 0)` where only the `y` was given.
   *
   * Absent when the givens say nothing about this point: the canvas carries the QUESTION and the
   * data panel carries the ANSWER, so a point the solve determined but the student never described
   * shows its name alone (operator ruling, 2026-09-15).
   */
  coords?: [ScenePart, ScenePart];
}

/** A drawn straight piece — a stated segment or one side of a polygon (#1028), in SCREEN space. */
export interface SceneSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * The length the STUDENT stated for this segment, ready to draw at its midpoint (#1065).
   *
   * Present only when a given pinned it — «AB = 10». A length the tool DERIVED is an answer and
   * belongs in the data panel, not on the figure
   * ([ADR-AG-016](../../docs/06c-decisions-analytic.md#adr-ag-016)). The engine decides which is
   * which; this carries the text and where to put it.
   */
  label?: { text: string; x: number; y: number };
}

/** A derived point's construction, projected to screen space (#1030). Drawn dotted, behind the
 *  «הצג בנייה» toggle — the medians a student would draw to find a centroid, and the 2:1 that makes
 *  the property legible. */
export interface SceneConstruction {
  id: string;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  labels: Array<{ x: number; y: number; text: string }>;
  feet: Array<{ cx: number; cy: number }>;
}

/** One answered point-to-line distance, drawn (#1048). */
export interface SceneMeasure {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The right-angle tick at the foot, or `null` when the point is too close to the line to show one. */
  tick: string | null;
  label: { text: string; x: number; y: number } | null;
}

/** Screen-space leg length of the right-angle tick at the foot of a perpendicular. */
const RIGHT_ANGLE = 9;

export interface Scene {
  width: number;
  height: number;
  axes: SceneAxes;
  curves: SceneCurve[];
  segments: SceneSegment[];
  construction: SceneConstruction[];
  points: ScenePoint[];
  /**
   * The crossings the student could PROMOTE to a point (#1025).
   *
   * Operator, 2026-09-15: *"when a line we draw crosses another line, we need to see the dashed
   * circle allowing us to create that point"*. Each carries the SENTENCE its click would add, so the
   * renderer draws a marker and knows nothing about the grammar.
   */
  crossings: SceneCrossing[];
  /**
   * The perpendiculars an ANSWER is about (#1048), already projected — «the canvas should show the
   * height from the point to the line». Decoration: no id, nothing the student named.
   */
  measures: SceneMeasure[];
  /**
   * The מקומות גיאומטריים an answer is about (#1137), already projected — the curve a point traces
   * when the figure's remaining freedom is walked. Decoration, exactly like `measures`: no id,
   * nothing the student named, and it lives as long as the question does.
   */
  loci: SceneLocus[];
}

export interface SceneLocus {
  /** The polyline in SCREEN coordinates, ready for an SVG `path`. */
  d: string;
  /** A closed trace (circle, ellipse) is stroked as a loop; an open one stops where it stops. */
  closed: boolean;
  label: { text: string; x: number; y: number } | null;
}

export interface SceneCrossing {
  /** WHERE in the world — so a click can say which of a conic's two crossings it meant (#1096). */
  wx: number;
  wy: number;
  id: string;
  cx: number;
  cy: number;
  /** What clicking it means, in the student's own words. */
  sentence: string;
}

/**
 * A "nice" tick step — 1, 2 or 5 times a power of ten. Without this the grid labels drift into
 * things like 3.7, which no textbook axis has ever shown.
 */
export function tickStep(span: number, target = 10): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

function ticks(min: number, max: number, project: (v: number) => number): AxisTick[] {
  const step = tickStep(max - min);
  const out: AxisTick[] = [];
  const first = Math.ceil(min / step) * step;
  for (let v = first; v <= max + 1e-9; v += step) {
    if (Math.abs(v) < step / 2) continue; // the origin is labelled once, by the O marker
    // Round away the binary noise that `v += step` accumulates (0.30000000000000004).
    const r = Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(12));
    out.push({ pos: project(r), label: String(r) });
  }
  return out;
}

/**
 * What the caller knows that the FIGURE cannot know (#1024).
 *
 * Whether a value is knowledge is a question about the construction across several
 * configurations (`isKnowledge`), and a `Figure` is one configuration. So the renderer cannot ask it
 * and must not guess: without this the centre is marked and left UNLABELLED, which is the honest
 * answer rather than one sample`s coordinates printed as if they were given
 * ([ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) §2).
 */
export interface SceneKnowledge {
  /** Is this curve`s shape — and so its centre — the same in every configuration? */
  curveKnown?: (id: string) => boolean;
  /**
   * The crossings to offer, in WORLD coordinates, each with the sentence it would add (#1025).
   *
   * Handed in rather than computed here, for the same reason the knowledge gate is: deciding which
   * crossings can be NAMED is a question about the construction, and the renderer has only the
   * figure. It projects them and draws them.
   */
  crossings?: Array<{ id: string; x: number; y: number; sentence: string }>;
  /**
   * The point-to-line perpendiculars to DRAW, in world coordinates (#1048) — one per answered
   * distance. The caller owns them because they belong to the ask lane, which the renderer cannot
   * see; drawing them is all this module does with them.
   */
  marks?: Array<{ from: { x: number; y: number }; foot: { x: number; y: number }; label?: string }>;
  /**
   * The traced loci to draw, in WORLD coordinates (#1137) — the caller owns them for the same reason
   * it owns `marks`: they belong to the ask lane, which the renderer cannot see.
   */
  loci?: Array<{ points: Array<{ x: number; y: number }>; closed: boolean; label?: string }>;
}

/** Does a drawn point stand here? The centre mark's label defers to it (#1086). */
const hasPointAt = (fig: Figure, x: number, y: number): boolean =>
  fig.points.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6);

export function buildScene(
  fig: Figure,
  box: Box,
  width: number,
  height: number,
  knows: SceneKnowledge = {},
): Scene {
  const t = makeTransform(box, width, height);

  /**
   * A CARRIER is not drawn (#1076). The engine keeps it — it is what `on-curve` is solved
   * against, and the panel names it as the provenance of the point that rides it — and the figure
   * the student sees shows what the student asked for. This is the renderer's own decision, which
   * is why it lives here and not in `evaluate`.
   */
  const curves: SceneCurve[] = fig.curves.filter((c) => c.stated).map((c) => ({
    id: c.id,
    kind: c.curve.kind,
    name: c.label.name,
    d: polylines(c.curve, box)
      .map((pl) => pl.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${t.sx(x).toFixed(2)},${t.sy(y).toFixed(2)}`).join(''))
      .join(' '),
    /**
     * The centre is marked whenever there IS one, and labelled only when it is knowledge (#1024).
     *
     * Those are two different questions and they get two different answers: the mark says "this
     * circle has a centre, here", which is true at every configuration; the label states a value,
     * which may be said only when the givens fix it.
     */
    centre: c.curve.kind === 'circle'
      ? {
          cx: t.sx(c.curve.cx),
          cy: t.sy(c.curve.cy),
          /**
           * The label is the mark's only when NO point stands there (#1086).
           *
           * Operator, 2026-09-15: *"the label O hides the x value"*. A circle given by its centre
           * (ADR-AG-038) has BOTH — the mark's coordinates from #1024 and the student's own point
           * `O` from #1059 — drawn at one place, overlapping into «O, 5)».
           *
           * The POINT wins, and not by luck of ordering: a point the student named carries its own
           * label under the canvas-is-the-question rule (#1032), and a second label for the same
           * place could only ever repeat it or contradict it.
           */
          label:
            knows.curveKnown?.(c.id) &&
            !hasPointAt(fig, c.curve.cx, c.curve.cy)
              ? `(${fmtAnalytic(c.curve.cx)}, ${fmtAnalytic(c.curve.cy)})`
              : undefined,
        }
      : undefined,
  }));

  // A segment is already resolved to endpoints by `evaluate`, so this is a pure projection — the
  // renderer never looks a vertex up, which is what keeps it a consumer rather than a second
  // geometry implementation.
  const segments: SceneSegment[] = fig.segments.map((s) => {
    const x1 = t.sx(s.a.x);
    const y1 = t.sy(s.a.y);
    const x2 = t.sx(s.b.x);
    const y2 = t.sy(s.b.y);
    return {
      id: s.id,
      x1,
      y1,
      x2,
      y2,
      // Formatting is a DISPLAY concern, so it happens here and not in the engine — and it goes
      // through the shared formatter, never a local rounder (the #723 chokepoint, and #1029).
      label:
        s.pinnedLength === undefined
          ? undefined
          : { text: fmtAnalytic(s.pinnedLength), x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
    };
  });

  const construction: SceneConstruction[] = fig.construction.map((c) => ({
    id: c.id,
    lines: c.lines.map((l) => ({ x1: t.sx(l.a.x), y1: t.sy(l.a.y), x2: t.sx(l.b.x), y2: t.sy(l.b.y) })),
    labels: c.lines.flatMap((l) =>
      (l.marks ?? []).map((m) => {
        const at = markPoint(l, m.at);
        return { x: t.sx(at.x), y: t.sy(at.y), text: m.text };
      }),
    ),
    feet: c.feet.map((f) => ({ cx: t.sx(f.x), cy: t.sy(f.y) })),
  }));

  const points: ScenePoint[] = fig.points.map((p) => {
    const prov = fig.provenance[p.id];
    const part = (comp: { known: boolean; value?: number } | undefined, axis: 'x' | 'y'): ScenePart =>
      comp && comp.known ? { text: fmtAnalytic(comp.value as number) } : { text: axis, sub: p.id };
    // Shown only when the givens said SOMETHING about this point; a point described by nothing —
    // or only by a constraint shared with others — carries its name alone.
    const any = prov && (prov.x.known || prov.y.known);
    return {
      id: p.id,
      cx: t.sx(p.x),
      cy: t.sy(p.y),
      label: p.id,
      coords: any ? ([part(prov.x, 'x'), part(prov.y, 'y')] as [ScenePart, ScenePart]) : undefined,
    };
  });

  /**
   * The perpendicular, projected (#1048). The RIGHT-ANGLE tick is built here rather than in the
   * renderer because it is geometry — two short legs of equal screen length along the foot's own two
   * directions — and building it from screen vectors keeps it square at every zoom, which a
   * world-space square would not be.
   */
  const measures: SceneMeasure[] = (knows.marks ?? []).map((m) => {
    const x1 = t.sx(m.from.x);
    const y1 = t.sy(m.from.y);
    const x2 = t.sx(m.foot.x);
    const y2 = t.sy(m.foot.y);
    const dx = x1 - x2;
    const dy = y1 - y2;
    const len = Math.hypot(dx, dy) || 1;
    // Along the perpendicular, and along the line itself — the two edges of the right angle.
    const ux = (dx / len) * RIGHT_ANGLE;
    const uy = (dy / len) * RIGHT_ANGLE;
    const vx = -uy;
    const vy = ux;
    return {
      x1, y1, x2, y2,
      // Drawn only when the foot is far enough from the point for a tick to read at all.
      tick: len > RIGHT_ANGLE * 2
        ? `M${(x2 + ux).toFixed(2)},${(y2 + uy).toFixed(2)}L${(x2 + ux + vx).toFixed(2)},${(y2 + uy + vy).toFixed(2)}L${(x2 + vx).toFixed(2)},${(y2 + vy).toFixed(2)}`
        : null,
      label: m.label ? { text: m.label, x: (x1 + x2) / 2, y: (y1 + y2) / 2 } : null,
    };
  });

  /**
   * The traced loci, projected (#1137).
   *
   * Nothing is decided here — which points, and whether the curve closed, were both settled by the
   * tracer against the CONSTRUCTION, which this module cannot see. Projecting them is all it does,
   * exactly as with `measures` and `crossings`.
   *
   * The label sits at the trace's midpoint rather than its end: an open locus runs off the view, and
   * a label pinned to a point that is off-screen is a label nobody reads.
   */
  const loci: SceneLocus[] = (knows.loci ?? [])
    .filter((l) => l.points.length >= 2)
    .map((l) => {
      const pts = l.points.map((p) => [t.sx(p.x), t.sy(p.y)] as const);
      const d =
        pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join('') +
        (l.closed ? 'Z' : '');
      const mid = pts[Math.floor(pts.length / 2)];
      return { d, closed: l.closed, label: l.label ? { text: l.label, x: mid[0], y: mid[1] } : null };
    });

  const crossings: SceneCrossing[] = (knows.crossings ?? []).map((k) => ({
    id: k.id,
    wx: k.x,
    wy: k.y,
    cx: t.sx(k.x),
    cy: t.sy(k.y),
    sentence: k.sentence,
  }));

  return {
    width,
    height,
    axes: {
      xAxisY: t.sy(0),
      yAxisX: t.sx(0),
      xTicks: ticks(box.minX, box.maxX, t.sx),
      yTicks: ticks(box.minY, box.maxY, t.sy),
    },
    curves,
    segments,
    construction,
    points,
    crossings,
    measures,
    loci,
  };
}
