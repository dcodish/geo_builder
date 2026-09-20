/**
 * #944 ([ADR-489](../../docs/06-decisions.md#adr-489)), **REVERSED 2026-09-20 by the operator's ruling in
 * [#1274](https://github.com/dcodish/geo_builder/issues/1274) ([ADR-531](../../docs/06-decisions.md#adr-531))**.
 *
 * The original report (2026-09-08): the tool drew
 *
 * ```
 * משולש ABC
 * D = חיתוך AB ו-BC
 * ```
 *
 * correctly — the crossing of `AB` and `BC` IS `B`, so `D` landed on `B`, the canvas wrote «B=D» and a blue
 * notice said they coincide — and the input panel simultaneously showed «לא נמצאה תצורה שמקיימת את כל
 * הדרישות יחד … בדקו את הנתון האחרון שהוזן». Two surfaces, opposite claims. ADR-489 resolved that
 * contradiction by BLESSING the drawing: `intersectionsWithinSegments` gained a structural exemption for
 * carriers that share an endpoint, and this file asserted, positively, that `D` is minted at `B`.
 *
 * Asked the same question again under the cross-product coincidence ruling
 * ([ADR-W-066](../../docs/06w-decisions-workspace.md#adr-w-066)), the operator ruled the other way:
 * ***"we refuse the B=D"***. The contradiction is now resolved from the other end — there is no second
 * point, so no two surfaces can disagree about it. The sentence is refused at the parser, naming `B`.
 *
 * **What this file locks now**, and why it is not simply deleted:
 *
 * 1. The reported sequence produces the REFUSAL and mints nothing (the student-facing half; the full
 *    refusal surface — note, no commit, no paid call — is `app/__tests__/issue-1274-crossing-already-named`).
 * 2. **ADR-489's engine exemption STAYS, because it is still reachable.** No sentence can build a
 *    shared-carrier crossing any more, but `rename` and `merge` can drive two carriers onto one letter
 *    AFTER the crossing exists, and the margin rule would then flag a structurally exact intersection.
 *    So the predicate is locked here at the unit level, on a construction assembled directly — the same
 *    technique the `segmentsCrossWithin` block below has always used — rather than through an utterance
 *    the parser now refuses. Deleting the exemption because its old entry sentence is gone would leave a
 *    real figure flagged amber for good, which is the defect #944 was filed for.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, replayFacts } from './scenario-pipeline';
import { parse } from '@/parser';
import { ctxOf } from './scenario-pipeline';
import { intersectionsWithinSegments, segmentsCrossWithin } from '@/replay/core';

const REPORTED = ['משולש ABC', 'D = חיתוך AB ו-BC'];

/** The figure ADR-489 judges, built WITHOUT the parser — the engine shape a rename or a merge can still
 *  produce once the crossing exists. `onSeg` is what `cross` emitted for two bare carriers. */
const sharedCarrierFigure = () => {
  const facts = factsOf(['משולש ABC']);
  const injected = [
    ...facts,
    {
      id: 'x1',
      group: 'x',
      utterance: '(injected) the crossing of AB and BC, as a rename or merge can leave it',
      enabled: true,
      cmd: { type: 'line-line-intersection', id: 'D', a: 'A', b: 'B', c: 'B', d: 'C', onSeg: true },
    },
  ] as unknown as typeof facts;
  return replayFacts(injected);
};

describe('#944 — the reported sentence is now REFUSED, not drawn twice over', () => {
  it('the operator’s sequence refuses, naming B — ADR-531 reversing ADR-489', () => {
    const r = parse(REPORTED[1], ctxOf(factsOf([REPORTED[0]])));
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: 'crossing-already-named', holder: 'B', id: 'D' });
  });

  it('so no second point is minted at B, and there is no coincidence left to announce', () => {
    // The step never becomes a fact, so the figure is the triangle alone.
    const fig = replayFacts(factsOf([REPORTED[0]]));
    expect(fig.positions.has('D')).toBe(false);
    expect(fig.coincidences).toEqual([]);
    expect(fig.lastError).toBeNull();
  });
});

describe('#944 — ADR-489’s engine exemption stands, because rename and merge can still reach it', () => {
  it('a crossing at the carriers’ shared endpoint is exempt from the within-margin rule', () => {
    const fig = sharedCarrierFigure();
    // Anti-vacuity: the predicate only means something if the figure carries the object it judges.
    const gated = fig.construction.objects.filter(
      (o) => o.kind === 'line-line-intersection' && (o.onSeg || o.onSeg1 || o.onSeg2),
    );
    expect(gated, 'the figure carries exactly the object this predicate judges').toHaveLength(1);
    expect(
      intersectionsWithinSegments(fig),
      'AB and BC share B, so their crossing cannot be interior — the margin does not apply',
    ).toBe(true);
  });

  it('and it is STRUCTURAL, not a wider tolerance — exempt at ANY margin', () => {
    expect(intersectionsWithinSegments(sharedCarrierFigure(), 0.49), 'structural, so the margin is irrelevant').toBe(true);
  });

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

  it('the ADR-123 control still behaves: a forced coincidence keeps its figure', () => {
    const fig = replayFacts(factsOf(['משולש ABC']));
    expect(fig.lastError).toBeNull();
    expect(intersectionsWithinSegments(fig)).toBe(true);
  });
});

describe('#944 — the sibling predicate got the same sweep', () => {
  it('a point-free crossing statement over two segments that share a vertex is exempt too', () => {
    // `segmentsCrossWithin` asks the identical question without a named point, so it had the identical
    // defect. Fixing only the reported predicate would have left the same class one utterance away.
    // Unaffected by ADR-531: a point-free «AB חותך את BC» names no new letter, so the coincidence ruling
    // has nothing to refuse — which is exactly why this half keeps its original construction.
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
