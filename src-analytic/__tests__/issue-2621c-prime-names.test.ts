/**
 * PRIME POINT NAMES, «A'» (#2621 C, [ADR-AG-395](../../docs/06c-decisions-analytic.md#adr-ag-395)). Operator, 2026-10-30: *"now we
 * need to build all capabilities"* (the ellipse book, p10-9 ב: «A ו-A' הן נקודות החיתוך של האליפסה …», «AA' = 8», «A'P = √45»).
 * The point-name atom had no prime and was spelled inline in every reader; it is now ONE atom (`engine/pointName.ts`), every
 * prime glyph folds to `'` at the boundary (the shared `shell/primes`), and a primed name is its own point, drawn A′.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask, askSettled } from '../app/ask';
import { decideRename, normalizePointName, type RenameState } from '../app/rename';
import { derive } from '../engine/derive';
import { POINT_NAME, displayPointName, isPointName, splitPointNames } from '../engine/pointName';
import { NAME_ATOM } from '../../shell/indexedName';
import { buildScene } from '../render/scene';
import { fmtAnalytic } from '../format';
import p109 from './fixtures/prime-names-p10-9b-2621.analytic.json';

type V = { kind: string; error?: { key: string } };
function submit(lines: readonly string[]): V[] {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, 0) as V;
    if (v.kind === 'record') accepted.push(line);
    return v;
  });
}
const kinds = (lines: readonly string[]) => submit(lines).map((v) => v.kind);
const pointAt = (lines: readonly string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);

describe('#2621 C — the point-name atom', () => {
  it('a name is a capital, an optional index and an optional prime — never a possessive', () => {
    for (const n of ['A', "A'", 'F1', "F1'", 'D₂']) expect(isPointName(n), n).toBe(true);
    for (const n of ["A''", 'a', "A's", 'AB']) expect(isPointName(n), n).toBe(false);
    expect(splitPointNames("AA'B")).toEqual(['A', "A'", 'B']);
    expect(splitPointNames("A'BC'")).toEqual(["A'", 'B', "C'"]);
    expect(displayPointName("A'")).toBe('A′');
  });

  it("the index is a digit run (#2075, ADR-AG-398), the prime sits after it: «X12'» is X₁₂'", () => {
    for (const n of ['X₁₂', "X₁₂'", 'X12']) expect(isPointName(n), n).toBe(true);
    expect(splitPointNames("X₁₂'Y₃")).toEqual(["X₁₂'", 'Y₃']);
    expect(normalizePointName("X12'")).toBe("X₁₂'");
    expect(kinds(["X12'(3,4)", "X_{12}(0,0)", "X₁₂X₁₂' = 5"])).toEqual(['record', 'record', 'record']);
    expect(pointAt(["X12'(3,4)"], "X₁₂'")).toMatchObject({ x: 3, y: 4 });
  });
});

describe("#2621 C — «A'» is a point name everywhere a letter is", () => {
  it('every spelling records, as its own point distinct from A', () => {
    expect(kinds(["A'(1,2)"])).toEqual(['record']);
    expect(kinds(["נקודה A'"])).toEqual(['record']);
    expect(kinds(['A(0,0)', "A'(3,4)", "AA' = 5"])).toEqual(['record', 'record', 'record']);
    const lines = ['A(0,0)', "A'(3,4)"];
    expect(pointAt(lines, 'A')).toMatchObject({ x: 0, y: 0 });
    expect(pointAt(lines, "A'")).toMatchObject({ x: 3, y: 4 });
  });

  it('every prime glyph is one name: ′ ’ ׳ ` fold to the same point', () => {
    for (const g of ['′', '’', '׳', '`', 'ʹ']) {
      const v = submit(["A'(1,2)", `A${g}(1,2)`]);
      expect(v.map((x) => x.kind), g).toEqual(['record', 'record']);
    }
  });

  it("a length with a primed end measures the primed point: «A'B», «AA'», «A'P»", () => {
    // A'(1,1) to B(3,4) is √13, so 5 contradicts it and √13 holds.
    expect(submit(['B(3,4)', "A'(1,1)", "A'B = 5"]).at(-1)!.error?.key).toBe('unsatisfiable');
    expect(kinds(['B(3,4)', "A'(1,1)", "A'B = √13"]).at(-1)).toBe('record');
    expect(ask(derive(['A(0,0)', "A'(3,4)"], 0), "AA'", fmtAnalytic).value).toBe('5');
    expect(ask(derive(['A(0,0)', "A'(3,4)"], 0), "A'", fmtAnalytic).value).toBe('(3, 4)');
  });

  it("a primed name in a segment, a line and a polygon run: «קטע AA'», «ישר A'B», «משולש AA'B»", () => {
    expect(kinds(['A(1,2)', "A'(3,4)", 'B(0,5)', "קטע AA'", "ישר A'B", "משולש AA'B"])).toEqual(['record', 'record', 'record', 'record', 'record', 'record']);
  });

  it("an English possessive is never a prime: «A's» is not the point A'", () => {
    expect(isPointName("A's")).toBe(false);
    expect(splitPointNames("A's")).toEqual(['A']);
  });

  it('the canvas draws the prime as A′', () => {
    const d = derive(['A(0,0)', "A'(3,4)"], 0);
    const labels = buildScene(d.figure, d.box, 400, 300).points.map((p) => p.label);
    expect(labels).toContain('A′');
    expect(labels).toContain('A');
  });
});

describe('#2621 C — the rename dialog reads a primed name', () => {
  const state = (lines: string[]): RenameState => ({ lines, disabled: [], queries: [], spokenFor: {}, seed: 0 });
  it("«A'» normalises to itself; a quoted 'A' is still A", () => {
    expect(normalizePointName("A'")).toBe("A'");
    expect(normalizePointName('A′')).toBe("A'");
    expect(normalizePointName("'A'")).toBe('A');
    expect(normalizePointName('A')).toBe('A');
  });
  it("rename A' → B rewrites only the primed point", () => {
    const r = decideRename("A'", 'B', state(['A(0,0)', "A'(3,4)", "קטע AA'"]));
    expect(r.kind).toBe('apply');
    if (r.kind === 'apply') expect(r.lines).toEqual(['A(0,0)', 'B(3,4)', 'קטע AB']);
  });
});

describe('#2621 C — the book line, p10-9 ב (fixture)', () => {
  it("«A ו-A' הן נקודות החיתוך … עם החלק החיובי ועם החלק השלילי של ציר ה-x» is two crossings, and the figure answers", () => {
    expect(kinds(p109.lines)).toEqual(p109.lines.map(() => 'record'));
    for (let seed = 0; seed < 4; seed++) {
      const d = derive(p109.lines, seed);
      const A = d.figure.points.find((p) => p.id === 'A')!;
      const A2 = d.figure.points.find((p) => p.id === "A'")!;
      const P = d.figure.points.find((p) => p.id === 'P')!;
      expect(A.x).toBeCloseTo(4, 6);
      expect(A2.x).toBeCloseTo(-4, 6);
      expect(P.x).toBeCloseTo(2, 6);
      expect(P.y).toBeCloseTo(3, 6);
    }
    expect(askSettled(derive(p109.lines, 0), 'משוואת האליפסה', fmtAnalytic).value).toContain('x²/16 + y²/12 = 1');
  });
  it('the distributed crossing equals its two one-point sentences', () => {
    const two = [
      'נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1',
      'A היא נקודת החיתוך של האליפסה עם החלק החיובי של ציר ה-x',
      "A' היא נקודת החיתוך של האליפסה עם החלק השלילי של ציר ה-x",
    ];
    const one = p109.lines.slice(0, 2);
    const ptsOf = (ls: readonly string[]) => derive(ls, 0).figure.points.map((p) => [p.id, p.x.toFixed(6), p.y.toFixed(6)]);
    expect(ptsOf(one)).toEqual(ptsOf(two));
    // «בהתאמה» said aloud reads the same.
    expect(kinds([one[0], `${one[1]} בהתאמה`])).toEqual(['record', 'record']);
  });
});

// #2624 (ADR-AG-446): the atom is the SHARED one — 2-D reads the same point name — and its possessive guard survives a rule
// compiled case-insensitive (the inline `(?![a-z])` refused every capital after a prime under `i`).
describe('#2624 — analytic composes the shared point-name atom', () => {
  it('POINT_NAME is shell NAME_ATOM', () => expect(POINT_NAME).toBe(NAME_ATOM));
  it("under `i`, «A'B'» is still two primed names; «A's» is still a possessive", () => {
    expect("A'B'".match(new RegExp(POINT_NAME, 'gi'))).toEqual(["A'", "B'"]);
    expect(splitPointNames("A's")).toEqual(['A']);
    expect(isPointName("A's")).toBe(false);
  });
});
