/**
 * #766 + #765 (ADR-3D-169) — a solid's stated VOLUME: the subject is resolved, the grammar is read.
 *
 * Measured before the fix, prefix «פירמידה ישרה מרובעת ABCDS»:
 *
 *   נפח הפירמידה ABCD = 11    ❌ claim-refuted   (tetraVol(ABCD) = 0 — ABCD is the coplanar BASE)
 *   נפח הפירמידה ABCD = 0     ⚠️ ACCEPTED        (the tool agreed the pyramid has zero volume)
 *   נפח SABCD שווה ל 11        ❌ not-understood  (the «שווה ל-» copula)
 *   נפח הפירמידה ABCDS = 11   ❌ not-understood  (noun + 5-letter run)
 *
 * The student was told «הטענה לא מתקיימת בציור — בדקו את החישוב» — *check your arithmetic* — about a
 * given that is correct, and had no working spelling at all for a square-base pyramid's volume. Two
 * honesty invariants inverted at once: a true given called false, the degenerate reading called true.
 *
 * Root cause: `volumePolyClaim` gated on "exactly 4 uppercase tokens + `=`" and `claims.ts` computed
 * `|triple product| / 6` — a formula correct only for an actual tetrahedron, selected by LETTER COUNT.
 *
 * **Operator ruling (2026-08-26):** one candidate → understood (letters optional); several → ask for
 * more specific letters; none → refuse naming the statement.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { resolveSolidSubject, subjectVolume } from '../engine/solidSubject';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const state = () => useGeo3.getState();
/** Type a line the way the app does, and report what the store made of it. */
const submit = (u: string) => {
  const before = state().facts.length;
  state().submit(u);
  return { committed: state().facts.length > before, error: state().lastError };
};

beforeEach(reset);

describe('#765 — every spelling of a solid’s volume is READ', () => {
  const SPELLINGS = [
    'נפח הפירמידה ABCD = 11',
    'נפח הפירמידה ABCDS = 11',
    'נפח SABCD שווה ל 11',
    'נפח SABCD = 11',
    'נפח הפירמידה = 11',
  ];

  it.each(SPELLINGS)('«%s» parses to the same volume claim', (utterance) => {
    const r = parse3(utterance);
    expect(r.ok, `«${utterance}» must parse — it was not-understood before #765`).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toHaveLength(1);
    const cmd = r.commands[0];
    expect(cmd.type).toBe('claim');
    if (cmd.type !== 'claim') return;
    expect(cmd.claim.type).toBe('volume-poly');
    if (cmd.claim.type !== 'volume-poly') return;
    expect(cmd.claim.value).toBe(11);
  });

  it('the pre-existing 4-letter tetra form is byte-identical (a bare run, no noun)', () => {
    const r = parse3('נפח ABCD = 64');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands[0]).toEqual({ type: 'claim', claim: { type: 'volume-poly', noun: 'any', ids: ['A', 'B', 'C', 'D'], value: 64 } });
  });

  it('a volume on a solid of REVOLUTION still belongs to its own rule — the widened head steals nothing', () => {
    const r = parse3('נפח החרוט = 100');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.commands[0];
    expect(cmd.type).toBe('claim');
    if (cmd.type !== 'claim') return;
    expect(cmd.claim.type).toBe('volume-eq');
  });

  it('«נפח = 11» names nothing and is not a claim', () => {
    expect(parse3('נפח = 11').ok).toBe(false);
  });
});

describe('#766 — the definite noun resolves against the DECLARED figure', () => {
  const PYRAMID = 'פירמידה ישרה מרובעת ABCDS';

  it('the operator’s case: the BASE run resolves to the pyramid, not to a coplanar "tetrahedron"', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    submit('נפח הפירמידה ABCD = 11');
    // Before the fix this refused because tetraVol(ABCD) = 0 — the base is coplanar BY CONSTRUCTION,
    // so NO value could ever have been accepted and «= 0» was accepted instead. The subject now
    // resolves to the declared pyramid, whose volume is a real, non-zero number.
    const c = derive3(state().facts, state().seed).construction;
    const solid = resolveSolidSubject(c, 'pyramid', ['A', 'B', 'C', 'D']);
    expect(solid.kind).toBe('solid');
    if (solid.kind !== 'solid') return;
    expect(solid.solid.ids).toEqual(['A', 'B', 'C', 'D', 'S']);
    const vol = subjectVolume(solid, derive3(state().facts, state().seed).positions);
    expect(vol).not.toBeNull();
    expect(Math.abs(vol!)).toBeGreaterThan(1e-6); // the defect, stated: this used to be exactly 0
  });

  it('the degenerate hole is CLOSED — «נפח הפירמידה ABCD = 0» no longer reads as true', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    const r = submit('נפח הפירמידה ABCD = 0');
    expect(r.committed, 'the tool must not agree that the pyramid has zero volume').toBe(false);
  });

  it('letters naming NO declared solid refuse, naming the student’s statement', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    const r = submit('נפח הפירמידה WXYZ = 11');
    expect(r.committed).toBe(false);
    expect(r.error).toEqual({ code: 'no-such-solid', id: 'WXYZ' });
  });

  it('TWO pyramids and no letters ⇒ ASK which, never guess (ADR-052)', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    expect(submit('פירמידה ישרה מרובעת EFGHT').committed).toBe(true);
    const r = submit('נפח הפירמידה = 11');
    expect(r.committed).toBe(false);
    expect(r.error).toEqual({ code: 'ambiguous-solid', id: '', count: 2 });
  });

  it('ONE pyramid and no letters ⇒ the figure supplies the subject (the operator’s ruling)', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    const c = derive3(state().facts, state().seed).construction;
    const sub = resolveSolidSubject(c, 'pyramid', []);
    expect(sub.kind).toBe('solid');
    // …and it is NOT resolved by guessing: the same sentence with two pyramids asks (test above).
  });

  it('a run that matches no solid but names four points is STILL a tetrahedron (byte-identical)', () => {
    expect(submit('טטרהדר ABCD').committed).toBe(true);
    const c = derive3(state().facts, state().seed).construction;
    // The declared tetra matches by its full run; a bare four-point run with no solid at all also reads.
    expect(resolveSolidSubject(c, 'any', ['A', 'B', 'C', 'D']).kind).toBe('solid');
  });

  it('a noun the figure has none of refuses — «נפח הקובייה» on a pyramid-only figure', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    const r = submit('נפח הקובייה = 11');
    expect(r.committed).toBe(false);
    expect(r.error?.code).toBe('no-such-solid');
  });

  it('the QUERY lane reads the same sentence the same way (one resolver, two consumers)', () => {
    expect(submit(PYRAMID).committed).toBe(true);
    const d = derive3(state().facts, state().seed);
    // The base run and the full run must value identically — they name one solid.
    const base = subjectVolume(resolveSolidSubject(d.construction, 'any', ['A', 'B', 'C', 'D']), d.positions);
    const full = subjectVolume(resolveSolidSubject(d.construction, 'any', ['A', 'B', 'C', 'D', 'S']), d.positions);
    expect(base).not.toBeNull();
    expect(base).toBeCloseTo(full!, 9);
  });
});
