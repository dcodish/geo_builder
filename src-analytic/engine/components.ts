/**
 * THE INDEPENDENT PARTS OF A FIGURE (#2737, [ADR-AG-425](../../docs/06c-decisions-analytic.md#adr-ag-425)).
 *
 * A figure is one system of unknowns — every free vertex and every parameter — and `evaluate` used to solve, retry and
 * judge it as one. When the student draws shapes that share nothing («מרובע» · «טרפז» · … nine of them), that made every
 * cost multiply: the numerical Jacobian evaluates every residual once per unknown, a collapsed pair in ONE shape deflated
 * and re-solved ALL of them four times, and a choice option one shape could not take re-solved every shape under the next
 * combination. Measured on `main` @ 036e907c, the ninth such shape took 73 s to accept (2-D: 0.3 s).
 *
 * Two statements belong to one part when they share an unknown, directly or through a chain. A part is solved, retried
 * and judged on its own, and the figure is the union of the parts' figures; a figure that is ONE part takes exactly the
 * path it always took.
 *
 * **What links.** An object to everything it is defined from (`objectDeps`, `symbolDeps`) and everything its definition
 * names; a constraint, a selector and a parameter declaration to every object id and every parameter symbol anywhere in
 * them (a deep walk, so an option of a `choice`, an expression's symbol or a curve operand cannot be missed), each string
 * resolved the way the engine resolves it: an id, a curve's NAME (`curveByName` — «l1» is `line-l1`), a line named by two
 * points («AB» is A and B, `asPair`). And a constraint to every object its residual actually READS, recorded by the caller
 * (`evaluate.ts` `constraintReads`), so a reference spelled in a way this walk does not know is still a link. A walk that
 * links too much costs speed only; one that missed a link would solve two coupled things apart.
 *
 * Pure over the construction, memoised per construction.
 */
import { objectDeps, paramRegister, symbolDeps } from './carriers';
import { asPair } from './lines';
import type { Constraint } from './solve';
import { curveByName, isFree, type Construction, type Id } from './types';
import { ContentCache, contentOf } from './content';

const partsMemo = new ContentCache<Construction[]>();

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

const objectNode = (id: Id) => `o:${id}`;
const symbolNode = (sym: string) => `s:${sym}`;

/**
 * Every node a value names: each string anywhere inside it that is an object id or a register symbol. Generic on purpose
 * (see the module comment); a string that is both is both.
 */
function namedNodes(raw: Construction, value: unknown, ids: ReadonlySet<string>, syms: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (ids.has(v)) out.push(objectNode(v));
      if (syms.has(v)) out.push(symbolNode(v));
      const named = curveByName(raw, v);
      if (named) out.push(objectNode(named.id));
      const pair = asPair(v);
      if (pair) for (const id of pair) if (ids.has(id)) out.push(objectNode(id));
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
}

/**
 * THE PARTS, in the order their first object was stated. One part — the overwhelmingly common figure — returns
 * `[raw]` itself, so every caller can ask and a connected figure is not touched. Each sub-construction keeps the
 * whole's statements by IDENTITY and in their relative order (line provenance, blame and the choice odometer key on the
 * objects themselves), carries the whole as `whole` (the frame its starts are sampled in), and is stable per `raw`, so
 * per-construction memos see one object per part.
 */
export function partsOf(given: Construction, readsOf?: (raw: Construction) => ReadonlyMap<Constraint, ReadonlySet<Id>>): Construction[] {
  // #2888 (ADR-AG-476): the parts are of the CONTENT, never of one caller's view of it — a part's `whole`, and the
  // one-part answer `[raw]`, are shared by every view, so neither may be a view (it would carry that reader's pool).
  const raw = contentOf(given);
  let out = partsMemo.get(raw);
  if (!out) {
    out = computeParts(raw, readsOf);
    partsMemo.set(raw, out);
  }
  // One part is the construction the caller holds — the very object, as it always was.
  return given !== raw && out.length === 1 && out[0] === raw ? [given] : out;
}

function computeParts(raw: Construction, readsOf?: (raw: Construction) => ReadonlyMap<Constraint, ReadonlySet<Id>>): Construction[] {
  // A figure with fewer than two objects has nothing to split; neither does one nested inside another split.
  if (raw.objects.length < 2 || raw.whole) return [raw];
  const ids = new Set(raw.objects.map((o) => o.id));
  const syms = new Set(paramRegister(raw).map((p) => p.sym));
  const links = new Links();
  for (const o of raw.objects) {
    const self = objectNode(o.id);
    links.find(self);
    for (const d of objectDeps(o)) if (ids.has(d)) links.join(self, objectNode(d));
    for (const s of symbolDeps(o)) links.join(self, symbolNode(s));
    for (const n of namedNodes(raw, o, ids, syms)) links.join(self, n);
  }
  /** The nodes a statement names; a statement naming none rides with the first part (it can move nothing). */
  const anchorOf = (nodes: string[]): string | null => {
    if (nodes.length === 0) return null;
    for (const n of nodes.slice(1)) links.join(nodes[0], n);
    return nodes[0];
  };
  const reads = readsOf?.(raw);
  const constraintAnchor = raw.constraints.map((k) =>
    anchorOf([...namedNodes(raw, k, ids, syms), ...[...(reads?.get(k) ?? [])].filter((id) => ids.has(id)).map(objectNode)]),
  );
  const selectorAnchor = raw.selectors.map((s) => anchorOf(namedNodes(raw, s, ids, syms)));
  const paramAnchor = raw.params.map((p) => anchorOf(namedNodes(raw, p, ids, syms)));

  /*
   * A part with NO UNKNOWN — no free vertex, no parameter — has nothing to solve, retry or walk: split off, it would only be
   * evaluated again beside the rest (measured: the 572 figure's two stated lines doubled #1473's render-path count). It rides
   * with the first part that has an unknown, so a figure fixed by its statements is one part and takes the old path.
   */
  const unknown = new Set<string>([
    ...raw.objects.filter(isFree).map((o) => links.find(objectNode(o.id))),
    ...[...syms].map((sym) => links.find(symbolNode(sym))),
  ]);
  // Number the parts with an unknown by their first object, so part 0 is the part the student started with.
  const index = new Map<string, number>();
  const rootsInOrder = [...raw.objects.map((o) => links.find(objectNode(o.id))), ...[...syms].map((sym) => links.find(symbolNode(sym)))];
  for (const root of rootsInOrder) if (unknown.has(root) && !index.has(root)) index.set(root, index.size);
  const partOfNode = (n: string | null): number => (n === null ? 0 : (index.get(links.find(n)) ?? 0));
  const objectPart = raw.objects.map((o) => partOfNode(objectNode(o.id)));
  // A symbol no object reads (a parameter only a constraint or a declaration names) takes its part from those.
  const constraintPart = constraintAnchor.map(partOfNode);
  const selectorPart = selectorAnchor.map(partOfNode);
  const paramPart = paramAnchor.map(partOfNode);
  const n = index.size;
  if (n <= 1) return [raw];
  return Array.from({ length: n }, (_, p) => ({
    ...raw,
    params: raw.params.filter((_q, i) => paramPart[i] === p),
    objects: raw.objects.filter((_o, i) => objectPart[i] === p),
    constraints: raw.constraints.filter((_k, i) => constraintPart[i] === p),
    selectors: raw.selectors.filter((_s, i) => selectorPart[i] === p),
    whole: raw,
  }));
}

/**
 * Which part a top-level statement of `raw` lands in — the reader {@link splitChoiceSeed} and {@link joinChoiceSeeds} need.
 * Built once per split; a statement found in no part (it cannot happen for one taken from `raw`) reads as part 0.
 */
export function partIndexOf(parts: readonly Construction[]): (owner: unknown) => number {
  const at = new Map<unknown, number>();
  parts.forEach((p, i) => {
    for (const k of p.constraints) at.set(k, i);
    for (const s of p.selectors) at.set(s, i);
  });
  return (owner) => at.get(owner) ?? 0;
}
