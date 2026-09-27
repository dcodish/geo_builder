/**
 * #1486 (ADR-3D-266, operator ruling A) — a STATED angle between objects always shows its mark.
 *
 * Operator, playing round #1478 T10/T12: «without pressing הצג בניה the angle did not show» — `פירמידה
 * SABC` · `הזווית בין הפאה SBC לבסיס ABC היא 60` with «ארגון נתונים» closed drew no arc, because the
 * object-angle lane (ADR-3D-185) was gated on the data panel while vertex arcs, equation-plane arcs and
 * knees of the same kind of statement were not. Every record that lane reads is stated (a value or a
 * name the student typed), so the gate is removed: `buildScene3` takes no panel flag, and the scene built
 * here IS the canvas with the panel closed.
 *
 * Same class, found while measuring: the VALUED segment × point-run angle («הזווית בין SA למישור ABCD היא
 * 50», a `line-plane-angle` pin or claim) drew nothing even with the panel OPEN — the lane read only its
 * lettered twin (`linePlaneMarks`). It now reaches the same builder.
 *
 * Every assertion drives the REAL path — `submit` (the store's gate) → `derive3` → `buildScene3`, and for
 * the chip `dihedralChipsByFact` / `shownDihedrals` exactly as App3 feeds the canvas. Sequences are passed
 * as separate arguments on purpose: the #1394 parity golden harvests string-array literals from this
 * directory.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3, type Scene3, type SceneAngle3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { dihedralChipsByFact, shownDihedrals } from '../store/dihedralChips';

const st = () => useGeo3.getState();
const VIEW = { width: 640, height: 460 };

/** Submit each line through the real gate; every line must be accepted. */
function build(...lines: string[]) {
  st().clear();
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
  const d = derive3(st().facts, st().seed);
  for (const f of st().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  return d;
}

/** The canvas as App3 draws it: no panel input exists; the chips are whatever the student turned on. */
function scene(d = derive3(st().facts, st().seed)): Scene3 {
  const chips = dihedralChipsByFact(st().facts, (id) => d.status[id] === 'ok');
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW, 1, {}, true, undefined, shownDihedrals(chips, st().dihedralShown));
}

const texts = (s: Scene3) => s.angles.map((a) => a.text).join('|');
const pt = (s: Scene3, id: string) => s.points.find((p) => p.id === id)!;
/** the farthest any arc pixel lies from q */
const reach = (arc: SceneAngle3, q: { x: number; y: number }) => Math.max(...arc.pts.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));

const PYRAMID = 'פירמידה SABC';
const FACE_BASE_60 = 'הזווית בין הפאה SBC לבסיס ABC היא 60';

describe('#1486 — the operator’s T10/T12 lines, data panel CLOSED', () => {
  beforeEach(() => st().clear());

  it('pyramid face↔base 60 → one «60°» arc, with no chip pressed', () => {
    const s = scene(build(PYRAMID, FACE_BASE_60));
    expect(texts(s)).toBe('60°');
    expect(s.constructions).toHaveLength(0);
  });

  it('the arc sits at the SHARED EDGE BC (its midpoint), not at the far vertex A', () => {
    const s = scene(build(PYRAMID, FACE_BASE_60));
    const B = pt(s, 'B');
    const C = pt(s, 'C');
    const mid = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
    const arc = s.angles[0];
    expect(reach(arc, mid)).toBeLessThan(Math.hypot(B.x - C.x, B.y - C.y));
    expect(reach(arc, mid)).toBeLessThan(reach(arc, pt(s, 'A')));
  });

  it('the same pair NAMED («… היא β», a relMark) draws its name, and no number', () => {
    const s = scene(build(PYRAMID, 'הזווית בין הפאה SBC לבסיס ABC היא β'));
    expect(texts(s)).toBe('β');
  });
});

describe('#1486 — a stated line ↔ plane angle, data panel CLOSED', () => {
  beforeEach(() => st().clear());

  it('named line × named plane «זווית בין ישר ℓ למישור π=45» (line-rel claim) → «45°»', () => {
    expect(texts(scene(build('מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=45')))).toBe('45°');
  });

  it('segment × face, VALUED, driving (a line-plane-angle pin) → «50°» at A, where SA meets the base', () => {
    const s = scene(build('פירמידה SABCD שבסיסה ריבוע', 'הזווית בין SA למישור ABCD היא 50'));
    expect(texts(s)).toBe('50°');
    const A = pt(s, 'A');
    const B = pt(s, 'B');
    expect(reach(s.angles[0], A)).toBeLessThan(Math.hypot(A.x - B.x, A.y - B.y) / 2);
  });

  it('segment × face, VALUED and TRUE on a cube (a verified line-plane-angle claim) → «35.264°»', () => {
    expect(texts(scene(build("קובייה ABCDA'B'C'D'", "הזווית בין AC' למישור ABCD היא 35.264")))).toBe('35.264°');
  });

  it('segment × face, NAMED (#319 linePlaneMarks) → its letter', () => {
    expect(texts(scene(build("קובייה ABCDA'B'C'D'", "הזווית בין AC' למישור ABCD היא α")))).toBe('α');
  });

  it('segment × face at 90° stays the #1475 KNEE — never an arc «90°»', () => {
    const s = scene(build("קובייה ABCDA'B'C'D'", "הזווית בין AA' למישור ABCD היא 90"));
    expect(s.angles).toHaveLength(0);
    expect(s.marks).toHaveLength(1);
  });
});

describe('#1486 — the «הצג בניה» chip still OWNS its pair’s mark (exactly one)', () => {
  beforeEach(() => st().clear());

  it('chip on → the construction’s arc replaces the free arc: one «60°», not two', () => {
    build(PYRAMID, FACE_BASE_60);
    st().toggleDihedralShown(st().facts[st().facts.length - 1].id);
    const s = scene();
    expect(s.constructions).toHaveLength(1);
    expect(texts(s)).toBe('60°');
    st().toggleDihedralShown(st().facts[st().facts.length - 1].id);
    const off = scene();
    expect(off.constructions).toHaveLength(0);
    expect(texts(off)).toBe('60°'); // chip off → the free arc is back, panel still closed
  });

  it('a right dihedral with the chip off is the ONE seam knee, no arc (#1475 unchanged)', () => {
    const s = scene(build("קובייה ABCDA'B'C'D'", "הזווית בין המישור ABC למישור ABB' היא 90"));
    expect(s.marks).toHaveLength(1);
    expect(s.angles).toHaveLength(0);
  });
});
