/**
 * #2552 D9 ([ADR-AG-344](../../docs/06c-decisions-analytic.md#adr-ag-344), ADR-W-164) — «X מרכז מעגל» STATES A NEW CIRCLE
 * once every circle's centre has a letter.
 *
 * Operator rulings: D9 = A (2026-10-26) *"«P מרכז מעגל» (without «ה»), when every circle on screen already has a centre
 * letter, creates a new circle centred at P, with the creation notice and ✕"*; and the notice wording (2026-10-28,
 * "2252 - A"): «נוצר מעגל חדש שמרכזו P — אם זו טעות הקלדה, לחצו ✕ לביטול השורה».
 *
 * Measured at main 422cda84 through `decideSubmit` (no model): after the exam's pair «P מרכז מעגל» was refused
 * `ambiguous-shape`; beside one lettered circle it was refused `already-named`; on an empty figure it recorded silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';

const PAIR = ['נתונים שני מעגלים שרדיוס כל אחד מהם 5', 'מרכז המעגל הראשון הוא O_1(-3,1)', 'מרכז המעגל השני הוא O_2(9,10)'];
const ONE = ['מעגל שמרכזו O(0,0) ורדיוסו 3'];

/** Every line but the last records; the last line's verdict. */
function last(lines: readonly string[], seed = 0): { v: SubmitVerdict; recorded: string[] } {
  const acc: string[] = [];
  for (const l of lines.slice(0, -1)) {
    const v = decideSubmit(l, acc, seed);
    if (v.kind !== 'record') throw new Error(`«${l}»: ${v.kind}`);
    acc.push(v.line);
  }
  const v = decideSubmit(lines[lines.length - 1], acc, seed);
  return { v, recorded: v.kind === 'record' ? [...acc, v.line] : acc };
}
const circlesOf = (lines: readonly string[], seed = 0) =>
  derive(lines, seed).figure.curves.filter((c) => c.curve.kind === 'circle').map((c) => c.curve as { kind: 'circle'; cx: number; cy: number; r: number });
const pointAt = (lines: readonly string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);
const keyOf = (v: SubmitVerdict) => (v.kind === 'refused' ? (v.error as { key?: string }).key : v.kind);

describe('#2552 D9 — «X מרכז מעגל» with every centre lettered draws a new circle centred at X', () => {
  it.each([
    ['after the exam pair', PAIR, 2],
    ['beside one lettered circle', ONE, 1],
  ] as const)('%s: records, adds a circle centred at P, and the notice is the circle\'s alone', (_n, setup, before) => {
    const { v, recorded } = last([...setup, 'P מרכז מעגל']);
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    expect(v.createdCircle).toBe('P');
    expect(v.created).toBeUndefined();
    const d = derive(recorded, 0);
    expect(d.faults).toEqual([]);
    for (const seed of [0, 1, 2]) {
      const cs = circlesOf(recorded, seed);
      expect(cs).toHaveLength(before + 1);
      const P = pointAt(recorded, 'P', seed)!;
      expect(cs.some((c) => Math.abs(c.cx - P.x) < 1e-9 && Math.abs(c.cy - P.y) < 1e-9)).toBe(true);
    }
  });

  it('the earlier circles do not move (stability)', () => {
    const { recorded } = last([...PAIR, 'P מרכז מעגל']);
    const before = circlesOf(PAIR);
    const after = circlesOf(recorded);
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
    for (const c of before) expect(after.some((k) => near(k.cx, c.cx) && near(k.cy, c.cy) && near(k.r, c.r))).toBe(true);
  });

  it('a letter already in the figure becomes the new centre, and the notice names it', () => {
    const { v, recorded } = last(['A(1,1)', ...ONE, 'A מרכז מעגל']);
    expect(v.kind === 'record' && v.createdCircle).toBe('A');
    expect(circlesOf(recorded)).toHaveLength(2);
  });

  it('the notice text is the ruled sentence, word for word', () => {
    const he = (k: string, o: Record<string, string>) => (analyticI18n.getFixedT('he')(k, o) as string).replace(/[⁦-⁩]/g, '');
    expect(he('suite.notice.createdCircle', { centre: 'P' })).toBe('נוצר מעגל חדש שמרכזו P — אם זו טעות הקלדה, לחצו ✕ לביטול השורה');
  });

  it('the ✕ (removing the line) leaves the figure as it was', () => {
    const { recorded } = last([...PAIR, 'P מרכז מעגל']);
    const undone = recorded.slice(0, -1);
    expect(circlesOf(undone)).toEqual(circlesOf(PAIR));
    expect(pointAt(undone, 'P')).toBeUndefined();
  });

  it.each([
    ['issue-2552-d9-new-circle-after-pair.analytic.json', 3],
    ['issue-2552-d9-new-circle-beside-one.analytic.json', 2],
  ] as const)('fixture %s builds green through the submit path', (file, circles) => {
    const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', file), 'utf8')) as { lines: string[]; seed: number };
    const { v, recorded } = last(fx.lines, fx.seed);
    expect(v.kind).toBe('record');
    expect(derive(recorded, fx.seed).faults).toEqual([]);
    expect(circlesOf(recorded, fx.seed)).toHaveLength(circles);
  });
});

describe('#2552 D9 — controls: what does not change', () => {
  it('«O_1 מרכז מעגל» then «O_2 מרכז מעגל» still name the pair\'s centres in turn, with no circle notice', () => {
    const acc: string[] = [];
    for (const l of ['שני מעגלים', 'O_1 מרכז מעגל', 'O_2 מרכז מעגל']) {
      const v = decideSubmit(l, acc, 0);
      expect(v.kind, l).toBe('record');
      if (v.kind === 'record') {
        expect(v.createdCircle, l).toBeUndefined();
        acc.push(v.line);
      }
    }
    expect(circlesOf(acc)).toHaveLength(2);
  });

  it('the definite «P מרכז המעגל» with every centre lettered keeps today\'s refusals', () => {
    expect(keyOf(last([...PAIR, 'P מרכז המעגל']).v)).toBe('ambiguous-shape');
    expect(keyOf(last([...ONE, 'P מרכז המעגל']).v)).toBe('already-named');
  });

  it('on an empty figure «P מרכז מעגל» records silently, as before', () => {
    const v = decideSubmit('P מרכז מעגל', [], 0);
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    expect(v.createdCircle).toBeUndefined();
    expect(v.created).toBeUndefined();
  });

  it('«O מרכז מעגל» on the circle already centred at O is known, not a second circle', () => {
    expect(last([...ONE, 'O מרכז מעגל']).v.kind).not.toBe('record');
  });

  it('«O מרכז המעגל» on a lone unnamed circle still names its centre', () => {
    const { v, recorded } = last(['x^2+y^2=16', 'P מרכז מעגל']);
    expect(v.kind).toBe('record');
    if (v.kind === 'record') expect(v.createdCircle).toBeUndefined();
    expect(circlesOf(recorded)).toHaveLength(1);
  });
});
