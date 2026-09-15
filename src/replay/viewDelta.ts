import { freeDofs, isGeoPoint } from '@/engine';
import type { Id, Vec } from '@/engine';
import type { Derived, Fact } from './core';

/**
 * #65 ([ADR-517](../../docs/06-decisions.md#adr-517)) — WHAT «הציגו תצורה אחרת» CHANGED, and what it kept.
 *
 * The mechanism has always known its own delta; the student was never told. Pressing the button made the
 * figure jump with no account of which unstated choice moved — and that account is the ADR-052 principle
 * made visible: *what varied is exactly what the question did NOT pin.* It is the same thing the DOF cue
 * teaches (ADR-101/112), said at the moment it happens.
 *
 * **Pure over two views.** No engine or solver change: both views already exist when the store applies a
 * resample, so this is a comparison, never a second search.
 *
 * **Judged on SIMILARITY-INVARIANT quantities, and it has to be.** Two seeds of the same figure may differ
 * by a whole-figure rotation, translation and scale, under which every raw coordinate changes while nothing
 * about the drawing does. Comparing positions would therefore report that everything moved, every time. So
 * each free DOF is characterised by quantities the gauge cannot touch — a point by its distances to the
 * other named points, each divided by the drawing's mean extent; a circle by its radius over that same
 * mean — and the 3% bar is the one {@link shapeDiffers} already uses to answer the very similar question
 * "is this a different drawing?" ([ADR-065](../../docs/06-decisions.md#adr-065), [ADR-514](../../docs/06-decisions.md#adr-514)).
 */

/** One thing the press moved, or deliberately left alone. */
export type ViewDeltaItem =
  /** A point the sampler re-placed: a free point, or a marker sliding along its carrier. */
  | { kind: 'point'; id: Id }
  /** A circle whose free radius was resized. */
  | { kind: 'radius'; id: Id }
  /** A discrete alternative: which intersection/reflection a derived point took. */
  | { kind: 'branch'; id: Id }
  /** A shape's unstated configuration choice (which pair is equal, which sides are parallel). */
  | { kind: 'variant'; id: Id };

export interface ViewDelta {
  changed: ViewDeltaItem[];
  /** Freedoms the figure HAS and this press did not use — the "and this stayed" half. */
  kept: ViewDeltaItem[];
}

/** The 3% bar of `shapeDiffers` — the same question, asked per object instead of per figure. */
const MOVED_BAR = 0.03;

/** The drawing's mean extent: every pairwise distance between named points, plus each circle's radius. */
function meanExtent(d: Derived): number {
  const pts = namedPoints(d);
  const ds: number[] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) ds.push(Math.hypot(pts[i].p.x - pts[j].p.x, pts[i].p.y - pts[j].p.y));
  for (const [, rc] of d.circles) if (Number.isFinite(rc.r)) ds.push(rc.r);
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
}

function namedPoints(d: Derived): { id: Id; p: Vec }[] {
  const out: { id: Id; p: Vec }[] = [];
  for (const o of d.construction.objects) {
    if (!isGeoPoint(o) || o.id.startsWith('~')) continue;
    const p = d.positions.get(o.id);
    if (p) out.push({ id: o.id, p });
  }
  return out;
}

/** A point's similarity-invariant signature: its distance to every OTHER named point, over the mean extent. */
function pointSignature(d: Derived, id: Id, mean: number): Map<Id, number> | null {
  const self = d.positions.get(id);
  if (!self || mean <= 1e-9) return null;
  const sig = new Map<Id, number>();
  for (const { id: other, p } of namedPoints(d)) {
    if (other === id) continue;
    sig.set(other, Math.hypot(self.x - p.x, self.y - p.y) / mean);
  }
  return sig;
}

/** Did this object's own shape contribution change by more than the bar? `null` ⇒ cannot tell. */
function moved(before: Derived, after: Derived, id: Id): boolean | null {
  const mb = meanExtent(before);
  const ma = meanExtent(after);
  if (mb <= 1e-9 || ma <= 1e-9) return null;

  const rb = before.circles.get(id)?.r;
  const ra = after.circles.get(id)?.r;
  if (rb !== undefined && ra !== undefined) {
    const x = rb / mb;
    return Math.abs(ra / ma - x) > MOVED_BAR * Math.max(1e-9, x);
  }

  const sb = pointSignature(before, id, mb);
  const sa = pointSignature(after, id, ma);
  if (!sb || !sa || sb.size === 0) return null;
  let sum = 0;
  let n = 0;
  for (const [other, v] of sb) {
    const w = sa.get(other);
    if (w === undefined) return null; // the figures don't share their points — nothing comparable
    sum += Math.abs(w - v);
    n++;
  }
  return n > 0 && sum / n > MOVED_BAR;
}

/** The discrete choices a fact carries, keyed by the object they belong to. */
function discreteChoices(facts: Fact[]): { branch: Map<Id, number>; variant: Map<Id, number> } {
  const branch = new Map<Id, number>();
  const variant = new Map<Id, number>();
  for (const f of facts) {
    if (!f.enabled) continue;
    const c = f.cmd as { id?: Id; ids?: Id[]; branch?: number; variant?: number };
    const key = c.id ?? c.ids?.join('');
    if (key === undefined) continue;
    if (typeof c.branch === 'number') branch.set(key, c.branch);
    if (typeof c.variant === 'number') variant.set(key, c.variant);
  }
  return { branch, variant };
}

/**
 * What changed between two views of the same figure, and what stayed.
 *
 * Both `kept` and `changed` are drawn from the SAME set — the figure's own freedoms — so "kept" can only
 * ever name something that genuinely could have moved and did not. A freedom the comparison cannot judge
 * (a point missing from one view) is reported in neither list: silence is the honest answer, never a guess.
 */
export function viewDelta(beforeFacts: Fact[], before: Derived, afterFacts: Fact[], after: Derived): ViewDelta {
  const changed: ViewDeltaItem[] = [];
  const kept: ViewDeltaItem[] = [];

  // 1. The discrete choices — explicit in the facts, so no measurement is needed or wanted.
  const db = discreteChoices(beforeFacts);
  const da = discreteChoices(afterFacts);
  for (const [id, v] of db.branch) {
    const w = da.branch.get(id);
    if (w === undefined) continue;
    (w !== v ? changed : kept).push({ kind: 'branch', id });
  }
  for (const [id, v] of db.variant) {
    const w = da.variant.get(id);
    if (w === undefined) continue;
    (w !== v ? changed : kept).push({ kind: 'variant', id });
  }

  // 2. The continuous freedoms — the ids the sampler is allowed to vary, measured invariantly.
  const isCircle = new Set(before.construction.objects.filter((o) => o.kind === 'circle').map((o) => o.id));
  for (const id of freeDofs(before.construction)) {
    const m = moved(before, after, id);
    if (m === null) continue; // not comparable — say nothing rather than guess
    const item: ViewDeltaItem = isCircle.has(id) ? { kind: 'radius', id } : { kind: 'point', id };
    (m ? changed : kept).push(item);
  }

  return { changed, kept };
}
