/**
 * #2654 idea 3 (ADR-W-171) — 3-D's sibling-phrasing ratchet (`shell/__tests__/fixtures/sibling-phrasings.ts`).
 *
 * Every construction sentence of the 3-D catalog, typed on the figure its parity row gives it, and every
 * meaning-preserving sibling spelling of it, are DECIDED by `decideSubmit3` — the function `store3.submit`
 * dispatches, the one the `geo-input-parity` thin lock drives — on the same figure. A sibling whose verdict,
 * code or commands differ from its base's is a failing variant; the known ones are rows of
 * `shell/__tests__/fixtures/sibling-phrasings/known-3d.json`, which only shrinks. `not-understood` is the
 * verdict the app escalates to the model — never called here (standing rule 2).
 */
import type { Seed3 } from '../engine/components3';
import { describe, expect, it } from 'vitest';
import { decideSubmit3, type Fact3, type Verdict3 } from '../store/store3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { PARITY_ROWS, roleOf, stepsFor } from '../../shell/__tests__/fixtures/geo-input-parity';
import { basesFrom, fingerprint, ratchetFaults, sweep, type DecideRunner, type Outcome } from '../../shell/__tests__/fixtures/sibling-phrasings';
import { readKnown, writeKnown, writeMode } from '../../shell/__tests__/fixtures/sibling-phrasings-io';

function outcomeOf(v: Verdict3): Outcome {
  switch (v.kind) {
    case 'record': // #2790 (ADR-3D-484): a held line is its own row too
      return v.held ? { verdict: 'builds', code: 'held', shape: fingerprint(v.fact.cmds) } : { verdict: 'builds', shape: fingerprint(v.fact.cmds) };
    case 'retick':
      return { verdict: 'builds', code: 'retick' };
    case 'not-understood':
      return { verdict: 'not-handled' };
    case 'refused':
      return { verdict: /^ambiguous/.test(v.error.code) ? 'asks' : 'refused', code: v.error.code };
    case 'rename':
      return { verdict: 'builds', code: v.kind, shape: `${v.from}>${v.to}` };
    case 'swap':
      return { verdict: 'builds', code: v.kind, shape: `${v.a}<>${v.b}` };
  }
}

const run3D: DecideRunner = (context, lines) => {
  let s: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed: 0 };
  for (const line of context) {
    const v = decideSubmit3(s, line);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
    else if (v.kind !== 'retick') return null;
  }
  return lines.map((line) => outcomeOf(decideSubmit3(s, line)));
};

const contexts = PARITY_ROWS.filter((r) => roleOf(r, '3d') !== 'free').map((r) => stepsFor(r, '3d'));
const bases = basesFrom('3d', COMMAND_CATALOG_3D.filter((e) => e.lane !== 'rewrite').map((e) => e.he), contexts);

describe('#2654 — 3-D reads every sibling phrasing of a catalog sentence as it reads the sentence', () => {
  it('no new failing sibling, and no listed one that agrees now (the list only shrinks)', async () => {
    const report = await sweep('3d', bases, run3D);
    if (writeMode()) writeKnown('3d', report);
    expect(report.skipped).toEqual([]);
    expect(ratchetFaults(report.failing, readKnown('3d'))).toEqual([]);
  }, 600_000);
});
