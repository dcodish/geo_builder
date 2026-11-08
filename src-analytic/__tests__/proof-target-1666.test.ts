/**
 * #1666 (ADR-W-107) — analytic's thin lock on the shared proof-target rows
 * (`shell/__tests__/fixtures/proof-target-rows.ts`, docs/28 §5c).
 *
 * Analytic refused proof targets first (#1618, ADR-AG-187, `issue-1618-sentence-frame.test.ts` — unchanged).
 * #1666 moved its rule to `shell/proofTarget.ts` so 2-D and 3-D refuse the same spellings. Measured on `main`
 * e92b671f through `decideSubmit`: «יש להוכיח כי …», «צריך להוכיח כי …», «א. הוכיחו כי …», «(1) …», «1. …» and
 * the mixed line «נתון AB = AC. הוכיחו כי …» were refused as `bad-operand` — never recorded, but the message
 * blamed the operand instead of saying it is a claim to prove. Now each is `proof-target`, quoting the claim.
 *
 * #2492 ([ADR-W-194](../../docs/06w-decisions-workspace.md#adr-w-194)): the refusal ends by saying where the claim can be
 * checked: the data panel, whose ask box answers the claim's quantities (operator ruling 2026-10-24, ballot e19). The
 * panel and its button are named by the keys the App draws them with.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { derive } from '../engine/derive';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { findProofTarget } from '../../shell/proofTarget';
import { proofTargetFaults, type ProofGate } from '../../shell/__tests__/fixtures/proof-target-rows';
import { PANEL_POINTER, PROOF_TARGET_SENTENCE, panelDrawnFaults } from '../../shell/__tests__/fixtures/proof-target-check-2492';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

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
    if (v.kind === 'refused') {
      expect(errorText(v.error, t)).toBe(`${PROOF_TARGET_SENTENCE.he('הוכיחו כי AB ⊥ AC')} ${PANEL_POINTER.he('נתונים', 'שאלו')}`);
      expect(errorText(v.error, tEn)).toBe(`${PROOF_TARGET_SENTENCE.en('הוכיחו כי AB ⊥ AC')} ${PANEL_POINTER.en('Data', 'Ask')}`);
    }
  });

  // #2492: the panel and the button the refusal names are this App's, read from the keys it draws them with
  it.each([
    ['he', t],
    ['en', tEn],
  ] as const)('the refusal names the panel and the ask button by their own labels (%s)', (_lng, tr) => {
    const v = decideSubmit('הוכיחו כי AB = AC', LINES, 0, current);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(errorText(v.error, tr).endsWith(tr('suite.refusal.proofTargetCheckPanel', { panel: tr('dataTitle'), ask: tr('askAdd') }))).toBe(true);
    const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    expect(panelDrawnFaults(app, { panel: 'dataTitle', ask: 'askAdd' })).toEqual([]);
  });

  it('no line of the analytic catalog reads as a proof target', () => {
    const hits = COMMAND_CATALOG_ANALYTIC.flatMap((e) => [e.he, e.en]).filter((s) => s && findProofTarget(s));
    expect(hits).toEqual([]);
  });
});
