/**
 * #1692 (ADR-3D-305) — the log-triage 3-D replay CALLS the App's decision; it no longer copies it.
 *
 * The 2026-10-02 `/log-triage` run listed «הוכיחו כי AB ⊥ AC» as a ▶ LIVE 3-D grammar gap. It is not one:
 * since #1666 the store refuses a proof target before the grammar runs. The replay (`session3d` in
 * triage.mjs) called `parse3` directly and never saw it — the #35 / #243 / #829 class, where the mirror
 * re-implements the decision instead of calling it. The replay now lives in the product tree
 * (`src3d/app/triageReplay3.ts`) and calls `decideDeterministic3`, the function App3 dispatches.
 *
 * Two kinds of lock:
 *   1. the reported line and the class sweep — every divergence measured between the old hand mirror and
 *      the App on the prod 3-D log (proof target, #866 one-angle repair, #613 twin, a line that records
 *      on an empty figure), plus the registers and the genuine gap that must STAY a gap;
 *   2. the replay agrees with the REAL STORE on every one of those lines — driven through `useGeo3.submit`,
 *      never through a re-statement of what the store is supposed to do.
 *
 * A session is written as ONE string split on « ⏎ », never as a string-array literal: the #1394 parity
 * lock harvests every string array in this directory as a sequence of its golden, and this file must
 * add no key to it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { replay3dSession, type LoggedEvent3, type ReplayOutcome3 } from '../app/triageReplay3';
import { decideDeterministic3, refusalCategory3 } from '../app/decideDeterministic3';
import { useGeo3 } from '../store/store3';

type Now = ReplayOutcome3 extends { now: infer N } ? N : never;
const lines = (session: string): string[] => session.split(' ⏎ ');
const sub = (u: string, extra: Partial<LoggedEvent3> = {}): LoggedEvent3 => ({ ev: 'submit', utterance: u, source: 'parser', result: 'ok', ...extra });
const act = (action: string): LoggedEvent3 => ({ ev: 'action', action });
const last = (session: string): ReplayOutcome3 => {
  const out = replay3dSession(lines(session).map((u) => sub(u)));
  return out[out.length - 1];
};
const nows = (out: ReplayOutcome3[]): string => out.map((o) => o.now).join(' ');

/** why · the session (lines joined by « ⏎ ») · the verdict of its LAST line · its detail */
const SWEEP: ReadonlyArray<{ why: string; session: string; now: Now; detail: string }> = [
  { why: 'the reported line (#1666 proof target)', session: 'הוכיחו כי AB ⊥ AC', now: 'guided', detail: 'scope:proof-target' },
  { why: 'the English proof target', session: 'prove that AB ⊥ AC', now: 'guided', detail: 'scope:proof-target' },
  { why: 'a proof target on a figure that has the points', session: 'פירמידה SABC ⏎ הוכיחו כי SA ⊥ BC', now: 'guided', detail: 'scope:proof-target' },
  { why: '#866: one angle meets at A — repaired and BUILT', session: 'משולש ABC ⏎ AD חוצה את זווית A', now: 'built', detail: 'bisector-ray' },
  { why: '#866: several angles meet at A — the student is asked', session: 'פירמידה SABC ⏎ AD חוצה את זווית A', now: 'clarify', detail: 'ambiguous-angle-vertex' },
  { why: '#613: a restated fact adds nothing', session: 'משולש ABC ⏎ משולש ABC', now: 'built-nothing', detail: 'already-stated' },
  { why: 'a line that records with nothing positioned yet is BUILT (the App records it)', session: 'המישור π1: z = 1', now: 'built', detail: 'plane3' },
  { why: '#353: the lowercase nudge', session: 'פירמידה sabcd', now: 'guided', detail: 'scope:lowercase-labels' },
  { why: 'ADR-3D-040: the guidance register', session: 'פירמידה', now: 'guided', detail: 'scope:bare-solid' },
  { why: 'a reasoned refusal is not a gap', session: 'AB ⊥ AC', now: 'refused', detail: 'unknown-point' },
  { why: 'a genuine gap STAYS a live gap', session: 'משולש ABC ⏎ AB מתעופף מעל הקשת', now: 'not-handled', detail: 'not-understood' },
];

describe('#1692 — the 3-D replay reads each line the way the App does', () => {
  it.each(SWEEP)('$why', ({ session, now, detail }) => {
    const o = last(session);
    expect(o.now, session).toBe(now);
    expect(o.detail).toBe(detail);
    expect(o.degraded).toBe(false);
  });

  it('a rename is a store operation, and the prefix follows it', () => {
    const out = replay3dSession(lines('משולש ABC ⏎ שנה שם A ל-K ⏎ קטע KB').map((u) => sub(u)));
    expect(nows(out)).toBe('built store-op built');
    expect(out.every((o) => !o.degraded)).toBe(true);
  });

  it('an LLM step is followed through the LLM lane decision when its lines were logged (#182)', () => {
    const llm = sub('ציירו משולש עם הקודקודים A B C', { source: 'llm', commands: JSON.stringify(lines('משולש ABC')) });
    const out = replay3dSession([llm, sub('קטע AB')]);
    expect(out[0].now).toBe('not-handled'); // OUR coverage is reported honestly…
    expect(out[1]).toEqual({ now: 'built', detail: 'segment3', degraded: false }); // …and the prefix stays real
  });

  it('an LLM step with no lines degrades the rest of the session — never claimed as a gap', () => {
    const out = replay3dSession([sub('ציירו משולש עם הקודקודים A B C', { source: 'llm' }), sub('קטע AB')]);
    expect(out[1].degraded).toBe(true);
  });

  it('clear / undo / redo are followed', () => {
    const out = replay3dSession([
      sub('משולש ABC'),
      act('undo'),
      act('redo'),
      sub('קטע AB'), // the redo brought the triangle back
      act('clear'),
      sub('קטע BC'), // …and the clear took it away
    ]);
    expect(nows(out)).toBe('built skip skip built skip refused');
    expect(out[5].detail).toBe('unknown-point');
    expect(out.every((o) => !o.degraded)).toBe(true);
  });
});

describe('#1692 — the replay agrees with the REAL store on every swept line', () => {
  const reset = () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
    useGeo3.temporal.getState().clear();
  };
  beforeEach(reset);

  it.each(SWEEP)('$why', ({ session, now, detail }) => {
    const ls = lines(session);
    for (const l of ls.slice(0, -1)) useGeo3.getState().submit(l);
    const before = useGeo3.getState().facts.length;
    useGeo3.getState().submit(ls[ls.length - 1]);
    const st = useGeo3.getState();
    if (now === 'built') {
      expect(st.lastError).toBeNull();
      expect(st.facts.length).toBe(before + 1);
    } else if (now === 'built-nothing') {
      expect(st.lastNotice?.code).toBe('already-stated');
      expect(st.facts.length).toBe(before);
    } else if (now === 'not-handled' || (detail.startsWith('scope:') && detail !== 'scope:proof-target')) {
      // the store says not-understood; the App then consults its registers (guided) or escalates (gap)
      expect(st.lastError?.code).toBe('not-understood');
    } else {
      const code = detail === 'scope:proof-target' ? 'proof-target' : detail;
      expect(st.lastError?.code).toBe(code);
      expect(refusalCategory3(st.lastError!)).toBe(now);
    }
  });

  it('dispatching the decision the replay called leaves the store where the App leaves it', () => {
    // App3 dispatches `decideDeterministic3`; dispatching it leaves the store exactly where `submit` does.
    const v = decideDeterministic3(useGeo3.getState(), 'הוכיחו כי AB ⊥ AC');
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') {
      useGeo3.getState().dispatchVerdict(v);
      expect(useGeo3.getState().lastError).toEqual({ code: 'proof-target', sentence: 'הוכיחו כי AB ⊥ AC' });
    }
  });
});
