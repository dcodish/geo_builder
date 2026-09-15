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
import { fmtNum } from '../../shell/format';
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

export interface Scene {
  width: number;
  height: number;
  axes: SceneAxes;
  curves: SceneCurve[];
  segments: SceneSegment[];
  construction: SceneConstruction[];
  points: ScenePoint[];
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

export function buildScene(fig: Figure, box: Box, width: number, height: number): Scene {
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
          : { text: fmtNum(s.pinnedLength), x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
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
      comp && comp.known ? { text: fmtNum(comp.value as number) } : { text: axis, sub: p.id };
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
  };
}
