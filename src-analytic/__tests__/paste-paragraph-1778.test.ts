/**
 * #1778 (ADR-W-125) — analytic's thin lock for `shell/__tests__/fixtures/paste-paragraph-rows.ts`.
 *
 * `App.tsx` submits the box through `submitTyped` (shell), handing each sentence to its one-sentence submit,
 * which decides with `decideSubmit` on the LIVE store and answers `sentenceOutcome(verdict)`. This runner calls
 * those same functions; a refusal that would reach the model answers `kept`, as the model answering nothing
 * would (standing rule 2: no live call).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { commitRecord, decideSubmit, reachesFallback, sentenceOutcome } from '../app/submit';
import { activeOf } from '../app/active';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { submitTyped, type SentenceOutcome } from '../../shell/sentences';
import { pasteSuite, type PasteRunner } from '../../shell/__tests__/fixtures/paste-paragraph-rows';

const one = (raw: string): SentenceOutcome => {
  const st = useAnalyticStore.getState();
  const v = decideSubmit(raw, activeOf(st.lines, st.disabled), st.seed);
  if (v.kind === 'record') commitRecord(v, st.recordLine, (k) => k);
  if (reachesFallback(v)) return 'kept';
  return sentenceOutcome(v);
};

const submitBox = async (raw: string): Promise<string> => {
  let box = raw;
  await submitTyped(raw, one, (t) => {
    box = t;
  });
  return box;
};

const run: PasteRunner = async (setup, paste) => {
  useAnalyticStore.getState().clearAll();
  for (const l of setup) expect(await submitBox(l), `«${l}» is taken`).toBe('');
  const before = useAnalyticStore.getState().lines.length;
  const box = await submitBox(paste);
  return { rows: useAnalyticStore.getState().lines.slice(before), box };
};

beforeEach(() => useAnalyticStore.getState().clearAll());

pasteSuite('analytic', run);

describe('#1778 — the reported paste (prod session 4v5jun3l, 2026-10-04)', () => {
  const LRM = '‎';
  const REPORTED = `דרך הנקודה ${LRM}P${LRM} מעבירים אנך לישר ${LRM}AB${LRM}. האנך חותך את הישר ${LRM}y = 7${LRM} בנקודה ${LRM}C${LRM}.`;

  it('is read as two sentences; the first is the open #1775 gap, so the chain stops there and keeps the whole paste', async () => {
    const r = await run(['A(0,0)', 'B(4,2)', 'P(1,3)'], REPORTED);
    expect(r.rows).toEqual([]);
    expect(r.box).toBe(REPORTED);
    // the sentence that stopped it is decided ALONE — its refusal (or its model call) names it, never the paragraph
    const v = decideSubmit('דרך הנקודה P מעבירים אנך לישר AB', ['A(0,0)', 'B(4,2)', 'P(1,3)'], 0);
    expect(v.kind === 'refused' && v.error.detail).toBe('דרך הנקודה P מעבירים אנך לישר AB');
  });

  it('with its first sentence in a spelling the builder reads, the same paste builds the perpendicular and C', async () => {
    const r = await run(['A(0,0)', 'B(4,2)', 'P(1,3)'], REPORTED.replace(`דרך הנקודה ${LRM}P${LRM} מעבירים אנך`, `האנך מהנקודה ${LRM}P${LRM}`));
    expect(r.rows).toEqual(['האנך מהנקודה P לישר AB', 'האנך חותך את הישר y = 7 בנקודה C']);
    expect(r.box).toBe('');
  });
});
