/**
 * #1963 — AN OBJECT THAT CAN EXIST IN NO CONFIGURATION IS REFUSED, WHATEVER ELSE IS FREE (ADR-AG-296).
 *
 * Two arms of `derive`'s vacancy pass, one sentence each:
 *
 * 1. THE EXACT ARM — the third and last instance of #1929's gate. The vacancy refusal (`does-not-exist`, #1058) waited
 *    for the WHOLE figure to reach 0 DOF, so «נקודה Q» typed first silenced «מעגל שעובר דרך A, B ו-C» on three pinned
 *    collinear points: named, drawn nowhere, nothing said. It now asks the freedom of what the object is BUILT FROM
 *    (`inputsOf` read through `Figure.freedomOfRead`), so an unrelated freedom cancels out.
 * 2. THE PROVED ARM — operator ruling 2026-10-14 (card `d14b-1963-proved` A): *"Refuse only when it is certain the
 *    circle can never exist (here: D was stated on AB), naming that statement. No refusal on search evidence alone."*
 *    `forcedCollinear` proves the three points collinear from the construction alone, and the line that completes the
 *    proof is refused in 2-D's «X» סותר את «Y» frame, naming the other statements.
 *
 * Every row is driven line by line through `decideSubmit`, as the app submits, and rendered through `errorText`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { inputsOf } from '../engine/carriers';
import { forcedCollinear } from '../engine/collinear';
import { EMPTY_CONSTRUCTION, type Construction } from '../engine/types';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Submits each line as the app does; the first refusal (its line index and error), or null when all record. */
const play = (seq: readonly string[]) => {
  const lines: string[] = [];
  for (const [i, l] of seq.entries()) {
    const r = decideSubmit(l, lines, 0);
    if (r.kind === 'refused') return { at: i, error: r.error };
    lines.push(l);
  }
  return null;
};

const PINNED = ['A(0,0)', 'B(1,1)', 'C(2,2)'];
const CIRCLE = 'מעגל שעובר דרך A, B ו-C';

describe('#1963 exact arm — nothing the object is built from can move', () => {
  it('the reference: the four lines alone are refused does-not-exist on the circle line', () => {
    const r = play([...PINNED, CIRCLE]);
    expect(r).toMatchObject({ at: 3, error: { key: 'does-not-exist', detail: CIRCLE, existing: 'circle-thru' } });
  });

  const FREE: Array<[string, string[]]> = [
    ['a free point', ['נקודה Q']],
    ['a free triangle', ['משולש PQR']],
    ['a free circle', ['מעגל O']],
    ['a coordinate written as a parameter', ['G(t,1)']],
  ];

  it.each(FREE)('%s typed FIRST: the same refusal, not a silent vacancy', (_w, extra) => {
    const seq = [...extra, ...PINNED, CIRCLE];
    const d = derive(seq);
    // The evidence: the figure really is free, and the circle's own inputs really are not.
    expect(d.figure.carrierDof).toBeGreaterThan(0);
    expect(d.faults).toEqual([{ index: seq.length - 1, code: 'does-not-exist', detail: CIRCLE, existing: 'circle-thru' }]);
    expect(play(seq)).toMatchObject({ at: seq.length - 1, error: { key: 'does-not-exist', detail: CIRCLE } });
  });

  it('the free thing typed in the MIDDLE (after the points, before the circle): the same refusal', () => {
    expect(play([...PINNED, 'נקודה Q', CIRCLE])).toMatchObject({ at: 4, error: { key: 'does-not-exist', detail: CIRCLE } });
  });

  it('through a midpoint input: refused the same way', () => {
    const seq = ['משולש PQR', ...PINNED, 'M אמצע AB', 'מעגל שעובר דרך A, M ו-B'];
    // A, M, B are pinned and collinear; whichever arm speaks, the line is refused and the circle never vanishes silently.
    expect(play(seq)).toMatchObject({ at: 5, error: { detail: 'מעגל שעובר דרך A, M ו-B' } });
  });

  it('the refusal text is the existing sentence', () => {
    const r = play(['נקודה Q', ...PINNED, CIRCLE]);
    expect(errorText(r!.error, he)).toContain('"מעגל שעובר דרך A, B ו-C"');
    expect(errorText(r!.error, he)).toBe(errorText(play([...PINNED, CIRCLE])!.error, he));
  });

  it('inputsOf reads the circle’s three points and no symbol', () => {
    const d = derive(['נקודה Q', ...PINNED, CIRCLE]);
    expect(inputsOf(d.construction, 'circle-thru-ABC')).toEqual({ points: ['A', 'B', 'C'], syms: [] });
  });

  it('control: A(k,0) makes the inputs free — silent while absent, as ADR-AG-008 rules', () => {
    expect(play(['A(k,0)', 'B(1,1)', 'C(2,2)', CIRCLE])).toBeNull();
  });

  it('control: the #1937 diagonals row still draws P', () => {
    const seq = ['נקודה Q', 'A(0,0)', 'B(4,0)', 'C(1,1)', 'D(0,4)', 'מרובע ABCD', 'P מפגש האלכסונים במרובע ABCD'];
    expect(play(seq)).toBeNull();
    expect(derive(seq).figure.points.find((p) => p.id === 'P')).toMatchObject({ x: 2, y: 2 });
  });
});

describe('#1963 proved arm — a statement puts the three points on one line', () => {
  const heText = (detail: string, declared: string, points: string) =>
    `לא ניתן: «${detail}» סותר את «${declared}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${points} על ישר אחד, ואין מעגל שעובר דרך שלוש נקודות על ישר אחד.`;

  const ROWS: Array<[string, string[], string, string]> = [
    ['D on the segment AB', ['משולש ABC', 'D על AB', 'מעגל שעובר דרך A, D ו-B'], 'D על AB', 'A, D ו-B'],
    ['D on the line AB', ['משולש ABC', 'D על הישר AB', 'מעגל שעובר דרך A, D ו-B'], 'D על הישר AB', 'A, D ו-B'],
    ['D on the extension of AB', ['משולש ABC', 'D על המשך AB', 'מעגל שעובר דרך A, D ו-B'], 'D על המשך AB', 'A, D ו-B'],
    ['M the midpoint of AB', ['משולש ABC', 'M אמצע AB', 'מעגל שעובר דרך A, M ו-B'], 'M אמצע AB', 'A, M ו-B'],
    ['the letters reordered', ['משולש ABC', 'D על AB', 'מעגל שעובר דרך D, A ו-B'], 'D על AB', 'D, A ו-B'],
    ['two points on AB', ['משולש ABC', 'D על AB', 'E על AB', 'מעגל שעובר דרך A, D ו-E'], 'D על AB» ו-«E על AB', 'A, D ו-E'],
    ['three points on a named line', ['l: y=2x+1', 'A על l', 'B על l', 'C על l', CIRCLE], 'A על l», «B על l» ו-«C על l', 'A, B ו-C'],
  ];

  it.each(ROWS)('%s: refused on the circle line, naming the statement', (_w, seq, declared, points) => {
    const r = play(seq);
    const circle = seq[seq.length - 1];
    expect(r).toMatchObject({ at: seq.length - 1, error: { key: 'forced-collinear', detail: circle } });
    expect(errorText(r!.error, he)).toBe(heText(circle, declared, points));
  });

  it.each(ROWS)('%s, with «נקודה Q» first: the same refusal', (_w, seq, declared, points) => {
    const r = play(['נקודה Q', ...seq]);
    const circle = seq[seq.length - 1];
    expect(r).toMatchObject({ at: seq.length, error: { key: 'forced-collinear', detail: circle } });
    expect(errorText(r!.error, he)).toBe(heText(circle, declared, points));
  });

  it('the English sentence', () => {
    const r = play(['משולש ABC', 'D על AB', 'מעגל שעובר דרך A, D ו-B']);
    expect(errorText(r!.error, en)).toBe(
      "Can't do that: «מעגל שעובר דרך A, D ו-B» contradicts «D על AB» — they can't both hold. " +
        'The reason: A, D and B lie on one line, and no circle passes through three points on one line.',
    );
  });

  it('the circle first, the incidence last: the INCIDENCE line is refused, naming the circle line', () => {
    const seq = ['משולש ABC', 'נקודה D', 'מעגל שעובר דרך A, D ו-B', 'D על AB'];
    const r = play(seq);
    expect(r).toMatchObject({ at: 3, error: { key: 'forced-collinear', detail: 'D על AB' } });
    expect(errorText(r!.error, he)).toBe(heText('D על AB', 'מעגל שעובר דרך A, D ו-B', 'A, D ו-B'));
  });

  it('control: D on AC — the circle through A, D, B records and is drawn', () => {
    const seq = ['משולש ABC', 'D על AC', 'מעגל שעובר דרך A, D ו-B'];
    expect(play(seq)).toBeNull();
    expect(derive(seq).figure.curves.some((c) => c.id === 'circle-thru-ABD')).toBe(true);
  });

  it('control: D on AB and E on BC — not proved collinear, records and is drawn', () => {
    const seq = ['משולש ABC', 'D על AB', 'E על BC', 'מעגל שעובר דרך A, D ו-E'];
    expect(play(seq)).toBeNull();
    expect(derive(seq).figure.curves.some((c) => c.id === 'circle-thru-ADE')).toBe(true);
  });

  it('unchanged: a polygon over a stated-collinear triple keeps its polygon-collapsed refusal', () => {
    expect(play(['משולש ABC', 'D על AB', 'משולש ADB'])).toMatchObject({ at: 2, error: { key: 'polygon-collapsed' } });
  });

  it('the fixture: its last line is refused, naming «D על AB»', () => {
    const fx = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'issue-1963-circle-through-collinear.analytic.json'), 'utf8')) as {
      lines: string[];
    };
    const r = play(fx.lines);
    expect(r).toMatchObject({ at: fx.lines.length - 1, error: { key: 'forced-collinear', declaredLines: ['D על AB'] } });
    expect(play(fx.lines.slice(0, -1))).toBeNull();
  });
});

describe('forcedCollinear — the proof, on hand-built constructions', () => {
  const pts = (...ids: string[]) => ids.map((id) => ({ kind: 'free' as const, id }));
  const C = (objects: unknown[], constraints: unknown[]): Construction =>
    ({ ...EMPTY_CONSTRUCTION, objects, constraints }) as unknown as Construction;

  it('an on-line-2pt incidence proves its point and the two ends', () => {
    const c = C(pts('A', 'B', 'D'), [{ t: 'on-line-2pt', id: 'D', a: 'A', b: 'B' }]);
    expect(forcedCollinear(c, ['A', 'D', 'B'])).toEqual({ carrier: 'pts:A,B', by: [{ k: 'constraint', at: 0 }] });
  });

  it('a midpoint object proves', () => {
    const c = C([...pts('A', 'B'), { kind: 'derived', id: 'M', rule: { t: 'midpoint', a: 'A', b: 'B' } }], []);
    expect(forcedCollinear(c, ['A', 'B', 'M'])).toEqual({ carrier: 'pts:A,B', by: [{ k: 'object', id: 'M' }] });
  });

  it('three points on one numeric line (an axis) prove', () => {
    const on = (id: string) => ({ t: 'on-line', id, a: 0, b: 2, c: 0 });
    const c = C(pts('A', 'B', 'C'), [on('A'), on('B'), on('C')]);
    expect(forcedCollinear(c, ['A', 'B', 'C'])?.carrier).toBe('eq:0,1,0');
  });

  it('two different carriers do not', () => {
    const c = C(pts('A', 'B', 'C', 'D', 'E'), [
      { t: 'on-line-2pt', id: 'D', a: 'A', b: 'B' },
      { t: 'on-line-2pt', id: 'E', a: 'B', b: 'C' },
    ]);
    expect(forcedCollinear(c, ['A', 'D', 'E'])).toBeNull();
  });

  it('a centroid proves nothing', () => {
    const c = C([...pts('A', 'B', 'C'), { kind: 'derived', id: 'G', rule: { t: 'centroid', v: ['A', 'B', 'C'] } }], []);
    expect(forcedCollinear(c, ['A', 'B', 'G'])).toBeNull();
  });

  it('a choice proves nothing; an all proves its members', () => {
    const k = { t: 'on-line-2pt', id: 'D', a: 'A', b: 'B' };
    expect(forcedCollinear(C(pts('A', 'B', 'D'), [{ t: 'choice', options: [k] }]), ['A', 'B', 'D'])).toBeNull();
    expect(forcedCollinear(C(pts('A', 'B', 'D'), [{ t: 'all', of: [k] }]), ['A', 'B', 'D'])).not.toBeNull();
  });
});
