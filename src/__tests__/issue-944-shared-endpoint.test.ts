/**
 * #944 ([ADR-489](../../docs/06-decisions.md#adr-489)) — AN INTERSECTION AT THE CARRIERS' SHARED
 * ENDPOINT IS THE ANSWER, NOT A NEAR-MISS.
 *
 * Found while verifying #942's play case. The tool drew the one correct figure and, on the same screen,
 * told the student it might be contradictory:
 *
 * ```
 * משולש ABC
 * D = חיתוך AB ו-BC
 * ```
 *
 * The crossing of AB and BC *is* B, so D lands on B, the canvas writes «B=D» (ADR-486) and a blue notice
 * says they coincide — all correct. But `meetsRequirements` was false, so the input panel simultaneously
 * showed the amber «לא נמצאה תצורה שמקיימת את כל הדרישות יחד … בדקו את הנתון האחרון שהוזן». Two surfaces,
 * opposite claims.
 *
 * The failing conjunct was `intersectionsWithinSegments`, which requires a declared intersection to sit
 * strictly INSIDE both carriers by `WITHIN_MARGIN`. Two segments that share a vertex cross only at that
 * vertex, for every configuration — so no seed could ever satisfy it, the auto-resolver exhausted its
 * search, and the amber banner became permanent.
 *
 * The fix is a structural exemption, never a slackened margin: loosening `WITHIN_MARGIN` would re-admit
 * the near-collapse basin #569 exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, replayFacts } from './scenario-pipeline';
import { intersectionsWithinSegments, segmentsCrossWithin } from '@/replay/core';

const REPORTED = ['משולש ABC', 'D = חיתוך AB ו-BC'];

describe('#944 — the reported figure stops contradicting itself', () => {
  it('the figure builds, D lands on B, and the coincidence is surfaced', () => {
    const fig = replayFacts(factsOf(REPORTED));
    expect(fig.lastError, 'nothing failed').toBeNull();
    const B = fig.positions.get('B')!;
    const D = fig.positions.get('D')!;
    expect(Math.hypot(B.x - D.x, B.y - D.y), 'D IS B — the only answer').toBeLessThan(1e-6);
    expect(fig.coincidences, 'and the tool says so').toContainEqual(['B', 'D']);
  });

  it('the within-segment gate no longer refuses it — THE fix', () => {
    const fig = replayFacts(factsOf(REPORTED));
    // Anti-vacuity: the gate only means something if the figure actually carries the object it gates.
    // Measured shape: { kind: line-line-intersection, id: D, a: A, b: B, c: B, d: C, onSeg: true } —
    // the two carriers share B, which is the whole point.
    const gated = fig.construction.objects.filter(
      (o) => o.kind === 'line-line-intersection' && (o.onSeg || o.onSeg1 || o.onSeg2),
    );
    expect(gated, 'the figure carries exactly the object this predicate judges').toHaveLength(1);
    expect(
      intersectionsWithinSegments(fig),
      'AB and BC share B, so their crossing cannot be interior — the margin does not apply',
    ).toBe(true);
  });

  it('every fact is ok and the verifier is clean, so nothing warrants an amber banner', () => {
    const fig = replayFacts(factsOf(REPORTED));
    for (const [id, s] of Object.entries(fig.status)) expect(s, id).toBe('ok');
    expect(fig.violations, 'no violated given').toEqual([]);
  });
});

describe('#944 — the exemption is STRUCTURAL, not a wider tolerance', () => {
  it('an ordinary interior crossing is still gated exactly as before', () => {
    // Two segments that do NOT share an endpoint keep the full within-margin requirement — this is the
    // half that must not move, because it is what catches a crossing wandering off a segment's end.
    const fig = replayFacts(factsOf(['מרובע ABCD', 'E = חיתוך AC ו-BD']));
    expect(fig.lastError).toBeNull();
    expect(intersectionsWithinSegments(fig), 'a genuine interior crossing still passes').toBe(true);
    // …and the gate is still capable of refusing: asked with an impossible margin it says no, which
    // proves the predicate is still doing work on this figure rather than being short-circuited.
    expect(intersectionsWithinSegments(fig, 0.49), 'the margin still bites on a non-shared crossing').toBe(false);
  });

  it('the shared-endpoint case is exempt at ANY margin — it is not a tolerance question', () => {
    const fig = replayFacts(factsOf(REPORTED));
    expect(intersectionsWithinSegments(fig, 0.49), 'structural, so the margin is irrelevant').toBe(true);
  });

  it('the ADR-123 control still behaves: a forced coincidence keeps its figure', () => {
    // The kite whose forced coincidence was always allowed — it never went through this gate, and must
    // be untouched by the change.
    const fig = replayFacts(factsOf(['משולש ABC']));
    expect(fig.lastError).toBeNull();
    expect(intersectionsWithinSegments(fig)).toBe(true);
  });
});

describe('#944 — the sibling predicate got the same sweep', () => {
  it('a point-free crossing statement over two segments that share a vertex is exempt too', () => {
    // `segmentsCrossWithin` asks the identical question without a named point, so it had the identical
    // defect. Fixing only the reported predicate would have left the same class one utterance away.
    const facts = factsOf(['משולש ABC']);
    const fig = replayFacts(facts);
    const shared = [
      { id: 'x', group: 'x', utterance: 'AB חותך את BC', enabled: true, cmd: { type: 'segments-cross', a: 'A', b: 'B', c: 'B', d: 'C' } },
    ] as unknown as typeof facts;
    expect(
      segmentsCrossWithin(shared, fig.positions),
      'AB and BC share B — the same structural exemption',
    ).toBe(true);
  });

  it('and a NON-shared point-free crossing is still judged', () => {
    const facts = factsOf(['מרובע ABCD']);
    const fig = replayFacts(facts);
    const crossing = [
      { id: 'x', group: 'x', utterance: 'AC חותך את BD', enabled: true, cmd: { type: 'segments-cross', a: 'A', b: 'C', c: 'B', d: 'D' } },
    ] as unknown as typeof facts;
    expect(segmentsCrossWithin(crossing, fig.positions), 'the diagonals genuinely cross inside').toBe(true);
    expect(segmentsCrossWithin(crossing, fig.positions, 0.49), 'and the margin still bites').toBe(false);
  });
});
