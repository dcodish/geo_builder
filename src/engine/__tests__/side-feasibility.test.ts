/**
 * #1470 + #1487 ([ADR-549](../../../docs/06-decisions.md#adr-549)) — A STATED SIDE AND A STATEMENT THAT
 * STRUCTURALLY PUTS THE POINT ELSEWHERE ARE A PROVEN CONTRADICTION.
 *
 * The fourth stage-0 prover (0g′), beside ADR-417's metric, ADR-538's angle-sum and ADR-540's bound
 * provers, with the same one-way soundness. These locks CALL the prover — the refusals and the
 * satisfiable controls go through the very same `sideImpossibility(probed, cmd)` call `applyStep` makes,
 * so a control that the prover wrongly flags fails here, not only somewhere downstream.
 */
import { describe, expect, it } from 'vitest';
import { sideImpossibility, sideImpossibilityError } from '../sideFeasibility';
import { applyCommand } from '../apply';
import { applyStep } from '../step';
import { lower } from '../lower';
import { pointOutsidePolygon } from '../geometry';
import { checkGivens } from '../verify';
import type { Command, Construction } from '../types';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '@/replay/core';

/** The figure of every line but the last, and the last line's engine commands. */
function split(steps: string[]): { prior: Construction; last: Command[] } {
  const facts = factsOf(steps as never);
  const prior = replay(facts.slice(0, -1)).construction;
  const last = lower([facts[facts.length - 1].cmd]) as Command[];
  return { prior, last };
}

/** The committed figure of every line. */
const figure = (steps: string[]): Construction => replay(factsOf(steps as never)).construction;

/** Run the last line's commands through the prover exactly as applyStep does (probe, then prove), committing as it goes. */
function prove(steps: string[]): string | null {
  const { prior, last } = split(steps);
  let cur = prior;
  for (const cmd of last) {
    const m = sideImpossibility(applyCommand(cur, cmd), cmd);
    if (m) return sideImpossibilityError(m);
    const r = applyStep(cur, cmd);
    if (!r.ok) return `step failed: ${r.error}`;
    cur = r.construction;
  }
  return null;
}

describe('sideImpossibility — every structural member, both entry orders', () => {
  const CASES: [string[], string][] = [
    [['מעגל O', 'E נקודה מחוץ למעגל', 'המעגל עובר דרך E'], 'impossible: «E on circle O» contradicts «E outside circle O»'],
    [['מעגל O', 'E נקודה מחוץ למעגל', 'E על המעגל'], 'impossible: «E on circle O» contradicts «E outside circle O»'],
    [['מעגל O', 'E על המעגל', 'E מחוץ למעגל'], 'impossible: «E outside circle O» contradicts «E on circle O»'],
    [['מעגל O', 'E בתוך המעגל', 'E על המעגל'], 'impossible: «E on circle O» contradicts «E inside circle O»'],
    [['מעגל O', 'E על המעגל', 'E בתוך המעגל'], 'impossible: «E inside circle O» contradicts «E on circle O»'],
    [['מעגל O', 'E מחוץ למעגל', 'E בתוך המעגל'], 'impossible: «E inside circle O» contradicts «E outside circle O»'],
    [['circle O', 'E outside the circle', 'E on the circle'], 'impossible: «E on circle O» contradicts «E outside circle O»'],
    [['מעגל O', 'O מחוץ למעגל'], 'impossible: «O outside circle O» contradicts «O is the centre of circle O»'],
    [['משולש ABC', 'E על AB', 'E מחוץ למשולש ABC'], 'impossible: «E outside triangle ABC» contradicts «E on segment AB»'],
    [['משולש ABC', 'E מחוץ למשולש ABC', 'E על AB'], 'impossible: «E on segment AB» contradicts «E outside triangle ABC»'],
    [['משולש ABC', 'E בתוך המשולש ABC', 'E על BC'], 'impossible: «E on segment BC» contradicts «E inside triangle ABC»'],
    [['משולש ABC', 'E בתוך המשולש ABC', 'E מחוץ למשולש ABC'], 'impossible: «E outside triangle ABC» contradicts «E inside triangle ABC»'],
    [['משולש ABC', 'C בתוך המשולש ABC'], 'impossible: «C inside triangle ABC» contradicts «C is a vertex of ABC»'],
    [['משולש ABC', 'B מחוץ למשולש ABC'], 'impossible: «B outside triangle ABC» contradicts «B is a vertex of ABC»'],
    [['משולש ABC', 'M אמצע AB', 'M מחוץ למשולש ABC'], 'impossible: «M outside triangle ABC» contradicts «M is the midpoint of AB»'],
    [['ריבוע ABCD', 'E על CD', 'E בתוך הריבוע ABCD'], 'impossible: «E inside polygon ABCD» contradicts «E on segment CD»'],
    [['קטע AB', 'C ו-D בצדדים שונים של AB', 'C על AB'], 'impossible: «C on segment AB» contradicts «C, D on different sides of AB»'],
    [['קטע AB', 'C על AB', 'C ו-D בצדדים שונים של AB'], 'impossible: «C, D on different sides of AB» contradicts «C on segment AB»'],
    [['ישר AB', 'C על הישר AB', 'C ו-D בצדדים שונים של AB'], 'impossible: «C, D on different sides of AB» contradicts «C on line AB»'],
    [['קטע AB', 'C ו-D באותו צד של AB', 'C ו-D בצדדים שונים של AB'], 'impossible: «C, D on different sides of AB» contradicts «C, D on the same side of AB»'],
  ];
  it.each(CASES)('%j', (steps, message) => {
    expect(prove(steps)).toBe(message);
  });

  it('applyStep refuses it at stage 0 (`pre:impossible`) and keeps the prior figure', () => {
    const { prior, last } = split(['מעגל O', 'E נקודה מחוץ למעגל', 'E על המעגל']);
    const r = applyStep(prior, last[0]);
    expect(r.ok).toBe(false);
    expect(r.ladder).toEqual(['pre:impossible']);
    expect(r.construction).toBe(prior);
  });
});

describe('sideImpossibility — the side record survives the M1 lowering, not only the object shape', () => {
  it('the record rides the committed figure after M1 turns the point into a rider', () => {
    const facts = factsOf(['מעגל O', 'E נקודה מחוץ למעגל', 'F על המעגל'] as never);
    const fig = replay(facts).construction;
    expect(fig.requirements).toEqual([{ kind: 'circle-side', id: 'E', circle: 'circle-O', side: 'outside' }]);
  });

  it('a figure with no stated side carries no record (byte-identical to before)', () => {
    const fig = replay(factsOf(['משולש ABC', 'E על AB'] as never)).construction;
    expect('requirements' in fig).toBe(false);
  });

  it('a PINNED point said to be on a stated-radius circle (lowered to |OE| = r) contradicts a later «outside»', () => {
    // «מעגל O רדיוס 5» · E pinned · «E על המעגל» lowers to the DISTANCE |OE| = 5 (apply's (c4)); the
    // prover reads the constraint, since no object says E is on the circle.
    let cur = applyStep(figure(['מעגל O רדיוס 5']), { type: 'free-point', id: 'E', x: 3, y: 1 }).construction; // pinned, off the circle
    const on = applyStep(cur, { type: 'point-on-circle', id: 'E', circle: 'circle-O' });
    expect(on.ok).toBe(true);
    cur = (on as { construction: Construction }).construction;
    expect(cur.objects.find((o) => o.id === 'E')?.kind, 'no object says E is on the circle').toBe('free-point');
    const side: Command = { type: 'point-circle-side', id: 'E', circle: 'circle-O', side: 'outside' };
    expect(sideImpossibilityError(sideImpossibility(applyCommand(cur, side), side)!)).toBe('impossible: «E outside circle O» contradicts «E on circle O»');
  });

  it('a PINNED point said to lie on an edge (lowered to an in-order statement) contradicts a later «outside»', () => {
    let cur = applyStep(figure(['משולש ABC']), { type: 'free-point', id: 'E', x: 1, y: 1 }).construction;
    const on = applyStep(cur, { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' });
    if (on.ok) cur = on.construction;
    const side: Command = { type: 'point-polygon-side', id: 'E', poly: ['A', 'B', 'C'], side: 'outside' };
    const m = sideImpossibility(applyCommand(cur, side), side);
    expect(m && sideImpossibilityError(m)).toBe('impossible: «E outside triangle ABC» contradicts «E on segment AB»');
  });
});

describe('sideImpossibility — satisfiable combinations are NEVER refused (the same prover call)', () => {
  const CONTROLS: string[][] = [
    ['מעגל O', 'E מחוץ למעגל', 'EO = 10'],
    ['מעגל O', 'E על המעגל', 'F מחוץ למעגל'],
    ['מעגל O', 'מעגל P', 'E מחוץ למעגל O', 'E על מעגל P'],
    ['משולש ABC', 'מעגל O', 'E בתוך המשולש ABC', 'E על מעגל O'], // a free rider can be inside — the 2025-bagrut shape
    ['מעגל O', 'O בתוך המעגל'],
    ['משולש ABC', 'E מחוץ למשולש ABC', 'E על המשך AB'],
    ['ריבוע ABCD', 'M אמצע AC', 'M בתוך הריבוע ABCD'], // a diagonal is not an edge
    ['קטע AB', 'מעגל O', 'C ו-D בצדדים שונים של AB', 'C על מעגל O'],
    ['קטע AB', 'C ו-D בצדדים שונים של AB', 'E על AB'], // another point on the line
    ['מעגל O', 'E מחוץ למעגל', 'E מחוץ למעגל'], // a re-statement agrees with itself
    ['מעגל O', 'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B'],
    ['מעגל O', 'AD חותך את מעגל O בנקודה B'],
    ['מעגל O', 'מנקודה A יוצאים שני משיקים למעגל O'],
    ['מעגל O', 'PA משיק למעגל בנקודה A'],
  ];
  it.each(CONTROLS)('%j', (...steps) => {
    expect(prove(steps)).toBeNull();
  });
});

describe('#1487 — «outside» a polygon is STRICT: the boundary is neither side', () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 3 },
  ];
  it('a point on an edge, at an edge midpoint and at a vertex is not outside', () => {
    expect(pointOutsidePolygon({ x: 1, y: 0 }, tri, 0.03)).toBe(false);
    expect(pointOutsidePolygon({ x: 2, y: 1.5 }, tri, 0.03)).toBe(false);
    expect(pointOutsidePolygon({ x: 4, y: 0 }, tri, 0.03)).toBe(false);
    expect(pointOutsidePolygon({ x: 1, y: 0 }, tri)).toBe(false); // even with no margin
  });
  it('a genuinely outside point is outside; an inside point is not', () => {
    expect(pointOutsidePolygon({ x: 3, y: 3 }, tri, 0.03)).toBe(true);
    expect(pointOutsidePolygon({ x: 1, y: -1 }, tri, 0.03)).toBe(true);
    expect(pointOutsidePolygon({ x: 1, y: 1 }, tri, 0.03)).toBe(false);
  });
  it('the verifier reads a point ON an edge stated outside as a violation — no longer silent green', () => {
    const pos = new Map([['A', tri[0]], ['B', tri[1]], ['C', tri[2]]]);
    const cmd = { type: 'point-polygon-side', id: 'E', poly: ['A', 'B', 'C'], side: 'outside' } as Command;
    for (const E of [{ x: 1, y: 0 }, { x: 2, y: 1.5 }, { x: 0, y: 3 }]) {
      const v = checkGivens([cmd], new Map([...pos, ['E', E]]), new Map());
      expect(v.map((x) => x.messageKey), JSON.stringify(E)).toEqual(['figure.v.outsideRegion']);
    }
    expect(checkGivens([cmd], new Map([...pos, ['E', { x: 3, y: 3 }]]), new Map())).toEqual([]);
  });
});
