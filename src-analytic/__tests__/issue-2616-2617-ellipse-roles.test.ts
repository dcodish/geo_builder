/**
 * AN ELLIPSE'S FOCI, VERTICES AND SIZES — sayable, givable, askable; the one-letter pin; the semi-axes positive
 * (#2616, #2617, [ADR-AG-353](../../docs/06c-decisions-analytic.md#adr-ag-353)). Operator, 2026-10-30: *"now we need to
 * build all capabilities"*; Q1 → A (an unlettered focus or vertex is accepted and draws nothing new), Q2 → A (the note
 * does not name the choice).
 *
 * Every case goes through the real submit path (`decideSubmit`, what the input box calls), then `derive` and `ask`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { paramRegister } from '../engine/carriers';
import { unstatedChoices } from '../engine/unstatedChoices';
import { fmtAnalytic } from '../format';
import p13 from './fixtures/ellipse-book-p1-3-2616.analytic.json';
import p14 from './fixtures/ellipse-book-p1-4-2616.analytic.json';
import p15 from './fixtures/ellipse-book-p1-5-2616.analytic.json';
import p16 from './fixtures/ellipse-book-p1-6-2616.analytic.json';
import p17 from './fixtures/ellipse-book-p1-7-2616.analytic.json';
import p19 from './fixtures/ellipse-book-p1-9-2616.analytic.json';
import p110 from './fixtures/ellipse-book-p1-10-2616.analytic.json';
import p212 from './fixtures/ellipse-book-p2-12-2616.analytic.json';
import p213 from './fixtures/ellipse-book-p2-13-2616.analytic.json';
import p214 from './fixtures/ellipse-book-p2-14-2616.analytic.json';
import p215 from './fixtures/ellipse-book-p2-15-2616.analytic.json';
import p216 from './fixtures/ellipse-book-p2-16-2616.analytic.json';
import p321 from './fixtures/ellipse-book-p3-21-2616.analytic.json';
import p527 from './fixtures/ellipse-book-p5-27-2616.analytic.json';
import p711 from './fixtures/ellipse-book-p7-11-2616.analytic.json';

const FREE = 'נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1';
const FIXED = 'נתונה אליפסה שמשוואתה x^2/25+y^2/9=1';

/** Submit each line as the input box does; every verdict, the recorded lines kept. */
function submit(lines: readonly string[], seed = 0): Array<{ kind: string; key?: string }> {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, seed) as { kind: string; error?: { key: string } };
    if (v.kind === 'record') accepted.push(line);
    return { kind: v.kind, key: v.error?.key };
  });
}
const last = (lines: readonly string[]) => submit(lines).at(-1)!;
const answer = (lines: readonly string[], q: string, seed = 0) => ask(derive(lines, seed), q, fmtAnalytic).value;
const point = (lines: readonly string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);
const ellipseOf = (lines: readonly string[], seed = 0) => {
  const c = derive(lines, seed).figure.curves.find((q) => q.curve.kind === 'ellipse')?.curve;
  return c && c.kind === 'ellipse' ? c : null;
};

interface Fixture {
  lines: string[];
}
const recordsLineByLine = (fx: Fixture) => expect(submit(fx.lines).map((v) => v.kind)).toEqual(fx.lines.map(() => 'record'));

describe('#2616 — the book exercises build and answer the book (fixtures)', () => {
  it.each([
    ['p1-3', p13, 'x²/36 + y²/16 = 1'],
    ['p1-4', p14, 'x²/100 + y²/75 = 1'],
    ['p1-5', p15, 'x²/20 + y²/5 = 1'],
    ['p1-6', p16, 'x²/9 + y²/5 = 1'],
    ['p1-7', p17, 'x²/169 + y²/25 = 1'],
    ['p1-9', p19, 'x²/18 + y²/8 = 1'],
    ['p1-10', p110, 'x²/25 + y²/5 = 1'],
    ['p2-13', p213, 'x²/5 + y²/9 = 1'],
    ['p3-21', p321, 'x²/40 + y²/24 = 1'],
    ['p7-11', p711, 'x²/100 + y²/36 = 1'],
  ] as const)('%s: every line records and «משוואת האליפסה» answers %s, at seeds 0 and 1', (_id, fx, want) => {
    recordsLineByLine(fx);
    for (const seed of [0, 1]) {
      const d = derive(fx.lines, seed);
      expect(d.faults).toEqual([]);
      expect(ask(d, 'משוואת האליפסה', fmtAnalytic).value).toBe(want);
    }
  });

  it('p2-12: PF1 = √5 puts P at (5, ±2), both reached', () => {
    recordsLineByLine(p212);
    expect(answer(p212.lines, 'P')).toMatch(/\(5, -2\).*\(5, 2\)/);
  });

  it('p2-14: PF2 = PF1 + 16/3 puts P at (4, ±10/3)', () => {
    recordsLineByLine(p214);
    expect(answer(p214.lines, 'P')).toMatch(/\(4, 10\/3\).*\(4, -10\/3\)/);
  });

  it('p2-15: F1 and F2 named, AB = 8 on a horizontal chord — x²/64 + y²/48 = 1 is among the answers (its y-major twin too)', () => {
    recordsLineByLine(p215);
    expect(answer(p215.lines, 'משוואת האליפסה')).toContain('x²/64 + y²/48 = 1');
  });

  it('p2-16: AF2 = 5AF1 through (3,1) — the book\'s two ellipses', () => {
    recordsLineByLine(p216);
    const a = String(answer(p216.lines, 'משוואת האליפסה'));
    expect(a).toContain('x²/18 + y²/2 = 1');
    expect(a).toContain('y²/5 = 1');
  });

  it('p2-16 in the book\'s other spelling: «מרחק A מהמוקד השמאלי גדול פי 5 ממרחק A מהמוקד הימני», foci unlettered', () => {
    const lines = [FREE, 'A(3,1)', 'A על האליפסה', 'מרחק A מהמוקד השמאלי גדול פי 5 ממרחק A מהמוקד הימני'];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    expect(String(answer(lines, 'משוואת האליפסה'))).toContain('x²/18 + y²/2 = 1');
    // Q1 → A: nothing new is drawn for the unlettered foci.
    expect(derive(lines, 0).figure.points.map((p) => p.id)).toEqual(['A']);
  });

  it('p5-27: A is the right end of the major axis at (3,0); a triangle F1F2P of area 4 is refused — the book\'s «no»', () => {
    recordsLineByLine(p527);
    expect(answer(p527.lines, 'A')).toBe('(3, 0)');
    expect(last([...p527.lines, 'שטח המשולש F1F2P הוא 4']).key).toBe('unsatisfiable');
  });
});

describe('#2616 — a focus or vertex named, in every copula order and in English', () => {
  it.each([
    ['F1 הוא המוקד הימני של האליפסה', 'F1', '(4, 0)'],
    ['המוקד הימני של האליפסה הוא F1', 'F1', '(4, 0)'],
    ['הנקודה F1 היא המוקד הימני של האליפסה', 'F1', '(4, 0)'],
    ['F1 המוקד הימני של האליפסה', 'F1', '(4, 0)'],
    ['F2 הוא המוקד השמאלי של האליפסה', 'F2', '(-4, 0)'],
    ['F1 is the right focus of the ellipse', 'F1', '(4, 0)'],
    ['A הקודקוד הימני של האליפסה', 'A', '(5, 0)'],
    ['A הוא הקודקוד העליון של האליפסה', 'A', '(0, 3)'],
    ['B הקודקוד התחתון של האליפסה', 'B', '(0, -3)'],
    ['A הוא הקצה הימני של הציר הגדול', 'A', '(5, 0)'],
    ['A is the left vertex of the ellipse', 'A', '(-5, 0)'],
  ])('on a fixed ellipse «%s» names %s at %s', (line, id, want) => {
    expect(last([FIXED, line]).kind).toBe('record');
    expect(answer([FIXED, line], id)).toBe(want);
  });

  it.each([['F המוקד העליון של האליפסה'], ['A הוא הקצה העליון של הציר הגדול'], ['מוקד האליפסה הוא (5,0)']])(
    'a role the fixed ellipse does not have — «%s» — is refused as unsatisfiable',
    (line) => {
      expect(last([FIXED, line]).key).toBe('unsatisfiable');
    },
  );

  it('a side word puts the major axis on that axis at every configuration (a free ellipse)', () => {
    for (const [line, axis] of [
      ['F1 הוא המוקד הימני של האליפסה', 'x'],
      ['F המוקד התחתון של האליפסה', 'y'],
    ] as const) {
      for (let seed = 0; seed < 8; seed++) {
        const e = ellipseOf([FREE, line], seed)!;
        expect(axis === 'x' ? e.a > e.b : e.b > e.a, `${line} @${seed}`).toBe(true);
      }
    }
  });

  it('«F מוקד האליפסה» with no side is a choice: «הציגו תצורה אחרת» reaches both foci of a fixed ellipse', () => {
    const xs = new Set([0, 1, 2, 3].map((seed) => Math.sign(point([FIXED, 'F מוקד האליפסה'], 'F', seed)!.x)));
    expect(xs).toEqual(new Set([1, -1]));
  });

  it('Q2 → A: the note does not name which focus or axis the tool chose', () => {
    expect(unstatedChoices(derive([FIXED, 'F מוקד האליפסה'], 0))).toEqual([]);
    expect(unstatedChoices(derive([FIXED, 'F1 ו-F2 מוקדי האליפסה'], 0))).toEqual([]);
    expect(unstatedChoices(derive([FREE, 'הציר הגדול שלה הוא 10'], 0))).toEqual([]);
  });

  it('a role with no letter in a distance to a LINE is refused as the unknown reference it is (the measure is point-to-point)', () => {
    expect(last([FREE, 'המרחק של המוקד הימני מהישר y=2x הוא 4']).key).toBe('unknown-reference');
  });

  it('…and on a free ellipse reaches the foci on both axes', () => {
    const where = new Set(
      [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => {
        const f = point([FREE, 'F מוקד האליפסה'], 'F', seed)!;
        return Math.abs(f.x) > Math.abs(f.y) ? 'x' : 'y';
      }),
    );
    expect(where).toEqual(new Set(['x', 'y']));
  });

  it('«F1 ו-F2 מוקדי האליפסה» and «מוקדי האליפסה הם A ו-C»: which letter is which focus swaps under «הציגו תצורה אחרת»', () => {
    for (const [line, p] of [
      ['F1 ו-F2 מוקדי האליפסה', 'F1'],
      ['מוקדי האליפסה הם A ו-C', 'A'],
      ['F1 and F2 are the foci of the ellipse', 'F1'],
    ] as const) {
      expect(last([FIXED, line]).kind).toBe('record');
      const xs = new Set([0, 1, 2, 3].map((seed) => Math.sign(point([FIXED, line], p, seed)!.x)));
      expect(xs, line).toEqual(new Set([1, -1]));
    }
  });

  it('a coordinate focus pins a free ellipse: «מוקד האליפסה הוא (4,0)» with «a = 5» gives x²/25 + y²/9 = 1', () => {
    const lines = [FREE, 'מוקד האליפסה הוא (4,0)', 'a = 5'];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record', 'record']);
    expect(answer(lines, 'משוואת האליפסה')).toBe('x²/25 + y²/9 = 1');
  });

  it('the same role stated again is one point — nothing earlier moves (stability)', () => {
    const lines = [FREE, 'a=5', 'b=3', 'F1 הוא המוקד הימני של האליפסה'];
    const before = point(lines, 'F1');
    expect(last([...lines, 'המוקד הימני של האליפסה הוא F1']).kind).toBe('already-known');
    const after = point([...lines, 'A(1,1)'], 'F1');
    expect(after).toEqual(before);
  });

  it('with no ellipse, or two, the role sentence refuses rather than guesses', () => {
    expect(last(['F1 הוא המוקד הימני של האליפסה']).key).toBe('ambiguous-shape');
    expect(last([FIXED, 'נתונה אליפסה I שמשוואתה x^2/16+y^2/9=1', 'A הקודקוד הימני של האליפסה']).key).toBe('ambiguous-shape');
  });

  it('«F מוקד הפרבולה» is unchanged, and «המוקד» names the one conic the figure holds', () => {
    expect(answer(['נתונה פרבולה שמשוואתה y^2=8x', 'F מוקד הפרבולה'], 'F')).toBe('(2, 0)');
    expect(answer([FIXED, 'F הוא המוקד'], 'F')).toMatch(/\(±?-?4, 0\)/);
  });
});

describe('#2617 — the ellipse\'s sizes', () => {
  it.each([
    ['הצירים שלה הם 10 ו-6'],
    ['הציר הגדול שלה הוא 10'],
    ['אורך הציר הגדול של האליפסה הוא 10'],
    ['אורך הציר הראשי של האליפסה הוא 10'],
    ['הציר הקטן שלה הוא 6'],
    ['המרחק בין המוקדים הוא 8'],
    ['the major axis of the ellipse is 10'],
    ['the distance between the foci is 8'],
  ])('on the fixed ellipse x²/25 + y²/9 = 1 the true size «%s» already follows', (line) => {
    expect(last([FIXED, line]).kind).toBe('already-follows');
  });

  it.each([['הציר הגדול שלה הוא 8'], ['המרחק בין המוקדים הוא 6'], ['הצירים שלה הם 12 ו-8']])('a false size «%s» is refused as unsatisfiable', (line) => {
    expect(last([FIXED, line]).key).toBe('unsatisfiable');
  });

  it('a size with the major axis unstated: the first drawing puts it on x and another configuration reaches y', () => {
    const lines = [FREE, 'הציר הגדול שלה הוא 20 והמרחק בין המוקדים הוא 10'];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    const e0 = ellipseOf(lines, 0)!;
    expect(e0.a).toBeCloseTo(10, 6);
    const axes = new Set([0, 1, 2, 3].map((seed) => (ellipseOf(lines, seed)!.a > ellipseOf(lines, seed)!.b ? 'x' : 'y')));
    expect(axes).toEqual(new Set(['x', 'y']));
  });

  it('the asks: «אורך הציר הגדול», «הציר הקטן של האליפסה», «צירי האליפסה», «המרחק בין המוקדים», «קודקודי האליפסה», «שיעורי המוקד הימני»', () => {
    expect(answer([FIXED], 'אורך הציר הגדול')).toBe('10');
    expect(answer([FIXED], 'הציר הקטן של האליפסה')).toBe('6');
    expect(answer([FIXED], 'צירי האליפסה')).toBe('10, 6');
    expect(answer([FIXED], 'המרחק בין המוקדים')).toBe('8');
    expect(answer([FIXED], 'קודקודי האליפסה')).toBe('(5, 0), (-5, 0), (0, 3), (0, -3)');
    expect(answer([FIXED], 'שיעורי המוקד הימני')).toBe('(4, 0)');
    expect(answer([FIXED], 'הקודקוד הימני')).toBe('(5, 0)');
    // A side the foci are not on has no focus — null, never the other one; a parameterised ellipse has no invariant answer.
    expect(answer([FIXED], 'שיעורי המוקד התחתון')).toBeNull();
    expect(answer([FREE], 'אורך הציר הגדול')).toBeNull();
  });

  it('02c F6\'s own example «אורך הציר הראשי של האליפסה הוא 4t» records and ties t to the axis', () => {
    expect(submit([FREE, 'a>b', 'b=2', 'אורך הציר הראשי של האליפסה הוא 4t']).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
  });

  it('the size before any ellipse is refused by the host sentence', () => {
    expect(last(['הציר הגדול שלה הוא 10']).key).toBe('ambiguous-shape');
  });
});

describe('#2617 — the one-letter pin, over every letter a figure uses', () => {
  it.each([
    [['a=6', 'b=4']],
    [['a = 6', 'b = 4']],
    [['נתון a=6', 'נתון b=4']],
    [['2a=12', '2b=8']],
    [['a^2=36', 'b^2=16']],
  ])('%j gives x²/36 + y²/16 = 1 at seeds 0–2', (pins) => {
    const lines = [FREE, ...pins];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record', 'record']);
    for (const seed of [0, 1, 2]) expect(answer(lines, 'משוואת האליפסה', seed)).toBe('x²/36 + y²/16 = 1');
  });

  it('«p=4» on y² = 2px, «r=5» on a circle «שרדיוסו r», «c=√10» on a point (c,0)', () => {
    expect(answer(['נתונה פרבולה שמשוואתה y^2=2px', 'p=4'], 'משוואת הפרבולה')).toBe('y² = 8x');
    expect(answer(['נתון מעגל O שרדיוסו r', 'r=5'], 'רדיוס המעגל')).toBe('5');
    expect(answer(['F(c,0)', 'c=√10'], 'F')).toBe('(√10, 0)');
  });

  it('a letter the figure does not use stays not-handled; «R=5» beside a point R and «r=5» beside «נתון מעגל O» too', () => {
    expect(last([FREE, 'k=3']).key).toBe('not-handled');
    expect(last(['R(1,2)', 'R=5']).key).toBe('not-handled');
    expect(last(['נתון מעגל O', 'r=5']).key).toBe('not-handled');
  });
});

describe('#2617 — an ellipse\'s semi-axis letters are positive (R191)', () => {
  it('«a>b» on x²/a² + y²/b² = 1 puts the major axis on x at seeds 0–23 (the measured trap: seeds 1, 2, 5 drew it on y)', () => {
    for (let seed = 0; seed < 24; seed++) {
      const e = ellipseOf([FREE, 'a>b'], seed)!;
      expect(e.a > e.b, `seed ${seed}`).toBe(true);
    }
  });

  it('the semi-axis letters\' domain is (0, ∞) in every equation form', () => {
    for (const eq of ['x^2/a^2+y^2/b^2=1', 'b^2x^2+a^2y^2=a^2b^2', 'x^2/a+y^2/b=1']) {
      const d = derive([`נתונה אליפסה שמשוואתה ${eq}`], 0);
      for (const sym of ['a', 'b']) {
        const p = paramRegister(d.construction).find((q) => q.sym === sym)!;
        expect(p.domain.min, `${eq} ${sym}`).toBe(0);
      }
    }
  });

  it('«a^2=36» answers a = 6 at every seed — never −6', () => {
    for (const seed of [0, 1, 2, 3]) expect(answer([FREE, 'a^2=36'], 'a', seed)).toBe('6');
  });
});
