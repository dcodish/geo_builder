/**
 * ADR-264 — the clause fallback + the relation honesty gate.
 *
 * Class: a compound utterance mixing a CONSTRUCTION with its property givens — the textbook appositive
 * form "דלתון ABCD, AB=AD" / "משולש ABC הוא שווה שוקיים, כלומר AC=BC" — was never parsed deterministically:
 * `multiStatement` requires every piece to carry a relation operator, the shape rule 'stop's on the
 * leftover clause, and the whole line escalated to the LLM — whose decomposition could silently DROP the
 * stated pair (its labels all already appear on the shape, so the new-label/number honesty gates never
 * fire). Fix: `splitStatements` (a LAST-RESORT fallback after every whole-utterance rule failed) splits on
 * the statement separators + apposition connectives and parses each piece all-or-nothing with a
 * clause-augmented context; `droppedGivenRelations` closes the gate hole for whatever still escalates.
 */

import { describe, it, expect } from 'vitest';
import { parse, droppedGivenRelations } from '@/parser';
import type { ParseContext } from '@/parser';
import type { AnyCommand } from '@/engine';

const cmds = (s: string, ctx?: ParseContext): AnyCommand[] => {
  const r = parse(s, ctx);
  if (!r.ok) throw new Error(`did not parse: ${s} (${r.reason})`);
  return r.commands;
};
const types = (s: string) => cmds(s).map((c) => c.type);

describe('clause fallback — shape declaration + stated equal pair in ONE utterance (ADR-264)', () => {
  it('the operator kite form: "דלתון ABCD, AB=AD" → kite + explicit set-equal (the pin)', () => {
    const c = cmds('דלתון ABCD, AB=AD');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'] });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' });
  });

  it('the operator isosceles form: "משולש ABC הוא שווה שוקיים, כלומר AC=BC" → isosceles + the STATED pair', () => {
    const c = cmds('משולש ABC הוא שווה שוקיים, כלומר AC=BC');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'] });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'C', c: 'B', d: 'C' });
  });

  it('English mirrors: "kite ABCD, AB=AD" / "triangle ABC is isosceles, that is AC=BC"', () => {
    expect(cmds('kite ABCD, AB=AD')).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' });
    const c = cmds('triangle ABC is isosceles, that is AC=BC');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles' });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'C', c: 'B', d: 'C' });
  });

  it('connective variants from the prod log: "שבו … ו …" and a spaced dash', () => {
    // session 6byqw3eg (2026-06-24) — used to escalate to the LLM
    const c1 = cmds('דלתון ABCD שבו AB=AD ו CB=CD');
    expect(c1[0]).toMatchObject({ type: 'shape-variant', shape: 'kite' });
    expect(c1).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' });
    expect(c1).toContainEqual({ type: 'set-equal', a: 'C', b: 'B', c: 'C', d: 'D' });
    // session fn2wt71w — the dash form
    const c2 = cmds('ABCD דלתון - AB=AD ו BC=DC');
    expect(c2[0]).toMatchObject({ type: 'shape-variant', shape: 'kite' });
    expect(c2).toContainEqual({ type: 'set-equal', a: 'B', b: 'C', c: 'D', d: 'C' });
  });

  it('generalizes past equalities: shape + angle given, shape + point + angle (the looksCompound example)', () => {
    expect(cmds('משולש ABC, זווית B = 90')).toContainEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 });
    const c = cmds('ריבוע ABCD, נקודה F על AB, זווית CFD 37');
    expect(c[0]).toMatchObject({ type: 'square' });
    expect(c).toContainEqual({ type: 'point-on-segment', id: 'F', a: 'A', b: 'B' });
    expect(c).toContainEqual({ type: 'set-angle', vertex: 'F', ray1: 'C', ray2: 'D', value: 37 });
  });

  it('clause context threads: "מרובע ABCD, מעגל חסום במרובע" binds the incircle to THE quad', () => {
    const c = cmds('מרובע ABCD, מעגל חסום במרובע');
    expect(c[0]).toMatchObject({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] });
    // the incircle clause must inscribe into the quad's OWN sides (ADR-245 definite-reference pattern),
    // not mint a SECOND fresh polygon — one polygon command in the whole batch, feet dropped onto A–D sides
    expect(c.filter((x) => x.type === 'quadrilateral' || x.type === 'square')).toHaveLength(1);
    expect(c.some((x) => x.type === 'foot' && (x as { a: string }).a === 'A' && (x as { b: string }).b === 'B')).toBe(true);
  });

  it('ALL-OR-NOTHING: an unreadable clause refuses the split (escalates whole, never half-parses)', () => {
    // piece 3 is no statement — the fallback must not commit the kite + pair with an unread clause
    const r = parse('דלתון ABCD, AB=AD, גיבריש מוחלט');
    expect(r.ok).toBe(false);
  });

  it('former must-escalate compounds now parse FULLY (moved from phase4/parser-coverage escalate lists)', () => {
    // these sat in the misparse-defense lists only because the OLD parser could half-parse them at
    // best; the clause fallback parses them whole — nothing dropped, so the guard's concern is met
    const c1 = cmds('parallelogram ABCD where AB = CD');
    expect(c1[0]).toMatchObject({ type: 'parallelogram' });
    expect(c1).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'C', d: 'D' });
    const c2 = cmds('square ABCD and segment AC');
    expect(c2[0]).toMatchObject({ type: 'square' });
    expect(c2).toContainEqual({ type: 'segment', a: 'A', b: 'C' });
  });

  it('list-comma constructions stay whole-rule-owned (never split)', () => {
    expect(types('circle through A, B, C')).toEqual(['circle-through']);
    expect(cmds('F, G, H on AB, AC, CB').filter((c) => c.type === 'point-on-segment')).toHaveLength(3);
    expect(types('D = חיתוך AK ו-CL')).toContain('line-line-intersection');
    // the multiStatement givens list is untouched (still the early rule)
    expect(cmds('AB = 4, BC = 6').filter((c) => c.type === 'set-distance')).toHaveLength(2);
  });
});

describe('dropped-shape-noun guard — a lax relation rule must not swallow a bare shape declaration (ADR-264 Am. 1)', () => {
  // The operator's dev session zalwhvsh: "משולש שווה שוקיים שבו AB=AC" committed as segments + set-equal
  // with NO triangle — the label-less shape rule DEFERS (null, not 'stop'), and equalSegments matches its
  // clause anywhere in the string. The guard trips on the shape-less winner and the clause split rescues.
  it('the operator utterance: "משולש שווה שוקיים שבו AB=AC" → isosceles TRIANGLE + the stated pair', () => {
    const c = cmds('משולש שווה שוקיים שבו AB=AC');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'] });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
  });

  it('the lax-family siblings rescue too: a size given, an angle given (ambiguous-angle intercepted)', () => {
    const size = cmds('משולש שווה שוקיים שבו AB=5');
    expect(size[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles' });
    expect(size).toContainEqual({ type: 'set-distance', a: 'A', b: 'B', value: 5 });
    // the angle rule used to CLAIM this and answer a misleading "name all three letters" clarification;
    // the rescue draws the triangle and resolves ∠B from the threaded neighbors (ADR-164)
    const ang = cmds('משולש שווה שוקיים שבו זווית B=40');
    expect(ang[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles' });
    expect(ang).toContainEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 });
  });

  it('English mirror: "isosceles triangle where AB=AC"', () => {
    const c = cmds('isosceles triangle where AB=AC');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles' });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
  });

  it('never fires on carrier equalities or triangle REFERENCES', () => {
    // a chord equality's מיתר is a carrier (ADR-119), not a polygon noun
    expect(cmds('מיתר AB = מיתר CD')).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'C', d: 'D' });
    // "…במשולש ABC" whose letters the commands account for is a reference, not a dropped declaration
    expect(cmds('קטע האמצעים PQ לצלע BC במשולש ABC', { points: ['A', 'B', 'C'] })).toEqual([
      { type: 'midpoint', id: 'P', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'Q', a: 'A', b: 'C' },
      { type: 'segment', a: 'P', b: 'Q' },
    ]);
    // a bare noun with a polygon already on the figure is a definite reference — the guard defers to it
    const r = parse('גובה מ A', { points: ['A', 'B', 'C'], polygons: [['A', 'B', 'C']], neighbors: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] } });
    expect(r.ok).toBe(true);
  });
});

describe('trailing inscribe predicate — a lax rule must not swallow "… חוסם/חסום במעגל" (ADR-264 Am. 2)', () => {
  // The symbolic-2alpha scenario's step 1: pre-Am.-2 the lax `circumcircle` rule (no leftover guard)
  // claimed the WHOLE line as a bare circumcircle — the isosceles and the stated AB=AC silently dropped;
  // the Am.-1 rescue then kept the shape + pair but dropped the CIRCLE instead (circle nouns are exempt
  // from droppedShapeNoun by design). Now the split detaches the predicate tail and gives it its subject —
  // THE unique polygon of the clause context (the ADR-245 definite-reference pattern, verb edition).
  it('the scenario line: shape + stated pair + the circumcircle ALL land (nothing dropped)', () => {
    const c = cmds('משולש שווה שוקיים ABC שבו AB=AC חוסם במעגל');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'] });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expect(c).toContainEqual({ type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C' });
  });

  it('English mirror: "isosceles triangle ABC in which AB=AC inscribed in a circle"', () => {
    const c = cmds('isosceles triangle ABC in which AB=AC inscribed in a circle');
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'isosceles' });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expect(c.some((x) => x.type === 'circumcircle')).toBe(true);
  });

  it('whole-line sibling: "AB=AC חוסם במעגל" typed after the triangle exists binds to THE triangle', () => {
    const c = cmds('AB=AC חוסם במעגל', { points: ['A', 'B', 'C'], polygons: [['A', 'B', 'C']] });
    expect(c).toContainEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expect(c.some((x) => x.type === 'circumcircle')).toBe(true);
  });

  it('honesty: no unique polygon subject → escalates whole (never guesses)', () => {
    // no polygon at all
    expect(parse('AB=AC חוסם במעגל', { points: ['A', 'B', 'C'] }).ok).toBe(false);
    // two polygons — ambiguous subject
    expect(
      parse('AB=AC חוסם במעגל', {
        points: ['A', 'B', 'C', 'D', 'E', 'F'],
        polygons: [['A', 'B', 'C'], ['D', 'E', 'F']],
      }).ok,
    ).toBe(false);
  });

  it('whole-rule-owned inscribes stay untouched (the gate never hijacks a rule that accounts its circle)', () => {
    const c = cmds('טרפז ABCD חסום במעגל O');
    expect(c.some((x) => x.type === 'circle' || x.type === 'circumcircle')).toBe(true);
    expect(c.filter((x) => x.type === 'point-on-circle')).toHaveLength(4);
  });

  it('the ADR-156 idempotent re-inscribe (vertices already on the circle) keeps its no-op lowering', () => {
    const ctx = {
      points: ['A', 'B', 'C'],
      circles: ['O'],
      circleMembers: [{ id: 'circle-O', center: 'O', points: ['A', 'B', 'C'] }],
      polygons: [['A', 'B', 'C']],
    };
    const c = cmds('משולש ABC חסום במעגל', ctx);
    // no fresh circle is minted — the triangle is re-asserted (deterministic ids ⇒ idempotent)
    expect(c.some((x) => x.type === 'circle' || x.type === 'circumcircle')).toBe(false);
    expect(c.some((x) => x.type === 'triangle')).toBe(true);
  });
});

describe('droppedGivenRelations — the third honesty gate (ADR-264)', () => {
  it('flags a stated equality the commands do not carry (the silent-drop hole)', () => {
    expect(
      droppedGivenRelations('משולש ABC הוא שווה שוקיים, כלומר AC=BC', [
        { type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant: 0 } as AnyCommand,
      ]),
    ).toEqual(['AC=BC']);
    expect(droppedGivenRelations('CE⊥AB', [{ type: 'segment', a: 'C', b: 'E' } as AnyCommand])).toEqual(['CE⊥AB']);
  });

  it('accounted by a set-* constraint carrying every label', () => {
    expect(
      droppedGivenRelations('משולש ABC, AC=BC', [{ type: 'set-equal', a: 'A', b: 'C', c: 'B', d: 'C' } as AnyCommand]),
    ).toEqual([]);
    expect(
      droppedGivenRelations('AB ∥ CD', [{ type: 'set-parallel', a: 'A', b: 'B', c: 'C', d: 'D' } as AnyCommand]),
    ).toEqual([]);
  });

  it('exempt when a relation label is INTRODUCED by a point definition (the "כך ש" class)', () => {
    expect(
      droppedGivenRelations('נקודה K על המשך AB כך ש AB=BK', [
        { type: 'point-on-segment', id: 'K', a: 'A', b: 'B', t: 2 } as AnyCommand,
      ]),
    ).toEqual([]);
  });

  it('never fires on numeric givens, coordinates, angle-triples, or area subscripts (the siblings own those)', () => {
    expect(droppedGivenRelations('AB = 4', [])).toEqual([]);
    expect(droppedGivenRelations('A = (3,5)', [])).toEqual([]);
    expect(droppedGivenRelations('∠ABC = ∠DEF', [])).toEqual([]); // 3-letter runs are not a 2-label pair
    expect(droppedGivenRelations('S_{ABC} = S_{ACD}', [])).toEqual([]);
  });

  it('the real deterministic parses of the reported forms are clean under the gate', () => {
    for (const u of ['דלתון ABCD, AB=AD', 'משולש ABC הוא שווה שוקיים, כלומר AC=BC', 'kite ABCD, AB=AD']) {
      expect(droppedGivenRelations(u, cmds(u)), u).toEqual([]);
    }
  });
});
