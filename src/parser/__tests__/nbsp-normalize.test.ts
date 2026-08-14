/**
 * #531 (ADR-3D-144's 2-D half) — the 2-D seam already stripped the bidi isolates (this file's 3-D
 * sibling closes that gap in parse3); what 2-D lacked was the NBSP fold from the same paste paths.
 */
import { describe, expect, it } from 'vitest';
import { normalizeUtterance, parse } from '@/parser';

const NBSP = ' ';

describe('#531 — NBSP normalizes at the one 2-D boundary', () => {
  it('normalizeUtterance folds NBSP to a plain space', () => {
    expect(normalizeUtterance(`מיתר${NBSP}AB`)).toBe(normalizeUtterance('מיתר AB'));
  });

  it('an NBSP-carrying given parses identically to the plain one', () => {
    const plain = parse('AB = 6');
    const pasted = parse(`AB${NBSP}=${NBSP}6`);
    expect(plain.ok && pasted.ok).toBe(true);
    if (plain.ok && pasted.ok) expect(pasted.commands).toEqual(plain.commands);
  });

  it('the isolate strip that already existed keeps holding (the 3-D fix has the property lock)', () => {
    const plain = parse('מיתר AB');
    const wrapped = parse('⁦מיתר AB⁩');
    expect(plain.ok && wrapped.ok).toBe(true);
    if (plain.ok && wrapped.ok) expect(wrapped.commands).toEqual(plain.commands);
  });
});
