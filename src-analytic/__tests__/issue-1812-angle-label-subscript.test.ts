/**
 * #1812 (ADR-AG-394, ADR-782) — «נסמן ∠CAB=A1» IS WRITTEN «A₁»: A with a subscript 1, no angle sign.
 *
 * Operator, playing round #1776 T5 (2026-10-06): *"the expected behavior is A and small 1 and without the angle
 * symbol"*; ruling the same day: *"Both show A₁"*. Measured at the tip before the fix: analytic's arc label read «∠A1»
 * and its panel row «∠A1» (the parameter's internal id, `∠` a namespace mark); 2-D drew a bare «1» (#263).
 *
 * The class: every place a builder SHOWS an angle label printed its storage form. The display is now one function per
 * layer over one shared spelling (`shell/indexedName` `indexedNameText`): analytic's `symbolText` for the canvas
 * (`statedText`), the panel row and any sentence quoting a stated value; 2-D's angle-alias label in `replay/core.ts`.
 * The storage id `∠A1` is unchanged (its locks are `issue-1701`, `issue-1785`, `issue-2632`).
 */
import { describe, expect, it } from 'vitest';
import { indexedNameText } from '../../shell/indexedName';
import { factsOf, replayFacts } from '../../src/__tests__/scenario-pipeline';
import { panelKnowledge, paramRows } from '../app/panelRows';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { symbolText } from '../engine/lengths';
import { statedText } from '../engine/statedMeasures';
import { fmtAnalytic } from '../format';
import { buildScene } from '../render/scene';

const REPORTED = ['משולש ABC', 'נסמן ∠CAB=A1'];

const canvasAngleTexts = (lines: readonly string[], seed = 0) => {
  const d = derive([...lines], seed);
  return buildScene(d.figure, d.box, 720, 720, { stated: d.stated }).stated.labels.filter((l) => l.kind === 'angle').map((l) => l.text);
};
const panelTexts = (lines: readonly string[]) => {
  const d = derive([...lines], 0);
  return paramRows(d, panelKnowledge(d), fmtAnalytic, { checking: '…', unused: 'לא בשימוש' }).map((r) => r.text);
};

describe('#1812 — the reported sentence, analytic', () => {
  it('records (the student path)', () => {
    expect(decideSubmit(REPORTED[1], [REPORTED[0]], 0 as never).kind).toBe('record');
  });
  it.each([0, 1, 2, 3])('seed %i: the arc at A reads «A₁» — no angle sign, no «A1»', (seed) => {
    expect(canvasAngleTexts(REPORTED, seed)).toEqual(['A₁']);
  });
  it('the «פרמטרים» row names it «A₁», never «∠A1»', () => {
    const rows = panelTexts(REPORTED);
    expect(rows.some((r) => r.startsWith('A₁'))).toBe(true);
    expect(rows.join(' ')).not.toContain('∠');
  });
  it('a value stated for the angle afterwards keeps its row named «A₁»', () => {
    const rows = panelTexts([...REPORTED, '∠CAB = 30']);
    expect(rows).toContain('A₁ = 30');
  });
});

describe('#1812 — the class: every spelling of the label, every surface', () => {
  it.each([
    ['נסמן ∠CAB=A1', 'A₁'],
    ['נסמן זוית CAB כ-A1', 'A₁'],
    ['נסמן זוית CAB כ 1', 'A₁'],
    ['denote angle CAB as A1', 'A₁'],
    ['נסמן ∠ABC=B2', 'B₂'],
    ['נסמן ∠CAB=A12', 'A₁₂'],
  ])('«%s» → «%s» on the canvas and in the panel', (line, shown) => {
    expect(canvasAngleTexts(['משולש ABC', line])).toEqual([shown]);
    expect(panelTexts(['משולש ABC', line]).some((r) => r.startsWith(shown))).toBe(true);
  });
  it('symbolText: an angle label is shown subscripted; every other symbol as stored', () => {
    expect(symbolText('∠A1')).toBe('A₁');
    expect(symbolText('∠B2')).toBe('B₂');
    expect(symbolText('∠A12')).toBe('A₁₂');
    expect(symbolText('∠A')).toBe('A');
    expect(symbolText('a')).toBe('a');
    expect(symbolText('α')).toBe('α');
    expect(symbolText('k1')).toBe('k1');
  });
  it('statedText quotes the label as the student sees it (the restatement sentences read it)', () => {
    expect(statedText({ kind: 'sym', name: '∠A1' })).toBe('A₁');
    expect(statedText({ kind: 'sym', name: 'a' })).toBe('a');
  });
  it('the shared spelling', () => {
    expect(indexedNameText('A1')).toBe('A₁');
    expect(indexedNameText('A12')).toBe('A₁₂');
    expect(indexedNameText('A')).toBe('A');
    expect(indexedNameText('α1')).toBe('α₁');
    expect(indexedNameText('12')).toBe('12');
  });
});

describe('#1812 — one sentence, one drawing: 2-D and analytic both write «A₁»', () => {
  it.each(['נסמן ∠CAB=A1', 'נסמן זוית CAB כ-A1', 'נסמן זוית CAB כ 1'])('«%s»', (line) => {
    const lines = ['משולש ABC', line];
    const twoD = replayFacts(factsOf(lines as never)).labels.angles.map((a) => a.text);
    expect(twoD).toEqual(['A₁']);
    expect(canvasAngleTexts(lines)).toEqual(twoD);
  });
});
