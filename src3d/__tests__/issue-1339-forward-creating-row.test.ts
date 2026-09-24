/**
 * #1339 ([ADR-3D-259](../../docs/06b-decisions-3d.md#adr-3d-259), the 3-D half of
 * [ADR-W-089](../../docs/06w-decisions-workspace.md#adr-w-089)) — A ROW THAT CREATES A POINT, TYPED
 * ABOVE THE SOLID THAT DECLARES ITS OPERANDS, BUILDS.
 *
 * Operator, playing round #1332 T30: *"why would it stay red if the inputs allow it to exist. why would
 * an angle of 70 (T29) accept this and a midsegment not?"* — ruled 2026-09-21: *"yes - it should."*
 * ADR-3D-257's post-pass retry took only rows whose dry run introduced no point; the clause is dropped,
 * so a red row is retried iff its dry run succeeds against the completed figure.
 *
 * The first block drives the REAL store the way the operator reached the shape (type the pyramid, type
 * the midpoint, delete the pyramid, type it again); the rest fold fact lists directly.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

const PYR = 'פירמידה SABCD שבסיסה ריבוע';
const facts = (lines: string[]): Fact3[] =>
  lines.map((utterance, i) => {
    const r = parse3(utterance);
    if (!r.ok) throw new Error(`${utterance}: ${r.reason}`);
    return { id: `f${i}`, utterance, cmds: r.commands, enabled: true };
  });
const fold = (lines: string[], seed = 0) => derive3(facts(lines), seed);
const statuses = (lines: string[]) => {
  const d = fold(lines);
  return lines.map((_, i) => d.status[`f${i}`]);
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const at = (d: ReturnType<typeof derive3>, id: string): Vec3 => {
  const p = d.positions.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};
/** |M − (S+A)/2| — the midpoint, measured on the DRAWN figure. */
const offMidpoint = (d: ReturnType<typeof derive3>, m: string, a: string, b: string) => {
  const A = at(d, a);
  const B = at(d, b);
  return dist(at(d, m), { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 });
};

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

describe('#1339 — the operator’s T30, through the store', () => {
  it('pyramid, midpoint, delete the pyramid, type it again → both rows green and M drawn at the midpoint of SA', () => {
    const st = () => useGeo3.getState();
    st().submit(PYR);
    st().submit('M אמצע SA');
    st().remove(st().facts[0].id);
    st().submit(PYR);
    expect(st().lastError).toBeNull();
    expect(st().facts.map((f) => f.utterance)).toEqual(['M אמצע SA', PYR]);
    const d = derive3(st().facts, st().seed);
    expect(st().facts.map((f) => d.status[f.id])).toEqual(['ok', 'ok']);
    expect(d.construction.points.has('M')).toBe(true);
    expect(offMidpoint(d, 'M', 'S', 'A')).toBeLessThan(1e-9);
  });
});

describe('#1339 — the creating row is retried exactly as a constraint row is', () => {
  it('parity with the working order: the same statuses and M at the midpoint of SA, at every seed', () => {
    expect(statuses([PYR, 'M אמצע SA'])).toEqual(['ok', 'ok']);
    expect(statuses(['M אמצע SA', PYR])).toEqual(['ok', 'ok']);
    for (let seed = 0; seed < 6; seed++) expect(offMidpoint(fold(['M אמצע SA', PYR], seed), 'M', 'S', 'A'), `seed ${seed}`).toBeLessThan(1e-9);
  });

  it('a row whose point NO line declares stays red, naming it — nothing is invented to satisfy it', () => {
    const [first, second] = statuses(['M אמצע XA', PYR]);
    expect(first).toEqual({ code: 'unknown-point', id: 'X' });
    expect(second).toBe('ok');
    expect(fold(['M אמצע XA', PYR]).construction.points.has('M')).toBe(false);
  });

  it('a chain settles: midpoint → a length on the midpoint → the solid, in both orders of the first two', () => {
    for (const lines of [
      ['M אמצע SA', 'SM = 3', PYR],
      ['SM = 3', 'M אמצע SA', PYR],
    ]) {
      const d = fold(lines);
      expect(lines.map((_, i) => d.status[`f${i}`]), lines.join(' · ')).toEqual(['ok', 'ok', 'ok']);
      expect(offMidpoint(d, 'M', 'S', 'A'), lines.join(' · ')).toBeLessThan(1e-9);
      expect(dist(at(d, 'S'), at(d, 'M')), lines.join(' · ')).toBeCloseTo(3, 6);
      expect(dist(at(d, 'S'), at(d, 'A')), lines.join(' · ')).toBeCloseTo(6, 6);
    }
  });

  it('a green figure never changes: the in-order list folds exactly as before', () => {
    const inOrder = fold([PYR, 'M אמצע SA', 'SM = 3']);
    expect(Object.values(inOrder.status)).toEqual(['ok', 'ok', 'ok']);
    const reversed = fold(['SM = 3', 'M אמצע SA', PYR]);
    expect(reversed.construction.points.size).toBe(inOrder.construction.points.size);
    expect(dist(at(reversed, 'S'), at(reversed, 'A'))).toBeCloseTo(dist(at(inOrder, 'S'), at(inOrder, 'A')), 6);
  });
});
