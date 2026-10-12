/**
 * #1778 (ADR-W-125) — complex's thin lock for `shell/__tests__/fixtures/paste-paragraph-rows.ts`.
 *
 * `App.tsx` submits the box through `submitTyped` (shell), each sentence through `submitLine` — the one entry
 * point the input box uses (ADR-CX-027) — taken exactly when `submitLine` accepts it.
 */
import { beforeEach, expect } from 'vitest';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';
import { submitTyped } from '../../shell/sentences';
import { pasteSuite, type PasteRunner } from '../../shell/__tests__/fixtures/paste-paragraph-rows';

const submitBox = async (raw: string): Promise<string> => {
  let box = raw;
  await submitTyped(raw, (s) => (submitLine(s) ? 'consumed' : 'kept'), (t) => {
    box = t;
  });
  return box;
};

const run: PasteRunner = async (setup, paste) => {
  useComplexStore.getState().clearAll();
  for (const l of setup) expect(await submitBox(l), `«${l}» is taken`).toBe('');
  const before = useComplexStore.getState().lines.length;
  const box = await submitBox(paste);
  return { rows: useComplexStore.getState().lines.slice(before), box };
};

beforeEach(() => useComplexStore.getState().clearAll());

pasteSuite('complex', run);
