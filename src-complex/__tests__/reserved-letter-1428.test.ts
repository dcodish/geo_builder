/**
 * #1428 (ADR-CX-048) — «z^3 = 1» then «z^3 = 8» was ACCEPTED: the cube roots of 1 drawn beside a separate
 * point z = 2, green, for givens that cannot both hold. «z^3 = 1» then «|z| = 2» was refused. One
 * letter, two answers.
 *
 * Root cause: the reserved-letter check in `lowerLines` read `declares` alone, and a power equation's
 * letter is not in `declares` — it lives only in `roots`. So the second `X^n = …` skipped the
 * reservation and constrained a NEW point named z. The check now reads `namesUsed(line)`, every name the
 * line uses.
 *
 * And the refusal said «אינו מתיישב עם» — a contradiction — for `z = 1+i` after `z^2 = 2i`, where 1+i IS
 * a root. The gate now carries the fold's own reason (`reserved-letter`) to the strip, so the student
 * reads that z names the solutions of the earlier equation. The operator's ruling (2026-09-27): refuse
 * now; combining the two equations (intersect / select) is #1466.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines, namesUsed } from '../app/deriveLines';
import { errorText } from '../app/errorText';
import { submitLine } from '../app/submit';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';
import { complexI18n } from '../i18n';
import { stripFormatControls } from '../../shell/bidi';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (lines: string[]) => lines.map((l) => submitLine(l));
const points = () => deriveLines(store().lines, store().seed, store().seed).points.map((p) => p.name).sort();
const tHe = complexI18n.getFixedT('he');
const he = (key: string, params?: Record<string, unknown>) => stripFormatControls(tHe(key, params));
/** the sentence on the strip, in Hebrew, through the one wording function the App calls */
const strip = () => errorText(store().lastError!, he);

const used = (raw: string) => {
  const r = parseLineV2(raw);
  if (!r.ok) throw new Error(`does not parse: ${raw}`);
  return namesUsed(r.line);
};

describe('namesUsed — every name a line uses, not only what it declares', () => {
  it('a power equation uses its LETTER, which it does not declare', () => {
    const r = parseLineV2('z^3 = 8');
    expect(r.ok && r.line.declares).toEqual([]);
    expect(used('z^3 = 8')).toEqual(['z']);
  });

  it('…and every name on its right-hand side', () => {
    expect(used('w^2 = z1').sort()).toEqual(['w', 'z1']);
  });

  it('a size, a window and a definition use the letter they are about', () => {
    expect(used('|z| = 2')).toContain('z');
    expect(used('90 < arg z < 180')).toContain('z');
    expect(used('z = 1+i')).toContain('z');
  });

  it('a TYPE declaration is not a use (ADR-CX-047): «u מספר מרוכב» uses nothing', () => {
    expect(used('u מספר מרוכב')).toEqual([]);
  });
});

describe('#1428 — a second equation on a reserved letter is refused with the reserved-letter sentence', () => {
  it('«z^3 = 1 · z^3 = 8» is refused, naming «z^3 = 1»', () => {
    expect(play(['z^3 = 1', 'z^3 = 8'])).toEqual([true, false]);
    expect(store().lastError).toEqual({
      key: 'refused',
      detail: 'z^3 = 8',
      why: { code: 'reserved-letter', letter: 'z', equation: 'z^3 = 1' },
    });
    expect(strip()).toBe(
      'המשפט "z^3 = 8" לא נוסף — z מסמן את פתרונות המשוואה «z^3 = 1» — התייחסו לפתרונות עצמם',
    );
    // keep-prior, and no phantom fourth point named z
    expect(store().lines).toEqual(['z^3 = 1']);
    expect(points()).toEqual(['z1', 'z2', 'z3']);
  });

  it('…and in the other order, naming «z^3 = 8»', () => {
    expect(play(['z^3 = 8', 'z^3 = 1'])).toEqual([true, false]);
    expect(store().lastError).toMatchObject({ key: 'refused', why: { code: 'reserved-letter', equation: 'z^3 = 8' } });
    expect(strip()).toContain('«z^3 = 8»');
  });

  it('«z^2 = 4 · z^2 = -4» is refused', () => {
    expect(play(['z^2 = 4', 'z^2 = -4'])).toEqual([true, false]);
    expect(store().lastError).toMatchObject({ key: 'refused', why: { code: 'reserved-letter', letter: 'z', equation: 'z^2 = 4' } });
    expect(points()).toEqual(['z1', 'z2']);
  });

  it('«w^2 = 4 · w^2 = 9» is refused — the letter is not special', () => {
    expect(play(['w^2 = 4', 'w^2 = 9'])).toEqual([true, false]);
    expect(store().lastError).toMatchObject({ key: 'refused', why: { code: 'reserved-letter', letter: 'w', equation: 'w^2 = 4' } });
    expect(points()).toEqual(['w1', 'w2']);
  });

  it('a CONSISTENT second equation («z^2 = 4 · z^3 = 8») is refused too — combining is #1466, not built', () => {
    expect(play(['z^2 = 4', 'z^3 = 8'])).toEqual([true, false]);
    expect(store().lastError).toMatchObject({ key: 'refused', why: { code: 'reserved-letter', equation: 'z^2 = 4' } });
  });
});

describe('#1428 arm 2 — the strip never claims a contradiction that does not exist', () => {
  it('«z^2 = 2i · z = 1+i»: the reserved-letter sentence, never «אינו מתיישב» (1+i IS a root of 2i)', () => {
    expect(play(['z^2 = 2i', 'z = 1+i'])).toEqual([true, false]);
    expect(store().lastError?.key).toBe('refused');
    expect(strip()).toBe(
      'המשפט "z = 1+i" לא נוסף — z מסמן את פתרונות המשוואה «z^2 = 2i» — התייחסו לפתרונות עצמם',
    );
    expect(strip()).not.toContain('אינו מתיישב');
  });

  it('«z^3 = 1 · |z| = 2» — the shape that was already refused — now reads the same sentence', () => {
    expect(play(['z^3 = 1', '|z| = 2'])).toEqual([true, false]);
    expect(strip()).toBe(
      'המשפט "|z| = 2" לא נוסף — z מסמן את פתרונות המשוואה «z^3 = 1» — התייחסו לפתרונות עצמם',
    );
  });

  it('a GENUINE contradiction keeps the «incompatible» sentence naming the other line', () => {
    expect(play(['z = 1+i', 'z^3 = 8'])).toEqual([true, false]);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z = 1+i' });
  });
});

describe('#1428 — what is unchanged', () => {
  it('«z^3 = 8» alone draws its three solutions', () => {
    expect(play(['z^3 = 8'])).toEqual([true]);
    expect(points()).toEqual(['z1', 'z2', 'z3']);
  });

  it('the #1396 member cases: «z1 = 2cis120 · z^3 = 8», in both orders', () => {
    expect(play(['z1 = 2cis120', 'z^3 = 8'])).toEqual([true, true]);
    expect(points()).toEqual(['z1', 'z2', 'z3']);
    store().resetSession();
    expect(play(['z^3 = 8', 'z1 = 2cis120'])).toEqual([true, true]);
    expect(points()).toEqual(['z1', 'z2', 'z3']);
  });

  it('a solution stays referable by its own name: «z^3 = 8 · w^2 = z1»', () => {
    expect(play(['z^3 = 8', 'w^2 = z1'])).toEqual([true, true]);
  });
});
