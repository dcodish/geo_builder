import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs tool script; there are no types to import and none are wanted.
import { judgeCapture, APPS, BYTE_FLOOR, UNIFORM_SHARE, COLOR_FLOOR } from '../visual-smoke.mjs';

/**
 * #704 — the visual smoke harness.
 *
 * The harness's own value depends on one thing: that it FAILS on a capture that is not real evidence.
 * A gate that always passes is worse than no gate, because it launders "I looked at it" into the
 * readiness report. These lock the judgement, which is why it was split out as a pure function —
 * the browser produces the measurements, this decides what they mean.
 */
describe('#704 visual smoke — the capture verdict', () => {
  const good = { bytes: 120_000, dominantShare: 0.42, distinctColors: 190 };

  it('accepts a real screenshot', () => {
    expect(judgeCapture('2d/01-empty.png', good)).toBeNull();
  });

  it('REJECTS a blank capture — the failure mode the gate exists for', () => {
    const verdict = judgeCapture('2d/01-empty.png', { ...good, dominantShare: 1 });
    expect(verdict).toContain('BLANK');
    expect(verdict).toContain('2d/01-empty.png');
  });

  it('rejects a page that painted almost nothing, not only a perfectly uniform one', () => {
    // A white page with a single stray glyph is still "did not render" — the threshold is a share,
    // not an equality, precisely so a lone antialiased pixel cannot buy a pass.
    expect(judgeCapture('x.png', { ...good, dominantShare: UNIFORM_SHARE })).toContain('BLANK');
    expect(judgeCapture('x.png', { ...good, dominantShare: UNIFORM_SHARE - 0.01 })).toBeNull();
  });

  it('REJECTS a near-uniform capture on colour count, where the share alone would pass', () => {
    // Calibration, not a guess: the sparsest legitimate capture (an empty-state screenshot) measures
    // dominantShare 0.979 — only 1.6 points under the share threshold. distinctColors separates a
    // real page (81+) from a blank one (1-3) by an order of magnitude, so both conditions must hold.
    const nearlyBlank = { bytes: 60_000, dominantShare: 0.99, distinctColors: 2 };
    expect(judgeCapture('x.png', nearlyBlank)).toContain('BLANK');
    expect(judgeCapture('x.png', { ...nearlyBlank, distinctColors: COLOR_FLOOR })).toBeNull();
  });

  it('rejects a truncated file', () => {
    expect(judgeCapture('x.png', { ...good, bytes: BYTE_FLOOR - 1 })).toContain('not a real screenshot');
  });

  it('rejects an undecodable capture, and a missing measurement entirely', () => {
    expect(judgeCapture('x.png', { error: 'decode failed' })).toContain('unreadable');
    expect(judgeCapture('x.png', undefined)).toContain('unreadable');
  });

  it('never passes a capture it could not measure — no measurement is a failure, not a skip', () => {
    // The trap this closes: an audit that returns {} for a file it failed to read, which then
    // satisfies every threshold check by being NaN-comparison-false and silently passes.
    expect(judgeCapture('x.png', {})).not.toBeNull();
    expect(judgeCapture('x.png', { bytes: undefined, dominantShare: undefined })).not.toBeNull();
  });
});

describe('#704 visual smoke — the product sequences', () => {
  it('covers all three shipped products', () => {
    expect(Object.keys(APPS).sort()).toEqual(['2d', '3d', 'complex']);
  });

  it('drives every product with a real, non-empty Hebrew sequence', () => {
    for (const [id, spec] of Object.entries(APPS) as [string, { urlPath: string; inputHint: string; sequence: string[] }][]) {
      expect(spec.sequence.length, `${id} has no sequence`).toBeGreaterThan(0);
      expect(spec.inputHint, `${id} has no input hint`).toBeTruthy();
      expect(spec.urlPath.startsWith('/'), `${id} urlPath must be server-relative`).toBe(true);
    }
  });

  it('keeps the 2-D sequence on the defining interaction — shape, point-on-object, constraint', () => {
    // CLAUDE.md's own example. If this drifts to something that does not exercise a 1-DOF
    // point-on-object plus a constraint that moves it, the smoke stops covering the thing the
    // product IS.
    expect(APPS['2d'].sequence).toEqual(['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37']);
  });

  it('keeps the complex sequence on the enumerated-roots case (#701) — the worst labelling load', () => {
    expect(APPS.complex.sequence).toContain('z^5 = w^2');
  });
});
