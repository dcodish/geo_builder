/**
 * #2552 ([ADR-AG-336](../../docs/06c-decisions-analytic.md#adr-ag-336)) — THE EXAM'S TWO PAIR SENTENCES.
 *
 * Operator, 2026-10-25 (prod analytic, «שאלה 6, משיק משותף לשני מעגלים שווים»): *"I had an issue creating this diagram.
 * It wouldnt accept O_1 / O_2 in many cases"*. The exam opens «נתונים שני מעגלים שרדיוס כל אחד מהם 5. מרכז המעגל הראשון
 * הוא O1(−3, 1) ומרכז המעגל השני הוא O2(9, 10).» Measured at d9494206 (`decideSubmit`, no model): both sentences, and
 * the joined second one, were not-handled.
 *
 * Scope is the operator's ruling D8 = B (2026-10-26): ONLY these two sentences. «המעגל הראשון / השני» is read inside
 * «מרכז המעגל הראשון הוא X(a,b)» alone, never as a general reference, and the near-variants keep going to the AI —
 * locked below so a later widening is a visible decision. The model is never called: `decideSubmit` is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { panelKnowledge } from '../app/panelRows';
import { derive, type Derivation } from '../engine/derive';
import joined from './fixtures/exam-2552-q6-pair-joined.analytic.json';
import split from './fixtures/exam-2552-q6-pair-split.analytic.json';

type Pt = { id: string; x: number; y: number };
type Verdict = { kind: string; line?: string; error?: { key?: string; code?: string } };

function record(lines: readonly string[], seed = 0): { ok: true; d: Derivation } | { ok: false; line: string; kind: string; key?: string } {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as Verdict;
    if (v.kind !== 'record') return { ok: false, line, kind: v.kind, key: v.error?.key ?? v.error?.code };
    acc.push(v.line ?? line);
  }
  return { ok: true, d: derive(acc, seed) };
}
function built(lines: readonly string[], seed = 0): Derivation {
  const r = record(lines, seed);
  if (!r.ok) throw new Error(`«${r.line}»: ${r.kind} (${r.key})`);
  expect(r.d.faults).toEqual([]);
  return r.d;
}
/** The last line's verdict, after the others recorded. */
function last(lines: readonly string[], seed = 0): Verdict {
  const acc: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, acc, seed) as Verdict;
    expect(v.kind, `«${line}»`).toBe('record');
    acc.push(v.line ?? line);
  }
  return decideSubmit(lines[lines.length - 1], acc, seed) as Verdict;
}
const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const at = (d: Derivation, id: string): [number, number] => {
  const p = (d.figure.points as Pt[]).find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return [round(p!.x), round(p!.y)];
};
/** Every circle the panel knows, as [cx, cy, r], sorted. */
const circles = (d: Derivation): number[][] =>
  panelKnowledge(d)
    .curves.map((c) => c.known as { kind: string; cx: number; cy: number; r: number } | undefined)
    .filter((k): k is { kind: string; cx: number; cy: number; r: number } => k?.kind === 'circle')
    .map((k) => [round(k.cx), round(k.cy), round(k.r)])
    .sort((a, b) => a[0] - b[0]);
const SEEDS = [0, 1, 2, 3];
const PAIR = 'נתונים שני מעגלים שרדיוס כל אחד מהם 5';

describe('#2552 — the saved exam builds and verifies', () => {
  it('as printed (the centres joined by «ו»): two radius-5 circles at O1(−3,1) and O2(9,10)', () => {
    for (const seed of SEEDS) expect(circles(built(joined.lines, seed)), `seed ${seed}`).toEqual([[-3, 1, 5], [9, 10, 5]]);
  });

  it('one sentence per line, then the external tangent (#2553): the exam’s A(0,−3), B(12,6)', () => {
    const d = built(split.lines, split.seed);
    expect(circles(d)).toEqual([[-3, 1, 5], [9, 10, 5]]);
    expect([at(d, 'O₁'), at(d, 'O₂'), at(d, 'A'), at(d, 'B')]).toEqual([[-3, 1], [9, 10], [0, -3], [12, 6]]);
  });
});

describe('#2552 — «שני מעגלים שרדיוס כל אחד מהם r» sizes both circles', () => {
  const values: Array<[string, number]> = [['5', 5], ['3', 3], ['2.5', 2.5], ['2√3', 2 * Math.sqrt(3)]];
  it.each(values)('radius %s', (v, r) => {
    const d = built([`נתונים שני מעגלים שרדיוס כל אחד מהם ${v}`, 'מרכז המעגל הראשון הוא A(0,0)', 'מרכז המעגל השני הוא B(10,0)']);
    expect(circles(d)).toEqual([[0, 0, round(r)], [10, 0, round(r)]]);
  });

  it('a radius letter is one free radius for both', () => {
    for (const seed of SEEDS) {
      const d = built(['נתונים שני מעגלים שרדיוס כל אחד מהם r', 'מרכז המעגל הראשון הוא A(0,0)', 'מרכז המעגל השני הוא B(10,0)'], seed);
      const radii = (d.figure.curves as Array<{ curve: { kind: string; r?: number } }>).filter((k) => k.curve.kind === 'circle').map((k) => round(k.curve.r!));
      expect(radii.length, `seed ${seed}`).toBe(2);
      expect(radii[0], `seed ${seed}`).toBe(radii[1]);
    }
  });

  it('REFUSAL: a capital as the radius is taught lowercase (capital-magnitude), as «מעגל ברדיוס K» is', () => {
    expect(last(['נתונים שני מעגלים שרדיוס כל אחד מהם K'])).toMatchObject({ kind: 'refused', error: { key: 'capital-magnitude' } });
  });

  it('without «נתונים», and in English', () => {
    for (const line of ['שני מעגלים שרדיוס כל אחד מהם 4', 'two circles each of radius 4']) {
      const d = built([line, 'מרכז המעגל הראשון הוא A(0,0)', 'מרכז המעגל השני הוא B(10,0)']);
      expect(circles(d), line).toEqual([[0, 0, 4], [10, 0, 4]]);
    }
  });
});

describe('#2552 — «מרכז המעגל הראשון / השני הוא X(a,b)» names and places that circle’s centre', () => {
  it('either order, every seed', () => {
    for (const seed of SEEDS) {
      for (const order of [[0, 1], [1, 0]]) {
        const lines = ['מרכז המעגל הראשון הוא O_1(-3,1)', 'מרכז המעגל השני הוא O_2(9,10)'];
        const d = built([PAIR, lines[order[0]], lines[order[1]]], seed);
        expect([at(d, 'O₁'), at(d, 'O₂')], `seed ${seed}`).toEqual([[-3, 1], [9, 10]]);
        expect(circles(d)).toEqual([[-3, 1, 5], [9, 10, 5]]);
      }
    }
  });

  it('the subscript spellings and the Unicode minus are the same sentence', () => {
    for (const [line, id] of [['מרכז המעגל הראשון הוא O_1(−3,1)', 'O₁'], ['מרכז המעגל הראשון הוא O₁(-3, 1)', 'O₁'], ['מרכז המעגל הראשון הוא O1(−3, 1)', 'O1']]) {
      expect(at(built([PAIR, line]), id), line).toEqual([-3, 1]);
    }
  });

  it('English: "the centre of the first circle is O_1(-3,1)"', () => {
    expect(at(built([PAIR, 'the centre of the first circle is O_1(-3,1)']), 'O₁')).toEqual([-3, 1]);
  });

  it('typed again, it is already known', () => {
    expect(last([PAIR, 'מרכז המעגל הראשון הוא O_1(-3,1)', 'מרכז המעגל הראשון הוא O_1(-3,1)']).kind).toBe('already-known');
  });

  it('REFUSAL: a second letter for a centre already named is refused naming the holder (already-named)', () => {
    const v = last([PAIR, 'מרכז המעגל הראשון הוא O_1(-3,1)', 'מרכז המעגל הראשון הוא P(1,1)']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'already-named' } });
  });

  it('with no pair drawn, the circle is created on X, as «X מרכז המעגל» creates it', () => {
    expect(at(built(['מרכז המעגל הראשון הוא O_1(-3,1)']), 'O₁')).toEqual([-3, 1]);
  });
});

describe('#2552 — controls: what was read before is read the same', () => {
  it('«O_1 מרכז מעגל» then «O_2 מרכז מעגל» still name the pair’s centres in turn', () => {
    const d = built([PAIR, 'O_1 מרכז מעגל', 'O_2 מרכז מעגל', 'O_1(-3,1)', 'O_2(9,10)']);
    expect(circles(d)).toEqual([[-3, 1, 5], [9, 10, 5]]);
  });
  it('«O מרכז המעגל» on a lone circle is unchanged (already known)', () => {
    expect(last(['מעגל O', 'O מרכז המעגל']).kind).toBe('already-known');
  });
});

describe('#2552 — D8 = B: the near-variants still go to the AI (not-handled)', () => {
  const variants: string[][] = [
    ['שני מעגלים שרדיוסם 5'],
    ['שני מעגלים ברדיוס 5'],
    ['שני מעגלים', 'מרכז מעגל O_1(-3,1)'],
    ['שני מעגלים', 'O_1 מרכז המעגל הראשון'],
    ['נתונים שני מעגלים', 'רדיוס המעגל האחד הוא 5'],
    ['מעגל O_1 שמרכזו (-3,1) ורדיוסו 5'],
  ];
  it.each(variants.map((v) => [v[v.length - 1], v] as const))('«%s»', (_l, lines) => {
    expect(last(lines)).toMatchObject({ kind: 'refused', error: { key: 'not-handled' } });
  });
});
