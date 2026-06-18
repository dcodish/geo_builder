/**
 * Playable DOF — free-circle radius sliders (first slice). The store exposes a radius DOF per
 * free circle; dialing one (setRadius) overrides the drawn radius; "show another configuration"
 * (resample) clears the scratchpad. See ADR-048 (a dialed value is a viewing aid, not a fixed given).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

const s = () => useGeoStore.getState();
const run = (u: string) => {
  const r = parse(u);
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
});
