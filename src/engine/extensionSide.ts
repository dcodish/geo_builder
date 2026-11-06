/**
 * #2518 ([ADR-791](../../docs/06-decisions.md#adr-791), operator ruling 2026-11-06: *"its not right to refuse. this shape
 * is possible"*) — A SHARED-ENDPOINT EXTENSION'S SIDE IS RE-SEATED ON A FREE QUANTITY.
 *
 * «המשך AO חותך את מעגל P בנקודה R» with A on circle P: R is the line's other crossing, and it lies past the second letter
 * only for some placements. ADR-780 seats a free other end when the extension is typed. A figure can also come off its
 * side later («OP = 10»), or need something other than the other end (the circle's size, the shared end's place, the
 * circle's centre), so after every accepted step each shared-endpoint extension off its side tries closed-form seats.
 *
 * A seat is a better default (M4, ADR-052), never a constraint and never a solve: it is kept only if the whole figure
 * evaluates and the side holds, so a figure no quantity can save stays as it was, and the submit gate refuses it
 * (`impossibleExtensionSide`). Worst case {@link MAX_TRIES} evaluations, once per step, only on a figure already off its
 * side. A figure with every extension on its side pays a scan of its objects.
 */
import { evaluate } from './evaluate';
import { constraintRefs } from './solve';
import { sidesShortfall } from './requirements';
import type { EvalResult } from './evaluate';
import type { Construction, GeoObject, Id, Vec } from './types';

type Circle = Extract<GeoObject, { kind: 'circle' }>;
type Crossing = Extract<GeoObject, { kind: 'line-circle' }>;

/**
 * THE one reading of a shared-endpoint extension's side: is the line's other crossing of the circle through `s` about
 * `center` past the second letter `b`? (`s` reflected across the foot of the centre on line a–b.) `null` when a point is
 * unplaced. The verifier's bar (`t > 1`), read by this seat and by the submit gate.
 */
export function crossingPastSecond(pos: ReadonlyMap<Id, Vec>, a: Id, b: Id, shared: Id, center: Id): boolean | null {
  const pa = pos.get(a), pb = pos.get(b), s = pos.get(shared), o = pos.get(center);
  if (!pa || !pb || !s || !o) return null;
  const ux = pb.x - pa.x, uy = pb.y - pa.y;
  const u2 = ux * ux + uy * uy;
  if (u2 < 1e-18) return false;
  const k = (2 * ((o.x - s.x) * ux + (o.y - s.y) * uy)) / u2;
  return ((s.x + k * ux - pa.x) * ux + (s.y + k * uy - pa.y) * uy) / u2 > 1;
}

/** Inside the circle when the shared end comes first (`INSIDE·d` is the radius to grow to, and the centre's reach). */
const INSIDE = 1.25;
/** Outside when the shared end comes second. */
const OUTSIDE = 0.8;
/** θ alone, radius, radius + θ, centre, centre + θ. */
export const MAX_TRIES = 5;

function withObject(c: Construction, next: GeoObject): Construction {
  return { ...c, objects: c.objects.map((o) => (o.id === next.id ? next : o)) };
}

/** A free point nothing else holds, which a seat may move. */
function movable(c: Construction, id: Id): Extract<GeoObject, { kind: 'free-point' }> | null {
  const o = c.objects.find((q) => q.id === id);
  return o?.kind === 'free-point' && !o.pinned && !o.rigid && !c.constraints.some((k) => constraintRefs(k).includes(id)) ? o : null;
}

/**
 * A size statement that follows the seat: a circle stated larger than this one, or stated to contain it, grows with it
 * when its own radius is free. Otherwise the seat breaks that statement and a figure that could stand is refused.
 */
function withLargerCircles(c: Construction, pos: ReadonlyMap<Id, Vec>, circle: Circle, size: number): Construction {
  const below = circle.orderedBelow;
  const around = (c.requirements ?? []).flatMap((r) => (r.kind === 'circle-position' && r.relation === 'contained' && r.b === circle.id ? [r.a] : []));
  let out = c;
  for (const id of new Set([...(below ? [below] : []), ...around])) {
    const big = c.objects.find((o): o is Circle => o.id === id && o.kind === 'circle');
    const from = big && pos.get(big.center), to = pos.get(circle.center);
    if (big?.radius.via === 'free' && from && to) out = withObject(out, { ...big, radius: { via: 'free', value: Math.hypot(from.x - to.x, from.y - to.y) + INSIDE * size } });
  }
  return out;
}

/**
 * A circle stated tangent to this one from outside keeps touching it: its free centre moves out by what the radius grew.
 * Without this a radius held by the tangency cannot grow, and the sentence is refused though the figure can stand.
 */
function withTouchingCircles(c: Construction, pos: ReadonlyMap<Id, Vec>, circle: Circle, grew: number): Construction {
  const at = pos.get(circle.center);
  let out = c;
  for (const r of c.requirements ?? []) {
    if (r.kind !== 'circle-position' || r.relation !== 'tangent' || !at) continue;
    const id = r.a === circle.id ? r.b : r.b === circle.id ? r.a : null;
    const near = c.objects.find((o): o is Circle => o.id === id && o.kind === 'circle');
    const centre = near && c.objects.find((o) => o.id === near.center);
    const from = near && pos.get(near.center);
    if (centre?.kind !== 'free-point' || centre.pinned || centre.rigid || !from) continue;
    const d = Math.hypot(from.x - at.x, from.y - at.y) || 1;
    out = withObject(out, { ...centre, x: from.x + ((from.x - at.x) * grew) / d, y: from.y + ((from.y - at.y) * grew) / d });
  }
  return out;
}

/**
 * The statements `evaluate` does not hold, because they are requirements, not constraints: a stated side of a point and
 * a stated mutual position of two circles. A seat that breaks one is not a figure of the student's sentences.
 */
function requirementsHold(c: Construction, res: Extract<EvalResult, { ok: true }>): boolean {
  if (sidesShortfall(c, res.positions, res.circles) > 0) return false;
  return (c.requirements ?? []).every((r) => {
    if (r.kind !== 'circle-position' || (r.relation !== 'disjoint' && r.relation !== 'contained')) return true;
    const a = res.circles.get(r.a), b = res.circles.get(r.b);
    if (!a || !b) return true;
    const d = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
    return r.relation === 'disjoint' ? d > a.r + b.r : d + b.r < a.r;
  }) && c.objects.every((o) => {
    if (o.kind !== 'circle' || !o.orderedBelow) return true;
    const small = res.circles.get(o.id), big = res.circles.get(o.orderedBelow);
    return !small || !big || small.r < big.r;
  });
}

/** The seats to try for one extension, cheapest change first. */
function seats(c: Construction, pos: ReadonlyMap<Id, Vec>, x: Crossing & { stated: [Id, Id]; avoid: Id }, circle: Circle): Construction[] {
  const [a, b] = x.stated;
  const shared = x.avoid;
  const other = a === shared ? b : a;
  const firstShared = a === shared;
  const centre = pos.get(circle.center), far = pos.get(other), near = pos.get(shared);
  if (!centre || !far || !near) return [];
  const d = Math.hypot(far.x - centre.x, far.y - centre.y);
  const r = Math.hypot(near.x - centre.x, near.y - centre.y);
  const out: Construction[] = [];
  const rider = c.objects.find((o) => o.id === shared);
  const facing = (k: Construction): Construction | null =>
    !firstShared && rider?.kind === 'on-circle' && rider.circle === circle.id && rider.free
      ? withObject(k, { ...rider, theta: Math.atan2(far.y - centre.y, far.x - centre.x) })
      : null;
  const add = (k: Construction | null) => { if (k) out.push(k); };
  add(facing(c));
  const size = (firstShared ? INSIDE : OUTSIDE) * d;
  const through = circle.radius.via === 'through' ? movable(c, circle.radius.point) : null;
  const sized = !(d > 0)
    ? null
    : circle.radius.via === 'free'
      ? withObject(withTouchingCircles(withLargerCircles(c, pos, circle, size), pos, circle, size - r), { ...circle, radius: { via: 'free', value: size } })
      : through && through.id !== other && through.id !== shared
        ? withObject(c, { ...through, x: centre.x + ((through.x - centre.x) * size) / (Math.hypot(through.x - centre.x, through.y - centre.y) || 1), y: centre.y + ((through.y - centre.y) * size) / (Math.hypot(through.x - centre.x, through.y - centre.y) || 1) })
        : null;
  if (sized) {
    add(sized);
    add(facing(sized));
  }
  const free = movable(c, circle.center);
  if (free) {
    const reach = (firstShared ? 0.45 : 1 / OUTSIDE) * r;
    const ux = d > 0 ? (centre.x - far.x) / d : 1, uy = d > 0 ? (centre.y - far.y) / d : 0;
    const moved = withObject(c, { ...free, x: far.x + ux * reach, y: far.y + uy * reach });
    add(moved);
    add(facing(moved));
  }
  return out;
}

/** The construction with every shared-endpoint extension a free quantity can hold on its side, or null when nothing changed. */
export function reseatExtensions(start: Construction, positions: Map<Id, Vec>): { construction: Construction; positions: Map<Id, Vec> } | null {
  let cur = { construction: start, positions };
  let changed = false;
  for (const o of start.objects) {
    if (o.kind !== 'line-circle' || !o.stated || o.avoid === undefined) continue;
    const x = o as Crossing & { stated: [Id, Id]; avoid: Id };
    const circleOf = (c: Construction) => c.objects.find((q): q is Circle => q.id === x.circle && q.kind === 'circle');
    const circle = circleOf(cur.construction);
    if (!circle || crossingPastSecond(cur.positions, x.stated[0], x.stated[1], x.avoid, circle.center) !== false) continue;
    for (const t of seats(cur.construction, cur.positions, x, circle)) {
      const res = evaluate(t); // the one test: the whole figure builds, and the side holds
      if (!res.ok || crossingPastSecond(res.positions, x.stated[0], x.stated[1], x.avoid, circle.center) !== true || !requirementsHold(t, res)) continue;
      cur = { construction: t, positions: res.positions };
      changed = true;
      break;
    }
  }
  return changed ? cur : null;
}
