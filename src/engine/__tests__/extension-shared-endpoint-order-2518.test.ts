/**
 * #2518 ([ADR-780](../../../docs/06-decisions.md#adr-780), operator ruling 2026-11-04, card q1 = A) — «המשך AO חותך את
 * מעגל P בנקודה R» with A on circle P draws R past O when the figure allows it; otherwise the ADR-142 / ADR-267
 * either-side reading stays exactly as it was.
 *
 * Measured at pickup (`main` ebacadd1, `driveThroughGate`, `meetsRequirements` seeds 0–7): the report was strict
 * 00000000 (relaxed 01101111; `findValidConfig` showed seed 1 with R past A), «המשך OA» with a free O strict 00000000.
 * Every row green. The shared-endpoint branch of `extend-onto-circle` built the second crossing and nothing ever put
 * the other end where that crossing lies beyond the second letter.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { driveThroughGate } from '@/__tests__/submit-gate';
import { findValidConfig, meetsRequirements, replay, searchAnotherView, type Fact } from '@/store/geoStore';
import type { Vec } from '@/engine';

type Side = 'past-second' | 'past-first' | 'between';
/** Where R lies on the line through the extension's two letters `a`, `b` (R beyond b, beyond a, or between them). */
function sideOf(pos: Map<string, Vec>, a: string, b: string): Side {
  const A = pos.get(a)!;
  const B = pos.get(b)!;
  const R = pos.get('R')!;
  const t = ((R.x - A.x) * (B.x - A.x) + (R.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
  return t > 1 ? 'past-second' : t < 0 ? 'past-first' : 'between';
}
const onCircle = (pos: Map<string, Vec>, f: ReturnType<typeof replay>, id: string, circle: string) => {
  const c = f.circles.get(circle)!;
  return Math.abs(Math.hypot(pos.get(id)!.x - c.center.x, pos.get(id)!.y - c.center.y) - c.r);
};

/** The configuration the app shows (the post-commit search) and the next `presses` «הציגו תצורה אחרת». */
function shownViews(facts: Fact[], presses = 4) {
  let cur = findValidConfig(facts, 0, Number.POSITIVE_INFINITY) ?? { facts, seed: 0 };
  const out = [cur];
  for (let k = 0; k < presses; k++) {
    const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
    if (!next) break;
    cur = next;
    out.push(cur);
  }
  return out;
}

const REPORT = ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P', 'המשך AO חותך את מעגל P בנקודה R'];

describe('#2518 — the stated side holds wherever the figure allows it', () => {
  const ROWS: [string, string[], string, string][] = [
    ['the report (A on the circle, R past O)', REPORT, 'A', 'O'],
    ['the shared end second («המשך OA», O a circle centre)', ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P', 'המשך OA חותך את מעגל P בנקודה R'], 'O', 'A'],
    ['the shared end second («המשך OA», O a free point)', ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'המשך OA חותך את מעגל P בנקודה R'], 'O', 'A'],
    ['the shared end first, a free O', ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'המשך AO חותך את מעגל P בנקודה R'], 'A', 'O'],
  ];
  for (const [name, lines, a, b] of ROWS) {
    it(`${name}: every row green, R beyond ${b} at the shown configuration and at each one «הציגו תצורה אחרת» reaches`, () => {
      const { facts, refused } = driveThroughGate(lines);
      expect(refused).toEqual([]);
      const views = shownViews(facts);
      expect(views.length).toBeGreaterThan(1);
      for (const v of views) {
        const f = replay(v.facts, v.seed);
        expect(Object.values(f.status).every((s) => s === 'ok')).toBe(true);
        expect(meetsRequirements(v.facts, v.seed), `seed ${v.seed} meets the strict bar`).toBe(true);
        expect(sideOf(f.positions, a, b), `seed ${v.seed}`).toBe('past-second');
        expect(onCircle(f.positions, f, 'R', 'circle-P')).toBeLessThan(1e-6);
      }
    });
  }

  it('the report at the default figure: R beyond O, and only O moves (A, P and circle P stay where they were)', () => {
    const before = replay(driveThroughGate(REPORT.slice(0, 3)).facts, 0);
    const after = replay(driveThroughGate(REPORT).facts, 0);
    expect(sideOf(after.positions, 'A', 'O')).toBe('past-second');
    for (const id of ['A', 'P']) {
      expect(after.positions.get(id)!.x).toBeCloseTo(before.positions.get(id)!.x, 9);
      expect(after.positions.get(id)!.y).toBeCloseTo(before.positions.get(id)!.y, 9);
    }
    expect(after.circles.get('circle-P')!.r).toBeCloseTo(before.circles.get('circle-P')!.r, 9);
  });

  it('stability: when the side already holds nothing moves', () => {
    const lines = ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'המשך AO חותך את מעגל P בנקודה R'];
    const before = replay(driveThroughGate(lines.slice(0, 3)).facts, 0);
    const after = replay(driveThroughGate(lines).facts, 0);
    expect(sideOf(after.positions, 'A', 'O')).toBe('past-second');
    for (const id of ['A', 'O', 'P']) {
      expect(after.positions.get(id)!.x).toBeCloseTo(before.positions.get(id)!.x, 9);
      expect(after.positions.get(id)!.y).toBeCloseTo(before.positions.get(id)!.y, 9);
    }
  });
});

describe('#2518 — when no figure has R beyond the second letter, today’s either-side reading stands (ADR-142 / ADR-267)', () => {
  it('O pinned outside the circle: the line builds green and R is the other crossing, beyond A — never between, never refused', () => {
    const lines = ['מעגל שמרכזו P ברדיוס 3', 'נקודה A על מעגל P', 'נקודה O', 'OP = 10', 'המשך AO חותך את מעגל P בנקודה R'];
    const { facts, refused } = driveThroughGate(lines);
    expect(refused).toEqual([]);
    for (const v of shownViews(facts, 1)) {
      const f = replay(v.facts, v.seed);
      expect(Object.values(f.status).every((s) => s === 'ok')).toBe(true);
      expect(meetsRequirements(v.facts, v.seed, true), 'the ADR-142 acceptance bar').toBe(true);
      expect(sideOf(f.positions, 'A', 'O')).toBe('past-first');
    }
  });
});
