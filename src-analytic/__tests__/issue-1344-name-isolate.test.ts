/**
 * #1344 ([ADR-AG-149](../../docs/06c-decisions-analytic.md#adr-ag-149)) — A HEBREW DISPLAY NAME IS AN
 * ISLAND IN AN LTR ROW.
 *
 * Operator, 2026-09-21, playing PR #1341 T19: *"note that the bidi input for line 3 is bad both in
 * input and data panels"*. The row's DOM text was `ישר 3: 3x + 2y - 2 = 0` with no isolate, in a
 * section laid out `ltr`, and rendered **«3 :3 ישרx + 2y - 2 = 0»** — under the bidi algorithm a
 * European number adjacent to a right-to-left run takes that run's direction, so «ישר 3:» becomes one
 * RTL run and drags the colon and the equation's leading digit in with it.
 *
 * A Latin name (`l3`, `I`) never had the problem, which is why #1216 shipped digit-named circles with
 * the same defect and nobody saw it — the operator's circles were «I» and «II».
 */
import { describe, expect, it } from 'vitest';
import { namedRow, describeCurve } from '../app/curveText';
import { isolateRtlName, stripFormatControls } from '../../shell/bidi';
import { derive } from '../engine/derive';
import { curveParts } from '../app/curveText';
import { knownCurve } from '../engine/evaluate';

const FSI = '⁨';
const PDI = '⁩';

/** The equations-row text for the single curve a line declares — the panel's own composition. */
const panelRow = (line: string): string => {
  const d = derive([line], 0);
  const c = d.construction.objects.find((o) => o.kind === 'curve') as { id: string; label: { name: string } };
  const known = knownCurve(d.construction, c.id);
  const parts = known ? curveParts(known, undefined, { vertical: 'אנכי' }) : null;
  return namedRow(c.label.name, parts ? parts.equation : '');
};

describe('#1344 — the name is isolated when, and only when, it needs to be', () => {
  it('the reported row: «ישר 3» carries the isolate', () => {
    const row = panelRow('נתון הישר 3: 3x + 2y - 2 = 0');

    expect(row.startsWith(FSI)).toBe(true);
    expect(row).toContain(`${FSI}ישר 3${PDI}: `);
    // and nothing was lost — the equation is still the equation
    expect(stripFormatControls(row)).toBe('ישר 3: 3x + 2y - 2 = 0');
  });

  it('«מעגל 1» too — the #1216 row that has been reversed since it shipped', () => {
    expect(panelRow('נתון המעגל 1: x^2+y^2=9')).toContain(`${FSI}מעגל 1${PDI}: `);
  });

  /**
   * «מעגל I» rendered correctly before this and must keep doing so: the isolate is applied to any
   * HEBREW name, digit or not, because the rule is about the name's script and not about the digit —
   * the digit is only what made it visible.
   */
  it('a Hebrew name with a Roman numeral is isolated on the same rule', () => {
    expect(panelRow('נתון המעגל I: x^2+y^2=16')).toContain(`${FSI}מעגל I${PDI}: `);
  });

  it('a LATIN name carries no invisible characters at all', () => {
    const row = panelRow('נתון הישר l3: 3x + 2y - 2 = 0');

    expect(row).toBe('l3: 3x + 2y - 2 = 0');
    expect(stripFormatControls(row)).toBe(row);
  });

  it('an unnamed curve gets no separator and no isolate', () => {
    expect(namedRow('', '2x - y + 8 = 0')).toBe('2x - y + 8 = 0');
  });
});

describe('#1344 — one composer, so two surfaces cannot disagree', () => {
  it('the ask lane composes through the same function', () => {
    const line = describeCurve('ישר 3', { kind: 'line', a: 3, b: 2, c: -2 } as never);
    expect(line).toContain(`${FSI}ישר 3${PDI}: `);
    expect(describeCurve('l3', { kind: 'line', a: 3, b: 2, c: -2 } as never).startsWith('l3: ')).toBe(true);
  });

  /**
   * The isolate is DISPLAY only. `stripFormatControls` runs at the parser and store boundaries, so an
   * isolated row can never reach the grammar, the saved fact list or the .docx run renderer — which
   * draws U+2066–2069 as missing-glyph boxes (ADR-431 Am. 1, the #751 defect).
   */
  it('the control is in the set the parser and store boundaries strip', () => {
    expect(stripFormatControls(isolateRtlName('ישר 3'))).toBe('ישר 3');
    expect(isolateRtlName('l3')).toBe('l3');
  });
});
