/**
 * #2069 ([ADR-W-145](../../docs/06w-decisions-workspace.md#adr-w-145)) — 2-D's half of the shared fold: «‖» (U+2016)
 * and «||» between two operands are ∥, so «AB ‖ CD» and «AB || CD» build the parallel 2-D builds for «AB ∥ CD».
 * Measured at 8b01f3bd: both escalated (`not-handled`). FR-SU-17 (the operator's 2026-10-08 ruling on #1912).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { parse } from '@/parser/parse';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';

const st = () => useGeoStore.getState();

const cmdsOf = (line: string) => {
  const r = parse(line);
  expect(r.ok, line).toBe(true);
  return r.ok ? r.commands : [];
};

describe('#2069 — 2-D reads the parallel look-alikes as ∥', () => {
  it.each(['AB ‖ CD', 'AB‖CD', 'AB || CD', 'AB||CD'])('«%s» lowers exactly as «AB ∥ CD»', (line) => {
    expect(cmdsOf(line)).toEqual(cmdsOf('AB ∥ CD'));
    expect(cmdsOf(line).some((c) => c.type === 'set-parallel')).toBe(true);
  });

  it('«מרובע ABCD» · «AB ‖ CD» commits, and the drawn AB is parallel to CD', async () => {
    st().clear();
    for (const line of ['מרובע ABCD', 'AB ‖ CD']) {
      const d = replay(st().facts, st().seed);
      const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
      expect(v.kind, line).toBe('commit');
      commitVerdict(v, line);
    }
    const P = replay(st().facts, st().seed).positions;
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => P.get(id)!);
    const cross = (B.x - A.x) * (D.y - C.y) - (B.y - A.y) * (D.x - C.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6 * Math.hypot(B.x - A.x, B.y - A.y) * Math.hypot(D.x - C.x, D.y - C.y));
  });

  it.each(['|AB||CD| = 6', '‖u‖ = 5'])('«%s» is not turned into a parallel', (line) => {
    const r = parse(line);
    expect(r.ok && r.commands.some((c) => c.type === 'set-parallel')).toBe(false);
  });
});
