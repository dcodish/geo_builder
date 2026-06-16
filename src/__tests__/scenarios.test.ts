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
import { replay, polygonsSimple, useGeoStore } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import { isGeoPoint } from '@/engine';
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
  it('[quad-diagonals-resample] "מרובע ABCD" + "AC=10" + "DB=10" never resamples to a self-crossing quad', () => {
    // The operator built a general quad with both diagonals = 10; "show another configuration"
    // landed on a tangled (self-crossing) ABCD. The sampler must only surface SIMPLE polygons.
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
      expect(polygonsSimple(useGeoStore.getState().facts, fig.positions), `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(fig, 'A'), at(fig, 'C'))).toBeCloseTo(10, 3); // the diagonals still hold
      expect(dist(at(fig, 'B'), at(fig, 'D'))).toBeCloseTo(10, 3);
    }
    st.clear();
  });
});
