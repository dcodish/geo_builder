/**
 * #932 (ADR-3D-231) — THE TWO-FACT SPELLING OF A RIDER RATIO REACHES THE SAME GIVEN AS THE CLAUSE.
 *
 * «E על SA» then «SE = t·SA» then «t = ½» — declare the rider, then say what pins it — is the
 * incremental order this product is built around, and it was the one spelling that refused. Measured
 * before the fix, on `פירמידה SABCD שבסיסה ריבוע` + `נסמן: AB = u, AD = v, AS = w`:
 *
 * | spelling | before |
 * | --- | --- |
 * | «E על SA כך ש-SE = t·SA» · «t = ½» (clause) | ✔ E at the midpoint |
 * | «SE = t·SA» · «t = ½» (vec-rel alone)       | ✔ E at the midpoint |
 * | «E על SA» · «SE = t·SA» · «t = ½»           | ✘ `no-solution: S`, then `unknown-symbol: t` |
 * | «E על SA» · «SE = 0.5·SA» (the NUMERIC twin) | ✘ `claim-refuted` |
 * | «E על SA» · «SE = 1·EA» (the HALVES shape)   | ✔ — #748's path already reached it |
 *
 * The last two rows are what located the class. It is not "the vec-rel arm cannot see a rider": the
 * HALVES shape as two facts has worked since #748. It is that the shared retarget chokepoint read only
 * that shape — the WHOLE-HOST shape («a half = k · the whole host») was readable from parse3's clause
 * rule alone, and a symbolic coefficient was excluded from the reader outright. So the numeric
 * whole-host twin failed too, one line apart from a working sibling, and no report had named it.
 *
 * The sharpest test here is the EQUIVALENCE one: the bug is a divergence between paths, so what must
 * be locked is that every spelling produces the same figure — not that one of them works.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, symbolOwnersOf } from '../engine/types';
import type { Command3 } from '../engine/types';

const state = () => useGeo3.getState();
const build = (steps: string[]) => {
  state().clear();
  for (const u of steps) state().submit(u);
  return { st: state(), ...derive3(state().facts, state().seed) };
};
const PYRAMID = ['פירמידה SABCD שבסיסה ריבוע', 'נסמן: AB = u, AD = v, AS = w'];

/** |XY| / |XZ| in the drawn figure. */
const ratio = (positions: Map<string, { x: number; y: number; z: number }>, x: string, y: string, z: string) => {
  const [X, Y, Z] = [x, y, z].map((id) => positions.get(id)!);
  const d = (p: typeof X, q: typeof X) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  return d(X, Y) / d(X, Z);
};
const cmds = (u: string): Command3[] | null => {
  const r = parse3(u);
  return r.ok ? (r.commands as Command3[]) : null;
};

describe('#932 — a rider ratio means the same thing however it is spelled', () => {
  beforeEach(() => state().clear());

  it('the operator sequence: «E על SA» · «SE = t·SA» · «t = ½» puts E at the midpoint', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA', 'SE = t·SA', 't = 1/2']);
    expect(st.lastError, 'no refusal — and in particular not «no-solution: S»').toBeNull();
    expect(st.facts, 'all five statements are facts; none was refused').toHaveLength(5);
    expect(ratio(positions, 'S', 'E', 'A')).toBeCloseTo(0.5, 9);
  });

  it('EQUIVALENCE — every spelling of the same intent draws the same figure', () => {
    const spellings: [string, string[]][] = [
      ['clause, letter', ['E על SA כך ש-SE = t·SA', 't = 1/2']],
      ['vec-rel alone', ['SE = t·SA', 't = 1/2']],
      ['two facts, letter', ['E על SA', 'SE = t·SA', 't = 1/2']],
      ['two facts, number', ['E על SA', 'SE = 0.5·SA']],
      ['clause, number', ['E על SA כך ש-SE = 0.5·SA']],
      ['two facts, halves', ['E על SA', 'SE = 1·EA']],
      ['two facts, whole-host flipped', ['E על SA', 'SA = 2·SE']],
    ];
    for (const [name, tail] of spellings) {
      const { st, positions } = build([...PYRAMID, ...tail]);
      expect(st.lastError, `${name} builds`).toBeNull();
      expect(ratio(positions, 'S', 'E', 'A'), `${name}: E at the midpoint of SA`).toBeCloseTo(0.5, 9);
    }
  });

  it('the two-fact letter spelling reaches the ONE symbol resolver, exactly as the clause does (#902)', () => {
    const forSteps = (steps: string[]) => {
      let c = emptyConstruction3();
      for (const u of steps) for (const cmd of cmds(u)!) {
        const r = applyCommand3(c, cmd);
        expect(r.ok, `${u} applies`).toBe(true);
        if (r.ok) c = r.next;
      }
      return symbolOwnersOf(c, 't');
    };
    const owners = { kind: 'rider', id: 'E', fromB: false };
    expect(forSteps(['פירמידה SABCD שבסיסה ריבוע', 'E על SA', 'SE = t·SA'])).toEqual([owners]);
    expect(forSteps(['פירמידה SABCD שבסיסה ריבוע', 'E על SA כך ש-SE = t·SA']), 'the clause agrees').toEqual([owners]);
  });

  it('the complement direction still measures from the other end — «AE = t·AS»', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA', 'AE = t·AS', 't = 1/4']);
    expect(st.lastError).toBeNull();
    expect(ratio(positions, 'A', 'E', 'S')).toBeCloseTo(0.25, 9);
  });

  it('the host named the OTHER way round still binds the same parameter', () => {
    // The rider's stored host is S–A; the ratio statement names A–S. `symFromB` is relative to the
    // stored host, so the flip must be normalised or «t = ¼» would land at the wrong end.
    const { st, positions } = build([...PYRAMID, 'E על SA', 'AE = t·AS', 't = 1/4']);
    expect(st.lastError).toBeNull();
    expect(ratio(positions, 'S', 'E', 'A'), 'a quarter from A is three quarters from S').toBeCloseTo(0.75, 9);
  });

  // ── the guards: nothing that refused for a GOOD reason may now build ──

  it('a ratio that would push the rider OFF its host is still refused, never clamped', () => {
    const { st } = build([...PYRAMID, 'E על SA', 'SE = 2·SA']);
    expect(st.lastError, 'a rider cannot sit beyond its host').not.toBeNull();
    const { st: st2 } = build([...PYRAMID, 'E על SA', 'SE = t·SA', 't = 2']);
    expect(st2.lastError).toEqual({ code: 'no-solution', id: 'E' });
  });

  it('a rider whose t is ALREADY stated is claimed about, not redefined', () => {
    // «E אמצע SA» determines t = ½; a contradicting ratio must refuse rather than silently re-place E.
    const { st } = build([...PYRAMID, 'E אמצע SA', 'SE = 0.9·SA']);
    expect(st.lastError, 'the second statement is a claim, and it is false').not.toBeNull();
  });

  it('FIRST BINDING WINS across spellings — a second rider does not steal the letter', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA', 'SE = t·SA', 'F על SB', 'SF = t·SB', 't = 1/2']);
    expect(st.lastError).toBeNull();
    expect(ratio(positions, 'S', 'E', 'A'), 'the first rider owns t').toBeCloseTo(0.5, 9);
  });

  it('BLAME: a vec-rel that cannot be read names the point it is about, never the other endpoint', () => {
    // Nothing on this figure is a free rider, so the statement genuinely cannot be lowered. Before
    // #932 the message was «אין מיקום של S שמקיים את התנאי» — S being the pyramid apex, a determined
    // vertex the sentence says nothing about. The subject is the vector's head.
    // The direct arm, isolated and UNCONDITIONAL — a guarded assertion here would be the vacuous
    // oracle: a symbolic vec-rel between two DETERMINED vertices has no rider to lower onto and no
    // unpinned vec-defined target, so it reaches exactly the refusal this fix re-blamed.
    let c = emptyConstruction3();
    for (const cmd of cmds('פירמידה SABCD שבסיסה ריבוע')!) {
      const r = applyCommand3(c, cmd);
      if (r.ok) c = r.next;
    }
    const r = applyCommand3(c, cmds('SB = t·SA')![0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ code: 'no-solution', id: 'B' });
  });
});
