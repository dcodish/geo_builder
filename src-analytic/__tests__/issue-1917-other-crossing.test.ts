/**
 * #1917 ([ADR-AG-263](../../docs/06c-decisions-analytic.md#adr-ag-263)) — A CROSSING TAKES THE ROOT NO
 * EARLIER POINT HOLDS.
 *
 * «x^2+y^2=25 · A(3,4) · P(0,0) · AP חותך את המעגל בנקודה E»: the line through the centre meets the circle
 * twice, A holds one crossing and E is the other — and it was refused «הישרים האלה נפגשים ב-A, ולנקודה
 * הזאת כבר יש שם…» at three of six configurations, and at every configuration on the parabola. The
 * refusal was FALSE: the second root exists.
 *
 * Operator ruling, 2026-10-08 (the `/decisions` pass, as found work): approve, P2, *"the line records,
 * with E at the line's second crossing with the curve"*. 2-D has drawn it this way since
 * [ADR-045](../../docs/06-decisions.md#adr-045) R8 (`otherCrossing`).
 *
 * The cause was the START, not the verdict: a crossing of a pair one of whose roots is a point the figure
 * already has was seeded wherever its letter hashed, the descent landed on that point, and on a fixed
 * figure [ADR-AG-254](../../docs/06c-decisions-analytic.md#adr-ag-254)'s arm then called the coincidence
 * forced. The fix seeds the crossing on the root no EARLIER point holds — a start, never a verdict.
 *
 * ⚠ THE COUNTER-DIRECTION IS THE WHOLE RISK and it is locked below: a refusal that is TRUE must stay. A
 * segment that reaches the curve only at the named point, a chord whose both roots are named, and a
 * tangency have no other admissible root, so today's verdict is untouched.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

const SEEDS = [0, 1, 2, 3, 4, 5];

type Built =
  | { ok: true; at: (id: string) => { x: number; y: number } | undefined; faults: unknown[]; notices: number }
  | { ok: false; line: string; key?: string; holder?: string };

/** The REAL app door: every line through `decideSubmit`, recorded as the student's Enter records it. */
function build(lines: readonly string[], seed: number): Built {
  const acc: string[] = [];
  let notices = 0;
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as {
      kind: string;
      line?: string;
      notice?: unknown;
      error?: { key?: string; holder?: string };
    };
    if (v.kind !== 'record') return { ok: false, line, key: v.error?.key, holder: v.error?.holder };
    if (v.notice) notices += 1;
    acc.push(v.line ?? line);
  }
  const d = derive(acc, seed);
  return { ok: true, at: (id) => d.figure.points.find((p) => p.id === id), faults: d.faults, notices };
}

const expectPoint = (lines: readonly string[], seed: number, id: string, x: number, y: number) => {
  const b = build(lines, seed);
  if (!b.ok) throw new Error(`refused at «${b.line}» (${b.key}${b.holder ? '/' + b.holder : ''})`);
  expect(b.faults).toEqual([]);
  expect(b.notices).toBe(0);
  const p = b.at(id);
  expect(p, `${id} missing`).toBeDefined();
  expect(Math.hypot(p!.x - x, p!.y - y)).toBeLessThan(1e-6);
};

const CIRCLE = ['x^2+y^2=25', 'A(3,4)'];
const PARABOLA = ['y^2=4x', 'A(1,2)'];

describe('#1917 (a) — the operator’s own sequences record at the second crossing', () => {
  it.each(SEEDS)('the circle through its centre, seed %i', (seed) => {
    expectPoint([...CIRCLE, 'P(0,0)', 'AP חותך את המעגל בנקודה E'], seed, 'E', -3, -4);
  });

  it.each(SEEDS)('the parabola with P(10,0), seed %i', (seed) => {
    expectPoint([...PARABOLA, 'P(10,0)', 'AP חותך את הפרבולה בנקודה E'], seed, 'E', 100, -20);
  });

  it.each(SEEDS)('the parabola with P(7,0), seed %i', (seed) => {
    expectPoint([...PARABOLA, 'P(7,0)', 'AP חותך את הפרבולה בנקודה E'], seed, 'E', 49, -14);
  });
});

describe('#1917 (b) — every spelling of that sentence reaches the same root', () => {
  const rows: Array<[string, string[], number, number]> = [
    ['«הישר AP»', [...CIRCLE, 'P(0,0)', 'הישר AP חותך את המעגל בנקודה E'], -3, -4],
    ['the letters reversed, «PA»', [...CIRCLE, 'P(0,0)', 'PA חותך את המעגל בנקודה E'], -3, -4],
    ['the centre named, «AO»', [...CIRCLE, 'O(0,0)', 'AO חותך את המעגל בנקודה E'], -3, -4],
    ['«החיתוך האחרת»', [...CIRCLE, 'P(0,0)', 'E נקודת החיתוך האחרת של הישר AP עם המעגל'], -3, -4],
    ['the crossing NOUN', [...CIRCLE, 'P(0,0)', 'E נקודת החיתוך של הישר AP עם המעגל'], -3, -4],
    ['two sentences, «הישר AP»', [...CIRCLE, 'P(0,0)', 'E על הישר AP', 'E על המעגל'], -3, -4],
    ['P inside the circle, P(1,1)', [...CIRCLE, 'P(1,1)', 'AP חותך את המעגל בנקודה E'], -2.538461538, -4.307692308],
    ['P inside the circle, P(2,2)', [...CIRCLE, 'P(2,2)', 'AP חותך את המעגל בנקודה E'], -1.4, -4.8],
    ['the parabola with P(6,0)', [...PARABOLA, 'P(6,0)', 'AP חותך את הפרבולה בנקודה E'], 36, -12],
    [
      'the parabola, crossing NOUN',
      [...PARABOLA, 'P(10,0)', 'E נקודת החיתוך של הישר AP עם הפרבולה'],
      100,
      -20,
    ],
    [
      'a line given by its EQUATION, the sentence',
      [...CIRCLE, 'נתון הישר l1: y=x+1', 'הישר l1 חותך את המעגל בנקודה E'],
      -4,
      -3,
    ],
    [
      'a line given by its EQUATION, the noun',
      [...CIRCLE, 'נתון הישר l1: y=x+1', 'E נקודת החיתוך של הישר l1 עם המעגל'],
      -4,
      -3,
    ],
  ];
  it.each(rows)('%s', (_name, lines, x, y) => {
    for (const seed of SEEDS) expectPoint(lines as string[], seed, 'E', x as number, y as number);
  });
});

describe('#1917 (c) — a refusal that is TRUE stays refused', () => {
  /**
   * The SEGMENT reaches the circle only at A: P is the centre, so the other root is past P and is not on
   * the piece the student named. #1254's ruling (ADR-AG-125) is untouched here.
   */
  it.each(SEEDS)('«הקטע AP חותך את המעגל» — the other root is off the piece, seed %i', (seed) => {
    const b = build([...CIRCLE, 'P(0,0)', 'הקטע AP חותך את המעגל בנקודה E'], seed);
    expect(b).toMatchObject({ ok: false, key: 'crossing-already-named', holder: 'A' });
  });

  /**
   * A BARE PAIR is the segment, as in 2-D ([ADR-AG-248](../../docs/06c-decisions-analytic.md#adr-ag-248),
   * #1892) — so «E על AP» names the same piece as «E על הקטע AP» and its refusal is true too. #1917's plan
   * listed this spelling among those that should record; it was measured before ADR-AG-248 landed, when a
   * bare pair was still the LINE. The line spelling is locked in (b) above.
   */
  it.each(SEEDS)('«E על AP · E על המעגל» — a bare pair is the segment, seed %i', (seed) => {
    const b = build([...CIRCLE, 'P(0,0)', 'E על AP', 'E על המעגל'], seed);
    expect(b).toMatchObject({ ok: false, key: 'crossing-already-named', holder: 'A' });
  });

  /** A CHORD whose both roots are named: nothing is left for E, whichever arm is live. */
  it.each(SEEDS)('«AC חותך את המעגל» with A and C both on it, seed %i', (seed) => {
    const b = build([...CIRCLE, 'C(-3,4)', 'AC חותך את המעגל בנקודה E'], seed);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(['crossing-already-named', 'third-crossing']).toContain(b.key);
  });
});

describe('#1917 (d) — the controls keep the crossing they already had', () => {
  const rows: Array<[string, string[], number, number]> = [
    ['the circle with P outside, P(10,0)', [...CIRCLE, 'P(10,0)', 'AP חותך את המעגל בנקודה E'], 1.923076923, 4.615384615],
    ['the circle with P(-1,-1)', [...CIRCLE, 'P(-1,-1)', 'AP חותך את המעגל בנקודה E'], -3.243902439, -3.804878049],
    ['the parabola with P(4,0)', [...PARABOLA, 'P(4,0)', 'AP חותך את הפרבולה בנקודה E'], 16, -8],
    ['the parabola with P(5,0)', [...PARABOLA, 'P(5,0)', 'AP חותך את הפרבולה בנקודה E'], 25, -10],
    ['«המשך AP»', [...CIRCLE, 'P(0,0)', 'המשך AP חותך את המעגל בנקודה E'], -3, -4],
  ];
  it.each(rows)('%s', (_name, lines, x, y) => {
    for (const seed of SEEDS) expectPoint(lines as string[], seed, 'E', x as number, y as number);
  });

  /**
   * A FREE figure still has both roots to choose from, so the start is left alone and «הציגו תצורה אחרת»
   * cycles: the block acts only when a root was DROPPED as taken.
   */
  it('a free circle keeps more than one configuration', () => {
    const lines = ['מעגל O', 'A על מעגל O', 'נקודה P', 'AP חותך את מעגל O בנקודה E'];
    const seen = new Set<string>();
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const b = build(lines, seed);
      expect(b.ok).toBe(true);
      if (b.ok) {
        expect(b.faults).toEqual([]);
        const p = b.at('E')!;
        seen.add(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
