/**
 * #1278 (ADR-AG-186) — the first live analytic LLM call answered in English PROSE where a canonical line
 * existed: «צייר ישר שעובר דרך (2,3) ושיפועו 4» → `{"steps":["a line through (2,3) with slope 4"]}`.
 *
 * Root cause, two halves: (1) the prompt stated only ADR-052's prohibition ("never invent an unstated
 * value") and never its other half — a value the student's own data DETERMINES is not invented — so the
 * model would not write an equation whose intercept the student never typed; (2) no catalogue row showed
 * a line by a point and a slope, so there was no pattern to imitate. The grammar already read the
 * textbook's point-slope form `y-3=4(x-2)` as it stands (the equation layer evaluates, it never
 * simplifies), so the canonical answer needed no new form and no arithmetic.
 *
 * And a third finding at re-measure: since #1336 the app answered EVERY rejected completion with
 * «understood, not supported» — for prose, a claim that the tool read something it never read and lacks
 * a move it has. A completion that is not a command keeps the student's ORIGINAL refusal (the issue's lock).
 *
 * **No live call anywhere in this file** (standing rule 2). The oracle is this session: the lines a model
 * SHOULD emit are asserted to parse and build through the real `decideSubmit → derive` path.
 */
import { describe, expect, it, vi } from 'vitest';
import { PROMPT_EXAMPLES_ANALYTIC, PROMPT_SPEC_ANALYTIC } from '../parser/llmSharedAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { fallbackRefusal, runFallback } from '../app/fallback';
import { decideSubmit, reachesFallback } from '../app/submit';
import { derive } from '../engine/derive';
import type { InputError } from '../store/useAnalyticStore';

const REPORTED = 'צייר ישר שעובר דרך (2,3) ושיפועו 4';
const PROSE = 'a line through (2,3) with slope 4';
const ask = (steps: string[]) => vi.fn().mockResolvedValue({ steps });

/** Walk lines through the real submit gate, as the student (or the fallback) would. */
function walk(lines: readonly string[]): { verdicts: string[]; accepted: string[] } {
  const accepted: string[] = [];
  const verdicts: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, accepted, 0, derive(accepted, 0));
    verdicts.push(v.kind);
    if (v.kind === 'record') accepted.push(v.line);
  }
  return { verdicts, accepted };
}

describe('#1278 — the prompt states BOTH halves of ADR-052', () => {
  const rules = PROMPT_SPEC_ANALYTIC.rules.join('\n');

  it('keeps the prohibition', () => {
    expect(rules).toMatch(/NEVER invent an unstated value/);
  });

  it('states that a DETERMINED value is derived, not invented', () => {
    expect(rules).toMatch(/DERIVING is not INVENTING/);
    expect(rules).toMatch(/DETERMINES/);
    expect(rules).toMatch(/point-slope form/);
  });

  it('forbids prose as a step', () => {
    expect(rules).toMatch(/NEVER prose/);
  });

  /** A spelling the rule teaches is a promise: it must parse and build (the PAR-10 contract). */
  it.each([['הישר y-3=4(x-2)'], ['the line y-3=4(x-2)']])('the rule’s own spelling «%s» builds', (line) => {
    expect(rules).toContain(line);
    const { verdicts, accepted } = walk([line]);
    expect(verdicts).toEqual(['record']);
    expect(derive(accepted, 0).faults).toEqual([]);
  });

  it('teaches the point-and-slope pattern by example, anonymous and with the point named', () => {
    const ex = PROMPT_EXAMPLES_ANALYTIC.flatMap((e) => e.steps);
    expect(ex).toContain('הישר y-5=-2(x+1)');
    expect(ex).toContain('שיפוע הישר l1 הוא 4');
  });
});

describe('#1278 — the catalogue carries the construct, so the model has a pattern and the student a spelling', () => {
  const he = COMMAND_CATALOG_ANALYTIC.map((e) => e.he);
  const en = COMMAND_CATALOG_ANALYTIC.map((e) => e.en);

  it('has the point-slope line and the named-point slope rows in both languages', () => {
    expect(he).toContain('הישר y-3=4(x-2)');
    expect(en).toContain('the line y-3=4(x-2)');
    expect(he).toContain('שיפוע הישר l1 הוא 4');
    expect(en).toContain('the slope of line l1 is 4');
  });

  it('reaches the model: the Hebrew and English vocabularies both list it', () => {
    expect(PROMPT_SPEC_ANALYTIC.vocabulary('he')).toContain('הישר y-3=4(x-2)');
    expect(PROMPT_SPEC_ANALYTIC.vocabulary('en')).toContain('the line y-3=4(x-2)');
  });
});

describe('#1278 — the oracle: what the model should have answered builds, and is the right line', () => {
  it('the reported sentence reaches the fallback (the deterministic parser does not own it)', () => {
    const v = decideSubmit(REPORTED, [], 0, derive([], 0));
    expect(reachesFallback(v)).toBe(true);
  });

  it('the point-slope answer records through the fallback and builds with no fault', async () => {
    const out = await runFallback(REPORTED, [], 0, ask(['הישר y-3=4(x-2)']));
    expect(out).toEqual({ kind: 'lines', lines: ['הישר y-3=4(x-2)'] });
    if (out.kind === 'lines') expect(derive(out.lines, 0).faults).toEqual([]);
  });

  /** The same LINE as the issue's measured `y=4x-5` — the tool itself says so, no equation compared by hand. */
  it('is the line y=4x-5: restating it is already known', () => {
    const { verdicts } = walk(['הישר y-3=4(x-2)', 'הישר y=4x-5']);
    expect(verdicts).toEqual(['record', 'already-known']);
  });

  it('with the point named, the free-direction line plus its slope builds and passes through it', () => {
    const { verdicts, accepted } = walk(['A(2,3)', 'דרך A עובר ישר l1', 'שיפוע הישר l1 הוא 4']);
    expect(verdicts).toEqual(['record', 'record', 'record']);
    expect(derive(accepted, 0).faults).toEqual([]);
  });

  /** The issue's known-good call stays buildable — a parse lock, not a model call. */
  it('the first call’s good answer (triangle + median) still records', async () => {
    const out = await runFallback('תצייר לי משולש עם תיכון מ-A', [], 0, ask(['משולש ABC', 'AD תיכון לצלע BC']));
    expect(out).toEqual({ kind: 'lines', lines: ['משולש ABC', 'AD תיכון לצלע BC'] });
  });
});

describe('#1278 — a prose answer is harmless AND keeps the student’s original refusal', () => {
  const original: InputError = { key: 'not-handled', detail: REPORTED };

  it('the prose answer records nothing', async () => {
    const out = await runFallback(REPORTED, [], 0, ask([PROSE]));
    expect(out).toEqual({ kind: 'rejected', refusedStep: PROSE, code: 'not-handled' });
  });

  it('and the student reads the ORIGINAL refusal — not «understood, unsupported»', async () => {
    const out = await runFallback(REPORTED, [], 0, ask([PROSE]));
    if (out.kind === 'lines') throw new Error('prose must not record');
    expect(fallbackRefusal(out, REPORTED, original)).toBe(original);
  });

  /** #1336 stands: a line the tool READ and declined is the honest middle. */
  it('a completion the tool read and declined still says «understood, unsupported»', async () => {
    const out = await runFallback('תיכון', [], 0, ask(['משולש ABC', 'BD תיכון לצלע AB']));
    if (out.kind === 'lines') throw new Error('a degenerate cevian must not record');
    expect(out.kind).toBe('rejected');
    expect(fallbackRefusal(out, 'תיכון', original)).toEqual({ key: 'llm-understood-unsupported', detail: 'תיכון' });
  });

  it('a throttle is busy, and an empty answer keeps the original', () => {
    expect(fallbackRefusal({ kind: 'busy', why: 'daily-limit' }, 'x', original)).toEqual({ key: 'llm-busy', detail: 'x' });
    expect(fallbackRefusal({ kind: 'none' }, 'x', original)).toBe(original);
  });
});
