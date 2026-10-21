/**
 * #2432 ([ADR-AG-318](../../docs/06c-decisions-analytic.md#adr-ag-318)) — an equation written as an operand is resolved
 * against the figure at M1 (`equationOperand`), never minted by the parser and referred to by an id.
 *
 * Measured before (main 17168818, through `decideSubmit`): «נתון הישר l: 3x+4y=25» · «משוואת המשיק היא 3x+4y=25» was
 * refused `unknown-reference curve-anonex0oaz` — an internal id shown to the student — because the `tangent-eq` arm
 * minted a stated curve, the twin scan absorbed it into l, and the tangency then named the absorbed id. The tangency
 * readers («הישר <eq> משיק …», «… משיק לישר <eq> …», «משוואת המשיק למעגל בנקודה A היא <eq>») minted a second, hidden
 * carrier beside l and held the tangency against it.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
const t = analyticI18n.getFixedT('he') as unknown as T;
const tEn = analyticI18n.getFixedT('en') as unknown as T;

function verdicts(lines: readonly string[]): string[] {
  const held: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, held, 0);
    if (v.kind === 'record') held.push(l);
    return v.kind;
  });
}
const lineObjects = (lines: readonly string[]) =>
  derive(lines, 0).construction.objects.flatMap((o) => (o.kind === 'curve' && o.curve.kind !== 'circle' ? [o] : []));
const circleR = (lines: readonly string[], seed = 0) => {
  const c = derive(lines, seed).figure.curves.find((k) => k.curve.kind === 'circle')!.curve;
  return c.kind === 'circle' ? c.r : NaN;
};

const FIXED = 'נתון מעגל שמרכזו M(0,0) ורדיוסו 5';
const FREE = 'נתון מעגל שמרכזו M(0,0) ורדיוסו r';
const L = 'נתון הישר l: 3x+4y=25';

describe('#2432 — «משוואת המשיק היא <eq>» of an existing line means that line', () => {
  it('the reported two lines: no refusal, no internal id — the tangency already holds (r = 5 is the distance)', () => {
    expect(verdicts([FIXED, L, 'משוואת המשיק היא 3x+4y=25'])).toEqual(['record', 'record', 'already-follows']);
  });
  for (const [lang, sentence] of [['he', 'משוואת המשיק היא 3x+4y=25'], ['en', 'the equation of the tangent is 3x+4y=25'], ['he', 'משוואת המשיק היא 6x+8y=50']] as const) {
    it(`${lang}: «${sentence}» on a free radius is a given about l — r = 5 at every seed, and l stays the one line`, () => {
      const lines = [FREE, L, sentence];
      expect(verdicts(lines)).toEqual(['record', 'record', 'record']);
      expect(derive(lines, 0).faults).toEqual([]);
      for (const seed of [0, 1, 2, 3]) expect(circleR(lines, seed), `seed ${seed}`).toBeCloseTo(5, 6);
      expect(lineObjects(lines).map((o) => o.id)).toEqual(['line-l']);
    });
  }
  it('with no line in the figure the sentence states its line, drawn (unchanged)', () => {
    const lines = [FREE, 'משוואת המשיק היא 3x+4y=25'];
    expect(verdicts(lines)).toEqual(['record', 'record']);
    const drawn = derive(lines, 0).figure.curves.filter((k) => k.stated && k.curve.kind === 'line');
    expect(drawn).toHaveLength(1);
    expect(circleR(lines)).toBeCloseTo(5, 6);
  });
});

describe('#2432 — the tangency readers resolve their equation operand at M1', () => {
  const rows = [
    ['he', 'הישר 3x+4y=25 משיק למעגל M'],
    ['he', 'המעגל M משיק לישר 3x+4y=25'],
    ['en', 'the line 3x+4y=25 is tangent to the circle M'],
  ] as const;
  for (const [lang, sentence] of rows) {
    it(`${lang}: «${sentence}» after l is about l — one line object, r = 5`, () => {
      const lines = [FREE, L, sentence];
      expect(verdicts(lines)).toEqual(['record', 'record', 'record']);
      expect(lineObjects(lines).map((o) => o.id)).toEqual(['line-l']);
      expect(circleR(lines)).toBeCloseTo(5, 6);
    });
  }
  it('«משוואת המשיק למעגל בנקודה A היא 3x+4y=25» after l: the tangent at A is l, A = (3, 4)', () => {
    const lines = [FIXED, L, 'משוואת המשיק למעגל בנקודה A היא 3x+4y=25'];
    expect(verdicts(lines)).toEqual(['record', 'record', 'record']);
    expect(lineObjects(lines).map((o) => o.id)).toEqual(['line-l']);
    const a = derive(lines, 0).figure.points.find((p) => p.id === 'A')!;
    expect(a.x).toBeCloseTo(3, 6);
    expect(a.y).toBeCloseTo(4, 6);
  });
  it('with no such line the tangency mints its line under the content id (drawn since #2425, ADR-AG-319)', () => {
    const lines = [FREE, 'הישר 3x+4y=25 משיק למעגל M'];
    expect(verdicts(lines)).toEqual(['record', 'record']);
    expect(lineObjects(lines)).toHaveLength(1);
  });
  it('«A על הישר 3x+4y=25» then a tangency on that equation: the same object, one line', () => {
    const lines = [FREE, 'A על הישר 3x+4y=25', 'הישר 3x+4y=25 משיק למעגל M'];
    expect(verdicts(lines)).toEqual(['record', 'record', 'record']);
    expect(lineObjects(lines)).toHaveLength(1);
    // The carrier role «A על …» gives (ADR-AG-032) stands on its own line: undrawn until the tangency states it.
    expect(lineObjects(lines.slice(0, 2))[0].stated).toBe(false);
  });
});

describe('#2432 — no refusal ever shows an internal curve id', () => {
  const setups = [[FIXED, L], [FREE, L], [FIXED, 'נתון ישר 3x+4y=25'], [FIXED, 'A(3,4)', 'A על הישר 3x+4y=25'], [FIXED]];
  const sentences = [
    'משוואת המשיק היא 3x+4y=25',
    'משוואת המשיק היא 6x+8y=50',
    'the equation of the tangent is 3x+4y=25',
    'משוואת המשיק למעגל בנקודה A היא 3x+4y=25',
    'הישר 3x+4y=25 משיק למעגל M',
    'המעגל M משיק לישר 3x+4y=25',
    'משוואת המשיק היא x^2+y^2=4',
    'הישר 3x+4y=7 משיק למעגל M',
  ];
  for (const setup of setups) {
    for (const s of sentences) {
      it(`${setup.join(' · ')} · «${s}»`, () => {
        const v = decideSubmit(s, setup, 0);
        if (v.kind !== 'refused') return;
        for (const tr of [t, tEn]) expect(errorText(v.error, tr)).not.toMatch(/curve-|anon/);
        expect(JSON.stringify(v.error)).not.toMatch(/curve-anon/);
      });
    }
  }
});
