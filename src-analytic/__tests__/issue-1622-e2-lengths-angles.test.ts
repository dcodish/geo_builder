/**
 * #1622 E2 (ADR-AG-218) — 2-D parity for lengths, angles, crossings and cevians; congruent/similar triangles as GIVENS;
 * segment products; a LETTER in a length is a free length («AB = 3a») — except x and y, which analytic refuses as a length
 * (operator ruling 2026-10-03 on #1622, ADR-AG-222's amendment: they are the plane's coordinates).
 *
 * Every lock CALLS the real path — `decideSubmit` for the verdict, `derive` for the figure — and asserts geometry,
 * never the facts a rule happens to emit. The verdicts beside 2-D's are in the shared parity rows.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { panelKnowledge } from '../app/panelRows';
import { parseLine } from '../parser/parseAnalytic';
import { exprText } from '../engine/expr';

const SEEDS = [0, 1, 2, 3, 4, 5];

/** Submit every line through the real decision; returns each verdict kind (+ the refusal key). */
function play(lines: readonly string[]): string[] {
  const kept: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
}

type P = { x: number; y: number };
const pts = (lines: readonly string[], seed: number): Record<string, P> => {
  const d = derive(lines, seed);
  expect(d.faults, `faults at seed ${seed}`).toEqual([]);
  return Object.fromEntries(d.figure.points.map((p) => [p.id, { x: p.x, y: p.y }]));
};
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (v: P, a: P, b: P) => {
  const c = ((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (dist(v, a) * dist(v, b));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};
const cross = (u: P, v: P, w: P) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);

describe('#1622 E2 — congruent and similar triangles are GIVENS (X10–X13 ported)', () => {
  it.each(['△ABC ≅ △DEF', 'משולש ABC חופף למשולש DEF', 'המשולשים ABC ו-DEF חופפים', 'triangle ABC is congruent to triangle DEF'])(
    '«%s» builds both triangles with corresponding sides equal (SSS), at every seed',
    (line) => {
      expect(play([line])).toEqual(['record']);
      for (const seed of SEEDS) {
        const p = pts([line], seed);
        expect(dist(p.D, p.E)).toBeCloseTo(dist(p.A, p.B), 4);
        expect(dist(p.E, p.F)).toBeCloseTo(dist(p.B, p.C), 4);
        expect(dist(p.F, p.D)).toBeCloseTo(dist(p.C, p.A), 4);
      }
    },
  );

  it.each(['△ABC ~ △DEF', 'ABC ~ DEF', 'המשולשים ABC ו-DEF דומים', 'משולש ABC דומה למשולש DEF', 'triangles ABC and DEF are similar'])(
    '«%s» builds two triangles with corresponding angles equal (AA)',
    (line) => {
      expect(play([line])).toEqual(['record']);
      for (const seed of SEEDS) {
        const p = pts([line], seed);
        expect(angle(p.D, p.E, p.F)).toBeCloseTo(angle(p.A, p.B, p.C), 3);
        expect(angle(p.E, p.D, p.F)).toBeCloseTo(angle(p.B, p.A, p.C), 3);
      }
    },
  );

  it('on two triangles already drawn the statement constrains them, never redraws them', () => {
    expect(play(['משולש ABC', 'משולש DEF', '△ABC ≅ △DEF'])).toEqual(['record', 'record', 'record']);
  });

  it.each(['הוכיחו ש-△ABC ≅ △DEF', 'הוכיחו כי המשולשים ABC ו-DEF דומים', 'הוכח כי המשולשים ABC ו-DEF חופפים'])(
    'the PROOF TARGET «%s» is refused — what to prove is never a given (#1666)',
    (line) => expect(play(['משולש ABC', 'משולש DEF', line]).at(-1)).toBe('refused:proof-target'),
  );
});

describe('#1622 E2 — a segment product (X13)', () => {
  it('«AB·AC = AD²» holds on the figure, and a later length pins the rest of it', () => {
    const lines = ['משולש ABC', 'D על BC', 'AB·AC = AD²', 'AB = 4'];
    expect(play(lines)).toEqual(['record', 'record', 'record', 'record']);
    for (const seed of SEEDS) {
      const p = pts(lines, seed);
      expect(dist(p.A, p.B) * dist(p.A, p.C)).toBeCloseTo(dist(p.A, p.D) ** 2, 3);
    }
  });
});

describe('#1622 E2 — a letter in a length; x and y refused (operator ruling 2026-10-03, ADR-AG-222)', () => {
  it('«AB = 3a» builds with a a FREE length, sampled per seed, and «AB = 6» pins it to 2', () => {
    expect(play(['משולש ABC', 'AB = 3a'])).toEqual(['record', 'record']);
    expect(Object.keys(derive(['משולש ABC', 'AB = 3a'], 0).figure.env)).toEqual(['a']);
    // a free magnitude moves with the seed (ADR-052)
    const sampled = new Set(SEEDS.map((seed) => derive(['משולש ABC', 'AB = 3a'], seed).figure.env.a.toFixed(3)));
    expect(sampled.size).toBeGreaterThan(1);
    const pinned = derive(['משולש ABC', 'AB = 3a', 'AB = 6'], 0);
    const row = panelKnowledge(pinned).params.find((r) => r.sym === 'a')!;
    expect(row.k.known && row.k.value).toBeCloseTo(2, 6);
  });

  it('one letter relates two lengths: «AB = 3k», «AC = 2k» keep AB:AC = 3:2', () => {
    const lines = ['משולש ABC', 'AB = 3k', 'AC = 2k'];
    for (const seed of SEEDS) {
      const p = pts(lines, seed);
      expect(dist(p.A, p.B) / dist(p.A, p.C)).toBeCloseTo(1.5, 4);
    }
  });

  it.each(['AB = 3x', 'AB = AC = 3x', 'AB = 2y', 'AB = x²', 'AD = 12√x', 'אורך AB הוא 3x', 'AB = 3x + 1'])(
    "«%s» is REFUSED with the teaching message — x and y are the plane's coordinates here",
    (line) => expect(play(['משולש ABC', line])).toEqual(['record', 'refused:length-xy']),
  );

  it('the refusal quotes the whole line the student typed, a chain included', () => {
    const v = decideSubmit('AB = AC = 3x', ['משולש ABC'], 0);
    expect(v.kind === 'refused' && v.error.key === 'length-xy' && v.error.detail).toBe('AB = AC = 3x');
  });

  it('the plane is untouched: «y = 2x + 1» is still the line, and no x/y symbol is ever a parameter of a length', () => {
    const lines = ['משולש ABC', 'AB = 3a', 'y = 2x + 1'];
    expect(play(lines)).toEqual(['record', 'record', 'record']);
    const d = derive(lines, 0);
    expect(d.figure.curves.some((c) => c.curve.kind === 'line')).toBe(true);
    expect(Object.keys(d.figure.env)).toEqual(['a']);
  });

  it("a measure beside the plane's letter still declines (#1496): «side AB is y=x-4», «AB = AC + x», an AREA «… הוא y»", () => {
    expect(play(['משולש ABC', 'side AB is y=x-4']).at(-1)).toBe('refused:not-handled');
    expect(play(['משולש ABC', 'AB = AC + x']).at(-1)).toBe('refused:not-handled');
    expect(parseLine('שטח המשולש ABC הוא y').ok).toBe(false);
  });

  it('a parameter is its own letter (the withdrawn length variable left no second symbol): «x > 0» parses as a domain for x — which the fold refuses (#1832, ADR-AG-246)', () => {
    const p = parseLine('x > 0');
    expect(p.ok && p.facts[0].t === 'param' && p.facts[0].sym).toBe('x');
    expect(exprText({ kind: 'mul', a: { kind: 'num', value: 3 }, b: { kind: 'sym', name: 'a' } })).toBe('3·a');
  });
});

describe('#1622 E2 — chained equalities', () => {
  it('«AB = AC = 3a»: both equal, both over the letter', () => {
    for (const seed of SEEDS) {
      const p = pts(['משולש ABC', 'AB = AC = 3a', 'BC = 4'], seed);
      expect(dist(p.A, p.B)).toBeCloseTo(dist(p.A, p.C), 4);
    }
  });

  it('«זוית AEB שווה לזווית BEC שווה 60 מעלות» on an empty canvas: both angles 60°', () => {
    const line = 'זוית AEB שווה לזווית BEC שווה 60 מעלות';
    expect(play([line])).toEqual(['record']);
    for (const seed of SEEDS) {
      const p = pts([line], seed);
      expect(angle(p.E, p.A, p.B)).toBeCloseTo(60, 3);
      expect(angle(p.E, p.B, p.C)).toBeCloseTo(60, 3);
    }
  });

  it('the English chain reads too', () => expect(play(['angle AEB equals angle BEC equals 60 degrees'])).toEqual(['record']));
});

// Lowered by E1 (ADR-AG-217); locked here as the sentences of this row family (cat-2d-026/027).
describe('#1622 E2 — a point placed by its distances', () => {
  it('«C במרחק 5 מ-A ו-5 מ-B»', () => {
    for (const seed of SEEDS) {
      const p = pts(['משולש ABC', 'C במרחק 5 מ-A ו-5 מ-B'], seed);
      expect(dist(p.C, p.A)).toBeCloseTo(5, 4);
      expect(dist(p.C, p.B)).toBeCloseTo(5, 4);
    }
  });

  it('«D על AB במרחק 3 מ-A» — on the side, 3 from A', () => {
    for (const seed of SEEDS) {
      const p = pts(['משולש ABC', 'D על AB במרחק 3 מ-A'], seed);
      expect(dist(p.A, p.D)).toBeCloseTo(3, 4);
      expect(Math.abs(cross(p.A, p.B, p.D)) / dist(p.A, p.B)).toBeLessThan(1e-4);
      expect(dist(p.A, p.D) + dist(p.D, p.B)).toBeCloseTo(dist(p.A, p.B), 4);
    }
  });

  it('2-D reads only its forms: a single «D במרחק 3 מ-A» is not read here either', () =>
    expect(play(['משולש ABC', 'D במרחק 3 מ-A']).at(-1)).toBe('refused:not-handled'));
});

describe('#1622 E2 — segments that cross and one that bisects', () => {
  const crosses = (p: Record<string, P>, a: string, b: string, c: string, d: string) =>
    Math.sign(cross(p[a], p[b], p[c])) !== Math.sign(cross(p[a], p[b], p[d])) &&
    Math.sign(cross(p[c], p[d], p[a])) !== Math.sign(cross(p[c], p[d], p[b]));

  it.each([
    [['CD חותך את AB'], 'C', 'D', 'A', 'B'],
    [['הקטעים AB ו-CD נחתכים'], 'A', 'B', 'C', 'D'],
    [['מרובע ABCD', 'AC ו-BD נחתכים'], 'A', 'C', 'B', 'D'],
  ])('%j — the segments cross at every seed, and no letter is invented', (lines, a, b, c, d) => {
    expect(play(lines).every((v) => v === 'record')).toBe(true);
    for (const seed of SEEDS) {
      const p = pts(lines, seed);
      expect(Object.keys(p).sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(crosses(p, a, b, c, d)).toBe(true);
    }
  });

  it('«CD חוצה את AB»: M (the tool\'s letter) is the midpoint of AB, on CD between C and D', () => {
    for (const seed of SEEDS) {
      const p = pts(['CD חוצה את AB'], seed);
      expect(p.M.x).toBeCloseTo((p.A.x + p.B.x) / 2, 6);
      expect(dist(p.C, p.M) + dist(p.M, p.D)).toBeCloseTo(dist(p.C, p.D), 4);
    }
    expect(Object.keys(pts(['CD חוצה את AB בנקודה K'], 0))).toContain('K');
  });
});

describe('#1622 E2 — angles', () => {
  it('«הזווית בין BD ל-BA היא 30» is ∠DBA', () => {
    for (const seed of SEEDS) expect(angle(...(['B', 'D', 'A'].map((id) => pts(['מרובע ABCD', 'הזווית בין BD ל-BA היא 30'], seed)[id]) as [P, P, P]))).toBeCloseTo(30, 3);
  });

  it('sides with no common end form no angle — refused on the sentence, as 2-D refuses it', () =>
    expect(play(['מרובע ABCD', 'הזווית בין BD ל-CA היא 30']).at(-1)).toBe('refused:bad-operand'));

  it.each([
    ['זווית ABC שווה לשלושים מעלות', 30],
    ['זווית ABC היא ארבעים וחמש מעלות', 45],
    ['angle ABC equals thirty degrees', 30],
  ])('a value in WORDS: «%s» → %i°', (line, deg) => {
    const p = pts(['משולש ABC', line], 0);
    expect(angle(p.B, p.A, p.C)).toBeCloseTo(deg, 3);
  });

  it('«A = 40» is the angle at A in a shape; asks on a free point; is not understood with no point A (#1432 am. 1)', () => {
    const p = pts(['משולש ABC', 'A = 40'], 0);
    expect(angle(p.A, p.B, p.C)).toBeCloseTo(40, 3);
    expect(play(['נקודה A', 'A = 40']).at(-1)).toBe('refused:ambiguous-angle');
    expect(play(['נתון מעגל O', 'R=5']).at(-1)).toBe('refused:not-handled');
    expect(play(['משולש ABC', 'AB = 3a', 'x = 4']).at(-1)).toBe('record'); // lowercase: the line, never an angle
  });
});

describe('#1622 E2 — lines, and labels', () => {
  it('«ישר ABE»: E on AB beyond B, in the named order', () => {
    for (const seed of SEEDS) {
      const p = pts(['משולש ABC', 'ישר ABE'], seed);
      expect(Math.abs(cross(p.A, p.B, p.E)) / dist(p.A, p.B)).toBeLessThan(1e-4);
      expect(dist(p.A, p.B) + dist(p.B, p.E)).toBeCloseTo(dist(p.A, p.E), 4);
    }
  });

  it('«קו ועליו נקודה A» (E1 lowering, ADR-AG-217): A rides a line the tool draws between its own letters, as 2-D does', () => {
    const d = derive(['קו ועליו נקודה A'], 0);
    expect(d.faults).toEqual([]);
    const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
    expect(Object.keys(p).sort()).toEqual(['A', 'B', 'C']);
    expect(Math.abs(cross(p.B, p.C, p.A)) / dist(p.B, p.C)).toBeLessThan(1e-4);
  });

  it('«נסמן את שטח ABCD ב-S»: a free value S, known once the figure pins the area', () => {
    expect(play(['מרובע ABCD', 'נסמן את שטח ABCD ב-S'])).toEqual(['record', 'record']);
    const d = derive(['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)', 'מרובע ABCD', 'נסמן את שטח ABCD ב-S'], 0);
    const row = panelKnowledge(d).params.find((r) => r.sym === 'S')!;
    expect(row.k.known && row.k.value).toBeCloseTo(12, 6);
  });

  it('«טרפז ABCD», «המרחק בין AB לבין CD הוא 3»: AB ∥ CD, 3 apart (was refused unsatisfiable)', () => {
    for (const seed of SEEDS) {
      const p = pts(['טרפז ABCD', 'המרחק בין AB לבין CD הוא 3'], seed);
      expect(Math.abs(cross(p.A, p.B, p.C)) / dist(p.A, p.B)).toBeCloseTo(3, 4);
      expect(Math.abs(cross(p.A, p.B, p.D)) / dist(p.A, p.B)).toBeCloseTo(3, 4);
    }
  });
});
