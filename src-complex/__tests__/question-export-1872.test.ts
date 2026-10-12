/**
 * #1872 (ADR-CX-067) — «הורידו שאלה» in the complex builder: WHICH lines the «נתון:» list prints.
 *
 * Operator ruling W6 (2026-10-08): "Givens only" — the claims the tool checks (✓/✗) are left out; every
 * other active line prints as typed, in entry order. Muted lines are out (2-D's rule). The locks call the
 * real parser through the real hydration path.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { questionLines } from '../app/questionLines';
import { deriveLines } from '../app/deriveLines';
import { hydrateSession } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

describe('#1872 — the complex «נתון:» list: givens only (W6)', () => {
  it('entry order, as typed', () => {
    expect(questionLines(['z1 = 3+4i', '|z2| = 5', 'z^3 = 8'], [])).toEqual(['z1 = 3+4i', '|z2| = 5', 'z^3 = 8']);
  });

  it('no lines → no givens, so the button is disabled', () => {
    expect(questionLines([], [])).toEqual([]);
  });

  it('a muted line is not a given', () => {
    expect(questionLines(['z1 = 3+4i', '|z2| = 5'], [1])).toEqual(['z1 = 3+4i']);
  });

  it('a checked claim is the student’s answer — left out (real, imaginary, conjugate, for-all-n)', () => {
    const lines = ['z1 = 3+4i', 'z1 ממשי', 'w מדומה טהור', 'z1 ו-z2 צמודים זה לזה', 'לכל n טבעי, w^(4n) ממשי'];
    // the precondition: each left-out line really IS one the tool checks as a claim (✓/✗)
    const d = deriveLines(lines);
    expect(d.claims.map((c) => c.claim.src)).toEqual(expect.arrayContaining(lines.slice(1)));
    expect(questionLines(lines, [])).toEqual(['z1 = 3+4i']);
  });

  it('…and so does a claim that DRIVES a free number (#688) — it is still the student’s answer', () => {
    expect(questionLines(['w מדומה טהור', '|w| = 2'], [])).toEqual(['|w| = 2']);
  });

  it('a list of claims alone prints nothing — the button stays disabled', () => {
    expect(questionLines(['w מדומה טהור'], [])).toEqual([]);
  });

  it('a real-parameter TYPE is a given, though its row is also checked (ADR-CX-061)', () => {
    expect(questionLines(['a ממשי', 'z1 = a+2i'], [])).toEqual(['a ממשי', 'z1 = a+2i']);
  });
});

describe('#1872 — rule 4: the saved fixture drives the list end to end', () => {
  beforeEach(() => useComplexStore.getState().resetSession());

  it('question-export-1872.complex.json hydrates and prints exactly its givens', () => {
    const file = path.join(__dirname, 'fixtures', 'question-export-1872.complex.json');
    expect(hydrateSession(JSON.parse(fs.readFileSync(file, 'utf8')))).toBe(true);
    const { lines, disabled } = useComplexStore.getState();
    expect(questionLines(lines, disabled)).toEqual(['z1 = 3+4i', '|z2| = 5']);
  });
});

describe('#1872 — the App wires the shared composer with this list', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('the button is gated on there being a given, not on the line count', () => {
    expect(app).toMatch(/key="saveQuestion".*disabled=\{questionGivens\.length === 0\}/);
  });

  it('the document prints the same list the gate read', () => {
    expect(app).toMatch(/lines: questionGivens,/);
  });
});
