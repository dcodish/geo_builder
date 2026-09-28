/**
 * A HEBREW SESSION IS TAUGHT HEBREW (#1297, ADR-AG-172 — the 2026-09-27 scope: "student's words
 * now, form later").
 *
 * Operator: *"the syntax written is in english so user will not learn how to write it"* — one
 * Hebrew sentence, escalated, and the model wrote English canonical rows into his fact list. Two
 * structural changes, no prompt-discipline reliance (#1251's argument): the PROMPT speaks one
 * language (the session's locale renders one vocabulary column and a HARD language rule), and the
 * ROWS display the student's own sentence — the machine lines stay the stored truth, so replay is
 * pure over the lines exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';

describe('#1297 — the rows show the student’s own sentence', () => {
  const store = useAnalyticStore;

  it('recordLlmLines stores the MACHINE lines and displays the SENTENCE, with part markers past one', () => {
    store.getState().clearAll();
    store.getState().recordLine('A(0,0)');
    store.getState().recordLlmLines('משוואת ישר 1 היא 2x-y+8=0', ['line l1: 2x-y+8=0']);
    store.getState().recordLlmLines('שני ישרים נוספים', ['line l2: x+3y-10=0', 'line l3: y=x']);
    const s = store.getState();
    // Replay truth: the machine lines, unchanged.
    expect(s.lines).toEqual(['A(0,0)', 'line l1: 2x-y+8=0', 'line l2: x+3y-10=0', 'line l3: y=x']);
    // Display truth: the student's sentences, never the model's rows.
    expect(s.spokenFor[1]).toBe('משוואת ישר 1 היא 2x-y+8=0');
    expect(s.spokenFor[2]).toBe('שני ישרים נוספים (1/2)');
    expect(s.spokenFor[3]).toBe('שני ישרים נוספים (2/2)');
    expect(s.spokenFor[0]).toBeUndefined();
  });

  it('annotations FOLLOW their lines when an earlier row is removed, and an edited row drops its annotation', () => {
    store.getState().clearAll();
    store.getState().recordLine('A(0,0)');
    store.getState().recordLlmLines('המשפט שלי', ['line l1: y=x']);
    store.getState().removeLine(0);
    expect(store.getState().spokenFor[0]).toBe('המשפט שלי');
    store.getState().replaceLine(0, 'line l1: y=2x');
    expect(store.getState().spokenFor[0]).toBeUndefined();
  });

  it('the annotation survives save → restore', () => {
    store.getState().clearAll();
    store.getState().recordLlmLines('בעברית', ['line l1: y=x']);
    const saved = store.getState().serialize();
    expect(saved.spokenFor).toEqual({ 0: 'בעברית' });
    store.getState().clearAll();
    store.getState().restore(saved);
    expect(store.getState().spokenFor[0]).toBe('בעברית');
    // An old file without the field restores clean.
    store.getState().restore({ lines: ['A(0,0)'] });
    expect(store.getState().spokenFor).toEqual({});
  });
});
