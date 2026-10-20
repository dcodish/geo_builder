/**
 * #2419 ([ADR-AG-323](../../docs/06c-decisions-analytic.md#adr-ag-323)) — A LETTER THAT STANDS FOR A SIZE IS POSITIVE.
 *
 * Operator ruling 2026-10-20: *"r for radius like any letter represending size needs to be positive"*. A circle's radius
 * however it is written (centre + radius, a positive multiple, squared inside its equation) and a length, distance,
 * area or perimeter valued by a letter: the letter is positive, as «שרדיוסו r» already made it. Not a size, and kept:
 * a coordinate, a slope, a squared radius that also places the centre («(x−a)²+y²=a²»), a squared radius declared
 * negative.
 *
 * Every behavioural assertion calls the decision: `decideSubmit`, `derive`, `panelKnowledge`, `errorText`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { panelKnowledge } from '../app/panelRows';
import { paramRegister, sizeLetters } from '../engine/carriers';
import { sampleParam } from '../engine/evaluate';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';
import exam from './fixtures/issue-2388-q2-exam-equations.analytic.json';
import examWording from './fixtures/issue-2391-q2-exam-wording.analytic.json';

type Verdict = { kind: string; line?: string; error?: InputError & { key: string } };
type T = (k: string, o?: Record<string, unknown>) => string;
const t = ((k, o) => (analyticI18n.getFixedT('he') as unknown as T)(k, o).replace(/[⁦-⁩]/g, '')) as T;

function submitAll(lines: readonly string[]): string[] {
  const recorded: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, recorded, 0) as Verdict;
    if (v.kind === 'record') recorded.push(v.line ?? line);
    else throw new Error(`«${line}» → ${v.kind} ${v.error?.key ?? ''}`);
  }
  return recorded;
}
function lastVerdict(lines: readonly string[]): Verdict {
  const recorded = submitAll(lines.slice(0, -1));
  return decideSubmit(lines[lines.length - 1], recorded, 0) as Verdict;
}
const roles = (lines: readonly string[]) => Object.fromEntries(sizeLetters(derive(lines, 0).construction));
const domainOf = (lines: readonly string[], sym: string) => paramRegister(derive(lines, 0).construction).find((p) => p.sym === sym)?.domain;
const SEEDS = Array.from({ length: 12 }, (_, i) => i);

describe('#2419 — sizeLetters reads which letters stand for a size', () => {
  it.each([
    [['נתון מעגל שמשוואתו (x−a)²+y²=r²'], { r: 'even' }],
    [['x²+y²=4r²'], { r: 'even' }],
    [['נתון מעגל II שמשוואתו (x−13)²+y²=R²'], { R: 'even' }],
    [['(x−a)²+y²=a²'], {}],
    [['M(1,2)', 'נתון מעגל M שרדיוסו r'], { r: 'linear' }],
    [['M(1,2)', 'נתון מעגל M שרדיוסו 2r'], { r: 'linear' }],
    [['A(0,0)', 'נקודה B', 'AB = k'], { k: 'linear' }],
    [['A(0,0)', 'נקודה B', 'AB = 2k'], { k: 'linear' }],
    [['A(0,0)', 'B(4,0)', 'נקודה C', 'שטח המשולש ABC הוא k'], { k: 'linear' }],
    [['A(0,0)', 'B(4,0)', 'נקודה C', 'היקף המשולש ABC הוא k'], { k: 'linear' }],
    [['A(0,0)', 'נקודה B', 'AB = k + 1'], {}],
    [['A(0,0)', 'נקודה B', 'נקודה C', 'AB = AC + k'], {}],
    [['M(a,0)'], {}],
    [['y=mx+n'], {}],
  ])('%j → %j', (lines, expected) => {
    expect(roles(lines)).toEqual(expected);
  });
});

describe('#2419 — the role gives the letter its domain', () => {
  it('«x²+y²=r²» · A(3,4) on it: r = 5 is KNOWN (was «r = −5 או 5»)', () => {
    const lines = submitAll(['x²+y²=r²', 'A(3,4)', 'A על המעגל']);
    const k = panelKnowledge(derive(lines, 0)).params.find((p) => p.sym === 'r')!.k;
    expect(k.known).toBe(true);
    expect(k.known && k.value).toBeCloseTo(5, 6);
  });

  it.each([
    [['M(1,2)', 'נתון מעגל M שרדיוסו 2r'], 'r'],
    [['נתון מעגל שמשוואתו (x−1)²+y²=r²'], 'r'],
    [['A(0,0)', 'נקודה B', 'AB = k'], 'k'],
    [['A(0,0)', 'נקודה B', 'אורך AB הוא k'], 'k'],
    [['A(0,0)', 'נקודה B', 'אורך הקטע AB הוא k'], 'k'],
    [['A(0,0)', 'נקודה B', 'המרחק בין A ל-B הוא d'], 'd'],
  ])('%j: «0 < %s», and positive at every seed', (lines, sym) => {
    submitAll(lines);
    expect(domainOf(lines, sym)).toMatchObject({ min: 0, minOpen: true });
    for (const seed of SEEDS) expect(derive(lines, seed).figure.env[sym]).toBeGreaterThan(0);
  });

  it('a letter declared negative and given as a size is refused naming the statement — in BOTH orders', () => {
    const forward = lastVerdict(['a הוא פרמטר', 'a < 0', 'A(0,0)', 'נקודה B', 'AB = a']);
    expect(forward.kind).toBe('refused');
    expect(forward.error?.key).toBe('out-of-domain');
    expect(errorText(forward.error!, t)).toContain('AB = a');
    const reverse = lastVerdict(['A(0,0)', 'נקודה B', 'AB = a', 'a < 0']);
    expect(reverse.error?.key).toBe('out-of-domain');
    expect(errorText(reverse.error!, t)).toContain('a < 0');
    // The radius route has always said exactly this.
    expect(lastVerdict(['a < 0', 'M(1,2)', 'נתון מעגל M שרדיוסו a']).error?.key).toBe('out-of-domain');
  });

  it('GUARD: a squared radius declared negative is accepted (r² contradicts nothing)', () => {
    const lines = submitAll(['a < 0', 'x²+y²=a²']);
    expect(domainOf(lines, 'a')).toMatchObject({ max: 0, maxOpen: true });
    expect(derive(lines, 0).faults).toEqual([]);
  });

  it('GUARD: «(x−a)²+y²=a²» with A(−2,2) on it still draws a = −2 (a places the centre)', () => {
    const lines = submitAll(['(x−a)²+y²=a²', 'A(-2,2)', 'A על המעגל']);
    for (const seed of [0, 1, 2]) expect(derive(lines, seed).figure.env.a).toBeCloseTo(-2, 6);
  });

  it('GUARD: a coordinate and a slope keep both signs across 30 seeds', () => {
    for (const [lines, sym] of [
      [['M(a,0)', 'N(13,0)'], 'a'],
      [['y=mx+n'], 'm'],
      [['y=mx+n'], 'n'],
    ] as const) {
      const vs = Array.from({ length: 30 }, (_, s) => derive(lines, s).figure.env[sym]);
      expect(vs.some((v) => v < 0), `${sym} negative somewhere`).toBe(true);
      expect(vs.some((v) => v > 0), `${sym} positive somewhere`).toBe(true);
    }
  });

  it('«r > 0» after a radius the role already makes positive is «already known», as after «שרדיוסו r»', () => {
    expect(lastVerdict([...exam.lines, 'r > 0']).kind).toBe('already-known');
    expect(lastVerdict(['x²+y²=r²', 'r > 0']).kind).toBe('already-known');
    expect(lastVerdict(['A(0,0)', 'נקודה B', 'AB = k', 'k > 0']).kind).toBe('already-known');
    expect(lastVerdict(['M(1,2)', 'נתון מעגל M שרדיוסו r', 'r > 0']).kind).toBe('already-known');
    // A bound that NARROWS further is a real given.
    expect(lastVerdict(['x²+y²=r²', 'r < 4']).kind).toBe('record');
  });
});

describe('#2419 — stability: the drawn circle does not move', () => {
  it('half-bounded at 0 draws exactly the magnitude the unbounded branch draws (the #2426 interaction lock)', () => {
    for (const reach of [1, 2])
      for (let s = 0; s <= 30; s += 1)
        for (const salt of [1, 2, 3]) expect(sampleParam({ min: 0, minOpen: true }, s, salt, reach)).toBe(Math.abs(sampleParam({}, s, salt, reach)));
  });

  it('«(x−1)²+y²=r²»: the circle drawn at every seed has the radius the unbounded draw gave it', () => {
    const lines = ['נתון מעגל שמשוואתו (x−1)²+y²=r²'];
    for (const seed of SEEDS) {
      const c = derive(lines, seed).figure.curves.find((q) => q.curve.kind === 'circle');
      expect(c?.curve).toMatchObject({ kind: 'circle', cx: expect.closeTo(1, 9), cy: expect.closeTo(0, 9), r: Math.abs(sampleParam({}, seed, 1)) });
    }
  });
});

describe('#2419 — Q2 written as the exam writes it: r = 3, R = 6, one equation each', () => {
  it.each([
    ['#2388 equations', exam],
    ['#2391 exam wording', examWording],
  ])('%s', (_, fx) => {
    expect(submitAll(fx.lines)).toEqual(fx.lines);
    for (const seed of SEEDS) {
      const d = derive(fx.lines, seed);
      expect(d.faults).toEqual([]);
      expect(d.figure.env.r).toBeCloseTo(3, 5);
      expect(d.figure.env.R).toBeCloseTo(6, 5);
    }
    const pk = panelKnowledge(derive(fx.lines, fx.seed));
    for (const [sym, v] of [['r', 3], ['R', 6]] as const) {
      const k = pk.params.find((p) => p.sym === sym)!.k;
      expect(k.known, sym).toBe(true);
      expect(k.known && k.value).toBeCloseTo(v, 5);
    }
  });
});
