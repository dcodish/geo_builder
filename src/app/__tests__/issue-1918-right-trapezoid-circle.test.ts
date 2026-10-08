/**
 * #1918 ([ADR-607](../../../docs/06-decisions.md#adr-607)) — a circle through a ring DECLARED a right trapezoid is
 * refused in either order, naming both statements (operator ruling 2026-10-08, "Refuse in both").
 *
 * Measured on `main` @ 5edeeca1 through `decideDeterministic2D`:
 *  - «טרפז ישר זווית ABCD» · «ABCD חסום במעגל» COMMITTED and drew a rectangle with the amber `figure.v.trapezoidMorph`;
 *  - the reverse order refused with "'C' is already defined — …", which names no statement;
 *  - the one-line «טרפז ישר זווית ABCD חסום במעגל» was already refused (`input.inscribedContradictsNoun`, ADR-595).
 *
 * Class: the not-cyclic check read the noun and the circle only inside ONE sentence. The engine now records the
 * declared phrase (`declared-shape`) and a stage-0 prover refuses the circle (or the noun) whichever comes second.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { decideDeterministic2D } from '../decideDeterministic';
import { otherUtteranceForError, utteranceForError } from '../errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { refreshLoadedFigure } from '@/store/loadAudit';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { humanizeError } from '@/i18n/humanizeError';
import { lowerShape, readShapePhrase } from '@/parser/shapePhrase';
import { applyCommand } from '@/engine/apply';
import { notCyclicImpossibility } from '@/engine/cyclicFeasibility';
import { NOT_CYCLIC, type Command, type Construction } from '@/engine';
import { checkGivens } from '@/engine/verify';
import type { Fact } from '@/replay/core';

type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function decide(prefix: string[], line: string): Promise<Verdict> {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const locale = /[א-ת]/.test(line) ? 'he' : 'en';
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** The refusal exactly as the input note renders it (submitPipeline's `noteText`), in `lng`. */
function rendered(v: Verdict, line: string, lng: 'he' | 'en'): string {
  expect(v.kind).toBe('refuse');
  if (v.kind !== 'refuse' || !('explain' in v.note)) throw new Error(JSON.stringify(v));
  const t = i18n.getFixedT(lng) as (k: string, o?: Record<string, unknown>) => string;
  return plain(humanizeError(v.note.explain, t, line, otherUtteranceForError(useGeoStore.getState().facts, v.note.explain)));
}

/** The text without the bidi isolates the Hebrew locale wraps Latin runs in. */
const plain = (s: string) => s.replace(/[\u2066-\u2069]/g, '');

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const HE_REASON = 'הסיבה: מעגל שעובר דרך ארבעת הקודקודים הופך טרפז ישר זווית למלבן, ומלבן אינו טרפז ישר זווית.';
const EN_REASON = 'The reason: a circle through the four vertices would make a right trapezoid a rectangle, and a rectangle is not a right trapezoid.';

describe('#1918 — the reported pair, both orders, the exact words', () => {
  it('«טרפז ישר זווית ABCD» · «ABCD חסום במעגל» — the circle line is refused naming the noun line', async () => {
    const v = await decide(['טרפז ישר זווית ABCD'], 'ABCD חסום במעגל');
    expect(rendered(v, 'ABCD חסום במעגל', 'he')).toBe(`לא ניתן: «ABCD חסום במעגל» סותר את «טרפז ישר זווית ABCD» — אי אפשר לקיים את שניהם יחד. ${HE_REASON}`);
    expect(rendered(v, 'ABCD חסום במעגל', 'en')).toBe(`Can't do that: «ABCD חסום במעגל» contradicts «טרפז ישר זווית ABCD» — they can't both hold. ${EN_REASON}`);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('«ABCD חסום במעגל» · «טרפז ישר זווית ABCD» — the noun line is refused naming the circle line, never "already defined"', async () => {
    const v = await decide(['ABCD חסום במעגל'], 'טרפז ישר זווית ABCD');
    expect(JSON.stringify(v)).not.toMatch(/already defined/);
    expect(rendered(v, 'טרפז ישר זווית ABCD', 'he')).toBe(`לא ניתן: «טרפז ישר זווית ABCD» סותר את «ABCD חסום במעגל» — אי אפשר לקיים את שניהם יחד. ${HE_REASON}`);
    expect(rendered(v, 'טרפז ישר זווית ABCD', 'en')).toBe(`Can't do that: «טרפז ישר זווית ABCD» contradicts «ABCD חסום במעגל» — they can't both hold. ${EN_REASON}`);
  });

  it('English input, both orders', async () => {
    const v1 = await decide(['right trapezoid ABCD'], 'ABCD is inscribed in a circle');
    expect(rendered(v1, 'ABCD is inscribed in a circle', 'en')).toBe(`Can't do that: «ABCD is inscribed in a circle» contradicts «right trapezoid ABCD» — they can't both hold. ${EN_REASON}`);
    useGeoStore.getState().clear();
    const v2 = await decide(['ABCD is inscribed in a circle'], 'right trapezoid ABCD');
    expect(rendered(v2, 'right trapezoid ABCD', 'en')).toBe(`Can't do that: «right trapezoid ABCD» contradicts «ABCD is inscribed in a circle» — they can't both hold. ${EN_REASON}`);
  });
});

describe('#1918 — every inscription spelling the grammar reads, either order', () => {
  // the circle SECOND: every spelling that reads on a declared ring (a ring's letters in another order are the same ring)
  it.each(['ABCD חסום במעגל', 'ABCD חסום במעגל O', 'מעגל חוסם את ABCD', 'מעגל חוסם את BCDA', 'ABCD בר חסימה', 'ABCD is inscribed in a circle', 'a circle circumscribes ABCD', 'ABCD is cyclic'])(
    '«טרפז ישר זווית ABCD» · «%s» is refused naming the noun line',
    async (line) => {
      const v = await decide(['טרפז ישר זווית ABCD'], line);
      const lng = /[א-ת]/.test(line) ? 'he' : 'en';
      const text = rendered(v, line, lng);
      expect(text).toContain(`«${line}»`);
      expect(text).toContain('«טרפז ישר זווית ABCD»');
      expect(text).toContain(lng === 'he' ? HE_REASON : EN_REASON);
    },
  );
  // the circle FIRST: every spelling that reads on a fresh ring (the «מעגל חוסם את ABCD» forms need a drawn ring)
  it.each([
    ['ABCD חסום במעגל', 'טרפז ישר זווית ABCD'],
    ['ABCD חסום במעגל', 'טרפז ישר זווית BCDA'],
    ['המרובע ABCD חסום במעגל', 'טרפז ישר זווית ABCD'],
    ['ABCD בר חסימה', 'טרפז ישר זווית ABCD'],
    ['ABCD is inscribed in a circle', 'right trapezoid ABCD'],
    ['ABCD is cyclic', 'right trapezoid ABCD'],
  ])('«%s» · «%s» is refused naming the circle line', async (first, line) => {
    const v = await decide([first], line);
    const lng = /[א-ת]/.test(line) ? 'he' : 'en';
    const text = rendered(v, line, lng);
    expect(text).toContain(`«${line}»`);
    expect(text).toContain(`«${first}»`);
    expect(text).toContain(lng === 'he' ? HE_REASON : EN_REASON);
  });
});

describe('#1918 — a saved figure with both lines shows the row refused on load', () => {
  it('the old lowering (no `kind`) is re-lowered on load and the circle row fails, naming the noun line', () => {
    const saved: Fact[] = [
      { id: 'a1', cmd: { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }, utterance: 'טרפז ישר זווית ABCD', group: 'g1', enabled: true },
      { id: 'a2', cmd: { type: 'set-perpendicular', a: 'A', b: 'D', c: 'A', d: 'B' }, utterance: 'טרפז ישר זווית ABCD', group: 'g1', enabled: true },
      { id: 'b1', cmd: { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C' }, utterance: 'ABCD חסום במעגל', group: 'g2', enabled: true },
      { id: 'b2', cmd: { type: 'set-concyclic', points: ['A', 'B', 'C', 'D'] }, utterance: 'ABCD חסום במעגל', group: 'g2', enabled: true },
      { id: 'b3', cmd: { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }, utterance: 'ABCD חסום במעגל', group: 'g2', enabled: true },
    ] as Fact[];
    expect(replay(saved, 0).lastError, 'today the saved pair builds (the amber rectangle)').toBeNull();
    const { facts } = refreshLoadedFigure(saved);
    const r = replay(facts, 0);
    expect(r.lastError).toMatch(/^over-constrained: a circle through the vertices of right-trapezoid ABCD forces a rectangle cannot hold \[vs #0\]$/);
    const t = i18n.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string;
    expect(plain(humanizeError(r.lastError, t, utteranceForError(facts, r.status, r.lastError), otherUtteranceForError(facts, r.lastError)))).toBe(
      `לא ניתן: «ABCD חסום במעגל» סותר את «טרפז ישר זווית ABCD» — אי אפשר לקיים את שניהם יחד. ${HE_REASON}`,
    );
    expect(facts.filter((f) => f.group === 'g1').every((f) => r.status[f.id] === 'ok'), 'the noun line stays green').toBe(true);
  });
});

describe('#1918 — unchanged neighbours', () => {
  it('the one-line sentence keeps its own refusal (ADR-595)', async () => {
    const v = await decide([], 'טרפז ישר זווית ABCD חסום במעגל');
    expect(v.kind).toBe('refuse');
    if (v.kind === 'refuse') expect(v.note).toMatchObject({ key: 'input.inscribedContradictsNoun' });
  });

  it.each(['טרפז ABCD', 'טרפז שווה שוקיים ABCD'])('«%s» · «ABCD חסום במעגל» still commits', async (noun) => {
    const v = await decide([noun], 'ABCD חסום במעגל');
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
  });

  it('a trapezoid forced into a rectangle by an ANGLE and then a circle keeps the amber warning (not a declaration)', () => {
    const { refused } = driveThroughGate(['טרפז ABCD', 'זווית DAB = 90', 'ABCD חסום במעגל']);
    expect(refused).toEqual([]);
    const st = useGeoStore.getState();
    const f = replay(st.facts, 0);
    expect(f.lastError).toBeNull();
    const v = checkGivens(st.facts.map((x) => x.cmd as Command), f.positions, f.circles, f.construction);
    expect(v.map((x) => x.messageKey)).toContain('figure.v.trapezoidMorph');
  });
});

describe('#1918 — the prover, structurally', () => {
  const build = (...cmds: Command[]): Construction => cmds.reduce<Construction>((c, cmd) => applyCommand(c, cmd), { objects: [], constraints: [] });
  const RIGHT: Command = { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'], kind: 'right-trapezoid' };

  it('the parser and the engine read ONE not-cyclic table', () => {
    expect(readShapePhrase('טרפז ישר זווית')?.cyclic).toEqual({ forces: NOT_CYCLIC['right-trapezoid'] });
    expect(lowerShape('right-trapezoid', ['A', 'B', 'C', 'D'])[0]).toEqual(RIGHT);
    expect(lowerShape('isosceles-trapezoid', ['A', 'B', 'C', 'D'])[0]).toEqual({ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }); // cyclic: no stamp
  });

  it('a stated concyclicity over the ring (any vertex order) is a hit', () => {
    const c = build(RIGHT, { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'B', b: 'C', c: 'D' }, { type: 'set-concyclic', points: ['B', 'C', 'D', 'A'] });
    expect(notCyclicImpossibility(c)).toEqual({ ring: ['A', 'B', 'C', 'D'], shape: 'right-trapezoid', forced: 'rectangle' });
  });

  it('four riders on one circle, then the declaration (the reverse order), is a hit', () => {
    const circle: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 5 };
    const on = (id: string, theta: number): Command => ({ type: 'point-on-circle', id, circle: 'circle-O', theta });
    const c = build(circle, on('A', 0.5), on('B', 1.8), on('C', 3.4), on('D', 5.1));
    expect(notCyclicImpossibility(applyCommand(c, RIGHT), RIGHT)).not.toBeNull();
  });

  it('no declaration, a cyclic phrase, or three vertices on the circle — no hit', () => {
    const circum: Command = { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C' };
    const cyc: Command = { type: 'set-concyclic', points: ['A', 'B', 'C', 'D'] };
    expect(notCyclicImpossibility(build({ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }, circum, cyc))).toBeNull();
    expect(notCyclicImpossibility(build(RIGHT, circum))).toBeNull();
  });
});
