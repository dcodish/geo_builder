/**
 * Scenario corpus CHUNK 4/4 (S4.1b of docs/24 — the 6,253-line single file split to kill the
 * append-at-head merge hotspot; docs/23 §derived-layers finding). APPEND NEW SCENARIOS TO THE LAST
 * CHUNK (start a new chunk when it passes ~80 objects). The aggregator `scenarios-corpus.ts`
 * concatenates every chunk — shards/props files keep importing SCENARIOS from there unchanged.
 */
/**
 * The scenario CORPUS + harness (issue #60 / ADR-280): every operator-reported bug sequence, replayed
 * end-to-end through the real parse-with-context → fact list → replay path. Moved here — a plain module,
 * NOT a test file — from scenarios.test.ts, so the runner files can shard the corpus across vitest's
 * per-file workers (the one 940 s sequential file used to bound the whole suite's wall clock, issue #60).
 *
 * ADD NEW SCENARIOS TO `SCENARIOS` BELOW (newest first, as before); every scenarios-e2e-*.test.ts slice
 * picks them up automatically (membership is index % N — no per-file registration), and the doc-parity
 * guard in scenarios.test.ts still enforces the docs/test-scenarios.md index. The standing rule
 * ("reported bugs become regression scenarios") is unchanged — only the file layout moved.
 */
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
 * context) or an LLM step. The LLM is mocked in tests, so an out-of-grammar step is captured from the log
 * in one of two forms:
 *   - `{ llm: ['canonical line', …] }` — the canonical command STRINGS the LLM emitted, RE-PARSED with the
 *     live figure context exactly as `llmParse` does (TST-3). PREFERRED: a parser change that breaks a
 *     canonical form is then caught, not masked by pre-baked commands.
 *   - `{ llm: [...commands] }` — pre-parsed engine commands (legacy; kept for steps whose canonical form
 *     has no clean deterministic re-parse).
 * A string step (or a canonical LLM line) that fails to parse FAILS the scenario (it would have escalated).
 */

import { expect } from 'vitest';
import { isGeoPoint, freeDofCount, detectRelations, detectShapes } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';

import type { Scenario } from './scenarios-harness';
import { at, dist, angle, allStepsOk, convexQuad } from './scenarios-harness';

export const SCENARIOS_4: Scenario[] = [
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
      // operator typo "נחכתכים" → LLM normalized to the canonical spelling (re-parsed, TST-3)
      { llm: ['AE ו-BD נחתכים בנקודה P'] },
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
      { llm: ['AC'] }, // "AC" (LLM canonical → bareSegment; re-parsed, TST-3)
      { llm: ['BD'] }, // "BD"
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
      const O = fig.construction.objects.find((o) => o.kind === 'circle' && ['O', '@ctr-O'].includes((o as { center: Id }).center)) as { radius: { value: number } }; // anon centre (ADR-342)
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
      { llm: ['ישר AB'] }, // "ישר AB" (escalated in the log; re-parsed, TST-3)
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
      { llm: ['ישר AB'] }, // "ישר AB"
      { llm: ['ישר CD'] }, // "ישר CD"
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
      { llm: ['AB'] }, // "AB"
      { llm: ['CD'] }, // "CD"
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
      { llm: ['ישר AB'] }, // "ישר AB" (escalated in the log; re-parsed, TST-3)
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
      expect([...fig.positions.keys()]).toContain('@ctr-O'); // the circumscribing circle's centre exists (anonymous, ADR-342)
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
  {
    id: 'emergent-parallelogram-between-segments',
    title: 'detect shapes (FR-SH / ADR-162): a parallelogram formed BETWEEN segments (no polygon object) is detected',
    guards:
      'operator-reported (debug log session 177a8cfc, 2026-06-30): after "טרפז ABCD חסום במעגל" + "E על AB" + "ED מקביל ל BC", the figure contains a parallelogram EBCD (sides EB=part of AB, BC, CD, DE) but it was NOT badged, because the shape detector classified only DECLARED polygon objects. Root fix (ADR-162): a shared IMPLICIT edge universe (drawn segments + polygon edges + on-host splits + visible-line edges) feeds emergent triangle/quad cycle detection, so a shape that exists on the page without a polygon object is found. Also surfaces the genuine isosceles triangle ADE (since EBCD ∥-gram ⇒ DE=BC and the iso-trapezoid ⇒ AD=BC ⇒ AD=DE).',
    steps: ['טרפז ABCD חסום במעגל', 'E על AB', 'ED מקביל ל BC'],
    check(fig) {
      allStepsOk(fig);
      const keys = detectShapes(fig.construction).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);
      expect(keys, 'emergent parallelogram BCDE detected').toContain('parallelogram:BCDE');
      expect(keys, 'the declared inscribed trapezoid still classifies').toContain('isosceles-trapezoid:ABCD');
    },
  },
  {
    id: 'right-triangle-explicit-angle-reseats-right-vertex',
    title: 'right triangle (ADR-052 / ADR-114 pattern): an explicit "∠ABC = 90" re-seats the right angle onto B',
    guards:
      'operator-reported (2026-06-30): "ABC משולש ישר זוית" pins the right angle at the LAST vertex C (B is built ⟂ at C), so a following "זווית ABC = 90" was refused "over-constrained: ∠ABC = 90° cannot hold". But WHICH vertex carries the right angle is UNSTATED (ADR-052), so the default must yield to the stated angle (same shape as the ADR-114 soft equal-pair). Root fix: a store pre-scan reorders the right-triangle ids so an explicitly-90° vertex becomes the structural right-angle vertex; the explicit angle then holds as a passing check.',
    steps: ['ABC משולש ישר זוית', 'זווית ABC = 90'],
    check(fig) {
      allStepsOk(fig);
      expect(angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C')), '∠ABC is now the right angle').toBeCloseTo(90, 3);
      // The right-angle KNEE is drawn at the reseated vertex B only — NOT a leftover knee at the original
      // last vertex C (where the angle is now acute). Regression for the "weird image" (two knees) report.
      const knees = fig.angleMarks.filter((m) => m.right);
      expect(knees.length, 'exactly one right-angle knee').toBe(1);
      expect(knees[0].vertex, 'the knee is at the reseated right-angle vertex B').toBe('B');
    },
  },
  {
    id: 'trapezoid-constraint-morph-flags-amber',
    title: 'right trapezoid + "∠ABC = 90" reshapes to a rectangle — allowed but flagged amber (ADR-165)',
    guards:
      'operator-reported (2026-06-30): "טרפז ישר זווית ABCD" (angles 90/63/117/90) then "זווית ABC = 90" silently morphed the trapezoid into a rectangle (90/90/90/90). A constraint forced the legs parallel, so the declared trapezoid is no longer one. Per the operator (allow-but-flag): the figure is geometrically valid so it is NOT refused (ADR-157 only guards re-declaring a different shape WORD), but the givens verifier now flags it amber — a declared trapezoid whose both opposite-side pairs became parallel raises figure.v.trapezoidMorph.',
    steps: ['טרפז ישר זווית ABCD', 'זווית ABC = 90'],
    expectViolations: true,
    check(fig) {
      allStepsOk(fig); // the steps APPLY cleanly — the morph is surfaced as a verifier violation, not a step error
      expect(fig.violations.map((v) => v.messageKey)).toContain('figure.v.trapezoidMorph');
    },
  },
  {
    id: 'single-vertex-angle-on-triangle-vertex',
    title: 'single-vertex angle (ADR-164): "זווית B = 90" resolves its arms when B has exactly two edges',
    guards:
      'feature (2026-06-30): a student naming an angle by ONE vertex ("∠B = 90") instead of three. The parser now resolves the arms from the figure when the vertex has exactly two edges (one possible angle) — here B in triangle ABC joins A and C — so ∠ABC is set to 90° without spelling all three letters. (When the vertex has >2 edges the parser instead returns an "ambiguous-angle" clarification asking for three letters — covered by parser/__tests__/single-vertex-angle.test.ts.)',
    steps: ['משולש ABC', 'זווית B = 90'],
    check(fig) {
      allStepsOk(fig);
      expect(angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C')), '∠ABC = 90° from the single-vertex form').toBeCloseTo(90, 3);
    },
  },
  {
    id: 'circle-circumference-sizes-radius',
    title: 'circle by circumference + O_1 subscript (ADR-228): "מעגל O_1 שהיקפו 6π"',
    guards:
      'operator-reported (2026-07-05): "מעגל O_1 שהיקפו 6π" showed the centre as "O" (the "_1" was dropped — a point token is a letter + GLUED digits, so the underscore truncated the label) and did NOT set the radius (circumference was unhandled — it fell through to the LLM which drew a default-radius circle). Fix A: normalizePointSubscript rewrites O_1 → O1 for every label. Fix B: a circle sized by its circumference/area lowers to a NUMERIC radius (circumference 6π ⇒ r = C/2π = 3), reusing the fixed-radius path.',
    steps: ['מעגל O_1 שהיקפו 6π'],
    check(fig) {
      allStepsOk(fig);
      const circ = fig.construction.objects.find((o) => o.kind === 'circle') as { center: Id; radius: { via: string; value?: number } } | undefined;
      expect(circ?.center, 'the subscript O_1 is preserved as O1').toBe('O1');
      expect(circ?.radius.via, 'circumference lowers to a fixed numeric radius').toBe('length');
      expect(circ?.radius.value, 'circumference 6π ⇒ radius 3').toBeCloseTo(3, 6);
    },
  },
  {
    id: 'tangent-circles-named-then-circumference',
    title: 'two named tangent circles + circumference on one (ADR-228 Am.): "שני מעגלים O1 ו O2 משיקים מבחוץ" + "היקף מעגל O1 הוא 6pi"',
    guards:
      'operator-reported (2026-07-05): building two externally-tangent circles named O1/O2, then "היקף מעגל O1 הוא 6pi" was refused. Three root causes: (1) the tangent-circles rule read names via a per-circle "מעגל X" regex, which the PLURAL "מעגלים O1 ו O2" broke (the "ים" suffix stops the מעגל-then-space adjacency) — so O1/O2 were dropped and O/P INVENTED, meaning circle O1 never existed to reference; (2) circumference on an EXISTING circle fell to the circle CREATION rule, which re-emitted a circle command that addObj ignores (dropping the size) — it now emits set-radius; (3) "6pi" (the word) was read as plain 6, not 6π. With all three: the circles keep the names O1/O2 and O1 flexes to radius 3 (6π/2π), the pair staying externally tangent (O2 absorbs it).',
    steps: ['שני מעגלים O1 ו O2 משיקים מבחוץ', 'היקף מעגל O1 הוא 6pi'],
    check(fig) {
      allStepsOk(fig);
      const centers = fig.construction.objects.filter((o) => o.kind === 'circle').map((o) => (o as { center: Id }).center).sort();
      expect(centers, 'circles keep the stated names O1, O2').toEqual(['O1', 'O2']);
      // Radii read from the engine's PUBLISHED resolved-circle map (what the renderer draws — the stored
      // construction keeps the pre-solve seed).
      const o1 = fig.circles.get('circle-O1');
      expect(o1?.r, 'O1 radius = circumference/2π = 3').toBeCloseTo(3, 4);
      const cs = [...fig.circles.values()];
      expect(cs.length).toBe(2);
      expect(dist(cs[0].center, cs[1].center), 'externally tangent: |O1O2| = r1 + r2').toBeCloseTo(cs[0].r + cs[1].r, 2);
      // The DOF cue reads the true shape freedom: 1 (O2's size), not "✓ fully determined" (ADR-228 Am.2).
      expect(freeDofCount(fig.construction), 'one shape DOF remains (O2 radius)').toBe(1);
    },
  },
  {
    id: 'tangent-circles-both-radii-pinned-by-size',
    title: 'both tangent-circle radii pinned by circumference AND area (ADR-228 Am.3): "…משיקים מבחוץ" + "היקף מעגל O1 = 6π" + "שטח O2 = 81π"',
    guards:
      'operator-reported (2026-07-05): after two tangent circles + "היקף מעגל O1 הוא 6π" (O1→r3), giving "שטח O2 הוא 81π" (O2→r9, area √(A/π)) over-constrained with "M/E coincides with ~touch-M cannot hold" — which also read as "an error when changing M to E" (the rename made the message say E). Root cause: the free-radius tangency is a coincide driven by whichever radius is FREE; pinning the SECOND radius left the coincide with no carrier though a free CENTRE can still satisfy |O1O2|=r1+r2. Fix (ADR-228 Am.3): set-radius, on pinning a radius that drove a tangency, recruits a free centre when no free radius remains. Also: "שטח O2" (bare, no "מעגל") now resolves the known circle. Both radii pinned, figure stays externally tangent, no error.',
    steps: ['שני מעגלים O1 ו O2 משיקים מבחוץ', 'היקף מעגל O1 הוא 6π', 'שטח O2 הוא 81π'],
    check(fig) {
      allStepsOk(fig);
      const r = (c: string) => fig.circles.get(c)?.r;
      expect(r('circle-O1'), 'O1 radius = circumference/2π = 3').toBeCloseTo(3, 4);
      expect(r('circle-O2'), 'O2 radius = √(area/π) = √81 = 9').toBeCloseTo(9, 4);
      const cs = [...fig.circles.values()];
      expect(dist(cs[0].center, cs[1].center), 'stays externally tangent: |O1O2| = 3 + 9 = 12').toBeCloseTo(12, 3);
    },
  },
  {
    id: 'line-through-both-centres-avoids-tangency-point',
    title: 'a line through two on-circle points crossing both centres does NOT collapse them onto the tangency point (ADR-228 Am.4)',
    guards:
      'operator-reported (2026-07-05): two tangent circles (touch point E), A on O1, B on O2, then "AB עובר דרך מרכזי המעגלים" (AB passes through both centres) placed A AND B onto E — E is on the centre line AND on both circles, so the plain reading collapses them there (no warning). The utterance did not parse deterministically (escalated to the LLM, whose output collapsed them). Fix (ADR-228 Am.4): a new rule parses it to an ORDERED set-line [A, centreOfA, centreOfB, B] — each endpoint at the FAR intersection of the centre line with its own circle — so A and B come out DISTINCT at the diameter ends (the "find a different option when points would coincide" principle, ADR-123, realised structurally). Asserts A, B, E all distinct, A–O1–O2–B collinear, radii 3 & 9.',
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה E',
      'היקף O1 הוא 6π',
      'שטח O2 הוא 81π',
      'A על מעגל O1',
      'B על מעגל O2',
      'AB עובר דרך מרכזי המעגלים',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), E = at(fig, 'E'), O1 = at(fig, 'O1'), O2 = at(fig, 'O2');
      // A, B, E are all DISTINCT — no collapse onto the tangency point.
      expect(dist(A, B), 'A and B distinct').toBeGreaterThan(1);
      expect(dist(A, E), 'A not on the tangency point E').toBeGreaterThan(1);
      expect(dist(B, E), 'B not on the tangency point E').toBeGreaterThan(1);
      // A, O1, O2, B are collinear (the line through the two endpoints crosses both centres).
      const cross = (p: Vec, q: Vec, r: Vec) => Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      expect(cross(A, O1, O2), 'A, O1, O2 collinear').toBeLessThan(0.1);
      expect(cross(O1, O2, B), 'O1, O2, B collinear').toBeLessThan(0.1);
      expect(fig.circles.get('circle-O1')?.r, 'O1 r=3').toBeCloseTo(3, 3);
      expect(fig.circles.get('circle-O2')?.r, 'O2 r=9').toBeCloseTo(9, 3);
    },
  },
  {
    id: 'two-tangents-apex-collinear-with-pinned-point',
    title: 'bagrut Q11 end-to-end (ADR-229): tangents from B at C and D + "A on the extension of BD" — the apex co-solves two constraints',
    guards:
      'operator-reported (2026-07-05, twice — "I don\'t understand why this is not solvable"): the full Q11 figure errored "A, B, D collinear cannot hold" at the last step. B is claimed by ONE tangency (⟂ at the fixed C) but a free point has 2 DOF — sliding ALONG the tangent line is a spare DOF the collinear constraint can consume, which the one-constraint-per-carrier model could not express; and a naive joint co-drive destabilised the unrelated circles-tangency at E. Fix (ADR-229 freeze-and-co-drive): bake the valid 7-step solution (resolveDriven), re-drive ONLY the carriers the failing constraint references (originals restored, the free host also carries K via solve.also), everything else frozen; multi-start host seeds reach the far basin; and recruitFreeDofs stops once the system evaluates valid (a sibling order-constraint\'s failed experiments were undoing the fix). The solved figure matches the closed-form answer: |AB|=30, |BC|=18, |AD|=12 (r1=3, r2=9 ⇒ |AC|=24, tangent length from A = 12).',
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ',
      'A על מעגל O1',
      'C על מעגל O2',
      'AC עובר דרך O1 ו O2',
      'היקף מעגל O1 הוא 6π',
      'שטח מעגל O2 = 81π',
      'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות C ו D',
      'A נמצא על המשך BD',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // The closed-form solution (radii pinned 3 and 9): |AC| = 24, |AD| = tangent-from-A = 12, |BC| = 18, |AB| = 30.
      expect(dist(A, C), '|AC| = 2r1 + 2r2 = 24').toBeCloseTo(24, 2);
      expect(dist(A, D), '|AD| = tangent length from A = 12').toBeCloseTo(12, 2);
      expect(dist(B, C), '|BC| = 18').toBeCloseTo(18, 2);
      expect(dist(A, B), '|AB| = 30').toBeCloseTo(30, 2);
      // A, B, D genuinely collinear, and D on circle O2.
      const cross = (p: Vec, q: Vec, r: Vec) => Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      expect(cross(A, B, D), 'A, B, D collinear').toBeLessThan(0.05);
      expect(dist(at(fig, 'O2'), D), 'D on circle O2 (r=9)').toBeCloseTo(9, 3);
    },
  },
  {
    id: 'polygon-perimeter-sizes-figure',
    title: 'polygon perimeter as a constraint (ADR-228): "משולש ABC" + "היקף ABC = 20"',
    guards:
      'feature (2026-07-05): היקף is BOTH a circle\'s circumference and a polygon\'s perimeter; on a polygon it is now a first-class perimeter constraint (sibling of area, ADR-118) — set-perimeter drives the figure so Σ of the sides equals the given, and the givens verifier re-derives and checks it. A lone perimeter pins the figure SCALE (invisible after the fit).',
    steps: ['משולש ABC', 'היקף ABC = 20'],
    check(fig) {
      allStepsOk(fig);
      const p = dist(at(fig, 'A'), at(fig, 'B')) + dist(at(fig, 'B'), at(fig, 'C')) + dist(at(fig, 'C'), at(fig, 'A'));
      expect(p, 'the triangle perimeter equals the given 20').toBeCloseTo(20, 3);
    },
  },
  {
    id: 'existing-point-statements-lower-to-constraints',
    title: 'a statement about an EXISTING point is a constraint, never an "already defined" conflict (M1, ADR-231)',
    guards:
      'operator prod session `fn34ptei` (2026-07-06): after "טרפז ABCD חסום במעגל" auto-created circle-O with centre O, "O מרכז מעגל חסום במשולש ABC" and "O על ED" both crashed \'O\' is already defined — and the mirrored order crashed the same way, so the figure was unbuildable in ANY order. Root cause (the recurring ADR-075/099/115/119/124 class): the ADR-028/050 reinterpretation mechanism was GATED — point-on-segment required the existing point to own a free param DOF, placements gave up without a free param ancestor, and the conflict branch never recruited. Fix (M1): any existing GeoPoint lowers to its defining incidences (collinear + the stated within/beyond order for על; a hidden-target coincidence for placements), the conflict branch gets the same recruitFreeDofs failure path as typed constraints, and an unsatisfiable statement reports the RELATION (honest over-constraint), never a redefinition conflict. This exact sequence contains a genuinely degenerate step (המשכי CE ו CD share C, so their crossing cannot be a distinct A) — the lock asserts the honest-error CLASS, not a buildable figure; the satisfiable members are locked in redefine-existing-point.test.ts.',
    steps: [
      'טרפז ABCD חסום במעגל',
      'טרפז BCED',
      'המשכי CE ו CD נפגשים בנקודה A',
      'BA',
      'AC',
      'O מרכז מעגל חסום במשולש ABC',
      'O על ED',
    ],
    expectViolations: true, // the degenerate meet + the un-flexed collinear are intentionally rejected — prior figure kept
    check(fig) {
      // The class assertion: NO step may report a redefinition conflict — every failure names the relation.
      for (const [id, st] of Object.entries(fig.status)) {
        expect(String(st), `step ${id} must not report a redefinition conflict`).not.toMatch(/already defined/i);
      }
      expect(fig.lastError, 'the failure names the relation that cannot hold').toMatch(/cannot hold/);
      expect(fig.lastError).not.toMatch(/~/); // hidden helper ids never leak into a student-facing message
      // The prior figure (trapezoid in circle + BCED) is intact — nothing was clobbered by the failed steps.
      for (const id of ['A', 'B', 'C', 'D', 'E', 'O']) expect(fig.positions.has(id), `position for ${id}`).toBe(true);
    },
  },
  {
    id: 'q11-sizes-last-order-independence',
    title: 'bagrut Q11 with the size givens typed LAST builds to the same closed form (order-independence, ADR-231)',
    guards:
      "review F1 (2026-07-06, probed): the locked Q11 order (sizes first) built, but re-ordering the same givens sizes-LAST failed 'over-constrained' — entry order changed satisfiability, breaking ADR-104's commitment (and the Am.6 UI hint 'enter the givens first' was documenting the hole). Three root fixes (ADR-231): the deferrable set is STRUCTURAL (set-radius/area/perimeter were silently missing from the hand list, so a late size could neither defer nor pend); an unowned tangency `coincide` re-homes through the general recruiter on the failure path (keepTangencyDriven's free-centre handoff was the only, insufficient path); and `replay` gained the HOIST dual of the ADR-104 deferral — a still-failed pure-relation fact is re-folded at the earliest position where its references exist, so a too-late given lands exactly where the working order put it. Locks the same closed form as `two-tangents-apex-collinear-with-pinned-point` from the reversed entry order.",
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ',
      'A על מעגל O1',
      'C על מעגל O2',
      'AC עובר דרך O1 ו O2',
      'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות C ו D',
      'A נמצא על המשך BD',
      'היקף מעגל O1 הוא 6π',
      'שטח מעגל O2 = 81π',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(A, C), '|AC| = 2r1 + 2r2 = 24').toBeCloseTo(24, 2);
      expect(dist(A, D), '|AD| = tangent length from A = 12').toBeCloseTo(12, 2);
      expect(dist(B, C), '|BC| = 18').toBeCloseTo(18, 2);
      expect(dist(A, B), '|AB| = 30').toBeCloseTo(30, 2);
    },
  },
  {
    id: 'shared-touch-tangents-sizes-last',
    title: 'two tangent circles + tangents from N through the SHARED touch M + sizes typed LAST (ADR-238)',
    guards:
      "operator prod session sq9lt4fj (2026-07-06, the 'radius sizes fail' report): two circles tangent at M, tangents from N to EACH circle at M+another, A on extension BN, then O1M=9 / O2M=16 — the 2nd size was refused ('M coincides with its constructed target cannot hold', logged deferred-constraint) and circle-O2's radius collapsed to ~0.26 instead of 16. TWO root causes (ADR-238): (1) degenerate parking — the driven solve for N (carrying 'O1M ⟂ NM', a constraint with manifold slack) parked N at the regularised-NEAREST point of the ⟂ line, which is ON M (the residual's own collapse point); the wedged figure then starved/destabilised every later solve. Fixed by the anti-collapse barrier RETRY in both driven solvers. (2) HOIST was gated behind !pending, so the order-independence rescue never ran from the 'deferred-constraint' state even though re-folding the same facts sizes-first builds clean. Fixed by attempting HOIST from pending too (acceptance unchanged: clean AND not pending). Asserts the closed form: radii 9/16, |O1O2|=25, |NM|=|NB|=|NA|=√(r1·r2)=12, both tangencies genuinely ⟂.",
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M',
      'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B',
      'מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A',
      'A נמצאת על המשך BN',
      'O1M=9',
      'O2M=16',
    ],
    check(fig) {
      allStepsOk(fig);
      const O1 = at(fig, 'O1'), O2 = at(fig, 'O2'), M = at(fig, 'M'), N = at(fig, 'N'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(dist(O1, M), '|O1M| = 9 (the stated radius)').toBeCloseTo(9, 2);
      expect(dist(O2, M), '|O2M| = 16 (the stated radius)').toBeCloseTo(16, 2);
      expect(dist(O1, O2), 'externally tangent: |O1O2| = 9 + 16').toBeCloseTo(25, 2);
      expect(dist(N, M), '|NM| = √(r1·r2) = 12 (the classic closed form)').toBeCloseTo(12, 1);
      expect(dist(N, B), 'equal tangents to O1: |NB| = |NM|').toBeCloseTo(dist(N, M), 2);
      expect(dist(N, A), 'equal tangents to O2: |NA| = |NM|').toBeCloseTo(dist(N, M), 2);
      const cosA = (p: Vec, v: Vec, q: Vec) => Math.abs(Math.cos((angle(p, v, q) * Math.PI) / 180));
      expect(cosA(O1, B, N), 'O1B ⟂ NB (a genuine tangent, not a compromise basin)').toBeLessThan(0.01);
      expect(cosA(O2, A, N), 'O2A ⟂ NA').toBeLessThan(0.01);
    },
  },
  {
    id: 'common-tangent-two-circles',
    title: '"AB משיק משותף לשני המעגלים" — a common tangent construct, its soft pairing swapped by later explicit memberships (ADR-239)',
    guards:
      "operator prod session sq9lt4fj (2026-07-06, the 'missing construct: tangent to 2 circles' report): 'AB משיק משותף לשני המעגלים' had NO deterministic rule — the plural מעגלים + משיק would misparse via circlesTangent as MUTUAL tangency of two NEW circles (inventing O,P), so it escalated to the LLM. The commonTangent rule (before circlesTangent; unique 'משותף'/'common' trigger) decomposes to on-circle touches + radius-⟂-tangent per circle + the segment. The touch↔circle PAIRING is unstated (the student said only 'AB touches both') — a softPair default in stated order that the store pre-scan SWAPS when a later explicit membership names the opposite assignment (here 'tangents from N to O1 at M and B' puts B on O1, the reverse of the default A→O1) — M4 defaults-yield, the ADR-163 pre-scan shape. Asserts the full session builds: pairing swapped (B on O1, A on O2), both common-tangent touches genuinely ⟂, sizes land (9/16), N is AB's midpoint (|NA|=|NB|=|NM|).",
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M',
      'AB משיק משותף לשני המעגלים',
      'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B',
      'מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A',
      'A נמצאת על המשך BN',
      'O1M=9',
      'O2M=16',
    ],
    check(fig) {
      allStepsOk(fig);
      const O1 = at(fig, 'O1'), O2 = at(fig, 'O2'), M = at(fig, 'M'), N = at(fig, 'N'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(dist(O1, M), '|O1M| = 9').toBeCloseTo(9, 2);
      expect(dist(O2, M), '|O2M| = 16').toBeCloseTo(16, 2);
      // The soft pairing yielded to the stated one: B rides O1 (|O1B| = r1), A rides O2 (|O2A| = r2).
      expect(dist(O1, B), 'B is the touch on circle O1 (the swap fired)').toBeCloseTo(9, 1);
      expect(dist(O2, A), 'A is the touch on circle O2').toBeCloseTo(16, 1);
      const cosA = (p: Vec, v: Vec, q: Vec) => Math.abs(Math.cos((angle(p, v, q) * Math.PI) / 180));
      expect(cosA(O1, B, A), 'O1B ⟂ AB (a genuine common tangent)').toBeLessThan(0.02);
      expect(cosA(O2, A, B), 'O2A ⟂ AB').toBeLessThan(0.02);
      expect(dist(N, M), '|NM| = √(r1·r2) = 12').toBeCloseTo(12, 1);
      expect(dist(N, A), 'N is the midpoint of AB: |NA| = |NM|').toBeCloseTo(dist(N, M), 1);
      expect(dist(N, B), '|NB| = |NM|').toBeCloseTo(dist(N, M), 1);
    },
  },
  {
    id: 'common-tangent-at-shared-touch',
    title: '"CD משיק משותף לשני המעגלים בנקודה M" — the common tangent AT the shared touch point (ADR-239 variant 2)',
    guards:
      "the operator's 'tangent at intersection' half of the missing-construct report (sq9lt4fj follow-up): the single common tangent at the touch point M of two tangent circles. The rule asserts M's membership on BOTH circles + centres collinear with M (all idempotent when the pair is already tangent at M) and DRAWS the tangent line at M, materialising the naming letters C,D as ±offset markers (ADR-036/233 — nothing the student typed is dropped). Asserts the line is genuinely the common tangent: CD ⟂ O1O2.",
    steps: ['שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M', 'CD משיק משותף לשני המעגלים בנקודה M'],
    check(fig) {
      allStepsOk(fig);
      const O1 = at(fig, 'O1'), O2 = at(fig, 'O2'), M = at(fig, 'M'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(O1, O2), 'still externally tangent: |O1O2| = r1 + r2').toBeGreaterThan(0);
      const cosA = (p: Vec, v: Vec, q: Vec) => Math.abs(Math.cos((angle(p, v, q) * Math.PI) / 180));
      expect(cosA(O1, M, C), 'the tangent at M ⟂ the centre line (C side)').toBeLessThan(0.01);
      expect(cosA(O2, M, D), 'the tangent at M ⟂ the centre line (D side)').toBeLessThan(0.01);
      expect(dist(C, M), 'C is a marker ON the tangent, off the touch (its offset is a sampled free DOF)').toBeGreaterThan(0.05);
      expect(dist(D, M), 'D is a marker off the touch too').toBeGreaterThan(0.05);
    },
  },
  {
    id: 'shared-endpoint-extension-either-side-default',
    title: 'booklet-571 p.78 Q4: "המשך AC חותך את מעגל P בנקודה E" on the two-tangent-chords figure lands E beyond A (C-A-E)',
    guards:
      "operator session eew5ezi5 (2026-07-10, the ADR-124/#6 source question re-typed correctly with the NEW point E): two circles meet at A,B; chord AD in P tangent to O at A; chord CB in O tangent to P at B; 'המשך AC חותך את מעגל P בנקודה E' (the operator typed חותר — a typo the LLM corrected). Every step showed ✓ but E landed BETWEEN C and A (t = 0.64), amber-flagged orderBeyond — 'fails to create the C-A-E sequence'. Root cause (issue #19): ADR-142's shared-endpoint either-side semantics lived ONLY behind extensionsClear's `relax` flag, set solely by firstSatisfyingSeed's fallback pass — so (a) the strict primary sweep demanded E beyond C, which is geometrically impossible here at EVERY seed (CB tangent to circle P pins C outside P), burning the app's 2500ms wall budget before the fallback ever ran, and (b) meetsRequirements/`findValidConfig` used the STRICT form, rejecting the very seed the fallback found — the consumers disagreed. Fix (ADR-267): a PREFERENCE LADDER — strict letter order wherever achievable (the ADR-098 free-DOF family, where the order genuinely SELECTS the config), the ADR-142 either-side bar as the ACCEPTANCE tier, searched in ONE interleaved budget-safe sweep (a fallback bar rides the same loop, never a second pass); meetsRequirements/findValidConfig/resample/the ADR-256 sample filter all honour the ladder.",
    steps: [
      'שני מעגלים נחתכים בנקודות A ו-B',
      'AD מיתר במעגל P משיק למעגל O בנקודה A',
      'CB מיתר במעגל O משיק למעגל P בנקודה B',
      { llm: ['המשך AC חותך את מעגל P בנקודה E'] }, // the operator's חותר typo, as the LLM's corrected canonical line
      'CE',
    ],
    check(fig) {
      allStepsOk(fig);
      const C = at(fig, 'C'), A = at(fig, 'A'), E = at(fig, 'E');
      // E is ON line CA…
      const ca = { x: A.x - C.x, y: A.y - C.y };
      const ce = { x: E.x - C.x, y: E.y - C.y };
      const offLine = Math.abs(ce.x * ca.y - ce.y * ca.x) / Math.hypot(ca.x, ca.y);
      expect(offLine, 'E collinear with C,A').toBeLessThan(1e-3);
      // …beyond A (the book's C-A-E order; t=1 at A), never between C and A.
      const t = (ce.x * ca.x + ce.y * ca.y) / (ca.x * ca.x + ca.y * ca.y);
      expect(t, 'E beyond A (C-A-E)').toBeGreaterThan(1);
      // Both stated tangencies genuinely hold (radius ⟂ chord at the touch).
      const cosA = (p: Vec, v: Vec, q: Vec) => Math.abs(Math.cos((angle(p, v, q) * Math.PI) / 180));
      expect(cosA(at(fig, 'O'), A, at(fig, 'D')), 'OA ⟂ AD (AD tangent to O at A)').toBeLessThan(0.02);
      expect(cosA(at(fig, 'P'), at(fig, 'B'), C), 'PB ⟂ CB (CB tangent to P at B)').toBeLessThan(0.02);
    },
  },
  {
    id: 'extension-cuts-bare-segment-keeps-on-segment-default',
    title: '"המשך FO חותך את AC בנקודה E" keeps E ON segment AC (the bare operand\'s on-segment default survives the other operand\'s המשך)',
    guards:
      'operator prod test 2026-07-10, saved figure `figure-2026-07-10.geo (6).json` (issue #22, P1): on the tangent-quad-in-right-triangle figure, "המשך FO חותך את AC בנקודה E" placed E on the CONTINUATION of AC (t = 1.139, beyond C) with every row ✓ and zero violations — the stated given ("חותך את AC", a bare segment reference = the segment, ADR-077) silently violated. Root cause (class): per-operand reference semantics (bare pair = SEGMENT; המשך = directional extension; הישר = infinite line) were computed UTTERANCE-GLOBALLY in lineLineIntersection — `extend` tested the whole string, so המשך on the FIRST operand stripped the on-segment default from the SECOND, bare operand (`onSeg = !extend && !infinite`). Fix: per-operand classification in all three phrasing forms (cut-form by verb side; conjunction forms by pre-operand spans, with a leading המשך distributing over the conjoined pair) → the bare operand emits onSeg1/onSeg2, lowered in the engine to a collinear-order [X,E,Y] (the ADR-077/ADR-127 within mechanism) that flexes the figure to bring the crossing onto the segment; the joint both-bare case keeps the sampled ADR-166 onSeg requirement byte-identical. The bare operand also draws WHOLE (A–C), no longer an overshooting A–E stub.',
    steps: [
      'ABC משולש ישר זווית',
      'F על AB',
      'G על AC',
      'H על CB',
      'GCHF מרובע',
      'הGCHF חסום במעגל',
      'AB משיק למעגל בנקודה F',
      'AB מקביל ל GH',
      'CF',
      'המשך FO חותך את AC בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), C = at(fig, 'C'), E = at(fig, 'E'), F = at(fig, 'F'), O = at(fig, 'O');
      // E is ON segment AC (the bare operand's default), not on its continuation.
      const ac = { x: C.x - A.x, y: C.y - A.y };
      const ae = { x: E.x - A.x, y: E.y - A.y };
      const offLine = Math.abs(ae.x * ac.y - ae.y * ac.x) / Math.hypot(ac.x, ac.y);
      expect(offLine, 'E collinear with A,C').toBeLessThan(1e-3);
      const t = (ae.x * ac.x + ae.y * ac.y) / (ac.x * ac.x + ac.y * ac.y);
      expect(t, 'E within segment AC').toBeGreaterThan(0);
      expect(t, 'E within segment AC').toBeLessThan(1);
      // The המשך operand stays directional: E beyond O on the ray F→O (F-O-E order, ADR-054).
      const fo = { x: O.x - F.x, y: O.y - F.y };
      const fe = { x: E.x - F.x, y: E.y - F.y };
      const u = (fe.x * fo.x + fe.y * fo.y) / (fo.x * fo.x + fo.y * fo.y);
      expect(u, 'E beyond O (F-O-E)').toBeGreaterThan(1);
    },
  },
  {
    id: 'bare-diameter-from-point',
    title: '"קוטר מנקודה F" draws the diameter from the tangency point (auto-named antipode), then "המשך FO חותך את AC בנקודה E" lands E on AC',
    guards:
      'operator prod test 2026-07-10 (issue #21): on the tangent-quad-in-right-triangle figure the operator wanted the diameter of circle O from the tangency point F, but every bare form ("קוטר מנקודה F" / "diameter from F") was not-handled → LLM escalation; they had to fall back to the cut-compound workaround. Fix: a `diameterFromPoint` rule — diameter word + a from-marker + exactly ONE label + no cut verb → resolve the circle (named or implicit, ADR-029), assert F\'s membership idempotently (M1), auto-name the antipode as a fresh label (the ADR-263 auto-foot precedent) and emit the existing `diameter` command. No theft: the cut compound stays with diameterCutsSegment (INTERSECT_KW defer), the two-label "FD קוטר" stays with `diameter`. This scenario is the operator\'s exact saved sequence with the workaround replaced by the bare form + the follow-up cut.',
    steps: [
      'ABC משולש ישר זווית',
      'F על AB',
      'G על AC',
      'H על CB',
      'GCHF מרובע',
      'הGCHF חסום במעגל',
      'AB משיק למעגל בנקודה F',
      'AB מקביל ל GH',
      'CF',
      'קוטר מנקודה F',
      'המשך FO חותך את AC בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), C = at(fig, 'C'), E = at(fig, 'E'), F = at(fig, 'F'), O = at(fig, 'O'), D = at(fig, 'D');
      // D is the auto-named antipode of F: on the circle (|OD| = |OF|) and F–O–D collinear.
      const rF = Math.hypot(F.x - O.x, F.y - O.y);
      expect(Math.hypot(D.x - O.x, D.y - O.y), '|OD| = |OF| (D on circle O)').toBeCloseTo(rF, 3);
      const cross = (F.x - O.x) * (D.y - O.y) - (F.y - O.y) * (D.x - O.x);
      expect(Math.abs(cross) / (rF * rF), 'F, O, D collinear (a diameter)').toBeLessThan(1e-3);
      // The follow-up cut still lands E ON segment AC (the issue-#22 fix, on this exact figure).
      const ac = { x: C.x - A.x, y: C.y - A.y };
      const t = ((E.x - A.x) * ac.x + (E.y - A.y) * ac.y) / (ac.x * ac.x + ac.y * ac.y);
      expect(t, 'E within segment AC').toBeGreaterThan(0);
      expect(t, 'E within segment AC').toBeLessThan(1);
    },
  },
  {
    id: 'adr-124-contradictory-extension-refused-honestly',
    title: 'ADR-124 unparked (issue #6): "המשך CA חותך את מעגל P בנקודה D" onto the EXISTING tangent-chord endpoint D is refused over-constrained, never silently violated',
    guards:
      'operator session v7veg7sc (ADR-124) + the issue-#6 operator ruling (2026-07-11): in the booklet-571 p.78 Q4 figure, "AD tangent to O at A" IS a construction GIVEN (not the conclusion). With both tangencies given, tangent-chord algebra (and a 15k-sample engine-free sweep) prove C, A, D can never be collinear non-degenerately — so the operator\'s exact sequence, which re-used the chord endpoint D as the extension target (the book\'s figure uses a NEW point E there; that correct form is locked by scenario shared-endpoint-extension-either-side-default, ADR-267), is genuinely contradictory. Before ADR-124 the tool HID the conflict (a clean-looking figure quietly violating C-A-D, collinear residual 0.38); the correct behaviour — now locked here end-to-end — is the honest over-constrained refusal with the prior figure kept (both stated tangencies still holding). The scenario was parked in ADR-124 pending the operator\'s check of the bagrut source; the ruling makes (a) — keep the honest error — final.',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו-B',
      'המיתר AD במעגל P משיק למעגל O בנקודה A',
      'CB מיתר במעגל O משיק למעגל P בנקודה B',
      'המשך CA חותך את מעגל P בנקודה D',
    ],
    expectViolations: true, // the last step is REFUSED — the figure keeps the prior (valid) state
    check(fig) {
      // The contradictory step is refused honestly — an over-constraint naming the relation, never a
      // silent build with C-A-D violated.
      expect(fig.lastError, 'the contradictory extension is refused').not.toBeNull();
      // The prior figure survives: both stated tangencies genuinely hold on the kept figure.
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), O = at(fig, 'O'), P = at(fig, 'P');
      const cosA = (p: Vec, v: Vec, q: Vec) => Math.abs(Math.cos((angle(p, v, q) * Math.PI) / 180));
      expect(cosA(O, A, D), 'OA ⟂ AD (AD tangent to O at A)').toBeLessThan(0.02);
      expect(cosA(P, B, C), 'PB ⟂ CB (CB tangent to P at B)').toBeLessThan(0.02);
    },
  },
  {
    id: 'b13-extension-equality-no-vacuous-collapse',
    title: 'B13: "GA = AC" on an extension point must not be "satisfied" by collapsing A onto C (vacuous 0 = 0)',
    guards:
      'issue #7 (the ADR-243 B13 corpus ENGINE FINDING): triangle ABC inscribed in circle O, BC a diameter, G on the extension of CA, then "GA = AC". driveOrCheck skipped G (an extension t is deliberately "recruitable not eager", ADR-073) and eagerly drove the free on-circle vertex A — whose only zero-residual configuration is A ≡ C, where |GA| = |AC| holds VACUOUSLY (0 = 0; the relative-residual cost reads 0/max(0,1e-9) = 0 as perfect, and isSatisfied agrees). The collapse was admitted by the failure-path accepts (plain `evaluate(recruited).ok`), the figure looked green, and the NEXT step ("line GB meets circle O at D") exploded with "over-constrained: |GA| = |AC| cannot hold" — the corpus knownBuildIssue. Class: a new constraint admitted as vacuously-satisfied-by-collapse of its own referenced points. Fix: `newConstraintsNonVacuous` — one gate at every applyStep accept (primary, reinterpret, recruiter, scale-rescue), mirroring solutionAccepted\'s non-degeneracy rule scoped per-constraint; ADR-123\'s forced coincidence (driven point ≡ a point the constraint does NOT reference) is untouched. The recruiter then finds the real configuration: G\'s extension t driven to 2 (A the midpoint of GC).',
    steps: [
      'triangle ABC inscribed in circle O',
      'diameter BC in circle O',
      'G on the extension of CA',
      'GA = AC',
      'line GB meets circle O at D',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), C = at(fig, 'C'), G = at(fig, 'G'), D = at(fig, 'D'), O = at(fig, 'O');
      // A did NOT collapse onto C (the vacuous root), and the equality holds genuinely.
      expect(Math.hypot(A.x - C.x, A.y - C.y), 'A and C are distinct points').toBeGreaterThan(1);
      expect(Math.hypot(G.x - A.x, G.y - A.y), '|GA| = |AC| genuinely').toBeCloseTo(Math.hypot(A.x - C.x, A.y - C.y), 3);
      // G is on the extension of CA beyond A (order C → A → G), i.e. A is the midpoint of GC.
      const ca = { x: A.x - C.x, y: A.y - C.y };
      const t = ((G.x - C.x) * ca.x + (G.y - C.y) * ca.y) / (ca.x * ca.x + ca.y * ca.y);
      expect(t, 'G beyond A on ray C→A').toBeGreaterThan(1.5);
      // D built (the step that used to explode) and is on circle O.
      const r = Math.hypot(C.x - O.x, C.y - O.y);
      expect(Math.hypot(D.x - O.x, D.y - O.y), 'D on circle O').toBeCloseTo(r, 3);
    },
  },
  {
    id: 'q4-chord-cuts-radius-textbook-nouns',
    title: 'bagrut Q4 circle figure in textbook wording: "המיתר CK חותך את הרדיוס AO בנקודה E" + "המשך הקטע KO חותך את המיתר CB בנקודה P" build with memberships',
    guards:
      'operator prod session wtgzh6v2 (2026-07-10, issue #17): the bagrut פרק-שני Q4 figure (AB diameter in circle O; chord CK cuts radius AO at E; ∠EKO=∠ABK; extension of KO cuts chord CB at P; PO=4, r=4.8) did not build — the two textbook-worded cut steps failed the deterministic parse (not-handled → LLM, which dropped the chord and was correctly refused by droppedNewLabels). Root cause (class): the shared cut/meet compounds accepted only BARE point-pair operands — a shape-noun marker (המיתר/הרדיוס/הקטע) on either operand made every rule in the family miss (the ADR-119 class one seam earlier: withCarrierMembership never ran because the parse failed upstream). Fix: lineLineIntersection no longer stops on chord/radius nouns (only diameter/tangent, which ARE constructs other rules own); withCarrierMembership restores the noun\'s memberships for the operand pairs (its centre-ref bail scoped to diameter-flavoured utterances; scaffolding segments to the NEW crossing excluded so P is never forced onto the circle); the ⊥/∥ LINE_CUT filler tolerates the same nouns.',
    steps: [
      'AB קוטר במעגל O',
      'המיתר CK חותך את הרדיוס AO בנקודה E',
      'זווית EKO = זווית ABK',
      'המשך הקטע KO חותך את המיתר CB בנקודה P',
      'PO = 4',
      'רדיוס המעגל הוא 4.8',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), K = at(fig, 'K'), O = at(fig, 'O'), E = at(fig, 'E'), P = at(fig, 'P');
      const within = (p: Vec, q: Vec, x: Vec, label: string) => {
        const d = { x: q.x - p.x, y: q.y - p.y };
        const v = { x: x.x - p.x, y: x.y - p.y };
        const t = (v.x * d.x + v.y * d.y) / (d.x * d.x + d.y * d.y);
        expect(t, `${label} within`).toBeGreaterThan(0);
        expect(t, `${label} within`).toBeLessThan(1);
        return t;
      };
      // E ON the radius AO and ON the chord CK; P ON the chord CB — the nouns' segment semantics.
      within(A, O, E, 'E on radius AO');
      within(C, K, E, 'E on chord CK');
      within(C, B, P, 'P on chord CB');
      // P beyond O in the K→O→P direction (המשך הקטע KO).
      const ko = { x: O.x - K.x, y: O.y - K.y };
      const kp = { x: P.x - K.x, y: P.y - K.y };
      expect((kp.x * ko.x + kp.y * ko.y) / (ko.x * ko.x + ko.y * ko.y), 'P beyond O (K-O-P)').toBeGreaterThan(1);
      // The chord/radius memberships the nouns assert: C, K, A (and B via the diameter) on circle O.
      const r = Math.hypot(A.x - O.x, A.y - O.y);
      expect(r, 'radius 4.8').toBeCloseTo(4.8, 1);
      for (const [id, p] of [['C', C], ['K', K], ['B', B]] as const) {
        expect(Math.hypot(p.x - O.x, p.y - O.y), `${id} on circle O`).toBeCloseTo(r, 1);
      }
      // The stated relations hold: ∠EKO = ∠ABK and |PO| = 4.
      expect(Math.abs(angle(E, K, O) - angle(A, B, K)), '∠EKO = ∠ABK').toBeLessThan(0.5);
      expect(Math.hypot(P.x - O.x, P.y - O.y), '|PO| = 4').toBeCloseTo(4, 1);
    },
  },
  {
    id: 'tangent-through-on-circle-point-binds-touch-by-membership',
    title: 'book wording "דרך הנקודה C העבירו משיק למעגל שחותך את המשך הקטע BA בנקודה E" — the touch is the circle MEMBER (C), the crossing the new label (E)',
    guards:
      'operator prod session jsptarcl (2026-07-11, issue #36): tangentLineIntersection bound the tangency point by POSITION ("the first בנקודה-label after the משיק keyword"), so in the "דרך הנקודה C העבירו משיק" phrasing — where the touch is named BEFORE the keyword and the only post-keyword בנקודה is the CUT point — the roles swapped: the parse emitted `tangent at E` + `crossing id C`, the existing on-circle C was dragged toward the bogus crossing, and the step refused over-constrained. The student could not enter the question as printed. Fix (the ADR-233 proxy-vs-semantic class): the touch/cut pair is oriented by CIRCLE MEMBERSHIP (the known member is the touch, wherever it sits in the sentence); the positional read survives only as the both-labels-new tiebreak, with the explicit through-carrier ("דרך הנקודה X") breaking that tie.',
    steps: [
      'משולש ABC חסום במעגל',
      'BC קוטר',
      'דרך הנקודה C העבירו משיק למעגל שחותך את המשך הקטע BA בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), O = at(fig, 'O'), E = at(fig, 'E');
      // C stays ON the circle (it is the touch) — before the fix it was re-bound as the crossing.
      const r = Math.hypot(A.x - O.x, A.y - O.y);
      expect(Math.hypot(C.x - O.x, C.y - O.y), 'C on circle O (the touch)').toBeCloseTo(r, 5);
      // E is the tangent∩line(BA) crossing: EC ⟂ OC (tangent ⟂ radius at the touch).
      const dot = (E.x - C.x) * (C.x - O.x) + (E.y - C.y) * (C.y - O.y);
      expect(Math.abs(dot) / (Math.hypot(E.x - C.x, E.y - C.y) * r), 'EC ⟂ OC').toBeLessThan(1e-6);
      // E lies on line BA, beyond A (המשך הקטע BA is directional: B→A→E).
      const ba = { x: A.x - B.x, y: A.y - B.y };
      const be = { x: E.x - B.x, y: E.y - B.y };
      expect(Math.abs(be.x * ba.y - be.y * ba.x) / Math.hypot(ba.x, ba.y), 'E on line BA').toBeLessThan(1e-6);
      expect((be.x * ba.x + be.y * ba.y) / (ba.x * ba.x + ba.y * ba.y), 'E beyond A (B-A-E)').toBeGreaterThan(1);
    },
  },
  {
    id: 'tangent-rider-collinear-solves-own-offset',
    title: '"ישר BAE" on a tangent-riding E — the crossing solves E\'s own offset; the earlier givens do not move and are not blamed (issue #37, ADR-276)',
    guards:
      'operator prod session jsptarcl (2026-07-11): the full B13 figure + a tangent at C with E a ±offset rider on it; then "ישר BAE" — refused "over-constrained: |GA| = |AC| cannot hold" after a ~24s replay, though E rides the tangent with exactly 1 free DOF and set-line [B,A,E] is satisfied at the tangent∩line(BA) crossing. TWO root causes (ADR-276): (1) a SATISFIED one-sided collinear-order\'s aim-margin residual competed at full weight in the joint cost — the crossing leaves E only ~7% of |BA| beyond A, inside the 12% visible-gap margin, so the order term dragged the joint minimum just past collinear\'s 1e-6 tolerance and solutionAccepted rejected every candidate (jointCostTerm now zeroes a satisfied order in joint costs); (2) the failure path went straight to the recruiter rampage — settleOnFrozenPrior (stage-0) now first tries the new statement\'s own carriers over the FROZEN prior solution, so a satisfiable-alone statement never re-opens (or gets blamed on) the already-valid coupled system. Also locks the blame-honesty change: a final over-constrained refusal names the student\'s NEW statement, never a collateral casualty.',
    steps: [
      'משולש ABC חסום במעגל',
      'BC קוטר',
      'G על המשך CA',
      'GA=AC',
      'D על קשת AB',
      'ישר GDB',
      'S_{DBCA}/S_{GAD}=15',
      'AD',
      'מנקודה E יוצא משיק למעגל בנקודה C',
      'ישר BAE',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), G = at(fig, 'G'), O = at(fig, 'O'), E = at(fig, 'E');
      // The stated equality genuinely holds — the fix must not "solve" the new line by breaking it.
      expect(Math.abs(Math.hypot(G.x - A.x, G.y - A.y) - Math.hypot(A.x - C.x, A.y - C.y)), '|GA| = |AC|').toBeLessThan(0.01);
      // E on the tangent at C: EC ⟂ OC.
      const r = Math.hypot(C.x - O.x, C.y - O.y);
      const dot = (E.x - C.x) * (C.x - O.x) + (E.y - C.y) * (C.y - O.y);
      expect(Math.abs(dot) / (Math.hypot(E.x - C.x, E.y - C.y) * r), 'EC ⟂ OC').toBeLessThan(1e-4);
      // E collinear with B,A and beyond A (ישר BAE names the order B→A→E).
      const ba = { x: A.x - B.x, y: A.y - B.y };
      const be = { x: E.x - B.x, y: E.y - B.y };
      expect(Math.abs(be.x * ba.y - be.y * ba.x) / (Math.hypot(ba.x, ba.y) * Math.hypot(be.x, be.y)), 'E on line BA').toBeLessThan(1e-3);
      expect((be.x * ba.x + be.y * ba.y) / (ba.x * ba.x + ba.y * ba.y), 'E beyond A (B-A-E)').toBeGreaterThan(1);
    },
  },
  {
    id: 'bare-segment-cuts-circle-keeps-on-segment-default',
    title: '"GB חותך את המעגל בנקודה D" lands D WITHIN segment GB — the bare-pair segment default, line∩circle edition (issue #30, ADR-277)',
    guards:
      'operator prod session jsptarcl (2026-07-11): "the point D was not on GB — rather on the continuation of GB, which I didn\'t write." A bare pair means the SEGMENT (ADR-077/268), but lineMeetsCircle emitted the crossing with an `avoid` and NO order, so the default seed put D beyond B (t≈1.27) with every row ✓ and violations [] — a stated given silently violated. Fix: a bare pair now carries the ADR-127 `order: [a, D, b]` (→ collinear-order, solver-driven); הישר/line keeps the infinite-line semantics (the B13 corpus phrasing "line GB meets circle O at D" is asserted unchanged by the b13 scenario), המשך stays extendOntoCircle\'s. Sibling swept: lineCutsCircleTwice (both crossings within a bare pair). The verbatim jsptarcl sequence starts with the #31 חוסם misparse — that composite scenario lands with the #31 fix; this locks the intended clean figure.',
    steps: [
      'משולש ABC חסום במעגל',
      'BC קוטר',
      'G על המשך CA',
      'GB חותך את המעגל בנקודה D',
      'GA=AC',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), G = at(fig, 'G'), D = at(fig, 'D'), O = at(fig, 'O');
      // D WITHIN segment GB — the stated bare-segment semantics (the reported defect: t was 1.27).
      const gb = { x: B.x - G.x, y: B.y - G.y };
      const gd = { x: D.x - G.x, y: D.y - G.y };
      const t = (gd.x * gb.x + gd.y * gb.y) / (gb.x * gb.x + gb.y * gb.y);
      expect(t, 'D within GB').toBeGreaterThan(0);
      expect(t, 'D within GB').toBeLessThan(1);
      // D genuinely on circle O, and the later given |GA| = |AC| holds.
      const r = Math.hypot(B.x - O.x, B.y - O.y);
      expect(Math.hypot(D.x - O.x, D.y - O.y), 'D on circle O').toBeCloseTo(r, 4);
      expect(Math.abs(Math.hypot(G.x - A.x, G.y - A.y) - Math.hypot(A.x - C.x, A.y - C.y)), '|GA| = |AC|').toBeLessThan(0.01);
    },
  },
  {
    id: 'inscribe-existing-triangle-with-radius-symbol',
    title: '"משולש ADO חסום במעגל אחר, שרדיוסו r" on existing points builds the SECOND circle through them (issue #53, ADR-279)',
    guards:
      'operator prod report (2026-07-11, the booklet tangent-secant question part ג, same figure as #36/#37): "I\'m trying to say that a different circle has a radius of r (not R) — not supported." The trailing radius-symbol clause שרדיוסו r defeated the end-anchored droppedCirclePredicate gate, and once the circumcircle existed the ADR-156 idempotent re-inscribe branch returned a BARE `triangle ADO` — the stated inscription AND the r vanished with every row ✓ (the docs/17 §6 silent-wrong-figure class). Fix (ADR-279): the measure-symbol honesty lane `droppedRadiusSymbol` + the widened CIRCLE_PRED_TAIL (a predicate may carry its circle\'s qualifier/size clause). This scenario locks the HONEST half that builds: the first entry of the part-ג utterance creates the second circle through A, D, O (r stays unbound — its per-circle binding is issue #54); the refusal half (a re-type must never commit a bare triangle) is locked in src/parser/__tests__/issue-53.test.ts.',
    steps: [
      'משולש ABC חסום במעגל',
      'BC קוטר',
      'G על המשך CA',
      'GA=AC',
      'D על קשת AB',
      'ישר GDB',
      'משולש ADO חסום במעגל אחר, שרדיוסו r',
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), D = at(fig, 'D'), O = at(fig, 'O'), P = at(fig, 'P');
      // The SECOND circle exists and passes through all three named points (the circumcircle of ADO).
      const r = Math.hypot(A.x - P.x, A.y - P.y);
      expect(r, 'circle P is non-degenerate').toBeGreaterThan(1e-6);
      expect(Math.hypot(D.x - P.x, D.y - P.y), 'D on circle P').toBeCloseTo(r, 4);
      expect(Math.hypot(O.x - P.x, O.y - P.y), 'O on circle P').toBeCloseTo(r, 4);
    },
  },
  {
    id: 'plural-hemshekhei-extensions-meet',
    title: 'המשכי CF ו DE נפגשים בנקודה G — the PLURAL extension form carries the extension semantics (#79)',
    guards:
      'Issue #79 (operator screenshot session, 2026-07-11, the two-intersecting-circles figure): the plural המשכי parsed to the OPPOSITE constraint — a bare meet with the ADR-166 onSeg requirement — so the verifier went amber and G stranded at the backward crossing; the singular המשך worked. Root cause: the recorded ADR-3D-035 kaf-class trap — המשך ends in final kaf, its inflections (המשכי/המשכים) use medial kaf, and every regex keyed on the literal המשך missed them. Fixed by the stem sweep המש(?:ך|כי(?:ם|הם|הן)?) across every parse.ts regex site.',
    steps: [
      'שני מעגלים נחתכים בנקודות A ו-B',
      'C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את המעגל O בנקודה E',
      'F על הקשת BC',
      'המשכי CF ו DE נפגשים בנקודה G',
    ],
    check(fig) {
      allStepsOk(fig);
      const between = (m: string, a: string, b: string) => {
        const A = at(fig, a), B = at(fig, b), M = at(fig, m);
        const t = ((M.x - A.x) * (B.x - A.x) + (M.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
        return t > 0 && t < 1;
      };
      // G lies on the EXTENSIONS: F between C and G, E between D and G (order C→F→G, D→E→G).
      expect(between('F', 'C', 'G'), 'F between C and G (extension of CF)').toBe(true);
      expect(between('E', 'D', 'G'), 'E between D and G (extension of DE)').toBe(true);
    },
  },
  {
    id: 'tangent-to-circumscribing-circle',
    title: 'הישר ℓ משיק בנקודה C למעגל החוסם את המשולש ABC — the P1 silent tangent drop (#82)',
    guards:
      'Issue #82 (P1, triage probe on prod session vaotw0tq, the CEFO book problem part ג): the sentence half-parsed — the circumcircle rule claimed the whole utterance, minted a DUPLICATE circle (A,B,C already ride circle O) and silently dropped the tangent, with a green row (the docs/17 §6 silent-wrong-figure class). Fixed by ADR-291 (the circumscribing-circle REFERENCE resolves to the existing circle at the resolveCenter/resolveMentionedCircle chokepoint + dropCircleRef strips the phrase, so tangentLine reads it as a plain tangent-at-C) and guarded by ADR-292 (the droppedGivenVerbs honesty gate — a stated משיק absent from the lowering can never commit again).',
    steps: ['משולש ABC חסום במעגל O', 'הישר ℓ משיק בנקודה C למעגל החוסם את המשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'exactly ONE circle — no duplicate was minted').toBe(1);
      expect(
        fig.construction.objects.some((o) => o.id === 'tan-C'),
        'the tangent at C exists — the verb was not dropped',
      ).toBe(true);
    },
  },
  {
    id: 'restated-circumscription-resolves',
    title: 'מרובע CEFO בר חסימה במעגל then המעגל חוסם את CEFO — resolves/unhides, never a coincident duplicate (#83)',
    guards:
      'Issue #83 (prod session vaotw0tq): re-stating the circumscription minted a SECOND coincident circle (duplicate object + duplicate set-concyclic) and the student still had to guess the hidden circle auto-name to reference it. ADR-291: the circumcircle rule resolves an existing circle through the named points first — lowering to show-circle (the circle becomes visible and referenceable), minting nothing.',
    steps: ['מרובע CEFO בר חסימה במעגל', 'המעגל חוסם את CEFO'],
    check(fig) {
      allStepsOk(fig);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'exactly ONE circle').toBe(1);
      expect((circles[0] as { hidden?: boolean }).hidden, 'the circle is now VISIBLE').toBeUndefined();
      expect(fig.coincidences.length, 'no forced coincidence pair (no duplicate centre)').toBe(0);
    },
  },
  {
    id: 'circumscribing-circle-cuts-side',
    title: 'המעגל החוסם את CEFO חותך את הצלע AC בנקודה D — the book phrasing resolves the EXISTING circle and lands D within AC (#81)',
    guards:
      'Issue #81 (prod session vaotw0tq, the CEFO book problem): the exact book wording was not-understood — circumcircleMeetsSegment read only a 3-label run, and even that path MINTED a fresh circle instead of resolving the hidden concyclic one, so the operator needed a 2-step workaround plus guessing the auto-name. ADR-291: resolution-before-creation inside circumcircleMeetsSegment (an existing circle through the named vertices is referenced) + the 4-label run accepted on the creation path. ADR-291 Am. (#86): the resolution path references the circle WITHOUT `show-circle` — in the cut sentence the circumscribing circle is scaffolding (its role is locating D), so it stays HIDDEN.',
    steps: ['מרובע CEFO בר חסימה במעגל', 'AC', 'המעגל החוסם את CEFO חותך את הצלע AC בנקודה D'],
    check(fig) {
      allStepsOk(fig);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'exactly ONE circle — the existing one was referenced').toBe(1);
      expect((circles[0] as { hidden?: boolean }).hidden, 'the circle stays HIDDEN (scaffolding, #86)').toBe(true);
      const A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D');
      const t = ((D.x - A.x) * (C.x - A.x) + (D.y - A.y) * (C.y - A.y)) / ((C.x - A.x) ** 2 + (C.y - A.y) ** 2);
      expect(t, 'D within segment AC').toBeGreaterThan(0.02);
      expect(t, 'D within segment AC').toBeLessThan(0.98);
    },
  },
  {
    id: 'circumscribing-circle-cut-creation-path-hidden',
    title: 'the cut sentence with NO prior בר חסימה CREATES the circumscribing circle hidden (#86)',
    guards:
      'Issue #86 (prod re-test 2026-07-12, the CEFO figure): «המעגל החוסם את מרובע CEFO חותך את AC בנקודה D» with no prior «בר חסימה» hit circumcircleMeetsSegment`s CREATION path, which minted a VISIBLE circumcircle — but the operator ruled the circumscribing circle in a CUT sentence is scaffolding (its only role is locating D), so it must be created hidden (the same semantics as בר חסימה). Fix (ADR-291 Am.): the creation path emits the `circumcircle` command with `hidden: true`. Here CEFO is a general (non-concyclic) quad, so the circle does not yet exist and the creation branch fires; D still lands within AC.',
    steps: ['מרובע CEFO', 'AC', 'המעגל החוסם את מרובע CEFO חותך את AC בנקודה D'],
    check(fig) {
      allStepsOk(fig);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.length, 'one circle was created').toBe(1);
      expect((circles[0] as { hidden?: boolean }).hidden, 'the created circle is HIDDEN (scaffolding, #86)').toBe(true);
      const A = at(fig, 'A'), C = at(fig, 'C'), D = at(fig, 'D');
      const t = ((D.x - A.x) * (C.x - A.x) + (D.y - A.y) * (C.y - A.y)) / ((C.x - A.x) ** 2 + (C.y - A.y) ** 2);
      expect(t, 'D within segment AC').toBeGreaterThan(0.02);
      expect(t, 'D within segment AC').toBeLessThan(0.98);
    },
  },
  {
    id: 'tangent-secant-detection-honours-valid-configs',
    title: 'tangent/secant figure: no scaffold-point equalities (#49), △ABD~△ACB surfaces (#50), forced 90° still prints (#88)',
    guards:
      'Operator manual session 2026-07-11 (#49/#50) + the CEFO figure 2026-07-12 (#88): the detection layers drew ground truth from a pool/universe that admitted INVALID configs and INTERNAL scaffolding. THREE members of one class ("detection ground truth = valid configurations of the REAL objects only", ADR-295): (#49) the tangent Thales midpoint `~tanmid-OA` split AO into two "equal radii" the student sees no point between — scaffold `~` points now excluded from the detection universe at the figureEdges chokepoint; (#50) in ~3/16 seeds the secant crossing C flips onto D`s far root (C≡D), an unforced collapse that poisoned the similarity correspondence so △ABD~△ACB never formed — `distinctSamples` drops samples with a coincidence not forced in every sample (ADR-256 sibling); (#88) a definite ANGLE value printed off a pool STARVED by those filters to 1-3 self-agreeing samples — a printed NUMBER now needs a non-starved pool (≥4 valid samples) when the figure has free shape DOF, while a determined figure (0 DOF) and a healthy pool still print. This exact 7-step sequence exercises all three: the AO scaffold split must be gone, the forced similarity present, and the genuinely-forced ∠CAG=90° (healthy 13-sample pool) must STILL print (the over-suppression guard).',
    steps: [
      'נתון מעגל שרדיוסו R ומרכזו O',
      'מנקודה A יוצא משיק למעגל בנקודה B',
      'המשך AO חותך את המעגל בנקודה D',
      'AO חותך את המעגל בנקודה C',
      'G נמצאת על המשך DB',
      'AG אנך ל AD',
      'BC',
    ],
    check(fig) {
      allStepsOk(fig);
      const rel = detectRelations(fig.construction);
      // #49: NO scaffold (`~`-prefixed) id may appear in any equality class — the AO Thales midpoint is gone.
      const scaffoldLeak = rel.equalSegments.flat().some(([a, b]) => a.startsWith('~') || b.startsWith('~'));
      expect(scaffoldLeak, `no ~scaffold segment equalities (got ${JSON.stringify(rel.equalSegments)})`).toBe(false);
      // …while the legitimate classes survive: AB=AG (the ⟂-from-A leg) and CO=DO (radii to the secant hits).
      const segCls = rel.equalSegments.map((cls) => cls.map(([a, b]) => [a, b].sort().join('')).sort());
      expect(segCls, 'AB=AG survives').toContainEqual(['AB', 'AG']);
      expect(segCls, 'CO=DO survives').toContainEqual(['CO', 'DO']);
      // #88 over-suppression guard: the healthy pool (~13 valid samples) must STILL print the forced right
      // angle ∠CAG=90 (AG ⟂ AD, C on AD). The pool-size gate suppresses only STARVED pools, never this.
      expect(rel.samplesUsed, 'the pool is healthy, not starved').toBeGreaterThanOrEqual(4);
      const cag = rel.definiteAngles.find((a) => a.vertex === 'A' && [a.a, a.b].sort().join('') === 'CG');
      expect(cag && Math.abs(cag.valueDeg - 90) < 0.5, `forced ∠CAG=90 still printed (got ${JSON.stringify(rel.definiteAngles.map((a) => `${a.a}${a.vertex}${a.b}=${a.valueDeg.toFixed(0)}`))})`).toBe(true);
      // #50: △ABD ~ △ACB (tangent-chord ∠ABС=∠ADB + shared ∠A ⟹ AA) is forced — it must surface in the
      // similar/congruent classes now that the C≡D collapse samples no longer break the correspondence.
      const { similar } = detectShapes(fig.construction);
      const has = (t: string[]) => (cls: { triangles: Id[][] }) => cls.triangles.some((tri) => [...tri].sort().join('') === [...t].sort().join(''));
      const abdAcb = similar.some((cls) => has(['A', 'B', 'D'])(cls) && has(['A', 'C', 'B'])(cls));
      expect(abdAcb, `△ABD ~ △ACB detected (got: ${similar.map((c) => c.triangles.map((t) => t.join('')).join(c.kind === 'congruent' ? '≅' : '~')).join(' | ') || 'none'})`).toBe(true);
    },
  },
  {
    id: 'incircle-feet-are-anonymous-not-namespace-hijack',
    title: 'the incircle’s touch feet are anonymous (@-ids), so a later student point reuses no hijacked letter (#32)',
    guards:
      'Issue #32 (prod session jsptarcl): the incircle decomposition auto-named its three tangency feet F, G, H — points the student never asked for — so when the student then typed «G על המשך CA» to make a NEW point on the extension of CA, the M1 existing-point machinery correctly found G EXISTING and constrained the invisible incircle foot instead of creating the student’s point. Root fix (ADR-297): a decomposition’s touch/tangency points are ANONYMOUS promotable points (`@f-AB`… — `@`-prefixed, never a student letter, drawn as clickable dots the student promotes to a letter), so no letter is silently occupied. This replays the incircle + the student’s extension point: the feet are `@`-ids and G is a FRESH point on CA’s extension, not the incircle foot.',
    steps: ['מעגל חסום במשולש ABC', 'G על המשך CA'],
    check(fig) {
      allStepsOk(fig);
      const pts = fig.construction.objects.filter((o) => isGeoPoint(o));
      const ptIds = pts.map((o) => o.id);
      // the three tangency feet are anonymous `@`-ids — F/G/H are NOT consumed by scaffolding
      const anon = ptIds.filter((id) => id.startsWith('@f-')); // the incircle CENTRE is anonymous too now ('@ctr-', ADR-342) — count only the feet
      expect(anon.length, `three anonymous incircle feet (got ${ptIds.join(',')})`).toBe(3);
      // the student's G is a FRESH point of their own — an on-segment point on CA's extension, NOT a `foot`
      // dangling off the incentre (the hijack that emitted `set-line [C,A,G]` onto the invisible foot).
      const G = fig.construction.objects.find((o) => o.id === 'G');
      expect(G, 'G exists').toBeTruthy();
      expect(G!.kind, 'G is the student’s on-segment extension point, not the incircle foot').toBe('on-segment');
    },
  },
  {
    id: 'radical-fraction-length-value',
    title: 'נתון: BC = 35/√32 — a radical-fraction length builds and keeps its verbatim form (#77)',
    guards:
      'Issue #77 (operator 2026-07-11): the textbook given «נתון: BC = 35/√32» could not be entered (the workaround was converting to a decimal by hand). No stated-VALUE position had a QUOTIENT grammar — each carried its own partial regex (bare number / coef·√ / …). Fix (ADR-298): the shared `NUMEXPR` concrete-value atom (the ADR-285 coefficient vocabulary one seam over) lowers a quotient value in the length / area / perimeter / radius positions, emitting a `measure-length` with the computed value AND the VERBATIM radical-fraction text — so the figure shows «35/√32», never «6.19», and the droppedGivenNumbers honesty gate stays green off the verbatim text. This replays the operator’s exact utterance and asserts |BC| = 35/√32 with the label text kept.',
    steps: ['משולש ABC', 'נתון: BC = 35/√32'],
    check(fig) {
      allStepsOk(fig);
      // The value drives the length; the verbatim-text preservation is unit-tested (radical-fraction-values).
      expect(dist(at(fig, 'B'), at(fig, 'C')), '|BC| = 35/√32').toBeCloseTo(35 / Math.sqrt(32), 4);
    },
  },
  {
    id: 'right-angle-word-and-glyph-forms',
    title: 'the ∡ glyph + ⁰ superscript right-angle form builds ∠ABC = 90 (#45)',
    guards:
      'Issue #45 (log-triage 2026-07-11, ~4 prod users): four right-angle input families failed on HEAD — the ∡ (U+2221) / ∢ (U+2222) angle glyphs and the ⁰ (U+2070) superscript degree; uppercase Cyrillic homoglyph labels; the WORD form «זוית B ישרה» / «angle ABC is a right angle»; and a lowercase vertex «נתון זווית d=90». Fix (ADR-299): a symbol-normalization pass at the parse-entry chokepoint (∡/∢→∠, ⁰→°, Cyrillic→Latin — every rule inherits at once) + the `angle` rule reads the «ישרה»/«right angle» word as 90 and adopts a lone lowercase vertex (the `נתון` prefix already worked — the real cause was the lowercase `d`). This replays the headline glyph+superscript form end-to-end; the word / Cyrillic / lowercase forms are locked in `right-angle-forms.test.ts`.',
    steps: ['משולש ABC', '∡ABC=90⁰'],
    check(fig) {
      allStepsOk(fig);
      const pv = at(fig, 'B'), pa = at(fig, 'A'), pc = at(fig, 'C');
      const u = { x: pa.x - pv.x, y: pa.y - pv.y }, w = { x: pc.x - pv.x, y: pc.y - pv.y };
      const deg = (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))))) * 180) / Math.PI;
      expect(deg, '∠ABC = 90 (∡ glyph + ⁰ superscript read as ∠…=90)').toBeCloseTo(90, 3);
    },
  },
  {
    id: 'q4-external-secant-and-on-circle-parallel',
    title: 'bagrut 2023-קיץ-א Q4 construction: מ-B secant + D על המעגל keep working (#96, #97)',
    guards:
      'Operator building the real Q4 (tangent from external B at C; a line from B cuts the circle at E and A; D on the circle with CD∥EA). Two gaps blocked it: (#96/ADR-300) the abbreviated «מ-B» external-point cue was not-handled (only «מנקודה B» worked), and (#97/ADR-301) «D על המעגל כך ש-CD מקביל ל-EA» DROPPED the «D על המעגל» membership so D floated free. This replays the construction with the abbreviated forms and asserts E, A land on the circle (secant) and D is ON the circle while CD∥EA holds.',
    steps: [
      'מעגל O',
      'C על המעגל',
      'מנקודה B מחוץ למעגל מעבירים משיק למעגל בנקודה C',
      'מ-B יוצא ישר החותך את המעגל בנקודות E ו A',
      'D על המעגל כך ש-CD מקביל ל-EA',
    ],
    check(fig) {
      allStepsOk(fig);
      // C, E, A, D all lie on circle O — geometric check (equidistant from the centre), robust to point kind.
      const O = at(fig, 'O');
      const r = dist(O, at(fig, 'C'));
      for (const id of ['E', 'A', 'D']) expect(dist(O, at(fig, id)), `${id} is on circle O`).toBeCloseTo(r, 3);
      // CD ∥ EA actually holds in the built figure (#97 kept the membership AND the parallel)
      const C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), A = at(fig, 'A');
      const cross = (D.x - C.x) * (A.y - E.y) - (D.y - C.y) * (A.x - E.x);
      const scale = Math.hypot(D.x - C.x, D.y - C.y) * Math.hypot(A.x - E.x, A.y - E.y);
      expect(Math.abs(cross) / (scale || 1), 'CD ∥ EA').toBeLessThan(1e-3);
    },
  },
  {
    id: 'tangent-through-oncircle-point-then-back-reference',
    title: 'bagrut 2025 two-circle figure: tangent THROUGH the intersection point A, then "המשיק חותך את המעגל ב-K" (#100)',
    guards:
      'Operator prod report 2026-07-12 (the 2025 bagrut, two intersecting circles): «דרך הנקודה A העבירו משיק למעגל» fell through every tangent rule (the through-point clause named no touch: tangentLine read the touch only from an at-clause or a named segment, while tangentFromExternal correctly DEFERRED on the on-circle apex — the designed ADR-233 handoff had no receiving lane), and the follow-up «המשיק חותך את מעגל P בנקודה K» — a DEFINITE back-reference to the drawn tangent — had no rule at all (lineLineIntersection then \'stop\'s on משיק → not-handled). Fix (#100): tangentLine gains the membership-gated through-point touch source, and theTangentMeetsCircle resolves THE unique tan-* line from context and lowers to line∩circle avoiding the touch. This replays the operator\'s construction; K must land on the big circle and the tangency (OA ⟂ AK) must hold.',
    steps: [
      'מעגל O',
      'מעגל P',
      'O נמצאת על מעגל P',
      'A היא אחת מנקודות החיתוך של מעגל O ומעגל P',
      'דרך הנקודה A העבירו משיק למעגל O',
      'המשיק חותך את מעגל P בנקודה K',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), K = at(fig, 'K'), P = at(fig, 'P');
      // K lies on the big circle (its radius is |P·O| — O rides it), away from the shared point A
      expect(dist(P, K), 'K on the big circle').toBeCloseTo(dist(P, O), 5);
      expect(dist(K, A)).toBeGreaterThan(0.1);
      // the drawn line is TANGENT to the small circle at A: radius OA ⟂ the chord AK
      const dot = (O.x - A.x) * (K.x - A.x) + (O.y - A.y) * (K.y - A.y);
      expect(Math.abs(dot), 'OA ⟂ AK (tangency at A)').toBeLessThan(1e-6);
    },
  },
  {
    id: 'bagrut-2025-two-circles-full-figure',
    title: 'the FULL 2025-bagrut two-circle figure: radius symbols R/r + R>r + region-inside E + the tangent clauses + R=1.5r (#54, #99, #100)',
    guards:
      'Operator prod report 2026-07-12 — the whole question could not be built: «we are missing the ability to say רדיוס מעגל O הוא R» (+ R>r untried, #54), «E is inside a triangle — this is tricky» (#99), and the tangent had to be worked around (#100). This is the complete figure typed as a student would: two circles with SYMBOLIC radii R (big, P) and r (small, O), the R>r order, O on the big circle, A a circle∩circle crossing, the tangent to the small circle THROUGH A cutting the big circle at K, triangle KAO, E on the small circle INSIDE the triangle, the part-ב continuation (המשך AE cuts OK at M — M must land WITHIN segment OK), and the part-ד size relation R = 1.5r. Asserts the printed figure’s geometry: the ratio holds exactly, E is on circle O and inside △KAO, OA ⟂ AK (tangency), K on the big circle, M within OK.',
    steps: [
      'מעגל P שרדיוסו R',
      'מעגל O שרדיוסו r',
      'R > r',
      'הנקודה O נמצאת על מעגל P',
      'A היא אחת מנקודות החיתוך של מעגל O ומעגל P',
      'דרך הנקודה A העבירו משיק למעגל O',
      'המשיק חותך את מעגל P בנקודה K',
      'משולש KAO',
      'הנקודה E נמצאת על מעגל O בתוך המשולש KAO',
      'המשך הקטע AE חותך את הקטע OK בנקודה M',
      'R = 1.5r',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), K = at(fig, 'K'), P = at(fig, 'P'), E = at(fig, 'E'), M = at(fig, 'M');
      // R = 1.5r — the stated ratio holds exactly between the two resolved radii
      const rBig = fig.circles.get('circle-P')!.r;
      const rSmall = fig.circles.get('circle-O')!.r;
      expect(rBig / rSmall, 'R = 1.5r').toBeCloseTo(1.5, 5);
      expect(rBig, 'R > r').toBeGreaterThan(rSmall);
      // O on the big circle; A on both circles
      expect(dist(P, O)).toBeCloseTo(rBig, 5);
      expect(dist(P, A)).toBeCloseTo(rBig, 5);
      expect(dist(O, A)).toBeCloseTo(rSmall, 5);
      // the tangent at A: OA ⟂ AK, K on the big circle, away from A
      expect(dist(P, K), 'K on the big circle').toBeCloseTo(rBig, 5);
      expect(dist(K, A)).toBeGreaterThan(0.1);
      const dot = (O.x - A.x) * (K.x - A.x) + (O.y - A.y) * (K.y - A.y);
      expect(Math.abs(dot), 'OA ⟂ AK').toBeLessThan(1e-6);
      // E on the small circle AND inside triangle KAO (the #99 region requirement)
      expect(dist(O, E), 'E on the small circle').toBeCloseTo(rSmall, 5);
      const insideKAO = (() => {
        // same-side test vs each edge (KAO is a triangle)
        const sgn = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
          Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
        const s1 = sgn(E, K, A), s2 = sgn(E, A, O), s3 = sgn(E, O, K);
        return s1 === s2 && s2 === s3;
      })();
      expect(insideKAO, 'E inside triangle KAO').toBe(true);
      // part ב: M = the continuation of AE crossing OK, WITHIN segment OK (and beyond E on ray A→E)
      const tOK = ((M.x - O.x) * (K.x - O.x) + (M.y - O.y) * (K.y - O.y)) / dist(O, K) ** 2;
      expect(tOK, 'M within segment OK').toBeGreaterThan(0.02);
      expect(tOK, 'M within segment OK').toBeLessThan(0.98);
    },
  },
  {
    id: 'bagrut-2025-verbatim-unnamed-circles',
    title: 'the 2025 bagrut in its VERBATIM wording — unnamed circles referenced as «המעגל הגדול/הקטן» (#102)',
    guards:
      'Operator ruling 2026-07-13: «when we say המעגל הגדול או הקטן we should translate it to a R>r like constraint». The exam never names its circles — it says «מעגל גדול שרדיוסו R», «מעגל קטן שמרכזו בנקודה O ורדיוסו r», then refers to them as «המעגל הגדול/הקטן» throughout; before #102 those references dead-ended (rules see no named centre and 2 circles → defer → LLM). Now `resolveSizeQualifier` rewrites each definite qualifier to the concrete circle (recorded roles first, else assigned from the drawn sizes — the creation adjectives seed the split) and the FIRST assigning use appends the locking `set-radius-order`, so sampling can never swap which circle is the big one. This is the exam question in its published wording, end-to-end.',
    steps: [
      'מעגל קטן שמרכזו בנקודה O ורדיוסו r',
      'מעגל גדול שרדיוסו R',
      'הנקודה O נמצאת על המעגל הגדול',
      'A היא אחת מנקודות החיתוך של המעגל הגדול והמעגל הקטן',
      'דרך הנקודה A העבירו משיק למעגל הקטן',
      'המשיק חותך את המעגל הגדול בנקודה K',
      'משולש KAO',
      'הנקודה E נמצאת על המעגל הקטן בתוך המשולש KAO',
      'המשך הקטע AE חותך את הקטע OK בנקודה M',
      'R = 1.5r',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), K = at(fig, 'K'), P = at(fig, 'P'), E = at(fig, 'E'), M = at(fig, 'M');
      const rBig = fig.circles.get('circle-P')!.r;
      const rSmall = fig.circles.get('circle-O')!.r;
      expect(rBig / rSmall, 'R = 1.5r').toBeCloseTo(1.5, 5);
      expect(rBig, 'R > r (the qualifier-assigned order)').toBeGreaterThan(rSmall);
      expect(dist(P, O), 'O on the big circle').toBeCloseTo(rBig, 5);
      expect(dist(O, A), 'A on the small circle').toBeCloseTo(rSmall, 5);
      expect(dist(P, K), 'K on the big circle').toBeCloseTo(rBig, 5);
      const dot = (O.x - A.x) * (K.x - A.x) + (O.y - A.y) * (K.y - A.y);
      expect(Math.abs(dot), 'OA ⟂ AK (tangency at A)').toBeLessThan(1e-6);
      expect(dist(O, E), 'E on the small circle').toBeCloseTo(rSmall, 5);
      const sgn = (p: Vec, a: Vec, b: Vec) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
      expect(sgn(E, K, A) === sgn(E, A, O) && sgn(E, A, O) === sgn(E, O, K), 'E inside triangle KAO').toBe(true);
      const tOK = ((M.x - O.x) * (K.x - O.x) + (M.y - O.y) * (K.y - O.y)) / dist(O, K) ** 2;
      expect(tOK > 0.02 && tOK < 0.98, 'M within segment OK').toBe(true);
    },
  },
  {
    id: 'intersection-of-the-circles-binds-existing',
    title: 'a definite plural «נקודת החיתוך של המעגלים» binds the two existing circles, no third invented (#111)',
    guards:
      'Operator report 2026-07-13: with circle O and circle P drawn, «A נקודות חיתוך בין המעגלים» invented a third circle-Q and intersected O with it, ignoring P. `definiteTwoCircles` (ADR-307) binds the two existing circles when the reference is a definite plural with no letters. This replays the operator sequence and asserts the figure has EXACTLY the two circles it drew, with A on both.',
    steps: ['מעגל O', 'מעגל P', 'A היא נקודת החיתוך של המעגלים'],
    check(fig) {
      allStepsOk(fig);
      const circleIds = fig.construction.objects.filter((o) => o.kind === 'circle').map((o) => o.id).sort();
      expect(circleIds, 'exactly the two drawn circles — no third invented').toEqual(['circle-O', 'circle-P']);
      // A lies on both circles (equidistant from each centre at its radius)
      const A = at(fig, 'A'), O = at(fig, 'O'), P = at(fig, 'P');
      expect(dist(A, O)).toBeCloseTo(fig.circles.get('circle-O')!.r, 3);
      expect(dist(A, P)).toBeCloseTo(fig.circles.get('circle-P')!.r, 3);
    },
  },
  {
    id: 'extension-crossing-then-midpoint-given',
    title: 'the 2025-bagrut part-ב given «M אמצע OK» on the AE-extension∩OK crossing flexes E so M bisects OK (#110)',
    guards:
      'Operator report 2026-07-13: the book given «נתון כי M אמצע OK» could not be drawn — M (=AE-extended ∩ OK) restated as the midpoint of OK reported over-constrained, though a valid E exists (closed-form). Root cause (ADR-308): the soft `collinear-order` from the "המשך AE חותך OK" step (onSeg2) had over-recruited O and the radii as its carriers, so (1) `freeCarrierAncestor` skipped the upstream free E as "already solving" and (2) the generic 2-D `coincide(M, midpoint)` can`t be zeroed by a 1-D driven carrier. Fix: a collinear midpoint lowers to the 1-D equidistance |OM|=|MK|, driven by E (reachable past soft-order carriers), freeing the soft orders that ride the optimizer. This replays the FULL exam + the midpoint given and asserts M bisects OK while every other relation holds.',
    steps: [
      'מעגל קטן שמרכזו בנקודה O ורדיוסו r',
      'מעגל גדול שרדיוסו R',
      'הנקודה O נמצאת על המעגל הגדול',
      'A היא אחת מנקודות החיתוך של המעגל הגדול והמעגל הקטן',
      'דרך הנקודה A העבירו משיק למעגל הקטן',
      'המשיק חותך את המעגל הגדול בנקודה K',
      'משולש KAO',
      'הנקודה E נמצאת על המעגל הקטן בתוך המשולש KAO',
      'המשך הקטע AE חותך את הקטע OK בנקודה M',
      'M אמצע OK',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), K = at(fig, 'K'), P = at(fig, 'P'), E = at(fig, 'E'), M = at(fig, 'M');
      // the part-ב given: M is the midpoint of OK
      expect(dist(O, M), 'M bisects OK: |OM| = |MK|').toBeCloseTo(dist(M, K), 3);
      // …reached by flexing E, with every earlier relation intact
      const rSmall = fig.circles.get('circle-O')!.r, rBig = fig.circles.get('circle-P')!.r;
      expect(dist(O, E), 'E still on the small circle').toBeCloseTo(rSmall, 3);
      expect(dist(P, K), 'K still on the big circle').toBeCloseTo(rBig, 3);
      const dot = (O.x - A.x) * (K.x - A.x) + (O.y - A.y) * (K.y - A.y);
      expect(Math.abs(dot), 'OA ⟂ AK still holds (tangency)').toBeLessThan(1e-4);
      // A, E, M stay collinear (M is on the AE extension)
      const cr = (E.x - A.x) * (M.y - A.y) - (E.y - A.y) * (M.x - A.x);
      expect(Math.abs(cr) / (dist(A, E) * dist(A, M) || 1), 'A, E, M collinear').toBeLessThan(1e-3);
    },
  },
  {
    id: 'central-angle-valueless-and-valued',
    title: 'issue #106 (central angle): «זוית מרכזית COD» marks the angle at centre O; a value drives it',
    guards:
      'prod log-triage 2026-07-13 (~2 users): «זוית מרכזית COD» / «זוית מרכזית נשענת על קשת CD» / «זוית COD» all returned not-handled — there was no central-angle construct. Fix (ADR-323): a `centralAngle` rule resolves the centre (the middle letter, or implicitly from the arc endpoints\' circle, ADR-029), draws the two radii (so the centre shows, FR-RN-8), and either sets the angle (a value → `set-angle`, drives on-circle points) or marks it (valueless → `mark-angle`, FR-RN-7).',
    steps: ['מעגל O', 'C על המעגל', 'D על המעגל', 'זוית מרכזית COD = 80'],
    check: (fig) => {
      allStepsOk(fig);
      // the central angle at O between OC and OD is driven to 80°
      const O = at(fig, 'O'), C = at(fig, 'C'), D = at(fig, 'D');
      const u = { x: C.x - O.x, y: C.y - O.y }, w = { x: D.x - O.x, y: D.y - O.y };
      const deg = (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)))))) * 180 / Math.PI;
      expect(deg, '∠COD driven to 80°').toBeCloseTo(80, 1);
      // C, D still on the circle (radii OC, OD are true radii)
      const r = fig.circles.get('circle-O')!.r;
      expect(dist(O, C), 'C on circle O').toBeCloseTo(r, 3);
      expect(dist(O, D), 'D on circle O').toBeCloseTo(r, 3);
      // the angle is marked at O and labelled 80°
      expect(fig.angleMarks.some((m) => m.vertex === 'O'), 'angle mark at the centre O').toBe(true);
      expect(fig.labels.angles.some((a) => a.vertex === 'O' && a.text.includes('80')), '80° label at O').toBe(true);
    },
  },
  {
    id: 'unknown-circle-name-binds-unnamed-circle',
    title: 'issue #186 (hqxbjh0x): «מעגל O1» / «מעגל O2» BIND the two unnamed intersecting circles — naming-by-use, never an invented circle',
    guards:
      'prod session hqxbjh0x (2026-07-17): after «שני מעגלים נחתכים» (auto centres HIDDEN, FR-RN-8 — the student cannot know the internal names O/P) the student referred to the circles as O1 and O2. The parser accepted the names purely textually and INVENTED new circles (`withImplicitCircles`) — a wrong figure shown green — and in the session\'s state the E-statement surfaced the raw internal «unresolved dependencies for: E». Now (ADR-347) a fresh circle name binds an UNNAMED circle: a stated-membership signal first (D,F already ride the right circle → it becomes O1), then the sole remaining unnamed circle (→ O2); the binding is the #112 nameCentre rename, so the centres reveal under the student\'s own names and later references resolve deterministically.',
    steps: [
      'שני מעגלים נחתכים',
      // the prod LLM step («מיתר DF במעגל הימני»): D,F onto the second circle by its internal token
      { llm: [
        { type: 'point-on-circle', id: 'D', circle: 'circle-P' },
        { type: 'point-on-circle', id: 'F', circle: 'circle-P' },
        { type: 'segment', a: 'D', b: 'F' },
      ] as AnyCommand[] },
      'D ו F על מעגל O1', // membership signal: D,F already ride circle-P → P is bound as O1
      'E ו C על מעגל O2', // one unnamed circle left → it is bound as O2; E,C become riders
    ],
    check: (fig) => {
      allStepsOk(fig); // never the raw "unresolved dependencies" refusal
      // exactly the two original circles, now carrying the student's names — no invented third/fourth
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.map((c) => c.id).sort(), 'the two circles ARE the student-named ones').toEqual(['circle-O1', 'circle-O2']);
      // the memberships the student stated hold geometrically
      const on = (p: Id, cid: Id) => {
        const c = fig.circles.get(cid)!;
        return Math.abs(dist(at(fig, p), c.center) - c.r);
      };
      for (const p of ['D', 'F'] as Id[]) expect(on(p, 'circle-O1'), `${p} on circle O1`).toBeLessThan(1e-6);
      for (const p of ['E', 'C'] as Id[]) expect(on(p, 'circle-O2'), `${p} on circle O2`).toBeLessThan(1e-6);
      // the bound centres are REVEALED under the student's names (naming-by-use = a real naming)
      expect(circles.some((c) => (c as { autoCenter?: boolean }).autoCenter), 'no hidden auto centre remains').toBe(false);
    },
  },
  {
    id: 'chord-in-the-right-circle',
    title: 'issue #188 (hqxbjh0x): «מיתר DF במעגל הימני» resolves the RIGHT circle deterministically — a pointing gesture, no LLM',
    guards:
      'prod session hqxbjh0x: with two unnamed intersecting circles the student’s first instinct — «מיתר DF במעגל הימני» — had no deterministic rule (directional qualifiers were missing from the ADR-244 family), so it burned a paid LLM call that resolved the circle by prompt luck. ADR-349: «המעגל הימני/השמאלי» / right|left resolve by the circles’ drawn centre x-positions at the resolveCenter/resolveMentionedCircle chokepoints (every circle-consuming rule at once), deliberately as a POINTING gesture (no standing side constraint — the landed membership is what persists).',
    steps: ['שני מעגלים נחתכים', 'מיתר DF במעגל הימני'],
    check: (fig) => {
      allStepsOk(fig);
      const circles = [...fig.circles.entries()].filter(([id]) => !id.startsWith('~'));
      expect(circles.length).toBe(2);
      // D,F were bound at UTTERANCE time to the then-rightmost circle (that pick is locked at the
      // command level in directional-circle.test.ts). Across every DISPLAYED config they stay with
      // THAT circle — the pointing-gesture semantics: no standing side lock, so a resampled seed may
      // legitimately swap which circle is drawn further right (ADR-349).
      const carrier = circles.find(([, c]) => (['D', 'F'] as Id[]).every((p) => Math.abs(dist(at(fig, p), c.center) - c.r) < 1e-6));
      expect(carrier, 'D and F ride one common circle in every config').toBeDefined();
    },
  },
  {
    id: 'angle-bound-is-a-region-not-an-equality',
    title: 'issue #277 (P1): «∠ABC > 40» BOUNDS the angle — it never commits «∠ABC = 40»',
    guards:
      'the operator asked whether «40 < α < 60» works; probing it found worse — a ONE-SIDED bound on a spelled-out angle silently committed the EQUALITY at the bound. `angle` (parse.ts) strips the angle keyword and takes the first number in whatever remains, with no regard for the operator between, so «∠ABC > 40» lowered to set-angle 40: the strongest reading of a bound, asserted as a given the student never gave, row green and verifier happy. No older honesty gate could see it — every label lands, the single number lands, no relation symbol is present; only the OPERATOR was lost. ADR-390: acuteness (an angle bounded against the constant 90, ADR-108) generalizes to a stated bound, `measureBound` owns every comparison form, `angle` refuses a comparison outright, and `droppedComparison` closes the class at the commit boundary.',
    steps: ['משולש ABC', '∠ABC > 40'],
    check: (fig) => {
      allStepsOk(fig);
      // the bound HOLDS — and, being a region, it leaves the angle free rather than pinning it to 40
      const a = angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C'));
      expect(a, 'the angle respects its lower bound').toBeGreaterThan(40);
      // the P1 itself: what reached the ENGINE is a region, never the equality at the bound
      const cons = fig.construction.constraints;
      expect(cons.some((c) => c.type === 'angle'), 'a bound must never become an angle EQUALITY').toBe(false);
      expect(cons.some((c) => c.type === 'angle-bound'), 'the bound is what got recorded').toBe(true);
    },
  },
  {
    id: 'angle-range-keeps-the-angle-inside',
    title: 'issue #277 / ADR-390: «40 < ∠ABC < 60» is a RANGE — every configuration shown stays inside it',
    guards:
      'the range form is the one the operator actually asked for. A range determines nothing (ADR-052): the angle stays a free, sampled DOF, so the risk is the opposite of the P1 — the figure drifting OUT of the stated window on a reseed, or the panel claiming a value for an angle that is only bounded. Modelled as ONE constraint carrying both ends (not two independent ones, whose 8° aim margins would fight inside a narrow window).',
    steps: ['משולש ABC', '40 < ∠ABC < 60'],
    check: (fig) => {
      allStepsOk(fig);
      const a = angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C'));
      expect(a, 'inside the stated range (lower)').toBeGreaterThan(40);
      expect(a, 'inside the stated range (upper)').toBeLessThan(60);
    },
  },
  {
    id: 'named-measure-bound-reshapes',
    title: 'issue #277 / ADR-390: «∠ABC = α» then «60 < α < 90» bounds whatever the symbol names',
    guards:
      'the operator’s literal request — label an angle α, then constrain α. The named form resolves through the SAME symbol table `α < β` (ADR-039) uses, so the bound lands on the measure the letter was bound to rather than needing its own machinery.',
    steps: ['משולש ABC', '∠ABC = α', '60 < α < 90'],
    check: (fig) => {
      allStepsOk(fig);
      const a = angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C'));
      expect(a, 'α respects its lower bound').toBeGreaterThan(60);
      expect(a, 'α respects its upper bound').toBeLessThan(90);
    },
  },
  {
    id: 'collinear-list-of-four-keeps-every-point',
    title: 'issue #348 / ADR-396: «B C F E נמצאות על ישר אחד» puts ALL FOUR on one line (the 4th was dropped)',
    guards:
      'the exact prod submit, which logged not-understood. The rule matched the whole list and then kept only the first three, because labelRun(s, n) returns EXACTLY n — so E was silently dropped, the droppedNewLabels gate caught the orphan, and the step went to the LLM, which failed. The engine already had the variadic set-line (ADR-050); the rule was emitting the narrow 3-slot command. Asserted geometrically, not just on the lowering: all four must actually be collinear in the built figure. The four points are created first BY DESIGN: a collinearity is a CONSTRAINT on existing points, not a construction — standalone, the long-standing glued «הישר ABCD» fails with the same "references an unknown point", so that is pre-existing family behaviour this fix deliberately leaves alone.',
    steps: ['נקודה B', 'נקודה C', 'נקודה F', 'נקודה E', 'B C F E נמצאות על ישר אחד'],
    check: (fig) => {
      allStepsOk(fig);
      const [B, C, F, E] = ['B', 'C', 'F', 'E'].map((id) => at(fig, id));
      // every point lies on the line through the first two (cross product ~ 0, scaled by the span)
      const span = Math.max(Math.hypot(C.x - B.x, C.y - B.y), 1e-9);
      for (const [name, p] of [['F', F], ['E', E]] as const) {
        const cross = Math.abs((C.x - B.x) * (p.y - B.y) - (C.y - B.y) * (p.x - B.x)) / span;
        expect(cross, `${name} lies on the line through B and C`).toBeLessThan(1e-6);
      }
    },
  },
  {
    id: 'q27-chords-equal-distances-drives',
    title: 'issue #150 / ADR-399: bagrut Q27 — «EF=EG» on the two-chords-through-E figure CLAIMS a DOF though the default draw already satisfies it',
    guards:
      "operator session qx5a19co: two chords AB, CD of circle O meet at E; the circle on diameter EO cuts them at F, G; given EF=EG. The DEFAULT placement is symmetric to machine epsilon (|EF|−|EG| ≈ 8e-15 before the equality is even typed), so the set-equal committed via main:primary as an UNOWNED CHECK — no DOF claimed, nothing re-solved per seed, and the constraint converged from exactly 1/64 seeds (the accidental draw itself). Detection ran on a 1-sample pool and the book labeling BE=DE was unreachable by 'show another configuration'. ADR-399: the accept path now probes with the real sampler and, when a probe blames the new constraint (ADR-398 violated attribution), assigns ownership with the standard recruiter (minimal marking — here D's on-circle θ) without moving the accepted figure. Post-fix: 64/64 seeds re-solve, ~27/64 displayable, both labelings reachable (per-seed health locked in src/replay/__tests__/basin-ownership.test.ts). This check asserts the DISPLAYED figure's geometric consequences — F, G are the chord midpoints (Thales: ∠EFO=90 ⇒ OF⟂AB) and EF=EG forces the chords equidistant from O, hence AB=CD.",
    steps: [
      'מעגל O',
      'AB מיתר',
      'CD מיתר',
      'AB ו CD נחתכים בנקודה E',
      'P אמצע EO',
      'קוטר מעגל P הוא EO',
      'מעגל P חותך את AB בנקודה F',
      'מעגל P חותך את DC בנקודה G',
      'EF=EG',
    ],
    check: (fig) => {
      allStepsOk(fig);
      const [E, F, G, A, B, C, D] = ['E', 'F', 'G', 'A', 'B', 'C', 'D'].map((id) => at(fig, id));
      const ef = dist(E, F);
      const eg = dist(E, G);
      expect(Math.abs(ef - eg), 'the stated given |EF| = |EG| holds').toBeLessThan(1e-3 * Math.max(ef, eg, 1e-9));
      // Thales on diameter EO: F and G are the feet of the perpendiculars from O — i.e. the chord MIDPOINTS
      expect(dist(A, F), 'F bisects chord AB').toBeCloseTo(dist(B, F), 3);
      expect(dist(C, G), 'G bisects chord CD').toBeCloseTo(dist(D, G), 3);
      // EF=EG ⇒ the chords are equidistant from the centre ⇒ equal chords
      const ab = dist(A, B);
      const cd = dist(C, D);
      expect(Math.abs(ab - cd), 'equal chords AB = CD (the forced consequence)').toBeLessThan(1e-3 * Math.max(ab, cd));
    },
  },
  {
    id: 'extend-verb-active-voice',
    title: 'issue #350 / ADR-403: «מאריכים את הצלע AB עד לנקודה D» — the active-voice extension builds the same figure as «D על המשך AB»',
    guards:
      'prod (log-triage 2026-07-26) escalated this to the LLM: the ADR-054 extension lane was gated on the extension NOUN, so the textbook’s own verb register never reached it. The end-to-end risk is not the parse but the ORDER — an extension must land D beyond B (A→B→D), never between A and B, and the continuation must be DRAWN.',
    steps: ['משולש ABC', 'מאריכים את הצלע AB עד לנקודה D'],
    check: (fig) => {
      allStepsOk(fig);
      const [A, B, D] = ['A', 'B', 'D'].map((id) => at(fig, id));
      // D is beyond B on ray A→B: collinear, and |AD| > |AB| with B between A and D
      const ab = dist(A, B);
      const ad = dist(A, D);
      const bd = dist(B, D);
      expect(ad, 'D lies beyond B (|AD| > |AB|)').toBeGreaterThan(ab);
      expect(ab + bd, 'A, B, D are collinear in that order').toBeCloseTo(ad, 6);
      // the stated continuation is visible (ADR-250 honesty §6)
      const hasBD = fig.construction.objects.some(
        (o) => o.kind === 'segment' && ((o.a === 'B' && o.b === 'D') || (o.a === 'D' && o.b === 'B')),
      );
      expect(hasBD, 'the extension leg B–D is drawn').toBe(true);
    },
  },
  {
    id: 'newlabel-collinear-rider',
    title: 'issue #402 / ADR-408: «ישר GFH» with H undefined CREATES H as a rider on line GF — the operator’s intended flow, no workaround',
    guards:
      'dev session 2je0eg0n (play-testing ADR-406): «ישר GFH» refused `references an unknown point` (and slowly — the #403 half); the operator had to define H first («H על CD») before the line statement worked. The M1 dual: a NEW label in a collinearity statement is DEFINED by it — created as an on-segment rider following the stated order (trailing ⇒ beyond the far anchor), its solve slot left FREE so a later constraint (the ∥ here) can drive it or its neighbours. The operator’s play then exposed #412: the rider was born with no `extension` flag, so the ∥ could not slide it or G and REFUSED — fixed at the creation site (ADR-414), which also retired this scenario’s #404 morph ratchet.',
    steps: ['טרפז ABCD', 'EF קטע אמצעים', 'DB', 'AC', 'G על המשך AB', 'ישר GFH', 'GH מקביל ל AD'],
    check: (fig) => {
      allStepsOk(fig);
      // #404 CLOSED by ADR-414: the ∥ slides the referenced extension rider G instead of recruiting the
      // free trapezoid vertex D and morphing the declared shape into a parallelogram (was ADR-165 amber).
      expect(fig.violations.map((v) => v.message).join('|'), 'the declared trapezoid is preserved — no morph').toBe('');
      const [A, D, G, F, H] = ['A', 'D', 'G', 'F', 'H'].map((id) => at(fig, id));
      // H exists ON line GF (the created rider), beyond F per the stated order G→F→H
      const cross = (P: Vec, Q: Vec, R: Vec) => (Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x);
      expect(Math.abs(cross(G, F, H)) / Math.max(dist(G, F), 1e-9), 'H rides line GF').toBeLessThan(1e-5);
      const t = ((H.x - G.x) * (F.x - G.x) + (H.y - G.y) * (F.y - G.y)) / (dist(G, F) ** 2);
      expect(t, 'H lies beyond F (G→F→H, the stated order)').toBeGreaterThan(1);
      // the stated ∥ drives
      const par = Math.abs(cross(G, H, { x: G.x + (D.x - A.x), y: G.y + (D.y - A.y) })) / Math.max(dist(G, H) * dist(A, D), 1e-9);
      expect(par, 'GH ∥ AD holds').toBeLessThan(1e-4);
    },
  },
  {
    id: 'newlabel-collinear-noun-last',
    title: 'issue #417 / ADR-415: «GFH ישר» (noun LAST) builds the same figure as «ישר GFH» — the collinearity family is order-free like its siblings',
    guards:
      'the operator’s play of PR #406 (2026-07-29): «ישר GFH» worked and «GFH ישר» did not — the collinearity rule demanded noun-first while the polygon family, the midsegment and the chord all take the noun on either side, so a natural register fell through to the paid LLM and came back not-understood. Locked end-to-end (not only at the parser) so the noun-last form keeps producing the created rider AND the drivability ADR-414 gave it.',
    steps: ['טרפז ABCD', 'EF קטע אמצעים', 'DB', 'AC', 'G על המשך AB', 'GFH ישר', 'GH מקביל ל AD'],
    check: (fig) => {
      allStepsOk(fig);
      expect(fig.violations.map((v) => v.message).join('|'), 'the declared trapezoid is preserved').toBe('');
      const [A, D, G, F, H] = ['A', 'D', 'G', 'F', 'H'].map((id) => at(fig, id));
      const cross = (P: Vec, Q: Vec, R: Vec) => (Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x);
      expect(Math.abs(cross(G, F, H)) / Math.max(dist(G, F), 1e-9), 'H rides line GF').toBeLessThan(1e-5);
      const t = ((H.x - G.x) * (F.x - G.x) + (H.y - G.y) * (F.y - G.y)) / (dist(G, F) ** 2);
      expect(t, 'H lies beyond F — the stated order G→F→H survives the word order').toBeGreaterThan(1);
      const par = Math.abs(cross(G, H, { x: G.x + (D.x - A.x), y: G.y + (D.y - A.y) })) / Math.max(dist(G, H) * dist(A, D), 1e-9);
      expect(par, 'GH ∥ AD holds').toBeLessThan(1e-4);
    },
  },
  {
    id: 'newlabel-collinear-rider-workaround-twin',
    title: 'issue #404: the same figure with H defined FIRST keeps the declared trapezoid too — the pre-#402 workaround flow',
    guards:
      'the twin #404 asked for: the morph was probe-verified on main in BOTH flows, so locking only the created-rider flow would leave the workaround order free to regress (a student who defines H first must get the same figure). H here is a genuine free rider on CD, so the ∥ has a carrier either way — the assertion is that the DECLARED trapezoid survives.',
    steps: ['טרפז ABCD', 'EF קטע אמצעים', 'DB', 'AC', 'G על המשך AB', 'H על CD', 'ישר GFH', 'GH מקביל ל AD'],
    check: (fig) => {
      allStepsOk(fig);
      expect(fig.violations.map((v) => v.message).join('|'), 'no shape morph in the workaround order either').toBe('');
      const [A, D, G, H] = ['A', 'D', 'G', 'H'].map((id) => at(fig, id));
      const cross = (P: Vec, Q: Vec, R: Vec) => (Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x);
      const par = Math.abs(cross(G, H, { x: G.x + (D.x - A.x), y: G.y + (D.y - A.y) })) / Math.max(dist(G, H) * dist(A, D), 1e-9);
      expect(par, 'GH ∥ AD holds').toBeLessThan(1e-4);
    },
  },
  {
    id: 'implied-circle-membership',
    title: 'issue #362 / ADR-409: «A ו-C נמצאות על המעגל» on a circle-less figure INTRODUCES the presupposed circle; «M מחוץ למעגל» then binds it',
    guards:
      'the single/list membership and side forms answered "which EXISTING circle?" (resolveCenter) and deferred to the LLM on a circle-less figure, while the glued pair and «מיתר» already introduced one — the ADR-367 implied-discipline adoption gap. The 2+-circle ambiguity bail and the #186 named-reference seam are locked unchanged in implied-circle-membership.test.ts.',
    steps: ['A ו-C נמצאות על המעגל', 'M מחוץ למעגל'],
    check: (fig) => {
      allStepsOk(fig);
      const circle = [...fig.circles.values()][0];
      expect(circle, 'the presupposed circle was minted and resolved').toBeTruthy();
      for (const id of ['A', 'C']) {
        const p = at(fig, id);
        expect(Math.abs(Math.hypot(p.x - circle.center.x, p.y - circle.center.y) - circle.r), `${id} rides the circle`).toBeLessThan(1e-6);
      }
      const M = at(fig, 'M');
      expect(Math.hypot(M.x - circle.center.x, M.y - circle.center.y), 'M is outside').toBeGreaterThan(circle.r);
    },
  },
  {
    id: 'plene-spelling-rhombus',
    title: 'issue #389 / ADR-405: «מעויין ABHD» (plene spelling) builds the rhombus — the spelling fold at normalizeUtterance',
    guards:
      'prod (log-triage 2026-07-28): one user typed the plene «מעויין» in both word orders and both escalated to the LLM, while the 3-D app’s cross-app guidance refers students to this tool with exactly that spelling. The fix is a fold at the orthography boundary, so EVERY rule inherits the variant; this scenario locks the exact prod utterance end-to-end (parse → replay → an actual rhombus, all four sides equal).',
    steps: ['מעויין ABHD'],
    check: (fig) => {
      allStepsOk(fig);
      const [A, B, H, D] = ['A', 'B', 'H', 'D'].map((id) => at(fig, id));
      const sides = [dist(A, B), dist(B, H), dist(H, D), dist(D, A)];
      for (const s of sides.slice(1)) {
        expect(Math.abs(s - sides[0]), 'all four sides equal (a rhombus, not a generic quad)').toBeLessThan(1e-6 * Math.max(s, sides[0]));
      }
    },
  },
  {
    id: 'midsegment-both-endpoints-anchored-prod-figure',
    title: 'issue #405 / ADR-411: «DE קטע אמצעים» with D,E ALREADY on their sides pins BOTH midpoints (the operator\'s prod figure, GE=3DG driving F)',
    guards:
      'prod save `bad-2d-1` (2026-07-29): «DE קטע אמצעים» after «D על AB»+«E על AC» fell through `midsegmentBaseless` (which handled only exactly-one-anchored) to the plain-segment rule — a bare `segment D E`, the given SILENTLY DROPPED, every row ✓ (masked at seed 0 by the rider sampling at t=0.5). A 6-ref worktree sweep back to ADR-199\'s birth showed the bare-segment claim byte-identical at every prod tag — a hole since the rule was born, never a regression. Root fix: the DETERMINED both-anchored lowering (one midpoint pin per endpoint, host-agnostic) + the `droppedMidsegment` chokepoint gate so NO midsegment-flavoured utterance can ever commit without midpoint semantics.',
    steps: ['משולש ABC', 'D על AB', 'E על AC', 'DE קטע אמצעים', 'F על BC', 'AF', 'G = חיתוך DE ו-AF', 'GE=3DG'],
    check(fig) {
      allStepsOk(fig);
      const [A, B, C, D, E, F, G] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => at(fig, id));
      expect(Math.abs(dist(A, D) - dist(D, B)), 'D is the midpoint of AB').toBeLessThan(1e-6);
      expect(Math.abs(dist(A, E) - dist(E, C)), 'E is the midpoint of AC').toBeLessThan(1e-6);
      // DE is a real midsegment: parallel to BC (was: an unconstrained segment that only LOOKED right).
      const de = { x: E.x - D.x, y: E.y - D.y }, bc = { x: C.x - B.x, y: C.y - B.y };
      expect(Math.abs(de.x * bc.y - de.y * bc.x) / (Math.hypot(de.x, de.y) * Math.hypot(bc.x, bc.y)), 'DE ∥ BC').toBeLessThan(1e-4);
      // The stated ratio holds and DRIVES F: DG/GE = BF/FC (similarity through the midsegment), so GE=3DG ⇒ FC=3BF.
      expect(Math.abs(dist(G, E) - 3 * dist(D, G)), '|GE| = 3|DG| holds').toBeLessThan(1e-4 * dist(D, E));
      expect(Math.abs(dist(F, C) - 3 * dist(B, F)), 'the ratio drove F to the quarter point of BC').toBeLessThan(1e-3 * dist(B, C));
    },
  },
  {
    id: 'midsegment-bare-binds-the-one-triangle',
    title: 'issue #405 / ADR-411 + #407 / ADR-412: bare «DE קטע אמצעים» binds to THE triangle; the later «D על AC» re-seats the default rider',
    guards:
      'operator screenshot (2026-07-29): the zero-anchored bare form fell through to the plain-segment rule — D and E minted as FREE points, E floating off the triangle, all rows ✓. Fix: with exactly ONE triangle in the figure the utterance binds to it (the ADR-245 definite-reference pattern, the #71 decomposition), and the rule\'s default side for D (the stored first side) YIELDS to the student\'s later explicit «D על AC» via the ADR-412 pre-scan (rider + shape-variant re-anchored, structurally identified by the shared group).',
    steps: ['משולש ABC', 'DE קטע אמצעים', 'D על AC'],
    check(fig) {
      allStepsOk(fig);
      const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((id) => at(fig, id));
      expect(Math.abs(dist(A, D) - dist(D, C)), 'D re-seated: the midpoint of AC (the stated side)').toBeLessThan(1e-6);
      const eMidAB = Math.abs(dist(A, E) - dist(E, B)) < 1e-6;
      const eMidCB = Math.abs(dist(C, E) - dist(E, B)) < 1e-6;
      expect(eMidAB || eMidCB, 'E is the midpoint of one of the other two sides (cyclable)').toBe(true);
      const areaABC = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
      expect(areaABC, 'the triangle stayed a triangle').toBeGreaterThan(1);
      const de = { x: E.x - D.x, y: E.y - D.y };
      const base = eMidAB ? { x: B.x - C.x, y: B.y - C.y } : { x: B.x - A.x, y: B.y - A.y };
      expect(Math.abs(de.x * base.y - de.y * base.x) / (Math.hypot(de.x, de.y) * Math.hypot(base.x, base.y)), 'DE ∥ the opposite side').toBeLessThan(1e-3);
    },
  },
  {
    id: 'midsegment-restated-side-reseats-never-collapses',
    title: 'issue #407 / ADR-412: «DE קטע אמצעים במשולש ABC» then «D על AC» re-seats D — the triangle never flattens',
    guards:
      'operator screenshot (2026-07-29): the #71 named-triangle branch seats D on the FIRST named side AB and pins it to that midpoint; the later explicit «D על AC» STACKED as a membership constraint, and the solver satisfied `mid(AB) ∈ AC` by flattening the whole triangle onto one line — area exactly 0, all rows ✓, no notice (prod since 2026-07-14; before that the form escalated to the LLM). The M4 defaults-yield fix: the pre-scan re-seats the rule-made rider (structural: it shares the shape-variant\'s GROUP) onto the stated side, so the statement WINS instead of contradicting the default. The degeneracy half is #408/ADR-413 (`collapse-gate.test.ts`).',
    steps: ['משולש ABC', 'DE קטע אמצעים במשולש ABC', 'D על AC'],
    check(fig) {
      allStepsOk(fig);
      const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((id) => at(fig, id));
      expect(Math.abs(dist(A, D) - dist(D, C)), 'D is the midpoint of AC (the stated side won)').toBeLessThan(1e-6);
      const eMidAB = Math.abs(dist(A, E) - dist(E, B)) < 1e-6;
      const eMidCB = Math.abs(dist(C, E) - dist(E, B)) < 1e-6;
      expect(eMidAB || eMidCB, 'E is the midpoint of one of the other two sides').toBe(true);
      const areaABC = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
      expect(areaABC, 'NOT collapsed (was: every point on one line, area = 0)').toBeGreaterThan(1);
    },
  },
  {
    id: 'midpoint-membership-contradiction-refuses',
    title: 'issue #408 / ADR-413: «D אמצע AB» + «D על AC» is REFUSED honestly — never a silently flattened triangle',
    guards:
      'the degeneracy half of the operator\'s collapse screenshot, isolated from the yield: a constraint system whose only solutions flatten a DECLARED polygon used to be "solved" by collapse (every residual zero, green). The collapse check now rides the ONE step-accept predicate (`stepAccepted`, beside the #7 vacuous gate), so every accept path rejects a flattened figure and the failure ladder ends in the honest ADR-276 refusal naming the student\'s statement, keep-prior.',
    steps: ['משולש ABC', 'D אמצע AB', 'D על AC'],
    expectViolations: true, // the last step is INTENTIONALLY refused — the kept figure is the prior one
    check(fig) {
      expect(fig.lastError, 'the honest over-constrained refusal').toMatch(/over-constrained|cannot hold|לא ניתן/);
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(fig, id));
      const areaABC = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
      expect(areaABC, 'the prior triangle is kept intact').toBeGreaterThan(1);
      expect(Math.abs(dist(A, D) - dist(D, B)), 'D stays the midpoint of AB').toBeLessThan(1e-6);
    },
  },
  {
    id: 'unnamed-concurrency-point',
    title: 'issue #363 / ADR-418: «נקודת מפגש האלכסונים» with no label builds the crossing, auto-named M',
    guards:
      '`specialPointMeet` resolved the meet verb, the centre family and the host polygon and then bailed on `if (!X) return null` for want of a visible NAME — so a determined construction escalated to the paid LLM. Every command it emits is fixed without the label; the grammar already auto-names elsewhere (the midsegment endpoints, ADR-263’s altitude foot).',
    steps: ['ריבוע ABCD', 'נקודת מפגש האלכסונים'],
    check: (fig) => {
      allStepsOk(fig);
      const [A, B, C, D, M] = ['A', 'B', 'C', 'D', 'M'].map((id) => at(fig, id));
      expect(M, 'the crossing was created and labelled M').toBeTruthy();
      // the diagonal crossing of a square is equidistant from all four vertices
      for (const v of [B, C, D]) expect(dist(M, v), 'M is the centre').toBeCloseTo(dist(M, A), 6);
    },
  },
];
