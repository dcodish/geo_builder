/**
 * Playable DOF — free-circle radius sliders (first slice). The store exposes a radius DOF per
 * free circle; dialing one (setRadius) overrides the drawn radius; "show another configuration"
 * (resample) clears the scratchpad. See ADR-048 (a dialed value is a viewing aid, not a fixed given).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';
import { circleMembers, isGeoPoint } from '@/engine';

const s = () => useGeoStore.getState();
const run = (u: string) => {
  const r = parse(u);
  if (!r.ok) throw new Error(`parse failed: ${u}`);
  for (const cmd of r.commands) s().execute(cmd, u);
};
/** Run an utterance with the live figure threaded as parse context (as the app does). */
const ctxRun = (u: string) => {
  const { construction } = replay(s().facts);
  const ctx = {
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.center] : [])),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction),
  };
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`parse failed: ${u}`);
  for (const cmd of r.commands) s().execute(cmd, u);
};

describe('radius DOF sliders', () => {
  beforeEach(() => s().clear());

  it('exposes one radius DOF per free circle; dialing one resizes it; resample clears it', () => {
    run('שני מעגלים נחתכים בנקודות A ו B'); // two free-radius circles O, P

    const d0 = replay(s().facts, s().seed, s().radiusOverrides);
    expect(d0.radiusDofs.map((x) => x.center).sort()).toEqual(['O', 'P']);

    const o = d0.radiusDofs.find((x) => x.center === 'O')!;
    const dialed = o.base * 1.15;
    s().setRadius(o.circle, dialed);

    const d1 = replay(s().facts, s().seed, s().radiusOverrides);
    const circO = d1.construction.objects.find((x) => x.id === o.circle && x.kind === 'circle') as { radius: { value: number } };
    expect(circO.radius.value, 'dialed radius is applied to the drawn circle').toBeCloseTo(dialed, 3);

    s().resample(); // "show another configuration" resets the scratchpad
    expect(Object.keys(s().radiusOverrides), 'overrides cleared on resample').toHaveLength(0);
  });

  it('resample reports whether it found a DIFFERENT drawing (operator: "5 DOF but every view is the same")', () => {
    // A free triangle has real shape variety → resample finds a different drawing (true).
    run('משולש ABC');
    expect(s().resample(), 'a free triangle varies').toBe(true);

    // A figure RIGID up to similarity (a square — only size/rotation/place free) → resample searches and
    // finds nothing different, returning false so the UI can say "no other configuration".
    s().clear();
    run('ריבוע ABCD');
    expect(replay(s().facts).lastError, 'the figure builds').toBeNull();
    expect(s().resample(), 'a square is determined ⇒ no different configuration').toBe(false);
    // NOTE: the previous example here — inscribed `AB=AC` + `∠BAC = 2∠CAD` — was assumed shape-determined,
    // but it is genuinely UNDER-determined (freeDofCount 1; ∠BAC ranges ~39°–67° across valid configs). The
    // old assertion only held because the equality-recruited carriers were FROZEN out of sampling — the exact
    // [ADR-141](docs/06-decisions.md#adr-141) bug. With that fixed, its hidden DOF is sampled and resample
    // (correctly) finds a different drawing, so it is no longer a valid "determined" example.
  });

  it('refuses to dial a radius that makes the figure IMPOSSIBLE (a DOF can\'t be moved into an invalid state)', () => {
    // The operator's figure: tangents from D to circle O, then "המשך BD חותך את המשך OC". It's only
    // constructible for a radius range (~[4.3, 6) here — below: the directional cut goes over-constrained;
    // at/above 6: D falls inside the circle, no tangents). The radius slider must STOP at that range.
    ctxRun('מעגל O');
    ctxRun('מנקודה D שני משיקים למעגל בנקודות B ו C');
    ctxRun('המשך BD חותך את המשך OC בנקודה A');
    const dof = replay(s().facts, s().seed, s().radiusOverrides).radiusDofs[0];
    expect(replay(s().facts, s().seed, s().radiusOverrides).positions.get('A'), 'A built at the base radius').toBeDefined();

    s().setRadius(dof.circle, 5.5); // a valid dial — accepted
    expect(s().radiusOverrides[dof.circle]).toBe(5.5);

    s().setRadius(dof.circle, 3); // below the range (directional cut over-constrains) — REJECTED
    expect(s().radiusOverrides[dof.circle], 'too-small radius rejected, slider holds').toBe(5.5);

    s().setRadius(dof.circle, 7); // above the range (D inside the circle, no tangents) — REJECTED
    expect(s().radiusOverrides[dof.circle], 'too-large radius rejected, slider holds').toBe(5.5);

    // the figure stays valid (A present) throughout — never a broken/empty drawing
    expect(replay(s().facts, s().seed, s().radiusOverrides).positions.get('A'), 'figure intact').toBeDefined();
  });

  it('an inscribed polygon with no stated radius has a FREE radius (a slider), not a frozen default', () => {
    // "triangle ABC inscribed in circle O" — no radius stated, so the circle's size is a free DOF (ADR-052)
    // the student can dial; it used to be frozen at the default 5 with no slider.
    run('משולש ABC חסום במעגל O');
    const fig = replay(s().facts, s().seed, s().radiusOverrides);
    const circO = fig.construction.objects.find((o) => o.id === 'circle-O' && o.kind === 'circle') as { radius: { via: string } };
    expect(circO.radius.via, 'unstated inscribed radius is FREE').toBe('free');
    expect(fig.radiusDofs.map((d) => d.center), 'and it shows a slider').toEqual(['O']);
  });

  it('keeps the radius slider when a constraint can be met by ANOTHER free DOF (the apex), not the radius', () => {
    // Tangents from A to circle O, then ∠CAB=90. The apex A is a FREE DOF (not pinned — ADR-052), so the
    // angle drives A and the radius stays a free, playable slider; dialing R re-solves A to keep ∠CAB=90.
    ctxRun('מעגל');
    ctxRun('מנקודה A יוצאים שני משיקים למעגל בנקודות B ו C');
    ctxRun('∠CAB=90');
    const dofs = replay(s().facts, s().seed, s().radiusOverrides).radiusDofs;
    expect(dofs.map((d) => d.center), 'the free radius is still a slider (apex absorbs the angle, not R)').toEqual(['O']);

    const ang = (a: { x: number; y: number }, v: { x: number; y: number }, b: { x: number; y: number }) => {
      const u = { x: a.x - v.x, y: a.y - v.y }, w = { x: b.x - v.x, y: b.y - v.y };
      return (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))))) * 180) / Math.PI;
    };
    // dialing R to a few values keeps ∠CAB = 90 (A re-solves around the chosen radius)
    for (const R of [4, 6]) {
      s().setRadius(dofs[0].circle, R);
      const f = replay(s().facts, s().seed, s().radiusOverrides);
      expect(f.lastError, `R=${R} accepted`).toBeNull();
      expect(ang(f.positions.get('B')!, f.positions.get('A')!, f.positions.get('C')!), `∠CAB stays 90 at R=${R}`).toBeCloseTo(90, 1);
    }
  });
});
