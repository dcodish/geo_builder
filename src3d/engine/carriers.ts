import type { Claim3, Construction3, Id, PointDef } from './types';
import { freeCoordKey } from './types';

/**
 * #1498 — THE SAMPLED-CARRIER TABLE: one enumeration of every free point-DOF the sampler owns.
 *
 * The #820 rider lane (a sampled parameter is a PIVOT UNKNOWN, so a stated given DRIVES it instead of
 * being judged against the sampler's guess) and `freeDofCount3` (what the DOF cue reports) each kept
 * their own list of carrier kinds, and they drifted: the count knew `on-plane` (2), `on-line` (1),
 * `bisector-ray` (1) and `partial` (n) while the lane enrolled none of them — a DOF that is counted
 * but can never be driven, the ADR-052 conformance smell in its solver form. The operator's case:
 * «נקודה E במישור ABC» then «ABEC מלבן» — satisfiable, refused `givens-contradict`, because E's two
 * in-plane parameters were not unknowns. Both readers now fold THIS table, so a carrier kind added
 * later reaches the lane and the count together or not at all.
 *
 * Each entry is one scalar parameter of one point:
 *  - `key`    — its riderTs key (the bare id for the legacy 1-param kinds, `id@suffix` otherwise;
 *               `@` never occurs in a point label, the #1311 rule).
 *  - `t0`     — how solve3 seeds its soft anchor: an explicit host sample (`seg`/`offset`), the
 *               canonical evaluation's coordinate (`coord-*`), the sampled distance from the ray's
 *               apex (`bis-dist`), or `zero` — the parameter is an OFFSET from the sampled seat, so
 *               the anchor is the seat itself and an undriven figure is byte-identical (ADR-052:
 *               what a given leaves free still varies with the seed).
 *  - `drivable` — false for the parameters the lane cannot yet hold honestly; they still count.
 *               `on-plane` h: its bound (staying on the STATED side) depends on the sampled height,
 *               and the lane's bounds are static. A rider of a FREE plane or free line: the free
 *               subtree re-seats its dependents AFTER the pivot (#557), which would silently discard
 *               a driven value.
 *  - `solvable` — #1615 (ADR-3D-293): the point is placed LINEARLY from this parameter and nothing re-seats it
 *               after the point pass, so a coordinate given can solve it in closed form
 *               (`solveCoordDeterminations`). Wider than `drivable` where the pivot's own limits are not the
 *               solve's: an equation-plane rider is not a pivot unknown, but its in-plane offsets are exactly
 *               solvable. False for a FREE line's or plane's rider (re-seated by the free-carrier fixpoint) and
 *               for a stated side's height (its bound depends on the sampled height).
 */
export type CarrierParam3 = {
  key: string;
  lo: number;
  hi: number;
  spread: boolean;
  t0: 'seg' | 'offset' | 'coord-x' | 'coord-y' | 'coord-z' | 'bis-dist' | 'zero';
  drivable: boolean;
  solvable: boolean;
};

export function carrierParams3(c: Construction3, id: Id, def: PointDef): CarrierParam3[] {
  switch (def.kind) {
    case 'on-segment':
      return def.t === undefined ? [{ key: id, lo: 0, hi: 1, spread: true, t0: 'seg', drivable: true, solvable: true }] : [];
    case 'scaled-offset':
      // #985 (ADR-3D-244): any positive ratio is a figure (k > 1 is a trapezoid whose far side is
      // the longer one); only k ≤ 0 — the corner collapsed onto its anchor — is not one.
      return def.k === undefined ? [{ key: id, lo: 1e-3, hi: Infinity, spread: true, t0: 'offset', drivable: true, solvable: true }] : [];
    case 'free3':
      // #1311 (ADR-3D-260): a never-positioned point's three coordinates.
      return (['x', 'y', 'z'] as const).map((ax) => ({
        key: freeCoordKey(id, ax), lo: -Infinity, hi: Infinity, spread: false, t0: `coord-${ax}` as const, drivable: true, solvable: true,
      }));
    case 'partial':
      // ADR-3D-094: each unstated component is a free sampled DOF (Lane-A absolute, like `coord`).
      // A stated SIGN given was honoured at sample time; a drive keeps it as a lane BOUND, so no
      // solution can carry the component across the side the student stated.
      return (['x', 'y', 'z'] as const)
        .filter((ax) => def[ax] === null)
        .map((ax) => {
          const sg = c.signGivens.find((g) => g.id === id && g.axis === ax);
          const lo = sg?.positive === true ? 1e-9 : -Infinity;
          const hi = sg?.positive === false ? -1e-9 : Infinity;
          return { key: freeCoordKey(id, ax), lo, hi, spread: false, t0: `coord-${ax}` as const, drivable: true, solvable: true };
        });
    case 'on-plane': {
      // Two in-plane offsets from the sampled seat (u along e1, v along e2 — the seat's own basis),
      // drivable only for a POINT-RUN plane's rider: it rides the gauge with the run, and nothing
      // re-seats it behind the pivot's back. A stated side keeps its height as a third, sampled DOF.
      const freePlane = !!c.planes.get(def.plane)?.free;
      const drivable = c.pointPlanes.has(def.plane) && !freePlane;
      const uv: CarrierParam3[] = ['u', 'v'].map((ax) => ({
        key: `${id}@${ax}`, lo: -Infinity, hi: Infinity, spread: false, t0: 'zero', drivable, solvable: !freePlane,
      }));
      return def.side ? [...uv, { key: `${id}@h`, lo: 1e-3, hi: Infinity, spread: false, t0: 'zero', drivable: false, solvable: false }] : uv;
    }
    case 'on-line': {
      // One offset along the line's direction from the sampled seat; a line is infinite both ways,
      // so the parameter is unbounded. A FREE line's rider is re-seated post-pivot (#557) — not drivable.
      const free = c.lines.get(def.line)?.kind === 'free';
      return [{ key: id, lo: -Infinity, hi: Infinity, spread: false, t0: 'zero', drivable: !free, solvable: !free }];
    }
    case 'bisector-ray':
      // #343: the DISTANCE along the bisector ray — a half-line, so the parameter is the absolute
      // distance from the apex (positive; a rider at or behind the apex is not on the ray).
      return [{ key: id, lo: 1e-3, hi: Infinity, spread: false, t0: 'bis-dist', drivable: true, solvable: true }];
    default:
      return [];
  }
}

/**
 * #1615 (ADR-3D-293) — A COORDINATE GIVEN ON A COORD-SYM POINT, read in closed form.
 *
 * Every point whose position carries parameters in the sampled-carrier table above (a segment's `t`, a line's
 * or a plane's offset, a partial point's missing coordinates, …) is placed from a coordinate given by ONE
 * generic step in `resolve3` (`solveCoordDeterminations`), not here. #1561 (ADR-3D-292) had a per-kind case
 * for segments and axes in this reader; they folded into that step.
 *
 * What stays here is the one point kind the table does not hold: a coord-sym point («B(1, t, 2)»), whose
 * letter is the FIGURE parameter, owned by the parameter lane. A coordinate given reads as:
 *  - `determines` — one letter value across the stated components («B(n, 4, p)» ⇒ t = 4), lowered by `apply`
 *    to the `symbol-value` of «t = 4»;
 *  - `contradicts` — a component the definition fixes, or two letter values: false as stated;
 *  - `open` — nothing numeric on the letter's components, or the letter already has a value (then the given
 *    is a claim about it, checked as one — never silently re-valued).
 */
export type CoordReading =
  | { kind: 'determines'; symbol: string; value: number }
  | { kind: 'contradicts' }
  | { kind: 'open' };

export function readCoordGiven(c: Construction3, id: Id, stated: { x: number | null; y: number | null; z: number | null }): CoordReading {
  const def = c.points.get(id);
  if (def?.kind !== 'coord-sym') return { kind: 'open' };
  const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  let t: number | null = null;
  for (const ax of ['x', 'y', 'z'] as const) {
    const v = stated[ax];
    if (v === null) continue;
    const { k, p } = def[ax];
    if (Math.abs(p) < 1e-12) {
      if (!eq(k, v)) return { kind: 'contradicts' }; // a component the definition FIXES
      continue;
    }
    const tx = (v - k) / p;
    if (t !== null && !eq(t, tx)) return { kind: 'contradicts' };
    t = tx;
  }
  const valued = !c.param || c.symbolPins.some((sp) => sp.sym === c.param) || c.paramGivens.length > 0;
  return t === null || valued ? { kind: 'open' } : { kind: 'determines', symbol: c.param!, value: t };
}

/**
 * #1590 (ADR-3D-291) — CAN THE POINT'S OWN STATED DATA STILL ADMIT THIS COORDINATE GIVEN? — for the coord-sym
 * point, the one kind the generic determination does not place. Every other point kind answers this exactly,
 * from the determination's published outcome (`Resolved3.coordDetermined`), not from a second reader.
 */
export function statedDataAdmits(c: Construction3, claim: Claim3): boolean {
  if (claim.type !== 'coords-eq') return true;
  return readCoordGiven(c, claim.id, claim).kind !== 'contradicts';
}
