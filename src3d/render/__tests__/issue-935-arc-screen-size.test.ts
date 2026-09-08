/**
 * #935 (ADR-3D-229) — AN ANGLE ARC IS AN ANNOTATION, SO ITS SIZE AND ITS LABEL'S OFFSET BELONG TO THE
 * SCREEN.
 *
 * Operator, playing round #931 (T11): *"the location of the 40 is very far from the angle and the angle
 * itself is quite far from the point A."*
 *
 * Both halves are real. MEASURED on the projected scene at seed 0, 640×460, before and after — the
 * radius as its OUTER value, the gap from the arc's own mid point to the value beside it:
 *
 * | figure | arc radius | % of shortest projected arm | label gap from its arc |
 * | --- | --- | --- | --- |
 * | pyramid + ∠BAS = 40 | 113.9 → **24.4** px | 49 % → **10 %** | 65.6 → **11.0** px |
 * | cube + ∠BAC = 45 | 79.3 → **26.0** px | 52 % → **17 %** | 47.2 → **11.0** px |
 * | pyramid, another camera | 104.9 → **23.9** px | 44 % → **10 %** | 53.0 → **11.0** px |
 *
 * The camera row is the second half of the complaint: one unchanged figure drew its arc at 113.9 px
 * from one view and 104.9 px from another, because a world radius is whatever the projection makes of
 * it. The gap is now the same 11.0 px on every figure and from every camera, which is the whole point.
 *
 * Root cause: the radius was `Math.min(d1, d2) * 0.3` — 30 % of the shorter arm in WORLD units — and
 * the label sat at `r × 1.6` along the world bisector, 60 % beyond the arc by construction and then
 * projected, so its on-screen gap was whatever the projection made of it. This is the #374 class, whose
 * fix (a knee is an annotation, `KNEE_PX / k`) sits 270 lines below in the same file and was applied to
 * the knee alone.
 *
 * These assert the PROJECTED scene, because that is where the defect lives: a world-space assertion
 * passes on every broken build.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../../parser/parse3';
import { derive3 } from '../../store/store3';
import { buildScene3 } from '../scene3';
import { HOME_CAMERA } from '../camera';
import type { Camera3 } from '../camera';

const VIEWPORT = { width: 640, height: 460 };

function sceneOf(steps: string[], cam: Camera3 = HOME_CAMERA) {
  let facts: { id: string; utterance: string; cmds: unknown[]; enabled: boolean }[] = [];
  for (const u of steps) {
    const r = parse3(u);
    if (!r.ok) throw new Error(`parse failed «${u}»`);
    facts = [...facts, { id: `f${facts.length}`, utterance: u, cmds: r.commands, enabled: true }];
  }
  const d = derive3(facts as never, 0);
  return buildScene3(d.construction, d.resolved, cam, VIEWPORT);
}

/** The arc's radius on screen, and its label's gap from the arc — both measured about the vertex. */
function arcGeometry(steps: string[], vertexLabel: string, cam: Camera3 = HOME_CAMERA) {
  const scene = sceneOf(steps, cam);
  const V = scene.points.find((p) => p.label === vertexLabel);
  if (!V) throw new Error(`no vertex ${vertexLabel} on screen`);
  expect(scene.angles, 'the figure must draw exactly one arc for these locks to mean anything').toHaveLength(1);
  const a = scene.angles[0];
  const radii = a.pts.map((q) => Math.hypot(q.x - V.x, q.y - V.y));
  const mid = a.pts[Math.floor(a.pts.length / 2)];
  const armPx = scene.edges
    .filter((e) => Math.hypot(e.x1 - V.x, e.y1 - V.y) < 1 || Math.hypot(e.x2 - V.x, e.y2 - V.y) < 1)
    .map((e) => Math.hypot(e.x2 - e.x1, e.y2 - e.y1));
  return {
    rMin: Math.min(...radii),
    rMax: Math.max(...radii),
    /** the gap a reader actually sees: from the arc's own mid point to the value beside it */
    labelGap: Math.hypot(a.labelX - mid.x, a.labelY - mid.y),
    shortestArmPx: Math.min(...armPx),
  };
}

const PYRAMID = ['פירמידה SABCD שבסיסה ריבוע', '∠BAS = 40'];
const CUBE = ['קובייה ABCD', '∠BAC = 45'];

describe('#935 — the arc reads at an annotation’s size', () => {
  it('the operator’s figure: the arc is ~24 px, not 107 (was 49 % of its arm, now a tenth)', () => {
    const g = arcGeometry(PYRAMID, 'A');
    // The band, not the number: a later constant change should be a deliberate act, not a silent one.
    expect(g.rMax).toBeGreaterThan(14);
    expect(g.rMax).toBeLessThan(30); // fails on main at 113.9
    // And it never overruns the arm it annotates.
    expect(g.rMax / g.shortestArmPx).toBeLessThan(0.25); // fails on main at 0.49
  });

  it('the label sits a FIXED pixel gap outside its arc, not 60 % beyond it in world space', () => {
    const g = arcGeometry(PYRAMID, 'A');
    expect(g.labelGap).toBeGreaterThan(6);
    expect(g.labelGap).toBeLessThan(18); // fails on main at 65.6 from the arc mid point
  });

  it('a cube: half its arm before, a sixth now — and the same 11 px gap', () => {
    const g = arcGeometry(CUBE, 'A');
    expect(g.rMax / g.shortestArmPx).toBeLessThan(0.25); // fails on main at 0.52
    expect(g.labelGap).toBeGreaterThan(6);
    expect(g.labelGap).toBeLessThan(18);
  });
});

describe('#935 — the size is the camera’s, not the world’s', () => {
  it('two cameras draw the same figure’s arc at the same size', () => {
    const home = arcGeometry(PYRAMID, 'A');
    const other = arcGeometry(PYRAMID, 'A', { yaw: 1.1, pitch: 0.5 });
    // A 3-D arc still foreshortens — it lies in the wedge's own plane, exactly as the #374 knee does —
    // so the bound is on the arc's OUTER radius, which is what sets the annotation's apparent size.
    // On main these differ by 9.0 px (113.9 vs 104.9); the point is that both are now pinned to the
    // same screen constant instead of to the figure's world dimensions.
    expect(Math.abs(home.rMax - other.rMax)).toBeLessThan(6);
    expect(other.labelGap).toBeGreaterThan(6);
    expect(other.labelGap).toBeLessThan(18);
  });
});

describe('#935 — a genuinely short corner keeps its arc inside its arms', () => {
  it('an arm of ~43 px gets an arc of ~9 px, not the full 26', () => {
    // The pixel radius alone would be wrong here: the clamp is taken on the PROJECTED arm, because a
    // foreshortened arm is short ON THE PAGE whatever it measures in the world — which is the same
    // mistake, one level down, as sizing the radius in world units.
    const g = arcGeometry(['פירמידה SABCD שבסיסה ריבוע', 'E על AB כך ש-AE = 0.12·AB', '∠EAS = 40'], 'A');
    expect(g.shortestArmPx).toBeLessThan(60); // the premise: this really is a short corner
    expect(g.rMax).toBeLessThan(g.shortestArmPx * 0.25);
    expect(g.rMax).toBeLessThan(14); // the clamp fired — the flat 26 px would have overrun the arm
  });
});
