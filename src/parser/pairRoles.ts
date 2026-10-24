/**
 * #2464 + #2470 + #2305 ([ADR-760](../../docs/06-decisions.md#adr-760)) — A CONCENTRIC PAIR'S CIRCLE, READ WHERE ITS
 * ROLE WORD STANDS.
 *
 * The two circles of a concentric pair share a centre letter, so the grammar has no letter for either of them: the
 * student names them by ROLE («המעגל החיצוני/הפנימי», «מעגל חיצוני», «המעגל הגדול/הקטן», "the outer/inner circle").
 * ADR-244 used to read that role ONCE PER SENTENCE, after the rules ran (a post-pass that took the first role word in
 * the line), so «A על המעגל החיצוני ו-B על המעגל הפנימי» put both points on the outer circle; and the role adjective
 * stayed in the text, where `commonTangent` read «חיצוני» as its own "external" and invented a common tangency
 * («משיק למעגל החיצוני בנקודה A» beside a circle P drew O and P tangent).
 *
 * Now each role span is resolved where it stands, at the parse boundary — the rewrite chokepoint of #102's size
 * qualifier and #192's ordinal. The pair is given two parse-local reference TOKENS (ADR-342's manner: a circle
 * letter whose centre POINT is the real centre), every role span becomes the letter form «מעגל <token>» that every
 * rule already reads correctly, the parse runs over a context where each circle of the pair answers to its own
 * token, and every token is mapped back to the real circle id (or to the centre letter, inside centre geometry).
 * No role word is left in the text for another rule to misread, and no rule reads a role word itself.
 */
import { CIRCLE_ROLE_REF_EN, CIRCLE_ROLE_REF_HE, circleRole } from './lexicon';
import type { AnyCommand, Id } from '@/engine';
import type { ParseContext, ParseResult } from './parse';

type Pair = NonNullable<ParseContext['concentric']>[number];

/** The parse-local alias of ONE pair: its two fresh tokens and how the pair is named outside the aliased parse. */
export interface PairAlias {
  /** The pair's shared centre TOKEN (its letter; an anonymous centre's `@ctr-O` → `O`). */
  tok: string;
  /** The pair's real centre POINT id. */
  center: string;
  outer: Id;
  inner: Id;
  /** The two fresh tokens: the outer circle's and the inner circle's. */
  tO: string;
  tI: string;
}

const ctrToken = (c: string): string => (c.startsWith('@ctr-') ? c.slice(5) : c);
const tokId = (t: string): Id => `circle-${t}`;

/** The token-world id of a pair circle id (any other id unchanged). */
const aliasId = (a: PairAlias, id: string): string => (id === a.outer ? tokId(a.tO) : id === a.inner ? tokId(a.tI) : id);
/** A sorted circle-pair key (`circle-O|circle-P`), re-keyed into the token world. */
const aliasKey = (a: PairAlias, k: string): string => k.split('|').map((x) => aliasId(a, x)).sort().join('|');
const aliasKeys = <V>(a: PairAlias, o: Record<string, V>): Record<string, V> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [aliasKey(a, k), v]));
/** A centre token that names the pair → both tokens; any other token unchanged. */
const splitToken = (a: PairAlias, c: string): string[] => (c === a.tok || c === a.center ? [a.tO, a.tI] : [c]);

type Remap<K extends keyof ParseContext> = (v: NonNullable<ParseContext[K]>, a: PairAlias) => ParseContext[K];

/**
 * EVERY `ParseContext` field, classified: re-keyed into the token world, or untouched because it names no circle.
 * The mapped type makes the table total — a new `ParseContext` field fails `tsc` until it is classified here — and
 * `pair-roles-alias.test.ts` asserts the same at run time. A circle-bearing field left un-remapped would let a rule
 * see the pair as ONE circle again (the distributor read «AB מיתר במעגל W ו-CD מיתר במעגל V» with one circle).
 */
export const PAIR_ALIAS_FIELDS: { [K in keyof Required<ParseContext>]: 'untouched' | Remap<K> } = {
  circles: (v, a) => v.flatMap((c) => splitToken(a, c)),
  centrePoint: (v, a) => ({ ...v, [a.tO]: a.center, [a.tI]: a.center }),
  // trap (i) of the plan: the tokens are POINT-shaped labels, so the clause distributor must know them as names
  points: (v, a) => [...v, a.tO, a.tI],
  circleMembers: (v, a) =>
    v.map((e) => (e.id === a.outer ? { ...e, id: tokId(a.tO), center: a.tO } : e.id === a.inner ? { ...e, id: tokId(a.tI), center: a.tI } : e)),
  // trap (ii): the pair stays KNOWN (ADR-713's equal-pair refusal reads it), marked resolved for the ADR-244 post-pass
  concentric: (v, a) =>
    v.map((p) => (p.outer === a.outer && p.inner === a.inner ? { center: p.center, outer: tokId(a.tO), inner: tokId(a.tI), resolved: true as const } : p)),
  hiddenCircles: (v, a) => v.map((id) => aliasId(a, id)),
  autoCenters: (v, a) => v.flatMap((c) => splitToken(a, c)),
  // the Thales scaffold on centre·apex is CENTRE geometry — the same circle for a tangent to either circle of the pair
  tangentAuxes: (v, a) => v.flatMap((id) => (id.startsWith(`tanaux-${a.tok}`) ? [a.tO, a.tI].map((t) => `tanaux-${t}${id.slice(7 + a.tok.length)}`) : [id])),
  tangentLines: (v, a) => v.map((e) => ({ ...e, circle: aliasId(a, e.circle) })),
  radiusSymbols: (v, a) =>
    v.map((e) => (e.circle === a.outer ? { ...e, circle: tokId(a.tO), center: a.tO } : e.circle === a.inner ? { ...e, circle: tokId(a.tI), center: a.tI } : e)),
  commonTangents: (v, a) => aliasKeys(a, v),
  circlePairPositions: (v, a) => aliasKeys(a, v),
  circlePairTouches: (v, a) => aliasKeys(a, v),
  statedTangencies: (v, a) => Object.fromEntries(Object.entries(v).map(([k, e]) => [aliasKey(a, k), { ...e, a: aliasId(a, e.a), b: aliasId(a, e.b) }])),
  statedPairPositions: (v, a) => aliasKeys(a, v),
  radiusOrder: (v, a) => v.map((o) => ({ outer: aliasId(a, o.outer), inner: aliasId(a, o.inner) })),
  circleSizes: (v, a) =>
    v.map((e) => (e.id === a.outer ? { ...e, id: tokId(a.tO), center: a.tO } : e.id === a.inner ? { ...e, id: tokId(a.tI), center: a.tI } : e)),
  circleXs: (v, a) => v.flatMap((e) => splitToken(a, e.center).map((center) => ({ ...e, center }))),
  // an arc is found by its centre POINT, which both tokens translate to (`centrePoint`) — as for the deduped centre today
  arcs: 'untouched',
  neighbors: 'untouched',
  onSegment: 'untouched',
  midpointOf: 'untouched',
  parallels: 'untouched',
  lines: 'untouched',
  polygons: 'untouched',
  declaredPolygons: 'untouched',
  freePoints: 'untouched',
  structuralBetween: 'untouched',
  autosInterchangeable: 'untouched',
  angleAliases: 'untouched',
  collinearWith: 'untouched',
  roleSides: 'untouched',
  openRightTriangles: 'untouched',
  feet: 'untouched',
};

/** The aliased context: every circle-bearing field re-keyed so each circle of the pair answers to its own token. */
export function withPairTokens(ctx: ParseContext, a: PairAlias): ParseContext {
  const out: Record<string, unknown> = { ...ctx };
  for (const [k, f] of Object.entries(PAIR_ALIAS_FIELDS) as [keyof ParseContext, 'untouched' | Remap<keyof ParseContext>][]) {
    if (f === 'untouched') continue;
    const v = ctx[k] ?? (k === 'points' ? [] : k === 'centrePoint' ? {} : undefined);
    if (v !== undefined) out[k] = (f as (v: unknown, a: PairAlias) => unknown)(v, a);
  }
  return out as ParseContext;
}

/** Two fresh one-letter tokens: no point, circle, bound symbol, alias or letter of the sentence already uses them. */
export function freshTokens(ctx: ParseContext, s: string): [string, string] | null {
  const used = new Set<string>();
  const add = (x: string) => used.add(x.toUpperCase());
  for (const p of ctx.points ?? []) add(p);
  for (const c of ctx.circles ?? []) add(c);
  for (const c of ctx.autoCenters ?? []) add(c);
  for (const r of ctx.radiusSymbols ?? []) add(r.name);
  for (const al of ctx.angleAliases ?? []) add(al.name);
  for (const m of s.matchAll(/[A-Za-z]/g)) add(m[0]);
  const free = [...'ZYXWVUTSQKJHGFN'].filter((x) => !used.has(x));
  return free.length >= 2 ? [free[0], free[1]] : null;
}

/** Map every token back out of a value: `circle-<tO|tI>` → the real circle id, a token inside centre geometry → the centre letter. */
function mapBack(a: PairAlias): <T>(v: T) => T {
  const idRe = new RegExp(String.raw`circle-(${a.tO}|${a.tI})(?![A-Za-z\d'′-])`, 'g');
  const tokRe = new RegExp(String.raw`(?<![a-z])(?:${a.tO}|${a.tI})(?![a-z])`, 'g');
  const str = (v: string): string => v.replace(idRe, (_m, t: string) => (t === a.tO ? a.outer : a.inner)).replace(tokRe, a.tok);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return str(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return <T>(v: T) => walk(v) as T;
}

/** Does any value in `v` still carry a token (outside a lowercase word)? */
const carriesToken = (a: PairAlias, v: unknown): boolean => new RegExp(String.raw`(?<![a-z])(?:${a.tO}|${a.tI})(?![a-z])`).test(JSON.stringify(v));

/** The existing readers of a relation between the pair's OWN two circles — any other is declined (left unread, as before). */
const PAIR_RELATION_READERS: ReadonlySet<string> = new Set(['set-radius-ratio', 'set-radius-order']);
/** …and the refusal those readers give about the pair (ADR-713: equal circles on one centre cannot both be drawn). */
const PAIR_RELATION_REFUSALS: ReadonlySet<string> = new Set(['equal-circles-nested']);
const relatesPair = (cmd: AnyCommand, a: PairAlias): boolean => {
  if (PAIR_RELATION_READERS.has(cmd.type)) return false;
  const vals = Object.entries(cmd).flatMap(([k, v]) => (k === 'type' ? [] : Array.isArray(v) ? v : [v]));
  return vals.includes(a.outer) && vals.includes(a.inner);
};

/** A role span («[ל/ב/מ/ש/ו]ה?מעגל ה?חיצוני», "the inner circle") rewritten to the letter form of its circle's token. */
export function rewriteRoles(s: string, a: PairAlias): string {
  return s
    .replace(new RegExp(CIRCLE_ROLE_REF_HE, 'g'), (_m, pre: string, adj: string) => `${pre}מעגל ${circleRole(adj) === 'outer' ? a.tO : a.tI}`)
    .replace(new RegExp(CIRCLE_ROLE_REF_EN, 'gi'), (_m, adj: string) => `circle ${circleRole(adj) === 'outer' ? a.tO : a.tI}`);
}

/** Does the sentence name a circle by its role? */
export const hasRoleSpan = (s: string): boolean => new RegExp(CIRCLE_ROLE_REF_HE).test(s) || new RegExp(CIRCLE_ROLE_REF_EN, 'i').test(s);

/**
 * The per-span resolution of a sentence that names a concentric pair's circle by its role, or null when it names none
 * (or the figure has no pair — a role word beside two independent circles is #102's size qualifier).
 *
 *  - two or more pairs: a role names no single circle → `not-handled` (never a pick);
 *  - a role AND the pair's shared centre letter as a circle («A על מעגל O ו-B על המעגל הפנימי») → ADR-244's question
 *    about that centre (the letter is ambiguous; the role spelling the question teaches now builds);
 *  - otherwise the aliased parse, mapped back (every token: `circle-<token>` → the real circle id, a token inside centre
 *    geometry → the centre letter). A refusal that would name a token is `not-handled`; a line relating the pair's two
 *    circles to each other other than by their radii stays unread, as before.
 */
export function resolvePairRoles(s: string, ctx: ParseContext, parseResolved: (s: string, ctx: ParseContext) => ParseResult): ParseResult | null {
  const pairs = (ctx.concentric ?? []).filter((p) => !p.resolved);
  if (!pairs.length || !hasRoleSpan(s)) return null;
  if (pairs.length > 1) return { ok: false, reason: 'not-handled' };
  const pair: Pair = pairs[0];
  const tok = ctrToken(pair.center);
  const letterRef = new RegExp(String.raw`(?:מעגל|\bcircle)\s+${tok}(?![A-Za-z\d'′])`, 'i');
  if (letterRef.test(s)) return { ok: false, reason: 'ambiguous-circle', center: pair.center };
  const fresh = freshTokens(ctx, s);
  if (!fresh) return { ok: false, reason: 'not-handled' };
  const a: PairAlias = { tok, center: ctx.centrePoint?.[tok] ?? pair.center, outer: pair.outer, inner: pair.inner, tO: fresh[0], tI: fresh[1] };
  const s2 = rewriteRoles(s, a);
  const r = parseResolved(s2, withPairTokens(ctx, a));
  if (!r.ok) {
    // a refusal is returned only when it names no token, and — for a line naming BOTH circles — only when it is the
    // refusal of an existing pair-relation reader (ADR-713's equal pair); any other stays unread, as before
    const both = s2.includes(a.tO) && s2.includes(a.tI);
    return carriesToken(a, r) || (both && !PAIR_RELATION_REFUSALS.has(r.reason)) ? { ok: false, reason: 'not-handled' } : r;
  }
  const out = mapBack(a)(r);
  return out.ok && !out.commands.some((c) => relatesPair(c, a)) ? out : { ok: false, reason: 'not-handled' };
}
