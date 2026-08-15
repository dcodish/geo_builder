/**
 * #591 — a shape declared with its SIDE LENGTH and no letters: «ריבוע שצלעו 4»,
 * «משולש שווה צלעות שצלעו 4».
 *
 * Operator (2026-08-15): *"we need to support this. for a square and for a משולש שווה צלעות it is
 * possible that students will enter it like this. just like we can write ריבוע with no letters."*
 * The bare shape («ריבוע») already auto-named its vertices; only the side-length variant did not.
 *
 * The cause was structural, and it is why this could not ride along with #458: the phrasing was owned
 * by an utterance REWRITE (`normalizeShapeSide` → `<shape> <ids>, <first-edge> = <value>`) that has to
 * NAME the edge, so it required letters the student had not written — and the auto labels do not exist
 * until `shapeMacro` mints them (context-dependently, avoiding collisions with existing points). The
 * reader moved to that seam and the rewrite is retired, so there is ONE owner rather than two split by
 * label-presence (docs/17 §3).
 *
 * The load-bearing lock is therefore not the new capability but the OLD one: every labelled form must
 * lower byte-identically to what the retired rewrite produced.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from './scenarios-harness';
import { parse } from '@/parser';
import { replay } from '@/replay/core';

const cmds = (u: string) => {
  const r = parse(u, { points: [] });
  return r.ok ? r.commands : null;
};
const figOf = (steps: string[]) => replay(factsOf(steps), 0);
const side = (fig: ReturnType<typeof replay>, a: string, b: string) => {
  const p = fig.positions.get(a)!;
  const q = fig.positions.get(b)!;
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('#591 — the LABELLED forms are unchanged (the retired rewrite reproduced exactly)', () => {
  it.each([
    [
      'ריבוע ABCD שצלעו הוא 4',
      [
        { type: 'square', ids: ['A', 'B', 'C', 'D'] },
        { type: 'segment', a: 'A', b: 'B' },
        { type: 'set-distance', a: 'A', b: 'B', value: 4 },
      ],
    ],
    [
      'משולש שווה צלעות ABC שצלעו 4',
      [
        { type: 'triangle', ids: ['A', 'B', 'C'] },
        { type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' },
        { type: 'set-equal', a: 'B', b: 'C', c: 'C', d: 'A' },
        { type: 'segment', a: 'A', b: 'B' },
        { type: 'set-distance', a: 'A', b: 'B', value: 4 },
      ],
    ],
  ])('%s', (utterance, expected) => {
    expect(cmds(utterance as string)).toEqual(expected);
  });

  it('a RADICAL side survives the move — the shared NUMEXPR atom, not a plain-number reader', () => {
    const c = cmds('ריבוע ABCD שצלעו √2');
    expect(c).not.toBeNull();
    const d = c!.find((x) => x.type === 'set-distance') as { value: number } | undefined;
    expect(d?.value).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe('#591 — the LABEL-LESS forms now build', () => {
  it('«ריבוע שצלעו 4» — auto labels, side 4', () => {
    const fig = figOf(['ריבוע שצלעו 4']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(side(fig, 'B', 'C')).toBeCloseTo(4, 6); // a square's own definition carries the rest
  });

  it('«משולש שווה צלעות שצלעו 4» — the operator\'s second case', () => {
    const fig = figOf(['משולש שווה צלעות שצלעו 4']);
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) {
      expect(side(fig, a, b), `${a}${b}`).toBeCloseTo(4, 6);
    }
  });

  it('«מעוין שצלעו 4» — the third member of the same vocabulary', () => {
    const fig = figOf(['מעוין שצלעו 4']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(side(fig, 'B', 'C')).toBeCloseTo(4, 6);
  });

  it('English mirrors', () => {
    const fig = figOf(['square whose side is 4']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
  });

  it('the label-less form lowers exactly like the labelled one, modulo the minted letters', () => {
    expect(cmds('ריבוע שצלעו 4')).toEqual(cmds('ריבוע ABCD שצלעו 4'));
    expect(cmds('משולש שווה צלעות שצלעו 4')).toEqual(cmds('משולש שווה צלעות ABC שצלעו 4'));
  });

  it('auto labels still AVOID existing points — the letters are minted in context', () => {
    const r = parse('ריבוע שצלעו 4', { points: ['A', 'B'] });
    expect(r.ok).toBe(true);
    const shape = r.ok ? (r.commands[0] as { ids: string[] }) : null;
    expect(shape!.ids).not.toContain('A');
    expect(shape!.ids).not.toContain('B');
  });
});

describe('#591 — the ADR-052 scoping survives', () => {
  it('«מלבן ABCD שצלעו 4» still escalates — WHICH side would be an unstated pick', () => {
    expect(cmds('מלבן ABCD שצלעו הוא 4')).toBeNull();
    expect(cmds('מלבן שצלעו 4')).toBeNull();
  });

  it('a bare shape with no side clause is untouched', () => {
    expect(cmds('ריבוע')).toEqual([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
  });

  it('the #458 dimensions lane is unaffected', () => {
    expect(cmds('מלבן במידות 4*6')).toEqual([
      { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] },
      { type: 'set-distance', a: 'A', b: 'B', value: 4 },
      { type: 'set-distance', a: 'B', b: 'C', value: 6 },
    ]);
  });
});
