import { describe, it, expect } from 'vitest';
import { isHeadlessCaller } from '../llmProxy';

/**
 * #1955 (ADR-W-127) — the dev host of the model proxy answers a HEADLESS browser as a keyless server.
 * A headless browser has no operator at it, so it cannot carry the operator's authorisation for a
 * live call (CLAUDE.md rule 2). The scripts' contract is the stub in `scripts/lib/browser-harness.mjs`
 * (locked in `scripts/__tests__/model-stub-1955.test.ts`); this is the backstop for a probe that
 * bypasses it, which is what made 18 live calls on 2026-10-09.
 */
describe('#1955 — the dev proxy refuses a headless caller (the backstop for a probe that bypasses the door)', () => {
  it('names the headless shell by User-Agent or by brand list', () => {
    expect(isHeadlessCaller({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/140.0.0.0 Safari/537.36' })).toBe(true);
    expect(isHeadlessCaller({ 'sec-ch-ua': '"Chromium";v="140", "HeadlessChrome";v="140"' })).toBe(true);
  });

  it('lets the operator’s own browser through', () => {
    expect(isHeadlessCaller({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36' })).toBe(false);
    expect(isHeadlessCaller({})).toBe(false);
  });
});
