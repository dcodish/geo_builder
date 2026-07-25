/**
 * Scenario corpus CHUNK 2/4 (S4.1b of docs/24 — the 6,253-line single file split to kill the
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
import { replay } from '@/store/geoStore';
import { isGeoPoint, freeDofs, freeDofCount, applySeed, evaluate, detectRelations, detectShapes } from '@/engine';
import type { Id, Vec } from '@/engine';
import { detectTheorems } from '@/theorems';

import type { Scenario } from './scenarios-harness';
import { factsOf, at, dist, angle, allStepsOk } from './scenarios-harness';

export const SCENARIOS_2: Scenario[] = [
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
      for (const id of ['@ctr-O', '@ctr-P', 'A', 'B', 'C', 'D']) expect(fig.positions.has(id), `position for ${id}`).toBe(true); // centres anonymous (ADR-342)
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
    id: 'altitude-to-named-side',
    title: '"משולש ABC" → "גובה לצלע AB" — the altitude TO a named side drops from the opposite vertex (issue #107)',
    guards:
      'log-triage 2026-07-13 (operator-approved): "גובה לצלע AB" (altitude TO a side) was not-handled, while the mirror forms work — "גובה מ A" (altitude FROM a vertex, ADR-263) and "הוסף תיכון לצלע AB" (median TO a side, #71). The `altitude` rule resolved its apex only from a "from/מ" phrase or a named segment, so the vertex-less "to a named side" phrasing fell through to `return null`. Fix (#107): mirror the median\'s vertex-less side form — resolve the apex as the unique third vertex of a figure triangle carrying side AB, then reuse the foot+segment lowering. Several candidate triangles or none → defer (ADR-052), never guess.',
    steps: [
      'משולש ABC', // triangle ABC
      'גובה לצלע AB', // altitude to side AB → drops from the opposite vertex C, foot on AB
    ],
    check(fig) {
      allStepsOk(fig);
      // The apex is C (the vertex not on AB); the foot is the auto-named point on AB.
      const foot = fig.construction.objects
        .filter(isGeoPoint)
        .map((o) => o.id)
        .find((id) => !['A', 'B', 'C'].includes(id));
      expect(foot, 'a foot point was created').toBeTruthy();
      const A = at(fig, 'A'), B = at(fig, 'B'), C = at(fig, 'C'), F = at(fig, foot!);
      // F on line AB, and CF ⟂ AB (the altitude from C).
      const onAB = Math.abs((F.x - A.x) * (B.y - A.y) - (F.y - A.y) * (B.x - A.x)) / Math.max(dist(A, B), 1) ** 2;
      expect(onAB, 'the foot is on line AB').toBeLessThan(1e-3);
      const cf = { x: F.x - C.x, y: F.y - C.y }, ab = { x: B.x - A.x, y: B.y - A.y };
      expect(
        Math.abs(cf.x * ab.x + cf.y * ab.y) / (Math.hypot(cf.x, cf.y) * Math.hypot(ab.x, ab.y) + 1e-9),
        'the altitude CF ⟂ AB',
      ).toBeLessThan(1e-3);
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
        { type: 'set-perpendicular', a: '@ctr-P', b: 'B', c: 'C', d: 'B', implicit: true }, // the centre point id (ADR-342 — the letter is the circle's token, not a point)
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
        const A = e.positions.get('A')!, B = e.positions.get('B')!, C = e.positions.get('C')!, O = (e.positions.get('O') ?? e.positions.get('@ctr-O'))!; // the unnamed circle's centre is anonymous (ADR-342)
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
      expect(fig.coincidences.some(([a, b]) => (a === 'N' && (b === 'O' || b === '@ctr-O')) || ((a === 'O' || a === '@ctr-O') && b === 'N')), 'the N=O coincidence is surfaced as a notice').toBe(true); // the unnamed centre is anonymous (ADR-342)
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
];
