/**
 * #1837 ([ADR-710](../../../docs/06-decisions.md#adr-710), ADR-W-142) — 2-D's thin lock on the shared
 * radian-angle rows (`shell/__tests__/fixtures/radian-angle-rows.ts`, docs/28 §5c).
 *
 * Measured on `main` b0e9dbea through this very door, after «משולש ABC»: «∠ABC = π/2», «∠ABC = π»,
 * «זווית ABC = π/3», «זווית ABC שווה ל-π/4», «∠ABC = 2π/3» and every spelling around them ESCALATED to the
 * AI fallback (ADR-600 had stopped π committing as a free letter; nothing answered it), and «∠ABC = pi/2»
 * COMMITTED `set-angle B = 2` — 2°, with a green ✓. Operator ruling 2026-10-07: *"Refuse and teach degrees"*.
 * Now each is refused BEFORE the parser, `guided`, with the ruled sentence; the model is never asked.
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
import { findRadianAngle } from '../../../shell/radianAngle';
import { radianAngleFaults, RADIAN_SENTENCE_EN, RADIAN_SENTENCE_HE, type RadianGate } from '../../../shell/__tests__/fixtures/radian-angle-rows';

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
const gate: RadianGate = async (line) => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
  const radian = v.kind === 'refuse' && 'key' in v.note && v.note.key === 'input.scope.radian-angle' && v.category === 'guided';
  const text = v.kind === 'refuse' && 'key' in v.note ? plain(t(v.note.key, v.note.params as Record<string, unknown>)) : null;
  return { radian, recorded: v.kind === 'commit', escalated: v.kind === 'escalate', text };
};

describe('#1837 — 2-D refuses an angle written in radians at the submit gate', () => {
  it('the shared rows hold through decideDeterministic2D', async () => {
    expect(await radianAngleFaults(gate)).toEqual([]);
  });

  it('through runSubmit: nothing is committed, the model is never asked, and the note teaches degrees', async () => {
    const before = useGeoStore.getState().facts;
    const d = makeDeps();
    await runSubmit('∠ABC = π/2', d.deps);
    expect(d.calls.cleared).toBe(0);
    expect(useGeoStore.getState().facts).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual([RADIAN_SENTENCE_HE]);
  });

  it('the remedy the note teaches builds: «∠ABC = 90»', async () => {
    await submit('∠ABC = 90');
  });

  it('the ✎ edit seam refuses it too, and the edited step is unchanged', async () => {
    await submit('∠ABC = 60');
    const facts = useGeoStore.getState().facts;
    const key = groupKey(facts[facts.length - 1]);
    const notes: string[] = [];
    const ok = runEditCommit(key, '∠ABC = π/3', { t, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(useGeoStore.getState().facts).toBe(facts);
    expect(notes.map(plain)).toEqual([RADIAN_SENTENCE_HE]);
  });

  it('English: the sentence is its direct translation', () => {
    expect(plain(i18n.t('input.scope.radian-angle', { lng: 'en' }) as string)).toBe(RADIAN_SENTENCE_EN);
  });

  it('no line of the 2-D catalog reads as an angle in radians', () => {
    const hits = COMMAND_CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && findRadianAngle(s));
    expect(hits).toEqual([]);
  });
});
