/**
 * #1300 — the analytic session logger, and the three properties everything else rests on.
 *
 * Operator, 2026-09-20: *"why dont we have a log for this tool. this is important for debug so add it"*.
 *
 * What is locked here is deliberately narrow, because the module is deliberately narrow:
 *
 *  1. **It never posts outside DEV.** The analytic tool is not deployed (ADR-AG-007) and has no production
 *     sink, so the early return IS the production posture. If it ever stops holding, a student's sentences
 *     are posted to an endpoint that does not exist on a host nobody audited.
 *  2. **It tags `tool:'analytic'`.** The tag is what keeps this trace out of `debug-log.jsonl` —
 *     `server/__tests__/issue-1300-log-routing.test.ts` locks the other half of that contract, and the two
 *     files together are what stop the 2-D corpus being poisoned.
 *  3. **It cannot break the app.** Logging is a debug aid; a submit that fails because the sink is down is
 *     a worse product than no log at all. Asserted against both failure modes a `fetch` has — a rejected
 *     promise and a synchronous throw — because the module guards them separately and only one of them is
 *     the obvious one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { logAnalytic, logAnalyticFigure } from '../debug/sessionLogAnalytic';

const withFetch = (impl: () => unknown) => {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
};

const bodyOf = (spy: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse((spy.mock.calls[call]?.[1] as { body: string }).body) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('#1300 — the analytic session log', () => {
  it('tags every event tool:analytic, so it lands in its own file', () => {
    const spy = withFetch(() => Promise.resolve());
    logAnalytic({ kind: 'input', utterance: 'משוואת ישר 1 היא 2x-y+8=0' });
    expect(spy).toHaveBeenCalledOnce();
    expect(bodyOf(spy).tool).toBe('analytic');
  });

  it('carries the event through unchanged, and stamps a session and a sequence', () => {
    const spy = withFetch(() => Promise.resolve());
    logAnalytic({ kind: 'input', utterance: 'משוואת ישר 1 היא 2x-y+8=0', source: 'parser', result: 'not-handled' });
    logAnalytic({ kind: 'input', utterance: 'x', source: 'llm', steps: ['line l1: 2x-y+8=0'] });

    const first = bodyOf(spy, 0);
    const second = bodyOf(spy, 1);
    expect(first.utterance).toBe('משוואת ישר 1 היא 2x-y+8=0');
    expect(first.result).toBe('not-handled');
    expect(second.steps).toEqual(['line l1: 2x-y+8=0']);
    // One session, ordered — which is what makes a trace replayable rather than a pile of lines.
    expect(second.session).toBe(first.session);
    expect(Number(second.seq)).toBe(Number(first.seq) + 1);
    expect(typeof first.clientTs).toBe('string');
  });

  /**
   * The operator's own 2026-09-20 session, as the acceptance case: #1297 had to ASK him what he typed
   * because none of this existed. Asserted as the escalation PAIR — the parser step marked `intermediate`
   * and the model's answer carrying its steps — since either alone leaves the same question open.
   */
  it('records an escalation as a pair: the refusal, then what the model actually said', () => {
    const spy = withFetch(() => Promise.resolve());
    const utterance = 'משוואת ישר 1 היא 2x-y+8=0';
    logAnalytic({ kind: 'input', utterance, locale: 'he', source: 'parser', result: 'not-handled', intermediate: true });
    logAnalytic({ kind: 'input', utterance, locale: 'he', source: 'llm', result: 'lines', steps: ['line l1: 2x-y+8=0'] });

    const [parser, llm] = [bodyOf(spy, 0), bodyOf(spy, 1)];
    expect(parser.intermediate).toBe(true); // so the utterance is not counted twice
    expect(llm.intermediate).toBeUndefined();
    expect(llm.steps).toEqual(['line l1: 2x-y+8=0']); // the field #1297 could not answer without
    expect(llm.utterance).toBe(parser.utterance); // the pair is joinable
  });

  /**
   * THE PRODUCTION POSTURE — REWRITTEN BY #1243, and deliberately stronger than what it replaces.
   *
   * This used to assert *"posts NOTHING outside DEV"*, which was correct while the tool was undeployed
   * and had no prod sink. Analytic is live now, and that absence had a cost: `/log-triage` reported
   * nothing for the most active product in the queue, which is indistinguishable from "no failures".
   *
   * So the contract is no longer "silence" but "ONLY the lean analytics event". The rows below pin what
   * that means, and they are the part worth keeping: a figure snapshot — the most voluminous and most
   * revealing event this module has — must NEVER leave the browser in production, and neither must the
   * dev trace's shape.
   */
  describe('outside DEV it posts ONLY the lean usage event (#1243)', () => {
    it('never posts a FIGURE snapshot — the dev-only reconstruction trace stays dev-only', () => {
      const spy = withFetch(() => Promise.resolve());
      vi.stubEnv('DEV', false);
      logAnalytic({ kind: 'figure', lines: ['A(0,0)'] });
      expect(spy).not.toHaveBeenCalled();
    });

    it('never posts an INTERMEDIATE step — one submission must not be counted twice', () => {
      const spy = withFetch(() => Promise.resolve());
      vi.stubEnv('DEV', false);
      logAnalytic({ kind: 'input', utterance: 'x', intermediate: true, source: 'parser', result: 'not-handled' });
      expect(spy).not.toHaveBeenCalled();
    });

    /**
     * Both properties in ONE case, deliberately: `sessionAnnounced` is module state, so a separate
     * "announces once" test would pass or fail on the order the file happens to run in — which is a
     * test of the runner, not of the module.
     */
    it('posts ONE session line then a lean submit each, and NOT the dev trace fields', () => {
      const spy = withFetch(() => Promise.resolve());
      vi.stubEnv('DEV', false);
      logAnalytic({ kind: 'input', utterance: 'נקודה A(2,3)', locale: 'he', source: 'parser', result: 'ok' });
      logAnalytic({ kind: 'input', utterance: 'נקודה B(4,1)', locale: 'he', source: 'parser', result: 'ok' });

      expect(spy).toHaveBeenCalledTimes(3); // one session announce + two submits
      const bodies = [0, 1, 2].map((i) => bodyOf(spy, i));
      expect(bodies.filter((b) => b.ev === 'session')).toHaveLength(1);
      const submits = bodies.filter((b) => b.ev === 'submit');
      expect(submits).toHaveLength(2);
      expect(submits[0].tool).toBe('analytic'); // the tag that keeps it out of 2-D's file (#1243)
      expect(submits[0].utterance).toBe('נקודה A(2,3)');
      expect(submits[1].utterance).toBe('נקודה B(4,1)');
      // the DEV trace's shape must not ride along into production
      for (const b of submits) {
        expect(b.kind).toBeUndefined();
        expect(b.seq).toBeUndefined();
        expect(b.clientTs).toBeUndefined();
      }
    });

  });

  /**
   * MEASURED ON THE OPERATOR'S LIVE SESSION, not predicted: the first version of this module wrote three
   * identical figure snapshots per change — one pair in the same millisecond (StrictMode double-invokes
   * effects in dev) and further copies seconds apart from re-renders that changed nothing.
   *
   * The precondition is asserted first, so this cannot quietly stop testing what it was built for: the same
   * payload twice must produce ONE line, and a genuine change must still produce one.
   */
  describe('the figure snapshot is deduped by CONTENT (the live-session finding)', () => {
    it('writes one line per distinct figure, however often the effect re-fires', () => {
      const spy = withFetch(() => Promise.resolve());
      const figure = { seed: 0, lines: ['A(2,-5)'], faults: [], outcomes: ['created'] };

      logAnalyticFigure(figure); // mount
      logAnalyticFigure({ ...figure }); // StrictMode's second invoke — a fresh object, same content
      logAnalyticFigure({ ...figure }); // an unrelated re-render
      expect(spy).toHaveBeenCalledOnce();
      expect(bodyOf(spy).kind).toBe('figure');

      logAnalyticFigure({ ...figure, lines: ['A(2,-5)', 'AD תיכון לצלע BC'] }); // a real change
      expect(spy).toHaveBeenCalledTimes(2);

      logAnalyticFigure({ ...figure, seed: 7 }); // «הצג תצורה אחרת» — the seed IS the configuration
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('is silent outside DEV like every other event', () => {
      const spy = withFetch(() => Promise.resolve());
      vi.stubEnv('DEV', false);
      logAnalyticFigure({ seed: 0, lines: ['B(1,1)'], faults: [], outcomes: [] });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('never throws when the sink REJECTS — a debug aid may not break a submit', () => {
    withFetch(() => Promise.reject(new Error('sink down')));
    expect(() => logAnalytic({ kind: 'input', utterance: 'x' })).not.toThrow();
  });

  it('never throws when fetch throws SYNCHRONOUSLY — the other failure mode, guarded separately', () => {
    withFetch(() => {
      throw new Error('no fetch here');
    });
    expect(() => logAnalytic({ kind: 'input', utterance: 'x' })).not.toThrow();
  });
});
