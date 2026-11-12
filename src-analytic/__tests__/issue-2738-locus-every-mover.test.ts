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
 *
 * #2849 ([ADR-AG-472](../../docs/06c-decisions-analytic.md#adr-ag-472)) NARROWS the chip: a point stated ON a carrier that
 * holds still has that carrier for its locus, already drawn, and no chip. Operator, 2026-11-12: *"whenever a point is on a
 * given curve, there is no point of giving it a chip. it just clutters the screen and is meaningless"*. So the movers on
 * circles I and II below lose their chips (their asks still answer the circle); the bisector point and every point whose
 * curve is not a given one keep theirs.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { locusChips, locusSentence } from '../app/locusChip';
import { derive } from '../engine/derive';
import { partsOf } from '../engine/components';
import { drawableAt, drawnChoiceSeed } from '../engine/evaluate';
import { onFixedCarrier } from '../engine/locus';
import { isFree } from '../engine/types';

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

describe('#2738 → #2849 — two points on two separate circles: no chip (each is on a given circle), each its own circle', () => {
  it.each([0, 1, 2])('seed %i: no chip on either', (seed) => {
    expect(chipsOf(TWO_CIRCLES, seed)).toEqual([]);
  });

  it.each([0, 1, 2])('seed %i: M answers circle I and N answers circle II', (seed) => {
    expect(answer(TWO_CIRCLES, 'M', seed).value).toBe('מעגל · x² + y² = 2²');
    expect(answer(TWO_CIRCLES, 'N', seed).value).toBe('מעגל · (x − 6)² + y² = 1²');
  });
});

describe('#2738 → #2849 — two points on ONE circle (one part, two free directions): no chip', () => {
  it('the figure is one part with two free directions', () => {
    expect(partsOf(derive(ONE_CIRCLE, 0).construction)).toHaveLength(1);
  });

  it("no chip on either: each one's locus is circle I, already drawn", () => {
    expect(chipsOf(ONE_CIRCLE)).toEqual([]);
  });

  it.each([0, 1, 2])('seed %i: each answers the circle', (seed) => {
    expect(answer(ONE_CIRCLE, 'M', seed).value).toBe('מעגל · x² + y² = 2²');
    expect(answer(ONE_CIRCLE, 'N', seed).value).toBe('מעגל · x² + y² = 2²');
  });
});

describe('#2738 — a point whose positions fill a region has no chip (R200: two degrees of freedom)', () => {
  const MID = [...TWO_CIRCLES, 'K אמצע MN'];

  it('the midpoint of two independent movers has none (a region), and the movers on their given circles have none', () => {
    expect(chipsOf(MID)).toEqual([]);
  });

  it('…and its ask draws nothing', () => {
    expect(answer(MID, 'K').locus).toBeUndefined();
  });

  it('a free point beside a mover has none, and neither has the mover on its given circle', () => {
    expect(chipsOf([I, 'M על המעגל I', 'נקודה P'])).toEqual([]);
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

  it("beside a mover on a given circle: the bisector's chip only, each its own answer", () => {
    const lines = [...BISECTOR, I, 'N על המעגל I'];
    expect(chipsOf(lines)).toEqual(['M']);
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

  it('two points on one circle tied by a chord length: one freedom, and no chip (both are on the given circle)', () => {
    expect(chipsOf([...ONE_CIRCLE, 'MN = 2'])).toEqual([]);
  });
});

/** `onFixedCarrier` at the drawn configuration, from the same start `locusChips` builds. */
const fixedCarrier = (lines: readonly string[], id: string, seed = 0) => {
  const d = derive(lines, seed);
  const f = drawableAt(d.construction, d.configuration);
  const start = new Map(d.construction.objects.filter(isFree).map((o) => {
    const p = f.points.find((q) => q.id === o.id)!;
    return [o.id, { x: p.x, y: p.y }] as const;
  }));
  return onFixedCarrier(d.construction, f.env, id, start, d.configuration.seed, drawnChoiceSeed(f, d.configuration.seed));
};

describe('#2849 — onFixedCarrier: a point stated on a carrier that holds still', () => {
  it.each([
    ['on a stated circle', [I, 'M על המעגל I'], 'M'],
    ['on an axis', ['נקודה A', 'A על ציר x'], 'A'],
    ['on the line through two fixed points', ['A(0,0)', 'B(4,0)', 'P על הישר AB'], 'P'],
  ])('%s: yes', (_t, lines, id) => {
    expect(fixedCarrier(lines, id)).toBe(true);
  });

  it.each([
    ['on the line through a moving point', ['A(0,0)', 'נקודה B', 'AB = 3', 'P על הישר AB', 'AP = 1'], 'P'],
    ['the bisector point (no carrier stated)', BISECTOR, 'M'],
    ['a point at a stated distance (its circle is not drawn)', ['A(0,0)', 'נקודה M', 'MA = 5'], 'M'],
    ['a derived midpoint', ['x^2+2y^2=16', 'AB מיתר באליפסה', 'M אמצע AB'], 'M'],
  ])('%s: no', (_t, lines, id) => {
    expect(fixedCarrier(lines, id)).toBe(false);
  });

  it('a point on a moving carrier keeps its chip', () => {
    expect(chipsOf(['A(0,0)', 'נקודה B', 'AB = 3', 'P על הישר AB', 'AP = 1'])).toEqual(['B', 'P']);
  });
});

describe("#2849 — the operator's figures (2026-11-12)", () => {
  const CHORD = ['x^2+2y^2=16', 'AB מיתר באליפסה', 'M אמצע AB'];

  it.each([0, 1, 2])('seed %i: the chord on the ellipse and its midpoint: no chip at all', (seed) => {
    expect(chipsOf(CHORD, seed)).toEqual([]);
  });

  it.each([0, 1, 2])("seed %i: «AB מקביל לישר y=x» added: M's chip only, on its own row", (seed) => {
    expect(locusChips(derive([...CHORD, 'AB מקביל לישר y=x'], seed)).map((c) => [c.id, c.line])).toEqual([['M', 2]]);
  });

  it.each([0, 1, 2])('seed %i: the triangle on the foci with D on the ellipse: no chip on any row', (seed) => {
    expect(chipsOf(['7x^2+9y^2=63', 'F1 מוקד ימני של האליפסה', 'F2 מוקד שמאלי', 'משולש F1F2D', 'D על האליפסה'], seed)).toEqual([]);
  });
});
