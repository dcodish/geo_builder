import type { Claim3, Construction3, Id, PointDef, Positions3 } from './types';
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
 *               a driven value. An equation-plane rider is Lane-A absolute — a different drive.
 */
export type CarrierParam3 = {
  key: string;
  lo: number;
  hi: number;
  spread: boolean;
  t0: 'seg' | 'offset' | 'coord-x' | 'coord-y' | 'coord-z' | 'bis-dist' | 'zero';
  drivable: boolean;
};

export function carrierParams3(c: Construction3, id: Id, def: PointDef): CarrierParam3[] {
  switch (def.kind) {
    case 'on-segment':
      return def.t === undefined ? [{ key: id, lo: 0, hi: 1, spread: true, t0: 'seg', drivable: true }] : [];
    case 'scaled-offset':
      // #985 (ADR-3D-244): any positive ratio is a figure (k > 1 is a trapezoid whose far side is
      // the longer one); only k ≤ 0 — the corner collapsed onto its anchor — is not one.
      return def.k === undefined ? [{ key: id, lo: 1e-3, hi: Infinity, spread: true, t0: 'offset', drivable: true }] : [];
    case 'free3':
      // #1311 (ADR-3D-260): a never-positioned point's three coordinates.
      return (['x', 'y', 'z'] as const).map((ax) => ({
        key: freeCoordKey(id, ax), lo: -Infinity, hi: Infinity, spread: false, t0: `coord-${ax}` as const, drivable: true,
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
          return { key: freeCoordKey(id, ax), lo, hi, spread: false, t0: `coord-${ax}` as const, drivable: true };
        });
    case 'on-plane': {
      // Two in-plane offsets from the sampled seat (u along e1, v along e2 — the seat's own basis),
      // drivable only for a POINT-RUN plane's rider: it rides the gauge with the run, and nothing
      // re-seats it behind the pivot's back. A stated side keeps its height as a third, sampled DOF.
      const drivable = c.pointPlanes.has(def.plane) && !c.planes.get(def.plane)?.free;
      const uv: CarrierParam3[] = ['u', 'v'].map((ax) => ({
        key: `${id}@${ax}`, lo: -Infinity, hi: Infinity, spread: false, t0: 'zero', drivable,
      }));
      return def.side ? [...uv, { key: `${id}@h`, lo: 1e-3, hi: Infinity, spread: false, t0: 'zero', drivable: false }] : uv;
    }
    case 'on-line': {
      // One offset along the line's direction from the sampled seat; a line is infinite both ways,
      // so the parameter is unbounded. A FREE line's rider is re-seated post-pivot (#557) — not drivable.
      const free = c.lines.get(def.line)?.kind === 'free';
      return [{ key: id, lo: -Infinity, hi: Infinity, spread: false, t0: 'zero', drivable: !free }];
    }
    case 'bisector-ray':
      // #343: the DISTANCE along the bisector ray — a half-line, so the parameter is the absolute
      // distance from the apex (positive; a rider at or behind the apex is not on the ray).
      return [{ key: id, lo: 1e-3, hi: Infinity, spread: false, t0: 'bis-dist', drivable: true }];
    default:
      return [];
  }
}

/**
 * #1590 (ADR-3D-291) — CAN THE POINT'S OWN STATED DATA STILL ADMIT THIS COORDINATE GIVEN?
 *
 * A given that fails over a SAMPLED carrier is not proof the student is wrong: the tool chose the number it
 * failed against. But a given can also contradict what the student already stated about the point — an x
 * the definition fixed («B(1,t,2)» then «B(3,n,p)»), a side of an axis they stated («D על החלק החיובי של
 * ציר ה-x» then «D(-3,0,0)»), a spot off the segment the rider was put on. Those are false as stated, and
 * «check the computation» is the honest answer. This reads ONLY the point's definition and the positions of
 * the points that definition names; it never solves, and it answers `true` ("cannot rule it out") for every
 * claim or carrier kind it does not read — so it can only ever keep a refusal, never invent a green row.
 */
export function statedDataAdmits(c: Construction3, claim: Claim3, pos: Positions3): boolean {
  if (claim.type !== 'coords-eq') return true;
  const def = c.points.get(claim.id);
  if (!def) return true;
  const axes = (['x', 'y', 'z'] as const).filter((ax) => claim[ax] !== null);
  const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  /** every stated component reached by ONE value of a single parameter, inside [lo, hi] */
  const oneParam = (at: (ax: 'x' | 'y' | 'z') => { k: number; p: number }, lo: number, hi: number): boolean => {
    let t: number | null = null;
    for (const ax of axes) {
      const { k, p } = at(ax);
      const v = claim[ax]!;
      if (Math.abs(p) < 1e-12) {
        if (!eq(k, v)) return false; // a component the definition FIXES
        continue;
      }
      const tx = (v - k) / p;
      if (t !== null && !eq(t, tx)) return false;
      t = tx;
    }
    return t === null || (t >= lo - 1e-9 && t <= hi + 1e-9);
  };
  switch (def.kind) {
    case 'partial': {
      const params = carrierParams3(c, claim.id, def);
      return axes.every((ax) => {
        if (def[ax] !== null) return eq(def[ax]!, claim[ax]!); // stated by the student already
        const p = params.find((q) => q.t0 === `coord-${ax}`);
        return !p || (claim[ax]! >= p.lo && claim[ax]! <= p.hi); // the side of the axis they stated
      });
    }
    case 'coord-sym':
      return oneParam((ax) => def[ax], -Infinity, Infinity);
    case 'on-segment': {
      if (def.t !== undefined) return true;
      const a = pos.get(def.a), b = pos.get(def.b);
      if (!a || !b) return true;
      // an endpoint that is itself sampled moves the segment — its drawn place is no evidence
      const sampledEnd = [def.a, def.b].some((e) => { const d = c.points.get(e); return !d || carrierParams3(c, e, d).length > 0; });
      if (sampledEnd) return true;
      return oneParam((ax) => ({ k: a[ax], p: b[ax] - a[ax] }), 0, 1); // on the segment the student named
    }
    default:
      return true;
  }
}
