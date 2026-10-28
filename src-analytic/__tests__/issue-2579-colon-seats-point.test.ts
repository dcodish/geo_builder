/**
 * #2579 ([ADR-AG-348](../../docs/06c-decisions-analytic.md#adr-ag-348), the port of 2-D's ADR-773; operator ruling
 * 2026-10-27, Q2 «yes» and Q3 «yes») — «AD:DB = 1:2» places D on AB, between A and B, and draws AB, as 2-D does.
 *
 * Measured at 422cda84 through `decideSubmit` → `derive`: «AD:DB = 1:2» drew AD and DB but not AB, and left D a free
 * point off the line (the ratio held with A, D, B bent), blank or over «נקודה A/B/D».
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

function play(...seq: string[]) {
  let lines: string[] = [];
  let created: readonly string[] | undefined;
  for (const l of seq) {
    const v = decideSubmit(l, lines, 0);
    expect(v.kind, `«${l}»: ${JSON.stringify(v).slice(0, 200)}`).toBe('record');
    if (v.kind === 'record') {
      lines = [...lines, v.line];
      created = v.created;
    }
  }
  return { lines, created };
}
const at = (lines: string[], seed: number) => {
  const pts = derive(lines, seed).figure.points;
  return (id: string) => pts.find((p) => p.id === id)!;
};
const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
const segs = (lines: string[]) => derive(lines, 0).figure.segments.map((s) => s.id).filter((id) => id.startsWith('seg-')).sort();

describe('#2579 — «AD:DB = 1:2» seats D between A and B and draws AB', () => {
  it.each([[['AD:DB = 1:2']], [['נקודה A', 'נקודה B', 'נקודה D', 'AD:DB = 1:2']], [['משולש ABC', 'AD:DB = 1:2']], [['נקודה D', 'AD:DB = 1:2']]])(
    '%j: D on AB, between, AD:DB = 1:2 at seeds 0–3; AB, AD, DB drawn',
    (seq) => {
      const { lines } = play(...seq);
      expect(derive(lines, 0).faults).toEqual([]);
      for (const s of [0, 1, 2, 3]) {
        const P = at(lines, s);
        expect(d(P('A'), P('D')) + d(P('D'), P('B'))).toBeCloseTo(d(P('A'), P('B')), 5);
        expect(d(P('D'), P('B'))).toBeCloseTo(2 * d(P('A'), P('D')), 5);
      }
      expect(segs(lines)).toEqual(expect.arrayContaining(['seg-AD', 'seg-BD']));
      expect(derive(lines, 0).figure.segments.length).toBeGreaterThanOrEqual(3);
    },
  );
  it('blank: the notice names A, D, B in typed order; the three segments are drawn', () => {
    const { lines, created } = play('AD:DB = 1:2');
    expect(created).toEqual(['A', 'D', 'B']);
    expect(segs(lines)).toEqual(['seg-AB', 'seg-AD', 'seg-BD']);
  });
  it('over stated coordinates the ratio fixes D: A(0,0) · B(6,0) → D(2,0)', () => {
    const { lines } = play('A(0,0)', 'B(6,0)', 'AD:DB = 1:2');
    const D = at(lines, 0)('D');
    expect(D.x).toBeCloseTo(2, 6);
    expect(D.y).toBeCloseTo(0, 6);
  });
  it('a shared point the figure already places keeps the plain proportion: «משולש ABD» stays a triangle', () => {
    const { lines } = play('משולש ABD', 'AD:DB = 1:2');
    expect(derive(lines, 0).faults).toEqual([]);
    const P = at(lines, 0);
    expect(d(P('D'), P('B'))).toBeCloseTo(2 * d(P('A'), P('D')), 5);
    expect(d(P('A'), P('D')) + d(P('D'), P('B')) - d(P('A'), P('B'))).toBeGreaterThan(1e-3);
  });
  it('a point already on another segment is not moved onto AB: «משולש ABC» · «D על BC» · «AD:DB = 1:2»', () => {
    const { lines } = play('משולש ABC', 'D על BC', 'AD:DB = 1:2');
    expect(derive(lines, 0).faults).toEqual([]);
    const P = at(lines, 0);
    expect(d(P('B'), P('D')) + d(P('D'), P('C'))).toBeCloseTo(d(P('B'), P('C')), 5);
  });
  it('two segments with no shared point seat nothing («AB:CD = 5:4» draws AB and CD only)', () => {
    const { lines } = play('AB:CD = 5:4');
    expect(segs(lines)).toEqual(['seg-AB', 'seg-CD']);
  });
});
