import { describe, it, expect } from 'vitest';
import { findValidConfig, meetsRequirements, replay, searchAnotherView, searchResample } from '@/replay/core';
import { factsOf } from '@/__tests__/scenario-pipeline';
import type { Derived } from '@/replay/core';

/**
 * #1005 / [ADR-514](../../../docs/06-decisions.md#adr-514) — the "is this a different drawing?"
 * fingerprint must read every EXTENT of the drawing, not the named points alone.
 *
 * The reported figure: «מעגל O» + «M מחוץ למעגל». Two named points give ONE distance, normalised by
 * itself — the constant `[1]` at every seed — so the figure's single shape freedom (|OM| against the
 * free radius) was invisible to `shapeDiffers` and «הציגו תצורה אחרת» answered "no other configuration"
 * over drawings that visibly differ.
 */

/** |OM| / r at a seed — the one shape ratio the reported figure has. */
function omOverR(fig: Derived): number {
  const o = fig.positions.get('O')!;
  const m = fig.positions.get('M')!;
  const r = fig.circles.get('circle-O')!.r;
  return Math.hypot(o.x - m.x, o.y - m.y) / r;
}

describe('#1005 — the shape fingerprint reads circle radii, not named points alone', () => {
  it('the reported two-liner finds another configuration, and the drawing genuinely differs', () => {
    const facts = factsOf(['מעגל O', 'M מחוץ למעגל']);
    const s = searchResample(facts, 0);
    expect(s, 'the button must find another configuration').not.toBeNull();

    const before = omOverR(replay(facts, 0));
    const after = omOverR(replay(facts, s!));
    // Not just a different seed — a different DRAWING. |OM|/r is similarity-invariant, so a change in
    // it is a change no rotation/scale can account for.
    expect(Math.abs(after - before) / before, `|OM|/r moved from ${before} to ${after}`).toBeGreaterThan(0.03);
  });

  it('the inside sibling behaves the same — «M בתוך המעגל»', () => {
    const facts = factsOf(['מעגל O', 'M בתוך המעגל']);
    const s = searchResample(facts, 0);
    expect(s).not.toBeNull();
    expect(Math.abs(omOverR(replay(facts, s!)) - omOverR(replay(facts, 0)))).toBeGreaterThan(1e-3);
  });

  it('a DETERMINED figure still reports no other configuration (the ADR-065 bar is not loosened)', () => {
    // A bare square has only similarity freedom: every seed is the same drawing, rotated and resized.
    expect(searchResample(factsOf(['ריבוע ABCD']), 0)).toBeNull();
  });

  it('a circle with one point ON it has no other configuration — every drawing is similar', () => {
    // MEASURED, and it is the honest answer, not a miss: |OA| IS the radius, so the only ratio the
    // figure has is r/r = 1 at every seed. Recorded because #1005 listed this as a suspected member of
    // the class; the fingerprint's verdict here is correct and must not drift into a false positive.
    expect(searchResample(factsOf(['מעגל O', 'A על המעגל']), 0)).toBeNull();
  });

  it('a figure with NO circle is untouched — the point-only fingerprint still decides', () => {
    expect(searchResample(factsOf(['משולש ABC']), 0)).not.toBeNull();
  });
});

/**
 * #2831 ([ADR-824](../../../docs/06-decisions.md#adr-824), [ADR-W-206](../../../docs/06w-decisions-workspace.md#adr-w-206)) —
 * the fingerprint is also what makes two drawings ONE SOLUTION: the operator, 2026-11-12 (*"2831 - A"*), a mirror image
 * of a drawing is the same solution placed differently, and «הציגו תצורה אחרת» shows new solutions first. On a figure
 * whose shape is determined, `searchAnotherView` walks the solution cycle: the axis assignments grouped by fingerprint,
 * interleaved round-robin from the all-default one.
 */
describe('#2831 — a determined shape shows its new solutions before another placement', () => {
  /** The labelled shape: every distance between two named points, normalised — mirror- and turn-invariant. */
  const shapeOf = (fig: Derived) => {
    const ids = [...fig.positions.keys()].filter((id) => /^[A-Z]$/.test(id)).sort();
    const ds: number[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) ds.push(Math.hypot(fig.positions.get(ids[i])!.x - fig.positions.get(ids[j])!.x, fig.positions.get(ids[i])!.y - fig.positions.get(ids[j])!.y));
    const m = Math.max(...ds);
    return ds.map((x) => (x / m).toFixed(3)).join(',');
  };
  /** The shape of the first drawing and of each of `n` presses. */
  const pressShapes = (lines: string[], n: number) => {
    // The drawing a commit shows (the store settles every line through the config search).
    let cur = findValidConfig(factsOf(lines)) ?? { facts: factsOf(lines), seed: 0 };
    const out = [shapeOf(replay(cur.facts, cur.seed))];
    for (let k = 0; k < n; k++) {
      const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
      expect(next, `press ${k + 1} finds another configuration`).not.toBeNull();
      expect(meetsRequirements(next!.facts, next!.seed), `press ${k + 1} meets every given`).toBe(true);
      cur = next!;
      out.push(shapeOf(replay(cur.facts, cur.seed)));
    }
    return out;
  };
  const TANGENT = ['נתון מעגל O שרדיוסו 5', 'מנקודה A הוציאו משיק למעגל בנקודה B', 'OA = 13'];

  it('the tangent point is a placement, C on OA a solution: the second solution is press 1, not press 2', () => {
    const s = pressShapes([...TANGENT, 'C על הקטע OA', 'BC = 4.8'], 3);
    expect(new Set(s).size).toBe(2);
    expect(s[1]).not.toBe(s[0]);
    expect(s[2]).toBe(s[0]);
    expect(s[3]).toBe(s[1]);
  });

  it('a figure whose only alternative is a mirror still reaches it: the tangent from A touches at either point', () => {
    const facts = factsOf(TANGENT);
    const next = searchAnotherView(facts, 0, undefined, Number.POSITIVE_INFINITY);
    expect(next).not.toBeNull();
    const [b0, b1] = [replay(facts, 0).positions.get('B')!, replay(next!.facts, next!.seed).positions.get('B')!];
    expect(shapeOf(replay(next!.facts, next!.seed))).toBe(shapeOf(replay(facts, 0)));
    // Another placement, not the drawing on the screen: B is reflected across OA (same shape, the point moved).
    const moved = Math.hypot(b0.x - b1.x, b0.y - b1.y) > 1e-6 || next!.seed !== 0;
    expect(moved).toBe(true);
  });

  it('control: a right triangle with two valid seats still alternates them (AB = 6 · BC = 8)', () => {
    const s = pressShapes(['משולש ישר זווית ABC', 'AB = 6', 'BC = 8'], 3);
    expect(new Set(s).size).toBe(2);
    for (let k = 1; k < s.length; k++) expect(s[k]).not.toBe(s[k - 1]);
  });
});
