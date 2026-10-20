/**
 * #2391 ([ADR-AG-315](../../docs/06c-decisions-analytic.md#adr-ag-315)) — THE OPERATOR'S EXAM, TYPED IN ITS OWN WORDS: the
 * fixtures (`fixtures/issue-2391-*.analytic.json`), each built through the real submit path, line by line.
 *
 * A fixture whose figure needs another item of the round carries `pending` naming it; its spec is skipped with that
 * reason in its title until the dependency lands, and then runs unchanged (the fix round un-skips it on the batch tip).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import q1 from './fixtures/issue-2391-q1-exam-wording.analytic.json';
import q2 from './fixtures/issue-2391-q2-centres.analytic.json';
import q2exam from './fixtures/issue-2391-q2-exam-wording.analytic.json';
import q3 from './fixtures/issue-2391-q3-two-circles.analytic.json';

interface Fixture {
  lines: string[];
  seed: number;
  pending?: string;
}

const recordsLineByLine = (fx: Fixture) => {
  for (let i = 0; i < fx.lines.length; i += 1) expect(decideSubmit(fx.lines[i], fx.lines.slice(0, i), fx.seed).kind, fx.lines[i]).toBe('record');
};
const point = (lines: readonly string[], seed: number, id: string) => derive(lines, seed).figure.points.find((p) => p.id === id);
const pendingTitle = (fx: Fixture, title: string) => (fx.pending ? `${title} — PENDING ${fx.pending}` : title);

describe('#2391 — the exam fixtures build from the exam’s own sentences', () => {
  it('Q1 (summer 2024): every line records, and the locus of M is the line 4x + y + 3 = 0 at seeds 0 and 1', () => {
    recordsLineByLine(q1);
    for (const seed of [0, 1]) {
      const d = derive(q1.lines, seed);
      expect(d.faults).toEqual([]);
      expect(ask(d, 'המקום הגיאומטרי של M', fmtAnalytic).value).toBe('line · 4x + y + 3 = 0');
      expect(ask(d, 'K', fmtAnalytic).value).toBe('(3, 4)');
      expect(ask(d, 'L', fmtAnalytic).value).toBe('(-5, 2)');
    }
  });

  it('Q1: the exam’s fourth line, as printed, teaches the line the fixture holds — and that line records', () => {
    const printed = 'מעבירים משיק למעגל I דרך הנקודה A ומשיק למעגל II דרך הנקודה B .';
    expect(decideSubmit(printed, q1.lines.slice(0, 3), 0)).toMatchObject({ kind: 'teach', canonical: q1.lines[3] });
  });

  it('Q2 (summer 2022, the centres and the tangency): every line records, and M lands at (4, 0)', () => {
    recordsLineByLine(q2);
    for (const seed of [0, 1]) {
      expect(derive(q2.lines, seed).faults).toEqual([]);
      expect(point(q2.lines, seed, 'M')).toMatchObject({ x: expect.closeTo(4, 6), y: expect.closeTo(0, 6) });
    }
  });

  it.skipIf(!!(q2exam as Fixture).pending)(pendingTitle(q2exam, 'Q2 in the exam’s own wording: every line records, and M lands at (4, 0)'), () => {
    recordsLineByLine(q2exam);
    for (const seed of [0, 1]) {
      expect(derive(q2exam.lines, seed).faults).toEqual([]);
      expect(point(q2exam.lines, seed, 'M')).toMatchObject({ x: expect.closeTo(4, 6), y: expect.closeTo(0, 6) });
    }
  });

  it.skipIf(!!(q3 as Fixture).pending)(pendingTitle(q3, 'Q3 א-ב as printed (aside included): N₁ and N₂ are two circles, N₁ to the left'), () => {
    recordsLineByLine(q3);
    for (const seed of [0, 1]) {
      expect(derive(q3.lines, seed).faults).toEqual([]);
      const n1 = point(q3.lines, seed, 'N₁')!;
      const n2 = point(q3.lines, seed, 'N₂')!;
      expect(n1.x).toBeLessThan(n2.x);
    }
  });
});
