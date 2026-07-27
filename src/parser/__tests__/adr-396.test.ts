/**
 * ADR-396 — two ways a SUPPORTED construct was unreachable in production (both found by `/log-triage`
 * on the 2026-07-26 prod log, both verified against HEAD before the fix).
 *
 * #348 — a collinearity list of 4+ points kept only the first three. `labelRun(s, n)` returns EXACTLY n,
 *        so asking for 3 truncated its own match: «B C F E נמצאות על ישר אחד» → `set-collinear B,C,F`,
 *        dropping E. The engine has had the N-point construct all along (ADR-050's variadic `set-line`,
 *        which the sibling «הישר ABCD» rule already emits) — this rule was emitting the narrow command.
 *        The `droppedNewLabels` gate then caught the orphan and escalated to the LLM, which failed:
 *        the student lost the given to an unnecessary paid round-trip.
 *
 * #347 — the whole colon-ratio family parsed correctly and was then discarded at the commit boundary by
 *        `droppedGivenNumbers`. The gate consumed a SLASH fraction whole (evaluating `a/b` before
 *        comparing) but had no COLON form, and a stated `p:q` never survives as its literal digits —
 *        it lowers to `k=p/q` (set-ratio) or `t=p/(p+q)` (the divider). So both digits read as dropped.
 *        The gate's own doctrine is that accounting must be generous, "a false account only suppresses a
 *        warning, while a false drop would break a working input" — this was that false drop.
 *
 * Why nothing caught #347: the colon-ratio family had no `catalog.ts` entry, so the coverage guard never
 * exercised it (the concrete instance of #140). Catalog entries were added with the fix.
 */

import { describe, expect, it } from 'vitest';
import { parse, droppedGivenNumbers, droppedNewLabels, droppedGivenRelations, droppedWordRelations } from '../index';
import type { AnyCommand } from '@/engine';

const cmds = (u: string): AnyCommand[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${JSON.stringify(r)}`);
  return r.commands;
};

describe('#348 — a collinearity list reads the WHOLE run', () => {
  for (const [utterance, expected] of [
    ['B C F E נמצאות על ישר אחד', ['B', 'C', 'F', 'E']], // the exact prod submit
    ['A B C D על ישר אחד', ['A', 'B', 'C', 'D']],
    ['A, B, C, D על ישר אחד', ['A', 'B', 'C', 'D']],
    ['A B C D collinear', ['A', 'B', 'C', 'D']],
    ['A B C D on one line', ['A', 'B', 'C', 'D']],
    ['A B C D E collinear', ['A', 'B', 'C', 'D', 'E']], // five, to prove it is not a 4-shaped patch
  ] as const) {
    it(`"${utterance}" → set-line with every label`, () => {
      const c = cmds(utterance);
      const line = c.find((x) => x.type === 'set-line') as { points: string[] } | undefined;
      expect(line, 'must lower to the variadic set-line, not the 3-slot set-collinear').toBeDefined();
      expect(line!.points).toEqual([...expected]);
      // the orphaned-label gate is what used to force the LLM round-trip
      expect(droppedNewLabels(utterance, c)).toEqual([]);
    });
  }

  it('EXACTLY three still lowers to set-collinear — existing figures are byte-identical', () => {
    expect(cmds('B C F נמצאות על ישר אחד')).toEqual([{ type: 'set-collinear', a: 'B', b: 'C', c: 'F' }]);
    expect(cmds('A B C collinear')).toEqual([{ type: 'set-collinear', a: 'A', b: 'B', c: 'C' }]);
  });

  it('the glued sibling forms are unchanged', () => {
    for (const u of ['הישר ABCD', 'line ABCD']) {
      expect(cmds(u)).toEqual([{ type: 'set-line', points: ['A', 'B', 'C', 'D'] }]);
    }
  });

  it('a repeated label falls back rather than emitting a degenerate set-line', () => {
    const c = cmds('A B C A collinear');
    expect(c.some((x) => x.type === 'set-line')).toBe(false);
    expect(c[0].type).toBe('set-collinear');
  });
});

describe('#347 — a colon ratio is accounted, not reported dropped', () => {
  for (const utterance of [
    'BM:MF=1:2', // the exact prod submit (twice)
    'AD:DB = 2:3',
    'G מחלקת את DC ביחס 1:2',
    'G divides DC in ratio 1:2',
    'היחס בין DG ל-GC הוא 1:2',
  ]) {
    it(`"${utterance}" survives the honesty gates`, () => {
      const c = cmds(utterance);
      expect(droppedGivenNumbers(utterance, c), 'the stated p:q must be accounted, not dropped').toEqual([]);
      // the sibling gates were audited in the same pass — they have no colon blindness
      expect(droppedGivenRelations(utterance, c)).toEqual([]);
      expect(droppedWordRelations(utterance, c)).toEqual([]);
    });
  }

  it('the colon pass is GENEROUS but still catches a genuinely dropped magnitude', () => {
    // a number the commands never account for is still reported — the gate must not go blind
    const c = cmds('BM:MF=1:2');
    expect(droppedGivenNumbers('BM:MF=1:2 and AB = 7', c)).toContain(7);
  });

  it('a slash fraction is unaffected (the pass it was modelled on)', () => {
    const u = 'S_{ABC}/S_{DEF} = 3/4';
    expect(droppedGivenNumbers(u, cmds(u))).toEqual([]);
  });
});
