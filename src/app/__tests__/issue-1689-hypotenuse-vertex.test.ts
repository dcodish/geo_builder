/**
 * #1689 ([ADR-639](../../../docs/06-decisions.md#adr-639)) — «משולש ישר-זווית ABC» says the triangle HAS a right angle,
 * not which vertex has it. A side named «היתר» is built only when a stated right angle fixes the vertex; otherwise
 * the student is asked which side is the hypotenuse — never the default seat C (operator ruling 2026-10-02, #1620).
 *
 * Measured on `main` 6096b643 through `decideDeterministic2D`: «משולש ישר-זווית ABC» · «תיכון ליתר» committed
 * `midpoint M of AB` + CM, «גובה ליתר» `foot F from C to AB`, "the median to the hypotenuse" the same; and
 * «גובה ליתר BC» committed «∠BAC = 90» together with the altitude from C to AB — the named side dropped for C's.
 * Root cause: `roleSidesOf` read the noun's structural perp-offset (its DEFAULT seat) as a stated right angle.
 * Analytic answers the open noun with `ambiguous-hypotenuse` (ADR-AG-211); 2-D now asks the same question.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { openRightTriangles, roleSidesOf } from '@/engine';
import i18n from '@/i18n';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const RT = 'משולש ישר-זווית ABC';

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string, lng: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lng);
  const note = v.kind === 'refuse' && 'key' in v.note ? v.note : null;
  const text = note ? plain(i18n.t(note.key, { ...(note.params ?? {}), lng }) as string) : null;
  return { v, key: note?.key ?? null, text, construction: d.construction };
}
const cmds = (v: Awaited<ReturnType<typeof decide>>['v']) => (v.kind === 'commit' ? v.commands : []);
/** The cevian a commit draws: its apex and the side its foot is on. */
function cevian(v: Awaited<ReturnType<typeof decide>>['v']): { apex: string; side: string } | null {
  const cs = cmds(v);
  const foot = cs.find((c) => c.type === 'midpoint' || c.type === 'foot') as { id: string; a: string; b: string } | undefined;
  const seg = cs.find((c) => c.type === 'segment' && foot && (c.a === foot.id || c.b === foot.id)) as { a: string; b: string } | undefined;
  if (!foot || !seg) return null;
  return { apex: seg.a === foot.id ? seg.b : seg.a, side: [foot.a, foot.b].sort().join('') };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/**
 * #2074 ([ADR-659](../../../docs/06-decisions.md#adr-659)) — RE-BASED to the operator's 2026-10-13 request and the
 * 2026-10-14 ruling, reversing ADR-639's question: the noun alone is not a missing operand. «תיכון ליתר» draws on the
 * triangle as SHOWN, bound to the seat (the fold rotates it with «הציגו תצורה אחרת»); a typed apex forces the seat.
 * Only a pair that is no side of the triangle is still asked, and two hosts get the existing no-single-side question.
 */
describe('#1689 → #2074 — the right-triangle noun alone: the hypotenuse is the one SHOWN, bound to the seat', () => {
  it.each([
    ['תיכון ליתר', 'he'],
    ['גובה ליתר', 'he'],
    ['התיכון ליתר', 'he'],
    ['the median to the hypotenuse', 'he'],
    ['median to the hypotenuse', 'en'],
    ['the altitude to the hypotenuse', 'en'],
  ] as const)('«%s» commits the cevian from the shown seat C to AB, bound to the seat, and never reaches the model', async (line, lng) => {
    const r = await decide([RT], line, lng);
    expect(r.v.kind).toBe('commit');
    expect(cevian(r.v)).toEqual({ apex: 'C', side: 'AB' });
    expect(cmds(r.v).every((c) => (c as { roleSide?: { role: string; at: string } }).roleSide?.role === 'hypotenuse' && (c as { roleSide?: { at: string } }).roleSide?.at === 'C')).toBe(true);
    expect(cmds(r.v).some((c) => c.type === 'set-angle'), 'no right angle is stated for the student').toBe(false);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a typed apex forces the seat: «CM תיכון ליתר» / «AM תיכון ליתר» / «גובה ליתר מ-C» state the right angle there, unbound', async () => {
    for (const [line, apex, side] of [['CM תיכון ליתר', 'C', 'AB'], ['AM תיכון ליתר', 'A', 'BC'], ['גובה ליתר מ-C', 'C', 'AB']] as const) {
      const r = await decide([RT], line);
      expect(cevian(r.v), line).toEqual({ apex, side });
      expect(cmds(r.v), line).toContainEqual(expect.objectContaining({ type: 'set-angle', vertex: apex, value: 90 }));
      expect(cmds(r.v).some((c) => (c as { roleSide?: unknown }).roleSide), line).toBe(false);
    }
  });

  it('a named pair that is no side of the open triangle still asks, with analytic’s question (ADR-AG-211)', async () => {
    const r = await decide([RT, 'נקודה D'], 'תיכון ליתר AD');
    expect(r.key).toBe('input.ambiguousHypotenuse');
    expect(r.text).toBe('לא נאמר איזו זווית במשולש ישרה, ולכן לא ידוע איזו צלע היא היתר: "תיכון ליתר AD". כתבו איזו צלע היא היתר, למשל "תיכון ליתר AB", או איזו זווית ישרה, למשל "זווית C ישרה".');
  });

  it('the named answers still build: «תיכון ליתר AB» (the right angle at C, stated by the claim) and «זווית C ישרה»', async () => {
    const named = await decide([RT], 'תיכון ליתר AB');
    expect(cevian(named.v)).toEqual({ apex: 'C', side: 'AB' });
    expect(cmds(named.v)).toContainEqual(expect.objectContaining({ type: 'set-angle', vertex: 'C', value: 90 }));
    expect((await decide([RT], 'זווית C ישרה')).v.kind).toBe('commit');
    expect(cevian((await decide([RT], 'the median to the hypotenuse AB', 'en')).v)).toEqual({ apex: 'C', side: 'AB' });
  });

  it('a NAMED hypotenuse is the student’s side, never C’s: «תיכון ליתר BC» / «גובה ליתר BC» run from A to BC, with ∠A = 90 stated', async () => {
    for (const line of ['תיכון ליתר BC', 'גובה ליתר BC', 'תיכון ליתר CB']) {
      const r = await decide([RT], line);
      expect(cevian(r.v), line).toEqual({ apex: 'A', side: 'BC' });
      expect(cmds(r.v), line).toContainEqual(expect.objectContaining({ type: 'set-angle', vertex: 'A', value: 90 }));
    }
  });

  it('two right triangles on one side, neither seated: no single host — the no-single-side question', async () => {
    expect((await decide([RT, 'משולש ישר-זווית ABD'], 'תיכון ליתר')).key).toBe('input.roleSideUnresolved');
  });
});

describe('#1689 — a STATED right angle fixes the vertex, and builds', () => {
  it.each([
    ['זווית C ישרה', 'C', 'AB'],
    ['זווית A ישרה', 'A', 'BC'],
    ['∠ACB = 90', 'C', 'AB'],
    ['∠BAC = 90', 'A', 'BC'],
    ['AC ⟂ BC', 'C', 'AB'],
  ])('«%s» then «תיכון ליתר»: the median from %s to %s', async (stated, apex, side) => {
    expect(cevian((await decide([RT, stated], 'תיכון ליתר')).v)).toEqual({ apex, side });
    expect(cevian((await decide([RT, stated], 'גובה ליתר')).v)).toEqual({ apex, side });
  });

  it('the one-line form «משולש ישר-זווית ABC (∠C = 90°)» and a plain triangle with a stated angle build', async () => {
    expect(cevian((await decide(['משולש ישר-זווית ABC (∠C = 90°)'], 'תיכון ליתר')).v)).toEqual({ apex: 'C', side: 'AB' });
    expect(cevian((await decide(['משולש ABC', 'זווית B ישרה'], 'תיכון ליתר')).v)).toEqual({ apex: 'B', side: 'AC' });
  });

  it('a plain triangle with no right angle keeps its own refusal (unchanged)', async () => {
    expect((await decide(['משולש ABC'], 'תיכון ליתר')).key).toBe('input.roleSideUnresolved');
  });
});

describe('#1689 — the engine reads a STATED right angle as the hypotenuse’s vertex, and the noun’s seat as an UNSTATED one (#2074)', () => {
  const figure = (lines: string[]) => {
    useGeoStore.getState().clear();
    expect(driveThroughGate(lines).refused).toEqual([]);
    const st = useGeoStore.getState();
    return replay(st.facts, st.seed).construction;
  };

  it('the noun alone: one UNSTATED hypotenuse at the shown seat, one open right triangle', () => {
    const c = figure([RT]);
    expect(roleSidesOf(c).filter((r) => r.role === 'hypotenuse').map((r) => [r.at, [...r.edge].sort().join(''), r.unstated])).toEqual([['C', 'AB', true]]);
    expect(openRightTriangles(c)).toEqual([['A', 'B', 'C']]);
  });

  it('a stated right angle closes it — at the default seat and at a re-seated vertex alike', () => {
    for (const [stated, at, edge] of [['זווית C ישרה', 'C', 'AB'], ['זווית A ישרה', 'A', 'BC']] as const) {
      const c = figure([RT, stated]);
      expect(openRightTriangles(c), stated).toEqual([]);
      const hyp = roleSidesOf(c).filter((r) => r.role === 'hypotenuse');
      expect(hyp.some((r) => r.unstated), stated).toBe(false);
      expect(hyp.map((r) => [r.at, [...r.edge].sort().join('')]), stated).toEqual([[at, edge]]);
    }
  });

  it('the shared-hypotenuse build’s own ⟂ (no free vertex for the perp-offset) is the noun’s seat, not a statement', () => {
    const c = figure([RT, 'משולש ישר-זווית ABD']);
    expect(c.constraints).toContainEqual(expect.objectContaining({ type: 'perpendicular', seat: true }));
    expect(roleSidesOf(c).filter((r) => r.role === 'hypotenuse').every((r) => r.unstated)).toBe(true);
    expect(openRightTriangles(c).map((r) => [...r].sort().join(''))).toEqual(['ABC', 'ABD']);
  });
});
