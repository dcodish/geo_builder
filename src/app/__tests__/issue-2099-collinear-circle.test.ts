/**
 * #2099 ([ADR-651](../../../docs/06-decisions.md#adr-651)) — A CIRCLE THROUGH THREE POINTS THE GIVENS PUT ON ONE LINE
 * IS REFUSED, NAMING THE STATEMENT THAT PUT THEM THERE.
 *
 * Operator ruling, 2026-10-14 (the analytic frame applies to 2-D, for the green rows and the half-English rows alike):
 * «לא ניתן: «מעגל שעובר דרך A, D ו-B» סותר את «D על הישר AB» — אי אפשר לקיים את שניהם יחד. הסיבה: A, D ו-B על ישר
 * אחד, ואין מעגל שעובר דרך שלוש נקודות על ישר אחד.»
 *
 * Measured on `main` @ 939b160a through `decideDeterministic2D` + the real gate (`driveThroughGate`), seed 0:
 *   «משולש ABC» · «D על הישר AB» · «מעגל שעובר דרך A, D ו-B»   → commit green, centre (23570838, 26189817), r 3.5e7
 *   the same with «מעגל חוסם את המשולש ADB», after «קטע AB», with two line riders, and circle-FIRST then «D על הישר AB»
 *   or «D אמצע AB»                                              → commit green, the same absurd centre
 *   «D על AB» / «D על המשך AB» / «M אמצע AB» / two segment riders / circle first then «D על AB»
 *                                                              → refused «cannot construct O: A, D, B are על ישר אחד (no …)»
 *   «AB = 5» · «נקודה D» · circle · «AD = 2» · «DB = 3»         → commit green, centre at ~2000 (the length givens force it)
 *
 * One stage-0 prover over the CONSTRUCTION (`collinearCircleImpossibility`), the fold's existing drop-one search naming
 * the other side, one humanised sentence — and a scale-free backstop in `circumcenter` for anything numeric.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { circumcenter, CIRCUMCIRCLE_FLATNESS_FLOOR } from '@/engine/geometry';
import { COLLINEAR_CIRCLE_VS, collinearCircleError, collinearCircleImpossibility } from '@/engine/cyclicFeasibility';
import { threeOnOneLine } from '@/engine/structure';
import { applyCommand, emptyConstruction } from '@/engine';
import type { Command, Construction } from '@/engine';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** The deterministic verdict on `line` after `prefix` has been driven through the real gate, and its rendered note. */
async function decide(prefix: string[], line: string, t: Translate = he, lang: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lang);
  const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
  const said = raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null;
  return { v, raw, said };
}

const ruled = (line: string, other: string, a: string, b: string, c: string) =>
  `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${a}, ${b} ו-${c} על ישר אחד, ואין מעגל שעובר דרך שלוש נקודות על ישר אחד.`;

describe('#2099 — the class is refused at the door with the ruled sentence, naming the conflicting statement', () => {
  it.each([
    // [prefix, line, the other statement, the three points as the circle names them]
    [['משולש ABC', 'D על הישר AB'], 'מעגל שעובר דרך A, D ו-B', 'D על הישר AB', ['A', 'D', 'B']], // the reported row (was green)
    [['משולש ABC', 'D על הישר AB'], 'מעגל חוסם את המשולש ADB', 'D על הישר AB', ['A', 'D', 'B']], // circumscribed (was green)
    [['משולש ABC', 'D על הישר AB'], 'המשולש ADB חסום במעגל', 'D על הישר AB', ['A', 'D', 'B']],
    [['קטע AB', 'D על הישר AB'], 'מעגל שעובר דרך A, D ו-B', 'D על הישר AB', ['A', 'D', 'B']], // (was green)
    [['משולש ABC', 'D על AB'], 'מעגל שעובר דרך A, D ו-B', 'D על AB', ['A', 'D', 'B']], // (was half-English)
    [['משולש ABC', 'D על AB'], 'מעגל שעובר דרך D, A ו-B', 'D על AB', ['D', 'A', 'B']], // letters reordered
    [['משולש ABC', 'D על המשך AB'], 'מעגל שעובר דרך A, D ו-B', 'D על המשך AB', ['A', 'D', 'B']],
    [['משולש ABC', 'M אמצע AB'], 'מעגל שעובר דרך A, M ו-B', 'M אמצע AB', ['A', 'M', 'B']],
    [['משולש ABC', 'D על AB'], 'מעגל חוסם את המשולש ADB', 'D על AB', ['A', 'D', 'B']],
    [['משולש ABC', 'D על AB', 'E על AB'], 'מעגל שעובר דרך A, D ו-E', 'E על AB', ['A', 'D', 'E']], // two riders: the newest is named
    [['משולש ABC', 'D על הישר AB', 'E על הישר AB'], 'מעגל שעובר דרך D, E ו-B', 'E על הישר AB', ['D', 'E', 'B']], // (was green)
  ])('%j then «%s» → refused, «…» סותר את «%s»', async (prefix, line, other, [a, b, c]) => {
    const { v, raw, said } = await decide(prefix as string[], line as string);
    expect(v.kind, 'refused before it becomes a fact').toBe('refuse');
    expect(raw).toMatch(COLLINEAR_CIRCLE_VS);
    expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
    expect(said).toBe(ruled(line as string, other as string, a, b, c));
  });

  it.each([
    ['D על AB', 'D על AB'],
    ['D על הישר AB', 'D על הישר AB'], // was green
    ['D אמצע AB', 'D אמצע AB'], // was green
  ])('the circle FIRST, then «%s» → the incidence is refused, naming the circle', async (line) => {
    const { v, said } = await decide(['משולש ABC', 'נקודה D', 'מעגל שעובר דרך A, D ו-B'], line);
    expect(v.kind).toBe('refuse');
    expect(said).toBe(ruled(line, 'מעגל שעובר דרך A, D ו-B', 'A', 'D', 'B'));
  });

  it('the LENGTH givens can put the three points on one line too — |AB| = |AD| + |DB| (was green, centre at ~2000)', async () => {
    const { v, raw, said } = await decide(['משולש ABC', 'AB = 5', 'נקודה D', 'מעגל שעובר דרך A, D ו-B', 'AD = 2'], 'DB = 3');
    expect(v.kind).toBe('refuse');
    expect(raw).toMatch(COLLINEAR_CIRCLE_VS);
    expect(said).toContain('«DB = 3» סותר את');
    expect(said).toContain('הסיבה: A, D ו-B על ישר אחד, ואין מעגל שעובר דרך שלוש נקודות על ישר אחד.');
  });

  it('English input and the English locale: the same verdict, the same frame', async () => {
    const { v, said } = await decide(['triangle ABC', 'D on line AB'], 'circle through A, D and B', en, 'en');
    expect(v.kind).toBe('refuse');
    expect(said).toBe("Can't do that: «circle through A, D and B» contradicts «D on line AB» — they can't both hold. The reason: A, D and B are on one line, and no circle passes through three points on one line.");
  });

  it.each([
    [['משולש ABC', 'D על AC'], 'מעגל שעובר דרך A, D ו-B'],
    [['משולש ABC', 'D על AB', 'E על AB'], 'מעגל שעובר דרך C, D ו-E'],
    [['משולש ABC', 'D על AB', 'E על BC'], 'מעגל שעובר דרך B, D ו-E'],
    [['משולש ABC'], 'מעגל חוסם את המשולש ABC'],
    [['משולש ABC', 'נקודה D', 'מעגל שעובר דרך A, D ו-B'], 'D על AC'],
  ])('controls: %j then «%s» builds a real circle', async (prefix, line) => {
    const { v } = await decide(prefix as string[], line as string);
    expect(v.kind).toBe('commit');
  });
});

describe('#2099 — the structural reader and the prover', () => {
  const run = (cmds: Command[]): Construction => cmds.reduce((c, cmd) => applyCommand(c, cmd), emptyConstruction());

  it('`threeOnOneLine` reads riders, midpoints and lowered collinearity, and names its witnesses', () => {
    const c = run([
      { type: 'free-point', id: 'A', x: 0, y: 0 } as Command,
      { type: 'free-point', id: 'B', x: 5, y: 0 } as Command,
      { type: 'free-point', id: 'C', x: 1, y: 3 } as Command,
      { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 0.3 } as Command,
      { type: 'point-on-segment', id: 'E', a: 'A', b: 'B', t: 0.6 } as Command,
    ]);
    expect(threeOnOneLine(c, ['A', 'D', 'B'])?.objs).toEqual(['D']);
    expect(threeOnOneLine(c, ['D', 'E', 'A'])?.line.sort()).toEqual(['A', 'B']);
    expect(threeOnOneLine(c, ['A', 'D', 'C']), 'C is off AB by what the figure says').toBeNull();
    expect(threeOnOneLine(c, ['A', 'B', 'C']), 'a triangle is not a line').toBeNull();
  });

  it('a circle already degenerate in the prior figure is never blamed on a later, unrelated line', () => {
    const prev = run([
      { type: 'free-point', id: 'A', x: 0, y: 0 } as Command,
      { type: 'free-point', id: 'B', x: 5, y: 0 } as Command,
      { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 0.3 } as Command,
      { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'D', c: 'B' } as Command,
    ]);
    const cmd = { type: 'free-point', id: 'Q', x: 2, y: 2 } as Command;
    expect(collinearCircleImpossibility(prev, applyCommand(prev, cmd), cmd)).toBeNull();
    const fresh = run([{ type: 'free-point', id: 'A', x: 0, y: 0 } as Command, { type: 'free-point', id: 'B', x: 5, y: 0 } as Command, { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 0.3 } as Command]);
    const circ = { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'D', c: 'B' } as Command;
    const hit = collinearCircleImpossibility(fresh, applyCommand(fresh, circ), circ);
    expect(hit && collinearCircleError(hit)).toBe('over-constrained: a circle through A, D, B on one line cannot hold');
  });
});

describe('#2099 — the numeric backstop is scale-free', () => {
  it('a near-line (flatness below the floor) has no circumcentre at any scale; a thin real triangle does', () => {
    for (const s of [1e-3, 1, 1e3]) {
      const a = { x: 0, y: 0 }, b = { x: 5 * s, y: 0 };
      expect(circumcenter(a, b, { x: 2.5 * s, y: 5 * s * 1e-8 }), `flatness 1e-8 at scale ${s}`).toBeNull();
      expect(circumcenter(a, b, { x: 2.5 * s, y: 5 * s * 1e-3 }), `flatness 1e-3 at scale ${s}`).not.toBeNull();
    }
    expect(CIRCUMCIRCLE_FLATNESS_FLOOR).toBeLessThan(5e-4); // far below the collapsed-polygon floor (DEGENERATE_EXTENT_RATIO)
    expect(circumcenter({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }), 'one spot').toBeNull();
  });

  it('the evaluator’s collinear message renders the ruled reason, never half-English', () => {
    const raw = 'cannot construct O: A, D, B are collinear (no circumscribed circle)';
    expect(stripFormatControls(humanizeError(raw, he, 'מעגל שעובר דרך A, D ו-B'))).toBe(
      'לא ניתן: «מעגל שעובר דרך A, D ו-B» סותר נתון קודם — אי אפשר לקיים את שניהם יחד. הסיבה: A, D ו-B על ישר אחד, ואין מעגל שעובר דרך שלוש נקודות על ישר אחד.',
    );
  });
});
