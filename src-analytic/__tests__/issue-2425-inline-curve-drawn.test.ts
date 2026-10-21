/**
 * #2425 ([ADR-AG-319](../../docs/06c-decisions-analytic.md#adr-ag-319)) — a curve given inline by its equation, in a
 * sentence ABOUT that curve, is drawn; a drawn line the student did not name takes the next free l-number.
 *
 * Operator, round #2414 T27: *"the line should have been drawn with dof"*; T14: *"i want the line to also be drawn and
 * named with l1 or l2 or whatever number is free"*; ruling 2026-10-20 Q1–Q4 yes; #2423's ruling: «P על הישר <eq>» stays
 * undrawn. Measured before (main 17168818 + #2431/#2432): every row below that asserts a drawn curve drew none (the
 * curve was minted `stated: false`), and «נתון ישר 4x+3y+2=0» drew an unnamed line.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { panelKnowledge, panelListsCurve, paramRows } from '../app/panelRows';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import t27 from './fixtures/issue-2425-t27-common-tangent.analytic.json';

function verdicts(lines: readonly string[]): string[] {
  const held: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, held, 0);
    if (v.kind === 'record') held.push(l);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
}
const lines = (ls: readonly string[], seed = 0) => derive(ls, seed).figure.curves.filter((c) => c.curve.kind === 'line');
const drawn = (ls: readonly string[], seed = 0) => lines(ls, seed).filter((c) => c.stated);
const names = (ls: readonly string[], seed = 0) => drawn(ls, seed).map((c) => c.label.name);

describe('#2425 — T27: the common tangent mx−y+n=0 is drawn, with its freedom', () => {
  const upTo7 = t27.lines.slice(0, 7);
  it('every fixture line records and the figure builds green', () => {
    expect(verdicts(t27.lines)).toEqual(t27.lines.map(() => 'record'));
    expect(derive(t27.lines, 0).faults).toEqual([]);
  });
  it('after «הישר mx-y+n=0 משיק למעגל M» the line is drawn, named l1, and moves with the seed (m is a free DOF)', () => {
    const ms = new Set<number>();
    for (const seed of [0, 1, 2, 3]) {
      expect(names(upTo7, seed), `seed ${seed}`).toEqual(['l1']);
      ms.add(Number(derive(upTo7, seed).figure.env.m.toFixed(6)));
    }
    expect(ms.size).toBeGreaterThan(1);
  });
  it('after «… משיק למעגל N» the common tangent is drawn, and the seed cycles its two positions', () => {
    const signs = new Set<number>();
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(names(t27.lines, seed), `seed ${seed}`).toEqual(['l1']);
      signs.add(Math.sign(derive(t27.lines, seed).figure.env.m));
    }
    expect([...signs].sort()).toEqual([-1, 1]);
  });
  it('the #2394 paired row is unchanged', () => {
    const d = derive(t27.lines, 0);
    const rows = paramRows(d, panelKnowledge(d), fmtAnalytic, { checking: 'בודק…', unused: 'לא בשימוש' }).map((r) => r.text);
    const paired = d.figure.env.m > 0 ? '(m, n) = (-√2/4, -5√2/4) או [(√2/4, 5√2/4)]' : '(m, n) = [(-√2/4, -5√2/4)] או (√2/4, 5√2/4)';
    expect(rows).toEqual(['a = 4', 'r = 3', paired]);
  });
  it('stability: drawing the line moves no circle — a, r, M and N are the values before it', () => {
    for (const seed of [0, 1, 2]) {
      const before = derive(t27.lines.slice(0, 6), seed).figure;
      const after = derive(upTo7, seed).figure;
      // Determined values, equal to the solver's resolution.
      expect(after.env.a).toBeCloseTo(before.env.a, 6);
      expect(after.env.r).toBeCloseTo(before.env.r, 6);
      for (const id of ['M', 'N']) {
        const [p, q] = [before.points.find((x) => x.id === id)!, after.points.find((x) => x.id === id)!];
        expect(q.x).toBeCloseTo(p.x, 6);
        expect(q.y).toBeCloseTo(p.y, 6);
      }
    }
  });
});

describe('#2425 — T14: the tangency line is drawn and named with the next free number', () => {
  const T14 = 'מעגל שמרכזו M(8,−3) משיק לישר 4x+3y+2=0 בנקודה A';
  it('on an empty figure: l1, with its «משוואות» row', () => {
    expect(verdicts([T14])).toEqual(['record']);
    expect(names([T14])).toEqual(['l1']);
    const d = derive([T14], 0);
    expect(ask(d, 'משוואת l1', fmtAnalytic).value).toBe('4x + 3y + 2 = 0');
    expect(ask(d, 'A', fmtAnalytic).value).toBe('(4, -6)');
    expect(d.figure.curves.filter((c) => c.curve.kind === 'line').every(panelListsCurve)).toBe(true);
  });
  it('after «נתון הישר l1: y=x» it is l2', () => {
    const ls = ['נתון הישר l1: y=x', T14];
    expect(verdicts(ls)).toEqual(['record', 'record']);
    expect(names(ls)).toEqual(['l1', 'l2']);
  });
  it('the name does not change with the seed', () => {
    for (const seed of [0, 1, 2, 3]) expect(names(['נתון ישר y=x', T14], seed)).toEqual(['l1', 'l2']);
  });
  it('the constant-line circle-subject order draws its line too: «מעגל O משיק לישר y=2 ולציר ה-x»', () => {
    expect(names(['מעגל O משיק לישר y=2 ולציר ה-x'])).toEqual(['l1']);
  });
});

describe('#2425 — the class: a sentence ABOUT an inline curve draws it', () => {
  const FREE = 'נתון מעגל שמרכזו M(0,0) ורדיוסו r';
  const rows: Array<[string, string[]]> = [
    ['הישר 3x+4y=25 משיק למעגל M', [FREE]],
    ['הישר y=mx+10 משיק למעגל M', ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5']],
    ['הישר y=mx+10 משיק למעגל', ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5']],
    ['המעגל M משיק לישר y=mx+10', ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5']],
    ['the line 3x+4y=25 is tangent to the circle M', [FREE]],
    ['הישר y=mx+1 עובר דרך A', ['A(2,3)']],
    ['הישר y=mx עובר דרך הנקודה A', ['A(2,3)']],
    ['the line y=mx+1 passes through A', ['A(2,3)']],
  ];
  for (const [sentence, setup] of rows) {
    it(`«${sentence}» draws its line, named l1`, () => {
      const ls = [...setup, sentence];
      expect(verdicts(ls)).toEqual(ls.map(() => 'record'));
      expect(names(ls)).toEqual(['l1']);
    });
  }
  it('«המעגל (x-a)^2+y^2=4 עובר דרך A» draws its circle (no l-number: a circle)', () => {
    const ls = ['A(1,2)', 'המעגל (x-a)^2+y^2=4 עובר דרך A'];
    expect(verdicts(ls)).toEqual(['record', 'record']);
    const circles = derive(ls, 0).figure.curves.filter((c) => c.curve.kind === 'circle');
    expect(circles.map((c) => [c.stated, c.label.name])).toEqual([[true, '']]);
  });
});

describe('#2425 — a point placed on an inline curve keeps its carrier (ADR-AG-032; the #2423 ruling)', () => {
  for (const [sentence, setup] of [
    ['A על הישר y=mx+1', ['A(2,3)']],
    ['A על המעגל (x-a)^2+y^2=4', ['A(1,2)']],
    ['M על הישר 4x+y+3=0', []],
  ] as const) {
    it(`«${sentence}» draws nothing`, () => {
      const ls = [...setup, sentence];
      expect(verdicts(ls)).toEqual(ls.map(() => 'record'));
      expect(derive(ls, 0).figure.curves.filter((c) => c.stated)).toEqual([]);
    });
  }
  it('a later sentence about that curve PROMOTES the one carrier: drawn, named, «created» — never «כבר נובע»', () => {
    const ls = ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'A(3,4)', 'A על הישר 3x+4y=25', 'הישר 3x+4y=25 משיק למעגל M'];
    expect(verdicts(ls)).toEqual(['record', 'record', 'record', 'record']);
    expect(lines(ls).map((c) => [c.stated, c.label.name])).toEqual([[true, 'l1']]);
  });
});

describe('#2425 — Q4: a line declared by its equation is named; Q3: the student’s name replaces the tool’s', () => {
  it('«נתון ישר 4x+3y+2=0» is l1, a second line l2, the bare equation too', () => {
    expect(names(['נתון ישר 4x+3y+2=0'])).toEqual(['l1']);
    expect(names(['נתון ישר 4x+3y+2=0', 'נתון ישר y=x'])).toEqual(['l1', 'l2']);
    expect(names(['y=x'])).toEqual(['l1']);
  });
  it('a later «נתון הישר l5: <the same equation>» renames it l5: one line, recorded', () => {
    const ls = ['נתון ישר 4x+3y+2=0', 'נתון הישר l5: 4x+3y+2=0'];
    expect(verdicts(ls)).toEqual(['record', 'record']);
    expect(names(ls)).toEqual(['l5']);
    expect(drawn(ls)[0].label.auto).toBeUndefined();
  });
  it('restating it under its own l1 adds nothing — «כבר ידוע»', () => {
    expect(verdicts(['נתון ישר 4x+3y+2=0', 'נתון הישר l1: 4x+3y+2=0'])).toEqual(['record', 'already-known']);
  });
  it('the student’s own name is never replaced: «נתון הישר l5: …» then «נתון הישר l6: <same>» is refused', () => {
    expect(verdicts(['נתון הישר l5: 4x+3y+2=0', 'נתון הישר l6: 4x+3y+2=0'])).toEqual(['record', 'refused:already-named']);
  });
  it('«נתון הישר l1: <another equation>» while the tool’s l1 is drawn is refused, not a second l1', () => {
    expect(verdicts(['נתון ישר 4x+3y+2=0', 'נתון הישר l1: x+y=1'])).toEqual(['record', 'refused:conflicting-restatement']);
  });
  it('the tool’s name is a name: «ישר דרך A מקביל לישר l1» builds through it (ADR-AG-317)', () => {
    const ls = ['נתון ישר 2x-y+3=0', 'A(1,2)', 'ישר דרך A מקביל לישר l1'];
    expect(verdicts(ls)).toEqual(['record', 'record', 'record']);
    expect(drawn(ls)).toHaveLength(2);
  });
  it('undo keeps the numbering: dropping the last line renames nothing before it', () => {
    const ls = ['נתון ישר y=x', 'נתון ישר y=2x', 'נתון ישר y=3x'];
    expect(names(ls)).toEqual(['l1', 'l2', 'l3']);
    expect(names(ls.slice(0, 2))).toEqual(['l1', 'l2']);
  });
});
