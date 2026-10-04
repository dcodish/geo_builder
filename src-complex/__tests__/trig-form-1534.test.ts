/**
 * #1534 (ADR-CX-059) — «z1 = √2(cos45 + i sin45)»: the trigonometric form is the same number as r·cisθ.
 *
 * Operator ruling, 2026-10-04: understand it as r·cisθ, displayed in the student's own form. The form is
 * a SPELLING of cis, rewritten at the orthography chokepoint, so the locks below assert the strongest
 * thing that can be said: the line lowers to EXACTLY the facts the cis spelling lowers to (one decision,
 * not a second polar path), and it reads back the same. A pair whose angles differ is refused naming
 * both. Everything runs through the real `parseLineV2` / `submitLine` / `deriveLines` path.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { errorText } from '../app/errorText';
import { submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { normalize, trigAngleMismatch } from '../parser/normalize';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';
import { stripFormatControls } from '../../shell/bidi';

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

describe('#1534 — the trigonometric form lowers to exactly the facts of its cis spelling', () => {
  it.each([
    // the operator's line, and the √2 variant the sweep found
    ['z1 = 2(cos45 + i sin45)', 'z1 = 2cis45'],
    ['z1 = √2(cos45 + i sin45)', 'z1 = √2cis45'],
    // r omitted ⇒ 1
    ['z1 = cos45 + i sin45', 'z1 = cis45'],
    ['z1 = (cos45 + i sin45)', 'z1 = cis45'],
    // every way of writing the i
    ['z1 = 2(cos45 + i·sin45)', 'z1 = 2cis45'],
    ['z1 = 2(cos45 + i*sin45)', 'z1 = 2cis45'],
    ['z1 = 2(cos45 + isin45)', 'z1 = 2cis45'],
    ['z1 = 2(cos45 + sin45·i)', 'z1 = 2cis45'],
    ['z1 = 2(cos45 + sin45 i)', 'z1 = 2cis45'],
    // degrees with the sign, signed and parenthesised angles, a non-table angle
    ['z1 = 2(cos45° + i sin45°)', 'z1 = 2cis45'],
    ['z1 = 2(cos(45) + i sin(45))', 'z1 = 2cis45'],
    ['z1 = 2(cos(-30) + i sin(-30))', 'z1 = 2cis(-30)'],
    ['z1 = 2(cos20 + i sin20)', 'z1 = 2cis20'],
    ['z2 = 3(cos150 + i sin150)', 'z2 = 3cis150'],
    // a symbolic angle and a symbolic modulus go through generic-polar, as `r cis θ` does
    ['z1 = r(cosθ + i sinθ)', 'z1 = r cis θ'],
    ['z1 = 2(cosθ + i sinθ)', 'z1 = 2cis(θ)'],
    // a modulus that is not a number, and a product
    ['w = |z1|(cos30 + i sin30)', 'w = |z1|cis30'],
    ['w = z1(cos30 + i sin30)', 'w = z1 cis30'],
    ['w = 1/(cos45 + i sin45)', 'w = 1/cis45'],
  ])('«%s» ≡ «%s»', (trig, cis) => {
    expect(factsOf(trig)).toBe(factsOf(cis));
    expect(readingsOf(trig)).toEqual(readingsOf(cis));
  });

  it('the operator\'s line reads «z₁ = 2·cis45°» and the √2 variant «z₁ = √2·cis45°» = 1+i', () => {
    expect(readingsOf('z1 = 2(cos45 + i sin45)')).toEqual([['z1', 'z₁ = 2·cis45°', 'z₁ = √2+√2i']]);
    expect(readingsOf('z1 = √2(cos45 + i sin45)')).toEqual([['z1', 'z₁ = √2·cis45°', 'z₁ = 1+i']]);
  });

  it('a group raised to a power keeps its parentheses: 2(cis45)² = 2cis90, never (2cis45)²', () => {
    expect(normalize('z1 = 2(cos45 + i sin45)^2')).toBe('z1 = 2 (cis(45))^2');
    expect(readingsOf('z1 = 2(cos45 + i sin45)^2')).toEqual(readingsOf('z1 = 2cis90'));
  });
});

describe('#1534 — the student\'s line stays as typed', () => {
  it.each(['z1 = 2(cos45 + i sin45)', 'z1 = √2(cos45 + i sin45)', 'z1 = cos45 + i sin45'])(
    '«%s» is accepted through the real gate and recorded verbatim',
    (line) => {
      expect(submitLine(line)).toBe(true);
      expect(store().lines).toEqual([line]);
    },
  );

  it('a second mention in trig form is the same given; a different modulus is refused as «3cis45» is', () => {
    expect(submitLine('z1 = 2cis45')).toBe(true);
    expect(submitLine('z1 = 2(cos45 + i sin45)')).toBe(true);
    expect(submitLine('z1 = 3(cos45 + i sin45)')).toBe(false);
    const trigError = store().lastError;
    store().resetSession();
    expect(submitLine('z1 = 2cis45')).toBe(true);
    expect(submitLine('z1 = 2cis45')).toBe(true);
    expect(submitLine('z1 = 3cis45')).toBe(false);
    expect(trigError?.key).toBe(store().lastError?.key);
    expect(trigError?.detail).toBe('z1 = 3(cos45 + i sin45)'); // the refusal quotes the student's own line
  });
});

describe('#1534 — REFUSAL: two different angles are named, never read as one', () => {
  it.each([
    ['z1 = cos45 + i sin30', '45°', '30°'],
    ['z1 = 2(cos45 + i sin30)', '45°', '30°'],
    ['z1 = √2(cos45° + i·sin(-45))', '45°', '-45°'],
  ])('«%s» refuses with trig-mismatch naming %s and %s', (line, cos, sin) => {
    expect(trigAngleMismatch(line)).toEqual({ cos, sin });
    expect(submitLine(line)).toBe(false);
    expect(store().lines).toEqual([]);
    const e = store().lastError!;
    expect(e).toEqual({ key: 'trig-mismatch', detail: line, cos, sin });
    const tHe = complexI18n.getFixedT('he');
    const msg = stripFormatControls(errorText(e, (k, p) => tHe(k, p)));
    expect(msg).toContain(cos);
    expect(msg).toContain(sin);
    expect(msg).not.toContain('לא הצלחתי להבין');
  });

  it('an agreeing form is never a mismatch', () => {
    expect(trigAngleMismatch('z1 = 2(cos45 + i sin45)')).toBeNull();
    expect(trigAngleMismatch('z1 = 2(cos45 + i sin45.0)')).toBeNull();
  });
});

describe('#1534 — only the unambiguous reading is rewritten', () => {
  it.each([
    // a coefficient on the cos alone is a different number
    'z1 = 2cos45 + i sin45',
    '-cos45 + i sin45',
    // the conjugate form is not this sentence
    'z1 = cos45 - i sin45',
  ])('«%s» is left as typed', (line) => {
    expect(normalize(line)).not.toContain('cis');
  });

  it('a radian angle is read exactly as cis reads it — the two spellings never diverge', () => {
    for (const [trig, cis] of [
      ['z1 = 2(cos(π/4) + i sin(π/4))', 'z1 = 2cis(π/4)'],
      ['z1 = 2(cos(pi/4) + i sin(pi/4))', 'z1 = 2cis(pi/4)'],
    ]) {
      expect(parseLineV2(trig).ok).toBe(parseLineV2(cis).ok);
    }
  });
});
