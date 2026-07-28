/**
 * #371: a parametric line's canvas echo must not print one SAMPLED value of an unpinned parameter as if
 * it were the given. Operator (2026-07-28): `l1:x=t(0,m,2m-2)` echoed `t·(0, 0.736, -0.529)` — "it
 * translated the m to something I'm not sure by what logic". The logic was: whatever `m` this seed drew.
 * The rule is ADR-3D-030 Am. 2 — a number on the canvas must be seed-invariant KNOWLEDGE.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const formAt = (seed: number): string => {
  const d = derive3(state().facts, seed);
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).lines[0]?.form ?? '';
};

describe('#371 — an unpinned parameter is echoed symbolically', () => {
  beforeEach(() => state().clear());

  it("the operator's line echoes its own form, identically at every seed", () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    const forms = [0, 1, 2, 3, 4, 5].map(formAt);
    for (const f of forms) {
      expect(f, 'the parameter is shown, not a sample of it').toContain('m');
      expect(f).not.toMatch(/0\.\d{3}/); // no sampled decimals
    }
    expect(new Set(forms).size, 'one given reads as ONE line in every configuration').toBe(1);
  });

  it('a line with NO parameter still echoes its resolved numbers (they are knowledge)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('הישר ℓ: x = (0,2,0) + t(2,-2,0)');
    const f = formAt(0);
    expect(f).toContain('2');
    expect(f).not.toContain('m');
    expect(formAt(3), 'and it is seed-invariant').toBe(f);
  });
});

describe('#371 — the boundary: a PINNED parameter is knowledge, so the numbers come back', () => {
  beforeEach(() => state().clear());

  it('the 2024-Q2 line: symbolic while m is open, resolved once the ⟂ given pins it', () => {
    submit('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
    submit('המישור π: 3x + my + (m+6)z + 4 = 0');
    const open = formAt(0);
    expect(open, 'm is open — echo the student form').toContain('m');

    submit('הישר ℓ ניצב למישור π'); // pins m = -5
    expect(state().lastError).toBeNull();
    const pinned = formAt(0);
    expect(pinned, 'pinned — the numbers ARE knowledge now').not.toContain('m');
    expect(pinned, 'and they are seed-invariant').toBe(formAt(4));
    expect(pinned, 'm = -5 ⇒ dir = (-6, 10, -2)').toContain('-6');
  });
});
