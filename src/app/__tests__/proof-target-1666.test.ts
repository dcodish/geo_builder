/**
 * #1666 ([ADR-561](../../../docs/06-decisions.md#adr-561), ADR-W-107) — 2-D's thin lock on the shared
 * proof-target rows (`shell/__tests__/fixtures/proof-target-rows.ts`, docs/28 §5c).
 *
 * Measured on `main` e92b671f through this very door: after «משולש ABC», «הוכיחו כי AB ⊥ AC» and every
 * spelling around it (הוכח / הוכיחו ש / הראו כי / הראה כי / יש להוכיח / צריך להוכיח / prove that / show that,
 * «א.» item marker, «נתון AB = AC. הוכיחו כי …») COMMITTED `segment, segment, set-perpendicular` — the
 * figure was forced to satisfy the claim the student was asked to prove. «(1) …» and «1. …» escalated to the
 * paid model. Now each is refused BEFORE the parser, naming the proof sentence.
 *
 * #2492 ([ADR-W-192](../../../docs/06w-decisions-workspace.md#adr-w-192)): the refusal is the suite's sentence, then
 * the operator's line naming the button that checks a claim (2026-10-24, verbatim), its label NESTED from the key that
 * labels the button. One note (`proofTargetNote`) for both seams, rendered by `renderNote`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import * as fs from 'node:fs';
import * as path from 'node:path';
import { decideDeterministic2D, proofTargetNote } from '../decideDeterministic';
import { renderNote } from '../renderNote';
import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG } from '@/parser/catalog';
import i18n from '@/i18n';
import { findProofTarget, PROOF_TARGET_KEY } from '../../../shell/proofTarget';
import { proofTargetFaults, type ProofGate } from '../../../shell/__tests__/fixtures/proof-target-rows';
import { PROOF_TARGET_SENTENCE, RULED_2D_CHECK_HE } from '../../../shell/__tests__/fixtures/proof-target-check-2492';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
const tEn = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'en' }) as string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
/** A note as the input line shows it — the one renderer both seams use. */
const shown = (n: Parameters<typeof renderNote>[0], said: string, tr = t) => plain(renderNote(n, { t: tr, said, explain: (raw) => raw }));
/** The whole refusal, Hebrew: the suite sentence quoting the claim, then the operator's line. */
const REFUSAL = (claim: string) => `${PROOF_TARGET_SENTENCE.he(claim)} ${RULED_2D_CHECK_HE}`;

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
  const proof = v.kind === 'refuse' && 'key' in v.note && v.note.key === PROOF_TARGET_KEY;
  const text = v.kind === 'refuse' ? shown(v.note, line) : null;
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
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual([REFUSAL('הוכיחו כי AB ⊥ AC')]);
  });

  it('the ✎ edit seam refuses it too, and the edited step is unchanged', async () => {
    await submit('AB = AC');
    const facts = useGeoStore.getState().facts;
    const key = groupKey(facts[facts.length - 1]);
    const notes: string[] = [];
    const ok = runEditCommit(key, 'הוכיחו כי AB ⊥ AC', { t, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(useGeoStore.getState().facts).toBe(facts);
    // #2492: the edit seam words it exactly as the submit seam does, the button line included
    expect(notes.map(plain)).toEqual([REFUSAL('הוכיחו כי AB ⊥ AC')]);
  });

  it('English: the refusal is in English, the button named by its English label', () => {
    expect(shown(proofTargetNote('prove that AB ⊥ AC'), 'prove that AB ⊥ AC', tEn)).toBe(
      `${PROOF_TARGET_SENTENCE.en('prove that AB ⊥ AC')} You can check whether the claim is true by pressing the Show equal sides & angles button.`,
    );
  });

  // #2492 pickup check 2: i18next NESTS the button's label into the line, through 2-D's real instance, in a note that
  // also carries the `{{sentence}}` param; and the name it teaches is the name on the button, in both languages.
  it.each([
    ['he', t],
    ['en', tEn],
  ] as const)('the line names the button by the text the button carries (%s)', (_lng, tr) => {
    const line = plain(tr('input.scope.proofTargetCheck'));
    expect(line).not.toContain('$t(');
    expect(line).toContain(plain(tr('actions.viewRelations')));
    expect(shown(proofTargetNote('הוכיחו כי AB = AC'), 'הוכיחו כי AB = AC', tr).endsWith(line)).toBe(true);
  });

  it("Hebrew: the line is the operator's sentence, byte for byte", () => {
    expect(plain(t('input.scope.proofTargetCheck'))).toBe(RULED_2D_CHECK_HE);
  });

  // docs/17 §9 «a taught remedy is a grammar claim»: the button the refusal names is one 2-D draws, under that key
  it('the button the line names is rendered by the App from the same key', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(app).toContain("t('actions.viewRelations')");
  });

  // #2492 pickup check 5: typed FIRST, on an empty canvas, the refusal is the same; the button is not on screen yet
  // (the data panel shows it once a given exists) — measured and recorded on the play sheet, no carve-out (ruling: all cases)
  it('on an empty canvas the refusal is the same', async () => {
    useGeoStore.getState().clear();
    const d = makeDeps();
    await runSubmit('הוכיחו כי AB = AC', d.deps);
    expect(d.calls.cleared).toBe(0);
    expect(useGeoStore.getState().facts).toEqual([]);
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual([REFUSAL('הוכיחו כי AB = AC')]);
  });

  it('no line of the 2-D catalog reads as a proof target', () => {
    const hits = COMMAND_CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && findProofTarget(s));
    expect(hits).toEqual([]);
  });
});
