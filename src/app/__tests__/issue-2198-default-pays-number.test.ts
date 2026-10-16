/**
 * #2198 ([ADR-677](../../../docs/06-decisions.md#adr-677), [ADR-678](../../../docs/06-decisions.md#adr-678)) — a stated
 * number is accounted only by a lowering that READS it, never by a value the tool chose.
 *
 * Measured at ef78f15c through `decideDeterministic2D` → `commitVerdict` → `replay`, model mocked: «שני מעגלים נחתכים
 * ברדיוס 5» committed GREEN with radii 5 / 3.6 (the 5 paid by the free default radius); «…ברדיוס 4» escalated. The
 * same collision on a line marker's ±5 («AB משיק למעגל O ואורכו 5» drew AB = 10), an apex's free x = 12 («…שמרחקה
 * מ-O הוא 12…»), and the k = 1 of «שווים» («…ברדיוסים שווים ל-1»).
 *
 * Operator ruling 2026-10-16 (#2216 card 4, transcribed on #2198): the singular «ברדיוס N» on a two-circle sentence
 * gives BOTH circles radius N — "the same figure as the three-line form"; «משיקים ברדיוס 5» and «זרים ברדיוס 5» read
 * the same way. So those lines BUILD, at N, for every N; every other line of the class gets exactly the answer its
 * twin with another number gets (escalate), never a figure with the number dropped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { runEditCommit, type EditDeps } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

type P = Map<string, { x: number; y: number }>;
const len = (p: P, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
const lang = (line: string): 'he' | 'en' => (/[א-ת]/.test(line) ? 'he' : 'en');

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lang(line));
}

/** Drive the sequence; it must commit green and verified. Returns the facts. */
function build(lines: string[]) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return facts;
}

const radii = (facts: ReturnType<typeof build>, seed: number) => [...replay(facts, seed).circles.values()].map((c) => c.r);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2198 — the operator ruling: one «ברדיוס N» on a two-circle sentence sizes BOTH circles', () => {
  const READ: string[] = [
    'שני מעגלים נחתכים ברדיוס N', // the report
    'שני מעגלים נחתכים בנקודות A ו-B ברדיוס N',
    'שני מעגלים נחתכים, רדיוס כל אחד N',
    'שני מעגלים נחתכים שרדיוס כל אחד מהם N',
    'two intersecting circles with radius N',
    'שני מעגלים זרים ברדיוס N', // ruling: «זרים ברדיוס 5» reads the same way
    'שני מעגלים משיקים ברדיוס N', // ruling: «משיקים ברדיוס 5» reads the same way
    'two tangent circles with radius N',
    'two disjoint circles each with radius N',
    'AB משיק משותף חיצוני לשני מעגלים ברדיוס N',
    'ישר חותך את שני מעגלים ברדיוס N בנקודות C, D, E ו-F',
  ];
  for (const tpl of READ) {
    it.each([5, 4])(`«${tpl}» with N = %d → both radii N at seeds 0–3, the model never asked`, async (n) => {
      const line = tpl.replace('N', String(n));
      const v = await decide([], line);
      expect(v.kind, line).toBe('commit');
      const facts = build([line]);
      for (const seed of [0, 1, 2, 3]) {
        const r = radii(facts, seed);
        expect(r.length).toBe(2);
        for (const x of r) expect(x, `seed ${seed}`).toBeCloseTo(n, 9);
      }
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the figure is the three-line form’s: two radius-5 circles crossing at A and B', () => {
    const one = build(['שני מעגלים נחתכים ברדיוס 5']);
    const three = build(['שני מעגלים נחתכים', 'רדיוס מעגל O הוא 5', 'רדיוס מעגל P הוא 5']);
    for (const facts of [one, three]) {
      const fig = replay(facts, 0);
      const circles = [...fig.circles.values()];
      expect(circles.map((c) => c.r)).toEqual([5, 5]);
      for (const X of ['A', 'B']) {
        const x = fig.positions.get(X)!;
        for (const c of circles) expect(Math.hypot(x.x - c.center.x, x.y - c.center.y)).toBeCloseTo(5, 6);
      }
      expect(len(fig.positions, 'A', 'B')).toBeGreaterThan(1e-3);
    }
  });

  it('24-seed whole-rate on the report: every seed draws two radius-5 circles that cross twice', () => {
    const facts = build(['שני מעגלים נחתכים ברדיוס 5']);
    let whole = 0;
    for (let seed = 0; seed < 24; seed++) {
      const fig = replay(facts, seed);
      const ok =
        fig.lastError === null &&
        fig.violations.length === 0 &&
        [...fig.circles.values()].every((c) => Math.abs(c.r - 5) < 1e-9) &&
        len(fig.positions, 'A', 'B') > 1e-3;
      if (ok) whole++;
    }
    expect(whole).toBe(24);
  });

  it('a radius that is ONE named circle’s own size is not read as the pair’s', () => {
    // «…, מעגל O ברדיוס 5» sizes O only (the circle rule's reading), never both
    const facts = build(['שני מעגלים נחתכים, מעגל O ברדיוס 5']);
    for (const seed of [0, 1, 2, 3]) expect(replay(facts, seed).circles.get('circle-O')!.r).toBeCloseTo(5, 9);
    expect(replay(facts, 1).circles.get('circle-P')!.r).not.toBeCloseTo(5, 3);
  });
});

describe('#2198 — every other member of the class escalates exactly as its twin with another number does', () => {
  const ROWS: [string[], string, string][] = [
    [[], 'שני מעגלים בעלי מרכז משותף O ברדיוס 5', 'שני מעגלים בעלי מרכז משותף O ברדיוס 4'],
    [[], 'שני מעגלים מוכלים ברדיוס 5', 'שני מעגלים מוכלים ברדיוס 4'],
    [[], 'שני מעגלים משיקים ברדיוסים שווים ל-5', 'שני מעגלים משיקים ברדיוסים שווים ל-4'],
    [[], 'שני מעגלים משיקים ברדיוסים שווים ל-1', 'שני מעגלים משיקים ברדיוסים שווים ל-2'], // k = 1, a structural constant
    [['מעגל O'], 'AB משיק למעגל O ואורכו 5', 'AB משיק למעגל O ואורכו 4'], // the ±5 line markers
    [['מעגל O'], 'מנקודה E שמרחקה מ-O הוא 12 יוצא משיק למעגל O', 'מנקודה E שמרחקה מ-O הוא 13 יוצא משיק למעגל O'], // the apex's x = 12
  ];
  for (const [prefix, line, twin] of ROWS) {
    it(`«${line}» → escalate (weak: dropped), as «${twin}»`, async () => {
      const v = await decide(prefix, line);
      const w = await decide(prefix, twin);
      expect(v.kind, line).toBe('escalate');
      expect(w.kind, twin).toBe('escalate');
      expect(v.kind === 'escalate' && v.weak).toBe('dropped');
      expect(w.kind === 'escalate' && w.weak).toBe('dropped');
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the ✎ editor refuses the same edit (steps.editDropped), nothing committed', () => {
    for (const [, line] of ROWS.filter(([p]) => p.length === 0)) {
      useGeoStore.getState().clear();
      driveThroughGate(['שני מעגלים']);
      const facts = useGeoStore.getState().facts;
      const key = groupKey(facts[facts.length - 1]);
      const before = useGeoStore.getState().facts.length;
      const notes: string[] = [];
      const deps: EditDeps = { t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} };
      expect(runEditCommit(key, line, deps), line).toBe(false);
      expect(useGeoStore.getState().facts.length).toBe(before);
      expect(notes.at(-1), line).toMatch(/^steps\.editDropped/);
    }
  });
});

describe('#2198 — controls: a number the reading reads is kept, at every seed', () => {
  it.each([
    [['מעגל O ברדיוס 5'], (f: ReturnType<typeof build>, s: number) => replay(f, s).circles.get('circle-O')!.r, 5],
    [['משולש שווה צלעות ABC שצלעו 3'], (f: ReturnType<typeof build>, s: number) => len(replay(f, s).positions, 'A', 'B'), 3],
    [['מעגל O', 'AB משיק למעגל O', 'AB=5'], (f: ReturnType<typeof build>, s: number) => len(replay(f, s).positions, 'A', 'B'), 5],
    [['מעגל O', 'מנקודה E יוצא משיק למעגל O', 'OE=12'], (f: ReturnType<typeof build>, s: number) => len(replay(f, s).positions, 'O', 'E'), 12],
    [['שני מעגלים נחתכים', 'רדיוס מעגל O הוא 5'], (f: ReturnType<typeof build>, s: number) => replay(f, s).circles.get('circle-O')!.r, 5],
  ] as const)('%j', (lines, measure, want) => {
    const facts = build([...lines]);
    for (const seed of [0, 1, 2, 3]) expect(measure(facts, seed), `seed ${seed}`).toBeCloseTo(want, 4); // solver tolerance
  });

  it('unchanged: respective radii, the bare pair, a drawn pair and internal tangency stay out of the reading', async () => {
    expect((await decide([], 'שני מעגלים נחתכים ברדיוסים 3 ו-5')).kind).toBe('escalate');
    expect((await decide([], 'שני מעגלים ברדיוס 5')).kind).toBe('escalate');
    expect((await decide([], 'שני מעגלים משיקים מבפנים ברדיוס 5')).kind).toBe('escalate');
    expect((await decide(['מעגל O', 'מעגל P'], 'המעגלים O ו-P נחתכים ברדיוס 5')).kind).toBe('escalate');
  });
});
