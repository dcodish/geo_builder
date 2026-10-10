/**
 * The pure scene builder — world → screen, with the axes as first-class furniture.
 *
 * No React here, and no engine internals: it takes a `Figure` and produces drawable primitives.
 * The renderer is a pure consumer, so it stays swappable ([docs/19 §6](../../docs/archive/19-analytic-geometry-tool.md)).
 *
 * The transform is **isotropic and Y-flipped** — one world unit is the same number of pixels on
 * both axes, or a circle draws as an ellipse and the whole product lies about its subject.
 */
import { polylines, type Box } from '../engine/curves';
import { markPoint } from '../engine/derived';
import { fmtAnalytic } from '../format';
import { analyticBidi } from '../i18n/bidi';
import type { Figure } from '../engine/evaluate';
import type { CurveKind } from '../engine/types';
import { tickStep } from '../../shell/ticks';
import { segInk, type SegDisplayMap, type SegInk } from '../../shell/frame/segmentDisplay';
import { angleArcPoints, equalTickSegments, markFitScale, rightAngleKnee, unitOf, wedgeBisector, type MarkPt } from '../../shell/marks';
import type { StatedMeasures, StatedValue } from '../engine/statedMeasures';

/**
 * THE KEY A SEGMENT'S DISPLAY IS FILED UNDER (#1653) — its two endpoint letters, unordered.
 *
 * Not the scene id: a polygon side's id (`polygon-ABC-0`) and a stated segment's (`seg-AB`) are two ids
 * for one visible line, and both change when the polygon is restated. The endpoint pair is what the
 * student sees and names, it survives a rename by relabelling (`relabelSegKey`), and a side drawn twice
 * hides as one line.
 */
export const segKey = (ends: readonly [string, string]): string => [...ends].sort().join('|');

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
   * The length the STUDENT stated for this segment, ready to draw at its midpoint (#1065) — a number
   * («AB = 10») or their own letter («AB = 3a», #1714).
   *
   * Present only when a given stated it. A length the tool DERIVED is an answer and belongs in the data
   * panel, not on the figure ([ADR-AG-016](../../docs/06c-decisions-analytic.md#adr-ag-016)). The
   * stated-measure layer (`engine/statedMeasures.ts`) decides which is which; this carries the text and the
   * label's CENTRE, placed clear of every other label by `placeSceneLabels` (#1717, #1714).
   */
  label?: { text: string; x: number; y: number };
  /** #1653 — the display key (`segKey` of its endpoints) and how it is inked (`shell`'s `segInk`). */
  key: string;
  ink: SegInk;
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

/**
 * Where a point's label is drawn relative to its dot, and at what size (#1717). `Figure.tsx` paints from these and
 * the length-label placement below measures against them, so the two can never disagree about where a label is.
 */
export const POINT_LABEL = { dx: 7, dy: -7, font: 13 } as const;
/** A stated length's font size (#1065). */
export const LENGTH_LABEL_FONT = 12;
/** The axis tick labels' font size and their offsets from the axes — furniture a length label must not cover either. */
export const TICK_LABEL = { font: 11, below: 14, left: 6 } as const;

/** An axis-aligned screen box. */
export interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A text's width, estimated from its glyph count. The scene has no font metrics to ask — the renderer lays the
 * label out as SVG — and an estimate is the honest instrument for the one question asked here: do two labels
 * overlap. The 0.6 em per glyph is 2-D's own estimate (`labelScale` in `src/render/scene.ts`).
 */
const textWidth = (chars: number, font: number): number => Math.max(1, chars) * font * 0.6;

/** The box a point's label covers: name, then its stated coordinates when it has any (subscripts at 9px). */
export function pointLabelBox(p: ScenePoint): LabelBox {
  const f = POINT_LABEL.font;
  let w = textWidth(p.label.length, f);
  let sub = false;
  if (p.coords) {
    // «(» + «, » + «)», each part's own text, and a subscript at its own smaller size
    w += textWidth(4, f);
    for (const part of p.coords) {
      w += textWidth(part.text.length, f);
      if (part.sub) {
        w += textWidth(part.sub.length, 9);
        sub = true;
      }
    }
  }
  const x0 = p.cx + POINT_LABEL.dx;
  const base = p.cy + POINT_LABEL.dy;
  return { x0, y0: base - f * 0.8, x1: x0 + w, y1: base + f * 0.25 + (sub ? 3 : 0) };
}

const overlaps = (a: LabelBox, b: LabelBox): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

type ScreenLine = { x1: number; y1: number; x2: number; y2: number };
/** Does a drawn line pass through the box? Liang–Barsky clipping of the segment against it. */
const crosses = (l: ScreenLine, b: LabelBox): boolean => {
  let t0 = 0;
  let t1 = 1;
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const edges: Array<[number, number]> = [
    [-dx, l.x1 - b.x0],
    [dx, b.x1 - l.x1],
    [-dy, l.y1 - b.y0],
    [dy, b.y1 - l.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
};

/** The clear gap between a segment and its length label, and the step taken outward while the label still collides. */
const LENGTH_GAP = 4;
const LENGTH_STEP = 4;
const LENGTH_MAX_STEPS = 12;

/**
 * WHERE A STATED LENGTH IS WRITTEN (#1717) — 2-D's value-label rule, COPIED (`src/render/scene.ts`, ADR-031 / #126:
 * «a length sits at its segment's midpoint, nudged perpendicular to the OUTSIDE, away from the figure's centroid»),
 * plus the step this canvas needs and 2-D's does not.
 *
 * Operator, corpus 9/4: *"AO=3 is not created"* — it was, but its «3» sat at AO's midpoint 6px up, inside A's own
 * label, and read «A(x_A, 0)3». A point label here carries the point's stated coordinates, so it is several times
 * wider than 2-D's single letter, and any short segment, or any segment ending at a labelled point, put the two on
 * top of each other. **The class: a length label was placed with no knowledge of the other labels.** So, from the
 * outward side's first clear position, the label steps along the normal until its box clears every point label,
 * every point dot, every axis tick label, every drawn segment and every length label already placed; when the outward side never
 * clears, the inward side is tried; when neither does, it keeps the outward first position — still drawn, never
 * dropped (a stated given stays visible).
 *
 * The returned position is the label's CENTRE; `Figure.tsx` centres the text on it.
 */
export function placeLengthLabels(
  segs: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number; text: string }>,
  points: readonly ScenePoint[],
  furniture: readonly LabelBox[] = [],
  lines: readonly ScreenLine[] = [],
): Array<{ x: number; y: number }> {
  return placeSceneLabels(lengthRequests(segs, points), points, furniture, lines);
}

/**
 * ONE LABEL TO PLACE (#1714, on #1717's placement): an anchor, the unit direction it steps along, and its text.
 * `reach` (default: the box's own half-extent along `n` plus the gap) is where the first try sits from the anchor —
 * 0 for a label that belongs ON its anchor (an area at its centroid). `both` also tries the opposite direction when
 * the first never clears; `tie` takes whichever side clears in fewer steps (a segment with no outside, #1717).
 */
export interface LabelRequest {
  mid: { x: number; y: number };
  n: { x: number; y: number };
  text: string;
  reach?: number;
  both?: boolean;
  tie?: boolean;
  /**
   * #1733 (ADR-AG-228): an explicit, BOUNDED list of centres to try in order, instead of stepping along `n`. A value
   * bound to a mark (an angle's arc, an area's ring, an arc's band) never leaves the region where it reads as that
   * mark's, so its candidates are all inside that region; when none is clear it takes the first that covers no
   * point label, else the first — a slight overlap with a lower-priority label beats a label that has wandered off.
   */
  candidates?: ReadonlyArray<{ x: number; y: number }>;
  /** Placement order (lower first, stable); a later label yields to an earlier one. Angle values 0, lengths 1, the rest 2. */
  priority?: number;
  /** A drawn line this label may cross — an angle value over its OWN arms, as 2-D writes it (the white halo keeps it legible). */
  mayCross?: (l: ScreenLine) => boolean;
}

/** A stated length's request: its midpoint, stepping along the OUTWARD normal (#1717's rule, unchanged). */
function lengthRequests(
  segs: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number; text: string }>,
  points: readonly ScenePoint[],
): LabelRequest[] {
  const cen = points.length
    ? { x: points.reduce((s, p) => s + p.cx, 0) / points.length, y: points.reduce((s, p) => s + p.cy, 0) / points.length }
    : { x: 0, y: 0 };
  return segs.map((s) => {
    const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const l = Math.hypot(dx, dy) || 1;
    let n = { x: -dy / l, y: dx / l };
    const out = (mid.x - cen.x) * n.x + (mid.y - cen.y) * n.y;
    // A segment through the centroid (9/4's AO, on the axis the rectangle straddles) has no outside. Its two sides
    // tie, and a sign read off float noise would flip the label between configurations of ONE figure; so a tie
    // takes a fixed orientation and then the side that clears in the fewer steps.
    const tie = Math.abs(out) < 0.5;
    if (tie) {
      if (n.y < 0 || (n.y === 0 && n.x < 0)) n = { x: -n.x, y: -n.y };
    } else if (out < 0) n = { x: -n.x, y: -n.y }; // outward
    return { mid, n, text: s.text, both: true, tie };
  });
}

/**
 * THE ONE LABEL PLACEMENT OF THE CANVAS (#1717, widened by #1714): every stated value — a length, an angle's value,
 * an area's «S=…», an arc's value — is placed HERE, in order, each clear of every point label, point dot, axis label
 * row, drawn segment and every label placed before it. From its first position the label steps along `n` until
 * its box clears; with `both`, the opposite side is tried when that never clears; when nothing clears it keeps its
 * first position — still drawn, never dropped (a stated given stays visible). Returns each label's CENTRE.
 */
export function placeSceneLabels(
  reqs: readonly LabelRequest[],
  points: readonly ScenePoint[],
  furniture: readonly LabelBox[] = [],
  lines: readonly ScreenLine[] = [],
): Array<{ x: number; y: number }> {
  const obstacles: LabelBox[] = [
    ...points.map(pointLabelBox),
    ...points.map((p) => ({ x0: p.cx - 4, y0: p.cy - 4, x1: p.cx + 4, y1: p.cy + 4 })),
    ...furniture,
  ];
  /** A point's label and dot — the one thing a label may never cover, whatever its priority. */
  const hard = obstacles.slice(0, points.length * 2);
  // #1733: a higher-priority label is placed first, so a lower one yields to it (2-D's rule at a crowded vertex: the
  // angle value stays at its angle, and the length moves).
  const order = reqs.map((_, i) => i).sort((a, b) => (reqs[a].priority ?? 1) - (reqs[b].priority ?? 1) || a - b);
  const out: Array<{ x: number; y: number }> = new Array(reqs.length);
  for (const i of order) out[i] = placeOne(reqs[i]);
  return out;

  function placeOne(r: LabelRequest): { x: number; y: number } {
    const { mid, n, tie = false } = r;
    // the bidi isolates (`lbl`) are invisible, so they take no width
    const hw = textWidth(r.text.replace(/[\u2066-\u2069]/g, '').length, LENGTH_LABEL_FONT) / 2;
    const hh = LENGTH_LABEL_FONT / 2;
    // the box's own half-extent along the normal, so the first position clears the anchor whatever its slope
    const reach = r.reach ?? hw * Math.abs(n.x) + hh * Math.abs(n.y) + LENGTH_GAP;
    // the box the glyphs actually ink: Figure.tsx writes the text 0.35em below the centre, so a cap reaches 0.45em above
    // it and a descender 0.6em below (the 0.8/0.25 em split every label box here uses)
    const boxAt = (c: { x: number; y: number }): LabelBox => ({ x0: c.x - hw, y0: c.y - 0.45 * LENGTH_LABEL_FONT, x1: c.x + hw, y1: c.y + 0.6 * LENGTH_LABEL_FONT });
    const at = (side: 1 | -1, k: number) => {
      const d = (reach + k * LENGTH_STEP) * side;
      return { x: mid.x + n.x * d, y: mid.y + n.y * d };
    };
    const firstClear = (side: 1 | -1): { k: number; c: { x: number; y: number } } | null => {
      for (let k = 0; k <= LENGTH_MAX_STEPS; k += 1) {
        const c = at(side, k);
        const b = boxAt(c);
        if (!obstacles.some((o) => overlaps(o, b)) && !lines.some((l) => crosses(l, b))) return { k, c };
      }
      return null;
    };
    if (r.candidates && r.candidates.length > 0) {
      const clear = (c: { x: number; y: number }) => {
        const b = boxAt(c);
        return !obstacles.some((o) => overlaps(o, b)) && !lines.some((l) => !r.mayCross?.(l) && crosses(l, b));
      };
      const pos =
        r.candidates.find(clear) ?? r.candidates.find((c) => !hard.some((o) => overlaps(o, boxAt(c)))) ?? r.candidates[0];
      obstacles.push(boxAt(pos));
      return pos;
    }
    const outward = firstClear(1);
    const inward = r.both && (!outward || tie) ? firstClear(-1) : null;
    const best = outward && (!inward || !tie || outward.k <= inward.k) ? outward : inward;
    const pos = best ? best.c : at(1, 0);
    obstacles.push(boxAt(pos));
    return pos;
  }
}

export interface Scene {
  width: number;
  height: number;
  axes: SceneAxes;
  curves: SceneCurve[];
  segments: SceneSegment[];
  /** The drawn arcs (#1622 E4) — a semicircle, a quarter circle, a sector — as SVG path data in screen space. */
  arcs: SceneArc[];
  construction: SceneConstruction[];
  /**
   * #1937/#1971 (ADR-AG-255) — the DASHED extensions, projected: a construction point that lands off the drawn ink
   * (a height's foot beyond its side, a concave quadrilateral's diagonal meet) has its carrying line extended to it.
   * Decoration — no id, no hit-target — and ALWAYS drawn, unlike `construction`, which waits for «הצג בנייה».
   */
  extensions: Array<{ x1: number; y1: number; x2: number; y2: number }>;
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
  /**
   * THE STUDENT'S STATED MEASURES, drawn (#1714, ADR-AG-225) — 2-D's stated-measure layer: an arc and the value
   * at a stated angle, a knee at a stated right angle, ticks and arcs on a stated equality, the value on a stated
   * arc and inside a stated area. A stated length rides its segment's `label` instead, where it always has.
   */
  stated: SceneStated;
}

/** The stated-measure layer in screen space (#1714). Geometry from `shell/marks`, the planar kit 2-D draws with. */
export interface SceneStated {
  /** Arcs and knees as SVG path data: `angle` a value's arc, `right` a knee, `equal` one ring of an equal-angle mark. */
  marks: Array<{ kind: 'angle' | 'right' | 'equal'; d: string }>;
  /** Equal-length hatch ticks. */
  ticks: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** The values, already placed: an angle's beside its arc, an arc's on the arc, an area's at the centroid, and a
   *  stated length whose segment is not drawn, at its midpoint. */
  labels: Array<{ kind: 'angle' | 'arc' | 'area' | 'length'; text: string; x: number; y: number }>;
}

/** The stated angle arc's radius, in px — shrunk by `markFitScale` when the corner has no room (#1337's rule). */
export const STATED_ARC_PX = 18;
/** #1733: an angle's value is never farther from its vertex than this many arc radii — beyond it, it reads as another mark's. */
export const ANGLE_LABEL_BOUND = 2.5;
/** A stated right angle's knee leg, in px. */
export const STATED_KNEE_PX = 10;

/** A drawn arc (#1622 E4, ADR-AG-220), projected — its bounding radii included when the arc carries them. */
export interface SceneArc {
  id: string;
  d: string;
}

/** Steps per full turn when an arc is drawn as a polyline — the curves' own density. */
const ARC_STEPS = 96;

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
  /** #1598 — set on an unnamed circle's CENTRE offer: the circle's id. Its click asks for a letter. */
  centreOf?: string;
}

// #1465 (ADR-W-094): the nice-step rule lives in shell/ticks, shared with the complex Builder's grid
export { tickStep };

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
  crossings?: Array<{ id: string; x: number; y: number; sentence: string; centreOf?: string }>;
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
  loci?: Array<{ points: Array<{ x: number; y: number }>; closed: boolean; starts?: number[]; label?: string }>;
  /**
   * The student's per-segment display choices (#1653), keyed by {@link segKey} — the store's record,
   * handed in like the others. A hidden segment is still in the figure; only its ink goes.
   */
  segStyle?: SegDisplayMap;
  /**
   * What the student STATED about a measure (#1714, ADR-AG-225) — `Derivation.stated`, handed in like the
   * knowledge gates: which constraint is a statement is a question about the fold, which the renderer cannot see.
   */
  stated?: StatedMeasures;
}

/** Does a drawn point stand here? The centre mark's label defers to it (#1086). */
const hasPointAt = (fig: Figure, x: number, y: number): boolean =>
  fig.points.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6);

/**
 * THE CANVAS'S BIDI CHOKEPOINT (#1191) — every label text this module produces goes through here.
 *
 * Operator, playing the locus lane: a perpendicular bisector labelled `ישר · 4y = −3x + 25` rendered
 * on the canvas as
 *
 * ```
 * 4 · ישר y = −3x + 25
 * ```
 *
 * The equation the tool computed was right; the equation the student READ was not one. The root
 * `<svg>` sets `direction: ltr`, so the paragraph level is LTR; the `·` sits between a Hebrew word and
 * a European Number, UBA N1 resolves that neutral to RTL and I1 lifts the digit above the base level,
 * so `4 · ישר` reorders as one unit and the rest of the equation is left stranded. Only an equation
 * that STARTS with a digit scrambles — `(x − 16)² + y² = 625`, `y² = 8x` and `x = 4` all begin with a
 * strong-L character — which is why the locus lane's own circle demo survived the build.
 *
 * This is the class `Figure.tsx`'s header comment calls *"the worst class of bug this tool can have"*:
 * the canvas silently lying about a number. The panel row for the same value was already correct — it
 * goes through this very kit — and the canvas was simply a second display surface that never adopted
 * it. The whole renderer contained ONE bidi call, on the circle-centre label, which could not have
 * helped: the scramble is INSIDE the string, not around it.
 *
 * Applied here rather than at the call sites, and deliberately not by reordering the label or dropping
 * the `·`: that would hide the class and leave the next Hebrew-carrying canvas label to break —
 * `measures[].label` is fed from the same `Answer.value` through the same unisolated `<text>` and is
 * one Hebrew word away from the identical defect. `buildScene` already declares (#723/#1029) that
 * formatting is a DISPLAY concern that happens here, and it is the single place every canvas label is
 * produced, so no call site can forget and a label added later is isolated by construction.
 *
 * SVG `<text>` honours U+2066/U+2069 natively — ADR-431 Am. 1's Word exception is about `.docx`, not
 * the browser.
 */
const lbl = (text: string): string => analyticBidi.isolateLtrRuns(text);

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
              ? lbl(`(${fmtAnalytic(c.curve.cx)}, ${fmtAnalytic(c.curve.cy)})`)
              : undefined,
        }
      : undefined,
  }));

  // A segment is already resolved to endpoints by `evaluate`, so this is a pure projection — the
  // renderer never looks a vertex up, which is what keeps it a consumer rather than a second
  // geometry implementation.
  /** #1714: the stated lengths, by segment key — each written once, on the segment that carries it. */
  const statedLength = new Map((knows.stated?.lengths ?? []).map((l) => [segKey([l.a, l.b]), l.value] as const));
  const projected: SceneSegment[] = fig.segments.map((s) => {
    const x1 = t.sx(s.a.x);
    const y1 = t.sy(s.a.y);
    const x2 = t.sx(s.b.x);
    const y2 = t.sy(s.b.y);
    const key = segKey(s.ends);
    return {
      id: s.id,
      x1,
      y1,
      x2,
      y2,
      key,
      ink: segInk(knows.segStyle?.[key]),
      // Formatting is a DISPLAY concern, so it happens here and not in the engine — and it goes
      // through the shared formatter, never a local rounder (the #723 chokepoint, and #1029).
      label: statedLength.has(key)
        ? { text: lbl(valueText(statedLength.get(key)!)), x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
        : undefined,
    };
  });
  // A side drawn twice (a polygon side and a stated segment) carries its length ONCE.
  const written = new Set<string>();
  for (const s of projected) {
    if (!s.label) continue;
    if (written.has(s.key)) s.label = undefined;
    else written.add(s.key);
  }

  /**
   * The arcs, projected (#1622 E4). Sampled in WORLD space and then transformed, like every curve, so the isotropic
   * Y-flip turns the counter-clockwise world sweep into what the student sees without a second convention here.
   */
  const arcs: SceneArc[] = (fig.arcs ?? []).map((a) => {
    const n = Math.max(2, Math.ceil((Math.abs(a.sweep) / (2 * Math.PI)) * ARC_STEPS));
    const pts: string[] = [];
    for (let i = 0; i <= n; i += 1) {
      const th = a.start + (a.sweep * i) / n;
      pts.push(`${t.sx(a.cx + a.r * Math.cos(th)).toFixed(2)},${t.sy(a.cy + a.r * Math.sin(th)).toFixed(2)}`);
    }
    const centre = `${t.sx(a.cx).toFixed(2)},${t.sy(a.cy).toFixed(2)}`;
    const d = a.radii ? `M${centre}L${pts.join('L')}L${centre}` : `M${pts.join('L')}`;
    return { id: a.id, d };
  });

  const construction: SceneConstruction[] = fig.construction.map((c) => ({
    id: c.id,
    lines: c.lines.map((l) => ({ x1: t.sx(l.a.x), y1: t.sy(l.a.y), x2: t.sx(l.b.x), y2: t.sy(l.b.y) })),
    labels: c.lines.flatMap((l) =>
      (l.marks ?? []).map((m) => {
        const at = markPoint(l, m.at);
        return { x: t.sx(at.x), y: t.sy(at.y), text: lbl(m.text) };
      }),
    ),
    feet: c.feet.map((f) => ({ cx: t.sx(f.x), cy: t.sy(f.y) })),
  }));

  const points: ScenePoint[] = fig.points.map((p) => {
    const prov = fig.provenance[p.id];
    /**
     * A STATED EXPRESSION BEATS THE INVENTED SYMBOL (#1230).
     *
     * Operator, playing T44: *"the data panel is now correct but canvas is not"* — the panel read
     * `A = (-9·a, 0)` while the canvas beside it still read `A(x_A, 0)`. #1226 fixed one surface and
     * scoped this one out on the belief that the canvas showed the name alone; his screenshot shows
     * it does not.
     *
     * `x_A` is the tool's own symbol standing in for something the student wrote, which is worse than
     * showing nothing. A number is still never printed for an open coordinate.
     */
    const part = (
      comp: { known: boolean; value?: number; expr?: string } | undefined,
      axis: 'x' | 'y',
    ): ScenePart =>
      comp && comp.known
        ? { text: fmtAnalytic(comp.value as number) }
        : comp?.expr
          ? { text: comp.expr }
          : { text: axis, sub: p.id };
    // Shown when the givens said SOMETHING about this point — a number OR an expression the student
    // wrote. A point described by nothing, or only by a constraint shared with others, carries its
    // name alone.
    const any = prov && (prov.x.known || prov.y.known || !!prov.x.expr || !!prov.y.expr);
    return {
      id: p.id,
      cx: t.sx(p.x),
      cy: t.sy(p.y),
      label: p.id,
      coords: any ? ([part(prov.x, 'x'), part(prov.y, 'y')] as [ScenePart, ScenePart]) : undefined,
    };
  });

  /**
   * The stated lengths' labels, placed now that every point label exists to be avoided (#1717).
   *
   * The axes' numbers are furniture a length label must not join, and not only by overlap: a «3» standing in the row
   * of tick numbers under the x-axis READS as a tick (measured on 9/4's first cut, where AO's «3» landed between «−2»
   * and «O»). So each axis's whole label row is one obstacle band — the x-axis's row of numbers under it, the y-axis's
   * column to its left, the O marker where they meet.
   */
  const xAxisY = t.sy(0);
  const yAxisX = t.sx(0);
  const xTicks = ticks(box.minX, box.maxX, t.sx);
  const yTicks = ticks(box.minY, box.maxY, t.sy);
  const tf = TICK_LABEL.font;
  const FAR = 1e6;
  const rowY = xAxisY + TICK_LABEL.below;
  const colR = yAxisX - TICK_LABEL.left;
  const colW = Math.max(1, ...yTicks.map((k) => k.label.length));
  const furniture: LabelBox[] = [
    { x0: -FAR, y0: rowY - tf * 0.8, x1: FAR, y1: rowY + tf * 0.25 },
    { x0: colR - textWidth(colW, tf), y0: -FAR, x1: colR, y1: FAR },
  ];
  const labelled = projected.filter((s) => s.label);
  // #1714: the stated-measure layer's marks, and its labels as REQUESTS — placed in the same call as the lengths, so
  // one placement keeps every stated value clear of every other (#1717's rule, one path).
  const statedDraft = statedScene(fig, t, knows.stated, projected);
  const placed = placeSceneLabels(
    [...lengthRequests(labelled.map((s) => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, text: s.label!.text })), points), ...statedDraft.requests],
    points,
    furniture,
    projected.filter((s) => s.ink !== 'ghost'),
  );
  const placedOf = new Map(labelled.map((s, i) => [s, placed[i]] as const));
  const segments: SceneSegment[] = projected.map((s) => {
    const at = placedOf.get(s);
    return at && s.label ? { ...s, label: { ...s.label, x: at.x, y: at.y } } : s;
  });
  const stated: SceneStated = {
    marks: statedDraft.marks,
    ticks: statedDraft.ticks,
    labels: statedDraft.requests.map((r, i) => ({ kind: statedDraft.kinds[i], text: r.text, ...placed[labelled.length + i] })),
  };

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
    // Along the perpendicular, and along the line itself — the knee's two rays (`shell/marks`, #1714).
    const along = { x: x2 - dy / len, y: y2 + dx / len };
    return {
      x1, y1, x2, y2,
      // Drawn only when the foot is far enough from the point for a tick to read at all.
      tick: len > RIGHT_ANGLE * 2 ? pathOf(rightAngleKnee({ x: x2, y: y2 }, { x: x1, y: y1 }, along, RIGHT_ANGLE)) : null,
      label: m.label ? { text: lbl(m.label), x: (x1 + x2) / 2, y: (y1 + y2) / 2 } : null,
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
      // A stroke begins at 0 and at every `starts` index: the pen lifts across a stretch the givens exclude (#1817).
      const lift = new Set(l.starts ?? []);
      const d =
        pts.map(([x, y], i) => `${i === 0 || lift.has(i) ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join('') +
        (l.closed ? 'Z' : '');
      const mid = pts[Math.floor(pts.length / 2)];
      return { d, closed: l.closed, label: l.label ? { text: lbl(l.label), x: mid[0], y: mid[1] } : null };
    });

  const crossings: SceneCrossing[] = (knows.crossings ?? []).map((k) => ({
    id: k.id,
    wx: k.x,
    wy: k.y,
    cx: t.sx(k.x),
    cy: t.sy(k.y),
    sentence: k.sentence,
    ...(k.centreOf ? { centreOf: k.centreOf } : {}),
  }));

  return {
    width,
    height,
    stated,
    axes: { xAxisY, yAxisX, xTicks, yTicks },
    curves,
    segments,
    arcs,
    construction,
    extensions: (fig.extensions ?? []).map((e) => ({ x1: t.sx(e.a.x), y1: t.sy(e.a.y), x2: t.sx(e.b.x), y2: t.sy(e.b.y) })),
    points,
    crossings,
    measures,
    loci,
  };
}

/** Screen points as SVG path data, at the scene's two-decimal precision. */
const pathOf = (ps: readonly MarkPt[]): string =>
  ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');

/** A stated value as written: a number through the shared formatter (#723), or the student's own text. */
const valueText = (v: StatedValue, unit = ''): string => ('num' in v ? `${fmtAnalytic(v.num)}${unit}` : v.text);

/**
 * WHERE AN ANGLE'S VALUE MAY GO (#1733, ADR-AG-228) — every candidate within {@link ANGLE_LABEL_BOUND} arc radii of
 * the vertex, in the order the issue's plan gives:
 * 1. on the bisector, just outside the arc, then inside it, then further out to the bound;
 * 2. rotated about the vertex by ±25° and ±50° — only while still inside the angle's span;
 * 3. on the reflex side, just outside the arc.
 */
function angleCandidates(c: { V: MarkPt; A: MarkPt; B: MarkPt }, r: number): Array<{ x: number; y: number }> {
  const u = wedgeBisector(c.V, c.A, c.B);
  const half = angleBetween(c.V, c.A, c.B) / 2;
  const base = Math.atan2(u.y, u.x);
  const bound = ANGLE_LABEL_BOUND * Math.max(r, 8);
  const at = (th: number, d: number) => ({ x: c.V.x + Math.cos(th) * d, y: c.V.y + Math.sin(th) * d });
  const radii: number[] = [Math.min(r + 9, bound), r * 0.55];
  for (let d = r + 15; d <= bound; d += 6) radii.push(d);
  const out: Array<{ x: number; y: number }> = radii.map((d) => at(base, d));
  for (const deg of [25, -25, 50, -50]) {
    const rot = (deg * Math.PI) / 180;
    if (Math.abs(rot) >= half) continue;
    for (const d of radii) out.push(at(base + rot, d));
  }
  out.push(at(base + Math.PI, Math.min(r + 9, bound)));
  return out;
}

/** Does a drawn line end at `v` — one of the arms of an angle there? */
const endsAt = (v: MarkPt) => (l: ScreenLine): boolean =>
  Math.hypot(l.x1 - v.x, l.y1 - v.y) < 0.5 || Math.hypot(l.x2 - v.x, l.y2 - v.y) < 0.5;

/** The interior angle at `v`, in radians (screen space keeps it: the transform is isotropic). */
function angleBetween(v: MarkPt, a: MarkPt, b: MarkPt): number {
  const ax = a.x - v.x;
  const ay = a.y - v.y;
  const bx = b.x - v.x;
  const by = b.y - v.y;
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
}

/** Is `p` inside the ring (even-odd)? */
function inRing(p: { x: number; y: number }, ring: readonly MarkPt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The stated layer before placement: its marks, and its labels as requests for `placeSceneLabels`. */
interface StatedDraft {
  marks: SceneStated['marks'];
  ticks: SceneStated['ticks'];
  requests: LabelRequest[];
  kinds: Array<SceneStated['labels'][number]['kind']>;
}

/**
 * THE STATED-MEASURE LAYER, projected (#1714, ADR-AG-225). The engine said WHAT was stated; this places it, every
 * shape through `shell/marks`, so an analytic arc, knee and tick are 2-D's. Positions come from the figure; a mark
 * whose point is absent at this configuration is skipped, never drawn at a guess.
 */
function statedScene(
  fig: Figure,
  t: Transform,
  stated: StatedMeasures | undefined,
  segments: readonly SceneSegment[],
): StatedDraft {
  const out: StatedDraft = { marks: [], ticks: [], requests: [], kinds: [] };
  if (!stated) return out;
  const ask = (kind: SceneStated['labels'][number]['kind'], r: LabelRequest) => {
    out.requests.push(r);
    out.kinds.push(kind);
  };
  const at = (id: string): MarkPt | null => {
    const p = fig.points.find((q) => q.id === id);
    return p ? { x: t.sx(p.x), y: t.sy(p.y) } : null;
  };
  /** The corner's three screen points and the scale its marks fit at — the shortest adjacent side (#1337). */
  const corner = (v: string, a: string, b: string) => {
    const V = at(v);
    const A = at(a);
    const B = at(b);
    if (!V || !A || !B) return null;
    const room = Math.min(Math.hypot(A.x - V.x, A.y - V.y), Math.hypot(B.x - V.x, B.y - V.y));
    if (room < 1e-6) return null;
    return { V, A, B, k: markFitScale(room, STATED_ARC_PX) };
  };

  for (const r of stated.rights) {
    // A foot's knee runs along its line toward the FARTHER of its two named points (#1241) — a foot on an endpoint
    // (a right angle at C) still has the other end to draw toward.
    const V = at(r.v);
    const far = (id: string) => { const p = at(id); return V && p ? Math.hypot(p.x - V.x, p.y - V.y) : -1; };
    const b = r.alt !== undefined && far(r.alt) > far(r.b) ? r.alt : r.b;
    const c = corner(r.v, r.a, b);
    if (c) out.marks.push({ kind: 'right', d: pathOf(rightAngleKnee(c.V, c.A, c.B, STATED_KNEE_PX * c.k)) });
  }
  for (const g of stated.angles) {
    const c = corner(g.v, g.a, g.b);
    if (!c) continue;
    const r = STATED_ARC_PX * c.k;
    out.marks.push({ kind: 'angle', d: pathOf(angleArcPoints(c.V, c.A, c.B, r)) });
    // The value sits just OUTSIDE its own arc, along the wedge bisector (2-D's `angleValueOffset`), stepping further
    // out while it collides (one placement, #1717).
    const u = wedgeBisector(c.V, c.A, c.B);
    ask('angle', { mid: { x: c.V.x + u.x * r, y: c.V.y + u.y * r }, n: u, text: lbl(valueText(g.value, '°')), candidates: angleCandidates(c, r), priority: 0, mayCross: endsAt(c.V) });
  }
  // Equal angles: concentric rings, one per class count, outside a value arc at the same corner.
  for (const g of stated.equalAngles) {
    const c = corner(g.v, g.a, g.b);
    if (!c) continue;
    for (let j = 0; j < g.count; j += 1) {
      out.marks.push({ kind: 'equal', d: pathOf(angleArcPoints(c.V, c.A, c.B, (STATED_ARC_PX + 5 + 3 * j) * c.k)) });
    }
  }
  for (const e of stated.equalLengths) {
    const A = at(e.a);
    const B = at(e.b);
    if (!A || !B) continue;
    for (const [p, q] of equalTickSegments(A, B, e.count, 5, 4)) out.ticks.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
  }
  // A stated length rides its drawn segment's label; one whose segment is not drawn is written here.
  const drawn = new Set(segments.map((s) => s.key));
  for (const l of stated.lengths) {
    if (drawn.has(segKey([l.a, l.b]))) continue;
    const A = at(l.a);
    const B = at(l.b);
    if (A && B) ask('length', lengthRequests([{ x1: A.x, y1: A.y, x2: B.x, y2: B.y, text: lbl(valueText(l.value)) }], fig.points.map((p) => ({ id: p.id, cx: t.sx(p.x), cy: t.sy(p.y), label: p.id })))[0]);
  }
  for (const ar of stated.areas) {
    const ps = ar.ids.map(at).filter((p): p is MarkPt => p !== null);
    if (ps.length < 3 || ps.length !== ar.ids.length) continue;
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    // ON its centroid first, then nearby spots — every one INSIDE its ring (#1733), so it never reads as another region's.
    const inside: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= 8; k += 1) {
      for (const [dx, dy] of k === 0 ? [[0, 0]] : [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const c = { x: cx + dx * 6 * k, y: cy + dy * 6 * k };
        if (inRing(c, ps)) inside.push(c);
      }
    }
    ask('area', { mid: { x: cx, y: cy }, n: { x: 0, y: -1 }, text: lbl(`S=${valueText(ar.value)}`), candidates: inside.length ? inside : [{ x: cx, y: cy }], priority: 2 });
  }
  /**
   * An ARC's value sits ON the arc (2-D's ADR-335: never a wedge at the often-hidden centre) — at the minor arc's
   * midpoint, nudged toward the centre so it hugs the arc without crossing the stroke.
   */
  for (const a of stated.arcs) {
    const curve = fig.curves.find((c) => c.id === a.circle)?.curve;
    const A = fig.points.find((p) => p.id === a.a);
    const B = fig.points.find((p) => p.id === a.b);
    if (!curve || curve.kind !== 'circle' || !A || !B) continue;
    const da = unitOf({ x: A.x - curve.cx, y: A.y - curve.cy });
    const db = unitOf({ x: B.x - curve.cx, y: B.y - curve.cy });
    const sum = { x: da.x + db.x, y: da.y + db.y };
    const bis = Math.hypot(sum.x, sum.y) < 1e-9 ? { x: -da.y, y: da.x } : unitOf(sum);
    const on = { x: t.sx(curve.cx + bis.x * curve.r), y: t.sy(curve.cy + bis.y * curve.r) };
    const inward = unitOf({ x: t.sx(curve.cx) - on.x, y: t.sy(curve.cy) - on.y });
    // #1733: within the arc's BAND — inside the circle near the arc, at its midpoint and slid along it within its span.
    const half = Math.acos(Math.max(-1, Math.min(1, da.x * db.x + da.y * db.y))) / 2;
    const base = Math.atan2(bis.y, bis.x);
    const band: Array<{ x: number; y: number }> = [];
    for (const rot of [0, 0.5, -0.5, 0.85, -0.85]) {
      const th = base + rot * half;
      const p = { x: t.sx(curve.cx + Math.cos(th) * curve.r), y: t.sy(curve.cy + Math.sin(th) * curve.r) };
      const w = unitOf({ x: t.sx(curve.cx) - p.x, y: t.sy(curve.cy) - p.y });
      for (const d of [12, 18, 24]) band.push({ x: p.x + w.x * d, y: p.y + w.y * d });
    }
    ask('arc', { mid: on, n: inward, text: lbl(valueText(a.value, '°')), candidates: band, priority: 2 });
  }
  return out;
}
