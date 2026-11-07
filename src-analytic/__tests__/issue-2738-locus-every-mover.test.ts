/**
 * #2738 ([ADR-AG-426](../../docs/06c-decisions-analytic.md#adr-ag-426)) — EVERY POINT THAT MOVES ON A CURVE HAS ITS LOCUS
 * CHIP, however many other points move.
 *
 * Operator, 2026-11-07: *"when there is more than 1 point with a locus, allpoints shoudl get the chip of showing the locus."*
 * Before this, the chip (`hasLocus`) and the walk (`traceLocus`) asked whether the WHOLE figure had exactly one free
 * direction. So two points on two circles got no chip, two points on one circle got none, and a locus point lost its chip
 * the moment an unrelated «מרובע» was typed beside it. Now the question is the point's own: does IT move along exactly one
 * direction, over every way its part of the figure can move?
 *
 * Everything here goes through the real decisions: `locusChips` and the chip's `ask`, never a copy of them (#1102).
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { locusChips, locusSentence } from '../app/locusChip';
import { derive } from '../engine/derive';
import { partsOf } from '../engine/components';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' };
const kind = ((k: string) => HE[k] ?? k) as never;

const chipsOf = (lines: readonly string[], seed = 0) => locusChips(derive(lines, seed)).map((c) => c.id);
const answer = (lines: readonly string[], id: string, seed = 0) => ask(derive(lines, seed), locusSentence(id), fmt, kind, 'chip');

const I = 'נתון מעגל I שמשוואתו x^2+y^2=4';
const II = 'נתון מעגל II שמשוואתו (x-6)^2+y^2=1';
const TWO_CIRCLES = [I, 'M על המעגל I', II, 'N על המעגל II'];
const ONE_CIRCLE = [I, 'M על המעגל I', 'N על המעגל I'];
const BISECTOR = ['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB'];

describe('#2738 — two points on two separate circles: each has its chip and its own circle', () => {
  it('both chips, each on the row that introduced its point', () => {
    expect(locusChips(derive(TWO_CIRCLES, 0)).map((c) => [c.id, c.line])).toEqual([
      ['M', 1],
      ['N', 3],
    ]);
  });

  it.each([0, 1, 2])('seed %i: M answers circle I and N answers circle II', (seed) => {
    expect(answer(TWO_CIRCLES, 'M', seed).value).toBe('מעגל · x² + y² = 2²');
    expect(answer(TWO_CIRCLES, 'N', seed).value).toBe('מעגל · (x − 6)² + y² = 1²');
  });
});

describe('#2738 — two points on ONE circle (one part, two free directions): each has its chip', () => {
  it('the figure is one part with two free directions', () => {
    expect(partsOf(derive(ONE_CIRCLE, 0).construction)).toHaveLength(1);
  });

  it('both chips', () => {
    expect(chipsOf(ONE_CIRCLE)).toEqual(['M', 'N']);
  });

  it.each([0, 1, 2])('seed %i: each answers the circle', (seed) => {
    expect(answer(ONE_CIRCLE, 'M', seed).value).toBe('מעגל · x² + y² = 2²');
    expect(answer(ONE_CIRCLE, 'N', seed).value).toBe('מעגל · x² + y² = 2²');
  });
});

describe('#2738 — a point whose positions fill a region has no chip (R200: two degrees of freedom)', () => {
  const MID = [...TWO_CIRCLES, 'K אמצע MN'];

  it('the midpoint of two independent movers has none; the movers keep theirs', () => {
    expect(chipsOf(MID)).toEqual(['M', 'N']);
  });

  it('…and its ask draws nothing', () => {
    expect(answer(MID, 'K').locus).toBeUndefined();
  });

  it('a free point beside a mover has none', () => {
    expect(chipsOf([I, 'M על המעגל I', 'נקודה P'])).toEqual(['M']);
  });
});

describe('#2738 — a locus point beside an unrelated shape keeps its chip and its answer', () => {
  it('alone: the bisector', () => {
    expect(chipsOf(BISECTOR)).toEqual(['M']);
    expect(answer(BISECTOR, 'M').value).toBe('ישר · x - 2 = 0');
  });

  it.each(['מרובע', 'טרפז', 'מעוין'])('beside «%s»: the same chip, the same answer', (shape) => {
    const lines = [...BISECTOR, shape];
    expect(partsOf(derive(lines, 0).construction).length).toBeGreaterThan(1);
    expect(chipsOf(lines)).toEqual(['M']);
    expect(answer(lines, 'M').value).toBe('ישר · x - 2 = 0');
  });

  it('beside a second mover: both chips, each its own answer', () => {
    const lines = [...BISECTOR, I, 'N על המעגל I'];
    expect(chipsOf(lines)).toEqual(['M', 'N']);
    expect(answer(lines, 'M').value).toBe('ישר · x - 2 = 0');
    expect(answer(lines, 'N').value).toBe('מעגל · x² + y² = 2²');
  });
});

describe('#2738 — a figure with one free direction takes the path it always took', () => {
  it('the circle locus and the chain downstream of it', () => {
    const CHAIN = ['A(0,0)', 'נקודה M', 'MA = 5', 'B(6,0)', 'N אמצע MB'];
    expect(chipsOf(CHAIN)).toEqual(['M', 'N']);
    expect(answer(CHAIN, 'M').value).toBe('מעגל · x² + y² = 5²');
  });

  it('two points on one circle tied by a chord length: one freedom, both chips', () => {
    expect(chipsOf([...ONE_CIRCLE, 'MN = 2'])).toEqual(['M', 'N']);
  });
});
