/**
 * Issue #105 / ADR-318 — verbose / relational size-given phrasings.
 *
 * `אורך AD הוא שורש 10` (verbose length + the word שורש), `הצלע BC גדולה פי 2 מהצלע CD` and the operator's
 * Q5 `אורך AC גדול פי √(3) מהקטע CO` (relational ratio with noun prefixes) all escalated. Fixed by:
 * `שורש N → √N` + a verbose length frame in `normalizeUtterance`; the ratio Hebrew branch skips an optional
 * segment-noun after `מ`; and `ratioConstraint` runs BEFORE `segment` so `מהקטע`'s `קטע` can't half-parse the
 * ratio into a bare segment. The vague unnamed-sides form gets a guided message, not an LLM escalation.
 */
import { describe, it, expect } from 'vitest';
import { parse, classifyOutOfScope } from '@/parser';
import type { AnyCommand } from '@/engine';

const ratioK = (u: string): number | undefined => {
  const r = parse(u, {});
  if (!r.ok) return undefined;
  return (r.commands.find((c: AnyCommand) => c.type === 'set-ratio') as { k?: number } | undefined)?.k;
};
const lenVal = (u: string): number | undefined => {
  const r = parse(u, {});
  if (!r.ok) return undefined;
  const c = r.commands.find((x: AnyCommand) => x.type === 'measure-length' || x.type === 'set-distance') as
    | { value?: number; expr?: { value?: number } }
    | undefined;
  return c?.expr?.value ?? c?.value;
};

describe('#105 — verbose length', () => {
  it('«אורך AD הוא שורש 10» → |AD| = √10 (verbose frame + שורש→√)', () => {
    expect(lenVal('אורך AD הוא שורש 10')).toBeCloseTo(Math.sqrt(10), 6);
  });
  it('«אורך AD הוא √10» → |AD| = √10', () => {
    expect(lenVal('אורך AD הוא √10')).toBeCloseTo(Math.sqrt(10), 6);
  });
  it('«הצלע BC היא 5» → |BC| = 5', () => {
    expect(lenVal('הצלע BC היא 5')).toBe(5);
  });
});

describe('#105 — relational ratio with noun prefixes', () => {
  it('«אורך AC גדול פי √(3) מהקטע CO» → set-ratio k=√3 (the operator Q5 form)', () => {
    expect(ratioK('אורך AC גדול פי √(3) מהקטע CO')).toBeCloseTo(Math.sqrt(3), 6);
  });
  it('«הצלע BC גדולה פי 2 מהצלע CD» → k=2 (feminine + noun prefixes)', () => {
    expect(ratioK('הצלע BC גדולה פי 2 מהצלע CD')).toBeCloseTo(2, 6);
  });
  it('«הצלע BC גדולה פי שורש 2 מהצלע CD» → k=√2', () => {
    expect(ratioK('הצלע BC גדולה פי שורש 2 מהצלע CD')).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe('#105 — no regressions from moving ratioConstraint before segment', () => {
  const cases: [string, string][] = [
    ['AB = CD', 'set-equal'],
    ['AB = 6', 'set-distance'],
    ['AB = 12√2', 'measure-length'],
    ['AB = 2 AD', 'set-ratio'],
    ['הקטע AB', 'segment'],
    ['קטע DC', 'segment'],
  ];
  for (const [u, kind] of cases) {
    it(`«${u}» still lowers to a ${kind}`, () => {
      const r = parse(u, {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.commands.some((c: AnyCommand) => c.type === kind), `${u} → ${kind}`).toBe(true);
    });
  }
});

describe('#105 — unnamed-sides guided refusal', () => {
  it('«צלע אחת 10 צלע שניה 5» is classified as unnamed-sides (not a real gap)', () => {
    expect(classifyOutOfScope('צלע אחת 10 צלע שניה 5')?.category).toBe('unnamed-sides');
    expect(classifyOutOfScope('one side 10 the other side 5')?.category).toBe('unnamed-sides');
  });
  it('a LABELLED given is NOT mis-classified', () => {
    expect(classifyOutOfScope('AB = 10')).toBeNull();
    expect(classifyOutOfScope('הצלע BC = 5')).toBeNull();
  });
});
