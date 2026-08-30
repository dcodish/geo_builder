/**
 * #802 — refusal banners never quote an id with the ASCII apostrophe.
 *
 * The product's canonical PRIME in point labels is the ASCII `'` (the parse seam normalises `′ → '`),
 * so a template like `'{{id}}' אינה על הישר` rendered `'A' אינה על הישר` — read by the operator as
 * being about A′ and mistriaged (#801 session); a genuinely primed id became the unparseable `'A''`.
 * One glyph, two meanings, in an RTL banner that also reorders the neutrals. Every interpolation in
 * both 3-D locales now quotes with «…» (the repo's docs convention, bidi-safe, never a prime), and this
 * lint keeps it that way — a new template written with `'{{…}}'` fails here, not on a student.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import i18n from '../i18n';

const LOCALES = ['he', 'en'] as const;
const walk = (o: unknown, path: string[], out: [string, string][]): void => {
  if (typeof o === 'string') out.push([path.join('.'), o]);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, [...path, k], out);
};

describe('#802 — id quoting in the 3-D locales', () => {
  for (const loc of LOCALES) {
    const json = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'locales', `${loc}.json`), 'utf-8'));
    const entries: [string, string][] = [];
    walk(json, [], entries);

    it(`${loc}: no template quotes an interpolation with the apostrophe (the prime glyph)`, () => {
      const offenders = entries.filter(([, s]) => /'\{\{\w+\}\}'/.test(s)).map(([k]) => k);
      expect(offenders).toEqual([]);
    });

    it(`${loc}: a QUOTED interpolation is quoted with «…» — and the err catalog still quotes its ids`, () => {
      const quoted = entries.filter(([, s]) => /[«"'„“]\{\{\w+\}\}/.test(s));
      for (const [k, s] of quoted) expect(s, k).toMatch(/«\{\{\w+\}\}»/);
      const errIds = entries.filter(([k, s]) => k.startsWith('err.') && /«\{\{id\}\}»/.test(s));
      expect(errIds.length, 'the 17 templates the #802 sweep converted').toBeGreaterThanOrEqual(15);
    });
  }

  it('the operator’s banner: a primed id reads as itself, not as a double prime', () => {
    i18n.changeLanguage('he');
    const strip = (m: string) => m.replace(/[⁦-⁩]/g, ''); // i18n isolates the id (bidi) — not the quoting
    const msg = strip(i18n.t('err.notOnLine', { id: "A'" }));
    expect(msg).toContain("«A'»");
    expect(msg).not.toContain("''");
    const plain = strip(i18n.t('err.notOnLine', { id: 'A' }));
    expect(plain).not.toContain("'");
  });
});
