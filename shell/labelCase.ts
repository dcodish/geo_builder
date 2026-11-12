/**
 * #2823 ([ADR-W-208](../docs/06w-decisions-workspace.md#adr-w-208), the operator's ruling [ADR-W-203](../docs/06w-decisions-workspace.md#adr-w-203))
 * — A LOWERCASE POINT LABEL, READ ONCE FOR EVERY BUILDER.
 *
 * The operator, 2026-11-10: *"when a lowercase is used for a point, we should accept it if its for sure an upper case.
 * like נקודה j or משולש abc … where we are not sure, we ask user to use upper case. This would be for all tools"*; and
 * 2026-11-12 (#2823): a lowercase x, y or z after «נקודה» is accepted as the capital point too.
 *
 * The class this closes: each builder decided "is this lowercase letter a point?" with its own function and its own
 * anchors (2-D asked on every one, 3-D read a few anchors silently and kept the lowercase row, analytic taught one
 * spelling and sent the rest to the model, complex refused). This module is the one reading of the SLOT a letter sits
 * in. It reads only the text and the letters the figure already uses, never positions.
 *
 * - {@link certainLabelFold}: a line whose every lowercase label-run stands in a slot where only a point label can
 *   stand comes back with those runs in capitals. The caller submits THAT text, so the row shows the capital and every
 *   honesty gate downstream sees an uppercase label; the caller adds the notice ({@link LABEL_CASE_NOTICE}).
 * - {@link askCandidate}: everything else keeps the ask — every lowercase run lifted, and the caller proves the lifted
 *   line before it suggests it (2-D's lift, moved here unchanged, #779 / ADR-738).
 *
 * The certain slots (S1–S5, #2823's plan §3):
 *  S1 a point noun before a list of single labels — «נקודה j», «הנקודות a ו-b», «הקודקוד c», "point j";
 *  S2 a shape noun before its vertex run, of the noun's arity — «משולש abc», «ריבוע abcd», a caller's solids;
 *  S3 the subject of a midpoint sentence — «m אמצע AB», "m is the midpoint of AB";
 *  S4 an angle's vertex triple — «∠abc», «זווית sdb», "angle abc";
 *  S5 a coordinate head — «c(4,7)», «c(1,2,3)».
 * Never certain: a letter the figure already uses (`used`), an axis letter outside S1 and S3, a single letter after
 * the angle sign, and every unanchored run («d על AB», «ab = 5»). One uncertain run leaves the whole line to the ask.
 */
import { AND_HE, ANGLE_WORD_HE, CLITIC, GIVEN_HE, HE_LETTERS, LIST_JOINT, MID_COPULA_HE, MID_EN, MID_HE, POINT_NOUN_EN, POINT_NOUN_HE, SHAPES, SHAPE_MOD, SUBJECT_NOUN_HE } from './lexicon/labelSlots';
export { MID_COPULA_HE, MID_EN, MID_HE } from './lexicon/labelSlots';

/** The notice an accepted, capitalised line carries (one suite key, every builder). */
export const LABEL_CASE_NOTICE = 'suite.notice.labelCase';
/** The ask: the line is not taken, and the capitalised line is suggested (2-D's sentence, every builder). */
export const LABEL_CASE_ASK = 'suite.refusal.lowercaseLabels';

export interface LabelCaseOptions {
  /** Lowercase names the figure already gives another meaning: a parameter, a line, a vector, a measure, a complex number. */
  readonly used?: ReadonlySet<string>;
  /** The product's axis letters — folded only after a point noun (S1) or as a midpoint's subject (S3). */
  readonly axes?: readonly string[];
  /** The product's SOLID nouns (a regex source), whose vertex run is any arity from three up (3-D). */
  readonly solidNouns?: string;
}

export interface LabelFold {
  /** the line with every certain run in capitals — the text to submit, store and show */
  readonly text: string;
  /** the labels written in capitals, in order */
  readonly folded: readonly string[];
}


const HEB = /[א-ת]/;
const PRIME = `['’′″]`;
/** one label: a letter, then digits or subscripts, then primes */
const TOK = String.raw`[A-Za-z][0-9₀-₉]*${PRIME}*`;
const TOK_G = () => new RegExp(TOK, 'g');
/** the end of a run: no letter, digit or prime follows */
const END = String.raw`(?![A-Za-z0-9₀-₉'’′″])`;
/** the start of a word: not inside a Latin run or a Hebrew word */
const START = String.raw`(?<![A-Za-z0-9₀-₉'’′″${HE_LETTERS}])`;
/** a maximal Latin run with a lowercase letter */
const RUN_G = () => new RegExp(String.raw`${START}(?=[A-Za-z0-9₀-₉'’′″]*[a-z])[A-Za-z][A-Za-z0-9₀-₉'’′″]*`, 'g');

/** Latin words that are never a label: units and function names. */
const NOTATION = new Set(['cm', 'mm', 'km', 'sin', 'cos', 'tan', 'tg', 'ctg', 'cot', 'cotg', 'log', 'ln', 'sqrt', 'exp', 'abs', 'arg', 'cis', 'deg', 'rad', 'im', 're']);
/** English function words — never a label in Latin-only text (2-D's FILLER set and 3-D's EN_STOP, joined). */
const EN_STOP = new Set(['a', 'an', 'to', 'the', 'and', 'of', 'is', 'are', 'at', 'on', 'in', 'with', 'from', 'that', 'so', 'such', 'for', 'its', 'was', 'has', 'had', 'be', 'by', 'no', 'not', 'it', 'all', 'any', 'one', 'two', 'six', 'ten', 'how', 'why', 'who', 'what', 'side', 'root', 'each', 'both', 'then', 'than', 'this', 'into', 'onto', 'over', 'some', 'have', 'were', 'draw', 'show', 'let', 'say', 'as', 'or', 'if', 'we', 'us', 'he', 'she']);
/**
 * English words a shape noun is often followed by, used as a noun adjunct ("a kite base", "the square root"): never
 * the vertex run of S2 or S4, though their letters are as many as the noun's vertices.
 */
const EN_FIGURE_WORDS = new Set(['base', 'bases', 'side', 'sides', 'edge', 'edges', 'face', 'faces', 'apex', 'area', 'root', 'line', 'lines', 'legs', 'arcs', 'half', 'axis', 'plane', 'shape', 'angle', 'point', 'whose', 'where', 'which', 'height', 'inside', 'center', 'centre', 'corner', 'vertex', 'number', 'pyramid', 'prism']);

/** A run the ask may lift (2-D's rule): every run in Hebrew text, a short non-function word in Latin text. */
const liftable = (run: string, heb: boolean): boolean => {
  const low = run.toLowerCase();
  if (low === 'cm' || low === 'mm') return false;
  return heb || !(EN_STOP_FILLER.has(low) || run.replace(/\d/g, '').length > 4);
};
/** 2-D's English filler set exactly (the lift is moved unchanged). */
const EN_STOP_FILLER = new Set(['a', 'an', 'to', 'the', 'and', 'of', 'is', 'are', 'at', 'on', 'in', 'with', 'from', 'that', 'so', 'such']);

/**
 * #779 / #2195 — the ASK's candidate: the line with every liftable lowercase run in capitals, or null when there is
 * none. Hebrew text lifts every standalone run, singles included; Latin text lifts non-filler runs of at most four
 * letters. `keep` leaves a run as typed (an axis, a used name, a coefficient). Lifted from the RAW text: the
 * candidate is re-parsed by the caller and SHOWN, so it reads as the student typed it, case aside.
 */
export function askCandidate(utterance: string, keep: (run: string) => boolean = () => false): string | null {
  const heb = HEB.test(utterance);
  let changed = false;
  const out = utterance.replace(/(?<![A-Za-z\d])(?=[A-Za-z]*[a-z])[A-Za-z][A-Za-z\d]*(?![A-Za-z\d])/g, (run) => {
    if (!liftable(run, heb) || keep(run)) return run;
    changed = true;
    return run.toUpperCase();
  });
  return changed ? out : null;
}

/** The runs {@link askCandidate} lifts. */
export function liftedRuns(utterance: string, keep: (run: string) => boolean = () => false): string[] {
  const heb = HEB.test(utterance);
  return (utterance.match(/(?<![A-Za-z\d])(?=[A-Za-z]*[a-z])[A-Za-z][A-Za-z\d]*(?![A-Za-z\d])/g) ?? []).filter((run) => liftable(run, heb) && !keep(run));
}

// ---------------------------------------------------------------------------------------------------------------------
// The certain slots (the words are `shell/lexicon/labelSlots`)
// ---------------------------------------------------------------------------------------------------------------------

/** a list of single labels: «a», «a ו-b», «a, b ו-c», "a and b" */
const LIST = String.raw`${TOK}${END}(?:\s*${LIST_JOINT}\s*${TOK}${END})*`;
const MID_FRAME_HE = `${MID_COPULA_HE}${MID_HE}`;
const MID_FRAME_EN = String.raw`is\s+the\s+${MID_EN}\b`;

/** A run made only of axis letters right after «ציר», «ה-» or before "-axis" names an axis or a coordinate, not a point. */
const axisReference = (line: string, start: number, end: number, run: string, axes: readonly string[]): boolean => {
  if (![...run.toLowerCase()].every((ch) => axes.includes(ch))) return false;
  const before = line.slice(Math.max(0, start - 8), start);
  const after = line.slice(end, end + 6);
  return /(?:ציר(?:י)?\s*(?:ה-?)?|(?<![א-ת])ה-\s?|מישור\s+(?:ה-?)?)$/.test(before) || /^[- ]?(?:axis|axes|plane|coordinate)/i.test(after);
};

/** How many round brackets are open at `at`. */
const depthAt = (line: string, at: number): number => {
  let d = 0;
  for (let i = 0; i < at; i++) {
    if (line[i] === '(') d++;
    else if (line[i] === ')') d = Math.max(0, d - 1);
  }
  return d;
};

interface Slot {
  /** the regex: group 1 is the prefix, group 2 the run or list */
  readonly re: RegExp;
  /** how the run or list is checked */
  readonly kind: 'list' | 'single' | 'vertices';
  /** axis letters fold here (S1, S3) */
  readonly axesOk: boolean;
  /** the arity the vertex run must have (S2, S4), from the prefix */
  readonly arity?: (prefix: string) => number | null;
}

const shapeArity = (prefix: string): number | null => {
  const low = prefix.toLowerCase();
  let best: [number, number | null] | null = null;
  for (const [noun, n] of SHAPES) {
    const at = low.lastIndexOf(noun);
    if (at >= 0 && (!best || at > best[0])) best = [at, n];
  }
  return best ? best[1] : null;
};

function slots(opts: LabelCaseOptions): Slot[] {
  const he = SHAPES.filter(([n]) => HEB.test(n)).map(([n]) => n).join('|');
  const en = SHAPES.filter(([n]) => !HEB.test(n)).map(([n]) => n).join('|');
  const solid = opts.solidNouns ? `|${opts.solidNouns}` : '';
  return [
    // S1 — a point noun before single labels
    { re: new RegExp(String.raw`(${POINT_NOUN_HE}\s+|${POINT_NOUN_EN}\s+)(${LIST})`, 'g'), kind: 'list', axesOk: true },
    // S2 — a shape noun (with its modifiers) before its vertex run
    {
      re: new RegExp(String.raw`((?:${CLITIC}(?:${he}${solid})|\b(?:${en})\b)(?:\s+${SHAPE_MOD})*\s+)(${TOK}(?:${TOK})+)${END}`, 'gi'),
      kind: 'vertices',
      axesOk: false,
      arity: shapeArity, // a solid noun names no polygon: any arity from three up
    },
    // S3 — the subject of a midpoint sentence (the whole utterance; an axis is never a midpoint, #1594)
    { re: new RegExp(String.raw`(^\s*${SUBJECT_NOUN_HE})(${TOK})${END}(?=\s+${MID_FRAME_HE}\s)`, 'g'), kind: 'single', axesOk: true },
    { re: new RegExp(String.raw`(^\s*(?:[Tt]he\s+)?(?:[Pp]oint\s+)?)(${TOK})${END}(?=\s+${MID_FRAME_EN})`, 'g'), kind: 'single', axesOk: true },
    // S4 — an angle's vertex triple
    { re: new RegExp(String.raw`((?:[∠∡∢]\s*)|${ANGLE_WORD_HE}\s+|\b[Aa]ngle\s+)(${TOK}${TOK}${TOK})${END}`, 'g'), kind: 'vertices', axesOk: false, arity: () => 3 },
    // S5 — a coordinate head: at the start, after a comma or «ו», before a tuple
    { re: new RegExp(String.raw`((?:^\s*${GIVEN_HE})|[,;]\s*|${AND_HE}\s*)(${TOK})${END}(?=\s*\([^()]*,[^()]*\))`, 'g'), kind: 'single', axesOk: false },
  ];
}

/** Is `tok` a name the figure already uses, or (outside S1/S3) an axis? */
const blocked = (tok: string, axesOk: boolean, opts: LabelCaseOptions): boolean => {
  const low = tok.toLowerCase().replace(/['’′″]/g, '');
  const letter = low[0];
  const axis = (opts.axes ?? []).includes(low);
  if (axis) return !axesOk;
  const used = opts.used ?? new Set<string>();
  return used.has(low) || used.has(letter);
};

/**
 * The line with every lowercase label-run in capitals, when each one stands in a certain slot; otherwise null.
 * A line with no lowercase label-run is null too (there is nothing to say).
 */
export function certainLabelFold(line: string, opts: LabelCaseOptions = {}): LabelFold | null {
  const heb = HEB.test(line);
  const axes = opts.axes ?? [];
  // an English shape or solid noun is the slot's own word, never a label («box abcd», "kite abcd")
  const enNoun = new RegExp(`^(?:${SHAPES.filter(([n]) => !HEB.test(n)).map(([n]) => n).join('|')}${opts.solidNouns ? `|${opts.solidNouns}` : ''})$`, 'i');
  // the runs that must be accounted for: every lowercase Latin run that could be a label
  const runs: { start: number; end: number; run: string }[] = [];
  for (const m of line.matchAll(RUN_G())) {
    const run = m[0];
    const start = m.index ?? 0;
    const end = start + run.length;
    const low = run.toLowerCase();
    if (NOTATION.has(low)) continue;
    if (axisReference(line, start, end, run, axes)) continue;
    // inside brackets a lowercase letter is a value — a coordinate, a parameter («c(p²,0,1)», «(x-1)²») — never a label
    if (depthAt(line, start) > 0) continue;
    if (!heb && (EN_STOP.has(low) || enNoun.test(run) || run.replace(/[^A-Za-z]/g, '').length > 4)) continue;
    runs.push({ start, end, run });
  }
  // the certain spans: start → end, from every slot
  const certain = new Map<number, number>();
  for (const slot of slots(opts)) {
    for (const m of line.matchAll(slot.re)) {
      const at = (m.index ?? 0) + m[1].length;
      const body = m[2];
      const toks = [...body.matchAll(TOK_G())];
      if (slot.kind === 'vertices') {
        const want = slot.arity?.(m[1]) ?? null;
        if (want !== null ? toks.length !== want : toks.length < 3) continue;
        const letters = toks.map((t) => t[0].toUpperCase());
        if (new Set(letters).size !== letters.length) continue;
        if (!heb && (EN_STOP.has(body.toLowerCase()) || EN_FIGURE_WORDS.has(body.toLowerCase()))) continue;
        if (toks.some((t) => blocked(t[0], slot.axesOk, opts))) continue;
        certain.set(at, at + body.length);
      } else {
        for (const t of toks) {
          if (blocked(t[0], slot.axesOk, opts)) continue;
          const s = at + (t.index ?? 0);
          certain.set(s, s + t[0].length);
        }
      }
    }
  }
  if (!runs.every((r) => certain.get(r.start) === r.end)) return null;
  // what is written in capitals: every certain run — a function word in a slot too ("points a and b")
  const lift = [...line.matchAll(RUN_G())]
    .map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, run: m[0] }))
    .filter((r) => certain.get(r.start) === r.end);
  if (lift.length === 0) return null;
  const folded: string[] = [];
  let text = '';
  let last = 0;
  for (const r of lift) {
    text += line.slice(last, r.start) + r.run.toUpperCase();
    folded.push(...(r.run.toUpperCase().match(TOK_G()) ?? []));
    last = r.end;
  }
  text += line.slice(last);
  return { text, folded };
}

/**
 * The lowercase names a list of typed lines uses (analytic's and complex's reading, ADR-AG-423): an equation is read
 * whole («ax»), a word of a sentence («circle») is not a use of its letters. Returns single letters and indexed names.
 */
export function lowercaseNamesIn(lines: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const line of lines) {
    const text = line.includes('=') ? line : line.replace(/[A-Za-z]{3,}/g, ' ');
    for (const m of text.matchAll(/[a-z][0-9₀-₉]*/g)) {
      out.add(m[0]);
      out.add(m[0][0]);
    }
  }
  return out;
}

/**
 * The lowercase NAMES a figure's commands carry (2-D's and 3-D's reading): every string value shaped like a name — a
 * letter, then digits and primes — anywhere in the commands except their `type`. A measure's symbol, a variable, a
 * parameter, a vector's or a line's name all live there case-preserved; a point label is uppercase and never matches.
 */
export function lowercaseNamesInCommands(commands: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (/^[a-z][0-9]*'*$/.test(v)) out.add(v.replace(/'/g, '')).add(v[0]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'type') walk(x);
  };
  commands.forEach(walk);
  return out;
}
