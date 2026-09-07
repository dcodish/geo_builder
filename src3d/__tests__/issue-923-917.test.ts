/**
 * #923 (ADR-3D-221) + #917 (ADR-3D-222) — the stated-angle ARC lane of `scene3.ts`, one chokepoint.
 *
 * #923 — ONE WEDGE, ONE ARC. Measured at `82d87c6` (2026-09-07), #902's own T10:
 *
 *     פירמידה SABCD שבסיסה ריבוע · ∠SAB = α · α = 70
 *     scene.angles = TWO entries, byte-identical 13-point arcs, labelX/labelY equal, texts "70°" and "α"
 *
 * Two independent loops — the stated-value loop over `scalarPins` and the #94 marker loop over
 * `angleMarks` — each pushed the wedge. Now every producer feeds ONE map keyed on the vertex + the
 * unordered ray pair, which emits once per wedge; the text follows the operator's ruling (2026-09-07):
 * once a named angle has a value, the VALUE shows («70°»), the letter until then.
 *
 * #917 — THE ARC'S ANCHOR IS THE CROSSING. Measured at `38f7461` (round #915, T3):
 *
 *     תיבה ABCDA'B'C'D' · הזווית בין AC' לבין BD' היא 55   → seg-angle pin, CROSS at t=s=0.5, scene.angles = 0
 *     תיבה … · הזווית בין A'C לבין BC' היא 70               → SKEW (gap 0.397),                 scene.angles = 0 (correct)
 *
 * Both arms of the arc lane demanded a shared NAMED endpoint; a `seg-angle` pin carries two independent
 * segments and no vertex id. The arc now hangs on the same `meetingPoint` answer as the knee — a crossing
 * strictly inside both drawn spans — and draws nothing for skew / off-ink pairs (the R³ honesty rule).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { meetingPoint, rightAngles3 } from '../render/rightAngles';
import { derive3, useGeo3 } from '../store/store3';
import { add3, dist3, scale3 } from '../engine/vec3';
import type { Vec3 } from '../engine/vec3';

const BOX = "תיבה ABCDA'B'C'D'";
const PYR = 'פירמידה SABCD שבסיסה ריבוע';
const state = () => useGeo3.getState();

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
}
/** Build through the real store and read the scene the canvas paints. */
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
const texts = (scene: ReturnType<typeof build>['scene']) => scene.angles.map((a) => a.text);

beforeEach(reset);

describe('#923 — one wedge draws one arc', () => {
  it('T10: a named angle given a value draws EXACTLY one arc, reading the value (operator ruling: «70°»)', () => {
    const { scene } = build([PYR, '∠SAB = α', 'α = 70']);
    expect(texts(scene)).toEqual(['70°']);
  });

  it('the two single-fact spellings are unchanged: «α» alone, «70°» alone', () => {
    expect(texts(build([PYR, '∠SAB = α']).scene)).toEqual(['α']);
    expect(texts(build([PYR, '∠SAB = 70']).scene)).toEqual(['70°']);
  });

  it('the value wins whichever spelling names the wedge — «∠BAS = 70» after «∠SAB = α»', () => {
    expect(texts(build([PYR, '∠SAB = α', '∠BAS = 70']).scene)).toEqual(['70°']);
  });

  it('two DIFFERENT wedges at one vertex still draw two arcs — the dedup never swallows a real second angle', () => {
    const { scene } = build([PYR, '∠SAB = α', '∠SAD = 50']);
    expect(texts(scene).sort()).toEqual(['50°', 'α']);
    const [a, b] = scene.angles;
    expect(Math.hypot(a.labelX - b.labelX, a.labelY - b.labelY), 'two labels, two places').toBeGreaterThan(5);
  });

  it('a named angle later valued at 90° is a KNEE and no arc — not a knee under an «α» arc (#307)', () => {
    const { scene, knees } = build([PYR, '∠SAB = α', 'α = 90']);
    expect(knees.length).toBe(1);
    expect(texts(scene)).toEqual([]);
  });

  it('a bare marker «∠SAB» still draws its blank arc; the same value stated twice draws once', () => {
    expect(texts(build([PYR, '∠SAB']).scene)).toEqual(['']);
    expect(texts(build([PYR, '∠SAB = 70', '∠BAS = 70']).scene)).toEqual(['70°']);
  });
});

describe('#917 — a stated angle between two segments that CROSS is drawn where they meet', () => {
  /** The true crossing of segments a–b and c–d (closest points must coincide and lie inside both). */
  function crossing(pos: Map<string, Vec3>, a: string, b: string, c: string, d: string): Vec3 {
    const A = pos.get(a)!, B = pos.get(b)!, C = pos.get(c)!, D = pos.get(d)!;
    // both are box diagonals through the centre: verify by the midpoint identity rather than trust it
    const m1 = scale3(add3(A, B), 0.5), m2 = scale3(add3(C, D), 0.5);
    expect(dist3(m1, m2)).toBeLessThan(1e-6);
    return m1;
  }

  it("T3: «הזווית בין AC' לבין BD' היא 55» → ONE arc, anchored at the crossing (the box centre), reading 55", () => {
    const { d, scene } = build([BOX, "הזווית בין AC' לבין BD' היא 55"]);
    expect(texts(scene)).toEqual(['55°']);
    // (1) the anchor the renderer uses IS the true crossing — the shared helper the knee uses
    const pin = d.construction.scalarPins.find((p) => p.kind === 'seg-angle');
    if (!pin || pin.kind !== 'seg-angle') throw new Error('no seg-angle pin');
    const x = meetingPoint({ a: pin.a1, b: pin.b1, c: pin.a2, d: pin.b2 }, d.resolved.positions, 1);
    expect(x, 'the two diagonals meet inside both spans').not.toBeNull();
    expect(dist3(x!, crossing(d.resolved.positions, 'A', "C'", 'B', "D'"))).toBeLessThan(1e-6);
    // (2) on screen: the projection is orthographic, so the crossing projects to the midpoint of A and C'
    const sp = (id: string) => scene.points.find((p) => p.id === id)!;
    const cx = (sp('A').x + sp("C'").x) / 2, cy = (sp('A').y + sp("C'").y) / 2;
    const arc = scene.angles[0];
    const toA = Math.hypot(sp('A').x - cx, sp('A').y - cy);
    const labelDist = Math.hypot(arc.labelX - cx, arc.labelY - cy);
    expect(labelDist, 'the label sits by the crossing, well inside the half-diagonal').toBeLessThan(toA * 0.6);
    expect(labelDist).toBeGreaterThan(1);
    expect(arc.pts.length).toBe(13);
  });

  it('T1 stays unmarked: a SKEW pair draws nothing — a missing mark must not become a lying one', () => {
    const { scene } = build([BOX, "הזווית בין A'C לבין BC' היא 70"]);
    expect(texts(scene)).toEqual([]);
  });

  it('T2 unchanged: the shared-vertex spelling still draws its arc at A', () => {
    expect(texts(build([BOX, 'הזווית בין AC לבין BA היא 40']).scene)).toEqual(['40°']);
  });

  it('the 90° knee is unchanged — a knee, and NOT also an arc labelled 90° (#307)', () => {
    const { scene, knees } = build([BOX, 'הזווית בין AC לבין BD היא 90']);
    expect(knees.length).toBe(1);
    expect(texts(scene)).toEqual([]);
  });

  it('a crossing lane and a vertex lane on one figure: both arcs, each once', () => {
    const { scene } = build([BOX, "הזווית בין AC' לבין BD' היא 55", 'הזווית בין AC לבין BA היא 40']);
    expect(texts(scene).sort()).toEqual(['40°', '55°']);
  });
});
