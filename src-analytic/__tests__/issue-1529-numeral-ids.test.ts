/**
 * A NUMERAL NAME MEANS ONE CURVE AT EVERY SITE THAT READS IT (#1529, ADR-AG-179).
 *
 * Reported (found while measuring #1257): «נתון מעגל 1 … · נתון מעגל I … · P על מעגל 1» put P on the
 * r = 4 circle — circle I — drawn green. The numeral was turned into an id at ~12 hand-written sites
 * under two policies. PR #1514 (ADR-AG-170 Am. 1–3) moved the circle and conic sites onto
 * `numeralCurveId` and the operator's 2026-09-29 ruling (mixing notations is refused) — these locks pin
 * that, and the rest of the class this issue closes:
 *
 *  - the centre rule's circle slot read `NAME` (a capital letter), so «O מרכז מעגל 1» and «… II» were
 *    `not-handled` — while `centresOf` OFFERED exactly those sentences as rings;
 *  - `crossings.ts` composed a numeral-named curve's words from its label, writing «הישר ישר 1» and
 *    «הישר פרבולה I»: every ring on a named line or conic was a click that failed;
 *  - line-name ids were spelled `line-${…}` at eight sites instead of through `names.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { derive } from '../engine/derive';
import { offersOf } from '../engine/crossings';

type D = ReturnType<typeof derive> & { figure: { points: { id: string; x: number; y: number }[] } };
const run = (lines: string[], seed = 0) => derive(lines, seed) as D;
const pt = (d: D, id: string) => d.figure.points.find((p) => p.id === id);
const curveIds = (d: D) => d.construction.objects.filter((o) => o.kind === 'curve').map((o) => o.id);

describe('#1529 — the reported sequence never lands P on the other circle', () => {
  const REPORTED = ['נתון מעגל 1 שמשוואתו x^2+y^2=9', 'נתון מעגל I שמשוואתו x^2+y^2=16', 'P על מעגל 1'];

  it('line 2 is refused BY NAME as the same name in the other notation, and only one circle exists', () => {
    const d = run(REPORTED);
    expect(d.faults).toEqual([{ index: 1, code: 'numeral-notation', detail: 'I', expected: 'circle', holder: '1' }]);
    expect(curveIds(d)).toEqual(['circle-1']);
  });

  it.each([0, 1, 2])('P lies on the r = 3 circle the student named «מעגל 1» (seed %i)', (seed) => {
    const p = pt(run(REPORTED, seed), 'P')!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(3, 6);
  });
});

describe('#1529 — «P על מעגל 1» resolves after a digit-named declaration', () => {
  it.each([
    [['נתון מעגל 1 שמשוואתו x^2+y^2=9', 'P על מעגל 1']],
    [['נתון מעגל 1 שמשוואתו x^2+y^2=9', 'P על המעגל 1']],
    [['נתון מעגל 3 - x^2+y^2=9', 'P על המעגל 3']],
    [['circle 1: x^2+y^2=9', 'P on circle 1']],
  ])('%j', (lines) => {
    const d = run(lines);
    expect(d.faults).toEqual([]);
    const p = pt(d, 'P')!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(3, 6);
  });
});

describe('#1529 — the centre rule reads every numeral the table names', () => {
  const EQ = (n: string) => `נתון מעגל ${n} שמשוואתו (x-1)^2+(y-2)^2=9`;
  it.each([
    ['1', 'O מרכז מעגל 1'],
    ['1', 'O מרכז המעגל 1'],
    ['II', 'O מרכז המעגל II'],
    ['I', 'O מרכז מעגל I'],
    ['9', 'O נקודת מרכז המעגל 9'],
    ['2', 'O is the centre of circle 2'],
    ['IV', 'O is the center of circle IV'],
  ])('circle %s · «%s» → O at the fitted centre', (n, line) => {
    const d = run([EQ(n), line]);
    expect(d.faults).toEqual([]);
    const o = pt(d, 'O')!;
    expect([o.x, o.y]).toEqual([expect.closeTo(1, 9), expect.closeTo(2, 9)]);
  });

  it('a numeral in the other notation gets the notation note, never a second circle', () => {
    const d = run([EQ('1'), 'O מרכז המעגל I']);
    expect(d.faults).toEqual([{ index: 1, code: 'numeral-notation', detail: 'I', expected: 'circle', holder: '1' }]);
  });

  it('a lowercase numeral is not a numeral (the [IVX] trap, ADR-AG-006) — refused, never built', () => {
    const d = run([EQ('II'), 'O is the centre of circle ii']);
    expect(d.faults.length).toBe(1);
    expect(pt(d, 'O')).toBeUndefined();
  });

  it('a digit with no noun is not a circle name (#1298: a numeral needs its noun)', () => {
    expect(run([EQ('1'), 'O מרכז 1']).faults.length).toBe(1);
  });

  it('a single capital keeps its NAME reading — «O מרכז V» with no noun still names circle V', () => {
    const d = run(['נתון מעגל V שמשוואתו x^2+y^2=9', 'O מרכז V']);
    expect(d.faults).toEqual([]);
  });
});

describe('#1529 — every ring offered on a numeral-named curve is a sentence that records (ADR-AG-054)', () => {
  it.each([
    [['נתון ישר 1: y=x', 'נתון מעגל 2 שמשוואתו x^2+y^2=9']],
    [['נתון ישר I: y=x', 'נתון מעגל II שמשוואתו x^2+y^2=9']],
    [['נתונה פרבולה I - y^2=2x', 'נתון ישר 1: y=x']],
    [['נתונה אליפסה 2 - x^2/9+y^2/4=1', 'נתון הישר l1: y=x']],
    [['circle 1: x^2+y^2=9', 'line 2: y=x']],
    [['נתון מעגל 7 שמשוואתו (x-1)^2+(y-2)^2=9']],
  ])('%j', (lines) => {
    const d = run(lines);
    expect(d.faults).toEqual([]);
    const offers = offersOf(d.figure as never, d.construction);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.sentence).not.toMatch(/ה(?:ישר|מעגל)\s+(?:ישר|מעגל|פרבולה|אליפסה|line|circle)\b/);
      expect({ sentence: o.sentence, faults: run([...lines, o.sentence]).faults }).toEqual({ sentence: o.sentence, faults: [] });
    }
  });
});

describe('#1529 — guard: no curve-name id is spelled outside engine/names.ts', () => {
  const ROOT = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        if (f !== '__tests__') walk(p);
      } else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk(ROOT);

  it('scans the tree', () => expect(files.length).toBeGreaterThan(20));

  it('`line-${…}`, `circle-${…}`, `parabola-${…}`, `ellipse-${…}` and their string concatenations appear only in names.ts', () => {
    const SPELLED = /`(?:line|circle|parabola|ellipse)-\$\{|['"](?:line|circle|parabola|ellipse)-['"]\s*\+/;
    const offenders = files
      .filter((f) => relative(ROOT, f).split(sep).join('/') !== 'engine/names.ts')
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((l, i) => [l, i] as const)
          .filter(([l]) => SPELLED.test(l))
          .map(([l, i]) => `${relative(ROOT, f)}:${i + 1}: ${l.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
