/**
 * #2566 ([ADR-AG-412](../../docs/06c-decisions-analytic.md#adr-ag-412)) — an identity asked at the probes reads every letter a student can type.
 *
 * The probe environments were a constant over eight letters, and `evalExpr` answers NaN for a letter its environment
 * lacks, so with any other letter every identity question answered "different". The circle «…=R^2» refused its own
 * centre click, refused its own restatement, and drew a second circle on itself for the spelling «…-R^2=0». The sweep
 * runs each row with letters that were outside the alphabet and with controls that were inside it, through what App
 * drives: the offer list, the popover over the REAL store, and `decideSubmit`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { offersOf } from '../engine/crossings';
import { centrePopoverOps } from '../app/centreName';
import { commitRecord, decideSubmit } from '../app/submit';
import { parseExpr } from '../engine/expr';
import { probeEnvs, probeValue } from '../engine/probes';

const store = () => useAnalyticStore.getState();
const current = () => derive(store().lines, store().seed, store().seedNames);
const state = () => {
  const s = store();
  return { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames, segStyle: s.segStyle };
};
const t = (k: string) => k;

function build(lines: string[]) {
  store().clearAll();
  for (const l of lines) store().recordLine(l);
  useAnalyticStore.temporal.getState().clear();
}

/** What the student types next: the verdict, with the figure the app would hold. */
const submit = (line: string, lines: string[]) => decideSubmit(line, lines, 0, derive(lines, 0));
const stated = (lines: string[]) => derive(lines, 0).figure.curves.filter((c) => c.stated);

const OUTSIDE = ['R', 'c', 's', 'q', 'd', 'h', 'α', 'β'];
const CONTROLS = ['r', 'a', 'k'];
const circle = (L: string) => `(x-13)^2+y^2=${L}^2`;
const given = (L: string) => `נתון מעגל שמשוואתו ${circle(L)}`;

beforeEach(() => build([]));

describe.each([...OUTSIDE, ...CONTROLS])('the letter %s', (L) => {
  it('the + at the centre names it: the click records the offered sentence, at (13, 0)', () => {
    build([given(L)]);
    const offer = offersOf(current().figure, current().construction).find((o) => o.centreOf);
    expect(offer).toBeDefined();
    const ops = centrePopoverOps(offer!.id, state(), { record: (v) => commitRecord(v, store().recordLine, t), applySwap: store().applySwap, setError: store().setError }, current());
    expect(ops.onRename('', 'P')).toEqual({ ok: true });
    expect(store().lines).toEqual([given(L), `P מרכז המעגל ${circle(L)}`]);
    const p = current().figure.points.find((q) => q.id === 'P');
    expect(p?.x).toBeCloseTo(13, 9);
    expect(p?.y).toBeCloseTo(0, 9);
  });

  it('row 1: the same sentence again is already known', () => {
    expect(submit(given(L), [given(L)]).kind).toBe('record');
  });

  it('row 2: «משוואת המעגל היא» with the same equation is already known', () => {
    expect(submit(`משוואת המעגל היא ${circle(L)}`, [given(L)]).kind).toBe('record');
  });

  it('row 3: the centre sentence typed by hand records', () => {
    expect(submit(`M מרכז המעגל ${circle(L)}`, [given(L)]).kind).toBe('record');
  });

  it('row 4: the same circle respelled is already known, and one curve is drawn', () => {
    const respelled = `נתון מעגל שמשוואתו (x-13)^2+y^2-${L}^2=0`;
    expect(submit(respelled, [given(L)]).kind).toBe('record');
    expect(stated([given(L), respelled])).toHaveLength(1);
  });

  it('row 5: a later sentence finds the circle by its equation', () => {
    const crossing = `הישר y = 0 חותך את המעגל ${circle(L)} בנקודות A ו-B`;
    expect(submit(crossing, [given(L)]).kind).toBe('record');
    const lines = [given(L), crossing];
    expect(derive(lines, 0).construction.objects.filter((o) => o.kind === 'curve' && o.curve.kind === 'circle')).toHaveLength(1);
  });

  it('row 6: the equation given to a bare circle, then repeated, is already known', () => {
    const named = `משוואת המעגל היא ${circle(L)}`;
    expect(submit(named, ['נתון מעגל']).kind).toBe('record');
    expect(submit(named, ['נתון מעגל', named]).kind).toBe('record');
  });
});

describe('a letter names one value: two letters stay two curves', () => {
  it.each([
    ['R', 'r'],
    ['c', 's'],
    ['α', 'a'],
    ['β', 'b'],
    ['a', 'r'], // the control: both were in the old alphabet
  ])('…=%s^2 and …=%s^2 are never one circle', (u, v) => {
    // the same circle cannot have the other equation
    expect(submit(`משוואת המעגל היא ${circle(v)}`, [given(u)]).kind).toBe('refused');
    // a second «נתון מעגל» is a second circle, drawn beside the first
    expect(submit(given(v), [given(u)]).kind).toBe('record');
    expect(stated([given(u), given(v)])).toHaveLength(2);
  });
});

/**
 * The other reads that ask at the probes (docs/17: the class, not the reported sentences): each line answers with a
 * letter from outside the old alphabet exactly as it does with its control `k`.
 */
describe.each(['R', 'c', 's', 'α'])('every other read: %s answers as k does', (L) => {
  const twin = (lines: (l: string) => string[], line: (l: string) => string) => {
    const verdict = (l: string) => submit(line(l), lines(l)).kind;
    expect(verdict(L)).toBe(verdict('k'));
  };
  const plain = (l: string) => [`(x-13)^2+y^2=${l}^2`];

  it('a circle given by its bare equation is a circle to «מרכז המעגל»', () => twin(plain, () => 'P מרכז המעגל'));
  it('its radius restated by the letter', () => twin(plain, (l) => `רדיוס המעגל הוא ${l}`));
  it('a point restated with a letter coordinate', () => twin((l) => [`A(${l},1)`], (l) => `A(${l},1)`));
  it('a concentric pair stated by equations', () => twin((l) => [`נתון מעגל שמשוואתו (x-${l})^2+y^2=4`], (l) => `נתון מעגל שמשוואתו (x-${l})^2+y^2=9`));
});

describe('the probe', () => {
  const LETTERS = [...'abcdefghijklmnopqrstuvwzABCDEFGHIJKLMNOPQRSTUVWXYZαβγδεζηθικλμνξορστυφχψω'];

  it('the same name has the same value, in every question', () => {
    const [p0, p1] = probeEnvs(parseExpr('R+c')!, parseExpr('c-1')!);
    expect(p0.c).toBe(probeValue('c', 0));
    expect(p1.c).toBe(probeValue('c', 1));
    expect(probeEnvs(parseExpr('2c+α')!)[0].c).toBe(p0.c);
  });

  it('distinct names have distinct, positive values, and a value moves between the probes', () => {
    for (const i of [0, 1] as const) {
      // the eight settled letters carry round values and m = t = 1.3 at probe 1; the pair of values is what a name is
      const pairs = new Set(LETTERS.map((l) => `${probeValue(l, 0)}|${probeValue(l, 1)}`));
      expect(pairs.size).toBe(LETTERS.length);
      for (const l of LETTERS) expect(probeValue(l, i)).toBeGreaterThan(0);
    }
    for (const l of LETTERS) expect(Math.abs(probeValue(l, 0) - probeValue(l, 1))).toBeGreaterThan(1e-6);
  });

  it('adjacent letters are in no linear relation: R+T and 2S differ', () => {
    const [p0] = probeEnvs(parseExpr('R+S+T')!);
    expect(Math.abs(p0.R + p0.T - 2 * p0.S)).toBeGreaterThan(1e-6);
  });

  it('the eight settled letters keep their values, so every verdict over them stands', () => {
    const values = [...'abkmnprt'].map((l) => [probeValue(l, 0), probeValue(l, 1)]);
    expect(values).toEqual([[1.7, 3.1], [2.3, 1.1], [1.3, 2.9], [0.7, 1.3], [2.1, 0.9], [1.9, 3.3], [1.1, 2.3], [2.7, 1.3]]);
  });

  it('assigns only a letter a student can type: never the plane, a tool symbol or a length placeholder', () => {
    const tool = { kind: 'sym', name: 'r_O' } as const;
    const placeholder = { kind: 'sym', name: String.fromCharCode(0xe000) } as const;
    const [env] = probeEnvs(parseExpr('x+y+R')!, tool, placeholder);
    expect(Object.keys(env)).toEqual(['R']);
  });
});
