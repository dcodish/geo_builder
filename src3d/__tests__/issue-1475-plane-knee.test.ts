/**
 * #1475 (ADR-3D-264) — a stated RIGHT angle between two planes is drawn as a KNEE, never as nothing and
 * never as an arc labelled «90°» (#307), for named and point-run planes alike, whether or not the data
 * panel («ארגון נתונים») is open (operator ruling 2026-09-27).
 *
 * Every assertion drives the REAL path — `submit` (the store's gate) → `derive3` → `buildScene3` /
 * `rightAngles3` / `dihedralGeometry`. Sequences are passed as separate arguments on purpose: the #1394
 * parity golden harvests string-array literals from this directory.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { rightAngles3 } from '../render/rightAngles';
import { dihedralGeometry } from '../render/dihedral';
import { resolveOperand } from '../engine/operands';
import { dot3, norm3, sub3, v3 } from '../engine/vec3';

const st = () => useGeo3.getState();
const VIEW = { width: 800, height: 600 };

/** Submit each line through the real gate; every line must be accepted. */
function build(...lines: string[]) {
  st().clear();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
  return derive3(st().facts, st().seed);
}

/** The scene with the data panel CLOSED (the default) or open. */
function scene(d: ReturnType<typeof derive3>, panelOpen = false) {
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW, 1, {}, true, panelOpen);
}

const NAMED_1 = 'המישור π1: z = 0';
const NAMED_2 = 'המישור π2: x = 0';
const CUBE = "קובייה ABCDA'B'C'D'";

describe('#1475 — a right angle between planes draws a knee', () => {
  beforeEach(() => st().clear());

  it.each([false, true])('named planes «π1 ניצב ל-π2» → one knee, no arc (panel open: %s)', (open) => {
    const s = scene(build(NAMED_1, NAMED_2, 'π1 ניצב ל-π2'), open);
    expect(s.marks).toHaveLength(1);
    expect(s.angles).toHaveLength(0);
  });

  it('named planes, mirrored slots «π2 ניצב ל-π1» → the same knee', () => {
    expect(scene(build(NAMED_1, NAMED_2, 'π2 ניצב ל-π1')).marks).toHaveLength(1);
  });

  it('named planes stated at 90° → a knee and NO arc labelled «90°»', () => {
    const s = scene(build(NAMED_1, NAMED_2, 'הזווית בין המישורים π1 ו-π2 היא 90'), true);
    expect(s.marks).toHaveLength(1);
    expect(s.angles.map((a) => a.text)).not.toContain('90°');
  });

  it('English: «the angle between planes π1 and π2 is 90» → a knee, no arc', () => {
    const s = scene(build('plane π1: z = 0', 'plane π2: x = 0', 'the angle between planes π1 and π2 is 90'));
    expect(s.marks).toHaveLength(1);
    expect(s.angles).toHaveLength(0);
  });

  it("point-run «המישור ABC ניצב למישור ABB'» → a knee with the data panel CLOSED (ruling: always shows)", () => {
    const d = build(CUBE, "המישור ABC ניצב למישור ABB'");
    expect(scene(d, false).marks).toHaveLength(1);
    expect(scene(d, true).marks).toHaveLength(1);
    expect(scene(d, true).angles).toHaveLength(0);
  });

  it("point-run, mirrored «המישור ABB' ניצב למישור ABC» → the same knee", () => {
    expect(scene(build(CUBE, "המישור ABB' ניצב למישור ABC")).marks).toHaveLength(1);
  });

  it('point-run stated at 90° → a knee whatever the panel, and no «90°» arc even with it open', () => {
    const d = build(CUBE, "הזווית בין המישור ABC למישור ABB' היא 90");
    expect(scene(d, false).marks).toHaveLength(1);
    const open = scene(d, true);
    expect(open.marks).toHaveLength(1);
    expect(open.angles.map((a) => a.text)).not.toContain('90°');
  });

  it('the cube knee sits on the shared edge AB, its arms ⟂ the seam and lying in each face', () => {
    const d = build(CUBE, "המישור ABC ניצב למישור ABB'");
    const pos = d.resolved.positions;
    const A = pos.get('A')!;
    const B = pos.get('B')!;
    const C = pos.get('C')!;
    const B1 = pos.get("B'")!;
    const radius = Math.max(...[...pos.values()].map((p) => norm3(p)), 1);
    const knees = rightAngles3(d.construction, d.resolved, radius);
    expect(knees).toHaveLength(1);
    const k = knees[0];
    const mid = v3((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    expect(norm3(sub3(k.vertex, mid))).toBeLessThan(1e-6);
    const seam = sub3(B, A);
    expect(Math.abs(dot3(k.u1, seam))).toBeLessThan(1e-6);
    expect(Math.abs(dot3(k.u2, seam))).toBeLessThan(1e-6);
    expect(Math.abs(dot3(k.u1, k.u2))).toBeLessThan(1e-6);
    // one arm points INTO face ABC (toward C), the other into ABB' (toward B')
    const into = (u: typeof k.u1, p: typeof A) => dot3(u, sub3(p, k.vertex)) > 0;
    expect((into(k.u1, C) && into(k.u2, B1)) || (into(k.u2, C) && into(k.u1, B1))).toBe(true);
    expect(k.planeN).toBeUndefined(); // both arms are fixed by the seam — neither may be rotated
  });
});

describe('#1475 — what must NOT draw a knee', () => {
  beforeEach(() => st().clear());

  it('a 45° dihedral between named planes keeps its arc and draws no knee (#1439 unchanged)', () => {
    const s = scene(build(NAMED_1, 'המישור π2: x + z = 0', 'הזווית בין המישורים π1 ו-π2 היא 45'));
    expect(s.angles.map((a) => a.text).join('|')).toBe('45°');
    expect(s.marks).toHaveLength(0);
  });

  it("a 45° dihedral between point runs keeps its (panel-gated) arc and draws no knee", () => {
    const d = build(CUBE, "הזווית בין המישור ABC למישור ABC' היא 45");
    expect(scene(d, true).angles.map((a) => a.text).join('|')).toBe('45°');
    expect(scene(d, true).marks).toHaveLength(0);
    expect(scene(d, false).angles).toHaveLength(0);
  });

  it('a REFUSED ⟂ (claim-refuted) draws no knee', () => {
    build(NAMED_1, 'המישור π2: x + z = 0');
    st().submit('π1 ניצב ל-π2');
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(scene(derive3(st().facts, st().seed)).marks).toHaveLength(0);
  });

  it('a FALSE ⟂ carried by a loaded file (bypassing the gate) draws no knee — the verifier predicate gates it', () => {
    const facts: Fact3[] = [NAMED_1, 'המישור π2: x + z = 0', 'π1 ניצב ל-π2'].map((utterance, i) => {
      const p = parse3(utterance);
      if (!p.ok) throw new Error(utterance);
      return { id: `f${i}`, utterance, cmds: p.commands, enabled: true };
    });
    const d = derive3(facts, 0);
    expect(scene(d, true).marks).toHaveLength(0);
  });

  it("parallel planes «המישור ABC מקביל למישור A'B'C'» draw no mark", () => {
    expect(scene(build(CUBE, "המישור ABC מקביל למישור A'B'C'"), true).marks).toHaveLength(0);
  });
});

describe('#1475 — the sibling spellings of a right angle against a plane (sibling audit)', () => {
  beforeEach(() => st().clear());

  it("segment × point run at 90° «הזווית בין AA' למישור ABC היא 90» → a knee, like «ניצב»", () => {
    expect(scene(build(CUBE, "הזווית בין AA' למישור ABC היא 90")).marks).toHaveLength(1);
  });

  it('named line × named plane at 90° → a knee at their crossing', () => {
    const s = scene(build(NAMED_1, 'הישר ℓ1: (0,0,0) + t(0,0,1)', 'הזווית בין הישר ℓ1 למישור π1 היא 90'));
    expect(s.marks).toHaveLength(1);
    expect(s.angles).toHaveLength(0);
  });
});

describe('#1475 — dihedralGeometry (the shared helper)', () => {
  const g = (name: string, d: ReturnType<typeof derive3>) =>
    resolveOperand({ kind: 'plane-named', name }, d.construction, { lines: d.resolved.lines, planes: d.resolved.planes })(() => null)!;

  it('returns the seam foot and two unit arms ⟂ the seam, each in its own plane', () => {
    const d = build(NAMED_1, 'המישור π2: x + z = 0');
    const dh = dihedralGeometry(g('π1', d), g('π2', d), { center: v3(0, 0, 0) })!;
    expect(dh).not.toBeNull();
    for (const u of [dh.u1, dh.u2]) {
      expect(Math.abs(norm3(u) - 1)).toBeLessThan(1e-9);
      expect(Math.abs(dot3(u, dh.seamDir))).toBeLessThan(1e-9);
    }
    expect(Math.abs(dh.u1.z)).toBeLessThan(1e-9); // u1 lies in z = 0
    expect(Math.abs(dh.u2.x + dh.u2.z)).toBeLessThan(1e-9); // u2 lies in x + z = 0
    expect(Math.abs(dh.foot.z)).toBeLessThan(1e-9);
    expect(Math.abs(dh.foot.x + dh.foot.z)).toBeLessThan(1e-9);
  });

  it('is null for parallel planes', () => {
    const d = build(NAMED_1, 'המישור π2: z = 3');
    expect(dihedralGeometry(g('π1', d), g('π2', d), { center: v3(0, 0, 0) })).toBeNull();
  });
});
