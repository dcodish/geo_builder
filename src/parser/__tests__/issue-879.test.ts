/**
 * #879 — the residue of #519's audit: naming a circle's centre, and a shape kind that is not there.
 *
 * Both found by the audit, filed rather than folded in, and both measured again before fixing — the
 * first turned out to be worse than filed.
 *
 * **Naming.** «מרכז המעגל הוא M» beside two circles CREATED A THIRD, and beside one created a second.
 * The student wrote a definite reference — *the* circle — and got a new object: the silent-invention
 * class arriving through the naming door. The contract was already written on `ctx.autoCenters`
 * (*"«מרכז המעגל הוא P» renames one of these to P and reveals it, instead of creating a second
 * circle"*, #112) and so was the mechanism — `impliedCircleBinding` (#186/#538) turns an `implied`
 * circle into a RENAME, and asks when it cannot tell which. `nameCenter` simply never reached it.
 *
 * **The missing shape.** «קטע אמצעים בטרפז» with no trapezoid drawn escalated to the LLM, which would
 * invent one. `shape-not-found` is the answer the codebase already gives on the sibling phrasing.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, ctxOf } from '../../__tests__/scenario-pipeline';
import { parse, impliedCircleBinding } from '..';
import { replay } from '../../store/geoStore';

const after = (prefix: string[], line: string) => parse(line, ctxOf(factsOf(prefix)));
/** Circles actually in the figure once the whole sequence has been committed. */
const circlesOf = (seq: string[]) =>
  replay(factsOf(seq), 0)
    .construction.objects.filter((o) => o.kind === 'circle')
    .map((o) => o.id);

describe('#879 — naming a centre RENAMES, it never invents a circle', () => {
  it('one circle + a fresh letter: renamed, and still ONE circle', () => {
    expect(circlesOf(['מעגל', 'מרכז המעגל הוא M'])).toEqual(['circle-M']);
  });

  it('two circles + a fresh letter: renamed, and still TWO circles (was: three)', () => {
    const ids = circlesOf(['מעגל', 'מעגל', 'מרכז המעגל הוא M']);
    expect(ids).toHaveLength(2);
    expect(ids, 'the student’s letter names one of the drawn circles').toContain('circle-M');
  });

  it('the rename goes through the existing binding chokepoint, not a second naming rule', () => {
    const pre = factsOf(['מעגל']);
    const r = parse('מרכז המעגל הוא M', ctxOf(pre));
    expect(r.ok).toBe(true);
    if (r.ok) expect(impliedCircleBinding(r.commands, ctxOf(pre))).toEqual({ from: 'O', to: 'M' });
  });

  it('a letter that already names a circle still just REVEALS its centre', () => {
    const r = after(['מעגל'], 'מרכז המעגל הוא O');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands).toEqual([{ type: 'name-center', center: 'O' }]);
  });

  it('with NO circle at all, the phrasing still creates one — unchanged', () => {
    expect(circlesOf(['משולש ABC', 'מרכז המעגל הוא M'])).toEqual(['circle-M']);
  });
});

describe('#879 — a shape kind the figure does not have is NOT an ambiguity', () => {
  it('«קטע אמצעים בטרפז» with no trapezoid says shape-not-found, never the LLM', () => {
    const r = after(['משולש ABC'], 'קטע אמצעים בטרפז');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('shape-not-found');
      // the noun is quoted back WITHOUT its Hebrew prefix — «טרפז», not «בטרפז»
      if (r.reason === 'shape-not-found') expect(r.noun).toBe('טרפז');
    }
  });

  it('…and with the trapezoid present it builds', () => {
    expect(after(['טרפז ABCD'], 'קטע אמצעים בטרפז').ok).toBe(true);
  });

  it('the prefixed noun is recognised at all — the lookbehind used to reject «בטרפז»', () => {
    // the whole cause: `(?<![א-ת])` rejected the ב, so the kind was never detected
    expect(after(['משולש ABC'], 'אלכסוני הטרפז נחתכים בנקודה M').ok).toBe(false);
    expect(after(['מקבילית ABCD'], 'קטע אמצעים בטרפז').ok).toBe(false); // a parallelogram is not a trapezoid
  });

  it('an AMBIGUOUS shape still asks — the two answers stay distinct', () => {
    const r = after(['טרפז ABCD', 'טרפז EFGH'], 'האלכסונים נחתכים בנקודה M');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous-shape');
  });

  it('the label-run guard works — it shipped with its backslashes eaten and matched nothing', () => {
    // «אלכסוני ABCD נחתכים בנקודה M» names its shape, so the ask must stand down
    expect(after(['טרפז ABCD', 'טרפז EFGH'], 'אלכסוני ABCD נחתכים בנקודה M').ok).toBe(true);
  });
});
