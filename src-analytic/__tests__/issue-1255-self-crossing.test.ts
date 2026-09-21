/**
 * #1255 ([ADR-AG-140](../../docs/06c-decisions-analytic.md#adr-ag-140)) — A CROSSING OF A LINE WITH
 * ITSELF NAMES NO POINT, AND THE SENTENCE IS REFUSED BY AN OWNED ANSWER.
 *
 * Operator ruling, 2026-09-20: *"refuse it"* — «הישר AB» and «הישר BA» are the same line, and a line has
 * no crossing with itself. Measured before: «P נקודת החיתוך של הישר AB עם הישר BA» BUILT an
 * under-determined P floating along AB with `faults: []` — one incidence instead of two, and silence.
 *
 * The arm is ADR-AG-116's structural gate one step over (both letters shared instead of one). It is an
 * OWNED code, never `not-handled`: the grammar read the sentence, and the LLM seam would ask a model to
 * accept the spelling the ruling declined (ADR-AG-130's argument for the ring half, unchanged).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

const TRI = ['משולש ABC', 'A(2,-5)'];

describe('#1255 — a line has no crossing with itself', () => {
  it.each([
    'P נקודת החיתוך של הישר AB עם הישר BA',
    'P נקודת החיתוך של הישר AB עם הישר AB',
    'P is the intersection of line AB with line BA',
  ])('«%s» is refused as self-crossing, about the student’s own sentence, and never escalates', (line) => {
    const r = parseLine(line) as { ok: boolean; code?: string; detail?: string };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('self-crossing');
    expect(r.detail).toBe(line);
    const v = decideSubmit(line, TRI, 0);
    expect(v.kind).toBe('refused');
    expect((v as { error?: { key?: string } }).error?.key, 'owned — never the seam’s one code, not-handled').toBe('self-crossing');
    // nothing is built — the measured defect was a floating P with no fault
    const d = derive([...TRI, line], 0);
    expect(d.figure.points.map((p) => p.id)).not.toContain('P');
  });

  it('ADR-AG-116’s one-letter arm is untouched — «AB עם BC» is still refused naming B', () => {
    const v = decideSubmit('P נקודת החיתוך של הישר AB עם הישר BC', TRI, 0) as { kind: string; error?: { key?: string; holder?: string } };
    expect(v.kind).toBe('refused');
    expect(v.error?.key).toBe('crossing-already-named');
    expect(v.error?.holder).toBe('B');
  });

  it('a genuine crossing of two different lines still builds and still names P', () => {
    const steps = ['משולש ABC', 'AD תיכון לצלע BC', 'CE תיכון לצלע AB', 'P נקודת החיתוך של הישר AD עם הישר CE'];
    const d = derive(steps, 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.map((p) => p.id)).toContain('P');
  });

  it('the remedy the message teaches is a sentence the tool accepts — «P על הישר AB»', () => {
    const v = decideSubmit('P על הישר AB', TRI, 0);
    expect(v.kind).toBe('record');
  });
});
