/**
 * #2002 (ADR-CX-103) — the symbolic POLAR reader: a typed polar form, or the W7 pair, whose modulus holds a letter is
 * read off the constraint shapes as (ℚ-affine modulus, exact angle), and spelled as the student typed it.
 */
import { describe, expect, it } from 'vitest';

import type { Constraint } from '../constraint';
import { parseLineV2 } from '../../parser/rules';
import { rat } from '../../value/rational';
import { polarDefinitionOf, polarFormText, polarHoldsLetter, substitutePolar } from '../polarForm';

function constraintsOf(lines: string[]): Constraint[] {
  return lines.flatMap((l) => {
    const o = parseLineV2(l);
    if (!o.ok) throw new Error(`«${l}» did not parse`);
    return [...o.line.constraints];
  });
}
const read = (lines: string[], name = 'z') => polarDefinitionOf(name, constraintsOf(lines));
const text = (lines: string[], name = 'z') => {
  const d = read(lines, name);
  return d ? polarFormText(d) : null;
};

describe('#2002 — a typed polar form in a letter, in every spelling the parser lowers to the same number', () => {
  it.each([
    [['z = r·cis(30°)'], 'r·cis30°'],
    [['z = r cis 30'], 'r·cis30°'],
    [['z = rcis30°'], 'r·cis30°'],
    [['z = r·cis(π/6)'], 'r·cis30°'],
    [['z = r(cos30° + i sin30°)'], 'r·cis30°'],
    [['z = 2r·cis(30°)'], '2r·cis30°'],
    [['z = 2r cis(30°)'], '2r·cis30°'],
    [['z = r·2cis30'], '2r·cis30°'],
    [['z = (r+1)·cis(30°)'], '(r+1)·cis30°'],
    [['z = (1+r)cis30'], '(1+r)·cis30°'],
    [['z = (2r+1)cis30'], '(2r+1)·cis30°'],
    [['z = (r-1)cis 120'], '(r-1)·cis120°'],
    [['z = -r cis 30'], '-r·cis30°'],
  ])('%j reads «%s»', (lines, out) => {
    expect(text(lines)).toBe(out);
  });

  it.each([
    [['|z| = 9r', 'arg(z) = 30°'], '9r·cis30°'],
    [['|z| = 2r+1', 'arg(z) = 30°'], '(2r+1)·cis30°'],
    [['arg z = 45', '|z| = r/2'], 'r/2·cis45°'],
  ])('the W7 pair %j reads «%s»', (lines, out) => {
    expect(text(lines)).toBe(out);
  });

  it('reads the number it is asked about, never another', () => {
    expect(text(['|z1| = 9r', 'arg z1 = 30'], 'z1')).toBe('9r·cis30°');
    expect(read(['|z1| = 9r', 'arg z1 = 30'], 'z')).toBeNull();
  });
});

describe('#2002 — what it does not read', () => {
  it.each([
    [['z = 2·cis(30°)']], // closed: the reading's
    [['z = 2(cos30° + i sin30°)']],
    [['z = 4cis(t)']], // a letter in the argument: no ruling
    [['|z| = 9r']], // half a pair
    [['arg(z) = 30°']],
    [['|z| = 2', 'arg(z) = 30°']], // a closed pair
    [['z = a+bi']],
    [['z1 = 3+4i', 'z = r·z1']], // names another number
  ])('%j has no polar definition in a letter', (lines) => {
    expect(read(lines)).toBeNull();
  });
});

describe('#2002 — only the letters whose chip shows the value are substituted (ADR-CX-065 §3–4)', () => {
  it('a shown letter closes the modulus; the constant keeps its place', () => {
    const d = read(['z = (r+1)·cis(30°)'])!;
    expect(polarHoldsLetter(d)).toBe(true);
    const closed = substitutePolar(d, new Map([['r', rat(2)]]));
    expect(polarHoldsLetter(closed)).toBe(false);
    expect(polarFormText(closed)).toBe('3·cis30°');
  });

  it('a constant a shown letter makes stands where that letter stood', () => {
    const d = read(['z = (a+b)cis30'])!;
    expect(polarFormText(substitutePolar(d, new Map([['a', rat(1)]])))).toBe('(1+b)·cis30°');
    expect(polarFormText(substitutePolar(d, new Map([['b', rat(1)]])))).toBe('(a+1)·cis30°');
  });

  it('a letter not shown stays a letter', () => {
    const d = read(['|z| = 9r', 'arg(z) = 30°'])!;
    expect(polarFormText(substitutePolar(d, new Map()))).toBe('9r·cis30°');
    expect(polarFormText(substitutePolar(d, new Map([['s', rat(4)]])))).toBe('9r·cis30°');
  });
});
