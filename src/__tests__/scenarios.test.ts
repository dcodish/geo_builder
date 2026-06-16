/**
 * Reported-scenarios regression suite (end-to-end).
 *
 * Each scenario is the EXACT sequence of utterances the operator typed when a bug was
 * found (harvested from `logs/debug-log.jsonl`). It is replayed through the REAL pipeline —
 * parse-with-figure-context → fact list → `replay` — exactly as the app does, then asserted.
 * This catches PIPELINE-level regressions (parser context threading, rule ordering, the store
 * replay/grouping) that the parser/engine unit tests don't exercise, and gives a single,
 * readable list of the real figures we've validated (mirrored in docs/test-scenarios.md).
 *
 * STANDING RULE (see ../../CLAUDE.md): when the operator reports a bug and it is diagnosed
 * from the debug log, the fix is NOT done until the exact sequence is added here.
 *
 * A `Step` is either an utterance string (parsed deterministically, with the current figure as
 * context) or `{ llm: [...commands] }` — the canonical commands an LLM step produced. The LLM is
 * mocked in tests, so an out-of-grammar step is captured from the log as its commands instead of
 * being re-invoked. A string step that fails to parse FAILS the scenario (it would have escalated).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, polygonsConvex, useGeoStore } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import { isGeoPoint, freeDofs } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';

type Step = string | { llm: AnyCommand[] };
interface Scenario {
  id: string;
  title: string;
  /** The bug this sequence guards against (for the readable record). */
  guards: string;
  steps: Step[];
  check: (fig: Derived) => void;
}

/** The figure context the app feeds the parser: circle centres + existing point ids. */
function ctxOf(facts: Fact[]) {
  const { construction } = replay(facts);
  return {
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.center] : [])),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
  };
}

/** Replay a scenario through the real parse→fact→replay path and return the derived figure. */
function run(steps: Step[]): Derived {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    let commands: AnyCommand[];
    let utterance: string;
    if (typeof step === 'string') {
      utterance = step;
      const r = parse(step, ctxOf(facts));
      if (!r.ok) throw new Error(`scenario step did not parse (would escalate to the LLM): ${JSON.stringify(step)}`);
      commands = r.commands;
    } else {
      utterance = '(llm step)';
      commands = step.llm;
    }
    const group = `g${g++}`;
    for (const cmd of commands) facts.push({ id: `${group}.${facts.length}`, utterance, group, cmd, enabled: true });
  }
  return replay(facts);
}

// ── check helpers ──────────────────────────────────────────────────────────
const at = (fig: Derived, id: Id): Vec => {
  const v = fig.positions.get(id);
  if (!v) throw new Error(`no position for "${id}"`);
  return v;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};
/** Every enabled step applied cleanly (no silent drop / over-constraint). */
const allStepsOk = (fig: Derived) => {
  for (const [id, s] of Object.entries(fig.status)) expect(s, `status of step ${id}`).toBe('ok');
  expect(fig.lastError).toBeNull();
};
/** The quad's named vertices are in convex cyclic order around centre O (none collapsed/crossed). */
const convexQuad = (fig: Derived, ids: [Id, Id, Id, Id], center: Id, minGapDeg = 15) => {
  const o = at(fig, center);
  const ang = (p: Vec) => (Math.atan2(p.y - o.y, p.x - o.x) + 2 * Math.PI) % (2 * Math.PI);
  const order = ids.map((id) => ang(at(fig, id)));
  for (let i = 0; i < 4; i++) {
    const gap = (order[(i + 1) % 4] - order[i] + 2 * Math.PI) % (2 * Math.PI);
    expect(gap, `gap after vertex ${ids[i]}`).toBeGreaterThan((minGapDeg * Math.PI) / 180);
  }
};

// ── the scenarios (newest first) ───────────────────────────────────────────
const SCENARIOS: Scenario[] = [
  {
    id: 'alpha-less-than-beta-reshapes',
    title: 'Q5 median figure + "α<β" actively reshapes so ∠BAP comes out smaller than ∠ABP',
    guards: 'an inequality between two named measures ("α<β") was unparsed (escalated to the LLM, which gave up); even understood, it had no carrier and was ignored by the joint solver, so the figure kept a misleading ∠BAP > ∠ABP that "show another configuration" rarely escaped (ADR-039).',
    steps: [
      'triangle ABC',
      'BD תיכון לצלע AC',
      'E על BC',
      'AE ו BD נחתכים בנקודה P',
      'BP=3PD',
      'AB=k',
      '∠BAP=α',
      '∠ABP=β',
      'α<β',
      'AE⊥BD',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D'), E = at(fig, 'E'), P = at(fig, 'P');
      // The stated givens still hold…
      expect(dist(B, P) / dist(P, D)).toBeCloseTo(3, 2); // |BP| = 3·|PD|
      const dot = (E.x - A.x) * (D.x - B.x) + (E.y - A.y) * (D.y - B.y);
      expect(Math.abs(dot) / (dist(A, E) * dist(B, D))).toBeLessThan(0.02); // AE ⟂ BD
      // …and the assumption α<β is now true on the figure (∠BAP strictly < ∠ABP, with a visible gap).
      const alpha = angle(B, A, P), beta = angle(A, B, P);
      expect(alpha).toBeLessThan(beta);
      expect(beta - alpha).toBeGreaterThan(1); // at least the MIN_GAP — not a misleading near-tie
    },
  },
  {
    id: 'median-ratio-drives-E',
    title: 'triangle, median BD, E on BC, P = AE∩BD, then |BP|=3|PD| — slides E to satisfy it',
    guards: 'a ratio constraint on a derived point P recruited the triangle vertices but the joint solver ignored the on-segment DOF (E) that actually moves P (mixed free+parametric carriers routed to the free-only solver) → over-constrained.',
    steps: [
      'משולש ABC',
      'BD תיכון לצלע AC',
      'E על BC',
      // "AE ו-BD נחתכים בנקודה P" (operator typo "נחכתכים" → LLM produced this command)
      { llm: [{ type: 'line-line-intersection', id: 'P', a: 'A', b: 'E', c: 'B', d: 'D' }] },
      'BP=3PD',
    ],
    check(fig) {
      allStepsOk(fig);
      const B = at(fig, 'B'), P = at(fig, 'P'), D = at(fig, 'D');
      expect(dist(B, P) / dist(P, D)).toBeCloseTo(3, 2); // |BP| = 3·|PD| (E slid; P at the 3:1 point on BD)
    },
  },
  {
    id: 'tangent-chord-bisector',
    title: 'cyclic quad, diagonals meet F, tangent at C cuts AB-extension at E, AB=CB, AC bisects ∠ECD',
    guards: 'coupled constraints (AB=CB AND the bisector) drove one cyclic vertex onto another / a crossed quad; "AC bisects ∠ECD" was unparsed and silently dropped; "חותך" was not an intersection keyword (clobbered A,B).',
    steps: [
      'ABCD חסום במעגל',
      { llm: [{ type: 'segment', a: 'A', b: 'C' }] }, // "AC"
      { llm: [{ type: 'segment', a: 'B', b: 'D' }] }, // "BD"
      'F חיתוך AC ו-BD',
      'המשיק בנקודה C חותך את המשך AB בנקודה E',
      'AB=CB',
      'AC חוצה את הזווית ECD',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      expect(dist(A, B)).toBeCloseTo(dist(C, B), 3); // AB = CB
      expect(angle(E, C, A)).toBeCloseTo(angle(A, C, D), 2); // AC bisects ∠ECD (∠ECA = ∠ACD)
      convexQuad(fig, ['A', 'B', 'C', 'D'], 'O'); // stays convex, nothing collapsed
    },
  },
  {
    id: 'bagrut-4d',
    title: 'cyclic quad ABCD, AD a diameter, F on the continuation of CB with FB⊥FA, ∠BDA=24°',
    guards: 'the angle step scrambled the quad / broke the diameter; F snapped from the CB-extension onto segment CB.',
    steps: [
      'ABCD בר חסימה במעגל',
      'AD קוטר במעגל ABCD',
      'F על המשך CB כך ש FB⊥FA',
      '∠BDA=24',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), F = at(fig, 'F'), O = at(fig, 'O');
      // AD is STILL a diameter after the angle (A, D antipodal about O).
      expect(O.x).toBeCloseTo((A.x + D.x) / 2, 4);
      expect(O.y).toBeCloseTo((A.y + D.y) / 2, 4);
      expect(angle(B, D, A)).toBeCloseTo(24, 1); // the given
      expect(angle(A, B, D)).toBeCloseTo(90, 1); // Thales (angle on a diameter)
      // F on the CONTINUATION of CB (beyond B), and ∠AFB = 90°.
      const t = ((F.x - C.x) * (B.x - C.x) + (F.y - C.y) * (B.y - C.y)) / ((B.x - C.x) ** 2 + (B.y - C.y) ** 2);
      expect(t).toBeGreaterThan(1);
      expect(angle(A, F, B)).toBeCloseTo(90, 1);
    },
  },
  {
    id: 'inscribed-vs-cyclic',
    title: '"ABCD חסום במעגל" draws the circle; "ABCD בר חסימה" hides it; both convex',
    guards: 'bare form (no "מרובע") escalated to the LLM, which collapsed both to the cyclic/hidden form; the inscribed quad was crossed (golden-angle spread).',
    steps: ['ABCD חסום במעגל'],
    check(fig) {
      allStepsOk(fig);
      const circle = fig.construction.objects.find((o) => o.kind === 'circle') as { hidden?: boolean };
      expect(circle.hidden).toBeFalsy(); // inscribed → circle drawn
      convexQuad(fig, ['A', 'B', 'C', 'D'], 'O');
    },
  },
  {
    id: 'cyclic-quad-hidden',
    title: '"ABCD בר חסימה" — concyclic convex quad, circle NOT drawn (opposite angles 180°)',
    guards: 'cyclic-quad vertices must be convex (opposite angles sum to 180°) and the circle hidden.',
    steps: ['ABCD בר חסימה'],
    check(fig) {
      allStepsOk(fig);
      const circle = fig.construction.objects.find((o) => o.kind === 'circle') as { hidden?: boolean };
      expect(circle.hidden).toBe(true); // cyclic → circle hidden
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(angle(D, A, B) + angle(B, C, D)).toBeCloseTo(180, 3); // opposite angles
      convexQuad(fig, ['A', 'B', 'C', 'D'], 'O');
    },
  },
  {
    id: 'secant-from-external-point',
    title: '"מנקודה E מחוץ למעגל … חותך … בנקודות A ו-B" — a secant from a point outside the circle',
    guards:
      'the parser had no "secant from an external point" construct, so it escalated; the LLM decomposed it into "E על המשך OA" — referencing A before it exists ("unresolved dependencies for E") — a circular definition. A deterministic rule now builds A,B on the circle (a chord) + E on the extension, collinear and outside.',
    steps: [
      'נתון מעגל O שרדיוסו R', // circle O radius R
      'מנקודה E מחוץ למעגל מעבירים ישר שחותך את המעגל בנקודות A ו- B',
    ],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['O', 'A', 'B', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), E = at(fig, 'E');
      expect(dist(O, A)).toBeCloseTo(dist(O, B), 3); // A, B both on the circle (equal radii)
      expect(dist(O, E)).toBeGreaterThan(dist(O, A) + 1e-6); // E is OUTSIDE the circle
      // E, A, B are collinear — a straight secant through the external point.
      const sin = Math.abs((A.x - E.x) * (B.y - E.y) - (A.y - E.y) * (B.x - E.x)) / (dist(E, A) * dist(E, B));
      expect(sin).toBeLessThan(1e-3);
    },
  },
  {
    id: 'two-tangents-from-external-point',
    title: '"from point E outside circle O two tangents touch the circle at A and B"',
    guards:
      'only "tangent AT a point on the circle" existed; tangents FROM an external point (touch points computed) were unsupported and half-parsed to a single wrong tangent. Built via the Thales circle on OE: A,B = circle O ∩ circle-on-diameter-OE.',
    steps: ['circle O radius 5', 'from point E outside circle O two tangents touch the circle at A and B'],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['O', 'A', 'B', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), E = at(fig, 'E');
      expect(dist(O, A)).toBeCloseTo(dist(O, B), 3); // A,B on the circle
      expect(dist(O, E)).toBeGreaterThan(dist(O, A) + 1e-6); // E outside
      // a tangent is ⟂ its radius: EA ⟂ OA and EB ⟂ OB (normalised dot ≈ 0).
      const perp = (T: Vec) => Math.abs((T.x - O.x) * (T.x - E.x) + (T.y - O.y) * (T.y - E.y)) / (dist(O, T) * dist(E, T));
      expect(perp(A)).toBeLessThan(1e-3);
      expect(perp(B)).toBeLessThan(1e-3);
      expect(dist(E, A)).toBeCloseTo(dist(E, B), 3); // equal tangent lengths
    },
  },
  {
    id: 'single-tangent-from-external-point',
    title: '"ED משיק למעגל" after a secant from E — a single tangent from the external point',
    guards:
      'a SINGLE tangent from an external point was unsupported (only two-tangents and tangent-at-a-point). The LLM dropped "ED משיק למעגל" and turned "מנקודה E … משיק" into a circle-through that redefined circle-O. Now the existing external E is the apex and D the computed touch point.',
    steps: [
      'מעגל סביב O רדיוס 5',
      'מנקודה E מחוץ למעגל יוצא חותך למעגל בנקודות A ו B', // secant → E external
      'ED משיק למעגל', // single tangent from E, touching at D
    ],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['O', 'E', 'D']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const O = at(fig, 'O'), E = at(fig, 'E'), D = at(fig, 'D');
      expect(dist(O, D)).toBeCloseTo(dist(O, at(fig, 'A')), 3); // D on the circle
      // a tangent ⟂ its radius: ED ⟂ OD.
      const perp = Math.abs((D.x - O.x) * (D.x - E.x) + (D.y - O.y) * (D.y - E.y)) / (dist(O, D) * dist(E, D));
      expect(perp).toBeLessThan(1e-3);
      // The auxiliary Thales-circle centre is a HIDDEN helper (id starts with "~"), so it isn't drawn
      // as a stray labelled point (scene.ts skips "~" ids) — no confusing unrequested point.
      expect(fig.construction.objects.some((o) => o.id.startsWith('~'))).toBe(true);
      expect([...fig.positions.keys()].some((k) => /^[A-Z]$/.test(k) && !['O', 'A', 'B', 'D', 'E'].includes(k))).toBe(false);
    },
  },
  {
    id: 'two-secants-from-same-point',
    title: 'two secants from the same external point E (E reused, not moved)',
    guards:
      'a second secant from E re-placed/over-constrained E (it moved inside the circle). The 2nd secant now reuses the existing E without a constraint (line E–C, the other intersection D), so the shared external point stays put.',
    steps: [
      'circle O radius 5',
      'from a point E outside circle O a line cuts the circle at A and B',
      'from E a line cuts the circle at C and D',
    ],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['O', 'A', 'B', 'C', 'D', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const O = at(fig, 'O'), E = at(fig, 'E');
      const r = dist(O, at(fig, 'A'));
      for (const id of ['A', 'B', 'C', 'D']) expect(dist(O, at(fig, id))).toBeCloseTo(r, 3); // all four on the circle
      expect(dist(O, E)).toBeGreaterThan(r + 1e-6); // E stays OUTSIDE (not moved inside)
      const colSin = (a: Vec, b: Vec) => Math.abs((a.x - E.x) * (b.y - E.y) - (a.y - E.y) * (b.x - E.x)) / (dist(E, a) * dist(E, b));
      expect(colSin(at(fig, 'A'), at(fig, 'B'))).toBeLessThan(1e-3); // secant 1 through E
      expect(colSin(at(fig, 'C'), at(fig, 'D'))).toBeLessThan(1e-3); // secant 2 through E
    },
  },
  {
    id: 'named-perpendicular-through-point',
    title: '"DE אנך ל-AB בנקודה C" builds a named perpendicular through C with D and E placed on it',
    guards:
      'the parser did not handle "DE ⟂ AB at C" so it escalated; the LLM rewrote it to an UNNAMED "line through C ⟂ AB", dropping D and E. The parser now handles it deterministically (through-point via "בנקודה/at", leading line name DE).',
    steps: [
      { llm: [{ type: 'segment', a: 'A', b: 'B' }] }, // "ישר AB" (escalated in the log)
      'נקודה C על AB',
      'DE אנך לAB בנקודה C',
    ],
    check(fig) {
      allStepsOk(fig);
      // The perpendicular line exists, and D, E were created ON it (straddling the foot C).
      expect(fig.construction.objects.some((o) => o.kind === 'line')).toBe(true);
      for (const id of ['C', 'D', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      const dot = (p: Vec, q: Vec, r: Vec, s: Vec) => (q.x - p.x) * (s.x - r.x) + (q.y - p.y) * (s.y - r.y);
      expect(Math.abs(dot(A, B, C, D))).toBeLessThan(1e-6); // CD ⟂ AB
      expect(Math.abs(dot(A, B, C, E))).toBeLessThan(1e-6); // CE ⟂ AB
      expect(dist(D, E)).toBeGreaterThan(1); // D and E are distinct (straddle C), not collapsed
    },
  },
  {
    id: 'named-perp-bisector-of-existing-segment',
    title: '"CD אנך אמצעי ל-AB" with CD already drawn → CD becomes the ⊥-bisector of AB (a constraint)',
    guards:
      'the perp-bisector rule bisected the leading NAME (CD) instead of the segment after the connector (AB), and — when C,D already exist — tried to re-create them as markers → "\'D\' is already defined". It now reads AB as the bisected segment and, since CD exists, constrains it (|CA|=|CB|, |DA|=|DB|) instead of redefining C/D.',
    steps: [
      { llm: [{ type: 'segment', a: 'A', b: 'B' }] }, // "ישר AB"
      { llm: [{ type: 'segment', a: 'C', b: 'D' }] }, // "ישר CD"
      'CD אנך אמצעי ל AB',
    ],
    check(fig) {
      allStepsOk(fig); // no "'D' is already defined" over-constraint
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // CD is the perpendicular bisector of AB ⇔ C and D are each equidistant from A and B.
      expect(dist(C, A)).toBeCloseTo(dist(C, B), 3);
      expect(dist(D, A)).toBeCloseTo(dist(D, B), 3);
    },
  },
  {
    id: 'existing-segment-perpendicular-cuts-at-new-point',
    title: '"CD אנך ל-AB וחותך אותו בנקודה E" with CD drawn → CD repositioned to a clean ⟂ cross at E',
    guards:
      'the MIRROR of perpendicular-cuts-at-existing-point: the NAME (CD) already exists and the cut-point (E) is NEW. Originally the rule anchored the perpendicular on the not-yet-made E ("unresolved dependencies") and re-created C,D ("already defined"); a constraint-only fix made CD ⟂ AB but the segments did NOT visually cross (E floated off both). The construct path now REPOSITIONS the loose C,D onto the perpendicular through E (E on AB, C,D straddling it) for a clean centred cross.',
    steps: [
      { llm: [{ type: 'segment', a: 'A', b: 'B' }] }, // "AB"
      { llm: [{ type: 'segment', a: 'C', b: 'D' }] }, // "CD"
      'CD אנך ל AB וחותך אותו בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig); // no "unresolved dependencies" / "already defined"
      for (const id of ['C', 'D', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      const cos = ((B.x - A.x) * (D.x - C.x) + (B.y - A.y) * (D.y - C.y)) / (dist(A, B) * dist(C, D));
      expect(Math.abs(cos)).toBeLessThan(1e-3); // CD ⟂ AB
      // A CLEAN cross: E lies ON segment AB and BETWEEN C and D (the segments actually cross at E).
      const paramOn = (X: Vec, p: Vec, q: Vec) => ((X.x - p.x) * (q.x - p.x) + (X.y - p.y) * (q.y - p.y)) / dist(p, q) ** 2;
      const tAB = paramOn(E, A, B), tCD = paramOn(E, C, D);
      expect(tAB).toBeGreaterThan(0); expect(tAB).toBeLessThan(1); // E on segment AB
      expect(tCD).toBeGreaterThan(0); expect(tCD).toBeLessThan(1); // E between C and D (CD spans E)
    },
  },
  {
    id: 'perpendicular-cuts-at-existing-point',
    title: '"ישר ED אנך ל-AB וחותך אותו בנקודה C" — ED ⟂ AB through the EXISTING C, no redefinition',
    guards:
      'the "cuts/חותך" keyword made the generic line∩line rule "stop" (it can\'t read it) → the parse aborted to the LLM, which modelled the foot as "C על ED" — REDEFINING C (already on AB) and erroring. The perpendicular-line rule now runs before line∩line and reads "בנקודה C" as the through-point, so C is reused, not redefined.',
    steps: [
      { llm: [{ type: 'segment', a: 'A', b: 'B' }] }, // "ישר AB" (escalated in the log)
      'C על AB',
      'ישר ED אנך לAB וחותך אותו בנקודה C',
    ],
    check(fig) {
      allStepsOk(fig); // critically: no "'C' is already defined" over-constraint
      for (const id of ['C', 'D', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      const dot = (p: Vec, q: Vec, r: Vec, s: Vec) => (q.x - p.x) * (s.x - r.x) + (q.y - p.y) * (s.y - r.y);
      expect(Math.abs(dot(A, B, C, D))).toBeLessThan(1e-6); // CD ⟂ AB (ED through C)
      expect(Math.abs(dot(A, B, C, E))).toBeLessThan(1e-6); // CE ⟂ AB
      // C stays ON AB (it's the foot the perpendicular passes through, not a point on ED only)
      const tC = ((C.x - A.x) * (B.x - A.x) + (C.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      expect(tC).toBeGreaterThan(0);
      expect(tC).toBeLessThan(1);
    },
  },
];

describe('reported scenarios — end-to-end replay of real bug reports', () => {
  for (const sc of SCENARIOS) {
    it(`[${sc.id}] ${sc.title}`, () => {
      sc.check(run(sc.steps));
    });
  }
});

/**
 * Resampling regressions — these exercise "show another configuration" (seed > 0), which the
 * seed-0 scenario runner above can't reach. The exact operator sequence is replayed through the
 * real store (parse-with-context → execute → resample), as the app does.
 */
describe('reported scenarios — "show another configuration" keeps a polygon valid', () => {
  it('[quad-diagonals-resample] "מרובע ABCD" + "AC=10" + "DB=10" resamples only to a clean CONVEX quad', () => {
    // The operator built a general quad with both diagonals = 10; "show another configuration"
    // landed first on a tangled (self-crossing) ABCD, then on a concave (dart) one. The sampler
    // must only surface a CLEAN CONVEX drawing of the shape (rejects both).
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['מרובע ABCD', 'AC=10', 'DB=10']) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    for (let press = 0; press < 8; press++) {
      st.resample();
      const seed = useGeoStore.getState().seed;
      const fig = replay(useGeoStore.getState().facts, seed);
      expect(polygonsConvex(useGeoStore.getState().facts, fig.positions), `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(fig, 'A'), at(fig, 'C'))).toBeCloseTo(10, 3); // the diagonals still hold
      expect(dist(at(fig, 'B'), at(fig, 'D'))).toBeCloseTo(10, 3);
    }
    st.clear();
  });

  it('[secant-tangent-resample] a figure with BOTH a branch and free DOFs varies its free DOFs, not only the branch', () => {
    // circle + secant from E + tangent from E + ∠DOA=2α. D is a circle∩circle (BRANCHABLE) and A,B
    // are free on-circle. The "show another configuration" button used to cycle the branch
    // EXCLUSIVELY when any branch existed, so A,B stayed fixed (only 2 options). The figure must in
    // fact have free DOFs that resampling varies, alongside the discrete branch.
    const steps = [
      'מעגל O שרדיוסו R',
      'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B',
      'מנקודה E משיק נוגע במעגל O בנקודה D',
      '∠DOA=2α',
    ];
    const facts: Fact[] = [];
    let g = 0;
    for (const u of steps) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const group = `g${g++}`;
      for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    }
    const base = replay(facts);
    // BOTH kinds of freedom coexist: a branchable point AND continuous free DOFs.
    expect(base.construction.objects.some((o) => o.kind === 'circle-circle')).toBe(true);
    expect(freeDofs(base.construction).length).toBeGreaterThan(0);
    // Resampling (what the button now also does) moves the free on-circle points A,B — not fixed.
    const moved = [1, 2, 3, 4, 5].some((seed) => {
      const f = replay(facts, seed);
      return dist(f.positions.get('A')!, base.positions.get('A')!) > 1e-3 || dist(f.positions.get('B')!, base.positions.get('B')!) > 1e-3;
    });
    expect(moved).toBe(true);
  });
});
