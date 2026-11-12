/**
 * #2848 ([ADR-AG-464](../../docs/06c-decisions-analytic.md#adr-ag-464)) — THE NAME THE TOOL ANNOUNCES FOR A COORDINATE
 * POINT CAN BE TYPED BACK.
 *
 * pipeline-lock: analytic has no scenario corpus, and these are bespoke assertions the fixtures net cannot make — the
 * value an ask prints («1 או 13/5»), the point the minted name binds to, which configuration «הציגו תצורה אחרת» reaches,
 * and the name-clash refusal of a later definition. Driven through the real door, `decideSubmit` line by line then
 * `derive` and `ask`; the model is never called.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { anotherConfiguration } from '../app/another';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import operator from './fixtures/minted-name-referred-2848.analytic.json';

/** Every line records through the submit door, in order. */
const recorded = (lines: readonly string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, out, 0);
    expect(v.kind, `«${line}»`).toBe('record');
    if (v.kind === 'record') out.push(v.line);
  }
  return out;
};
const answer = (lines: readonly string[], q: string, seed = 0) => ask(derive(lines, seed), q, fmtAnalytic).value;
const ids = (lines: readonly string[]) => derive(lines, 0).figure.points.map((p) => p.id);

describe('#2848 — the operator’s lines: «x^2+4y^2=4 · נתונה הנקודה (k-1, k-2) · P1 על האליפסה»', () => {
  const lines = recorded(operator.lines);

  it('the coordinate point is named P₁ on its row, and keeps that name after «P1 על האליפסה»', () => {
    expect(derive(lines.slice(0, 2), 0).minted).toEqual([{ index: 1, id: 'P₁' }]);
    expect(derive(lines, 0).minted).toEqual([{ index: 1, id: 'P₁' }]);
  });

  it('there is ONE point, P₁, on the ellipse', () => {
    expect(ids(lines)).toEqual(['P₁']);
    expect(derive(lines, 0).faults).toEqual([]);
  });

  it('«k» answers both values, and «P1» both points', () => {
    expect(answer(lines, 'k')).toBe('1 או 13/5');
    expect(answer(lines, 'P1')).toBe('(0, -1) או [(8/5, 3/5)]');
  });

  it('«הציגו תצורה אחרת» reaches the other k', () => {
    expect(derive(lines, 0).figure.env.k).toBeCloseTo(13 / 5, 6);
    const next = anotherConfiguration(lines, 0);
    expect(next.found).toBe(true);
    expect(derive(lines, next.seed).figure.env.k).toBeCloseTo(1, 6);
  });

  it('«P₁» typed with a subscript works the same as «P1»', () => {
    const sub = recorded(['x^2+4y^2=4', 'נתונה הנקודה (k-1, k-2)', 'P₁ על האליפסה']);
    expect(ids(sub)).toEqual(['P₁']);
    expect(answer(sub, 'k')).toBe('1 או 13/5');
  });

  it('«P2 על האליפסה» — a letter the tool never announced — is a new point, and P₁ keeps its name', () => {
    const two = recorded(['x^2+4y^2=4', 'נתונה הנקודה (k-1, k-2)', 'P2 על האליפסה']);
    expect(derive(two, 0).minted).toEqual([{ index: 1, id: 'P₁' }]);
    expect(ids(two)).toEqual(['P₁', 'P₂']);
  });

  it('REFUSAL — a later «P1(2, 3)» at other coordinates is a name clash, refused with the existing message', () => {
    const before = recorded(['נתונה הנקודה (1,2)']);
    const v = decideSubmit('P1(2, 3)', before, 0);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('conflicting-restatement');
  });
});
