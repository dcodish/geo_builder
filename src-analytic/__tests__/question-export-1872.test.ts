/**
 * #1872 (ADR-AG-269) — «הורידו שאלה» in the analytic builder: WHICH lines the «נתון:» list prints.
 *
 * Operator ruling W5 (2026-10-08): "Like 2-D". Every expectation below that has a 2-D twin was measured
 * on 2-D's `questionLines` at 403efe66 through 2-D's real parser:
 *   «משולש ABC · AD»                       → ["משולש ABC"]
 *   «משולש ABC · D על BC · AD»             → ["משולש ABC"]
 *   «משולש ABC · D על BC · זווית BAD = 30» → ["משולש ABC","D על BC","∠BAD = 30"]
 *   «משולש ABC · הנקודה E»                 → ["משולש ABC"]
 *   «משולש ABC · הישר BC»                  → ["משולש ABC"]
 *   «משולש ABC · AD · זווית BAD = 30»      → ["משולש ABC","AD","∠BAD = 30"]
 * The one designed difference: 2-D prints «∠BAD = 30» where its renderer covers the line; this tree has
 * no fact → sentence renderer (#1468, held), so the student's own sentence prints (`?? utterance`).
 *
 * The locks CALL the real parser and the real derivation — the object ids come from `derive`, as the App's do.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { questionLines } from '../app/questionLines';
import { activeOf } from '../app/active';
import { loadAnalyticSession } from '../app/loadSession';
import { derive } from '../engine/derive';
import { spokenPart, spokenSentence, useAnalyticStore } from '../store/useAnalyticStore';

/** What the App computes: the givens over the ACTIVE figure's object ids. */
const givens = (lines: string[], disabled: number[] = [], spokenFor: Record<number, string> = {}) => {
  const d = derive(activeOf(lines, disabled));
  expect(d.faults, 'the sequence must build — the export is read off an accepted figure').toEqual([]);
  return questionLines(lines, disabled, spokenFor, new Set(d.construction.objects.map((o) => o.id)));
};

describe('#1872 — the analytic «נתון:» list follows 2-D (W5)', () => {
  it('entry order, one line per row, as the student wrote it', () => {
    expect(givens(['A(1,2)', 'B(5,7)', 'C(0,4)', 'משולש ABC'])).toEqual(['A(1,2)', 'B(5,7)', 'C(0,4)', 'משולש ABC']);
  });

  it('no lines → no givens, so the button is disabled', () => {
    expect(givens([])).toEqual([]);
  });

  it('a muted line is not a given', () => {
    expect(givens(['משולש ABC', 'AB = 5', 'זווית BAC = 40'], [1])).toEqual(['משולש ABC', 'זווית BAC = 40']);
  });

  it('a bare segment is pure ink — omitted (2-D: «משולש ABC · AD» → only the triangle)', () => {
    expect(givens(['משולש ABC', 'AD'])).toEqual(['משולש ABC']);
  });

  it('«הקטע AB» between stated points is ink too', () => {
    expect(givens(['A(1,2)', 'B(5,7)', 'הקטע AB'])).toEqual(['A(1,2)', 'B(5,7)']);
  });

  it('a bare drawn line and a bare named point are scaffolding (2-D: «הישר BC», «הנקודה E»)', () => {
    expect(givens(['משולש ABC', 'הישר BC'])).toEqual(['משולש ABC']);
    expect(givens(['משולש ABC', 'הנקודה E'])).toEqual(['משולש ABC']);
  });

  it('a marker whose only consumer is omitted ink cascades away with it (2-D: «D על BC · AD»)', () => {
    expect(givens(['משולש ABC', 'D על BC', 'AD'])).toEqual(['משולש ABC']);
  });

  it('a marker a LATER given refers to is a definition the reader needs — kept', () => {
    expect(givens(['משולש ABC', 'D על BC', 'זווית BAD = 30'])).toEqual(['משולש ABC', 'D על BC', 'זווית BAD = 30']);
  });

  it('a bare segment whose NEW endpoint a later given refers to is kept (2-D: «AD · זווית BAD = 30»)', () => {
    expect(givens(['משולש ABC', 'AD', 'זווית BAD = 30'])).toEqual(['משולש ABC', 'AD', 'זווית BAD = 30']);
  });

  it('a membership statement about an EXISTING point is a given (M1) — and keeps the line that named it', () => {
    expect(givens(['משולש ABC', 'AD', 'D על BC'])).toEqual(['משולש ABC', 'AD', 'D על BC']);
  });

  it('a value always makes a given: coordinates, a length, a derived point', () => {
    expect(givens(['משולש ABC', 'E(a,3)'])).toEqual(['משולש ABC', 'E(a,3)']);
    expect(givens(['משולש ABC', 'AB = 5'])).toEqual(['משולש ABC', 'AB = 5']);
    expect(givens(['משולש ABC', 'M אמצע AB'])).toEqual(['משולש ABC', 'M אמצע AB']);
  });

  it('a fallback-built statement prints ONCE, in the student’s words — never the machine lines (ADR-AG-172)', () => {
    const spoken = 'התיכון מ-B לצלע AC';
    const spokenFor = { 1: spokenPart(spoken, 0, 2), 2: spokenPart(spoken, 1, 2) };
    expect(givens(['משולש ABC', 'M אמצע AC', 'BM'], [], spokenFor)).toEqual(['משולש ABC', spoken]);
  });

  it('…and a one-row fallback statement prints its sentence as written', () => {
    expect(givens(['משולש ABC', 'M אמצע AC'], [], { 1: spokenPart('M באמצע AC', 0, 1) })).toEqual(['משולש ABC', 'M באמצע AC']);
  });

  it('the part marker round-trips through the store’s own pair of functions', () => {
    expect(spokenSentence(spokenPart('שלום (עולם)', 1, 3))).toBe('שלום (עולם)');
    expect(spokenSentence(spokenPart('x', 0, 1))).toBe('x');
  });
});

describe('#1872 — rule 4: the saved fixture drives the list end to end, through the real load path', () => {
  beforeEach(() => useAnalyticStore.getState().clearAll());

  it('question-export-1872.analytic.json loads every line and prints exactly its givens', () => {
    const file = path.join(__dirname, 'fixtures', 'question-export-1872.analytic.json');
    const env = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const loaded = loadAnalyticSession(env, 'fixture');
    expect(loaded.failed).toBe(0);
    const { lines, disabled, spokenFor } = useAnalyticStore.getState();
    expect(lines).toEqual(env.lines);
    expect(givens(lines, disabled, spokenFor)).toEqual(['משולש ABC', 'D על BC', 'זווית BAD = 30', 'התיכון מ-B לצלע AC']);
  });
});

describe('#1872 — the App wires the shared composer with this list', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('the button is gated on there being a given, not on the line count', () => {
    expect(app).toMatch(/key="saveQuestion".*disabled=\{questionGivens\.length === 0\}/);
  });

  it('the document prints the same list the gate read', () => {
    expect(app).toMatch(/lines: questionGivens,/);
  });
});
