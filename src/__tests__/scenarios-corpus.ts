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
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import { isGeoPoint, freeDofs, freeDofCount, applySeed, evaluate, detectRelations, detectShapes } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';
import { detectTheorems } from '@/theorems';

export type Step =
  | string
  | { llm: AnyCommand[] }
  | { llm: string[] }
  /** ✎ edit of an EARLIER step (1-based index into the typed steps): re-parse the new wording against
   *  the PREFIX context — the figure BEFORE the edited step — and splice the replacement at the step's
   *  position, exactly as the app's commitEdit → replaceGroup does (ADR-241). */
  | { edit: { step: number; to: string } };
export interface Scenario {
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

/** The figure context the app feeds the parser — the shared builder (ADR-171), so scenarios can't drift
 *  from App/production. */
export function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

/** Build the ordered fact list for a scenario through the real parse→fact path (no replay yet). Shared by
 *  `run`, the seed-sweep oracle, and the E7 round-trip properties (all in THIS file — importing a .test.ts
 *  from another test would double-register every scenario), so all drive the exact pipeline the app does. */
export function factsOf(steps: Step[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  const push = (group: string, utterance: string, cmd: AnyCommand) =>
    facts.push({ id: `${group}.${facts.length}`, utterance, group, cmd, enabled: true });
  for (const step of steps) {
    if (typeof step === 'object' && 'edit' in step) {
      // The app's ✎ path (ADR-241): parse against the PREFIX (facts before the edited group — the
      // context the replacement is replayed in), then splice in place. An edit adds no new step group.
      const key = `g${step.edit.step - 1}`;
      const start = facts.findIndex((f) => f.group === key);
      if (start < 0) throw new Error(`edit step: no step group ${key} to edit`);
      let end = start;
      while (end < facts.length && facts[end].group === key) end++;
      const r = parse(step.edit.to, ctxOf(facts.slice(0, start)));
      if (!r.ok) throw new Error(`edited step did not parse: ${JSON.stringify(step.edit.to)}`);
      const replacement: Fact[] = r.commands.map((cmd, i) => ({
        id: `${key}e.${i}`,
        utterance: step.edit.to,
        group: key,
        cmd,
        enabled: true,
      }));
      facts.splice(start, end - start, ...replacement);
      continue;
    }
    const group = `g${g++}`;
    if (typeof step === 'string') {
      const r = parse(step, ctxOf(facts));
      if (!r.ok) throw new Error(`scenario step did not parse (would escalate to the LLM): ${JSON.stringify(step)}`);
      for (const cmd of r.commands) push(group, step, cmd);
    } else if (step.llm.length && typeof step.llm[0] === 'string') {
      // Canonical LLM STRINGS — re-parse each with the live figure context, incrementally (a later line may
      // reference a point an earlier line of the SAME step introduced), exactly as `llmParse` does (TST-3).
      for (const line of step.llm as string[]) {
        const r = parse(line, ctxOf(facts));
        if (!r.ok) throw new Error(`scenario LLM line did not parse (canonical form drifted): ${JSON.stringify(line)}`);
        for (const cmd of r.commands) push(group, line, cmd);
      }
    } else {
      for (const cmd of step.llm as AnyCommand[]) push(group, '(llm step)', cmd);
    }
  }
  return facts;
}

/** Replay a scenario through the real parse→fact→replay path and return the derived figure. */
export function run(steps: Step[]): Derived {
  const facts = factsOf(steps);
  // Mirror the app: when a figure has free DOFs whose default placement breaks an extension's directional
  // order ("המשך" must reach the far side), the store auto-advances to the first satisfying configuration.
  // `firstSatisfyingSeed` returns 0 for any figure without that issue, so non-extension scenarios are
  // unchanged. (ADR-098.)
  return replay(facts, firstSatisfyingSeed(facts));
}

// ── check helpers ──────────────────────────────────────────────────────────
export const at = (fig: Derived, id: Id): Vec => {
  const v = fig.positions.get(id);
  if (!v) throw new Error(`no position for "${id}"`);
  return v;
};
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};
/** Every enabled step applied cleanly (no silent drop / over-constraint). */
export const allStepsOk = (fig: Derived) => {
  for (const [id, s] of Object.entries(fig.status)) expect(s, `status of step ${id}`).toBe('ok');
  expect(fig.lastError).toBeNull();
};
/** The quad's named vertices are in convex cyclic order around centre O (none collapsed/crossed). */
export const convexQuad = (fig: Derived, ids: [Id, Id, Id, Id], center: Id, minGapDeg = 15) => {
  const o = at(fig, center);
  const ang = (p: Vec) => (Math.atan2(p.y - o.y, p.x - o.x) + 2 * Math.PI) % (2 * Math.PI);
  const order = ids.map((id) => ang(at(fig, id)));
  for (let i = 0; i < 4; i++) {
    const gap = (order[(i + 1) % 4] - order[i] + 2 * Math.PI) % (2 * Math.PI);
    expect(gap, `gap after vertex ${ids[i]}`).toBeGreaterThan((minGapDeg * Math.PI) / 180);
  }
};

// ── the scenarios (newest first) ───────────────────────────────────────────
export const SCENARIOS: Scenario[] = [
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
  {
    id: 'point-between-builds-on-segment',
    title: '«E בין A ל-B» builds a free point on segment AB (issue #95, ADR-317)',
    guards:
      "Prod session `lrbdnp5v`: `E בין A ל-B` (E between A and B) built nothing (escalated → built-nothing). It is exactly `E על AB` — a free point-on-segment. Fixed by teaching `pointOnSegment` the BETWEEN phrasing (guarded against the ratio/angle/swap/area-ratio rules that also use בין).",
    steps: ['משולש ABC', 'E בין A ל-B'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), E = at(fig, 'E');
      // E is ON segment AB: collinear and within.
      const cross = (B.x - A.x) * (E.y - A.y) - (B.y - A.y) * (E.x - A.x);
      expect(Math.abs(cross), 'E collinear with A,B').toBeLessThan(1e-6);
      const t = ((E.x - A.x) * (B.x - A.x) + (E.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      expect(t).toBeGreaterThan(0.02);
      expect(t).toBeLessThan(0.98);
    },
  },
  {
    id: 'arc-minor-midpoint-on-arc-not-chord',
    title: '«D אמצע הקשת הקטנה AB» lands D on the (minor) ARC, not the chord midpoint (issue #90, ADR-316)',
    guards:
      "Operator report: `D אמצע הקשת הקטנה AB` silently placed D on the CHORD midpoint — the arc-magnitude qualifier `הקטנה` between `הקשת` and the labels made `arcMidpoint` return null, so it fell through to the generic `midpoint` rule. Fixed by tolerating the qualifier; MAJOR selects the far arc (branch 1 / the `major` flag).",
    steps: ['מעגל שמרכזו O', 'A על המעגל', 'B על המעגל', 'D אמצע הקשת הקטנה AB', 'E אמצע הקשת הגדולה AB'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O'), A = at(fig, 'A'), D = at(fig, 'D'), E = at(fig, 'E');
      const r = dist(A, O);
      expect(dist(D, O), 'D on the circle (arc), not the chord').toBeCloseTo(r, 5);
      expect(dist(E, O), 'E on the circle').toBeCloseTo(r, 5);
      expect(dist(D, E), 'minor & major midpoints antipodal').toBeCloseTo(2 * r, 5);
    },
  },
  {
    id: 'q5-isosceles-incircle-sqrt3-ratio-and-area',
    title: 'bagrut Q5: isosceles + incircle, «AC=√(3)CO» (the √() toolbar ratio) + «S_{CKE}=6» — builds green, area solves (issues #114/#115, ADR-310/311)',
    guards:
      "Operator prod session `qderonm3` (2026-07-13): the √3 ratio typed with the √() palette form failed deterministically (`AC=√(3)CO`, `AC גדול פי √(3) מ CO`) and escalated to the LLM, which produced a malformed figure — so `E על CB` defaulted onto the auto-created free point K and `S_{CKE}=6` reported «cannot place E so area=6». Two root fixes: #114 (the ratio rules now use the shared NUMEXPR atom, so `√(3)` parses deterministically — no LLM detour) and #115 (a free on-segment rider defaults into general position, off existing points). With both, the exact sequence builds green and the area solves.",
    steps: [
      'משולש שווה שוקיים ABC',
      'AB=AC',
      'במשולש חסום מעגל',
      'OA',
      'OB',
      'OC',
      'AC=√(3)CO',
      'CK=√(63)',
      'OK',
      'E על CB',
      'S_{CKE}=6',
    ],
    check(fig) {
      allStepsOk(fig);
      // |CK| = √63 (the stated length holds).
      expect(dist(at(fig, 'C'), at(fig, 'K'))).toBeCloseTo(Math.sqrt(63), 4);
      // area(CKE) = 6 (the area given is actually satisfied — the prod failure).
      const C = at(fig, 'C'), K = at(fig, 'K'), E = at(fig, 'E');
      const area = Math.abs((K.x - C.x) * (E.y - C.y) - (K.y - C.y) * (E.x - C.x)) / 2;
      expect(area).toBeCloseTo(6, 3);
      // E did not default onto K (general position, #115).
      expect(dist(E, K)).toBeGreaterThan(1);
    },
  },
  {
    id: 'q5-circle-cuts-BO-K-stays-on-segment',
    title: 'bagrut Q5: «המעגל חותך את BO בנקודה K» then «CK=√63» — K stays ON segment BO, does not flip beyond the centre (issue #119, ADR-313)',
    guards:
      "Operator dev session `disb4ebn` (2026-07-13): `המעגל חותך את BO בנקודה K` (O the incircle centre, B an external vertex) placed K between B and O, then the size given `CK=√(63)` flipped K to the intersection beyond O (off segment BO), silently green. Fixed by a stable within-segment SELECTION (ADR-313): `line-circle-intersection` gains `onSegment:[B,O]` — pick the root with parameter in (0,1), scale-invariant so it can't flip. A pure pick (no `collinear-order` constraint), so unlike a driving `order` it never over-constrains a sibling crossing on the same line (the tangent/secant #3 regression).",
    steps: [
      'במשולש שווה שוקיים חסום מעגל O',
      'AC=AB',
      { llm: ['AC=√3 CO'] }, // the operator's wordy «אורך…גדול פי √(3) מהקטע…» escalated (#105); canonical set-ratio
      'CO',
      'OB',
      'OA',
      'המעגל חותך את BO בנקודה K',
      'CK',
      'CK=√(63)',
    ],
    check(fig) {
      allStepsOk(fig);
      const B = at(fig, 'B'), O = at(fig, 'O'), K = at(fig, 'K'), C = at(fig, 'C');
      const L2 = (O.x - B.x) ** 2 + (O.y - B.y) ** 2;
      const t = ((K.x - B.x) * (O.x - B.x) + (K.y - B.y) * (O.y - B.y)) / L2;
      expect(t, 'K strictly between B and O on the segment').toBeGreaterThan(0.02);
      expect(t, 'K not beyond O').toBeLessThan(0.98);
      expect(dist(C, K), '|CK| = √63').toBeCloseTo(Math.sqrt(63), 3);
    },
  },
  {
    id: 'hosem-slip-container-marker-wins',
    title: 'משולש ABC חוסם במעגל + BC קוטר — the ב container marker wins over the חוסם verb letter (issues #31/#38, ADR-283)',
    guards:
      "Operator prod session `jsptarcl` (2026-07-11): the first step «משולש ABC חוסם במעגל» (חוסם — the classic one-letter slip for חסום; the ב on the circle says the CIRCLE is the container) was claimed by `incircle`'s circumscribes branch by the VERB alone and silently built the INCIRCLE DUAL (bisectors, incentre O, auto-named feet) with every row ✓; «BC קוטר» then over-constrained (a triangle side can't be an incircle diameter) and every later step inherited the wrong figure. Fix (ADR-283): `normalizeInscriptionSlip` in `normalizeUtterance` — an active חוסם-family verb directly governing a ב-marked container noun rewrites to the passive (the ADR-245 marker is authoritative; direct-object «חוסם את המעגל» untouched), so every rule resolves the direction the same way.",
    steps: ['משולש ABC חוסם במעגל', 'BC קוטר'],
    check(fig) {
      allStepsOk(fig);
      // The build is the INSCRIBED reading: one circle with A, B, C all ON it (the circumcircle).
      const circ = fig.construction.objects.find((o) => o.kind === 'circle') as { id: Id; center: Id } | undefined;
      expect(circ, 'a circle exists').toBeTruthy();
      const O = at(fig, circ!.center);
      const r = dist(at(fig, 'A'), O);
      for (const v of ['B', 'C'] as Id[]) expect(dist(at(fig, v), O), `${v} on the circumcircle`).toBeCloseTo(r, 5);
      // BC is a genuine diameter: B, centre, C collinear.
      const B = at(fig, 'B'), C = at(fig, 'C');
      expect(Math.abs((C.x - B.x) * (O.y - B.y) - (C.y - B.y) * (O.x - B.x)), 'B–centre–C collinear').toBeLessThan(1e-5);
      // No incircle scaffolding was minted (the bug's fingerprint: bisector lines + auto feet).
      expect(
        fig.construction.objects.some((o) => o.kind === 'line' && (o as { spec?: { via?: string } }).spec?.via === 'bisector'),
        'no bisector scaffold',
      ).toBe(false);
    },
  },
  {
    id: 'semicircle-on-existing-square-side',
    title: 'ריבוע → על צלע CD יש חצי מעגל → CD קוטר — a semicircle on an existing side attaches EXACTLY, square unmoved (issue #28, ADR-284)',
    guards:
      "Operator prod sessions `p3du4l9p`/`z57b5nd0`/`fxp24nna`: the semicircle rule predated M1 + free-radius — it re-declared the square's existing C,D as NEW on-circle points with PINNED θ on a hidden radius-5 circle, which never reached the side (every row ✓, figure verifier-amber: 'C should lie on circle P … but is 8.81 from its centre'), and the follow-up «CD קוטר» could not resolve the circle implicitly (zero satisfied members) — the student got stuck. Fix (ADR-284): with both endpoints EXISTING the semicircle is CLOSED-FORM — centre = midpoint of CD (a derived point), radius through C — zero solve, so the square cannot move (stability by construction); «CD קוטר» then resolves implicitly and passes as a check.",
    steps: ['ריבוע', 'על צלע CD יש חצי מעגל', 'CD קוטר'],
    check(fig) {
      allStepsOk(fig);
      const C = at(fig, 'C'), D = at(fig, 'D');
      const circ = fig.construction.objects.find((o) => o.kind === 'circle') as { id: Id; center: Id } | undefined;
      expect(circ, 'the hidden semicircle circle exists').toBeTruthy();
      const O = at(fig, circ!.center);
      // Centre exactly at the midpoint of CD; C and D antipodal at r = |CD|/2.
      expect(O.x).toBeCloseTo((C.x + D.x) / 2, 9);
      expect(O.y).toBeCloseTo((C.y + D.y) / 2, 9);
      const r = dist(C, O);
      expect(dist(D, O), 'D at the same radius').toBeCloseTo(r, 9);
      expect(r, 'r = |CD|/2').toBeCloseTo(dist(C, D) / 2, 9);
      // The square is intact (all four sides still equal — nothing shrank/rotated to "reach" the circle).
      const side = dist(at(fig, 'A'), at(fig, 'B'));
      for (const [x, y] of [['B', 'C'], ['C', 'D'], ['D', 'A']] as [Id, Id][])
        expect(dist(at(fig, x), at(fig, y)), `|${x}${y}| = |AB|`).toBeCloseTo(side, 6);
    },
  },
  {
    id: 'semicircle-diameter-phrasing-on-existing-side',
    title: 'ריבוע → חצי מעגל שהקוטר שלו CD — the possessive diameter phrasing lands on the side too (issue #28, ADR-284)',
    guards:
      "The same prod sessions' second phrasing: «חצי מעגל שהקוטר שלו CD» (a semicircle whose diameter is CD) hit the same pinned-θ re-declaration and left the arc floating off the square. Locks the closed-form lowering for the possessive form.",
    steps: ['ריבוע', 'חצי מעגל שהקוטר שלו CD'],
    check(fig) {
      allStepsOk(fig);
      const C = at(fig, 'C'), D = at(fig, 'D');
      const circ = fig.construction.objects.find((o) => o.kind === 'circle') as { id: Id; center: Id } | undefined;
      const O = at(fig, circ!.center);
      expect(dist(C, O)).toBeCloseTo(dist(C, D) / 2, 9);
      expect(dist(D, O)).toBeCloseTo(dist(C, D) / 2, 9);
    },
  },
  {
    id: 'ratio-radical-coefficient',
    title: 'AB=√2*OD — a radical coefficient × segment proportion parses deterministically (issue #52, ADR-285)',
    guards:
      "Operator prod report (2026-07-11): `AB=√2*OD` (OD a radius of circle O — the natural textbook form) was not recognized (escalated to the LLM, which failed in prod) while `AB=√2*R` and `AB/OD = √2` worked: `ratioConstraint`'s coefficient atom was plain-decimal while its `/`-form sibling already read √-aware values. Fix (ADR-285): the shared radical-aware coefficient atom on both `=` sides, the trailing divisor, and the Hebrew פי form.",
    steps: ['מעגל O', 'D על המעגל', 'AB', 'AB=√2*OD'],
    check(fig) {
      allStepsOk(fig);
      const ab = dist(at(fig, 'A'), at(fig, 'B'));
      const od = dist(at(fig, 'O'), at(fig, 'D'));
      expect(ab, '|AB| = √2·|OD|').toBeCloseTo(Math.SQRT2 * od, 4);
    },
  },
  {
    id: 'height-from-vertex-never-drops-onto-a-diagonal',
    title: 'גובה מ A / גובה מ B in a quad with a diagonal — a height drops to a real SIDE, never the diagonal (ADR-263)',
    guards:
      'The operator hit a quadrilateral (parallelogram ABCD) with diagonal BD drawn: "גובה מ A" was understood but "גובה מ B" was refused, and a named height "BE גובה" drew onto the diagonal BD they never asked for. Root cause: the `altitude` rule\'s neighbour-adjacency fallback triangulated the quad ACROSS the drawn diagonal — from A it found the single triangle ABD and dropped the foot onto BD (a DIAGONAL, not a side); from B it found TWO such triangles (ABD, CBD) and refused as ambiguous. Fix (ADR-263): the opposite side of a height must be a real POLYGON EDGE not touching the apex (`oppositePolygonEdges`, which can never return a diagonal); a triangle has exactly one, a parallelogram/quad has several genuine heights → DRAW ONE deterministically rather than refuse (the operator\'s steer, superseding ADR-169\'s parallelogram-defers). A second altitude also no longer re-uses the foot label F (freeLabel now excludes every existing point).',
    steps: ['מקבילית ABCD', 'BD', 'גובה מ A', 'גובה מ B', 'BE גובה'],
    check(fig) {
      allStepsOk(fig);
      // Adjacent vertices of the parallelogram ABCD (a real side is one of these pairs; BD is the diagonal).
      const isSide = (a: Id, b: Id) => {
        const key = [a, b].sort().join('');
        return ['AB', 'BC', 'CD', 'AD'].includes(key);
      };
      const feet = fig.construction.objects.filter((o) => o.kind === 'foot') as { id: Id; from: Id; a: Id; b: Id }[];
      expect(feet.length, 'three heights → three feet').toBe(3);
      const footIds = new Set(feet.map((f) => f.id));
      expect(footIds.size, 'the feet have DISTINCT labels (no F/F collision)').toBe(3);
      for (const f of feet) {
        // The base is a genuine side of the quad — never the diagonal BD (the reported bug).
        expect(isSide(f.a, f.b), `height from ${f.from} drops onto real side ${f.a}${f.b}, not a diagonal`).toBe(true);
        expect([f.a, f.b].sort().join(''), `foot of ${f.from} is NOT on diagonal BD`).not.toBe('BD');
        // …and the foot actually lands perpendicular on that side: |from−foot| ⟂ side.
        const from = at(fig, f.from), foot = at(fig, f.id), A = at(fig, f.a), B = at(fig, f.b);
        const side = { x: B.x - A.x, y: B.y - A.y };
        const drop = { x: foot.x - from.x, y: foot.y - from.y };
        const cos = (side.x * drop.x + side.y * drop.y) / (Math.hypot(side.x, side.y) * Math.hypot(drop.x, drop.y) || 1);
        expect(Math.abs(cos), `${f.from}${f.id} ⟂ ${f.a}${f.b}`).toBeLessThan(1e-3);
      }
    },
  },
  {
    id: 'rhombus-inscribed-in-triangle',
    title: 'מעוין BDEF חסום במשולש ABC — a polygon inscribed in a polygon (ADR-262)',
    guards:
      'The operator hit the bagrut figure "מעוין חסום במשולש" (rhombus inscribed in a triangle) and had to build it point-by-point because the construct did not exist. Worse, "מעוין חסום במשולש ABC" SILENTLY MISPARSED to the triangle\'s incircle (a circle) — `isCircleInPolygon` only checked that the container was a polygon, never that the inscribed thing was a circle, so the `incircle` rule claimed it and the rhombus word was dropped (§6 honesty violation). Fix (ADR-262): a general polygon-in-polygon `inscribe` command — shared labels coincide with their container vertex, other vertices ride the sides as free on-segment points, and the shape\'s equal-side / right-angle constraints flex them into shape (the ADR-110 macro pattern, no new engine construct); the mirror/base-side choice is a cyclable variant (ADR-052/M4). `incircle` now requires a circle noun (semantic guard).',
    steps: ['מעוין BDEF חסום במשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      // The container triangle and all four rhombus vertices exist.
      for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) expect(fig.positions.has(id), `${id} placed`).toBe(true);
      // The rhombus BOUNDARY is actually DRAWN — a polygon object + its four side segments (the bug the
      // operator hit: riders + equal-length constraints were emitted but no lines, so nothing rendered / was
      // detected / was reportable as equal). `polygon` supplies both.
      expect(fig.construction.objects.some((o) => o.kind === 'polygon' && o.id === 'poly-BDEF'), 'rhombus drawn').toBe(true);
      const segIds = new Set(fig.construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id));
      for (const [a, b] of [['B', 'D'], ['D', 'E'], ['E', 'F'], ['F', 'B']])
        expect(segIds.has(`seg-${a}${b}`) || segIds.has(`seg-${b}${a}`), `side ${a}${b} drawn`).toBe(true);
      // It is a genuine rhombus: all four sides equal.
      const s1 = dist(at(fig, 'B'), at(fig, 'D'));
      for (const [x, y] of [['D', 'E'], ['E', 'F'], ['F', 'B']] as [Id, Id][])
        expect(dist(at(fig, x), at(fig, y)), `|${x}${y}| = |BD|`).toBeCloseTo(s1, 3);
      // D, E, F each lie ON a side of triangle ABC (inscribed). B is the shared vertex.
      const sides: [Id, Id][] = [['A', 'B'], ['B', 'C'], ['C', 'A']];
      const onSomeSide = (p: Id) =>
        sides.some(([a, b]) => {
          const A = at(fig, a), B = at(fig, b), P = at(fig, p);
          const t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
          if (t < -0.02 || t > 1.02) return false;
          const cx = A.x + t * (B.x - A.x), cy = A.y + t * (B.y - A.y);
          return Math.hypot(P.x - cx, P.y - cy) < 1e-3;
        });
      for (const p of ['D', 'E', 'F'] as Id[]) expect(onSomeSide(p), `${p} on a triangle side`).toBe(true);
    },
  },
  {
    id: 'bisector-from-vertex-no-triple',
    title: 'CD חוצה זוית (angle-bisector from a vertex, triple omitted) after triangle ABC + AB=AC — the two half-angles are equal',
    guards:
      'The operator typed "triangle ABC" → "AB=AC" → "CD חוצה זוית": a line was drawn but the half-angles were NOT equal (a prod user also errored on this phrasing). Root cause: the deterministic parser handled an angle bisector from a vertex only when the angle triple was spelled out ("CD חוצה זוית ACB"); with it omitted the input fell through to the LLM, which drew a bare line with no equal-angle constraint. Fix: `bisectorPlacesPoint` resolves the omitted angle from the vertex (the segment\'s first letter) + the figure\'s neighbours (the ADR-164 single-vertex resolution, gated to an explicit "angle"/"זוית" so a segment bisection never mis-fires), and the rule moved ahead of the shape rules so its "…במשולש ABC" form is not shadowed by `triangle`\'s SHAPE_LEFTOVER \'stop\'.',
    steps: ['משולש ABC', 'AB=AC', 'CD חוצה זוית'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('D'), 'D was placed').toBe(true);
      // D lies on segment AB (the opposite side).
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D');
      const t = ((D.x - A.x) * (B.x - A.x) + (D.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      expect(t, 'D within AB').toBeGreaterThan(0.02);
      expect(t, 'D within AB').toBeLessThan(0.98);
      // CD really bisects ∠ACB: the two half-angles are equal.
      expect(angle(at(fig, 'A'), at(fig, 'C'), D), '∠ACD = ∠DCB').toBeCloseTo(angle(D, at(fig, 'C'), at(fig, 'B')), 4);
    },
  },
  {
    id: 'bisector-from-vertex-in-triangle',
    title: 'BD חוצה זוית במשולש ABC — the "…במשולש ABC" bisector phrasing is not shadowed by the triangle rule',
    guards:
      'Sibling of bisector-from-vertex-no-triple (same construct, from the debug log): "BD חוצה זוית במשולש ABC" escalated to the LLM because the `triangle` rule matched the embedded "משולש ABC", found the "חוצה זוית" leftover, and returned \'stop\'. Fixed by ordering `bisectorPlacesPoint` before the shape rules (the same placement median/altitude/midsegment use).',
    steps: ['משולש ABC', 'BD חוצה זוית במשולש ABC'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('D'), 'D was placed').toBe(true);
      expect(angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'D')), '∠ABD = ∠DBC').toBeCloseTo(angle(at(fig, 'D'), at(fig, 'B'), at(fig, 'C')), 4);
    },
  },
  {
    id: 'stated-meet-relocates-loose-point',
    title: 'AM חותך את CO בנקודה K with M loose: the stated meet re-seats M so the segments really cross (and M stays outside)',
    guards:
      'ADR-255: operator session gaawv4fr (2026-07-08) — with M seeded outside up-LEFT of the circle, segments AM and CO cannot cross; the figure built ✓ with K on the continuations, the amber was easy to miss, and NO sampled config could rescue it (findValidConfig null — seed jitter explores only a small neighbourhood of the free default). A stated segment-meet is information about where the loose endpoint belongs (M1/M4): apply now re-seats a non-pinned, constraint-free endpoint along the ray from its fixed mate through the other segment\'s midpoint, preserving its circle sides (the stated "M מחוץ למעגל" survives) and general position. Typos as typed: "על במעגל", "בנדוקה".',
    steps: ['AB קוטר', 'C על במעגל', 'M מחוץ למעגל', 'AM חותך את CO בנדוקה K'],
    check(fig) {
      allStepsOk(fig);
      const c = fig.circles.get('circle-O');
      expect(c, 'circle O resolved').toBeTruthy();
      if (!c) return;
      // M is strictly outside — the ADR-254 side statement survived the re-seat.
      expect(dist(at(fig, 'M'), c.center), 'M outside circle O').toBeGreaterThan(c.r);
      // K lies WITHIN both stated segments (the meet is real, not on a continuation).
      const within = (g: string, a: string, b: string) => {
        const A = at(fig, a), B = at(fig, b), G = at(fig, g);
        return ((G.x - A.x) * (B.x - A.x) + (G.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      };
      expect(within('K', 'A', 'M'), 'K within AM').toBeGreaterThan(0.02);
      expect(within('K', 'A', 'M'), 'K within AM').toBeLessThan(0.98);
      expect(within('K', 'C', 'O'), 'K within CO').toBeGreaterThan(-0.02);
      expect(within('K', 'C', 'O'), 'K within CO').toBeLessThan(1.02);
    },
  },
  {
    id: 'first-utterance-meet-of-default-segments',
    title: 'מיתר CK חותך את AO בנקודה E as the FIRST utterance — two default segments must not land parallel (#34, ADR-287)',
    guards:
      'Issue #34 (log-triage 2026-07-11, three distinct prod users hit the class): as a first utterance the compound refused "cannot construct E: lines CK and AO are parallel". Root cause: the ADR-253 general-position spin ran only for 1-anchor templates, so two DISJOINT default segments (both laid horizontally by placeBase, the second merely offset right — a pure translation) were EXACTLY parallel, and the meet had no crossing at the only composition the apply gate judges. ADR-287: direction joins the general-position bar for bare SEGMENT templates — a new default segment spins (golden-angle) until oblique to every drawn edge (0-anchor and 1-anchor alike; named shapes keep their canonical orientation). With a real crossing available, the ADR-255 re-seat then lands E within both segments.',
    steps: ['מיתר CK חותך את AO בנקודה E'],
    check(fig) {
      allStepsOk(fig);
      const within = (g: string, a: string, b: string) => {
        const A = at(fig, a), B = at(fig, b), G = at(fig, g);
        return ((G.x - A.x) * (B.x - A.x) + (G.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      };
      expect(fig.positions.has('E'), 'E was placed').toBe(true);
      expect(within('E', 'C', 'K'), 'E within CK').toBeGreaterThan(-0.02);
      expect(within('E', 'C', 'K'), 'E within CK').toBeLessThan(1.02);
      expect(within('E', 'A', 'O'), 'E within AO').toBeGreaterThan(-0.02);
      expect(within('E', 'A', 'O'), 'E within AO').toBeLessThan(1.02);
    },
  },
  {
    id: 'kite-EMKO-outside-point',
    title: 'bagrut: AB קוטר, M מחוץ למעגל, AM חותך את CO ב-K, E על BO, דלתון EMKO (MK=ME, OK=OE)',
    guards:
      'ADR-254 + ADR-253: the operator typed this figure (session ad66x493, 2026-07-08) and hit BOTH bugs. (1) "M מחוץ למעגל" was unrepresentable (LLM → not-understood), so M entered as a bare endpoint of "AM" with no record it belongs outside; (2) that bare endpoint was default-placed at A+(5,0) — EXACTLY on B and collinear with A,O,B — so K = AM∩OC collapsed onto O and both kite givens (OK=OE, MK=ME) hard-failed at the only composition the apply gate judges, on every seed (the seed is applied after the fold). Now the side statement parses (a free point seeded outside, the side a verifier/meetsRequirements requirement) and defaults land in general position.',
    steps: [
      'AB קוטר במעגל O',
      'C על המעגל',
      'AC',
      'M מחוץ למעגל',
      'AM',
      'OM',
      { llm: ['K חיתוך AM ו-OC'] }, // the operator's typo "AM חותף את OC בנקודה K" escalated; the LLM's canonical line, from the log
      'E על BO',
      'OK=OE',
      'MK=ME',
    ],
    check(fig) {
      allStepsOk(fig);
      const c = fig.circles.get('circle-O');
      expect(c, 'circle O resolved').toBeTruthy();
      if (!c) return;
      // M is strictly OUTSIDE the circle — the stated side survives the kite solve.
      expect(dist(at(fig, 'M'), c.center), 'M outside circle O').toBeGreaterThan(c.r * 1.02);
      // The kite EMKO: both stated equalities hold, and K did not degenerate onto O.
      expect(dist(at(fig, 'O'), at(fig, 'K'))).toBeCloseTo(dist(at(fig, 'O'), at(fig, 'E')), 3);
      expect(dist(at(fig, 'M'), at(fig, 'K'))).toBeCloseTo(dist(at(fig, 'M'), at(fig, 'E')), 3);
      expect(dist(at(fig, 'K'), at(fig, 'O')), 'K distinct from O').toBeGreaterThan(0.05 * c.r);
      // E lies within segment BO (not at an endpoint, not on the continuation).
      const B = at(fig, 'B'), O = at(fig, 'O'), E = at(fig, 'E');
      const t = ((E.x - B.x) * (O.x - B.x) + (E.y - B.y) * (O.y - B.y)) / ((O.x - B.x) ** 2 + (O.y - B.y) ** 2);
      expect(t, 'E within BO').toBeGreaterThan(0.02);
      expect(t, 'E within BO').toBeLessThan(0.98);
    },
  },
  {
    id: 'kite-EMKO-degenerate-default',
    title: 'the same figure WITHOUT the side statement: a bare "AM" endpoint must not stack onto B (general position)',
    guards:
      'ADR-253: the fact list as it actually committed in session ad66x493 (the side statement was refused, so M was created by "AM" alone). placeBase\'s one-anchor fit is a pure translation, so M landed at A+(5,0) = B exactly — a measure-zero degenerate default that poisoned every later solve. Defaults must land in general position; with that, the kite constraints drive M/C/E to a valid figure on their own.',
    steps: [
      'AB קוטר במעגל O',
      'C על המעגל',
      'AC',
      'AM',
      'OM',
      { llm: ['K חיתוך AM ו-OC'] },
      'E על BO',
      'OK=OE',
      'MK=ME',
    ],
    check(fig) {
      allStepsOk(fig);
      expect(dist(at(fig, 'O'), at(fig, 'K'))).toBeCloseTo(dist(at(fig, 'O'), at(fig, 'E')), 3);
      expect(dist(at(fig, 'M'), at(fig, 'K'))).toBeCloseTo(dist(at(fig, 'M'), at(fig, 'E')), 3);
      expect(dist(at(fig, 'M'), at(fig, 'B')), 'M did not stack onto B').toBeGreaterThan(0.5);
    },
  },
  {
    id: 'incircle-inverted-passive-quad',
    title: 'במרובע ABCD חסום מעגל O — the inverted passive (container-first) reads as the INCIRCLE, not the converse',
    guards:
      'ADR-245: `isCircleInPolygon` discriminated the inscription roles by word ORDER, so the bagrut-standard inverted passive "במרובע ABCD חסום מעגל O" flipped subject and container and silently built the CONVERSE (quad ABCD riding circle O). The container is the noun carrying the ב prefix / "in", wherever it sits. Operator session ufxrtyp2 (2026-07-06); the sibling "במשולש ABC חסום מעגל" had built a circumcircle since 2026-06-22.',
    steps: ['במרובע ABCD חסום מעגל O', 'OB'],
    check(fig) {
      allStepsOk(fig);
      const c = fig.circles.get('circle-O');
      expect(c, 'circle O resolved').toBeTruthy();
      if (!c) return;
      // The QUAD is tangential to the circle: each side's distance from O equals the radius…
      const sides: [string, string][] = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']];
      for (const [p, q] of sides) {
        const a = at(fig, p);
        const b = at(fig, q);
        const off = Math.abs((b.x - a.x) * (c.center.y - a.y) - (b.y - a.y) * (c.center.x - a.x)) / dist(a, b);
        expect(Math.abs(off - c.r), `side ${p}${q} tangent to circle O`).toBeLessThan(0.05 * c.r + 0.01);
      }
      // …and the vertices are NOT on the circle (the converse figure would put them there).
      for (const p of ['A', 'B', 'C', 'D'] as const) {
        expect(dist(at(fig, p), c.center), `${p} strictly outside circle O`).toBeGreaterThan(c.r * 1.05);
      }
    },
  },
  {
    id: 'incircle-definite-ref-binds-existing-quad',
    title: 'ABCD מרובע ואז "במרובע חסום מעגל" — the definite unnamed reference binds to THE existing quad',
    guards:
      'ADR-245: an unnamed definite shape reference ("במרובע" — THE quad) minted a fresh auto-named polygon (EFGH) instead of binding to the one already drawn; combined with the order bug it built a second quad inscribed in a circle. Exactly one existing n-gon in the figure now binds (the ADR-029 implicit-reference pattern, polygon edition). Operator session ufxrtyp2 (2026-07-06).',
    steps: ['ABCD מרובע', 'במרובע חסום מעגל'],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('E'), 'no fresh auto-named quad (E must not exist)').toBe(false);
      const c = fig.circles.get('circle-O');
      expect(c, 'the incircle resolved (auto-centre O)').toBeTruthy();
      if (!c) return;
      for (const [p, q] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as [string, string][]) {
        const a = at(fig, p);
        const b = at(fig, q);
        const off = Math.abs((b.x - a.x) * (c.center.y - a.y) - (b.y - a.y) * (c.center.x - a.x)) / dist(a, b);
        expect(Math.abs(off - c.r), `side ${p}${q} tangent to the incircle`).toBeLessThan(0.05 * c.r + 0.01);
      }
    },
  },
  {
    id: 'two-concentric-circles-q6',
    title: 'שני מעגלים בעלי מרכז משותף O — chords of the outer and inner circles on one line (bagrut Q6)',
    guards:
      'operator report (2026-07-06): "שני מעגלים בעלי מרכז משותף O gives me just one circle". Root cause (ADR-244): circle IDENTITY was the centre letter (`circle-<centre>`), so a second concentric circle was unrepresentable — the He phrase dead-ended at the LLM (whose improvised second circle command collapsed into a RESIZE of the first, log session 3k5jezuu), the En phrase half-parsed to ONE circle, and "המעגל החיצוני/הפנימי" silently attached to the one circle. Fix: the pair macro (`circle-O` bound outer + `circle-O-2` bound inner via `set-radius-order`), the qualifier-resolution post-pass (chokepoint — every circle rule at once), per-circle-id `circleMembers`, and the ambiguous-circle clarification for unqualified references.',
    steps: [
      'נתונים שני מעגלים בעלי מרכז משותף O',
      'AD מיתר במעגל החיצוני',
      'BC מיתר במעגל הפנימי',
      'B ו-C על AD',
      'E נקודה על המעגל החיצוני',
    ],
    check(fig) {
      allStepsOk(fig);
      const outer = fig.circles.get('circle-O');
      const inner = fig.circles.get('circle-O-2');
      expect(outer, 'outer circle resolved').toBeTruthy();
      expect(inner, 'inner circle resolved').toBeTruthy();
      if (!outer || !inner) return;
      expect(inner.r, 'inner strictly inside outer').toBeLessThan(outer.r);
      // Memberships: A, D, E ride the OUTER circle; B, C the INNER (the qualifier resolution).
      for (const [p, c] of [['A', outer], ['D', outer], ['E', outer], ['B', inner], ['C', inner]] as const) {
        expect(Math.abs(dist(at(fig, p), c.center) - c.r), `${p} on its circle`).toBeLessThan(0.05 * c.r + 0.05);
      }
      // B and C lie ON segment AD (the drawing's one line A-B-C-D).
      const a = at(fig, 'A');
      const d = at(fig, 'D');
      const ad2 = (d.x - a.x) ** 2 + (d.y - a.y) ** 2;
      for (const p of ['B', 'C'] as const) {
        const v = at(fig, p);
        const t = ((v.x - a.x) * (d.x - a.x) + (v.y - a.y) * (d.y - a.y)) / ad2;
        const off = Math.abs((v.x - a.x) * (d.y - a.y) - (v.y - a.y) * (d.x - a.x)) / Math.sqrt(ad2);
        expect(t, `${p} within segment AD`).toBeGreaterThan(0.02);
        expect(t, `${p} within segment AD`).toBeLessThan(0.98);
        expect(off, `${p} on line AD`).toBeLessThan(0.1);
      }
    },
  },
  {
    id: 'diameter-edit-rereads-at-position',
    title: 'editing "AB קוטר" → "AC קוטר" (chord+⊥ figure): the edit re-reads at its own position and stays a real diameter',
    guards:
      "operator report (2026-07-06, screenshot session): מעגל O / AB קוטר / BD מיתר / BD⊥AC drew correctly; editing step 2 to \"AC קוטר\" broke the figure — A slipped off the circle and C floated far outside, with every row still ✓. Root cause (ADR-241): commitEdit re-parsed against the END-STATE figure context, where C already existed (created free by the ⊥ step's auto-segment), so the diameter rule's existing-endpoints branch (ADR-137) lowered to a bare `set-collinear A O C` — dropping the memberships — and the splice replayed that weaker command at position 2. Fix: the edit parses against the PREFIX context (the figure before the edited step — the context the replacement is replayed in), which lowers to the constructive `diameter`; plus the ADR-137 branch now asserts membership for existing endpoints not on the circle (existence ≠ membership, the ADR-233 lesson).",
    steps: ['מעגל O', 'AB קוטר', 'BD מיתר', 'BD⊥AC', { edit: { step: 2, to: 'AC קוטר' } }],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const r = fig.circles.get('circle-O')!.r;
      for (const p of ['A', 'B', 'C', 'D']) expect(dist(O, at(fig, p)), `${p} on the circle`).toBeCloseTo(r, 4);
      // AC is a true diameter: A—O—C collinear (so |AC| = 2r) …
      expect(dist(at(fig, 'A'), at(fig, 'C')), '|AC| = 2r (through the centre)').toBeCloseTo(2 * r, 4);
      // … and the stated BD ⊥ AC holds.
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((p) => at(fig, p));
      const dot = (B.x - D.x) * (A.x - C.x) + (B.y - D.y) * (A.y - C.y);
      expect(Math.abs(dot) / (dist(B, D) * dist(A, C)), 'BD ⊥ AC').toBeLessThan(1e-4);
    },
  },
  {
    id: 'diameter-on-existing-free-points',
    title: '"AC קוטר" typed AFTER "BD⊥AC" created A,C as free points: the diameter puts them ON the circle (membership, not just collinearity)',
    guards:
      'the no-edit member of the ADR-241 class, reachable on the plain submit path: מעגל O / BD⊥AC (creates A,C free) / AC קוטר. The diameter rule\'s ADR-137 existing-endpoints branch gated on label EXISTENCE where the semantics need circle MEMBERSHIP — "XY is a diameter" entails X,Y ∈ circle AND collinear-through-centre, but the branch emitted only the collinearity, so A and C stayed floating free with every row ✓ and the verifier green (it can only check what the commands assert). The branch now asserts `point-on-circle` for any existing endpoint not already a member (idempotent for real chord endpoints, the ADR-099 lowering).',
    steps: ['מעגל O', 'BD⊥AC', 'AC קוטר'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const r = fig.circles.get('circle-O')!.r;
      for (const p of ['A', 'C']) expect(dist(O, at(fig, p)), `${p} on the circle`).toBeCloseTo(r, 4);
      expect(dist(at(fig, 'A'), at(fig, 'C')), '|AC| = 2r (a real diameter)').toBeCloseTo(2 * r, 4);
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((p) => at(fig, p));
      const dot = (B.x - D.x) * (A.x - C.x) + (B.y - D.y) * (A.y - C.y);
      expect(Math.abs(dot) / (dist(B, D) * dist(A, C)), 'BD ⊥ AC').toBeLessThan(1e-4);
    },
  },
  {
    id: 'multi-point-on-circle-membership',
    title: '"A ו C נמצאות על המעגל": EVERY listed point lands on the circle (the saved-file C that floated free)',
    guards:
      'operator\'s exported `.geo.json` (2026-07-06, saved on the server): מעגל O / "A ו C נמצאות על המעגל" / OC / OA / AC. The step\'s stored lowering was `point-on-circle A` ALONE — `pointOnCircle` read only the FIRST label of a multi-subject statement, and although the droppedNewLabels net flagged C and escalated, the LLM round-trip re-entered the same single-subject grammar, so the partial lowering committed and the file carried it to every machine (loading replays stored commands, never the parser — ADR-232). Root cause (ADR-240): a multi-subject membership statement parsed single-subject. The rule now reads the ADR-076 uppercase-label-list subject; the LLM commit path re-checks droppedNewLabels (the second honesty gate); load runs the drift+dropped audit (ADR-242).',
    steps: ['מעגל O', 'A ו C נמצאות על המעגל', 'OC', 'OA', 'AC'],
    check(fig) {
      allStepsOk(fig);
      const O = at(fig, 'O');
      const r = fig.circles.get('circle-O')!.r;
      for (const p of ['A', 'C']) expect(dist(O, at(fig, p)), `${p} on the circle`).toBeCloseTo(r, 4);
    },
  },
  {
    id: 'segment-tangent-at-on-circle-endpoint-new-far-end',
    title: '"BA משיק למעגל" with A already on the circle and B NEW: the tangent AT A (B a point along it), not a tangent FROM A that collapses B onto A',
    guards:
      'operator session `pr1y4i70` (2026-07-06): `משולש ACD` → `ACD חסום במעגל` (A, C, D on the circle) → `BA משיק למעגל`. `tangentFromExternal` read A — the one label that already existed — as the external APEX and B as a NEW touch, building the Thales aux-circle on OA. But A is ON the circle, so that aux-circle is internally tangent at A: `circle-circle-intersection` has the single root A, so the computed touch B collapsed onto A (a degenerate chord, no tangent). Root cause (ADR-233): the apex role was assigned by the PROXY "it already exists" instead of the SEMANTIC fact "it is off the circle". Fix: `tangentFromExternal` defers when its would-be apex is a circle member (an on-circle point is the TOUCH), and `tangentLine` — which then draws the tangent AT A — now materialises the OTHER named endpoint B as a ±offset slider on the tangent, so nothing the student typed is dropped. The unclosed on-circle-endpoint + NEW-off-circle-endpoint member of the ADR-081/082 family.',
    steps: ['משולש ACD', 'ACD חסום במעגל', 'BA משיק למעגל'],
    check(fig) {
      allStepsOk(fig);
      // B is created and DISTINCT from A — the bug collapsed the computed touch B onto the on-circle apex A.
      expect(fig.positions.has('B'), 'B is placed').toBe(true);
      expect(dist(at(fig, 'A'), at(fig, 'B')), 'B is not collapsed onto A').toBeGreaterThan(0.5);
      // A, C, D lie on one circle (the inscribed triangle's circumcircle); find its centre label-agnostically.
      const circ = fig.construction.objects.find((o) => o.kind === 'circle' && !o.center.startsWith('~')) as { center: Id } | undefined;
      expect(circ, 'the circle exists').toBeDefined();
      const O = at(fig, circ!.center);
      const r = dist(O, at(fig, 'A'));
      for (const p of ['A', 'C', 'D']) expect(dist(O, at(fig, p)), `${p} on the circle`).toBeCloseTo(r, 4);
      // BA is genuinely tangent AT A: the radius O→A ⟂ the tangent direction A→B ((A−O)·(B−A) ≈ 0).
      const A = at(fig, 'A'), B = at(fig, 'B');
      const dot = (A.x - O.x) * (B.x - A.x) + (A.y - O.y) * (B.y - A.y);
      expect(Math.abs(dot) / (dist(O, A) * dist(A, B) || 1), 'BA ⟂ OA (tangent at A)').toBeLessThan(0.02);
    },
  },
  {
    id: 'tangent-circle-size-given-drives-radius-not-centre',
    title: 'two tangent circles + |O1M|=9, |O2M|=16 (M the touch point) + two tangents from N to O1 at M and B',
    guards:
      'operator session gzswxmq3: two circles O1,O2 tangent externally at M; the size givens "O1M=9" and "O2M=16" (M is the touch point, so |O1M| is O1\'s radius); then "from N two tangents to O1 at M and B". The final tangent step over-constrained ("|O1M|=9 cannot hold") and the second tangent was left non-perpendicular. Root cause (ADR-230): a set-distance |centre·P| where P lies on the circle IS the radius, but with the free radius already BUSY driving the tangency coincide, driveOrCheck could reach neither the radial point (not a movable carrier) nor the radius (unavailable) and fell through to the free CENTRE — which can never change |O1M| — injecting a spurious, useless centre DOF into every later solve, so the 6-DOF system (2 free centres + N + B) landed in compromise basins. Fix: route a size given on a BUSY tangency radius to the radius (pin it) and hand the coincide\'s centre-gap to a free centre (keepTangencyDriven now fires as soon as ANY tangency radius is pinned, since the remaining free radius alone can\'t satisfy a fixed centre gap). An AVAILABLE free radius (two INTERSECTING circles) is left flexible so the recruiter grows it without breaking circle∩circle.',
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M',
      'O1M=9',
      'O2M=16',
      'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B',
    ],
    check(fig) {
      allStepsOk(fig);
      // The size givens hold: |O1M| = r1 = 9, |O2M| = r2 = 16 (M on both circles at the tangency).
      expect(dist(at(fig, 'O1'), at(fig, 'M')), '|O1M| = 9').toBeCloseTo(9, 2);
      expect(dist(at(fig, 'O2'), at(fig, 'M')), '|O2M| = 16').toBeCloseTo(16, 2);
      // Both tangents from N are genuinely tangent to O1: the radius to the touch point ⟂ the tangent line.
      const perp = (touch: Id) => {
        const O = at(fig, 'O1'), T = at(fig, touch), N = at(fig, 'N');
        const dotv = (T.x - O.x) * (N.x - T.x) + (T.y - O.y) * (N.y - T.y);
        return dotv / (dist(O, T) * dist(N, T)); // cos of the angle — ~0 when perpendicular
      };
      expect(Math.abs(perp('M')), 'NM ⟂ O1M (tangent at M)').toBeLessThan(0.02);
      expect(Math.abs(perp('B')), 'NB ⟂ O1B (tangent at B)').toBeLessThan(0.02);
      // The stated sizes stay VISIBLE (review F6 / ADR-231): the radius reroute must keep the student's
      // "O1M=9"/"O2M=16" on the on-canvas measure labels (they are harvested from `distance` constraints,
      // which the reroute now records as tautological checks alongside the radius pin).
      const lengthKeys = fig.labels.lengths.map((l) => [l.a, l.b].sort().join(''));
      expect(lengthKeys, 'the |O1M| label survives the radius reroute').toContain(['O1', 'M'].sort().join(''));
      expect(lengthKeys, 'the |O2M| label survives the radius reroute').toContain(['O2', 'M'].sort().join(''));
    },
  },
  {
    id: 'size-given-scales-similarity-gauge-figure',
    title: 'two tangent circles + tangent pairs from N to BOTH circles + A on the extension of BN + the sizes typed LAST (the reloaded gblq4wue figure)',
    guards:
      'operator session gblq4wue (a saved figure reloaded, then "O2M=9" typed): two circles tangent at M; from N tangent pairs to BOTH circles (touching O1 at M,B and O2 at M,A — so NM is the common inner tangent); "A on the extension of BN" (the line BA is the common outer tangent through N); then the size "O2M=9". The size was refused "over-constrained: M coincides with its constructed target cannot hold" and stayed deferred forever. Root cause (ADR-237): the ADR-230 reroute pinned r2 correctly, but keepTangencyDriven found NO idle centre to hand the coincide\'s gap to — in this richer figure O1\'s centre already drives the A-B-N collinearity and O2\'s centre a tangency ⟂ — so the coincide stayed owned by the one remaining free radius, which cannot widen the centre gap (r ≥ 0), and the 9-DOF recruited solve never converges on what is actually a SIMILARITY-GAUGE move: the figure states no other absolute size, so the first length given is satisfiable exactly by scaling every free DOF by k = stated/measured. Fix: the step failure path tries that closed-form SCALE RESCUE (try-and-verify — accepted only if the full evaluation then holds, so any other absolute given makes it fall through unharmed). The SECOND size (O1M=16) then pins the remaining radius, orphaning the coincide into the M2/ADR-231 re-home path, and the full bagrut figure closes at |O1O2| = 25.',
    steps: [
      'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M',
      'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B',
      'מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A',
      'A נמצאת על המשך BN',
      'O2O1',
      'O2M=9',
      'O1M=16',
    ],
    check(fig) {
      allStepsOk(fig);
      // Both stated sizes hold exactly, and the tangency keeps the centres at r1 + r2 apart.
      expect(dist(at(fig, 'O2'), at(fig, 'M')), '|O2M| = 9').toBeCloseTo(9, 2);
      expect(dist(at(fig, 'O1'), at(fig, 'M')), '|O1M| = 16').toBeCloseTo(16, 2);
      expect(dist(at(fig, 'O1'), at(fig, 'O2')), '|O1O2| = r1 + r2 = 25').toBeCloseTo(25, 2);
      // Every tangency stays genuinely tangent (radius ⟂ tangent segment at each touch point).
      const cosAt = (centre: Id, touch: Id) => {
        const O = at(fig, centre), T = at(fig, touch), N = at(fig, 'N');
        return ((T.x - O.x) * (N.x - T.x) + (T.y - O.y) * (N.y - T.y)) / (dist(O, T) * dist(N, T) || 1);
      };
      expect(Math.abs(cosAt('O1', 'M')), 'NM ⟂ O1M').toBeLessThan(0.02);
      expect(Math.abs(cosAt('O1', 'B')), 'NB ⟂ O1B').toBeLessThan(0.02);
      expect(Math.abs(cosAt('O2', 'M')), 'NM ⟂ O2M').toBeLessThan(0.02);
      expect(Math.abs(cosAt('O2', 'A')), 'NA ⟂ O2A').toBeLessThan(0.02);
      // A, N, B collinear (the common outer tangent through N).
      const A = at(fig, 'A'), B = at(fig, 'B'), N = at(fig, 'N');
      const cross = (B.x - A.x) * (N.y - A.y) - (B.y - A.y) * (N.x - A.x);
      expect(Math.abs(cross) / (dist(A, B) * dist(A, N) || 1), 'A, N, B collinear').toBeLessThan(0.03);
    },
  },
  {
    id: 'perpendicular-helper-flips-to-reach-crossing',
    title: 'right triangle + "DF ⟂ AB" + "AC and DF meet at E": DF flips to the side where it actually crosses AC',
    guards:
      'operator session nc207foh: right triangle ABC, D the midpoint of hypotenuse AB, "DF אנך ל AB" (DF ⟂ AB), then "AC ו DF נחתכים בנקודה E". The step built with no error but E landed OFF both segments (param ≈ −4.2 along DF, 1.22 along AC) — the operator: "DF should have moved so it fits the input". Root cause (ADR-227): F, the loose end of the perpendicular, is a free point whose SIDE (which ray of the perpendicular from D) is an unstated DOF, but `reflectAnchors` only granted a reflection axis to a shared-vertex right angle, so F was never flippable and its side stayed anti-correlated with the triangle shape (whenever the triangle flexed so E was within AC, F pointed away). Fix: (1) the loose end of a cross-segment perpendicular is reflectable across the OTHER segment\'s line; (2) a direction-helper (perpendicular/parallel loose end, no metric constraint) reflects AFTER the continuous sample — reflecting it before shifts the free-cluster spin centroid and re-shapes the triangle, coupling the two independent DOFs. With both, the resolver finds a config where E is within both segments.',
    steps: [
      'משולש ישר זוית ABC',
      { llm: ['D אמצע AB'] },
      'DF אנך ל AB',
      'AC ו DF נחתכים בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      const t = (p: Id, a: Id, b: Id) => {
        const A = at(fig, a), B = at(fig, b), P = at(fig, p);
        return ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      };
      // E is the crossing of segments AC and DF — and it lies WITHIN both (0 < t < 1), not on a continuation.
      const tAC = t('E', 'A', 'C');
      const tDF = t('E', 'D', 'F');
      expect(tAC, 'E on segment AC (param)').toBeGreaterThan(0.02);
      expect(tAC, 'E on segment AC (param)').toBeLessThan(0.98);
      expect(tDF, 'E on segment DF (param)').toBeGreaterThan(0.02);
      expect(tDF, 'E on segment DF (param)').toBeLessThan(0.98);
    },
  },
  {
    id: 'perpendicular-helper-flips-mirrored-slot',
    title: 'the ADR-227 flip works for the MIRRORED phrasing too — "FD אנך ל AB" (loose end in the first slot)',
    guards:
      "review F8 (2026-07-06): the ADR-227 fix granted the reflection axis only to the SECOND letter of each segment (`con.b`/`con.d`), so \"DF ⟂ AB\" flipped but the same statement written \"FD ⟂ AB\" did not — the exact ADR-227 bug persisted for the mirrored slot. The semantic fact is 'an endpoint of one segment reflects across the other segment's line', slot-free (ADR-231): all four slots now qualify, and `directionHelperFreePoints` also reads ADR-229 co-driven (`solve.also`) constraints so a metrically co-driven helper isn't mis-classified. Same figure as `perpendicular-helper-flips-to-reach-crossing`, mirrored utterance.",
    steps: [
      'משולש ישר זוית ABC',
      { llm: ['D אמצע AB'] },
      'FD אנך ל AB',
      'AC ו FD נחתכים בנקודה E',
    ],
    check(fig) {
      allStepsOk(fig);
      const t = (p: Id, a: Id, b: Id) => {
        const A = at(fig, a), B = at(fig, b), P = at(fig, p);
        return ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      };
      const tAC = t('E', 'A', 'C');
      const tDF = t('E', 'D', 'F');
      expect(tAC, 'E on segment AC (param)').toBeGreaterThan(0.02);
      expect(tAC, 'E on segment AC (param)').toBeLessThan(0.98);
      expect(tDF, 'E on segment FD (param)').toBeGreaterThan(0.02);
      expect(tDF, 'E on segment FD (param)').toBeLessThan(0.98);
    },
  },
  {
    id: 'q8-similar-triangles-detected',
    title: 'bagrut Q8b: "detect shapes" surfaces △DEG ~ △CEF (opt-in similar-triangle classes)',
    guards:
      'operator manual test of the full bagrut Q8 figure (session avs58sfn continued): two right triangles ABC, ABD sharing hypotenuse AB; their legs meet at E; F, G the midpoints of EB, EA; then DG and CF drawn. The operator asked why the tool doesn\'t flag △DEG and △CEF as similar (part ב asks the student to PROVE △DEG ~ △CEF). Decision (ADR-224): surface similar/congruent triangle CLASSES in the OPT-IN "detect shapes" panel (same student-initiated reveal boundary as the shape badges — naming the pair still leaves the proof to the student), NOT the always-on theorem feed (whose ADR-208 no-reveal rule stands). Reported as CLASSES (union-find over the forced-across-samples similarity relation) so a figure with many mutually-similar triangles is one legible row, not O(n²) pairs. This scenario asserts detection finds the class {CEF, DEG}.',
    steps: ['משולש ישר זוית ABC', 'משולש ישר זוית ABD', 'AC ו DB נחתכים בנקודה E', 'F אמצע EB', 'G אמצע EA', 'DG', 'CF'],
    check(fig) {
      allStepsOk(fig);
      const { similar } = detectShapes(fig.construction);
      // The class the student must prove — {CEF, DEG} — is surfaced (as similar or congruent), in some class.
      const hasCEFDEG = similar.some((cls) => {
        const sets = cls.triangles.map((t) => [...t].sort().join(''));
        return sets.includes('CEF') && sets.includes('DEG');
      });
      expect(hasCEFDEG, `△CEF ~ △DEG detected (got: ${similar.map((c) => c.triangles.map((t) => t.join('')).join(c.kind === 'congruent' ? '≅' : '~')).join(' | ') || 'none'})`).toBe(true);
      // Every reported class is a real relation: ≥2 members, each a distinct 3-vertex triangle.
      for (const cls of similar) {
        expect(cls.triangles.length).toBeGreaterThanOrEqual(2);
        for (const tri of cls.triangles) expect(new Set(tri).size).toBe(3);
      }
    },
  },
  {
    id: 'two-right-triangles-share-hypotenuse',
    title: 'bagrut Q8: two right triangles ABC, ABD on a shared hypotenuse AB — the SECOND right angle holds (at D) and the legs meet',
    guards:
      'operator session avs58sfn: `משולש ABC ישר זוית` → `משולש ABD ישר זוית` → `AC ו BD נחתכים בנקודה E` (two right triangles sharing hypotenuse AB, their legs meet at E — bagrut Q8). Two bugs: (1) the knee at D was drawn but ∠ADB came out 52°, not 90°; (2) "AC and BD cannot meet". ONE root cause (ADR-223): `right-triangle`\'s vertex order is SEMANTIC (right angle at the LAST id), but it was in `DERIVED_SLOTS` so `normalizeShapeComposition` CYCLICALLY ROTATED `[A,B,D]`→`[B,D,A]` to reuse the existing edge — silently moving the right angle from D to A (∠BAD=90, knee still drawn at D). Removed right-triangle from the rotation set; the apply case now handles composition itself — it SWAPS the two interchangeable hypotenuse endpoints so a FRESH one is the derived perp-offset, and when the WHOLE hypotenuse pre-exists (this case) it asserts the right angle as a CONSTRAINT that drives the NEW vertex D onto the Thales circle (not a pre-existing leg\'s shape DOF — a stability fix), with D made reflectable across AB (its two leg endpoints) so the sampler can flip it to C\'s side where the legs actually cross. commandConflict learns the derived-vertex-on-existing-point case is a reinterpretation, not a redefinition.',
    steps: ['משולש ABC ישר זוית', 'משולש ABD ישר זוית', 'AC ו BD נחתכים בנקודה E'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // BOTH right angles hold — the second (at D) is the one that used to come out 52°.
      expect(angle(A, C, B), '∠ACB').toBeCloseTo(90, 1);
      expect(angle(A, D, B), '∠ADB').toBeCloseTo(90, 1);
      // C and D on the SAME side of AB so the legs cross (the "cannot meet" fix).
      const side = (X: Vec) => Math.sign((B.x - A.x) * (X.y - A.y) - (B.y - A.y) * (X.x - A.x));
      expect(side(C), 'C and D on the same side of AB').toBe(side(D));
      // E is the crossing of segments AC and BD — WITHIN both spans (not on a continuation).
      const within = (a: Vec, b: Vec) => {
        const G = at(fig, 'E');
        return ((G.x - a.x) * (b.x - a.x) + (G.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      };
      for (const [p, q] of [[A, C], [B, D]] as [Vec, Vec][]) {
        const t = within(p, q);
        expect(t, 'E within segment param').toBeGreaterThan(0.02);
        expect(t, 'E within segment param').toBeLessThan(0.98);
      }
    },
  },
  {
    id: 'parallelogram-cut-triangle-surfaces-parallels-and-similarity',
    title: 'a parallelogram cut by BE & AD produced to F → alternate/corresponding parallels (L1) + similar triangles (L2) surface',
    guards:
      "operator session (2026-07-04): `מקבילית ABCD` → `E על DC` → `המשך BE ו AD נפגשים בנקודה F` (parallelogram ABCD, E on base DC, then BE and AD produced to meet at F). The operator expected the discovery feed to name the alternate/corresponding-angle theorems (זויות מתחלפות וזויות מתאימות, #4/#6) and, deeper, similar triangles. Root cause + fix (ADR-220): (1) #4/#6 were gated behind a KIND-whitelist transversal test that didn't recognise the cutting triangle FAB (its sides FA, FB + the parallelogram edge AB form a drawn-edge 3-cycle) — replaced by a coordinate-free `structuralTriangles` (any 3-cycle in the neighbour graph), so a bare trapezoid/parallelogram (a 4-cycle only, ADR-210) still suppresses 4/6 while this figure surfaces them at Declared L1; (2) the AA-similarity #69 + its ratio consequences #71 were structurally excluded (ADR-208 no-reveal) — now admitted as ENTAILED (L2) whenever a stated parallel is a side of a triangle whose apex is off the other parallel (`similarityEvidence`, the Thales / line-parallel-to-a-side config); (3) a guiding concept 'if there are parallel lines, look for similar triangles' rides the same premise. This scenario replays the exact sequence and asserts the build is geometrically correct (F collinear with B,E and with A,D) and the feed surfaces 4/6 and 69/71.",
    steps: ['מקבילית ABCD', 'E על DC', 'המשך BE ו AD נפגשים בנקודה F'],
    check(fig) {
      allStepsOk(fig);
      // Geometry: F is the meet of line BE and line AD → collinear on both.
      const A = at(fig, 'A'), B = at(fig, 'B'), D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F');
      const collinear = (p: Vec, q: Vec, r: Vec) =>
        Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / (dist(p, q) * dist(p, r) || 1);
      expect(collinear(B, E, F)).toBeLessThan(1e-6); // F on line BE
      expect(collinear(A, D, F)).toBeLessThan(1e-6); // F on line AD
      // Feed: the transversal parallels 4/6 and the entailed similarity 69/71 surface (ADR-220).
      const facts = factsOf(['מקבילית ABCD', 'E על DC', 'המשך BE ו AD נפגשים בנקודה F']);
      const ids = detectTheorems({ facts, construction: fig.construction }).map((e) => e.id);
      expect(ids).toEqual(expect.arrayContaining([4, 6, 69, 71]));
    },
  },
  {
    id: 'two-circles-kite-surfaces-kite-and-isosceles-theorems',
    title: 'two intersecting circles + their radii → the kite OAPB and its isosceles triangles surface, entailed',
    guards:
      "operator session (debug log 2026-07-04, the `שני מעגלים נחתכים` figure): `שני מעגלים נחתכים` (two circles → centres O,P, crossings A,B) → `AB` → `OP` → `PA` → `PB` → `OA=OB`. The operator built the classic kite OAPB (two intersecting circles) and reported the feed was thin: \"i have an isosceles triangle but no relevant theorems appear … added OA=OB and got 1 sentence but there are others … no kite theorems.\" Root cause (ADR-218): the theorem matchers only read TYPED shape/equal facts, never the circle STRUCTURE the construction already encodes — so the isosceles triangles OAB/PAB (two radii each, |OA|=|OB|, |PA|=|PB|) and the kite OAPB (two circles sharing A,B) went unrecognised because nobody typed 'isosceles'/'kite'. These are coordinate-free construction ENTAILMENTS, not measured coincidences. Fix: `isoscelesEvidence` now derives isosceles from a circle's centre + two drawn radii, `kiteEvidence` derives a kite from two circles sharing two drawn-out points, and the kite theorems 37/38 were added to the table (a pure gap). This scenario replays the operator's exact sequence and asserts the kite + isosceles theorems surface and the figure is geometrically a kite (OP ⟂ AB, both radius pairs equal).",
    steps: ['שני מעגלים נחתכים', 'AB', 'OP', 'PA', 'PB', 'OA=OB'],
    check(fig) {
      allStepsOk(fig);
      // Geometry: the kite OAPB — |OA|=|OB| and |PA|=|PB| (radii), and the main diagonal OP ⟂ the
      // secondary diagonal AB (B3 / kite theorem 38).
      const O = at(fig, 'O'), P = at(fig, 'P'), A = at(fig, 'A'), B = at(fig, 'B');
      expect(Math.abs(dist(O, A) - dist(O, B))).toBeLessThan(1e-6);
      expect(Math.abs(dist(P, A) - dist(P, B))).toBeLessThan(1e-6);
      const dot = (P.x - O.x) * (B.x - A.x) + (P.y - O.y) * (B.y - A.y);
      expect(Math.abs(dot) / (dist(O, P) * dist(A, B) || 1)).toBeLessThan(1e-6); // OP ⟂ AB
      // Feed: the isosceles (22) and BOTH kite properties (37, 38) surface — entailed from the two
      // circles + drawn radii, none of it typed as a shape word.
      const facts = factsOf(['שני מעגלים נחתכים', 'AB', 'OP', 'PA', 'PB', 'OA=OB']);
      const ids = detectTheorems({ facts, construction: fig.construction }).map((e) => e.id);
      expect(ids).toEqual(expect.arrayContaining([22, 37, 38]));
    },
  },
  {
    id: 'height-in-parallelogram-builds-and-surfaces-theorems',
    title: 'a height dropped in a parallelogram (with its diagonals) builds a clean right-angle foot',
    guards:
      "operator session `tzqfaub6`: `מקבילית ABCD` → `DB` → `AC` (the two diagonals) → `DE גובה על AB` (a height from D onto AB). The operator observed \"i added a height from D but no new theorem was selected\" — the theorem feed didn't react to the height. Root cause (Turn-5, 2026-07-04): a `foot` (what `גובה` lowers to) was not recognised as a right-angle premise, so Pythagoras (#28) never surfaced; and there was no \"distance between parallels\" theorem (#3) to announce a perpendicular dropped between a parallelogram's parallel sides. Fix: `rightAngleFacts` now counts a `foot` (a dropped perpendicular is a genuine right angle), #28 is a MAIN headline, #3 was added (fires when a foot's base is one parallel edge and its apex sits on the opposite one), and a new guiding-principle concept (right triangle → α / 90°−α) rides the same premise. The exact feed behaviour is asserted in `src/theorems/__tests__/matchers.test.ts`; this scenario guards that the operator's exact build stays geometrically correct (the height E is the foot of the perpendicular from D to AB).",
    steps: ['מקבילית ABCD', 'DB', 'AC', 'DE גובה על AB'],
    check(fig) {
      allStepsOk(fig);
      // The height foot E is the foot of the perpendicular from D onto line AB: DE ⟂ AB — the right
      // angle the theorem feed reacts to. (The foot can fall on the extension of AB in an oblique
      // parallelogram — it drops onto the infinite line, not the segment — so we assert the right
      // angle, which holds at every seed, not segment containment.)
      const A = at(fig, 'A'), B = at(fig, 'B'), E = at(fig, 'E'), D = at(fig, 'D');
      const dot = (D.x - E.x) * (B.x - A.x) + (D.y - E.y) * (B.y - A.y);
      expect(Math.abs(dot) / (dist(D, E) * dist(A, B) || 1)).toBeLessThan(1e-6); // DE ⟂ AB
    },
  },
  {
    id: 'thirty-sixty-ninety-triangle-detected-and-surfaces-33-34',
    title: 'a size given that forces a 30-60-90 triangle is detected as that special type and surfaces #33/#34',
    guards:
      "operator session `x73i1cpx`: `מקבילית ABCD` → `DE גובה לצעל BC` (a height from D onto BC, foot E) → `DC=2CE`. Triangle CDE is right-angled at E with hypotenuse DC = 2·CE, so ∠DCE=60°, ∠CDE=30° — a 30-60-90. The operator reported two gaps: (1) the special 30-60-90 THEOREMS (#33 leg-opposite-30°=½-hypotenuse, #34 its converse) weren't surfaced, and (2) the shape badge said only \"CDE is a right angle\", not the special 30-60-90 TYPE. Diagnosed as two independent causes sharing the shapes layer: `classifyTriangle` had no angle-magnitude axis (30-60-90 collapsed to `right-triangle`), and theorems #33/#34 weren't in `THEOREM_TABLE`. Fix (ADR-215, operator chose \"always surface when detected\"): a `30-60-90-triangle` shape sub-type + #33/#34 firing whenever such a triangle is detected (stated OR emergent). Feed behaviour asserted in `matchers.test.ts`; classification in `detectShapes.test.ts`; this scenario guards the operator's exact end-to-end build.",
    steps: ['מקבילית ABCD', 'DE גובה לצעל BC', 'DC=2CE'],
    check(fig) {
      allStepsOk(fig);
      // Issue 2: the emergent triangle CDE is classified as the special 30-60-90 type, not plain right.
      const shapes = detectShapes(fig.construction).shapes;
      expect(shapes.some((s) => s.type === '30-60-90-triangle')).toBe(true);
      // Issue 1: theorems #33 (property) and #34 (converse) surface in the feed. (The facts aren't on
      // `Derived`, so re-derive them from the same steps — the symbolic side of this exact build.)
      const facts = factsOf(['מקבילית ABCD', 'DE גובה לצעל BC', 'DC=2CE']);
      const ids = detectTheorems({ facts, construction: fig.construction, shapes }).map((e) => e.id);
      expect(ids).toEqual(expect.arrayContaining([33, 34]));
    },
  },
  {
    id: 'degenerate-tangent-line-fails-fast-no-freeze',
    title: 'a tangent named by one repeated point ("BB משיק … בנקודה B") fails fast, never freezes the solver',
    guards:
      'operator session `wetjqgsj`: two free-radius circles + `C על מעגל P` + `CA משיק למעגל O בנקודה A` (a valid tangent → `set-perpendicular(O,A,C,A)`) + `CA` + `D על מעגל O`, then `BB משיק למעגל P בנקודה B`. The last tangent is named by a DEGENERATE line "BB" (one point repeated), so the parser emitted `set-perpendicular(P,B,B,B)` whose second operand B→B is a zero-length vector (NaN direction). Left to the solver this did NOT fail cleanly — `recruitFreeDofs` chased the NaN over every free DOF and the joint optimizer churned ~4.4 s per replay before reporting a bogus over-constraint; the app runs that slow replay many times in its config-search loop, so the whole UI FROZE. Root fix (ADR-202): `applyStep` rejects a ∥/⟂ with a zero-length operand (its two endpoint ids identical) up front, before any evaluate — 4.4 s → ~15 ms with a clear message, for any source of the degeneracy (parser typo, LLM, `AA ⟂ BC`).',
    steps: [
      'שני מעגלים נחתכים',
      'C על מעגל P',
      'CA משיק למעגל O בנקודה A',
      'CA',
      'D על מעגל O',
      'BB משיק למעגל P בנקודה B',
    ],
    expectViolations: true, // the last (degenerate) step is intentionally rejected — the figure is the prior one
    check(fig) {
      // The degenerate tangent is rejected with a clear message (NOT a silent freeze / bogus over-constraint).
      expect(fig.lastError).toMatch(/distinct points|single point/);
      // The prior figure is kept: every earlier point still has a position (no clobber, no wipe).
      for (const id of ['O', 'P', 'A', 'B', 'C', 'D']) expect(fig.positions.has(id), `position for ${id}`).toBe(true);
      // The valid earlier tangent (OA ⟂ CA) is unaffected — its constraint still holds in the kept figure.
      const O = at(fig, 'O'), A = at(fig, 'A'), C = at(fig, 'C');
      const dot = (O.x - A.x) * (C.x - A.x) + (O.y - A.y) * (C.y - A.y);
      expect(Math.abs(dot) / (dist(O, A) * dist(C, A) || 1)).toBeLessThan(0.05); // ~perpendicular
    },
  },
  {
    id: 'baseless-midsegment-places-G-on-a-side-and-alternates',
    title: 'a base-less "EG קטע אמצעים" with E on a side pins E to the midpoint and places G on one of the two other sides (cyclable)',
    guards:
      "operator session `n6zuhw65`: `משולש ABC` → `E על AC` (E free on side AC) → `EG קטע אמצעים` (NO parallel base named). The utterance fell through the midsegment rule (which required a base) to the plain-segment rule → a bare `segment E-G` with G undefined; \"EG was not drawn correctly.\" A midsegment joins two MIDPOINTS, so E must be the midpoint of AC and G the midpoint of one of the other two sides (AB → EG ∥ CB, or CB → EG ∥ AB) — and WHICH is genuinely unstated (ADR-052), so it must be a cyclable alternative (operator: \"G should have been placed on either side CB or AB with ability to alternate between them\"). Root fix (ADR-199): the parser's `midsegmentBaseless` resolves E's host side from `ctx.onSegment` and the triangle from `ctx.neighbors`, and emits a `midsegment` `shape-variant` [A,C,B,E,G]; `expandShapeVariant` pins E to the midpoint (`set-equal(A,E,E,C)`) and makes G the midpoint of AB (variant 0) or CB (variant 1); `VARIANT_COUNT.midsegment = 2` so \"show another configuration\" flips G between the sides.",
    steps: ['משולש ABC', 'E על AC', 'EG קטע אמצעים'],
    check(fig) {
      allStepsOk(fig);
      // E is pinned to the midpoint of AC (|AE| = |EC|).
      expect(dist(at(fig, 'A'), at(fig, 'E')), 'E is the midpoint of AC').toBeCloseTo(dist(at(fig, 'E'), at(fig, 'C')), 6);
      // G is drawn, on ONE of the two other sides (AB or CB) as its midpoint.
      expect(fig.positions.has('G'), 'G is placed').toBe(true);
      const gMidAB = Math.abs(dist(at(fig, 'A'), at(fig, 'G')) - dist(at(fig, 'G'), at(fig, 'B'))) < 1e-6;
      const gMidCB = Math.abs(dist(at(fig, 'C'), at(fig, 'G')) - dist(at(fig, 'G'), at(fig, 'B'))) < 1e-6;
      expect(gMidAB || gMidCB, 'G is the midpoint of AB or of CB').toBe(true);
      // EG is a genuine midsegment: parallel to the opposite side (CB if G on AB, AB if G on CB).
      const eg = { x: at(fig, 'G').x - at(fig, 'E').x, y: at(fig, 'G').y - at(fig, 'E').y };
      const base = gMidAB
        ? { x: at(fig, 'B').x - at(fig, 'C').x, y: at(fig, 'B').y - at(fig, 'C').y }
        : { x: at(fig, 'B').x - at(fig, 'A').x, y: at(fig, 'B').y - at(fig, 'A').y };
      expect(Math.abs(eg.x * base.y - eg.y * base.x) / (Math.hypot(eg.x, eg.y) * Math.hypot(base.x, base.y)), 'EG ∥ the opposite side').toBeLessThan(1e-3);
      // The variant is cyclable — a second config puts G on the OTHER side (the alternation the operator asked for).
      const flipped = replay(
        factsOf(['משולש ABC', 'E על AC', 'EG קטע אמצעים']).map((f) => (f.cmd.type === 'shape-variant' ? { ...f, cmd: { ...f.cmd, variant: 1 } } : f)),
      );
      const g2 = flipped.positions.get('G')!;
      const g2MidAB = Math.abs(dist(flipped.positions.get('A')!, g2) - dist(g2, flipped.positions.get('B')!)) < 1e-6;
      expect(g2MidAB, 'variant 1 lands G on the OTHER side than variant 0').toBe(!gMidAB);
    },
  },
  {
    id: 'named-midsegment-reuses-existing-midpoint-endpoint',
    title: 'a named "EF קטע אמצעים במשולש DCA" whose endpoint E is ALREADY a midpoint reuses E (no stray M/N)',
    guards:
      "operator session `tg6s9dnp`: `טרפז ABCD חסום במעגל` → `AC` → `E אמצע AD` (E = midpoint of AD) → `EF קטע אמצעים במשולש DCA`. The named midsegment escalated to the LLM (the deterministic `midsegment` rule needs a `baseM` match; without one it dived into `midsegmentBaseless`, which only recognised a FREE on-segment anchor — E is a DERIVED midpoint, not free-on-segment — so it returned null → LLM). The LLM \"normalised\" it to `קטע האמצעים לצלע CA במשולש DCA`, DROPPING the student's labels EF, so the unnamed branch auto-minted midpoints M and N (with N a duplicate of the existing E): \"I now have M and N somehow.\" Root fix (ADR-199 Am.): a new `ctx.midpointOf` maps each existing midpoint to the segment it bisects; `midsegmentBaseless` anchors E from `onSegment` OR `midpointOf`, so E is reused and only the fresh F is created (F = midpoint of one of the two other sides, cyclable). No M/N, E honoured.",
    steps: [
      'טרפז ABCD חסום במעגל', // trapezoid ABCD inscribed in a circle (AB ∥ DC)
      'AC', // diagonal AC
      'E אמצע AD', // E = midpoint of AD (a derived midpoint)
      'EF קטע אמצעים במשולש DCA', // the EXACT utterance — E reused, F fresh; NO M/N minted, no LLM escalation
    ],
    check(fig) {
      allStepsOk(fig);
      // The student's labels are honoured: E and F exist; the LLM's stray M/N never appear.
      expect(fig.positions.has('E'), 'E honoured').toBe(true);
      expect(fig.positions.has('F'), 'F honoured').toBe(true);
      expect(fig.positions.has('M'), 'no stray M').toBe(false);
      expect(fig.positions.has('N'), 'no stray N').toBe(false);
      // E stays the midpoint of AD (reused, not recreated); F is the midpoint of one of the two other sides.
      expect(dist(at(fig, 'A'), at(fig, 'E')), 'E midpoint of AD').toBeCloseTo(dist(at(fig, 'E'), at(fig, 'D')), 6);
      const fMidAC = Math.abs(dist(at(fig, 'A'), at(fig, 'F')) - dist(at(fig, 'F'), at(fig, 'C'))) < 1e-6;
      const fMidDC = Math.abs(dist(at(fig, 'D'), at(fig, 'F')) - dist(at(fig, 'F'), at(fig, 'C'))) < 1e-6;
      expect(fMidAC || fMidDC, 'F is the midpoint of AC or of DC').toBe(true);
      // EF is a genuine midsegment: parallel to the third side (DC if F on AC, AC if F on DC).
      const ef = { x: at(fig, 'F').x - at(fig, 'E').x, y: at(fig, 'F').y - at(fig, 'E').y };
      const base = fMidAC
        ? { x: at(fig, 'C').x - at(fig, 'D').x, y: at(fig, 'C').y - at(fig, 'D').y }
        : { x: at(fig, 'C').x - at(fig, 'A').x, y: at(fig, 'C').y - at(fig, 'A').y };
      expect(Math.abs(ef.x * base.y - ef.y * base.x) / (Math.hypot(ef.x, ef.y) * Math.hypot(base.x, base.y)), 'EF ∥ the third side').toBeLessThan(1e-3);
    },
  },
  {
    id: 'incremental-midsegment-resolves-triangle-from-figure',
    title: 'a midsegment named AFTER the triangle ("GE קטע אמצעים מקביל ל AB") resolves the triangle from the figure and builds the two midpoints',
    guards:
      "operator session `z5dkmbla`: `משולש ABC` then `GE קטע אמצעים מקביל ל AB` — a midsegment declared in a SEPARATE, later step (the app's primary incremental flow). The midsegment rule required the triangle to be NAMED in the SAME utterance (`/(?:triangle|משולש) ABC/`), so with no \"משולש ABC\" here `triM` was null and the rule bailed — the utterance fell through to the parallel-constraint rule and became a PLAIN parallel segment (`segment GE`, `segment AB`, `set-parallel`), with NO midpoints. Consequence: G,E were free points, the sides carried no equal halves, so \"view relations\" showed no equal sides/angles (the operator's report). Root fix: `midsegment` resolves the triangle from the figure (`ctx.neighbors`) when it isn't named in-utterance — the apex is the unique vertex adjacent to BOTH base endpoints — the same context inference altitude/single-vertex-angle use. GE now decomposes to midpoint(C,A)=G, midpoint(C,B)=E, segment GE, so the equal halves (AG=CG, BE=CE) and the corresponding angles are ground truths and surface in the relations layer.",
    steps: ['משולש ABC', 'GE קטע אמצעים מקביל ל AB'],
    check(fig) {
      allStepsOk(fig);
      // G is the midpoint of CA, E of CB → each side split into equal halves.
      expect(dist(at(fig, 'A'), at(fig, 'G')), 'AG = CG (G midpoint of CA)').toBeCloseTo(dist(at(fig, 'C'), at(fig, 'G')), 6);
      expect(dist(at(fig, 'B'), at(fig, 'E')), 'BE = CE (E midpoint of CB)').toBeCloseTo(dist(at(fig, 'C'), at(fig, 'E')), 6);
      // GE ∥ AB (the midsegment theorem) — cross product of the direction vectors is ~0.
      const ge = { x: at(fig, 'E').x - at(fig, 'G').x, y: at(fig, 'E').y - at(fig, 'G').y };
      const ab = { x: at(fig, 'B').x - at(fig, 'A').x, y: at(fig, 'B').y - at(fig, 'A').y };
      expect(Math.abs(ge.x * ab.y - ge.y * ab.x) / (Math.hypot(ge.x, ge.y) * Math.hypot(ab.x, ab.y)), 'GE ∥ AB').toBeLessThan(1e-3);
      // The equal halves are ground-truth relations (what "view relations" shows) — the reported symptom.
      const rel = detectRelations(fig.construction);
      const flatEqual = rel.equalSegments.flat().map(([a, b]) => [a, b].sort().join(''));
      expect(flatEqual, 'AG=CG surfaces as an equal-side class').toEqual(expect.arrayContaining(['AG', 'CG']));
      expect(flatEqual, 'BE=CE surfaces as an equal-side class').toEqual(expect.arrayContaining(['BE', 'CE']));
      expect(rel.equalAngles.length, 'corresponding equal angles surface too').toBeGreaterThan(0);
    },
  },
  {
    id: 'on-segment-point-stays-within-its-segment',
    title: 'a driven on-segment point stays WITHIN its segment — the joint solver can\'t slide it onto the extension',
    guards:
      "operator session `wdrfq1wf`: square ABCD, E on AB, F on DC with DF:FC=1:10, then EF ∥ BC. The parallel IS satisfiable in-segment (E slides on AB to match F's x: both at t=1/11), but the figure came back with E and F at t=−1/9 — OUTSIDE their segments, on the extension beyond A and D — so \"E on AB\" and \"F on DC\" were both silently violated (green, `violations:[]`). Root cause: the DISTANCE-based ratio |DF|=0.1·|FC| has TWO roots — internal t=1/11 AND external t=−1/9 — and the multi-carrier joint solver (`resolveMixedCarriers`) picked the external one because `setCarrierVals` clamped only an EXTENSION on-segment point (t≥1.02) and wrote a PLAIN on-segment point's t unclamped, so the unbounded search slid both points off their segments. Root fix (ADR-194): a plain on-segment point lives BETWEEN its endpoints (t∈[0,1]) by definition — clamp it there in `setCarrierVals`, so the joint search must move the figure's OTHER DOFs, landing the internal root. The impossible-⟂ sibling (ADR-193) is unaffected (⟂ is unsatisfiable at every t).",
    steps: ['ריבוע ABCD', 'E על AB', 'F על DC כך ש DF:FC=1:10', 'EF מקביל ל BC'],
    check(fig) {
      allStepsOk(fig);
      const within = (p: Id, a: Id, b: Id) => {
        const A = at(fig, a), B = at(fig, b), P = at(fig, p);
        const t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
        const cross = (P.x - A.x) * (B.y - A.y) - (P.y - A.y) * (B.x - A.x);
        expect(t, `${p} WITHIN segment ${a}${b} (t≥0)`).toBeGreaterThanOrEqual(-1e-6);
        expect(t, `${p} WITHIN segment ${a}${b} (t≤1)`).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(cross) / (Math.hypot(B.x - A.x, B.y - A.y) || 1), `${p} collinear on ${a}${b}`).toBeLessThan(1e-3);
      };
      within('E', 'A', 'B'); // E stays on AB, not its extension
      within('F', 'D', 'C'); // F stays on DC, not its extension
      // The stated relations hold: DF:FC = 1:10 and EF ∥ BC.
      const df = dist(at(fig, 'D'), at(fig, 'F'));
      const fc = dist(at(fig, 'F'), at(fig, 'C'));
      expect(df / fc, 'DF:FC = 1:10').toBeCloseTo(0.1, 2);
      const ef = { x: at(fig, 'F').x - at(fig, 'E').x, y: at(fig, 'F').y - at(fig, 'E').y };
      const bc = { x: at(fig, 'C').x - at(fig, 'B').x, y: at(fig, 'C').y - at(fig, 'B').y };
      expect(Math.abs(ef.x * bc.y - ef.y * bc.x) / (Math.hypot(ef.x, ef.y) * Math.hypot(bc.x, bc.y)), 'EF ∥ BC').toBeLessThan(1e-3);
    },
  },
  {
    id: 'impossible-perp-does-not-clobber-ratio-pinned-point',
    title: 'an impossible later ⟂ hard-fails cleanly — it does NOT drag a ratio-pinned point off its position',
    guards:
      "operator session `vpt763yn`: square ABCD, F on CD, `DF:FC=1:4` (pins F at t=0.8, F=(1,5)), E on AB, then `FE אנך ל BC`. `FE ⟂ BC` is geometrically IMPOSSIBLE (F on the top edge, E on the bottom edge, BC vertical ⇒ FE·BC is a constant −25, zero gradient). Two reported bugs, one root cause: (1) F MOVED off its ratio position, (2) the drawn line came out PARALLEL to BC, not perpendicular. Root cause: the perpendicular drives E and the ratio drives F, both `on-segment-solved`; the joint solver (`resolveMixedCarriers`) can't satisfy the impossible ⟂ so it returns a best-effort placement (regulariser pulls F,E to the seed midpoints) and DISCARDS its `ok=false`. `setCarrierVals` then clears the solve directives, so neither driven constraint is a driver OR a check, and `evaluateCore` reports `ok` on a figure violating both — F dragged to (2.5,5), FE vertical (∥ BC). Root fix (ADR-193): `evaluate` re-verifies every DRIVEN constraint at the resolved positions (the same `isSatisfied` gate it applies to check-constraints); a driven-constraint system with no solution is honestly over-constrained, so the step hard-fails, the prior figure is kept (F stays at its ratio position), and ADR-191 group-atomicity drops the FE scaffolding. The message names the whole conflict set (`|DF| = 0.25·|FC| and FE ⟂ BC cannot hold`).",
    steps: ['ריבוע ABCD', 'F על CD', 'DF:FC=1:4', 'E על AB', 'FE אנך ל BC'],
    check(fig) {
      // The ratio still pins F: DF:FC = 1:4 ⇒ |FC| = 4·|DF| (F NOT dragged to the midpoint).
      const df = dist(at(fig, 'D'), at(fig, 'F'));
      const fc = dist(at(fig, 'F'), at(fig, 'C'));
      expect(fc / df, '|FC| / |DF| ≈ 4 (F stays at its ratio position, not the midpoint)').toBeCloseTo(4, 2);
      // The impossible ⟂ hard-fails and names the conflict (incl. the perpendicular).
      expect(fig.lastError, 'the impossible ⟂ surfaces an over-constrained error').toMatch(/over-constrained/i);
      expect(fig.lastError, 'the message names the perpendicular').toMatch(/⟂|perpendicular|FE/i);
      // No misleading segment drawn: the FE scaffolding of the failed group is dropped (ADR-191)…
      expect(fig.construction.objects.some((o) => o.id === 'seg-EF' || o.id === 'seg-FE'), 'FE must not be drawn').toBe(false);
      // …the square (incl. its BC edge) is intact, every point still placed.
      expect(fig.construction.objects.some((o) => o.id === 'seg-BC'), 'the square keeps its BC edge').toBe(true);
      for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) expect(at(fig, id), `${id} still placed`).toBeTruthy();
      // The failed constraint is never applied, so the verifier flags nothing (no silent violation).
      expect(fig.violations, 'the dropped constraints leave no verifier violation').toEqual([]);
    },
  },
  {
    id: 'segment-ratio-colon-drives-division-point',
    title: 'bare "DF:FC = 1:2" (colon-form segment ratio) drives F so |DF| = ½|FC| — no silent equality',
    guards:
      'operator session `o2m8f0w8`: on a square ABCD with E on AB and F on CD, "DF:FC=1:2" had NO deterministic rule (the keyword-free colon form) so it escalated to the LLM, which returned the correct "DF = FC/2" — but that then hit `equalSegments`, whose regex matched "DF = FC" and SILENTLY DROPPED the "/2", asserting |DF| = |FC| (a plain equality) instead of the 1:2 ratio. Green status, no error, wrong geometry (the ADR-024/026 half-parse class). Root fix (ADR-192): (A) `ratioConstraint` now reads a TRAILING divisor "= FC/2" → set-ratio k=½, and `equalSegments` bails on a divided RHS (`SEG_DIV_RHS` guard); (B) a new `segmentRatioColon` rule parses the bare "seg:seg = p:q" form deterministically → set-ratio k=p/q, so it never escalates. Both forms now emit the same `set-ratio(D,F,F,C, k=½)`.',
    steps: ['ריבוע ABCD', 'E על AB', 'F על CD', 'DF:FC=1:2'],
    check(fig) {
      allStepsOk(fig);
      // F lies on CD (idempotent from "F על CD") and the ratio holds: |DF| = ½·|FC| ⇒ |FC| = 2·|DF|.
      const df = dist(at(fig, 'D'), at(fig, 'F'));
      const fc = dist(at(fig, 'F'), at(fig, 'C'));
      expect(fc / df, '|FC| / |DF| ≈ 2 (the 1:2 ratio, not a 1:1 equality)').toBeCloseTo(2, 3);
    },
  },
  {
    id: 'impossible-perpendicular-drops-its-segment',
    title: 'an utterance is ATOMIC: "EF ⟂ BC" that can\'t be satisfied draws NEITHER its message NOR the auto-segment',
    guards:
      'operator session `8twmmb5r`: on a square ABCD with E on AB (40%) and F on DC, "EF ו BC מאונכים" is impossible (EF spans bottom→top, so it can never be ⟂ the vertical BC). The parser lowers it to a GROUP [segment EF, segment BC, set-perpendicular] (FR-IN-7 auto-draws the ⟂ pair). The set-perpendicular HARD-failed (a genuine contradiction, not a pending under-determined solve) — a message was shown — but `replay` applied each fact independently, so the scaffolding "segment EF" committed on its own and seg-EF was STILL DRAWN. Root fix: a group is atomic — a group with a hard-failed fact AND a succeeded one is poisoned and the figure is rebuilt with the whole group blocked, so seg-EF never appears (while seg-BC, SHARED with the square, is still drawn by the square). The pending/deferral case (ADR-104) is untouched.',
    steps: ['ריבוע ABCD', 'E על צלע AB ב- 40%', 'F על DC', 'EF ו- BC מאונכים'],
    check: (fig) => {
      // The message is surfaced (the operator saw it) …
      expect(fig.lastError, 'the impossible ⟂ surfaces a hard error').toMatch(/place F|⟂|perpendicular/i);
      // … but the auto-drawn EF segment must NOT survive on its own.
      expect(fig.construction.objects.some((o) => o.id === 'seg-EF'), 'seg-EF must not be drawn').toBe(false);
      // The square is intact — its BC edge (which the failed utterance also named) stays.
      expect(fig.construction.objects.some((o) => o.id === 'seg-BC'), 'the square keeps its BC edge').toBe(true);
      for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) expect(at(fig, id), `${id} still placed`).toBeTruthy();
      // The dropped ⟂ is not in `applied`, so the verifier has nothing to flag — no silent violation either.
      expect(fig.violations, 'the dropped constraint leaves no verifier violation').toEqual([]);
    },
  },
  {
    id: 'plural-segment-noun-points-on-sides',
    title: 'C7/PAR-8: "F, G, H on segments AB, AC, CB" (PLURAL segment-keyword noun) places all three, not just seg-AB',
    guards:
      'hardening plan C7 / PAR-8 (ADR-187): `pointsOnSegments` reads UPPERCASE labels only and ignores the noun, so the "sides"/"הצלעות" form always worked — but when the plural carrier noun CONTAINS a `segment`-rule keyword ("segments" ⊃ "segment", "הקטעים" ⊃ "קטע", "diagonals" ⊃ "diagonal"), the `segment` DEFINITION rule (runs first) fired and its singular-only POINT_ON_CARRIER guard did not recognise the plural → it grabbed the first two-label run and DROPPED F,G,H (built a lone segment AB). Fix: pluralise CARRIER_NOUN so the guard recognises the plural and `segment` defers to the strictly-more-specific `pointsOnSegments`.',
    steps: [
      'משולש ABC ישר זוית',
      'נקודות F, G, H על הקטעים AB, AC, CB',
    ],
    check(fig) {
      allStepsOk(fig);
      // All three points landed, each on its own side (F on AB, G on AC, H on CB) — not dropped.
      const onSide = (p: Id, a: Id, b: Id) => {
        const A = at(fig, a), B = at(fig, b), P = at(fig, p);
        const ab = { x: B.x - A.x, y: B.y - A.y };
        const t = ((P.x - A.x) * ab.x + (P.y - A.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y);
        const cross = (P.x - A.x) * ab.y - (P.y - A.y) * ab.x;
        expect(t, `${p} within segment ${a}${b}`).toBeGreaterThanOrEqual(-1e-6);
        expect(t, `${p} within segment ${a}${b}`).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(cross) / (Math.hypot(ab.x, ab.y) || 1), `${p} collinear on ${a}${b}`).toBeLessThan(1e-3);
      };
      onSide('F', 'A', 'B');
      onSide('G', 'A', 'C');
      onSide('H', 'C', 'B');
    },
  },
  {
    id: 'segment-meet-lands-on-segments',
    title: 'bagrut Q9: "AE and BF meet at G" puts G ON the segments (apexes flip inward), not on the continuation',
    guards:
      'operator session doykqc2m: rectangle ABCD with equilateral triangles AED, BCF on the two vertical sides, then "AE ו BF נפגשים בנקודה G" / "DE ו CF נפגשים בנקודה H" (prove EGFH is a rhombus). The figure built clean (no error) but was the MIRROR of the textbook: the triangle apexes E,F were sampled pointing OUTWARD (away from each other, outside the rectangle), so segments AE,BF diverge and never cross — G landed at the infinite-line crossing on the BACKWARD continuation (param ≈ −1 on both segments), not on the segments. Two root causes, both fixed (ADR-166): (1) a plain `line-line-intersection` (the parser now flags it `onSeg` when no "המשך"/"הישר" is named) had NO requirement that the crossing lie within both segments — added to the verifier (amber) + `meetsRequirements`; (2) the apex side is an unstated DISCRETE DOF (ADR-052) the continuous sampler could only flip by luck (~2% of seeds) and the 40-seed auto-resolver never reached — added a REFLECTION DOF encoded in the seed\'s high bits so `firstSatisfyingSeed`/`findValidConfig` mirror the apexes across their anchor line and bring the crossings onto the segments.',
    steps: [
      'ABCD מלבן',
      'BCF משולש שווה צלעות',
      'AED משולש שווה צלעות',
      'AE ו BF נפגשים בנקודה G',
      'DE ו CF נפגשים בנקודה H',
    ],
    check(fig) {
      allStepsOk(fig);
      const within = (g: Id, a: Id, b: Id) => {
        const A = at(fig, a), B = at(fig, b), G = at(fig, g);
        const t = ((G.x - A.x) * (B.x - A.x) + (G.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
        return t;
      };
      // G is the crossing of segments AE and BF — and it lies WITHIN both (not on the continuation).
      for (const [g, a, b] of [['G', 'A', 'E'], ['G', 'B', 'F'], ['H', 'D', 'E'], ['H', 'C', 'F']] as [Id, Id, Id][]) {
        const t = within(g, a, b);
        expect(t, `${g} on segment ${a}${b} (param)`).toBeGreaterThan(0.02);
        expect(t, `${g} on segment ${a}${b} (param)`).toBeLessThan(0.98);
      }
      // The emergent EGFH rhombus is DETECTED (ADR-166 Am., generalised by ADR-167): the crossings G,H split
      // their segments in the implicit-edge universe (`collinearSplits` — any point geometrically ON a drawn
      // segment splits it, kind-independent), detection samples the requirement-satisfying inward config, and
      // diverged solver samples are dropped so the forced rhombus isn't masked. (EGFH cycle order → vertex set EFGH.)
      const shapes = detectShapes(fig.construction);
      const rhombus = shapes.shapes.find((s) => (s.type === 'rhombus' || s.type === 'square') && [...s.vertices].sort().join('') === 'EFGH');
      expect(rhombus, `EGFH detected as a rhombus (got: ${shapes.shapes.map((s) => `${s.type}:${s.label}`).join(', ')})`).toBeTruthy();
    },
  },
  {
    id: 'square-diagonal-right-isosceles',
    title: 'ריבוע ABCD + שטח 16 + diagonal AC: each half-triangle is ONE "right isosceles triangle" badge, not isosceles + right split',
    guards:
      "operator report (screenshot): a square ABCD with area 16 and its diagonal AC surfaced triangle ABC as TWO separate shape badges — 'משולש שווה שוקיים' and 'משולש ישר זווית' — where the operator expected ONE 'משולש ישר זווית ושווה שוקיים'. Root cause: classifyTriangle emitted a badge per orthogonal axis (equal-sides + right-angle) instead of composing the most-specific single named type. Fix: right-isosceles-triangle is its own ShapeType (mirroring isosceles-trapezoid/right-trapezoid), so a forced right-isosceles triangle is a single badge.",
    steps: ['ריבוע ABCD', 'שטח ABCD הוא 16', 'AC'],
    check(fig) {
      allStepsOk(fig);
      const keys = detectShapes(fig.construction).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);
      // The square's diagonal splits it into two forced right-isosceles triangles — one composed badge each.
      expect(keys, `got: ${keys.join(', ')}`).toContain('right-isosceles-triangle:ABC');
      expect(keys, `got: ${keys.join(', ')}`).toContain('right-isosceles-triangle:ACD');
      // NOT the old two-badge split.
      expect(keys.some((k) => k.startsWith('isosceles-triangle:')), `no plain isosceles badge in ${keys.join(', ')}`).toBe(false);
      expect(keys.some((k) => k.startsWith('right-triangle:')), `no plain right-triangle badge in ${keys.join(', ')}`).toBe(false);
    },
  },
  {
    id: 'square-both-diagonals-no-phantom-kites',
    title: 'ריבוע ABCD + both diagonals crossing at E: no phantom "kite" badges (collinear-vertex quads)',
    guards:
      "operator report (screenshot): a square ABCD with both diagonals AC, BD meeting at E surfaced spurious kite badges (ABED, ABCE, ADCE, BCDE). Root cause: emergent quad detection's degeneracy gate only rejected ZERO-area cycles (shoelace); a 'quad' like A-B-E-D where E lies on diagonal BD keeps triangle ABD's area, so it passed and classifyQuad read the collinear B-E-D corner as a kite vertex. Fix (ADR-198): isSimpleEverywhere also rejects a STRAIGHT vertex (a corner collinear with its two neighbours) — such a cycle is a lower-order polygon, not a genuine quad. General: drawing both diagonals of any polygon plants their crossing on every diagonal.",
    steps: ['ריבוע ABCD', 'AC', 'BD', 'E = חיתוך AC ו-BD'],
    check(fig) {
      allStepsOk(fig);
      const keys = detectShapes(fig.construction).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);
      expect(keys.some((k) => k.startsWith('kite:')), `no phantom kite badge in ${keys.join(', ')}`).toBe(false);
      // The genuine content survives: the declared square + the eight right-isosceles triangles.
      expect(keys, `got: ${keys.join(', ')}`).toContain('square:ABCD');
      expect(keys).toContain('right-isosceles-triangle:ABE');
      expect(keys).toContain('right-isosceles-triangle:ABC');
    },
  },
  {
    id: 'generic-triangle-gets-no-badge',
    title: 'טרפז ABCD + a declared generic משולש ABD: the trapezoid badges, the plain triangle does NOT (declutter)',
    guards:
      "operator report (2026-07-04, latest manual test): \"the trapezoid and several triangles were not detected in the shapes. In general when detecting shapes, if there is nothing special about a triangle we don't need to show it (otherwise there are too many).\" The trapezoid detection was fine (verified across every logged figure); the real change is that a GENERIC triangle — no forced equal side / right angle / special angle — should earn no shape badge, because a figure sprouts many incidental triangles (diagonals, cevians, midsegments) and badging every plain one floods the panel and buries the shapes that carry a specific theorem. Before, a DECLARED generic triangle (a 3-vertex polygon) always badged, while an EMERGENT generic triangle was already dropped; the fix aligns the two — neither badges. Nothing is lost for the theorem feed: `table.ts` reads typed `triangle` commands directly from the facts, so the general triangle-family theorems still surface. This replays a trapezoid + a plain triangle on three of its vertices and asserts only the trapezoid badges.",
    steps: ['טרפז ABCD', 'משולש ABD'],
    check(fig) {
      allStepsOk(fig);
      const keys = detectShapes(fig.construction).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);
      expect(keys, `got: ${keys.join(', ')}`).toContain('trapezoid:ABCD');
      // The plain triangle ABD (and any emergent generic triangle) earns no badge.
      expect(keys.some((k) => k.startsWith('triangle:')), `no generic triangle badge in ${keys.join(', ')}`).toBe(false);
    },
  },
  {
    id: 'emergent-trapezoid-through-a-point-on-its-side',
    title: 'מקבילית ABCD + extend CD to E (CD=DE) + EA: the emergent trapezoid ABCE (side CE has D on it) IS detected',
    guards:
      "operator report (2026-07-04, screenshot): a parallelogram ABCD with side CD extended to E (CD=DE) and EA drawn. The panel showed only מקבילית ABCD; the operator said \"there is also a trapezoid ABCE\" — since AB ∥ CD and E is on line CD, AB ∥ CE, so ABCE is a genuine trapezoid the student sees. Root cause: the emergent-cycle edge graph had only ATOMIC edges, and the trapezoid's side C–E is broken by D (C–D is a parallelogram edge, D–E a segment), so C and E were never adjacent and the 4-cycle A-B-C-E could not be enumerated. `collinearSplits` (ADR-167) handles the DUAL — splitting a carrier at an interior point — but nothing MERGED a collinear chain into a through-edge. Fix: a new `collinearMerges` pass adds the through-edge C–E whenever a point D is strictly between C and E and collinear in every sample (fixpoint, so longer chains merge too); wired into `detectShapes`'s enumeration (scoped there, since a through-edge would duplicate an existing ray in the angle universe). The generic triangle ADE stays unbadged (its own rule); only the special trapezoid surfaces.",
    steps: ['מקבילית ABCD', 'E על המשך CD כך ש CD=DE', 'EA'],
    check(fig) {
      allStepsOk(fig);
      const keys = detectShapes(fig.construction).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);
      expect(keys, `got: ${keys.join(', ')}`).toContain('parallelogram:ABCD');
      // The emergent trapezoid — its side CE runs through D (cycle order A-B-C-E → vertex set ABCE).
      expect(keys.some((k) => k === 'trapezoid:ABCE' || k === 'isosceles-trapezoid:ABCE' || k === 'right-trapezoid:ABCE'),
        `emergent trapezoid ABCE detected in ${keys.join(', ')}`).toBe(true);
      // The generic triangle ADE is still suppressed (declutter rule, ADR-221).
      expect(keys.some((k) => k.startsWith('triangle:')), `no generic triangle badge in ${keys.join(', ')}`).toBe(false);
    },
  },
  {
    id: 'emergent-shapes-through-crossings',
    title: 'ABCD + two equilateral triangles: the emergent triangles ABH, CDG and rhombus EGFH — none declared — are all detected',
    guards:
      'operator deep-review session: rectangle ABCD with equilateral triangles BCE, DAF built inward on opposite sides, then "EC ו DF נפגשים בנקודה G" and "H = חיתוך BE ו-AF" (a bagrut construction). Every side of the emergent shapes runs THROUGH a crossing (G on EC/DF, H on BE/AF) or along a rectangle edge, so NONE of ABH / CDG / EGFH is a declared `polygon` — they exist only implicitly. Before [ADR-167](docs/06-decisions.md#adr-167) the implicit-edge universe was a hand-maintained whitelist of point KINDS (`onHostEdges`: on-segment/midpoint/foot/onSeg-intersection); a figure whose crossing was built by any OTHER kind fell through and its emergent shapes/relations went undetected (the "node-definition issue, again" the operator kept hitting). ADR-167 replaces the whitelist with a GEOMETRIC split: any point collinear-on a drawn segment in every sample AND within its span in some valid config splits it, regardless of construction kind. This scenario also asserts the equal-segment ground truths that ride on those splits (AH=BH=CG=DG, EG=EH=FG=FH).',
    steps: [
      'מלבן ABCD',
      'משולש שווה צלעות BCE',
      'משולש שווה צלעות DAF',
      'EC ו DF נפגשים בנקודה G',
      'H = חיתוך BE ו-AF',
    ],
    check(fig) {
      allStepsOk(fig);
      const shapeKeys = detectShapes(fig.construction).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);
      // The three emergent shapes, none of which is a declared polygon (only ABCD/BCE/DAF were declared).
      expect(shapeKeys, `got: ${shapeKeys.join(', ')}`).toContain('isosceles-triangle:ABH');
      expect(shapeKeys, `got: ${shapeKeys.join(', ')}`).toContain('isosceles-triangle:CDG');
      expect(shapeKeys.some((k) => k === 'rhombus:EFGH' || k === 'square:EFGH'), `EGFH rhombus in ${shapeKeys.join(', ')}`).toBe(true);
      // The equal-segment ground truths that ride on the geometric splits (a sub-segment like C–G is a
      // portion of the drawn EC, never its own object — yet it is a first-class edge now).
      const norm = (pairs: [Id, Id][]) => pairs.map(([a, b]) => [a, b].sort().join('')).sort().join(',');
      const classes = detectRelations(fig.construction).equalSegments.map((cls) => norm(cls));
      expect(classes, `equal-segment classes: ${classes.join(' | ')}`).toContain(norm([['A', 'H'], ['B', 'H'], ['C', 'G'], ['D', 'G']]));
      expect(classes).toContain(norm([['E', 'G'], ['E', 'H'], ['F', 'G'], ['F', 'H']]));
    },
  },
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
    id: 'altitude-in-trapezoid-drops-to-opposite-base',
    title: '"טרפז ABCD ישר זווית" → "CE גובה בטרפז" — the trapezoid height drops from C to the opposite parallel base AB',
    guards:
      'Session sub2ys2a: "CE גובה בטרפז" (height in a trapezoid) escalated to the LLM and returned not-understood, while "CD גובה" works on a triangle. The altitude rule inferred the opposite side ONLY via triangle logic (two neighbours of the apex that are joined to each other) — in trapezoid ABCD the apex C\'s neighbours B,D are a DIAGONAL, not an edge, so no triangle → the rule bailed. ADR-169: the height now drops to the OPPOSITE PARALLEL BASE, resolved from ctx.parallels (vertex-disjoint parallel edge-pairs derived from the figure); C sits on base DC ∥ AB so the foot lands on AB.',
    steps: [
      'טרפז ABCD ישר זווית', // right trapezoid ABCD (AB ∥ DC), AD ⟂ AB
      'CE גובה בטרפז', // the EXACT utterance — foot E on the opposite base AB, segment CE ⟂ AB
    ],
    check(fig) {
      allStepsOk(fig);
      expect(fig.positions.has('E'), 'foot named E created (height resolved, not escalated)').toBe(true);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), E = at(fig, 'E');
      // E lands on line AB (the opposite parallel base), not on a leg
      const onAB = Math.abs((E.x - A.x) * (B.y - A.y) - (E.y - A.y) * (B.x - A.x)) / Math.max(dist(A, B), 1) ** 2;
      expect(onAB, 'E on line AB (the opposite base)').toBeLessThan(1e-3);
      // CE ⟂ AB — a genuine height
      const ce = { x: E.x - C.x, y: E.y - C.y }, ab = { x: B.x - A.x, y: B.y - A.y };
      expect(Math.abs(ce.x * ab.x + ce.y * ab.y) / (Math.hypot(ce.x, ce.y) * Math.hypot(ab.x, ab.y) + 1e-9), 'CE ⟂ AB').toBeLessThan(1e-3);
    },
  },
  {
    id: 'midsegment-in-trapezoid-joins-leg-midpoints',
    title: '"טרפז ABCD" → "קטע האמצעים בטרפז" — the trapezoid median joins the leg midpoints, parallel to the bases',
    guards:
      'The "קטע אמצעים" (midsegment) rule was TRIANGLE-only: it inferred the apex from two base endpoints that share a common vertex, so a trapezoid (where the two legs do NOT meet at a point) had no apex and the utterance escalated to the LLM and returned not-understood. ADR-222: a trapezoid midsegment now resolves from the figure\'s unique vertex-disjoint parallel base-pair (ctx.parallels) — the two bases AB ∥ DC give the legs AD, BC via ctx.neighbors, and the median joins their midpoints (two midpoint commands + a segment), parallel to and midway between the bases. Mirrors the ADR-169 trapezoid-altitude resolution.',
    steps: [
      'טרפז ABCD', // trapezoid ABCD (AB ∥ DC), legs AD and BC
      'קטע האמצעים בטרפז', // the median — joins mid(AD) and mid(BC); no triangle, no base named
    ],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      // Two midpoints were created (one per leg) and joined into a segment.
      const mids = [...fig.positions.keys()].filter((id) => id !== 'A' && id !== 'B' && id !== 'C' && id !== 'D');
      expect(mids.length, 'two leg-midpoints created').toBe(2);
      const m1 = at(fig, mids[0]), m2 = at(fig, mids[1]);
      // Each new point is the midpoint of a leg (AD or BC) — accept either assignment.
      const midAD = { x: (A.x + D.x) / 2, y: (A.y + D.y) / 2 };
      const midBC = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
      const okAssign =
        (dist(m1, midAD) < 1e-6 && dist(m2, midBC) < 1e-6) || (dist(m1, midBC) < 1e-6 && dist(m2, midAD) < 1e-6);
      expect(okAssign, 'the two points are the midpoints of the legs AD and BC').toBe(true);
      // The median is parallel to the base AB (cross of unit directions ≈ 0).
      const mn = { x: m2.x - m1.x, y: m2.y - m1.y }, ab = { x: B.x - A.x, y: B.y - A.y };
      const cross = Math.abs(mn.x * ab.y - mn.y * ab.x) / (Math.hypot(mn.x, mn.y) * Math.hypot(ab.x, ab.y) + 1e-9);
      expect(cross, 'median ∥ base AB').toBeLessThan(1e-6);
      // Its length is the average of the two bases (the trapezoid median theorem).
      expect(Math.abs(dist(m1, m2) - (dist(A, B) + dist(C, D)) / 2), 'median = (AB + DC) / 2').toBeLessThan(1e-6);
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
    id: 'isosceles-appositive-stated-pair-one-line',
    title: '"משולש ABC הוא שווה שוקיים, כלומר AC=BC" — ONE line: the shape AND its stated pair both land (ADR-264)',
    guards:
      'the textbook appositive form (shape declaration + "כלומר <pair>" in one utterance) was never parsed deterministically: multiStatement requires every comma piece to carry a relation operator, the shape rule \'stop\'s on the leftover clause, and the whole line escalated to the LLM — whose decomposition could silently DROP the stated pair (its labels all already appear on the shape, so the new-label/number honesty gates never fire; the student saw success with their given missing). ADR-264: the clause fallback parses shape + givens all-or-nothing; the stated pair must win over the macro\'s soft default (ADR-114), never stack into an equilateral.',
    steps: ['משולש ABC הוא שווה שוקיים, כלומר AC=BC'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      expect(dist(A, C), 'the STATED pair |AC| = |BC| holds').toBeCloseTo(dist(B, C), 3);
      expect(Math.abs(dist(A, B) - dist(A, C)), 'NOT equilateral — the soft default |AB|=|AC| yielded').toBeGreaterThan(0.3);
    },
  },
  {
    id: 'isosceles-bare-shape-with-pair-one-line',
    title: '"משולש שווה שוקיים שבו AB=AC" — a LABEL-LESS shape + its pair draws a real TRIANGLE (ADR-264 Am. 1)',
    guards:
      'operator dev session zalwhvsh: this committed as segments AB, AC + set-equal with NO triangle — "AB is equal to AC but this is not a triangle". The label-less shape rule DEFERS (null, not \'stop\'), so `equalSegments` claimed the AB=AC clause anywhere in the string and silently dropped the shape declaration (the lax-relation-rule class: equality/distance/angle all do it). Fix: the dropped-shape-noun guard on the winning parse — never commit a shape-less half-parse — with the clause split as the deterministic rescue (bare "משולש שווה שוקיים" parses auto-named + the stated pair pins it).',
    steps: ['משולש שווה שוקיים שבו AB=AC'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C');
      expect(dist(A, B), 'the stated pair |AB| = |AC| holds').toBeCloseTo(dist(A, C), 3);
      // the operator's complaint: it must be a real TRIANGLE — three vertices, non-degenerate area
      const area2 = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y));
      expect(area2, 'A, B, C are not collinear — a real triangle').toBeGreaterThan(0.5);
      expect(fig.construction.objects.some((o) => o.kind === 'polygon'), 'the triangle polygon is drawn').toBe(true);
    },
  },
  {
    id: 'kite-stated-pair-one-line',
    title: '"דלתון ABCD, AB=AD" — ONE line: the kite AND the student\'s stated pair both land (ADR-264)',
    guards:
      'the comma sibling of the appositive form: "דלתון ABCD, AB=AD" escalated whole to the LLM, and a decomposition that returned only the kite committed silently (AB=AD\'s labels all appear on the kite → no gate fired). ADR-264: parses deterministically to the kite + the explicit set-equal, and the kite\'s defining pairs hold.',
    steps: ['דלתון ABCD, AB=AD'],
    check(fig) {
      allStepsOk(fig);
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(A, B), 'the stated pair |AB| = |AD| holds').toBeCloseTo(dist(A, D), 3);
      expect(dist(C, B), 'the kite\'s other pair |CB| = |CD| holds').toBeCloseTo(dist(C, D), 3);
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
      { llm: ['E על המשך DC'] }, // "E נמצאת על המשך המיתר DC" → LLM canonical extension line (re-parsed, TST-3)
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
      // "קשת BE שווה פעמיים קשת EC" (arc BE = 2 arc EC): the arcEquality rule (ADR-116) maps it to the
      // central-angle ratio ∠BOE = 2∠EOC. Canonical arc line, re-parsed (TST-3).
      { llm: ['קשת BE = 2 קשת EC'] },
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
      // The incircle is centred at the incentre O; its tangency feet are ANONYMOUS promotable points
      // (`@f-DE`… — #32/ADR-297: scaffolding the student didn't name), one per side.
      const I = at(fig, 'O'), D = at(fig, 'D'), E = at(fig, 'E'), F = at(fig, 'F'), G = at(fig, '@f-DE');
      const off = Math.abs((G.x - D.x) * (E.y - D.y) - (G.y - D.y) * (E.x - D.x)) / dist(D, E);
      expect(off, 'tangency foot @f-DE lies on side DE').toBeLessThan(1e-4);
      // I is equidistant from all three sides (the inradius) — check vs side DF too
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
      // The three tangency feet are ANONYMOUS promotable points (`@f-<side>` — #32/ADR-297), one per side,
      // never occupying the student letters F/G/H.
      expect(fig.construction.objects.filter((o) => isGeoPoint(o) && o.id.startsWith('@')).length, 'three anonymous feet').toBe(3);
      const F = at(fig, '@f-AB'), G = at(fig, '@f-BC'), H = at(fig, '@f-CA');
      const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      // each foot lies on its side
      expect(distToLine(F, A, B), '@f-AB on side AB').toBeLessThan(1e-4);
      expect(distToLine(G, B, C), '@f-BC on side BC').toBeLessThan(1e-4);
      expect(distToLine(H, C, A), '@f-CA on side CA').toBeLessThan(1e-4);
      // all three are the same distance from the incentre (they lie on the circle)
      const r = dist(I, F);
      expect(dist(I, G), '@f-BC on the circle (same inradius)').toBeCloseTo(r, 4);
      expect(dist(I, H), '@f-CA on the circle (same inradius)').toBeCloseTo(r, 4);
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
      "the operator's REAL α/2α bug (they used the α glyph): isosceles AB=AC in a circle, D placed on the extension of BC (t=1.3), ∠CAD=α, then a central angle ∠BOC=2α. It ERRORED 'cannot place D on segment BC so that ∠BOC = 2·∠CAD' — `driveOrCheck` drove D (the first on-segment ref) to satisfy the relation, but D is a GIVEN the student positioned, not a DOF, and a central angle can't be met by sliding D. Fix (ADR-064): only a FREE on-segment point (no stated ratio) is driveable; a stated-ratio/extension point is left put, so the relation drives the triangle's free shape instead and D stays at t=1.3. GROUND-TRUTH CORRECTION (ADR-264 Am. 2): step 1 used to HALF-PARSE to a bare circumcircle — the isosceles and the stated AB=AC were silently dropped, and the t=1.3 expectation was calibrated on that wrong lopsided-triangle figure. With the full parse (isosceles + pinned pair + circumcircle), ∠BOC=2∠CAD ⟺ ∠BAC=∠CAD, which is UNSATISFIABLE at t=1.3 for every apex height (by symmetry ∠BAC subtends the whole base BC while ∠CAD subtends only the 0.3·BC stub), so the solver legitimately drives D's UNSTATED extension t (an ADR-052 free DOF — the seed-sweep exemption for this scenario says the same) while the isosceles holds. The check now asserts what the student actually stated: the pair, the ratio, and D beyond C.",
    steps: ['משולש שווה שוקיים ABC שבו AB=AC חוסם במעגל', 'נקודה D על המשך BC', 'BD', 'DA', '∠CAD=α', '∠BOC=2α'],
    check(fig) {
      allStepsOk(fig);
      const cad = angle(at(fig, 'C'), at(fig, 'A'), at(fig, 'D'));
      const boc = angle(at(fig, 'B'), at(fig, 'O'), at(fig, 'C'));
      expect(boc / cad, '∠BOC = 2·∠CAD').toBeCloseTo(2, 2);
      // the previously-dropped givens hold: the ISOSCELES pair (step 1's "שבו AB=AC") is enforced
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), D = at(fig, 'D');
      expect(dist(A, B), 'isosceles |AB| = |AC| (was silently dropped pre-ADR-264 Am. 2)').toBeCloseTo(dist(A, C), 3);
      // D stays ON the stated extension — BEYOND C (order B→C→D, ADR-054). Its exact t is an UNSTATED
      // free DOF the relation legitimately drives (∠BAC=∠CAD has no solution at the seed t with AB=AC).
      const tD = ((D.x - B.x) * (C.x - B.x) + (D.y - B.y) * (C.y - B.y)) / ((C.x - B.x) ** 2 + (C.y - B.y) ** 2);
      expect(tD, 'D beyond C on the extension of BC').toBeGreaterThan(1.05);
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
      { llm: ['C על מעגל O', 'D על מעגל P'] }, // "C עם מעגל אחד ו D על מעגל שני" → two canonical lines (re-parsed, TST-3)
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
      { llm: ['C על מעגל P'] }, // "C על המעגל הימני" → canonical named-circle line (re-parsed, TST-3)
      { llm: ['E על מעגל O'] }, // "E על המעגל השמאלי"
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
      const anon = ptIds.filter((id) => id.startsWith('@'));
      expect(anon.length, `three anonymous incircle feet (got ${ptIds.join(',')})`).toBe(3);
      expect(anon.every((id) => id.startsWith('@f-')), 'feet are @f-<side> ids').toBe(true);
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
];

/**
 * Seed-sweep oracle ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) A2 / TST-1).
 *
 * The `run` test above checks each scenario at ONE seed (the app's default, `firstSatisfyingSeed`). But
 * the dominant historical escape class is *wrong-configuration-at-another-seed* — a figure that builds
 * clean yet is geometrically wrong in some OTHER valid draw the student can reach via "show another
 * configuration" (ADR-085/098/127/166 all shipped past seed-0 suites). This re-runs each scenario's OWN
 * geometric `check` — the independent oracle that already exists — at EVERY seed the app would actually
 * DISPLAY (`meetsRequirements` true), asserting the ground-truth relations hold in every shown config, not
 * just the default one.
 *
 * Scope (principled, not arbitrary): only scenarios with FREE DOFs are swept — a determined figure is
 * seed-invariant, so the single-seed test already covers it. Heavy figures (a seed-0 replay over the
 * threshold) are skipped and LOGGED (no silent caps — repo rule). A scenario whose `check` asserts a
 * CONFIG-SPECIFIC fact (a branch / vertex order that legitimately varies) opts out via `seedSweepExempt`.
 */
/**
 * CONFIG-SPECIFIC scenarios exempt from the seed-sweep — their `check` asserts a value that legitimately
 * VARIES across the valid configs "show another configuration" reaches (a free radius, an unstated
 * extension distance, an arc position, a size-dependent separation / convexity gap), so it can only hold at
 * the default seed. Their geometric INVARIANTS (angle relations, on-circle membership, collinearity) DO
 * hold across seeds — verified when this oracle was built; only the config-pinned numbers move. The
 * single-seed `run` test above still guards each at its default. (Kept as ONE legible list, id → why.)
 */
export const SEED_SWEEP_EXEMPT: Record<string, string> = {
  'symbolic-2alpha-drives-shape-not-the-fixed-point': 'D is on an UNSTATED extension (המשך BC, no distance) — an ADR-052 free DOF, so its t legitimately varies; the ∠BOC=2∠CAD invariant holds every seed',
  'two-collinear-chain-solves': 'the check pins circle P’s radius (|PD|≈3.6) — a free-radius DOF that varies across views',
  'line-through-intersection-collinear': 'pins |PC| to the default free radius; the collinearity invariant holds every seed',
  'second-intersection-avoids-shared-point': 'pins E’s distance to the default radius and a size-dependent A–C separation; E stays on the circle',
  'redefine-existing-point-onto-circle': 'the E–A separation (>0.5) scales with the free radii; E stays ON circle P and A,C,E collinear every seed',
  'point-on-arc-no-midpoint-word': 'a FREE point on the arc — its position varies by design (ADR-042); no fixed arc coordinate is an invariant',
  'perp-constraint-keeps-quad-convex': 'the convex-gap threshold (15°) is stricter than the app’s displayable-convexity gate; a valid ~12° corner appears at some seeds',
  'tangent-chord-bisector': 'same convex-gap threshold vs the displayable gate — a valid tight corner at one seed',
  'tangent-secant-detection-honours-valid-configs': 'the check runs detectRelations/detectShapes, which sample the figure internally across their own seeds — the ground-truth relations it asserts are seed-invariant by construction, so a per-display-seed re-run only repeats the same internal detection',
};

/**
 * KNOWN-HEAVY scenarios (a single replay is slow — coupled solves / reflection sweeps / large corpora),
 * pre-skipped so the default sweep doesn't pay their cost even to MEASURE them. The `THRESHOLD_MS` guard
 * below still auto-catches any NEW heavy scenario. Populated from the sweep's own timing log; each is swept
 * only in the deep pass (`SEED_SWEEP_MULT` set). Their default config is still guarded by the `run` test.
 */
export const SEED_SWEEP_HEAVY = new Set<string>([
  'segment-meet-lands-on-segments', 'emergent-shapes-through-crossings', 'incircle-of-trapezoid-flexes-tangential',
  'area-ratio-converges-points-allowed', 'driven-extension-point-stays-beyond', 'q4-constraints-order-independent',
  'collinear-flexes-redundant-carrier-kite-tangents', 'diameter-from-point-cuts-side-onto-segment',
  'alpha-less-than-beta-reshapes', 'kite-tangents-redundant-equality-not-over-constrained',
]);

