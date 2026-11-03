/**
 * #2691 (ADR-AG-389) — THE POINT-LETTER MEASUREMENT, shared by the issue's unit test and its sweep.
 *
 * Builds a figure the way the canvas does (`derive` → `drawnBox` → `viewBox` at the 720×720 first-paint surface →
 * `buildScene` with the App's knowledge gates) and reads, from the SCENE alone, every place a point's letter box
 * (`pointLabelBox`, the box the renderer paints and the value placement avoids) crosses drawn ink or another letter.
 *
 * Drawn ink = every non-ghost segment, every inked curve (a line, a circle, a conic), every arc, every dashed
 * extension, every answered perpendicular and every traced locus — read off the scene's own projected geometry and
 * path data, so the measurement cannot disagree with what is painted. With `chips` (round #2678) every stated conic's
 * chip is pressed to «both» (#1863) and its marks join the ink: a directrix is a line, a focus a dot.
 */
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { offersOf } from '../engine/crossings';
import { drawnBox } from '../app/drawnBox';
import { conicMarksOf, markAnchors } from '../app/conicMarks';
import type { AnnotationMap } from '../app/annotations';
import { INITIAL_VIEW, viewBox } from '../render/view';
import { buildScene, pointLabelBox, type LabelBox, type Scene } from '../render/scene';
import { ALL_SHOWN, type CanvasDisplay } from '../render/canvasDisplay';

export const SURFACE = { w: 720, h: 720 } as const;

export function sceneOf(lines: readonly string[], seed: number, display: CanvasDisplay = ALL_SHOWN): Scene | null {
  return scenesOf(lines, seed, [display])?.[0] ?? null;
}

/** One derivation, one scene per display setting (the sweep's two settings share a solve). Null when nothing is drawn. */
export function scenesOf(lines: readonly string[], seed: number, displays: readonly CanvasDisplay[], chips = false): Scene[] | null {
  const d = derive([...lines], seed);
  if (d.figure.points.length === 0) return null;
  return scenesFrom(d, displays, chips);
}

/** The scenes of one derivation (the sweep builds the plain and the chip scenes from one solve). Null when `chips` and no conic has one. */
export function scenesFrom(d: ReturnType<typeof derive>, displays: readonly CanvasDisplay[], chips = false): Scene[] | null {
  const all: AnnotationMap = chips ? Object.fromEntries(d.figure.curves.filter((c) => c.stated).map((c) => [c.id, { conic: 'both' as const }])) : {};
  const roleMarks = conicMarksOf(d, all);
  if (chips && roleMarks.length === 0) return null;
  const box = viewBox(drawnBox(d.figure, d.box, [], markAnchors(roleMarks)), INITIAL_VIEW, { width: SURFACE.w, height: SURFACE.h });
  const crossings = offersOf(d.figure, d.construction);
  return displays.map((display) =>
    buildScene(d.figure, box, SURFACE.w, SURFACE.h, {
      curveKnown: (id) => knownCurve(d.construction, id) !== null,
      crossings,
      stated: d.stated,
      roleMarks,
      display,
    }),
  );
}

type Piece = { x1: number; y1: number; x2: number; y2: number; what: string };

/** `M…L…` path data → its straight pieces (every path the scene emits is M/L/Z only). */
function pathPieces(d: string, what: string): Piece[] {
  const out: Piece[] = [];
  let prev: [number, number] | null = null;
  let first: [number, number] | null = null;
  for (const m of d.matchAll(/([MLZ])\s*(?:(-?[\d.]+(?:e-?\d+)?)[ ,](-?[\d.]+(?:e-?\d+)?))?/gi)) {
    const op = m[1].toUpperCase();
    if (op === 'Z') {
      if (prev && first) out.push({ x1: prev[0], y1: prev[1], x2: first[0], y2: first[1], what });
      prev = first;
      continue;
    }
    const p: [number, number] = [Number(m[2]), Number(m[3])];
    if (op === 'L' && prev) out.push({ x1: prev[0], y1: prev[1], x2: p[0], y2: p[1], what });
    if (op === 'M') first = p;
    prev = p;
  }
  return out;
}

/** Every piece of ink the scene draws. */
export function inkOf(s: Scene): Piece[] {
  const out: Piece[] = [];
  for (const g of s.segments) if (g.ink !== 'ghost') out.push({ ...g, what: `segment ${g.key}` });
  for (const c of s.curves) if (c.ink === 'solid' || c.ink === 'dashed') out.push(...pathPieces(c.d, `curve ${c.name || c.id}`));
  for (const a of s.arcs) out.push(...pathPieces(a.d, `arc ${a.id}`));
  for (const e of s.extensions) out.push({ ...e, what: 'extension' });
  for (const m of s.measures) out.push({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, what: 'measure' });
  for (const l of s.loci) out.push(...pathPieces(l.d, 'locus'));
  for (const l of s.roles.directrices) out.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, what: 'directrix' });
  return out;
}

/** Liang–Barsky: does the piece pass through the box's interior? (a box shrunk by 0.5px, so touching is not crossing) */
export function crossesBox(l: { x1: number; y1: number; x2: number; y2: number }, b0: LabelBox): boolean {
  const b = { x0: b0.x0 + 0.5, y0: b0.y0 + 0.5, x1: b0.x1 - 0.5, y1: b0.y1 - 0.5 };
  let t0 = 0;
  let t1 = 1;
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  for (const [p, q] of [[-dx, l.x1 - b.x0], [dx, b.x1 - l.x1], [-dy, l.y1 - b.y0], [dy, b.y1 - l.y1]] as const) {
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
}

const boxesOverlap = (a: LabelBox, b: LabelBox): boolean => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;

export interface LetterViolation {
  point: string;
  kind: 'ink' | 'letter' | 'dot';
  what: string;
}

/** Every crossing of a point's letter box with drawn ink, another letter box, or another point's dot. */
export function letterViolations(s: Scene): LetterViolation[] {
  const ink = inkOf(s);
  const boxes = s.points.map((p) => pointLabelBox(p));
  const out: LetterViolation[] = [];
  s.points.forEach((p, i) => {
    const b = boxes[i];
    const hit = ink.find((l) => crossesBox(l, b));
    if (hit) out.push({ point: p.id, kind: 'ink', what: hit.what });
    // a focus dot is ink (round #2678) — unless it is this point's own place (a student's F at the focus)
    const focus = s.roles.foci.find((f) => Math.hypot(f.cx - p.cx, f.cy - p.cy) > 1e-6 && boxesOverlap(b, { x0: f.cx - 3.5, y0: f.cy - 3.5, x1: f.cx + 3.5, y1: f.cy + 3.5 }));
    if (!hit && focus) out.push({ point: p.id, kind: 'ink', what: 'focus' });
    for (let j = i + 1; j < s.points.length; j += 1) {
      if (boxesOverlap(b, boxes[j])) out.push({ point: p.id, kind: 'letter', what: s.points[j].id });
    }
    for (const q of s.points) {
      if (q === p || Math.hypot(q.cx - p.cx, q.cy - p.cy) < 1e-6) continue;
      if (boxesOverlap(b, { x0: q.cx - 3.5, y0: q.cy - 3.5, x1: q.cx + 3.5, y1: q.cy + 3.5 })) out.push({ point: p.id, kind: 'dot', what: q.id });
    }
  });
  return out;
}
