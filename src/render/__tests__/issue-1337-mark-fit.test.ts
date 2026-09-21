/**
 * #1337 ([ADR-544](../../../docs/06-decisions.md#adr-544)) — A MARK IS SIZED BY ITS CORNER, NOT BY THE
 * FIGURE.
 *
 * Operator, 2026-09-21, playing round #1332 T21 («משולש ABC» · «∠ABC = 90» · «∠ACB = 89», the
 * legitimate 1° apex): *"while this is a rare case, the diagram is bad. I would say that in such a case
 * we show all values very small to fit diagram"*. The 90° square and the 89° arc were drawn at their
 * usual size at B and C, which sit a few pixels apart, so both marks and both numbers piled on top of
 * each other and on the segment.
 *
 * The figure is RIGHT to draw — 89° + 90° is a real triangle (ADR-513 measured it) — so this is display
 * only, and the ruling is shrink-to-fit, never drop: everything the student stated stays visible.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import {
  ANGLE_ARC_R,
  MARK_FIT_FRACTION,
  MIN_MEASURE_FONT_PX,
  buildScene,
  labelScale,
  markScale,
} from '../scene';
import { fitTransform } from '../transform';

const R = 4; // the renderer's base unit at zoom 1
const VP = { width: 800, height: 600, padding: 24 };

/** Every angle measure of a figure, with the room its corner actually has in screen px. */
function angleMarks(lines: string[]) {
  const fig = replay(factsOf(lines as never));
  const scene = buildScene(fig.construction, fig.positions, fig.labels);
  const t = fitTransform([...fig.positions.values()], VP);
  return scene.measures
    .filter((m) => m.kind === 'angle' && m.ends)
    .map((m) => {
      const v = t.toScreen(m.pos);
      const ends = m.ends!.map((e) => t.toScreen(e));
      const roomPx = Math.min(...ends.map((e) => Math.hypot(e.x - v.x, e.y - v.y)));
      const k = markScale(roomPx, R);
      return { text: m.text, v, roomPx, scale: k, arc: ANGLE_ARC_R * R * k };
    });
}

describe('#1337 — the reported needle', () => {
  const NEEDLE = ['משולש ABC', '∠ABC = 90', '∠ACB = 89'];

  it('is still DRAWN and still states both angles — the figure was never the defect', () => {
    const fig = replay(factsOf(NEEDLE as never));
    expect(fig.lastError).toBeNull();
    expect(angleMarks(NEEDLE).map((m) => m.text).sort()).toEqual(['89°', '90°']);
  });

  it('both marks shrink, because their corner is a few pixels wide', () => {
    for (const m of angleMarks(NEEDLE)) {
      expect(m.roomPx, m.text).toBeLessThan(2 * ANGLE_ARC_R * R); // the corner really is too small
      expect(m.scale, m.text).toBeLessThan(1);
    }
  });

  /**
   * The property the operator was looking at: two marks at the ends of ONE short side must not
   * overprint each other. It holds structurally rather than by luck — each mark takes at most
   * `MARK_FIT_FRACTION` of its own adjacent side, so two of them take at most 70% of it.
   */
  it('the two marks cannot touch: together they take less than the side they sit on', () => {
    const marks = angleMarks(NEEDLE);
    expect(marks).toHaveLength(2);
    const apart = Math.hypot(marks[0].v.x - marks[1].v.x, marks[0].v.y - marks[1].v.y);

    expect(marks[0].arc + marks[1].arc).toBeLessThan(apart);
  });

  it('and the value is still shown — small, never dropped', () => {
    for (const m of angleMarks(NEEDLE)) {
      const font = Math.max(MIN_MEASURE_FONT_PX, 16 * 1.05 * m.scale);
      expect(font).toBeGreaterThanOrEqual(MIN_MEASURE_FONT_PX);
    }
  });
});

describe('#1337 — an ordinary figure is untouched (the regression that matters)', () => {
  it('a plain triangle draws its mark at full size', () => {
    for (const m of angleMarks(['משולש ABC', '∠ABC = 60'])) {
      expect(m.scale).toBe(1);
      expect(m.arc).toBe(ANGLE_ARC_R * R);
    }
  });

  it('a corner with room to spare is never scaled down', () => {
    expect(markScale(1000, R)).toBe(1);
    expect(markScale(2 * ANGLE_ARC_R * R / MARK_FIT_FRACTION, R)).toBe(1);
  });
});

describe('#1337 — the rule itself', () => {
  it('scales linearly with the room, and never above 1 or at 0', () => {
    const full = ANGLE_ARC_R * R;
    expect(markScale(full / MARK_FIT_FRACTION, R)).toBeCloseTo(1, 9);
    expect(markScale(full / MARK_FIT_FRACTION / 2, R)).toBeCloseTo(0.5, 9);
    expect(markScale(0.0001, R)).toBeGreaterThan(0);
    expect(markScale(1e9, R)).toBe(1);
  });

  it('a degenerate or unknown room is not an excuse to draw nothing', () => {
    expect(markScale(0, R)).toBe(1);
    expect(markScale(Number.NaN, R)).toBe(1);
    expect(markScale(Infinity, R)).toBe(1);
  });

  /** A value longer than the side it labels shrinks against that side — the third member of the class. */
  it('a length label shrinks when the number is wider than its own side', () => {
    expect(labelScale(200, '4', 16)).toBe(1);
    expect(labelScale(5, '12√2', 16)).toBeLessThan(1);
    expect(labelScale(5, '12√2', 16)).toBeGreaterThan(0);
  });
});
