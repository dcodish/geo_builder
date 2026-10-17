/**
 * #2126 (ADR-3D-350) — a circle's carrier plane is not a student plane. `evaluate3` published every circle's plane
 * into `resolved.planes` under the circle's internal id («circle-ABC», «circle-O», «circle-A»), so every plane
 * surface showed a plane the student never stated: the canvas drew a full blue patch labelled with the id, the
 * נתונים panel listed it under «מישורים», a stated «מישור ABC» drew twice (ABC and circle-ABC, coincident), and a
 * line through the circle's plane was offered a crossing point with «circle-ABC».
 *
 * Operator ruling 2026-10-15 (A): a circle's plane is not drawn unless the student names it or asks for it — as a
 * triangle draws none, and as 2-D. The circle keeps its plane in `circles3` (centre + normal), which is what its
 * outline is drawn from; nothing read the plane back by the circle's id.
 *
 * Class: a plane the student never stated is published into the student-plane map. Locked across every circle kind
 * (circum, incircle, tangent-line, centre-in-plane), both inscription voices, a named circle, a square's ring and a
 * solid's face — and the plane surfaces that read the map: the scene's patches + labels and the crossing offers.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { openCrossings3 } from '../engine/crossings3';

type State = { facts: Fact3[]; seed: number };
function run(lines: string[]) {
  let s: State = { facts: [], seed: 0 };
  const kinds: string[] = [];
  for (const line of lines) {
    const v = decideSubmit3(s, line);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.code}` : v.kind);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
  }
  const d = derive3(s.facts, s.seed);
  const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 });
  return { kinds, s, d, scene, planes: [...d.resolved.planes.keys()].sort() };
}

const L1_TANGENT = 'l1:x=(0,1,0)+t(1,0,0)';

/** [figure, the circle ids it draws] — each one a circle the student stated, with no plane stated. */
const CIRCLES: [string[], string[]][] = [
  [['משולש ABC', 'משולש ABC חסום במעגל'], ['circle-ABC']],
  [['משולש ABC', 'מעגל חוסם את ABC'], ['circle-ABC']],
  [['משולש ABC', 'מעגל חסום במשולש ABC'], ['circle-in-ABC']],
  [['משולש ABC', 'משולש ABC חסום במעגל O'], ['circle-O']],
  [['triangle ABC', 'a circle circumscribed about triangle ABC'], ['circle-ABC']],
  [['ריבוע ABCD', 'ריבוע ABCD חסום במעגל'], ['circle-ABCD']],
  [['פירמידה SABC', 'משולש ABC חסום במעגל'], ['circle-ABC']],
  [['A(0,0,0)', L1_TANGENT, 'מעגל A משיק לישר l1 בנקודה B'], ['circle-A']],
];

describe('#2126 — a circle draws no plane of its own', () => {
  for (const [lines, circles] of CIRCLES) {
    it(`«${lines.join(' · ')}»`, () => {
      const r = run(lines);
      expect(r.kinds.every((k) => k === 'record'), r.kinds.join()).toBe(true);
      for (const f of r.s.facts) expect(r.d.status[f.id], f.utterance).toBe('ok');
      // the circle is still drawn …
      expect(r.d.resolved.circles3.map((k) => k.id).sort()).toEqual(circles);
      for (const k of r.d.resolved.circles3) expect(k.radius).toBeGreaterThan(1e-6);
      // … and no plane is published under its id: no patch, no label, no «מישורים» row
      expect(r.planes.filter((n) => n.startsWith('circle-'))).toEqual([]);
      expect(r.scene.planes.map((p) => p.name).filter((n) => n.startsWith('circle-'))).toEqual([]);
    });
  }

  it('the triangle alone stays planeless (control, unchanged)', () => {
    expect(run(['משולש ABC']).planes).toEqual([]);
  });

  it('the triangle and its circle publish no plane at all — as the triangle alone', () => {
    const r = run(['משולש ABC', 'משולש ABC חסום במעגל']);
    expect(r.planes).toEqual([]);
    expect(r.scene.planes).toEqual([]);
  });
});

describe('#2126 — a plane the student names is drawn once', () => {
  for (const lines of [
    ['משולש ABC', 'משולש ABC חסום במעגל', 'מישור ABC'],
    ['משולש ABC', 'מישור ABC', 'משולש ABC חסום במעגל'],
  ]) {
    it(`«${lines.join(' · ')}» → ABC only`, () => {
      const r = run(lines);
      expect(r.kinds).toEqual(['record', 'record', 'record']);
      expect(r.d.resolved.circles3.map((k) => k.id)).toEqual(['circle-ABC']);
      expect(r.planes).toEqual(['ABC']);
      expect(r.scene.planes.map((p) => p.name)).toEqual(['ABC']);
    });
  }

  it('a circle in a stated plane shows that plane only', () => {
    const r = run(['π1: z=0', 'O(0,0,0)', L1_TANGENT, 'מעגל O במישור π1 משיק לישר l1 בנקודה B']);
    expect(r.kinds.every((k) => k === 'record'), r.kinds.join()).toBe(true);
    expect(r.d.resolved.circles3.map((k) => k.id)).toEqual(['circle-O']);
    expect(r.planes).toEqual(['π1']);
  });
});

describe('#2126 — no crossing is offered with a circle’s plane', () => {
  it('a line through a pyramid face’s circle is offered nothing — as without the circle', () => {
    const line = 'l1:x=(0.3,0.3,-1)+t(0,0,1)';
    const withCircle = run(['פירמידה SABC', 'משולש ABC חסום במעגל', line]);
    const without = run(['פירמידה SABC', line]);
    const offers = (r: ReturnType<typeof run>) => openCrossings3(r.d.construction, r.d.resolved).map((k) => k.plane);
    expect(offers(withCircle).filter((p) => p.startsWith('circle-'))).toEqual([]);
    expect(offers(withCircle)).toEqual(offers(without));
  });
});
