/**
 * #2692 ([ADR-781](../../../docs/06-decisions.md#adr-781)) — a value followed by a UNIT word is a stated value, never a count.
 *
 * Before (measured at ebacadd1, `droppedGivenNumbers` over the parsed answer): «AB = 5 סנטימטרים» answered «AB = 7»,
 * "AB = 5 meters" answered «AB = 7», «זווית ABC = 30 מעלות» and "angle ABC = 30 degrees" answered with 40 each dropped
 * NOTHING, so the AI's changed value committed green. The count blank («2 משיקים», "3 circles", #160) read the plural
 * unit as a counted noun and blanked the value; `VALUE_UNIT` (#1157) strips only some units first, which is why
 * «5 מטרים» and "5 units" were already refused. The rule is now the shell's one atom pair (`COUNT_DIGITS`,
 * `UNIT_WORD`), the same one analytic's gate reads (ADR-AG-384 am. 1).
 *
 * **No live call** (standing rule 2): every model answer is a stub.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { droppedGivenNumbers, parse, statedNumberOccurrences } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';
import { ctxOf } from '../../__tests__/scenario-pipeline';
import { createWorkQueue } from '../../../shell/work';

const triangle = async (): Promise<void> => {
  useGeoStore.getState().clear();
  await runSubmit('משולש ABC', makeDeps().deps);
};

const ctx = () => ctxOf(useGeoStore.getState().facts);

/** What the number gate says of `answer` as the model's reading of `utterance`, on the current figure. */
const droppedBy = (utterance: string, answer: string): number[] => {
  const r = parse(answer, ctx());
  if (!r.ok) throw new Error(`the stub answer «${answer}» must parse`);
  return droppedGivenNumbers(utterance, r.commands);
};

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: { setInputNote: (m) => calls.notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => calls.cleared++ },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    work: createWorkQueue(),
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  return { deps, calls };
}

/** The model answers `answer` (one canonical step) to whatever it is asked. */
const modelAnswers = (answer: string): void => {
  llmParseMock.mockImplementation(async () => {
    const r = parse(answer, ctx());
    if (!r.ok) throw new Error(`the stub answer «${answer}» must parse`);
    return { built: [{ step: answer, commands: r.commands }], dropped: [] };
  });
};

beforeEach(async () => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
  await triangle();
});

describe('#2692 — an answer that changes a value written with a unit word is flagged, naming the student value', () => {
  it.each<[string, string, number[]]>([
    // the issue's four rows
    ['AB = 5 סנטימטרים', 'AB = 7', [5]],
    ['AB = 5 meters', 'AB = 7', [5]],
    ['זווית ABC = 30 מעלות', 'זווית ABC = 40', [30]],
    ['angle ABC = 30 degrees', 'angle ABC = 40', [30]],
    // the same class in the unit list's other plurals (the shell's `UNIT_WORD`)
    ['AB = 5 מילימטרים', 'AB = 7', [5]],
    ['AB = 5 centimeters', 'AB = 7', [5]],
    ['AB = 5 המטרים', 'AB = 7', [5]],
    ['זווית ABC שווה ל-30 המעלות', 'זווית ABC = 40', [30]],
    // already refused before (VALUE_UNIT strips them first): the same class, locked beside it
    ['AB = 5 מטרים', 'AB = 7', [5]],
    ['AB = 5 units', 'AB = 7', [5]],
  ])('«%s» answered «%s»', (utterance, answer, expected) => {
    expect(droppedBy(utterance, answer)).toEqual(expected);
  });
});

describe('#2692 — the controls', () => {
  it.each<[string, string]>([
    ['AB = 5 סנטימטרים', 'AB = 5'],
    ['AB = 5 meters', 'AB = 5'],
    ['זווית ABC = 30 מעלות', 'זווית ABC = 30'],
    ['angle ABC = 30 degrees', 'angle ABC = 30'],
  ])('a faithful answer pays: «%s» answered «%s»', (utterance, answer) => {
    expect(droppedBy(utterance, answer)).toEqual([]);
  });

  it('a COUNT still states no magnitude: «2 משיקים», "3 circles"', () => {
    expect(statedNumberOccurrences('מנקודה A יוצאים 2 משיקים למעגל').occurrences).toEqual([]);
    expect(statedNumberOccurrences('draw 3 circles').occurrences).toEqual([]);
  });

  it('the value before a unit word is now a stated occurrence, for the read-extent probe too', () => {
    expect(statedNumberOccurrences('זווית ABC = 30 מעלות').occurrences.map((o) => o.text)).toEqual(['30']);
    expect(statedNumberOccurrences('angle ABC = 30 degrees').occurrences.map((o) => o.text)).toEqual(['30']);
  });

  it('the grammar\'s own angle line with «מעלות» still commits (its 30 is accounted by the payload)', () => {
    const r = parse('זווית ABC = 30 מעלות', ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(droppedGivenNumbers('זווית ABC = 30 מעלות', r.commands)).toEqual([]);
  });
});

describe('#2692 — end to end through the 2-D submit pipeline (model mocked)', () => {
  it.each<[string]>([['AB = 5 סנטימטרים'], ['AB = 5 meters']])('«%s» answered «AB = 7» is refused, naming 5, and nothing commits', async (utterance) => {
    modelAnswers('AB = 7');
    const before = useGeoStore.getState().facts.length;
    const d = makeDeps();
    await runSubmit(utterance, d.deps);
    expect(llmParseMock).toHaveBeenCalled();
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(d.calls.cleared).toBe(0);
    expect(d.calls.notes.join(' ')).toMatch(/input\.labelsDropped.*"labels":"[^"]*\b5\b/);
  });

  it('the same line answered «AB = 5» commits', async () => {
    modelAnswers('AB = 5');
    const before = useGeoStore.getState().facts.length;
    const d = makeDeps();
    await runSubmit('AB = 5 סנטימטרים', d.deps);
    expect(useGeoStore.getState().facts.length).toBeGreaterThan(before);
  });
});
