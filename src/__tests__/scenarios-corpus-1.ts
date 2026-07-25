/**
 * Scenario corpus CHUNK 1/4 (S4.1b of docs/24 — the 6,253-line single file split to kill the
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
import { isGeoPoint, freeDofs } from '@/engine';
import { buildScene } from '@/render/scene';
import type { SceneSegment } from '@/render/scene';
import { crossingCommands } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';

import type { Scenario } from './scenarios-harness';
import { at, dist, angle, allStepsOk } from './scenarios-harness';

export const SCENARIOS_1: Scenario[] = [
  {
    id: 'points-on-different-sides-of-line',
    title: 'issue #265 (m01ophid): «נקודת C ו D נמצאות בצדדים שונים של AB» builds deterministically — C and D strictly on opposite sides in every shown config (ADR-389)',
    guards:
      'prod session m01ophid (2026-07-22): the side-of-a-LINE statement had no owner rule — it escalated to the LLM, whose decomposition was two bare free points (the relation dropped, both on the SAME side, committed green — the #266/ADR-387 honesty half). ADR-389: the pointsVsLine rule lowers it to the carrier segment + a relational points-line-side REQUIREMENT (the ADR-244 shape — verifier figure.v.lineSideDifferent/lineSideSame + meetsRequirements gate), apply seeds NEW subjects on their assigned sides in general position (phase-decorrelated so no unstated CD ⟂ AB shows), and an existing wrong-side free default is re-seated (M1).',
    steps: ['AB', 'נקודת C ו D נמצאות בצדדים שונים של AB'],
    check: (fig) => {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const A = at(fig, 'A');
      const B = at(fig, 'B');
      const side = (p: Id) => Math.sign((B.x - A.x) * (at(fig, p).y - A.y) - (B.y - A.y) * (at(fig, p).x - A.x));
      expect(side('C') * side('D'), 'C and D strictly on opposite sides of AB').toBe(-1);
    },
  },
  {
    id: 'apex-common-tangents-single-ink-run',
    title: 'issue #264 (m01ophid): each common tangent from apex A is ONE ownable ink run — hide/dash act on the whole line (ADR-388)',
    guards:
      'prod session m01ophid (2026-07-22): the apex common-tangent lowering draws BOTH the touch–touch segment and the spanning apex segment on one line (the derived apex lands beyond the SMALLER second circle, so «apex–T1» contains «T1–T2»). Hiding the spanning segment left the contained stretch drawn beneath ("it only hid AC") and its wide hit-line occluded the contained segment’s menu ("cannot hide the BC part"). ADR-388: the scene marks a collinearly-contained segment `covered` (no base ink, no hit-target — the maximal container owns the run), computed per configuration, so no static id choice at the lowering can double-ink again.',
    steps: ['שני מעגלים משיקים מבחוץ', 'מנקודה A יוצאים שני משיקים משותפים לשני המעגלים'],
    check: (fig) => {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const scene = buildScene(fig.construction, fig.positions);
      const contained = (T: SceneSegment, S: SceneSegment): boolean => {
        const len = Math.hypot(S.b.x - S.a.x, S.b.y - S.a.y);
        if (len < 1e-9) return false;
        const u = { x: (S.b.x - S.a.x) / len, y: (S.b.y - S.a.y) / len };
        const tol = 1e-6 * Math.max(1, len);
        const within = (p: { x: number; y: number }): boolean => {
          const dx = p.x - S.a.x;
          const dy = p.y - S.a.y;
          const along = dx * u.x + dy * u.y;
          return Math.abs(dx * u.y - dy * u.x) <= tol && along >= -tol && along <= len + tol;
        };
        return within(T.a) && within(T.b);
      };
      const live = scene.segments.filter((s) => !s.covered);
      for (const T of live)
        for (const S of live) {
          if (T !== S) expect(contained(T, S), `${T.id} double-inked under ${S.id}`).toBe(false);
        }
      // each tangent’s touch–touch stretch rides UNDER the spanning apex segment — the carrier the
      // student’s hide click acts on covers the whole tangent
      expect(scene.segments.filter((s) => s.covered).length).toBe(2);
    },
  },
  {
    id: 'angle-alias-bare-digit-sign',
    title: '«נסמן זוית CAD כ 1» binds the vertex-letter alias and draws the digit sign — never a silent ∠CAD=1° (#262 P1 + #263, ADR-386 Am.)',
    guards:
      "Operator prod play-test of #235 (2026-07-22, the screenshot figure — triangle ABC, D on CB, cevian AD): «נסמן זוית CAD כ 1» silently parsed as SET-ANGLE ∠CAD=1° (the naming-shaped utterance fell through to the value rule, which read the digit as degrees; «כ-1» even gave −1°, and the verb variants סימון/לסמן with «A1» read the 1 the same way). The alias rule is now ALL-OR-NOTHING for naming-shaped utterances (the ADR-024 leftover guard) with the widened verb/connector/decor grammar, a bare digit binds the canonical vertex-letter name (CAD כ 1 ⇒ A1), and the wedge sign renders the DIGIT alone (the vertex label already shows the letter — the operator's screenshot collision).",
    steps: ['משולש ABC', 'D על CB', 'AD', 'נסמן זוית CAD כ 1'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      expect(fig.construction.objects.find((o) => o.kind === 'angle-alias'), 'the canonical A1 binding').toMatchObject({ id: 'A1', vertex: 'A' });
      expect(fig.labels.angles.map((a) => a.text), 'the digit sign, not «A1»').toContain('1');
      expect(fig.construction.constraints.some((c) => c.type === 'angle'), 'no degree value was asserted').toBe(false);
    },
  },
  {
    id: 'angle-alias-book-notation',
    title: 'The book-74 figure through the A1/D1 subscript notation: «נסמן זוית ACB כ-C1» + «זוית C1 = זוית E1» (#235, ADR-386)',
    guards:
      "Prod session `ne810woo` (2026-07-20, book exercise 74): «∠C=∠BED» and «זוית C שווה לזוית BED» died not-understood — C carries three edges there, so even the ADR-164 single-vertex resolution is honestly ambiguous, which is exactly what the book's A1/B1 subscripts exist to solve, and the tool had no way to state them. Now: «נסמן זוית ACB כ-C1» binds the alias (arc + the C1 label on the wedge), «זוית C1 = זוית E1» resolves both names at the parse seam to the same set-angle-ratio the spelled-out triples produce, and the figure closes to the book values. Steps deliberately keep the operator's equality-before-membership order, so this scenario also re-locks the ADR-384 conversion composing with the alias flow.",
    steps: [
      'AB אנך ל CD',
      'B על CD',
      'BC=BE',
      'E על AB',
      'ED',
      'AC',
      'נסמן זוית ACB כ-C1',
      'נסמן זוית BED כ-E1',
      'זוית C1 = זוית E1',
      'CD=14',
      'BD=8',
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const [B, C, D, E] = ['B', 'C', 'D', 'E'].map((id) => at(fig, id));
      expect(dist(C, D)).toBeCloseTo(14, 1);
      expect(dist(B, D)).toBeCloseTo(8, 1);
      expect(dist(B, C)).toBeCloseTo(6, 1);
      expect(dist(B, E)).toBeCloseTo(6, 1);
      // The wedges carry their bound names — as DIGIT signs per #263 (the vertex labels show the letters);
      // the bindings themselves are the alias objects.
      const aliases = fig.construction.objects.filter((o) => o.kind === 'angle-alias').map((o) => o.id).sort();
      expect(aliases).toEqual(['C1', 'E1']);
      expect(fig.labels.angles.filter((a) => a.text === '1')).toHaveLength(2);
    },
  },
  {
    id: 'infeasible-quarter-circle-refuses-honestly',
    title: 'The quarter circle whose |OC|=|OD| is structurally impossible stays an HONEST red error, never a parked deferral (#207, ADR-385)',
    guards:
      "Prod session `3yrpvz14` (2026-07-18, the quarter-circle bagrut figure with D typed onto the LEG): with D on CB, ∠OCD = 90° forces |OD| > |OC| at every configuration, so «רבע מעגל ODC» can never hold — yet prod parked it as `deferred-constraint` («add the remaining givens»), asserting missing givens that could never help. The submit route used to consult only HALF the classifier's gate (`hasDeferrableConstraint` without `constraintIsPending`); `deferralWorthwhile` is now the ONE shared gate (App route + `classify`, the ADR-346 seam discipline), so this statement takes the honest-refusal route at submit — locked in deferral-gate.test.ts along with the ADR-104 early-⟂ control that must STAY deferral-worthy and the feasible D-on-AB twin (r=6). This scenario locks the committed-form honesty: replayed as facts, the figure reports the specific relation that cannot hold, and is NEVER classified pending.",
    steps: ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על CB', 'רבע מעגל ODC'],
    expectViolations: true,
    check(fig) {
      // The honest end state: the impossible relation is named, and the figure is NOT «waiting for givens».
      expect(fig.lastError, 'the specific refusal').toContain('cannot place O');
      expect(fig.pending, 'never the parked deferred-constraint info state').toBe(false);
      // The prior figure survives intact — the triangle and its sizes are untouched by the failed step.
      const [A, B, C] = ['A', 'B', 'C'].map((id) => at(fig, id));
      expect(dist(A, C)).toBeCloseTo(15, 1);
      expect(dist(B, C)).toBeCloseTo(10, 1);
    },
  },
  {
    id: 'equality-before-membership-order-independence',
    title: '«BC=BE» typed before «E על AB» builds the book figure — membership CONVERTS the busy free point (#236, ADR-384)',
    guards:
      "Prod session `ne810woo` (2026-07-20, book exercise 74 — AB⊥CD, B on CD, E on AB, BC=BE, ∠ACB=∠BED, CD=14, BD=8): the operator's typed order failed over-constrained on the angle and BD=8 (|BC| drew 1.61 instead of the book's 6) while the SAME set with «E על AB» first built perfectly. Root cause (M2 law (i)): «E על AB» about the existing busy free E lowered to a generic collinear that claimed ANOTHER free point (B!) as its carrier, leaving E a phantom 2-DOF — ownership spread across unrelated points until the later givens found every carrier busy. `reinterpretAsCollinear` now CONVERTS a free, non-pinned P into the on-segment rider the statement declares (t at P's projection, the ADR-140 directive carried whole) — the on-segment edition of apply's on-circle (c2). The four entry orders are locked in membership-conversion.test.ts; the sizes-early residual (an amber-settled driven constraint never re-enters the order-independence machinery) is #258.",
    steps: ['AB אנך ל CD', 'B על CD', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED', 'CD=14', 'BD=8'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((id) => at(fig, id));
      expect(dist(C, D)).toBeCloseTo(14, 1);
      expect(dist(B, D)).toBeCloseTo(8, 1);
      expect(dist(B, C)).toBeCloseTo(6, 1);
      expect(dist(B, E)).toBeCloseTo(6, 1);
      const dot = (E.x - A.x) * (D.x - C.x) + (E.y - A.y) * (D.y - C.y);
      expect(Math.abs(dot) / (dist(A, E) * dist(C, D)), 'AB ⊥ CD holds').toBeLessThan(0.02);
    },
  },
  {
    id: 'bare-crossing-statement-states-no-label',
    title: '«CD חותך את AB» with no point named STATES the crossing and invents no label (#241, ADR-383)',
    guards:
      "Operator session `i1mt2us8` (2026-07-21): the unnamed crossing statement escalated to the LLM and died not-understood — and the SAME sentence later returned a figure with an invented point M («AB חותך את CD» → `M חיתוך AB ו-CD`), a coin flip in what the figure contains. Reading (a), evidence-backed: the sentence lowers deterministically to the point-free `segments-cross` requirement (within both spans, the ADR-166 meaning) — NO label is created, the verifier + meetsRequirements keep every shown configuration crossing, and the ADR-380 forced-crossing dot then offers the naming.",
    steps: ['AB', 'CD חותך את AB'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      // reading (a): exactly the four stated points — nothing minted
      expect([...fig.positions.keys()].sort()).toEqual(['A', 'B', 'C', 'D']);
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(fig, id));
      const den = (D.x - C.x) * (B.y - A.y) - (D.y - C.y) * (B.x - A.x);
      expect(Math.abs(den), 'the segments are not parallel/collinear').toBeGreaterThan(1e-9);
      const t1 = ((A.x - C.x) * (B.y - A.y) - (A.y - C.y) * (B.x - A.x)) / den; // along C–D
      const t2 = ((A.x - C.x) * (D.y - C.y) - (A.y - C.y) * (D.x - C.x)) / den; // along A–B
      expect(t1, 'crossing within CD').toBeGreaterThan(0.02);
      expect(t1, 'crossing within CD').toBeLessThan(0.98);
      expect(t2, 'crossing within AB').toBeGreaterThan(0.02);
      expect(t2, 'crossing within AB').toBeLessThan(0.98);
    },
  },
  {
    id: 'segment-bisection-statement',
    title: '«CD חוצה את AB» — a segment BISECTED by another segment builds the midpoint + through-line (#240, ADR-382)',
    guards:
      "Operator session `i1mt2us8` (2026-07-21): «CD חוצה את AB» (and the mirrored «AB חוצה את CD») died not-understood on EVERY attempt — חוצה was wired only for the ANGLE sense (ADR-261), whose own comment names segment bisection as the deliberately-excluded case, and nothing downstream picked it up. Now an ADR-110 macro: auto-named midpoint of the object segment (ADR-263 freeLabel) + `set-line` through the subject (collinear + between) + the ADR-383 crossing requirement — so the default drawing reads as a genuine crossing, never the degenerate all-five-collinear solution of the bare collinearity (the issue's design note).",
    steps: ['AB', 'CD', 'CD חוצה את AB'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const [A, B, C, D, M] = ['A', 'B', 'C', 'D', 'M'].map((id) => at(fig, id));
      expect(dist(M, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }), 'M is the midpoint of AB').toBeLessThan(1e-6);
      const t = ((M.x - C.x) * (D.x - C.x) + (M.y - C.y) * (D.y - C.y)) / ((D.x - C.x) ** 2 + (D.y - C.y) ** 2);
      expect(t, 'M within CD').toBeGreaterThan(0.02);
      expect(t, 'M within CD').toBeLessThan(0.98);
      const perp = (p: Vec) => Math.abs((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y);
      expect(Math.max(perp(C), perp(D)), 'CD is a transversal, not collinear with AB').toBeGreaterThan(0.3);
    },
  },
  {
    id: 'clicked-crossing-stays-within-its-segments',
    title: 'A dot-named crossing keeps its within-the-segments meaning across configurations (#234, ADR-379)',
    guards:
      "Prod session `ne810woo` (2026-07-20, the book figure — M,N on BC, apexes A,D, the four cevians): the operator clicked the crossing of two cevians and named it O, then changed configuration; O left the drawn segments and the letter read as taken with no reclaim path. The dot is only ever OFFERED at a crossing interior to both operands, so the gesture states a within-the-ink meet — but `markIntersection` lowered it to the bare INFINITE-line crossing, which carries no such requirement (7 of the 15 displayable seeds put O outside both cevians). It now lowers through `crossingCommands` to the same `onSeg` requirement the typed «AN ו-DM נפגשים בנקודה O» produces, so `meetsRequirements` never shows a configuration where O has left the figure. The seed-sweep oracle runs this check at EVERY displayable seed — that is the lock.",
    steps: [
      'קטע BC',
      'M ו N על BC',
      'נקודה A',
      'נקודה D',
      'AM',
      'AN',
      'DM',
      'DN',
      // The dot click itself — through the real gesture seam, so a drift in the lowering fails here too.
      { llm: crossingCommands({ pos: { x: 0, y: 0 }, a: 'A', b: 'N', c: 'D', d: 'M' }, 'O') },
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const param = (p: Vec, a: Vec, b: Vec) =>
        ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      const O = at(fig, 'O');
      const t1 = param(O, at(fig, 'A'), at(fig, 'N'));
      const t2 = param(O, at(fig, 'D'), at(fig, 'M'));
      expect(t1, 'O strictly within cevian AN').toBeGreaterThan(0);
      expect(t1, 'O strictly within cevian AN').toBeLessThan(1);
      expect(t2, 'O strictly within cevian DM').toBeGreaterThan(0);
      expect(t2, 'O strictly within cevian DM').toBeLessThan(1);
    },
  },
  {
    id: 'circle-contained-in-definite-circle',
    title: '«מעגל מוכל בתוך המעגל הגדול» creates a NEW circle contained in THE drawn circle (#224, ADR-376)',
    guards:
      "Prod 0yqufnuv 09:23 (2026-07-20): the definite-container containment had no owner — the parser deferred, the LLM dropped the «מוכל» given (dropped-labels) and the bare «מעגל מוכל» came back not-understood. The #196 seam now resolves an INDEFINITE subject + a definite/named/implicit container (the #102 size-qualifier rewrite widened to a single-circle figure), emits the new inner circle + the contained requirement, and the sampler keeps it.",
    steps: ['AB קוטר', 'מעגל מוכל בתוך המעגל הגדול'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const cs = [...fig.circles.values()];
      expect(cs, 'the drawn circle + the new contained one').toHaveLength(2);
      const outer = cs[0].r >= cs[1].r ? cs[0] : cs[1];
      const inner = outer === cs[0] ? cs[1] : cs[0];
      expect(dist(outer.center, inner.center) + inner.r, 'strict containment holds on the drawn seed').toBeLessThan(outer.r);
    },
  },
  {
    id: 'second-bare-point-never-stacks',
    title: 'A second bare «נקודה X» lands in general position — never drawn exactly on an existing point (#232, ADR-378)',
    guards:
      "Prod eshsc843 (2026-07-20): every bare free point hard-coded the SAME (3,2), so «נקודה d» after «נקודה a» drew D exactly ON A — and the coincidence collector certified the stack (the ⓘ converge notice asserted a coincidence the student never stated, disarming the whole avoid machinery). Three fixes: the free-point apply chokepoint probes auto-placed coords to general position (ADR-253, identity when generic); the collector's forcedness split refuses to certify a BOTH-free default stack; the submit/edit auto-advance gates also fire on a distinctness break.",
    steps: ['Bc', 'Mו n על bc', 'נקודה a', 'Ab', 'Am', 'An', 'נקודה d'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A');
      const D = at(fig, 'D');
      expect(dist(A, D), 'D clearly OFF A').toBeGreaterThan(0.3);
      expect(
        (fig.coincidences ?? []).some(([a, b]) => (a === 'A' && b === 'D') || (a === 'D' && b === 'A')),
        'no false A–D coincidence certified',
      ).toBe(false);
    },
  },
  {
    id: 'bare-point-then-angle-ratio-stays-off-existing',
    title: '«נקודה d» + «Dc» + an angle ratio — D never sits visually on A (#232, ADR-378, prod quvq3txq)',
    guards:
      'Prod quvq3txq (2026-07-20): the same (3,2) stack; the final «זוית abc שווה לזוית dcb» recruit nudged D to |AD| ≈ 0.41 on a ~8-unit span — still visually on A, with the converge notice shown. With the general-position probe D starts clearly separated and the driven solve keeps it so.',
    steps: ['קטע mn', 'B על המשך nm', 'Cעל המשך mn', 'נקודה a', 'Ab', 'נקודה d', 'Dc', 'זוית abc שווה לזוית dcb'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A');
      const D = at(fig, 'D');
      expect(dist(A, D), 'D clearly OFF A').toBeGreaterThan(0.3);
      expect(
        (fig.coincidences ?? []).some(([a, b]) => (a === 'A' && b === 'D') || (a === 'D' && b === 'A')),
        'no false A–D coincidence certified',
      ).toBe(false);
    },
  },
  {
    id: 'tangent-at-existing-touch-carries-membership',
    title: '«AD משיק למעגל בנקודה E» with E already on AD — a REAL tangency, never a ⟂-only green (#233, ADR-377)',
    guards:
      "Operator screenshot (dev 2026-07-20): rectangle + circle + «B על המעגל» + «E על AD» + «AD משיק למעגל בנקודה E» — every row green while AD sat nowhere near the circle. The ADR-075 existing-touch branch asserted the radius-⟂ ALONE ('assumes T is already on the circle'); E just slid to the ⟂ foot. The lowering now states the full tangency conjunction (membership + ⟂ + on-line-when-loose) and the apply (d) fall-through pushes an unreconcilable membership as a length-radius RESIDUAL so the solver drives the circle to the segment.",
    steps: ['מלבן ABCD', 'מעגל', 'B על המעגל', 'E על AD', 'AD משיק למעגל בנקודה E'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const c = [...fig.circles.values()][0];
      const A = at(fig, 'A');
      const D = at(fig, 'D');
      const E = at(fig, 'E');
      const B = at(fig, 'B');
      const vx = D.x - A.x;
      const vy = D.y - A.y;
      const t = ((c.center.x - A.x) * vx + (c.center.y - A.y) * vy) / (vx * vx + vy * vy);
      const gap = Math.hypot(c.center.x - (A.x + t * vx), c.center.y - (A.y + t * vy));
      expect(Math.abs(gap - c.r), 'AD genuinely tangent: dist(centre, line AD) = r').toBeLessThan(0.05);
      expect(Math.abs(dist(E, c.center) - c.r), 'E is the touch — ON the circle').toBeLessThan(0.05);
      expect(Math.abs(dist(B, c.center) - c.r), 'B stays on the circle').toBeLessThan(0.05);
      const tE = ((E.x - A.x) * vx + (E.y - A.y) * vy) / (vx * vx + vy * vy);
      expect(tE, 'the touch within AD').toBeGreaterThan(0);
      expect(tE, 'the touch within AD').toBeLessThan(1);
    },
  },
  {
    id: 'chord-endpoints-on-derived-corners-driven',
    title: '«BC מיתר במעגל» over a rectangle — BOTH endpoints land on the circle, the derived corner too (#230, ADR-377)',
    guards:
      "Operator (dev 2026-07-20): «I cannot get BC to be a chord» — B (free) converted to a rider but C (the rectangle's derived perp-offset corner) had every structural reinterpretation cycle-gated and stayed off the circle (verifier amber, retype swallowed as noop-exists). The point-on-circle (d) fall-through now pushes the membership as a length-radius residual through a witness member, so the solver drives the free radius/centre and BC is a real chord.",
    steps: [
      'מלבן ABCD',
      {
        llm: [
          { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, ifAbsent: true, implied: true },
          { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
          { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
          { type: 'segment', a: 'B', b: 'C' },
        ] as AnyCommand[],
      },
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const c = [...fig.circles.values()][0];
      for (const id of ['B', 'C'] as const) {
        expect(Math.abs(dist(at(fig, id), c.center) - c.r), `${id} exactly on the circle`).toBeLessThan(0.05);
      }
    },
  },
  {
    id: 'rectangle-named-over-existing-riders',
    title: '«FEDG מלבן» over four existing on-segment riders ASSERTS the rectangle and flexes them into shape (#223, ADR-375)',
    guards:
      "Prod 0yqufnuv 09:41-09:43 (2026-07-20): naming a polygon over EXISTING points refused «'D' is already defined» — the shape commands' derived corners hit the redefine guard, so the construction path dead-ended (the 2-D sibling of #199). Under M1 the shape command now lowers to its defining constraints (the shared `shapeConstraints` authority) over the existing points; the riders' own t-DOFs are driven and the figure flexes into a genuine inscribed rectangle.",
    steps: ['משולש ABC', 'E ו F על BC', 'D על AC', 'G על AB', 'FEDG מלבן'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const [F, E, D, G] = ['F', 'E', 'D', 'G'].map((id) => at(fig, id));
      expect(angle(G, F, E), '∠GFE').toBeCloseTo(90, 1);
      expect(angle(F, E, D), '∠FED').toBeCloseTo(90, 1);
      expect(angle(E, D, G), '∠EDG').toBeCloseTo(90, 1);
      // each rider stayed ON its host segment (never re-created off it)
      const onHost = (p: Vec, a: Vec, b: Vec, label: string) => {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy);
        expect(Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)), `${label} on its host`).toBeLessThan(1e-6);
        expect(t, `${label} within its host`).toBeGreaterThan(0);
        expect(t, `${label} within its host`).toBeLessThan(1);
      };
      const [A, B, C] = ['A', 'B', 'C'].map((id) => at(fig, id));
      onHost(E, B, C, 'E');
      onHost(F, B, C, 'F');
      onHost(D, A, C, 'D');
      onHost(G, A, B, 'G');
    },
  },
  {
    id: 'segment-tangent-binds-named-segment',
    title: '«AD משיק למעגל» constrains SEGMENT AD tangent — never a green figure with AD a chord and a stray tangent line (#226, ADR-374)',
    guards:
      "P1 prod 0yqufnuv 11:38-11:39 (2026-07-20): the verb honesty gate accounted a stated tangency by FAMILY TOKEN PRESENCE, not operand binding — so it (a) false-blocked the correct deterministic #203 lowering (its anonymous foot id is `@tang-…`, no tangent token) and escalated to the LLM, then (b) false-passed the LLM's `tangent at:A`, which binds only endpoint A — AD committed GREEN drawn as a chord. The gate is now operand-aware (a stated subject pair must be bound by the verb's own evidence commands, with a derived-chain closure), so the deterministic parse commits directly and a wrong-operand lowering refuses.",
    steps: ['מעגל', 'B ו C על המעגל', 'ABCD מלבן', 'AD משיק למעגל'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const A = at(fig, 'A');
      const D = at(fig, 'D');
      const c = [...fig.circles.values()][0];
      // segment AD is genuinely tangent: the ⟂ distance from the centre to line AD equals r…
      const vx = D.x - A.x;
      const vy = D.y - A.y;
      const t = ((c.center.x - A.x) * vx + (c.center.y - A.y) * vy) / (vx * vx + vy * vy);
      const gap = Math.hypot(c.center.x - (A.x + t * vx), c.center.y - (A.y + t * vy));
      expect(Math.abs(gap - c.r), 'dist(centre, line AD) = r — AD tangent, not a chord').toBeLessThan(0.1);
      // …and the touch lands WITHIN the named segment (ADR-077: a bare pair means the segment)
      expect(t, 'the touch within AD').toBeGreaterThan(0);
      expect(t, 'the touch within AD').toBeLessThan(1);
      // no stray drawn tangent line was invented for the mis-bound reading
      expect(fig.construction.objects.some((o) => o.kind === 'line' && o.id.startsWith('tan-')), 'no stray tangent line').toBe(false);
    },
  },
  {
    id: 'symbolic-area-label-not-swallowed',
    title: '«שטח משולש AFO הוא 9b» is committed and labelled — never "already on the figure" (#162, ADR-118 Am.)',
    guards:
      "Operator dev session pxeb2ng8 (2026-07-16): the lone symbolic area statement was silently discarded with «already on the figure» — dryRunOutcome's labelCount predated ADR-118's areas lane, so the (correctly constraint-free) area LABEL counted as nothing. All three label kinds now count; the numeric sibling and the shared-variable ratio lane are unchanged.",
    steps: ['משולש ABC', 'AE תיכון', 'F ו D על צלע AB', 'CD ו AE נחתכים בנקודה O', 'BE∥FO', 'שטח משולש AFO הוא 9b', 'שטח מרובע BEOF הוא 16'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.labels.areas.length, 'both area statements visible on the figure').toBeGreaterThanOrEqual(2);
      expect(fig.labels.areas.some((a) => a.text.includes('9b')), 'the symbolic 9b label present').toBe(true);
    },
  },
  {
    id: 'seed-coincident-angle-not-swallowed',
    title: '«∠EOF=90» true at the default seeds is still COMMITTED and pinned (#156, ADR-371)',
    guards:
      'Operator dev session qx5a19co: E,F seeded at the square-side midpoints subtend exactly 90° at the centre, so the driving set-angle moved nothing and grew no constraint object — dryRunOutcome read «empty», told the student «already set», and "show another" then broke the angle. A step that reduces the free-DOF count is now produced; after commit the angle is pinned in every displayed configuration (the seed-sweep oracle enforces this check per seed).',
    steps: ['ריבוע ABCD', 'אלכסונים נחתכים בנקודה O', 'AC', 'DB', 'E על AB', 'F על AD', 'משולש OEF', '∠EOF=90'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const E = at(fig, 'E');
      const O = at(fig, 'O');
      const F = at(fig, 'F');
      expect(angle(E, O, F), 'the committed angle holds (and must keep holding at every seed)').toBeCloseTo(90, 1);
    },
  },
  {
    id: 'definite-circles-tangent-binds-pair',
    title: '«המעגלים משיקים זה לזה» binds THE two drawn circles — never an invented third (#215, ADR-363)',
    guards:
      'Operator repro 2026-07-19 (found triaging #214): with «מעגל O» + «מעגל P» drawn, the definite «המעגלים משיקים זה לזה» emitted an INVENTED circle-Q + circles-tangent O↔Q — P silently dropped from the statement, THREE circles rendered, all rows green. circlesTangent now resolves the pair at the shared resolveCirclePair chokepoint (bind 2 / complete 1 / introduce 0 / defer 3+).',
    steps: ['מעגל O', 'מעגל P', 'המעגלים משיקים זה לזה'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const cs = [...fig.circles.values()];
      expect(cs, 'exactly the two circles the student drew').toHaveLength(2);
      const [a, b] = cs;
      expect(dist(a.center, b.center), 'the tangency holds between THE drawn pair: centre gap = r1 + r2').toBeCloseTo(a.r + b.r, 1);
    },
  },
  {
    id: 'two-tangents-from-apex-to-both-circles',
    title: '«מנקודה A יוצאים שני משיקים לשני המעגלים» — the classic two-circle figure through an external apex (#214, ADR-370)',
    guards:
      "Operator report 2026-07-19: the construct was missing — «מנקודה A יוצא משיק לשני המעגלים» was silently mis-parsed (an invented third circle with A as a mutual-tangency touch — the #215 P1), and even with «משותף» the rule had no apex concept (A was swept into the touch labels and placed ON circle O). The from-marker now binds the APEX role; per tangent the ADR-239 two-touch bundle + line-through scaffolding; a new A is DERIVED at the two tangents' crossing (the play-test amendment — the circles are never recruited).",
    steps: ['מעגל O', 'מעגל P', 'מנקודה A יוצאים שני משיקים לשני המעגלים'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const A = at(fig, 'A');
      // the two external parts drawn from A, each to a touch that rides one of the circles: for each
      // A-segment, the far end is at radius distance from one centre and the segment is ⟂ that radius
      const segs = fig.construction.objects.filter((o) => o.kind === 'segment' && (o.a === 'A' || o.b === 'A'));
      expect(segs.length, 'the external parts drawn from A').toBeGreaterThanOrEqual(2);
      const circles = [...fig.circles.values()];
      expect(circles).toHaveLength(2);
      for (const seg of segs) {
        if (seg.kind !== 'segment') continue;
        const T = fig.positions.get(seg.a === 'A' ? seg.b : seg.a)!;
        const onSome = circles.some((c) => Math.abs(dist(c.center, T) - c.r) < 0.05 * c.r);
        expect(onSome, 'each tangent touch rides a circle').toBe(true);
        // tangency: the radius to the touch ⟂ the line A–T
        const c = circles.find((cc) => Math.abs(dist(cc.center, T) - cc.r) < 0.05 * cc.r)!;
        const rx = T.x - c.center.x, ry = T.y - c.center.y;
        const vx = A.x - T.x, vy = A.y - T.y;
        const cos = Math.abs(rx * vx + ry * vy) / (Math.hypot(rx, ry) * Math.hypot(vx, vy));
        expect(cos, 'radius ⟂ tangent at the touch').toBeLessThan(0.05);
      }
    },
  },
  {
    id: 'unnamed-construct-chain',
    title: '«נתון מעגל» → «קוטר» → «משיק למעגל» → «מרכז המעגל» — the student who names nothing (#184, ADR-368)',
    guards:
      'Prod log-triage 2026-07-17 (~6 distinct users, operator-approved): midpoint/diameter/tangent/centre required a student-supplied name while median/altitude auto-named — same sentence shape, arbitrary split. The unnamed forms now build with auto-chosen labels (freeLabel, every existing label excluded) as strict last-resort rules.',
    steps: ['נתון מעגל', 'קוטר', 'משיק למעגל', 'מרכז המעגל'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      expect(fig.construction.objects.some((o) => o.kind === 'circle')).toBe(true);
      expect(fig.construction.objects.filter((o) => o.kind === 'segment').length, 'the diameter drawn').toBeGreaterThanOrEqual(1);
      expect(fig.construction.objects.some((o) => o.kind === 'line'), 'the tangent line drawn').toBe(true);
    },
  },
  {
    id: 'unnamed-midpoint-auto-label',
    title: '«הוסף אמצע צלע AB» auto-names the midpoint — no leading letter required (#184, ADR-368)',
    guards:
      'Prod log-triage 2026-07-17: «הוסף אמצע צלע AB» / «אמצע AB» were not-handled while «M אמצע AB» worked — the arbitrary naming split. The unnamed form now auto-names via freeLabel (never hijacking an existing label, the ADR-263 discipline).',
    steps: ['משולש ABC', 'הוסף אמצע צלע AB'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const mid = fig.construction.objects.find((o) => o.kind === 'midpoint');
      expect(mid).toBeTruthy();
      if (mid && mid.kind === 'midpoint') {
        expect([mid.a, mid.b].sort()).toEqual(['A', 'B']);
        expect(['A', 'B', 'C']).not.toContain(mid.id);
        const M = at(fig, mid.id);
        const A = at(fig, 'A');
        const B = at(fig, 'B');
        expect(dist(M, A), 'a true midpoint').toBeCloseTo(dist(M, B), 4);
      }
    },
  },
  {
    id: 'hypotenuse-tangent-to-quarter-circle',
    title: '«AB משיק למעגל C» with no touch named — the hypotenuse tangent to the arc at the right-angle vertex (#203, ADR-369)',
    guards:
      "Prod session cm4ak2yo (2026-07-17): «AB משיק למעגל C» and «AB משיק למעגל» both fell through every tangent rule to the LLM → not-understood — the single-segment / both-endpoints-existing / unnamed-touch member of the tangency family was missing, blocking the classic quarter-circle-in-a-right-triangle bagrut figure. Now a tangency CONSTRAINT: the touch is the ⟂ foot from the centre (an anonymous dot), its membership drives the free radius, and it stays WITHIN AB.",
    steps: ['משולש ABC ישר זוית', 'D על BC', 'E על AC', 'מעגל C', 'DC רדיוס', 'CD=CE', 'AB משיק למעגל C'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const A = at(fig, 'A');
      const B = at(fig, 'B');
      const C = at(fig, 'C');
      const D = at(fig, 'D');
      const len = dist(A, B);
      const dC = Math.abs((B.x - A.x) * (A.y - C.y) - (A.x - C.x) * (B.y - A.y)) / len;
      expect(dC, 'tangency: dist(C, line AB) = r = |CD|').toBeCloseTo(dist(C, D), 2);
      // the touch lands WITHIN the hypotenuse (the bare-segment principle, ADR-077)
      const t = ((C.x - A.x) * (B.x - A.x) + (C.y - A.y) * (B.y - A.y)) / (len * len);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    },
  },
  {
    id: 'tangents-to-unbuilt-circle',
    title: '«מנקודה A יוצאים שני משיקים למעגל» as the FIRST utterance introduces the circle deterministically (#159, ADR-367)',
    guards:
      'Operator report 2026-07-16 ("שני works, 2 doesn\'t — we need both at engine level"): the difference was pure LLM luck — with no circle in the figure the rule required one to ALREADY exist and both phrasings fell to the LLM, whose rescue pinned an unstated radius 5 (ADR-052 violation). resolveOrIntroduceCircle now introduces the circle (free radius, auto centre) at the deterministic layer.',
    steps: ['מנקודה A יוצאים שני משיקים למעגל'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle' && !o.id.startsWith('tanaux'));
      expect(circles, 'the introduced circle').toHaveLength(1);
      const tangents = fig.construction.objects.filter((o) => o.kind === 'segment' && [o.a, o.b].includes('A'));
      expect(tangents.length, 'both tangents from A drawn').toBeGreaterThanOrEqual(2);
      expect(freeDofs(fig.construction).includes(circles[0].id), 'the radius stays a FREE DOF (never the LLM-pinned 5)').toBe(true);
    },
  },
  {
    id: 'semicircle-bare-adverb-outside',
    title: '«BC קוטר חצי מעגל מבחוץ» — the bare adverb binds the OUTSIDE like «מחוץ לריבוע» (#222, ADR-365 Am.)',
    guards:
      "Operator validation pass 2026-07-20 (right after #213): the object form «מחוץ לריבוע» bound the bulge, but the bare adverb «מבחוץ»/«בחוץ» parsed and silently DROPPED the stated side — the ADR-365 ride-along class, word-form edition. The adverbs now bind (the shape resolved from ctx.polygons by the diameter edge), matching the two-circle family's מבחוץ/מבפנים synonyms (ADR-359 Am. 3).",
    steps: ['ריבוע', 'BC קוטר חצי מעגל מבחוץ'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const arc = fig.construction.objects.find((o) => o.kind === 'arc');
      expect(arc).toBeTruthy();
      if (arc && arc.kind === 'arc') {
        expect((arc as { bulgeRef?: string }).bulgeRef, 'the stated OUTSIDE bound, never dropped').toBeTruthy();
        expect((arc as { bulgeToward?: boolean }).bulgeToward).toBeUndefined();
      }
    },
  },
  {
    id: 'cross-circle-diameter-new-circle',
    title: '«CD קוטר» with C,D on two DIFFERENT circles builds the NEW circle on CD (#221, ADR-366 Am.)',
    guards:
      "Operator play session id8j4di1 (2026-07-19): «ED קוטר» with the endpoints riding two different circles built NOTHING (the implicit circle never resolves at ≥2 circles; no routing recognised the pair as un-attachable); the «במעגל O3» workaround worked but surfaced a visible named centre. Cross-membership now routes to circleOnDiameter with an auto (hidden) centre; membership resolves the host when both endpoints share ONE circle.",
    steps: ['מעגל O', 'מעגל P', 'C על מעגל O', 'D על מעגל P', 'CD קוטר'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles, 'the two drawn circles + the new one on CD').toHaveLength(3);
      const fresh = circles.find((c) => c.id !== 'circle-O' && c.id !== 'circle-P')!;
      const cPos = fig.positions.get((fresh as { center: string }).center)!;
      const C = at(fig, 'C');
      const D = at(fig, 'D');
      expect(dist(cPos, C), 'centre equidistant from C and D').toBeCloseTo(dist(cPos, D), 4);
      expect(dist(cPos, C) + dist(cPos, D), 'centre ON segment CD (its midpoint)').toBeCloseTo(dist(C, D), 4);
    },
  },
  {
    id: 'q27-eo-diameter-new-circle',
    title: '«EO קוטר» after two chords meeting at E builds the NEW Thales circle on EO (#152, ADR-366)',
    guards:
      "Operator session qx5a19co (bagrut Q27): «EO קוטר» was claimed by the `diameter` rule (attach to the EXISTING circle O), which emitted the impossible `point-on-circle O` on circle-O — the whole step deferred with unresolved deps; «EO קוטר במעגל חדש» no-op'ed. The endpoint-is-centre impossibility now routes the statement to `circleOnDiameter` (a new circle, centre = midpoint of EO), which the operator had to reach by a 2-step workaround.",
    steps: ['מעגל O', 'AB מיתר', 'CD מיתר', 'AB ו CD נחתכים בנקודה E', 'EO קוטר'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles, 'circle O + the new Thales circle on EO').toHaveLength(2);
      const small = circles.find((c) => c.id !== 'circle-O')!;
      const cPos = fig.positions.get((small as { center: string }).center)!;
      const E = at(fig, 'E');
      const O = at(fig, 'O');
      expect(dist(cPos, E), 'centre equidistant from E and O').toBeCloseTo(dist(cPos, O), 4);
      expect(dist(cPos, E) + dist(cPos, O), 'centre ON segment EO (its midpoint)').toBeCloseTo(dist(E, O), 4);
    },
  },
  {
    id: 'four-unnamed-semicircles-on-square',
    title: 'A square with an unnamed semicircle OUTSIDE on each side — every unnamed centre picks a fresh letter (#213, ADR-365)',
    guards:
      "Operator prod repro 2026-07-19 (+ session agwxxo9k same day): the SECOND unnamed semicircle re-picked the letter O — its picker consulted ctx.points only, blind to the ADR-342 anonymous centre @ctr-O that lives in ctx.circles — re-emitted the first's ids and refused «@ctr-O coincides with its constructed target». All three hand-rolled pickers (semicircle/quarterCircle/sector) now use the shared freeLabel([points, circles], …) discipline.",
    steps: ['ריבוע', 'BC קוטר חצי מעגל מחוץ לריבוע', 'DC קוטר חצי מעגל O2', 'AD קוטר חצי מעגל מחוץ לריבוע', 'AB קוטר חצי מעגל מחוץ לריבוע'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(new Set(circles.map((c) => c.id)).size, 'four distinct semicircle carriers').toBe(4);
      const arcs = fig.construction.objects.filter((o) => o.kind === 'arc');
      expect(arcs, 'a 180° arc per side').toHaveLength(4);
      for (const a of arcs) if (a.kind === 'arc') expect(a.spanDeg).toBe(180);
    },
  },
  {
    id: 'two-circles-disjoint-operator',
    title: '«שני מעגלים זרים» draws two genuinely DISJOINT circles (#196, ADR-358)',
    guards:
      'Prod sessions cm4ak2yo/jwbimfsf (2026-07-18): the utterance escalated to the LLM, which emitted two unrelated fixed-radius circles — drawn INTERSECTING, all rows green (the stated disjointness silently dropped). Now a deterministic construct: circles + a set-circle-position requirement the verifier and meetsRequirements keep.',
    steps: ['שני מעגלים זרים'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const cs = [...fig.circles.values()];
      expect(cs).toHaveLength(2);
      expect(dist(cs[0].center, cs[1].center), 'disjoint: gap beyond the radii sum').toBeGreaterThan(cs[0].r + cs[1].r);
    },
  },
  {
    id: 'two-circles-contained-operator',
    title: '«שני מעגלים מוכלים» draws one circle strictly INSIDE the other (#196, ADR-358)',
    guards:
      "Prod session jwbimfsf (2026-07-18): the LLM emitted circle O + a set-radius on that SAME circle — the second circle never existed (the operator's \"gives me one circle\"). Now deterministic: two circles + the contained requirement.",
    steps: ['שני מעגלים מוכלים'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.violations).toEqual([]);
      const cs = [...fig.circles.values()];
      expect(cs).toHaveLength(2);
      const [big, small] = cs[0].r >= cs[1].r ? [cs[0], cs[1]] : [cs[1], cs[0]];
      expect(dist(big.center, small.center) + small.r, 'inner strictly inside outer').toBeLessThan(big.r);
    },
  },
  {
    id: 'sector-ODC-value-word-form',
    title: '«גזרה ODC שווה 90» — the שווה value form + the O-family centre letter (#171, ADR-357 Am.)',
    guards:
      "Play-test session 9blvgg2o (2026-07-18): «גזרה ODC שווה 90» parsed as a FREE-angle sector (שווה was not a value marker — the 90 landed nowhere), the number-honesty gate refused, and the LLM died. The value-marker family (שווה/=/מעלות/equals) now parses, and the O-family letter is the centre wherever it sits.",
    steps: ['משולש ABC ישר זוית', 'O על AC', 'D על AB', 'גזרה ODC שווה 90'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(O, C), '|OC| = |OD| (the sector radii)').toBeCloseTo(dist(O, D), 3);
      const dot = (C.x - O.x) * (D.x - O.x) + (C.y - O.y) * (D.y - O.y);
      expect(Math.abs(dot), 'the 90° central angle').toBeLessThan(1e-2);
      const arc = fig.construction.objects.find((o) => o.kind === 'arc');
      expect(arc && arc.kind === 'arc' && arc.center === 'O' && arc.spanDeg === 90, 'the 90° arc at centre O').toBe(true);
    },
  },
  {
    id: 'sector-DCE-angle-style-in-right-triangle',
    title: '«גזרה DCE» on existing connected points — the sector construct, centre read angle-style (#171, ADR-357)',
    guards:
      "Prod session cm4ak2yo (2026-07-17): «גזרה DCE» escalated to the LLM and came back not-understood — the sector construct did not exist. The operator's keystroke names the centre in the MIDDLE (like ∠DCE); the rule reads it angle-style because all three letters exist and the middle is connected to both others (D on CB, E on AC).",
    steps: ['משולש ABC ישר זוית', 'D על BC', 'E על AC', 'גזרה DCE'],
    check(fig) {
      allStepsOk(fig);
      const C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E');
      // Centre C: both stated points become the sector's equal-radius ends.
      expect(dist(C, D), '|CD| = |CE| (the sector radii)').toBeCloseTo(dist(C, E), 3);
      const arc = fig.construction.objects.find((o) => o.kind === 'arc');
      expect(arc, 'the sector arc drawn').toBeTruthy();
      if (arc && arc.kind === 'arc') expect(arc.center).toBe('C');
      // Both bounding radii drawn from C.
      const radii = fig.construction.objects.filter(
        (o) => o.kind === 'segment' && [o.a, o.b].includes('C') && (['D', 'E'] as string[]).some((x) => [o.a, o.b].includes(x)),
      );
      expect(radii.length, 'the two bounding radii').toBeGreaterThanOrEqual(2);
    },
  },
  {
    id: 'quarter-circle-in-right-triangle-any-end-order',
    title: '«OCD רבע מעגל» in the right-triangle bagrut figure — membership on a vertex the circle depends on lowers to SIZE, never a cycle (#202)',
    guards:
      'Prod sessions cm4ak2yo/3yrpvz14 (2026-07-17/18): the quarter circle centred at O (on AC) with ends C and D (on AB) was refused «unresolved dependencies» in the OCD end order while ODC built — the C-membership arrived first and branch (c2) converted the free vertex C into a rider of circle-O, whose centre O rides segment AC → the cycle C → circle-O → O → C (the ADR-093 inverted-dependency class). ADR-354: every conversion at the membership chokepoint passes a wouldInvertDependency gate and falls through to the constraint/size lowering, so end-letter order cannot change build success (M2).',
    steps: ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על AB', 'OCD רבע מעגל'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), C = at(fig, 'C'), D = at(fig, 'D'), A = at(fig, 'A'), B = at(fig, 'B');
      // The closed form: |OC| = |OD| = r = 6 (similar triangles AOD ~ ACB with AC=15, BC=10).
      expect(dist(O, C), 'radius |OC|').toBeCloseTo(6, 2);
      expect(dist(O, D), 'radius |OD|').toBeCloseTo(6, 2);
      // The 90° quarter at the centre, and D genuinely on the hypotenuse.
      const dot = (C.x - O.x) * (D.x - O.x) + (C.y - O.y) * (D.y - O.y);
      expect(Math.abs(dot), 'OC ⟂ OD').toBeLessThan(1e-2);
      const cross = (B.x - A.x) * (D.y - A.y) - (B.y - A.y) * (D.x - A.x);
      expect(Math.abs(cross) / dist(A, B), 'D on line AB').toBeLessThan(1e-3);
    },
  },
  {
    id: 'diameter-through-point-imperative',
    title: '«הוסף קוטר העובר בנקודה A» — the THROUGH phrasing + a leading imperative reach the ADR-270 diameter (#201)',
    guards:
      'Prod log-triage 2026-07-17 (LIVE row): the construct existed («קוטר מנקודה F», ADR-270) but the THROUGH wording «העובר בנקודה» + the «הוסף» imperative fell to the LLM → not-handled. Operator ruling 2026-07-18: «קוטר ב/מנקודה A» means the diameter THROUGH A — one construct, more phrasings, widened at the rule\'s own from-marker (the ADR-3D-026 phrasing-class discipline).',
    steps: ['מעגל O', 'A על המעגל', 'הוסף קוטר העובר בנקודה A'],
    check(fig) {
      allStepsOk(fig);
      const O = fig.circles.get('circle-O')!;
      const A = at(fig, 'A');
      expect(dist(A, O.center), 'A on the circle').toBeCloseTo(O.r, 3);
      // The antipode is a fresh auto-named point, diametrically opposite A — find the drawn diameter
      // segment (the full-width segment with A as an endpoint; the `diameter` command lowers to it).
      const dia = fig.construction.objects.find(
        (o) => o.kind === 'segment' && (o.a === 'A' || o.b === 'A') && dist(at(fig, o.a), at(fig, o.b)) > 1.9 * O.r,
      );
      expect(dia, 'a diameter through A drawn').toBeTruthy();
      if (!dia || dia.kind !== 'segment') return;
      const far = dia.a === 'A' ? dia.b : dia.a;
      expect(dist(at(fig, far), O.center), 'the far end on the circle').toBeCloseTo(O.r, 3);
      expect(dist(A, at(fig, far)), 'a full diameter').toBeCloseTo(2 * O.r, 3);
    },
  },
  {
    id: 'polygon-noun-binds-existing-quad',
    title: '«המצולע חסום במעגל» — the GENERIC polygon noun binds THE existing polygon (#185 row 1)',
    guards:
      'Prod log-triage 2026-07-17: «חסום במעגל» with a shape word works, but the generic «המצולע» fell out of the inscribedPolygon kind ladder → not-handled → LLM. The noun is a DEFINITE reference (the ADR-245 pattern): the unique existing polygon supplies both arity and ids; zero/several polygons still defer.',
    steps: ['מרובע ABCD', 'המצולע חסום במעגל'],
    check(fig) {
      allStepsOk(fig);
      const circle = [...fig.circles.values()][0];
      expect(circle, 'a circumscribing circle drawn').toBeTruthy();
      for (const id of ['A', 'B', 'C', 'D'])
        expect(dist(at(fig, id), circle.center), `${id} on the circle`).toBeCloseTo(circle.r, 3);
    },
  },
  {
    id: 'point-on-the-definite-line',
    title: '«קטע AB» → «נקודה G על הקו» — THE definite unnamed line resolves to the single drawn segment (#185 row 2)',
    guards:
      'Prod log-triage 2026-07-17: «נקודה G על הקו» was not-handled — the ADR-029 implicit-reference pattern ("the circle") had no line edition. With exactly one drawn segment, "הקו" is it; G rides it as an on-segment point.',
    steps: ['קטע AB', 'נקודה G על הקו'],
    check(fig) {
      allStepsOk(fig);
      const [A, B, G] = [at(fig, 'A'), at(fig, 'B'), at(fig, 'G')];
      const cross = (B.x - A.x) * (G.y - A.y) - (B.y - A.y) * (G.x - A.x);
      expect(Math.abs(cross) / dist(A, B), 'G on line AB').toBeLessThan(1e-3);
      expect((G.x - A.x) * (B.x - A.x) + (G.y - A.y) * (B.y - A.y), 'G on the A-side of the span').toBeGreaterThanOrEqual(0);
      expect((G.x - B.x) * (A.x - B.x) + (G.y - B.y) * (A.y - B.y), 'G on the B-side of the span').toBeGreaterThanOrEqual(0);
    },
  },
  {
    id: 'line-with-point-creates-the-line',
    title: '«קו ועליו נקודה A» — a first-utterance line with a named rider CREATES the line (#185 row 2)',
    guards:
      'Prod log-triage 2026-07-17: «קו ועליו נקודה A» / «קו עם נקודה A» were not-handled, so a student could not OPEN a figure with "a line and on it a point". With no drawn segment the rule creates one (auto-named endpoints, the inscribe auto-label precedent) and puts A on it.',
    steps: ['קו ועליו נקודה A'],
    check(fig) {
      allStepsOk(fig);
      const [B, C, A] = [at(fig, 'B'), at(fig, 'C'), at(fig, 'A')];
      const cross = (C.x - B.x) * (A.y - B.y) - (C.y - B.y) * (A.x - B.x);
      expect(Math.abs(cross) / dist(B, C), 'A rides the created line BC').toBeLessThan(1e-3);
    },
  },
  {
    id: 'parallel-to-the-bases',
    title: '«EL מקביל לבסיסים» — the definite BASES resolve via the trapezoid\'s parallel edge-pair (#185 row 3)',
    guards:
      'Prod log-triage 2026-07-17: «EL מקביל לבסיסים» was not-handled — the ∥ rule needed two label pairs. The bases resolve from the ADR-169 `parallels` ctx hint (the unique vertex-disjoint parallel edge-pair); one base is exactly ∥-to-both since the bases are mutually parallel; a parallelogram (two pairs) still defers.',
    steps: ['טרפז ABCD', 'E אמצע AD', 'L אמצע BC', 'EL מקביל לבסיסים'],
    check(fig) {
      allStepsOk(fig);
      const [E, L, A, B] = [at(fig, 'E'), at(fig, 'L'), at(fig, 'A'), at(fig, 'B')];
      const cross = (L.x - E.x) * (B.y - A.y) - (L.y - E.y) * (B.x - A.x);
      expect(Math.abs(cross) / (dist(E, L) * dist(A, B)), 'EL ∥ AB').toBeLessThan(1e-3);
    },
  },
  {
    id: 'centres-segment',
    title: '«קטע מרכזים» / «מרכז מעגלים» — the segment joining THE two circle centres (#185 row 4)',
    guards:
      'Prod log-triage 2026-07-17: both phrasings were not-handled. Label-free full-match; with exactly two referenceable circles the segment joins their centre points (an anonymous ADR-342 centre becomes visible by use, FR-RN-8).',
    steps: ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'קטע מרכזים'],
    check(fig) {
      allStepsOk(fig);
      const segs = fig.construction.objects.filter((o) => o.kind === 'segment').map((o) => `${o.a}|${o.b}`);
      expect(segs.some((s) => s === 'O|P' || s === 'P|O'), 'segment O–P drawn').toBe(true);
    },
  },
  {
    id: 'angle-word-number-degrees',
    title: '«זווית C שווה לשלושים מעלות» — Hebrew cardinal words before מעלות read as the value (#185 row 5)',
    guards:
      'Prod log-triage 2026-07-17: the word spelling of a degree value was not-handled (the ADR-273 word-magnitude family covered only fractions). Cardinals before a degree word normalise to digits at the parse boundary — compounds sum («ארבעים וחמש» → 45) — and the ADR-164 single-vertex angle then fires as usual; a counting word with no degree suffix («צלע אחת») is never rewritten.',
    steps: ['משולש ABC', 'זווית C שווה לשלושים מעלות'],
    check(fig) {
      allStepsOk(fig);
      expect(angle(at(fig, 'B'), at(fig, 'C'), at(fig, 'A')), '∠C = 30').toBeCloseTo(30, 1);
    },
  },
  {
    id: 'isosceles-paren-appositive',
    title: '«ABC משולש שווה שוקיים (AB=AC)» — a PARENTHESIZED relation is the appositive clause (#185 row 6)',
    guards:
      'Prod log-triage 2026-07-17: the parenthesized pair made the whole line not-handled (ADR-264\'s split knew only comma/connective separators). A (…) group carrying a relation operator now reads as a clause — the stated pair PINS the isosceles soft default (ADR-114/234); a √(…) value group is never split.',
    steps: ['ABC משולש שווה שוקיים (AB=AC)'],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'A'), at(fig, 'B')), '|AB| = |AC|').toBeCloseTo(dist(at(fig, 'A'), at(fig, 'C')), 3);
    },
  },
  {
    id: 'square-with-side-in-one-line',
    title: '«ריבוע ABCD שצלעו הוא 1» — a shape declared WITH its side length in one utterance (#185 row 7)',
    guards:
      'Prod log-triage 2026-07-17: the relative size clause made the line not-handled. The parse boundary rewrites it to the appositive «ריבוע ABCD, AB = 1» (the ADR-228 size-given seam + the ADR-264 clause split); scoped to equilateral-sided shapes (square/rhombus/equilateral), where "its side" is unambiguous — a rectangle\'s «שצלעו» would be an unstated pick (ADR-052) and stays out.',
    steps: ['ריבוע ABCD שצלעו הוא 1'],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'A'), at(fig, 'B')), '|AB| = 1').toBeCloseTo(1, 3);
      expect(dist(at(fig, 'B'), at(fig, 'C')), 'a square — |BC| = 1 too').toBeCloseTo(1, 3);
    },
  },
  {
    id: 'rectangle-two-sides-values',
    title: '«מלבן ABCD» → «צלע אחת 10 צלע שניה 5» — two adjacent sides of THE polygon get the stated lengths (#185 row 7)',
    guards:
      'Prod log-triage 2026-07-17: the "one side… second side…" follow-up was not-handled. The subject is THE unique polygon (the ADR-245 definite-reference pattern); the values land on two ADJACENT ring edges — a rectangle\'s length and width.',
    steps: ['מלבן ABCD', 'צלע אחת 10 צלע שניה 5'],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'A'), at(fig, 'B')), '|AB| = 10').toBeCloseTo(10, 3);
      expect(dist(at(fig, 'B'), at(fig, 'C')), '|BC| = 5').toBeCloseTo(5, 3);
    },
  },
  {
    id: 'chained-angle-word-equality',
    title: '«זוית AEB שווה לזווית BEC שווה 60 מעלות» — a WORD-chained angle equality with a value tail (#185 row 8)',
    guards:
      'Prod log-triage 2026-07-17: the word operator between angles was not-handled (angleEquality/chainedEquality split on `=` only). «שווה ל» before an angle/arc reference or a degree value now normalises to `=` at the parse boundary (operator ruling 2026-07-17, narrowing ADR-119: angles/arcs are actionable, general segment word-equality stays out), so the existing chain machinery (ADR-343) distributes the value to every member.',
    steps: ['זוית AEB שווה לזווית BEC שווה 60 מעלות'],
    check(fig) {
      allStepsOk(fig);
      expect(angle(at(fig, 'A'), at(fig, 'E'), at(fig, 'B')), '∠AEB = 60').toBeCloseTo(60, 1);
      expect(angle(at(fig, 'B'), at(fig, 'E'), at(fig, 'C')), '∠BEC = 60').toBeCloseTo(60, 1);
    },
  },
  {
    id: 'arc-word-equality',
    title: '«הקשת AE שווה לקשת DC» — arc word-equality lowers to the central-angle ratio (#185 row 9)',
    guards:
      'Prod log-triage 2026-07-17, operator-approved (narrowing ADR-119): «שווה ל» between two ARCS is actionable. The word operator normalises to `=` and ADR-116\'s arcEquality lowers arc AE = arc DC to ∠AOE = ∠DOC, driving the free on-circle points.',
    steps: ['מעגל O', 'A, E, D, C על המעגל', 'הקשת AE שווה לקשת DC'],
    check(fig) {
      allStepsOk(fig);
      const O = fig.circles.get('circle-O')!.center;
      expect(angle(at(fig, 'A'), O, at(fig, 'E')), '∠AOE = ∠DOC (equal arcs)').toBeCloseTo(angle(at(fig, 'D'), O, at(fig, 'C')), 1);
    },
  },
  {
    id: 'chained-value-marks-every-member',
    title: '«AB=BC=8» — the chained value lands on EVERY member: |AB|=8 AND |BC|=8, both labelled (#163, ADR-343)',
    guards:
      'Operator dev test 2026-07-16: "I entered AB=BC=8. AB is equal to BC and BC is marked on canvas as 8 but AB was not marked as 8." chainedEquality split the chain into adjacent pairwise clauses only, so the numeric set-distance landed on the LAST member (BC) and AB was tied to 8 only transitively via set-equal — geometrically correct but a display-honesty gap (docs/17 §6: everything the student stated must be visible). Operator ruling 2026-07-17: «AB=BC=8 means AB=8 and BC=8». Now the chain distributes its tail VALUE to every member (lengths, angles, symbolic — one owner, chainedEquality); the set-equal link is kept (ADR-234 pinsSoftVariant reads it; redundancy measured green through replay).',
    steps: ['AB=BC=8'],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'A'), at(fig, 'B')), '|AB| = 8').toBeCloseTo(8, 3);
      expect(dist(at(fig, 'B'), at(fig, 'C')), '|BC| = 8').toBeCloseTo(8, 3);
      // BOTH segments carry the stated value on the figure — the reported gap.
      const labelled = fig.labels.lengths.map((l) => [l.a, l.b].sort().join('') + '=' + l.text).sort();
      expect(labelled, 'both members labelled 8').toEqual(['AB=8', 'BC=8']);
    },
  },
  {
    id: 'qx5a19co-plural-chords-conjunction',
    title: '«AB ו DC מיתרים» — BOTH chords land: all four endpoints on the circle + both segments (#151, ADR-344)',
    guards:
      'Operator session qx5a19co ("commands I had to work around"): the natural both-chords-at-once declaration was read by the chord rule as ONE label run (A,B on the circle + segment AB), D,C dropped → weak:dropped:D,C → LLM → not-understood — the statement was lost and the operator fell back to one chord per line. The plural carrier-membership class (ADR-076/240/pluralSpecialLines family): the label list now pairs sequentially, each pair one chord — all memberships + all segments, mirrored for plural diameters; an intersect compound never pair-reads.',
    steps: ['מעגל O', 'AB ו DC מיתרים'],
    check(fig) {
      allStepsOk(fig);
      const circle = fig.circles.get('circle-O')!;
      expect(circle, 'circle O resolved').toBeTruthy();
      for (const id of ['A', 'B', 'D', 'C'])
        expect(dist(at(fig, id), circle.center), `${id} on the circle`).toBeCloseTo(circle.r, 4);
      const segs = fig.construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id);
      expect(segs, 'both chords drawn').toContain('seg-AB');
      expect(segs, 'both chords drawn').toContain('seg-CD');
    },
  },
  {
    id: 'pxeb2ng8-count-digit-two-tangents',
    title: '«מנקודה A יוצאים 2 משיקים למעגל» — the DIGIT spelling builds like the word spelling, no LLM (#160, ADR-345)',
    guards:
      'Operator dev session pxeb2ng8 (2026-07-16): the שני spelling built the two-tangents Thales construction; the 2 spelling produced the IDENTICAL correct parse and droppedGivenNumbers threw it away (weak:dropped:2 → LLM → not-understood) — the same statement passed or failed on spelling alone, because the gate reads every digit as a magnitude and a COUNT quantifier is consumed by the rule\'s structure, not a payload. The gate now blanks count slots (a bare integer before a plural countable noun — the digit twin of the already-invisible count words); ratio/size digits (פי 2, רדיוס 5, "2 times", פעמים) stay gated. This scenario locks parse+build; the gate itself is locked in adr-250.test.ts (command-identity with the שני spelling + the anti-regression set).',
    steps: ['מעגל O ברדיוס 5', 'מנקודה A יוצאים 2 משיקים למעגל'],
    check(fig) {
      allStepsOk(fig);
      const circle = fig.circles.get('circle-O')!;
      expect(circle.r, 'stated radius').toBeCloseTo(5, 4);
      // The two touch points ride the circle and each tangent is ⟂ its radius (a genuine tangent pair).
      const touches = ['T', 'S'].filter((id) => fig.positions.has(id));
      expect(touches.length, 'two touch points').toBe(2);
      for (const id of touches) {
        expect(dist(at(fig, id), circle.center), `${id} on the circle`).toBeCloseTo(circle.r, 3);
        expect(Math.abs(angle(circle.center, at(fig, id), at(fig, 'A')) - 90), `radius ⟂ tangent at ${id}`).toBeLessThan(0.1);
      }
    },
  },
  {
    id: 'gxccyt2n-hidden-centre-never-squats-letter',
    title: '«שני מעגלים נחתכים» → «P על המשך BA» — the invisible auto centre never squats P; the student gets THEIR new point (#177 P1, ADR-342)',
    guards:
      'Operator prod session gxccyt2n (2026-07-16, 15:57): after «שני מעגלים נחתכים» (auto-centres O and P, hidden per FR-RN-8 — the student cannot know P exists), «P על המשך BA» was M1-bound to the INVISIBLE second centre → set-line [B,A,P] on a point equidistant from A,B → honestly impossible → parked deferred forever, with the canvas drawing A→P into the centre (a claim the student never made). The ADR-297 namespace-hijack class, centre edition. Now an unnamed circle\'s centre POINT is anonymous (@ctr-P) while the LETTER stays the circle\'s reference token («מעגל P» still works), so the statement creates the student\'s own P beyond A on ray B→A. Ruling (b): semantic centre-use («רדיוס OB») binds-and-promotes; positional statements like this one always treat the letter as fresh (locked in anon-centre.test.ts).',
    steps: ['שני מעגלים נחתכים', 'P על המשך BA'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.pending, 'never the parked deferred-constraint the operator saw').toBe(false);
      const P = at(fig, 'P');
      const A = at(fig, 'A');
      const B = at(fig, 'B');
      expect((P.x - A.x) * (A.x - B.x) + (P.y - A.y) * (A.y - B.y), 'P beyond A on ray B→A').toBeGreaterThan(0);
      // both circles intact, their centres anonymous — the letters stay the student's
      expect(fig.construction.objects.filter((o) => o.kind === 'circle').length).toBe(2);
      expect(fig.positions.has('@ctr-O') && fig.positions.has('@ctr-P'), 'anonymous centres').toBe(true);
    },
  },
  {
    id: 'trapezoid-stated-long-base-first-draw',
    title: '«טרפז ABCD» + «AB < CD» — the stated order flips the TEMPLATE to a basic CD-long trapezoid, never a k≈1.08 boundary grind (#173 P1, ADR-341)',
    guards:
      'Operator 2026-07-16: "when i draw a trapezoid, the default is AB>CD. when I write AB<CD i get something that is a trapezoid but not nice. what I really want is a basic trapezoid with CD as the large base." Root cause, one class: which parallel side is the LONG base is an unstated DISCRETE choice hard-baked twice — the template seeds k=0.6 and the sampler drew k ∈ [0.3,0.85] (capped below 1, the ADR-052 smell named in CLAUDE.md), so the stated order was "repaired" by grinding k to 1.079, a skewed near-parallelogram on the region boundary. Now the pre-scan (the ADR-163 M4 shape, order-independent of typing position) rotates the trapezoid ids by two — the SAME quad, same edges and legs — so the template long base lands on the stated-long pair with the default’s own margin, and the sampler both straddles 1 when unstated and stays in the stated branch.',
    steps: ['טרפז ABCD', 'AB < CD'],
    check(fig) {
      allStepsOk(fig);
      const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id) => at(fig, id));
      const k = dist(d, c) / dist(a, b);
      // A comfortable CD-long trapezoid — never the boundary grind (1.079). Seed 0 draws the mirror
      // default k = 1/0.6; sampled seeds stay in the stated branch (≥ ~1.2) — the bar admits both.
      expect(k, 'CD is the long base with margin').toBeGreaterThan(1.15);
      // Still a genuine trapezoid: AB ∥ DC (the defining parallelism).
      const cross = (b.x - a.x) * (c.y - d.y) - (b.y - a.y) * (c.x - d.x);
      const scale = dist(a, b) * dist(d, c);
      expect(Math.abs(cross) / scale, 'AB ∥ DC').toBeLessThan(1e-4);
    },
  },
  {
    id: 'inscribe-square-in-right-triangle',
    title: '«ריבוע DEFG חסום במשולש ABC» in a RIGHT triangle — the CORNER square builds, matching the closed-form oracle (#166, ADR-338)',
    guards:
      'Operator 2026-07-16 (session tos0z5cf), THE reported sequence. It used to fail «over-constrained: |DE| = |EF| and |EF| = |FG| and |FG| = |GD| and GD ⟂ DE cannot hold»: the inscribe’s four defining constraints were applied as independent commands, and each applyStep EVALUATES — i.e. moves the figure — before the next is attached, so the last was asked to hold from a basin the earlier ones had already committed to (the solver landed the nearest RHOMBUS and then reported the ⟂ unsatisfiable). With the right angle at A the geometry forces D exactly onto A: the unique square is the CORNER square of side 1/(1/|AB|+1/|AC|) — legitimate and textbook, just unreachable one constraint at a time. Now the macro’s constraints reach `evaluate` together (applyCoupledStep) and are solved jointly from the pre-macro basin, landing the exact corner square; the D≡A boundary is admitted as an ADR-123 forced coincidence (which the issue recorded as coincidences: []).',
    steps: ['right-triangle ABC', 'זוית A ישרה', 'ריבוע DEFG חסום במשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      const [d, e, f, g] = ['D', 'E', 'F', 'G'].map((id) => at(fig, id));
      // A genuine SQUARE: four equal sides, four right angles.
      const sides = [dist(d, e), dist(e, f), dist(f, g), dist(g, d)];
      expect(Math.max(...sides) - Math.min(...sides), 'all four sides equal').toBeLessThan(1e-3);
      for (const [p, v, q] of [[g, d, e], [d, e, f], [e, f, g], [f, g, d]] as const)
        expect(Math.abs(angle(p, v, q) - 90), 'right angle at each corner').toBeLessThan(0.01);
      // …in GENERAL POSITION (ADR-339, the operator's play-test follow-up): the DEFAULT drawing puts all
      // four vertices genuinely on the sides — never the degenerate corner square (D≡A), which stays
      // reachable by cycling with its ADR-123 notice. The corner square's closed-form oracle lock lives in
      // `inscribe-joint-solve.test.ts` at the PINNED corner variant.
      expect(fig.coincidences, 'no coincidence in the default drawing').toEqual([]);
      for (const s of [d, e, f, g])
        for (const c of ['A', 'B', 'C'])
          expect(dist(s, at(fig, c)), 'every square vertex clear of every container vertex').toBeGreaterThan(0.5);
    },
  },
  {
    id: 'inscribe-rectangle-in-right-triangle',
    title: '«מלבן DEFG חסום במשולש ABC» in a RIGHT triangle — the RECTANGLE macro builds too (#166, operator: "not only ריבוע but also מלבן")',
    guards:
      'Operator 2026-07-16 ("ensure we cover not only ריבוע but also מלבן חסום"). Same greedy-solve class, different expansion (three right angles instead of rhombus+one): it used to fail «cannot place G on segment CA so that GD ⟂ DE» — and an inscribed rectangle is UNDER-determined (a free aspect ratio), so failing at all was the clearest proof the defect was the solve order, not the geometry. Locks the class fix across the shape, not just the one reported figure.',
    steps: ['right-triangle ABC', 'זוית A ישרה', 'מלבן DEFG חסום במשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      const [d, e, f, g] = ['D', 'E', 'F', 'G'].map((id) => at(fig, id));
      for (const [p, v, q] of [[g, d, e], [d, e, f], [e, f, g], [f, g, d]] as const)
        expect(Math.abs(angle(p, v, q) - 90), 'right angle at each corner').toBeLessThan(0.01);
      expect(Math.abs(dist(d, e) - dist(f, g)), 'opposite sides equal').toBeLessThan(1e-3);
      expect(Math.abs(dist(e, f) - dist(g, d)), 'opposite sides equal').toBeLessThan(1e-3);
    },
  },
  {
    id: 'inscribe-square-in-plain-triangle-with-right-angle',
    title: '«משולש ABC» + «זוית A ישרה» + «ריבוע DEFG חסום» — the inscribe no longer BREAKS the earlier right angle (#166, ADR-338)',
    guards:
      'The third row of #166’s reproduction table, and the worst of the three: this sequence used to fail «∠BAC = 90° cannot hold» — the greedy solve broke the student’s OWN earlier given and then blamed it (a docs/17 §6 breach: an error must name the conflicting NEW statement, not an established one). Jointly solved, the corner square lands AND ∠BAC = 90° still holds.',
    steps: ['משולש ABC', 'זוית A ישרה', 'ריבוע DEFG חסום במשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      // The student's earlier given SURVIVES the inscribe.
      expect(Math.abs(angle(at(fig, 'B'), at(fig, 'A'), at(fig, 'C')) - 90), '∠BAC = 90 still holds').toBeLessThan(0.01);
      const [d, e, f, g] = ['D', 'E', 'F', 'G'].map((id) => at(fig, id));
      const sides = [dist(d, e), dist(e, f), dist(f, g), dist(g, d)];
      expect(Math.max(...sides) - Math.min(...sides), 'a genuine square').toBeLessThan(1e-3);
      // The DEFAULT drawing is the general-position square (ADR-339), never the corner degenerate.
      expect(fig.coincidences, 'no coincidence in the default drawing').toEqual([]);
    },
  },
  {
    id: 'inscribe-rectangle-builds-in-plain-triangle',
    title: '«מלבן DEFG חסום במשולש ABC» in a plain triangle — the baseline that must STAY green (ADR-337/338 guard)',
    guards:
      'The success branch both fixes must preserve: ADR-337 (a legitimately-succeeding macro must still be promoted from its trial to the figure) and ADR-338 (coupling the constraints must not break a case the greedy path already solved). A working 6-command expansion still lands, and the result is a genuine rectangle.',
    steps: ['משולש ABC', 'מלבן DEFG חסום במשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      for (const id of ['D', 'E', 'F', 'G']) expect(fig.positions.has(id), `${id} exists`).toBe(true);
      for (const [p, v, q] of [['D', 'E', 'F'], ['E', 'F', 'G'], ['F', 'G', 'D']] as const)
        expect(Math.abs(angle(at(fig, p), at(fig, v), at(fig, q)) - 90), `right angle at ${v}`).toBeLessThan(0.5);
    },
  },
  {
    id: 'arc-value-drives-central-angle',
    title: '«קשת AB = 40» — an absolute arc measure drives the central angle, never a chord length (ADR-335 play-gate request)',
    guards:
      'Operator 2026-07-16 (the ADR-335 play-gate): «arc AB = 40» as a given. Before the arcValue rule this fell through to distanceConstraint, committing the arc’s DEGREES as a chord LENGTH (set-distance |AB| = 40) with the word קשת silently dropped and every gate quiet — the same green-but-wrong family as #153. Now it lowers to set-angle at the centre (arc ≡ central angle, ADR-116) and drives a free on-circle endpoint until ∠AOB = 40.',
    steps: ['מעגל O ברדיוס 5', 'AB מיתר', 'קשת AB = 40'],
    check(fig) {
      allStepsOk(fig);
      const aob = angle(at(fig, 'A'), at(fig, 'O'), at(fig, 'B'));
      expect(Math.abs(aob - 40), '∠AOB = 40 (the arc measure)').toBeLessThan(0.1);
      // …and the chord is NOT 40 long (the old wrong lowering would have forced |AB| = 40 on a radius-5 circle — impossible)
      expect(dist(at(fig, 'A'), at(fig, 'B'))).toBeLessThan(11);
      // DISPLAY (operator rule): an arc given draws NO angle wedge/value at the (hidden) centre — the
      // value prints ON the arc. Only an explicit «∠AOB = 40» earns the centre mark.
      expect(fig.angleMarks, 'no wedge mark at the centre for an arc given').toHaveLength(0);
      expect(fig.labels.arcs, 'the value prints on the arc').toEqual([{ circle: 'circle-O', a: 'A', b: 'B', text: '40°' }]);
    },
  },
  {
    id: 'q22-arc-sum-enforced-not-truncated',
    title: '«קשת AC + קשת BE = קשת AD + קשת BC» + «S_{CFG}=S_{CGH}» — the full bagrut Q22: the arc SUM enforced whole forces HG ⊥ AB (#153 P1, #154)',
    guards:
      'Operator 2026-07-15/16 (sessions qx5a19co + wn3axiea, bagrut Q22 — exam text supplied 2026-07-16): the arc-sum given parsed green but arcEquality had TRUNCATED it to the first arc of each side (labelRun grabs the first run) — the figure was constrained by ∠AOC = ∠AOD, a DIFFERENT given, every honesty gate silent. Now measureSum lowers the whole term list to ONE set-measure-sum over the central angles, and with the exam’s REAL second given — the AREA equality S_{CFG}=S_{CGH} (the issue text had mis-transcribed it as an angle equality) — the exam theorem is FORCED on the drawing: the arc condition ⇒ CF = CG, the area equality over the collinear bases (D-F-C-H one line) ⇒ CF = CH, so CG = ½·FH ⇒ Thales converse ⇒ HG ⊥ AB. Both chords carry the מיתר noun (the wn3axiea session showed a bare «CD חותך…» leaves D OFF the circle — ADR-052-honest, but then «קשת AD» is meaningless).',
    steps: [
      // The operator's wn3axiea sequence with the מיתר noun restored on the CD step (their bare
      // «CD חותך…» left D off the circle). NOTE the chord ORDER (CD before CE) matters for the
      // THEOREM assertion: the engine's central angles are minor-arc [0,180°], so a different
      // entry order can settle a valid configuration whose minor-arc sum holds without the exam's
      // arc arrangement — the sum given is honoured either way (see the order-independence
      // scenario), but the ⊥ conclusion is a property of the exam's configuration.
      'מעגל',
      'AB מיתר',
      'מיתר CD חותך את AB בנקודה F',
      'מיתר CE חותך את AB בנקודה G',
      'H על המשך DC',
      'קשת AC +קשת BE = קשת AD + קשת BC',
      'HG',
      'S_{CFG}=S_{CGH}',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const arc = (x: Id, y: Id) => angle(at(fig, x), O, at(fig, y));
      // The STATED sum holds on the final coordinates — not the truncated arc AC = arc AD.
      expect(Math.abs(arc('A', 'C') + arc('B', 'E') - (arc('A', 'D') + arc('B', 'C'))), 'arc AC + arc BE = arc AD + arc BC').toBeLessThan(0.1);
      expect(Math.abs(arc('A', 'C') - arc('A', 'D')), 'NOT the truncated arc AC = arc AD').toBeGreaterThan(1);
      // The theorem chain the two givens force: CF = CG (arc condition) = CH (area equality, collinear bases).
      const C = at(fig, 'C'), F = at(fig, 'F'), G = at(fig, 'G'), H = at(fig, 'H'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(Math.abs(dist(C, F) - dist(C, G)), 'CF = CG').toBeLessThan(0.05);
      expect(Math.abs(dist(C, F) - dist(C, H)), 'CF = CH').toBeLessThan(0.05);
      // …and the exam conclusion: HG ⊥ AB (Thales converse — G sees FH under a right angle).
      const cos = ((H.x - G.x) * (B.x - A.x) + (H.y - G.y) * (B.y - A.y)) / (dist(H, G) * dist(A, B));
      expect(Math.abs(cos), 'HG ⊥ AB').toBeLessThan(0.01);
    },
  },
  {
    id: 'q22-arc-sum-typed-early-order-independence',
    title: 'the Q22 arc-sum typed EARLY (before H/HG) still builds — entry-order independence (M2/ADR-104)',
    guards:
      'The compound sum must not depend on being typed last: entered straight after the chords it defers/drives the same free chord endpoint and the later steps compose on top (the ADR-104/M2 discipline for the new constraint kind).',
    steps: [
      'מעגל O ברדיוס 5',
      'AB מיתר',
      'CE מיתר שחותך את AB בנקודה G',
      'CD מיתר שחותך את AB בנקודה F',
      'קשת AC + קשת BE= קשת AD + קשת BC',
      'H על המשך DC',
      'HG',
    ],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const arc = (x: Id, y: Id) => angle(at(fig, x), O, at(fig, y));
      expect(Math.abs(arc('A', 'C') + arc('B', 'E') - (arc('A', 'D') + arc('B', 'C'))), 'the sum holds').toBeLessThan(0.1);
    },
  },
  {
    id: 'power-of-point-median-product-builds',
    title: '«4*DM*DM=BM*ME» on the medians figure builds the true product, never a wrong set-equal (#145 P1, #144)',
    guards:
      'Operator 2026-07-15 (prod session o90iwwh/o90uiwwh, seq 18–35): the medians figure + the exam relation 4·DM² = BM·ME. equalSegments’ unanchored regex used to slide to the interior «DM=BM» and commit set-equal(D,M,B,M) — a WRONG constraint, saved from silence only by the accidental droppedGivenNumbers hit on the 4 (the coefficient-less quotient forms committed silently). Now lengthProduct lowers it to ONE set-length-product (k=4, DM twice) whose log-domain residual drives the free M; the relation holds exactly on the final coordinates. The CF/AD median steps are the BARE typed strings again (#168 fixed: the second median resolves its opposite side from the apex’s polygon — the ADR-263 mechanism — instead of a raw point count the first median’s rider broke).',
    steps: [
      'משולש ABC',
      'BE תיכון',
      'CF תיכון',
      'AD תיכון',
      'BF=FM',
      '4*DM*DM=BM*ME',
    ],
    check(fig) {
      allStepsOk(fig);
      const D = at(fig, 'D'), M = at(fig, 'M'), B = at(fig, 'B'), E = at(fig, 'E'), F = at(fig, 'F');
      const lhs = 4 * dist(D, M) ** 2;
      const rhs = dist(B, M) * dist(M, E);
      expect(Math.abs(lhs - rhs) / Math.max(rhs, 1e-9), '4·DM² = BM·ME (relative)').toBeLessThan(0.01);
      expect(Math.abs(dist(B, F) - dist(F, M)), 'the earlier BF = FM still holds').toBeLessThan(0.05);
    },
  },
  {
    id: 'segment-sum-drives-endpoint',
    title: '«AB + CD = EF» — a segment SUM drives a free endpoint until the sum holds (#154)',
    guards:
      'The additive length family: a sum of segment lengths is ONE set-measure-sum (coefs [1,1,−1]) driving a free DOF — not a truncated set-equal(C,D,E,F) silently dropping AB (the unreported sibling the #153 class probe surfaced).',
    steps: ['מרובע ABCD', 'EF', 'AB + CD = EF'],
    check(fig) {
      allStepsOk(fig);
      const s = dist(at(fig, 'A'), at(fig, 'B')) + dist(at(fig, 'C'), at(fig, 'D'));
      const ef = dist(at(fig, 'E'), at(fig, 'F'));
      expect(Math.abs(s - ef) / Math.max(ef, 1e-9), '|AB| + |CD| = |EF|').toBeLessThan(0.01);
    },
  },
  {
    id: 'angle-sum-180-forces-parallel',
    title: '«זווית A + זווית B = 180» — single-vertex angle SUM (arms from the figure) reshapes the quad; AD ∥ BC follows (#154)',
    guards:
      'The additive angle family with a numeric target and ADR-164 single-vertex arms: ∠A + ∠B = 180 on a quadrilateral is ONE set-measure-sum (target 180) driving a shape DOF — not a truncated set-angle dropping the second term. Co-interior angles at 180 force AD ∥ BC, which must hold on the final coordinates.',
    steps: ['מרובע ABCD', 'זווית A + זווית B = 180'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      const a1 = angle(B, A, D);
      const a2 = angle(A, B, C);
      expect(Math.abs(a1 + a2 - 180), '∠A + ∠B = 180').toBeLessThan(0.1);
      // co-interior angles ⇒ AD ∥ BC: |sin| of the angle between the directions ≈ 0
      const u = { x: D.x - A.x, y: D.y - A.y };
      const v = { x: C.x - B.x, y: C.y - B.y };
      const sin = Math.abs(u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
      expect(sin, 'AD ∥ BC follows').toBeLessThan(0.01);
    },
  },
  {
    id: 'secant-apex-far-point-named-near',
    title: '«AD חותך למעגל בנקודה B» — apex A external, D the far crossing, B the near (issue #136, ADR-332)',
    guards:
      'Operator 2026-07-15: the secant «AD חותך למעגל» (apex A + FAR point D only) was not-handled, and «…בנקודה B» was GRABBED by lineMeetsCircle which built nothing — a `line-through chord-AD` to a never-created D (the latent chord-AD failure). The new `secantFarPoint` rule (before lineMeetsCircle) creates D as a free-θ on-circle far crossing, the near crossing B (named) via line∩circle with a one-sided order A→B→D keeping D far.',
    steps: ['מעגל O שרדיוסו R', 'AD חותך למעגל בנקודה B'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), D = at(fig, 'D'), B = at(fig, 'B');
      const r = dist(O, D); // D on the circle → radius
      expect(Math.abs(dist(O, B) - r), 'B (near crossing) on the circle').toBeLessThan(1e-2);
      expect(dist(A, O), 'A external apex').toBeGreaterThan(r);
      expect(dist(A, B), 'B is the NEAR crossing, D the FAR').toBeLessThan(dist(A, D));
    },
  },
  {
    id: 'secant-apex-far-point-bare-anon-near',
    title: '«AD חותך למעגל» bare — D far, the near crossing an anonymous @-dot, rotation a free DOF (issue #136, ADR-332)',
    guards:
      'Operator 2026-07-15: bare «AD חותך למעגל» escalated to the LLM. Now it builds: D a free-θ far crossing on the circle, the unnamed near crossing an anonymous promotable @-dot (#32/ADR-297), the secant’s rotation about A a free DOF (ADR-052). A is created as an external apex (point-circle-side outside).',
    steps: ['מעגל O שרדיוסו R', 'AD חותך למעגל'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), D = at(fig, 'D');
      const r = dist(O, D);
      expect(dist(A, O), 'A external apex').toBeGreaterThan(r);
      // the near crossing is an anonymous promotable point, ON the circle, between A and D
      const anon = fig.construction.objects.filter((o) => isGeoPoint(o) && o.id.startsWith('@'));
      expect(anon.length, 'an anonymous near-crossing dot').toBe(1);
      const N = at(fig, anon[0].id);
      expect(Math.abs(dist(O, N) - r), 'the @-dot lies on the circle').toBeLessThan(1e-2);
      expect(dist(A, N), 'the @-dot is the NEAR crossing').toBeLessThan(dist(A, D));
    },
  },
  {
    id: 'secant-from-point-far-crossing',
    title: '«מנקודה A יוצא חותך למעגל בנקודה D» — the from-point secant phrasing (issue #136, ADR-332)',
    guards:
      'Operator 2026-07-15 (play-testing PR #137): the from-point phrasing «מנקודה A יוצא חותך למעגל בנקודה D» (A the external apex, D the FAR crossing named after the circle) fell through to lineLineIntersection → not-handled → LLM (dropped D). The #136 rule handled only the «AD חותך» pair form. Widened `secantFarPoint` with a FROM-POINT branch (A from «מנקודה A», D from «בנקודה D» = far, near anonymous), gated to a cut OF THE CIRCLE and guarded off the diameter family so it never steals «קוטר … חותך את הצלע AC».',
    steps: ['מעגל שמרכזו O', 'מנקודה A יוצא חותך למעגל בנקודה D'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), D = at(fig, 'D');
      const r = dist(O, D); // D on the circle → radius
      expect(dist(A, O), 'A external apex').toBeGreaterThan(r);
      const anon = fig.construction.objects.filter((o) => isGeoPoint(o) && o.id.startsWith('@'));
      expect(anon.length, 'an anonymous near-crossing dot').toBe(1);
      const N = at(fig, anon[0].id);
      expect(dist(A, N), 'the @-dot is the NEAR crossing, D the FAR').toBeLessThan(dist(A, D));
    },
  },
  {
    id: 'two-tangents-from-point-distinct',
    title: '«מנקודה A יוצא משיק … B» then «… C» — the two tangents from a point are DISTINCT (issue #142, ADR-333)',
    guards:
      'Operator 2026-07-15 (dev play-test): two separate «tangent from A» statements landed on the SAME tangent point («B ו-C נפלו על אותה נקודה») — `tangentFromExternal` always emitted branch 0, so both took the same circle∩(Thales-aux) intersection. Fixed: a SECOND single tangent from the same apex (its `tanaux-` circle already exists, surfaced via `ctx.tangentAuxes`) takes branch 1 = the OTHER touch. The two tangents are now the two distinct touch points, symmetric about OA.',
    steps: ['מעגל O ברדיוס 5', 'מנקודה A יוצא משיק למעגל בנקודה B', 'מנקודה A יוצא משיק למעגל בנקודה C'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      const rB = dist(O, B);
      expect(dist(B, C), 'B and C are DISTINCT tangent points').toBeGreaterThan(1e-2);
      expect(Math.abs(dist(O, C) - rB), 'both on the circle').toBeLessThan(1e-2);
      // both are genuine tangents: AB ⟂ OB and AC ⟂ OC
      const perp = (P: typeof B) => Math.abs((A.x - P.x) * (O.x - P.x) + (A.y - P.y) * (O.y - P.y)) / (dist(A, P) * rB);
      expect(perp(B), 'AB ⟂ OB').toBeLessThan(1e-2);
      expect(perp(C), 'AC ⟂ OC').toBeLessThan(1e-2);
    },
  },
  {
    id: 'single-external-tangent-builds',
    title: '«מנקודה A יוצא משיק למעגל בנקודה B» — a single external tangent builds (prod regression, issue #138)',
    guards:
      'PROD regression (session e43ezom5 + prod events.jsonl): «מנקודה A יוצא משיק למעגל בנקודה B» parsed OK in prod on 2026-07-11 (source:parser) but broke by 2026-07-15 (weak:dropped:משיק/tangent → LLM → built-nothing). Cause: the ADR-292 משיק verb gate (deployed prod/2026-07-12-2) did not recognise tangentFromExternal\'s Thales AUX-CIRCLE construction (ids tanaux-/~tanmid-, no literal `tangent` object), so it flagged the CORRECT parse as dropping משיק. Fix (ADR-292 Am.): tanaux-/tanmid- added to the gate\'s satisfied set. This scenario locks the parse+build; the gate itself is locked by verb-gate.test.ts.',
    steps: ['מעגל שמרכזו O', 'מנקודה A יוצא משיק למעגל בנקודה B'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), B = at(fig, 'B');
      const r = dist(O, B); // B is on the circle → radius
      expect(dist(A, O), 'A external apex').toBeGreaterThan(r);
      // tangent: AB ⟂ OB  ⇒  (A−B)·(O−B) ≈ 0
      const dot = (A.x - B.x) * (O.x - B.x) + (A.y - B.y) * (O.y - B.y);
      expect(Math.abs(dot) / (dist(A, B) * r), 'AB ⟂ OB (B is the tangent point)').toBeLessThan(1e-2);
    },
  },
  {
    id: 'parallel-line-from-a-point',
    title: '«מנקודה A ישר מקביל ל-DO» draws a parallel line through A (the "from a point" anchor, issue #127, ADR-327)',
    guards:
      'Prod log-triage 2026-07-14: `מנקודה A ישר מקביל ל-DO` ("from point A a line parallel to DO") escalated to the paid LLM — the drawn `parallel-line` construct existed but its through-point anchor THROUGH_PT only accepted through/דרך/בנקודה, not the "from a point" origin (מנקודה/מ-/from point) students actually write. Fixed by a FROM_PT anchor on the parallel-line rule (the perpendicular "from a point" is already handled by the foot rule, so it is deliberately NOT added there).',
    steps: ['משולש ADO', 'מנקודה A ישר מקביל ל-DO'],
    check(fig) {
      allStepsOk(fig);
      // The parallel line through A ∥ DO built as a real construct (id par-<through>-<a><b>), not escalated.
      expect(fig.construction.objects.some((o) => o.id === 'par-A-DO')).toBe(true);
    },
  },
  {
    id: 'bare-free-point-positioned-by-next-statement',
    title: '«נקודה A» + «נקודה B» + «AB=5» — bare free points recruited by a later given (issue #104, ADR-328)',
    guards:
      'Prod log-triage 2026-07-13 (~4 users): a bare free-point declaration «נקודה A»/«point A» was not-handled — the rebuild never re-exposed the original model\'s "free point (2 DOF)" primitive; every point arrived via a relation. Now «נקודה A» builds a free 2-DOF point (ADR-052 sampled, ifAbsent-idempotent) that a later constraint recruits.',
    steps: ['נקודה A', 'נקודה B', 'AB = 5'],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'A'), at(fig, 'B'))).toBeCloseTo(5, 3); // the distance recruited both free points
    },
  },
  {
    id: 'diagonals-meet-noun-form',
    title: '«G נקודת מפגש האלכסונים» — the diagonal crossing by noun (issue #44, ADR-329)',
    guards:
      'Prod (~5-6 users): naming the diagonal crossing by NOUN («מפגש האלכסונים», no letters) was not-handled — only the explicitly-lettered form («E חיתוך AC ו-BD») parsed. The noun form now resolves the context quad and lowers to the two diagonals + their crossing (ADR-110 macro).',
    steps: ['ריבוע ABCD', 'G נקודת מפגש האלכסונים'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D'), G = at(fig, 'G');
      // the diagonals of a square cross at its centre = the average of all four vertices
      expect(G.x).toBeCloseTo((A.x + B.x + C.x + D.x) / 4, 3);
      expect(G.y).toBeCloseTo((A.y + B.y + C.y + D.y) / 4, 3);
    },
  },
  {
    id: 'medians-meet-centroid-noun-form',
    title: '«M מפגש התיכונים» — the triangle centroid by noun (issue #44, ADR-329)',
    guards:
      'Operator: generalize the diagonal-meet noun form to the four triangle centres. «M מפגש התיכונים» (the medians meet) now builds the centroid = (A+B+C)/3 as two medians + their crossing (ADR-110 macro, no new engine construct).',
    steps: ['משולש ABC', 'M מפגש התיכונים'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), M = at(fig, 'M');
      expect(M.x).toBeCloseTo((A.x + B.x + C.x) / 3, 3);
      expect(M.y).toBeCloseTo((A.y + B.y + C.y) / 3, 3);
    },
  },
  {
    id: 'semicircle-on-every-side-of-square',
    title: '«ריבוע» then «על כל צלע של ריבוע יש חצי מעגל» — a semicircle on each side (issue #29, ADR-330)',
    guards:
      'Prod session p3du4l9p: the classic composite (a polygon with a semicircle erected on each side) was not-handled — only the single-side form parsed. The quantified «על כל צלע … יש חצי מעגל» now resolves the context polygon and builds one closed-form semicircle per side (ADR-110 macro, no new engine construct).',
    steps: ['ריבוע ABCD', 'על כל צלע של ריבוע יש חצי מעגל'],
    check(fig) {
      allStepsOk(fig);
      const arcs = fig.construction.objects.filter((o) => o.kind === 'arc');
      expect(arcs).toHaveLength(4); // one semicircle arc per side of the square
    },
  },
  {
    id: 'semicircle-outside-a-triangle-side',
    title: '«חצי מעגל על צלע AB מחוץ למשולש» builds (bulge outward), not an escalation (issue #134, ADR-331)',
    guards:
      'Operator play-test 2026-07-14: a semicircle on side AB "מחוץ למשולש" (outside the triangle) errored — the semicircle rule had no side vocabulary, so `מחוץ למשולש` tripped the SHAPE_LEFTOVER escalation. Now the bulge clause is consumed and resolved to a render-time orientation (the arc gets bulgeRef = the opposite vertex); the exact sequence builds clean.',
    steps: ['משולש ABC', 'חצי מעגל על צלע AB מחוץ למשולש'],
    check(fig) {
      allStepsOk(fig);
      // the semicircle's hidden circle + its arc were built (the orientation is a render concern, tested in
      // semicircle-bulge.test.tsx); the point is that the "מחוץ למשולש" utterance no longer escalates/errors.
      expect(fig.construction.objects.some((o) => o.kind === 'arc')).toBe(true);
    },
  },
  {
    id: 'verbose-relational-ratio-builds',
    title: '«אורך AC גדול פי 2 מהקטע AB» drives the ratio (verbose/relational size-given, issue #105, ADR-318)',
    guards:
      "Operator (bagrut Q5) typed `אורך AC גדול פי √(3) מהקטע CO` and it escalated → not-understood: the `אורך`/`הקטע` noun prefixes + the `מהקטע` (from-segment) RHS defeated the ratio rule (its `קטע` was grabbed by the loose `segment` rule, dropping the factor). Fixed by the ratio noun-skip + running `ratioConstraint` before `segment`.",
    steps: ['משולש ABC', 'אורך AC גדול פי 2 מהקטע AB'],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'A'), at(fig, 'C'))).toBeCloseTo(2 * dist(at(fig, 'A'), at(fig, 'B')), 3);
    },
  },
];
