/**
 * #1300 — the debug sink routes by REGISTRY, and an unknown tool is written nowhere.
 *
 * The defect this locks is not the missing analytic file; it is the ELSE that used to sit under it.
 * `server/logProxy.ts` read `obj.tool === '3d' ? debug-log-3d.jsonl : debug-log.jsonl`, so **any** tool tag
 * the file did not know — a new product, a typo, a stray client — was appended to `debug-log.jsonl`, the
 * corpus `src/__tests__/scenarios-corpus-*.ts`, `src/theorems/audit.ts` and the log-triage skill all read as
 * genuine 2-D user data.
 *
 * So the row that matters here is the REJECTION, not the mapping. A future third ternary arm would satisfy
 * every "each tool has its own file" assertion and still reopen the defect; only the unknown-tool row can
 * tell the two apart.
 *
 * These call `logFileFor` rather than re-deriving the mapping (ADR-W-053): a test that reproduced this
 * decision would have had to reproduce the `else` along with it, and would have agreed with the bug.
 */
import { describe, it, expect } from 'vitest';
import { logFileFor } from '../logProxy';

describe('#1300 — the debug log routes by tool', () => {
  it('gives each product its own file', () => {
    expect(logFileFor('2d')).toBe('debug-log.jsonl');
    expect(logFileFor('3d')).toBe('debug-log-3d.jsonl');
    expect(logFileFor('analytic')).toBe('debug-log-analytic.jsonl');
    expect(logFileFor('complex')).toBe('debug-log-complex.jsonl');
  });

  it('never routes two products to one file', () => {
    const files = ['2d', '3d', 'analytic', 'complex'].map(logFileFor);
    expect(new Set(files).size).toBe(files.length);
  });

  /**
   * THE ROW THIS FILE EXISTS FOR. An unknown tool is refused, so nothing it sends can reach a corpus that
   * belongs to a different grammar. `null` is what the handler turns into a 400.
   */
  it('REFUSES an unknown tool rather than defaulting it into the 2-D corpus', () => {
    for (const unknown of ['analytics', 'ANALYTIC', '4d', 'geo', '', 'debug-log.jsonl', '../escape']) {
      expect(logFileFor(unknown), unknown).toBeNull();
    }
  });

  it('refuses a non-string tag', () => {
    expect(logFileFor(3)).toBeNull();
    expect(logFileFor({ tool: '2d' })).toBeNull();
    expect(logFileFor(['2d'])).toBeNull();
  });

  /**
   * The ONE documented back-compat case, asserted so it stays deliberate: `src/debug/sessionLog.ts` has
   * never tagged its events. That is why an absent tag maps to 2-D and an unknown one does not — the two
   * look alike in a `??` and are opposite decisions.
   */
  it('treats an ABSENT tag as 2-D — the untagged legacy client, not a default', () => {
    expect(logFileFor(undefined)).toBe('debug-log.jsonl');
    expect(logFileFor(null)).toBe('debug-log.jsonl');
  });
});
