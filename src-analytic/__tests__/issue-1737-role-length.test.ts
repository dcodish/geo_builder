/**
 * #1737 (ADR-AG-265) — A ROLE NOUN BEFORE A LENGTH KEEPS BOTH, AND A HEIGHT STATED AS A NUMBER IS THE SHAPE'S.
 *
 * 2-D builds «האלכסון AC = 8», «התיכון AM = 5», «הגובה AH הוא 5», «הגובה לצלע BC הוא 4» and «גובה הטרפז 4» (ADR-574,
 * ADR-575), and asks which height «גובה המשולש 4» / «גובה המקבילית הוא 4» mean; analytic answered `not-handled` to
 * every one (measured at `403efe66` through `decideSubmit`). The class: *a length stated with a ROLE noun in front of
 * its segment, or a height stated with no segment at all, had no composition* — each half had a reading, nothing
 * joined them.
 *
 * Every case runs the student's lines through the real submit decision (`decideSubmit`) for the verdict, and through
 * `derive` at several seeds for the DRAWN figure: the role (the midpoint, the perpendicular foot, the diagonal) and the
 * length both hold, and the length lands on the segment the role drew.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

const SEEDS = [0, 1, 2, 3];

/** The verdict of every line, each accepted one recorded as the store records it. */
function submit(lines: readonly string[]): SubmitVerdict[] {
  const kept: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v;
  });
}
/** All lines accepted, and the derivation at `seed`. */
function built(lines: readonly string[], seed: number): Derivation {
  const verdicts = submit(lines);
  verdicts.forEach((v, i) => expect(v.kind, `${lines[i]} → ${JSON.stringify(v)}`).toBe('record'));
  const d = derive(lines, seed);
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
}
const refusal = (lines: readonly string[]): InputError => {
  const v = submit(lines).at(-1)!;
  if (v.kind !== 'refused') throw new Error(`expected a refusal, got ${JSON.stringify(v)}`);
  return v.error;
};
const P = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} (${d.figure.points.map((q) => q.id).join(',')})`);
  return p;
};
const dist = (d: Derivation, a: string, b: string) => Math.hypot(P(d, a).x - P(d, b).x, P(d, a).y - P(d, b).y);
const drawn = (d: Derivation, a: string, b: string) => d.figure.segments.some((s) => [...s.ends].sort().join() === [a, b].sort().join());
/** How far `p` sits off the line `uv`, relative to |uv|. */
const offLine = (d: Derivation, p: string, u: string, v: string) => {
  const [P0, U, V] = [P(d, p), P(d, u), P(d, v)];
  const n = Math.hypot(V.x - U.x, V.y - U.y);
  return Math.abs((P0.x - U.x) * (V.y - U.y) - (P0.y - U.y) * (V.x - U.x)) / (n * n);
};
/** |cos| between the segment ab and the line uv — zero when perpendicular. */
const cosTo = (d: Derivation, a: string, b: string, u: string, v: string) => {
  const [A, B, U, V] = [P(d, a), P(d, b), P(d, u), P(d, v)];
  const ax = B.x - A.x, ay = B.y - A.y, ux = V.x - U.x, uy = V.y - U.y;
  return Math.abs((ax * ux + ay * uy) / (Math.hypot(ax, ay) * Math.hypot(ux, uy)));
};
/** The one point a line's tool named (#1263's ruling, ADR-AG-211). */
const mintedBy = (d: Derivation, index: number): string => {
  const ids = d.minted.filter((m) => m.index === index).map((m) => m.id);
  expect(ids).toHaveLength(1);
  return ids[0];
};
const statedLength = (d: Derivation, a: string, b: string) =>
  d.stated.lengths.find((l) => [l.a, l.b].sort().join() === [a, b].sort().join());

describe('#1737 — a lettered role noun before a length: the role AND the length', () => {
  const DIAGONAL = ['האלכסון AC = 8', 'האלכסון AC הוא 8', 'אורך האלכסון AC הוא 8', 'האלכסון AC שווה ל-8', 'the diagonal AC is 8'];
  for (const shape of ['מקבילית ABCD', 'מלבן ABCD', 'מרובע ABCD']) {
    for (const line of DIAGONAL) {
      it(`${shape} · «${line}» — the diagonal AC drawn, |AC| = 8`, () => {
        for (const seed of SEEDS) {
          const d = built([shape, line], seed);
          expect(dist(d, 'A', 'C')).toBeCloseTo(8, 6);
          expect(drawn(d, 'A', 'C')).toBe(true);
          expect(statedLength(d, 'A', 'C')).toBeTruthy();
        }
      });
    }
  }

  for (const line of ['התיכון AM = 5', 'אורך התיכון AM הוא 5', 'התיכון AM הוא 5', 'התיכון AM 5', 'the median AM is 5']) {
    it(`משולש ABC · «${line}» — M the midpoint of BC, |AM| = 5`, () => {
      for (const seed of SEEDS) {
        const d = built(['משולש ABC', line], seed);
        expect(dist(d, 'B', 'M')).toBeCloseTo(dist(d, 'C', 'M'), 4);
        expect(offLine(d, 'M', 'B', 'C')).toBeLessThan(1e-5);
        expect(dist(d, 'A', 'M')).toBeCloseTo(5, 4);
        expect(drawn(d, 'A', 'M')).toBe(true);
      }
    });
  }

  for (const line of ['הגובה AH הוא 5', 'הגובה AH = 5', 'the altitude AH is 5', 'the height AH is 5']) {
    it(`משולש ABC · «${line}» — H the foot on BC, AH ⟂ BC, |AH| = 5`, () => {
      for (const seed of SEEDS) {
        const d = built(['משולש ABC', line], seed);
        expect(offLine(d, 'H', 'B', 'C')).toBeLessThan(1e-5);
        expect(cosTo(d, 'A', 'H', 'B', 'C')).toBeLessThan(1e-5);
        expect(dist(d, 'A', 'H')).toBeCloseTo(5, 4);
      }
    });
  }

  it('«התיכון AM גדול מ-5» — the median and a BOUND, never |AM| = 5 (#1248)', () => {
    const d = built(['משולש ABC', 'התיכון AM גדול מ-5'], 0);
    expect(d.construction.constraints.some((k) => k.t === 'length-eq')).toBe(false);
    expect(d.construction.selectors.some((s) => s.kind === 'sign')).toBe(true);
    for (const seed of SEEDS) {
      const e = derive(['משולש ABC', 'התיכון AM גדול מ-5'], seed);
      expect(dist(e, 'B', 'M')).toBeCloseTo(dist(e, 'C', 'M'), 4);
      expect(dist(e, 'A', 'M')).toBeGreaterThan(5);
    }
  });

  it('a connective that is neither a copula nor a relation fails closed — «התיכון AM פי 2 מ-AB» stays not understood', () => {
    expect(refusal(['משולש ABC', 'התיכון AM פי 2 מ-AB']).key).toBe('not-handled');
  });
});

describe('#1737 — a cevian named by a phrase keeps its number', () => {
  const CASES: Array<{ lines: string[]; role: 'median' | 'altitude'; apex: string; u: string; v: string; len: number }> = [
    { lines: ['משולש ABC', 'הגובה לצלע BC הוא 4'], role: 'altitude', apex: 'A', u: 'B', v: 'C', len: 4 },
    { lines: ['משולש ABC', 'הגובה לצלע BC 4'], role: 'altitude', apex: 'A', u: 'B', v: 'C', len: 4 },
    { lines: ['משולש ABC', 'הגובה מ-A הוא 4'], role: 'altitude', apex: 'A', u: 'B', v: 'C', len: 4 },
    { lines: ['משולש ABC', 'the height from A to side BC is 4'], role: 'altitude', apex: 'A', u: 'B', v: 'C', len: 4 },
    { lines: ['משולש ABC', 'התיכון מ-A הוא 5'], role: 'median', apex: 'A', u: 'B', v: 'C', len: 5 },
    { lines: ['משולש ABC', 'התיכון לצלע BC הוא 5'], role: 'median', apex: 'A', u: 'B', v: 'C', len: 5 },
    { lines: ['משולש ABC', 'התיכון מ-A במשולש ABC = 5'], role: 'median', apex: 'A', u: 'B', v: 'C', len: 5 },
    { lines: ['משולש ABC', 'זווית A = 90', 'הגובה ליתר הוא 4'], role: 'altitude', apex: 'A', u: 'B', v: 'C', len: 4 },
  ];
  for (const c of CASES) {
    it(`${c.lines.join(' · ')} — the foot the tool names, |${c.apex}·foot| = ${c.len}`, () => {
      for (const seed of SEEDS) {
        const d = built(c.lines, seed);
        const foot = mintedBy(d, c.lines.length - 1);
        expect(offLine(d, foot, c.u, c.v)).toBeLessThan(1e-6);
        if (c.role === 'altitude') expect(cosTo(d, c.apex, foot, c.u, c.v)).toBeLessThan(1e-6);
        else expect(dist(d, c.u, foot)).toBeCloseTo(dist(d, c.v, foot), 6);
        expect(dist(d, c.apex, foot)).toBeCloseTo(c.len, 6);
        expect(drawn(d, c.apex, foot)).toBe(true);
      }
    });
  }
});

describe('#1737 — a height stated as a number: the trapezoid’s is drawn', () => {
  const SPELLINGS = ['גובה הטרפז 4', 'גובה הטרפז הוא 4', 'גובה הטרפז = 4', 'גובה הטרפז שווה ל-4', 'הגובה הוא 4', 'גובה 4', 'the height of the trapezoid is 4'];
  for (const line of SPELLINGS) {
    it(`טרפז ABCD · «${line}» — a height from D onto AB, of length 4, and C is 4 from AB too`, () => {
      for (const seed of SEEDS) {
        const d = built(['טרפז ABCD', line], seed);
        const foot = mintedBy(d, 1);
        expect(offLine(d, foot, 'A', 'B')).toBeLessThan(1e-6);
        expect(cosTo(d, 'D', foot, 'A', 'B')).toBeLessThan(1e-6);
        expect(dist(d, 'D', foot)).toBeCloseTo(4, 6);
        expect(drawn(d, 'D', foot)).toBe(true);
        // the distance between the bases: C's distance from the line AB
        const [A, B, C] = [P(d, 'A'), P(d, 'B'), P(d, 'C')];
        const n = Math.hypot(B.x - A.x, B.y - A.y);
        expect(Math.abs((C.x - A.x) * (B.y - A.y) - (C.y - A.y) * (B.x - A.x)) / n).toBeCloseTo(4, 6);
      }
    });
  }

  it('the stated pair BC ∥ AD moves the bases — the height drops from A onto BC, as 2-D draws it', () => {
    for (const seed of SEEDS) {
      const d = built(['טרפז ABCD', 'BC ∥ AD', 'גובה הטרפז 4'], seed);
      const foot = mintedBy(d, 2);
      expect(offLine(d, foot, 'B', 'C')).toBeLessThan(1e-6);
      expect(cosTo(d, 'A', foot, 'B', 'C')).toBeLessThan(1e-6);
      expect(dist(d, 'A', foot)).toBeCloseTo(4, 6);
    }
  });

  it('«גובה הטרפז ABCD הוא 4» on an empty canvas introduces the trapezoid and its height', () => {
    for (const seed of SEEDS) {
      const d = built(['גובה הטרפז ABCD הוא 4'], seed);
      expect(d.construction.objects.some((o) => o.kind === 'polygon' && o.vertices.join('') === 'ABCD')).toBe(true);
      const foot = mintedBy(d, 0);
      expect(offLine(d, foot, 'A', 'B')).toBeLessThan(1e-6);
      expect(dist(d, 'D', foot)).toBeCloseTo(4, 6);
    }
  });

  it('«גובה הטרפז גדול מ-4» — the height drawn and a bound, never 4', () => {
    const d = built(['טרפז ABCD', 'גובה הטרפז גדול מ-4'], 0);
    expect(d.construction.constraints.some((k) => k.t === 'length-eq')).toBe(false);
    for (const seed of SEEDS) {
      const e = derive(['טרפז ABCD', 'גובה הטרפז גדול מ-4'], seed);
      expect(dist(e, 'D', mintedBy(e, 1))).toBeGreaterThan(4);
    }
  });
});

describe('#1737 — a triangle’s or a parallelogram’s height is ASKED, and every offered sentence builds', () => {
  const ASKS: Array<{ shape: string; line: string; options: string[] }> = [
    { shape: 'משולש ABC', line: 'גובה המשולש 4', options: ['הגובה לצלע BC 4', 'הגובה לצלע AC 4', 'הגובה לצלע AB 4'] },
    { shape: 'משולש ABC', line: 'the height of the triangle is 4', options: ['the height to side BC is 4', 'the height to side AC is 4', 'the height to side AB is 4'] },
    { shape: 'מקבילית ABCD', line: 'גובה המקבילית הוא 4', options: ['הגובה מ-A לצלע CD הוא 4', 'הגובה מ-A לצלע BC הוא 4'] },
    { shape: 'מקבילית ABCD', line: 'גובה המקבילית גדול מ-4', options: ['הגובה מ-A לצלע CD גדול מ-4', 'הגובה מ-A לצלע BC גדול מ-4'] },
  ];
  for (const a of ASKS) {
    it(`${a.shape} · «${a.line}» asks, offering ${a.options.length} sentences`, () => {
      const e = refusal([a.shape, a.line]);
      expect(e.key).toBe('ambiguous-height');
      expect(e.key === 'ambiguous-height' && e.options).toEqual(a.options);
      expect(errorText(e, t)).toBe(`ל«גובה» כאן יש כמה אפשרויות (${a.options.join(', ')}), והבחירה ביניהן היא שלכם — היא לא נובעת מהנתונים. כתבו איזו מהן, למשל «${a.options[0]}».`);
      expect(errorText(e, tEn)).toContain('There is more than one "height" here');
      for (const option of a.options) {
        const v = submit([a.shape, option]);
        expect(v[1].kind, `${option} → ${JSON.stringify(v[1])}`).toBe('record');
      }
    });
  }
});

describe('#1737 — what is refused, in 2-D’s words', () => {
  it('«האלכסון AB = 8» on a parallelogram: AB is a side', () => {
    const e = refusal(['מקבילית ABCD', 'האלכסון AB = 8']);
    expect(e.key).toBe('diagonal-is-side');
    expect(errorText(e, t)).toBe('AB אינו אלכסון של ABCD — הוא צלע שלו. אלכסון מחבר שני קדקודים שאינם סמוכים.');
    expect(errorText(e, tEn)).toBe('AB is not a diagonal of ABCD — it is a side of it. A diagonal joins two corners that are not next to each other.');
  });
  it('«האלכסון AB» with no length — the same claim, the same refusal (2-D refuses it too)', () => {
    expect(refusal(['מקבילית ABCD', 'האלכסון AB']).key).toBe('diagonal-is-side');
  });
  it('«האלכסון AB = 8» on a triangle: a triangle has no diagonals', () => {
    const e = refusal(['משולש ABC', 'האלכסון AB = 8']);
    expect(e.key).toBe('diagonal-none-here');
    expect(errorText(e, t)).toBe('AB אינו אלכסון — ל-ABC אין אלכסונים כלל (כל זוג קדקודים שלו הוא צלע).');
  });
  it('a diagonal with no polygon holding it claims nothing yet — «האלכסון AC = 8» on an empty canvas builds', () => {
    const d = built(['האלכסון AC = 8'], 0);
    expect(dist(d, 'A', 'C')).toBeCloseTo(8, 6);
  });
  it('«גובה הטרפז 4» with no trapezoid: «באיור אין טרפז»', () => {
    const e = refusal(['משולש ABC', 'גובה הטרפז 4']);
    expect(e.key).toBe('shape-not-found');
    expect(errorText(e, t)).toBe('באיור אין טרפז — בדקו את שם הצורה, או הגדירו אותה קודם (למשל «טרפז ABCD»).');
    expect(errorText(e, tEn)).toBe('There is no trapezoid in this figure — check the shape name, or declare it first (e.g. "trapezoid ABCD").');
  });
  it('«AB ∥ CD» on a plain quadrilateral does not make it a trapezoid — shape-not-found, as 2-D', () => {
    expect(refusal(['מרובע ABCD', 'AB ∥ CD', 'גובה הטרפז 4']).key).toBe('shape-not-found');
  });
  it('a rectangle’s height and an unnamed height over two shapes stay not understood, as 2-D', () => {
    expect(refusal(['מלבן ABCD', 'גובה המלבן 4']).key).toBe('not-handled');
    expect(refusal(['טרפז ABCD', 'משולש EFG', 'הגובה הוא 4']).key).toBe('not-handled');
  });
});
