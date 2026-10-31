/**
 * #1888 / #1889 item C ([ADR-AG-251](../../docs/06c-decisions-analytic.md#adr-ag-251)) — A LINE THAT LOSES A PART.
 *
 * Analytic's port of the cross-builder rule ([ADR-W-120](../../docs/06w-decisions-workspace.md#adr-w-120)):
 * operator, 2026-10-08, *"a line that loses a part gets the existing one-input-per-line message … in every
 * builder"*, *"only when a part is lost"*, *"refuse it too"* when the lost part happens to hold, and *"teach
 * the right form"* for «משולש ABC ישר זווית ב-<V>».
 *
 * Analytic's frame mostly DECLINES what it cannot read whole (`parseLine`: a line is never half-accepted), so
 * the class arrives here by two doors, and each has its arm:
 *
 * 1. **A part the reading never read** ({@link unreadPart}). The line parses, but a label run the student typed
 *    changes nothing in what it parses to — «C מחלקת את AB ביחס 3:2 ב-B», «…3:2 על CA». Measured, never declared:
 *    `shell/readExtent.ts` substitutes the run's letters and re-reads the line with `parseLine`, the reading
 *    itself (context-free here, so one reader serves every clause).
 * 2. **A declined line whose rest is a lost part** ({@link declinedPart}). «משולש ABC ישר זווית ב-B» and
 *    «AC ו-BD נפגשים בנקודה E על AB» do not parse at all, so the probe never runs on them, and they would go to the
 *    model. Here the LONGEST word-boundary prefix that the submit decision would record is taken; when the rest
 *    holds nothing but labels that prefix already carries and words with no construction signal (the shared
 *    junk test, `shell/llm/constructionSignal.ts`, over analytic's own `VOCABULARY_ANALYTIC` — no new word list),
 *    the rest is a part the tool cannot read about objects it has, and the line is refused with its two parts.
 *    A rest that says something — «בקודקוד B», «ש-AE = EC», «שהיא אמצע BD» — is left to the reading or the model.
 *    #1947 ([ADR-AG-301](../../docs/06c-decisions-analytic.md#adr-ag-301)): a rest that says something AFTER its lost
 *    part — «ב-B ו-AB = 4» — is cut at its conjunctions; the first piece must be the lost part (the same test), and
 *    every further piece a given that records on its own after the prefix. Its parts are then all listed.
 * 3. **A declined line whose rest is an incidence clause on a segment** ({@link declinedThrough}; #2547,
 *    [ADR-AG-334](../../docs/06c-decisions-analytic.md#adr-ag-334)). «AB מיתר העובר דרך מרכז המעגל»: arm 2 leaves it,
 *    because its rest says something («מרכז», «מעגל»). 2-D refuses it whole (ADR-765), and the operator ruled analytic
 *    the same (2026-10-26). The head before the first incidence opener (`shell/incidencePhrase.ts`) must record and
 *    read as a segment, and the phrase's point must carry no fresh letter (named by its role, or by a letter the head
 *    carries). A fresh letter («… דרך C») is left to the model, as 2-D leaves it.
 *
 * The right-angle syntax is TAUGHT instead of listed: when the read part is a triangle whose right angle the
 * reading left open (a `choice` of perpendiculars at its vertices) and the lost part names one of its vertices.
 * Decided by the reading, never by the spelling.
 */
import { pointDeclaration } from '../parser/locusPhrases';
import { cutAtReading, labelRuns, locate, readLabelRuns, type Reader } from '../../shell/readExtent';
import { hasConstructionSignal } from '../../shell/llm/constructionSignal';
import { foldConjunctionSpacing } from '../../shell/conjunction';
import { VOCABULARY_ANALYTIC } from '../parser/scopeAnalytic';
import { parseLine, POINT_NOUN_EN_ATOM, POINT_NOUN_HE_ATOM } from '../parser/parseAnalytic';
import { firstIncidenceOpener, incidencePhraseAtStart } from '../../shell/incidencePhrase';
import type { Fact } from '../engine/types';

/** A lowering as the probe compares it: the facts without their `src` (a framed line quotes the line as typed). */
export const loweringKey = (facts: readonly Fact[]): string => JSON.stringify(facts, (k, v) => (k === 'src' ? undefined : v));

/** Analytic's reader: what `parseLine` makes of a text, or null when it declines it. Context-free by construction. */
export const analyticReader: Reader<string> = {
  read: (text) => {
    const p = parseLine(text);
    return p.ok && p.facts.length > 0 ? loweringKey(p.facts) : null;
  },
  same: (a, b) => a === b,
};

/** What a lost part refuses with — the parts in the student's words, or the two lines that teach the right angle. */
export interface LostPart {
  /** the line's parts, in order: the part that was read, then the part that was not */
  parts: string[];
  /** set when the lost part is the right angle's vertex of the triangle the reading built */
  teach?: { triangle: string; angle: string };
}

/**
 * THE TAUGHT FORM (#1888 follow-up 2). The read part built a triangle with its right angle at an unnamed vertex,
 * and the lost part is one vertex label of it: the two lines that build it are the triangle, then the angle at
 * that vertex with its two neighbours in the triangle's name (∠ABC for B in ABC, ∠CAB for A, ∠BCA for C).
 */
export function rightAngleTeach(facts: readonly Fact[], tail: string): LostPart['teach'] {
  const runs = labelRuns(tail);
  if (runs.length !== 1 || runs[0].parts.length !== 1) return undefined;
  const v = runs[0].parts[0];
  for (const f of facts) {
    if (f.t !== 'polygon' || f.vertices.length !== 3 || !f.vertices.includes(v)) continue;
    const ids = f.vertices;
    const openRightAngle = facts.some(
      (g) =>
        g.t === 'constraint' &&
        g.k.t === 'choice' &&
        g.k.options.length === 3 &&
        g.k.options.every((o) => o.t === 'relation' && o.rel === 'perpendicular' && o.u.k === 'points' && ids.includes(o.u.a)),
    );
    if (!openRightAngle) continue;
    const i = ids.indexOf(v);
    return { triangle: ids.join(''), angle: `${ids[(i + 2) % 3]}${v}${ids[(i + 1) % 3]}` };
  }
  return undefined;
}

// #1947 (ADR-AG-301) — taught whatever follows the vertex: further parts continue the numbered list from (3)
const withTeach = (parts: string[], facts: readonly Fact[]): LostPart => {
  const teach = parts.length >= 2 ? rightAngleTeach(facts, parts[1]) : undefined;
  return teach ? { parts, teach } : { parts };
};

/**
 * ARM 1 — a parsed line, with a label run its reading does not depend on. Null when every run is read (or exempt:
 * a co-reference, `readExtent`'s own). `'inside'` when the unread run sits inside the statement, with read labels
 * after it: a lost operand, not a lost part — the caller hands it to the model, as 2-D does (ADR-603).
 */
export function unreadPart(line: string, facts: readonly Fact[], figureLabels: readonly string[]): LostPart | 'inside' | null {
  const lowering = loweringKey(facts);
  const occ = readLabelRuns(line, lowering, { ...analyticReader, figureLabels });
  if (occ.unread.length === 0) return null;
  const cut = cutAtReading(line, locate(line, [line]), occ, () => analyticReader);
  if (!cut) return 'inside';
  const read = cut.cuts[0] ? parseLine(cut.parts[cut.cuts[0].part]) : null;
  return withTeach(cut.parts, read && read.ok ? read.facts : []);
}

/** The labels a set of facts carries — every capital-letter token anywhere in them. */
const carriedLabels = (facts: readonly Fact[]): Set<string> =>
  new Set(loweringKey(facts).match(/[A-Z]\d*/g) ?? []);

/** Is `rest` a lost part — labels `carried` already has, and particles with no construction signal? */
function isLostPart(rest: string, carried: ReadonlySet<string>): boolean {
  const runs = labelRuns(rest);
  if (runs.length === 0) return false;
  if (!runs.every((r) => r.parts.every((l) => carried.has(l)))) return false;
  let words0 = '';
  let from = 0;
  for (const r of runs) {
    words0 += rest.slice(from, r.at) + ' ';
    from = r.end;
  }
  words0 += rest.slice(from);
  // nothing but particles: no digit, no relation mark, no word of the tool's vocabulary
  return !/\d/.test(words0) && !hasConstructionSignal(words0, VOCABULARY_ANALYTIC);
}

/**
 * #1947 — a rest cut at its top-level conjunctions: the Hebrew «ו-» (its spacings folded by the shared
 * `shell/conjunction` chokepoint, never re-spelled here) and the English "and".
 */
const conjunctionPieces = (rest: string): string[] =>
  foldConjunctionSpacing(rest)
    .split(/\s+ו-(?=\S)|\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * ARM 2 — a DECLINED line (`not-handled`) whose longest recording prefix leaves a rest that adds only labels the
 * prefix already carries. `records(piece, before)` is the caller's own submit decision («would this piece record,
 * in this figure with `before` appended, now?»), so a part offered as "read" is one the next Enter accepts.
 *
 * #1947 (ADR-AG-301) — when the rest is not a lost part WHOLE, it may be a lost part FOLLOWED BY GIVENS
 * («ב-B ו-AB = 4»): cut at its conjunctions, the first piece must be a lost part and each further piece must record
 * after the prefix and the pieces before it. Then every part is listed; any piece that does not record leaves the
 * line to the model, as before.
 */
export function declinedPart(line: string, records: (piece: string, before: readonly string[]) => boolean): LostPart | null {
  const words = line.split(/\s+/).filter(Boolean);
  for (let cut = words.length - 1; cut >= 1; cut--) {
    const prefix = words.slice(0, cut).join(' ');
    const parsed = parseLine(prefix);
    if (!parsed.ok || parsed.facts.length === 0 || !records(prefix, [])) continue;
    // the LONGEST prefix that records decides: its rest is the lost part, or the line is not this class
    const rest = words.slice(cut).join(' ');
    const carried = carriedLabels(parsed.facts);
    if (isLostPart(rest, carried)) return withTeach([prefix, rest], parsed.facts);
    const [lost, ...more] = conjunctionPieces(rest);
    if (more.length === 0 || !isLostPart(lost, carried)) return null;
    const held = [prefix];
    for (const piece of more) {
      if (!records(piece, held)) return null;
      held.push(piece);
    }
    return withTeach([prefix, lost, ...more], parsed.facts);
  }
  return null;
}

/** A point noun right before a label — «הנקודה C», "the point C": the label's optional subject noun, not a role. */
const NOUN_BEFORE_LABEL = new RegExp(String.raw`(?<!\p{L})(?:${POINT_NOUN_HE_ATOM}|${POINT_NOUN_EN_ATOM})\s*$`, 'iu');

/**
 * Does the incidence phrase's point carry NO FRESH LETTER (ADR-765's class sentence, asked in analytic)? Either it is
 * named by its ROLE — with its labels (and a point noun right before one) removed, words of the tool's vocabulary
 * remain («מרכז המעגל», «מרכזו», «אמצע AB», "the centre", a bare «הנקודה») — or every label it has is one the head
 * already carries (a co-reference).
 */
function pointCarriesNoFreshLetter(point: string, carried: ReadonlySet<string>): boolean {
  const runs = labelRuns(point);
  const labels = runs.flatMap((r) => r.parts);
  if (labels.length > 0 && labels.every((l) => carried.has(l))) return true;
  let words = '';
  let from = 0;
  for (const r of runs) {
    words += point.slice(from, r.at).replace(NOUN_BEFORE_LABEL, '') + ' ';
    from = r.end;
  }
  words += point.slice(from);
  return hasConstructionSignal(words, VOCABULARY_ANALYTIC);
}

/**
 * ARM 3 — #2547 ([ADR-AG-334](../../docs/06c-decisions-analytic.md#adr-ag-334)): A THROUGH-CLAUSE ON A SEGMENT, refused
 * whole as 2-D refuses it (ADR-765). Operator, 2026-10-26 (D10 = A): *"refuse now, like 2-D … instead of passing it to the
 * AI"*. A DECLINED line whose head — the text before its first incidence opener (`shell/incidencePhrase.ts`, the one
 * spelling every builder reads), a trailing comma dropped as 2-D's cut drops it — records and READS AS a segment (a
 * `segment` or `cevian-of` fact: a chord, segment, diameter, tangent, altitude, median), and whose rest is ONE incidence
 * phrase whose point carries no fresh letter. «AB מיתר העובר דרך מרכז המעגל» → «(1) AB מיתר  (2) העובר דרך מרכז המעגל».
 *
 * The segment test is a property of the READING, never of the spelling: «ישר AB …» (a line) and «מעגל העובר דרך A»
 * (2-D builds it) never qualify. A fresh letter («… דרך C») leaves the line to the model, as 2-D escalates it. A rest
 * that continues with givens joined by «ו-» / "and" that each record after the head («… ו-AB = 4») lists them as further
 * parts (ADR-AG-301's cut); otherwise the whole rest is the one phrase, to its clause end. Runs after {@link declinedPart},
 * so a co-reference that arm already refuses («AB מיתר במעגל O העובר דרך O») keeps its parts.
 */
export function declinedThrough(line: string, records: (piece: string, before: readonly string[]) => boolean): LostPart | null {
  const at = firstIncidenceOpener(line);
  if (at < 0) return null;
  const head = line.slice(0, at).replace(/[,\s]+$/, '');
  const rest = line.slice(at).trim();
  const parsed = parseLine(head);
  if (!parsed.ok || !parsed.facts.some((f) => f.t === 'segment' || f.t === 'cevian-of')) return null;
  const [first, ...more] = conjunctionPieces(rest);
  const phrase = incidencePhraseAtStart(first);
  if (!phrase || !incidencePhraseAtStart(rest)) return null;
  if (!pointCarriesNoFreshLetter(phrase.point, carriedLabels(parsed.facts))) return null;
  if (!records(head, [])) return null;
  const held = [head];
  for (const piece of more) {
    if (!records(piece, held)) return { parts: [head, rest] };
    held.push(piece);
  }
  return { parts: more.length ? [head, first, ...more] : [head, rest] };
}

/**
 * ARM 4 — #1177 ([ADR-AG-352](../../docs/06c-decisions-analytic.md#adr-ag-352)): THE LOCUS POINT IN ONE LINE, taught as
 * its two. Operator, 2026-09-27, asked whether «M נקודה המקיימת MA = MB» should be read: *"No, teach the two lines"* —
 * the two-line form (`נקודה M` · the property) stays the only form, ADR-AG-072 §1, and the one-line form is refused with
 * the one-input-per-line message listing them, so the next two Enters build what the student meant.
 *
 * A point NAMED in the line («M נקודה» · «M היא נקודה» · «נקודה M» · «הנקודה M»), then a satisfying-clause opener
 * («המקיימת» · «שמקיימת»), then a property. («M נקודה כך ש-…» is not this arm's: the grammar reads its head and the
 * lost-operand rule hands it to the model, as before.) Taught only when BOTH lines record, the point first and the
 * property in the figure it makes — a taught remedy is one the next Enter accepts (ADR-W-030's promise). Anything else
 * returns null and the line keeps the path it had.
 */
const POINT_PROPERTY = /^(?:ה?נקודה\s+([A-Z][0-9]?)|([A-Z][0-9]?)\s+(?:היא\s+|הינה\s+)?נקודה)\s*,?\s+(?:ה?מקיימת|שמקיימת)\s+(.+?)\s*[.]?$/;

export function declinedPointProperty(line: string, records: (piece: string, before: readonly string[]) => boolean): LostPart | null {
  const m = POINT_PROPERTY.exec(line.trim());
  if (!m) return null;
  const point = pointDeclaration(m[1] ?? m[2]);
  const property = m[3];
  if (!records(point, []) || !records(property, [point])) return null;
  return { parts: [point, property] };
}
