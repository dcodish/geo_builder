/**
 * «מפגש» IS «נקודת החיתוך» (#1609, ADR-AG-230).
 *
 * Two prod students (log-triage 2026-09-30, sessions e5k11473 and iltebh4m) typed «A מפגש הישרים 1 ו-2»
 * after stating both lines, and got nothing — the deterministic lane said `not-handled` and the model was
 * rejected too — while «A נקודת החיתוך של הישרים 1 ו-2» built. The meeting noun was read only as the
 * head of a concurrency ROLE («M מפגש התיכונים במשולש ABC»); now a tail that is not a role is the crossing
 * sentence, through the one crossing rule.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

const DIGIT_LINES = ['נתון הישר 1: 2x-y+8=0', 'משוואת ישר 2 היא x+3y-10=0'];
const NAMED_LINES = ['נתון הישר l1: 2x-y+8=0', 'משוואת ישר l2 היא x+3y-10=0'];

/** The two lines cross at (-2, 4). */
function crossingOf(prefix: readonly string[], line: string) {
  const d = derive([...prefix, line], 0);
  const a = d.figure.points.find((q) => q.id === 'A');
  return { faults: d.faults.map((f) => f.code), at: a ? [Number(a.x.toFixed(6)), Number(a.y.toFixed(6))] : null };
}

describe('#1609 — the prod session, through the real submit decision', () => {
  it('«A מפגש הישרים 1 ו-2» records, and A is the crossing (-2, 4)', () => {
    const lines: string[] = [];
    for (const l of [...DIGIT_LINES, 'A מפגש הישרים 1 ו-2']) {
      const v = decideSubmit(l, lines, 0);
      expect(v.kind, l).toBe('record');
      if (v.kind === 'record') lines.push(v.line);
    }
    expect(crossingOf(DIGIT_LINES, 'A מפגש הישרים 1 ו-2')).toEqual({ faults: [], at: [-2, 4] });
  });
});

describe('#1609 — every head × every operand form reads as the canonical crossing', () => {
  const HEADS = ['מפגש', 'נקודת המפגש של', 'נקודת המפגש', 'היא נקודת המפגש של', 'נקודת החיתוך של'];
  const OPERANDS: Array<[readonly string[], string]> = [
    [DIGIT_LINES, 'הישרים 1 ו-2'],
    [DIGIT_LINES, 'הישר 1 עם הישר 2'],
    [DIGIT_LINES, 'הישר 1 והישר 2'],
    [NAMED_LINES, 'הישרים l1 ו-l2'],
    [NAMED_LINES, 'l1 ו-l2'],
    [NAMED_LINES, 'הישר l1 עם הישר l2'],
    [NAMED_LINES, 'הישרים'],
  ];
  for (const [prefix, operands] of OPERANDS) {
    it.each(HEADS)(`«A %s ${operands}» builds A at (-2, 4)`, (head) => {
      expect(crossingOf(prefix, `A ${head} ${operands}`)).toEqual({ faults: [], at: [-2, 4] });
    });
  }

  it('the meeting spelling lowers to exactly the canonical sentence’s facts', () => {
    const strip = (r: ReturnType<typeof parseLine>) => (r.ok ? r.facts.map(({ src: _src, ...f }) => f) : r);
    expect(strip(parseLine('A מפגש הישרים l1 ו-l2'))).toEqual(strip(parseLine('A נקודת החיתוך של הישרים l1 ו-l2')));
    expect(strip(parseLine('A is the meeting point of lines l1 and l2'))).toEqual(
      strip(parseLine('A is the intersection of lines l1 and l2')),
    );
  });

  it('a circle operand and an ordinal ride along: «A נקודת המפגש הראשונה של הישר l1 עם המעגל I»', () => {
    const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
    const L = 'נתון הישר l1: y=4';
    const strip = (r: ReturnType<typeof parseLine>) => (r.ok ? r.facts.map(({ src: _src, ...f }) => f) : r);
    expect(strip(parseLine('A נקודת המפגש הראשונה של הישר l1 עם המעגל I'))).toEqual(
      strip(parseLine('A נקודת החיתוך הראשונה של הישר l1 עם המעגל I')),
    );
    const d = derive([CIRCLE, L, 'A מפגש הישר l1 עם המעגל I'], 0);
    expect(d.faults).toEqual([]);
    const a = d.figure.points.find((q) => q.id === 'A')!;
    expect(Math.hypot(a.x - 3, a.y - 4)).toBeCloseTo(3, 4);
  });
});

describe('#1609 — the concurrency roles keep «מפגש», unchanged', () => {
  it.each([
    ['M מפגש התיכונים במשולש ABC', 'centroid'],
    ['H מפגש הגבהים במשולש ABC', 'orthocentre'],
    ['G מפגש האלכסונים במרובע ABCD', 'diagonals'],
  ])('«%s» is still the %s', (line, rule) => {
    const r = parseLine(line);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const derived = r.facts.find((f) => f.t === 'derived') as { rule: { t: string } } | undefined;
    expect(derived?.rule.t).toBe(rule);
  });

  it('a miscounted role is still the role’s own refusal, not a crossing', () => {
    const r = parseLine('M מפגש התיכונים במרובע ABCD');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad-arity');
  });

  it('a meeting of nothing readable is still not-handled — the model’s, not a guess', () => {
    const r = parseLine('A מפגש הדרכים');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-handled');
  });
});
