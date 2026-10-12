/**
 * #1754 (ADR-CX-064) — an angle in RADIANS: «z1 = 2cis(π/4)», «z1 = 2cis(pi/4)» and the #1534 trig
 * form «2(cos(π/4) + i sin(π/4))».
 *
 * The complex lexer had no π, so a textbook argument in radians could not be typed at all — and the
 * word `pi` alone was worse: «z1 = 2cis(pi)» was read by the symbolic polar rule as a FREE direction
 * named `pi`. π is now an angle unit, read by ONE text reader (`angleText.ts`) that every cis spelling
 * shares, and converted exactly: `π/4` is the rational 45°. The locks assert the strongest thing that can
 * be said — a radian line lowers to EXACTLY the facts of its degree spelling — and π as a VALUE keeps the
 * refusal it has today. Everything runs through the real `parseLineV2` / `submitLine` / `deriveLines`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { angleDegrees } from '../parser/angleText';
import { trigAngleMismatch } from '../parser/normalize';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

/** The lowered facts of one line with the `src` text stripped — what the engine actually receives. */
const factsOf = (line: string): string => {
  const r = parseLineV2(line);
  if (!r.ok) throw new Error(`«${line}» did not parse: ${r.reason}`);
  const { claims: _c, ...facts } = r.line;
  return JSON.stringify(facts, (k, v) => (k === 'src' ? undefined : typeof v === 'bigint' ? String(v) : v instanceof Map ? [...v] : v));
};
const readingsOf = (line: string) =>
  deriveLines([line], 0, 0).points.map((p) => [p.name, p.reading, p.readingCart]);

describe('#1754 — the reader: a rational multiple of π is an exact number of degrees', () => {
  it.each([
    ['π/4', 45n, 1n],
    ['pi/4', 45n, 1n],
    ['π', 180n, 1n],
    ['2π', 360n, 1n],
    ['3π/4', 135n, 1n],
    ['3/4π', 135n, 1n],
    ['3*π/4', 135n, 1n],
    ['-π/3', -60n, 1n],
    ['-(π/3)', -60n, 1n],
    ['( π / 6 )', 30n, 1n],
    ['π/7', 180n, 7n],
    ['1.5π', 270n, 1n],
    // degrees read exactly as before
    ['45', 45n, 1n],
    ['-30', -30n, 1n],
    ['22.5', 45n, 2n],
  ])('«%s» = %s/%s°', (text, n, d) => {
    expect(angleDegrees(text)).toEqual({ n, d });
  });

  it.each(['π/0', 'π/4 + 1', 'πk/2', 'theta', 'Π', 'Pi/4', ''])('«%s» is no numeric angle', (text) => {
    expect(angleDegrees(text)).toBeNull();
  });
});

describe('#1754 — a radian line lowers to exactly the facts of its degree spelling', () => {
  it.each([
    // the issue's three lines
    ['z1 = 2cis(π/4)', 'z1 = 2cis45'],
    ['z1 = 2cis(pi/4)', 'z1 = 2cis45'],
    ['z1 = 2(cos(π/4) + i sin(π/4))', 'z1 = 2cis45'],
    // other rational multiples, signs, the bare π, other moduli
    ['z1 = 2cis(-π/3)', 'z1 = 2cis(-60)'],
    ['z1 = 2cis(-(π/3))', 'z1 = 2cis(-60)'],
    ['z1 = 2cis(2π/3)', 'z1 = 2cis120'],
    ['z1 = 2cis(5π/4)', 'z1 = 2cis225'],
    ['z1 = 2cis(π)', 'z1 = 2cis180'],
    ['z1 = 2cisπ', 'z1 = 2cis180'],
    ['z1 = √2cis(3π/4)', 'z1 = √2cis135'],
    ['z1 = cis(π/4)', 'z1 = cis45'],
    ['z1^4 = 16cis(π/2)', 'z1^4 = 16cis90'],
    ['z1 = 2(cos(pi/4) + i sin(pi/4))', 'z1 = 2cis45'],
    ['z1 = 2(cos π + i sin π)', 'z1 = 2cis180'],
    // a symbolic modulus: the radian angle is a stated direction, as a degree angle is
    ['z1 = r cis(π/4)', 'z1 = r cis 45'],
    ['z1 = r(cos(π/4) + i sin(π/4))', 'z1 = r cis 45'],
    ['z1 = r cis pi', 'z1 = r cis 180'],
  ])('«%s» ≡ «%s»', (radian, degrees) => {
    expect(factsOf(radian)).toBe(factsOf(degrees));
    expect(readingsOf(radian)).toEqual(readingsOf(degrees));
  });

  it('the issue\'s line reads «z₁ = 2·cis45°» — the canonical reading, exactly as «2cis45»', () => {
    expect(readingsOf('z1 = 2cis(π/4)')).toEqual([['z1', 'z₁ = 2·cis45°', 'z₁ = √2+√2i']]);
  });

  it('«z1 = 2cis(pi)» is π — no longer a free direction named «pi»', () => {
    expect(readingsOf('z1 = 2cis(pi)')).toEqual(readingsOf('z1 = 2cis180'));
  });

  it('a trig form whose slots name ONE angle in two units is that angle, never a mismatch', () => {
    expect(trigAngleMismatch('z1 = 2(cos(π/4) + i sin45)')).toBeNull();
    expect(factsOf('z1 = 2(cos(π/4) + i sin45)')).toBe(factsOf('z1 = 2cis45'));
  });
});

describe('#1754 — the student\'s line is accepted through the real gate and recorded verbatim', () => {
  it.each(['z1 = 2cis(π/4)', 'z1 = 2cis(pi/4)', 'z1 = 2(cos(π/4) + i sin(π/4))'])('«%s»', (line) => {
    expect(submitLine(line)).toBe(true);
    expect(store().lines).toEqual([line]);
  });

  it('a second mention in radians is the same given as its degree spelling', () => {
    expect(submitLine('z1 = 2cis45')).toBe(true);
    expect(submitLine('z1 = 2cis(π/4)')).toBe(true);
    expect(submitLine('z1 = 2cis(π/3)')).toBe(false);
  });
});

describe('#1754 — REFUSAL: what is not an angle stays refused', () => {
  it.each([
    // π as a VALUE — the issue's lock: kept exactly as today
    'z1 = pi',
    'z1 = π',
    'z1 = 2pi',
    '|z1| = π',
    // a bare slash: `cis π/4` may mean the angle or (cis π)/4 — neither is guessed
    'z1 = 2cis π/4',
    'z1 = 2(cos π/4 + i sin π/4)',
    // not a rational multiple of π
    'z1 = 2cis(π/4 + 1)',
    'z1 = 2cis(π/0)',
    'z1 = 2cis(Π)',
    'z1 = r cis Π',
    'z1 = r cis(Pi/4)',
  ])('«%s» is refused as not understood', (line) => {
    expect(submitLine(line)).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
    expect(store().lines).toEqual([]);
  });

  it('two different radian angles are named as typed', () => {
    expect(trigAngleMismatch('z1 = 2(cos(π/4) + i sin(π/3))')).toEqual({ cos: 'π/4', sin: 'π/3' });
    expect(trigAngleMismatch('z1 = 2(cos(3π/4) + i sin45)')).toEqual({ cos: '3π/4', sin: '45°' });
  });
});
