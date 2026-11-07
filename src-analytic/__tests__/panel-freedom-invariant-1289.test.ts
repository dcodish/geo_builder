/**
 * #1289 — "freedom in the panel, certainty in every value" is made UNREPRESENTABLE.
 *
 * > A figure that reports `reportedDof > 0` must report at least one quantity unknown.
 *
 * «1 דרגות חופש» printed above a panel in which every coordinate, parameter and equation reads as
 * determined is a self-contradiction, and #1282 shipped exactly that: `carrierDof` is ANALYTIC (the
 * Jacobian's nullity) while `isKnowledge` is SAMPLED, and when the sampling collapsed the two disagreed
 * silently. #1282 fixed that instance and locked the one figure. This is the corpus-wide net.
 *
 * ## The corpus
 *
 * Analytic has no scenario corpus of its own, so the sweep takes every figure the analytic suite already
 * builds: each string-array literal in `src-analytic/__tests__` (harvested from source, zero
 * authoring), plus each catalog entry with its `needs`. It checks only figures that build GREEN (no
 * fault, nothing unsatisfied), because a figure that fails its givens has no freedom to report honestly.
 *
 * ## It asks the panel, not a copy of it
 *
 * The right-hand side is `panelShowsUnknown(panelKnowledge(d))`, the function `App.tsx` renders the
 * parameter, point and equation rows from (ADR-W-053). A lock that re-derived the panel's gates would
 * stay green through the change that broke them.
 *
 * Measured when it landed: 531 figures built, 237 with freedom, **0 violations**.
 *
 * ## The sweep rides the analytic corpus walk (#2739, ADR-W-191)
 *
 * The corpus sweep asks `panelKnowledge(derive(lines, 0))`, exactly what #1473's pool invariant asks of the
 * same corpus. It ran as its own walk in its own cold worker, deriving every item a second time; it now runs
 * on #1473's walk, which derives each item once (`issue-1473-pool-invariant.shard.ts`, its third describe:
 * the same predicate, the same green filter, the floor of 100 free figures split across the shards). This file
 * keeps the two checks that need no corpus.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { panelShowsUnknown } from '../app/panelRows';

const HERE = __dirname;

describe('#1289 — freedom in the panel means something in the panel is unknown', () => {
  it('the predicate FIRES on the #1282 state: every value known, freedom reported', () => {
    const allKnown = { params: [], points: [{ id: 'A', x: { known: true as const, value: 1 }, y: { known: true as const, value: 2 } }], curves: [], angles: [] };
    expect(panelShowsUnknown(allKnown)).toBe(false);
    expect(panelShowsUnknown({ ...allKnown, points: [{ id: 'A', x: { known: false as const }, y: { known: true as const, value: 2 } }] })).toBe(true);
  });

  it('the panel renders from the same decision (App.tsx calls panelKnowledge, not its own gates)', () => {
    const app = readFileSync(path.resolve(HERE, '../App.tsx'), 'utf8');
    expect(app).toContain('panelKnowledge(d)');
    expect(app).not.toMatch(/isKnowledge\(d\.construction, \(f\) => f\.points\.find/);
    expect(app).not.toMatch(/isKnowledge\(d\.construction, \(f\) => f\.env\[/);
  });
});
