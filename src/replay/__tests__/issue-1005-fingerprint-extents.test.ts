import { describe, it, expect } from 'vitest';
import { replay, searchResample } from '@/replay/core';
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
