/**
 * #1868 ([ADR-W-151](../../../docs/06w-decisions-workspace.md#adr-w-151)) — ONE "not understood" sentence in every
 * builder (operator ruling 2026-10-07 B13 choice 2, wording amended 2026-10-17 on #2329), as the shared half of a
 * four-builder lock.
 *
 * The sentence is one suite key, `suite.refusal.notUnderstood`, so it cannot differ by construction; what CAN break is
 * a builder's refusal path reading something else (its old key, an echo of the line). So each tree renders the refusal
 * through its OWN wording function and i18n instance and hands the result here.
 *
 * Shell may not import a product tree (ADR-W-016 rule 2), so each tree calls this from
 * `<tree>/__tests__/not-understood-1868.test.ts`. Test-only: nothing here is imported by runtime code.
 */
import { describe, expect, it } from 'vitest';

export type SuiteProduct = '2d' | '3d' | 'complex' | 'analytic';

/** The ruled Hebrew, verbatim; the English follows it (ADR-W-150's rule, «…» around the guide's button name). */
export const RULED_NOT_UNDERSTOOD = {
  key: 'suite.refusal.notUnderstood',
  he: 'לא הבנתי את הבקשה — נסו לנסח אחרת, או פתחו את «מדריך» לדוגמאות.',
  en: "I didn't understand the request — try rephrasing it, or open «Guide» for examples.",
} as const;

/** Bidi isolates are a render detail of each product's post-processor, not text. */
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/**
 * `render(lng, line)` words the refusal a builder shows for an unread `line`, through that builder's real path.
 * The line is gibberish the student typed; the ruled sentence does not echo it.
 */
export function lockNotUnderstood(product: SuiteProduct, render: (lng: 'he' | 'en', line: string) => string): void {
  describe(`#1868 — ${product} says the ruled "not understood" sentence`, () => {
    for (const lng of ['he', 'en'] as const) {
      it(`${lng}: the ruled sentence, with no echo of the line`, () => {
        const line = 'AB גרבלדגוק CD';
        const text = plain(render(lng, line));
        expect(text, `${product} ${lng}`).toBe(RULED_NOT_UNDERSTOOD[lng]);
        expect(text).not.toContain('גרבלדגוק');
      });
    }
  });
}
