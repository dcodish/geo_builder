import type { Claim3, Construction3, Id, PointDef, Positions3 } from './types';
import type { Vec3 } from './vec3';
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
 * #1561 (ADR-3D-292) — WHAT A COORDINATE GIVEN SAYS ABOUT A POINT'S FREE PARAMETER, read in closed form.
 *
 * Three point kinds carry a free parameter a coordinate given can pin by itself, with no solver:
 *  - a rider on a segment whose endpoints are fixed («K על AB» over typed A, B): one `t`, solved per stated
 *    component as (v − Aₓ)/(Bₓ − Aₓ);
 *  - a partial point («D על החלק החיובי של ציר ה-x»): the stated components fill the unstated ones;
 *  - a coord-sym point («B(1, t, 2)»): the letter's value, solved per stated component of its affine form.
 *
 * The answer is one of three:
 *  - `determines` — the given fixes the parameter, consistently and inside its range: `t` strictly inside
 *    (0, 1), the stated side of an axis, one letter value across components. `apply` lowers it through the
 *    determination path the tool already honours (#748's rider `t`, the `symbol-value` of «t = 4», the
 *    partial record's own components), then records the given exactly as before — so its arbiter holds;
 *  - `contradicts` — the given breaks what the student already stated: a component the definition fixes, the
 *    other side of the axis, a spot off the segment or past its ends, two letter values. False as stated —
 *    «check the computation» is the honest answer (ADR-3D-291's `statedDataAdmits`);
 *  - `open` — nothing to read in closed form (another carrier kind, a sampled endpoint, a letter that already
 *    has a value, a parameter already stated, nothing numeric stated). The caller keeps its existing route.
 *
 * `posOf` is the position of an already-placed point, or undefined: the store passes the resolved figure,
 * `apply` only typed coordinates. It never decides on a point whose own place was sampled.
 */
export type CoordReading =
  | { kind: 'determines'; how: { t: number } | { fill: { x: number | null; y: number | null; z: number | null } } | { symbol: string; value: number } }
  | { kind: 'contradicts' }
  | { kind: 'open' };

export function readCoordGiven(
  c: Construction3,
  id: Id,
  stated: { x: number | null; y: number | null; z: number | null },
  posOf: (id: Id) => Vec3 | undefined,
): CoordReading {
  const def = c.points.get(id);
  if (!def) return { kind: 'open' };
  const axes = (['x', 'y', 'z'] as const).filter((ax) => stated[ax] !== null);
  if (axes.length === 0) return { kind: 'open' };
  const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  /** one value of a single parameter that reaches every stated component, or 'contradicts', or null (none read) */
  const oneParam = (at: (ax: 'x' | 'y' | 'z') => { k: number; p: number }): number | null | 'contradicts' => {
    let t: number | null = null;
    for (const ax of axes) {
      const { k, p } = at(ax);
      const v = stated[ax]!;
      if (Math.abs(p) < 1e-12) {
        if (!eq(k, v)) return 'contradicts'; // a component the definition FIXES
        continue;
      }
      const tx = (v - k) / p;
      if (t !== null && !eq(t, tx)) return 'contradicts';
      t = tx;
    }
    return t;
  };
  switch (def.kind) {
    case 'partial': {
      const params = carrierParams3(c, id, def);
      const fill = { x: def.x, y: def.y, z: def.z };
      let fills = false;
      for (const ax of axes) {
        const v = stated[ax]!;
        if (def[ax] !== null) {
          if (!eq(def[ax]!, v)) return { kind: 'contradicts' }; // stated by the student already
          continue;
        }
        const p = params.find((q) => q.t0 === `coord-${ax}`);
        if (p && !(v >= p.lo && v <= p.hi)) return { kind: 'contradicts' }; // the side of the axis they stated
        fill[ax] = v;
        fills = true;
      }
      return fills ? { kind: 'determines', how: { fill } } : { kind: 'open' };
    }
    case 'coord-sym': {
      const t = oneParam((ax) => def[ax]);
      if (t === 'contradicts') return { kind: 'contradicts' };
      // a letter that already has a value is a CLAIM about it, checked as one — never silently re-valued
      const valued = !c.param || c.symbolPins.some((sp) => sp.sym === c.param) || c.paramGivens.length > 0;
      return t === null || valued ? { kind: 'open' } : { kind: 'determines', how: { symbol: c.param!, value: t } };
    }
    case 'on-segment': {
      if (def.t !== undefined) return { kind: 'open' }; // a stated ratio — the given is a claim about it
      // an endpoint that is itself sampled moves the segment — its drawn place is no evidence
      const fixedEnd = (e: Id) => { const d = c.points.get(e); return !!d && carrierParams3(c, e, d).length === 0; };
      const a = posOf(def.a), b = posOf(def.b);
      if (!a || !b || !fixedEnd(def.a) || !fixedEnd(def.b)) return { kind: 'open' };
      const t = oneParam((ax) => ({ k: a[ax], p: b[ax] - a[ax] }));
      if (t === 'contradicts') return { kind: 'contradicts' };
      if (t === null) return { kind: 'open' };
      if (t < -1e-9 || t > 1 + 1e-9) return { kind: 'contradicts' }; // off the segment the student named
      // at an endpoint the rider would coincide with A or B — not a placement; the claim judges it
      return t > 1e-9 && t < 1 - 1e-9 ? { kind: 'determines', how: { t } } : { kind: 'open' };
    }
    default:
      return { kind: 'open' };
  }
}

/**
 * #1590 (ADR-3D-291) — CAN THE POINT'S OWN STATED DATA STILL ADMIT THIS COORDINATE GIVEN?
 *
 * A given that fails over a SAMPLED carrier is not proof the student is wrong: the tool chose the number it
 * failed against. But a given can also contradict what the student already stated about the point. Those are
 * false as stated, and «check the computation» is the honest answer. Since #1561 (ADR-3D-292) this is the
 * `contradicts` answer of {@link readCoordGiven} — one closed-form reader for the refusal and the placement.
 * It answers `true` ("cannot rule it out") for every claim or carrier kind it does not read, so it can only
 * ever keep a refusal, never invent a green row.
 */
export function statedDataAdmits(c: Construction3, claim: Claim3, pos: Positions3): boolean {
  if (claim.type !== 'coords-eq') return true;
  return readCoordGiven(c, claim.id, claim, (id) => pos.get(id)).kind !== 'contradicts';
}
