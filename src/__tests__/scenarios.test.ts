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
import { isGeoPoint, freeDofs, firstCyclableBranch, evaluate, circleMembers } from '@/engine';
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
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])), // drop ~scaffolding circles (mirrors App.parseCtx)
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction),
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
    id: 'triangle-circumscribes-circle-is-incircle',
    title: '"משולש DEF חוסם את המעגל" builds the INCIRCLE (tangent to the sides), not a circumcircle',
    guards:
      "operator: \"no ability to say משולש DEF חוסם את המעגל\". It was misparsed to a CIRCUMCIRCLE (circle through D,E,F) — backwards. \"Triangle circumscribes the circle\" is the same figure as \"circle inscribed in the triangle\" (the incircle, tangent to the 3 sides). Fix: the `incircle` rule now also matches the triangle-first phrasing, ORDERED (triangle-labels … חוסם/circumscribes … circle) so a circle-first \"מעגל חוסם משולש\" (a real circumcircle) is NOT captured.",
    steps: ['משולש DEF חוסם את המעגל'],
    check(fig) {
      allStepsOk(fig);
      // the incircle is centred at the incenter I, tangent to side DE at its foot G
      const I = at(fig, 'I'), D = at(fig, 'D'), E = at(fig, 'E'), G = at(fig, 'G');
      const off = Math.abs((G.x - D.x) * (E.y - D.y) - (G.y - D.y) * (E.x - D.x)) / dist(D, E);
      expect(off, 'tangency point G lies on side DE').toBeLessThan(1e-4);
      // I is equidistant from all three sides (the inradius) — check vs side DF too
      const F = at(fig, 'F');
      const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b);
      expect(distToLine(I, D, F), 'inradius to DF = inradius to DE').toBeCloseTo(dist(I, G), 3);
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
