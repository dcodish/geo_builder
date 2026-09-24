/**
 * #1340 ([ADR-AG-156](../../docs/06c-decisions-analytic.md#adr-ag-156), the analytic half of
 * [ADR-W-089](../../docs/06w-decisions-workspace.md#adr-w-089)) — A DERIVED POINT TYPED BEFORE THE
 * POINTS IT NAMES BUILDS, exactly as a constraint typed before its objects does.
 *
 * ADR-AG-133's deferral fixpoint retried only the fact kinds that create nothing (a `NON_CREATING`
 * list), so «M אמצע AB» · «A(0,0)» · «B(4,0)» was red `unknown-reference` while the crossing typed above
 * its lines built. Operator ruling on #1339 (2026-09-21): *"yes - it should."* The retry now takes every
 * failed fact whose re-apply succeeds, creating or not, and the line stays the unit of application.
 *
 * The first block drives the store + submit gate the way the list reaches that shape (the gate refuses a
 * forward reference on a canvas that lacks the point — ADR-AG-015 — so it is reached by editing), and
 * derives exactly as the page does (`derive(lines, seed)`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { useAnalyticStore } from '../store/useAnalyticStore';

type D = ReturnType<typeof derive>;
const P = (d: D, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} in figure (${d.figure.points.map((q) => q.id).join(',')})`);
  return p;
};
const TOL = 1e-9;

beforeEach(() => useAnalyticStore.getState().clearAll());

/** Submit through the real gate and record what it records — what pressing Enter does. */
const submit = (line: string) => {
  const s = useAnalyticStore.getState();
  const v = decideSubmit(line, s.lines, s.seed);
  if (v.kind !== 'record') throw new Error(`«${line}» was not recorded: ${v.kind}`);
  s.recordLine(v.line);
};

describe('#1340 — through the store: the list reached by deleting and re-typing the endpoints', () => {
  it('«M אמצע AB» ends up above «A(0,0)» · «B(4,0)» — every row green, M drawn at (2, 0)', () => {
    submit('A(0,0)');
    submit('B(4,0)');
    submit('M אמצע AB');
    useAnalyticStore.getState().removeLine(0);
    useAnalyticStore.getState().removeLine(0);
    submit('A(0,0)');
    submit('B(4,0)');
    const { lines, seed } = useAnalyticStore.getState();
    expect(lines).toEqual(['M אמצע AB', 'A(0,0)', 'B(4,0)']);
    const d = derive(lines, seed);
    expect(d.faults).toEqual([]);
    expect(d.outcomes).toEqual(['created', 'created', 'created']);
    expect(P(d, 'M').x).toBeCloseTo(2, 9);
    expect(P(d, 'M').y).toBeCloseTo(0, 9);
  });
});

describe('#1340 — the fold retries a creating fact exactly as it retries a constraint', () => {
  it('the three measured sequences: midpoint first now builds, the working order and the crossing unchanged', () => {
    const first = derive(['M אמצע AB', 'A(0,0)', 'B(4,0)'], 0);
    const inOrder = derive(['A(0,0)', 'B(4,0)', 'M אמצע AB'], 0);
    expect(first.faults).toEqual([]);
    expect(inOrder.faults).toEqual([]);
    expect(Math.hypot(P(first, 'M').x - 2, P(first, 'M').y)).toBeLessThan(TOL);
    expect(P(first, 'M')).toMatchObject({ x: P(inOrder, 'M').x, y: P(inOrder, 'M').y });
    const crossing = derive(['P נקודת החיתוך של הישר AB עם הישר CD', 'A(0,0)', 'B(4,0)', 'C(0,2)', 'D(4,3)'], 0);
    expect(crossing.faults).toEqual([]);
    expect(crossing.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D', 'P']);
  });

  it('a derived point whose operand NO line declares stays red, naming the reference — nothing is invented', () => {
    const d = derive(['M אמצע AX', 'A(0,0)', 'B(4,0)'], 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0]).toMatchObject({ index: 0, code: 'unknown-reference', detail: 'X' });
    expect(d.outcomes[0]).toBe('faulted');
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  it('a chain settles: a point derived from a point that is itself derived later in the list', () => {
    // N is the midpoint of AM, M the midpoint of AB — N's row sits above M's, which sits above A and B.
    const lines = ['N אמצע AM', 'M אמצע AB', 'A(0,0)', 'B(4,0)'];
    const d = derive(lines, 0);
    expect(d.faults, lines.join(' · ')).toEqual([]);
    expect(Math.hypot(P(d, 'M').x - 2, P(d, 'M').y)).toBeLessThan(TOL);
    expect(Math.hypot(P(d, 'N').x - 1, P(d, 'N').y)).toBeLessThan(TOL);
  });

  it('order-independence as a PROPERTY: every permutation of the three lines builds the same figure', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'M אמצע AB'];
    const perms = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    for (const order of perms(lines)) {
      const d = derive(order, 0);
      expect(d.faults, order.join(' · ')).toEqual([]);
      expect(Math.hypot(P(d, 'M').x - 2, P(d, 'M').y), order.join(' · ')).toBeLessThan(TOL);
    }
  });
});
