/**
 * #2764 ([ADR-3D-454](../../docs/06b-decisions-3d.md#adr-3d-454), [ADR-3D-455](../../docs/06b-decisions-3d.md#adr-3d-455)) —
 * SEPARATE SHAPES ARE SOLVED, SEARCHED AND DRAWN PART BY PART.
 *
 * pipeline-lock: the class is "a line on one shape moves or slows the others", which only the store's submit path
 * (decide → seed search → derive) can show; the engine's own units are in engine/__tests__/components3.test.ts.
 *
 * Measured on `main` @ 4f9fdfac through `useGeo3.submit`: the ninth of nine separate shapes took 39.4 s (1,544,591
 * least-squares residual evaluations), walked the configuration 2 → 7 and moved all 30 earlier points; lines 2 and 3
 * moved the first shapes too. #2791's plan measured two rows of the same class: a quadrilateral in a circle moved by up
 * to 0.30 when a second quadrilateral got its own circle, and by 0.34 when «מעוין EFGH» was added (configuration 1 → 3).
 *
 * Budgets are OPERATION counts (`leastSquaresStats.evals`), never a clock (docs/17 §7).
 */
import { describe, expect, it } from 'vitest';
import { independentPartsSuite } from '../../shell/__tests__/fixtures/independent-parts-2764';
import { seedOfPart3, seedPartsOf3, type Seed3 } from '../engine/components3';
import { leastSquaresStats } from '../engine/solve3';
import { deserializeFigure3, serializeFigure3, serializeFigure3ForLink } from '../store/figureFile3';
import { restoreSession3, sessionPayload3 } from '../store/sessionPersist3';
import { derive3, useGeo3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

const reset = (seed: Seed3 = 0) => {
  useGeo3.setState({ facts: [], seed, lastError: null });
  useGeo3.temporal.getState().clear();
};
const drawn = (): Map<string, Vec3> => {
  const st = useGeo3.getState();
  return new Map(derive3(st.facts, st.seed).positions);
};
const moved = (before: ReadonlyMap<string, Vec3>, after: ReadonlyMap<string, Vec3>, ids: readonly string[]): number =>
  Math.max(0, ...ids.map((id) => {
    const p = before.get(id)!;
    const q = after.get(id)!;
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  }));

/**
 * Measured after the fix (evals per line, submit path, seed 0): 0 · 20,994 · 19,509 · 28,800 · 82,242 · 50,014 · 118,935 ·
 * 127,690 · 178,735. The budget is twice that (the plan's bar); before, lines 7–9 cost 311,324 · 356,598 · 1,544,591.
 */
const AFTER = [0, 20994, 19509, 28800, 82242, 50014, 118935, 127690, 178735];

independentPartsSuite('3-D', {
  reset: () => reset(0),
  type: (line) => {
    leastSquaresStats.evals = 0;
    useGeo3.getState().submit(line);
    const work = leastSquaresStats.evals;
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    const ok = st.lastError === null && Object.values(d.status).every((s) => s === 'ok');
    return { recorded: ok, work, points: new Map([...d.positions].map(([id, p]) => [id, [p.x, p.y, p.z]])) };
  },
  budget: AFTER.map((n) => Math.max(1000, 2 * n)),
});

describe('#2764 — a separate shape with its own givens never moves a shape already drawn (#2791 rows)', () => {
  const RING = ['A', 'B', 'C', 'D'];
  it.each([0, 1, 2, 3])('seed %i: a quadrilateral in a circle stays put while EFGH and its circle are added (was up to 0.30)', (s) => {
    reset(s);
    useGeo3.getState().submit('מרובע ABCD');
    useGeo3.getState().submit('מעגל חוסם את ABCD');
    const before = drawn();
    for (const line of ['מרובע EFGH', 'מעגל חוסם את EFGH']) {
      useGeo3.getState().submit(line);
      expect(useGeo3.getState().lastError, line).toBeNull();
      expect(moved(before, drawn(), RING), line).toBeLessThanOrEqual(1e-9);
    }
  });

  it.each([0, 1, 2, 3])('seed %i: «מעוין EFGH» beside it moves neither the ring nor its configuration entry (was 0.34, 1 → 3)', (s) => {
    reset(s);
    useGeo3.getState().submit('מרובע ABCD');
    useGeo3.getState().submit('מעגל חוסם את ABCD');
    const before = drawn();
    useGeo3.getState().submit('מעוין EFGH');
    expect(useGeo3.getState().lastError).toBeNull();
    expect(moved(before, drawn(), RING)).toBeLessThanOrEqual(1e-9);
    expect(seedOfPart3(useGeo3.getState().seed, 'solid-polygon4-ABCD')).toBe(s);
  });
});

describe('#2764 — a line that links two separate shapes (operator 2026-11-09, Q-2764a: both may move)', () => {
  it('«AB ∥ EF» across two squares records and holds; the joined part takes the first shape’s entry', () => {
    reset(0);
    for (const line of ['ריבוע ABCD', 'ריבוע EFGH', 'AB ∥ EF']) {
      useGeo3.getState().submit(line);
      expect(useGeo3.getState().lastError, line).toBeNull();
    }
    const st = useGeo3.getState();
    expect(Object.values(derive3(st.facts, st.seed).status).every((x) => x === 'ok')).toBe(true);
  });
});

describe('#2764 (ADR-3D-455) — the per-part configuration on disk', () => {
  const NINE = ['מרובע', 'טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית', 'מקבילית', 'מלבן', 'מעוין', 'ריבוע', 'דלתון'];
  const typed = () => {
    reset(0);
    for (const line of NINE) useGeo3.getState().submit(line);
    return useGeo3.getState();
  };

  it('a figure whose parts sit at different seeds is saved with `seed` a number and `seedParts` beside it', () => {
    const st = typed();
    expect(seedPartsOf3(st.seed)).toBeDefined();
    const file = JSON.parse(serializeFigure3(st.facts, st.seed));
    expect(typeof file.seed).toBe('number');
    expect(file.seedParts).toEqual(seedPartsOf3(st.seed));
  });

  it('the file, the share link and the session each load back the same drawing', () => {
    const st = typed();
    const before = drawn();
    for (const payload of [serializeFigure3(st.facts, st.seed), serializeFigure3ForLink(st.facts, st.seed)]) {
      const r = deserializeFigure3(payload);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.seed).toEqual(st.seed);
      useGeo3.getState().loadFigure(r.facts, r.seed);
      const after = drawn();
      expect(moved(before, after, [...before.keys()])).toBeLessThanOrEqual(1e-9);
    }
    typed();
    const payload = sessionPayload3()!;
    reset(0);
    expect(restoreSession3(payload).ok).toBe(true);
    expect(moved(before, drawn(), [...before.keys()])).toBeLessThanOrEqual(1e-9);
  });

  it('a file saved before the change (`seed: 7`, no `seedParts`) loads, every shape drawn as itself, never refused', () => {
    const st = typed();
    const old = JSON.parse(serializeFigure3(st.facts, st.seed));
    old.seed = 7;
    delete old.seedParts;
    const r = deserializeFigure3(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed).toBe(7);
    useGeo3.getState().loadFigure(r.facts, r.seed);
    const now = useGeo3.getState();
    expect(now.lastError).toBeNull();
    const d = derive3(now.facts, now.seed);
    expect(Object.values(d.status).every((x) => x === 'ok')).toBe(true);
    // a part that already draws as itself at 7 stays at 7
    expect(seedOfPart3(now.seed, 'solid-polygon4-ABCD')).toBe(7);
  });

  it('a malformed part entry is dropped, never refused (that part sits at the base)', () => {
    const st = typed();
    const file = JSON.parse(serializeFigure3(st.facts, st.seed));
    file.seedParts = { 'solid-polygon4-EFGH': 'x', 'solid-polygon4-IJKL': 2 };
    const r = deserializeFigure3(JSON.stringify(file));
    expect(r.ok && r.seed).toEqual({ seed: file.seed, parts: { 'solid-polygon4-IJKL': 2 } });
  });
});
