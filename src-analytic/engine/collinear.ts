/**
 * THREE POINTS A STATEMENT PUTS ON ONE LINE (#1963, ADR-AG-296; operator ruling 2026-10-14, card `d14b-1963-proved` A:
 * *"Refuse only when it is certain the circle can never exist (here: D was stated on AB), naming that statement. No
 * refusal on search evidence alone."*).
 *
 * A PROOF, read off the construction alone — never a coordinate, never a sample — so it cannot change with the seed and
 * cannot refuse a collinearity that only one drawing shows. Each point is given the CARRIER LINES it lies on by
 * statement or by definition, and three distinct points are proved collinear when one carrier holds all three:
 *
 * - `on-line-2pt {id, a, b}` («D על AB / הישר AB / המשך AB / הצלע AB»): `id` on line(a, b) — and `a`, `b` on it by
 *   definition (no statement needed for those two);
 * - `midpoint {id, a, b}` (the constraint form of «M אמצע AB» about an existing point): `id` on line(a, b);
 * - `on-line {id, a, b, c}` (a point stated on an axis or on a numeric line): `id` on that line;
 * - `on-curve {id, curve}` where the curve is a LINE (`curveKindOf`): `id` on that line object; a line CONSTRUCTED
 *   through a point (`line-at`) carries its own through-point by definition;
 * - a DERIVED point whose rule puts it on a line of its inputs: `midpoint {a, b}` and `side-touch {a, b}` (the foot of
 *   a centre on the side `ab`) on line(a, b); `foot` on the line it is dropped onto (two points, an axis, a line
 *   object); `diagonals` on both diagonals. Every other rule in `derived.ts` (centroid, incentre, orthocentre,
 *   circumcentre, incircle-centre, circle-centre, parabola-focus, touch-point, regular-vertex) places its point on no
 *   line of its inputs, and proves nothing. The same rules stated about an existing point (`derived-at`) prove the same.
 *
 * Conservative by construction: two carriers that are the same line by accident are never merged, and a `choice`
 * proves nothing (only one option holds). A collinearity the proof misses keeps today's verdict — never a false refusal.
 */
import { curveKindOf } from './apply';
import type { DerivedRule } from './derived';
import type { Constraint } from './solve';
import type { Construction, Id } from './types';

/** Why a point is on a carrier: a constraint of the construction (by index), an object's own definition, or nothing (an end of a two-point line). */
export type CollinearWitness = { k: 'constraint'; at: number } | { k: 'object'; id: Id };

export interface ForcedCollinear {
  /** The carrier that holds all three — `pts:A,B`, `curve:<id>` or `eq:<a>,<b>,<c>`. */
  carrier: string;
  /** The statements the proof used, one per point that needed one (an end of a two-point carrier needs none). */
  by: CollinearWitness[];
}

const ptsKey = (a: Id, b: Id): string | null => (a === b ? null : a < b ? `pts:${a},${b}` : `pts:${b},${a}`);

/** A numeric line `a·x + b·y + c = 0`, scaled so its first non-zero normal component is 1 — one key per line. */
function eqKey(a: number, b: number, c: number): string | null {
  const s = Math.abs(a) > 1e-12 ? a : Math.abs(b) > 1e-12 ? b : 0;
  if (s === 0) return null;
  const r = (v: number) => (Math.abs(v / s) < 1e-12 ? 0 : Number((v / s).toPrecision(12)));
  return `eq:${r(a)},${r(b)},${r(c)}`;
}

/** The carriers a derived rule places its point on. */
function ruleCarriers(c: Construction, rule: DerivedRule): string[] {
  switch (rule.t) {
    case 'midpoint':
    case 'side-touch':
      return [ptsKey(rule.a, rule.b)].filter((k): k is string => k !== null);
    case 'foot': {
      const onto = rule.onto;
      if (onto.k === 'points') return [ptsKey(onto.a, onto.b)].filter((k): k is string => k !== null);
      if (onto.k === 'axis') return [onto.axis === 'x' ? eqKey(0, 1, 0)! : eqKey(1, 0, 0)!];
      const L = c.objects.find((o) => o.id === onto.id);
      return L && curveKindOf(L) === 'line' ? [`curve:${onto.id}`] : [];
    }
    case 'diagonals': {
      const [p, q, r, s] = rule.v;
      return [ptsKey(p, r), ptsKey(q, s)].filter((k): k is string => k !== null);
    }
    case 'centroid':
    case 'incentre':
    case 'orthocentre':
    case 'circumcentre':
    case 'incircle-centre':
    case 'circle-centre':
    case 'parabola-focus':
    case 'touch-point':
    case 'regular-vertex':
      return [];
    default: {
      const unwalked: never = rule;
      throw new Error(`derived rule declares no carrier: ${JSON.stringify(unwalked)}`);
    }
  }
}

/** Every (point, carrier, witness) membership the construction states or defines. */
function memberships(c: Construction): Array<{ id: Id; carrier: string; by: CollinearWitness | null }> {
  const out: Array<{ id: Id; carrier: string; by: CollinearWitness | null }> = [];
  const onTwo = (id: Id, a: Id, b: Id, by: CollinearWitness) => {
    const key = ptsKey(a, b);
    if (key === null) return;
    out.push({ id, carrier: key, by }, { id: a, carrier: key, by: null }, { id: b, carrier: key, by: null });
  };
  const fromConstraint = (k: Constraint, at: number) => {
    switch (k.t) {
      case 'on-line-2pt':
      case 'midpoint':
        onTwo(k.id, k.a, k.b, { k: 'constraint', at });
        return;
      case 'on-line': {
        const key = eqKey(k.a, k.b, k.c);
        if (key) out.push({ id: k.id, carrier: key, by: { k: 'constraint', at } });
        return;
      }
      case 'on-curve': {
        const L = c.objects.find((o) => o.id === k.curve);
        if (L && curveKindOf(L) === 'line') out.push({ id: k.id, carrier: `curve:${k.curve}`, by: { k: 'constraint', at } });
        return;
      }
      case 'derived-at':
        for (const key of ruleCarriers(c, k.rule)) {
          out.push({ id: k.id, carrier: key, by: { k: 'constraint', at } });
          for (const end of key.startsWith('pts:') ? key.slice(4).split(',') : []) out.push({ id: end, carrier: key, by: null });
        }
        return;
      // Every member holds, so every member proves; a choice holds only one option, so it proves nothing.
      case 'all':
        for (const m of k.of) fromConstraint(m, at);
        return;
      default:
        return;
    }
  };
  c.constraints.forEach((k, at) => fromConstraint(k, at));
  for (const o of c.objects) {
    if (o.kind === 'derived') {
      for (const key of ruleCarriers(c, o.rule)) {
        out.push({ id: o.id, carrier: key, by: { k: 'object', id: o.id } });
        for (const end of key.startsWith('pts:') ? key.slice(4).split(',') : []) out.push({ id: end, carrier: key, by: null });
      }
    } else if (o.kind === 'line-at') {
      out.push({ id: o.through, carrier: `curve:${o.id}`, by: null });
    } else if (o.kind === 'segment') {
      const key = ptsKey(o.a, o.b);
      if (key) out.push({ id: o.a, carrier: key, by: null }, { id: o.b, carrier: key, by: null });
    }
  }
  return out;
}

/**
 * Are the three DISTINCT ids on one line in every configuration, by a statement or a definition? The carrier and the
 * statements that prove it, or `null` when nothing written proves it (which is never "they are not collinear").
 */
export function forcedCollinear(c: Construction, ids: readonly Id[]): ForcedCollinear | null {
  if (ids.length !== 3 || new Set(ids).size !== 3) return null;
  const all = memberships(c);
  const byCarrier = new Map<string, Map<Id, CollinearWitness | null>>();
  for (const m of all) {
    if (!ids.includes(m.id)) continue;
    let on = byCarrier.get(m.carrier);
    if (!on) byCarrier.set(m.carrier, (on = new Map()));
    // A definition (no witness) beats a statement: the end of a two-point line needs nothing said about it.
    if (!on.has(m.id) || (on.get(m.id) !== null && m.by === null)) on.set(m.id, m.by);
  }
  for (const [carrier, on] of byCarrier) {
    if (!ids.every((id) => on.has(id))) continue;
    return { carrier, by: ids.map((id) => on.get(id)).filter((w): w is CollinearWitness => w !== null && w !== undefined) };
  }
  return null;
}
