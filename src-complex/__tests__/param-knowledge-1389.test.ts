/**
 * #1389 — «I would expect the r is defined in the data panel and at least when i ask for it we know
 * what it is». A real parameter becomes a SUBJECT of the knowledge surfaces.
 *
 * Root cause: the ask grammar read expressions over complex names only, and the data panel listed drawn
 * points only, so a parameter tier 1 had SOLVED (`r = 5/9`, ADR-CX-041) was published nowhere. And the
 * one exact value was not substituted where the parameter was read, so `|z2| = 18r` printed as `18r`
 * after the givens had made it 10.
 *
 * The fix, one value per solved parameter: tier 1's `paramValues`, substituted into `knownModulus` and
 * the drawn reading, and read by the parameters section and the ask lane alike.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { readAsk } from '../app/submit';

const ask = (lines: string[], q: string) => deriveLines(lines, 0, 0, [q]).knowledge.find((k) => k.label === q)!;

describe('#1389 — the operator\'s sequence: r is solved, shown and askable', () => {
  const lines = ['z1 = 3+4i', '|z1| = 9r'];

  it('the parameters section shows r = 5/9 (exact, never a sample)', () => {
    expect(deriveLines(lines).params).toEqual([{ name: 'r', value: '5/9' }]);
  });

  it.each([
    ['r', '5/9'],
    ['9r', '5'],
    ['r^2', '25/81'],
  ])('asking «%s» answers %s', (q, value) => {
    expect(readAsk(q).kind).toBe('expr');
    expect(ask(lines, q)).toEqual({ label: q, value, why: null });
  });
});

describe('#1389 — a FREE parameter reads free, and its question says why, not «לא הבין»', () => {
  it('«|z1| = 9r» alone: the panel says r is free', () => {
    expect(deriveLines(['|z1| = 9r']).params).toEqual([{ name: 'r', value: null }]);
  });

  it('asking «r» is a question (not unreadable) and answers "not determined"', () => {
    expect(readAsk('r').kind).toBe('expr');
    const row = ask(['|z1| = 9r'], 'r');
    expect(row.value).toBeNull();
    expect(row.why).not.toBeNull();
  });
});

describe('#1389 step 3 — a solved parameter is substituted into exact moduli', () => {
  const lines = ['z1 = 3+4i', '|z1| = 9r', '|z2| = 18r'];

  it('«|z2|» answers 10 — an exactly carried modulus is knowledge while arg z2 is free', () => {
    expect(ask(lines, '|z2|')).toEqual({ label: '|z2|', value: '10', why: null });
  });

  it('with arg z2 stated, z₂ reads 10·cis30°, never 18r·cis30°', () => {
    const z2 = deriveLines([...lines, 'arg z2 = 30']).points.find((p) => p.name === 'z2')!;
    expect(z2.reading).toBe('z₂ = 10·cis30°');
  });
});

describe('#1389 — parametric answers over a FREE parameter are untouched (the §2b capstone)', () => {
  const capstone = [
    'arg z1 - arg z2 = 90',
    '|z1| = 9r',
    '|z2| = 12r',
    'z2 ברביע הראשון',
    'arg z2 < 45',
  ];

  it('«|z1-z2|» still answers 15r, and r stays free in the panel', () => {
    expect(ask(capstone, '|z1-z2|').value).toBe('15r');
    expect(deriveLines(capstone).params).toEqual([{ name: 'r', value: null }]);
  });
});
