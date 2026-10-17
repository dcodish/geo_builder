/**
 * #2117 ([ADR-718](../../../docs/06-decisions.md#adr-718)) — A DIAGONAL CALLED A HEIGHT OF A SQUARE, RECTANGLE OR
 * RHOMBUS IS REFUSED NAMING THE SHAPE: THE DIAGONAL IS PERPENDICULAR TO NO SIDE.
 *
 * Operator ruling, 2026-10-15 (decisions ballot, card 3, option A — the sentence approved as written):
 *   «לא ניתן: «AC גובה» סותר את «ריבוע ABCD» — אי אפשר לקיים את שניהם יחד. הסיבה: האלכסון AC אינו מאונך לאף צלע של הריבוע.»
 *   (the polygon kind and the letters are the student's own, substituted).
 *
 * Measured on `main` @ de7c221f through `decideDeterministic2D`: «ריבוע ABCD» · «AC גובה» → «…סותר נתון קודם… הסיבה:
 * AC ⟂ CB.» — the first option of the ADR-644 `altitude-choice`, with no other statement named. The same for the
 * rectangle and the rhombus, and for BD.
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
import { DIAGONAL_HEIGHT_VS, diagonalHeightError, diagonalHeightImpossibility } from '@/engine/heightFeasibility';
import { DIAGONAL_NEVER_PERPENDICULAR } from '@/engine/shapeKinds';
import type { Construction, GeoObject } from '@/engine';
import { stripFormatControls } from '../../../shell/bidi';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string, lang: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
  const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
  const tr = i18n.getFixedT(lang);
  const t: Translate = (k, o) => tr(k, o) as string;
  const text = raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null;
  return { v, raw, text };
}

const ruled = (line: string, decl: string, d: string, shape: string) =>
  `לא ניתן: «${line}» סותר את «${decl}» — אי אפשר לקיים את שניהם יחד. הסיבה: האלכסון ${d} אינו מאונך לאף צלע של ${shape}.`;

describe('#2117 — the table and the prover', () => {
  it('the kinds are read off the lattice: square, rectangle, rhombus — nothing else', () => {
    expect([...DIAGONAL_NEVER_PERPENDICULAR].sort()).toEqual(['rectangle', 'rhombus', 'square']);
  });

  const square = (declaredAs?: string): Construction =>
    ({ objects: [{ kind: 'polygon', id: 'poly-ABCD', vertices: ['A', 'B', 'C', 'D'], declaredAs } as GeoObject], constraints: [] }) as unknown as Construction;
  const choice = (opts: [string, string, [string, string]][]) => ({ type: 'altitude-choice', options: opts.map(([apex, foot, side]) => ({ apex, foot, side })), variant: 0 });
  const diag = choice([['A', 'C', ['C', 'B']], ['A', 'C', ['C', 'D']], ['C', 'A', ['A', 'D']], ['C', 'A', ['A', 'B']]]);

  it('proves a diagonal of a declared table kind against every side at its ends', () => {
    const m = diagonalHeightImpossibility(square('square'), diag);
    expect(m).toEqual({ diagonal: ['A', 'C'], ring: ['A', 'B', 'C', 'D'], shape: 'square' });
    expect(DIAGONAL_HEIGHT_VS.exec(diagonalHeightError(m!))?.slice(1, 4)).toEqual(['AC', 'square', 'ABCD']);
  });

  it('proves nothing it cannot prove: another kind, an undeclared ring, a side, an option off the ring, a non-choice', () => {
    expect(diagonalHeightImpossibility(square('parallelogram'), diag)).toBeNull();
    expect(diagonalHeightImpossibility(square('kite'), diag)).toBeNull();
    expect(diagonalHeightImpossibility(square(undefined), diag)).toBeNull();
    expect(diagonalHeightImpossibility(square('square'), choice([['A', 'B', ['B', 'C']]]))).toBeNull(); // AB is a side
    expect(diagonalHeightImpossibility(square('square'), choice([['A', 'C', ['C', 'B']], ['A', 'C', ['C', 'E']]]))).toBeNull(); // CE is no side of the ring
    expect(diagonalHeightImpossibility(square('square'), { type: 'set-perpendicular' })).toBeNull();
  });
});

describe('#2117 — the ruled refusal, the student’s own noun and letters substituted', () => {
  it.each([
    ['ריבוע ABCD', 'AC גובה', 'AC', 'הריבוע'],
    ['ריבוע ABCD', 'BD גובה', 'BD', 'הריבוע'],
    ['ריבוע ABCD', 'AC הוא גובה', 'AC', 'הריבוע'],
    ['מלבן ABCD', 'AC גובה', 'AC', 'המלבן'],
    ['מלבן ABCD', 'BD גובה', 'BD', 'המלבן'],
    ['מעוין ABCD', 'AC גובה', 'AC', 'המעוין'],
    ['מעוין ABCD', 'BD גובה', 'BD', 'המעוין'],
  ])('«%s» · «%s» → the ruled sentence', async (decl, line, d, shape) => {
    const { v, text } = await decide([decl], line);
    expect(v.kind, 'refused before it becomes a fact').toBe('refuse');
    expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
    expect(text).toBe(ruled(line, decl, d, shape));
  });

  it('English wording', async () => {
    const { text } = await decide(['ריבוע ABCD'], 'AC גובה', 'en');
    expect(text).toBe('Can\'t do that: «AC גובה» contradicts «ריבוע ABCD» — they can\'t both hold. The reason: the diagonal AC is perpendicular to no side of the square.');
  });
});

describe('#2117 — the controls are unchanged', () => {
  it('a parallelogram’s diagonal can be a height: it commits', async () => {
    expect((await decide(['מקבילית ABCD'], 'AC גובה')).v.kind).toBe('commit');
  });
  it('a side of the square is already a height: «כבר קיים»', async () => {
    expect((await decide(['ריבוע ABCD'], 'AB גובה')).v.kind).toBe('noop');
  });
  it('a STATED side keeps its true reason «AC ⟂ CB»', async () => {
    const { v, text } = await decide(['ריבוע ABCD'], 'AC גובה לצלע BC');
    expect(v.kind).toBe('refuse');
    expect(text).toBe('לא ניתן: «AC גובה לצלע BC» סותר את «ריבוע ABCD» — אי אפשר לקיים את שניהם יחד. הסיבה: AC ⟂ CB.');
  });
  it('a general quadrilateral and a trapezoid still build the first option', async () => {
    expect((await decide(['מרובע ABCD'], 'AC גובה')).v.kind).toBe('commit');
    expect((await decide(['טרפז ABCD'], 'AC גובה')).v.kind).toBe('commit');
  });
});
