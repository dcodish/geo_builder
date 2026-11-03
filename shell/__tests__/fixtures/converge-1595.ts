/**
 * #1595 ([ADR-W-176](../../../docs/06w-decisions-workspace.md#adr-w-176)) — ONE «two letters on one dot» notice in every
 * builder, the shared half of a four-builder lock (the #1990 shape, `already-drawn-1990.ts`).
 *
 * Operator, 2026-09-30: *"when 2 dots are on top of each other we should accept but always give a message about it.
 * this is correct for all tools"*. 2-D's ADR-123 sentence is the reference (ADR-W-118 B1), now the suite key
 * `suite.notice.converge`. So its TEXT cannot differ by construction; what can break is a builder's App reading
 * something else. Each tree hands this fixture its i18n instance's reading of the key and its App's source.
 *
 * Shell may not import a product tree (ADR-W-016 rule 2), so each tree calls this from its own
 * `converge-1595.test.ts`. Test-only: nothing here is imported by runtime code.
 */
import { describe, expect, it } from 'vitest';
import { CONVERGE_KEY } from '../../converge';

export type SuiteProduct = '2d' | '3d' | 'complex' | 'analytic';

/** 2-D's sentence (ADR-123), verbatim. */
export const RULED_CONVERGE = {
  key: CONVERGE_KEY,
  he: 'A ו-B נפלו על אותה נקודה.',
  en: 'A and B have landed at the same point.',
} as const;

/** The per-product key the suite key replaced. It may not come back. */
export const RETIRED_CONVERGE_KEYS = { '2d': ['figure.converge'], '3d': [], complex: [], analytic: [] } as const;

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

export function lockConverge(product: SuiteProduct, resolve: (lng: 'he' | 'en') => string, appSource: string): void {
  describe(`#1595 — ${product} says 2-D's «same point» notice`, () => {
    for (const lng of ['he', 'en'] as const) {
      it(`${lng}: its i18n instance reads the ruled sentence for A and B`, () => {
        expect(plain(resolve(lng)), `${product} ${lng}`).toBe(RULED_CONVERGE[lng]);
      });
    }
    it('its App renders the pairs through the shared `convergeText`, and no retired key', () => {
      expect(appSource).toMatch(/convergeText\(/);
      expect(appSource).toContain("from '../shell/converge'");
      for (const k of RETIRED_CONVERGE_KEYS[product]) expect(appSource, k).not.toContain(`'${k}'`);
    });
  });
}
