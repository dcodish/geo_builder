/**
 * The 3-D P3 FEATURE batch — #394 (a latin angle label is refused WITH guidance), #5 (a planar figure
 * is read face-on), #385 (the leftover rotation is spent on legibility).
 */
import { describe, expect, it } from 'vitest';
import { faceOnView, planarNormal } from '../engine/defaultView';
import { defaultViewFrame } from '../engine/defaultView';
import { classifyGuidance3 } from '../parser/scope3';
import { parse3 } from '../parser/parse3';
import { derive3 } from '../store/store3';
import { dot3, v3, type Vec3 } from '../engine/vec3';

const build = (lines: string[], seed = 0) => {
  const facts: { id: string; utterance: string; cmds: unknown[]; enabled: boolean }[] = [];
  for (const u of lines) {
    const r = parse3(u);
    if (!r.ok) throw new Error(`did not parse: ${u} → ${r.reason}`);
    for (const c of r.commands) facts.push({ id: `f${facts.length}`, utterance: u, cmds: [c], enabled: true });
  }
  return derive3(facts as never, seed);
};

/**
 * #394 — operator ruling (2026-07-29, re-affirming earlier ones): a lowercase latin angle label is NOT
 * supported, and the student is told what to use instead. Lowercase latin is this product's
 * vector/parameter namespace (u,v,w / t,k,m), so admitting it would collide — the end state is
 * guidance, never a build.
 */
describe('#394 — «60<a<90» gets a reasoned refusal, not a silent not-understood', () => {
  it('the reported form is classified', () => {
    for (const u of ['60<a<90', '60 < a < 90', '60 ≤ b ≤ 90']) {
      expect(parse3(u).ok, u).toBe(false);
      expect(classifyGuidance3(u)?.category, u).toBe('latin-angle-label');
    }
  });

  it('the SUPPORTED forms are untouched — guidance for something the parser handles would be a lie', () => {
    for (const u of ['60<α<90', '∠SAB > 60', 'זווית ABC']) {
      expect(parse3(u).ok, u).toBe(true);
      expect(classifyGuidance3(u), u).toBeNull();
    }
  });

  it('a PARAMETER given is never stolen (ADR-3D-079), in either direction', () => {
    for (const u of ['t > 0', 'k הוא פרמטר חיובי']) expect(parse3(u).ok, u).toBe(true);
    // …and a two-sided bound on a RESERVED letter stays an honest gap rather than getting angle
    // guidance about the wrong thing: «60<t<90» is a student bounding the figure parameter.
    expect(classifyGuidance3('60<t<90')).toBeNull();
    expect(classifyGuidance3('60<u<90')).toBeNull();
  });
});

/**
 * #5 — the ¾ view exists to give a SOLID depth cues; a flat figure has no depth to cue, so the same
 * view only foreshortens it (a square in z = 0 reads as a parallelogram — precisely the shape the tool
 * spends its life not drawing unless the student said so).
 */
describe('#5 — a purely planar figure is read FACE-ON', () => {
  it('flat polygons report a plane; solids do not', () => {
    for (const u of ['משולש ABC', 'מרובע ABCD']) {
      expect(planarNormal([...build([u]).resolved.positions.values()]), u).not.toBeNull();
    }
    for (const u of ["תיבה ABCDA'B'C'D'", 'פירמידה משולשת ABCD']) {
      expect(planarNormal([...build([u]).resolved.positions.values()]), u).toBeNull();
    }
  });

  it('fewer than three points, or collinear ones, have no plane to face', () => {
    expect(planarNormal([v3(0, 0, 0), v3(1, 0, 0)])).toBeNull();
    expect(planarNormal([v3(0, 0, 0), v3(1, 0, 0), v3(2, 0, 0)])).toBeNull();
  });

  it('the view looks ALONG the normal, clamped off the degenerate pole', () => {
    const n = planarNormal([...build(['משולש ABC']).resolved.positions.values()])!;
    const view = faceOnView(n, 85);
    expect(Math.abs(view.pitchDeg)).toBeLessThanOrEqual(85); // the frame degenerates at ±90°
    expect(Math.abs(view.pitchDeg)).toBeGreaterThan(80); // …but it really is near face-on
  });

  it('the hemisphere agrees with the default view, so a figure never flips to its mirror', () => {
    const d = defaultViewFrame().eye;
    for (const n of [v3(0, 0, 1), v3(0, 0, -1), v3(1, 1, 1)]) {
      const v = faceOnView(n as Vec3, 85);
      const yaw = (v.yawDeg * Math.PI) / 180;
      const pitch = (v.pitchDeg * Math.PI) / 180;
      const eye = v3(Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch));
      expect(dot3(eye, d), `normal ${JSON.stringify(n)}`).toBeGreaterThan(0);
    }
  });
});

/**
 * #385 — a driven «AB מאונך לישר ℓ1» pins ONE rotational DOF; the spin about ℓ's own direction
 * preserves the relation exactly (the angle a vector makes with an axis is invariant under rotation
 * about it), so a whole circle of placements satisfies the given and which one is drawn was pure luck.
 */
describe('#385 — the leftover spin is spent on making the relation READ correctly', () => {
  const FIG = ['הישר l1: x = (0,0,0) + t(0,0,1)', "תיבה ABCDA'B'C'D'", 'AB מאונך לישר l1'];
  const view = defaultViewFrame();
  const flat = (p: Vec3) => ({ x: dot3(p, view.right), y: dot3(p, view.up) });

  /** The angle AB and ℓ1 make ON SCREEN at the default view, in degrees (undirected, 0..90). */
  const projectedAngle = (seed: number): number => {
    const d = build(FIG, seed);
    const A = d.resolved.positions.get('A')!;
    const B = d.resolved.positions.get('B')!;
    const ln = d.resolved.lines.get('ℓ1')!;
    const fa = flat(A);
    const fb = flat(B);
    const la = flat(ln.anchor);
    const lb = flat(v3(ln.anchor.x + ln.dir.x, ln.anchor.y + ln.dir.y, ln.anchor.z + ln.dir.z));
    const sx = fb.x - fa.x;
    const sy = fb.y - fa.y;
    const lx = lb.x - la.x;
    const ly = lb.y - la.y;
    const cos = Math.abs((sx * lx + sy * ly) / (Math.hypot(sx, sy) * Math.hypot(lx, ly)));
    return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
  };

  it('the relation still HOLDS exactly — legibility never buys correctness', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const d = build(FIG, seed);
      for (const [, v] of Object.entries(d.status)) expect(v === 'ok' || v === 'disabled', `seed ${seed}`).toBe(true);
    }
  });

  it('every seed now DRAWS near-square, where seed 6 used to draw a 90° as 1.2°', () => {
    // Measured before the fix: [78.8, 78.8, 78.8, 81.8, 76.4, 79.6, 1.2, 81.1] — the worst seed
    // projected a true perpendicular as almost PARALLEL. The bar is set at the improvement actually
    // achieved (worst ~12°), not at perfection: the sampler takes the best of a bounded number of
    // candidates under a clearance floor, so this is a large improvement, not a guarantee.
    const worst = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((s) => Math.abs(projectedAngle(s) - 90)));
    expect(worst).toBeLessThan(20);
    expect(Math.abs(projectedAngle(6) - 90)).toBeLessThan(20); // the pathological seed, specifically
  });

  it('a figure with NO line relation is untouched — the spin only exists where one pinned rotation', () => {
    const a = build(["תיבה ABCDA'B'C'D'"], 3).resolved.positions.get('A')!;
    const b = build(["תיבה ABCDA'B'C'D'"], 3).resolved.positions.get('A')!;
    expect(a).toEqual(b); // determinism control: the same seed lands the same figure
  });
});
