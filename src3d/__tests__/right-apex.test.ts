/**
 * ADR-3D-080 — the operator's two follow-ups on the ADR-3D-079 example (2026-07-25):
 *  1. «S על מישור A'B'C'» parked S next to a vertex ("close to A or on A itself") — the
 *     on-plane rider now steps to GENERAL POSITION (the 2-D ADR-253 pattern; k=0 keeps the
 *     legacy sample keys so already-clear figures are byte-identical).
 *  2. «SBCD פירמידה ישרה» refused `'B' already-defined` — a pyramid whose ids ALL exist is a
 *     STATEMENT (M1): draw its ink; a RIGHT kind seats a free plane-rider apex at the
 *     closed-form right-apex (⊥ line through the base's circumcentre ∩ carrier plane), and
 *     any other apex takes equal-lateral-edge givens (drive or verify).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const err = () => state().lastError;
const len = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

/** The operator's figure: the #321 oblique square-base prism + the ADR-3D-079 book givens. */
const FIGURE = [
  'מנסרה שבסיסה ריבוע',
  'נתונות הנקודות: A(1, 4, -3), B(2t, t, k)',
  'הבסיס ABCD מונח על מישור שמקביל למישור [xy]',
  'AB=7',
  't > 0',
  "נסמן: AA' = u, AB = v, AD = w",
  "∠BAA'=60",
  "∠DAA'=90",
  "|AA'|=6",
];

describe('ADR-3D-080 — S on the top plane, then «SBCD פירמידה ישרה»', () => {
  beforeEach(() => {
    reset();
    for (const u of FIGURE) {
      submit(u);
      expect(err(), u).toBeNull();
    }
  });

  it('the plane rider lands ON the plane and in GENERAL POSITION (never hugging a vertex)', () => {
    submit("S על מישור A'B'C'");
    expect(err()).toBeNull();
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const S = d.positions.get('S')!;
      const top = d.positions.get("A'")!;
      expect(Math.abs(S.z - top.z), `seed ${seed}: on the top plane`).toBeLessThan(1e-4); // pivot numeric floor ~1e-6
      for (const nm of ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"]) {
        expect(len(S, d.positions.get(nm)!), `seed ${seed}: clear of ${nm}`).toBeGreaterThan(2);
      }
    }
  });

  it('«SBCE פירמידה ישרה» — a CONSTRUCTED base letter defeats the run heuristic; the apex is found semantically (Am. 1)', () => {
    submit('AE⃗ = (3/7)AB⃗');
    submit("S על מישור A'B'C'");
    submit('SBCE פירמידה ישרה'); // parses [S,B,C,E] apex-LAST (B,C,E is no run) — apply re-orients: the rider S is the apex
    expect(err()).toBeNull(); // was: injection-unsatisfiable (drove |ES|=|EB|=|EC| with E as apex)
    for (const seed of [0, 1]) {
      const d = derive3(state().facts, seed);
      const S = d.positions.get('S')!;
      const [B, C, E] = ['B', 'C', 'E'].map((n) => d.positions.get(n)!);
      expect(len(S, B), `seed ${seed}`).toBeCloseTo(len(S, C), 6);
      expect(len(S, B), `seed ${seed}`).toBeCloseTo(len(S, E), 6);
      expect(Math.abs(S.z - d.positions.get("A'")!.z), `seed ${seed}`).toBeLessThan(1e-4);
    }
  });

  it('a SECOND right-pyramid statement on the seated apex refuses (S cannot top both bases)', () => {
    submit('AE⃗ = (3/7)AB⃗');
    submit("S על מישור A'B'C'");
    submit('SBCD פירמידה ישרה');
    expect(err()).toBeNull();
    submit('SBCE פירמידה ישרה'); // circum(BCD) ≠ circum(BCE) — genuinely contradictory
    expect(err()).not.toBeNull(); // honest keep-prior refusal
  });

  it('«SBCD פירמידה ישרה» is a STATEMENT — S is seated at the right-apex on its carrier plane', () => {
    submit("S על מישור A'B'C'");
    submit('SBCD פירמידה ישרה');
    expect(err()).toBeNull(); // was: 'B' already-defined
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const S = d.positions.get('S')!;
      const [B, C, D] = ['B', 'C', 'D'].map((n) => d.positions.get(n)!);
      const [sb, sc, sd] = [len(S, B), len(S, C), len(S, D)];
      expect(sb, `seed ${seed}: |SB|=|SC|`).toBeCloseTo(sc, 6);
      expect(sb, `seed ${seed}: |SB|=|SD|`).toBeCloseTo(sd, 6);
      expect(Math.abs(S.z - d.positions.get("A'")!.z), `seed ${seed}: still on the carrier plane`).toBeLessThan(1e-4);
    }
  });
});

describe('ADR-3D-080 — the claims fallback: a non-rider apex verifies (or refuses) rightness', () => {
  beforeEach(reset);

  it("cube: «BDA'A פירמידה ישרה» verifies (A equidistant from B, D, A')", () => {
    submit('קובייה ABCD');
    submit("BDA'A פירמידה ישרה");
    expect(err()).toBeNull();
  });

  it("cube: «BCDA' פירמידה ישרה» is refuted (A' is NOT over the circumcentre of BCD)", () => {
    submit('קובייה ABCD');
    submit("BCDA' פירמידה ישרה");
    expect(err()).not.toBeNull(); // |A'B| = √2 ≠ |A'C| = 1... the equal-lateral given fails honestly
  });

  it('a non-right pyramid statement over existing points just draws (no invented rightness)', () => {
    submit('קובייה ABCD');
    submit("BCDA' פירמידה");
    expect(err()).toBeNull();
  });
});
