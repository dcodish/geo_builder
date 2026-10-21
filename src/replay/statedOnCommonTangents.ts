/**
 * #2430 ([ADR-752](../../docs/06-decisions.md#adr-752)) — A TWO-TOUCH COMMON TANGENT THAT ANOTHER LINE PINS TO THE
 * PAIR'S TOUCH POINT IS THE TANGENT AT IT, IN EITHER ORDER. The 2-D twin of ADR-AG-321 d1, in 2-D's fold.
 *
 * `commonTangent` decides at parse time, from the lines typed BEFORE it, whether «AB משיק משותף…» is the tangent at the
 * circles' stated touch T (ADR-740 exit (c)) or a two-touch tangent. A later line that puts T on AB («T על AB», «T על
 * הישר AB», «T נמצאת על AB», «הישר AB עובר דרך T», «AB משיק למעגל M בנקודה T») then met a two-touch record that can never
 * pass through T — two distinct touches on one line through T are impossible — so satisfiability depended on entry order.
 *
 * This pre-pass is pure over the enabled facts (the ADR-163 pre-scan shape): for each two-touch `common-tangent` record
 * (no `at`), it collects the points that the OTHER enabled facts put on line AB — `set-collinear`,
 * `set-line` point lists, `point-on-segment` — and, when the pair's STATED touch (its `circles-tangent`, `at`) is among
 * them, re-decides the record's whole group as the at-touch lowering the forward order produces:
 *  - the drawn tangent at T (`tangent tan-T` on circle 1);
 *  - each FRESH touch letter (one this group introduces) a marker on it, A and B on either side of T (the at-variant's
 *    markers, ADR-740 d3); each EXISTING letter seated by the `at` record (ADR-740 d4);
 *  - the touches' soft memberships and the two radius ⟂s retire; the segment stays.
 * Kept refusals (no re-decision): a stated kind that is not the touch tangent's («חיצוני» through an external touch,
 * ADR-740 H5 / AG-321), and a pair whose tangent at T is already drawn (the line at T is taken).
 *
 * Derived from `(facts)` alone, so unticking the pinning line restores the two-touch tangent. Linear in the facts.
 */
import type { Command, Id } from '@/engine';

/** The at-variant's marker offset from T along the tangent (parse.ts `LINE_MARK`, ADR-740 d3). */
const MARK = 5;

export interface PinnedCommonTangent {
  /** the pair's stated touch point */
  at: Id;
  /** the tangent record's letters */
  a: Id;
  b: Id;
  circle1: Id;
  circle2: Id;
  /** the letters this record's group introduces (markers); the others are seated by the `at` record */
  fresh: Id[];
  /** the facts whose statement put T on AB (readable record) */
  by: string[];
}

export interface PinFact {
  id: string;
  group: string;
  cmds: readonly Command[];
}

const pairKey = (a: Id, b: Id) => [a, b].sort().join('|');

/**
 * The re-decided records, keyed by GROUP then by the record's `a|b` letters. The caller hands each fact's commands as
 * the fold applies them (a defaulted tangency kind already resolved by ADR-704's pre-scan), so the kind exclusion reads
 * the kind in force.
 */
export function statedOnCommonTangents(facts: readonly PinFact[]): Map<string, Map<string, PinnedCommonTangent>> {
  const out = new Map<string, Map<string, PinnedCommonTangent>>();
  const touch = new Map<string, { at: Id; external: boolean }>();
  const tangentAt = new Map<Id, string>(); // touch point → the group drawing the tangent at it
  const introducedBy = new Map<Id, string>(); // point → first group introducing it
  const records: { group: string; cmd: Extract<Command, { type: 'common-tangent' }> }[] = [];
  for (const f of facts) {
    for (const c of f.cmds) {
      if (c.type === 'circles-tangent') {
        const k = pairKey(c.circle1, c.circle2);
        if (!touch.has(k)) touch.set(k, { at: c.at, external: c.external });
      } else if (c.type === 'tangent' && c.at !== undefined) {
        if (!tangentAt.has(c.at)) tangentAt.set(c.at, f.group);
      } else if (c.type === 'common-tangent' && c.at === undefined) records.push({ group: f.group, cmd: c as Extract<Command, { type: 'common-tangent' }> });
      const id = (c as { id?: unknown }).id;
      if (typeof id === 'string' && (c.type === 'point-on-circle' || c.type === 'free-point' || c.type === 'point-on-line' || c.type === 'point-on-segment') && !introducedBy.has(id))
        introducedBy.set(id, f.group);
    }
  }
  if (!records.length || !touch.size) return out;
  /** Points other groups state on line ab, with the facts that state them. */
  const onLine = (a: Id, b: Id, group: string): Map<Id, string[]> => {
    const pts = new Map<Id, string[]>();
    const add = (p: Id, by: string) => {
      if (p === a || p === b) return;
      pts.set(p, [...(pts.get(p) ?? []), by]);
    };
    for (const f of facts) {
      if (f.group === group) continue;
      for (const c of f.cmds) {
        if (c.type === 'set-collinear') {
          const s = [c.a, c.b, c.c];
          if (s.includes(a) && s.includes(b)) s.forEach((p) => add(p, f.id));
        } else if (c.type === 'set-line') {
          const s = c.points;
          if (s.includes(a) && s.includes(b)) s.forEach((p) => add(p, f.id));
        } else if (c.type === 'point-on-segment') {
          if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) add(c.id, f.id);
        }
      }
    }
    return pts;
  };
  for (const { group, cmd } of records) {
    const t = touch.get(pairKey(cmd.circle1, cmd.circle2));
    if (!t) continue;
    const touchKind = t.external ? 'internal' : 'external';
    if (cmd.kind && cmd.kind !== touchKind) continue; // a kind the touch tangent is not names no line through T
    if (tangentAt.has(t.at)) continue; // the line at T is taken
    const by = onLine(cmd.a, cmd.b, group).get(t.at);
    if (!by) continue;
    const fresh = [cmd.a, cmd.b].filter((p) => introducedBy.get(p) === group);
    const m = out.get(group) ?? new Map<string, PinnedCommonTangent>();
    m.set(`${cmd.a}|${cmd.b}`, { at: t.at, a: cmd.a, b: cmd.b, circle1: cmd.circle1, circle2: cmd.circle2, fresh, by });
    out.set(group, m);
  }
  return out;
}

/**
 * One fact's commands under the re-decision: the record's soft memberships become markers on `tan-T` (fresh letters) or
 * retire (existing ones), the record becomes the `at` seat for existing letters, its two radius ⟂s retire.
 */
export function pinnedLowering(cmds: readonly Command[], pins: Map<string, PinnedCommonTangent>): Command[] {
  const byLetter = new Map<Id, PinnedCommonTangent>();
  for (const p of pins.values()) {
    byLetter.set(p.a, p);
    byLetter.set(p.b, p);
  }
  const out: Command[] = [];
  for (const c of cmds) {
    if (c.type === 'point-on-circle' && c.softPair && byLetter.has(c.id)) {
      const p = byLetter.get(c.id)!;
      const line = `tan-${p.at}`;
      // the tangent at T is drawn by the record's FIRST letter, so every marker and seat after it finds the line
      if (c.id === p.a) out.push({ type: 'tangent', id: line, circle: p.circle1, at: p.at, visible: true } as Command);
      if (p.fresh.includes(c.id)) out.push({ type: 'point-on-line', id: c.id, line, offset: c.id === p.a ? MARK : -MARK } as Command);
      continue;
    }
    if (c.type === 'common-tangent' && c.at === undefined && pins.has(`${c.a}|${c.b}`)) {
      const p = pins.get(`${c.a}|${c.b}`)!;
      if (p.fresh.length < 2) out.push({ type: 'common-tangent', a: p.a, b: p.b, circle1: p.circle1, circle2: p.circle2, at: p.at } as Command);
      continue;
    }
    if (c.type === 'set-perpendicular' && c.implicit && byLetter.has(c.c) && byLetter.get(c.c) === byLetter.get(c.d) && (c.b === c.c || c.b === c.d)) continue;
    out.push(c);
  }
  return out;
}
