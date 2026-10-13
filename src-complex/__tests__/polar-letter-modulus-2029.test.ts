/**
 * #2029 (ADR-CX-068) — a LETTER modulus in a polar form is a parameter in every spelling.
 *
 * «z = r·cis(30°)» read r as a real parameter (a chip, two configurations for its sign), while
 * «z = r cis 30», «z = rcis30°», «z = r cis(30°)» and the trigonometric «z = r(cos30° + i sin30°)» were
 * claimed by the generic-polar rule, which emitted only `arg z = 30°`: the letter was discarded and |z|
 * freed instead, so a later «r = 3» was accepted and reached nothing. Operator ruling, 2026-10-13
 * (card 24, option A): *"both spellings read r as a letter."*
 *
 * The locks assert the strongest thing that can be said — each spelling lowers to EXACTLY the facts of
 * the dotted spelling and reads back the same — through the real `parseLineV2` / `submitLine` /
 * `deriveLines` path. A symbolic ANGLE keeps ADR-CX-026's reading (rows unchanged).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
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
const readingsOf = (lines: string[]) =>
  deriveLines(lines, 0, 0).points.map((p) => [p.name, p.reading, p.readingCart]);

describe('#2029 — every spelling of a letter-modulus polar form lowers to the dotted facts', () => {
  it.each([
    // the issue's lines
    ['z = r cis 30', 'z = r·cis(30°)'],
    ['z = rcis30°', 'z = r·cis(30°)'],
    ['z = r cis(30°)', 'z = r·cis(30°)'],
    ['z = r(cos30° + i sin30°)', 'z = r·cis(30°)'],
    // the rest of the class: glued, bracketed, spaced trig, another name, another letter, radians
    ['z = r cis30', 'z = r·cis(30°)'],
    ['z = rcis(30)', 'z = r·cis(30°)'],
    ['z = (rcis30)', 'z = r·cis(30°)'],
    ['z = (rcis(30°))', 'z = r·cis(30°)'],
    ['z = r (cos 30 + i sin 30)', 'z = r·cis(30°)'],
    ['w = r cis 45', 'w = r·cis(45°)'],
    ['z = a cis 30', 'z = a·cis(30°)'],
    ['z = r cis(π/6)', 'z = r·cis(π/6)'],
  ])('«%s» ≡ «%s»', (line, dotted) => {
    expect(factsOf(line)).toBe(factsOf(dotted));
    expect(readingsOf([line])).toEqual(readingsOf([dotted]));
  });

  it('r is a parameter with the chip, and its sign is the second configuration', () => {
    const d = deriveLines(['z = r cis 30'], 0, 0);
    expect(d.params.map((p) => p.name)).toEqual(['r']);
    expect(d.freeDof).toEqual(['r']);
    expect(d.configCount).toBe(2);
  });
});

describe('#2029 — honesty: a value stated for the letter reaches z', () => {
  it.each([['z = r cis 30'], ['z = rcis30°'], ['z = r(cos30° + i sin30°)']])('«%s» · «r = 3» fixes |z| = 3', (line) => {
    for (const seed of [0, 7]) {
      const d = deriveLines([line, 'r = 3'], 0, seed);
      expect(d.freeDof).toEqual([]);
      const z = d.points.find((p) => p.name === 'z')!;
      expect(Math.hypot(z.z.re, z.z.im)).toBeCloseTo(3, 9);
      expect(z.argumentDeg).toBeCloseTo(30, 9);
      expect(readingsOf([line, 'r = 3'])).toEqual(readingsOf(['z = r·cis(30°)', 'r = 3']));
    }
  });

  it('the store accepts both lines', () => {
    expect(submitLine('z = r cis 30')).toBe(true);
    expect(submitLine('r = 3')).toBe(true);
    expect(store().lines).toEqual(['z = r cis 30', 'r = 3']);
  });
});

describe('#2029 — unchanged: a symbolic angle, a numeric pair, and the lexer words', () => {
  it('«z1 = r cis θ» still declares only the name — both halves free, no parameter', () => {
    const d = deriveLines(['z1 = r cis θ'], 0, 0);
    expect(d.params).toEqual([]);
    expect(d.freeDof).toEqual(expect.arrayContaining(['|z1|', 'arg z1']));
  });

  it.each([
    ['z1 = 2cis(θ)', ['arg z1']],
    ['z = 4cis(t)', ['arg z']],
    ['z = r cis t', ['|z|', 'arg z']],
    ['z1 = 2cis150', []],
    ['z = 2 cis 30', []],
  ])('«%s» keeps its reading', (line, free) => {
    const d = deriveLines([line], 0, 0);
    expect(d.params).toEqual([]);
    expect(d.freeDof).toEqual(free);
  });

  // the lexer now cuts a letter run before `cis`; no other word may be cut
  it.each(['w = conj(z1)', 'w = re(z1)', 'w = im(z1)', 'z = a+bi', 'z1 = 2cis150', 'w = z1 cis30', 'z1*conj(z1) + z2*conj(z2) = 25'])(
    '«%s» still parses',
    (line) => {
      expect(parseLineV2(line).ok).toBe(true);
    },
  );
});
