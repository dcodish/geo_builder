/**
 * #1973 ([ADR-797](../docs/06-decisions.md#adr-797), [ADR-AG-430](../docs/06c-decisions-analytic.md#adr-ag-430)) —
 * THE SHAPE A CEVIAN WAS DRAWN IN, as the row beside the student's sentence says it.
 *
 * «AE גובה» names no shape. When it was accepted the figure had one shape it could belong to, and the tool drew the
 * height in it. The operator's ruling of 2026-10-10 (option C): *"persist the host, and show it beside the student's
 * words rather than inside them"* — the row keeps «AE גובה», and a quiet tag beside it says «במשולש ABC».
 *
 * Both builders word the tag here, from ONE table of shape nouns (`suite.host.*` in `shell/locales`), so the same
 * sentence carries the same tag in 2-D and analytic by construction (ADR-W-118 B1: 2-D's wording). Each builder
 * decides WHICH ring its cevian resolved in (2-D at parse time, analytic at M1) and hands this module the ring's
 * size and the noun it was declared with. Plane-geometry vocabulary only — no product knowledge.
 */

/** The shape nouns a tag can say: the base noun of every declared ring (an isosceles trapezoid is «טרפז» here). */
export type HostNoun =
  | 'triangle'
  | 'quadrilateral'
  | 'parallelogram'
  | 'rectangle'
  | 'square'
  | 'rhombus'
  | 'trapezoid'
  | 'kite'
  | 'n5'
  | 'n6'
  | 'n7'
  | 'n8'
  | 'n9'
  | 'n10'
  | 'polygon';

/** The host a cevian was resolved in: the ring's letters in their declared order, and its noun. */
export interface CevianHost {
  ring: string[];
  kind: HostNoun;
}

/** The quadrilateral nouns that keep their own word on the tag; every adjective variant reads as its base noun. */
const QUAD_NOUN: Readonly<Record<string, HostNoun>> = {
  parallelogram: 'parallelogram',
  rectangle: 'rectangle',
  square: 'square',
  rhombus: 'rhombus',
  kite: 'kite',
  'right-kite': 'kite',
  trapezoid: 'trapezoid',
  'isosceles-trapezoid': 'trapezoid',
  'right-trapezoid': 'trapezoid',
};

/**
 * The tag's noun for a ring of `arity` vertices DECLARED as `kind` (the shared lattice's kind — `shell/narrowing`'s
 * `NarrowKind` — or a builder's own spelling of it). Every triangle is «משולש»; a quadrilateral keeps its specific
 * noun when it has one, else «מרובע»; a larger ring is named by its size.
 */
export function hostNounOf(arity: number, kind: string | undefined): HostNoun {
  if (arity === 3) return 'triangle';
  if (arity === 4) return (kind && QUAD_NOUN[kind]) || 'quadrilateral';
  if (arity >= 5 && arity <= 10) return `n${arity}` as HostNoun;
  return 'polygon';
}

const HOST_NOUNS: ReadonlySet<string> = new Set<HostNoun>(['triangle', 'quadrilateral', 'parallelogram', 'rectangle', 'square', 'rhombus', 'trapezoid', 'kite', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'polygon']);
const isLetter = (x: unknown): x is string => typeof x === 'string' && /^[A-Z]\d*$/.test(x);

/**
 * A host read back from a saved file or a link — kept only when it can be one: three or more distinct point letters
 * and a noun from the table. Anything else is dropped (the row then shows no tag), never trusted (the lenient-load
 * posture of every saved field).
 */
export function cleanHost(raw: unknown): CevianHost | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { ring, kind } = raw as Record<string, unknown>;
  if (!Array.isArray(ring) || ring.length < 3 || !ring.every(isLetter) || new Set(ring).size !== ring.length) return null;
  if (typeof kind !== 'string' || !HOST_NOUNS.has(kind)) return null;
  return { ring: [...ring], kind: kind as HostNoun };
}

/** The translate function the tag is worded with — each builder's `t`, narrowed to what is used here. */
export type HostT = (key: string, opts?: Record<string, unknown>) => string;

/** The tag beside the row: «במשולש ABC» / "in triangle ABC" — one wording for every builder. */
export const hostTagText = (host: CevianHost, t: HostT): string => t(`suite.host.${host.kind}`, { ring: host.ring.join('') });

/** The tag's tooltip: what the tag is, in the student's words. */
export const hostTagTitle = (t: HostT): string => t('suite.host.title');

/**
 * The host, while the figure still HOLDS its ring (`rings`: the vertex lists of the figure's polygons, any order or
 * starting vertex), else none. A tag names a shape the student can see: with the ring muted, deleted or edited away the
 * row is about a shape that is not there, and analytic's derivation reports no host for it either.
 */
export function heldHost(host: CevianHost | null | undefined, rings: readonly (readonly string[])[]): CevianHost | undefined {
  if (!host) return undefined;
  const key = [...host.ring].sort().join(',');
  return rings.some((r) => [...r].sort().join(',') === key) ? host : undefined;
}

/** The fact list's `tag` for a row whose cevian has a host (`FactRow.tag`), or none — what both builders' rows call. */
export const hostTag = (host: CevianHost | null | undefined, t: HostT): { text: string; title: string } | undefined =>
  host ? { text: hostTagText(host, t), title: hostTagTitle(t) } : undefined;
