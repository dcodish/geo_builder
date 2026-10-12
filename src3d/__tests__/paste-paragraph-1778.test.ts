/**
 * #1778 (ADR-W-125) — 3-D's thin lock for `shell/__tests__/fixtures/paste-paragraph-rows.ts`.
 *
 * `App3.tsx` submits the box through `submitTyped` (shell), handing each sentence to its one-sentence submit:
 * `decideDeterministic3` on the LIVE store, the store's `dispatchVerdict`, and the sentence is taken exactly
 * when no error is left. A `not-understood` sentence would go to the model; here the model answers nothing
 * (standing rule 2), so it is kept — as it would be in the app.
 */
import { beforeEach } from 'vitest';
import { expect } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { useGeo3 } from '../store/store3';
import { submitTyped, type SentenceOutcome } from '../../shell/sentences';
import { pasteSuite, type PasteRunner } from '../../shell/__tests__/fixtures/paste-paragraph-rows';

const one = (raw: string): SentenceOutcome => {
  const v = decideDeterministic3(useGeo3.getState(), raw);
  if (v.kind === 'guided') return 'kept';
  useGeo3.getState().dispatchVerdict(v);
  return useGeo3.getState().lastError ? 'kept' : 'consumed';
};

const submitBox = async (raw: string): Promise<string> => {
  let box = raw;
  await submitTyped(raw, one, (t) => {
    box = t;
  });
  return box;
};

const run: PasteRunner = async (setup, paste) => {
  useGeo3.getState().clear();
  for (const l of setup) expect(await submitBox(l), `«${l}» is taken`).toBe('');
  const before = useGeo3.getState().facts.length;
  const box = await submitBox(paste);
  return { rows: useGeo3.getState().facts.slice(before).map((f) => f.utterance), box };
};

beforeEach(() => useGeo3.getState().clear());

pasteSuite('3d', run);
