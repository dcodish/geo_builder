/**
 * #1048 — CLICK AN OBJECT TO MEASURE IT, and SEE the construction behind the number.
 *
 * Operator, 2026-09-15: *"a user can say I want to see the distance between this point and a specific
 * line, and the canvas should show the height from the point to the line … clicking on a line itself
 * should allow us to either show the equation of the line or the distance between the two nodes …
 * maybe also the slope as a third option."*
 *
 * Two things are locked here and they are different. The MENU must offer only questions the figure can
 * actually answer — an option whose answer would be «לא הבנתי» is the menu lying about the figure. And
 * the PERPENDICULAR must be drawn when, and only when, the distance is knowledge: on an
 * under-determined figure the point sits wherever the sampler put it, and a height drawn there asserts
 * a magnitude nobody gave (ADR-052).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { measurablesOf } from '../app/measurable';
import { buildScene } from '../render/scene';
import { fmtNum } from '../../shell/format';

/** The operator's own example: A(2,5) and the line 3x − 4y + 1 = 0, whose distance is 2.6. */
const FIG = ['נתונה הנקודה A(2,5)', 'נתון הישר l1: 3x-4y+1=0'];
const fmt = (n: number) => fmtNum(n);
const answer = (lines: string[], q: string) => {
  const d = derive(lines, 0);
  return { d, a: ask(d, q, fmt) };
};

describe('#1048 — the menu offers only what the figure can answer', () => {
  it('a POINT offers its coordinates and a distance to each named line', () => {
    const d = derive(FIG, 0);
    const opts = measurablesOf(d.construction, { kind: 'point', id: 'A' }).map((m) => m.sentence);
    expect(opts).toContain('A');
    expect(opts).toContain('המרחק מ-A לישר l1');
  });

  it('a point on a figure with NO line offers no distance — nothing to measure to', () => {
    const d = derive(['נתונה הנקודה A(2,5)'], 0);
    const opts = measurablesOf(d.construction, { kind: 'point', id: 'A' }).map((m) => m.sentence);
    expect(opts).toEqual(['A']);
  });

  it('a LINE offers the operator’s three, and the length ONLY when its name is two points', () => {
    const d = derive(FIG, 0);
    const opts = measurablesOf(d.construction, { kind: 'curve', id: 'line-l1' }).map((m) => m.sentence);
    expect(opts).toContain('משוואת הישר l1');
    expect(opts).toContain('שיפוע הישר l1');
    // «l1» has no nodes: offering «אורך» would promise a number that cannot exist.
    expect(opts.some((o) => /^[A-Z][0-9]?[A-Z][0-9]?$/.test(o))).toBe(false);
  });

  it('a line NAMED by two points also offers their distance', () => {
    const d = derive(['A(0,0)', 'B(3,4)', 'משוואת הישר AB היא y=(4/3)x'], 0);
    const line = d.construction.objects.find((o) => o.kind === 'curve');
    expect(line).toBeDefined();
    const opts = measurablesOf(d.construction, { kind: 'curve', id: line!.id }).map((m) => m.sentence);
    expect(opts).toContain('AB');
  });

  it('every offered sentence is one the ask lane really answers', () => {
    const d = derive(FIG, 0);
    for (const what of [
      { kind: 'point' as const, id: 'A' },
      { kind: 'curve' as const, id: 'line-l1' },
    ]) {
      for (const m of measurablesOf(d.construction, what)) {
        const a = ask(d, m.sentence, fmt);
        expect(a.unreadable, `«${m.sentence}» was offered and is not understood`).toBeFalsy();
      }
    }
  });
});

describe('#1048 — the distance, and the height that explains it', () => {
  it('answers the operator’s own case with his own number', () => {
    const { a } = answer(FIG, 'המרחק מ-A לישר l1');
    expect(a.value).toBe('2.6');
  });

  it('and shows the formula with this figure’s values in it (#1053’s level)', () => {
    const { a } = answer(FIG, 'המרחק מ-A לישר l1');
    expect(a.trace).toBeTruthy();
    // Substituted, never worked through to the answer.
    expect(a.trace).toContain('3');
    expect(a.trace).not.toContain('= 2.6');
  });

  it('the PERPENDICULAR is marked, and its foot really is on the line', () => {
    const { a } = answer(FIG, 'המרחק מ-A לישר l1');
    expect(a.mark).toBeDefined();
    const { from, foot } = a.mark!;
    expect(from).toEqual({ x: 2, y: 5 });
    // On the line: 3x − 4y + 1 = 0.
    expect(Math.abs(3 * foot.x - 4 * foot.y + 1)).toBeLessThan(1e-9);
    // And the segment really is the distance.
    expect(Math.hypot(from.x - foot.x, from.y - foot.y)).toBeCloseTo(2.6, 6);
  });

  it('the segment is PERPENDICULAR to the line — the right angle is real, not decorative', () => {
    const { a } = answer(FIG, 'המרחק מ-A לישר l1');
    const { from, foot } = a.mark!;
    // The line's direction is (−b, a) = (4, 3); the drop must be orthogonal to it.
    const dot = (from.x - foot.x) * 4 + (from.y - foot.y) * 3;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('NO height is drawn when the distance is not knowledge — the honesty gate', () => {
    // `P` is free on the line y=x, so its distance to l1 is not fixed by the givens.
    const lines = ['נתון הישר l1: 3x-4y+1=0', 'נתון הישר l2: y=x', 'נקודה P על הישר y=x'];
    const { a } = answer(lines, 'המרחק מ-P לישר l1');
    // NOT vacuous: the question is understood, `P` exists, and the answer is honestly open. Without
    // this row the case would pass just as well if the sentence had not parsed at all.
    expect(a.unreadable).toBeFalsy();
    expect(derive(lines, 0).figure.points.some((q) => q.id === 'P')).toBe(true);
    expect(a.value).toBeNull();
    expect(a.mark).toBeUndefined();
  });

  it('an ask NEVER mutates the figure (02c R24)', () => {
    const d = derive(FIG, 0);
    const before = JSON.stringify(d.construction);
    ask(d, 'המרחק מ-A לישר l1', fmt);
    expect(JSON.stringify(d.construction)).toBe(before);
  });
});

describe('#1048 — the height reaches the canvas', () => {
  it('buildScene projects the mark, with its right-angle tick and the value on it', () => {
    const d = derive(FIG, 0);
    const a = ask(d, 'המרחק מ-A לישר l1', fmt);
    const scene = buildScene(d.figure, d.box, 800, 600, {
      marks: [{ from: a.mark!.from, foot: a.mark!.foot, label: a.value ?? undefined }],
    });
    expect(scene.measures).toHaveLength(1);
    const m = scene.measures[0];
    expect(m.tick).toBeTruthy();
    expect(m.label?.text).toBe('2.6');
    // Projected, not world coordinates.
    expect(m.x1).not.toBe(2);
  });

  it('no marks, no measures — the canvas is unchanged until something is asked', () => {
    const d = derive(FIG, 0);
    expect(buildScene(d.figure, d.box, 800, 600, {}).measures).toEqual([]);
  });
});
