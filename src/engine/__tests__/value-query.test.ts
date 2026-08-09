/**
 * #477 — the values-panel QUERY lane: the student names a quantity and gets it back WHEN IT IS KNOWLEDGE.
 *
 * The 3-D lane (ADR-3D-057, #274) ported as a pattern. Two invariants carry the whole feature, and both
 * are asserted here rather than assumed:
 *
 *  1. **A query is a question, never a fact** — it must not enter `replay`, move a point, or appear in
 *     the step list. Asked of the STORE, because that is the only place the distinction can be violated.
 *  2. **An answer is only ever knowledge.** An angle is scale-free, so it answers whenever the shape is
 *     determined; a length/area carries units, so under a free similarity gauge it is refused (`scale`)
 *     unless the student declared their own unit (#427). Anything else says WHY (ADR-052).
 *
 * The operator's own case is the headline: `∠GBC` on the square figure, a wedge nothing enumerates,
 * whose value is forced at 53° by the stated 37° — the question #476 was raised for.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseValueQuery } from '@/parser/valueQuery';
import { computeValues } from '@/replay/core';
import { buildParseCtx, parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

const factsFrom = (utterances: string[]): Fact[] => {
  const facts: Fact[] = [];
  utterances.forEach((u, g) => {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${g}.${facts.length}`, utterance: u, group: `g${g}`, cmd, enabled: true });
  });
  return facts;
};
const ask = (steps: string[], texts: string[]) =>
  computeValues(factsFrom(steps), texts.map((text) => ({ text, q: parseValueQuery(text) }))).queryRows;

const SQUARE = ['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37'];

describe('#477 — parsing a query', () => {
  it.each([
    ['∠GBC', { kind: 'angle', vertex: 'B', ray1: 'G', ray2: 'C' }],
    ['זווית GBC', { kind: 'angle', vertex: 'B', ray1: 'G', ray2: 'C' }],
    ['angle GBC', { kind: 'angle', vertex: 'B', ray1: 'G', ray2: 'C' }],
    ['<GBC', { kind: 'angle', vertex: 'B', ray1: 'G', ray2: 'C' }], // the ADR-381 fold reaches the query too
    ['AB', { kind: 'length', a: 'A', b: 'B' }],
    ['|AB|', { kind: 'length', a: 'A', b: 'B' }],
    ['שטח ABC', { kind: 'area', ids: ['A', 'B', 'C'] }],
    ['היקף ABCD', { kind: 'perimeter', ids: ['A', 'B', 'C', 'D'] }],
  ])('%s', (text, expected) => {
    expect(parseValueQuery(text)).toEqual(expected);
  });

  it('refuses rather than guessing — silence beats a wrong answer to a question', () => {
    // A wrong answer about a figure is indistinguishable from a fact, so nothing may fall through to
    // "probably a length". Degenerate references are refused for the same reason: each would otherwise
    // produce a confident 0 or NaN.
    for (const text of ['', 'hello', 'ריבוע ABCD', '∠AA B', '∠ABA', 'AA', 'שטח AB', 'שטח ABA']) {
      expect(parseValueQuery(text), text).toBeNull();
    }
  });
});

describe('#477 — a query is a QUESTION, never a fact', () => {
  beforeEach(() => useGeoStore.getState().clear());

  it('asking adds no fact, no step and no point', () => {
    const st = useGeoStore.getState();
    for (const u of SQUARE) {
      const { construction, positions } = replay(st.facts);
      const r = parse(u, buildParseCtx(construction, positions));
      if (!r.ok) throw new Error(u);
      useGeoStore.getState().executeMany(r.commands, u);
    }
    const before = useGeoStore.getState().facts;
    useGeoStore.getState().addQuery('∠GBC');
    const after = useGeoStore.getState();
    expect(after.facts, 'the fact list is untouched').toBe(before);
    expect(after.queries).toEqual(['∠GBC']);
  });

  it('the same question twice is one entry, and removing it leaves none', () => {
    useGeoStore.getState().addQuery('∠GBC');
    useGeoStore.getState().addQuery('  ∠GBC  ');
    expect(useGeoStore.getState().queries).toEqual(['∠GBC']);
    useGeoStore.getState().removeQuery('∠GBC');
    expect(useGeoStore.getState().queries).toEqual([]);
  });
});

describe('#477 — answered only when it is knowledge', () => {
  it("the operator's case: «∠GBC» is forced at 53° by the stated 37°", () => {
    const [row] = ask(SQUARE, ['∠GBC']);
    expect(row.note, 'it is determined, so no refusal').toBeUndefined();
    expect(row.value).toBeCloseTo(53, 6);
    expect(row.label).toBe('∠GBC');
  });

  it('the STATED angle answers as itself', () => {
    expect(ask(SQUARE, ['∠GBA'])[0].value).toBeCloseTo(37, 6);
  });

  it('a length on a scale-free figure is refused, not guessed', () => {
    // The square has no size given, so |AB| is only this drawing's scale — printing it would assert a
    // size the question never gave (ADR-052). This is the row lane's #426 discipline, held by the query.
    const [row] = ask(SQUARE, ['AB']);
    expect(row.value).toBeNull();
    expect(row.note).toBe('scale');
  });

  it('…and answers once a size IS given', () => {
    // Tolerance 4, not 6: this figure is DRIVEN (G slides until ∠GBA = 37), so |AB| lands within the
    // solver's own convergence tolerance rather than on an exact 6. Asserting tighter would be
    // asserting the solver's luck, not the behaviour under test.
    const [row] = ask([...SQUARE, 'AB = 6'], ['AB']);
    expect(row.value).toBeCloseTo(6, 4);
    expect(row.note).toBeUndefined();
  });

  it('an unknown point is reported as such, never as undetermined', () => {
    const [row] = ask(SQUARE, ['∠GBZ']);
    expect(row.note).toBe('unavailable');
  });

  it('unparseable text says so', () => {
    const [row] = ask(SQUARE, ['שלום']);
    expect(row.note).toBe('not-understood');
    expect(row.label).toBeNull();
    expect(row.text, 'the question is echoed verbatim').toBe('שלום');
  });

  it('an UNDETERMINED angle is refused — a sampled number is never dressed as a fact', () => {
    // A bare triangle pins nothing: ∠ABC differs across sampled configurations.
    const [row] = ask(['משולש ABC'], ['∠ABC']);
    expect(row.value).toBeNull();
    expect(row.note).toBe('undetermined');
  });

  it('the answer agrees with the auto row for the same quantity — one pool, one truth', () => {
    // The point of computing queries inside `computeValuesPanel`: a second call could disagree with the
    // list printed directly above it, which is worse than not answering.
    const res = computeValues(factsFrom(SQUARE), [{ text: '∠ABC', q: parseValueQuery('∠ABC') }]);
    const auto = res.rows.find((r) => r.kind === 'angle' && r.label === '∠ABC');
    expect(auto, 'the square corner is an auto row').toBeTruthy();
    expect(res.queryRows[0].value).toBeCloseTo(auto!.value, 9);
  });
});
