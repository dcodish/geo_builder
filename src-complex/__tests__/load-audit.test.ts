/**
 * The load audit (ADR-242 arriving in the third builder, via shell/save — #673).
 *
 * Before this, `hydrateSession` replayed a saved session through the gate and a line the grammar
 * no longer read simply VANISHED — and the closing `clearError()` erased even the last line's
 * evidence. The audit makes the drop loud: the load reports what it could not restore, line by
 * line, with each line's own refusal reason.
 *
 * The envelope half (shell/save.readEnvelope): a foreign or FUTURE file refuses without touching
 * the open session — complex never checked `version` at all before this.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { hydrateSession } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();

const session = (lines: string[], version = 1) => ({
  app: 'complex-builder',
  version,
  lines,
  freePos: {},
  seed: 0,
  view: 'cart',
});

beforeEach(() => {
  store().resetSession();
});

describe('the load audit — the load reports what it could not restore', () => {
  it('a session whose every line still builds loads clean, with NO audit', () => {
    expect(hydrateSession(session(['z1 = 3+4i', 'w = z1*z1']))).toBe(true);
    expect(store().lines).toEqual(['z1 = 3+4i', 'w = z1*z1']);
    expect(store().loadAudit).toBeNull();
  });

  it('a line the grammar no longer reads is REPORTED, never silently dropped', () => {
    expect(hydrateSession(session(['z1 = 3+4i', 'שורה שאינה נקראת בכלל']))).toBe(true);
    expect(store().lines).toEqual(['z1 = 3+4i']);
    const audit = store().loadAudit;
    expect(audit).not.toBeNull();
    expect(audit!.total).toBe(2);
    expect(audit!.failed).toHaveLength(1);
    expect(audit!.failed[0].line).toBe('שורה שאינה נקראת בכלל');
    expect(audit!.failed[0].reason.key).toBe('not-handled');
  });

  it('a line the GATE refuses carries the gate’s own reason, naming the earlier statement', () => {
    expect(hydrateSession(session(['|z1| = 5', '|z1| = 7']))).toBe(true);
    expect(store().lines).toEqual(['|z1| = 5']);
    const audit = store().loadAudit!;
    expect(audit.failed).toHaveLength(1);
    expect(audit.failed[0].line).toBe('|z1| = 7');
    expect(audit.failed[0].reason.key).toBe('incompatible');
    expect(audit.failed[0].reason.detail).toBe('|z1| = 5');
  });

  it('a FUTURE version refuses without touching the open session (never a half-load)', () => {
    expect(hydrateSession(session(['z1 = 3+4i']))).toBe(true);
    expect(hydrateSession(session(['z9 = 1+i'], 2))).toBe(false);
    expect(store().lines).toEqual(['z1 = 3+4i']);
    expect(store().loadAudit).toBeNull();
  });

  it('a fresh clean load CLEARS the previous load’s audit', () => {
    expect(hydrateSession(session(['z1 = 3+4i', 'שורה שאינה נקראת בכלל']))).toBe(true);
    expect(store().loadAudit).not.toBeNull();
    expect(hydrateSession(session(['z1 = 3+4i']))).toBe(true);
    expect(store().loadAudit).toBeNull();
  });

  it('clearAll dismisses a shown audit with the session it clears', () => {
    expect(hydrateSession(session(['z1 = 3+4i', 'שורה שאינה נקראת בכלל']))).toBe(true);
    expect(store().loadAudit).not.toBeNull();
    store().clearAll();
    expect(store().loadAudit).toBeNull();
  });
});
