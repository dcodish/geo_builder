/**
 * `llmJudge.ts` (#2890, ADR-830; ADR-240's battery on the second attempt) — the model's answer, judged and committed.
 * A unit test of the decision itself, with the answer written here (no model call, CLAUDE.md rule 2): an answer that
 * builds the line commits it as one row; no answer is refused by the right message; an answer that loses a stated
 * label, or invents one, is refused and commits nothing; and the battery's three grammar words are the parser's.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { judgeModelAnswer, type ModelAnswer } from '../llmJudge';
import { useGeoStore, replay } from '@/store/geoStore';
import { BISECT_VERB, MIDSEGMENT_ITEM, REGION_SUBJECT_ITEM, buildParseCtx, parse } from '@/parser';

const st = () => useGeoStore.getState();
const view = () => {
  const d = replay(st().facts, st().seed);
  return { construction: d.construction, positions: d.positions };
};
const answer = (...lines: string[]): ModelAnswer => {
  const v = view();
  return { built: lines.map((step) => ({ step, commands: (parse(step, buildParseCtx(v.construction, v.positions)) as unknown as { commands: never[] }).commands })), dropped: [] };
};
const judge = (utterance: string, out: ModelAnswer | null, weak = false) => judgeModelAnswer({ utterance, locale: 'he', out, bindCmds: [], weak, view: view() });

describe('judgeModelAnswer — the model\'s answer, judged and committed', () => {
  beforeEach(() => {
    st().clear();
    st().executeMany(answer('משולש ABC').built[0].commands, 'משולש ABC');
  });

  it('an answer that builds the line commits it as one row, under the student\'s own words', () => {
    const facts = st().facts.length;
    const out = judge('M היא אמצע הקטע AB', answer('M אמצע AB'));
    expect(out.kind).toBe('commit');
    expect(st().facts.length).toBeGreaterThan(facts);
    expect(st().facts[st().facts.length - 1].utterance).toBe('M היא אמצע הקטע AB');
  });

  it('no answer is refused, and says whether the grammar read the line', () => {
    const facts = st().facts;
    expect(judge('M היא אמצע הקטע AB', null, false)).toEqual({ kind: 'refuse', note: { key: 'suite.refusal.notUnderstood' } });
    expect(judge('M היא אמצע הקטע AB', null, true)).toEqual({ kind: 'refuse', note: { key: 'input.producedNothing' } });
    expect(st().facts).toBe(facts);
  });

  it('an answer that loses or invents a stated label is refused, and commits nothing', () => {
    const facts = st().facts;
    const out = judge('M היא אמצע הקטע AB', answer('N אמצע AB'));
    expect(out.kind).toBe('refuse');
    expect(['input.labelsDropped', 'input.labelsInvented']).toContain((out as { note: { key: string } }).note.key);
    expect(st().facts).toBe(facts);
  });

  it('the battery names its grammar words as the parser defines them', () => {
    expect([BISECT_VERB, REGION_SUBJECT_ITEM, MIDSEGMENT_ITEM]).toEqual(['חוצה/bisect', 'בתוך/מחוץ', 'קטע אמצעים']);
  });
});
