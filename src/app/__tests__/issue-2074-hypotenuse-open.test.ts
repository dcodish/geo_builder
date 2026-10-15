/**
 * #2074 ([ADR-659](../../../docs/06-decisions.md#adr-659)) — «תיכון ליתר» ON A RIGHT TRIANGLE WITH NO STATED RIGHT
 * ANGLE DRAWS ON THE TRIANGLE AS SHOWN; THE RIGHT-ANGLE VERTEX IS A FREE CHOICE «הציגו תצורה אחרת» CYCLES.
 *
 * Operator, 2026-10-13 (round #2053's T16): *"תיכון ליתר should be drawn using whats currently showing but we need to
 * have dof and show other option will create a different triangle with the constraints in place"*. Ruling 2026-10-14:
 * naming C («CM תיכון ליתר») or AB («תיכון ליתר AB») forces the seat.
 *
 * Measured on c00a9d28 through `decideDeterministic2D`: every spelling below was asked with ADR-639's hypotenuse
 * question. Root cause: the open seat was read as "no hypotenuse", so the ADR-596 binding the isosceles base already
 * uses was never offered. Now `roleSidesOf` yields the open triangle's hypotenuse at its effective seat (`unstated`),
 * the noun alone binds to it, and the fold rotates the line with `rot`.
 *
 * Through the app's own decision and the store; the presses through `searchAnotherView` (the button). The model is
 * mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { firstSatisfyingSeed, searchAnotherView } from '@/replay/core';

const st = () => useGeoStore.getState();
type P = { x: number; y: number };
type V = { kind: string; note?: { key?: string } };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    if (v.kind === 'commit') commitVerdict(v as never, line);
  }
  return { verdicts, last: verdicts.at(-1)!, facts: st().facts };
}

const angleAt = (p: Map<string, P>, v: string, a: string, b: string) => {
  const V = p.get(v)!, A = p.get(a)!, B = p.get(b)!;
  return (Math.acos(((A.x - V.x) * (B.x - V.x) + (A.y - V.y) * (B.y - V.y)) / Math.hypot(A.x - V.x, A.y - V.y) / Math.hypot(B.x - V.x, B.y - V.y)) * 180) / Math.PI;
};
const TRI = ['A', 'B', 'C'];
const seatOf = (p: Map<string, P>) => TRI.find((v) => Math.abs(angleAt(p, v, ...(TRI.filter((x) => x !== v) as [string, string])) - 90) < 1e-4);
/** The side of ABC the point `foot` lies on (strictly within it), or null. */
const sideOf = (p: Map<string, P>, foot: string) => {
  const F = p.get(foot)!;
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['A', 'C']]) {
    const A = p.get(a)!, B = p.get(b)!;
    if (Math.abs(Math.hypot(F.x - A.x, F.y - A.y) + Math.hypot(F.x - B.x, F.y - B.y) - Math.hypot(A.x - B.x, A.y - B.y)) < 1e-6) return a + b;
  }
  return null;
};
/** The default view and `n` presses of «הציגו תצורה אחרת»: each view's seat and the side its foot is on. */
function presses(facts: Fact[], foot: string, n = 3) {
  let cur: { facts: Fact[]; seed: number } | null = { facts, seed: firstSatisfyingSeed(facts) };
  const out: { seat?: string; side: string | null; green: boolean }[] = [];
  for (let k = 0; k <= n && cur; k++) {
    const r = replay(cur.facts, cur.seed);
    const p = r.positions as Map<string, P>;
    out.push({ seat: seatOf(p), side: sideOf(p, foot), green: Object.values(r.status).every((s) => s === 'ok') && r.violations.length === 0 });
    cur = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
  }
  return out;
}
const opposite = (seat?: string) => TRI.filter((x) => x !== seat).join('');

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const RT = 'משולש ישר-זווית ABC';

describe('#2074 — the role noun alone draws on the shown triangle and follows the seat', () => {
  const SPELLINGS: [string, string, string, 'he' | 'en'][] = [
    [RT, 'תיכון ליתר', 'M', 'he'],
    [RT, 'התיכון ליתר', 'M', 'he'],
    [RT, 'גובה ליתר', 'F', 'he'],
    ['right triangle ABC', 'the median to the hypotenuse', 'M', 'en'],
    ['right triangle ABC', 'the altitude to the hypotenuse', 'F', 'en'],
  ];
  for (const [noun, line, foot, lang] of SPELLINGS) {
    it(`«${noun}» · «${line}»: built on the shown seat C, A/B/C unmoved, and every press moves the seat with the line`, async () => {
      const g = await play([noun, line], lang);
      expect(g.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit']);
      const before = replay(g.facts.slice(0, 1), 0).positions;
      const after = replay(g.facts, 0).positions as Map<string, P>;
      for (const id of TRI) expect(Math.hypot(after.get(id)!.x - before.get(id)!.x, after.get(id)!.y - before.get(id)!.y), `${id} unmoved`).toBeLessThan(1e-9);
      const views = presses(g.facts, foot);
      expect(views.map((v) => v.seat)).toEqual(['C', 'A', 'B', 'C']);
      for (const v of views) {
        expect(v.green, 'every view green').toBe(true);
        expect(v.side, `the ${foot === 'M' ? 'median' : 'altitude'} lands on the side opposite the right angle`).toBe(opposite(v.seat));
      }
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

describe('#2074 — a typed letter is a claim that forces the seat', () => {
  for (const [line, apex, foot] of [['CM תיכון ליתר', 'C', 'M'], ['AM תיכון ליתר', 'A', 'M'], ['גובה ליתר מ-C', 'C', 'F']] as const) {
    it(`«${line}» puts the right angle at ${apex}, and no press moves it`, async () => {
      const g = await play([RT, line]);
      expect(g.last.kind).toBe('commit');
      expect(g.facts.some((f) => (f.cmd as { roleSide?: unknown }).roleSide), 'no binding: the letter is the student’s').toBe(false);
      for (const v of presses(g.facts, foot)) {
        expect(v.green).toBe(true);
        expect(v.seat).toBe(apex);
        expect(v.side).toBe(opposite(apex));
      }
    });
  }

  it('«תיכון ליתר AB» is unchanged: the right angle stays at C', async () => {
    const g = await play([RT, 'תיכון ליתר AB']);
    for (const v of presses(g.facts, 'M')) {
      expect(v.seat).toBe('C');
      expect(v.side).toBe('AB');
    }
  });
});

describe('#2074 — a right angle stated AFTER the line settles the seat, and the median follows (ADR-596 / FR-ALT-7)', () => {
  it('«תיכון ליתר» · «זווית A ישרה»: the median runs from A to BC at every view', async () => {
    const g = await play([RT, 'תיכון ליתר', 'זווית A ישרה']);
    expect(g.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
    for (const v of presses(g.facts, 'M')) {
      expect(v.green).toBe(true);
      expect(v.seat).toBe('A');
      expect(v.side).toBe('BC');
    }
  });
});

describe('#2074 — what still asks', () => {
  it('two right triangles, neither seated: no single host — the no-single-side question', async () => {
    const g = await play([RT, 'משולש ישר-זווית DEF', 'תיכון ליתר']);
    expect(g.last.kind).toBe('refuse');
    expect(g.last.note?.key).toBe('input.roleSideUnresolved');
  });

  it('«תיכון ליתר בנקודה K» gets the verdict its stated-angle twin gets (the foot-letter reading is a separate gap)', async () => {
    const open = await play([RT, 'תיכון ליתר בנקודה K']);
    const stated = await play([RT, 'זווית C ישרה', 'תיכון ליתר בנקודה K']);
    expect(open.last.kind).toBe(stated.last.kind);
  });
});
