/**
 * READ EXTENT, MEASURED (#1888 / #1889, ADR-W-120) — which parts of a line did the winning reading
 * actually READ?
 *
 * ## The defect it exists for
 *
 * Every honesty gate in every builder accounts TOKENS, not READINGS: a label counts as read wherever any
 * command happens to carry it. So a part of the line the winning rule never looked at is dropped while the
 * line commits green, as long as its letters ride some other command:
 *
 * - «משולש ABC ישר זווית ב-B» lowers to `right-triangle [A,B,C]` (angle at C): the locative «ב-B» is
 *   erased with the rest of the claimed vertex B, and B is carried by the triangle;
 * - «AC ו-BD נפגשים בנקודה E שהיא אמצע BD» lowers to the crossing alone: B and D are carried by the
 *   diagonals, so the relative clause is invisible;
 * - «…בנקודה E על AB», «E חיתוך AC ו-BD ו-AB» — the same, one incidence over.
 *
 * Operator rulings, 2026-10-08 (#1888, #1889): *"a line that loses a part gets the existing
 * one-input-per-line message … in every builder"*, and *"refuse it too"* when the unread part happens to
 * hold in the drawing.
 *
 * ## The measurement
 *
 * A reading DEPENDS on an occurrence when changing that occurrence changes the reading. For each label
 * run the student typed, one letter at a time is replaced by another label — one of the line's own, a fresh
 * letter (on neither the line nor the figure) only when the line has none to spare, because a fail-closed
 * leftover could mistake a fresh letter for a reading — and the line is read again. **If no substitution changes the lowering, the
 * occurrence was not read.** Nothing is declared per rule, and no word list grows: the builder's own
 * grammar answers.
 *
 * One exemption is generic and lives here: a CO-REFERENCE — a single letter the line also reads as a
 * single-letter run elsewhere («נקודה F … בנקודה F»): the student named the point twice and the reading
 * honours it once. A builder adds its own (2-D: a scene name, «במשולש ABC», that its label accountant
 * already treats as context) through {@link LabelProbe.exempt}.
 *
 * ## The parts
 *
 * A refusal lists the parts in the student's own words ({@link cutAtReading}): the line's clauses, with an
 * offending clause cut WHERE ITS READING STOPS — the shortest word-boundary prefix that holds every label
 * occurrence the reading reads and reads byte-identically to the clause. The unread tail is the next part
 * («משולש ABC ישר זווית | ב-B»). An unread occurrence with READ labels after it in its clause («AC ו-BD ו-AB
 * נפגשים בנקודה E») has no such cut: that is not a lost part but a lost operand, and the caller keeps its
 * own path for it.
 *
 * ## Why it is in `shell/`
 *
 * It would otherwise be the third copy (2-D, 3-D, analytic). It knows no product and returns no strings:
 * each builder passes its own `read`, its own equality, and its own label-token pattern (3-D's labels
 * carry primes).
 */

/** One occurrence of a token the student typed, located in the line. */
export interface Occurrence {
  /** the text as typed */
  readonly text: string;
  /** offset in the line */
  readonly at: number;
  /** offset just past it */
  readonly end: number;
  /** the labels of a label run («AB» → A, B); the word itself for a word token */
  readonly parts: readonly string[];
}

/** How a builder reads a line — its own grammar, in its own context. */
export interface Reader<L> {
  /** the lowering of `text`, or null when the builder does not read it */
  read(text: string): L | null;
  /** are two lowerings the same reading? */
  same(a: L, b: L): boolean;
}

export interface LabelProbe<L> extends Reader<L> {
  /** a whole label run (global). Default: uppercase Latin labels with optional digits, glued («ABC», «A1B»). */
  run?: RegExp;
  /** one label inside a run (global). Default: `[A-Z]\d*`. */
  label?: RegExp;
  /**
   * the figure's labels — never used as a substitute, only kept out of the fresh ones. A figure letter is no
   * neutral stand-in: a rule that names a new point («…בנקודה M») falls back to its own default name when the
   * student's letter is taken, which can coincide with the original and read as "unchanged" (measured on
   * «אלכסוני הריבוע נפגשים בנקודה M»).
   */
  figureLabels?: readonly string[];
  /** a builder's own occurrence-level exemption (2-D: a scene name its label accountant already reads as context) */
  exempt?(occ: Occurrence): boolean;
}

const DEFAULT_RUN = /(?<![A-Za-z])(?:[A-Z]\d*)+(?![A-Za-z])/g;
const DEFAULT_LABEL = /[A-Z]\d*/g;
/** Fresh letters, the last resort; S is left out (it is the area marker in every builder). */
const FRESH = 'QZXWVUTRPNMKJHGY'.split('');

const globalOf = (re: RegExp): RegExp => (re.flags.includes('g') ? new RegExp(re.source, re.flags) : new RegExp(re.source, re.flags + 'g'));

/** The label runs of a line, located. */
export function labelRuns(text: string, run: RegExp = DEFAULT_RUN, label: RegExp = DEFAULT_LABEL): Occurrence[] {
  return [...text.matchAll(globalOf(run))].map((m) => ({
    text: m[0],
    at: m.index!,
    end: m.index! + m[0].length,
    parts: m[0].match(globalOf(label)) ?? [],
  }));
}

/**
 * Which label runs does the reading READ? Every run of the line, as `read` (the reading depends on it), `unread`
 * (it does not), or `exempt` (it does not, and an exemption says it need not: a co-reference or the builder's own).
 */
export function readLabelRuns<L>(text: string, lowering: L, probe: LabelProbe<L>): RunReading {
  const runs = labelRuns(text, probe.run, probe.label);
  const own = [...new Set(runs.flatMap((o) => o.parts))];
  const figure = [...new Set(probe.figureLabels ?? [])];
  const taken = new Set([...own, ...figure]);
  const fresh = FRESH.filter((x) => !taken.has(x));
  const isRead = runs.map((o) => {
    const spare = own.find((x) => !o.parts.includes(x)) ?? fresh[0];
    if (spare === undefined) return true; // nothing to substitute: no evidence of a drop
    return o.parts.some((_, i) => {
      const parts = [...o.parts];
      parts[i] = spare;
      const r = probe.read(text.slice(0, o.at) + parts.join('') + text.slice(o.end));
      return r === null || !probe.same(r, lowering);
    });
  });
  const read: Occurrence[] = [];
  const unread: Occurrence[] = [];
  const exempt: Occurrence[] = [];
  runs.forEach((o, i) => {
    if (isRead[i]) return void read.push(o);
    // a CO-REFERENCE: a single letter the line also reads as a single-letter run elsewhere
    const coRef = o.parts.length === 1 && runs.some((p, j) => j !== i && isRead[j] && p.parts.length === 1 && p.parts[0] === o.parts[0]);
    if (coRef || probe.exempt?.(o)) return void exempt.push(o);
    unread.push(o);
  });
  return { read, unread, exempt };
}

/** A line's label runs, by whether the reading depends on them. */
export interface RunReading {
  readonly read: readonly Occurrence[];
  readonly unread: readonly Occurrence[];
  /** not read, and need not be (a co-reference, a builder's exemption) — neither evidence of a drop nor of a reading */
  readonly exempt: readonly Occurrence[];
}

/** A clause of the line, located. */
export interface Located {
  readonly text: string;
  readonly at: number;
  readonly end: number;
}

/** Locate a splitter's clauses (trimmed substrings, in order) in the line. A clause not found as typed is placed at the cursor. */
export function locate(text: string, clauses: readonly string[]): Located[] {
  let cursor = 0;
  return clauses.map((c) => {
    const at = text.indexOf(c, cursor);
    const start = at >= 0 ? at : cursor;
    cursor = start + c.length;
    return { text: c, at: start, end: start + c.length };
  });
}

/** One clause cut where its reading stops: the part that was read, and the tail that was not. */
export interface Cut<L> {
  /** index of the READ part in {@link PartsCut.parts}; the tail is the next part */
  readonly part: number;
  /** what the read part lowers to (the clause's own lowering) */
  readonly lowering: L;
  /** the unread tail, as typed (trimmed of spaces only) */
  readonly tail: string;
}

export interface PartsCut<L> {
  /** the line's parts in the student's words, in order */
  readonly parts: string[];
  /** the parts the reading lost: an unread tail, or a clause none of whose labels was read */
  readonly lost: string[];
  /** every clause that was cut where its reading stops */
  readonly cuts: Cut<L>[];
}

/** The shortest word-boundary prefix of `clause` that ends at or after `from`, at or before `to`, and reads as `lowering`. */
function readingPrefix<L>(clause: string, lowering: L, reader: Reader<L>, from: number, to: number): string | null {
  for (const m of clause.matchAll(/\s+/g)) {
    const end = m.index!;
    if (end < from) continue;
    if (end > to) break;
    const prefix = clause.slice(0, end);
    const r = reader.read(prefix);
    if (r !== null && reader.same(r, lowering)) return prefix;
  }
  return null;
}

/**
 * The parts of a line that lost something, in the student's words — or null when an unread occurrence
 * sits INSIDE a statement (read labels after it), or no cut reproduces the reading. Null is "no parts to
 * show", never "nothing was lost".
 *
 * A clause with an unread tail is cut where its reading stops, read alone in the context a one-per-line
 * student would have. A splitter cuts liberally, so a statement can arrive in two clauses («האלכסונים AC» ·
 * «BD נפגשים בנקודה E שהיא אמצע BD»): when the clause alone has no cut, it is read together with the clauses
 * before it, as typed, back to the first one that lost nothing of its own.
 *
 * @param text the line
 * @param clauses the line's clauses, located ({@link locate})
 * @param readerFor the reader for a span starting at clause `i`, in the context a one-per-line student would
 *   have there (the figure plus the clauses before it)
 */
export function cutAtReading<L>(
  text: string,
  clauses: readonly Located[],
  occ: RunReading,
  readerFor: (clause: number) => Reader<L>,
): PartsCut<L> | null {
  const parts: string[] = [];
  /** for each part, the clause it is (a clause that lost nothing), or -1 */
  const plain: number[] = [];
  const lost: string[] = [];
  const cuts: Cut<L>[] = [];
  const within = (from: number, to: number) => (o: Occurrence) => o.at >= from && o.end <= to;
  for (const [i, c] of clauses.entries()) {
    const unread = occ.unread.filter(within(c.at, c.end));
    if (unread.length === 0) {
      parts.push(c.text);
      plain.push(i);
      continue;
    }
    if (occ.read.filter(within(c.at, c.end)).length === 0 && readerFor(i).read(c.text) !== null) {
      // nothing of this clause was read, and it is a statement of its own: the whole clause is the lost part.
      // (One that does not read alone — «ואת AB» — is a fragment of the statement before it: cut below.)
      parts.push(c.text);
      plain.push(-1);
      lost.push(c.text);
      continue;
    }
    let done = false;
    for (let j = i; j >= 0 && !done; j--) {
      if (j < i && plain[plain.length - (i - j)] !== j) break; // only clauses that lost nothing are read with it
      const from = clauses[j].at;
      const span = text.slice(from, c.end);
      const read = occ.read.filter(within(from, c.end));
      const lastRead = Math.max(...read.map((o) => o.end)) - from;
      const firstUnread = Math.min(...occ.unread.filter(within(from, c.end)).map((o) => o.at)) - from;
      if (firstUnread < lastRead) return null; // a lost operand inside the statement, not a lost part
      const reader = readerFor(j);
      const lowering = reader.read(span);
      if (lowering === null) continue;
      const prefix = readingPrefix(span, lowering, reader, lastRead, firstUnread);
      if (prefix === null) continue;
      const tail = span.slice(prefix.length).trim();
      parts.splice(parts.length - (i - j));
      plain.splice(plain.length - (i - j));
      cuts.push({ part: parts.length, lowering, tail });
      parts.push(prefix.trim(), tail);
      plain.push(-1, -1);
      lost.push(tail);
      done = true;
    }
    if (!done) return null;
  }
  // a list of one part is no split to show: the caller keeps its own path
  return lost.length && parts.length > 1 ? { parts, lost, cuts } : null;
}

/**
 * THE WORD CLASS (#1904, ADR-604) — a ROLE WORD the reading never read.
 *
 * «AD גובה לצלע BC שהוא גם תיכון» lowers to the median alone: every LABEL is read, so the label probe sees
 * nothing, but the altitude is gone. A word is not substituted (a sibling role word lets a higher-priority
 * rule win, which reads as "changed"); it is DELETED, with its clitics: **an occurrence is read when deleting
 * it changes the lowering or fails the read.** Co-reference: the same word stated twice («…תיכון … שהוא גם
 * תיכון»), where deleting every one of them changes the lowering, is exempt.
 *
 * @param word a global pattern for one occurrence: its whole match is the span deleted (clitics included), its
 *   group 1 the word itself
 * @param classOf the co-reference class of a word (default: the word, lower-cased) — a builder maps its spellings
 *   of one role («גובה», «altitude») to one class
 */
export function readWords<L>(text: string, lowering: L, reader: Reader<L>, word: RegExp, classOf: (w: string) => string = (w) => w.toLowerCase()): RunReading {
  const occ: Occurrence[] = [...text.matchAll(globalOf(word))].map((m) => ({
    text: m[0].trim(),
    at: m.index! + (m[0].length - m[0].trimStart().length),
    end: m.index! + m[0].trimEnd().length,
    parts: [classOf((m[1] ?? m[0]).trim())],
  }));
  const without = (spans: readonly Occurrence[]): string => {
    let out = text;
    for (const s of [...spans].sort((a, b) => b.at - a.at)) out = `${out.slice(0, s.at)} ${out.slice(s.end)}`;
    return out.replace(/\s{2,}/g, ' ').trim();
  };
  const changes = (spans: readonly Occurrence[]): boolean => {
    const r = reader.read(without(spans));
    return r === null || !reader.same(r, lowering);
  };
  const read: Occurrence[] = [];
  const unread: Occurrence[] = [];
  const exempt: Occurrence[] = [];
  for (const o of occ) {
    if (changes([o])) read.push(o);
    else {
      const twins = occ.filter((p) => p.parts[0] === o.parts[0]);
      (twins.length > 1 && changes(twins) ? exempt : unread).push(o);
    }
  }
  return { read, unread, exempt };
}
