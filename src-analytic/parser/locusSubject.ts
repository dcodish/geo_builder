/**
 * A LOCUS SUBJECT THAT IS A DESCRIPTION, NOT A LETTER (#2620 B, ADR-AG-370).
 *
 * The book asks «מצא את המקום הגיאומטרי של כל הנקודות שמרחקן מ-A …» and «… של מפגש הישרים l1 ו-l2». The set-former
 * (#2393 R10, ADR-AG-316) needs a letter the figure has («כל הנקודות M המקיימות S»); here the subject is DEFINED by a
 * sentence, so `LOCUS_OF` used to hand the whole description to `objectById` as a point's name, and the student read
 * «אין בשרטוט נקודה בשם כל הנקודות ש…».
 *
 * This module only REWRITES: the description becomes the sentences the construction lane already reads, about a helper
 * letter the figure lacks. The ask lane folds them onto a TRIAL derivation (02c R24, discarded after) and answers
 * «המקום הגיאומטרי של <helper>» there, exactly as R10 does. The helper never reaches the student: the locus row prints
 * the curve's kind and equation, never the letter, and the trial is never kept.
 *
 * Two families, each ENUMERATED (the #1301 anti-widening rule, never `.*`):
 * - «כל הנקודות ש<clause>» / "all the points whose …": the clause's plural anaphors («מרחקן», «מרחקיהן», «מהן»,
 *   «שלהן» …) rewritten onto the helper by {@link ANAPHORS}. A clause with no anaphor from the table is not rewritten:
 *   it does not say which point it describes, and the lane does not guess.
 * - «(נקודת) מפגש / חיתוך …» of two lines, each a line's name or a described line («הישר העובר דרך A והמאונך לציר ה-x»,
 *   the construction register's own relative clause, `scopeAnalytic.predicate`): «<helper> נקודת החיתוך של L1 עם L2».
 *   A described line takes a helper line name (`דרך A עובר ישר <name> …`, the register's named-line sentence) because
 *   the crossing sentence reads names.
 */
import { predicate } from './scopeAnalytic';

/** What the subject is, as the trial's extra lines, and the helper letter whose locus answers the question. */
export interface DescribedSubject {
  /** The sentences appended to the figure's lines for the trial — the helper's definition. */
  lines: string[];
  /** The helper point's letter: free in the figure and absent from the question. */
  letter: string;
  /** Every helper name minted (the point, and any line), so a refusal's detail can be checked for them. */
  helpers: string[];
  /** The lettered question the trial answers — «המקום הגיאומטרי של <helper>». */
  question: string;
}

const done = (lines: string[], letter: string, helpers: string[]): DescribedSubject => ({
  lines,
  letter,
  helpers,
  question: `המקום הגיאומטרי של ${letter}`,
});

/** The helper point's letters, in order of preference: the letters a book least often uses first. */
const POINT_HELPERS = 'XYZWVUTSRQKJ'.split('');
/** The helper line names: the parser's `FREE_LINE_NAME` (`l` and one digit), from the top. */
const LINE_HELPERS = ['l9', 'l8', 'l7', 'l6', 'l5', 'l4', 'l3', 'l2', 'l1', 'l0'];

/**
 * The Hebrew plural anaphors of a clause about «כל הנקודות», and what each says about ONE point X. `def` marks a
 * replacement that opens with the article, so a proclitic «ל» / «ב» absorbs it («למרחקן» → «למרחק של X», as Hebrew
 * writes it) and «מ» / «ו» keep it («ממרחקן» → «מהמרחק של X»).
 */
const ANAPHORS: ReadonlyArray<{ re: string; to: (x: string) => string; def?: boolean }> = [
  { re: 'מרחקן|מרחקם', to: (x) => `המרחק של ${x}`, def: true },
  { re: 'מרחקיהן|מרחקיהם', to: (x) => `המרחקים של ${x}`, def: true },
  { re: 'שלהן|שלהם', to: (x) => `של ${x}` },
  { re: 'מהן|מהם', to: (x) => `מ-${x}` },
];
/** The proclitics an anaphor may carry: «ו», then one of «מ» / «ל» / «ב». */
const PROCLITIC = '(ו?(?:מ|ל|ב)?)';

/** «כל הנקודות ש…», «הנקודות אשר …», «כל הנקודות במישור ש…» — the relative clause after the plural noun. */
const SET_HE = /^(?:כל\s+)?ה?נקודות(?:\s+במישור)?\s+(?:אשר\s+|ש)(.+)$/;
/** "all the points whose distance …" — the English possessive relative; "their" inside it. */
const SET_EN = /^(?:all\s+)?(?:the\s+)?points\s+whose\s+(.+)$/i;

/** A line by its name: `l`, `l1`, `ℓ2`, a two-point line «AB», or an axis. */
const LINE_NAME = String.raw`(?:[ℓl][0-9]?|[A-Z][0-9₀-₉]?[A-Z][0-9₀-₉]?|ציר\s+ה-?[xy])`;
const LINE_BY_NAME = new RegExp(String.raw`^(?:ה?ישר\s+)?(${LINE_NAME})$`);
/** «הישר העובר דרך (הנקודה) A והמאונך לציר ה-x» / «ישר שעובר דרך A ומקביל ל-…»: its anchor and its relative clause. */
const LINE_DESCRIBED = /^ה?ישר\s+(?:ה|ש)עובר\s+דרך\s+(?:ה?נקודה\s+)?([A-Z][0-9₀-₉]?)\s*,?\s+(.+)$/;
/** The described line's clause must open with a participle — «(ו)המאונך», «(ו)שמקביל», «ומאונך» — or it is not one. */
const CLAUSE_HEAD = /^ו?(?:ה|ש)?(?:מקביל|מקבילה|מאונך|מאונכת|חותך|חותכת|משיק|משיקה)(?:\s|$)/;

/** «(נקודת) (ה)מפגש / (ה)חיתוך (של) …» — the meet of two lines. */
const MEET_HE = /^(?:ה?נקודת\s+)?ה?(?:מפגש|חיתוך)\s+(?:של\s+)?(.+)$/;
/** «הישרים L1 ו-L2», «L1 ו-L2». */
const MEET_PAIR = new RegExp(String.raw`^(?:ה?ישרים\s+)?(${LINE_NAME})\s+ו-?\s*(${LINE_NAME})$`);
/** «בין L1 לבין L2» / «בין L1 ל-L2». */
const MEET_BETWEEN = /^בין\s+(.+?)\s+(?:לבין\s+|ל-?)(.+)$/;
/** "the intersection (point) of (the) lines l1 and l2", "the meeting point of l1 and l2". */
const MEET_EN = new RegExp(
  String.raw`^(?:the\s+)?(?:intersection|meeting)(?:\s+point)?\s+of\s+(?:the\s+)?(?:lines\s+)?(?:line\s+)?([ℓl][0-9]?|[A-Z][0-9]?[A-Z][0-9]?)\s+and\s+(?:the\s+)?(?:line\s+)?([ℓl][0-9]?|[A-Z][0-9]?[A-Z][0-9]?)$`,
  'i',
);

/**
 * Does the subject open as one of the two families, whatever follows? A description the tables cannot read is then
 * UNREAD (the lane's «לא הבנתי»), never a point named by the whole phrase.
 */
export const opensAsDescription = (subject: string): boolean =>
  SET_HE.test(subject) || SET_EN.test(subject) || MEET_HE.test(subject) || /^(?:the\s+)?(?:intersection|meeting)\b/i.test(subject);

/** Is `name` a whole token of `text`? */
const hasToken = (text: string, name: string): boolean =>
  new RegExp(`(?<![A-Za-zℓ0-9_₀-₉])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_₀-₉])`).test(text);

/**
 * Read a locus subject as a description, or null when it is not one of the enumerated families. `taken(name)` says
 * whether the figure already uses a name; a helper is also never a token of the question itself.
 */
export function describedSubject(subject: string, taken: (name: string) => boolean): DescribedSubject | null {
  const s = subject.trim().replace(/[?.!]+$/, '').trim();
  const free = (pool: readonly string[], also: readonly string[] = []) =>
    pool.find((n) => !taken(n) && !hasToken(s, n) && !also.includes(n)) ?? null;
  const x = free(POINT_HELPERS);
  if (!x) return null;

  // --- the set: «כל הנקודות ש<clause>» ---
  const he = SET_HE.exec(s);
  if (he) {
    let hit = false;
    let clause = he[1].trim();
    for (const a of ANAPHORS) {
      clause = clause.replace(new RegExp(`(?<![א-ת])${PROCLITIC}(${a.re})(?![א-ת])`, 'g'), (_m, pre: string) => {
        hit = true;
        const to = a.to(x);
        return a.def && /[לב]$/.test(pre) ? pre + to.slice(1) : pre + to;
      });
    }
    return hit ? done([`נקודה ${x}`, clause], x, [x]) : null;
  }
  const en = SET_EN.exec(s);
  if (en) {
    const clause = `the ${en[1].trim()}`
      .replace(/^the\s+(distance)\s+/i, `the $1 of ${x} `)
      .replace(/\btheir\s+distance\b/gi, `the distance of ${x}`);
    return clause.includes(` ${x} `) ? done([`point ${x}`, clause], x, [x]) : null;
  }

  // --- the meet of two lines ---
  const meetEn = MEET_EN.exec(s);
  if (meetEn) return done([`${x} is the intersection of ${meetEn[1]} and ${meetEn[2]}`], x, [x]);
  const meet = MEET_HE.exec(s);
  if (!meet) return null;
  const rest = meet[1].trim();
  const pair = MEET_PAIR.exec(rest);
  const between = pair ? null : MEET_BETWEEN.exec(rest);
  const split = pair ? null : between ? [between[1], between[2]] : rest.split(/\s+עם\s+/);
  const refs = pair ? [pair[1], pair[2]] : split;
  if (!refs || refs.length !== 2) return null;

  const helpers = [x];
  const lines: string[] = [];
  const names: string[] = [];
  for (const ref of refs) {
    const r = ref.trim();
    const byName = LINE_BY_NAME.exec(r);
    if (byName) {
      names.push(byName[1]);
      continue;
    }
    const d = LINE_DESCRIBED.exec(r);
    if (!d || !CLAUSE_HEAD.test(d[2])) return null;
    const h = free(LINE_HELPERS, helpers);
    if (!h) return null;
    helpers.push(h);
    lines.push(`דרך ${d[1]} עובר ישר ${h} ${predicate(d[2].replace(/^ו/, ''))}`);
    names.push(h);
  }
  lines.push(`${x} נקודת החיתוך של ${names[0]} עם ${names[1]}`);
  return done(lines, x, helpers);
}
