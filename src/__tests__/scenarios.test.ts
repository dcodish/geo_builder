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
import { parse, droppedNewLabels } from '@/parser';
import { replay, polygonsConvex, useGeoStore, firstSatisfyingSeed, dryRunOutcome, hasDeferrableConstraint } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import { isGeoPoint, freeDofs, freeDofCount, applySeed, firstCyclableBranch, evaluate, circleMembers, pointNeighbors, detectRelations } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';
import { humanizeError } from '@/i18n/humanizeError';

type Step = string | { llm: AnyCommand[] };
interface Scenario {
  id: string;
  title: string;
  /** The bug this sequence guards against (for the readable record). */
  guards: string;
  steps: Step[];
  check: (fig: Derived) => void;
  /** Opt out of the blanket "the figure satisfies its stated givens" assertion (rare — only when a
   *  scenario intentionally builds a figure the verifier flags, e.g. a documented known-limitation). */
  expectViolations?: boolean;
}

/** The figure context the app feeds the parser: circle centres + existing point ids. */
function ctxOf(facts: Fact[]) {
  const { construction } = replay(facts);
  return {
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])), // drop ~scaffolding circles (mirrors App.parseCtx)
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction),
    neighbors: pointNeighbors(construction),
    lines: construction.objects.flatMap((o) => (o.kind === 'line' ? [o.id] : [])),
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
  // Mirror the app: when a figure has free DOFs whose default placement breaks an extension's directional
  // order ("המשך" must reach the far side), the store auto-advances to the first satisfying configuration.
  // `firstSatisfyingSeed` returns 0 for any figure without that issue, so non-extension scenarios are
  // unchanged. (ADR-098.)
  return replay(facts, firstSatisfyingSeed(facts));
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
    id: 'name-existing-circle-centre',
    title: '"O מרכז המעגל" reveals the centre of an EXISTING inscribed circle (ADR-148 #2), without clobbering it',
    guards:
      'production triage (events.jsonl, 2026-06-29, sessions 0nzwixeg/ea5dfjpr): after "מרובע ABCD חסום במעגל" (a circle with a hidden auto-centre O), "O מרכז המעגל" / "מרכז המעגל O" built nothing — the student wanted to NAME/reveal the existing centre, but there was no command for it (ADR-148 deferred #2) and re-creating the circle is idempotent. Root fix: a `name-center` command flips the circle\'s `autoCenter` off (centre shows, FR-RN-8) WITHOUT touching its radius (re-emitting `circle` would clobber the inscribed-circle radius spec and kick the vertices off). The parser\'s `nameCenter` rule emits it when the named centre already belongs to a circle; with no circle yet "O מרכז המעגל" still CREATES one (order-independent `circleCenter`).',
    steps: [
      'מרובע ABCD חסום במעגל', // a circle with a hidden auto-centre O + A,B,C,D on it
      'O מרכז המעגל', // name/reveal the existing centre — must NOT rebuild the circle
    ],
    check(fig) {
      allStepsOk(fig);
      const circ = fig.construction.objects.find((o) => o.kind === 'circle' && o.center === 'O') as { autoCenter?: boolean } | undefined;
      expect(circ, 'the inscribed circle still exists, centred O').toBeTruthy();
      expect(circ!.autoCenter, 'its centre is now revealed (autoCenter cleared)').toBeFalsy();
      // the inscribed vertices are still ON the circle (radius spec was not clobbered)
      for (const v of ['A', 'B', 'C', 'D']) expect(fig.positions.has(v), `${v} present`).toBe(true);
    },
  },
  {
    id: 're-entry-reuses-no-duplicate-circles',
    title: 'Re-entering "inscribe ABCD in a circle" reuses the circle (no stacked O/P/Q); the incircle is a distinct circle',
    guards:
      'operator-reported (local test): inscribe typed repeatedly then incircle showed "O and P on the same point" — each re-inscribe minted a NEW circumcircle (O, P, Q), all landing on the same circumcentre, because an auto-named centre re-picks a fresh freeLabel and defeats the deterministic-id idempotency. Root fix (ADR-156): a construct reuses an existing object satisfying its definition — re-inscribing points already on a circle reuses that circle; re-issuing the incircle reuses its deterministic bisectors. Result: ONE circumcircle + ONE incircle, no coincidence.',
    steps: [
      'מרובע ABCD חסום במעגל', // inscribe → circle O, A,B,C,D on it
      'מרובע ABCD חסום במעגל', // RE-inscribe → must reuse circle O (no circle P)
      'מעגל חסום במרובע ABCD', // the incircle → a distinct circle (bicentric quad)
    ],
    check(fig) {
      allStepsOk(fig);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'exactly one circumcircle + one incircle — no duplicates').toBe(2);
      expect(fig.coincidences, 'no two centres stacked on the same point').toEqual([]);
    },
  },
  {
    id: 'incircle-of-trapezoid-flexes-tangential',
    title: '"O הוא מרכז המעגל החסום בטרפז" — the incircle of a trapezoid; the trapezoid flexes to tangential',
    guards:
      'operator feature request (from the triage report): generalise the incircle from triangle-only to any polygon, flexing a quad to TANGENTIAL when it can. "O הוא מרכז המעגל החסום בטרפז" auto-names trapezoid ABCD + incentre O (bisectors at two adjacent vertices), drops a foot on each side, and forces the non-auto edge\'s foot onto the incircle so the trapezoid flexes until all four sides are tangent. The four touch points end equidistant from O (a true incircle). A rigidly pinned non-tangential quad would surface as over-constraint (operator: raise an issue) — handled by the general constraint machinery.',
    steps: ['O הוא מרכז המעגל החסום בטרפז'],
    check(fig) {
      allStepsOk(fig);
      const circ = fig.construction.objects.find((o) => o.kind === 'circle' && o.center === 'O');
      expect(circ, 'an incircle centred O').toBeTruthy();
      const O = at(fig, 'O');
      const feet = fig.construction.objects.filter((o) => o.kind === 'foot').map((o) => o.id);
      expect(feet.length, 'a touch point on each of the 4 sides').toBe(4);
      const ds = feet.map((f) => dist(O, at(fig, f)));
      // all four touch points equidistant from O ⇒ the circle is tangent to all four sides (tangential)
      for (const d of ds) expect(d, 'touch point on the incircle').toBeCloseTo(ds[0], 3);
    },
  },
  {
    id: 'inscribed-angle-on-diameter-thales',
    title: '"זווית היקפית נשענת על הקוטר" on an existing circle → Thales: the inscribed angle on the diameter is 90°',
    guards:
      'operator feature request (from the triage report): support the inscribed-angle-on-diameter (Thales). Requires an existing circle (operator choice). Builds a diameter A–B + apex C on the circle + chords A–C, B–C, and marks ∠ACB = 90°. The right angle holds automatically for any C (Thales), so set-angle 90 is a check that draws the right-angle square.',
    steps: [
      'מעגל O רדיוס 5', // an existing circle
      'זווית היקפית נשענת על הקוטר', // Thales — diameter + apex + 90° mark
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      expect(angle(A, C, B), 'inscribed angle on the diameter is a right angle').toBeCloseTo(90, 1);
      expect(fig.angleMarks.some((m) => m.right && m.vertex === 'C'), 'a right-angle mark at the apex C').toBe(true);
    },
  },
  {
    id: 'altitude-from-vertex-infers-triangle',
    title: '"גובה מנקודה D" infers the opposite side from the apex\'s unique triangle, even with extra points present',
    guards:
      'production triage (events.jsonl, 2026-06-29): bare "גובה מנקודה D" / "הורד גובה מנקודה D" failed when the figure had MORE than two other points — the altitude rule\'s context fallback required the whole figure to be exactly apex+2. Root fix: derive the opposite side from the adjacency (ctx.neighbors) — the apex\'s UNIQUE triangle. Apex in 2+ triangles (ambiguous) still defers rather than guess a side (ADR-052). The well-specified "גובה מנקודה D לצלע AB" was never affected.',
    steps: [
      'משולש ABD', // triangle whose vertex D is the altitude apex
      'קטע MN', // extra unrelated points so the figure has >2 points besides D (the old fallback failed here)
      'גובה מנקודה D', // opposite side AB inferred from D's only triangle
    ],
    check(fig) {
      allStepsOk(fig);
      const pts = fig.construction.objects.filter(isGeoPoint).map((o) => o.id);
      expect(pts, 'the inputs are present').toEqual(expect.arrayContaining(['A', 'B', 'D', 'M', 'N']));
      expect(pts.length, 'a foot point was created (altitude resolved)').toBeGreaterThan(5);
    },
  },
  {
    id: 'named-altitude-keeps-its-foot-name',
    title: '"משולש ABC" → "CD גובה" — the named altitude on an existing triangle keeps its foot D (was silently renamed CF)',
    guards:
      'operator-reported (2026-06-29, session 243yyqae): with triangle ABC already drawn, "CD גובה" built the altitude but the segment came out as CF. TWO root causes: (1) the `altitude` rule derived the apex only from a "from/מ" phrase and ALWAYS auto-named the foot via freeLabel (→ F), so a NAMED altitude segment ("CD גובה", C=apex/vertex, D=foot) lost the D; (2) — the one that kept biting after the first fix — the rule required the opposite side/triangle to be stated IN the utterance and had no figure-context fallback, so the bare "CD גובה" (triangle already on the canvas) returned not-handled → escalated to the LLM → "גובה מ-C במשולש ABC" → foot auto-named F → segment CF. Fix: the altitude rule (a) recognises a named altitude segment in either word order (height/altitude/גובה only — "EF אנך ל AB" stays the ⟂ constraint), and (b) derives the opposite side from the figure context when unstated (mirrors the `median` rule), so "CD גובה" on an existing triangle parses deterministically and keeps D.',
    steps: [
      'משולש ABC', // triangle ABC
      'CD גובה', // the EXACT utterance — opposite side derived from the existing triangle; foot must be D, not F
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('D'), 'the foot is named D (the student\'s letter)').toBe(true);
      expect(fig.positions.has('F'), 'no auto-named foot F was fabricated').toBe(false);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // D is the foot of the perpendicular from C onto AB: on line AB and CD ⟂ AB.
      const onAB = Math.abs((D.x - A.x) * (B.y - A.y) - (D.y - A.y) * (B.x - A.x)) / Math.max(dist(A, B), 1) ** 2;
      expect(onAB, 'D on line AB').toBeLessThan(1e-3);
      const cd = { x: D.x - C.x, y: D.y - C.y }, ab = { x: B.x - A.x, y: B.y - A.y };
      expect(Math.abs(cd.x * ab.x + cd.y * ab.y) / (Math.hypot(cd.x, cd.y) * Math.hypot(ab.x, ab.y) + 1e-9), 'CD ⟂ AB').toBeLessThan(1e-3);
    },
  },
  {
    id: 'named-midsegment-keeps-its-endpoint-names',
    title: '"PQ קטע אמצעים לצלע BC במשולש ABC" — the named midsegment keeps endpoints P,Q (was auto-renamed M,N)',
    guards:
      'Sibling of the named-altitude bug (ADR-149), found by auditing every rule that auto-names a derived point: the `midsegment` rule always auto-named its two endpoints (M,N via freeLabel) and had no named-form path, so "PQ קטע אמצעים …" silently renamed the student\'s P,Q to M,N. Fix: the rule reads a leading or keyword-first named pair (uppercase labels only, so a lowercase connector like "to BC" is never misread as labels T,O) that isn\'t the triangle\'s own vertices. Asserts the endpoints are P,Q, no M,N fabricated, P=mid(AB), Q=mid(AC), and PQ ∥ BC (the midsegment theorem holds).',
    steps: [
      'משולש ABC', // triangle ABC
      'PQ קטע אמצעים לצלע BC במשולש ABC', // PQ is the midsegment to BC — endpoints must be P,Q
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('P') && fig.positions.has('Q'), 'endpoints named P,Q').toBe(true);
      expect(fig.positions.has('M') || fig.positions.has('N'), 'no auto-named M,N fabricated').toBe(false);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), P = at(fig, 'P'), Q = at(fig, 'Q');
      const mid = (u: Vec, v: Vec) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
      expect(dist(P, mid(A, B)), 'P = midpoint of AB').toBeLessThan(1e-9);
      expect(dist(Q, mid(A, C)), 'Q = midpoint of AC').toBeLessThan(1e-9);
      const pq = { x: Q.x - P.x, y: Q.y - P.y }, bc = { x: C.x - B.x, y: C.y - B.y };
      expect(Math.abs(pq.x * bc.y - pq.y * bc.x) / (Math.hypot(pq.x, pq.y) * Math.hypot(bc.x, bc.y) + 1e-9), 'PQ ∥ BC').toBeLessThan(1e-9);
    },
  },
  {
    id: 'named-altitude-keyword-first-keeps-foot',
    title: '"הגובה CD במשולש ABC" (keyword-first word order) — the named altitude keeps foot D',
    guards:
      'Completes the ADR-149 fix: the first pass only caught the name-FIRST order ("CD גובה"); the keyword-FIRST order ("הגובה CD" / "the altitude CD") was still not-handled → escalated to the LLM → "altitude from C" → foot auto-named F → the original CF symptom. The named-segment detection now matches either word order (uppercase labels immediately after the keyword, so a lowercase connector is never read as a name).',
    steps: [
      'משולש ABC',
      'הגובה CD במשולש ABC', // keyword-first named altitude — foot must be D, not F
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('D'), 'foot named D').toBe(true);
      expect(fig.positions.has('F'), 'no auto-named F').toBe(false);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      const onAB = Math.abs((D.x - A.x) * (B.y - A.y) - (D.y - A.y) * (B.x - A.x)) / Math.max(dist(A, B), 1) ** 2;
      expect(onAB, 'D on line AB').toBeLessThan(1e-3);
      const cd = { x: D.x - C.x, y: D.y - C.y }, ab = { x: B.x - A.x, y: B.y - A.y };
      expect(Math.abs(cd.x * ab.x + cd.y * ab.y) / (Math.hypot(cd.x, cd.y) * Math.hypot(ab.x, ab.y) + 1e-9), 'CD ⟂ AB').toBeLessThan(1e-3);
    },
  },
  {
    id: 'bagrut-chord-diameter-perp-session',
    title:
      'real production session: "AB קוטר במעגל" → "D אמצע הרדיוס OB" → "AC מיתר" → "E על המיתר AC" → "DE מקביל ל BC" → "ED=EC" → "F על AB" → "EF אנך ל AB" builds a valid figure (no step escalates)',
    guards:
      'Production usage analytics (2026-06-29, 57 students) showed this exact bagrut flow was the dominant FAILING session. Three deterministic gaps fixed: (1) "E על המיתר AC" — the DEFINITE article "המיתר" was missing from CARRIER_NOUN (only bare "מיתר" had ה?), so the point-on-chord rule dropped the rider E; (2) "AB קוטר במעגל" as an opener (A,B new, no circle yet) did not DEFINE a circle from its diameter; (3) "EF אנך ל AB" — the ⟂ constraint matched "מאונך" but not the noun form "אנך". Each step must now parse deterministically (no LLM escalation) and the assembled figure must satisfy every given.',
    steps: [
      'AB קוטר במעגל', // #3 — define a circle from diameter AB (A,B new)
      'D אמצע הרדיוס OB', // midpoint of radius OB
      'AC מיתר', // chord AC — A,C on circle O
      'E על המיתר AC', // #1 — E on the DEFINITE chord "המיתר" (must place E, not drop it)
      'DE מקביל ל BC', // DE ∥ BC
      'ED=EC', // |ED| = |EC|
      'F על AB', // F on AB
      'EF אנך ל AB', // #5 — EF ⟂ AB via the noun "אנך"
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F'), O = at(fig, 'O');
      // AB a diameter ⇒ O the midpoint ⇒ A,B,C all on circle O
      expect(Math.abs(dist(O, A) - dist(O, B)), 'A,B on circle O (AB diameter)').toBeLessThan(1e-4);
      expect(Math.abs(dist(O, A) - dist(O, C)), 'C on circle O (chord AC)').toBeLessThan(1e-4);
      // D = midpoint of the radius OB
      expect(dist(D, { x: (O.x + B.x) / 2, y: (O.y + B.y) / 2 }), 'D = midpoint of OB').toBeLessThan(1e-4);
      // E on segment AC
      const cross = Math.abs((E.x - A.x) * (C.y - A.y) - (E.y - A.y) * (C.x - A.x)) / Math.max(dist(A, C), 1) ** 2;
      expect(cross, 'E on line AC (placed, not dropped)').toBeLessThan(1e-2);
      expect(Math.abs(dist(E, D) - dist(E, C)), '|ED| = |EC|').toBeLessThan(1e-3);
      // DE ∥ BC and EF ⟂ AB
      const de = { x: E.x - D.x, y: E.y - D.y }, bc = { x: C.x - B.x, y: C.y - B.y };
      expect(Math.abs(de.x * bc.y - de.y * bc.x) / (Math.hypot(de.x, de.y) * Math.hypot(bc.x, bc.y) + 1e-9), 'DE ∥ BC').toBeLessThan(1e-3);
      const ef = { x: F.x - E.x, y: F.y - E.y }, ab = { x: B.x - A.x, y: B.y - A.y };
      expect(Math.abs(ef.x * ab.x + ef.y * ab.y) / (Math.hypot(ef.x, ef.y) * Math.hypot(ab.x, ab.y) + 1e-9), 'EF ⟂ AB').toBeLessThan(1e-3);
    },
  },
  {
    id: 'point-on-chord-named-carrier',
    title: '"E על מיתר AC" — a point ON a named carrier (chord) parses to point-on-segment; E is not dropped, A/C stay on the circle',
    guards:
      'operator-reported: "E על מיתר AC" was not-understood. Root cause: the point-on rules required the two carrier labels to come IMMEDIATELY after על/on, so a descriptor noun (מיתר/chord, צלע/side, קטע/segment, אלכסון/diagonal) wedged between the connector and the labels made them miss — and worse, with a circle in context the `chord` (and `segment`) carrier-DEFINING rule grabbed the bare "AC" run and silently DROPPED the named rider point E. Fix: a shared CARRIER_NOUN set — `SEG_NOUN` lets the point-on rules skip the noun, and `POINT_ON_CARRIER` makes the carrier-defining rules bail on a "<point> on <carrier> AB" utterance so point-on wins. `withChordMembership` now also reads a point-on-segment carrier so A,C still land on the circle.',
    steps: [
      'מעגל O', // circle O (so the chord endpoints have a circle to live on)
      'מיתר AC', // chord AC — A,C on circle O + segment AC
      'E על מיתר AC', // E ON chord AC — must parse to point-on-segment, NOT drop E
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('E'), 'E placed (not dropped)').toBe(true);
      const A = at(fig, 'A'), C = at(fig, 'C'), E = at(fig, 'E'), O = at(fig, 'O');
      // E lies on segment AC (zero cross-product, between the ends)
      const cross = Math.abs((E.x - A.x) * (C.y - A.y) - (E.y - A.y) * (C.x - A.x)) / Math.max(dist(A, C), 1) ** 2;
      expect(cross, 'E on line AC').toBeLessThan(1e-2);
      const tDot = ((E.x - A.x) * (C.x - A.x) + (E.y - A.y) * (C.y - A.y)) / dist(A, C) ** 2;
      expect(tDot, 'E between A and C').toBeGreaterThan(-1e-6);
      expect(tDot, 'E between A and C').toBeLessThan(1 + 1e-6);
      // the chord endpoints are on circle O (radius = |OA| = |OC|)
      expect(Math.abs(dist(O, A) - dist(O, C)), 'A,C equidistant from O (on the circle)').toBeLessThan(1e-6);
    },
  },
  {
    id: 'two-tangent-circles-then-size-given-flexes-radii',
    title: '"two circles tangent externally" then "OP = 4" RESIZES the radii (r1+r2 = |OP|) instead of over-constraining — the radii are free DOFs, not pinned at 5/3',
    guards:
      'operator session 23vqi9u8 (built "שני מעגלים משיקים מבחוץ", then OM= / OP=). The figure was created with both radii PINNED at the default seeds (5 and 3): the deterministic parser had no rule for the unnamed phrasing, so it escalated to the LLM, which emitted `circle … radius 5` / `radius 3` (FIXED) + `circles-tangent`. External tangency then forces |OP| = r1+r2 = 8 rigidly, so the student\'s own "OP = 4" was reported "over-constrained: |OP| = 8 cannot hold" — a value the student never gave (ADR-052 violation). The touch point M is also rigid at |OM| = r1 = 5, so "OM = 4" could not move it either. Root fix: (1) a deterministic `circlesTangent` rule that materialises the two circles with FREE radii (distinct seeds); (2) the engine builds external tangency as a `coincide` between the touch point seen from each circle (M = radial-toward(c1→c2), a hidden witness = radial-toward(c2→c1)), with both free radii marked as PERMANENT drivers of it — so |OP| = r1+r2 is a constraint the radii flex to satisfy, not a pinned number. "OP = 4" now resizes the radii (r1+r2 = 4) and "OM = 4" sets r1 = 4, both without over-constraining; the recruiter reaches the radii via radial-toward ancestry (circlesOfPoint/pointParents).',
    steps: ['שני מעגלים משיקים מבחוץ', 'OP=4'],
    check(fig) {
      allStepsOk(fig); // no "over-constrained: |OP| = 8 cannot hold"
      const O = at(fig, 'O'), P = at(fig, 'P'), M = at(fig, 'M');
      // The student's size given holds, and the figure is a genuine EXTERNAL tangency at it: M lies on
      // both circles (|OM| + |MP| = |OP|) and the radii summed to |OP| = 4 (so they flexed off the 5/3 seeds).
      expect(dist(O, P)).toBeCloseTo(4, 2);
      expect(dist(O, M) + dist(M, P)).toBeCloseTo(dist(O, P), 2); // M collinear & between ⇒ tangent (not crossing)
      expect(dist(O, M)).toBeLessThan(4); // r1 shrank below its seed of 5 to make r1+r2 = 4
    },
  },
  {
    id: 'chord-tangent-to-other-circle-at-endpoint',
    title: '"the chord AD in circle P is tangent to circle O at A" creates D on circle P, draws the chord AD, and makes OA ⟂ AD (tangent) — not a mutual-tangency that drops D',
    guards:
      'operator session vk346px4 (two intersecting circles O,P; chord CB tangent to P at B; then "המיתר AD במעגל P משיק למעגל O בנקודה A"). The last step parsed to a single `circles-tangent` between circle-P and circle-O — point D and the chord AD were DROPPED entirely, and it asserted the two circles are tangent to EACH OTHER, contradicting the opening "two circles intersect". Status showed green ✓ while nothing new appeared on the canvas. Root cause: `circlesTangent` fires on any "two `מעגל X` tokens + a `משיק` keyword", but here one circle mention ("במעגל P") is the chord\'s HOST, not a second tangent circle — the rule can\'t tell them apart and throws away the chord. The deterministic parser also had NO tangent-chord construct at all (the symmetric step-2 chord only worked via the LLM). Fix: a new `tangentChord` rule (splits at the tangent keyword → host circle before, tangency circle + point after) emits both endpoints on the host circle + radius(target→Z) ⟂ the chord + the segment; and a `chord`/`מיתר` guard on `circlesTangent` so a chord phrasing can never become mutual tangency.',
    steps: [
      'שני מעגלים נחתכים',
      // Step 2 in the live session was "המיתר CB משיק למעל P בנקודה B" — the "למעל" typo made it
      // out-of-grammar so it escalated to the LLM. Captured here as the canonical commands the log shows.
      { llm: [
        { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
        { type: 'point-on-circle', id: 'B', circle: 'circle-P' },
        { type: 'set-perpendicular', a: 'P', b: 'B', c: 'C', d: 'B', implicit: true },
        { type: 'segment', a: 'C', b: 'B' },
      ] },
      'CB',
      'המיתר AD במעגל P משיק למעגל O בנקודה A',
    ],
    check(fig) {
      allStepsOk(fig);
      // D was created (the bug dropped it) and lies on circle P (a real chord endpoint).
      const D = at(fig, 'D'), A = at(fig, 'A'), O = at(fig, 'O'), Pc = at(fig, 'P');
      expect(dist(D, Pc)).toBeCloseTo(dist(A, Pc), 3); // |PD| = |PA| ⇒ D on circle P
      // The chord AD is tangent to circle O at A: radius OA ⟂ the chord AD (∠OAD = 90°).
      expect(angle(O, A, D)).toBeCloseTo(90, 1);
    },
  },
  {
    id: 'diameter-on-existing-chord-is-a-constraint',
    title: '"AB is a diameter" of an EXISTING circle whose endpoints A,B already exist makes the chord a diameter (∠ at the far vertex → 90°), not a re-creation that errors',
    guards:
      'operator session ylea4zal: "AB קוטר במעגל P" (AB is a diameter of circle P) FAILED with "\'B\' is already defined — it can\'t be redefined as something different" → built-nothing. Diagnosed from the log: the figure\'s circle really was P (a circumcircle through A,B,D, centre P a derived circumcentre), and A,B already existed on it — but the `diameter` rule emits the `diameter` command, whose apply re-creates A as a fresh on-circle point and B as "the antipode of A" (apply.ts), which collides with the already-existing A,B. Root cause: a `diameter` declared over points that already exist on the circle must be a CONSTRAINT on the existing chord, never a re-creation — the same "declaration against an existing circle/points is a constraint" pattern as ADR-080/092/099/115. Fix (ADR-137): when both endpoints already exist, the `diameter` rule emits `set-collinear [A, centre, B]` — the centre is equidistant from A,B (both on the circle), so collinearity forces the centre to their midpoint ⇒ AB passes through the centre ⇒ a diameter. The engine flexes the figure to satisfy it (numerically for a derived circumcentre — no dependency cycle — or by converting a free on-circle endpoint to the other\'s antipode). NOTE: the current parser auto-names the inscribed circle O (not P, and via on-circle points rather than a circumcircle — a representation drift since the session), so this scenario references the circle by its actual name O; the circumcircle-named-P representation is locked separately as a unit test.',
    steps: ['משולש ABC חסום במעגל', 'AB קוטר במעגל O'],
    check(fig) {
      allStepsOk(fig);
      // AB is now a genuine diameter: the third vertex C sees AB at 90° (Thales), in EVERY configuration,
      // and the centre O lies on segment AB. (Asserting across seeds proves it's a real constraint, not a
      // lucky default.)
      for (let s = 0; s < 5; s++) {
        const e = evaluate(applySeed(fig.construction, s));
        expect(e.ok, `seed ${s} evaluates`).toBe(true);
        if (!e.ok) continue;
        const A = e.positions.get('A')!, B = e.positions.get('B')!, C = e.positions.get('C')!, O = e.positions.get('O')!;
        expect(angle(A, C, B), `seed ${s}: ∠ACB = 90 (AB is a diameter)`).toBeCloseTo(90, 0);
        const ab = { x: B.x - A.x, y: B.y - A.y };
        const off = Math.abs((O.x - A.x) * ab.y - (O.y - A.y) * ab.x) / Math.hypot(ab.x, ab.y);
        expect(off, `seed ${s}: centre O lies on AB`).toBeLessThan(1e-3);
      }
    },
  },
  {
    id: 'order-only-solve-stays-samplable',
    title: 'an inscribed triangle + tangent∩extension stays UNDETERMINED — no "forced" angle numbers, vertices still vary',
    guards:
      'operator (manual test, screenshot): an inscribed triangle ADB + "the tangent at D and the extension of AB meet at E" showed every angle as a definite number (51.8°, 65°, …) in the "view relations" layer even though the figure has 2 free DOF ("the shape is not defined, so this should not have happened"). This is the ADR-136 false-positive again, via a THIRD cause that ADR-136\'s lone-triangle test missed: the SECOND step\'s `line-intersection E` carries `collinear-order [A,B,E]` (ADR-135 — E must land BEYOND B). Applying that order RECRUITED the triangle\'s now-`free` on-circle vertices A,D,B (+ centre O + free-radius circle) and marked each with `solve`, RE-freezing the very vertices ADR-136 had un-frozen. But an order/region constraint removes 0 DOF (ADR-039, `dofRemoved`) — the carriers stay free WITHIN the region. The sampler predicates (`isFreeOnCircle` etc.) excluded any point with `solve` set, so all 16 relation-samples were IDENTICAL → every angle read "definitive", and "show another configuration" could not vary the triangle. The exact ADR-052 smell: vertices counted by the DOF cue (reads 2) but absent from `freeDofs` (read only [O]). Fix (ADR-136 Am. 2): a carrier whose `solve` is ONLY an order/region constraint is NOT consumed — it stays free/samplable; `evaluate` re-enforces the order from the perturbed seed (an in-region perturbation has 0 residual), so the triangle varies while E stays beyond B in every config.',
    steps: ['משולש ADB חסום במעגל', 'המשיק בנקודה D והמשך AB נפגשים בנקודה E'],
    check(fig) {
      allStepsOk(fig);
      // The figure is genuinely under-determined (a generic inscribed triangle): the cue counts shape DOF…
      expect(freeDofCount(fig.construction), 'inscribed triangle keeps shape DOF').toBeGreaterThan(0);
      // …and the triangle's on-circle vertices are SAMPLABLE (the regression: they were frozen by an order-only `solve`).
      const fd = new Set(freeDofs(fig.construction));
      for (const v of ['A', 'D', 'B']) expect(fd.has(v), `vertex ${v} is a samplable free DOF`).toBe(true);
      // So the "view relations" layer reports NO forced angle value (it was wrongly reporting 7).
      expect(detectRelations(fig.construction).definiteAngles, 'no angle is forced in an under-determined figure').toHaveLength(0);
      // The shape actually varies across configs, yet the order (E beyond B on line AB) holds every time.
      const tOf = (pos: Map<Id, Vec>) => {
        const A = pos.get('A')!, B = pos.get('B')!, E = pos.get('E')!;
        const ab = { x: B.x - A.x, y: B.y - A.y };
        return ((E.x - A.x) * ab.x + (E.y - A.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y);
      };
      const angles = new Set<number>();
      for (let s = 0; s < 8; s++) {
        const e = evaluate(applySeed(fig.construction, s));
        expect(e.ok, `seed ${s} evaluates`).toBe(true);
        if (!e.ok) continue;
        expect(tOf(e.positions), `seed ${s}: E stays beyond B (collinear-order holds)`).toBeGreaterThan(1);
        angles.add(Math.round(angle(e.positions.get('A')!, e.positions.get('D')!, e.positions.get('B')!)));
      }
      expect(angles.size, 'the inscribed triangle takes genuinely different shapes across seeds').toBeGreaterThan(2);
    },
  },
  {
    id: 'equality-recruitment-not-forced',
    title: 'equality-recruited carriers are sampled — "DE=EF" + "DF=DB" no longer report false "definite" angles',
    guards:
      'operator (2026-06-27, "view relations" on this tangent/secant figure): after the two equality givens the layer printed MANY definite angle numbers on an under-determined figure. CONFIRMED real this session by an independent (engine-free) variety trace — ∠A(B,D) ranges 0.5°–114° across valid configs while DE=EF and DF=DB both hold, so the angles are NOT forced. Root cause (ADR-141, the deeper sibling of ADR-136 Am.2): `applySeed` only perturbs carriers whose `solve` is undefined/order-only, so an EQUALITY-driven parametric carrier (on-circle θ / on-segment t) was FROZEN. The two equalities removed 2 DOF but RECRUITED ~6 carriers (A,B,D,F + the centre/circle); the residual (recruited > removed) freedom hid in the frozen set, so every sample was identical and every angle read "definitive" (11 of them). Fix: perturb a driven parametric carrier about its CURRENT θ/t (keeping its `solve`) ONLY when its constraint is OVER-recruited (carriers > dofRemoved) AND the figure is genuinely under-determined (freeDofCount>0); `evaluate` re-solves to a different valid config where residual freedom exists, and snaps back in-basin where it does not (so a fully-consumed `|AB|=|AC|` does NOT flip to the mirror). Cannot introduce a false negative: re-solving stays valid, so a genuinely-forced relation still holds in every sample.',
    steps: ['משולש ABC חסום במעגל', 'המשיק בנקודה D והמשך AB נפגשים בנקודה E', 'AD', 'DB', 'נקודה F על AB', 'DE=EF', 'DF', 'DF=DB'],
    check(fig) {
      allStepsOk(fig);
      // The figure keeps shape freedom (the equality-recruited carriers WERE the hidden DOF) …
      expect(freeDofCount(fig.construction), 'the figure is under-determined').toBeGreaterThan(0);
      // … so the "view relations" layer reports NO forced angle value (was 11 false ones before ADR-141).
      expect(detectRelations(fig.construction).definiteAngles, 'no angle forced in an under-determined figure').toHaveLength(0);
    },
  },
  {
    id: 'extension-onto-circle-side-inferred-from-circle',
    title: 'bagrut Q4: a reversed "המשך BD" (typo for DB) still builds clean — the circle disambiguates the extension side',
    guards:
      'operator session 1dugj1cw (bagrut Q4: two circles meet at A,B; AD tangent to the left circle at A; CB tangent to the right at B; F on the extension of BD onto the left circle; E on the extension of CA onto the right circle). The original figure has F BEYOND B (D→B→F), so the input should read "המשך DB" — but the operator wrote "המשך BD", which the parser reads as beyond D. That direction is geometrically impossible (D is on a tangent to the left circle, so always OUTSIDE it ⇒ line BD can only re-cross it behind B, never beyond D), so `firstSatisfyingSeed` could satisfy NO seed and the WHOLE figure drifted — E also landed wrong (the verifier flagged both). Root cause (ADR-142): for the SHARED-ENDPOINT extend-onto-circle (a line endpoint already on the target circle), the other crossing is UNIQUE — the side is forced by the geometry, not the BD/DB letter order. Fix: `extensionsClear` (the seed-gate) and the givens-verifier both accept the new point on EITHER extension when an endpoint is on the circle (flag only a genuinely-between point); a neither-on-circle driven extension stays strict. So the typo builds clean and the seed search finds a config where E is also beyond A.',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D',
      'המשיק למעגל P בנקודה B חותך את מעגל O בנקודה C',
      'נקודה F נמצאת על המשך הצלע BD וחותכת את מעגל O בנקודה F', // reversed "BD" — the circle disambiguates
      'DF',
      'המשך הצלע CA חותך את מעגל P בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations, 'the reversed-direction typo no longer falsely flags').toHaveLength(0);
      // F is the unique crossing of line BD with circle O — beyond B (t<0 on B→D), the side the circle forces.
      const t = (a: Vec, b: Vec, p: Vec) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      expect(t(at(fig, 'B'), at(fig, 'D'), at(fig, 'F')), 'F on the B-side extension').toBeLessThan(0);
      // E reaches beyond A (the cascade is gone — the seed search succeeds once F is accepted).
      expect(t(at(fig, 'C'), at(fig, 'A'), at(fig, 'E')), 'E beyond A').toBeGreaterThan(1);
    },
  },
  {
    id: 'circumcircle-cuts-segment-d-on-side',
    title: '"the circumcircle of ABC cuts CE at D" lands D ON segment CE (not its extension), across configs',
    guards:
      'operator session (circle O, two tangents from A at B,C, ∠CAB=90, chords CE/BE, then "המעגל שחוסם את משולש ABC חותך את CE בנקודה D"): "all worked well but the last view violates the rule that D is on CE". Root cause (ADR-127): `circumcircleMeetsSegment` built D as a `line-circle-intersection` on the INFINITE line through C,E with NO order constraint, so the default seed happened to put D on the segment but "show another configuration" (a re-sampled config) slid D onto the extension (t up to 4.3). The first attempted fix — appending a `set-line [C,D,E]` — FAILED: `set-line` calls `addCollinear`, which mis-picks the free on-circle endpoint C as the driven point and tries the second-intersection conversion → "unresolved dependencies for E, D, line-CE, line-CD" (D is ALREADY collinear, being a point on the line). Fix: carry the order on the `line-circle-intersection` itself (a new `order` field) → a `collinear-order [C,D,E]` constraint and nothing else; its residual is folded into the joint minimisation, so the figure flexes the free DOFs (the chord endpoints) to keep D between C and E in EVERY config. (Note: the operator\'s actual run had a typo "חותרך" that escalated to the LLM; the corrected spelling here exercises the deterministic rule the fix lives in.)',
    steps: [
      'circle O radius 5',
      'מנקודה A יוצאים שני משיקים למעגל',
      '∠CAB=90',
      'CE ו BE מיתרים במעגל',
      'EB',
      'המעגל שחוסם את משולש ABC חותך את CE בנקודה D',
    ],
    check(fig) {
      allStepsOk(fig);
      const C = at(fig, 'C'), E = at(fig, 'E'), D = at(fig, 'D');
      // D lies ON segment CE: collinear with C,E AND the projection parameter t ∈ [0,1].
      const ce = { x: E.x - C.x, y: E.y - C.y };
      const cd = { x: D.x - C.x, y: D.y - C.y };
      const offLine = Math.abs(cd.x * ce.y - cd.y * ce.x) / Math.hypot(ce.x, ce.y);
      expect(offLine, 'D collinear with C,E').toBeLessThan(1e-3);
      const t = (cd.x * ce.x + cd.y * ce.y) / (ce.x * ce.x + ce.y * ce.y);
      expect(t, 'D on segment CE (0 ≤ t ≤ 1), not the extension').toBeGreaterThanOrEqual(0);
      expect(t, 'D on segment CE (0 ≤ t ≤ 1), not the extension').toBeLessThanOrEqual(1);
    },
  },
  {
    id: 'two-tangents-from-point-unnamed-touch',
    title: '"מנקודה A יוצאים שני משיקים למעגל O" (touch points NOT named) builds the two tangents',
    guards:
      'operator session gd0kkj: "מנקודה A יוצאים שני משיקים למעגל O" ("from A, two tangents go out to circle O") fell to the LLM and built nothing, while a previous question worked — because that one NAMED the touch points ("…בנקודות B ו C"). Root cause (ADR-126): `tangentsFromExternal` REQUIRED a named touch-point pair (`if (!abM) return null`), so the natural unnamed phrasing bailed the rule entirely. Fix: when the touch points are not named, AUTO-name two fresh ones and build the Thales construction (the two tangents from the external point). The named form is unchanged.',
    steps: ['circle O radius 5', 'מנקודה A יוצאים שני משיקים למעגל O'],
    check(fig) {
      allStepsOk(fig);
      // Two tangent touch points were built and both lie ON circle O (radius 5 from the centre).
      const touch = fig.construction.objects.filter((o) => o.kind === 'circle-circle');
      expect(touch.length, 'two tangents → two touch points').toBe(2);
      const O = at(fig, 'O');
      for (const t of touch) expect(dist(at(fig, t.id), O), `touch point ${t.id} on circle O`).toBeCloseTo(5, 2);
    },
  },
  {
    id: 'named-incenter-of-incircle',
    title: '"M מרכז המעגל החסום במשולש BDC" names the incentre M and builds ONE incircle (no duplicate)',
    guards:
      'operator session djvbb7: "M מרכז המעגל החסום במשולש BDC" ("M is the centre of the circle inscribed in triangle BDC") put the centre at O, not M, and the tangency point on BD flipped letters (G→F) when hidden. Root cause (ADR-125): the `incircle` rule only caught a named centre phrased "circle M"/"centred at M" (circleCenter) — NOT the subject form "M [is the] centre of …", so the leading label M was DROPPED, the dropped-label gate (ADR-089) escalated to the LLM, and the LLM built a SECOND complete incircle (centre O, foot G, circle-O) stacked on the parser\'s (centre I, foot F, circle-I) — hence the wrong centre and the two duplicated feet flipping when hidden. Fix: `incenterLabel` captures the subject-named incentre, so M is honoured, nothing is dropped, no escalation, ONE incircle.',
    steps: ['מלבן DCBA', 'BD', 'M מרכז המעגל החסום במשולש BDC'],
    check(fig) {
      allStepsOk(fig);
      // The incentre is named M (not auto I / O), and exactly ONE circle was built (no duplicate).
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'exactly one incircle (no duplicate from an LLM escalation)').toBe(1);
      expect((circles[0] as { center: Id }).center, 'the circle is centred on the named incentre M').toBe('M');
      // M is the incentre of triangle BDC ⇒ equidistant from its three sides.
      const M = at(fig, 'M');
      const distToLine = (m: Vec, p: Vec, q: Vec) => Math.abs((m.x - p.x) * (q.y - p.y) - (m.y - p.y) * (q.x - p.x)) / dist(p, q);
      const dBD = distToLine(M, at(fig, 'B'), at(fig, 'D'));
      const dDC = distToLine(M, at(fig, 'D'), at(fig, 'C'));
      const dCB = distToLine(M, at(fig, 'C'), at(fig, 'B'));
      expect(dDC, 'M equidistant from BD and DC (incentre)').toBeCloseTo(dBD, 3);
      expect(dCB, 'M equidistant from BD and CB (incentre)').toBeCloseTo(dBD, 3);
    },
  },
  {
    id: 'area-ratio-converges-points-allowed',
    title: 'kite inscribed + "area NCE = ¼ area ACD" — the ratio resolves; N lands on the centre O (allowed, noticed)',
    guards:
      'operator session id4dn4a2: "S_{ACD}=4S_{NCE}" didn\'t parse (ADR-121 Am.) and "שטח משולש NCE = רבע שטח משולש ACD" applied but errored "O and N would be at the same point". Diagnosis: △NCE ~ △ACD structurally (right kite ⇒ ∠ADC=90° = ∠NEC, shared ∠C), so the area ratio ¼ ⟺ the linear ratio CN/CA = ½; and because AC is a diameter (Thales), O is its midpoint, so CN/CA=½ places N EXACTLY on O. The solver was fine (CN/CA=0.3/0.4/0.6/0.7 all converge) — only the coincidence guard hard-failed at the ½ (N=O) value. ADR-123: a FORCED coincidence is ALLOWED with a notice (O was never user-defined; the guard hard-fail was wrong here), while default collisions stay avoided. So the figure now builds with N on O and the area ratio satisfied.',
    steps: [
      'ABCD דלתון חסום במעגל',
      'AB=AD',
      'CB=CD',
      'E על DC',
      'BE⊥DC',
      'AC',
      'N = חיתוך BE ו-AC',
      'שטח משולש NCE= רבע שטח משולש ACD',
    ],
    check(fig) {
      allStepsOk(fig);
      const area = (ids: Id[]) => { let s = 0; for (let i = 0; i < ids.length; i++) { const a = at(fig, ids[i]), b = at(fig, ids[(i + 1) % ids.length]); s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };
      expect(area(['N', 'C', 'E']) / area(['A', 'C', 'D']), 'area(NCE) = ¼ area(ACD)').toBeCloseTo(0.25, 2);
      expect(dist(at(fig, 'N'), at(fig, 'O')), 'N converged onto the centre O').toBeLessThan(1e-3);
      expect(fig.coincidences.some(([a, b]) => (a === 'N' && b === 'O') || (a === 'O' && b === 'N')), 'the N=O coincidence is surfaced as a notice').toBe(true);
    },
  },
  {
    id: 'congruent-triangles-word-form',
    title: '"משולש ABC חופף למשולש GHT" builds both triangles and makes GHT congruent to ABC (SSS)',
    guards:
      'operator question (2026-06-25): "do we support congruent/similar triangles? if a user writes משולש ABC חופף למשולש GHT what happens?". Congruence/similarity already exist (ADR-032): the `congruence` rule (≅ / congruent / חופף) reshapes the SECOND triangle to match the first via SSS (three set-equal). Locked here at BUILD level (the operator\'s exact phrasing) so the corresponding-sides equality is permanent. Related (ADR-120): the △ triangle glyph is now a parser keyword + a toolbar button, so "△ABC" builds a triangle and "△ABC ≅ △DEF" works (covered by catalog-coverage).',
    steps: ['משולש ABC חופף למשולש GHT'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      const G = at(fig, 'G'), H = at(fig, 'H'), T = at(fig, 'T');
      expect(dist(G, H), '|GH| = |AB|').toBeCloseTo(dist(A, B), 3);
      expect(dist(H, T), '|HT| = |BC|').toBeCloseTo(dist(B, C), 3);
      expect(dist(T, G), '|TG| = |CA|').toBeCloseTo(dist(C, A), 3);
    },
  },
  {
    id: 'parallel-chords-keep-circle-membership',
    title: '"AB diameter" then "CD ו AF מיתרים המקבילים" — C,D,F land ON circle O (not free points), CD ∥ AF',
    guards:
      'operator session sflkyd0r: after "AB קוטר במעגל" (circle O + diameter AB), "CD ו AF מיתרים המקבילים זה לזה" parsed to two PLAIN segments + set-parallel — the chord membership was DROPPED, so C,D,A,F were free points NOT on circle O. Root cause: parse is first-match-wins and `parallelConstraint` (which only understands plain segments) runs BEFORE the `chord` rule and claimed the whole utterance; and even `chord` itself handles only ONE chord. Fix (ADR-119): a centralised post-pass `withChordMembership` — in any chord-flavoured utterance with a resolvable circle, every SEGMENT endpoint is asserted ON the circle (idempotent; a circle CENTRE is excluded so "radius OE" keeps O off; a chord MIDPOINT is not a segment endpoint, so "C אמצע מיתר AB" puts A,B not C on the circle). General across parallel / ⟂ chords (and any future relation that draws its operands as segments).',
    steps: [
      { llm: [
        { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
        { type: 'diameter', id1: 'A', id2: 'B', circle: 'circle-O' },
      ] },
      'CD ו AF מיתרים המקבילים זה לזה',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const rO = dist(O, at(fig, 'A'));
      for (const id of ['C', 'D', 'F'] as Id[]) expect(dist(O, at(fig, id)), `${id} on circle O`).toBeCloseTo(rO, 3);
      const C = at(fig, 'C'), D = at(fig, 'D'), A = at(fig, 'A'), F = at(fig, 'F');
      const cd = { x: D.x - C.x, y: D.y - C.y }, af = { x: F.x - A.x, y: F.y - A.y };
      const sin = Math.abs(cd.x * af.y - cd.y * af.x) / (Math.hypot(cd.x, cd.y) * Math.hypot(af.x, af.y));
      expect(sin, 'CD ∥ AF').toBeLessThan(1e-3);
    },
  },
  {
    id: 'isosceles-explicit-pair-overrides-default',
    title: '"משולש שווה שוקיים ABC" + "AB=BC" stays isosceles with AB=BC — the assumed |AB|=|AC| yields (no equilateral)',
    guards:
      'the isosceles macro hard-coded |AB|=|AC| (apex = first vertex). "Isosceles" only asserts SOME two sides equal — which pair is the student\'s to state (ADR-052). So "משולש שווה שוקיים ABC" then "AB=BC" stacked |AB|=|AC| + |AB|=|BC| into an EQUILATERAL triangle the student never asked for. ADR-114: the macro\'s default pair is `soft` and the store drops it when an explicit equality on the same triangle is given, so the stated pair wins. (session yi4p8150)',
    steps: [
      'ABC משולש שווה שוקיים',
      'AB=BC',
      'AK תיכון',
      { llm: [
        { type: 'midpoint', id: 'L', a: 'A', b: 'B' },
        { type: 'segment', a: 'C', b: 'L' },
      ] },
      'D = חיתוך AK ו-CL',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      expect(dist(A, B), 'the stated pair |AB| = |BC| holds').toBeCloseTo(dist(B, C), 3);
      expect(Math.abs(dist(A, B) - dist(A, C)), 'NOT equilateral — |AC| differs').toBeGreaterThan(0.3);
    },
  },
  {
    id: 'perpendicular-from-midpoint-flexes-rhombus',
    title: 'rhombus + E mid AB + G on the EXTENSION of BD + "GE⊥AB" — the rhombus angle flexes so G lands strictly beyond D',
    guards:
      'over-constrained: GE ⟂ AB cannot hold (session oew743rq). The drivable-ancestor walk stopped at the free param carrier G and never reached the shape DOF (the rhombus angle, carried by D = G\'s parent) behind it — so the recruiter could only slide G to the degenerate G=D and falsely over-constrained. ADR-113: in `drivable` mode keep walking past a free on-segment carrier to the DOFs behind its segment, so the rhombus angle flexes (G lands beyond D with GE⟂AB). Confirmed this never worked (git bisect to 2026-06-17: same figure failed with "D and G would be at the same point").',
    steps: [
      'ABCD מעוין',
      'F אמצע BC',
      'E אמצע AB',
      { llm: [
        { type: 'segment', a: 'A', b: 'C' },
        { type: 'segment', a: 'B', b: 'D' },
        { type: 'line-line-intersection', id: 'K', a: 'A', b: 'C', c: 'B', d: 'D' },
      ] },
      'G על המשך BD',
      'GE⊥AB',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D'), E = at(fig, 'E'), G = at(fig, 'G');
      // GE ⟂ AB: (G − E) · (B − A) ≈ 0
      const ge = { x: G.x - E.x, y: G.y - E.y };
      const ab = { x: B.x - A.x, y: B.y - A.y };
      const cos = (ge.x * ab.x + ge.y * ab.y) / (Math.hypot(ge.x, ge.y) * Math.hypot(ab.x, ab.y));
      expect(Math.abs(cos), 'GE ⟂ AB').toBeLessThan(1e-3);
      // G is strictly BEYOND D on ray B→D (the extension, param t > 1) and distinct from D
      const bd = { x: D.x - B.x, y: D.y - B.y };
      const bg = { x: G.x - B.x, y: G.y - B.y };
      const t = (bg.x * bd.x + bg.y * bd.y) / (bd.x * bd.x + bd.y * bd.y);
      expect(t, 'G on the extension (t > 1)').toBeGreaterThan(1.02);
      expect(dist(G, D), 'G distinct from D').toBeGreaterThan(0.1);
    },
  },
  {
    id: 'kite-named-shape',
    title: '"דלתון ABCD" builds a kite (two pairs of equal adjacent sides) from the named shape alone',
    guards:
      'gap audit (theorem list): no דלתון/kite construct existed. Added (ADR-110) as a parser-macro — a general quadrilateral + |AB|=|AD| + |CB|=|CD| constraints flex the free quad into a kite, no new engine construct.',
    steps: ['דלתון ABCD'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(A, B), '|AB| = |AD|').toBeCloseTo(dist(A, D), 3);
      expect(dist(C, B), '|CB| = |CD|').toBeCloseTo(dist(C, D), 3);
    },
  },
  {
    id: 'regular-hexagon',
    title: '"regular hexagon ABCDEF" builds a 6-gon with equal sides and 120° interior angles',
    guards:
      'gap audit (theorem list): the polygon family capped at 4 vertices. Added (ADR-111) a generic `polygon` command + a regularPolygon rule that places n equally-spaced vertices on a hidden free-radius circle.',
    steps: ['regular hexagon ABCDEF'],
    check(fig) {
      allStepsOk(fig);
      const ids: Id[] = ['A', 'B', 'C', 'D', 'E', 'F'];
      const pts = ids.map((id) => at(fig, id));
      const side = dist(pts[0], pts[1]);
      for (let i = 0; i < 6; i++) expect(dist(pts[i], pts[(i + 1) % 6]), `side ${i}`).toBeCloseTo(side, 3);
      for (let i = 0; i < 6; i++) {
        expect(angle(pts[(i + 5) % 6], pts[i], pts[(i + 1) % 6]), `interior angle ${i}`).toBeCloseTo(120, 1);
      }
    },
  },
  {
    id: 'obtuse-acute-angle',
    title: '"∠C קהה" (obtuse) / "∠C חדה" (acute) reshape the triangle so ∠ACB is >90° / <90°',
    guards:
      'operator: "∠C קהה" (∠C is obtuse) returned not-understood — no support for זווית קהה/חדה (obtuse/acute). Added (ADR-108): a one-sided angle constraint (>90°/<90°) modelled like the ADR-039 orderings — it reshapes the figure (drives a free DOF) so the angle falls on the requested side, removing 0 DOF. The parser reads both "∠ABC קהה" and the single-vertex "∠C קהה" (arms resolved from the figure\'s neighbours).',
    steps: ['משולש ABC', '∠C קהה'],
    check(fig) {
      allStepsOk(fig);
      expect(angle(at(fig, 'A'), at(fig, 'C'), at(fig, 'B')), '∠ACB is obtuse').toBeGreaterThan(90);
    },
  },
  {
    id: 'midpoint-of-existing-on-segment-point',
    title: '"A אמצע CD" when A is ALREADY a free point on CD drives A to the midpoint, not "already defined"',
    guards:
      'operator (session lqtx8fn5): A was placed on side CD ("A ו E נמצאות על הצלעות CD ו BD"), then "A אמצע CD" (A is the midpoint of CD) → weak:error → built-nothing ("\'A\' is already defined"). The midpoint redefinition went to `reinterpretAsConstraint`, but `freeCarrierAncestor` searched only A\'s ANCESTORS (C,D — free vertices, not param carriers), never A itself, so it found no carrier and gave up. Fix (ADR-107 Am.): for a `midpoint` redefinition, use A\'s OWN free on-segment DOF as the carrier — drive A\'s t to the midpoint of CD (the operator\'s working "AD=AC" was the manual equivalent). Scoped to `midpoint` so the collinear/second-placement reinterpretations are unaffected.',
    steps: ['משולש BCD', 'A על CD', 'A אמצע CD'],
    check(fig) {
      allStepsOk(fig); // no "'A' is already defined"
      const A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(A, C), 'A is the midpoint of CD: |AC| = |AD|').toBeCloseTo(dist(A, D), 3);
      // A stayed ON segment CD (collinear, between C and D at t≈0.5).
      const t = ((A.x - C.x) * (D.x - C.x) + (A.y - C.y) * (D.y - C.y)) / ((D.x - C.x) ** 2 + (D.y - C.y) ** 2);
      expect(t).toBeCloseTo(0.5, 2);
    },
  },
  {
    id: 'bisector-onto-existing-point',
    title: '"EG חוצה זוית DEF" when G already exists (placed on DF) CONSTRAINS G to the bisector, not re-creates it',
    guards:
      'operator (session 86cympns): G was placed on DF ("G על DF"), then "EG חוצה זוית DEF" (EG bisects ∠DEF) → weak:error → LLM built-nothing. The angle-bisector treatment exists, but `bisectorPlacesPoint`\'s "the segment\'s first letter is the vertex" branch always CREATED the bisector-foot point via a line∩line — re-creating the already-placed G → "\'G\' is already defined". Fix (ADR-107): when that foot point ALREADY EXISTS, emit the bisector CONSTRAINT instead — ∠(D,E,G) = ∠(G,E,F) (set-angle-ratio k=1) — which drives the existing G (on its segment DOF) onto the bisector. (Distilled to the core figure; the operator\'s full figure added a rhombus + ratios around it.)',
    steps: ['משולש DEF', 'G על DF', 'EG חוצה זוית DEF'],
    check(fig) {
      allStepsOk(fig); // no "'G' is already defined"
      const D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F'), G = at(fig, 'G');
      expect(angle(D, E, G), 'EG bisects ∠DEF: ∠DEG = ∠GEF').toBeCloseTo(angle(G, E, F), 1);
      // G stayed on segment DF (the bisector of a triangle's apex meets the opposite side between its ends).
      const tg = ((G.x - D.x) * (F.x - D.x) + (G.y - D.y) * (F.y - D.y)) / ((F.x - D.x) ** 2 + (F.y - D.y) ** 2);
      expect(tg).toBeGreaterThan(0);
      expect(tg).toBeLessThan(1);
    },
  },
  {
    id: 'driven-extension-point-stays-beyond',
    title: '"E on the extension of DC" driven by ∠CAE=50 stays BEYOND C (on the extension), not pulled between D and C',
    guards:
      'operator (session 3yvigwa7): triangle ABC inscribed, D = arc-midpoint of BC, E on the extension of chord DC, then ∠CAE=50. E ended up BETWEEN D and C (param 0.16), not on the extension — "point E didn\'t respect that it needed to be after D". Root cause (ADR-105): ∠CAE=50 DRIVES E, and the driven solver searched/placed an on-segment carrier in [0,1] (the interior), ignoring that E is an EXTENSION point (t>1 by definition) — the unbounded joint optimiser then pulled E back between the endpoints to satisfy the angle. Fix: an extension on-segment carrier is searched past 1 (single-carrier range + mixed-carrier range) AND hard-clamped to t≥1.02 in setCarrierVals, so the optimiser must keep E on the extension and move the figure\'s OTHER free DOFs (the triangle) to satisfy the angle.',
    steps: [
      'משולש ABC חסום במעגל O',
      'D אמצע קשת BC',
      '∠ABC=60',
      '∠BAC=α',
      { llm: [{ type: 'point-on-segment', id: 'E', a: 'D', b: 'C', t: 1.3, extension: true }] }, // "E נמצאת על המשך המיתר DC" (deterministic parse dropped E → LLM)
      '∠CAE=50',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      // E is on the EXTENSION of DC beyond C: its parameter along D→C exceeds 1.
      const t = ((E.x - D.x) * (C.x - D.x) + (E.y - D.y) * (C.y - D.y)) / ((C.x - D.x) ** 2 + (C.y - D.y) ** 2);
      expect(t, 'E is beyond C on the extension of DC').toBeGreaterThan(1);
      expect(angle(C, A, E), 'the driven ∠CAE = 50 still holds').toBeCloseTo(50, 0);
    },
  },
  {
    id: 'q4-constraints-order-independent',
    title: 'full bagrut Q4 builds with CE⟂AB entered BEFORE the size givens (CD=36, DE=18) — order-independent',
    guards:
      "operator (session zqvtvh15): building the full Q4, CE⟂AB failed 'over-constrained' because it was entered before CD=36, DE=18 — without the sizes the figure is an under-determined coupled solve the engine can't land, but WITH them it's determinate and the ⟂ solves. The operator's principle: the diagram must build the SAME regardless of entry order. Fix (ADR-104): after the in-order pass, replay RETRIES still-failed CONSTRAINT-only facts against the now-complete figure, to a fixpoint — so a constraint typed too early is effectively re-ordered to AFTER the givens that pin it. Here CE⟂AB defers past CD=36/DE=18 and then holds. (Builds on ADR-103, which made the circle CENTRES drivable so |CD|=36 is reachable at all.)",
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את מעגל O בנקודה E',
      'נקודה G על המשך DE',
      'CG חותך את מעגל P בנקודה F',
      'AF ו BC נחתכים בנקודה H',
      '∠GEC = ∠CHA',
      'CE⊥AB', // entered BEFORE the sizes — used to fail; now deferred until CD/DE pin the figure
      'CD=36',
      'DE=18',
    ],
    check(fig) {
      allStepsOk(fig); // every step ends 'ok' — CE⟂AB resolved after the sizes via the retry
      const C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(dist(C, D)).toBeCloseTo(36, 0); // |CD| = 36
      expect(dist(D, E)).toBeCloseTo(18, 0); // |DE| = 18
      const dot = (E.x - C.x) * (B.x - A.x) + (E.y - C.y) * (B.y - A.y);
      expect(Math.abs(dot) / (Math.hypot(E.x - C.x, E.y - C.y) * Math.hypot(B.x - A.x, B.y - A.y))).toBeLessThan(0.02); // CE ⟂ AB
    },
  },
  {
    id: 'distance-drives-circle-centres-apart',
    title: 'bagrut Q4: "CD=36" across two intersecting circles spreads the circle centres so it holds',
    guards:
      'operator session (zqvtvh15, bagrut Q4): after two circles meet at A,B; C on circle P; D = CA extended onto circle O, a size given like CD=36 (and ultimately CE⟂AB with CD=36, DE=18) failed "over-constrained: |CD|=36 cannot hold". Root cause (ADR-103): recruitFreeDofs surfaced a circle\'s free RADIUS but never its free CENTRE, and `ancestors` does not traverse a circle∩circle point — so the centres O,P were unreachable. Pinned a fixed gap apart, the circle∩circle geometry caps |CD| (~8 here) however large the radii grow, so |CD|=36 was unreachable though a real configuration exists (the centres just spread). Fix: surface a circle\'s free, non-pinned centre as a drivable DOF alongside its radius. (Known remaining limitation: entering CE⟂AB BEFORE the size givens is an under-determined coupled solve that still does not converge — the sizes must precede the ⟂; tracked separately.)',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'CD=36',
    ],
    check(fig) {
      allStepsOk(fig); // no longer over-constrained
      const C = at(fig, 'C'), D = at(fig, 'D'), O = at(fig, 'O'), P = at(fig, 'P');
      expect(dist(C, D)).toBeCloseTo(36, 0); // |CD| = 36 holds (verifier also green via the blanket check)
      expect(dist(O, P), 'the circle centres spread to make room (the DOF the fix unlocked)').toBeGreaterThan(8);
    },
  },
  {
    id: 'angle-equality-on-q4',
    title: 'bagrut Q4 + the part-א relation "∠EDA = ∠CBA" — angle EQUALITY now parses and holds',
    guards:
      'operator (session 99j7krj3/f2gyj40u): typing an angle EQUALITY ("∠GEC=∠CBA", "∠GEC=∠CHA") returned not-understood — the `angle` rule needs a numeric value, so a two-angle equality fell through to the LLM (also not-understood). The engine already had the relation (`set-angle-ratio` k=1, as similar-triangles uses); the gap was purely the parser. Fix (ADR-100): an `angleEquality` rule reads "∠ABC = ∠DEF" (Hebrew "זווית"/∠, optional coefficient "= 2∠DEF") → set-angle-ratio. Here it is exercised end-to-end with the book\'s own part-א theorem ∠EDA=∠CBA on the Q4 figure: it parses (no LLM), applies, and HOLDS (a true relation for every configuration).',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את מעגל O בנקודה E',
      'מרובע EBAD חסום במעגל O',
      '∠EDA = ∠CBA',
    ],
    check(fig) {
      allStepsOk(fig); // the angle-equality step parses (no escalation) and applies
      // The relation was recorded as an angle-ratio (k=1) constraint…
      expect(fig.construction.constraints.some((k) => k.type === 'angle-ratio')).toBe(true);
      // …and actually holds in the drawing (∠EDA = ∠CBA — the book's part-א), verifier clean (blanket check).
      expect(angle(at(fig, 'E'), at(fig, 'D'), at(fig, 'A'))).toBeCloseTo(angle(at(fig, 'C'), at(fig, 'B'), at(fig, 'A')), 1);
    },
  },
  {
    id: 'inscribe-existing-points-in-existing-circle',
    title: 'bagrut Q4: "מרובע EBAD חסום במעגל O" where E,B,A,D and circle O ALREADY exist — draw the quad, don\'t re-create O',
    guards:
      'operator session (99j7krj3, 2026-06-22), the full bagrut Q4: two circles meet at A,B; C on the right circle; CA/CB extended hit the LEFT circle O at D,E; then "מרובע EBAD חסום במעגל O" → weak:error → LLM built-nothing (twice). Root cause (ADR-099): the inscribe rule emitted `circumcircle(circle-O, E,B,A)` to build the circumscribing circle — but circle O ALREADY exists, so re-creating it redefined its centre ("\'O\' is already defined") and the whole step was dropped. E,B,A,D are already ON circle O by their own construction (A,B are O∩P; D,E are line∩O), so the intent is just "draw the quad inscribed in the EXISTING O". Fix: when the named circle already exists, the rule asserts membership per vertex (`point-on-circle`, idempotent for a point already on it — ADR-093 — and converting a free one to slide on it) and draws the polygon, never re-creating the circle.',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את מעגל O בנקודה E',
      'מרובע EBAD חסום במעגל O',
    ],
    check(fig) {
      allStepsOk(fig); // the inscribe step no longer errors / drops
      // Exactly two circles (O and P) — O was NOT duplicated.
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'still two circles (O not re-created)').toBe(2);
      // All four quad vertices lie on circle O, and the quad EBAD is drawn.
      const O = at(fig, 'O'), rO = dist(O, at(fig, 'A'));
      for (const id of ['E', 'B', 'A', 'D']) expect(dist(O, at(fig, id)), `${id} on circle O`).toBeCloseTo(rO, 2);
      expect(fig.construction.objects.some((o) => o.kind === 'polygon' && (o as { vertices: Id[] }).vertices.join('') === 'EBAD'), 'quad EBAD drawn').toBe(true);
      // The book's part-א theorem holds in the correct figure: ∠EDA = ∠CBA (inscribed angles on arc EA... / cyclic).
      expect(angle(at(fig, 'E'), at(fig, 'D'), at(fig, 'A'))).toBeCloseTo(angle(at(fig, 'C'), at(fig, 'B'), at(fig, 'A')), 1);
    },
  },
  {
    id: 'free-point-on-circle-both-extensions-reach-far-side',
    title: 'two circles meet at A,B; C free on circle P; "המשך CA"→D and "המשך CB"→E both reach the FAR side of circle O',
    guards:
      'operator report (session n19qmb3t, 2026-06-22): "point C is not positioned in a place that can satisfy the input". Two circles meet at A,B; C is a FREE point on circle P; "המשך CA חותך מעגל O בנקודה D" and "המשך CB חותך מעגל O בנקודה E". At the default/sampled C (top of circle P) C is OUTSIDE circle O, so on line CB the far crossing IS B — the only OTHER crossing falls BETWEEN C and B, so E is on the near side and "המשך" (beyond B) is violated, yet the figure showed GREEN (verified). Root cause (ADR-098): the extend-onto-circle SHARED-ENDPOINT branch deterministically picks the other crossing with NO record of the directional intent, the free θ of C was sampled blind to it, AND the verifier re-derived neither the membership nor the order — three gaps. Fix (operator chose SAMPLE/GATE, never drive): the verifier now re-derives both (a wrong-side figure goes amber), the sampler/“show another” gate on the order, and the app/`run()` auto-advance to the first configuration where BOTH extensions reach the far side. C is a free DOF — sampled to a satisfying placement, never driven across the E=B tangent degeneracy.',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את מעגל O בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      // D, E land ON circle O (relative to A, which is on it).
      const rO = dist(O, A);
      expect(dist(O, D), 'D on circle O').toBeCloseTo(rO, 3);
      expect(dist(O, E), 'E on circle O').toBeCloseTo(rO, 3);
      // The directional givens: D beyond A (order C→A→D) and E beyond B (order C→B→E) — the reported bug.
      const beyond = (a: Vec, b: Vec, id: Vec) => (id.x - b.x) * (b.x - a.x) + (id.y - b.y) * (b.y - a.y) > 0;
      expect(beyond(C, A, D), 'D is beyond A (המשך CA)').toBe(true);
      expect(beyond(C, B, E), 'E is beyond B (המשך CB)').toBe(true);
      // Neither derived point collapsed onto the shared crossing it extends through.
      expect(dist(D, A), 'D ≠ A').toBeGreaterThan(0.5);
      expect(dist(E, B), 'E ≠ B').toBeGreaterThan(0.5);
    },
  },
  {
    id: 'constrained-inscribed-quad-stays-convex',
    title: '"מרובע BCED חסום במעגל" + external A=BD∩CE + AE=2CE + AD=CE — the constrained cyclic quad draws CONVEX, not crossed',
    guards:
      'Operator report: this figure drew a CROSSED (bowtie) quad and "show another configuration" said impossible while the cue read "5 DOF". Root cause: the general inscribed quad pinned its vertices at the convex-default angles (free=false — an ADR-052 violation), so the constraint solver could only move E,D and was boxed into a crossed branch (a convex solution exists only when all four are free). Fix (ADR-097): the general-quad vertices are FREE (the convex angles are a STARTING position), and on a convex-failing coupled solve the solver RECRUITS the polygon\'s free vertices (ADR-097 convexity preference) so it reshapes to a convex drawing; B,C become samplable so "show another" works.',
    steps: ['מרובע BCED חסום במעגל', 'המשך BD והמשך CE נפגשים שנקודה A', 'AE=2CE', 'AD=CE'],
    check(fig) {
      allStepsOk(fig);
      convexQuad(fig, ['B', 'C', 'E', 'D'], 'O', 5); // BCED in convex cyclic order around O (was crossed)
      const A = at(fig, 'A'), C = at(fig, 'C'), E = at(fig, 'E'), D = at(fig, 'D');
      expect(dist(A, E)).toBeCloseTo(2 * dist(C, E), 3); // AE = 2·CE holds
      expect(dist(A, D)).toBeCloseTo(dist(C, E), 3); // AD = CE holds
    },
  },
  {
    id: 'two-tangents-one-touch-already-exists',
    title: '"two tangents from E at A and D" where A is an existing on-circle point (a diameter endpoint)',
    guards:
      "operator session: B mid AC, \"AB קוטר\" (circle O, A a diameter endpoint on it), then \"מנקודה E יוצאים משיקים למעגל בנקודות A ו D\" → ERRORED \"'A' is already defined\" → LLM built nothing. `tangentsFromExternal` builds the two touch points via a Thales circle∩circle, which RE-CREATES A — conflicting with the existing A (ADR-094). Fix: when EITHER touch point already exists, fall back to the tangency-CONSTRAINT form (the two-tangent generalisation of ADR-081/093): each touch P is point-on-circle (idempotent if already on it) + set-perpendicular(O,P,E,P), so both EA and ED are real tangents and the figure flexes. The all-new two-tangent case keeps the Thales construction. Verified through the real App.submit pipeline (parse → gates → execute), not just parse→replay.",
    steps: ['B אמצע AC', 'AB קוטר', 'מנקודה E יוצאים משיקים למעגל בנקודות A ו D'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), D = at(fig, 'D'), E = at(fig, 'E');
      const perp = (X: Vec) => (X.x - O.x) * (E.x - X.x) + (X.y - O.y) * (E.y - X.y);
      expect(Math.abs(perp(A)), 'EA ⟂ OA (tangent at A)').toBeLessThan(1e-2);
      expect(Math.abs(perp(D)), 'ED ⟂ OD (tangent at D)').toBeLessThan(1e-2);
      expect(dist(A, D), 'A and D are distinct touch points').toBeGreaterThan(0.1);
      expect(dist(O, A), 'A,D both on the circle').toBeCloseTo(dist(O, D), 2);
    },
  },
  {
    id: 'tangent-at-a-diameter-endpoint-no-cycle',
    title: '"EA משיק למעגל בנקודה A" where A is a diameter endpoint (the circle\'s through-point) — no dependency cycle',
    guards:
      "operator session: B midpoint of AC, then \"AB קוטר\" (circle O with diameter AB, so A is the through-point defining O's radius), a tangent from E at D, C on the extension of ED, then \"EA משיק למעגל בנקודה A\" → ERRORED \"unresolved dependencies for: A,B,O,…,circle-O,…\" and the LLM built nothing. NOT a new construct — it's tangent-at-a-point (ADR-081). Root cause (ADR-093): the rule emits `point-on-circle A`, but A DEFINES circle O's radius (`circle-through` point), and `pointOnCircle` didn't recognise a through-point as on the circle, so the apply converted A to an on-circle point → A→circle-O→A cycle. Fix: `pointOnCircle` now treats a circle's through-point as on it, so `point-on-circle A` is idempotent (A is already on the circle) and only the tangency constraint (OA ⟂ EA) is added.",
    steps: ['B אמצע AC', 'AB קוטר', 'מנקודה E מעבירים משיק למעגל בנקודה D', 'נקודה C נמצאת על המשך הצלע ED', 'EA משיק למעגל בנקודה A'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), E = at(fig, 'E');
      const dot = (A.x - O.x) * (E.x - A.x) + (A.y - O.y) * (E.y - A.y);
      expect(Math.abs(dot), 'OA ⟂ EA (tangent at A)').toBeLessThan(1e-3);
    },
  },
  {
    id: 'midpoint-creates-its-endpoints',
    title: '"B אמצע הקטע AC" on an empty figure creates A,C (and the segment) — B is their midpoint',
    guards:
      "operator session: \"B אמצע הקטע AC\" on an empty figure ERRORED \"unresolved dependencies for: B\" and escalated to the LLM (which built nothing) — because `midpoint` (unlike `segment`) did not create its endpoints, so with A,C absent the midpoint had nothing to bisect. Root cause (ADR-091): a missing-endpoint gap, not an LLM job — \"B is the midpoint of segment AC\" implies the segment AC. Fix: when an endpoint is NEW, `midpoint` prepends a (idempotent) segment that creates + draws AC; when both exist it emits just the midpoint (unchanged).",
    steps: ['B אמצע הקטע AC'],
    check: (fig) => {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      expect(B.x, 'B is the midpoint of AC (x)').toBeCloseTo((A.x + C.x) / 2, 3);
      expect(B.y, 'B is the midpoint of AC (y)').toBeCloseTo((A.y + C.y) / 2, 3);
    },
  },
  {
    id: 'given-diameter-defines-circle',
    title: '"AB קוטר במעגל O" with A,B already placed defines a circle on diameter AB (centre O = midpoint)',
    guards:
      "operator session: after \"B אמצע צלע AC\" (so A,B exist), \"AB קוטר במעגל O\" ERRORED \"'B' is already defined\" — the \"במעגל\" (in a circle) routed it to `diameter` (add-to-existing, which makes B an antipode), but the circle O didn't exist and A,B were GIVEN points. Bare \"AB קוטר\" was not-handled. Fix (ADR-092): circleOnDiameter also fires for a GIVEN diameter — both endpoints already exist AND there is no existing circle to attach to — so it defines a circle with AB as its diameter (centre = midpoint of AB), even without a define-marker. The cyclic \"AD קוטר במעגל ABCD\" (circle exists) and \"diameter DE in circle O\" (new points) still route to `diameter`.",
    steps: ['B אמצע צלע AC', 'AB קוטר במעגל O'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(dist(O, A), 'A,B equidistant from O (AB a diameter)').toBeCloseTo(dist(O, B), 3);
      expect(O.x, 'O at midpoint of AB (x)').toBeCloseTo((A.x + B.x) / 2, 3);
      expect(O.y, 'O at midpoint of AB (y)').toBeCloseTo((A.y + B.y) / 2, 3);
    },
  },
  {
    id: 'diameter-in-a-circle-defined-by-centre-radius',
    title: '"AB קוטר במעגל שמרכזו O ורדיוסו R" defines a circle with AB as diameter (centre O = midpoint AB)',
    guards:
      "operator session: \"AB קוטר במעגל שמרכזו O ורדיוסו R\" (AB is a diameter in a circle whose centre is O and radius R) ERRORED \"'B' is already defined\" — the \"במעגל\" (in a circle) routed it to `diameter` (add-to-existing, which makes B an antipode) although the circle was being DEFINED by its centre/radius, and A,B already existed. Fix (ADR-091): `circleOnDiameter`'s define-markers now include the centre/radius specification (שמרכזו / ורדיוסו / centered / radius) — you describe a circle's centre/radius when DEFINING it — so it builds a circle centred at the midpoint of AB. Plain \"diameter X in circle O\" (no centre/radius clause) still routes to `diameter`.",
    steps: ['קטע AB', 'AB קוטר במעגל שמרכזו O ורדיוסו R'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(dist(O, A), 'A,B equidistant from O (AB a diameter)').toBeCloseTo(dist(O, B), 3);
      expect(O.x, 'O at midpoint of AB (x)').toBeCloseTo((A.x + B.x) / 2, 3);
      expect(O.y, 'O at midpoint of AB (y)').toBeCloseTo((A.y + B.y) / 2, 3);
    },
  },
  {
    id: 'circle-defined-by-its-diameter',
    title: '"AB קוטר של מעגל O" builds a circle whose diameter is AB (centre = midpoint of AB)',
    guards:
      "operator session: after triangle ABC, the operator tried 5+ ways to make a circle with AB as its diameter — \"AB קוטר של מעגל\", \"AB קוטר של מעגל O\", \"מעגל שבו AB קוטר\" — and ALL failed (the unnamed/define phrasings were not-handled; \"AB קוטר של מעגל O\" misrouted to the `diameter` rule which tries to re-create A as an on-circle point and ERRORED because A,B already exist). Root cause (ADR-090): there was no construct for a circle DEFINED BY its diameter — only `diameter` (adds a diameter to an EXISTING circle). Fix: a `circleOnDiameter` rule for the DEFINE phrasings (of/with/whose-diameter, He+En) → segment AB + midpoint(centre) + circle-through, so the centre is the midpoint of AB and A,B are the diameter's endpoints; works whether A,B are new or pre-existing. The add-phrasing \"diameter DE in circle O\" still routes to `diameter`.",
    steps: ['משולש ABC', 'AB קוטר של מעגל O'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B');
      // O is the midpoint of AB, and A,B are equidistant from O (AB is a diameter)
      expect(dist(O, A), 'A on circle').toBeCloseTo(dist(O, B), 3);
      expect(O.x, 'O at midpoint of AB (x)').toBeCloseTo((A.x + B.x) / 2, 3);
      expect(O.y, 'O at midpoint of AB (y)').toBeCloseTo((A.y + B.y) / 2, 3);
    },
  },
  {
    id: 'set-circle-radius-by-value-no-segment',
    title: '"radius of circle P is 4" sets an existing circle\'s radius by value — no segment, no invented point',
    guards:
      "operator session (2026-06-22): incircle P of triangle BDA, then \"רדיוס מעגל P הוא 4\" → built-nothing (escalated to the LLM). To set the radius the operator had to invent a point and write \"PF=4\", which drew the radius segment. Fix (ADR-087): a `setRadius` parser rule + a `set-radius` engine command. For a through-radius circle (the incircle's radius is |P·foot|) it adds a distance constraint that FLEXES the figure to the stated size; for a free/length radius it sets the value. No segment is drawn and no point is invented. Fires only for an EXISTING circle (creation 'circle O radius 5' still goes to `circle`).",
    steps: ['משולש BDA', 'מעגל P חסום במשולש BDA', 'רדיוס מעגל P הוא 4'],
    check: (fig) => {
      allStepsOk(fig);
      // the incircle's radius (|centre · its tangent foot|) is now 4
      const circ = fig.construction.objects.find((o) => o.kind === 'circle' && o.id === 'circle-P') as { center: Id; radius: { via: string; point?: Id } } | undefined;
      expect(circ?.radius.via).toBe('through');
      const P = at(fig, 'P'), F = at(fig, circ!.radius.point!);
      expect(dist(P, F), 'radius set to 4').toBeCloseTo(4, 2);
      // no radius segment was drawn (no segment touches the centre P)
      const drewRadiusSeg = fig.construction.objects.some((o) => o.kind === 'segment' && ((o as { a: Id }).a === 'P' || (o as { b: Id }).b === 'P'));
      expect(drewRadiusSeg, 'no radius segment drawn').toBe(false);
    },
  },
  {
    id: 'existing-vertex-on-extension-keeps-order',
    title: '"C on the continuation of DA" puts an EXISTING on-circle C beyond A (order D→A→C), not at the near intersection',
    guards:
      "operator session (2026-06-22): triangle ABC inscribed, tangent at B from D, then \"C נמצאת על המשך DA\" (C on the continuation of DA). It aligned D,A,C but in the WRONG order — C landed BETWEEN D and A (param 0.18), not beyond A as asked. Root cause (ADR-086): `pointOnExtension` always emitted `point-on-segment … extension` (t=1.3), but C already existed as an on-circle vertex, so the apply path kept C on the circle and read it as a bare collinearity — picking the NEAR secant intersection and dropping the order. Fix: when the named point ALREADY EXISTS, emit an ORDERED collinearity `set-line [D, A, C]` instead, which drives the existing point (on whatever carrier it has — here the circle) to sit beyond the far end in order. C stays on the circle as the FAR secant point. A genuinely new point is still created on the extension.",
    steps: ['משולש ABC חסום במעגל', 'מנקודה D יוצא משיק למעגל בנקודה B', 'C נמצאת על המשך DA', 'DA'],
    check: (fig) => {
      allStepsOk(fig);
      const D = at(fig, 'D'), A = at(fig, 'A'), C = at(fig, 'C'), O = at(fig, 'O');
      // collinear, and A strictly between D and C (order D→A→C — the "continuation of DA")
      const cross = (A.x - D.x) * (C.y - D.y) - (A.y - D.y) * (C.x - D.x);
      expect(Math.abs(cross), 'D,A,C collinear').toBeLessThan(1e-2);
      const ux = A.x - D.x, uy = A.y - D.y, L2 = ux * ux + uy * uy;
      const parC = ((C.x - D.x) * ux + (C.y - D.y) * uy) / L2; // D=0, A=1
      expect(parC, 'C beyond A on ray D→A (param > 1)').toBeGreaterThan(1);
      // C is still on the circle (the far secant point), not pulled off it
      expect(dist(O, C), 'C still on circle').toBeCloseTo(dist(O, A), 2);
    },
  },
  {
    id: 'inscribed-triangle-scalene-tangent-meets-CA',
    title: 'inscribed triangle is scalene by default, so "tangent at B meets the extension of CA at D" builds at the default view',
    guards:
      "operator session vob7kih2 (2026-06-22): triangle ABC inscribed, then the one-sentence \"המשיק למעגל בנקודה B והמשך CA נפגשים בנקודה D\" ERRORED \"cannot construct D: lines tan-B and line-CA are parallel\". Root cause (ADR-085): the inscribed triangle defaulted to ISOSCELES — pure golden-angle spacing gives 3 points two equal gaps, putting B at the arc-midpoint of AC (AB=BC), and the tangent at an arc-midpoint is EXACTLY parallel to the chord, so the deterministic line∩line had no solution at the default seed. That isosceles default is itself a fixed assumption the student never stated (ADR-052). Fix: a bounded alternating skew in `nextTheta` makes the default a GENERIC scalene triangle, so tangent@B ∦ CA and D builds. (Operator also reported D always landing on one side — fixed separately by sampling a lone on-line marker's sign, see phase-sample.test.ts.)",
    steps: ['משולש ABC חסום במעגל', 'המשיק למעגל בנקודה B והמשך CA נפגשים בנקודה D'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), B = at(fig, 'B'), A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D');
      // D is the genuine intersection: on the tangent at B (DB ⟂ OB) and collinear with C, A
      const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
      expect(Math.abs(dot({ x: D.x - B.x, y: D.y - B.y }, { x: O.x - B.x, y: O.y - B.y })), 'D on tangent at B').toBeLessThan(1e-3);
      const cross = (A.x - C.x) * (D.y - C.y) - (A.y - C.y) * (D.x - C.x);
      expect(Math.abs(cross), 'D collinear with C,A').toBeLessThan(1e-3);
    },
  },
  {
    id: 'tangent-from-external-D-then-pinned-by-extension',
    title: '"from D a tangent at B" creates D on the tangent immediately; "extension of CA meets the tangent at D" pins it',
    guards:
      "operator session nhm9154u / twiwst5h (2026-06-22): triangle ABC inscribed in circle O, then \"מנקודה D יוצא משיק למעגל בנקודה B\" (from point D a tangent touches at B) drew the tangent at B but DROPPED D (operator: \"still didnt create point D and just created a tangent line\"), and the defining step \"המשך CA נפגש עם המשיק בנקודה D\" (the extension of CA meets the tangent at D) was not-handled → escalated to the LLM → built nothing. The engine fully supports the figure (the one-sentence form already built D as a line∩line). Fix (ADR-084, operator chose \"D appears at step 2\"): (1) `tangentLine` creates the NAMED external apex D as a free marker ON the tangent line (point-on-line), so it shows immediately and slides; (2) a tight `extensionMeetsExistingPoint` rule reads \"extension of CA meets the tangent at [existing] D\" as set-line [C,A,D] — D is already on the tangent, so this only has to put it on the CA extension, which DRIVES its on-line DOF to the crossing (order C→A→D). No parse-context plumbing needed.",
    steps: ['משולש ABC חסום במעגל', 'מנקודה D יוצא משיק למעגל בנקודה B', 'המשך CA נפגש עם המשיק בנקודה D'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), B = at(fig, 'B'), A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D');
      // D exists, lies on the tangent at B (⟂ the radius OB) and on the extension of CA, beyond A
      const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
      expect(Math.abs(dot({ x: D.x - B.x, y: D.y - B.y }, { x: O.x - B.x, y: O.y - B.y })), 'D on tangent (DB ⟂ OB)').toBeLessThan(1e-3);
      const cross = (A.x - C.x) * (D.y - C.y) - (A.y - C.y) * (D.x - C.x);
      expect(Math.abs(cross), 'D collinear with C,A').toBeLessThan(1e-3);
      expect(dot({ x: D.x - A.x, y: D.y - A.y }, { x: A.x - C.x, y: A.y - C.y }), 'D beyond A (CA extension)').toBeGreaterThan(0);
    },
  },
  {
    id: 'unnamed-circle-secant-full-q4',
    title: '"one circle → no name": "BD חותך את המעגל בנקודה A" (the definite "the circle") resolves to the single circle',
    guards:
      "operator principle (2026-06-22): \"when there is only ONE circle in the diagram, I should not have to say its name.\" The full bagrut Q4 (quad BKCD, KB∥CD, triangle KCD inscribed, KB tangent, then the secant BD cutting the circle at A) couldn't be completed because the secant step \"BD חותך את המעגל בנקודה A\" used the DEFINITE article (\"המעגל\" / \"the circle\", no name) and returned not-handled → escalated to the LLM. Root cause: `lineMeetsCircle` / `extendOntoCircle` resolved the circle via `circleCenter` (NAMED only) AND anchored the crossing point on \"circle <name>\" (a name letter required after the circle word) — both failed for \"the circle\". Fix (ADR-083): a `resolveMentionedCircle` helper resolves the single circle when the utterance mentions a circle at all (named OR definite), and a `crossingAfterCircle` helper anchors the \"at X\" with the name optional. Guarded against the line∩line false-grab — an utterance mentioning NO circle still must not be read as a circle cut (see unnamed-circle.test.ts NEGATIVE case).",
    steps: ['מרובע BKCD', 'KB מקביל ל CD', 'משולש KCD חסום במעגל', 'KB משיק למעגל', 'BD חותך את המעגל בנקודה A'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), K = at(fig, 'K'), B = at(fig, 'B'), C = at(fig, 'C'), A = at(fig, 'A');
      // the unnamed secant landed A on the circle, and the tangent/parallel givens still hold
      expect(dist(O, A), 'A on circle (|OA| = |OC|)').toBeCloseTo(dist(O, C), 3);
      const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
      expect(Math.abs(dot({ x: K.x - O.x, y: K.y - O.y }, { x: B.x - K.x, y: B.y - K.y })), 'OK ⟂ KB (tangent)').toBeLessThan(1e-3);
    },
  },
  {
    id: 'segment-tangent-no-explicit-touch-point',
    title: '"KB משיק למעגל" (tangent to the circle, NO "at K") — the touch point is inferred from the on-circle endpoint',
    guards:
      "operator sessions xstllu0i / mmfbpvaz (2026-06-22): quad BKCD, KB ∥ CD, triangle KCD inscribed in circle O, then \"KB משיק למעגל\" — repeatedly reported as STILL broken after the ADR-081 fix. The ADR-081/075 endpoint-tangency paths in `tangentLine` were ALL gated behind an explicit \"at X\" / \"בנקודה X\" clause (`if (!center || !atM) return null`). The student's natural phrasing OMITS the touch point because it is geometrically forced — K is already on the circle (inscribed-triangle vertex), so the only possible tangency point IS K. With no \"at\" clause the rule bailed; `tangentFromExternal` also bailed (both K,B already exist → no unique external apex); so it fell through to the LLM, which returned \"not-understood\" / \"built-nothing\". The ENGINE was never the problem — fed the command it builds a true tangent (K on circle, OK⟂KB, KB∥CD, verifier clean). Fix (ADR-082): when there is no \"at\" clause, INFER the touch from the named segment's endpoint that is a member of THIS circle (exactly one — both endpoints on it would be a chord, not a tangent). Then the existing ADR-081 branch emits point-on-circle K + set-perpendicular(O,K,K,B).",
    steps: ['מרובע BKCD', 'KB מקביל ל CD', 'משולש KCD חסום במעגל', 'KB משיק למעגל'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), K = at(fig, 'K'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // K lies on the circle (its radius equals the other inscribed vertices')
      expect(dist(O, K), 'K on circle (|OK| = |OC|)').toBeCloseTo(dist(O, C), 3);
      expect(dist(O, K), 'K on circle (|OK| = |OD|)').toBeCloseTo(dist(O, D), 3);
      // OK ⟂ KB — a real tangent at K
      const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
      expect(Math.abs(dot({ x: K.x - O.x, y: K.y - O.y }, { x: B.x - K.x, y: B.y - K.y })), 'OK ⟂ KB (tangent)').toBeLessThan(1e-3);
      // KB ∥ CD still holds
      const cross = (B.x - K.x) * (D.y - C.y) - (B.y - K.y) * (D.x - C.x);
      expect(Math.abs(cross), 'KB ∥ CD').toBeLessThan(1e-3);
      // The tangency's radius⟂line is structural, NOT a stated right angle — so NO right-angle mark
      // is drawn at the touch point K (a computed 90° is never marked; the student said "tangent").
      expect(fig.angleMarks.filter((m) => m.right), 'a tangent draws no right-angle (90°) mark').toEqual([]);
    },
  },
  {
    id: 'collinear-flexes-redundant-carrier-kite-tangents',
    title: '"E on the extension of DO" (E antipode of D) solves on a kite+tangents+arc figure — a redundant constraint lends its hoarded DOF',
    guards:
      'operator session rw2ypbgq: kite ABCD, circumcircle O of BCD, AD & AB tangent to O, E on arc BC with arc BE = 2·arc EC, then "E על המשך DO" (E on the extension of DO → D,O,E collinear). Reported WRONG: the input went red with the misleading "recorded but doesn\'t affect yet — add givens" (pending) message, though the figure is fully determined and solvable (D,E both on O ⇒ collinear D-O-E means E is the antipode of D; a valid kite exists). Root cause (ADR-130): the solver assigns each constraint one private free-DOF carrier; the two tangencies claimed A,B, the kite\'s AB=AD/CB=CD claimed C,D, the arc-ratio claimed E — every DOF busy. The collinear arrived with no free DOF, and the recruiter\'s steal only fired for an OVER-subscribed (≥2-carrier) constraint; here every constraint had exactly one. Yet the system IS solvable because the kite\'s AB=AD is REDUNDANT (implied by the two equal tangents from A). Fix: case (E) in recruitFreeDofs LENDS a reachable claimed carrier to the new constraint and accepts the first lend under which the WHOLE system evaluates valid (self-verifying — a lend that breaks its old constraint fails and is rejected).',
    steps: [
      'דלתון ABCD',
      'משולש BCD חסום במעגל',
      'AD ו AB משיקים למעגל',
      'E על קשת BC',
      // "קשת BE שווה פעמיים קשת EC" (arc BE = 2 arc EC) escalated to the LLM; the canonical command it
      // produced (per the figure log) is the central-angle ratio ∠BOE = 2∠EOC.
      { llm: [{ type: 'set-angle-ratio', v1: 'O', a1: 'B', b1: 'E', v2: 'O', a2: 'E', b2: 'C', k: 2 }] },
      'AC',
      'E נמצאת על המשך DO',
    ],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), D = at(fig, 'D'), E = at(fig, 'E'), B = at(fig, 'B'), C = at(fig, 'C');
      // D, O, E collinear — E is the antipode of D through the centre
      const cross = (E.x - D.x) * (O.y - D.y) - (E.y - D.y) * (O.x - D.x);
      expect(Math.abs(cross), 'D, O, E collinear (E on the extension of DO)').toBeLessThan(1e-2);
      // B, C, D, E all lie on circle O (equal radii) — the figure flexed without breaking membership
      const rD = dist(O, D);
      for (const [id, p] of [['E', E], ['B', B], ['C', C]] as const) expect(dist(O, p), `${id} on circle O`).toBeCloseTo(rD, 2);
      // arc BE = 2·arc EC still holds (central angles ∠BOE = 2∠EOC)
      expect(angle(B, O, E), 'arc BE = 2·arc EC (∠BOE = 2∠EOC)').toBeCloseTo(2 * angle(E, O, C), 1);
    },
  },
  {
    id: 'inscribed-trapezoid-stays-a-trapezoid-when-flexed',
    title: 'inscribed trapezoid keeps AB ∥ CD when a later given (BE=BC) flexes the figure — the engine doesn\'t "forget it\'s a trapezoid"',
    guards:
      'operator session su2xwopc: "טרפז ABCD חסום במעגל" (trapezoid inscribed in a circle), then a tangent-meets-line construction giving E, then "BE=BC". By the third step the figure stopped looking like a trapezoid. Root cause: the inscribed trapezoid encoded AB ∥ CD ONLY as fixed starting vertex angles ([215,325,60,120], isosceles) with NO `set-parallel` constraint and non-free vertices, so a later given that drove an on-circle vertex (BE=BC slides C/B off its angle) destroyed the parallelism — nothing persisted the trapezoid property. Fix: like ADR-117 for inscribed triangles, the inscribed trapezoid now emits a persistent `set-parallel(A,B,C,D)` (shapeCmds) AND its vertices are FREE (the base ratio/height are unstated DOFs, ADR-052), so the figure flexes to satisfy later givens WHILE keeping AB ∥ CD (cyclic + parallel ⇒ isosceles automatically).',
    steps: ['טרפז ABCD חסום במעגל', 'המשיק למעגל בנקודה C והמשך AB נפגשים בנקודה E', 'BE=BC'],
    check: (fig) => {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      // AB ∥ CD still holds — the figure is still a trapezoid after BE=BC flexed it
      const cross = (B.x - A.x) * (D.y - C.y) - (B.y - A.y) * (D.x - C.x);
      expect(Math.abs(cross), 'AB ∥ CD survives the flex (still a trapezoid)').toBeLessThan(1e-2);
      // all four vertices stay on the circle, and the stated BE = BC holds
      const rA = dist(O, A);
      for (const [id, p] of [['B', B], ['C', C], ['D', D]] as const) expect(dist(O, p), `${id} on circle O`).toBeCloseTo(rA, 2);
      expect(dist(B, E), 'BE = BC (the stated given)').toBeCloseTo(dist(B, C), 2);
    },
  },
  {
    id: 'tangent-meets-extension-lands-on-named-side',
    title: '"the tangent at D and the EXTENSION of AB meet at E" puts E beyond B (on AB\'s extension), not the wrong side',
    guards:
      'operator session efm2i69l: triangle ABD inscribed, then "המשיק למעגל בנקודה D והמשך AB נפגשים בנקודה E", F on AB, DE=FE, DF. E landed beyond A (the BA side), not on the continuation of AB (beyond B) as asked. Root cause: `tangentLineIntersection` built E as a `line-intersection` on the INFINITE line A–B with NO order — so the crossing fell wherever the geometry put it (here beyond A). The directional "המשך AB" (E beyond the 2nd letter) was dropped. Fix: carry an `order:[A,B,E]` on the `line-intersection` (the proven ADR-127 mechanism, shared with `line-circle-intersection`) → a `collinear-order` whose residual folds into the joint solve, flexing the inscribed triangle so E lands beyond B in the default config — no sampler search, no perf hit, no broad `set-line`.',
    steps: ['משולש ABD חסום במעגל', 'המשיק למעגל בנקודה D והמשך AB נפגשים בנקודה E', 'F על AB', 'DE=FE', 'DF'],
    check: (fig) => {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), E = at(fig, 'E');
      // E is on the EXTENSION of AB beyond B: its parameter along A→B exceeds 1.
      const t = ((E.x - A.x) * (B.x - A.x) + (E.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      expect(t, 'E is beyond B on the continuation of AB (t > 1)').toBeGreaterThan(1);
      // E, A, B are collinear (E really is on line AB)
      const cross = (B.x - A.x) * (E.y - A.y) - (B.y - A.y) * (E.x - A.x);
      expect(Math.abs(cross) / dist(A, B) ** 2, 'E collinear with A, B').toBeLessThan(1e-2);
    },
  },
  {
    id: 'relations-layer-tangent-chord-angle',
    title: 'the "view relations" layer surfaces the TANGENT-CHORD angle (∠ between tangent DE and chord DB = inscribed ∠DAB) and no FALSE relations',
    guards:
      'operator session r4vs1i0y (testing the relations layer, ADR-134/136): on a free inscribed triangle ABD + a tangent at D meeting AB\'s extension at E, (1) the layer first reported many angles as forced that are NOT — root cause (ADR-136): the inscribed triangle\'s vertices had no samplable theta (ADR-052), so the shape was frozen and every angle looked invariant; fixed by making the vertices free + a scalene default, and the detector now merges same-direction rays + drops degenerate angles. (2) Then it MISSED ∠EDB = ∠DAB (the tangent-chord angle) — the angle universe was built only from segments/polygon edges, so the drawn tangent line D–E was not an "edge"; fixed by also connecting points that lie on a VISIBLE line (the tangent\'s touch point D + the crossing E).',
    steps: ['משולש ABD חסום במעגל', 'המשיק בנקודה D והמשך AB נפגשים בנקודה E'],
    check: (fig) => {
      allStepsOk(fig);
      const rel = detectRelations(fig.construction);
      // the tangent-chord angle is a ground truth: ∠DAB (at A, rays to D,B) = ∠EDB (at D, rays to E,B)
      const key = (a: { vertex: Id; a: Id; b: Id }) => `${[a.a, a.b].sort().join('')}@${a.vertex}`;
      const classes = rel.equalAngles.map((cls) => new Set(cls.map(key)));
      const hasTangentChord = classes.some((s) => s.has('BD@A') && s.has('BE@D')); // ∠DAB ≡ ∠EDB
      expect(hasTangentChord, '∠DAB = ∠EDB (tangent-chord) is surfaced').toBe(true);
      // …and NO absolute angle VALUE is forced (the triangle's shape is free — nothing is "definitely 44°")
      expect(rel.definiteAngles, 'no false definite angle on a free figure').toEqual([]);
    },
  },
  {
    id: 'unlabeled-inscribed-quad-auto-names-vertices',
    title: '"מרובע חסום במעגל" (inscribed quad, NO vertex labels) builds deterministically with auto-named A,B,C,D',
    guards:
      'operator session lag0hgpa: "מרובע חסום במעגל" (a quadrilateral inscribed in a circle, with NO vertex labels) "doesn\'t work" — it fell through the deterministic parser to the LLM, because every polygon rule required an explicit label run (only `circle`/`מעגל`, which has no vertices, worked bare). A bare shape is a common, simple input the offline parser should own. Fix: a shape rule with NO labels and nothing else geometry-significant left over now auto-names its vertices A,B,C,… (skipping existing points), across the standalone, inscribed, and regular-polygon families, He + En. A PARTIAL label run still escalates.',
    steps: ['מרובע חסום במעגל'],
    check: (fig) => {
      allStepsOk(fig);
      // The four auto-named vertices A,B,C,D were built and all lie on the (auto-centred) circle O.
      const O = at(fig, 'O');
      const r = dist(O, at(fig, 'A'));
      for (const id of ['A', 'B', 'C', 'D']) expect(dist(O, at(fig, id)), `${id} on circle O`).toBeCloseTo(r, 6);
      // …and they form a (convex) quadrilateral.
      expect(fig.construction.objects.some((o) => o.kind === 'polygon'), 'a quadrilateral was built').toBe(true);
    },
  },
  {
    id: 'diameter-from-point-cuts-side-onto-segment',
    title: '"the diameter from F cuts side AC at E" — E lands ON segment AC (the figure flexes), and "קוטר" parses',
    guards:
      "operator sessions 59tzde4c / 50w3vlt3: right-triangle ABC, F/G/H on the sides, inscribed quad GCHF, AB tangent at F, then \"קוטר המעגל מנקודה F חותך את AC בנקודה E\" (a BARE \"AC\", no \"הצלע\"). THREE problems across the sessions: (1) the \"קוטר … cuts …\" phrasing escalated to the LLM (which built nothing) — `lineLineIntersection` `stop`s on \"קוטר\" and there was no diameter-cuts-a-side rule; (2) the line∩line crossing put E on the CONTINUATION of AC, not the segment, because nothing constrained the crossing to the side; (3) ADR-077's first cut only constrained E to the segment when \"הצלע\"/\"side\" was EXPLICIT — but a bare \"AC\" in a figure IS the side, so E went back to the extension. Fix (ADR-077 + amendment): a `diameterCutsSegment` rule emits the diameter-line (F–O) ∩ line AC PLUS a `set-line [A,E,C]` order constraint BY DEFAULT (only an explicit \"the LINE AC\" opts out), so when the crossing would fall on the extension the figure FLEXES a free DOF (the triangle reshapes, F moving with it) to bring E onto the side.",
    steps: [
      'משולש ABC ישר זוית',
      'נקודות F, G, H נמצאות על AB, AC, CB',
      'מרובע GCHF חסום במעגל',
      'AB משיק למעגל בנקודה F',
      'קוטר המעגל מנקודה F חותך את AC בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig); // the "קוטר" step parses + builds (no LLM, no error)
      const A = at(fig, 'A'), C = at(fig, 'C'), E = at(fig, 'E'), F = at(fig, 'F'), O = at(fig, 'O');
      // E lies on SEGMENT AC (parameter s ∈ [0,1]), not its extension
      const ac = { x: C.x - A.x, y: C.y - A.y };
      const ae = { x: E.x - A.x, y: E.y - A.y };
      const s = (ae.x * ac.x + ae.y * ac.y) / (ac.x * ac.x + ac.y * ac.y);
      expect(s, 'E is on segment AC (0 ≤ s ≤ 1)').toBeGreaterThanOrEqual(0);
      expect(s, 'E is on segment AC (0 ≤ s ≤ 1)').toBeLessThanOrEqual(1);
      // E is on the diameter line F–O (collinear with F and O)
      const cross = (F.x - O.x) * (E.y - O.y) - (F.y - O.y) * (E.x - O.x);
      const scaleSq = ((F.x - O.x) ** 2 + (F.y - O.y) ** 2) * ((E.x - O.x) ** 2 + (E.y - O.y) ** 2);
      expect(Math.abs(cross) / Math.sqrt(scaleSq || 1), 'E collinear with F,O (on the diameter)').toBeLessThan(1e-3);
    },
  },
  {
    id: 'existing-line-tangent-adapts-the-circle',
    title: '"AB tangent at F" on an EXISTING line flexes the circle (radius OF ⟂ AB), it does not redraw AB',
    guards:
      "operator session ze5qda8y: right-triangle ABC, F/G/H on sides AB/AC/CB, quad GCHF inscribed (circumcircle of G,C,H + F concyclic), then \"AB משיק למעגל בנקודה F\". It ERRORED 'unresolved dependencies for: A,B,F,G,H,O,tan-F,circle-O' (then the LLM built nothing) — because the tangentLine rule treated the EXISTING segment AB as a new drawn tangent and re-created A,B as point-on-line markers on tan-F, closing a dependency cycle A→tan-F→circle-O→O=circumcentre(G,C,H)→G(on AC)→A. There was also no path that reads 'existing line tangent to circle' as a CONSTRAINT that flexes the circle. Fix (ADR-075): when the naming labels (A,B) and the touch point (F) all pre-exist, emit set-perpendicular(O,F,A,B) — the radius ⟂ the existing line, i.e. tangency — instead of constructing a tangent + markers. The circle then adapts: F on circle AND OF ⟂ AB.",
    steps: [
      'משולש ABC ישר זוית',
      'נקודות F, G, H נמצאות על הישרים AB, AC, CB', // ADR-076: N points pairwise on N segments (was LLM → built-nothing)
      'מרובע GCHF חסום במעגל',
      'AB משיק למעגל בנקודה F',
    ],
    check(fig) {
      allStepsOk(fig); // no "unresolved dependencies" — the step builds instead of cycling
      // the three points landed on their respective sides (the pairwise points-on-segments parse)
      for (const id of ['F', 'G', 'H']) expect(fig.positions.has(id), `${id} placed`).toBe(true);
      const O = at(fig, 'O'), F = at(fig, 'F'), A = at(fig, 'A'), B = at(fig, 'B'), G = at(fig, 'G');
      // radius O–F is perpendicular to line A–B (AB is tangent at F)
      const r = { x: F.x - O.x, y: F.y - O.y };
      const ab = { x: B.x - A.x, y: B.y - A.y };
      const cos = (r.x * ab.x + r.y * ab.y) / (Math.hypot(r.x, r.y) * Math.hypot(ab.x, ab.y));
      expect(Math.abs(cos), 'OF ⟂ AB (tangency)').toBeLessThan(1e-4);
      // F is on the circle: |OF| equals the circumradius (|OG|, G a circumcentre vertex)
      expect(dist(O, F), '|OF| = circumradius ⇒ F on circle').toBeCloseTo(dist(O, G), 3);
    },
  },
  {
    id: 'r7-concyclic-after-competing-distances',
    title: 'R7 joint re-bind: "ABHD concyclic" holds AFTER HF=4/GE=5 already claimed the parallelogram DOFs',
    guards:
      "operator session qm0gbjhr: parallelogram ABCD, F/E on the extensions, G=EC∩AD, H=FD∩BC, then HF=4 and GE=5, then \"מרובע ABHD בר חסימה במעגל\". It FALSELY reported 'over-constrained: A,B,H,D concyclic cannot hold' (and the LLM built nothing) — yet the figure had 6 free DOF, and the concyclic constraint builds fine on its own. Root cause (R7 / ADR-045 step 3): the greedy two-phase binding — HF=4 and GE=5 had CLAIMED every free vertex the concyclic could reach, so the ancestor walker returned EMPTY and the constraint got no carrier. Fix: the joint re-bind re-points one OVER-SUBSCRIBED claimed DOF (HF=4 had 4 carriers) to the new constraint so it joins the joint solve while every existing constraint keeps a carrier; all three then hold simultaneously.",
    steps: [
      'מקבילית ABCD', 'F על המשך הצלע AB', 'E על המשך הצלע BA', 'FE',
      'EC חותך את AD בנקודה G', 'FD חותך את הצלע BC בנקודה H', 'HF=4', 'GE=5',
      'מרובע ABHD בר חסימה במעגל',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), H = at(fig, 'H'), D = at(fig, 'D');
      // ABHD concyclic: D lies on the circumcircle of A,B,H
      const d2 = 2 * (A.x * (B.y - H.y) + B.x * (H.y - A.y) + H.x * (A.y - B.y));
      const ux = ((A.x * A.x + A.y * A.y) * (B.y - H.y) + (B.x * B.x + B.y * B.y) * (H.y - A.y) + (H.x * H.x + H.y * H.y) * (A.y - B.y)) / d2;
      const uy = ((A.x * A.x + A.y * A.y) * (H.x - B.x) + (B.x * B.x + B.y * B.y) * (A.x - H.x) + (H.x * H.x + H.y * H.y) * (B.x - A.x)) / d2;
      expect(dist(D, { x: ux, y: uy }), '|center-D| = circumradius (ABHD concyclic)').toBeCloseTo(dist(A, { x: ux, y: uy }), 2);
      // the earlier givens STILL hold (the joint solve satisfied all three together)
      expect(dist(at(fig, 'H'), at(fig, 'F')), 'HF = 4 preserved').toBeCloseTo(4, 2);
      expect(dist(at(fig, 'G'), at(fig, 'E')), 'GE = 5 preserved').toBeCloseTo(5, 2);
    },
  },
  {
    id: 'r7-equal-after-competing-distances',
    title: 'R7 joint re-bind: "BH=FH" holds AFTER HF=4/GE=5 already claimed the parallelogram DOFs',
    guards:
      "operator session qm0gbjhr (same figure): after HF=4 and GE=5, \"BH=FH\" FALSELY reported 'over-constrained: |BH| = |FH| cannot hold' — but it builds fine on its own; the earlier distances had claimed every reachable DOF. Same R7 joint re-bind fix: re-point an over-subscribed claimed DOF so |BH|=|FH| joins the joint solve; |HF|=4 and |GE|=5 stay satisfied.",
    steps: [
      'מקבילית ABCD', 'F על המשך הצלע AB', 'E על המשך הצלע BA', 'FE',
      'EC חותך את AD בנקודה G', 'FD חותך את הצלע BC בנקודה H', 'HF=4', 'GE=5',
      'BH=FH',
    ],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'B'), at(fig, 'H')), '|BH| = |FH|').toBeCloseTo(dist(at(fig, 'F'), at(fig, 'H')), 2);
      expect(dist(at(fig, 'H'), at(fig, 'F')), 'HF = 4 preserved').toBeCloseTo(4, 2);
      expect(dist(at(fig, 'G'), at(fig, 'E')), 'GE = 5 preserved').toBeCloseTo(5, 2);
    },
  },
  {
    id: 'concyclic-flexes-the-rectangle',
    title: 'EABF concyclic FLEXES the rectangle (its size is a free DOF) instead of failing on the default proportions',
    guards:
      "the operator's figure: rectangle ABCD, E on AD, F = CE ∩ diagonal DB, then \"EABF בר חסימה במעגל\" (the four concyclic). It first ERRORED 'unresolved dependencies' — a cycle: the hidden circumcircle's centre O depends on E (it's built through E), AND F depends on E, while the constraint drives E (ADR-062 self-coupling, via a DERIVED point). Then it silently failed: EABF can only be concyclic when CE⟂BD, impossible for the DEFAULT short rectangle — but the rectangle's size is a free DOF (ADR-052), so the engine must FLEX it, not assume the default. Fixes: (1) route the self-coupled solved point numerically (breaks the cycle); (2) keep `concyclic` as a check so the recruit-DOFs fallback grows the rectangle's height until the four points share a circle.",
    steps: ['מלבן ABCD', 'E על AD', 'CE חותך את האלכסון DB בנקודה F', 'EABF בר חסימה במעגל'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F');
      // still a rectangle (right angle at A) and E still on AD
      expect((B.x - A.x) * (D.x - A.x) + (B.y - A.y) * (D.y - A.y), 'AB ⟂ AD (still a rectangle)').toBeCloseTo(0, 2);
      expect(Math.abs((E.x - A.x) * (D.y - A.y) - (E.y - A.y) * (D.x - A.x)) / dist(A, D), 'E still on AD').toBeLessThan(1e-3);
      // the four points are concyclic: F lies on the circumcircle of E, A, B
      const ax = A.x, ay = A.y, bx = B.x, by = B.y, ex = E.x, ey = E.y;
      const d2 = 2 * (ax * (by - ey) + bx * (ey - ay) + ex * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - ey) + (bx * bx + by * by) * (ey - ay) + (ex * ex + ey * ey) * (ay - by)) / d2;
      const uy = ((ax * ax + ay * ay) * (ex - bx) + (bx * bx + by * by) * (ax - ex) + (ex * ex + ey * ey) * (bx - ax)) / d2;
      expect(dist(F, { x: ux, y: uy }), '|center-F| = circumradius (EABF concyclic)').toBeCloseTo(dist(A, { x: ux, y: uy }), 2);
    },
  },
  {
    id: 'bagrut-q4-tangent-secant-perpendicular',
    title: 'bagrut Q4: circle R, tangent AB, secant AD through O (C,D), AG⟂AD, D-B-G collinear, ∠ADB=α',
    guards:
      "the real textbook figure (operator showed the page). Circle radius R, external A; AB tangent at B; AD passes through the centre O and cuts the circle at C and D; AG ⟂ AD; D, B, G are collinear; ∠ADB = α. The given is the SYMBOLIC angle α (a label, not a number) — the figure is parametrised by it, not by a stated size. Earlier numeric experiments (AG=8 AND AC=0.5DC together) over-constrained the shape-determined figure; the book's α-labelled form builds cleanly. Also exercises the secant-through-centre (lineCutsCircleTwice, ADR-068) and the now-FREE external apex (ADR-052).",
    steps: [
      'מעגל שרדיוסו R ומרכזו O',
      'מנקודה A יוצא משיק למעגל בנקודה B',
      'המשך AO חותך את המעגל בנקודות C ו D',
      'G על המשך DB',
      'DG',
      'AG⊥AD',
      '∠ADB=α',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), G = at(fig, 'G');
      // C, D on the circle, both on line AO (the secant through the centre)
      expect(dist(O, C), '|OC| = |OD| (both on the circle)').toBeCloseTo(dist(O, D), 2);
      const onAO = (p: Vec) => Math.abs((p.x - A.x) * (O.y - A.y) - (p.y - A.y) * (O.x - A.x)) / dist(A, O);
      expect(onAO(C), 'C on line AO').toBeLessThan(1e-3);
      expect(onAO(D), 'D on line AO').toBeLessThan(1e-3);
      // AG ⟂ AD
      expect((G.x - A.x) * (D.x - A.x) + (G.y - A.y) * (D.y - A.y), 'AG ⟂ AD').toBeCloseTo(0, 2);
      // D, B, G collinear (the problem's "on one line")
      const off = Math.abs((G.x - D.x) * (B.y - D.y) - (G.y - D.y) * (B.x - D.x)) / dist(D, B);
      expect(off, 'D, B, G collinear').toBeLessThan(1e-2);
    },
  },
  {
    id: 'bagrut-q4-numeric-angle-drives-the-figure',
    title: 'bagrut Q4 with a NUMERIC ∠ADB=30 (not symbolic α): the figure flexes to the stated angle (R7 / ADR-074)',
    guards:
      "the same bagrut tangent-secant-perpendicular figure as `bagrut-q4-tangent-secant-perpendicular`, but ∠ADB is given a NUMBER (30°) instead of the symbolic α. It used to ERROR 'over-constrained: ∠ADB = 30° cannot hold' and stay rigidly at the seed (19.86°) — a R7 BINDING failure (not convergence: with the apex unclaimed the solve reaches any angle exactly). The greedy `AG⊥AD` claimed the free apex A, and `G על המשך DB` froze G at the default extension t=1.3, so ∠ADB had no DOF left. Fix (ADR-074 / R7(3)): on the failure path the recruit FREES THE BLOCKER — re-points AG⊥AD to its extension operand G (a recruitable default-extension DOF) and releases A for ∠ADB — and the joint solve reaches the stated angle. ADR-064 (a stated-extension point a relation must NOT drag) is untouched because it succeeds eagerly and never reaches the recruit. Verified across 25°/30°/40°.",
    steps: [
      'מעגל שרדיוסו R ומרכזו O',
      'מנקודה A יוצא משיק למעגל בנקודה B',
      'המשך AO חותך את המעגל בנקודות C ו D',
      'G על המשך DB',
      'DG',
      'AG⊥AD',
      '∠ADB=30',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), G = at(fig, 'G');
      // the figure adapted to the STATED angle (was stuck at 19.86° / over-constrained)
      expect(angle(A, D, B), '∠ADB = 30° (the stated given holds)').toBeCloseTo(30, 0);
      // AG ⟂ AD still holds (its carrier G slid to keep it)
      expect((G.x - A.x) * (D.x - A.x) + (G.y - A.y) * (D.y - A.y), 'AG ⟂ AD').toBeCloseTo(0, 1);
      // D, B, G collinear
      const off = Math.abs((G.x - D.x) * (B.y - D.y) - (G.y - D.y) * (B.x - D.x)) / dist(D, B);
      expect(off, 'D, B, G collinear').toBeLessThan(1e-1);
      // C, D still on the circle and on line AO (the secant through the centre)
      expect(dist(O, C), '|OC| = |OD| (both on the circle)').toBeCloseTo(dist(O, D), 1);
      const onAO = (p: Vec) => Math.abs((p.x - A.x) * (O.y - A.y) - (p.y - A.y) * (O.x - A.x)) / dist(A, O);
      expect(onAO(D), 'D on line AO').toBeLessThan(1e-2);
    },
  },
  {
    id: 'triangle-circumscribes-circle-is-incircle',
    title: '"משולש DEF חוסם את המעגל" builds the INCIRCLE (tangent to the sides), not a circumcircle',
    guards:
      "operator: \"no ability to say משולש DEF חוסם את המעגל\". It was misparsed to a CIRCUMCIRCLE (circle through D,E,F) — backwards. \"Triangle circumscribes the circle\" is the same figure as \"circle inscribed in the triangle\" (the incircle, tangent to the 3 sides). Fix: the `incircle` rule now also matches the triangle-first phrasing, ORDERED (triangle-labels … חוסם/circumscribes … circle) so a circle-first \"מעגל חוסם משולש\" (a real circumcircle) is NOT captured.",
    steps: ['משולש DEF חוסם את המעגל'],
    check(fig) {
      allStepsOk(fig);
      // the incircle is centred at the incentre O (a circle centre defaults to O), tangent to side DE at its foot G
      const I = at(fig, 'O'), D = at(fig, 'D'), E = at(fig, 'E'), G = at(fig, 'G');
      const off = Math.abs((G.x - D.x) * (E.y - D.y) - (G.y - D.y) * (E.x - D.x)) / dist(D, E);
      expect(off, 'tangency point G lies on side DE').toBeLessThan(1e-4);
      // I is equidistant from all three sides (the inradius) — check vs side DF too
      const F = at(fig, 'F');
      const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      expect(distToLine(I, D, F), 'inradius to DF = inradius to DE').toBeCloseTo(dist(I, G), 3);
    },
  },
  {
    id: 'incircle-has-three-tangency-points',
    title: '"משולש ABC חוסם מעגל" on an existing triangle marks ALL THREE tangency points (one per side)',
    guards:
      "operator (screenshot): the incircle of an existing triangle ABC only drew ONE tangency point (F on one side) — it should mark all three (the incircle touches every side). Root cause (ADR-151): the general incircle branch materialised only the single radius foot; fix builds three feet (one ⟂ foot per side), the other two landing on the circle automatically (the incentre is equidistant).",
    steps: ['משולש ABC', 'משולש ABC חוסם מעגל'],
    check(fig) {
      allStepsOk(fig);
      const I = at(fig, 'O'); // incentre = circle centre (defaults to O)
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      const F = at(fig, 'F'), G = at(fig, 'G'), H = at(fig, 'H'); // three tangency feet
      const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      // each foot lies on its side
      expect(distToLine(F, A, B), 'F on side AB').toBeLessThan(1e-4);
      expect(distToLine(G, B, C), 'G on side BC').toBeLessThan(1e-4);
      expect(distToLine(H, C, A), 'H on side CA').toBeLessThan(1e-4);
      // all three are the same distance from the incentre (they lie on the circle)
      const r = dist(I, F);
      expect(dist(I, G), 'G on the circle (same inradius)').toBeCloseTo(r, 4);
      expect(dist(I, H), 'H on the circle (same inradius)').toBeCloseTo(r, 4);
    },
  },
  {
    id: 'tangential-triangle-via-llm-decomposition',
    title: '"a tangent through each vertex of ABC, meeting at D E F" decomposes to 3 two-tangent-meets (the tangential triangle)',
    guards:
      "operator's long sentence — \"דרך כל קודקוד של משולש ABC מעבירים משיק למעגל; המשיקים נפגשים ב-D E F\" — asking whether the LLM can break it down. It can: the building blocks (`twoTangentsMeet`, ADR-066) are in the LLM's catalog, so it decomposes the quantifier into THREE 'tangent at X and tangent at Y meet at Z' lines (a prompt example now guides this). These are the canonical lines the LLM emits; replayed here they build the tangential triangle DEF, each side tangent to the circle.",
    steps: [
      'משולש ABC חסום במעגל',
      'המשיק בנקודה A והמשיק בנקודה B נפגשים בנקודה D',
      'המשיק בנקודה B והמשיק בנקודה C נפגשים בנקודה E',
      'המשיק בנקודה C והמשיק בנקודה A נפגשים בנקודה F',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const dot = (u: Vec, v: Vec) => (u.x * v.x + u.y * v.y) / (dist({ x: 0, y: 0 }, u) * dist({ x: 0, y: 0 }, v));
      // D,E,F all placed, and every tangent line is ⟂ its radius (a real tangent at each touch point)
      for (const [v, p] of [['A', 'D'], ['B', 'D'], ['B', 'E'], ['C', 'E'], ['C', 'F'], ['A', 'F']] as [Id, Id][]) {
        const V = at(fig, v), P = at(fig, p);
        expect(Math.abs(dot({ x: P.x - V.x, y: P.y - V.y }, { x: V.x - O.x, y: V.y - O.y })), `${p}${v} tangent at ${v}`).toBeLessThan(1e-3);
      }
    },
  },
  {
    id: 'two-tangents-meet-at-a-point',
    title: '"המשיק מנקודה A והמשיק מנקודה C נפגשים בנקודה D" — two tangents meet at the pole D',
    guards:
      "operator: two tangents meeting at a point used to work but now escalated to the LLM and built nothing — there was no rule for tangent∩tangent (only tangent∩segment). Fix: a `twoTangentsMeet` rule builds the tangent at each on-circle point + their `line-intersection`. A, C are inscribed-triangle vertices on the circle; D is the pole of chord AC.",
    steps: ['משולש ABC חסום במעגל', 'המשיק מנקודה A והמשיק מנקודה C נפגשים בנקודה D'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D');
      const dot = (u: Vec, v: Vec) => (u.x * v.x + u.y * v.y) / (dist({ x: 0, y: 0 }, u) * dist({ x: 0, y: 0 }, v));
      // DA ⟂ OA and DC ⟂ OC — each line through D is tangent at its point (⟂ the radius)
      expect(Math.abs(dot({ x: D.x - A.x, y: D.y - A.y }, { x: A.x - O.x, y: A.y - O.y })), 'DA tangent at A').toBeLessThan(1e-3);
      expect(Math.abs(dot({ x: D.x - C.x, y: D.y - C.y }, { x: C.x - O.x, y: C.y - O.y })), 'DC tangent at C').toBeLessThan(1e-3);
    },
  },
  {
    id: 'symbolic-2alpha-drives-shape-not-the-fixed-point',
    title: 'a "2α" relation drives the figure\'s FREE shape, not a point the student fixed (D on the extension)',
    guards:
      "the operator's REAL α/2α bug (they used the α glyph): isosceles AB=AC in a circle, D placed on the extension of BC (t=1.3), ∠CAD=α, then a central angle ∠BOC=2α. It ERRORED 'cannot place D on segment BC so that ∠BOC = 2·∠CAD' — `driveOrCheck` drove D (the first on-segment ref) to satisfy the relation, but D is a GIVEN the student positioned, not a DOF, and a central angle can't be met by sliding D. Fix (ADR-064): only a FREE on-segment point (no stated ratio) is driveable; a stated-ratio/extension point is left put, so the relation drives the triangle's free shape instead and D stays at t=1.3.",
    steps: ['משולש שווה שוקיים ABC שבו AB=AC חוסם במעגל', 'נקודה D על המשך BC', 'BD', 'DA', '∠CAD=α', '∠BOC=2α'],
    check(fig) {
      allStepsOk(fig);
      const cad = angle(at(fig, 'C'), at(fig, 'A'), at(fig, 'D'));
      const boc = angle(at(fig, 'B'), at(fig, 'O'), at(fig, 'C'));
      expect(boc / cad, '∠BOC = 2·∠CAD').toBeCloseTo(2, 2);
      // D stays where it was placed: t ≈ 1.3 along B→C
      const B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      const tD = ((D.x - B.x) * (C.x - B.x) + (D.y - B.y) * (C.y - B.y)) / ((C.x - B.x) ** 2 + (C.y - B.y) ** 2);
      expect(tD, 'D not dragged off its stated extension position').toBeCloseTo(1.3, 2);
    },
  },
  {
    id: 'spelled-out-alpha-then-2alpha',
    title: 'spelled-out "alpha" then "2alpha" — the second angle is 2× the first (not 2°)',
    guards:
      "operator: \"I enter alpha for one angle then try 2alpha to another and the result is wrong.\" Spelled-out \"alpha\" (not the α symbol) missed the single-Greek-letter variable regex, and \"2alpha\" then half-parsed to the NUMBER 2 — a 2° angle, silently dropping the variable (ADR-024/026 class). Fix: normalise spelled-out Greek names to symbols at the parse entry (\"alpha\"→α, bounded by non-letter so a DIGIT prefix '2alpha' works while an uppercase point pair 'MU'/'XI' and a longer word 'alphabet' don't match).",
    steps: ['משולש ABC', '∠BAC=alpha', '∠ABC=2alpha'],
    check(fig) {
      allStepsOk(fig);
      const bac = angle(at(fig, 'B'), at(fig, 'A'), at(fig, 'C'));
      const abc = angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C'));
      expect(abc / bac, '∠ABC = 2·∠BAC (2α : α)').toBeCloseTo(2, 2);
      expect(abc, 'the second angle is NOT a tiny 2° (the old misparse)').toBeGreaterThan(10);
    },
  },
  {
    id: 'chained-equality-trisects-segment',
    title: '"AL=LK=KC" drives both free points so they trisect AC (coupled equalities solve jointly)',
    guards:
      "operator: \"support a case such as AL=LK=KC — multiple equalities.\" The parser already chained it (AL=LK + LK=KC), but it ERRORED 'unresolved dependencies for: L, K': each equality drove a different free on-segment point and referenced the OTHER, so L became `on-segment-solved` needing K and K needing L — a cycle the closed-form evaluator can't break. Fix: when solved-on-segment points are coupled (reference each other), `resolveDriven` promotes them to NUMERIC on-segment carriers and joint-solves (ADR-045) — the closed-form path stays for the uncoupled common case.",
    steps: ['משולש ABC', 'L ו- K נקודות על AC', 'AL=LK=KC'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), C = at(fig, 'C'), L = at(fig, 'L'), K = at(fig, 'K');
      const AL = dist(A, L), LK = dist(L, K), KC = dist(K, C);
      expect(LK, 'AL = LK').toBeCloseTo(AL, 3);
      expect(KC, 'LK = KC').toBeCloseTo(LK, 3);
      // all three ≈ |AC|/3 (L, K trisect AC)
      expect(AL, 'each part is a third of AC').toBeCloseTo(dist(A, C) / 3, 3);
    },
  },
  {
    id: 'perpendicular-cuts-segment-at-new-point',
    title: '"the perpendicular to AC at K cuts AB at E" creates E and draws EK (not just a bare line)',
    guards:
      "the operator tried several ways to create EK and 'it just drew a line'. \"האנך ל-AC בנקודה K חותך את AB בנקודה E\" emitted ONLY the perpendicular line and dropped the \"cuts AB at E\" clause, so E was never placed and EK never drawn. Fix: `perpendicularLine` now detects a cut clause (cut verb + segment + result point — the cut verb anchors the match so the SECOND 'בנקודה' is the result, not the through-point), builds the perpendicular as SCAFFOLDING, crosses it with AB to place E, and draws the perpendicular SEGMENT K–E.",
    steps: ['משולש ABC', 'BA=BC', 'L ו- K נקודות על AC', 'האנך ל- AC בנקודה K חותך את AB בנקודה E'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.construction.objects.some((o) => o.id === 'seg-EK'), 'segment EK drawn').toBe(true);
      const E = at(fig, 'E'), K = at(fig, 'K'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      const off = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      expect(off(E, A, B), 'E on AB').toBeLessThan(1e-4);
      // EK ⟂ AC
      const cos = ((E.x - K.x) * (C.x - A.x) + (E.y - K.y) * (C.y - A.y)) / (dist(E, K) * dist(A, C));
      expect(Math.abs(cos), 'EK ⟂ AC').toBeLessThan(1e-3);
    },
  },
  {
    id: 'two-points-on-one-segment',
    title: 'two free points on the SAME segment land at distinct spots (no "same point" error)',
    guards:
      "the operator's figure: triangle ABC, then \"L על AC\" then \"K על AC\" — the SECOND errored with 'L and K would be at the same point', and the combined \"L ו-K נקודות על AC\" escalated to the LLM and built nothing. Root cause: a free point-on-segment with no stated ratio always seeded t=0.5, so a second point on the same segment collided with the first (ADR-017 coincidence guard). Fix: seed a new free point in the MIDDLE of the largest open gap among the segment's existing points (`freeSegT`) — first 0.5, then 0.25, 0.75, … — so they spread. Plus a `pointsOnSegment` parser rule so \"L and K are points on AC\" / \"L ו-K נקודות על AC\" build both deterministically (the Hebrew \"points\" word needed an explicit Hebrew-letter class, not `\\w` which is ASCII-only).",
    steps: ['משולש ABC', 'L על AC', 'K על AC'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), C = at(fig, 'C'), L = at(fig, 'L'), K = at(fig, 'K');
      expect(dist(L, K), 'L and K are distinct points').toBeGreaterThan(0.1);
      // both lie ON segment AC
      const off = (p: Vec) => Math.abs((p.x - A.x) * (C.y - A.y) - (p.y - A.y) * (C.x - A.x)) / dist(A, C);
      expect(off(L), 'L on AC').toBeLessThan(1e-6);
      expect(off(K), 'K on AC').toBeLessThan(1e-6);
    },
  },
  {
    id: 'extension-meet-draws-lines-to-G',
    title: '"המשך CA ו-BD נפגשים בנקודה G" draws BOTH lines through to the meeting point G',
    guards:
      "the operator's figure (session): triangle ABC in a circle, BC diameter, D on arc AB, then \"the extension of CA and BD meet at G\". The crossing G was placed but the drawn segments stopped at the inner points (CA, BD) — the lines didn't visually REACH G, so the operator had to draw CG/BG by hand. Fix: in `lineLineIntersection`, when an extension is named (המשך/extension), draw each line from its base THROUGH to G (C→G, B→G) instead of the bare operands — and emit the intersection (which DEFINES G) BEFORE those segments, else a segment to a not-yet-defined G would create G as a stray free point and conflict ('G is already defined'). A plain diagonals crossing (\"M = intersection of AC and BD\", no extension) is untouched — its full segments stay whole.",
    steps: [
      'משולש ABC חסום במעגל שרדיוסו R',
      'BC קוטר',
      'D נקודה על המעגל על הקשת AB',
      'המשך CA ו BD נפגשים בנקודה G',
    ],
    check(fig) {
      allStepsOk(fig);
      // both lines were drawn to G
      expect(fig.construction.objects.some((o) => o.id === 'seg-CG'), 'segment C→G drawn').toBe(true);
      expect(fig.construction.objects.some((o) => o.id === 'seg-BG'), 'segment B→G drawn').toBe(true);
      const G = at(fig, 'G'), C = at(fig, 'C'), A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D');
      // G is the true crossing — on line CA and on line BD
      const off = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      expect(off(G, C, A), 'G on line CA').toBeLessThan(1e-6);
      expect(off(G, B, D), 'G on line BD').toBeLessThan(1e-6);
      // the inner points lie ON the drawn segments (the extension is visible): A between C,G and D between B,G
      const param = (p: Vec, a: Vec, b: Vec) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      expect(param(A, C, G), 'A between C and G').toBeGreaterThan(0);
      expect(param(A, C, G)).toBeLessThan(1);
      expect(param(D, B, G), 'D between B and G').toBeGreaterThan(0);
      expect(param(D, B, G)).toBeLessThan(1);
    },
  },
  {
    id: 'corner-tangent-circle-grows-to-vertex',
    title: '"C נמצאת על המעגל" grows the inscribed-corner circle (a free DOF) until vertex C lands on it',
    guards:
      "the operator's figure (session d0utx8bw): rectangle, a circle tangent to two sides at a corner, then \"point C is on the circle\" — which built NOTHING (operator: \"why isn't C adjusted to be on the circle?\"). C is a derived rectangle vertex that can't itself slide onto the circle, so the point-on-circle apply hit its give-up branch. But the corner circle has a FREE size DOF (its centre slides along the bisector). Fix: when the point can't move and the circle's radius is set by a point T on it (`circle-through`), \"P on circle\" ⟺ |centre·P| = |centre·T| is pushed as an `equal` that drives the circle's free DOF until P lands on it — tangency preserved (centre stays on its bisector, only the size changes). Plus a parser fix: `pointOnCircle` now resolves a DEFINITE/unnamed circle (\"על המעגל\" / \"is on the circle\") via the single circle in context, so the phrasing parses deterministically instead of escalating.",
    steps: [
      'מלבן ABCD',
      'AB ו- AD משיקים למעגל O', // circle tangent to sides AB, AD at corner A (free size DOF)
      'C נמצאת על המעגל', // the operator's "C is on the circle" — should GROW the circle to reach C
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), E = at(fig, 'E'), K = at(fig, 'K'), C = at(fig, 'C');
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D');
      const r = dist(O, E); // the circle's radius (E is on it)
      expect(dist(O, C), 'C now lies on the circle (radius grew to reach it)').toBeCloseTo(r, 3);
      // tangency to BOTH sides is preserved (the feet stay on the sides at the same radius)
      expect(dist(O, K), 'still tangent to AD').toBeCloseTo(r, 3);
      const off = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      expect(off(E, A, B), 'E still on AB').toBeLessThan(1e-6);
      expect(off(K, A, D), 'K still on AD').toBeLessThan(1e-6);
    },
  },
  {
    id: 'corner-tangent-circle',
    title: '"AB ו-AD משיקים למעגל O" — a circle tangent to two sides of a corner (centre on the bisector, free size)',
    guards:
      "the operator's figure (session d0utx8bw): rectangle ABCD, then \"AB and AD are tangent to circle O\" — which escalated to the LLM and built NOTHING, because there was no engine vocabulary for a circle constrained tangent to a GIVEN line (only tangent FROM a point, where the circle is given). Root cause: a missing primitive, not an LLM failure. Built compositionally (no engine change, like the incircle): the centre O is a FREE point on the angle bisector of ∠BAD (the locus equidistant from both sides — [ADR-052](docs/06-decisions.md#adr-052) free-size DOF), the radius comes from a circle through the foot on AB (so it's tangent there), and tangency to AD is automatic (equidistant). The tangency points E,K are the feet of the ⟂ from O onto each side.",
    steps: [
      'מלבן ABCD',
      'AB ו- AD משיקים למעגל O', // the operator's exact utterance (no tangency points named → auto-named E, K)
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), E = at(fig, 'E'), K = at(fig, 'K');
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D');
      // tangent to BOTH sides at the same radius: |OE| = |OK|
      expect(dist(O, E), 'equal radii to both sides (tangent to both)').toBeCloseTo(dist(O, K), 4);
      // E lies on side AB, K on side AD (the feet)
      const off = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      expect(off(E, A, B), 'E on AB').toBeLessThan(1e-6);
      expect(off(K, A, D), 'K on AD').toBeLessThan(1e-6);
      // OE ⟂ AB and OK ⟂ AD (a tangent radius is perpendicular to the side)
      const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
      expect(dot({ x: O.x - E.x, y: O.y - E.y }, { x: B.x - A.x, y: B.y - A.y }), 'OE ⟂ AB').toBeCloseTo(0, 4);
      expect(dot({ x: O.x - K.x, y: O.y - K.y }, { x: D.x - A.x, y: D.y - A.y }), 'OK ⟂ AD').toBeCloseTo(0, 4);
    },
  },
  {
    id: 'perp-constraint-keeps-quad-convex',
    title: '"OD⊥AC" on a cyclic quad nudges D to the NEAR arc-midpoint (quad stays convex, not crossed)',
    guards:
      "the operator's figure (session 691h53h0): cyclic quad ABCD in O, AB diameter, E on the extension of AD with CE⊥AE, then \"OD⊥AC\". The last step \"messed the shape up — it was good up to that point\": OD⊥AC has TWO roots (the two arc-midpoints of AC, half a circle apart). D sat at ≈330° (already nearly perpendicular), but the 1-DOF driven solve took `roots[0]` = the FAR root at ≈148° — which falls between A(30°) and B(210°), re-ordering the vertices into a CROSSED quad. Root cause: the driven solve had no stability preference, so a symmetric constraint could fling the point across the circle. Fix: when no order constraint rides the carrier, order the roots by NEARNESS to its current value, so branch 0 is the smallest move (ADR-028) — D nudges to ≈328°, the quad stays convex and OD⊥AC still holds; \"show another configuration\" still reaches the far root.",
    steps: [
      'מרובע ABCD חסום במעגל O', // cyclic quad in O (free radius)
      'AB קוטר', // AB is a diameter → B = antipode of A
      'E על המשך AD כך ש CE⊥AE', // E on the extension of AD, CE ⟂ AE
      'OD⊥AC', // the step that used to cross the quad
    ],
    check(fig) {
      allStepsOk(fig);
      convexQuad(fig, ['A', 'B', 'C', 'D'], 'O'); // still a simple convex quad, vertices in order
      // OD ⟂ AC actually holds (cos of the angle between OD and AC ≈ 0)
      const O = at(fig, 'O'), D = at(fig, 'D'), A = at(fig, 'A'), C = at(fig, 'C');
      const u = { x: D.x - O.x, y: D.y - O.y }, w = { x: C.x - A.x, y: C.y - A.y };
      const cos = (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y));
      expect(Math.abs(cos), 'OD ⟂ AC').toBeLessThan(0.02);
    },
  },
  {
    id: 'circumcircle-of-triangle-cuts-chord',
    title: '"המעגל החוסם את משולש ABC חותך את CE בנקודה D" — circumcircle of a triangle ∩ a chord, all deterministic/Hebrew',
    guards:
      "the operator's figure (session 8i10y4dp): circle, two tangents from A at B,C, ∠CAB=90, chord CE, then \"the circle circumscribing triangle ABC cuts CE at D\" — which DIDN'T parse, even via the LLM. Four gaps fixed: (1) the `triangle` rule's `shapeHasLeftover` STOPPED on the 'משולש ABC' inside 'מעגל חוסם … משולש ABC' (and the `g`-flag `re` corrupted the next call) — the rule now defers on a circumscribe phrasing, before `re.test`; (2) no circumcircle-∩-segment construct — added `circumcircleMeetsSegment` (circumcircle + line∩circle avoiding the shared vertex); (3) `freeLabel` reused an existing circle's centre ('O') for the new circumcircle — now avoids `ctx.circles`; (4) the chord 'מיתר CE' (and 'E על המעגל') were AMBIGUOUS because `parseCtx` counted the tangent construct's HIDDEN Thales aux circle — now VISIBLE circles only. Plus: the circumcentre of A,B,C lands on the hidden Thales midpoint (the circumcircle IS that Thales circle), which the coincidence check rejected — a `~`-scaffolding point may now overlap a real point.",
    steps: [
      'מעגל',
      'מנקודה A יוצאים שני משיקים למעגל בנקודות B ו C', // tangents from external A → B,C on the circle
      '∠CAB=90',
      'מיתר CE', // chord CE — places C,E on the (single visible) circle + draws CE; no LLM
      'המעגל החוסם את משולש ABC חותך את CE בנקודה D', // circumcircle(ABC) ∩ CE = D (the crossing that isn't C)
    ],
    check(fig) {
      allStepsOk(fig);
      const D = at(fig, 'D'), C = at(fig, 'C'), E = at(fig, 'E');
      expect(fig.positions.has('D'), 'D placed').toBe(true);
      // D on line CE, distinct from C
      const cross = Math.abs((D.x - C.x) * (E.y - C.y) - (D.y - C.y) * (E.x - C.x)) / Math.max(dist(C, E), 1) ** 2;
      expect(cross, 'D on line CE').toBeLessThan(1e-2);
      expect(dist(D, C), 'D ≠ C (the OTHER crossing)').toBeGreaterThan(0.5);
    },
  },
  {
    id: 'directional-cut-drives-free-apex-from-far',
    title: '"המשך BD חותך את המשך OC" with the apex D seeded FAR → the engine DRIVES the free DOF so A is still placed (no manual move)',
    guards:
      "the operator's real figure (session 0mjr1ots): tangents from external D touch circle O at B,C, then \"המשך BD חותך את המשך OC בנקודה A\". `המשך` is DIRECTIONAL (beyond the 2nd letter — ADR-054) — A must be beyond D and beyond C. D is a FREE DOF, so the engine must SOLVE it, not ask the user to move D (the operator's explicit requirement). The `dir1`/`dir2` flags make the command emit a `collinear-order` constraint; when a config (here a far-seeded apex) puts the crossing on the wrong side, `recruitFreeDofs` drives the free apex until the extensions reach A. (An early diagnosis wrongly claimed this was impossible-by-symmetry; it's apex-distance-dependent. The two-tangent construct's default apex is now seeded CLOSE — see the next scenario — so the normal path needs no driving; THIS scenario forces a far seed to prove the drive still lands a valid A.)",
    steps: [
      'מעגל O',
      {
        llm: [
          { type: 'free-point', id: 'D', x: 12, y: 0 }, // FAR (~2.4R) — wrong basin; the engine must drive it
          { type: 'midpoint', id: '~tanmid-OD', a: 'O', b: 'D' },
          { type: 'circle-through', id: 'tanaux-OD', center: '~tanmid-OD', through: 'O', hidden: true },
          { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'tanaux-OD', branch: 0 },
          { type: 'circle-circle-intersection', id: 'C', circle1: 'circle-O', circle2: 'tanaux-OD', branch: 1 },
          { type: 'segment', a: 'D', b: 'B' },
          { type: 'segment', a: 'D', b: 'C' },
        ],
      },
      'המשך BD חותך את המשך OC בנקודה A',
    ],
    check(fig) {
      allStepsOk(fig); // the engine solved the free DOF — A IS placed, no error, no manual repositioning
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), O = at(fig, 'O');
      const proj = (s: Vec, e: Vec, p: Vec) => ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / ((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
      expect(proj(B, D, A), 'A beyond D').toBeGreaterThan(1);
      expect(proj(O, C, A), 'A beyond C').toBeGreaterThan(1);
    },
  },
  {
    id: 'directional-cut-works-when-apex-close',
    title: '"המשך BD חותך את המשך OC" with the apex D CLOSE → A placed beyond D and C (the textbook figure)',
    guards:
      'the same tangent figure with the external point D positioned CLOSE to the circle (~1.2R, as the bagrut sketch shows) — the directional extensions beyond D and beyond C now genuinely meet, so A is placed. Proves the wrong-side case above is configuration-dependent (apex distance), not impossible. This is the figure the operator was trying to reproduce.',
    steps: [
      'מעגל O',
      {
        llm: [
          { type: 'free-point', id: 'D', x: 6, y: 0 }, // CLOSE (~1.2R) — the textbook basin
          { type: 'midpoint', id: '~tanmid-OD', a: 'O', b: 'D' },
          { type: 'circle-through', id: 'tanaux-OD', center: '~tanmid-OD', through: 'O', hidden: true },
          { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'tanaux-OD', branch: 0 },
          { type: 'circle-circle-intersection', id: 'C', circle1: 'circle-O', circle2: 'tanaux-OD', branch: 1 },
          { type: 'segment', a: 'D', b: 'B' },
          { type: 'segment', a: 'D', b: 'C' },
        ],
      },
      'המשך BD חותך את המשך OC בנקודה A',
    ],
    check(fig) {
      allStepsOk(fig); // A IS placed
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), O = at(fig, 'O');
      const proj = (s: Vec, e: Vec, p: Vec) => ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / ((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
      expect(proj(B, D, A), 'A beyond D').toBeGreaterThan(1);
      expect(proj(O, C, A), 'A beyond C').toBeGreaterThan(1);
    },
  },
  {
    id: 'cut-form-intersection-on-extensions',
    title: '"המשך BD חותך את המשך OC בנקודה A" → A is the line BD ∩ line OC crossing (the cut-form, kept in Hebrew)',
    guards:
      "the operator's input (session 0mjr1ots): the deterministic parser only knew the \"BD and OC intersect at A\" phrasing, not \"BD CUTS OC at A\" (the verb BETWEEN the two segments), so it escalated to the LLM — which rewrote it IN ENGLISH and lossily as \"point A on the extension of BD and on the extension of OC\"; the parser then matched only the first clause (A on BD's extension at t=1.3) and DROPPED the OC half, so A was a wrong point, not the intersection. Fixed by adding the cut-form to `lineLineIntersection` (seg1, cut verb, seg2, point → line∩line), so it parses deterministically, stays Hebrew, and places A correctly. (`extension`/`המשך` is irrelevant — two infinite lines meet at one point.)",
    steps: [
      'point B at (0,0)',
      'point D at (2,0)', // line BD = the x-axis
      'point O at (3,2)',
      'point C at (3,1)', // line OC = the vertical x=3
      'המשך BD חותך את המשך OC בנקודה A', // A = line(B,D) ∩ line(O,C) = (3,0) — beyond BOTH segments
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), O = at(fig, 'O');
      const coll = (p: Vec, q: Vec, r: Vec) => {
        const span = Math.max(dist(p, q), dist(q, r), dist(p, r));
        return Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / (span * span);
      };
      expect(coll(B, D, A), 'A on line BD').toBeLessThan(1e-3);
      expect(coll(O, C, A), 'A on line OC').toBeLessThan(1e-3);
      expect(A.x, 'A.x ≈ 3 (the true crossing)').toBeCloseTo(3, 3);
      expect(A.y, 'A.y ≈ 0 (the true crossing)').toBeCloseTo(0, 3);
    },
  },
  {
    id: 'extend-onto-tangent-line-is-rejected-clearly',
    title: 'directional "המשך CA" where line CA is the TANGENT to the target circle → rejected with a clear message, no crash',
    guards:
      'the operator\'s actual session (jvdi4sl7) CRASHED step 4 with "A and F would be at the same point". Diagnosed from the geometry: C was defined as "tangent to circle O at A meets circle P", so line CA IS the tangent to circle O at A (cos(CA,OA)=0) — it touches O only at A, so "המשך CA חותך מעגל O" has NO second crossing F. The figure is geometrically impossible as typed, but the engine reported it via the opaque generic coincidence check. Two fixes: (1) extend-onto-circle, when an endpoint is already on the target circle, routes to a deterministic line∩circle that AVOIDS the shared endpoint (ADR-054); (2) that path, when NO fresh crossing remains (tangent / chord), now returns a CLEAR "line is tangent … no second crossing to extend onto" message instead of collapsing F onto A. This locks that the impossible input is handled GRACEFULLY (prior figure kept, clear error), never a crash.',
    steps: [
      'שני מעגלים ננחתכים בנקודות A ו- B', // O (r5, free) + P (r3.6, free); A,B = the two crossings (operator's exact text)
      'המשיק למעגל O בנקודה A חותך את מעגל P בנקודה C', // C on circle P, ON the tangent-to-O-at-A line
      'המשיק למעגל P בנקודה B חותך את מעגל O בנקודה D', // D on circle O
      'המשך CA חותך את מעגל O בנקודה F', // IMPOSSIBLE: line CA is tangent to O at A — no second crossing
    ],
    check(fig) {
      // The impossible step is rejected GRACEFULLY: the prior figure (through D) is intact, F is NOT
      // placed (the tangent has no second crossing), and the message names the tangent — not a crash.
      expect(fig.positions.has('A') && fig.positions.has('D'), 'the prior figure (through D) is kept').toBe(true);
      expect(fig.positions.has('F'), 'F is not placed — the construction is impossible').toBe(false);
      expect(fig.lastError, 'a clear message names the tangent, not an opaque coincidence').toMatch(/tangent/i);
    },
  },
  {
    id: 'redefine-existing-point-onto-circle',
    title: 'redefining an existing point as "on circle P" drives it onto the circle (never a silent no-op)',
    guards:
      'this is the LLM-decomposition path that produced a GREEN-but-WRONG figure. The operator typed "המשך AC חותך את מעגל P בנקודה E"; before lineMeetsCircle existed it escalated, and the LLM split it into "E על המשך AC" + "E על מעגל P". The second command (point-on-circle for the ALREADY-EXISTING E) hit addObj, which no-ops on an existing id — so the on-circle fact was SILENTLY DROPPED: every step reported ok, lastError was null, yet E sat ~7.4 from P\'s centre (radius 3.6), nowhere near the circle. Fixed in applyCommand: re-defining an existing on-segment/extension point as "on circle C" — when one of its line ends is also on C — becomes the SECOND crossing (line∩circle, avoiding the shared end), so E is driven onto the circle instead of dropped. (The post-evaluate verifier is the general net for any case this does not reconcile.)',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B',
      'C על מעגל O', // a point on the left circle, so line AC exists (A is on BOTH circles)
      'E על המשך AC', // E created as an on-extension point (the LLM\'s first half)
      'E על מעגל P', // redefining the EXISTING E as on circle P — used to be silently dropped
    ],
    check(fig) {
      allStepsOk(fig);
      const P = at(fig, 'P'), E = at(fig, 'E'), A = at(fig, 'A'), C = at(fig, 'C');
      expect(dist(P, E), 'E actually lands ON circle P (not silently dropped)').toBeCloseTo(dist(P, A), 3);
      expect(dist(E, A), 'E is the OTHER crossing, not the shared point A').toBeGreaterThan(0.5);
      const coll = (p: Vec, q: Vec, r: Vec) => {
        const span = Math.max(dist(p, q), dist(q, r), dist(p, r));
        return Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / (span * span);
      };
      expect(coll(A, C, E), 'A, C, E collinear (E on line AC)').toBeLessThan(1e-3);
    },
  },
  {
    id: 'two-circles-mutual-tangent-secants',
    title: 'two intersecting circles, each tangent to the other at a shared point, with two secants (bagrut: △ABC∼△BDA, CEDF parallelogram)',
    guards:
      'a full bagrut figure (the operator\'s actual Hebrew input): two circles meet at A,B; the tangent to the LEFT circle at A is a chord AD of the RIGHT circle (D the other crossing); the tangent to the RIGHT circle at B is a chord CB of the LEFT circle; AC extended meets the right circle again at E; BD extended meets the left circle at F. The "tangent to circle X at P meets circle Y at Q" phrasing MISPARSED twice: (1) it contains "tangent" + two circle names + "at", so circlesTangent grabbed it and made the two circles mutually tangent at A — contradicting that they already INTERSECT at A,B; (2) even the dedicated rule first missed the active verb "פוגש" (meets) — only "נחתך/נפגש/cuts/meets" were in the shared INTERSECT_KW — so the operator\'s "פוגש את מעגל P" fell through to circlesTangent and D was never created. Fixed: "פוגש"/"פגש" added to INTERSECT_KW, and a dedicated rule (before circlesTangent) reads it as a tangent LINE ∩ the other circle (the crossing that AVOIDS the shared point) and DRAWS the chord. E,F come from the existing-point secant. NO fixed assumptions — the only free DOFs are the two circle radii.',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו B', // circle-O (left, r5) + circle-P (right, r3.6), A,B = the two crossings
      'המשיק למעגל O בנקודה A פוגש את מעגל P בנקודה D', // AD ⟂ radius OA; D = tangent ∩ circle P, avoiding A (the "פוגש" misparse)
      'המשיק למעגל P בנקודה B פוגש את מעגל O בנקודה C', // CB ⟂ radius PB; C = tangent ∩ circle O, avoiding B
      'המשך CA חותך את מעגל P בנקודה E', // E beyond A on circle P (order C→A→E) — strict directional המשך (ADR-054)
      'המשך DB חותך את מעגל O בנקודה F', // F beyond B on circle O (order D→B→F)
    ],
    check(fig) {
      allStepsOk(fig); // no over-constraint, no silent drop, no mutual-tangency misparse
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F');
      const O = at(fig, 'O'), P = at(fig, 'P');
      // membership: C,F on the left circle O; D,E on the right circle P (relative to A, which is on both)
      const rO = dist(O, A), rP = dist(P, A);
      expect(dist(O, C), 'C on circle O').toBeCloseTo(rO, 3);
      expect(dist(O, F), 'F on circle O').toBeCloseTo(rO, 3);
      expect(dist(P, D), 'D on circle P').toBeCloseTo(rP, 3);
      expect(dist(P, E), 'E on circle P').toBeCloseTo(rP, 3);
      // tangency: AD ⟂ radius OA at A, and CB ⟂ radius PB at B (normalised dot ≈ 0)
      const cos = (u: Vec, v: Vec) => (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
      const vec = (p: Vec, q: Vec): Vec => ({ x: q.x - p.x, y: q.y - p.y });
      expect(Math.abs(cos(vec(A, D), vec(O, A))), 'AD tangent to circle O at A (⟂ radius)').toBeLessThan(1e-3);
      expect(Math.abs(cos(vec(B, C), vec(P, B))), 'CB tangent to circle P at B (⟂ radius)').toBeLessThan(1e-3);
      // collinearity of the two secants
      const coll = (p: Vec, q: Vec, r: Vec) => {
        const span = Math.max(dist(p, q), dist(q, r), dist(p, r));
        return Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / (span * span);
      };
      expect(coll(C, A, E), 'C, A, E collinear (secant through A)').toBeLessThan(1e-3);
      expect(coll(D, B, F), 'D, B, F collinear (secant through B)').toBeLessThan(1e-3);
      // DIRECTIONAL order (ADR-098): "המשך CA" puts E BEYOND A (order C→A→E), "המשך DB" puts F beyond B —
      // not on the near side between the apex and the shared point (the latent wrong-side this fix catches).
      const beyond = (a: Vec, b: Vec, id: Vec) => (id.x - b.x) * (b.x - a.x) + (id.y - b.y) * (b.y - a.y) > 0;
      expect(beyond(C, A, E), 'E is beyond A (המשך CA)').toBe(true);
      expect(beyond(D, B, F), 'F is beyond B (המשך DB)').toBe(true);
      // none of the derived points collapsed onto the shared crossings
      expect(dist(D, A), 'D ≠ A').toBeGreaterThan(0.5);
      expect(dist(C, B), 'C ≠ B').toBeGreaterThan(0.5);
      expect(dist(E, A), 'E ≠ A').toBeGreaterThan(0.5);
      expect(dist(F, B), 'F ≠ B').toBeGreaterThan(0.5);
    },
  },
  {
    id: 'second-intersection-avoids-shared-point',
    title: '"E on line DB" with E,B both on circle O is the OTHER crossing — never E = B, deterministic',
    guards:
      'modelling "E on line DB" (E on circle O, B also on circle O) as a generic driven collinearity let the numeric solve land on the DEGENERATE crossing E = B, or on the wrong side, seed-dependently — the operator saw "E on B" and "E not on the continuation of DB", and only got it right by cycling. It is really "the second intersection of line DB with circle O", so it now becomes a line∩circle that AVOIDS the shared point (B) — deterministic, and structurally never collapses onto B. Same for C on line AD (A on circle O).',
    steps: [
      'two circles intersect at A and B', // circle-O (r5) + circle-P (r3.6)
      'C על מעגל O',
      'D על מעגל P',
      'נקודה E נמצאת על מעגל O',
      'C על הישר AD', // C = line(A,D) ∩ O, avoid A
      'נקודה E נמצאת על המשך הישר DB', // E = line(D,B) ∩ O, avoid B (reinterpreted from "on the extension")
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), O = at(fig, 'O');
      const coll = (p: Vec, q: Vec, r: Vec) => {
        const span = Math.max(dist(p, q), dist(q, r), dist(p, r));
        return Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / (span * span);
      };
      expect(coll(C, A, D), 'C, A, D collinear').toBeLessThan(1e-3);
      expect(coll(E, D, B), 'E, D, B collinear').toBeLessThan(1e-3);
      expect(dist(E, B), 'E is NOT the shared crossing B').toBeGreaterThan(1); // the reported symptom
      expect(dist(C, A), 'C is NOT the shared crossing A').toBeGreaterThan(1);
      expect(dist(O, E), 'E on circle O').toBeCloseTo(5, 4);
      expect(dist(O, C), 'C on circle O').toBeCloseTo(5, 4);
    },
  },
  {
    id: 'two-collinear-chain-solves',
    title: 'a CHAIN of two "line through a point" constraints solves (D on line AC, then E on line DB)',
    guards:
      'building on the secant figure, the operator added a SECOND collinearity ("line DB passes through E" after "line AD passes through C"). The two constraints share the carrier D, making a triangular system (D fixed by A,D,C; E then fixed by D,B,E). The joint driven solver minimised the SUM of both residuals, which pulled the shared D toward both and satisfied neither — it returned the seed and falsely reported "over-constrained: A, D, C collinear cannot hold" (even though the solver had ALREADY found an accepted solution, the polish wandered off it into a degenerate same-cost basin). Fixed with a binding-aware seed (each bounded carrier solved against the constraint IT drives) + keeping an accepted candidate through the polish (ADR-050 amendment).',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו-B', // circle-O (r5) + circle-P (r3.6) meeting at A,B
      { llm: [{ type: 'point-on-circle', id: 'C', circle: 'circle-O' }, { type: 'point-on-circle', id: 'D', circle: 'circle-P' }] }, // "C עם מעגל אחד ו D על מעגל שני"
      'ישר AD עובר בנקודה C', // A, D, C collinear (drives D onto line AC)
      'E על מעגל O', // a free point on circle O
      'ישר DB עובר בנקודה E', // D, B, E collinear (drives E onto line DB) — was the failing step
    ],
    check(fig) {
      allStepsOk(fig); // no false "over-constrained" — both collinearities hold at once
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      const O = at(fig, 'O'), P = at(fig, 'P');
      const coll = (p: Vec, q: Vec, r: Vec) => {
        const span = Math.max(dist(p, q), dist(q, r), dist(p, r));
        return Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / (span * span);
      };
      expect(coll(A, D, C), 'A, D, C collinear').toBeLessThan(1e-3);
      expect(coll(D, B, E), 'D, B, E collinear').toBeLessThan(1e-3);
      expect(dist(D, A), 'D ≠ A').toBeGreaterThan(0.1);
      expect(dist(E, B), 'E ≠ B').toBeGreaterThan(0.1);
      expect(dist(P, D), 'D on circle P').toBeCloseTo(3.6, 1);
      expect(dist(O, E), 'E on circle O').toBeCloseTo(5, 1);
    },
  },
  {
    id: 'line-through-intersection-collinear',
    title: '"line CE passes through A" makes C, A, E collinear (two circles meet at A,B; C on one, E on the other)',
    guards:
      'the operator built two circles meeting at A,B, placed C on one and E on the other, then wanted the line CE to pass through A (the classic secant-through-an-intersection-point figure). There was no way to say it: "ישר CE עובר בנקודה A" was SILENTLY DROPPED (the LLM modelled it as "A on line CE", which matched no rule), and the retry "E על המשך הצלע AC" hit "\'E\' is already defined". Both now route to the new `collinear` constraint (ADR-050): a parser rule for the line-through phrasing, and an engine reinterpretation of a redefining "P on segment" of an existing free point. The constraint drives a free DOF until the three line up, excluding the trivial collapse onto A.',
    steps: [
      'שני מעגלים חותכים זה את זה בנקודות A ו B', // circle-O (r5) + circle-P (r3.6), meeting at A,B
      { llm: [{ type: 'point-on-circle', id: 'C', circle: 'circle-P' }] }, // "C על המעגל הימני"
      { llm: [{ type: 'point-on-circle', id: 'E', circle: 'circle-O' }] }, // "E על המעגל השמאלי"
      'ישר CE עובר בנקודה A', // the operator's exact words — was dropped, now parses to set-collinear
    ],
    check(fig) {
      allStepsOk(fig); // no silent drop, no "'E' is already defined"
      const A = at(fig, 'A'), C = at(fig, 'C'), E = at(fig, 'E'), O = at(fig, 'O'), P = at(fig, 'P');
      const span = Math.max(dist(C, E), dist(C, A), dist(E, A));
      const cross = (C.x - A.x) * (E.y - A.y) - (C.y - A.y) * (E.x - A.x); // 2·area of C,A,E
      expect(Math.abs(cross) / (span * span), 'C, A, E collinear').toBeLessThan(1e-3);
      // The OTHER crossing — neither C nor E collapsed onto the intersection point A.
      expect(dist(E, A), 'E ≠ A').toBeGreaterThan(0.05 * span);
      expect(dist(C, A), 'C ≠ A').toBeGreaterThan(0.05 * span);
      // C stayed on its circle (P, r≈3.6) and E on its circle (O, r≈5).
      expect(dist(P, C), '|PC|').toBeCloseTo(3.6, 1);
      expect(dist(O, E), '|OE|').toBeCloseTo(5, 1);
    },
  },
  {
    id: 'point-on-arc-no-midpoint-word',
    title: '"F על קשת BC" builds a FREE point on the right circle, not dropped (ADR-042)',
    guards:
      'the arc rule required the word midpoint/אמצע, so "F על קשת BC" (a point ON arc BC) matched no rule, escalated, and was DROPPED ("error"); a retry fell to plain point-on-circle and put F generically on the wrong circle O (near E–D). The rule now also accepts on/על → a FREE point on the arc (point-on-circle with `between`, ADR-042; default at the arc midpoint, slidable), resolved to the circle holding both B and C (P). The free-slide behaviour is covered by free-arc-point.test.ts.',
    steps: [
      'משולש CDE',
      'A על CD',
      'B על CE',
      'מרובע ABED חסום במעגל', // circle-O
      'משולש ABC חסום במעגל', // circle-P (holds B and C)
      'F על קשת BC', // point ON arc BC — parses deterministically now (no LLM, no drop)
    ],
    check(fig) {
      allStepsOk(fig);
      const F = at(fig, 'F'), P = at(fig, 'P'), B = at(fig, 'B'), C = at(fig, 'C');
      expect(dist(P, F)).toBeCloseTo(dist(P, at(fig, 'A')), 4); // F is on circle P
      expect(dist(F, B)).toBeCloseTo(dist(F, C), 3); // on arc BC: equidistant from B and C (the arc point)
    },
  },
  {
    id: 'arc-resolves-to-circle-holding-both-endpoints',
    title: '"arc BC" picks the circle that actually contains both B and C (not a wrongly-named one)',
    guards:
      'with two circles present (O through A,B,E,D; P through A,B,C) the arc-midpoint of BC was placed on circle O — but C is not on O, so F landed in a meaningless spot. The arc rule now resolves to the circle containing BOTH endpoints (P), overriding a wrong named circle even on the LLM re-parse path.',
    steps: [
      'משולש CDE',
      'A על CD',
      'B על CE',
      'מרובע ABED חסום במעגל', // circle-O (B on it, C is NOT)
      'משולש ABC חסום במעגל', // circle-P (both B and C on it)
      'F אמצע הקשת BC במעגל O', // LLM canonical with the WRONG circle O — must be corrected to P
    ],
    check(fig) {
      allStepsOk(fig);
      const F = at(fig, 'F'), P = at(fig, 'P'), O = at(fig, 'O');
      // F is on circle P (centre P) — the one holding both B and C — not on circle O.
      expect(dist(P, F)).toBeCloseTo(dist(P, at(fig, 'A')), 4); // |PF| = radius of P
      expect(Math.abs(dist(O, F) - dist(O, at(fig, 'A')))).toBeGreaterThan(1e-3); // F is NOT on circle O
    },
  },
  {
    id: 'second-inscribed-circle-fresh-centre',
    title: 'a second inscribed/circumscribed circle auto-names a fresh centre instead of colliding on O',
    guards:
      "the inscribed/circumcircle centre auto-picker only dodged the VERTEX letters, not points already in the figure — so a second circle re-picked 'O' and hit \"'O' is already defined\". The picker now also avoids ctx.points, so the second circle gets a fresh centre (P).",
    steps: [
      'משולש CDE',
      'A על CD',
      'B על CE',
      'מרובע ABED חסום במעגל', // first circle → centre O
      'משולש ABC חסום במעגל', // second circle → must auto-name a FRESH centre, not reuse O
    ],
    check(fig) {
      allStepsOk(fig); // no "'O' is already defined" collision
      // Two distinct circle centres exist (O for the quad, a fresh one for the triangle).
      const O = at(fig, 'O'), P = at(fig, 'P');
      expect(dist(O, P)).toBeGreaterThan(1e-6);
      // The triangle's three vertices lie on the SECOND circle (centre P).
      const R = dist(P, at(fig, 'A'));
      for (const id of ['A', 'B', 'C']) expect(dist(P, at(fig, id))).toBeCloseTo(R, 4);
    },
  },
  {
    id: 'cyclic-quad-existing-vertices',
    title: 'a cyclic/inscribed quad whose 4 vertices already exist becomes concyclic (does not detach them)',
    guards:
      "inscribing a quad whose vertices already exist (A on CD, B on CE, D & E triangle vertices) re-placed A,B,D,E as FRESH on-circle points — detaching A from CD and B from CE. The new `concyclic` constraint (ADR-041) instead draws/hides the circumcircle through three of them and drives a free DOF (A's slide on CD) until all four share the circle.",
    steps: [
      'משולש CED',
      'A על CD',
      'B על CE',
      'מרובע ABDE בר חסימה', // the LLM canonical line for "מרובע ABDE חסום במעגל", re-parsed with context
    ],
    check(fig) {
      allStepsOk(fig); // no detach / over-constraint
      // A stays ON segment CD (not re-pinned to a fresh circle): collinear C-A-D.
      const C = at(fig, 'C'), D = at(fig, 'D');
      const A = at(fig, 'A');
      const cross = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
      expect(Math.abs(cross) / (dist(C, D) || 1)).toBeLessThan(1e-3); // A on line CD
      // All four vertices are concyclic (equidistant from the circumcentre O).
      const O = at(fig, 'O'), R = dist(O, A);
      for (const id of ['A', 'B', 'D', 'E']) expect(dist(O, at(fig, id))).toBeCloseTo(R, 4);
    },
  },
  {
    id: 'circle-through-four-existing-points',
    title: '"circle through A B E D" with four existing points draws a circle + makes the fourth concyclic',
    guards:
      'the circumcircle rule read only the first THREE of four labels, silently dropping D — so the circle passed through A,B,E but not D. It now draws the circumcircle of three and adds a `concyclic` constraint over all four (ADR-041).',
    steps: [
      'משולש CED',
      'A על CD',
      'B על CE',
      'circle through A B E D', // the LLM canonical line for "מעגל ABED", re-parsed with context
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), R = dist(O, at(fig, 'A'));
      for (const id of ['A', 'B', 'E', 'D']) expect(dist(O, at(fig, id))).toBeCloseTo(R, 4); // D is on it too
    },
  },
  {
    id: 'circumcircle-of-existing-points',
    title: 'a circle circumscribing a triangle whose three vertices already exist (no redefinition conflict)',
    guards:
      "the circumcircle command reuses-or-creates its three points (A,B,C) exactly like a shape/segment, but it was missing from commandConflict's `isShape` set. So when the points already existed (A on CD, B on CE), the conflict gate — which runs applyCommand against an EMPTY construction and saw them as fresh free-points — wrongly flagged \"'A' is already defined\" and the circle was dropped.",
    steps: [
      'משולש CDE',
      'A על CD',
      'B על CE',
      'משולש ABC',
      'מעגל חוסם את ABC', // the LLM canonical line for "מעגל חוסם את משולש ABC", re-parsed with context
    ],
    check(fig) {
      allStepsOk(fig); // no "'A' is already defined" over-constraint
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      // O is the circumcentre: equidistant from all three vertices (the circle passes through each).
      const rA = dist(O, A);
      expect(dist(O, B)).toBeCloseTo(rA, 6);
      expect(dist(O, C)).toBeCloseTo(rA, 6);
    },
  },
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
    id: 'trapezoid-dc-greater-than-ab',
    title: 'inscribed trapezoid + "DC>AB" reshapes so |DC| > |AB| (segment-length inequality)',
    guards: 'session ei99765k: "DC>AB" escalated to the LLM and returned not-understood — the parser only read single-letter named-measure orderings (measureOrder), so a direct segment-length inequality had no rule even though the engine already supports set-length-order/length-order (ADR-039). The default trapezoid always drew |AB| > |DC| with no way to flip it.',
    steps: ['טרפז ABCD חסום במעגל', 'DC>AB'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // The inequality now holds visibly: |DC| strictly greater than |AB|, with a real gap.
      expect(dist(D, C)).toBeGreaterThan(dist(A, B));
      expect(dist(D, C) - dist(A, B)).toBeGreaterThan(0.5);
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
    id: 'two-circles-meet-at-A-and-B',
    title: '"שני מעגלים נחתכים בנקודות A ו-B" — both circles created (overlapping) + both intersections',
    guards:
      'no rule for "two circles intersect at A and B" → it escalated and the LLM produced a SINGLE point G (not A AND B), and the two circles did not visibly meet. A deterministic rule now creates both circles overlapping and BOTH intersection points (the two branches).',
    steps: ['שני מעגלים נחתכים בנקודות A ו- B'],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['A', 'B']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle') as { center: Id; radius: { value: number } }[];
      expect(circles.length).toBe(2); // two circles
      const A = at(fig, 'A'), B = at(fig, 'B');
      expect(dist(A, B)).toBeGreaterThan(0.5); // two DISTINCT intersection points
      for (const c of circles) {
        expect(dist(at(fig, c.center), A)).toBeCloseTo(dist(at(fig, c.center), B), 2); // A,B equidistant from each centre ⇒ both ON each circle
      }
      // The common chord AB is NOT drawn — the student asked for two circles, not their chord.
      expect(fig.construction.objects.some((o) => o.kind === 'segment')).toBe(false);
      // The two circles read as DIFFERENT circles, not a symmetric lens.
      expect(circles[0].radius.value).not.toBeCloseTo(circles[1].radius.value, 2);
    },
  },
  {
    id: 'two-circles-then-secant-from-A',
    title: 'two circles → point C on the right circle → a secant from existing A cuts the left circle at D',
    guards:
      'the LLM fallback re-parsed its canonical steps with NO figure context, so "from A a line cuts circle O at C and D" fell to the "first secant" branch (which needs an "outside" cue) and was DROPPED — "the next command failed". llmParse now threads the figure context (and accumulates ids across steps) into each re-parse, so the secant-from-an-existing-point branch fires. (Steps 2–3 are the LLM canonical lines the log recorded; parsed here with context exactly as llmParse does.)',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו- B',
      'C על מעגל P', // LLM canonical for "C נקודה על המעגל הימני"
      'מנקודה A ישר חותך את המעגל O בנקודות C ו-D', // LLM canonical for "AC חותך את המעגל השמאלי בנקודה D"
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('D'), 'D placed (the step did not drop)').toBe(true);
      // D is the OTHER crossing of line A–C with the left circle O ⇒ D is ON circle O.
      const O = fig.construction.objects.find((o) => o.kind === 'circle' && (o as { center: Id }).center === 'O') as { radius: { value: number } };
      expect(dist(at(fig, 'O'), at(fig, 'D'))).toBeCloseTo(O.radius.value, 2);
    },
  },
  {
    id: 'oc-half-radius-sizes-the-chord',
    title: '"OC = 0.5R" sizes the chord (R auto-binds to the radius; "C אמצע מיתר AB" is the midpoint)',
    guards:
      'two bugs: (1) "C אמצע מיתר AB" was grabbed by the chord rule (created A,B + segment, DROPPED midpoint C) — midpoint now runs before chord; (2) the reserved radius symbol R was unbound unless declared, so "OC=0.5R" was a free label — R now auto-binds to the circle radius. Together: OC=0.5R drives the chord midpoint to half the radius.',
    steps: [
      'circle centered at O radius 5',
      'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B',
      'נקודה C היא אמצע מיתר AB', // C = midpoint of chord AB (NOT a chord)
      'OC=0.5R', // |OC| = half the radius — drives A,B
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('C')).toBe(true); // the midpoint was created, not dropped
      expect(dist(at(fig, 'O'), at(fig, 'C'))).toBeCloseTo(2.5, 2); // |OC| = 0.5·R = 2.5 (R auto-bound to 5)
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
  {
    id: 'point-is-meeting-of-line-with-circle',
    title: '"נקודה E היא מפגש של AO עם המעגל" — the NOUN/definitional form of line∩circle',
    guards:
      'the verb forms ("AO חותך/פוגש את המעגל בנקודה E") worked, but the definitional noun form failed → not-handled (escalated to the LLM). Two parser gaps: INTERSECT_KW lacked the noun "מפגש"/"meeting", and `crossingAfterCircle` only finds a point named AFTER the circle, while here E is declared FIRST. Fix: lineMeetsCircle accepts the noun keyword and `leadingNamedPoint` reads the point ahead of the construction.',
    steps: [
      'מעגל O שרדיוסו R', // a circle centred at O
      'נקודה A על המעגל', // A on the circle ⇒ AO is a radius
      'נקודה E היא מפגש של AO עם המעגל', // E = where line AO meets the circle again (the antipode)
    ],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['O', 'A', 'E']) expect(fig.positions.has(id), `point ${id}`).toBe(true);
      const O = at(fig, 'O'), A = at(fig, 'A'), E = at(fig, 'E');
      expect(dist(O, E)).toBeCloseTo(dist(O, A), 3); // A and E both on the circle (equal radii)
      expect(dist(A, E)).toBeGreaterThan(1e-6); // E is a DISTINCT crossing, not A again
      // A, O, E are collinear — E lies on the line AO.
      const sin = Math.abs((O.x - A.x) * (E.y - A.y) - (O.y - A.y) * (E.x - A.x)) / (dist(A, O) * dist(A, E));
      expect(sin).toBeLessThan(1e-3);
    },
  },
  {
    id: 'sqrt-times-free-radius',
    title: '"AB=√2R" + "BO=R" on a FREE-radius circle — couples the length to the radius DOF, not over-constrained',
    guards:
      'THREE stacked defects on the operator\'s tangent figure. (1) The parser dropped the trailing R in "√2R" (matched a bare √2 — the ADR-024/026 unanchored-rule class). (2) Lowering then froze R to the circle\'s default 5 even though "מעגל O" gives a FREE radius (ADR-051/052), turning "AB=√2R" into a FIXED distance that fought the free radius → seed-fragile over-constraint. (3) Even coupled as a ratio, the joint solver gave up from most seeds. Fix (ADR-071): a first-class `length-radius` constraint that drives the circle\'s radius DOF AND the witness on-circle angle (the tangent caps the radius, so a moderate radius + the right θ satisfies |AB|=√2R), making "BO=R" a structural tautology. Relation enforced, no over-constraint.',
    steps: [
      'מעגל O', // a FREE-radius circle (no stated size)
      'מנקודה A מחוץ למעגל מעבירים משיק לנקודה D',
      'B על המעגל',
      'AB',
      'AO',
      'BO',
      'DO',
      'AB=√2R',
      'BO=R',
    ],
    check(fig) {
      allStepsOk(fig); // no "over-constrained: |AB| = …·R cannot hold"
      const A = at(fig, 'A'), B = at(fig, 'B'), O = at(fig, 'O');
      const r = dist(O, B); // B is on the circle ⇒ |OB| is the radius
      expect(dist(A, B)).toBeCloseTo(Math.SQRT2 * r, 3); // |AB| = √2·R — the relation actually holds
      expect(fig.labels.lengths).toContainEqual({ a: 'A', b: 'B', text: '√2R' });
      expect(fig.labels.lengths).toContainEqual({ a: 'B', b: 'O', text: 'R' });
    },
  },
  {
    id: 'corner-tangent-on-existing-circle',
    title: '"AB ו AD משיקים למעגל O" where O already exists — tangency CONSTRAINT, not a fresh circle that re-radiuses O',
    guards:
      'operator session fn2wt71w (2026-06-24): kite ABCD, triangle BCD inscribed in circle O (the two-tangents-from-A figure), then "AB ו AD משיקים למעגל O". The hard "\'O\' is already defined" crash was a STALE dev server (the ADR-107 placement fix postdated the running server); on HEAD it stopped crashing but `cornerTangentCircle` still re-CONSTRUCTED a corner circle — a free centre on the angle bisector + a `circle-through` the foot — which RE-RADIUSED the existing circle O and kicked the inscribed B,C,D OFF it (verifier amber: "B should lie on circle O … but is 4.25 from centre"). Root cause: the rule never checked whether the named circle already exists. Fix (ADR-115): when circle O is already in context, emit a tangency CONSTRAINT per arm — each arm tangent at its tip (the on-circle touch point), radius O–tip ⟂ the arm (set-perpendicular) — instead of building a new circle. Mirrors tangentLine\'s existing-line branch (ADR-082) and ADR-099.',
    steps: [
      // The kite (explicit-equality suffix) escalates to the LLM; captured as the commands the log shows.
      { llm: [
        { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] },
        { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' },
        { type: 'set-equal', a: 'C', b: 'B', c: 'C', d: 'D' },
        { type: 'segment', a: 'A', b: 'B' },
        { type: 'segment', a: 'A', b: 'D' },
        { type: 'segment', a: 'B', b: 'C' },
        { type: 'segment', a: 'D', b: 'C' },
        { type: 'set-equal', a: 'B', b: 'C', c: 'D', d: 'C' },
      ] },
      'משולש BCD חסום במעגל O',
      'AB ו AD משיקים למעגל O',
    ],
    check(fig) {
      allStepsOk(fig); // no "'O' is already defined", no over-constraint
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // circle O still passes through ALL of B, C, D (not re-radiused to the tangent foot) — equal radii.
      const r = dist(O, B);
      expect(dist(O, C)).toBeCloseTo(r, 4);
      expect(dist(O, D)).toBeCloseTo(r, 4);
      // AB tangent at B and AD tangent at D: the radius is ⟂ the side (dot ≈ 0).
      const dot = (p: Vec, q: Vec, u: Vec, v: Vec) => (q.x - p.x) * (v.x - u.x) + (q.y - p.y) * (v.y - u.y);
      expect(Math.abs(dot(O, B, A, B)) / (r * dist(A, B))).toBeLessThan(1e-3);
      expect(Math.abs(dot(O, D, A, D)) / (r * dist(A, D))).toBeLessThan(1e-3);
    },
  },
  {
    id: 'kite-tangents-redundant-equality-not-over-constrained',
    title: '"דלתון ABCD" + "B,C,D on circle O" + "AB,AD tangent" no longer FALSELY over-constrains (ADR-139/140)',
    guards:
      'operator session 5anuc529: the figure errored "over-constrained: |AB| = |AD| cannot hold" at the tangent step. Two root causes, both fixed: (ADR-139) the recruiter\'s case (B) recruited a DECOY free DOF (the apex A) for the 2nd tangency `OD⟂AD`, which set `did` (skipping the redundant-lend case (E)) AND consumed A (defeating case (D)); the fix verifies a recruit before letting it skip the self-verifying redundancy cases. (ADR-140) `point-on-circle` on the constraint-DRIVEN vertex D dropped its `solve`, so the conversion rolled back and D never reached the circle; the fix preserves the `solve`. With both, the over-constraint is GONE and AB,AD are real tangents (B,D on the circle, radius ⟂ each side, |AB|=|AD|). KNOWN PARKED LIMITATION: the parser drops "B,C,D on circle O" membership (defect a) so C is not asserted on the circle here, and the fully-membership variant does not converge in the joint solver (defect d, 0/24 seeds) — see the 2026-06-28 session-log entry. This scenario locks the recruiter+conversion half (the over-constraint fix).',
    steps: ['ABCD דלתון', 'נקודות B C D על מעגל שמרכזו O', 'AB ו AD משיקים למעגל'],
    check(fig) {
      allStepsOk(fig); // the false "over-constrained: |AB| = |AD| cannot hold" is gone
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D');
      // AB and AD are genuine tangents: B,D on circle O (equal radii) and the radius ⟂ the side.
      expect(dist(O, D)).toBeCloseTo(dist(O, B), 3);
      const dot = (p: Vec, q: Vec, u: Vec, v: Vec) => (q.x - p.x) * (v.x - u.x) + (q.y - p.y) * (v.y - u.y);
      expect(Math.abs(dot(O, B, A, B)) / (dist(O, B) * dist(A, B))).toBeLessThan(1e-3);
      expect(Math.abs(dot(O, D, A, D)) / (dist(O, D) * dist(A, D))).toBeLessThan(1e-3);
      // the kite's redundant apex equality holds (two tangents from A are equal).
      expect(dist(A, D)).toBeCloseTo(dist(A, B), 3);
    },
  },
  {
    id: 'triangle-circumscribes-existing-circle',
    title: '"משולש DEF חוסם את המעגל O" where O already exists — incircle CONSTRAINT (sides tangent), not a fresh circle that re-radiuses O',
    guards:
      'audit sibling of corner-tangent-on-existing-circle (same root cause, different rule). Circle O is the circumcircle of an earlier triangle ABC; then "triangle DEF circumscribes circle O" made O the incircle of DEF. The `incircle` rule re-DERIVED the incentre (bisector∩bisector) + a `circle-through` the foot, RE-RADIUSING the existing O so A,B,C fell off it (verifier amber). Fix (ADR-115): when circle O already exists, emit a tangency CONSTRAINT — for each side, the FOOT of ⟂ from O onto it is forced ONTO the circle (distance(O,side)=radius ⇒ tangent); the triangle flexes around the fixed circle. Same existing-circle guard as the corner case.',
    steps: [
      'משולש ABC',
      'מעגל חוסם את משולש ABC',
      'משולש DEF חוסם את המעגל O',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      // O still passes through the ORIGINAL triangle's vertices (not re-radiused to DEF's inradius).
      const r = dist(O, A);
      expect(dist(O, B)).toBeCloseTo(r, 4);
      expect(dist(O, C)).toBeCloseTo(r, 4);
      // Each side of DEF is tangent to O: distance from O to the line equals the radius.
      const distToLine = (p: Vec, q: Vec) => {
        const L = dist(p, q);
        return Math.abs((q.x - p.x) * (p.y - O.y) - (p.x - O.x) * (q.y - p.y)) / L;
      };
      const D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F');
      for (const [p, q] of [[D, E], [E, F], [F, D]] as [Vec, Vec][]) expect(distToLine(p, q)).toBeCloseTo(r, 3);
    },
  },
  {
    id: 'arc-ratio-and-implicit-tangent-q4',
    title: 'bagrut Q4: "AB ו AD משיקים למעגל" (no name) + textbook "קשת DE = 2 קשת CE" — implicit-circle tangent makes NO spurious E, and the arc ratio holds',
    guards:
      'operator session 6ai22ulh (2026-06-24, bagrut Q4): two stacked gaps. (1) The textbook given is `⌢DE = 2⌢CE` (arc DE = 2·arc CE) but there was NO `קשת`/arc term, so it could not be entered. (2) Trying it as central angles, the student typed "AB ו AD משיקים למעגל" WITHOUT naming O; the ADR-115 fix only caught the NAMED circle, so this fell through to `cornerTangentCircle`\'s build-a-new-corner-circle path, which created spurious feet E, K + an auxiliary circle P — HIJACKING the label E, so the arc/angle constraint referenced a pinned tangent-foot E that "would not move". Fix: (a) ADR-116 — an `arcEquality` rule maps arc-measure ratios to the central-angle ratio (arc XY ≡ ∠XOY) → `set-angle-ratio`; (b) ADR-115 Am. — the existing-circle guard resolves the circle IMPLICITLY (named, or THE one circle), so the unnamed tangent constrains circle O and creates no points. With both, E is free for "המשך BO חותך את המעגל בנקודה E", and arc DE = 2·arc CE drives the figure (∠DOE = 2∠COE holds).',
    steps: [
      // The kite (דלתון, AB=AD) escalates to the LLM; captured as its decomposition.
      { llm: [
        { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] },
        { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' },
        { type: 'segment', a: 'A', b: 'B' },
        { type: 'segment', a: 'A', b: 'D' },
        { type: 'segment', a: 'B', b: 'C' },
        { type: 'segment', a: 'D', b: 'C' },
      ] },
      'משולש BCD חסום במעגל O',
      'AB ו AD משיקים למעגל', // NO name — must constrain the one circle, not spawn a corner circle
      'המשך BO חותך את המעגל בנקודה E',
      'קשת DE = 2 קשת CE', // textbook arc-measure given
    ],
    check(fig) {
      allStepsOk(fig);
      // The unnamed tangent created NO spurious points — only the figure's real labels exist.
      for (const id of ['K', 'P']) expect(fig.positions.has(id), `no spurious ${id}`).toBe(false);
      expect(fig.positions.has('E')).toBe(true); // E is the BO-extension crossing, not a tangent foot
      const O = at(fig, 'O'), B = at(fig, 'B'), D = at(fig, 'D');
      // circle O still passes through its members (the tangent is a constraint, not a rebuild).
      const r = dist(O, B);
      expect(dist(O, D)).toBeCloseTo(r, 4);
      expect(dist(O, at(fig, 'C'))).toBeCloseTo(r, 4);
      expect(dist(O, at(fig, 'E'))).toBeCloseTo(r, 4); // E on the circle
      // arc DE = 2·arc CE  ⇔  central ∠DOE = 2·∠COE.
      const ang = (a: Vec, o: Vec, b: Vec) => angle(a, o, b);
      const E = at(fig, 'E'), C = at(fig, 'C');
      expect(ang(D, O, E)).toBeCloseTo(2 * ang(C, O, E), 1);
    },
  },
  {
    id: 'equilateral-triangle-inscribed',
    title: '"ABC משולש שווה צלעות חסום במעגל" — the equilateral qualifier is applied to an inscribed triangle, not silently dropped',
    guards:
      'operator session dhhj7wo3 (2026-06-24): "ABC משולש שווה צלעות חסום במעגל" (equilateral triangle inscribed in a circle) built a GENERIC inscribed triangle — `inscribedPolygon` detects quad shapes (square/rhombus/…) via `kind` but ignored the triangle shape word, and "שווה צלעות" is not a SHAPE_LEFTOVER token so it neither constrained nor escalated — it was silently dropped (the triangle was not equilateral). Fix (ADR-117): `inscribedPolygon` detects equilateral/isosceles and appends the equal-side constraints the standalone macros (ADR-110) emit, so the inscribed triangle flexes into shape.',
    steps: ['ABC משולש שווה צלעות חסום במעגל'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      // all three sides equal (equilateral) and the vertices lie on a circle.
      expect(dist(A, B)).toBeCloseTo(dist(B, C), 3);
      expect(dist(B, C)).toBeCloseTo(dist(C, A), 3);
      expect([...fig.positions.keys()]).toContain('O'); // the circumscribing circle's centre exists
    },
  },
  {
    id: 'area-absolute-sets-scale-not-shape',
    title: 'area given (ADR-118): "שטח המשולש ABC הוא 13" on an equilateral inscribed triangle sets the SIZE, keeps the shape',
    guards:
      'area support (ADR-118). A LONE absolute area pins the figure\'s SCALE (the similarity gauge), not its shape — an equilateral triangle stays equilateral, just resized so its area is 13. Verifies the area holds (shoelace) and the on-figure label is emitted.',
    steps: ['ABC משולש שווה צלעות חסום במעגל', 'שטח המשולש ABC הוא 13'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      // still equilateral (shape preserved) …
      expect(dist(A, B)).toBeCloseTo(dist(B, C), 3);
      expect(dist(B, C)).toBeCloseTo(dist(C, A), 3);
      // … and its area is exactly 13 (shoelace via the equilateral formula).
      const s = dist(A, B);
      expect((Math.sqrt(3) / 4) * s * s).toBeCloseTo(13, 2);
      expect(fig.labels.areas).toContainEqual({ ids: ['A', 'B', 'C'], text: '13' });
    },
  },
  {
    id: 'area-ratio-reshapes',
    title: 'area ratio (ADR-118): "שטח המשולש ABF גדול פי 2 משטח המשולש BFE" makes area(ABF) = 2·area(BFE)',
    guards:
      'area RATIO support (ADR-118) — the natural-language "גדול פי 2 מ" (2× larger) form from the bagrut corpus. A dimensionless area ratio drives a shape DOF until area(ABF) = 2·area(BFE) holds; the verifier re-derives it.',
    steps: ['משולש ABF', 'משולש BFE', 'שטח המשולש ABF גדול פי 2 משטח המשולש BFE'],
    check(fig) {
      allStepsOk(fig);
      const areaT = (x: Id, y: Id, z: Id) => {
        const p = at(fig, x), q = at(fig, y), r = at(fig, z);
        return Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2;
      };
      expect(areaT('A', 'B', 'F')).toBeCloseTo(2 * areaT('B', 'F', 'E'), 2);
    },
  },
];

describe('reported scenarios — end-to-end replay of real bug reports', () => {
  for (const sc of SCENARIOS) {
    it(`[${sc.id}] ${sc.title}`, () => {
      const fig = run(sc.steps);
      sc.check(fig);
      // Every scenario must also SATISFY ITS STATED GIVENS (the ADR-053 verifier, now comprehensive):
      // a green figure that silently violates a distance/angle/∥/⟂/collinear/on-circle relation is a bug.
      if (!sc.expectViolations) {
        expect(fig.violations, `givens not satisfied: ${JSON.stringify(fig.violations.map((v) => v.message))}`).toEqual([]);
      }
    });
  }
});

/**
 * App.submit-faithful regression — the SCENARIOS above use parse→replay, which does NOT exercise the
 * input gate (droppedNewLabels → dryRunOutcome → commit-or-escalate). A constraint that can't solve at its
 * position dry-run-errors, and the gate used to ESCALATE it to the LLM (dropping it) instead of committing
 * it for deferral — so the operator's "CE⟂AB before the sizes" never even entered the fact list. This test
 * mirrors App.submit exactly (ADR-104) to lock that such a constraint is COMMITTED and later resolved.
 */
describe('reported scenarios — App.submit gate commits a deferrable constraint (ADR-104)', () => {
  it('[q4-commit-deferred-perpendicular] CE⟂AB typed before CD=36/DE=18 commits and resolves through the real submit gate', () => {
    const st = useGeoStore.getState();
    st.clear();
    // Mirror App.submit's deterministic path for each utterance.
    const submit = (utterance: string, llm?: AnyCommand[]) => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      let commands: AnyCommand[] | null = null;
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) commands = r.commands;
      }
      if (!commands) commands = llm ?? null; // LLM second attempt (mocked: pass the canonical commands)
      expect(commands, `step did not commit: ${utterance}`).not.toBeNull();
      const group = `g${utterance}`;
      for (const c of commands!) useGeoStore.getState().execute(c, utterance, group);
    };
    submit('שני מעגלים נחתכים בנקודות A ו B'); // (deterministic two-circles)
    submit('נקודה C על מעגל P');
    submit('המשך CA חותך את מעגל O בנקודה D');
    submit('המשך CB חותך את מעגל O בנקודה E');
    submit('נקודה G על המשך DE');
    submit('CG חותך את מעגל P בנקודה F');
    submit('AF ו BC נחתכים בנקודה H');
    submit('∠GEC = ∠CHA');
    submit('CE⊥AB'); // ← the step that used to escalate-and-drop; now commits for deferral
    submit('CD=36');
    submit('DE=18');
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.lastError).toBeNull();
    const C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), A = at(fig, 'A'), B = at(fig, 'B');
    expect(dist(C, D)).toBeCloseTo(36, 0);
    expect(dist(D, E)).toBeCloseTo(18, 0);
    const dot = (E.x - C.x) * (B.x - A.x) + (E.y - C.y) * (B.y - A.y);
    expect(Math.abs(dot) / (Math.hypot(E.x - C.x, E.y - C.y) * Math.hypot(B.x - A.x, B.y - A.y))).toBeLessThan(0.02);
    st.clear();
  });

  it('[re-entry-noop-message] re-typing an existing construct is a friendly no-op, not an escalation (ADR-156)', () => {
    const st = useGeoStore.getState();
    st.clear();
    // Mirror App.submit's classification of the deterministic path: commit | noop ("already drawn") | escalate.
    const classify = (utterance: string): { kind: 'commit' | 'noop' | 'escalate'; commands?: AnyCommand[] } => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) return { kind: 'commit', commands: r.commands };
        if (outcome.reason === 'empty') {
          const existing = new Set((ctx.points ?? []).map((p) => p.toUpperCase()));
          const newLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])].filter((l) => !existing.has(l));
          if (newLabels.length === 0) return { kind: 'noop' };
        }
      }
      return { kind: 'escalate' };
    };
    const commit = (u: string) => {
      const res = classify(u);
      expect(res.kind, `first ${u}`).toBe('commit');
      res.commands!.forEach((c) => useGeoStore.getState().execute(c, u, 'g-' + u));
    };
    // re-typing a shape → no-op (not escalate)
    commit('square ABCD');
    expect(classify('square ABCD').kind, 're-typed square is a no-op').toBe('noop');
    // re-inscribing points already on a circle → no-op (no duplicate, no escalate)
    st.clear();
    commit('מרובע ABCD חסום במעגל');
    expect(classify('מרובע ABCD חסום במעגל').kind, 're-inscribe is a no-op').toBe('noop');
    // a genuinely NEW construct still commits (the no-op gate doesn't swallow real work)
    expect(classify('E על AB').kind, 'a new point still commits').toBe('commit');
    st.clear();
  });

  it('[shape-cannot-morph-into-another] a trapezoid cannot be turned into a square/rectangle/rhombus/parallelogram (ADR-157)', () => {
    // PRINCIPLE: a named shape is immutable once drawn — re-declaring its vertices as a different, incompatible
    // shape is a CONTRADICTION and is refused (not silently morphed). We deliberately have no "morph" capability.
    const st = useGeoStore.getState();
    for (const target of ['square ABCD', 'rectangle ABCD', 'rhombus ABCD', 'parallelogram ABCD']) {
      st.clear();
      const base = parse('trapezoid ABCD', ctxOf(useGeoStore.getState().facts));
      expect(base.ok).toBe(true);
      if (base.ok) base.commands.forEach((c) => useGeoStore.getState().execute(c, 'trapezoid ABCD', 'g'));
      const facts = useGeoStore.getState().facts;
      const r = parse(target, ctxOf(facts));
      expect(r.ok, `${target} parses`).toBe(true);
      if (r.ok) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        // refused as a contradiction — NOT produced (no silent morph), and a deferrable constraint must not sneak it in
        expect(outcome.produced, `${target} must NOT reshape the trapezoid`).toBe(false);
        if (!outcome.produced) expect(outcome.reason === 'error' && !hasDeferrableConstraint(r.commands), `${target} is a hard conflict`).toBe(true);
      }
    }
    st.clear();
  });

  it('[contradiction-message] making an existing trapezoid a square reports a CONFLICT, not "produced nothing" (ADR-156)', () => {
    const st = useGeoStore.getState();
    st.clear();
    // Mirror App.submit: a cleanly-parsed command that dry-run ERRORS (non-deferrable) is a contradiction with
    // the figure → a SPECIFIC humanizable reason, NOT an escalation to the generic "produced nothing".
    const classify = (utterance: string): { kind: 'commit' | 'conflict' | 'noop' | 'escalate'; detail?: string } => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) return { kind: 'commit' };
        if (outcome.reason === 'error') return { kind: 'conflict', detail: outcome.detail };
        if (outcome.reason === 'empty') return { kind: 'noop' };
      }
      return { kind: 'escalate' };
    };
    const tr = parse('טרפז ABCD', ctxOf(useGeoStore.getState().facts));
    expect(tr.ok).toBe(true);
    if (tr.ok) tr.commands.forEach((c) => useGeoStore.getState().execute(c, 'טרפז ABCD', 'g1'));
    const res = classify('ריבוע ABCD'); // ask the trapezoid to become a square — impossible with the current data
    expect(res.kind, 'a contradiction, not escalate-to-produced-nothing').toBe('conflict');
    expect(res.detail, 'a specific reason is surfaced (humanized in the UI)').toBeTruthy();
    expect(humanizeError(res.detail!, (k: string) => k), 'the reason maps to a clear error message').not.toBe(res.detail);
    st.clear();
  });

  it('[pending-vs-contradiction] CE⟂AB before sizes is PENDING (info, no red error); ∠DAB=37 on a square is a hard contradiction', () => {
    // PENDING: the Q4 ⟂ entered before the sizes flexes as the free DOFs move → it's "not determined yet",
    // shown as an info banner, NOT the red "over-constrained" error (ADR-104). It resolves once sizes come.
    const q4: AnyCommand[] = [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
      { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
      { type: 'extend-onto-circle', id: 'E', a: 'C', b: 'B', circle: 'circle-O' },
      { type: 'point-on-segment', id: 'G', a: 'D', b: 'E', t: 1.3, extension: true },
      { type: 'line-through', id: 'chord-CG', a: 'C', b: 'G' },
      { type: 'line-circle-intersection', id: 'F', line: 'chord-CG', circle: 'circle-P', avoid: 'C' },
      { type: 'line-line-intersection', id: 'H', a: 'A', b: 'F', c: 'B', d: 'C' },
      { type: 'set-angle-ratio', v1: 'E', a1: 'G', b1: 'C', v2: 'H', a2: 'C', b2: 'A', k: 1 },
      { type: 'set-perpendicular', a: 'C', b: 'E', c: 'A', d: 'B' },
    ] as AnyCommand[];
    const fq = replay(q4.map((cmd, i) => ({ id: 'p' + i, group: 'g' + i, enabled: true, utterance: '', cmd } as Fact)));
    expect(fq.pending, 'CE⟂AB before sizes is pending').toBe(true);
    expect(fq.lastError, 'no red error while pending').toBeNull();
    // CONTRADICTION: ∠DAB on a square is structurally 90°, so "= 37" can never hold — a hard error, NOT pending.
    const sq: AnyCommand[] = [
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'B', value: 37 },
    ] as AnyCommand[];
    const fs = replay(sq.map((cmd, i) => ({ id: 's' + i, group: 'g' + i, enabled: true, utterance: '', cmd } as Fact)));
    expect(fs.pending, '∠DAB=37 on a square is NOT pending (rigid contradiction)').toBe(false);
    expect(fs.lastError, 'it surfaces as a hard error').toMatch(/over-constrained/i);
  });
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

  it('[constrained-inscribed-quad-resample] the constrained cyclic quad offers DIFFERENT convex drawings', () => {
    // Same figure as the seed-0 scenario. The operator saw "5 DOF" but "show another configuration"
    // said impossible — because the quad's vertices were pinned, leaving only similarity DOF. With the
    // vertices freed (ADR-097), resampling must find a genuinely different drawing, each still CONVEX
    // and satisfying AE=2CE / AD=CE.
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['מרובע BCED חסום במעגל', 'המשך BD והמשך CE נפגשים שנקודה A', 'AE=2CE', 'AD=CE']) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    let found = 0;
    for (let press = 0; press < 8; press++) {
      if (!st.resample()) continue; // resample found another view
      found++;
      const seed = useGeoStore.getState().seed;
      const fig = replay(useGeoStore.getState().facts, seed);
      expect(polygonsConvex(useGeoStore.getState().facts, fig.positions), `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(fig, 'A'), at(fig, 'E'))).toBeCloseTo(2 * dist(at(fig, 'C'), at(fig, 'E')), 2);
      expect(dist(at(fig, 'A'), at(fig, 'D'))).toBeCloseTo(dist(at(fig, 'C'), at(fig, 'E')), 2);
    }
    expect(found, '"show another configuration" found at least one different convex drawing').toBeGreaterThan(0);
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

  it('[two-circles-show-another] "שני מעגלים נחתכים" — "show another" resamples, never collides A onto B', () => {
    // Operator report: two intersecting circles, then "show another configuration" — sometimes an
    // error about point B, sometimes not. Root cause: A and B are the SAME circle∩circle at branches
    // 0 and 1, both already drawn; the button cycled A's branch onto B's (n=2, 0→1), making A≡B and
    // failing the second crossing. `cyclableBranch` now reports NO unshown branch, so the button only
    // resamples the circle centres — A and B stay two distinct, valid crossings on every press.
    const st = useGeoStore.getState();
    st.clear();
    const u = 'שני מעגלים נחתכים בנקודות A ו- B';
    const r = parse(u, ctxOf(useGeoStore.getState().facts));
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    for (const cmd of r.commands) st.execute(cmd, u);

    const base = replay(useGeoStore.getState().facts).construction;
    // The button must NOT find a cyclable branch here (both crossings already on screen).
    const branchId = firstCyclableBranch(base);
    expect(branchId).toBeUndefined();

    for (let press = 0; press < 12; press++) {
      // Mirror the App's "show another configuration": resample, then cycle only a cyclable branch.
      st.resample();
      const seed = useGeoStore.getState().seed;
      const fig = replay(useGeoStore.getState().facts, seed);
      const bid = firstCyclableBranch(fig.construction);
      if (bid) st.cycleAlt(bid);
      const after = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
      expect(evaluate(after.construction).ok, `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(after, 'A'), at(after, 'B')), `press ${press + 1}`).toBeGreaterThan(0.1); // A,B stay distinct
    }
    st.clear();
  });

  it('[free-on-circle-extensions-auto-advance] the store auto-advances the seed so both "המשך" extensions reach the far side', () => {
    // The operator's exact sequence (session n19qmb3t) through the REAL store path (execute), which the
    // run()/replay scenario above can't exercise: C is a FREE point on circle P, so at the default seed
    // its placement can leave "המשך CB" with no crossing beyond B (E lands between C and B). The store's
    // execute now AUTO-ADVANCES the seed to the first configuration where BOTH extensions reach the far
    // side cleanly — the student sees a valid default, never the wrong-side figure (ADR-098).
    const st = useGeoStore.getState();
    st.clear();
    const steps = [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את מעגל O בנקודה E',
    ];
    for (const u of steps) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(fig.violations, `givens not satisfied: ${JSON.stringify(fig.violations.map((v) => v.message))}`).toEqual([]);
    const beyond = (a: Vec, b: Vec, id: Vec) => (id.x - b.x) * (b.x - a.x) + (id.y - b.y) * (b.y - a.y) > 0;
    expect(beyond(at(fig, 'C'), at(fig, 'A'), at(fig, 'D')), 'D beyond A (המשך CA)').toBe(true);
    expect(beyond(at(fig, 'C'), at(fig, 'B'), at(fig, 'E')), 'E beyond B (המשך CB)').toBe(true);
    st.clear();
  });

  it('[two-circles-secant-web] two secants from existing points stay valid across every "other view"', () => {
    // Operator's book figure: two circles meet at A,B; C on the right circle; secant AC cuts the LEFT
    // circle at D; secant CB cuts the LEFT circle at E. The LLM decomposed each secant as "from X a line
    // cuts circle O at Y and Z". The OLD behaviour: (1) re-placed the existing Y onto circle O (pinning a
    // point to BOTH circles, so it collapsed to the intersection), and (2) used a fixed branch index whose
    // root order flips under resampling, so D/E intermittently collapsed onto A/B ("would be at the same
    // point"). Now: an existing crossing is a direction point (never re-placed on the circle), and the new
    // crossing is the root that does NOT coincide with a placed point — so it holds on EVERY view.
    const st = useGeoStore.getState();
    st.clear();
    // Steps 2–5 are the LLM canonical lines the log recorded (re-parsed with context, as llmParse does).
    const steps = [
      'שני מעגלים נחתכים בנקודות A ו- B',
      'C על מעגל P',
      'מנקודה A ישר חותך את המעגל O בנקודות C ו-D',
      'segment CD', // LLM canonical for the operator's "CD"
      'מנקודה C ישר חותך את המעגל O בנקודות B ו-E',
    ];
    for (const u of steps) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    const radius = (fig: Derived, center: Id) =>
      (fig.construction.objects.find((o) => o.kind === 'circle' && (o as { center: Id }).center === center) as { radius: { value: number } }).radius.value;

    // Canonical view + 8 resampled "other views" all stay structurally correct.
    for (let press = 0; press <= 8; press++) {
      if (press > 0) st.resample();
      const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
      expect(evaluate(fig.construction).ok, `view ${press}`).toBe(true);
      // C stays on the RIGHT circle P only — never pinned onto circle O.
      expect(dist(at(fig, 'P'), at(fig, 'C')), `view ${press}: C on P`).toBeCloseTo(radius(fig, 'P'), 2);
      expect(dist(at(fig, 'O'), at(fig, 'C')), `view ${press}: C off O`).not.toBeCloseTo(radius(fig, 'O'), 1);
      // D and E are genuine second crossings of the secants with the LEFT circle O — on it, and distinct from A/B.
      for (const p of ['D', 'E'] as const) {
        expect(dist(at(fig, 'O'), at(fig, p)), `view ${press}: ${p} on O`).toBeCloseTo(radius(fig, 'O'), 2);
        expect(dist(at(fig, p), at(fig, 'A')), `view ${press}: ${p}≠A`).toBeGreaterThan(0.1);
        expect(dist(at(fig, p), at(fig, 'B')), `view ${press}: ${p}≠B`).toBeGreaterThan(0.1);
      }
    }
    st.clear();
  });

  it('[sqrt-times-free-radius-allseeds] "AB=√2R" on a free-radius tangent figure holds on EVERY view (ADR-071)', () => {
    // The over-constraint was SEED-DEPENDENT (the seed-0 scenario above can't catch that): the radius
    // root the relation wants is capped by the tangent (A must stay OUTSIDE the circle), so only a
    // radius + on-circle-angle solve satisfies it. Replay the operator's exact sequence across seeds.
    const steps = ['מעגל O', 'מנקודה A מחוץ למעגל מעבירים משיק לנקודה D', 'B על המעגל', 'AB', 'AO', 'BO', 'DO', 'AB=√2R', 'BO=R'];
    const facts: Fact[] = [];
    let g = 0;
    for (const u of steps) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const group = `g${g++}`;
      for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    }
    for (let seed = 0; seed <= 8; seed++) {
      const fig = replay(facts, seed);
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      const r = dist(at(fig, 'O'), at(fig, 'B')); // |OB| = the (free) radius
      expect(dist(at(fig, 'A'), at(fig, 'B')), `seed ${seed}: |AB| = √2·R`).toBeCloseTo(Math.SQRT2 * r, 2);
    }
  });
});
