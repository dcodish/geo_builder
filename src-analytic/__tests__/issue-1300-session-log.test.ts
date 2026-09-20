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
   * THE PRODUCTION POSTURE. Not a nicety — the tool is undeployed and has no prod sink, so this early
   * return is the only thing standing between a build and an unaudited POST.
   */
  it('posts NOTHING outside DEV', () => {
    const spy = withFetch(() => Promise.resolve());
    vi.stubEnv('DEV', false);
    logAnalytic({ kind: 'input', utterance: 'anything' });
    logAnalytic({ kind: 'figure', lines: ['A(0,0)'] });
    logAnalytic({ kind: 'action', action: 'clear' });
    expect(spy).not.toHaveBeenCalled();
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
