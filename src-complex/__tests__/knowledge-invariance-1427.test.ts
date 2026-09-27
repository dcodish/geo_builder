/**
 * #1427 (P1, ADR-CX-049) — «Re(z) and |z| are 'not determined'» for z² − 4z + 13 = 0 — and
 * z1² − 4z1 + 13 = 0 · z2 = 2z1 printed Im(z1) = 3 as fact (it is ±3).
 *
 * Root cause: the knowledge predicate COUNTED configurations instead of comparing values across them,
 * and the set it counted was incomplete — tier 2 landed on one root from the seed's start and the
 * others never became configurations. So a value that differs between roots printed (count 1), a value
 * they share was withheld (count 0 → «not determined»; count 2 → «differs»), and "show another" was
 * disabled for a figure with two drawings.
 *
 * The fix: stage 3b reports every distinct solution with a completeness flag (a polynomial certificate
 * makes it `complete`; a multi-start census is a `floor`), configurations = tier-1 branches × numeric
 * solutions, and the ONE predicate evaluates the asked value in every configuration.
 *
 * Every case runs the REAL submit path — `submitLine` per line, asks routed to the lane — then the
 * fold at 24 seeds, which is also the configuration index "show another" walks.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { stripFormatControls } from '../../shell/bidi';
import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { whyText } from '../replay/scene2';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
const SEEDS = Array.from({ length: 24 }, (_, s) => s);

beforeEach(() => store().resetSession());

const feed = (lines: readonly string[], asks: readonly string[]) => {
  for (const l of [...lines, ...asks]) expect(submitLine(l), `refused «${l}»`).toBe(true);
  expect(store().queries).toEqual(asks);
};
const at = (seed: number) => deriveLines(store().lines, seed, seed, store().queries);
const row = (seed: number, label: string) => at(seed).knowledge.find((k) => k.label === label)!;
/** the ask's row at every one of the 24 seeds */
const rows = (label: string) => SEEDS.map((s) => row(s, label));

describe('#1427 lock 1 — z1²−4z1+13=0 · z2 = 2z1: Im(z1) is ±3, never printed; Re(z1) is 2', () => {
  beforeEach(() => feed(['z1^2-4z1+13=0', 'z2 = 2z1'], ['Im(z1)', 'Re(z1)']));

  it('Im(z1) never prints a number, at any of 24 seeds — it differs between the two configurations', () => {
    for (const r of rows('Im(z1)')) expect(r).toEqual({ label: 'Im(z1)', value: null, why: { code: 'multi-config', configs: 2 } });
  });

  it('Re(z1) prints 2 at every seed — both roots share it', () => {
    for (const r of rows('Re(z1)')) expect(r).toEqual({ label: 'Re(z1)', value: '2', why: null });
  });

  it('the entry order does not matter (z2 = 2z1 first)', () => {
    store().resetSession();
    feed(['z2 = 2z1', 'z1^2-4z1+13=0'], ['Im(z1)', 'Re(z1)']);
    expect(row(0, 'Re(z1)').value).toBe('2');
    expect(row(0, 'Im(z1)').value).toBeNull();
  });
});

describe('#1427 lock 2 — z²−4z+13=0: Re and |z| print, Im is withheld, both roots are drawings', () => {
  beforeEach(() => feed(['z^2-4z+13=0'], ['Re(z)', '|z|', 'Im(z)']));

  it('Re(z) = 2 and |z| = √13 ≈ 3.61 at every seed', () => {
    for (const r of rows('Re(z)')) expect(r.value).toBe('2');
    for (const r of rows('|z|')) expect(r.value).toBe('3.61');
  });

  it('Im(z) is withheld as «differs between the 2 configurations»', () => {
    for (const r of rows('Im(z)')) expect(r.why).toEqual({ code: 'multi-config', configs: 2 });
  });

  it('"show another configuration" is enabled, the set is complete, and both roots are reachable', () => {
    const d = at(0);
    expect(d.canCycle).toBe(true);
    expect(d.configCount).toBe(2);
    expect(d.configCompleteness).toBe('complete');
    const drawn = new Set(
      SEEDS.map((s) => {
        const z = at(s).points.find((p) => p.name === 'z')!.z;
        return `${Math.round(z.re)}${z.im < 0 ? '-' : '+'}${Math.round(Math.abs(z.im))}i`;
      }),
    );
    expect(drawn).toEqual(new Set(['2+3i', '2-3i']));
  });
});

describe('#1427 lock 3 — z1 = 2 · |z2| = 1 · z2² = −1: invariants print across the two branches', () => {
  beforeEach(() => feed(['z1 = 2', '|z2| = 1', 'z2^2 = -1'], ['|z1-z2|', 'Re(z2)', 'Im(z2)']));

  it('|z1−z2| = √5 ≈ 2.24 and Re(z2) = 0 print — the «differs» sentence was false for both', () => {
    for (const r of rows('|z1-z2|')) expect(r.value).toBe('2.24');
    for (const r of rows('Re(z2)')) expect(r.value).toBe('0');
  });

  it('Im(z2) is withheld as «differs» (it is ±1)', () => {
    for (const r of rows('Im(z2)')) expect(r.why).toEqual({ code: 'multi-config', configs: 2 });
  });
});

describe('#1427 lock 4 — z1 = 1+i · Im(z2) = 0 · |z2 − z1| = 2: a census FLOOR never prints', () => {
  beforeEach(() => feed(['z1 = 1+i', 'Im(z2) = 0', '|z2 - z1| = 2'], ['Re(z2)']));

  it('Re(z2) is withheld at all 24 seeds with «may have more than one possibility»', () => {
    for (const r of rows('Re(z2)')) expect(r).toEqual({ label: 'Re(z2)', value: null, why: { code: 'maybe-multi' } });
  });

  it('both solutions (1 ± √3) are drawings the button reaches', () => {
    expect(at(0).configCompleteness).toBe('floor');
    expect(at(0).canCycle).toBe(true);
    const re = new Set(SEEDS.map((s) => at(s).points.find((p) => p.name === 'z2')!.z.re.toFixed(2)));
    expect(re).toEqual(new Set(['2.73', '-0.73']));
  });
});

describe('#1427 — the class, beyond the four reported sequences', () => {
  it('a polynomial read through the OTHER orientation (z2 = conj(z1)) is complete too: Im(z1) = ±√2 is withheld as «differs»', () => {
    feed(['z1^2-4z1+6=0', 'z2 = conj(z1)'], ['Im(z1)', 'Re(z1)']);
    for (const r of rows('Im(z1)')) expect(r.why).toEqual({ code: 'multi-config', configs: 2 });
    for (const r of rows('Re(z1)')) expect(r.value).toBe('2');
  });

  it('a circle–circle intersection (n = 1, not a polynomial) is a floor: Re(z2) never prints', () => {
    feed(['z1 = 1+i', '|z2| = 2', '|z2 - z1| = 2'], ['Re(z2)']);
    for (const r of rows('Re(z2)')) expect(r.why).toEqual({ code: 'maybe-multi' });
  });

  it('z³ − 1 = 0: three configurations, |z| = 1 prints, Re(z) differs', () => {
    feed(['z^3-1=0'], ['|z|', 'Re(z)']);
    expect(at(0).configCount).toBe(3);
    for (const r of rows('|z|')) expect(r.value).toBe('1');
    for (const r of rows('Re(z)')) expect(r.why).toEqual({ code: 'multi-config', configs: 3 });
  });

  it('a degree-1 polynomial is a complete set of ONE: z1 + z2 = 5+2i prints Re(z2) = 2', () => {
    feed(['z1 = 3+4i', 'z1 + z2 = 5+2i'], ['Re(z2)', 'Im(z2)']);
    expect(at(0).configCount).toBe(1);
    expect(at(0).canCycle).toBe(false);
    expect(row(0, 'Re(z2)').value).toBe('2');
    expect(row(0, 'Im(z2)').value).toBe('-2');
  });

  it('a filter prunes a root exactly as it prunes a branch: in the first quadrant, Im(z) = 3 is knowledge', () => {
    feed(['z^2-4z+13=0', 'z ברביע הראשון'], ['Im(z)']);
    expect(at(0).configCount).toBe(1);
    for (const r of rows('Im(z)')) expect(r.value).toBe('3');
  });
});

describe('#1427 — the new sentence, in both languages (operator ruling 2026-09-27)', () => {
  const fixed = (lng: 'he' | 'en') => {
    const t = complexI18n.getFixedT(lng);
    return (key: string, params?: Record<string, unknown>) => stripFormatControls(t(key, params));
  };

  it('he: «ייתכן שיש לערך כמה אפשרויות — הוא אינו נקבע בוודאות»', () => {
    expect(whyText({ code: 'maybe-multi' }, fixed('he'))).toBe('ייתכן שיש לערך כמה אפשרויות — הוא אינו נקבע בוודאות');
  });

  it('en: "This value may have more than one possibility — it is not determined for certain"', () => {
    expect(whyText({ code: 'maybe-multi' }, fixed('en'))).toBe(
      'This value may have more than one possibility — it is not determined for certain',
    );
  });
});
