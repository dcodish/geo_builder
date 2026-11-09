/**
 * #2764 ([ADR-3D-454](../../../docs/06b-decisions-3d.md#adr-3d-454), [ADR-AG-425](../../../docs/06c-decisions-analytic.md#adr-ag-425))
 * — NINE SEPARATE SHAPES, ONE PER LINE: the shared half of a cross-builder lock.
 *
 * A figure whose shapes share nothing is solved, searched and drawn part by part in every builder that has the
 * mechanism (analytic #2737, 3-D #2764; 2-D joins with #2796). The class is the same everywhere, so the assertions are
 * written once, here: every line records, no point drawn before a line moves when it is added, and each line's work is
 * bounded by an OPERATION count the builder names (docs/17 §7 — never a clock).
 *
 * Shell may not import a product tree (ADR-W-016 rule 2), so each tree hands its own driver to
 * {@link independentPartsSuite} from `<tree>/__tests__/issue-*-independent-parts.test.ts`. Test-only.
 */
import { describe, expect, it } from 'vitest';

/** The nine lines, exactly as the operator's performance review typed them (#2755). */
export const NINE_SEPARATE_SHAPES = ['מרובע', 'טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית', 'מקבילית', 'מלבן', 'מעוין', 'ריבוע', 'דלתון'] as const;

/** One typed line, as the builder's own submit path answered it. */
export interface TypedLine {
  recorded: boolean;
  /** The builder's operation count for this line (its own counter: evaluations, least-squares residual calls…). */
  work: number;
  /** Every point drawn after the line, id → coordinates. */
  points: ReadonlyMap<string, readonly number[]>;
}

export interface PartsDriver {
  /** Start from an empty figure at configuration 0. */
  reset(): void;
  type(line: string): TypedLine;
  /** The most work any one line may cost, per line (the builder's measured after-numbers, with headroom). */
  budget: readonly number[];
  /** How far a point may move and still count as not moved. */
  tol?: number;
}

export function independentPartsSuite(product: string, driver: PartsDriver, lines: readonly string[] = NINE_SEPARATE_SHAPES): void {
  describe(`#2764 — ${product}: ${lines.length} separate shapes, typed one per line`, () => {
    const typed: TypedLine[] = [];
    driver.reset();
    for (const line of lines) typed.push(driver.type(line));

    it('every line records', () => {
      expect(typed.map((t, i) => (t.recorded ? '' : lines[i])).filter(Boolean)).toEqual([]);
    });

    it('adding a shape never moves a point drawn before it', () => {
      const tol = driver.tol ?? 1e-9;
      for (let i = 1; i < typed.length; i++) {
        for (const [id, p] of typed[i - 1].points) {
          const q = typed[i].points.get(id);
          expect(q, `${id} after «${lines[i]}»`).toBeDefined();
          const d = Math.hypot(...p.map((v, k) => v - (q![k] ?? 0)));
          expect(d, `${id} moved after «${lines[i]}»`).toBeLessThanOrEqual(tol);
        }
      }
    });

    it('each line costs a bounded amount of work', () => {
      typed.forEach((t, i) => expect(t.work, `«${lines[i]}»`).toBeLessThanOrEqual(driver.budget[i] ?? Infinity));
    });
  });
}
