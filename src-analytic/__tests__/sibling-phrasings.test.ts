/**
 * #2654 idea 3 (ADR-W-171) — analytic's sibling-phrasing ratchet (`shell/__tests__/fixtures/sibling-phrasings.ts`).
 *
 * Every construction sentence of the analytic catalog, typed on the figure its parity row gives it, and
 * every meaning-preserving sibling spelling of it, are DECIDED by `decideSubmit` — the function `App.tsx`
 * dispatches, the one the `geo-input-parity` thin lock drives — on the same figure. A sibling whose verdict,
 * code or parsed facts differ from its base's is a failing variant; the known ones are rows of
 * `shell/__tests__/fixtures/sibling-phrasings/known-analytic.json`, which only shrinks. `not-handled` is the
 * refusal the app hands to the model — never called here (standing rule 2).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { PARITY_ROWS, roleOf, stepsFor } from '../../shell/__tests__/fixtures/geo-input-parity';
import { RESERVED, basesFrom, fingerprint, ratchetFaults, sweep, type DecideRunner, type Outcome } from '../../shell/__tests__/fixtures/sibling-phrasings';
import { readKnown, writeKnown, writeMode } from '../../shell/__tests__/fixtures/sibling-phrasings-io';

function outcomeOf(v: SubmitVerdict): Outcome {
  switch (v.kind) {
    case 'record': {
      const p = parseLine(v.line);
      return { verdict: 'builds', shape: p.ok ? fingerprint(p.facts) : `unparsed:${p.code}` };
    }
    case 'already-known':
    case 'already-follows':
      return { verdict: 'builds', code: v.kind };
    case 'refused':
      if (v.error.key === 'not-handled') return { verdict: 'not-handled' };
      return { verdict: /^ambiguous/.test(v.error.key) ? 'asks' : 'refused', code: v.error.key };
    case 'teach':
      return { verdict: 'asks', code: 'teach' };
    case 'ignored':
      return { verdict: 'refused', code: 'ignored' };
    case 'rename':
    case 'swap':
      return { verdict: 'builds', code: v.kind };
  }
}

const runAnalytic: DecideRunner = (context, lines) => {
  const recorded: string[] = [];
  for (const line of context) {
    const v = decideSubmit(line, recorded, 0);
    if (v.kind === 'record') recorded.push(v.line);
    else if (v.kind !== 'already-known' && v.kind !== 'already-follows') return null;
  }
  const current = derive(recorded, 0);
  return lines.map((line) => outcomeOf(decideSubmit(line, recorded, 0, current)));
};

/** analytic's O is the origin — a letter with a meaning of its own, never renamed */
const KEEP = new Set([...RESERVED, 'O']);
const contexts = PARITY_ROWS.filter((r) => roleOf(r, 'analytic') !== 'free').map((r) => stepsFor(r, 'analytic'));
const bases = basesFrom('analytic', COMMAND_CATALOG_ANALYTIC.filter((e) => !e.lane).map((e) => e.he), contexts);

describe('#2654 — analytic reads every sibling phrasing of a catalog sentence as it reads the sentence', () => {
  it('no new failing sibling, and no listed one that agrees now (the list only shrinks)', async () => {
    const report = await sweep('analytic', bases, runAnalytic, KEEP);
    if (writeMode()) writeKnown('analytic', report);
    expect(report.skipped).toEqual([]);
    expect(ratchetFaults(report.failing, readKnown('analytic'))).toEqual([]);
  }, 600_000);
});
