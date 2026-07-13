/**
 * Issue #111 — a DEFINITE plural circle reference «(שני) המעגלים» / «the (two) circles» binds the two
 * circles ALREADY in the figure, instead of inventing a third.
 *
 * Operator report (2026-07-13): with circle O and circle P drawn, «A נקודות חיתוך בין המעגלים» created a
 * NEW circle-Q and intersected O with Q, ignoring P. Root cause: `twoCirclesMeet` resolved its circles
 * only from NAMED «מעגל X» tokens; a definite plural naming none fell to the "draw two intersecting
 * circles" opener and minted fresh circles. Fix (`definiteTwoCircles`, the ADR-029 implicit-reference
 * pattern, plural edition): when the figure holds exactly TWO circles and the utterance refers to them by
 * a definite plural with no letters, bind THOSE circles and emit only the named crossing point(s).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const circleIds = (facts: Fact[]) => replay(facts).construction.objects.filter((o) => o.kind === 'circle').map((o) => o.id).sort();
const TWO = ['מעגל O', 'מעגל P'];

describe('issue #111 — definite plural circle reference', () => {
  it.each([
    ['He «בין המעגלים»', [...TWO, 'A נקודות חיתוך בין המעגלים']],
    ['He «של המעגלים»', [...TWO, 'A היא נקודת החיתוך של המעגלים']],
    ['En "the intersection of the circles"', ['circle O', 'circle P', 'A is the intersection of the circles']],
  ])('%s binds the two EXISTING circles — no third circle invented', (_t, lines) => {
    const facts = runLines(lines);
    expect(circleIds(facts), 'exactly the two circles that were drawn').toEqual(['circle-O', 'circle-P']);
    const cci = facts.find((f) => f.cmd.type === 'circle-circle-intersection')!.cmd as Extract<AnyCommand, { type: 'circle-circle-intersection' }>;
    expect(cci.id).toBe('A');
    expect([cci.circle1, cci.circle2].sort()).toEqual(['circle-O', 'circle-P']);
  });

  it('two named crossings «A ו B … של המעגלים» → both intersection points on the same two circles', () => {
    const facts = runLines([...TWO, 'A ו B נקודות החיתוך של המעגלים']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
    const ccis = facts.filter((f) => f.cmd.type === 'circle-circle-intersection').map((f) => f.cmd) as Extract<AnyCommand, { type: 'circle-circle-intersection' }>[];
    expect(ccis.map((c) => c.id).sort()).toEqual(['A', 'B']);
    expect(ccis[1].avoid).toBe('A'); // the OTHER crossing
  });

  it('no-theft: the OPENER «שני מעגלים נחתכים» (no circles yet) still CREATES both', () => {
    const facts = runLines(['שני מעגלים נחתכים']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
    expect(facts.filter((f) => f.cmd.type === 'circle-circle-intersection')).toHaveLength(2);
  });

  it('no-theft: a NAMED two-circle intersection is unchanged (circleCircleIntersection owns it)', () => {
    const facts = runLines([...TWO, 'A היא נקודת החיתוך של מעגל O ומעגל P']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
    const cci = facts.find((f) => f.cmd.type === 'circle-circle-intersection')!.cmd as Extract<AnyCommand, { type: 'circle-circle-intersection' }>;
    expect([cci.circle1, cci.circle2].sort()).toEqual(['circle-O', 'circle-P']);
  });

  it('binds the existing pair ONLY at exactly two circles; with THREE it does not pick two arbitrary ones', () => {
    // One circle → the `definiteTwoCircles` resolver bows out; the long-standing opener may still complete
    // the pair (that is not this rule's job to prevent). The load-bearing guard is that at ≠2 circles the
    // resolver never binds an ARBITRARY existing pair — checked at three circles.
    const three = runLines(['מעגל O', 'מעגל P', 'מעגל Q']);
    const before = circleIds(three);
    const r3 = parse('A נקודת החיתוך של המעגלים', ctxOf(three));
    // it must not bind two of the three existing circles as "the circles" (ambiguous). Either it defers,
    // or (opener) it introduces its OWN circles — never silently pairs two of the three.
    if (r3.ok) {
      const ccis = r3.commands.filter((c) => c.type === 'circle-circle-intersection') as Extract<AnyCommand, { type: 'circle-circle-intersection' }>[];
      for (const cci of ccis) {
        const boundBoth = before.includes(cci.circle1) && before.includes(cci.circle2);
        expect(boundBoth, 'must not silently pair two of the three existing circles').toBe(false);
      }
    }
  });
});
