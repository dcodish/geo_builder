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
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { panelKnowledge, panelShowsUnknown } from '../app/panelRows';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const HERE = __dirname;
const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ARRAY = new RegExp(String.raw`\[\s*((?:${STR})(?:\s*,\s*(?:${STR}))*)\s*,?\s*\]`, 'g');
const ITEM = new RegExp(STR, 'g');

/** Every string-array literal in the analytic tests, plus every catalog entry with its context. */
function corpus(): string[][] {
  const seqs = new Map<string, string[]>();
  for (const f of readdirSync(HERE).filter((n) => /\.tsx?$/.test(n))) {
    const src = readFileSync(path.join(HERE, f), 'utf8');
    for (const m of src.matchAll(ARRAY)) {
      const items = [...m[1].matchAll(ITEM)].map((x) => x[0].slice(1, -1).replace(/\\(['"\\])/g, '$1'));
      seqs.set(JSON.stringify(items), items);
    }
  }
  for (const e of COMMAND_CATALOG_ANALYTIC) {
    const s = [...(e.needs ?? []), e.he];
    seqs.set(JSON.stringify(s), s);
  }
  return [...seqs.values()];
}

/** Every GREEN figure with freedom whose panel prints nothing as unknown. */
function violations(seqs: readonly string[][]): { bad: string[]; free: number } {
  const bad: string[] = [];
  let free = 0;
  for (const lines of seqs) {
    let d;
    try {
      d = derive(lines, 0);
    } catch {
      continue; // not a figure (a list of refusals, say) — other tests own that
    }
    if (d.faults.length > 0 || d.figure.unsatisfied.length > 0) continue;
    if (d.figure.points.length + d.figure.curves.length === 0) continue;
    if (reportedDof(d.construction, d.figure.carrierDof) <= 0) continue;
    free++;
    if (!panelShowsUnknown(panelKnowledge(d))) bad.push(JSON.stringify(lines));
  }
  return { bad, free };
}

describe('#1289 — freedom in the panel means something in the panel is unknown', () => {
  it('holds over every figure the analytic suite and catalog build', () => {
    const { bad, free } = violations(corpus());
    expect(bad).toEqual([]);
    // the net actually exercised free figures — a sweep that checks nothing passes by default
    expect(free).toBeGreaterThan(100);
  }, 600_000);

  it('the predicate FIRES on the #1282 state: every value known, freedom reported', () => {
    const allKnown = { params: [], points: [{ id: 'A', x: { known: true as const, value: 1 }, y: { known: true as const, value: 2 } }], curves: [] };
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
