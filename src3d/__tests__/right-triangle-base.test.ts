/**
 * #435 (ADR-3D-111): a stated RIGHT-ANGLED triangle base is lowered, and never read as the SOLID's own
 * rightness.
 *
 * Prod evidence (log-triage 2026-08-08, 2 distinct users, sessions `u5vrlgt0` / `o7xr8bc5`):
 * `פירמידה עם בסיס משולש ישר זווית` and `שרטט פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC`,
 * both logged `parser/ok`. Two defects in one utterance:
 *
 *  (1) the stated right angle was SILENTLY DROPPED — `statedTriShape` (the ONE vocabulary ADR-3D-110
 *      created for exactly this) had no right-angled member, and `droppedTriShape3` watched only the
 *      equal-sides words, so nothing warned either;
 *  (2) the `ישר` of `ישר זווית` — a word describing the BASE — was matched by the pyramid's own
 *      `/ישרה?/` rightness test, so a free `tetra` silently became a `pyramid3` (apex over the
 *      circumcentre): a property the student never stated, the ADR-052 cardinal sin.
 *
 * The English side had the identical leak via `\bright\b` ("right triangle" read as "right pyramid"),
 * and there it also diverted the sentence away from the solid rules entirely — `rightTriangle` answered
 * with a flat `polygon3`, dropping the SOLID.
 *
 * What this locks: the (qualifier x position x locale) matrix, asserted GEOMETRICALLY at several seeds —
 * so the base angle is really 90 degrees, not merely a command that was emitted.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { droppedTriShape3 } from '../parser/honesty3';
import { derive3, useGeo3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`expected a parse for ${u}: ${JSON.stringify(r)}`);
  return r.commands;
};
const solidKinds = (u: string) => cmds(u).filter((c) => c.type === 'solid').map((c) => (c as { kind: string }).kind);
const rightAngles = (u: string) => cmds(u).filter((c) => c.type === 'cos-angle' && (c as { cos: number }).cos === 0).length;
const equalRels = (u: string) => cmds(u).filter((c) => c.type === 'length-rel').length;

const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const dot = (v: Vec3, w: Vec3) => v.x * w.x + v.y * w.y + v.z * w.z;

/** The angle at `mid` in the built figure, in degrees, at a given seed. */
function angleAt(utterances: string[], mid: string, a: string, b: string, seed: number): number {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const u of utterances) useGeo3.getState().submit(u);
  const pos = derive3(useGeo3.getState().facts, seed).positions;
  const [P, A, B] = [pos.get(mid), pos.get(a), pos.get(b)];
  if (!P || !A || !B) throw new Error(`missing points for ${mid}/${a}/${b}`);
  const [u, v] = [sub(A, P), sub(B, P)];
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))))) * 180) / Math.PI;
}

const SEEDS = [0, 1, 2, 3, 5];

describe('#435 — a right-angled triangle BASE is lowered', () => {
  it('the reported label-less pyramid keeps its base right angle at every seed', () => {
    for (const seed of SEEDS)
      expect(angleAt(['פירמידה עם בסיס משולש ישר זווית'], 'B', 'A', 'C', seed)).toBeCloseTo(90, 3);
  });

  it('the reported labelled pyramid keeps BOTH givens — right angle AND the isosceles legs', () => {
    const u = ['שרטט פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC'];
    for (const seed of SEEDS) {
      expect(angleAt(u, 'B', 'A', 'C', seed)).toBeCloseTo(90, 3);
      // a right triangle's equal sides can only be its LEGS, so the pair anchors at the right angle
      useGeo3.setState({ facts: [], seed: 0, lastError: null });
      useGeo3.temporal.getState().clear();
      for (const x of u) useGeo3.getState().submit(x);
      const pos = derive3(useGeo3.getState().facts, seed).positions;
      const [A, B, C] = [pos.get('A')!, pos.get('B')!, pos.get('C')!];
      expect(len(sub(A, B))).toBeCloseTo(len(sub(C, B)), 3);
    }
  });

  it('the base right angle holds in a PRISM too (the sibling rule)', () => {
    for (const seed of SEEDS)
      expect(angleAt(['מנסרה שבסיסה משולש ישר זווית'], 'B', 'A', 'C', seed)).toBeCloseTo(90, 3);
  });

  it('the flat triangle lane is unchanged', () => {
    for (const seed of SEEDS) expect(angleAt(['משולש ישר זווית ABC'], 'B', 'A', 'C', seed)).toBeCloseTo(90, 3);
  });
});

describe('#435 — the base qualifier is never read as the SOLID own rightness', () => {
  // The control rows are the proof: the ONLY difference is the base qualifier, so if the kind changes
  // with it, the solid is reading a word that belongs to the base noun.
  it.each([
    ['HE, no qualifier (control)', 'פירמידה SABC שבסיסה משולש ABC', 'tetra'],
    ['HE, right-ANGLED base', 'פירמידה SABC שבסיסה משולש ישר זווית ABC', 'tetra'],
    ['HE, genuinely right pyramid', 'פירמידה ישרה SABC שבסיסה משולש ABC', 'pyramid3'],
    ['HE, right pyramid over a right base', 'פירמידה ישרה SABC שבסיסה משולש ישר זווית ABC', 'pyramid3'],
    ['EN, no qualifier (control)', 'pyramid SABC with a triangle base ABC', 'tetra'],
    ['EN, right-ANGLED base', 'pyramid SABC with a right triangle base ABC', 'tetra'],
    ['EN, genuinely right pyramid', 'right pyramid SABC with a triangle base ABC', 'pyramid3'],
  ])('%s → %s', (_label, utterance, kind) => {
    expect(solidKinds(utterance)).toEqual([kind]);
  });

  it('a prism over a right-angled base stays OBLIQUE (rightness unstated), both locales', () => {
    for (const u of ['מנסרה שבסיסה משולש ישר זווית', 'prism with a right triangle base']) {
      const solid = cmds(u).find((c) => c.type === 'solid') as { kind: string; oblique?: boolean };
      expect(solid.kind).toBe('prism3');
      expect(solid.oblique).toBe(true);
      expect(rightAngles(u)).toBe(1);
    }
  });

  it('an English solid sentence still builds the SOLID, not a flat triangle', () => {
    // pre-fix these fell through to `rightTriangle` and answered `polygon3` — the solid vanished
    expect(solidKinds('pyramid SABC with a right triangle base ABC')).toEqual(['tetra']);
    expect(solidKinds('prism with a right triangle base')).toEqual(['prism3']);
  });
});

describe('#435 — the qualifier is lowered in every position (the ADR-3D-110 doctrine)', () => {
  it.each([
    ['label-less pyramid', 'פירמידה עם בסיס משולש ישר זווית'],
    ['labelled pyramid', 'פירמידה SABC שבסיסה משולש ישר זווית ABC'],
    ['right pyramid', 'פירמידה ישרה SABC שבסיסה משולש ישר זווית ABC'],
    ['oblique prism', 'מנסרה שבסיסה משולש ישר זווית'],
    ['right prism', 'מנסרה ישרה שבסיסה משולש ישר זווית'],
    ['flat triangle', 'משולש ישר זווית ABC'],
    ['EN pyramid', 'pyramid SABC with a right triangle base ABC'],
    ['EN prism', 'prism with a right triangle base'],
  ])('%s lowers the right angle', (_label, utterance) => {
    expect(rightAngles(utterance)).toBeGreaterThanOrEqual(1);
  });

  it('right AND equal-sides are independent — both lower together', () => {
    const u = 'פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC';
    expect(rightAngles(u)).toBe(1);
    expect(equalRels(u)).toBe(1);
  });

  it('an equilateral base keeps its template AND still lowers a stated right angle', () => {
    // `pyramid3e`'s base IS equilateral, so its equal half needs no constraints — but the two givens
    // are independent, so the right angle must still appear. (Geometrically contradictory; the point
    // is that neither given is silently discarded — the solver reports the conflict honestly.)
    const u = 'פירמידה ישרה שבסיסה משולש שווה צלעות ישר זווית';
    expect(rightAngles(u)).toBe(1);
  });
});

describe('#435 — the honesty gate watches the same vocabulary', () => {
  it('flags a dropped right angle even when the equal pair IS accounted for', () => {
    // the exact pre-fix shape: an isosceles `length-rel` landed, the right angle did not
    const partial = cmds('פירמידה SABC שבסיסה משולש שווה שוקיים ABC');
    expect(droppedTriShape3('פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC', partial)).toContain('ישר זווית');
  });

  it('passes when both givens land', () => {
    const u = 'פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC';
    expect(droppedTriShape3(u, cmds(u))).toEqual([]);
  });

  it('does not fire on a solid whose own rightness is stated but has no triangle qualifier', () => {
    const u = 'פירמידה ישרה SABC שבסיסה משולש ABC';
    expect(droppedTriShape3(u, cmds(u))).toEqual([]);
  });
});
