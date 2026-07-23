/**
 * ADR-3D-056 (#286): a ⊥ whose one arm carries a free symbol-defined point DRIVES that symbol.
 *
 * Operator session `gnudxdzn`: on a pyramid with E = A + t·AS (`AE=t*AS`, t a FREE symbol) and O the
 * base-diagonal centre, `EO⊥AS` should slide E to the foot of the perpendicular from O onto AS — one
 * root-find in t. Instead the ⊥ lowered to a `cos-angle` pin that reshaped the free solid DIMS, so t
 * stayed randomly sampled and the perpendicular held only at lucky seeds (121° at the operator's seed).
 *
 * The lock is the strongest possible: the perpendicular must hold at EVERY seed. (The operator's exact
 * figure additionally carried `60<α<90`, a bound that lives on the measure branch only; the bug — and the
 * fix — are bound-independent, so this reproduces it with a plain `|w|=3`, which is the actual trigger.)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { dot3, sub3 } from '../engine/vec3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);

const build = (steps: string[]) => {
  reset();
  for (const u of steps) submit(u);
  const st = useGeo3.getState();
  return { st, c: derive3(st.facts, st.seed).construction };
};

const perpDeg = (pos: Map<string, { x: number; y: number; z: number }>) => {
  const E = pos.get('E')!;
  const O = pos.get('O')!;
  const A = pos.get('A')!;
  const S = pos.get('S')!;
  const EO = sub3(O, E);
  const AS = sub3(S, A);
  return (Math.acos(Math.max(-1, Math.min(1, dot3(EO, AS) / (Math.hypot(EO.x, EO.y, EO.z) * Math.hypot(AS.x, AS.y, AS.z))))) * 180) / Math.PI;
};

const FIG = ['פירמידה שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS', 'אלכסוני הריבוע נחתכים בנקודה O', '|u|=2', '|w|=3', 'EO⊥AS'];

describe('ADR-3D-056 — a ⊥ drives a symbol-defined point to the foot (#286)', () => {
  beforeEach(reset);

  it('EO⊥AS holds at EVERY seed (the operator\'s figure, bound-free repro)', () => {
    const { st, c } = build(FIG);
    expect(st.lastError).toBeNull();
    for (let s = 0; s < 12; s++) {
      const pos = resolve3(c, s).positions;
      expect(pos.get('E'), `E placed at seed ${s}`).toBeDefined();
      expect(perpDeg(pos), `EO⊥AS at seed ${s}`).toBeCloseTo(90, 4);
    }
  });

  it('E genuinely lands on segment AS (the foot), not off it', () => {
    const { c } = build(FIG);
    for (let s = 0; s < 5; s++) {
      const pos = resolve3(c, s).positions;
      const A = pos.get('A')!, S = pos.get('S')!, E = pos.get('E')!;
      const AS = sub3(S, A);
      const t = dot3(sub3(E, A), AS) / dot3(AS, AS); // E = A + t·AS
      // E is the ⟂-foot of O onto AS; for this figure it sits within the segment
      expect(t, `t in [0,1] at seed ${s}`).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      // and E is exactly on the line AS (zero off-line component)
      const foot = { x: A.x + t * AS.x, y: A.y + t * AS.y, z: A.z + t * AS.z };
      expect(Math.hypot(E.x - foot.x, E.y - foot.y, E.z - foot.z), `E on line AS at seed ${s}`).toBeLessThan(1e-9);
    }
  });

  it('the English phrasing drives it too', () => {
    const { st, c } = build(['פירמידה שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS', 'אלכסוני הריבוע נחתכים בנקודה O', '|u|=2', '|w|=3', 'EO perpendicular to AS']);
    expect(st.lastError).toBeNull();
    for (let s = 0; s < 6; s++) expect(perpDeg(resolve3(c, s).positions), `seed ${s}`).toBeCloseTo(90, 4);
  });

  it('the stripped figure (no |w|) still holds — no regression', () => {
    const { c } = build(['פירמידה שבסיסה ריבוע', 'AS=w', 'AD=u', 'AB=v', 'AE=t*AS', 'אלכסוני הריבוע נחתכים בנקודה O', '|u|=2', 'EO⊥AS']);
    for (let s = 0; s < 6; s++) expect(perpDeg(resolve3(c, s).positions), `seed ${s}`).toBeCloseTo(90, 4);
  });

  it('a ⊥ between two DETERMINED segments (no free symbol) is unaffected — still a verified claim', () => {
    // regression guard for the routing: when neither arm carries a free symbol, the old path runs.
    const { st } = build(['קובייה', "AB⊥AA'"]);
    expect(st.lastError).toBeNull(); // a cube's AB ⟂ AA' holds — a verified claim, not a symbol pin
  });
});
