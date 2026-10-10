/**
 * #1953 ([ADR-618](../../../docs/06-decisions.md#adr-618)) — A RESTATED POLYGON IS COMPARED BY ITS RING, NOT BY ITS
 * SPELLING.
 *
 * Operator, playing round #1940 T11: *"on second line - since the shape was already known, we should have a note
 * saying this input adds no information."* Measured on `main` @ e0f4260c through `decideDeterministic2D` →
 * `commitVerdict` (the App's door): «ריבוע ABCD» · «מרובע ADCB» / «מרובע BCDA» and «משולש ABC» · «משולש ACB»
 * committed a SECOND row with no note, and «ריבוע ABCD» · «ריבוע BCDA» was refused with the engine's internal
 * «'D' is already defined …». The same lines in the declared spelling answered «זה כבר קיים באיור».
 *
 * Root cause: the engine identified a polygon by its spelling (`poly-ADCB` ≠ `poly-ABCD`), so a ring read from
 * another vertex or the other way round built a second polygon (the step "grew"), and a symmetric shape's derived
 * corners were compared in the new spelling. Fix: `normalizeShapeComposition` reads a ring the figure already
 * declares in its DECLARED spelling (`ringKey`, ADR-W-121) whenever the word's statement is symmetric under that
 * reading — after which every line takes the verdict its declared spelling takes.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { applyCommand, emptyConstruction, ringKey, type Command, type Construction } from '@/engine';
import { normalizeShapeComposition } from '@/engine/apply';
import { ringKey as replayRingKey } from '@/replay/core';

const st = () => useGeoStore.getState();

/** Type each line as the App does; the verdict of the LAST line, and the row counts around it. */
async function play(lines: string[]) {
  st().clear();
  let last = { kind: '', note: undefined as undefined | { key?: string; explain?: string }, result: '' as string | undefined };
  let before = 0;
  for (const line of lines) {
    before = st().facts.length;
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, 'he')) as never as {
      kind: string;
      note?: { key?: string; explain?: string };
      logs?: { result?: string }[];
    };
    last = { kind: v.kind, note: v.note, result: v.logs?.at(-1)?.result };
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { ...last, before, after: st().facts.length };
}

beforeEach(() => llmParseMock.mockReset());

describe('#1953 — the operator’s lines: a restated ring answers «כבר קיים» and adds no row', () => {
  it.each([
    ['ריבוע ABCD', 'מרובע ADCB'], // the operator's T11 line (reversed)
    ['ריבוע ABCD', 'מרובע BCDA'], // rotated
    ['ריבוע ABCD', 'מרובע CDAB'],
    ['ריבוע ABCD', 'מרובע DCBA'],
    ['משולש ABC', 'משולש ACB'],
    ['משולש ABC', 'משולש CAB'],
    ['משולש ABC', 'משולש CBA'],
    ['מחומש ABCDE', 'מחומש CDEAB'],
  ])('«%s» · «%s»', async (a, b) => {
    const r = await play([a, b]);
    expect(r.kind).toBe('noop');
    expect(r.note?.key).toBe('input.alreadyDrawn');
    expect(r.after, 'no new row').toBe(r.before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the declared spelling answers exactly the same (the unchanged control)', async () => {
    for (const [a, b] of [['ריבוע ABCD', 'מרובע ABCD'], ['ריבוע ABCD', 'ריבוע ABCD'], ['משולש ABC', 'משולש ABC']]) {
      const r = await play([a, b]);
      expect([r.kind, r.note?.key, r.after - r.before], `${a} · ${b}`).toEqual(['noop', 'input.alreadyDrawn', 0]);
    }
  });
});

describe('#1953 — the class: the same shape in any reading it is symmetric under', () => {
  it.each([
    ['ריבוע ABCD', 'ריבוע BCDA'], // was refused «'D' is already defined …»
    ['ריבוע ABCD', 'ריבוע ADCB'],
    ['מלבן ABCD', 'מלבן CDAB'],
    ['מעוין ABCD', 'מעוין DCBA'],
    ['מקבילית ABCD', 'מקבילית BCDA'],
    ['טרפז ABCD', 'טרפז CDAB'], // AB ∥ CD read from C: the same pair
    ['טרפז ABCD', 'טרפז DCBA'],
  ])('«%s» · «%s» is the no-op its declared spelling is', async (a, b) => {
    const r = await play([a, b]);
    expect([r.kind, r.note?.key, r.after - r.before]).toEqual(['noop', 'input.alreadyDrawn', 0]);
  });

  it('a trapezoid read so the OTHER pair is named is a different statement — never re-spelled', () => {
    const prev = replay([{ id: 't', cmd: { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] } as Command, enabled: true }] as never, 0).construction;
    for (const ids of [['B', 'C', 'D', 'A'], ['A', 'D', 'C', 'B']]) {
      const cmd = { type: 'trapezoid', ids } as Command;
      expect(normalizeShapeComposition(prev, cmd), ids.join('')).toBe(cmd); // BC ∥ DA / AD ∥ CB: not AB ∥ CD
    }
  });

  it('a different shape over the same ring keeps the verdict its declared spelling has (ADR-157’s refusal)', async () => {
    // «מקבילית ABCD» over a square is refused in the declared spelling; every reading of it is refused too.
    const declared = await play(['ריבוע ABCD', 'מלבן ABCD']);
    for (const b of ['מלבן BCDA', 'מלבן ADCB']) {
      const r = await play(['ריבוע ABCD', b]);
      expect(r.kind, b).toBe(declared.kind);
      expect(r.after - r.before, b).toBe(0);
    }
  });
});

describe('#1953 — the crossing order is a DIFFERENT ring (stream B’s #1927 refusal is untouched)', () => {
  it('«ריבוע ABCD» · «מרובע ACBD» is still refused with errRingContradictsNoun', async () => {
    const r = await play(['ריבוע ABCD', 'מרובע ACBD']);
    expect(r.kind).toBe('refuse');
    expect(r.note?.key).toBe('input.ringContradictsNoun');
  });

  it('ringKey: rotations and reversals agree, a crossing order does not', () => {
    const k = ringKey(['A', 'B', 'C', 'D']);
    for (const r of ['BCDA', 'CDAB', 'DABC', 'DCBA', 'ADCB', 'CBAD']) expect(ringKey([...r]), r).toBe(k);
    for (const r of ['ACBD', 'ABDC', 'ADBC']) expect(ringKey([...r]), r).not.toBe(k);
    expect(replayRingKey, 'the replay layer reads the engine’s one definition').toBe(ringKey);
  });
});

describe('#1953 — the mechanism: one polygon per ring', () => {
  const declared = (cmd: Command): Construction => applyCommand(emptyConstruction(), cmd);

  it('a generic restatement is re-spelled to the declared ring, so no second polygon is built', () => {
    const prev = declared({ type: 'square', ids: ['A', 'B', 'C', 'D'] } as Command);
    const n = normalizeShapeComposition(prev, { type: 'quadrilateral', ids: ['A', 'D', 'C', 'B'] } as Command) as { ids: string[] };
    expect(n.ids).toEqual(['A', 'B', 'C', 'D']);
    const next = applyCommand(prev, n as Command);
    expect(next.objects.filter((o) => o.kind === 'polygon').length, 'one polygon').toBe(1);
  });

  it('an undeclared ring is never re-spelled (composition keeps its own rotation rule)', () => {
    const cmd = { type: 'quadrilateral', ids: ['A', 'D', 'C', 'B'] } as Command;
    expect(normalizeShapeComposition(emptyConstruction(), cmd)).toBe(cmd);
  });

  it('a right triangle (semantic vertex order) is never re-spelled', () => {
    const prev = declared({ type: 'triangle', ids: ['A', 'B', 'C'] } as Command);
    const cmd = { type: 'right-triangle', ids: ['C', 'B', 'A'] } as Command;
    expect(normalizeShapeComposition(prev, cmd)).toBe(cmd);
  });
});
