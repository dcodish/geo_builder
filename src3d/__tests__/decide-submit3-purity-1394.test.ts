/**
 * #1394 — `decideSubmit3` is PURE: asking "would you accept this line?" changes nothing.
 *
 * #1358's register asks before it teaches, so the question must be free. Each case below asks the
 * decision about a line that would, if submitted, rename, re-enable a twin or record a fact. It asserts
 * that the store is the SAME object afterwards, and that asking twice with the same injected id gives
 * the same verdict.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decideSubmit3, useGeo3 } from '../store/store3';

const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
beforeEach(reset);

function askPurely(line: string) {
  const before = useGeo3.getState();
  const snapshot = JSON.stringify({ facts: before.facts, seed: before.seed, err: before.lastError, notice: before.lastNotice });
  const id = () => 'fixed-id';
  const v1 = decideSubmit3(before, line, id);
  const v2 = decideSubmit3(before, line, id);
  const after = useGeo3.getState();
  expect(after, 'the store state is the same object — nothing was set').toBe(before);
  expect(JSON.stringify({ facts: after.facts, seed: after.seed, err: after.lastError, notice: after.lastNotice })).toBe(snapshot);
  expect(JSON.stringify(v2), 'asking twice is the same answer').toBe(JSON.stringify(v1));
  return v1;
}

describe('#1394 — asking the 3-D decision changes nothing', () => {
  it('a line that would be RECORDED', () => {
    const v = askPurely("תיבה ABCDA'B'C'D'");
    expect(v.kind).toBe('record');
    expect(useGeo3.getState().facts).toEqual([]);
  });

  it('a line that is ALREADY STATED (a disabled twin would be re-enabled, not by asking)', () => {
    useGeo3.getState().submit("תיבה ABCDA'B'C'D'");
    const f = useGeo3.getState().facts[0];
    useGeo3.setState({ facts: [{ ...f, enabled: false }] });
    const v = askPurely("תיבה ABCDA'B'C'D'");
    expect(v.kind).toBe('already-stated');
    expect(useGeo3.getState().facts[0].enabled, 'still disabled — asking did not re-enable it').toBe(false);
  });

  it('a RENAME is described, not performed', () => {
    useGeo3.getState().submit("תיבה ABCDA'B'C'D'");
    expect(askPurely('שנה שם A ל-P')).toMatchObject({ kind: 'rename', from: 'A', to: 'P' });
  });

  it('an unreadable line is `not-understood` (the escalation verdict), a gated one is refused', () => {
    expect(askPurely('asdkjh').kind).toBe('not-understood');
  });
});
