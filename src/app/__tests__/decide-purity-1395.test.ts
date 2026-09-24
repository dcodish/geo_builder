/**
 * #1395 — `decideDeterministic2D` is PURE: asking it a question changes nothing.
 *
 * The reason it exists is that #1358's register (and log-triage) must be able to ask "would the tool
 * accept this line?" without the tool acting on it. `runSubmit` could not be asked: it renamed circles
 * and points inside its parse loop, logged, and could call the paid model. So this lock asks the
 * decision about lines that exercise each of those, and asserts that the store and the debug log are
 * untouched and the model is never called, including for a line whose parse loop BINDS a circle name
 * (the #186 auto-bind, now simulated on a copy of the facts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));
const logDebugMock = vi.fn();
vi.mock('@/debug/sessionLog', async (orig) => ({ ...(await orig<object>()), logDebug: (...a: unknown[]) => logDebugMock(...a) }));

import { decideDeterministic2D, type Verdict2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';

const stateOf = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return { facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } };
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  logDebugMock.mockReset();
});

async function askPurely(prefix: string[], line: string): Promise<Verdict2D> {
  if (prefix.length) useGeoStore.getState().executeMany(factsOf(prefix).map((f) => f.cmd), prefix.join(' · '));
  const before = useGeoStore.getState();
  const factsBefore = JSON.stringify(before.facts);
  const v = await decideDeterministic2D(stateOf(), line, 'he');
  const after = useGeoStore.getState();
  expect(after.facts, 'the fact list is the same object — nothing was set').toBe(before.facts);
  expect(JSON.stringify(after.facts)).toBe(factsBefore);
  expect(after.seed).toBe(before.seed);
  expect(logDebugMock, 'the decision never logs').not.toHaveBeenCalled();
  expect(llmParseMock, 'the decision never calls the model').not.toHaveBeenCalled();
  return v;
}

describe('#1395 — asking the decision changes nothing', () => {
  it('a line that COMMITS: the verdict carries the commands, the store does not have them', async () => {
    const v = await askPurely([], 'ריבוע ABCD');
    expect(v.kind).toBe('commit');
  });

  it('a store operation is DESCRIBED, not performed', async () => {
    const v = await askPurely(['ריבוע ABCD'], 'שנה שם A ל-P');
    expect(v).toMatchObject({ kind: 'store-op', op: 'rename', from: 'A', to: 'P' });
  });

  it('a pre-parse refusal (LaTeX) and a pre-LLM one (junk) are verdicts, not notes', async () => {
    expect(await askPurely([], '$\\triangle ABC$')).toMatchObject({ kind: 'refuse', preParse: true, category: 'guided' });
    expect(await askPurely([], 'asdkjh')).toMatchObject({ kind: 'refuse', preParse: false, category: 'guided' });
  });

  it('a line the grammar cannot read is an ESCALATION verdict — and the model is still not called', async () => {
    const v = await askPurely([], 'CD חותך את המעגל');
    expect(v.kind).toBe('escalate');
  });

  // both cases are taken from the scenario corpus, where the decision was measured to bind
  it('the #186 circle auto-bind is SIMULATED: the verdict carries the bind, the store keeps its unnamed circle', async () => {
    const v = await askPurely(['שני מעגלים משיקים מבחוץ'], 'היקף מעגל O1 הוא 6π');
    expect(v.kind).toBe('commit');
    expect(v.kind === 'store-op' ? [] : v.binds, 'the case really binds (the lock is not vacuous)').toEqual([{ op: 'name-centre', from: 'O', to: 'O1' }]);
  });

  it('the #539 point auto-bind is SIMULATED too', async () => {
    const prefix = ['שני מעגלים משיקים מבחוץ', 'היקף מעגל O1 הוא 6π', 'שטח מעגל O2 הוא 81π', 'A על מעגל O1', 'AD משיק למעגל O2 בנקודה D', 'B על המשך AD', 'BC משיק למעגל O2 בנקודה C'];
    // the prefix is built through the real pipeline's commits so its auto-binds and auto-names are real
    for (const line of prefix) {
      const st = stateOf();
      const v = await decideDeterministic2D(st, line, 'he');
      if (v.kind === 'store-op') continue;
      for (const b of v.binds) {
        if (b.op === 'name-centre') useGeoStore.getState().nameCentre(b.from, b.to);
        else useGeoStore.getState().rename(b.from, b.to);
      }
      if (v.kind === 'commit') useGeoStore.getState().executeMany([...v.commands], line);
    }
    logDebugMock.mockReset();
    const v = await askPurely([], 'ישר A O1 E O2 C');
    expect(v.kind === 'store-op' ? [] : v.binds).toEqual([{ op: 'rename', from: 'M', to: 'E' }]);
  });
});
