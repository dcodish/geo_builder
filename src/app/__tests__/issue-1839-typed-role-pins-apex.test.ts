/**
 * #1839 ([ADR-708](../../../docs/06-decisions.md#adr-708)) — A ROLE STATED ABOUT TYPED LETTERS PINS THE ISOSCELES
 * CONFIGURATION: «הציגו תצורה אחרת» never offers a drawing in which the stated role is false.
 *
 * Ruling (the record, 2026-10-07: FR-IN-13 and charter P13 *"a drawing that breaks a given is not one of the
 * configurations"*): a typed «AD גובה לבסיס» stays a height to the base after the button; «BE גובה לשוק AC» is never
 * drawn where AC is the base; «AB = BC» after «AD גובה לבסיס» is the equilateral triangle.
 *
 * Measured on b0e9dbea through `decideDeterministic2D` + `searchAnotherView`: the apex walked A → B → C under every
 * typed spelling but the three that name the base's own letters («…לבסיס BC»). Root cause: ADR-596 keeps typed letters
 * literal and attaches no binding, and only the «הבסיס BC» spelling reached `withRoleClaims`' claim, so nothing stated
 * the role for a typed apex («AD … לבסיס»), the apex angle («חוצה זווית הראש») or a leg («לשוק AC», which stated
 * nothing at all). Now one lowering (`isoscelesRoleClaim`) states it for every spelling: the base equality, or the
 * leg requirement the verifier judges.
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
import { searchAnotherView } from '@/replay/core';
import { checkGivens, roleSidesOf } from '@/engine';

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
  return { verdicts, facts: st().facts, seed: st().seed };
}

const dist = (p: Map<string, P>, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
/** The vertices of ABC whose two sides measure equal — one letter for an isosceles view, 'ABC' for an equilateral one. */
const apexOf = (p: Map<string, P>) =>
  (['A', 'B', 'C'] as const).filter((v) => {
    const [x, y] = ['A', 'B', 'C'].filter((w) => w !== v);
    return Math.abs(dist(p, v, x) - dist(p, v, y)) < 1e-6 * dist(p, x, y);
  }).join('');
/** The side of ABC the point `foot` lies strictly on, or null. */
const sideOf = (p: Map<string, P>, foot: string) => {
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['A', 'C']]) if (Math.abs(dist(p, foot, a) + dist(p, foot, b) - dist(p, a, b)) < 1e-6) return a + b;
  return null;
};
/** The side of ABC whose LINE carries `foot` (an altitude to a leg of an obtuse isosceles lands on its extension). */
const lineOf = (p: Map<string, P>, foot: string) => {
  const F = p.get(foot)!;
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['A', 'C']]) {
    const A = p.get(a)!, B = p.get(b)!;
    if (Math.abs((B.x - A.x) * (F.y - A.y) - (B.y - A.y) * (F.x - A.x)) < 1e-6 * dist(p, a, b) ** 2) return a + b;
  }
  return null;
};
/** The view the commit shows and every distinct view the button reaches from it (up to `n` presses). */
function views(facts: Fact[], seed: number, foot: string, n = 6) {
  let cur: { facts: Fact[]; seed: number } | null = { facts, seed };
  const out: { apex: string; side: string | null; line: string | null; green: boolean }[] = [];
  for (let k = 0; k <= n && cur; k++) {
    const r = replay(cur.facts, cur.seed);
    const p = r.positions as Map<string, P>;
    out.push({ apex: apexOf(p), side: sideOf(p, foot), line: lineOf(p, foot), green: Object.values(r.status).every((s) => s === 'ok') && r.violations.length === 0 });
    cur = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
  }
  return out;
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const ISO = 'משולש שווה שוקיים ABC';
const ISO_EN = 'isosceles triangle ABC';

describe('#1839 — a typed apex with an unlettered base pins the apex', () => {
  const PINS: [string, string, string, 'he' | 'en'][] = [
    // [noun, line, foot, lang]
    [ISO, 'AD גובה לבסיס', 'D', 'he'],
    [ISO, 'AD תיכון לבסיס', 'D', 'he'],
    [ISO, 'AD חוצה זווית הראש', 'D', 'he'],
    [ISO, 'AD חוצה את זווית הראש', 'D', 'he'],
    [ISO_EN, 'AD is the altitude to the base', 'D', 'en'],
    [ISO_EN, 'AD bisects the apex angle', 'D', 'en'],
  ];
  it.each(PINS)('%s · %s — every view keeps A the apex and D on the base BC', async (noun, line, foot, lang) => {
    const { verdicts, facts, seed } = await play([noun, line], lang);
    expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit']);
    const vs = views(facts, seed, foot);
    for (const v of vs) expect(v).toMatchObject({ apex: 'A', side: 'BC', green: true });
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the pinning sentence does not move A, B or C at the shown configuration (stability)', async () => {
    const before = await play([ISO]);
    const p0 = replay(before.facts, before.seed).positions as Map<string, P>;
    const snap = ['A', 'B', 'C'].map((v) => ({ ...p0.get(v)! }));
    const after = await play([ISO, 'AD גובה לבסיס']);
    const p1 = replay(after.facts, after.seed).positions as Map<string, P>;
    ['A', 'B', 'C'].forEach((v, i) => {
      expect(p1.get(v)!.x).toBeCloseTo(snap[i].x, 6);
      expect(p1.get(v)!.y).toBeCloseTo(snap[i].y, 6);
    });
  });

  it('a typed apex that is not the shown one is the apex the sentence names («BD גובה לבסיס» → apex B, D on AC)', async () => {
    const { verdicts, facts, seed } = await play([ISO, 'BD גובה לבסיס']);
    expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit']);
    for (const v of views(facts, seed, 'D')) expect(v).toMatchObject({ apex: 'B', side: 'AC', green: true });
  });

  it('«AB = BC» after «AD גובה לבסיס» is the equilateral triangle (the only drawing where both givens hold)', async () => {
    const { verdicts, facts, seed } = await play([ISO, 'AD גובה לבסיס', 'AB = BC']);
    expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
    for (const v of views(facts, seed, 'D', 2)) expect(v).toMatchObject({ apex: 'ABC', side: 'BC', green: true });
  });

  it('the base named by its own letters is unchanged (pins A, as before)', async () => {
    for (const [line, foot] of [['תיכון לבסיס BC', 'M'], ['AD גובה לבסיס BC', 'D'], ['גובה לבסיס BC', 'F']] as const) {
      const { facts, seed } = await play([ISO, line]);
      for (const v of views(facts, seed, foot, 3)) expect(v).toMatchObject({ apex: 'A', side: 'BC', green: true });
    }
  });

  it('an unlettered role line still FOLLOWS the apex (ADR-596): «תיכון לבסיס» walks A → B → C', async () => {
    const { facts, seed } = await play([ISO, 'תיכון לבסיס']);
    const vs = views(facts, seed, 'M', 3);
    expect(new Set(vs.map((v) => v.apex))).toEqual(new Set(['A', 'B', 'C']));
    for (const v of vs) {
      expect(v.green).toBe(true);
      expect(v.side).toBe(['A', 'B', 'C'].filter((x) => x !== v.apex).join(''));
    }
  });
});

describe('#1839 — a typed leg is never drawn as the base', () => {
  const LEGS: [string, string, string, string, 'he' | 'en'][] = [
    // [noun, line, foot, the leg, lang]
    [ISO, 'BE גובה לשוק AC', 'E', 'AC', 'he'],
    [ISO, 'BE תיכון לשוק AC', 'E', 'AC', 'he'],
    [ISO, 'BE גובה לשוק', 'E', 'AC', 'he'],
    [ISO, 'CE תיכון לשוק', 'E', 'AB', 'he'],
    [ISO_EN, 'BE is the altitude to the leg AC', 'E', 'AC', 'en'],
  ];
  it.each(LEGS)('%s · %s — the two configurations where %s… is a leg remain, the third never shows', async (noun, line, foot, leg, lang) => {
    const { verdicts, facts, seed } = await play([noun, line], lang);
    expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit']);
    const vs = views(facts, seed, foot);
    for (const v of vs) {
      expect(v.green).toBe(true);
      expect(v.line).toBe(leg);
      expect(leg).toContain(v.apex); // the apex is an end of the leg: the leg is never the base
    }
    expect(new Set(vs.map((v) => v.apex))).toEqual(new Set(leg.split('')));
  });

  it('a later equality that makes the leg the base is flagged by name, never drawn silently green', async () => {
    // «AB = BC» pins apex B (ADR-138), where AC is the base: the leg claim is broken and the verifier says so.
    const { facts, seed } = await play([ISO, 'BE גובה לשוק AC', 'AB = BC']);
    const claim = facts.map((f) => f.cmd).find((c) => c.type === 'set-side-role');
    expect(claim).toEqual({ type: 'set-side-role', role: 'leg', a: 'A', b: 'C', ids: ['A', 'B', 'C'] });
    const fig = replay(facts, seed);
    expect(roleSidesOf(fig.construction).some((r) => r.role === 'base' && r.edge.join('') === 'AC')).toBe(true);
    expect(fig.violations.map((x) => x.messageKey)).toContain('figure.v.legIsBase');
    // the engine-level check, alone: the claim against that construction is exactly one violation
    expect(checkGivens([claim as never], fig.positions, fig.circles, fig.construction).map((x) => x.messageKey)).toEqual(['figure.v.legIsBase']);
  });
});
