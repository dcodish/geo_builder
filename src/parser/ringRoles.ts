/**
 * #2545 ([ADR-768](../../docs/06-decisions.md#adr-768)) — A CIRCLE NAMED BY ITS RELATION TO A POLYGON, READ WHERE THE
 * RELATION STANDS.
 *
 * «משולש ABC» · «DE מיתר במעגל החוסם» committed a fresh free circle with D and E on it, the triangle nowhere near it,
 * every fact green. The relation («החוסם» — the circumscribed circle, «החסום» — the inscribed one, "the circumcircle")
 * was never read: every circle rule reads «(ב)מעגל» and the adjective after it is vocabulary, so the line bound
 * whatever ADR-029 / ADR-367 picked — the figure's one circle of ANY role, or a freshly introduced free circle. The one
 * partial reader, ADR-291's `circumscribingRef`, read only the lettered circumscribed form of an existing circle, and
 * only inside two resolver helpers.
 *
 * Now each relation span in ARGUMENT position is resolved where it stands, at the parse boundary — the rewrite
 * chokepoint of ADR-760's pair roles, #102's size qualifier and #192's ordinal:
 *  - the RING is the span's label run («את משולש ABC»), else the figure's one polygon of the noun's size («את
 *    המשולש»), else the figure's one polygon (the bare «המעגל החוסם»);
 *  - the CIRCLE is the one through every vertex (circumscribed) or the one tangent to every side BY CONSTRUCTION
 *    (inscribed: `ParseContext.inscribedCircles`, a semantic field read off the objects);
 *  - resolved, the span becomes the letter form «מעגל <letter>» / "circle <letter>" every circle rule already reads, so
 *    chord, diameter, point-on, tangent, secant and line∩circle all bind the described circle at once;
 *  - a ring found by its noun or by the figure (no letters) resolves only when the described circle is the figure's
 *    ONE circle: choosing by role among several drawn circles is #2560's question, not this reader's;
 *  - unresolved (no such circle, no ring, several rings), the span is left as typed and the honesty battery's
 *    `unreadRingRole` member decides — the line is refused, never bound to another circle.
 * A span that is the sentence's SUBJECT («המעגל החוסם את … חותך …», «מעגל O חוסם את …») is never touched: its rules own
 * it (ADR-291 Am., the #86 ruling that the cut sentence's circle stays hidden).
 */
import { RING_CIRCUM_HE, RING_NOUN_EN, RING_NOUN_HE, RING_ROLE_REF_EN, RING_ROLE_REF_HE, ULABEL, ringRelation } from './lexicon';
import { freshTokens } from './pairRoles';
import type { ParseContext, ParseResult } from './parse';

/** One relation span in argument position, as typed. */
export interface RingSpan {
  /** offsets into the sentence, and the span text (head + ring tail) */
  at: number;
  end: number;
  text: string;
  lang: 'he' | 'en';
  /** the operand particles / preposition kept on a rewrite («ב», «על », "of") */
  pre: string;
  relation: 'circum' | 'inscribed';
  /** the polygon noun of the tail, when typed, and its vertex count (0 = any polygon) */
  noun: string | null;
  arity: number;
  /** the tail's label run, when typed */
  labels: string[] | null;
}

const RUN = String.raw`(${ULABEL}(?:\s?${ULABEL}){2,})(?![A-Za-z\d])`;
const HE_TAIL = new RegExp(String.raw`^\s+(?:את\s+)?(?:(?:ב-?)?ה?(${RING_NOUN_HE})(?![א-ת])(?:\s+${RUN})?|${RUN})`);
const EN_TAIL_OF = new RegExp(String.raw`^\s+(?:of|in|around|about)\s+(?:(?:the\s+)?(${RING_NOUN_EN})(?![A-Za-z])(?:\s+${RUN})?|${RUN})`, 'i');
const EN_TAIL_DIRECT = new RegExp(String.raw`^\s+(?:(?:the\s+)?(${RING_NOUN_EN})(?![A-Za-z])(?:\s+${RUN})?|${RUN})`, 'i');

/** The vertex count a ring noun names (0 = any polygon). */
const nounArity = (noun: string): number =>
  /^(?:משולש|triangle)/i.test(noun) ? 3 : /^(?:מחומש|pentagon)/i.test(noun) ? 5 : /^(?:משושה|hexagon)/i.test(noun) ? 6 : /^(?:מצולע|polygon)/i.test(noun) ? 0 : 4;
const labelsOf = (run: string | undefined): string[] | null => (run ? run.match(new RegExp(ULABEL, 'g')) ?? null : null);

/** Every relation span in argument position, in order. */
export function ringRoleSpans(s: string): RingSpan[] {
  const out: RingSpan[] = [];
  for (const m of s.matchAll(new RegExp(RING_ROLE_REF_HE, 'g'))) {
    const at = m.index!;
    let end = at + m[0].length;
    const t = s.slice(end).match(HE_TAIL);
    if (t) end += t[0].length;
    out.push({ at, end, text: s.slice(at, end), lang: 'he', pre: m[1], relation: ringRelation(m[2]), noun: t?.[1] ?? null, arity: t?.[1] ? nounArity(t[1]) : 0, labels: labelsOf(t?.[2] ?? t?.[3]) });
  }
  for (const m of s.matchAll(new RegExp(RING_ROLE_REF_EN, 'gi'))) {
    const at = m.index!;
    let end = at + m[0].length;
    const t = s.slice(end).match(/^circle\s/i.test(m[2]) ? EN_TAIL_DIRECT : EN_TAIL_OF);
    if (t) end += t[0].length;
    out.push({ at, end, text: s.slice(at, end), lang: 'en', pre: m[1], relation: ringRelation(m[2]), noun: t?.[1] ?? null, arity: t?.[1] ? nounArity(t[1]) : 0, labels: labelsOf(t?.[2] ?? t?.[3]) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Does the sentence carry a relation span in argument position? */
export const hasRingSpan = (s: string): boolean => new RegExp(RING_ROLE_REF_HE).test(s) || new RegExp(RING_ROLE_REF_EN, 'i').test(s);

/** The span as the plain circle noun with its particles — the relation and its ring deleted («במעגל», «על המעגל», "of the circle"). */
export const plainCircle = (sp: RingSpan): string => (sp.lang === 'he' ? `${sp.pre}${/\s$/.test(sp.pre) ? 'ה' : ''}מעגל` : `${sp.pre} the circle`);
/** The span as the letter form of a circle («במעגל O», «על מעגל O», "of circle O"). */
export const letteredCircle = (sp: RingSpan, letter: string): string => (sp.lang === 'he' ? `${sp.pre}מעגל ${letter}` : `${sp.pre} circle ${letter}`);
/** Every span of `spans` replaced in `s` by `rewrite(span)` (right to left, so the offsets hold). */
export function replaceSpans(s: string, spans: readonly RingSpan[], rewrite: (sp: RingSpan) => string): string {
  let out = s;
  for (const sp of [...spans].sort((a, b) => b.at - a.at)) out = out.slice(0, sp.at) + rewrite(sp) + out.slice(sp.end);
  return out;
}

/**
 * ADR-291's lettered circumscribing phrase in ANY position («המעגל החוסם את משולש ABC חותך …», "the circle
 * circumscribing triangle ABC …"): a circle reference whose labels are the ring's, never the sentence's operands.
 */
const LETTERED_CIRCUM_HE = new RegExp(String.raw`(?<![א-ת])ה?מעגל\s+ה?(?:${RING_CIRCUM_HE})(?![א-ת])`, 'g');
const LETTERED_CIRCUM_EN = new RegExp(String.raw`(?<![A-Za-z])(?:the\s+)?(?:circle\s+circumscribing|circumcircle\s+of)(?![A-Za-z])`, 'gi');

/**
 * The sentence with every circle-by-relation reference reduced to the plain circle noun — the relation and the ring's
 * labels gone — so a rule reading the sentence's own labels never reads the ring's (the job ADR-291's phrase strip did
 * in `dropCircleRef`, now for both relations). Argument-position spans, and the lettered circumscribing phrase anywhere.
 */
export function dropRingRefs(s: string): string {
  const spans: { at: number; end: number; plain: string }[] = ringRoleSpans(s).map((sp) => ({ at: sp.at, end: sp.end, plain: plainCircle(sp) }));
  const lettered = (re: RegExp, tail: RegExp, plain: string) => {
    for (const m of s.matchAll(re)) {
      const at = m.index!;
      if (spans.some((x) => at < x.end && at + m[0].length > x.at)) continue;
      const t = s.slice(at + m[0].length).match(tail);
      if (t && (t[2] ?? t[3])) spans.push({ at, end: at + m[0].length + t[0].length, plain });
    }
  };
  lettered(LETTERED_CIRCUM_HE, HE_TAIL, 'מעגל');
  lettered(LETTERED_CIRCUM_EN, EN_TAIL_DIRECT, 'circle');
  let out = s;
  for (const x of spans.sort((a, b) => b.at - a.at)) out = out.slice(0, x.at) + x.plain + out.slice(x.end);
  return out;
}

/** The ring a span names: its labels, else the figure's one polygon of its noun's size, else the figure's one polygon. */
export type RingRead =
  | { ring: string[]; lettered: boolean }
  | { absent: 'no-polygon' }
  | { absent: 'ambiguous'; shapes: string[][]; sides: number };
export function ringOf(sp: RingSpan, ctx: ParseContext): RingRead {
  if (sp.labels) return sp.arity && sp.labels.length !== sp.arity ? { absent: 'no-polygon' } : { ring: sp.labels, lettered: true };
  const polys = (ctx.polygons ?? []).filter((p) => !sp.arity || p.length === sp.arity);
  if (polys.length === 1) return { ring: polys[0], lettered: false };
  if (polys.length === 0) return { absent: 'no-polygon' };
  return { absent: 'ambiguous', shapes: polys, sides: sp.arity || polys[0].length };
}

const tokenOf = (center: string): string => (center.startsWith('@ctr-') ? center.slice(5) : center);
const sameRing = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** The circle the relation describes for `ring`: its reference token and id, or null when the figure has none. */
export function describedCircle(relation: RingSpan['relation'], ring: readonly string[], ctx: ParseContext): { token: string; id: string } | null {
  if (relation === 'circum') {
    const hits = (ctx.circleMembers ?? []).filter((e) => !e.center.startsWith('~') && ring.every((p) => e.points.includes(p)));
    const ids = [...new Set(hits.map((e) => e.id ?? `circle-${tokenOf(e.center)}`))];
    return ids.length === 1 ? { token: tokenOf(hits[0].center), id: ids[0] } : null;
  }
  const hits = (ctx.inscribedCircles ?? []).filter((e) => sameRing(e.ring, ring));
  return hits.length === 1 ? { token: tokenOf(hits[0].center), id: hits[0].circle } : null;
}

/**
 * The circle a span names in this figure, or null (the span is then left for the battery). A ring found without letters
 * resolves only when the described circle is the figure's one circle — beside another circle, which one the bare
 * relation means is the operator's question (#2560).
 */
export function resolveRingSpan(sp: RingSpan, ctx: ParseContext): { token: string; id: string } | null {
  const r = ringOf(sp, ctx);
  if (!('ring' in r)) return null;
  const c = describedCircle(sp.relation, r.ring, ctx);
  if (!c) return null;
  if (!r.lettered) {
    const circles = (ctx.circles ?? []).filter((x) => !x.startsWith('~'));
    if (circles.length !== 1 || tokenOf(circles[0]).toUpperCase() !== c.token.toUpperCase()) return null;
  }
  return c;
}

/** Is `token` an anonymous centre (ADR-342) whose letter the sentence also types as its own label? */
const clashes = (token: string, ctx: ParseContext, s: string): boolean =>
  (ctx.centrePoint?.[token] ?? '').startsWith('@ctr-') && new RegExp(String.raw`(?<![A-Za-z])${token}(?![A-Za-z\d'′])`).test(s);

/** The context with one circle's reference token renamed (an exact JSON-string rename: whole ids, centre ids, pair keys). */
const renameToken = <T>(v: T, from: string, to: string): T =>
  JSON.parse(JSON.stringify(v).replace(new RegExp(String.raw`(?<=["|])(circle-|@ctr-)?${from}(?=["|])`, 'g'), (_m, p: string | undefined) => `${p ?? ''}${to}`)) as T;
/** Map a parse-local token back to the circle's own token, inside every string of a result (composite ids included). */
const mapBack = <T>(v: T, tmp: string, tok: string): T => {
  const re = new RegExp(String.raw`(?<![a-z])${tmp}(?![a-z])`, 'g');
  const walk = (x: unknown): unknown =>
    typeof x === 'string' ? x.replace(re, tok) : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x;
  return walk(v) as T;
};

/**
 * The per-span resolution: the sentence with every resolvable relation span rewritten to its circle's letter form, or
 * null when it carries none that resolves. An anonymous circle whose letter the sentence also types («O על המעגל החוסם»
 * beside an unnamed circumcircle) is read over a context where the circle answers to a fresh parse-local token
 * (ADR-342's manner, as ADR-760's pair tokens), and the result is mapped back — `aliased` carries that parse.
 */
export function resolveRingRoles(
  s: string,
  ctx: ParseContext,
  parseResolved: (s: string, ctx: ParseContext) => ParseResult,
): { s: string } | { aliased: ParseResult } | null {
  if (!hasRingSpan(s)) return null;
  const hits = ringRoleSpans(s).flatMap((sp) => {
    const c = resolveRingSpan(sp, ctx);
    return c ? [{ sp, c }] : [];
  });
  if (hits.length === 0) return null;
  const clash = hits.find((h) => clashes(h.c.token, ctx, s));
  if (!clash) {
    const byAt = new Map(hits.map((h) => [h.sp.at, h.c.token]));
    return { s: replaceSpans(s, hits.map((h) => h.sp), (sp) => letteredCircle(sp, byAt.get(sp.at)!)) };
  }
  // one clashing token at a time is enough for every measured line; two clashing circles in one line read as not-handled
  if (hits.some((h) => h !== clash && clashes(h.c.token, ctx, s) && h.c.token !== clash.c.token)) return { aliased: { ok: false, reason: 'not-handled' } };
  const fresh = freshTokens(ctx, s);
  if (!fresh) return { aliased: { ok: false, reason: 'not-handled' } };
  const tmp = fresh[0];
  const tok = clash.c.token;
  const byAt = new Map(hits.map((h) => [h.sp.at, h.c.token === tok ? tmp : h.c.token]));
  const s2 = replaceSpans(s, hits.map((h) => h.sp), (sp) => letteredCircle(sp, byAt.get(sp.at)!));
  const r = parseResolved(s2, renameToken(ctx, tok, tmp));
  return { aliased: mapBack(r, tmp, tok) };
}

const NOUN_HE: Record<number, string> = { 3: 'משולש', 4: 'מרובע' };
const NOUN_EN: Record<number, string> = { 3: 'triangle', 4: 'quadrilateral' };

/** #2545: the canonical line that declares the described circle on `ring`, in the student's language — the first of the two lines a refusal teaches (`unreadRingRole.ts`). Null for a ring the declarations do not read (n ≥ 5). */
export function declarationLine(sp: RingSpan, letter: string, ring: readonly string[]): string | null {
  const he = NOUN_HE[ring.length];
  const en = NOUN_EN[ring.length];
  if (!he || !en) return null;
  const r = ring.join('');
  if (sp.lang === 'he') return sp.relation === 'circum' ? `מעגל ${letter} חוסם את ${he} ${r}` : `מעגל ${letter} חסום ב${he} ${r}`;
  return sp.relation === 'circum' ? `circle ${letter} circumscribes ${en} ${r}` : `circle ${letter} is inscribed in ${en} ${r}`;
}

/** The span naming the ring explicitly — the example a which-polygon question teaches. */
export function namedRing(sp: RingSpan, ring: readonly string[]): string {
  const r = ring.join('');
  const he = NOUN_HE[ring.length] ?? 'מצולע';
  const en = NOUN_EN[ring.length] ?? 'polygon';
  if (sp.lang === 'he') return `${plainCircle(sp)} ${sp.relation === 'circum' ? 'החוסם את' : 'החסום ב'}${sp.relation === 'circum' ? ' ' : ''}${he} ${r}`;
  return `${sp.pre} the circle ${sp.relation === 'circum' ? 'circumscribing' : 'inscribed in'} ${en} ${r}`;
}

