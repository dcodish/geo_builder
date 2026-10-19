/**
 * #2185 ([ADR-735](../../../docs/06-decisions.md#adr-735)) — A POINT STATED ON SEVERAL CARRIERS IS PUT ON EACH, OR THE
 * LINE IS NOT COMMITTED.
 *
 * Measured at `062d059b` through `decideDeterministic2D` → `commitVerdict` → `replay`: «A על מעגל O ועל מעגל P» committed
 * green with A on circle O only; «A על מעגל O ו-B על מעגל P» put B on circle O (swapped); «A ו-B … בהתאמה» put both on
 * O; «P על האלכסון AC ועל האלכסון BD» left P off BD. Four mechanisms: no reader for the carrier list, the on-circle
 * post-pass bound every subject to one circle, the label accountant excused any circle NAME once a circle was
 * touched, and the clause-coverage gate excused a different incidence on the same point.
 *
 * Membership is read off the replayed positions (|centre·X| − r < 1e-6; collinearity for a line carrier). The model is
 * mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';

const st = () => useGeoStore.getState();

async function play(pre: string[], last: string, lang: 'he' | 'en' = 'he') {
  st().clear();
  const submit = async (line: string) => {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, lang);
    commitVerdict(v, line);
    return v;
  };
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const n0 = st().facts.length;
  const v = await submit(last);
  return { kind: v.kind, note: (v as { note?: { key?: string } }).note?.key, added: st().facts.length - n0 };
}

/** Is point X on circle K (centre K) / on line AB, as drawn at `seed`? */
function onCircle(x: string, k: string, seed = st().seed): boolean {
  const r = replay(st().facts, seed);
  const p = r.positions.get(x), c = r.positions.get(k), g = r.circles.get(`circle-${k}`);
  return !!p && !!c && !!g && Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - g.r) < 1e-6;
}
function onLine(x: string, a: string, b: string, seed = st().seed): boolean {
  const r = replay(st().facts, seed);
  const p = r.positions.get(x)!, A = r.positions.get(a)!, B = r.positions.get(b)!;
  return Math.abs((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y) < 1e-6;
}
function green() {
  const r = replay(st().facts, st().seed);
  expect(r.violations).toEqual([]);
  expect(r.lastError).toBeNull();
  expect(llmParseMock).not.toHaveBeenCalled();
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const PAIR_EN = ['circle O', 'circle P'];

describe('#2185 — one point on several circles: on each (the two-line meaning)', () => {
  const LIST = [
    'A על מעגל O ועל מעגל P', // the report
    'A נקודה על מעגל O ועל מעגל P', // the operator's second line, verbatim
    'A נמצאת על מעגל O ועל מעגל P',
    'הנקודה A נמצאת על מעגל O ועל מעגל P',
    'A על מעגל O וגם על מעגל P',
    'A על מעגל O, A על מעגל P', // comma, subject repeated
    'A על מעגל P ועל מעגל O', // mirrored
  ];
  for (const line of LIST)
    it(`«${line}» → A on O and on P`, async () => {
      expect((await play(PAIR, line)).kind).toBe('commit');
      expect(onCircle('A', 'O')).toBe(true);
      expect(onCircle('A', 'P')).toBe(true);
      green();
    });
  it('«F על המעגל O ועל המעגל P» → F on both', async () => {
    expect((await play(PAIR, 'F על המעגל O ועל המעגל P')).kind).toBe('commit');
    expect(onCircle('F', 'O') && onCircle('F', 'P')).toBe(true);
    green();
  });
  it('English: "A on circle O and on circle P" → A on both', async () => {
    expect((await play(PAIR_EN, 'A on circle O and on circle P', 'en')).kind).toBe('commit');
    expect(onCircle('A', 'O') && onCircle('A', 'P')).toBe(true);
    green();
  });
  it('three circles: «A על מעגל O, על מעגל P ועל מעגל Q» → A on all three', async () => {
    expect((await play([...PAIR, 'מעגל Q'], 'A על מעגל O, על מעגל P ועל מעגל Q')).kind).toBe('commit');
    expect(onCircle('A', 'O') && onCircle('A', 'P') && onCircle('A', 'Q')).toBe(true);
    green();
  });
  it('the same figure as the two lines: the second circle grows through A (P stays seated, O keeps its radius)', async () => {
    await play(PAIR, 'A על מעגל O ועל מעגל P');
    const one = replay(st().facts, st().seed);
    await play([...PAIR, 'A על מעגל O'], 'A על מעגל P');
    const two = replay(st().facts, st().seed);
    for (const c of ['circle-O', 'circle-P']) expect(one.circles.get(c)!.r).toBeCloseTo(two.circles.get(c)!.r, 9);
    for (const id of ['O', 'P', 'A']) expect(Math.hypot(one.positions.get(id)!.x - two.positions.get(id)!.x, one.positions.get(id)!.y - two.positions.get(id)!.y)).toBeLessThan(1e-9);
  });
  it('an empty-but-one figure: «A על מעגל O ועל מעגל P» with P not drawn is never committed with P dropped', async () => {
    const r = await play(['מעגל O'], 'A על מעגל O ועל מעגל P');
    if (r.kind === 'commit') expect(onCircle('A', 'O') && onCircle('A', 'P')).toBe(true);
    else expect(r.added).toBe(0);
  });
});

describe('#2185 — several points on several circles', () => {
  for (const [line, lang, pre] of [
    ['A ו-B על מעגל O ועל מעגל P', 'he', PAIR],
    ['הנקודות A ו-B נמצאות על מעגל O ועל מעגל P', 'he', PAIR],
    ['A and B on circle O and on circle P', 'en', PAIR_EN],
  ] as const)
    it(`«${line}» → A and B on both circles`, async () => {
      expect((await play([...pre], line, lang)).kind).toBe('commit');
      for (const x of ['A', 'B']) for (const k of ['O', 'P']) expect(onCircle(x, k), `${x} on ${k}`).toBe(true);
      green();
    });

  // The 24-seed whole-rate (docs/17 §9). MEASURED: 10/24 seeds draw A and B distinct — at the other 14 the two free
  // points fall onto the same crossing of the two circles. The two-line form «A ו-B על מעגל O» · «A ו-B על מעגל P» does
  // exactly the same, seed for seed, so it is the engine's reading of two free points on two circles, not this
  // distribution; filed as found work (#2185 ADR-735). The lock: the one line IS the two lines at every seed.
  it('the 24-seed sweep: the one line draws what the two lines draw, seed for seed (A, B on both circles)', async () => {
    const sweep = () => Array.from({ length: 24 }, (_, seed) => {
      const r = replay(st().facts, seed);
      const A = r.positions.get('A')!, B = r.positions.get('B')!;
      expect(['A', 'B'].every((x) => ['O', 'P'].every((k) => onCircle(x, k, seed))), `seed ${seed} on both`).toBe(true);
      return Math.hypot(A.x - B.x, A.y - B.y) > 1e-3;
    });
    await play(PAIR, 'A ו-B על מעגל O ועל מעגל P');
    const one = sweep();
    await play([...PAIR, 'A ו-B על מעגל O'], 'A ו-B על מעגל P');
    expect(one).toEqual(sweep());
    expect(one[0], 'the displayed seed draws two distinct points').toBe(true);
  });

  for (const [line, lang, pre] of [
    ['A ו-B על מעגל O ועל מעגל P בהתאמה', 'he', PAIR],
    ['הנקודות A ו-B נמצאות על מעגל O ועל מעגל P בהתאמה', 'he', PAIR],
    ['A and B on circle O and on circle P respectively', 'en', PAIR_EN],
  ] as const)
    it(`«${line}» → A on O, B on P (paired)`, async () => {
      expect((await play([...pre], line, lang)).kind).toBe('commit');
      expect(onCircle('A', 'O')).toBe(true);
      expect(onCircle('B', 'P')).toBe(true);
      green();
    });
});

describe('#2185 — each point on its own circle (the per-point line)', () => {
  const ROWS: [string, [string, string][]][] = [
    ['A על מעגל O ו-B על מעגל P', [['A', 'O'], ['B', 'P']]],
    ['A על מעגל P ו-B על מעגל O', [['A', 'P'], ['B', 'O']]], // mirrored
    ['A על מעגל O, B על מעגל P', [['A', 'O'], ['B', 'P']]],
    ['A ו-B על מעגל O ו-C על מעגל P', [['A', 'O'], ['B', 'O'], ['C', 'P']]],
    ['A על מעגל O ו-B על מעגל P ו-C על מעגל O', [['A', 'O'], ['B', 'P'], ['C', 'O']]],
    ['A על מעגל O ו-B על מעגל P כך ש-AB=5', [['A', 'O'], ['B', 'P']]],
    ['AB קוטר במעגל O ו-C על מעגל P', [['A', 'O'], ['B', 'O'], ['C', 'P']]],
  ];
  for (const [line, want] of ROWS)
    it(`«${line}» → ${want.map(([x, k]) => `${x}∈${k}`).join(', ')}`, async () => {
      expect((await play(PAIR, line)).kind).toBe('commit');
      for (const [x, k] of want) expect(onCircle(x, k), `${x} on ${k}`).toBe(true);
      // the swap is gone: no point sits on the OTHER circle it was not stated on
      for (const [x, k] of want) if (!want.some(([y, j]) => y === x && j !== k)) expect(onCircle(x, k === 'O' ? 'P' : 'O'), `${x} not on the other circle`).toBe(false);
      green();
    });
  it('English: "A on circle O and B on circle P" builds each on its own (was the split-statements refusal)', async () => {
    expect((await play(PAIR_EN, 'A on circle O and B on circle P', 'en')).kind).toBe('commit');
    expect(onCircle('A', 'O') && onCircle('B', 'P')).toBe(true);
    expect(onCircle('B', 'O')).toBe(false);
    green();
  });
});

describe('#2185 — lines, diagonals and mixed carriers', () => {
  it('after «ריבוע ABCD»: «P על האלכסון AC ועל האלכסון BD» → P on both diagonals at every seed', async () => {
    expect((await play(['ריבוע ABCD'], 'P על האלכסון AC ועל האלכסון BD')).kind).toBe('commit');
    for (const seed of [0, 1, 2, 3]) expect(onLine('P', 'A', 'C', seed) && onLine('P', 'B', 'D', seed), `seed ${seed}`).toBe(true);
    green();
  });
  for (const line of ['P על AC ועל BD', 'P על הישר AC ועל הישר BD'])
    it(`after «ריבוע ABCD»: «${line}» → P on both`, async () => {
      expect((await play(['ריבוע ABCD'], line)).kind).toBe('commit');
      expect(onLine('P', 'A', 'C') && onLine('P', 'B', 'D')).toBe(true);
      green();
    });
  for (const line of ['C על מעגל O ועל הישר AB', 'C על הישר AB ועל מעגל O'])
    it(`after «מעגל O» · «ישר AB»: «${line}» → C on both (or refused, never a drop)`, async () => {
      const r = await play(['מעגל O', 'ישר AB'], line);
      if (r.kind === 'commit') expect(onCircle('C', 'O') && onLine('C', 'A', 'B')).toBe(true);
      else expect(r.added).toBe(0);
    });
  it('«D על AB ועל מעגל O» → D on both (or refused, never a drop)', async () => {
    const r = await play(['מעגל O', 'קטע AB'], 'D על AB ועל מעגל O');
    if (r.kind === 'commit') expect(onCircle('D', 'O') && onLine('D', 'A', 'B')).toBe(true);
    else expect(r.added).toBe(0);
  });
});

describe('#2185 — controls (unchanged at 062d059b)', () => {
  it('«A על מעגל O» → A on O', async () => {
    expect((await play(PAIR, 'A על מעגל O')).kind).toBe('commit');
    expect(onCircle('A', 'O')).toBe(true);
    expect(onCircle('A', 'P')).toBe(false);
  });
  it('«A ו-C נמצאות על המעגל» (one circle) → both on it', async () => {
    expect((await play(['מעגל O'], 'A ו-C נמצאות על המעגל')).kind).toBe('commit');
    expect(onCircle('A', 'O') && onCircle('C', 'O')).toBe(true);
  });
  it('«D על מעגל O ו-E על AB» keeps its one-at-a-time advisory and each carrier', async () => {
    const r = await play(['מעגל O', 'קטע AB'], 'D על מעגל O ו-E על AB');
    expect(r.kind).toBe('commit');
    expect(r.note).toBe('input.scope.split-advisory');
    expect(onCircle('D', 'O') && onLine('E', 'A', 'B')).toBe(true);
  });
  it('«D ו-E על AB ועל AC בהתאמה» → D on AB, E on AC, no advisory', async () => {
    const r = await play(['משולש ABC'], 'D ו-E על AB ועל AC בהתאמה');
    expect(r.kind).toBe('commit');
    expect(r.note).toBeUndefined();
    expect(onLine('D', 'A', 'B') && onLine('E', 'A', 'C')).toBe(true);
  });
  it('«D על מעגל O כך ש-D על מעגל P» → D on both', async () => {
    expect((await play(PAIR, 'D על מעגל O כך ש-D על מעגל P')).kind).toBe('commit');
    expect(onCircle('D', 'O') && onCircle('D', 'P')).toBe(true);
  });
  it('«A נקודת חיתוך של מעגל O ומעגל P» → the crossing', async () => {
    expect((await play(PAIR, 'A נקודת חיתוך של מעגל O ומעגל P')).kind).toBe('commit');
    expect(onCircle('A', 'O') && onCircle('A', 'P')).toBe(true);
  });
});

describe('#2185 — an arc named on a circle lives on that circle; a named circle is never swapped (ruling 2026-10-18)', () => {
  // The scenario `arc-resolves-to-circle-holding-both-endpoints`' prefix: circle O through A, B, E, D; circle P through
  // A, B, C. C is NOT on O. Before ADR-735 the arc rule redrew «… במעגל O» on circle P (the ADR-042 override), green.
  const ARC = ['משולש CDE', 'A על CD', 'B על CE', 'מרובע ABED חסום במעגל', 'משולש ABC חסום במעגל'];
  for (const line of ['F אמצע הקשת BC במעגל O', 'F על הקשת BC במעגל O'])
    it(`«${line}» (C not on O) is never committed — it goes to the AI, never redrawn on P`, async () => {
      const r = await play(ARC, line);
      expect(r.kind).not.toBe('commit');
      expect(r.added).toBe(0);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  for (const line of ['F אמצע הקשת BC', 'F אמצע הקשת BC במעגל P'])
    it(`«${line}» commits on circle P (F on P at seeds 0–3)`, async () => {
      expect((await play(ARC, line)).kind).toBe('commit');
      for (const seed of [0, 1, 2, 3]) expect(onCircle('F', 'P', seed), `seed ${seed}`).toBe(true);
      green();
    });
});

describe('#2185 — a «בהתאמה»-closed label run is an operand, never a clause', () => {
  it('«AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה» on an empty figure still builds the corner tangency', async () => {
    expect((await play([], 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה')).kind).toBe('commit');
    const r = replay(st().facts, st().seed);
    const P = (id: string) => r.positions.get(id)!;
    const circle = [...r.circles.entries()].find(([, g]) => Math.abs(Math.hypot(P('A').x - g.center.x, P('A').y - g.center.y) - g.r) < 1e-6);
    expect(circle, 'A on a circle').toBeTruthy();
    const g = circle![1];
    expect(Math.abs(Math.hypot(P('C').x - g.center.x, P('C').y - g.center.y) - g.r)).toBeLessThan(1e-6); // C on the same circle
    const dot = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.x - a.x) + (a.y - o.y) * (b.y - a.y);
    expect(Math.abs(dot(g.center, P('A'), P('B')))).toBeLessThan(1e-6); // centre·A ⟂ AB
    expect(Math.abs(dot(g.center, P('C'), P('B')))).toBeLessThan(1e-6); // centre·C ⟂ CB
    green();
  });
});
