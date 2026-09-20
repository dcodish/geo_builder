/**
 * #1147 — THE PANEL'S HEADING IS THE STUDENT'S WORD, NOT THE TYPE NAME.
 *
 * Operator, 2026-09-16, playing the round #1131 sheet: *"the word עקומים should be משוואות"*.
 *
 * He is right, and the reason is worth writing down so the change is not reversed later: that section
 * does not list curves as OBJECTS — it lists what the student stated or asked about them, and every row
 * in it is an equation (`l2: -x + y = 0`). «עקומים» is the internal category (`kind: 'curve'`) leaking
 * into the panel, naming the implementation rather than the student's own word. The exam says
 * «משוואת הישר» and never «העקום». Same class as #1026's `circle-anonq3c8qq`.
 *
 * The KEY was renamed with the word, deliberately: a key called `secCurves` holding «משוואות» is how the
 * next session quietly reintroduces the old noun.
 *
 * The lock is the SWEEP rather than the one literal, so the class cannot return through a different key.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyticI18n } from '../i18n';

describe('#1147 — the equations section says «משוואות»', () => {
  it('the heading reads the student’s word in both languages', () => {
    // Through the real locale, because a key that exists proves nothing about what anyone reads.
    expect(analyticI18n.t('secEquations')).toBe('משוואות');
  });

  it('the neighbouring headings are already the student’s nouns — asserted, not assumed', () => {
    // Checked while in there, per the issue: a heading that named its type would be the same defect.
    expect(analyticI18n.t('secPoints')).toBe('נקודות');
    expect(analyticI18n.t('secLengths')).toBe('אורכים');
    expect(analyticI18n.t('secSlopes')).toBe('שיפועים');
    expect(analyticI18n.t('secParams')).toBe('פרמטרים');
  });

  it('NO user-facing analytic string calls an equation a «עקום» — the sweep, not the literal', () => {
    /**
     * The one-literal version of this test would pass the moment someone added the word back under a
     * different key. This reads the locale file itself, which is where every user-facing string in this
     * tree lives, so the class is closed rather than the instance.
     */
    const locale = readFileSync(join(import.meta.dirname, '..', 'i18n', 'index.ts'), 'utf8');
    const offenders = locale
      .split('\n')
      .filter((l) => /עקו[מם]/.test(l) && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    expect(offenders, `these locale strings still say «עקום»:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the old key is gone, so it cannot be rendered by accident', () => {
    const locale = readFileSync(join(import.meta.dirname, '..', 'i18n', 'index.ts'), 'utf8');
    expect(locale).not.toContain('secCurves');
  });
});
