import { describe, it, expect } from 'vitest';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import { detectRelations } from '@/engine';
import { relationAt } from '@/render/scene';
import { fitTransform } from '@/render/transform';
import { factsOf } from './scenarios-corpus';

/**
 * Hover-pick regression (issue #18): the "show equal sides & angles" layer is HOVER-only (ADR-167 Am. 2),
 * and inside a narrow wedge the raw closer-wins disambiguation let an arm segment steal every possible
 * cursor position — a stated equal-angle class was detected but structurally undisplayable.
 */
describe('reported scenarios — narrow equal-angle classes are hoverable (issue #18)', () => {
  it('[narrow-angle-class-pickable] wtgzh6v2: the stated ∠EKO=∠ABK class is detected AND pickable at the K wedge', () => {
    // The operator's exact bagrut-Q4 figure (session wtgzh6v2, the #17 figure): the input states
    // ∠EKO=∠ABK, the figure builds ✓ — but hovering could never reveal the equal angles: ∠EKO is 16.8°,
    // its arms are radii/chords (always in an equal-length class), and inside a wedge ≲26° every probe
    // within the 44px vertex reach is under the 10px segment reach of the nearest arm. relationAt now
    // excludes an ACTIVE wedge's own arms from the segment candidates (pointing into a wedge is
    // unambiguous angle intent); genuinely separate segments still compete closer-wins.
    const facts = factsOf([
      'AB קוטר במעגל O',
      'המיתר CK חותך את הרדיוס AO בנקודה E',
      'זווית EKO = זווית ABK',
      'המשך הקטע KO חותך את המיתר CB בנקודה P',
      'PO = 4',
      'רדיוס המעגל הוא 4.8',
    ]);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    // Detection finds the stated equality — a class holding BOTH a K-vertex angle and ∠ABK (the stated
    // ∠EKO appears under its alias ∠CKO: ray K→E ≡ ray K→C since E lies on chord CK).
    const rel = detectRelations(fig.construction);
    const cls = rel.equalAngles.find(
      (c) => c.some((m) => m.vertex === 'K') && c.some((m) => m.vertex === 'B'),
    );
    expect(cls, `the ∠EKO=∠ABK class is detected (got ${JSON.stringify(rel.equalAngles)})`).toBeDefined();
    const clsIndex = rel.equalAngles.indexOf(cls!);
    // The K wedge whose rays run toward {C/E} and O — the angle the operator stated.
    const kMember = cls!.find((m) => m.vertex === 'K' && [m.a, m.b].includes('O'))!;
    expect(kMember, 'the class has a K-vertex member with an O ray').toBeDefined();
    const pos = fig.positions;
    const K = pos.get('K')!, Pa = pos.get(kMember.a)!, Pb = pos.get(kMember.b)!;
    // App-faithful reaches (Figure.relationPickAt): segReach 10px, vertReach 44px, converted to world
    // units through the isotropic fit of the figure into the canvas.
    const t = fitTransform([...pos.values()].filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y)), { width: 800, height: 600, padding: 24 });
    const segReach = 10 / t.scale, vertReach = 44 / t.scale;
    // Probe ON THE WEDGE BISECTOR at 60% of the vertex reach — the natural place a student points.
    const angA = Math.atan2(Pa.y - K.y, Pa.x - K.x);
    let angB = Math.atan2(Pb.y - K.y, Pb.x - K.x);
    while (angB - angA > Math.PI) angB -= 2 * Math.PI;
    while (angB - angA < -Math.PI) angB += 2 * Math.PI;
    const mid = (angA + angB) / 2;
    const probe = { x: K.x + 0.6 * vertReach * Math.cos(mid), y: K.y + 0.6 * vertReach * Math.sin(mid) };
    const pick = relationAt(rel, pos, probe, segReach, vertReach);
    expect(pick, 'pointing into the stated narrow wedge picks its ANGLE class').toEqual({ kind: 'angle', classIndex: clsIndex });
  });
});
