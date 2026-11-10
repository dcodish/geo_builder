/**
 * #2654 idea 3 (ADR-W-171) — the complex builder's sibling-phrasing ratchet
 * (`shell/__tests__/fixtures/sibling-phrasings.ts`).
 *
 * Every catalog sentence, and every meaning-preserving sibling spelling of it, are DECIDED by
 * `decideSubmitCx` — the whole submit decision `submitLine` dispatches — on an empty figure (the complex
 * catalog has no parity rows; each specimen is typed alone). The letters are never renamed here: z, w, u
 * name kinds of number, not points (ADR-CX-047). A sibling whose verdict or code differs from its base's
 * is a failing variant; the known ones are rows of `shell/__tests__/fixtures/sibling-phrasings/known-complex.json`,
 * which only shrinks. No model is called (standing rule 2).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmitCx, type SubmitVerdictCx } from '../app/submit';
import { CATALOG } from '../parser/catalog';
import { basesFrom, ratchetFaults, sweep, type DecideRunner, type Outcome } from '../../shell/__tests__/fixtures/sibling-phrasings';
import { readKnown, writeKnown, writeMode } from '../../shell/__tests__/fixtures/sibling-phrasings-io';

function outcomeOf(v: SubmitVerdictCx): Outcome {
  switch (v.kind) {
    // #2790 (ADR-CX-089): a held line is a row too, with the already-held note
    case 'record':
      return v.note ? { verdict: 'builds', code: v.note.key } : { verdict: 'builds' };
    case 'ask':
      return { verdict: 'asks', code: 'ask-lane' };
    case 'refuse':
      return { verdict: v.error.key === 'not-handled' ? 'not-handled' : 'refused', code: v.error.key };
  }
}

const runComplex: DecideRunner = (context, lines) => {
  const recorded: string[] = [];
  let seed = 0;
  for (const line of context) {
    const v = decideSubmitCx({ lines: recorded, disabled: [], seed }, line);
    if (v.kind !== 'record') return null;
    recorded.push(v.line);
    seed = v.seed;
  }
  return lines.map((line) => outcomeOf(decideSubmitCx({ lines: recorded, disabled: [], seed }, line)));
};

const bases = basesFrom('complex', CATALOG.map((e) => e.he), []);

describe('#2654 — the complex builder reads every sibling phrasing of a catalog sentence as it reads the sentence', () => {
  it('no new failing sibling, and no listed one that agrees now (the list only shrinks)', async () => {
    const report = await sweep('complex', bases, runComplex);
    if (writeMode()) writeKnown('complex', report);
    expect(report.skipped).toEqual([]);
    expect(ratchetFaults(report.failing, readKnown('complex'))).toEqual([]);
  }, 600_000);
});
