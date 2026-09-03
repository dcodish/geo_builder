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

export interface ScenePoint {
  id: string;
  cx: number;
  cy: number;
  label: string;
}

export interface Scene {
  width: number;
  height: number;
  axes: SceneAxes;
  curves: SceneCurve[];
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

  const curves: SceneCurve[] = fig.curves.map((c) => ({
    id: c.id,
    kind: c.curve.kind,
    name: c.label.name,
    d: polylines(c.curve, box)
      .map((pl) => pl.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${t.sx(x).toFixed(2)},${t.sy(y).toFixed(2)}`).join(''))
      .join(' '),
  }));

  const points: ScenePoint[] = fig.points.map((p) => ({
    id: p.id,
    cx: t.sx(p.x),
    cy: t.sy(p.y),
    label: p.id,
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
    points,
  };
}
