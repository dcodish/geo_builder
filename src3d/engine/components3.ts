/**
 * THE INDEPENDENT PARTS OF A 3-D FIGURE (#2764, [ADR-3D-454](../../docs/06b-decisions-3d.md#adr-3d-454)) — analytic's
 * #2737 / ADR-AG-425 mechanism, copied into this tree (product trees never import each other).
 *
 * A figure was one system: the pivot's least squares ran over every solid's dims, its finite-difference Jacobian
 * re-placed every solid once per unknown, and the configuration search needed ONE seed at which every shape was drawn
 * visibly as itself. Nine separate quadrilaterals took 25.9 s on the ninth line, and the walk to a seed that suited all
 * nine redrew every earlier shape.
 *
 * Two statements belong to one part when they share a name, directly or through a chain. A part is solved, sampled and
 * searched on its own, at its own configuration entry ({@link Seed3}); the figure is the union of the parts' figures. A
 * figure that is ONE part takes exactly the path it always took.
 *
 * **What links.** A GENERIC deep walk of every statement of every `Construction3` field: each string anywhere inside it
 * that is a name the figure holds (a point, a plane, a line, a vector, a circle, a letter) — or a run of point names
 * («ABCD», «SBC») — joins the statement to that name. A solid joins its own vertices. A new field cannot slip past: the
 * split is by the field's TYPE (array, map, set), and a field of any other type must be listed in
 * {@link NAMELESS_FIELDS3} (the totality lock in `components3.test.ts`). A walk that links too much costs speed only;
 * one that missed a link would solve two coupled things apart — so when unsure, it links.
 *
 * **What keeps the figure whole.** An object that frames EVERY solid, named or not, joins everything: the coordinate
 * letter (`c.param`), the free-vector system, anything stating which way the figure faces or where it sits
 * (`orientationStated3`, which includes every absolute-frame object), a scale given (one factor for the whole figure),
 * and a solid of revolution (laid out after every solid). Such a figure is one part.
 *
 * **A part with no solid** (a free point, a plane nothing else names) has nothing of its own the configuration sizes:
 * it rides with the first part, so a figure of one shape plus loose objects is one part and takes the old path.
 *
 * Pure over the construction, memoised per construction.
 */
import { figureSymbolsOf, orientationStated3, type Construction3, type Id, type PointDef, type SolidObj } from './types';

/**
 * #2764 — A CONFIGURATION. A plain number is every part at that seed (every figure before this change, and every
 * figure of one part). The structured form records where each part landed: `parts[key]` is the seed of the part whose
 * key is `key` ({@link partKey3}); a part with no entry sits at `seed`. Canonical form ({@link canonicalSeed3}): no
 * entry equal to `seed`, and no entries at all is the plain number.
 */
export type Seed3 = number | { readonly seed: number; readonly parts: Readonly<Record<string, number>> };

/** The configuration's base number — what «הציגו תצורה אחרת» steps from and what the claim samples are drawn around. */
export const seedNumber3 = (s: Seed3): number => (typeof s === 'number' ? s : s.seed);

/** The seed the part keyed `key` is resolved at. */
export const seedOfPart3 = (s: Seed3, key: string): number => (typeof s === 'number' ? s : (s.parts[key] ?? s.seed));

/** The canonical spelling: entries equal to the base dropped, none left ⇒ the plain number. */
export function canonicalSeed3(base: number, parts: Readonly<Record<string, number>>): Seed3 {
  const kept = Object.keys(parts)
    .filter((k) => parts[k] !== base)
    .sort();
  if (kept.length === 0) return base;
  return { seed: base, parts: Object.fromEntries(kept.map((k) => [k, parts[k]])) };
}

/** A stable string for a configuration (memo keys, equality). */
export function seedKey3(s: Seed3): string {
  if (typeof s === 'number') return String(s);
  const c = canonicalSeed3(s.seed, s.parts);
  if (typeof c === 'number') return String(c);
  return `${c.seed}{${Object.keys(c.parts).map((k) => `${k}:${c.parts[k]}`).join(',')}}`;
}

export const sameSeed3 = (a: Seed3, b: Seed3): boolean => a === b || seedKey3(a) === seedKey3(b);

const isSeedNumber = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v);

/**
 * A configuration read from outside (a file, a link, a session): the base must be a finite whole number; a malformed
 * part entry is dropped (that part sits at the base). Null when the base itself is unusable.
 */
export function cleanSeed3(base: unknown, parts?: unknown): Seed3 | null {
  if (typeof base !== 'number' || !Number.isFinite(base)) return null;
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return base;
  const kept: Record<string, number> = {};
  for (const [k, v] of Object.entries(parts as Record<string, unknown>)) if (k.length > 0 && isSeedNumber(v)) kept[k] = v;
  return canonicalSeed3(base, kept);
}

/** The part entries a configuration records, for the file's `seedParts` field (undefined when there are none). */
export const seedPartsOf3 = (s: Seed3): Readonly<Record<string, number>> | undefined => {
  if (typeof s === 'number') return undefined;
  const c = canonicalSeed3(s.seed, s.parts);
  return typeof c === 'number' ? undefined : c.parts;
};

/** One independent part: its key and its sub-construction. */
export interface Part3 {
  /** The key of the part's first solid in construction order — the solid's sampler key, stable as lines are added. */
  readonly key: string;
  readonly construction: Construction3;
}

/** A solid's key: the key its dims are sampled under (`solidDimsAll3`). */
export const solidKey3 = (s: SolidObj): string => `solid-${s.kind}-${s.ids.join('')}`;

/** The key of a figure taken as one part: its first solid's, or '' with no solid. */
export const partKey3 = (c: Construction3): string => (c.solids.length > 0 ? solidKey3(c.solids[0]) : '');

/**
 * The `Construction3` fields that are not an array, a map or a set — each must hold no name a statement could share,
 * or be a figure-global object that keeps the figure whole ({@link wholeFigure3}). The totality lock reads this list.
 */
export const NAMELESS_FIELDS3: readonly string[] = ['param', 'partOf'];

/** Does an object that frames every solid keep this figure whole? (see the module comment) */
export function wholeFigure3(c: Construction3): boolean {
  return (
    c.param !== undefined ||
    c.freeVectors.size > 0 ||
    c.freeVecEqs.length > 0 ||
    c.freeVecMetrics.length > 0 ||
    orientationStated3(c) ||
    c.scaleGivens.length > 0 ||
    c.revolutions.length > 0
  );
}

/** Union–find over string nodes. */
class Links {
  private readonly up = new Map<string, string>();
  find(a: string): string {
    let r = a;
    while (this.up.has(r) && this.up.get(r) !== r) r = this.up.get(r)!;
    let x = a;
    while (x !== r) {
      const next = this.up.get(x)!;
      this.up.set(x, r);
      x = next;
    }
    if (!this.up.has(r)) this.up.set(r, r);
    return r;
  }
  join(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.up.set(rb, ra);
  }
}

const partsMemo3 = new WeakMap<Construction3, readonly Part3[]>();

/**
 * THE PARTS, in the order of their first solid. One part — the overwhelmingly common figure — is `[{ key, c }]` with
 * the construction itself, so every caller can ask and a connected figure is not touched. Stable per construction, so
 * the per-construction memos (`resolve3`, the dims sampler) see one object per part.
 */
export function partsOf3(c: Construction3): readonly Part3[] {
  const hit = partsMemo3.get(c);
  if (hit) return hit;
  const out = computeParts3(c);
  partsMemo3.set(c, out);
  return out;
}

function computeParts3(c: Construction3): readonly Part3[] {
  const whole: readonly Part3[] = [{ key: partKey3(c), construction: c }];
  if (c.solids.length < 2 || c.partOf || wholeFigure3(c)) return whole;

  const pointIds = [...c.points.keys()];
  const names = new Set<string>([
    ...pointIds,
    ...c.planes.keys(),
    ...c.pointPlanes.keys(),
    ...c.relPlanes.keys(),
    ...c.lines.keys(),
    ...c.pointLines.keys(),
    ...c.vectors.keys(),
    ...c.freeVectors.keys(),
    ...c.circles3.map((k) => k.id),
    ...c.symbolGivens.keys(),
    ...c.symbolPins.map((p) => p.sym),
    ...figureSymbolsOf(c),
  ]);
  // A run of point names («ABCD», «SBC», «A'B'C'»): read greedily, longest name first; only a full reading counts.
  const byLength = [...pointIds].sort((a, b) => b.length - a.length);
  const runMemo = new Map<string, readonly string[] | null>();
  const runOf = (s: string): readonly string[] | null => {
    if (runMemo.has(s)) return runMemo.get(s)!;
    const out: string[] = [];
    let at = 0;
    while (at < s.length) {
      const id = byLength.find((p) => p.length > 0 && s.startsWith(p, at));
      if (!id) break;
      out.push(id);
      at += id.length;
    }
    const r = at === s.length && out.length > 0 ? out : null;
    runMemo.set(s, r);
    return r;
  };
  const node = (name: string) => `n:${name}`;
  /** Every name a value holds, anywhere inside it. */
  const namedIn = (value: unknown): string[] => {
    const out: string[] = [];
    const seen = new Set<object>();
    const walk = (v: unknown): void => {
      if (typeof v === 'string') {
        if (names.has(v)) out.push(node(v));
        else if (v.length > 1) for (const id of runOf(v) ?? []) out.push(node(id));
        return;
      }
      if (v === null || typeof v !== 'object' || seen.has(v as object)) return;
      seen.add(v as object);
      if (Array.isArray(v)) v.forEach(walk);
      else if (v instanceof Map) v.forEach((x, k) => (walk(k), walk(x)));
      else if (v instanceof Set) v.forEach(walk);
      else for (const x of Object.values(v as Record<string, unknown>)) walk(x);
    };
    walk(value);
    return out;
  };

  const links = new Links();
  /** Join a statement's names; its anchor (null: it names nothing, and rides with the first part). */
  const anchorOf = (nodes: string[]): string | null => {
    if (nodes.length === 0) return null;
    links.find(nodes[0]);
    for (const n of nodes.slice(1)) links.join(nodes[0], n);
    return nodes[0];
  };
  const solidAnchor = c.solids.map((s) => anchorOf(namedIn(s)));

  type Entry = { field: string; anchor: string | null };
  const entries: Entry[] = [];
  const record = c as unknown as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (field === 'solids') continue;
    const v = record[field];
    if (Array.isArray(v)) v.forEach((x) => entries.push({ field, anchor: anchorOf(namedIn(x)) }));
    else if (v instanceof Map) v.forEach((x, k) => entries.push({ field, anchor: anchorOf(namedIn([k, x])) }));
    else if (v instanceof Set) v.forEach((x) => entries.push({ field, anchor: anchorOf(namedIn(x)) }));
  }

  // Number the parts by their first solid, so part 0 is the part the student started with.
  const index = new Map<string, number>();
  for (const a of solidAnchor) {
    if (a === null) continue;
    const root = links.find(a);
    if (!index.has(root)) index.set(root, index.size);
  }
  if (index.size <= 1) return whole;
  const partOf = (anchor: string | null): number => (anchor === null ? 0 : (index.get(links.find(anchor)) ?? 0));
  const solidPart = solidAnchor.map(partOf);

  // Every map, set and array is split statement by statement, in its own order, by identity.
  let cursor = 0;
  const split: { field: string; part: number[] }[] = [];
  for (const field of Object.keys(record)) {
    if (field === 'solids') continue;
    const v = record[field];
    const n = Array.isArray(v) ? v.length : v instanceof Map || v instanceof Set ? v.size : -1;
    if (n < 0) continue;
    split.push({ field, part: entries.slice(cursor, cursor + n).map((e) => partOf(e.anchor)) });
    cursor += n;
  }

  return Array.from({ length: index.size }, (_, p) => {
    const solidIndex: number[] = [];
    c.solids.forEach((_s, i) => {
      if (solidPart[i] === p) solidIndex.push(i);
    });
    const local = new Map(solidIndex.map((wi, li) => [wi, li]));
    const sub: Record<string, unknown> = { ...record };
    sub.solids = solidIndex.map((i) => c.solids[i]);
    for (const { field, part } of split) {
      const v = record[field];
      if (Array.isArray(v)) sub[field] = v.filter((_x, i) => part[i] === p);
      else if (v instanceof Map) {
        const m = new Map();
        let i = 0;
        v.forEach((x, k) => {
          if (part[i++] !== p) return;
          // a solid's vertex names its solid by the whole's index; within the part it is the part's index
          if (field === 'points' && (x as PointDef).kind === 'solid-vertex') {
            const def = x as Extract<PointDef, { kind: 'solid-vertex' }>;
            m.set(k as Id, { ...def, solid: local.get(def.solid) ?? def.solid });
          } else m.set(k, x);
        });
        sub[field] = m;
      } else if (v instanceof Set) {
        const s = new Set();
        let i = 0;
        v.forEach((x) => {
          if (part[i++] === p) s.add(x);
        });
        sub[field] = s;
      }
    }
    sub.partOf = { solidIndex };
    const construction = sub as unknown as Construction3;
    return { key: partKey3(construction), construction };
  });
}

