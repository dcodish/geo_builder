/**
 * #2545 ([ADR-768](../../docs/06-decisions.md#adr-768)) — A CIRCLE'S RELATION TO A POLYGON THAT THE READING NEVER READ.
 *
 * The relation-word sibling of #1888's label member (`unreadParts`), #1904's role-word member (`unreadRoles`) and
 * #2532's phrase member (`unreadThrough`), in the same battery, so both 2-D commit seams have it.
 *
 * WHAT WENT WRONG. «משולש ABC» · «DE מיתר במעגל החוסם» committed a free circle with D and E on it, the triangle nowhere
 * near it; beside a drawn incircle the same line put D and E on the INCIRCLE. Every gate was clean: the accountants
 * count «חוסם» as vocabulary, ADR-603's label probe exempts «משולש ABC» as a scene name (and the bare line has no label
 * at all), ADR-604's word probe covers the cevian nouns only, ADR-765's phrase probe needs a through-opener. Deleting the
 * relation («החוסם [את …]», "circumscribed", "circumcircle") gave a byte-identical lowering on every measured line.
 *
 * THE CHECK. Each relation span in argument position (`ringRoles.ts` `ringRoleSpans`) is READ when the parse-boundary
 * reader resolved it to the described circle (`resolveRingSpan` — the line then names that circle by its letter).
 * Otherwise it is DELETED (the span becomes the plain circle noun with its particles) and the line re-read: a span the
 * lowering does not depend on was not read. Deletion, as ADR-604: a resolved span is never in question, so a drawn
 * described circle is never a false flag.
 *
 * THE REFUSAL. ADR-603's ruling (operator, 2026-10-08 on #1888/#1889: *"a line that loses a part gets the existing
 * one-input-per-line message"*, *"refuse it too"*): the shared split-statements message, naming the two lines that
 * would build it — the described circle declared («מעגל O חוסם את משולש ABC» / «מעגל O חסום במשולש ABC»), then the
 * student's own line with the span replaced by its letter («DE מיתר במעגל O»). Both lines are PROVED to read on this
 * figure in turn (#1183: a taught remedy is a hypothesis). Several polygons and a bare relation: ADR-685's question
 * (which polygon), its example naming the first. No polygon, or a remedy that does not read: the weak path.
 */
import { augmentParseCtx, parse } from '@/parser';
import type { ParseContext } from '@/parser';
import { plainCircle, replaceSpans, resolveRingSpan, ringOf, ringRoleSpans, letteredCircle, type RingSpan } from '@/parser/ringRoles';
import type { AnyCommand } from '@/engine';
import { loweringKey } from './unreadParts';

export interface RingReport {
  /** the relation spans no reading depends on, as typed */
  unread: readonly RingSpan[];
  /** what was left unread, in the student's words */
  items: string[];
}

/** The member. Null when the line names no circle by its relation, or the reading reads every such span. */
export function unreadRingRole(utterance: string, commands: readonly AnyCommand[], ctx: ParseContext): RingReport | null {
  const spans = ringRoleSpans(utterance);
  if (spans.length === 0) return null;
  const lowering = loweringKey(commands);
  const unread = spans.filter((sp) => {
    if (resolveRingSpan(sp, ctx)) return false;
    const r = parse(replaceSpans(utterance, [sp], plainCircle), ctx);
    return r.ok && r.commands.length > 0 && loweringKey(r.commands) === lowering;
  });
  return unread.length ? { unread, items: unread.map((sp) => sp.text.trim()) } : null;
}

const NOUN_HE: Record<number, string> = { 3: 'משולש', 4: 'מרובע' };
const NOUN_EN: Record<number, string> = { 3: 'triangle', 4: 'quadrilateral' };

/** The line that declares the described circle on `ring`, in the student's language. */
function declaration(sp: RingSpan, letter: string, ring: readonly string[]): string | null {
  const he = NOUN_HE[ring.length];
  const en = NOUN_EN[ring.length];
  if (!he || !en) return null;
  const r = ring.join('');
  if (sp.lang === 'he') return sp.relation === 'circum' ? `מעגל ${letter} חוסם את ${he} ${r}` : `מעגל ${letter} חסום ב${he} ${r}`;
  return sp.relation === 'circum' ? `circle ${letter} circumscribes ${en} ${r}` : `circle ${letter} is inscribed in ${en} ${r}`;
}

/** The span naming the ring explicitly — the example a which-polygon question teaches. */
function namedRing(sp: RingSpan, ring: readonly string[]): string {
  const r = ring.join('');
  const he = NOUN_HE[ring.length] ?? 'מצולע';
  const en = NOUN_EN[ring.length] ?? 'polygon';
  if (sp.lang === 'he') return `${plainCircle(sp)} ${sp.relation === 'circum' ? 'החוסם את' : 'החסום ב'}${sp.relation === 'circum' ? ' ' : ''}${he} ${r}`;
  return `${sp.pre} the circle ${sp.relation === 'circum' ? 'circumscribing' : 'inscribed in'} ${en} ${r}`;
}

/** A centre letter nothing on the figure or in the line uses. */
function freshLetter(utterance: string, ctx: ParseContext): string | null {
  const used = new Set([...(ctx.points ?? []), ...(ctx.circles ?? []), ...(ctx.autoCenters ?? []), ...(utterance.match(/[A-Z]/g) ?? [])].map((x) => x.toUpperCase()));
  return ['O', 'P', 'Q', 'K', 'M', 'N', 'S', 'T'].find((x) => !used.has(x)) ?? null;
}

export type LostRingNote =
  | { kind: 'split'; note: { key: string; params: Record<string, string> } }
  | { kind: 'ambiguous'; shapes: string[]; sides: number; example: string };

/**
 * The refusal a lost relation gets: the two lines that build it, each proved to read on this figure in turn; the
 * which-polygon question when the bare relation sits beside several; null (the weak path) otherwise.
 */
export function lostRingNote(utterance: string, report: RingReport, ctx: ParseContext): LostRingNote | null {
  const sp = report.unread[0];
  const r = ringOf(sp, ctx);
  if ('absent' in r) {
    if (r.absent !== 'ambiguous') return null;
    const shapes = r.shapes.map((p) => p.join(''));
    return { kind: 'ambiguous', shapes, sides: r.sides, example: replaceSpans(utterance, [sp], (x) => namedRing(x, r.shapes[0])) };
  }
  // one remedy per line: every unread span must name the same circle
  if (report.unread.some((x) => x.relation !== sp.relation || !sameRead(ringOf(x, ctx), r.ring))) return null;
  const letter = freshLetter(utterance, ctx);
  if (!letter) return null;
  const first = declaration(sp, letter, r.ring);
  if (!first) return null;
  const second = replaceSpans(utterance, report.unread, (x) => letteredCircle(x, letter)).trim();
  const r1 = parse(first, ctx);
  if (!r1.ok || r1.commands.length === 0) return null;
  const r2 = parse(second, augmentParseCtx(ctx, r1.commands));
  if (!r2.ok || r2.commands.length === 0) return null;
  return { kind: 'split', note: { key: 'input.scope.split-statements', params: { first, second, all: `(1) ${first}  (2) ${second}` } } };
}

const sameRead = (x: ReturnType<typeof ringOf>, ring: readonly string[]): boolean =>
  'ring' in x && x.ring.length === ring.length && x.ring.every((p) => ring.includes(p));
