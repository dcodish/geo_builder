/**
 * #2084 ([ADR-647](../../../docs/06-decisions.md#adr-647)) — A POINT STATED ON TWO TANGENT CIRCLES IS THEIR TOUCH POINT.
 *
 * Measured on `main` @ 939b160a through `decideDeterministic2D` → `commitVerdict` → `replay`: after «מעגל O» · «מעגל P»
 * · «המעגלים O ו-P משיקים» · «X על מעגל O», «X על מעגל P» answered «זה כבר קיים באיור — אין מה להוסיף.» with X at (0, 5)
 * — off circle P; with stated radii X was drawn ~10⁻³ beside the touch point M with no notice. Operator ruling
 * 2026-10-14 (card d14b-2084-priority, A): X moves to the touch point, with the "moved to coincide" notice.
 *
 * Root cause: apply's `point-on-circle` existing-point branches never asked what a membership of BOTH tangent circles
 * means: the busy free radius skipped (c3), the witness search read only `on-circle` riders, and the command reached
 * the bare `break` (dropped, so the dry run saw no change); with stated radii (c4) drove X only to within the solve's
 * tolerance of M. Fix: a point already on one circle of a stated tangency, stated on the other, takes the touch
 * point's own definition (`tangentTouchCopy`), and the witness search reads every point on the circle.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { visibleCoincidences } from '@/render/pointDescriptions';
import i18n from '@/i18n';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
type V = { kind: string; note?: { key?: string } };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  const snaps: Map<string, Vec>[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    snaps.push(new Map(d.positions));
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { verdicts, last: verdicts.at(-1)!, before: snaps.at(-1)!, facts: st().facts };
}

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const banner = (pairs: [string, string][]) => visibleCoincidences(pairs).map(([a, b]) => i18n.getFixedT('he')('figure.converge', { a, b }).replace(/[⁦-⁩]/g, ''));

/** X is the touch point at every seed 0–3: on both circles, exactly on `touch`, the pair recorded, no red row. */
function isTouch(touch: string, X = 'X') {
  for (let seed = 0; seed < 4; seed++) {
    const r = replay(st().facts, seed);
    if (r.lastError) continue; // a sampled seed that does not build is not this question
    const x = r.positions.get(X)!, m = r.positions.get(touch)!;
    expect(d(x, m), `seed ${seed}: |${X}${touch}|`).toBeLessThan(1e-6);
    expect(r.coincidences.map((p) => [...p].sort().join('')), `seed ${seed}`).toContain([X, touch].sort().join(''));
    expect(r.violations, `seed ${seed}`).toHaveLength(0);
    for (const c of ['circle-O', 'circle-P']) {
      const k = r.circles.get(c)!;
      expect(Math.abs(d(x, k.center) - k.r), `seed ${seed}: ${X} on ${c}`).toBeLessThan(1e-6);
    }
  }
  const r0 = replay(st().facts, st().seed);
  return banner(r0.coincidences);
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];

describe('#2084 — the operator-ballot lines: «X על מעגל P» moves X to the touch point, with the notice', () => {
  it('free radii: «משיקים» · «X על מעגל O» · «X על מעגל P»', async () => {
    const g = await play([...PAIR, 'המעגלים O ו-P משיקים', 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    expect(isTouch('M')).toEqual(['M ו-X נפלו על אותה נקודה.']);
    // stability: O, P and M do not move
    const r = replay(st().facts, st().seed);
    for (const id of ['O', 'P', 'M']) expect(d(r.positions.get(id)!, g.before.get(id)!), id).toBeLessThan(1e-9);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('stated radii 3 and 2: X lands EXACTLY on M (was ~10⁻³ beside it, no notice)', async () => {
    const g = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'המעגלים O ו-P משיקים', 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    expect(isTouch('M')).toEqual(['M ו-X נפלו על אותה נקודה.']);
  });
});

describe('#2084 — every spelling of the same statement', () => {
  it.each([
    [['המעגלים O ו-P משיקים בנקודה T', 'X על מעגל O', 'X על מעגל P'], 'T'],
    [['המעגלים O ו-P משיקים מבפנים', 'X על מעגל O', 'X על מעגל P'], 'M'],
    [['המעגלים O ו-P משיקים מבחוץ', 'X על מעגל P', 'X על מעגל O'], 'M'], // the other order
  ])('%j → X is %s', async (tail, touch) => {
    const g = await play([...PAIR, ...tail]);
    expect(g.last.kind).toBe('commit');
    isTouch(touch);
  });

  it('English: "circles O and P are tangent" · "X on circle O" · "X on circle P"', async () => {
    const g = await play([...PAIR, 'circles O and P are tangent', 'X on circle O', 'X on circle P'], 'en');
    expect(g.last.kind).toBe('commit');
    isTouch('M');
  });

  it('a second point Y on both is the touch point too', async () => {
    const g = await play([...PAIR, 'המעגלים O ו-P משיקים', 'X על מעגל O', 'X על מעגל P', 'Y על מעגל O', 'Y על מעגל P']);
    expect(g.last.kind).toBe('commit');
    isTouch('M', 'Y');
  });
});

describe('#2084 — the witness: a membership on a tangent circle is never dropped', () => {
  it('a derived point on the inner circle of an equal-radii internal tangency (no rider of its own) is driven onto it', async () => {
    const g = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'המעגלים O ו-P משיקים מבפנים', 'קטע AB', 'C אמצע AB', 'C על מעגל P']);
    expect(g.last.kind, 'was «כבר קיים» with C off the circle').toBe('commit');
    const r = replay(st().facts, st().seed);
    const k = r.circles.get('circle-P')!;
    expect(Math.abs(d(r.positions.get('C')!, k.center) - k.r)).toBeLessThan(1e-3);
    expect(r.violations).toHaveLength(0);
  });
});

describe('#2084 — unchanged (measured at 939b160a)', () => {
  it('without a tangency, X on both circles is a crossing', async () => {
    const g = await play([...PAIR, 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    const r = replay(st().facts, st().seed);
    for (const c of ['circle-O', 'circle-P']) {
      const k = r.circles.get(c)!;
      expect(Math.abs(d(r.positions.get('X')!, k.center) - k.r)).toBeLessThan(1e-6);
    }
    expect(r.coincidences).toHaveLength(0);
  });

  it.each([['המעגלים O ו-P זרים'], ['המעגל P מוכל במעגל O']])('after «%s» the row stays red (an honest violation)', async (rel) => {
    const g = await play([...PAIR, rel, 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    expect(replay(st().facts, st().seed).violations.length).toBeGreaterThan(0);
  });
});
