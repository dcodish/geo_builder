/**
 * #782 (ADR-461) — the ✎ EDIT seam refuses what the submit seam refuses.
 *
 * The defect: `commitEdit` parsed the edited text and committed straight to `replaceGroup`, running none
 * of the `dropped*` gates and no span accounting. An edit that produced a PARTIAL parse therefore landed
 * silently with the student's stated content gone — the exact class the submit gates exist to refuse,
 * one seam over, and silently bypassable for every gate added since ADR-089.
 *
 * These run the REAL seam against the REAL store, parser and engine. The canonical case is the one the
 * issue names: editing a step to «מרכזו O. שתי נקודות על המעגל A ו B» must refuse rather than commit with
 * the two stated points dropped. The generalisation is what stops this recurring: the seam's verdict IS
 * the submit battery's verdict, asserted directly rather than re-derived, so a gate added to the battery
 * cannot reach one seam and miss the other.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runEditCommit } from '../editPipeline';
import type { EditDeps } from '../editPipeline';
import { honestyGateReport } from '../honestyGates';
import { groupKey, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { replay } from '@/store/geoStore';

function makeDeps() {
  const notes: string[] = [];
  const deps: EditDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    setInputNote: (m) => notes.push(m),
  };
  return { deps, notes };
}

/** Type an utterance the way submit does, and hand back the group key of the step it created. */
function submitStep(utterance: string): string {
  const st = useGeoStore.getState();
  const view = replay(st.facts, st.seed);
  const r = parse(utterance, buildParseCtx(view.construction, view.positions));
  expect(r.ok, `precondition: «${utterance}» must parse`).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  useGeoStore.getState().executeMany(r.commands, utterance);
  const facts = useGeoStore.getState().facts;
  return groupKey(facts[facts.length - 1]);
}

beforeEach(() => useGeoStore.getState().clear());

describe('#782 — the ✎ edit seam runs the honesty battery', () => {
  it('the canonical case: an edit that drops the two stated points REFUSES instead of committing', () => {
    const key = submitStep('מעגל שמרכזו O');
    const before = useGeoStore.getState().facts.length;
    const { deps, notes } = makeDeps();

    const ok = runEditCommit(key, 'מרכזו O. שתי נקודות על המעגל A ו B', deps);

    expect(ok, 'the edit must be refused, not committed').toBe(false);
    expect(useGeoStore.getState().facts.length, 'the fact list must be untouched by a refused edit').toBe(before);
    expect(notes.at(-1)).toMatch(/^steps\.editDropped/);
    // The note names the STUDENT'S tokens, never a gate name or internal state.
    expect(notes.at(-1)).not.toMatch(/dropped[A-Z]|unaccountedSpans/);
  });

  it('the seam’s verdict IS the battery’s verdict — a gate added to one cannot miss the other', () => {
    const key = submitStep('מעגל שמרכזו O');
    const st = useGeoStore.getState();
    const start = st.facts.findIndex((f) => groupKey(f) === key);
    const before = replay(st.facts.slice(0, start));
    const ectx = buildParseCtx(before.construction, before.positions);

    // For every edit text, the seam commits exactly when the shared battery says the parse is clean.
    for (const text of ['מרכזו O. שתי נקודות על המעגל A ו B', 'מעגל שמרכזו O']) {
      const r = parse(text, ectx);
      expect(r.ok, text).toBe(true);
      if (!r.ok) continue;
      const clean = honestyGateReport(text, r.commands, ectx).clean;
      const { deps } = makeDeps();
      expect(runEditCommit(key, text, deps), `«${text}»`).toBe(clean);
    }
  });

  it('a CLEAN edit still commits — the gate must not have turned the editor into a wall', () => {
    const key = submitStep('משולש ABC');
    const { deps, notes } = makeDeps();

    expect(runEditCommit(key, 'ריבוע ABCD', deps)).toBe(true);
    expect(notes.at(-1)).toBe(''); // the note is CLEARED on a successful commit
    expect(useGeoStore.getState().facts.some((f) => f.utterance === 'ריבוע ABCD')).toBe(true);
  });

  it('an UNREADABLE edit keeps its own older refusal (the ruling changed nothing about that path)', () => {
    const key = submitStep('משולש ABC');
    const { deps, notes } = makeDeps();

    expect(runEditCommit(key, 'קשקוש שאינו משפט', deps)).toBe(false);
    expect(notes.at(-1)).toBe('steps.editRefused');
  });

  it('a LOWERCASE-label edit keeps the #779 convention nudge, ahead of the battery', () => {
    const key = submitStep('משולש ABC');
    const { deps, notes } = makeDeps();

    const ok = runEditCommit(key, 'משולש abc', deps);
    expect(ok).toBe(false);
    expect(notes.at(-1)).toMatch(/^input\.scope\.lowercase-labels/);
  });

  it('a refused edit NEVER escalates to the LLM — the seam refuses inline (operator ruling 2026-08-25)', () => {
    // The module imports no LLM client at all; the assertion is structural, because a future edit that
    // wired one in would be a policy change, not an implementation detail.
    const key = submitStep('מעגל שמרכזו O');
    const { deps, notes } = makeDeps();
    runEditCommit(key, 'מרכזו O. שתי נקודות על המעגל A ו B', deps);
    // One note, no busy/spinner concern, no second attempt: exactly one refusal was produced.
    expect(notes).toHaveLength(1);
  });
});
