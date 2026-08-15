/**
 * #496 + #317 — the query lane's two missing kinds: a bare POINT label and a PLANE.
 *
 * Operator (#496, 2026-08-10): *"on data panel, when A is declared, I would expect to see its values by
 * default, or at least when I enter A, it should understand what I want."* The asymmetry was stark — the
 * lane could answer «m» (a lowercase figure symbol, ADR-3D-119/#480) but a bare uppercase «A» fell
 * through every rule and died at `notUnderstood`, on figures where A is the more natural question.
 *
 * Operator (#317, 2026-07-25, exam part ב.2 «מצאו את משוואת המישור שעליו מונח הבסיס ABC»): the only
 * route to a plane's equation was entering «מישור ABC» as a FACT — which changes the figure in order to
 * ask a question about it.
 *
 * The discipline both share: answer through the derivation the ארגון נתונים panel already uses, never a
 * private formatter (the #481 lesson). The panel and the query must be incapable of disagreeing about
 * the same object — asserted directly below, not just intended.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { dataView } from '../engine/dataView';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, queries: [], lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (steps: string[]) => {
  reset();
  for (const u of steps) useGeo3.getState().submit(u);
  const st = useGeo3.getState();
  return { c: derive3(st.facts, st.seed).construction, seed: st.seed };
};
const ans = (steps: string[], q: string) => {
  const { c, seed } = build(steps);
  return answerQuery(c, q, seed);
};

/** Three injected points — translation is anchored, so coordinates and a plane equation are knowledge. */
const TRIANGLE = ['נתונה נקודה A(0,0,0)', 'נתונה נקודה B(4,0,0)', 'נתונה נקודה C(0,2,0)'];

describe('#496 — a bare POINT label answers its coordinates', () => {
  beforeEach(reset);

  it('«A» answers the coordinates the panel would print for A', () => {
    const { c, seed } = build(TRIANGLE);
    const r = answerQuery(c, 'A', seed);
    expect(r.answer).toBe(`A${dataView(c, seed).pointCoords['A'].text}`);
    expect(r.note).toBeUndefined();
  });

  it('every phrasing of the same question gives the same answer', () => {
    const { c, seed } = build(TRIANGLE);
    const expected = answerQuery(c, 'B', seed).answer;
    expect(expected).not.toBeNull();
    for (const q of ['שיעורי B', 'שיעורי של B', 'coordinates of B', 'B = ?']) {
      expect(answerQuery(c, q, seed).answer, q).toBe(expected);
    }
  });

  it('the query and the PANEL cannot disagree — every printed point matches its query', () => {
    const { c, seed } = build(TRIANGLE);
    const panel = dataView(c, seed).pointCoords;
    for (const id of Object.keys(panel)) {
      expect(answerQuery(c, id, seed).answer, id).toBe(`${id}${panel[id].text}`);
    }
  });

  it('an UNDETERMINED point refuses honestly — never a sampled coordinate dressed as a fact', () => {
    // a bare cube has no coordinate anchor: its vertices are gauge, so no coordinate is knowledge
    const r = ans(['קובייה'], 'A');
    expect(r.answer).toBeNull();
    expect(r.note).toBe('undetermined');
  });

  it('a letter that is not a point of THIS figure is not treated as one', () => {
    expect(ans(TRIANGLE, 'Z').answer).toBeNull();
    expect(ans(TRIANGLE, 'Z').note).toBe('notUnderstood');
  });

  it('the sibling lanes are untouched — a PAIR is still the vector query, not a point', () => {
    const r = ans(['קובייה', 'AB=u'], 'AB');
    expect(r.note).not.toBe('notUnderstood');
  });
});

describe('#317 — a PLANE answers its canonical equation', () => {
  beforeEach(reset);

  it('«מישור ABC» on an anchored figure answers the forced equation', () => {
    const r = ans(TRIANGLE, 'מישור ABC');
    expect(r.answer).toBe('z = 0');
  });

  it('the exam phrasing and the English mirror agree with it', () => {
    const { c, seed } = build(TRIANGLE);
    const expected = answerQuery(c, 'מישור ABC', seed).answer;
    for (const q of ['משוואת המישור ABC', 'plane ABC', 'equation of plane ABC']) {
      expect(answerQuery(c, q, seed).answer, q).toBe(expected);
    }
  });

  it('the run needs no DECLARATION — asking never changes the figure', () => {
    const { c, seed } = build(TRIANGLE);
    const before = c.pointPlanes.size;
    expect(answerQuery(c, 'מישור ABC', seed).answer).not.toBeNull();
    expect(derive3(useGeo3.getState().facts, seed).construction.pointPlanes.size).toBe(before);
  });

  it('a DECLARED plane answers exactly what the panel prints for it', () => {
    const { c, seed } = build([...TRIANGLE, 'המישור ABC']);
    const row = dataView(c, seed).planes.find((p) => p.startsWith('ABC: ') && !p.includes('x ='));
    expect(row).toBeDefined();
    expect(`ABC: ${answerQuery(c, 'מישור ABC', seed).answer}`).toBe(row);
  });

  it('an UNANCHORED figure refuses — a plane equation is gauge until translation is pinned (#315)', () => {
    const r = ans(['קובייה'], "מישור ABB'");
    expect(r.answer).toBeNull();
    expect(r.note).toBe('undetermined');
  });
});
