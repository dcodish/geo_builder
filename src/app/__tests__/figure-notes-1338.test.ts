/**
 * #1338 ([ADR-543](../../../docs/06-decisions.md#adr-543)) — A MESSAGE ABOUT THE FIGURE DIES WITH THE
 * FACTS IT WAS ABOUT.
 *
 * Operator, 2026-09-21, playing round #1332: *"when there is an error message of any kind and user
 * removes an input line (presses x), the shape gets recalculated correctly but the error message
 * stays"*. The banner is React state set at submit time; the row's ✕ calls the store's `remove`, which
 * re-folds and redraws and never touched it.
 *
 * The lock drives the REAL store through the REAL subscription — the decision is not re-implemented
 * here ([ADR-W-053](../../../docs/06w-decisions-workspace.md)), so a change that stops clearing the
 * notes turns this red rather than passing on a private copy of the rule.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { subscribeFigureNotes, clearFigureNotes, type FigureNoteSinks } from '../figureNotes';
import { useGeoStore } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';

function sinks() {
  const state = { inputNote: '', llmDropped: ['x'] as string[], renameNote: '', altNote: '' };
  const ui: FigureNoteSinks = {
    setInputNote: (m) => (state.inputNote = m),
    setLlmDropped: (s) => (state.llmDropped = s),
    setRenameNote: (m) => (state.renameNote = m),
    setAltNote: (m) => (state.altNote = m),
  };
  /** Put a note of every kind on screen, the way a submit would. */
  const raise = () => {
    state.inputNote = 'לא נמצאה תצורה שמקיימת את כל הדרישות יחד';
    state.llmDropped = ['a dropped step'];
    state.renameNote = 'rename failed';
    state.altNote = 'only configuration';
  };
  const clean = () =>
    state.inputNote === '' && state.llmDropped.length === 0 && state.renameNote === '' && state.altNote === '';
  return { ui, state, raise, clean };
}

beforeEach(() => {
  useGeoStore.getState().clear();
});

describe('#1338 — a fact mutation clears every figure-level note', () => {
  it('the reported door: ✕ on a row clears the banner', () => {
    const { ui, raise, clean } = sinks();
    const stop = subscribeFigureNotes(useGeoStore.subscribe, ui);
    try {
      useGeoStore.getState().applyView({ facts: factsOf(['משולש ABC', 'BC = 4'] as never), seed: 0 });
      raise();
      expect(clean()).toBe(false);

      const last = useGeoStore.getState().facts.at(-1)!;
      useGeoStore.getState().remove(last.id);

      expect(clean()).toBe(true);
    } finally {
      stop();
    }
  });

  /**
   * The doors the report did not name. Enumerating them here is the point: the subscription is on the
   * FACTS, so every one of them is the same event, and a seventh added later needs no change.
   */
  it.each([
    ['mute (toggle)', () => useGeoStore.getState().toggle(useGeoStore.getState().facts.at(-1)!.id)],
    ['undo', () => useGeoStore.temporal.getState().undo()],
    ['clear', () => useGeoStore.getState().clear()],
  ])('%s clears them too', (_door, act) => {
    const { ui, raise, clean } = sinks();
    const stop = subscribeFigureNotes(useGeoStore.subscribe, ui);
    try {
      useGeoStore.getState().applyView({ facts: factsOf(['משולש ABC', 'BC = 4'] as never), seed: 0 });
      raise();
      act();
      expect(clean()).toBe(true);
    } finally {
      stop();
    }
  });

  /**
   * Cycling configurations keeps the same STATEMENTS, so a note about them is still true — the
   * subscription is deliberately on the facts and not on the seed.
   */
  it('changing only the SEED leaves the notes alone', () => {
    const { ui, raise, clean } = sinks();
    const stop = subscribeFigureNotes(useGeoStore.subscribe, ui);
    try {
      const facts = factsOf(['משולש ABC', 'BC = 4'] as never);
      useGeoStore.getState().applyView({ facts, seed: 0 });
      raise();
      useGeoStore.getState().applyView({ facts, seed: 3 });
      expect(clean()).toBe(false);
    } finally {
      stop();
    }
  });

  it('clearFigureNotes clears EVERY note, so a new one cannot be added to only half', () => {
    const { ui, state, raise } = sinks();
    raise();
    clearFigureNotes(ui);
    expect(state).toEqual({ inputNote: '', llmDropped: [], renameNote: '', altNote: '' });
  });

  it('unsubscribing really stops it — the effect can clean up', () => {
    const { ui, raise, clean } = sinks();
    const stop = subscribeFigureNotes(useGeoStore.subscribe, ui);
    stop();
    useGeoStore.getState().applyView({ facts: factsOf(['משולש ABC'] as never), seed: 0 });
    raise();
    useGeoStore.getState().remove(useGeoStore.getState().facts.at(-1)!.id);
    expect(clean()).toBe(false);
  });
});

/**
 * THE WIRING, ASSERTED SEPARATELY — an unexercised guard passes by checking nothing (#955's lesson).
 *
 * Everything above drives `subscribeFigureNotes` directly, so all of it stays green if `App.tsx` stops
 * calling it and the banner goes stale again. `App.tsx` cannot be rendered in a unit test, so the
 * wiring is read from the source — the same device `triage-mirror` and `lexicon-consumers` use to
 * assert a call site exists.
 */
describe('#1338 — App.tsx actually subscribes', () => {
  const src = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

  it('imports the subscription and mounts it on the store', () => {
    expect(src).toContain("from '@/app/figureNotes'");
    expect(src).toMatch(/subscribeFigureNotes\(\s*useGeoStore\.subscribe/);
  });

  it('hands it every note sink, so none is left behind', () => {
    const call = src.slice(src.indexOf('subscribeFigureNotes('));
    const body = call.slice(0, call.indexOf('}'));
    for (const sink of ['setInputNote', 'setLlmDropped', 'setRenameNote', 'setAltNote']) {
      expect(body, sink).toContain(sink);
    }
  });
});
