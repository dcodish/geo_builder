/**
 * #2553 ([ADR-AG-337](../../docs/06c-decisions-analytic.md#adr-ag-337)) — A COMMON TANGENT THE SENTENCE DOES NOT LETTER.
 *
 * Operator, 2026-10-25 (prod analytic, «שאלה 6, משיק משותף לשני מעגלים שווים»): *"[it] didnt deal with the משיק חיצוני"*.
 * Measured at d9494206 through `decideSubmit`, no model: «משיק חיצוני משותף לשני המעגלים», «משיק משותף חיצוני למעגלים
 * O_1 ו-O_2» and «הישר l משיק משותף חיצוני לשני המעגלים» were not-handled (2-D builds the first two, lettering the touches
 * A, B); the exam's own definition «משיק משותף ששני המעגלים נמצאים באותו צד שלו» and the touch-point noun «P נקודת
 * ההשקה של l2 עם מעגל O_1» were read by neither builder.
 *
 * The class: a common-tangent sentence that does not letter its touches (or names its line instead, or writes its kind
 * as a definition) was not lowered to the common tangent ADR-AG-313 already draws. Every case below is the SAME
 * `common-tangent` fact — no new geometry. The model is never called: `decideSubmit` is the deterministic lane.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive, type Derivation } from '../engine/derive';
import { foldTangentSide } from '../parser/frameAnalytic';
import external from './fixtures/exam-2553-q6-external-tangent.analytic.json';
import sameSide from './fixtures/exam-2553-q6-same-side.analytic.json';
import touches from './fixtures/exam-2553-q6-touch-points.analytic.json';

type Pt = { id: string; x: number; y: number };
type Verdict = { kind: string; line?: string; error?: { key?: string; code?: string } };

function record(lines: readonly string[], seed = 0): { ok: true; d: Derivation } | { ok: false; line: string; kind: string; key?: string } {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as Verdict;
    if (v.kind !== 'record') return { ok: false, line, kind: v.kind, key: v.error?.key ?? v.error?.code };
    acc.push(v.line ?? line);
  }
  return { ok: true, d: derive(acc, seed) };
}
function built(lines: readonly string[], seed = 0): Derivation {
  const r = record(lines, seed);
  if (!r.ok) throw new Error(`«${r.line}»: ${r.kind} (${r.key})`);
  expect(r.d.faults).toEqual([]);
  return r.d;
}
const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const at = (d: Derivation, id: string): [number, number] => {
  const p = (d.figure.points as Pt[]).find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return [round(p!.x), round(p!.y)];
};
const ids = (d: Derivation) => (d.figure.points as Pt[]).map((p) => p.id).sort();
const answer = (d: Derivation, q: string) => ask(d, q, (v) => String(round(v))).value;

/** The exam's circles: O₁(−3,1), O₂(9,10), both radius 5, and the centre segment — the operator's prefix. */
const EXAM = ['O_1(-3,1)', 'O_2(9,10)', 'מעגל O_1 שרדיוסו 5', 'מעגל O_2 שרדיוסו 5', 'O_1O_2'];
/** The two external tangents: y = ¾x − 3 (touches (0,−3), (12,6)) and y = ¾x + 9.5 (touches (−6,5), (6,14)). */
const EXT = [[[0, -3], [12, 6]], [[-6, 5], [6, 14]]].map((pq) => JSON.stringify(pq));
/** Are both centres on the same side of the line through a and b? */
function centresSameSide(d: Derivation, a: string, b: string, c1: string, c2: string): boolean {
  const [A, B, P, Q] = [at(d, a), at(d, b), at(d, c1), at(d, c2)];
  const side = (p: [number, number]) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
  return side(P) * side(Q) > 0;
}
const SEEDS = [0, 1, 2, 3, 4, 5];

describe('#2553 — the saved exam (שאלה 6 ב–ד) builds and verifies', () => {
  it('the operator’s «משיק חיצוני משותף לשני המעגלים», then the y-crossing below: the exam’s tangent y = ¾x − 3, A(0,−3), B(12,6)', () => {
    const d = built(external.lines, external.seed);
    expect([at(d, 'A'), at(d, 'B')]).toEqual([[0, -3], [12, 6]]);
    expect(ids(d)).toEqual(['A', 'B', 'O₁', 'O₂']);
  });

  it('the exam’s definition «משיק משותף ששני המעגלים נמצאים באותו צד שלו» is the same tangent', () => {
    const d = built(sameSide.lines, sameSide.seed);
    expect([at(d, 'A'), at(d, 'B')]).toEqual([[0, -3], [12, 6]]);
  });

  it('«כל המשיקים המשותפים …», then «P / Q נקודת ההשקה של l2 עם מעגל …»: P(0,−3) on O₁, Q(12,6) on O₂, and l2 is 3x − 4y − 12 = 0', () => {
    const d = built(touches.lines, touches.seed);
    expect([at(d, 'P'), at(d, 'Q')]).toEqual([[0, -3], [12, 6]]);
    expect(answer(d, 'משוואת הישר l2')).toBe('3x - 4y - 12 = 0');
  });
});

describe('#2553 — every unlettered spelling draws a common tangent of the stated kind, touches lettered A, B', () => {
  const external = [
    'משיק חיצוני משותף לשני המעגלים',
    'משיק משותף חיצוני לשני המעגלים',
    'משיק משותף חיצוני למעגלים O_1 ו-O_2',
    'המשיק המשותף החיצוני לשני המעגלים',
    'משיק חיצוני לשני המעגלים',
    'משיק משותף ששני המעגלים נמצאים באותו צד שלו',
    'משיק משותף שהמעגלים O_1 ו-O_2 נמצאים באותו צד שלו',
    'an external common tangent of the two circles',
    'a common tangent with both circles on the same side of it',
  ];
  it.each(external)('«%s» — an external tangent at every seed', (line) => {
    for (const seed of SEEDS) {
      const d = built([...EXAM, line], seed);
      expect(EXT, `seed ${seed}`).toContain(JSON.stringify([at(d, 'A'), at(d, 'B')]));
      expect(centresSameSide(d, 'A', 'B', 'O₁', 'O₂')).toBe(true);
    }
  });

  const internal = ['משיק פנימי משותף לשני המעגלים', 'משיק משותף אלכסוני לשני המעגלים', 'משיק משותף ששני המעגלים נמצאים מצדדים שונים שלו'];
  it.each(internal)('«%s» — an internal tangent: the centres on opposite sides', (line) => {
    for (const seed of SEEDS) expect(centresSameSide(built([...EXAM, line], seed), 'A', 'B', 'O₁', 'O₂'), `seed ${seed}`).toBe(false);
  });

  it('with no kind, «המשיק המשותף לשני המעגלים» is one of the four (a free choice, ADR-052)', () => {
    const d = built([...EXAM, 'המשיק המשותף לשני המעגלים']);
    expect(ids(d)).toEqual(['A', 'B', 'O₁', 'O₂']);
  });

  it('a second «משיק חיצוני משותף …» is the other external tangent, C and D, as in 2-D', () => {
    for (const seed of SEEDS) {
      const d = built([...EXAM, 'משיק חיצוני משותף לשני המעגלים', 'משיק חיצוני משותף לשני המעגלים'], seed);
      expect(new Set([JSON.stringify([at(d, 'A'), at(d, 'B')]), JSON.stringify([at(d, 'C'), at(d, 'D')])]), `seed ${seed}`).toEqual(new Set(EXT));
    }
  });

  it('beside the student’s letters the tool takes the next free ones', () => {
    const d = built(['מעגל O', 'מעגל P', 'A על מעגל O', 'משיק חיצוני משותף לשני המעגלים']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'O', 'P']);
  });
});

describe('#2553 — «הישר l משיק משותף חיצוני …» is that tangent, its line named l', () => {
  it('named l, and «הישר l חותך את ציר ה-y מתחת לציר ה-x» keeps the exam’s line', () => {
    for (const seed of SEEDS) {
      const d = built([...EXAM, 'הישר l משיק משותף חיצוני לשני המעגלים', 'הישר l חותך את ציר ה-y מתחת לציר ה-x'], seed);
      expect(answer(d, 'משוואת הישר l'), `seed ${seed}`).toBe('3x - 4y - 12 = 0');
    }
  });

  it('the «בהתאמה» form carries its kind: «הישר l משיק משותף חיצוני למעגלים O_1 ו-O_2 בנקודות P ו-Q בהתאמה»', () => {
    for (const seed of SEEDS) {
      const d = built([...EXAM, 'הישר l משיק משותף חיצוני למעגלים O_1 ו-O_2 בנקודות P ו-Q בהתאמה'], seed);
      expect(centresSameSide(d, 'P', 'Q', 'O₁', 'O₂'), `seed ${seed}`).toBe(true);
    }
  });

  it('English: "the line l is an external common tangent of the two circles"', () => {
    const d = built([...EXAM, 'the line l is an external common tangent of the two circles', 'הישר l חותך את ציר ה-y מתחת לציר ה-x']);
    expect(answer(d, 'משוואת הישר l')).toBe('3x - 4y - 12 = 0');
  });
});

describe('#2553 — «P נקודת ההשקה של l2 עם מעגל O_1» names the touch point of a drawn tangent', () => {
  const ALL = [...EXAM, 'כל המשיקים המשותפים לשני המעגלים'];
  const spellings = [
    'P נקודת ההשקה של l2 עם מעגל O_1',
    'P היא נקודת ההשקה של הישר l2 עם המעגל O_1',
    'P נקודת המגע של l2 ומעגל O_1',
    'נקודת ההשקה של l2 עם מעגל O_1 היא P',
    'P is the point of tangency of l2 with circle O_1',
  ];
  it.each(spellings)('«%s» — P(0,−3), at every seed', (line) => {
    for (const seed of SEEDS) expect(at(built([...ALL, line], seed), 'P'), `seed ${seed}`).toEqual([0, -3]);
  });

  it('REFUSAL: a line the figure does not have is refused naming it (unknown-reference), as «l2 משיק למעגל O_1 בנקודה P» is', () => {
    expect(record([...EXAM, 'P נקודת ההשקה של l2 עם מעגל O_1'])).toMatchObject({ ok: false, kind: 'refused', key: 'unknown-reference' });
    expect(record([...EXAM, 'l2 משיק למעגל O_1 בנקודה P'])).toMatchObject({ ok: false, kind: 'refused', key: 'unknown-reference' });
  });

  it('REFUSAL: a touch the figure already letters is not given a second letter (the tangency’s own refusal)', () => {
    const r = record([...EXAM, 'משיק חיצוני משותף לשני המעגלים', 'P נקודת ההשקה של AB עם מעגל O_1']);
    expect(r).toMatchObject({ ok: false, kind: 'refused' });
  });
});

describe('#2553 — controls: what was read before is read the same', () => {
  it('«PQ משיק משותף חיצוני לשני המעגלים» keeps the student’s letters', () => {
    expect(ids(built([...EXAM, 'PQ משיק משותף חיצוני לשני המעגלים']))).toEqual(['O₁', 'O₂', 'P', 'Q']);
  });
  it('«הישר l משיק לשני המעגלים» (no «משותף», no kind) is still not this sentence', () => {
    expect(record([...EXAM, 'הישר l משיק לשני המעגלים'])).toMatchObject({ ok: false });
  });
  it('the fold reads only the tangent’s own clause', () => {
    expect(foldTangentSide('משיק משותף ששני המעגלים נמצאים באותו צד שלו')).toBe('משיק משותף חיצוני לשני המעגלים');
    expect(foldTangentSide('AB משיק משותף שהמעגלים O ו-P נמצאים מצדדים שונים שלו')).toBe('AB משיק משותף פנימי למעגלים O ו-P');
    expect(foldTangentSide('A ו-B נמצאים באותו צד שלו')).toBe('A ו-B נמצאים באותו צד שלו');
    expect(foldTangentSide('שני המעגלים נמצאים באותו צד של הישר')).toBe('שני המעגלים נמצאים באותו צד של הישר');
  });
});
