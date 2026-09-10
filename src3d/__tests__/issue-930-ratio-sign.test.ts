/**
 * #930 ([ADR-3D-236](../../docs/06b-decisions-3d.md)) — A SIGN STATED FOR A VEC-DEF'S RATIO SYMBOL IS
 * HONOURED.
 *
 * The capability half of #922. The exam writes a ratio's sign exactly this way:
 *
 *     פירמידה ABCDS שבסיסה ריבוע · נסמן: AD = u, AB = v, AS = w · SN = k·SC · k חיובי
 *
 * #922 (ADR-3D-225) made the refusal TRUTHFUL — «the sign is not selectable for this kind of letter»
 * instead of falsely claiming the figure never defined `k`. This makes it selectable, so the student's
 * given is honoured rather than honestly declined.
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const BASE = ['פירמידה ABCDS שבסיסה ריבוע', 'נסמן: AD = u, AB = v, AS = w', 'SN = k·SC'];
const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const run = (us: string[]) => {
  reset();
  for (const u of us) useGeo3.getState().submit(u);
  return derive3(useGeo3.getState().facts, useGeo3.getState().seed);
};
const bad = (d: ReturnType<typeof derive3>) => Object.entries(d.status).filter(([, v]) => v !== 'ok' && v !== 'disabled');
/** `k` read back FROM THE DRAWING — the projection of SN onto SC. The independent oracle: it never
 *  asks the engine what it chose, it measures where the point actually landed. */
const kFromGeometry = (d: ReturnType<typeof derive3>): number => {
  const [N, S, C] = ['N', 'S', 'C'].map((id) => d.positions.get(id)!);
  const num = (N.x - S.x) * (C.x - S.x) + (N.y - S.y) * (C.y - S.y) + (N.z - S.z) * (C.z - S.z);
  const den = (C.x - S.x) ** 2 + (C.y - S.y) ** 2 + (C.z - S.z) ** 2;
  return num / den;
};

describe('#930 — the exam’s own sentence', () => {
  it('«k חיובי» is accepted and the figure honours it', () => {
    const d = run([...BASE, 'k חיובי']);
    expect(bad(d), 'no step refuses — this was `sign-not-selectable` before').toEqual([]);
    expect(kFromGeometry(d), 'the drawn k really is positive').toBeGreaterThan(0);
  });

  it('«k שלילי» is accepted too, and it MOVES the point to the other side of S', () => {
    // The anti-vacuity assertion, and the one that matters. A positive sign alone proves nothing:
    // the sampler's default range is (0.2, 0.8), so «k חיובי» would pass whether or not anything
    // read it. The negative direction is what shows the sign is doing work.
    const d = run([...BASE, 'k שלילי']);
    expect(bad(d), 'a negative ratio is satisfiable — N simply sits beyond S').toEqual([]);
    expect(kFromGeometry(d), 'the drawn k really is negative').toBeLessThan(0);
  });

  it('…and the two signs put N in genuinely different places', () => {
    const pos = kFromGeometry(run([...BASE, 'k חיובי']));
    const neg = kFromGeometry(run([...BASE, 'k שלילי']));
    expect(Math.sign(pos)).toBe(1);
    expect(Math.sign(neg)).toBe(-1);
    expect(Math.abs(pos - neg), 'not the same figure with a different label on it').toBeGreaterThan(0.1);
  });
});

describe('#930 — what must NOT change', () => {
  it('an unsigned ratio keeps the default positive sample', () => {
    const d = run(BASE);
    expect(bad(d)).toEqual([]);
    expect(kFromGeometry(d), 'unchanged: the default range is (0.2, 0.8)').toBeGreaterThan(0);
  });

  it('a sign for a letter NO mechanism owns is still REFUSED', () => {
    // The #922 distinction that must not collapse: "not selectable for this kind of letter" and
    // "this letter is not in the figure at all" are different statements, and only one is true here.
    //
    // Asserted through the STORE, on lastError, because that is where the student meets it: the submit
    // gate refuses this before it becomes a fact, so there is no red row to inspect (the 3-D twin of
    // what #960/ADR-495 documents for 2-D). Driving derive3 directly does surface the code —
    // {code: 'unknown-symbol', id: 'q'} — but that is a path the student never takes.
    run([...BASE, 'q חיובי']);
    expect(useGeo3.getState().lastError, 'the tool says no').toBeTruthy();
  });

  it('…while the SAME sentence on a real symbol is accepted', () => {
    run([...BASE, 'k חיובי']);
    expect(useGeo3.getState().lastError, 'so the refusal above is about the letter, not the form').toBeNull();
  });

  it('the sign does not leak across symbols — a second ratio is unaffected', () => {
    // `firstNonDegenerateRoot` filters by `sym` deliberately; the other sign consumers in evaluate.ts
    // apply every recorded sign to every root, which is sound only while a figure has one symbol.
    const d = run([...BASE, 'SM = m·SB', 'k שלילי']);
    expect(bad(d)).toEqual([]);
    expect(kFromGeometry(d), 'k honours its own sign').toBeLessThan(0);
    const [M, S, B] = ['M', 'S', 'B'].map((id) => d.positions.get(id)!);
    const mNum = (M.x - S.x) * (B.x - S.x) + (M.y - S.y) * (B.y - S.y) + (M.z - S.z) * (B.z - S.z);
    const mDen = (B.x - S.x) ** 2 + (B.y - S.y) ** 2 + (B.z - S.z) ** 2;
    expect(mNum / mDen, 'm keeps its own default — k’s sign is not applied to it').toBeGreaterThan(0);
  });
});
