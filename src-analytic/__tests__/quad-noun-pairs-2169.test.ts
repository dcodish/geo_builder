/**
 * #2169 (ADR-W-131, the analytic half) — TWO SHAPE NOUNS ON ONE QUADRILATERAL GET 2-D'S ANSWER IN ANALYTIC.
 *
 * Measured at ef78f15c through `decideSubmit` → `derive`: «דלתון ABCD» · «טרפז ABCD» drew a GREEN rhombus and «דלתון ABCD»
 * · «טרפז ישר זווית ABCD» a GREEN square (seeds 0–3), with no warning — a figure drawn green for givens that cannot hold
 * (P1). The cause: analytic's `nounsExclude` was "one parallel pair against both pairs", not the lattice. Also: «ריבוע
 * ABCD» · «דלתון ABCD» recorded a second row; the six sibling pairs built silently; the isosceles and right trapezoid
 * drew a rectangle with the amber warning.
 *
 * The thin lock runs the shared rows (`shell/__tests__/fixtures/quad-noun-pairs.ts`) through the REAL submit gate
 * (`decideSubmit`, recording as the App does), the real refusal text (`errorText`) and notes (`narrowingNotesOf`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { narrowingNotesOf, narrowingText } from '../app/narrowing';
import { shapeWarningsOf } from '../app/shapeWarnings';
import { derive } from '../engine/derive';
import { nounsExclude, SHAPES } from '../engine/shapes';
import { analyticI18n } from '../i18n';
import { kindRelation, type NarrowKind } from '../../shell/narrowing';
import { pairFaults, type PairGate } from '../../shell/__tests__/fixtures/quad-noun-pairs';

const he = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('he')(k, o) as string;
const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');

function play(steps: readonly string[], seed = 0): { lines: string[]; last: 'restates' | 'refines' | 'refused'; refusal?: string; earlierAccepted: boolean } {
  const lines: string[] = [];
  let earlierAccepted = true;
  let out: { last: 'restates' | 'refines' | 'refused'; refusal?: string } = { last: 'restates' };
  steps.forEach((step, i) => {
    const v = decideSubmit(step, lines, seed);
    if (v.kind === 'record') {
      lines.push(v.line);
      out = { last: 'refines' };
    } else if (v.kind === 'already-known' || v.kind === 'already-follows') out = { last: 'restates' };
    else {
      out = { last: 'refused', refusal: v.kind === 'refused' ? plain(errorText(v.error, he as never)) : v.kind };
      if (i < steps.length - 1) earlierAccepted = false;
    }
  });
  return { lines, ...out, earlierAccepted };
}

const notesFor = (lines: readonly string[]): string[] =>
  narrowingNotesOf(lines, derive(lines, 0)).map((n) => plain(narrowingText(n, he, (i) => lines[i] ?? '')));

const gate: PairGate = (steps) => {
  const { lines, ...v } = play(steps);
  return { ...v, notes: notesFor(lines) };
};

describe('#2169 — every two-noun pair (and the three-noun rows) gets 2-D’s answer in analytic', () => {
  it('every row of quad-noun-pairs', async () => {
    expect(await pairFaults(gate, 'analytic')).toEqual([]);
  }, 600_000);
});

describe('#2169 — the kite and the trapezoid family are refused at every seed, every reading and spelling', () => {
  const EXCL = (actual: string, stated: string) => `הצורה כבר ידועה כ־${actual} — ולכן אינה נקראת ${stated}. מחקו את הנתון הקודם אם התכוונתם ${stated}.`;
  const rows: [string[], string][] = [
    [['דלתון ABCD', 'טרפז ABCD'], EXCL('דלתון', 'טרפז')],
    [['דלתון ABCD', 'טרפז שווה שוקיים ABCD'], EXCL('דלתון', 'טרפז שווה שוקיים')],
    [['דלתון ABCD', 'טרפז ישר זווית ABCD'], EXCL('דלתון', 'טרפז ישר זווית')],
    [['טרפז ABCD', 'דלתון ABCD'], EXCL('טרפז', 'דלתון')],
    [['דלתון ABCD', 'טרפז BCDA'], EXCL('דלתון', 'טרפז')],
    [['kite ABCD', 'trapezoid ABCD'], EXCL('דלתון', 'טרפז')],
    [['טרפז שווה שוקיים ABCD', 'טרפז ישר זווית ABCD'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    [['טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD'], EXCL('טרפז ישר זווית', 'טרפז שווה שוקיים')],
    [['מלבן ABCD', 'מעוין ABCD', 'טרפז ABCD'], EXCL('ריבוע', 'טרפז')],
  ];
  for (const [steps, sentence] of rows) {
    it(`«${steps.join(' · ')}», seeds 0–7`, () => {
      for (let seed = 0; seed < 8; seed++) {
        const v = play(steps, seed);
        expect(v.earlierAccepted, `seed ${seed}`).toBe(true);
        expect(v.last, `seed ${seed}`).toBe('refused');
        expect(v.refusal, `seed ${seed}`).toBe(sentence);
      }
    }, 120_000);
  }
});

describe('#2169 — an implied noun restates the ring in any reading it holds in, and a trapezoid read otherwise does not', () => {
  it.each([
    [['ריבוע ABCD', 'דלתון ABCD']],
    [['ריבוע ABCD', 'דלתון BCDA']],
    [['מעוין ABCD', 'דלתון ABCD']],
    [['מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD']],
    [['מקבילית ABCD', 'דלתון ABCD', 'מעוין ABCD']],
  ])('«%s» — already known, no row', (steps) => {
    const v = play(steps);
    expect(v.last).toBe('restates');
    expect(v.lines).toHaveLength(steps.length - 1);
  });

  it('a restated noun keeps the figure green and unwarned', () => {
    const { lines } = play(['ריבוע ABCD', 'דלתון ABCD']);
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(shapeWarningsOf(lines, d)).toEqual([]);
  });
});

describe('#2169 — analytic reads the shared relation (one table, no copy)', () => {
  it('nounsExclude is kindRelation’s `excludes` over every pair of quadrilateral nouns', () => {
    const quads = Object.entries(SHAPES).filter(([, r]) => r.arity === 4 && r.kind);
    for (const [a, ra] of quads)
      for (const [b, rb] of quads) expect(nounsExclude(a, b), `${a}/${b}`).toBe(kindRelation(ra.kind as NarrowKind, rb.kind as NarrowKind) === 'excludes');
  });
});

describe('#2171 — the fixture «מלבן ABCD · מעוין ABCD» loads, builds green, and says the merge note', () => {
  const file = join(__dirname, 'fixtures', 'issue-2171-rectangle-rhombus.analytic.json');
  const fx = JSON.parse(readFileSync(file, 'utf8')) as { app: string; version: number; lines: string[]; seed: number };

  it('is a saved analytic figure whose every line still records through the real gate', () => {
    expect(fx.app).toBe('analytic-builder');
    const v = play(fx.lines);
    expect(v.lines).toEqual(fx.lines);
    expect(derive(fx.lines, fx.seed).faults).toEqual([]);
  });

  it('says the one merge note, in Hebrew and English', () => {
    expect(notesFor(fx.lines)).toEqual(['ABCD הוא כעת ריבוע, שהוא גם מלבן וגם מעוין.']);
    const en = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('en')(k, o) as string;
    const d = derive(fx.lines, fx.seed);
    expect(narrowingNotesOf(fx.lines, d).map((n) => plain(narrowingText(n, en, (i) => fx.lines[i])))).toEqual(['ABCD is now a square, which is both a rectangle and a rhombus.']);
  });
});
