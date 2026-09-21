/**
 * #1152 / #1315 — the input-preview parity suite, asserting BEHAVIOUR rather than source text.
 *
 * ## What replaced what, and why
 *
 * The original guard read each `App*.tsx` as a string and required the literal `hasMath(s)` within 400
 * characters of `preview={`. That asserted where the decision LIVED, not that the product made it — so
 * when a parallel session correctly extracted 3-D's preview into `inputPreviewNode3`, the guard went red
 * on a refactor that improved the code, and `main` stayed red until someone read the verdict file instead
 * of the exit code (ADR-W-071).
 *
 * This suite CALLS each product's preview instead. That is strictly stronger: a builder that keeps the
 * inline `hasMath(s)` text but hands `MathText` the RAW string passes the old scan and fails this.
 *
 * ## Why the rows are here and the assertions are in four files
 *
 * `shell/` may never import a product tree ([ADR-W-016](../../../docs/06w-decisions-workspace.md) rule 2),
 * so one shared test cannot call four previews. The rows therefore live once and each tree runs them
 * against its own function — products importing `shell/` is the allowed direction. Same shape as
 * `issue-1296-rows.ts`, which hit the identical wall.
 *
 * Test-only data: nothing here is imported by runtime code.
 */
import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { hasMath } from '../../math';

/**
 * Lines that CONTAIN mathematics and must therefore be typeset.
 *
 * `hasMath` is called rather than restated — the decision *"does this contain mathematics?"* belongs to
 * `shell/math`, and a lock that re-implemented it would stay green through the change that breaks the
 * products (ADR-W-053). The rows are asserted to satisfy it first, so a change to `hasMath` that made
 * these plain fails HERE with a clear message instead of failing every product mysteriously.
 */
export const MATH_ROWS = [
  '(x-3)^2+(y-4)^2=9', // the operator's own #1152 line, pure LTR — the case with no strip before #1152
  'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', // the same, in its Hebrew sentence
  'x^2/9+y^2/4=1',
  'הישר y=2x-4 ומעגל שרדיוסו r^2',
];

/** Lines with no mathematics at all — the preview must NOT typeset these. */
export const PLAIN_ROWS = ['משולש ABC', 'A(0,0)', 'point P'];

/** The invisible isolate controls, by code point — never written literally (the `shell/bidi.ts` rule). */
const LRI = '\u2066';
const PDI = '\u2069';

/**
 * Pull all text out of a rendered node tree, however it is nested.
 *
 * Exported so a product's own preview locks CALL it instead of writing a second copy — `src-analytic`'s
 * #1215 and #1088 locks both needed exactly this after #1315 (ADR-W-053).
 */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) {
    const props = node.props as { text?: unknown; children?: ReactNode };
    if (typeof props.text === 'string') return props.text;
    return textOf(props.children);
  }
  return '';
}

/** Is this node a `MathText`, i.e. did the preview decide to TYPESET? Exported for the same reason. */
export function isTypeset(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(isTypeset);
  if (!isValidElement(node)) return false;
  const type = node.type as { name?: string; displayName?: string } | string;
  if (typeof type !== 'string' && (type.name === 'MathText' || type.displayName === 'MathText')) return true;
  return isTypeset((node.props as { children?: ReactNode }).children);
}

export interface PreviewExpectations {
  /** The product's name, for test titles. */
  product: string;
  /**
   * Must the text handed to `MathText` be ISOLATED first?
   *
   * TRUE for every RTL-Hebrew builder: typesetting unisolated text reorders the equation, which is the
   * defect the strip exists to prevent and the mistake a verbatim port of 2-D's line makes.
   *
   * FALSE for 2-D alone — it is the tree the mechanism came from and it typesets the raw string. #1152's
   * lock excluded it by name and this preserves that exclusion rather than changing behaviour inside a
   * refactor. Whether 2-D SHOULD isolate first is a real and separate question (#1316).
   */
  isolatesFirst: boolean;
}

/**
 * THE CHECKS, as a pure function returning human-readable faults — empty means the preview is correct.
 *
 * Extracted from the `it(...)` bodies so that BOTH the per-tree locks and the meta-lock
 * (`issue-1152-suite-bites.test.tsx`, which proves this suite can actually go red) run the same code.
 * A meta-lock that re-implemented the checks would prove only that its own copy bites — the same
 * reproduction trap (ADR-W-053) that this whole issue is about.
 */
export function previewFaults(preview: (s: string) => ReactNode, opts: PreviewExpectations): string[] {
  const { product, isolatesFirst } = opts;
  const faults: string[] = [];

  for (const row of MATH_ROWS) {
    if (!isTypeset(preview(row))) faults.push(`${product}: «${row}» must render through MathText`);
  }
  for (const row of PLAIN_ROWS) {
    if (isTypeset(preview(row))) faults.push(`${product}: «${row}» has no mathematics to typeset`);
  }
  if (isolatesFirst) {
    for (const row of MATH_ROWS.filter((r) => /[א-ת]/.test(r))) {
      const handed = textOf(preview(row));
      if (handed === row) faults.push(`${product}: MathText received the raw string for «${row}»`);
      else if (!(handed.includes(LRI) && handed.includes(PDI))) {
        faults.push(`${product}: the text handed to MathText carries no isolate controls for «${row}»`);
      }
    }
  }
  return faults;
}

/** Run the parity suite against one product's preview. */
export function previewTypesetSuite(preview: (s: string) => ReactNode, opts: PreviewExpectations): void {
  const { product, isolatesFirst } = opts;

  describe(`#1152 — ${product} typesets mathematics in the input preview`, () => {
    /** The precondition, so a `hasMath` change cannot make this file pass by testing nothing. */
    it('the fixture rows really do contain mathematics', () => {
      for (const row of MATH_ROWS) expect(hasMath(row), row).toBe(true);
      for (const row of PLAIN_ROWS) expect(hasMath(row), row).toBe(false);
    });

    it.each(MATH_ROWS)('typesets: %s', (row) => {
      expect(isTypeset(preview(row)), `${product}: «${row}» must render through MathText`).toBe(true);
    });

    it.each(PLAIN_ROWS)('does not typeset plain text: %s', (row) => {
      expect(isTypeset(preview(row)), `${product}: «${row}» has no mathematics to typeset`).toBe(false);
    });

    if (isolatesFirst) {
      /**
       * THE RTL TRAP, and the half the source scan could only approximate. It is not enough that the
       * preview calls an isolating function somewhere — the text MathText actually receives must carry
       * the isolate controls.
       */
      it.each(MATH_ROWS.filter((r) => /[א-ת]/.test(r)))(
        'isolates BEFORE typesetting — MathText never receives the raw string: %s',
        (row) => {
          const handed = textOf(preview(row));
          expect(handed, `${product}: MathText received the raw string`).not.toBe(row);
          expect(
            handed.includes(LRI) && handed.includes(PDI),
            `${product}: the text handed to MathText carries no isolate controls`,
          ).toBe(true);
        },
      );
    }

    /** The whole check set agrees with the per-row rows above — the two can never disagree. */
    it('reports no faults overall', () => {
      expect(previewFaults(preview, opts)).toEqual([]);
    });
  });
}
