/**
 * #1990 ([ADR-W-152](../../../docs/06w-decisions-workspace.md#adr-w-152)) — ONE already-there note in every builder
 * (operator ruling 2026-10-10, option A: "every builder uses 2-D's note", ADR-W-118 B1/B13 applied literally), as the
 * shared half of a four-builder lock.
 *
 * The note is one suite key, `suite.notice.alreadyDrawn`, so its TEXT cannot differ by construction. What can break is
 * a builder's no-op path reading something else (a retired per-product key, a note that echoes the line). So each tree
 * drives a restatement through its OWN decision, and hands this fixture (a) its i18n instance's reading of the key and
 * (b) its App's source, whose no-op branch must read the suite key.
 *
 * Shell may not import a product tree (ADR-W-016 rule 2), so each tree calls this from
 * `<tree>/__tests__/already-drawn-1990.test.ts`. Test-only: nothing here is imported by runtime code.
 */
import { describe, expect, it } from 'vitest';

export type SuiteProduct = '2d' | '3d' | 'complex' | 'analytic';

/** 2-D's sentence, verbatim — the ruling names it. */
export const RULED_ALREADY_DRAWN = {
  key: 'suite.notice.alreadyDrawn',
  he: 'זה כבר קיים באיור — אין מה להוסיף.',
  en: "That's already on the figure — nothing to add.",
} as const;

/** The per-product keys the suite key replaced. None may come back (`suite-vocabulary.test.ts` holds the tables). */
export const RETIRED_ALREADY_THERE_KEYS = {
  '2d': ['input.alreadyDrawn'],
  '3d': ['notice.alreadyStated'],
  complex: ['noteAlreadyKnown'],
  analytic: ['noticeAlreadyKnown', 'noticeAlreadyFollows'],
} as const;

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

export function lockAlreadyDrawn(
  product: SuiteProduct,
  resolve: (lng: 'he' | 'en') => string,
  appSource: string | null,
): void {
  describe(`#1990 — ${product} says 2-D's already-there note`, () => {
    for (const lng of ['he', 'en'] as const) {
      it(`${lng}: its i18n instance reads the ruled sentence`, () => {
        expect(plain(resolve(lng)), `${product} ${lng}`).toBe(RULED_ALREADY_DRAWN[lng]);
      });
    }
    if (appSource !== null) {
      it('its App reads the suite key, and no retired key', () => {
        expect(appSource).toContain(`t('${RULED_ALREADY_DRAWN.key}')`);
        for (const k of RETIRED_ALREADY_THERE_KEYS[product]) expect(appSource, k).not.toContain(`'${k}'`);
      });
    }
  });
}
