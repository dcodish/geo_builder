/**
 * #1806 + #2033 ([ADR-AG-407](../../docs/06c-decisions-analytic.md#adr-ag-407)) — A STATED VALUE IS LABELLED AS TYPED.
 *
 * Operator, 2026-10-06: *"display on BC on canvas should be with the sqrt as entered by user"*. His #1497 ruling: a given
 * prints as typed, «√8» stays «√8». #2033, ruled 2026-10-13: a value stated with π is labelled with π, as 2-D does.
 * Each row runs `derive` → `buildScene` and reads the drawn text. The model is never called.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { evalExpr, exprText, parseExpr } from '../engine/expr';
import { buildScene } from '../render/scene';
import { describeConstraint } from '../engine/solve';
import { openCurveText, segmentKnowledge, segmentLengthText } from '../app/panelRows';
import { panelKnowledge } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { fmtAnalytic } from '../format';

const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');
function scene(lines: string[], seed = 0) {
  const d = derive(lines, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return { d, s: buildScene(d.figure, d.box, 600, 400, { stated: d.stated }) };
}
const segLabel = (lines: string[]) => scene(lines).s.segments.filter((x) => x.label).map((x) => strip(x.label!.text));
const stated = (lines: string[]) => scene(lines).s.stated.labels.map((l) => strip(l.text));
const TRI = 'משולש ABC';

describe('#1806 — a length, as typed', () => {
  it.each([
    ['BC=6√5', '6√5'],
    ['BC=√8', '√8'],
    ['BC=√20', '√20'],
    ['BC=2/3', '2/3'],
    ['BC=4/6', '4/6'],
    ['BC=√5/2', '√5/2'],
    ['BC=6', '6'],
    ['BC=0.5', '0.5'],
    ['BC=1.25', '1.25'],
    ['BC=7.9999', '8'], // sr-22
    ['d_{BC}=6√5', '6√5'], // the operator's spelling
  ])('«%s» writes «%s» on BC', (line, text) => {
    expect(segLabel([TRI, line])).toEqual([text]);
  });

  it('the panel row reads the same text, and a derived length keeps the tiers', () => {
    const { d } = scene([TRI, 'BC=√8']);
    const rows = segmentKnowledge(d).filter((s) => s.length.known);
    expect(rows.map((s) => segmentLengthText(s, fmtAnalytic))).toEqual(['√8']);
    const free = scene(['A(0,0)', 'B(1,1)', 'קטע AB']).d;
    expect(segmentKnowledge(free).map((s) => segmentLengthText(s, fmtAnalytic))).toEqual(['√2']);
  });
});

describe('#1806 — what keeps today’s fallback', () => {
  it('a letter valued by the student reads that value as typed: the fold substitutes it, so no letter reaches this layer', () => {
    // The plan expected the fallback «2√2». Measured: the constraint holds `√8` in either order, so the plan's own
    // mechanism prints «√8» (docs/17 §9). Recorded in ADR-AG-407, and a JUDGE line in round #2722's report.
    expect(segLabel([TRI, 'BC = a', 'a = √8'])).toEqual(['√8']);
    expect(segLabel(['a = √8', TRI, 'BC = a'])).toEqual(['√8']);
  });
  it('a trig given writes the angle it fixes (#1718, #1719)', () => {
    expect(stated(['משולש ABO', 'tan∢BAO = 2'])).toEqual(['63.43°']);
  });
});

describe('#1806 — the other stated slots', () => {
  it('an area and an angle', () => {
    expect(stated([TRI, 'שטח המשולש ABC הוא √8'])).toEqual(['S=√8']);
    expect(stated([TRI, 'שטח המשולש ABC הוא 0.5'])).toEqual(['S=0.5']);
    expect(stated([TRI, '∢ABC = 22.5'])).toEqual(['22.5°']); // [2-D]: «22.5°», measured at 28dac0c3
  });
});

describe('#2033 — a value stated with π is labelled with π', () => {
  it.each([
    ['AB = 4π', '4π'],
    ['AB = π', 'π'],
    ['AB = 4π/3', '4π/3'],
  ])('«%s» writes «%s»', (line, text) => {
    expect(segLabel([TRI, line])).toEqual([text]);
  });

  it('«שטח המשולש ABC הוא 12π» writes «S=12π»', () => {
    expect(stated([TRI, 'שטח המשולש ABC הוא 12π'])).toEqual(['S=12π']);
  });

  it('no «12·3.14»: the printers of the Expr write π', () => {
    expect(exprText(parseExpr('12π')!)).toBe('12π');
    expect(exprText(parseExpr('2π/3')!)).toBe('2π/3');
  });

  it('every printer of a typed π: the circle row, the coordinate', () => {
    const c = scene(['מעגל O ברדיוס 2π']).d;
    expect(openCurveText(c.construction, 'circle-at-O')).toBe('O(O), r = 2π');
    const p = scene(['A(π,2π)']).d;
    const k = panelKnowledge(p).points[0];
    expect(pointText(p, 'A', k.x, k.y, fmtAnalytic)).toBe('(π, 2π)');
  });

  it('a constraint description that prints a value writes π too', () => {
    // A length's description prints no value («AB = ערך»), so the plan's «… = 4π» row has nothing to read there.
    expect(describeConstraint({ t: 'param-eq', sym: { name: 'a' }, value: parseExpr('2π')! } as never)).toBe('a = 2π');
  });

  it('evaluation is unchanged: π is still the constant, and |AB| is 4π at 24 seeds', () => {
    expect(evalExpr(parseExpr('π')!, {})).toBe(Math.PI);
    for (let seed = 0; seed < 24; seed += 1) {
      const { d } = scene([TRI, 'AB = 4π'], seed);
      const [a, b] = ['A', 'B'].map((id) => d.figure.points.find((q) => q.id === id)!);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(4 * Math.PI, 6);
    }
  });
});
