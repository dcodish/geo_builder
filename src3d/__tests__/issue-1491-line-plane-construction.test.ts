/**
 * #1491 (ADR-3D-280) — «a builder for showing how the angle is calculated» for a LINE and a PLANE: the
 * «הצג בניה» chip on a line × plane angle row draws a point P on the line, its height PH to the plane
 * (knee at H), and the projection XH from the crossing X; the angle PXH is the stated one.
 *
 * Every assertion drives the real path — `submit` → `derive3` → the chip derivation → `buildScene3` /
 * `linePlaneConstruction`. Sequences are separate arguments, not array literals: the #1394 parity golden
 * harvests string arrays from this directory.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, undo3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { linePlaneConstruction } from '../render/dihedral';
import { resolveOperand } from '../engine/operands';
import { cross3, dist3, dot3, norm3, normalize3, sub3 } from '../engine/vec3';
import { dihedralChipsByFact, shownDihedrals } from '../store/dihedralChips';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import type { Operand3 } from '../engine/types';

const st = () => useGeo3.getState();
const VIEW = { width: 800, height: 600 };

function build(...lines: string[]) {
  st().clear();
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
}
function chips() {
  const d = derive3(st().facts, st().seed);
  return { d, chips: dihedralChipsByFact(st().facts, (id) => d.status[id] === 'ok') };
}
function scene() {
  const { d, chips: ch } = chips();
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW, 1, {}, true, undefined, shownDihedrals(ch, st().dihedralShown));
}
const lastId = () => st().facts[st().facts.length - 1].id;

/** The construction for the last row's pair — the SAME function the scene calls — plus the plane. */
function geometry() {
  const { d, chips: ch } = chips();
  const pr = ch.get(lastId())![0];
  const pos = d.resolved.positions;
  const at = (id: string) => pos.get(id) ?? null;
  const abs = { lines: d.resolved.lines, planes: d.resolved.planes };
  const g = (op: Operand3) => resolveOperand(op, d.construction, abs)(at)!;
  const pts = [...pos.values()];
  const center = pts.length
    ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length }
    : { x: 0, y: 0, z: 0 };
  const ga = g(pr.a);
  const gb = g(pr.b);
  const plane = ga.normal ? ga : gb;
  const line = ga.normal ? gb : ga;
  const lp = linePlaneConstruction(pr.a, pr.b, ga, gb, { at, points: pos, center, fallbackLen: 3 })!;
  return { pos, lp, n: normalize3(plane.normal!), d: plane.d! / norm3(plane.normal!), L: normalize3(line.dir!), lineAt: line.point! };
}

/** Everything a correct construction must satisfy, whatever the figure. */
function expectConstruction(deg: number) {
  const { lp, n, d, L, lineAt } = geometry();
  const onPlane = (p: { x: number; y: number; z: number }) => Math.abs(dot3(n, p) + d);
  const onLine = (p: { x: number; y: number; z: number }) => norm3(cross3(sub3(p, lineAt), L));
  expect(onPlane(lp.cross), 'X on the plane').toBeLessThan(1e-6);
  expect(onLine(lp.cross), 'X on the line').toBeLessThan(1e-6);
  expect(onLine(lp.point.at), 'P on the line').toBeLessThan(1e-6);
  expect(onPlane(lp.point.at), 'P off the plane').toBeGreaterThan(1e-3);
  expect(onPlane(lp.foot), 'H on the plane').toBeLessThan(1e-6);
  expect(norm3(cross3(sub3(lp.point.at, lp.foot), n)), 'PH ⟂ the plane').toBeLessThan(1e-6);
  const u = normalize3(sub3(lp.point.at, lp.cross));
  const v = normalize3(sub3(lp.foot, lp.cross));
  expect((Math.acos(Math.max(-1, Math.min(1, dot3(u, v)))) * 180) / Math.PI, 'the angle PXH').toBeCloseTo(deg, 3);
  return lp;
}

beforeEach(() => st().clear());

describe('#1491 — the chip rows', () => {
  it('a line × plane angle row owns the chip — named line and segment; the solid row does not', () => {
    build('מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=45');
    expect(chips().chips.has(lastId())).toBe(true);
    expect(chips().chips.has(st().facts[0].id)).toBe(false);
    build('פירמידה SABCD שבסיסה ריבוע', 'הזווית בין SA למישור ABCD היא 50');
    expect(chips().chips.has(lastId())).toBe(true);
  });

  it('a refused angle offers no chip', () => {
    build("קובייה ABCDA'B'C'D'");
    st().submit("הזווית בין AC' למישור ABCD היא 40");
    expect(st().lastError).not.toBeNull();
    expect(chips().chips.size).toBe(0);
  });
});

describe('#1491 — the construction', () => {
  it('is OFF by default', () => {
    build('מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=45');
    expect(scene().constructions).toHaveLength(0);
  });

  it('ℓ × π = 45: X on ℓ∩π, P on ℓ, PH ⟂ π, H in π, the angle PXH = 45°, marked once, a knee at H', () => {
    build('מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=45');
    const off = scene();
    st().toggleDihedralShown(lastId());
    const s = scene();
    expect(s.constructions).toHaveLength(1);
    expect(s.constructions[0].segs).toHaveLength(2); // PH and XH
    expect(s.angles.filter((a) => a.text === '45°')).toHaveLength(1);
    expect(s.marks.length).toBe(off.marks.length + 1); // the knee at H
    expectConstruction(45);
    // X and H are unnamed points here: each takes a free display letter, never a fact
    expect(s.constructions[0].label).not.toBeNull();
    expect(s.constructions[0].extra[0].label).not.toBeNull();
    expect(s.constructions[0].extra[0].label).not.toBe(s.constructions[0].label);
    expect(st().facts).toHaveLength(3);
  });

  it('pyramid SA × base = 50: P = S, X = A (no new letter), H in the base', () => {
    build('פירמידה SABCD שבסיסה ריבוע', 'הזווית בין SA למישור ABCD היא 50');
    st().toggleDihedralShown(lastId());
    const lp = expectConstruction(50);
    const { pos } = geometry();
    expect(lp.point.id).toBe('S');
    expect(dist3(lp.cross, pos.get('A')!)).toBeLessThan(1e-6);
    expect(scene().constructions[0].label).toBeNull();
  });

  it("cube AC' × ABCD = 35.264: P = C', H = C, X = A — no new letters", () => {
    build("קובייה ABCDA'B'C'D'", "הזווית בין AC' למישור ABCD היא 35.264");
    st().toggleDihedralShown(lastId());
    const lp = expectConstruction(35.264);
    const { pos } = geometry();
    expect(lp.point.id).toBe("C'");
    expect(dist3(lp.foot, pos.get('C')!)).toBeLessThan(1e-6);
    expect(dist3(lp.cross, pos.get('A')!)).toBeLessThan(1e-6);
    const c = scene().constructions[0];
    expect(c.label).toBeNull();
    expect(c.extra.map((e) => e.label)).toEqual([null]);
  });

  it('at 90° P, H and X are collinear: the chip constructs nothing and the knee stays (ruling 2026-09-27)', () => {
    build('מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=90');
    const off = scene();
    expect(off.marks.length).toBeGreaterThan(0);
    st().toggleDihedralShown(lastId());
    const on = scene();
    expect(on.constructions).toHaveLength(0);
    expect(on.marks.length).toBe(off.marks.length);
  });

  it('the chip state survives undo and save/load', () => {
    build("קובייה ABCDA'B'C'D'", "הזווית בין AC' למישור ABCD היא 35.264");
    st().toggleDihedralShown(lastId());
    expect(scene().constructions).toHaveLength(1);
    const s0 = st();
    const r = deserializeFigure3(serializeFigure3(s0.facts, s0.seed, undefined, s0.queries, s0.planeDisplay, s0.displayMode, s0.dihedralShown));
    expect(r.ok).toBe(true);
    if (r.ok) {
      st().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
      expect(scene().constructions).toHaveLength(1);
    }
    st().toggleDihedralShown(lastId());
    expect(scene().constructions).toHaveLength(0);
    undo3();
    expect(scene().constructions).toHaveLength(1);
  });
});
