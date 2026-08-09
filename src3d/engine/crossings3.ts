/**
 * #483 — the ℓ∩π crossings a student can CLAIM: points the givens already determine, that nobody has
 * named yet.
 *
 * The capability to name one has always existed (`ℓ חותך את π בנקודה A` → `line-plane-point`), and the
 * engine materialises it correctly. What was missing is that nothing on the canvas said a point was
 * there to be had, so the student had to know the sentence and think of it first. This module is the
 * offer; naming still happens through the ordinary command path, so a clicked point is an ordinary fact
 * — undoable, replayable, savable — and not a render-only marker (the 2-D `crossingCommands` lesson,
 * ADR-379, copied as a PATTERN since `src3d/` never imports `src/`).
 *
 * It lives in the engine rather than the renderer because the honesty gate below is a statement about
 * the FIGURE, not about the drawing, and because the query lane and the data panel should be able to ask
 * the same question without a second implementation of it.
 */

import { paramIsKnowledge, type Resolved3 } from './evaluate';
import type { Construction3 } from './types';
import { add3, dist3, dot3, norm3, scale3, type Vec3 } from './vec3';

export interface Crossing3 {
  /** The named line, e.g. `ℓ` / `ℓ1`. */
  line: string;
  /** The named plane — an equation plane (`π1`) or a point run (`ACD`). */
  plane: string;
  /** Where they meet, in world coordinates. */
  point: Vec3;
}

/** A crossing this close to an existing point is already that point — the student has named it. */
const NAMED_TOL = 1e-6;

/**
 * Every line∩plane crossing the givens DETERMINE and no existing point already occupies.
 *
 * The honesty gate is one condition, and it is the whole reason this is not a pure geometry helper:
 * **a parameter the givens do not force moves the crossing between configurations**, so offering a dot
 * there would invite the student to name a point that is an artefact of which branch we happened to
 * draw — the ADR-052 sin, in the shape [ADR-3D-118](docs/06b-decisions-3d.md) fixed for the canvas echo.
 * The operator's own figure is exactly that case twice over: with `ℓ ∥ π1` and m = ±√2 there is no
 * crossing at all (parallel), and with the parameter unpinned the line itself is a sample. Reusing
 * `paramIsKnowledge` means the dot and the echo can never disagree about whether the figure is
 * determined.
 *
 * "Already named" is decided by POSITION rather than by looking for a `line-plane-point` command, so a
 * point that arrived some other way (a coordinate, a rider, a solid's vertex) also suppresses the offer.
 * Deriving the set from the construction beats enumerating the ways a point can be born
 * (`src3d/CLAUDE.md`: *an enumeration is not a rule*).
 */
export function openCrossings3(c: Construction3, resolved: Resolved3): Crossing3[] {
  // an unforced parameter makes every algebraic object a sample of itself — nothing here is knowledge
  if (c.param && !paramIsKnowledge(resolved.param)) return [];

  const placed = [...resolved.positions.values()];
  const out: Crossing3[] = [];

  for (const [line, ln] of resolved.lines) {
    const len = norm3(ln.dir);
    if (len < 1e-9) continue;
    for (const [plane, pl] of resolved.planes) {
      const nLen = norm3(pl.n);
      if (nLen < 1e-9) continue;
      const denom = dot3(pl.n, ln.dir);
      // ∥ to the plane — no crossing, or the line lies IN it and every point is one. Both mean there is
      // no single point to offer, which is why this is a `continue` and not a degenerate fallback.
      if (Math.abs(denom) < 1e-9 * nLen * len) continue;
      const t = -(dot3(pl.n, ln.anchor) + pl.d) / denom;
      const point = add3(ln.anchor, scale3(ln.dir, t));
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) continue;
      const scale = Math.max(1, norm3(point));
      if (placed.some((p) => dist3(p, point) <= NAMED_TOL * scale)) continue; // already a named point
      if (out.some((k) => dist3(k.point, point) <= NAMED_TOL * scale)) continue; // one dot per location
      out.push({ line, plane, point });
    }
  }
  return out;
}

/**
 * The utterance a click stands for — a real sentence in the student's language, executed through the
 * normal submit path so the fact list reads as if they had typed it. It must PARSE, which is what makes
 * #485's noun frame a prerequisite rather than a nicety: this is the form a click produces, and a saved
 * figure has to replay it.
 */
export const crossingUtterance3 = (k: Crossing3, id: string, he: boolean): string =>
  he ? `${id} נקודת החיתוך של ${k.line} עם ${k.plane}` : `${id} is the intersection of ${k.line} and ${k.plane}`;

/** The next unused single capital — the label a clicked crossing gets, matching the 2-D flow. */
export function nextFreeLabel3(c: Construction3): string | null {
  for (let k = 0; k < 26; k++) {
    const ch = String.fromCharCode(65 + k);
    if (!c.points.has(ch)) return ch;
  }
  return null; // A–Z exhausted; the offer simply stops rather than inventing a name
}
