/**
 * #1913 ([ADR-628](../../../docs/06-decisions.md#adr-628)) — A PARALLELOGRAM-FAMILY NOUN OVER FOUR POINTS ON ONE
 * CIRCLE LOWERS TO ITS CYCLIC MEMBER: the rectangle, or the square.
 *
 * Operator ruling (2026-10-08, re-affirmed 2026-10-10): *"never a crossed shape; a real parallelogram, or a
 * refusal"*; «מעגל O · A, B, C ו-D על המעגל · AB = 3 · BC = 4 · מקבילית ABCD» draws a 3 × 4 rectangle. The bar
 * (2026-10-10): *no parallelogram row may get slower* — the escalation table on #1913 is the bar.
 *
 * Measured on `main` @ 06fc51dd through the REAL door (`runSubmit` → `commitVerdict` → the App's `runViewResolve`
 * with `findValidConfig` at the production budget; the model mocked):
 *   the ruled row → CROSSED (|A+C−B−D| = 2.40, ∠A = 6.1°) under «לא נמצאה תצורה…», 0 of 24 seeds valid;
 *   «… · מעוין ABCD» / «… · ריבוע ABCD» → refused as over-constrained («|AB| = |BC|») after 8.7–11.4 s;
 *   «… · AB = 3 · BC = 4 · מקבילית ACBD» → committed, crossed, under the amber note after 10.8 s.
 * Root cause: `shapeConstraints` lowered the parallelogram to "opposite sides equal" and the rhombus to "adjacent
 * sides equal" — the FAMILY's general relations — although four points already on one circle force the cyclic
 * member. On a circle the general relations admit the crossed antiparallelogram and miss the forced member
 * whenever it needs the radius to move; three consecutive right angles have neither root.
 *
 * Class members, both locales, over 24 seeds; the model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { replay, useGeoStore } from '@/store/geoStore';
import { findValidConfig, meetsRequirements } from '@/replay/core';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

const strip = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
type P = { x: number; y: number };
const NO_CONFIG = (lng: 'he' | 'en') => strip(i18n.t('figure.noValidConfig', { lng }) as string);

/** Play `lines` through the submit door with the App's resolve wiring; the notes the student saw on the LAST line. */
async function play(lines: string[], locale: 'he' | 'en' = 'he') {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: locale }) as string;
  useGeoStore.getState().clear();
  let notes: string[] = [];
  let beforeLen = 0;
  for (const [i, line] of lines.entries()) {
    if (i === lines.length - 1) beforeLen = useGeoStore.getState().facts.length;
    notes = [];
    let resolving: Promise<void> = Promise.resolve();
    const deps: SubmitDeps = {
      t: (key, opts) => t(key, opts),
      locale,
      ui: { setInputNote: (m) => m && notes.push(strip(m)), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const r = replay(st.facts, st.seed);
        return { construction: r.construction, positions: r.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {
        resolving = runViewResolve({
          getState: () => useGeoStore.getState(),
          meetsRequirements,
          autoResolve: async (facts, seed) => {
            const f = findValidConfig(facts, seed);
            return f ? { ...f, fold: null } : null;
          },
          applyView: (found) => useGeoStore.getState().applyView({ facts: found.facts, seed: found.seed }),
          setPending: () => {},
          onExhausted: () => notes.push(strip(t('figure.noValidConfig'))),
          isCancelled: () => false,
        });
      },
      llmAbortRef: { current: null },
      explainError: (raw, said) => humanizeError(raw, t, said),
    };
    await runSubmit(line, deps);
    await resolving;
  }
  const st = useGeoStore.getState();
  return { notes, facts: st.facts, seed: st.seed, committed: st.facts.length > beforeLen, positions: replay(st.facts, st.seed).positions as Map<string, P> };
}

/** Do two non-adjacent sides of the ring properly cross at these positions? */
function crossed(ids: string[], at: Map<string, P>): boolean {
  const p = ids.map((id) => at.get(id)!);
  const side = (o: P, a: P, b: P) => Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
  const n = p.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]];
      if (side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0) return true;
    }
  return false;
}
const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const ang = (a: P, b: P, c: P) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};

const RING = ['A', 'B', 'C', 'D'];

/** The ring at `at` is a genuine rectangle (every angle right, hence simple and |A+C−B−D| = 0). */
function expectRectangle(at: Map<string, P>, label: string) {
  const [A, B, C, D] = RING.map((id) => at.get(id)!);
  expect(A && B && C && D, `${label}: all four vertices drawn`).toBeTruthy();
  expect(crossed(RING, at), `${label}: never crossed`).toBe(false);
  for (const [p, v, q, name] of [[D, A, B, 'A'], [A, B, C, 'B'], [B, C, D, 'C'], [C, D, A, 'D']] as const) expect(ang(p, v, q), `${label}: right angle at ${name}`).toBeCloseTo(90, 3);
  expect(Math.hypot(A.x + C.x - B.x - D.x, A.y + C.y - B.y - D.y), `${label}: the diagonals bisect each other`).toBeLessThan(1e-4);
}

/** Every one of the 24 raw seeds meets the givens and draws the ring as a rectangle (the seed sweep of docs/17 §9). */
function sweepRectangle(facts: ReturnType<typeof useGeoStore.getState>['facts'], label: string, extra?: (at: Map<string, P>, seed: number) => void) {
  for (let seed = 0; seed < 24; seed++) {
    expect(meetsRequirements(facts, seed), `${label}: seed ${seed} meets the givens`).toBe(true);
    const at = replay(facts, seed).positions as Map<string, P>;
    expectRectangle(at, `${label} @seed ${seed}`);
    extra?.(at, seed);
  }
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const CIRC = ['מעגל O', 'A, B, C ו-D על המעגל'];

describe('#1913 — the ruled row: four points on a circle with two sides stated, then «מקבילית ABCD», is the 3 × 4 rectangle', () => {
  const sides = (at: Map<string, P>, label: string) => {
    expect(d(at.get('A')!, at.get('B')!), `${label}: |AB| = 3`).toBeCloseTo(3, 4);
    expect(d(at.get('B')!, at.get('C')!), `${label}: |BC| = 4`).toBeCloseTo(4, 4);
  };

  it('the operator’s exact five lines: committed, no «לא נמצאה תצורה…», a 3 × 4 rectangle at the shown seed and at every one of 24', async () => {
    const r = await play([...CIRC, 'AB = 3', 'BC = 4', 'מקבילית ABCD']);
    expect(r.committed).toBe(true);
    expect(r.notes, 'no note at all').toEqual([]);
    expectRectangle(r.positions, 'shown');
    sides(r.positions, 'shown');
    sweepRectangle(r.facts, 'ruled row', (at, s) => sides(at, `seed ${s}`));
    expect(llmParseMock, 'never escalated to the model').not.toHaveBeenCalled();
  });

  for (const [title, lines, locale] of [
    ['the sides reversed', [...CIRC, 'BC = 4', 'AB = 3', 'מקבילית ABCD'], 'he'],
    ['the membership stated per point', ['מעגל O', 'A על המעגל', 'B על המעגל', 'C על המעגל', 'D על המעגל', 'AB = 3', 'BC = 4', 'מקבילית ABCD'], 'he'],
    ['the English spelling', ['circle O', 'A, B, C and D on the circle', 'AB = 3', 'BC = 4', 'parallelogram ABCD'], 'en'],
  ] as const) {
    it(`${title}: the same 3 × 4 rectangle, over 24 seeds`, async () => {
      const r = await play([...lines], locale);
      expect(r.committed).toBe(true);
      expect(r.notes).toEqual([]);
      sweepRectangle(r.facts, title, (at, s) => sides(at, `seed ${s}`));
    });
  }
});

describe('#1913 — the class: a parallelogram over points already on one circle is its rectangle at once, never crossed', () => {
  for (const [title, lines] of [
    ['the body’s three lines (was: a rectangle only after the post-commit search, 8 of 24 seeds)', [...CIRC, 'מקבילית ABCD']],
    ['«על מעגל» — the circle the membership itself creates', ['A, B, C ו-D על מעגל', 'מקבילית ABCD']],
    ['one side stated', [...CIRC, 'AB = 3', 'מקבילית ABCD']],
    ['a stated radius and one side', ['מעגל O רדיוס 5', 'A, B, C ו-D על המעגל', 'AB = 6', 'מקבילית ABCD']],
    ['a central angle', [...CIRC, 'זווית AOB = 60', 'מקבילית ABCD']],
  ] as const) {
    it(title, async () => {
      const r = await play([...lines]);
      expect(r.committed).toBe(true);
      expect(r.notes, 'drawn at once — no exhausted search, no refusal').toEqual([]);
      expect(r.seed, 'the committed seed itself is valid (no search needed)').toBe(0);
      sweepRectangle(r.facts, title);
    });
  }

  it('«הציגו תצורה אחרת» shows only rectangles: every valid configuration of the body’s lines is one', async () => {
    const r = await play([...CIRC, 'מקבילית ABCD']);
    sweepRectangle(r.facts, 'body');
  });
});

describe('#1913 / #1921 — a rhombus or a square over four points on a circle is the square, promptly (was: a false over-constrained refusal)', () => {
  const square = (at: Map<string, P>, label: string) => {
    const [A, B, C, D] = RING.map((id) => at.get(id)!);
    const s = [d(A, B), d(B, C), d(C, D), d(D, A)];
    for (const x of s) expect(x, `${label}: four equal sides`).toBeCloseTo(s[0], 4);
  };
  for (const [title, lines, side] of [
    ['«מעוין ABCD»', [...CIRC, 'מעוין ABCD'], undefined],
    ['«ריבוע ABCD»', [...CIRC, 'ריבוע ABCD'], undefined],
    ['«AB = 3 · מעוין ABCD»', [...CIRC, 'AB = 3', 'מעוין ABCD'], 3],
    ['«AB = 3 · ריבוע ABCD»', [...CIRC, 'AB = 3', 'ריבוע ABCD'], 3],
    ['"rhombus ABCD" (English)', ['circle O', 'A, B, C and D on the circle', 'rhombus ABCD'], undefined],
  ] as const) {
    it(`${title} draws a square over 24 seeds`, async () => {
      const r = await play([...lines], title.includes('English') ? 'en' : 'he');
      expect(r.committed, 'committed, not refused').toBe(true);
      expect(r.notes).toEqual([]);
      sweepRectangle(r.facts, title, (at, s) => {
        square(at, `seed ${s}`);
        if (side !== undefined) expect(d(at.get('A')!, at.get('B')!), `seed ${s}: |AB| = ${side}`).toBeCloseTo(side, 4);
      });
    });
  }
});

describe('#1913 — a parallelogram-family noun that CANNOT hold on the circle is refused at once, naming the statement', () => {
  it('«… · AB = 3 · BC = 4 · מקבילית ACBD» (the right angle at C would make AB the hypotenuse, but AB < BC)', async () => {
    const r = await play([...CIRC, 'AB = 3', 'BC = 4', 'מקבילית ACBD']);
    expect(r.committed, 'nothing committed').toBe(false);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0], 'the refusal names the right angle and the stated sides').toContain('לא ייתכן');
    expect(r.notes[0]).toContain('|AB| = 3');
    expect(r.notes[0]).not.toContain(NO_CONFIG('he'));
    // identical to what 2-D already answers for «מלבן ACBD» (the ruling: never a crossed shape; a real one, or a refusal)
    const m = await play([...CIRC, 'AB = 3', 'BC = 4', 'מלבן ACBD']);
    expect(m.notes).toEqual(r.notes);
  });
});

describe('#1913 — controls, byte-unchanged: off a circle the lowering is the family’s own', () => {
  it('a parallelogram over a triangle and a free point, and over two segments, stays a general parallelogram (not forced right-angled)', async () => {
    for (const lines of [
      ['משולש ABC', 'נקודה D', 'AB = 3', 'BC = 4', 'מקבילית ABCD'],
      ['קטע AC', 'קטע BD', 'מקבילית ABCD'],
      ['קטע AC', 'קטע BD', 'AC = 6', 'BD = 4', 'מקבילית ABCD'],
    ]) {
      const r = await play(lines);
      expect(r.committed, lines.join(' · ')).toBe(true);
      expect(r.notes, lines.join(' · ')).toEqual([]);
      const [A, B, C, D] = RING.map((id) => r.positions.get(id)!);
      expect(crossed(RING, r.positions), `${lines.join(' · ')}: simple`).toBe(false);
      expect(d(A, B), 'opposite sides equal').toBeCloseTo(d(C, D), 4);
      expect(d(B, C), 'opposite sides equal').toBeCloseTo(d(D, A), 4);
      expect(Math.abs(ang(D, A, B) - 90), `${lines.join(' · ')}: not a rectangle — the angle stays free`).toBeGreaterThan(1);
    }
  });

  it('the rectangle and the trapezoid over concyclic points keep today’s verdicts', async () => {
    const rect = await play([...CIRC, 'מלבן ABCD']);
    expect(rect.notes).toEqual([]);
    sweepRectangle(rect.facts, 'rectangle');
    const trap = await play([...CIRC, 'טרפז ABCD']);
    expect(trap.committed).toBe(true);
    expect(trap.notes).toEqual([]);
    expect(crossed(RING, trap.positions)).toBe(false);
    const [A, B, C, D] = RING.map((id) => trap.positions.get(id)!);
    expect(Math.abs(ang(D, A, B) - 90), 'a trapezoid is not forced into a rectangle').toBeGreaterThan(1);
    expect(d(B, C), 'a cyclic trapezoid is isosceles (its own verdict, not this fix)').toBeCloseTo(d(D, A), 3);
  });

  it('the noun first, the circle after: the rectangle 2-D already draws (unchanged)', async () => {
    const r = await play(['מקבילית ABCD', 'מעגל O', 'A, B, C ו-D על המעגל']);
    expect(r.committed).toBe(true);
    expect(r.notes).toEqual([]);
    expectRectangle(r.positions, 'noun first');
  });
});
