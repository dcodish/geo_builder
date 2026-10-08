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
 *
 * The right-angle syntax is TAUGHT instead of listed: when the read part is a triangle whose right angle the
 * reading left open (a `choice` of perpendiculars at its vertices) and the lost part names one of its vertices.
 * Decided by the reading, never by the spelling.
 */
import { cutAtReading, labelRuns, locate, readLabelRuns, type Reader } from '../../shell/readExtent';
import { hasConstructionSignal } from '../../shell/llm/constructionSignal';
import { VOCABULARY_ANALYTIC } from '../parser/scopeAnalytic';
import { parseLine } from '../parser/parseAnalytic';
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

const withTeach = (parts: string[], facts: readonly Fact[]): LostPart => {
  const teach = parts.length === 2 ? rightAngleTeach(facts, parts[1]) : undefined;
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

/**
 * ARM 2 — a DECLINED line (`not-handled`) whose longest recording prefix leaves a rest that adds only labels the
 * prefix already carries. `records(prefix)` is the caller's own submit decision («would this prefix record, in
 * this figure, now?»), so a part offered as "read" is one the next Enter accepts.
 */
export function declinedPart(line: string, records: (prefix: string) => boolean): LostPart | null {
  const words = line.split(/\s+/).filter(Boolean);
  for (let cut = words.length - 1; cut >= 1; cut--) {
    const prefix = words.slice(0, cut).join(' ');
    const parsed = parseLine(prefix);
    if (!parsed.ok || parsed.facts.length === 0 || !records(prefix)) continue;
    // the LONGEST prefix that records decides: its rest is the lost part, or the line is not this class
    const rest = words.slice(cut).join(' ');
    const runs = labelRuns(rest);
    if (runs.length === 0) return null;
    const carried = carriedLabels(parsed.facts);
    if (!runs.every((r) => r.parts.every((l) => carried.has(l)))) return null;
    let words0 = '';
    let from = 0;
    for (const r of runs) {
      words0 += rest.slice(from, r.at) + ' ';
      from = r.end;
    }
    words0 += rest.slice(from);
    // nothing but particles: no digit, no relation mark, no word of the tool's vocabulary
    if (/\d/.test(words0) || hasConstructionSignal(words0, VOCABULARY_ANALYTIC)) return null;
    return withTeach([prefix, rest], parsed.facts);
  }
  return null;
}
