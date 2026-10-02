/**
 * #1666 (ADR-W-107) — analytic's thin lock on the shared proof-target rows
 * (`shell/__tests__/fixtures/proof-target-rows.ts`, docs/28 §5c).
 *
 * Analytic refused proof targets first (#1618, ADR-AG-187, `issue-1618-sentence-frame.test.ts` — unchanged).
 * #1666 moved its rule to `shell/proofTarget.ts` so 2-D and 3-D refuse the same spellings. Measured on `main`
 * e92b671f through `decideSubmit`: «יש להוכיח כי …», «צריך להוכיח כי …», «א. הוכיחו כי …», «(1) …», «1. …» and
 * the mixed line «נתון AB = AC. הוכיחו כי …» were refused as `bad-operand` — never recorded, but the message
 * blamed the operand instead of saying it is a claim to prove. Now each is `proof-target`, quoting the claim.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { derive } from '../engine/derive';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { findProofTarget } from '../../shell/proofTarget';
import { proofTargetFaults, type ProofGate } from '../../shell/__tests__/fixtures/proof-target-rows';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);

const LINES = ['A(0,0)', 'B(4,0)', 'C(0,3)'];
const current = derive(LINES, 0);

/** The REAL submit decision — the function `App.tsx` dispatches — asked on three coordinate points. */
const gate: ProofGate = (line) => {
  const v = decideSubmit(line, LINES, 0, current);
  const proof = v.kind === 'refused' && v.error.key === 'proof-target';
  return { proof, recorded: v.kind === 'record', text: v.kind === 'refused' ? errorText(v.error, t) : null };
};

describe('#1666 — analytic refuses a proof target at the submit gate (the shared rule)', () => {
  it('the shared rows hold through decideSubmit', async () => {
    expect(await proofTargetFaults(gate)).toEqual([]);
  });

  it('the mixed line quotes only the claim', () => {
    const v = decideSubmit('נתון B(4,0). הוכיחו כי AB ⊥ AC', LINES, 0, current);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(errorText(v.error, t)).toBe('זו טענה להוכחה, לא נתון — הכלי משרטט את הנתונים ואינו בודק הוכחות. הקלידו רק את מה שנתון בשאלה: "הוכיחו כי AB ⊥ AC"');
  });

  it('no line of the analytic catalog reads as a proof target', () => {
    const hits = COMMAND_CATALOG_ANALYTIC.flatMap((e) => [e.he, e.en]).filter((s) => s && findProofTarget(s));
    expect(hits).toEqual([]);
  });
});
