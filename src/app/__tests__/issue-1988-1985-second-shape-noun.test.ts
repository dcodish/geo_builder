/**
 * #1988 + #1985 ([ADR-619](../../../docs/06-decisions.md#adr-619)) — A SECOND SHAPE NOUN OVER A DECLARED RING IS
 * JUDGED BY THE QUADRILATERAL HIERARCHY, NOT BY WHOSE CORNER THE ENGINE WOULD REBUILD.
 *
 * Measured on `main` @ 06fc51dd through `decideDeterministic2D` → `commitVerdict` (the App's door), the AI
 * mocked: «ריבוע ABCD» then «מלבן ABCD» / «מעוין ABCD» / «מקבילית ABCD» / «דלתון ABCD», and «מקבילית ABCD»
 * then «טרפז ABCD» (either order, and the isosceles and right variants) were each refused with the engine's
 * own «'C' is already defined …» / «'poly-ABCD' is already defined …» — a letter or an internal id the engine
 * chose, never the statement in conflict.
 *
 * Two operator rulings of 2026-10-10, one predicate family:
 *  - #1988 — a noun the declared one IMPLIES is a true restatement: «זה כבר קיים באיור — אין מה להוסיף.», no row.
 *  - #1985 — a noun that EXCLUDES it is refused with the sentence he chose for analytic on 2026-10-08:
 *    «הצורה כבר ידועה כ־{actual} — ולכן אינה נקראת {stated}. מחקו את הנתון הקודם אם התכוונתם {stated}.»
 * Neither implied nor excluded (a rhombus over a declared rectangle — a square is both) stays ADR-157's refusal.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { humanizeError } from '@/i18n/humanizeError';
import i18n from '@/i18n';
import { QUAD_IMPLIES, quadImplies, quadImpliesInEveryReading, quadsExclude, type QuadKind } from '@/engine/shapeKinds';
import { declaredQuadKind, shapeExclusion, shapeLowersToConstraints, statedQuadKind } from '@/engine/apply';
import { applyStep } from '@/engine/step';
import { emptyConstruction, type Command, type Construction } from '@/engine';

const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n.getFixedT('en')(k, o) as string);

interface Played {
  kind: string;
  noteKey?: string;
  explain?: string;
  rowsAdded: number;
}

/** Type each line as the App does; the verdict of the LAST line and how many rows it added. */
async function play(lines: readonly string[]): Promise<Played> {
  st().clear();
  let out: Played = { kind: '', rowsAdded: 0 };
  for (const line of lines) {
    const before = st().facts.length;
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never,
      line,
      'he',
    )) as never as { kind: string; note?: { key?: string; explain?: string } };
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
    out = { kind: v.kind, noteKey: v.note?.key, explain: v.note?.explain, rowsAdded: st().facts.length - before };
  }
  return out;
}

/** Build the prior figure purely, then step the second noun — the engine's own answer, no store. */
function step(first: Command, second: Command): ReturnType<typeof applyStep> {
  const base: Construction = emptyConstruction();
  const r0 = applyStep(base, first);
  expect(r0.ok, 'the first line builds').toBe(true);
  return applyStep(r0.construction, second);
}

beforeEach(() => llmParseMock.mockReset());

describe('#1988 — a noun the declared shape already IMPLIES is a restatement, not a redefinition', () => {
  it.each([
    ['ריבוע ABCD', 'מלבן ABCD'], // the issue's own line
    ['ריבוע ABCD', 'מעוין ABCD'],
    ['ריבוע ABCD', 'מקבילית ABCD'],
    ['ריבוע ABCD', 'דלתון ABCD'],
    ['מלבן ABCD', 'מקבילית ABCD'],
    ['מעוין ABCD', 'מקבילית ABCD'],
    ['מעוין ABCD', 'דלתון ABCD'],
    ['טרפז שווה שוקיים ABCD', 'טרפז ABCD'],
    ['טרפז ישר זווית ABCD', 'טרפז ABCD'],
    ['ריבוע ABCD', 'מרובע ABCD'], // ADR-595's own case, unchanged
  ])('«%s» · «%s» answers «כבר קיים» and adds no row', async (a, b) => {
    const r = await play([a, b]);
    expect(r.kind).toBe('noop');
    expect(r.noteKey).toBe('input.alreadyDrawn');
    expect(he(r.noteKey!)).toBe('זה כבר קיים באיור — אין מה להוסיף.');
    expect(r.rowsAdded, 'it states nothing new').toBe(0);
  });

  // #1953 (ADR-618): the ring is a CYCLE, so the answer may not depend on where the student started reading it.
  it.each([
    ['ריבוע ABCD', 'מלבן BCDA'],
    ['ריבוע ABCD', 'מקבילית ADCB'],
    ['ריבוע ABCD', 'דלתון CDAB'],
    ['מלבן ABCD', 'מקבילית DCBA'],
  ])('«%s» · «%s» — every reading of the same ring gives that answer', async (a, b) => {
    const r = await play([a, b]);
    expect(r.kind).toBe('noop');
    expect(r.noteKey).toBe('input.alreadyDrawn');
    expect(r.rowsAdded).toBe(0);
  });

  it('the figure is untouched: the square keeps its declared noun and its corners', () => {
    const r = step({ type: 'square', ids: ['A', 'B', 'C', 'D'] }, { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.construction.objects.filter((o) => o.kind === 'polygon')).toHaveLength(1);
    expect(declaredQuadKind(r.construction, ['A', 'B', 'C', 'D'])).toBe('square');
  });
});

describe('#1985 — a noun that EXCLUDES the declared one is refused with the ruled sentence', () => {
  it.each([
    ['מקבילית ABCD', 'טרפז ABCD', 'מקבילית', 'טרפז'], // the operator's pair
    ['טרפז ABCD', 'מקבילית ABCD', 'טרפז', 'מקבילית'], // and the reverse
    // #2169 (ADR-W-131, the 2026-10-16 ruling): the isosceles variant is named with its adjective, like the right one
    ['מקבילית ABCD', 'טרפז שווה שוקיים ABCD', 'מקבילית', 'טרפז שווה שוקיים'],
    ['מקבילית ABCD', 'טרפז ישר זווית ABCD', 'מקבילית', 'טרפז ישר זווית'],
    ['מלבן ABCD', 'טרפז ABCD', 'מלבן', 'טרפז'],
    ['ריבוע ABCD', 'טרפז ABCD', 'ריבוע', 'טרפז'],
    ['מעוין ABCD', 'טרפז ABCD', 'מעוין', 'טרפז'],
    ['דלתון ABCD', 'טרפז ABCD', 'דלתון', 'טרפז'],
    ['טרפז ABCD', 'ריבוע ABCD', 'טרפז', 'ריבוע'],
    ['טרפז שווה שוקיים ABCD', 'מקבילית ABCD', 'טרפז שווה שוקיים', 'מקבילית'],
    ['טרפז ישר זווית ABCD', 'מקבילית ABCD', 'טרפז ישר זווית', 'מקבילית'],
    // #2169: an isosceles and a right trapezoid exclude each other, in either order (refused in every builder)
    ['טרפז שווה שוקיים ABCD', 'טרפז ישר זווית ABCD', 'טרפז שווה שוקיים', 'טרפז ישר זווית'],
    ['טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD', 'טרפז ישר זווית', 'טרפז שווה שוקיים'],
  ])('«%s» · «%s» names both nouns', async (a, b, actual, stated) => {
    const r = await play([a, b]);
    expect(r.kind).toBe('refuse');
    expect(r.rowsAdded, 'keep-prior: the refused line is not a row').toBe(0);
    expect(humanizeError(r.explain, he)).toBe(
      `הצורה כבר ידועה כ־${actual} — ולכן אינה נקראת ${stated}. מחקו את הנתון הקודם אם התכוונתם ${stated}.`,
    );
    expect(humanizeError(r.explain, he), 'no engine id or letter the engine chose').not.toMatch(/poly-|already defined/);
  });

  it('the English wording is the one analytic and 3-D use', async () => {
    const r = await play(['מקבילית ABCD', 'טרפז ABCD']);
    expect(humanizeError(r.explain, en)).toBe(
      'The figure is already known to be a parallelogram, so it is not called a trapezoid. Remove the earlier given if you meant trapezoid.',
    );
  });

  // The refusal is STRUCTURAL — read off the two declarations, never off the drawing.
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('refused at seed %i too', async (seed) => {
    st().clear();
    useGeoStore.setState({ seed });
    const r = await play(['מקבילית ABCD', 'טרפז ABCD']);
    expect(r.kind).toBe('refuse');
  });

  it('every reading of the ring is refused the same way', async () => {
    for (const b of ['טרפז ABCD', 'טרפז CDAB', 'טרפז DCBA']) {
      const r = await play(['מקבילית ABCD', b]);
      expect(r.kind, b).toBe('refuse');
      expect(humanizeError(r.explain, he), b).toMatch(/הצורה כבר ידועה כ־מקבילית/);
    }
  });
});

describe('#1988 + #1985 — what did NOT change', () => {
  it('a noun that neither implies nor excludes the declared one now builds the kind both name (ADR-656, #1993)', async () => {
    // a square is both a rectangle and a rhombus — the 2026-10-11 ruling: the ring narrows and the student is told
    // (the notice and the 24-seed figure: issue-1914-1993-noun-refines-ring.test.ts)
    for (const [a, b] of [
      ['מלבן ABCD', 'מעוין ABCD'],
      ['מעוין ABCD', 'מלבן ABCD'],
    ]) {
      const r = await play([a, b]);
      expect(r.kind, `${a} · ${b}`).toBe('commit');
    }
  });

  it('a shape over four points NO noun declared still lowers to its constraints (ADR-375)', () => {
    let c: Construction = emptyConstruction();
    for (const p of [['A', 0, 0], ['B', 6, 0], ['C', 7, 4], ['D', 1, 5]] as [string, number, number][]) {
      const r = applyStep(c, { type: 'free-point', id: p[0], x: p[1], y: p[2] });
      expect(r.ok, p[0]).toBe(true);
      if (!r.ok) return;
      c = r.construction;
    }
    expect(declaredQuadKind(c, ['A', 'B', 'C', 'D']), 'four loose points declare no ring').toBeNull();
    expect(
      shapeLowersToConstraints(c, { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }),
      'an undeclared point set takes the noun’s constraints (ADR-375), not this restatement',
    ).toBe(true);
    expect(shapeExclusion(c, { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }), 'and nothing is excluded there').toBeNull();
  });
});

describe('#1988 + #1985 — the mechanism: one table, two directions', () => {
  const KINDS = Object.keys(QUAD_IMPLIES) as QuadKind[];

  it('the hierarchy says what the curriculum says', () => {
    for (const w of ['rectangle', 'rhombus', 'parallelogram', 'kite', 'quadrilateral'] as QuadKind[])
      expect(quadImplies('square', w), `square ⇒ ${w}`).toBe(true);
    expect(quadImplies('rectangle', 'parallelogram')).toBe(true);
    expect(quadImplies('rhombus', 'kite')).toBe(true);
    expect(quadImplies('isosceles-trapezoid', 'trapezoid')).toBe(true);
    expect(quadImplies('right-trapezoid', 'trapezoid')).toBe(true);
    // the EXCLUSIVE trapezoid reading (ADR-157, ADR-AG-189): a parallelogram is not a trapezoid
    expect(quadImplies('parallelogram', 'trapezoid')).toBe(false);
    expect(quadImplies('square', 'trapezoid')).toBe(false);
    // and nothing narrower is implied by something wider
    expect(quadImplies('parallelogram', 'rectangle')).toBe(false);
    expect(quadImplies('quadrilateral', 'parallelogram')).toBe(false);
  });

  it('every kind implies itself, and the generic noun is implied by every kind', () => {
    for (const k of KINDS) {
      expect(quadImplies(k, k), k).toBe(true);
      expect(quadImplies(k, 'quadrilateral'), k).toBe(true);
    }
  });

  it('implication is transitive — so the table cannot say "a square is a rhombus" and stop there', () => {
    for (const a of KINDS) for (const b of KINDS) for (const c of KINDS)
      if (quadImplies(a, b) && quadImplies(b, c)) expect(quadImplies(a, c), `${a} ⇒ ${b} ⇒ ${c}`).toBe(true);
  });

  it('exclusion is symmetric, never self-exclusive, and never both-ways with implication', () => {
    for (const a of KINDS) {
      expect(quadsExclude(a, a), a).toBe(false);
      for (const b of KINDS) {
        expect(quadsExclude(a, b), `${a}/${b}`).toBe(quadsExclude(b, a));
        if (quadImplies(a, b) || quadImplies(b, a)) expect(quadsExclude(a, b), `${a}/${b}`).toBe(false);
      }
    }
  });

  it('the trapezoid family excludes the parallelogram family and the kite, and nothing else does', () => {
    const TRAPS: QuadKind[] = ['trapezoid', 'isosceles-trapezoid', 'right-trapezoid'];
    const PARAS: QuadKind[] = ['parallelogram', 'rectangle', 'rhombus', 'square', 'kite'];
    for (const t of TRAPS) for (const p of PARAS) expect(quadsExclude(t, p), `${t}/${p}`).toBe(true);
    // within the family, only the two refined phrases exclude each other: a trapezoid with equal legs AND a right
    // angle has four right angles, so it is a rectangle (the reasoning of NOT_CYCLIC / ADR-607). Unreachable as a
    // DECLARED pair today — `polygon.declaredAs` is «trapezoid» for all three — but the table says it correctly.
    for (const t of TRAPS) for (const u of TRAPS)
      expect(quadsExclude(t, u), `${t}/${u}`).toBe(t !== u && t !== 'trapezoid' && u !== 'trapezoid');
    for (const p of PARAS) for (const q of PARAS) expect(quadsExclude(p, q), `${p}/${q}`).toBe(false);
  });

  it('the only kinds that imply a KITE without being one have four equal sides', () => {
    for (const a of KINDS) {
      if (a === 'kite' || !quadImplies(a, 'kite')) continue;
      expect(quadImplies(a, 'rhombus'), a).toBe(true);
      expect(quadImpliesInEveryReading(a, 'kite'), a).toBe(true);
    }
    // a trapezoid names ONE pair of sides, so it never survives an arbitrary reading
    for (const a of KINDS) expect(quadImpliesInEveryReading(a, 'trapezoid'), a).toBe(false);
    for (const a of KINDS) expect(quadImpliesInEveryReading(a, 'isosceles-trapezoid'), a).toBe(false);
  });

  it('`statedQuadKind` reads every spelling the parser emits, and nothing else', () => {
    const ids: [string, string, string, string] = ['A', 'B', 'C', 'D'];
    expect(statedQuadKind({ type: 'square', ids })).toBe('square');
    expect(statedQuadKind({ type: 'rectangle', ids })).toBe('rectangle');
    expect(statedQuadKind({ type: 'rhombus', ids })).toBe('rhombus');
    expect(statedQuadKind({ type: 'parallelogram', ids })).toBe('parallelogram');
    expect(statedQuadKind({ type: 'trapezoid', ids })).toBe('trapezoid');
    expect(statedQuadKind({ type: 'trapezoid', ids, kind: 'right-trapezoid' })).toBe('right-trapezoid');
    expect(statedQuadKind({ type: 'quadrilateral', ids })).toBe('quadrilateral');
    expect(statedQuadKind({ type: 'quadrilateral', ids, declaredAs: 'kite' })).toBe('kite');
    expect(statedQuadKind({ type: 'triangle', ids: ['A', 'B', 'C'] })).toBeNull();
    expect(statedQuadKind({ type: 'segment', a: 'A', b: 'B' })).toBeNull();
  });

  it('a ring no polygon declares is not "already known" anything', () => {
    expect(declaredQuadKind(emptyConstruction(), ['A', 'B', 'C', 'D'])).toBeNull();
    expect(shapeExclusion(emptyConstruction(), { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] })).toBeNull();
  });

  it('a CROSSING order is a different ring — neither restated nor excluded (that is #1927/#1991)', () => {
    const base = applyStep(emptyConstruction(), { type: 'square', ids: ['A', 'B', 'C', 'D'] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(declaredQuadKind(base.construction, ['A', 'C', 'B', 'D'])).toBeNull();
    expect(shapeExclusion(base.construction, { type: 'trapezoid', ids: ['A', 'C', 'B', 'D'] })).toBeNull();
  });
});
