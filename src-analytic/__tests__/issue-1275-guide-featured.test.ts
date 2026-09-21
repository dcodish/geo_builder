/**
 * #1275 ([ADR-W-074](../../docs/06w-decisions-workspace.md#adr-w-074)) — T25 IS CHECKABLE: the cevian
 * rows are what «נקודות נגזרות» DISPLAYS.
 *
 * The selection rule itself is locked in , which cannot
 * import a product tree (ADR-W-016 rule 2 — the frame must serve builder N+1 without knowing any
 * builder). This half asks the product's own question: does a student opening the guide MEET the rows
 * #1165 added for them? Both of #1165's own locks — the row exists in the array, the row parses — were
 * green while it was invisible.
 */
import { describe, expect, it } from 'vitest';
import { manualShown } from '../../shell/frame/ManualScreen';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

describe('#1275 — T25 is checkable: the cevian rows are what «נקודות נגזרות» displays', () => {
  const derived = COMMAND_CATALOG_ANALYTIC.filter((c) => c.category === 'derived');

  /** The rows a student actually meets, through the real selection with the products' own cap. */
  const shown = manualShown(
    derived.map((c) => ({ example: c.he, featured: c.featured })),
    6,
  ).map((x) => x.example);

  it('the section really is capped — otherwise this case proves nothing', () => {
    expect(derived.length).toBeGreaterThan(6);
  });

  it('«תיכון» and «גובה» are DISPLAYED, not merely present in the array', () => {
    expect(shown).toContain('AD תיכון במשולש ABC');
    expect(shown).toContain('AD גובה לצלע BC');
  });

  /**
   * #1165's own lock asserts these rows EXIST in the catalog, and the parse lock proves they BUILD.
   * Both were green while the feature was invisible — which is the whole finding. This asserts the
   * third thing nobody was asserting.
   */
  it('the #1165 rows are still in the catalog and still carry their flag', () => {
    const cevians = derived.filter((c) => /תיכון|גובה/.test(c.he));
    expect(cevians.length).toBeGreaterThanOrEqual(2);
    expect(cevians.every((c) => c.featured)).toBe(true);
  });
});
