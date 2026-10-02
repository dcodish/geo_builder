/**
 * #1666 ([ADR-561](../../../docs/06-decisions.md#adr-561), ADR-W-107) — 2-D's thin lock on the shared
 * proof-target rows (`shell/__tests__/fixtures/proof-target-rows.ts`, docs/28 §5c).
 *
 * Measured on `main` e92b671f through this very door: after «משולש ABC», «הוכיחו כי AB ⊥ AC» and every
 * spelling around it (הוכח / הוכיחו ש / הראו כי / הראה כי / יש להוכיח / צריך להוכיח / prove that / show that,
 * «א.» item marker, «נתון AB = AC. הוכיחו כי …») COMMITTED `segment, segment, set-perpendicular` — the
 * figure was forced to satisfy the claim the student was asked to prove. «(1) …» and «1. …» escalated to the
 * paid model. Now each is refused BEFORE the parser, naming the proof sentence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG } from '@/parser/catalog';
import i18n from '@/i18n';
import { findProofTarget } from '../../../shell/proofTarget';
import { proofTargetFaults, type ProofGate } from '../../../shell/__tests__/fixtures/proof-target-rows';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const deps: SubmitDeps = {
    t,
    locale: 'he',
    ui: { setInputNote: (m) => calls.notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => calls.cleared++, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  return { deps, calls };
}

async function submit(line: string) {
  const d = makeDeps();
  await runSubmit(line, d.deps);
  expect(d.calls.cleared, `«${line}» is accepted`).toBe(1);
}

beforeEach(async () => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
  await submit('משולש ABC');
});

/** The REAL pre-LLM decision, asked on the triangle — the function `runSubmit` dispatches. */
const gate: ProofGate = async (line) => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
  const proof = v.kind === 'refuse' && 'key' in v.note && v.note.key === 'input.scope.proof-target';
  const text = v.kind === 'refuse' && 'key' in v.note ? plain(t(v.note.key, v.note.params as Record<string, unknown>)) : null;
  return { proof, recorded: v.kind === 'commit', text };
};

describe('#1666 — 2-D refuses a proof target at the submit gate', () => {
  it('the shared rows hold through decideDeterministic2D', async () => {
    expect(await proofTargetFaults(gate)).toEqual([]);
  });

  it('through runSubmit: nothing is committed, the model is never asked, and the note quotes the claim', async () => {
    const before = useGeoStore.getState().facts;
    const d = makeDeps();
    await runSubmit('נתון AB = AC. הוכיחו כי AB ⊥ AC', d.deps);
    expect(d.calls.cleared).toBe(0);
    expect(useGeoStore.getState().facts).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual([
      'זו טענה להוכחה, לא נתון — הכלי משרטט את הנתונים ואינו בודק הוכחות. הקלידו רק את מה שנתון בשאלה: "הוכיחו כי AB ⊥ AC"',
    ]);
  });

  it('the ✎ edit seam refuses it too, and the edited step is unchanged', async () => {
    await submit('AB = AC');
    const facts = useGeoStore.getState().facts;
    const key = groupKey(facts[facts.length - 1]);
    const notes: string[] = [];
    const ok = runEditCommit(key, 'הוכיחו כי AB ⊥ AC', { t, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(useGeoStore.getState().facts).toBe(facts);
    expect(notes.map(plain)).toEqual([expect.stringContaining('זו טענה להוכחה, לא נתון')]);
  });

  it('English: the refusal is in English', () => {
    expect(plain(i18n.t('input.scope.proof-target', { sentence: 'prove that AB ⊥ AC', lng: 'en' }) as string)).toBe(
      'That is a claim to prove, not a given — this tool draws the givens; it does not check proofs. Type only what the question gives: "prove that AB ⊥ AC"',
    );
  });

  it('no line of the 2-D catalog reads as a proof target', () => {
    const hits = COMMAND_CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && findProofTarget(s));
    expect(hits).toEqual([]);
  });
});
