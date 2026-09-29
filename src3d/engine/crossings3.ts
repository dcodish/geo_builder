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

import { openParamProbes3, paramConfigValues3, resolve3, type Resolved3 } from './evaluate';
import type { Construction3, Id } from './types';
import { add3, dist3, dot3, norm3, scale3, sub3, type Vec3 } from './vec3';

export interface Crossing3 {
  /**
   * What crosses the plane, as the utterance names it: a named line (`ℓ` / `ℓ1`) or a DRAWN segment
   * written by its endpoints (`AC'`). #755 made both forms parse, which is what lets a click on
   * either produce an ordinary, replayable fact.
   */
  line: string;
  /** The named plane — an equation plane (`π1`) or a point run (`ACD`). */
  plane: string;
  /** Where they meet, in world coordinates. */
  point: Vec3;
}

/**
 * A crossing candidate: a straight carrier with an anchor and a direction, plus how the utterance
 * names it and whether it is BOUNDED.
 *
 * A named line is drawn as a full line, so every point of it is on the figure and `t` is free. A
 * segment is ink between two placed points: a crossing outside it is not on the drawing, and a dot
 * there would name a point the figure does not show.
 */
interface Carrier3 {
  name: string;
  anchor: Vec3;
  dir: Vec3;
  bounded: boolean;
}

/** A crossing this close to an existing point is already that point — the student has named it. */
const NAMED_TOL = 1e-6;

/**
 * #769 (ADR-3D-183) — the ONE judgement of "this position IS an existing named point": the click-offer
 * uses it to suppress a dot on top of a vertex, and the store's verify pass uses it to refuse minting a
 * derived point there (the same question, one seam over — ADR-W-006, derive rather than copy). Returns
 * the id of the first placed point within the figure's distinctness tolerance, else null. `placed` is
 * iterated in insertion order, so the EARLIER point is the one named.
 */
export function namedPointAt(point: Vec3, placed: Iterable<[Id, Vec3]>): Id | null {
  const scale = Math.max(1, norm3(point));
  for (const [id, p] of placed) if (dist3(p, point) <= NAMED_TOL * scale) return id;
  return null;
}

/**
 * Every line∩plane crossing the givens DETERMINE and no existing point already occupies.
 *
 * The honesty gate is one condition, and it is the whole reason this is not a pure geometry helper:
 * **a crossing is offered only when it is the same point in EVERY configuration of the figure's
 * parameter** — otherwise the dot would invite the student to name an artefact of which branch we
 * happened to draw (the ADR-052 sin). The operator's own figure is that case twice over: with `ℓ ∥ π1`
 * and m = ±√2 there is no crossing at all (parallel), and with the parameter unpinned the line itself
 * moves with m.
 *
 * #1474 (ADR-3D-283) — the gate is asked PER CROSSING. It used to be the whole-figure proxy "is m's value
 * forced?" (`paramIsKnowledge`), which withheld every dot on a figure that merely CONTAINED an unforced
 * m-line — a box's edges crossing `x = 1` vanished the moment an unrelated ℓ2 ∥ π1 was typed — and also
 * withheld `(m,0,0)+t(1,0,0)` ∩ `x = 3`, which is (3,0,0) for every m. Now each crossing is computed in
 * every configuration (the branch pool, or probe values of an unpinned m, all at this drawing's gauge
 * seed) and offered iff it EXISTS in all of them and they AGREE.
 *
 * "Already named" is decided by POSITION rather than by looking for a `line-plane-point` command, so a
 * point that arrived some other way (a coordinate, a rider, a solid's vertex) also suppresses the offer.
 * Deriving the set from the construction beats enumerating the ways a point can be born
 * (`src3d/CLAUDE.md`: *an enumeration is not a rule*).
 *
 * #756 — THE CANDIDATE SET IS DRAWN INK, not the algebra. `resolved.lines` holds only NAMED lines
 * (`ℓ`, `ℓ1`), so in a solid figure — which is nearly every 3-D question — it is empty and the whole
 * mechanism was structurally dead: the operator's box + point-run plane + drawn diagonal offered
 * nothing. The plane side was already general; the line side was written against the equation-line
 * figures #483 was built on. 2-D's sibling (`resolveDrawnLines`, ADR-379) always derived its
 * candidates from drawn ink — that is the half the pattern copy left behind.
 *
 * The set is therefore DERIVED: the named lines, plus the solids' own edges, plus the auxiliary
 * segments — all of them straight carriers already on the canvas. Nothing enumerates the ways a
 * segment can be born, because both collections live on `Construction3` and every path that draws
 * one writes there.
 */
export function openCrossings3(c: Construction3, resolved: Resolved3): Crossing3[] {
  // Memoised on the resolve: the scene rebuilds on every orbit frame, and the per-crossing gate
  // re-resolves the figure's other configurations — that cost belongs to the figure, not the camera.
  const hit = memo.get(resolved);
  if (hit && hit.c === c) return hit.out;
  const out = computeCrossings3(c, resolved);
  memo.set(resolved, { c, out });
  return out;
}

const memo = new WeakMap<Resolved3, { c: Construction3; out: Crossing3[] }>();

/**
 * #1474 — the figure's configurations at THIS drawing's gauge: the drawing itself plus the parameter's
 * other branches (a pinned m) or probe values (an unpinned m), each re-resolved at `resolved.seed` so
 * only m moves. `null` when the givens admit no parameter value at all — nothing is knowledge then.
 */
function configurations3(c: Construction3, resolved: Resolved3): Resolved3[] | null {
  if (!c.param || !resolved.param) return [resolved];
  const drawn = resolved.param.value;
  if (!Number.isFinite(drawn)) return null;
  const pool = paramConfigValues3(c, resolved.seed, resolved);
  const others = (pool.length > 0 ? pool : openParamProbes3(c, resolved.seed)).filter((v) => v !== drawn);
  return [resolved, ...others.map((v) => resolve3(c, resolved.seed, { paramValue: v }))];
}

function computeCrossings3(c: Construction3, resolved: Resolved3): Crossing3[] {
  const configs = configurations3(c, resolved);
  if (!configs) return [];
  const [drawn, ...others] = configs.map((r) => rawCrossings3(c, r));
  const out: Crossing3[] = [];
  for (const [key, k] of drawn) {
    const scale = Math.max(1, norm3(k.point));
    // THE GATE (#1474): the same point in every configuration — it exists in each, and they agree
    const invariant = others.every((m) => {
      const o = m.get(key);
      return o !== undefined && dist3(o.point, k.point) <= NAMED_TOL * scale;
    });
    if (!invariant) continue;
    if (namedPointAt(k.point, resolved.positions) !== null) continue; // already a named point (#769: the shared judgement)
    if (out.some((o) => dist3(o.point, k.point) <= NAMED_TOL * scale)) continue; // one dot per location
    out.push(k);
  }
  return out;
}

/** Every carrier×plane crossing of ONE configuration, keyed by the pair — before any offer filtering. */
function rawCrossings3(c: Construction3, r: Resolved3): Map<string, Crossing3> {
  const out = new Map<string, Crossing3>();
  for (const carrier of crossingCarriers3(c, r)) {
    const len = norm3(carrier.dir);
    if (len < 1e-9) continue;
    for (const [plane, pl] of r.planes) {
      const nLen = norm3(pl.n);
      if (nLen < 1e-9) continue;
      const denom = dot3(pl.n, carrier.dir);
      // ∥ to the plane — no crossing, or the line lies IN it and every point is one. Both mean there is
      // no single point to offer, which is why this is a `continue` and not a degenerate fallback.
      if (Math.abs(denom) < 1e-9 * nLen * len) continue;
      const t = -(dot3(pl.n, carrier.anchor) + pl.d) / denom;
      // A SEGMENT is bounded: a crossing outside the drawn ink is not on the figure (#756). The
      // endpoints themselves are excluded too — a crossing AT an endpoint is that named point, which
      // the position check below would drop anyway, and offering a dot on top of a vertex is noise.
      if (carrier.bounded && !(t > 1e-9 && t < 1 - 1e-9)) continue;
      const point = add3(carrier.anchor, scale3(carrier.dir, t));
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) continue;
      out.set(JSON.stringify([carrier.name, plane]), { line: carrier.name, plane, point });
    }
  }
  return out;
}

/**
 * The straight carriers a crossing can be offered on: named lines (unbounded — they are drawn as full
 * lines) and drawn segments (bounded — the solids' edges and the auxiliary segments).
 *
 * A segment whose endpoints are not both placed contributes nothing: there is no ink to cross.
 * De-duplicated by endpoint pair so an auxiliary segment restating an edge cannot double an offer.
 */
function crossingCarriers3(c: Construction3, resolved: Resolved3): Carrier3[] {
  const out: Carrier3[] = [];
  for (const [name, ln] of resolved.lines) out.push({ name, anchor: ln.anchor, dir: ln.dir, bounded: false });

  const seen = new Set<string>();
  for (const [a, b] of [...c.solids.flatMap((s) => s.edges), ...c.segments]) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const A = resolved.positions.get(a);
    const B = resolved.positions.get(b);
    if (!A || !B) continue;
    // The NAME is the utterance's own: «AC'», the segment form #755 made parse.
    out.push({ name: `${a}${b}`, anchor: A, dir: sub3(B, A), bounded: true });
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
