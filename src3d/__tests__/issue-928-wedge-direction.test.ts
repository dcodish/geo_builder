/**
 * #928 (ADR-3D-227) — TWO SPELLINGS OF ONE PHYSICAL WEDGE DRAW ONE ARC.
 *
 * The #923 remainder. ADR-3D-221 keyed the arc map on POINT IDS and recorded the alternate-spelling
 * question as measured-but-unarmed: *"«∠SAB = α» and «∠SAB = β» name the same wedge only if the rays
 * coincide, and a box's collinear points make that reachable — measure before choosing."* Measured on the
 * fixed lane (round #927):
 *
 *     פירמידה SABCD שבסיסה ריבוע · E אמצע AB · ∠EAS = α · ∠BAS = 40
 *     scene.angles = TWO arcs at A: «40°» and «α», at two radii (AE is the shorter arm)
 *
 * E lies on AB, so rays AE and AB coincide: ∠EAS and ∠BAS are ONE physical corner. Under the #923 ruling
 * the wedge reads «40°», once. Identity is now by ray DIRECTION (±1.5°), 2-D's answer (`wedgeOf`,
 * F7/REN-9) ported here as a choice made on this measurement — ADR-W-045 leaves it per-builder.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { rightAngles3 } from '../render/rightAngles';
import { derive3, useGeo3 } from '../store/store3';

const PYR = 'פירמידה SABCD שבסיסה ריבוע';
const state = () => useGeo3.getState();

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
}
function build(steps: string[]) {
  reset();
  for (const u of steps) {
    state().submit(u);
    expect(state().lastError, `«${u}» must be accepted`).toBeNull();
  }
  const d = derive3(state().facts, state().seed);
  const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
  return { d, scene, knees: rightAngles3(d.construction, d.resolved, 1) };
}
const texts = (b: ReturnType<typeof build>) => b.scene.angles.map((a) => a.text);

beforeEach(reset);

describe('#928 — the same corner named two ways draws ONE arc', () => {
  it("the reported figure: «∠EAS = α» + «∠BAS = 40» with E on AB → one arc, reading «40°»", () => {
    const b = build([PYR, 'E אמצע AB', '∠EAS = α', '∠BAS = 40']);
    expect(texts(b)).toEqual(['40°']);
  });

  it('the VALUE wins whichever spelling carried it — stated first, named second', () => {
    const b = build([PYR, 'E אמצע AB', '∠BAS = 40', '∠EAS = α']);
    expect(texts(b)).toEqual(['40°']);
  });

  it('the letter alone still shows the letter — one arc, «α»', () => {
    const b = build([PYR, 'E אמצע AB', '∠EAS = α']);
    expect(texts(b)).toEqual(['α']);
  });
});

describe('#928 — the guard that matters: genuinely different wedges still draw separately', () => {
  it('two DIFFERENT corners at the same vertex keep their own arcs', () => {
    const b = build([PYR, '∠BAS = 40', '∠DAS = 50']);
    // ∠BAS and ∠DAS share the vertex A but not their rays (AB ⟂ AD in a square base).
    expect(texts(b).sort()).toEqual(['40°', '50°']);
  });

  it('the same ray pair at DIFFERENT vertices is not collapsed', () => {
    const b = build([PYR, '∠BAS = 40', '∠ABS = 50']);
    expect(texts(b).sort()).toEqual(['40°', '50°']);
  });

  it('#923 unchanged: one spelling carrying both a name and a value still draws one arc', () => {
    const b = build([PYR, '∠SAB = α', 'α = 70']);
    expect(texts(b)).toEqual(['70°']);
  });
});

describe("#928 — the knee's own identity, MEASURED rather than assumed", () => {
  /**
   * `rightAngles.ts` keys its dedup on the world-space vertex plus the arm DIRECTIONS already
   * (`wedgeKey`), not on point ids — so the alternate-spelling case should collapse there without any
   * change. This asserts that it does, which is the measurement #928's plan asked for; if a future edit
   * moves that key back onto ids, this fails rather than silently drawing two knees.
   */
  it('a right angle named through a collinear point draws ONE knee, not two', () => {
    const b = build([PYR, 'E אמצע AB', '∠BAS = 90', '∠EAS = 90']);
    expect(b.knees).toHaveLength(1);
    expect(texts(b), 'a right angle is a knee, never a «90°» arc (#307)').toEqual([]);
  });
});
