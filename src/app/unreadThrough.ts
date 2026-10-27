/**
 * #2532 ([ADR-765](../../docs/06-decisions.md#adr-765)) — AN INCIDENCE CLAUSE THE READING NEVER READ.
 *
 * The phrase sibling of #1888's label member (`unreadParts`), #1904's role-word member (`unreadRoles`) and #2198's
 * number member (`unreadNumbers`), over the same shell module (`shell/readExtent.ts`), in the same battery, so both
 * 2-D commit seams have it.
 *
 * WHAT WENT WRONG. «מעגל O» · «AB מיתר העובר דרך מרכז המעגל» committed `point-on-circle A, point-on-circle B,
 * segment AB`, the centre off AB at most seeds, every fact green. No carrier rule (chord, segment, secant, tangent,
 * altitude, median, diameter) reads a through-clause, and every gate missed it: the token accountants count «מרכז» and
 * «המעגל» as circle vocabulary; #1888's label probe sees a clause only through a fresh letter («מרכז המעגל» has none,
 * and «במעגל O … דרך O» is a co-reference); #1904's word probe covers cevian nouns only; ADR-598's clause gate does not
 * cut at «העובר». A fourth token kind of ADR-603's class: a LABEL-FREE INCIDENCE PHRASE.
 *
 * THE CHECK. ADR-604's deletion rule (`readWords`), over two spans per occurrence. The occurrence is UNREAD when
 * EITHER deletion leaves the lowering unchanged:
 *  1. the whole phrase — the opener (`THROUGH_OPEN`) through to the clause end;
 *  2. the verb opener alone (`THROUGH_VERB`) — never a bare «דרך» / "through", a fronted locative a rule may
 *     tolerate («דרך הנקודה C העבירו משיק…»).
 * Both, because each alone misses a measured member: (1) misses a phrase whose words a rule reads for another reason
 * («AB חותך העובר דרך מרכז המעגל»: «המעגל» is the secant's circle), (2) misses a tangent whose rule tolerates the verb.
 * The union flagged 26 of 26 class lines and 0 of the corpus's and the catalog's committing phrase lines (ADR-765).
 *
 * THE PARTS. The unread occurrence is reported as its whole phrase, clipped to its clause, and `cutAtReading`'s phrase
 * mode cuts the line at the phrase's start: «(1) AB מיתר  (2) העובר דרך מרכז המעגל». A line with no such cut keeps the
 * weak path (escalation), never a commit.
 */
import type { ParseContext } from '@/parser';
import { THROUGH_OPEN, THROUGH_VERB } from '@/parser/lexicon';
import type { AnyCommand } from '@/engine';
import { cutAtReading, labelRuns, readLabelRuns, readWords, type Occurrence, type PartsCut } from '../../shell/readExtent';
import { clauseReaders, loweringKey, readerIn } from './unreadParts';

/** A whole phrase: an opener, then everything to the clause end. */
const PHRASE_SRC = String.raw`${THROUGH_OPEN}[^,;.]*`;
/** The verb opener alone. */
const VERB_SRC = THROUGH_VERB;
const ANY_PHRASE = new RegExp(PHRASE_SRC, 'i');

export interface ThroughReport {
  /** the incidence phrases no reading depends on, each as typed (opener through to its clause end) */
  unread: readonly Occurrence[];
  /** the line's parts, cut at the phrase — null when no cut reads (the caller keeps its weak path) */
  cut: PartsCut<string> | null;
  /** what was left unread, in the student's words */
  items: string[];
}

/** Does the lowering reference a point label (`T`, `O1`) that the line never typed as a label? */
function resolvesUntypedPoint(utterance: string, commands: readonly AnyCommand[]): boolean {
  const typed = new Set(labelRuns(utterance).flatMap((o) => o.parts));
  const isPoint = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]\d*$/.test(v);
  return (commands as unknown as Record<string, unknown>[]).some((c) =>
    Object.values(c).some((v) => (Array.isArray(v) ? v : [v]).some((x) => isPoint(x) && !typed.has(x))),
  );
}

/** The member. Null when the line states no incidence phrase, or the reading reads every one. */
export function unreadThrough(utterance: string, commands: readonly AnyCommand[], ctx: ParseContext): ThroughReport | null {
  if (!ANY_PHRASE.test(utterance)) return null;
  const lowering = loweringKey(commands);
  const reader = readerIn(ctx);
  const whole = readWords(utterance, lowering, reader, new RegExp(PHRASE_SRC, 'gi'), () => 'through');
  // The verb opener alone is the WEAKER evidence: it cannot tell a dropped clause from a verb that is a mere connective
  // before a point the reading does read («המשיק העובר בנקודה המשותפת לשני המעגלים» = «המשיק בנקודה המשותפת…», the
  // tangent at the touch T). So a verb-only finding stands only when the reading resolved no point the line never typed:
  // a reading that names an untyped point read a role-named point, which a dropped incidence point never is (ADR-765).
  const verb = resolvesUntypedPoint(utterance, commands) ? { unread: [] } : readWords(utterance, lowering, reader, new RegExp(VERB_SRC, 'gi'), () => 'through');
  const starts = [...whole.unread, ...verb.unread].map((o) => o.at).sort((a, b) => a - b);
  if (starts.length === 0) return null;
  const { clauses, readerFor } = clauseReaders(utterance, ctx);
  // each unread opener, as its PHRASE: to the next , ; . — and never past the end of the clause its opener reads in
  const unread: Occurrence[] = [];
  for (const at of [...new Set(starts)]) {
    if (unread.some((p) => at >= p.at && at < p.end)) continue;
    const stop = utterance.slice(at).search(/[,;.]/);
    let end = stop < 0 ? utterance.length : at + stop;
    const home = clauses.find((c) => c.end > at && c.at <= at + utterance.slice(at).search(/\s|$/));
    if (home) end = Math.min(end, home.end);
    const text = utterance.slice(at, end).trimEnd();
    unread.push({ text, at, end: at + text.length, parts: ['through'], phrase: true });
  }
  const labels = readLabelRuns(utterance, lowering, { ...reader, figureLabels: ctx.points ?? [] });
  const cut = cutAtReading(utterance, clauses, { read: labels.read, unread, exempt: [] }, readerFor);
  return { unread, cut, items: unread.map((o) => o.text) };
}
