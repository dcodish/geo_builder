/**
 * The shared save contract: envelope refusals (a foreign or future file NEVER half-loads),
 * the naming convention and its inverse (issue #20 / #42 rules, parameterized by suffix).
 */
import { describe, expect, it } from 'vitest';
import { figureNameFromFileName, readEnvelope, savedFileName } from '../save';

const SPEC = { app: 'complex-builder', maxVersion: 1 };

describe('readEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    const r = readEnvelope({ app: 'complex-builder', version: 1, lines: [] }, SPEC);
    expect(r.ok).toBe(true);
  });

  it('a missing version reads as 1 (lenient toward hand-authored files)', () => {
    expect(readEnvelope({ app: 'complex-builder', lines: [] }, SPEC).ok).toBe(true);
  });

  it('refuses non-objects and arrays as not-a-session', () => {
    for (const bad of ['garbage', null, undefined, 42, ['a']]) {
      const r = readEnvelope(bad, SPEC);
      expect(r).toEqual({ ok: false, reason: 'not-a-session' });
    }
  });

  it("refuses another builder's file as wrong-app — nameable, not just invalid", () => {
    const r = readEnvelope({ app: 'geo-builder', schemaVersion: 1 }, SPEC);
    expect(r).toEqual({ ok: false, reason: 'wrong-app' });
  });

  it('refuses a FUTURE version instead of half-loading it', () => {
    const r = readEnvelope({ app: 'complex-builder', version: 2, lines: [] }, SPEC);
    expect(r).toEqual({ ok: false, reason: 'newer-version' });
  });

  it('refuses a malformed version', () => {
    expect(readEnvelope({ app: 'complex-builder', version: 'x' }, SPEC).ok).toBe(false);
    expect(readEnvelope({ app: 'complex-builder', version: 0.5 }, SPEC).ok).toBe(false);
  });
});

describe('savedFileName / figureNameFromFileName', () => {
  const now = new Date('2026-08-17T12:00:00Z');

  it('a named figure gets name-suffix.json', () => {
    expect(savedFileName('2026summer', now, 'complex')).toBe('2026summer-complex.json');
  });

  it('an unnamed figure falls back to a date-stamped default — successive saves never overwrite', () => {
    expect(savedFileName(undefined, now, 'complex')).toBe('figure-2026-08-17-complex.json');
    expect(savedFileName('   ', now, 'complex')).toBe('figure-2026-08-17-complex.json');
  });

  it('never double-suffixes, and strips a typed extension and illegal characters', () => {
    expect(savedFileName('mywork-complex', now, 'complex')).toBe('mywork-complex.json');
    expect(savedFileName('mywork.json', now, 'complex')).toBe('mywork-complex.json');
    expect(savedFileName('a/b:c*d', now, 'complex')).toBe('abcd-complex.json');
  });

  it('the inverse recovers the name from the filename', () => {
    expect(figureNameFromFileName('2026summer-complex.json', 'complex')).toBe('2026summer');
    expect(figureNameFromFileName('figure-2026-08-17-complex.json', 'complex')).toBe('figure-2026-08-17');
  });
});
