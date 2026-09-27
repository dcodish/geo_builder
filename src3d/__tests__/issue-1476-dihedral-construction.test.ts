/**
 * #1476 (ADR-3D-265) — «I want to see the exact formation of the angle» between planes: a chip on the
 * angle's own row («הצג בניה») draws the foot on the seam and the two perpendiculars, from a MEANINGFUL
 * point (the third vertex), with the meeting point named by the first FREE letter.
 *
 * Every assertion drives the REAL path — `submit` (the store's gate) → `derive3` → the chip derivation
 * (`dihedralChipsByFact` / `shownDihedrals`, what App3 feeds the canvas) → `buildScene3` /
 * `dihedralConstruction`. Sequences are passed as separate arguments on purpose: the #1394 parity golden
 * harvests string-array literals from this directory.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, undo3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { dihedralConstruction, solidBaseRings } from '../render/dihedral';
import { resolveOperand } from '../engine/operands';
import { dist3, dot3, norm3, normalize3, sub3 } from '../engine/vec3';
import { dihedralChipsByFact, shownDihedrals } from '../store/dihedralChips';
import { deserializeFigure3, serializeFigure3, serializeFigure3ForLink } from '../store/figureFile3';
import { openShared3 } from '../store/shareLink3';
import { restoreSession3, sessionPayload3 } from '../store/sessionPersist3';
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

/** What App3 computes: the chips (ok rows only) and the pairs switched on. */
function chips() {
  const d = derive3(st().facts, st().seed);
  return { d, chips: dihedralChipsByFact(st().facts, (id) => d.status[id] === 'ok') };
}

/** The scene exactly as the canvas gets it, with the data panel CLOSED (ruling 2). */
function scene() {
  const { d, chips: ch } = chips();
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW, 1, {}, true, false, undefined, shownDihedrals(ch, st().dihedralShown));
}

const lastId = () => st().facts[st().facts.length - 1].id;

/** The construction's geometry for the last row's pair — the SAME function the scene calls. */
function geometry(seed?: number) {
  const { chips: ch } = chips();
  const d = derive3(st().facts, seed ?? st().seed);
  const pr = ch.get(lastId())![0];
  const pos = d.resolved.positions;
  const at = (id: string) => pos.get(id) ?? null;
  const abs = { lines: d.resolved.lines, planes: d.resolved.planes };
  const g = (op: Operand3) => resolveOperand(op, d.construction, abs)(at)!;
  const pts = [...pos.values()];
  const center = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
  const baseRings = solidBaseRings(d.construction.solids);
  return { pos, dc: dihedralConstruction(pr.a, pr.b, g(pr.a), g(pr.b), { at, points: pos, center, baseRings })! };
}

/** Is `t` of point p along segment [a, b] strictly inside it? */
const inside = (p: { x: number; y: number; z: number }, a: typeof p, b: typeof p) => {
  const ab = sub3(b, a);
  const t = dot3(sub3(p, a), ab) / dot3(ab, ab);
  return t > 1e-6 && t < 1 - 1e-6;
};

describe('#1476 — which rows own the «הצג בניה» chip', () => {
  beforeEach(() => st().clear());

  it('the angle row owns one; the solid row does not', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    const { chips: ch } = chips();
    expect(ch.has(st().facts[0].id)).toBe(false);
    expect(ch.get(lastId())).toHaveLength(1);
  });

  it('a ⟂ between planes and a lettered angle own one too', () => {
    build("קובייה ABCDA'B'C'D'", "המישור ABC ניצב למישור ABB'");
    expect(chips().chips.has(lastId())).toBe(true);
    build('פירמידה SABC', 'הזווית בין הפאה SBC לבסיס ABC היא α');
    expect(chips().chips.has(lastId())).toBe(true);
  });

  it('a refused angle offers no chip: the gate keeps it off the list, and a non-ok row owns nothing', () => {
    build('המישור π1: z = 3', 'המישור π2: x + y + z = 1');
    st().submit('הזווית בין המישורים π1 ו-π2 היא 30');
    expect(st().lastError?.code).toBe('claim-refuted');
    expect(st().facts).toHaveLength(2);
    expect(chips().chips.size).toBe(0);
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    expect(dihedralChipsByFact(st().facts, () => false).size).toBe(0);
  });
});

describe('#1476 — the construction', () => {
  beforeEach(() => st().clear());

  it('is OFF by default — nothing drawn until the chip is pressed', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    expect(st().dihedralShown).toEqual({});
    expect(scene().constructions).toHaveLength(0);
  });

  it('tetrahedron ABCD, ABC ∠ ACD: a leg from B or D (foot inside AC), knees at F, the other leg ⟂ AC in the other plane', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    st().toggleDihedralShown(lastId());
    const s = scene();
    expect(s.constructions).toHaveLength(1); // panel CLOSED — ruling 2
    expect(s.angles.map((a) => a.text).join('|')).toBe('70°'); // one arc, at the construction's foot
    expect(s.marks).toHaveLength(2); // the two knees against the seam

    const { pos, dc } = geometry();
    const [A, B, C, D] = 'ABCD'.split('').map((id) => pos.get(id)!);
    expect('BD').toContain(dc.point!.id);
    expect(inside(dc.foot, A, C)).toBe(true);
    const ac = normalize3(sub3(C, A));
    expect(Math.abs(dot3(dc.armP, ac))).toBeLessThan(1e-9);
    expect(Math.abs(dot3(dc.armQ, ac))).toBeLessThan(1e-9);
    // armP runs to the chosen vertex; armQ lies in the OTHER plane
    expect(dist3(dc.point!.at, dc.foot)).toBeCloseTo(dc.legLen!, 9);
    const other = dc.point!.id === 'B' ? [A, C, D] : [A, B, C];
    const n = normalize3(cross(sub3(other[1], other[0]), sub3(other[2], other[0])));
    expect(Math.abs(dot3(dc.armQ, n))).toBeLessThan(1e-9);
    // the angle between the legs IS the stated dihedral
    expect((Math.acos(Math.abs(dot3(dc.armP, dc.armQ))) * 180) / Math.PI).toBeCloseTo(70, 3);
  });

  it.each(Array.from({ length: 24 }, (_, i) => i))('tetrahedron, seed %i: the foot inside AC wins; when BOTH are inside, the face over the base (ruling 4 — D, not B)', (seed) => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    const { pos, dc } = geometry(seed);
    const [A, B, C, D] = 'ABCD'.split('').map((id) => pos.get(id)!);
    const foot = (p: typeof A) => {
      const ac = sub3(C, A);
      const t = dot3(sub3(p, A), ac) / dot3(ac, ac);
      return { x: A.x + ac.x * t, y: A.y + ac.y * t, z: A.z + ac.z * t };
    };
    const bIn = inside(foot(B), A, C);
    const dIn = inside(foot(D), A, C);
    expect(bIn || dIn).toBe(true);
    expect(dc.point!.id).toBe(bIn && dIn ? 'D' : dIn ? 'D' : 'B');
  });

  it.each(Array.from({ length: 24 }, (_, i) => i))('pyramid, seed %i: the leg starts at S and F lies inside BC', (seed) => {
    build('פירמידה SABC', 'הזווית בין הפאה SBC לבסיס ABC היא 60');
    const { pos, dc } = geometry(seed);
    expect(dc.point!.id).toBe('S');
    expect(inside(dc.foot, pos.get('B')!, pos.get('C')!)).toBe(true);
  });

  it('pyramid face↔base «הזווית בין הפאה SBC לבסיס ABC היא 60»: the leg starts at S and F lies on BC', () => {
    build('פירמידה SABC', 'הזווית בין הפאה SBC לבסיס ABC היא 60');
    st().toggleDihedralShown(lastId());
    const s = scene();
    expect(s.constructions).toHaveLength(1);
    expect(s.angles.map((a) => a.text).join('|')).toBe('60°');
    const { pos, dc } = geometry();
    expect(dc.point!.id).toBe('S');
    expect(inside(dc.foot, pos.get('B')!, pos.get('C')!)).toBe(true);
    expect((Math.acos(Math.abs(dot3(dc.armP, dc.armQ))) * 180) / Math.PI).toBeCloseTo(60, 3);
  });

  it('equation planes (z = 3, x + y + z = 1): the fallback foot, screen-sized legs, the arc reads the stated value', () => {
    build('המישור π1: z = 3', 'המישור π2: x + y + z = 1', 'הזווית בין המישורים π1 ו-π2 היא 54.74');
    const before = scene();
    expect(before.angles.map((a) => a.text).join('|')).toBe('54.74°');
    st().toggleDihedralShown(lastId());
    const s = scene();
    expect(s.constructions).toHaveLength(1);
    expect(s.angles.map((a) => a.text).join('|')).toBe('54.74°'); // the named-plane arc CEDES — drawn once
    const { dc } = geometry();
    expect(dc.point).toBeNull();
    expect(dc.legLen).toBeNull();
    for (const sg of s.constructions[0].segs) expect(Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1)).toBeGreaterThan(20);
  });

  it('named planes with a named point on one: the leg starts at that point (rule 3), its foot on the seam', () => {
    build('המישור π1: z = 0', 'המישור π2: x + z = 0', 'B על המישור π2', 'הזווית בין המישורים π1 ו-π2 היא 45');
    st().toggleDihedralShown(lastId());
    expect(scene().constructions).toHaveLength(1);
    const { pos, dc } = geometry();
    expect(dc.point!.id).toBe('B');
    const B = pos.get('B')!;
    // F is B's foot on the seam (the y-axis): same y, x = z = 0
    expect(Math.hypot(dc.foot.x, dc.foot.z)).toBeLessThan(1e-9);
    expect(dc.foot.y).toBeCloseTo(B.y, 9);
  });

  it('a right dihedral: the construction marks three knees and the seam-midpoint knee cedes', () => {
    build("קובייה ABCDA'B'C'D'", "המישור ABC ניצב למישור ABB'");
    expect(scene().marks).toHaveLength(1);
    st().toggleDihedralShown(lastId());
    const s = scene();
    expect(s.constructions).toHaveLength(1);
    expect(s.marks).toHaveLength(3);
    expect(s.angles).toHaveLength(0);
    // both candidates' feet are the edge's endpoint B; the face ABB' beats the base plane ABC (a run on
    // three of the base ring's four vertices IS the base) — and B is a named point, so no new letter
    const { pos, dc } = geometry();
    expect(dc.point!.id).toBe("B'");
    expect(dist3(dc.foot, pos.get('B')!)).toBeLessThan(1e-9);
    expect(s.constructions[0].label).toBeNull();
  });
});

describe('#1476 — the meeting point is named by the first FREE letter (ruling 3)', () => {
  beforeEach(() => st().clear());

  it('after a pyramid SABC the foot reads M — not S, A, B or C — and the letter goes with the chip', () => {
    build('פירמידה SABC', 'הזווית בין הפאה SBC לבסיס ABC היא 60');
    const angleRow = lastId();
    st().toggleDihedralShown(angleRow);
    expect(scene().constructions[0].label).toBe('M');
    st().toggleDihedralShown(angleRow);
    expect(scene().constructions).toHaveLength(0);
  });

  it('when the student later uses that letter, the foot is re-lettered', () => {
    build('פירמידה SABC', 'הזווית בין הפאה SBC לבסיס ABC היא 60');
    st().toggleDihedralShown(lastId());
    st().submit('M אמצע AB');
    expect(st().lastError).toBeNull();
    const label = scene().constructions[0].label;
    expect(label).not.toBe('M');
    expect(label).toBe('N');
  });
});

describe('#1476 — the chip is session state: undo, save/load, share link, delete', () => {
  beforeEach(() => st().clear());

  it('undo turns it back off', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    st().toggleDihedralShown(lastId());
    expect(scene().constructions).toHaveLength(1);
    undo3();
    expect(st().dihedralShown).toEqual({});
    expect(scene().constructions).toHaveLength(0);
  });

  it('survives save → load (by fact index, since a load mints fresh ids)', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    st().toggleDihedralShown(lastId());
    const s = st();
    const r = deserializeFigure3(serializeFigure3(s.facts, s.seed, undefined, s.queries, s.planeDisplay, s.displayMode, s.dihedralShown));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    st().clear();
    st().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
    expect(st().dihedralShown).toEqual({ [lastId()]: true });
    expect(scene().constructions).toHaveLength(1);
  });

  it('an untouched figure writes no field (the file is byte-identical to before)', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    const s = st();
    expect(serializeFigure3ForLink(s.facts, s.seed, undefined, s.queries, s.planeDisplay, s.displayMode, s.dihedralShown)).not.toContain('dihedralConstruction');
  });

  it('survives a share link and a restored session', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    st().toggleDihedralShown(lastId());
    const s = st();
    const link = serializeFigure3ForLink(s.facts, s.seed, undefined, s.queries, s.planeDisplay, s.displayMode, s.dihedralShown);
    st().clear();
    expect(openShared3(link).ok).toBe(true);
    expect(scene().constructions).toHaveLength(1);
    const payload = sessionPayload3()!;
    st().clear();
    expect(restoreSession3(payload).ok).toBe(true);
    expect(scene().constructions).toHaveLength(1);
  });

  it('disappears with its fact', () => {
    build('טטראדר ABCD', 'הזווית בין המישור ABC למישור ACD היא 70');
    const id = lastId();
    st().toggleDihedralShown(id);
    st().remove(id);
    expect(chips().chips.has(id)).toBe(false);
    expect(scene().constructions).toHaveLength(0);
  });
});

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
void norm3;
