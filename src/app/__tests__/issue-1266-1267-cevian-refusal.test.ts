/**
 * #1266 + #1267 — A RULE THAT READ THE SENTENCE OWES AN ANSWER ABOUT IT.
 *
 * Operator, playing round #1252: *"T6 - BD גובה לצלע AB - it says it cannot read this - but the message
 * should be more informative"*, and, on T7's median twin, *"same for T7"*.
 *
 * Both refusals were CORRECT — #1233 and #1247 put that gate there. What was wrong is that the gate
 * answered `null`, the parser's *"no rule owns this sentence"*, so a sentence the tool understood
 * perfectly escalated to the paid model and came back as «לא הצלחתי להבין». Measured at pickup, all five
 * degenerate spellings did that.
 *
 * #1233's own comment split the owned refusal off as *"a larger change (2-D has no refusal vocabulary
 * equivalent to the analytic tree's ParseFailure codes)"*. That premise was measurably wrong — `Clarify`
 * has fifteen members, `refusalOf` maps every one, and `runSubmit` has ten arms — so the split closes
 * here rather than being re-deferred.
 *
 * #1267 is the same defect one role over: the bisector rule never READ the side it was given, so
 * «BD חוצה זווית לצלע BC», «…לצלע AC» and «…לצלע AB» produced byte-identical commands and the student's
 * stated side vanished without a word.
 *
 * The locks that matter are the pair: refused BY NAME, and **no LLM call** — the paid half is invisible
 * to a message assertion and is what silently comes back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { parse } from '@/parser';
import { ctxOf, factsOf } from '@/__tests__/scenario-pipeline';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => calls.notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => calls.cleared++,
      setBusy: () => {},
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  return { deps, calls, notes: () => calls.notes.filter(Boolean) };
}

const onTriangle = (line: string) => parse(line, ctxOf(factsOf(['משולש ABC'])));

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1266 — every degenerate cevian is refused BY NAME', () => {
  const CELLS: Array<[string, string, string]> = [
    // utterance, why, the letters the message must be able to quote
    ['BD גובה לצלע AB', 'apex-on-side', 'B'], // the operator's T6
    ['AB תיכון לצלע BC', 'median-foot-at-end', 'A'], // his T7
    ['BD תיכון לצלע AB', 'apex-on-side', 'B'],
    ['AD תיכון לצלע AB', 'apex-on-side', 'A'],
    ['F רגל האנך מ-B ל-AB', 'apex-on-side', 'B'], // the third spelling of the same family
  ];

  for (const [line, why, apex] of CELLS) {
    it(`«${line}» answers cevian-degenerate (${why}), not not-handled`, () => {
      const r = onTriangle(line);
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ reason: 'cevian-degenerate', why, apex });
    });
  }

  it('the student gets the named note and NO paid call — the half a message assertion cannot see', async () => {
    for (const [line] of CELLS) {
      useGeoStore.getState().clear();
      await runSubmit('משולש ABC', makeDeps().deps);
      const before = useGeoStore.getState().facts.length;
      const d = makeDeps();
      await runSubmit(line, d.deps);
      expect(d.notes().length, `«${line}» said nothing`).toBe(1);
      expect(d.notes()[0]).toContain('input.cevian');
      expect(llmParseMock, `«${line}» escalated to the model`).not.toHaveBeenCalled();
      expect(useGeoStore.getState().facts.length, `«${line}» committed something`).toBe(before);
    }
  });

  it('the note quotes the student’s own letters, never internal state', async () => {
    await runSubmit('משולש ABC', makeDeps().deps);
    const d = makeDeps();
    await runSubmit('BD גובה לצלע AB', d.deps);
    expect(d.notes()[0]).toContain('"apex":"B"');
    expect(d.notes()[0]).toContain('"side":"AB"');
  });

  it('the well-formed twins still build — the refusal did not eat the feature', () => {
    for (const line of ['AD גובה לצלע BC', 'AD תיכון לצלע BC', 'AB גובה לצלע BC']) {
      const r = onTriangle(line);
      expect(r.ok, `«${line}» stopped building`).toBe(true);
    }
  });
});

describe('#1267 — the bisector reads the side it is given', () => {
  it('a side the bisector cannot meet is refused, with BOTH sides quoted', () => {
    for (const [line, stated] of [
      ['BD חוצה זווית לצלע BC', ['B', 'C']],
      ['BD חוצה זווית לצלע AB', ['A', 'B']],
    ] as Array<[string, string[]]>) {
      const r = onTriangle(line);
      expect(r.ok, `«${line}» still builds`).toBe(false);
      expect(r).toMatchObject({ reason: 'cevian-wrong-side', apex: 'B', stated, actual: ['A', 'C'] });
    }
  });

  it('the TRUE side still builds, and the three spellings are no longer identical', () => {
    const good = onTriangle('BD חוצה זווית לצלע AC');
    expect(good.ok).toBe(true);
    const bad = onTriangle('BD חוצה זווית לצלע BC');
    // the defect in one line: these used to be byte-identical
    expect(JSON.stringify(good)).not.toBe(JSON.stringify(bad));
  });

  it('with no side stated the figure still resolves it, exactly as before', () => {
    const r = onTriangle('BD חוצה זווית');
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ commands: expect.arrayContaining([expect.objectContaining({ type: 'bisector', vertex: 'B' })]) });
  });

  it('the student gets the named note and no paid call', async () => {
    await runSubmit('משולש ABC', makeDeps().deps);
    const d = makeDeps();
    await runSubmit('BD חוצה זווית לצלע BC', d.deps);
    expect(d.notes().length).toBe(1);
    expect(d.notes()[0]).toContain('input.cevianWrongSide');
    expect(d.notes()[0]).toContain('"actual":"AC"');
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#1266/#1267 — one side reader, three rules', () => {
  it('the spellings the ALTITUDE tolerated now work for the median too', () => {
    // The median carried the narrower copy; the shared reader is the altitude's superset.
    for (const line of ['AD תיכון לקטע BC', 'AD תיכון אל הצלע BC']) {
      expect(onTriangle(line).ok, `«${line}»`).toBe(true);
    }
  });
});
