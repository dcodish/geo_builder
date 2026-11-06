/**
 * #1772 (ADR-AG-417) — a described line is an operand wherever a line is an operand.
 *
 * «הישר דרך P המאונך ל-AB» was read in one slot: the subject of «חותך», by the through-rule's own tail. `incidenceOn`, the
 * operand reader every other frame shares, had no such line, so the model's two lines for a pasted exam sentence were
 * refused while the sentence builds.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

const PRE = ['A(-2,1)', 'B(10,7)', 'P על הקטע AB', 'AP:PB = 1:2'];
const SEEDS = [0, 1, 2, 3] as const;

const pointOf = (d: Derivation, id: string): number[] => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return [Math.round(p.x * 1e6) / 1e6 + 0, Math.round(p.y * 1e6) / 1e6 + 0];
};
const lands = (line: string, at: number[]) => {
  expect(decideSubmit(line, PRE, 0).kind, line).toBe('record');
  for (const seed of SEEDS) {
    const d = derive([...PRE, line], seed);
    expect(d.faults).toEqual([]);
    expect(pointOf(d, 'C')).toEqual(at);
  }
};

describe('#1772 — the model’s two lines, verbatim', () => {
  it.each(['C היא נקודת החיתוך של הישר דרך P המאונך ל-AB עם הישר y=7', 'הישר y=7 חותך את הישר דרך P המאונך ל-AB בנקודה C'])('%s', (line) => {
    lands(line, [0, 7]);
  });
});

describe('#1772 — the operand-position grid', () => {
  const DESCRIBED = ['הישר דרך P המאונך ל-AB', 'הישר העובר דרך P המאונך ל-AB', 'הישר דרך P מאונך ל-AB', 'הישר העובר דרך הנקודה P מאונך ל-AB', 'הישר המאונך ל-AB דרך P'];
  const FRAMES: ReadonlyArray<(d: string) => string> = [
    (d) => `C נקודת החיתוך של ${d} עם הישר y=7`,
    (d) => `C היא נקודת החיתוך של הישר y=7 עם ${d}`,
    (d) => `C נקודת החיתוך של הישר y=7 ו${d}`,
    (d) => `${d} חותך את הישר y=7 בנקודה C`,
    (d) => `הישר y=7 חותך את ${d} בנקודה C`,
    (d) => `${d} והישר y=7 נפגשים בנקודה C`,
    (d) => `הישר y=7 ו${d} נפגשים בנקודה C`,
  ];
  it.each(DESCRIBED.flatMap((d) => FRAMES.map((f) => [f(d)])))('%s', (line) => {
    lands(line, [0, 7]);
  });

  it.each([
    'C is the intersection of the line through P perpendicular to AB with the line y=7',
    'the line y=7 cuts the line through P perpendicular to AB at C',
    'the line through P perpendicular to AB and the line y=7 meet at C',
  ])('English: %s', (line) => {
    lands(line, [0, 7]);
  });

  it('the parallel, against an axis', () => {
    lands('C נקודת החיתוך של הישר העובר דרך P המקביל ל-AB עם ציר ה-y', [0, 2]);
  });

  it.each(DESCRIBED.map((d) => [`C על ${d}`]).concat([['C is on the line through P perpendicular to AB']]))('a point on it: %s', (line) => {
    expect(decideSubmit(line, PRE, 0).kind).toBe('record');
    const d = derive([...PRE, line], 0);
    const [p, c] = [pointOf(d, 'P'), pointOf(d, 'C')];
    expect((c[0] - p[0]) * 12 + (c[1] - p[1]) * 6).toBeCloseTo(0, 3); // PC ⟂ AB
  });

  it('it is one line: the operand and the sentence build the same object', () => {
    const line = (d: Derivation) => d.construction.objects.filter((o) => o.kind === 'line-at');
    const asSentence = line(derive([...PRE, 'הישר דרך P המאונך ל-AB'], 0));
    const asOperand = line(derive([...PRE, 'הישר y=7 חותך את הישר דרך P המאונך ל-AB בנקודה C'], 0));
    expect(asOperand.map((o) => o.id)).toEqual(asSentence.map((o) => o.id));
    expect(line(derive([...PRE, 'הישר דרך P המאונך ל-AB', 'הישר y=7 חותך את הישר דרך P המאונך ל-AB בנקודה C'], 0))).toHaveLength(1);
  });
});

describe('#1772 — what stays refused', () => {
  it.each<[string, string, string]>([
    ['no relation: a free direction is not a described line', 'C נקודת החיתוך של הישר דרך P עם הישר y=7', 'bad-operand'],
    ['an unknown direction', 'C נקודת החיתוך של הישר דרך P המאונך ל-QR עם הישר y=7', 'unknown-reference'],
    ['one object twice', 'C נקודת החיתוך של הישר דרך P המאונך ל-AB עם הישר דרך P המאונך ל-AB', 'repeated-vertex'],
    ['a line against the line it copies', 'C נקודת החיתוך של הישר דרך P המקביל ל-AB עם הישר AB', 'self-crossing'],
    ['a crossing at its own point', 'P נקודת החיתוך של הישר דרך P המאונך ל-AB עם הישר y=7', 'unsatisfiable'],
  ])('%s', (_why, line, key) => {
    const v = decideSubmit(line, PRE, 0);
    expect(v.kind === 'refused' && v.error.key).toBe(key);
  });

  it('a through-sentence opening with its point is a sentence, not an operand', () => {
    expect(parseLine('C נקודת החיתוך של דרך P עובר ישר המאונך ל-AB עם הישר y=7').ok).toBe(false);
  });

  it('the relation rule keeps every sentence that is a relation', () => {
    expect(decideSubmit('AB מאונך ל-CD', ['A(0,0)', 'B(1,0)', 'C(0,1)', 'D(0,2)'], 0).kind).toBe('record');
    const lost = decideSubmit('מקום כלשהו מאונך ל-AB', PRE, 0);
    expect(lost.kind === 'refused' && lost.error.key).toBe('bad-operand');
  });
});
