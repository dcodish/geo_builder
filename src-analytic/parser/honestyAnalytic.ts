/**
 * THE ANALYTIC TOOL'S HONESTY GATES ON THE LLM SEAM (#1356).
 *
 * The fallback ([#1251](https://github.com/dcodish/geo_builder/issues/1251)) shipped with the
 * deterministic re-parse as its only protection. That proves each returned line is *well-formed*; it
 * proves nothing about whether the decomposition still **says what the student said**. Both siblings
 * learned that the hard way and carry a battery of gates for it (`src/app/submitPipeline.ts`,
 * `src3d/parser/honesty3.ts`); this file is where analytic's live.
 *
 * It starts with the **sequence gate**, which is the one with a live case already: the model renamed
 * this product's own «ישר 1» to `l1`, and the student was then refused when they referred to their
 * line by the name they gave it ([#1297](https://github.com/dcodish/geo_builder/issues/1297)).
 *
 * Then the **faithfulness gates** ([#1355](https://github.com/dcodish/geo_builder/issues/1355),
 * [ADR-AG-279](../../docs/06c-decisions-analytic.md#adr-ag-279)), chosen from the 55 logged model answers:
 * a stated NAME the answer never mentions, a stated NUMBER nothing in it accounts for, and a name the answer
 * WRITES that nobody stated. The algebra is `shell/llm/honestyCore.ts`; what a name and a number ARE in this
 * product is below, read with the grammar's own atoms. Not built, with the reason (no evidence, or false
 * positives on the logged answers): a word-relation gate, a pair-relation symbol gate, an equation-identity
 * gate, an invented-number gate (ADR-AG-279 "Not built").
 */
import { restoreStatedSequences as restoreStatedSequencesShared } from '../../shell/llm/sequenceGate';
import { nameAccounting, scanNumbers, spendAccounts, unionByMax, LATIN_FILLER, type NumberOccurrence } from '../../shell/llm/honestyCore';
import { LETTER_LINE_NAME_ATOM, POINT_NAME_ATOM, parseLine } from './parseAnalytic';
import { HE_NUM_UNITS } from './frameAnalytic';
import { NUMERAL_ALT, asRoman, numeralKey } from '../engine/names';
import type { Construction } from '../engine/types';

/**
 * A point label in this product: a capital letter with an optional digit subscript — `A`, `B`, `F1`.
 * Exactly what the system prompt tells the model to emit, so the two cannot drift apart silently.
 */
const LABEL = () => /[A-Z]\d*/g;
const RUN = () => /(?<![A-Za-z])(?:[A-Z]\d*){3,}(?![a-z\d])/g;

/**
 * Restore any point run the model respelled, before the lines are re-parsed.
 *
 * The algorithm is `shell/llm/sequenceGate.ts`, shared with 2-D and 3-D (#1358: this would have been
 * the third copy). Analytic supplies the least of the three: its labels carry no primes, and it needs
 * neither an utterance normaliser nor a length-preserving line mask — so `prepareLine` is the identity
 * and a line the gate does not rewrite comes back byte-for-byte.
 */
export function restoreStatedSequencesAnalytic(
  utterance: string,
  lines: string[],
): { lines: string[]; restored: string[] } {
  return restoreStatedSequencesShared(utterance, lines, {
    label: LABEL,
    run: RUN,
    normalizeUtterance: (s) => s,
    prepareLine: (line) => ({ match: line, emit: line }),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// THE FAITHFULNESS GATES (#1355, ADR-AG-279)
// ---------------------------------------------------------------------------------------------------------------

/** One name as the gates compare it (`key`) and as it was typed (`shown`, for the refusal). */
interface NameToken {
  key: string;
  shown: string;
  /** `symbol` is a lowercase parameter or measure letter: stated side only (a model's letter there is a DOF, ADR-052). */
  kind: 'point' | 'line' | 'numeral' | 'symbol';
}

/** The same normalisation on both sides: subscript digits, the script ℓ, superscripts, the minus sign. */
function normalise(text: string): string {
  return text
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .replace(/ℓ/g, 'l')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/[−–]/g, '-');
}

const HEBREW = /[א-ת]/;
/**
 * A curve NAMED BY A NUMERAL — «ישר 1», «המעגל I», "line 2" (#1298, ADR-AG-144). The numeral is a NAME, never a
 * magnitude, and «1» and «I» are one name (ruling 2026-09-29), so the key is the Roman spelling. The separator
 * lookahead is the grammar's own (#1059): «הישר 2x-y+8=0» opens with a coefficient, not a name.
 */
const NUMERAL_NAME = (): RegExp =>
  new RegExp(`(?:ישר|קו|מעגל|פרבולה|אליפסה|line|circle|parabola|ellipse)\\s+(${NUMERAL_ALT})(?=[\\s:,.;)]|$)`, 'g');
/**
 * The same name spelled as a WORD — «ישר שלוש» (#1350's own test sentence): the student's numeral, so a model
 * answer writing «ישר 3» names the student's curve, not a new one. The frame's number-word table (1–9).
 */
const NUMERAL_WORD = (): RegExp =>
  new RegExp(`(?:ישר|קו|מעגל|פרבולה|אליפסה)\\s+(${Object.keys(HE_NUM_UNITS).sort((a, b) => b.length - a.length).join('|')})(?![\u05D0-\u05EA])`, 'g');
/** The grammar's point atom, with its subscript widened to any digit run once `normalise` folded ₁ to 1. */
const POINT_ATOM = POINT_NAME_ATOM.replace('[0-9₀-₉]?', '[0-9]*');
const POINT_RUN = new RegExp(`^(?:${POINT_ATOM})+$`);
const POINT_ONE = (): RegExp => new RegExp(POINT_ATOM, 'g');
const LETTER_LINE = new RegExp(`^${LETTER_LINE_NAME_ATOM}$`);
const MATH_CHAR = /[=+\-*/^()0-9√·<>]/;

/**
 * The PLURAL twin — «הישרים 1 ו-2», «המעגלים I ו-II», "lines 1 and 2": every numeral of the list is a name.
 * Without it the two numerals read as magnitudes, and an answer that names «הישר 1 והישר 2» reads as having
 * dropped the numbers 1 and 2.
 */
const NUMERAL_LIST = (): RegExp =>
  new RegExp(
    `(?:ישרים|קווים|מעגלים|פרבולות|אליפסות|lines|circles|parabolas|ellipses)\\s+(?:${NUMERAL_ALT})(?:\\s*(?:,|ו\\s*-?|and)\\s*(?:${NUMERAL_ALT}))+(?=[\\s:,.;)]|$)`,
    'g',
  );
const NUMERAL_IN_LIST = (): RegExp => new RegExp(`(?<![A-Za-z0-9])(?:${NUMERAL_ALT})(?![A-Za-z0-9])`, 'g');

/** Blank a numeral name's NUMERAL, keeping its noun (so positions survive). */
const blankNumeral = (m: string, n: string): string => m.slice(0, m.length - n.length) + ' '.repeat(n.length);

/** Every numeral NAME in `t` (singular and plural forms), reported to `seen` and blanked from the text. */
function takeNumeralNames(t: string, seen?: (key: string, shown: string) => void): string {
  const lists = t.replace(NUMERAL_LIST(), (m: string) => {
    const noun = /^\S+/.exec(m)?.[0] ?? '';
    return noun + m.slice(noun.length).replace(NUMERAL_IN_LIST(), (n: string) => {
      seen?.(`#${asRoman(n)}`, n);
      return ' '.repeat(n.length);
    });
  });
  const words = lists.replace(NUMERAL_WORD(), (m: string, w: string) => {
    seen?.(`#${asRoman(String(HE_NUM_UNITS[w]))}`, m.trim());
    return m;
  });
  return words.replace(NUMERAL_NAME(), (m: string, n: string) => {
    seen?.(`#${asRoman(n)}`, m.trim());
    return blankNumeral(m, n);
  });
}

/**
 * Every name `raw` states, in order, read the way the grammar reads (the atoms above): a capital run is point
 * names (`ABC` → A, B, C; `F1`); `l` / `l1` is a line; a numeral after a curve noun is that curve; a single
 * lowercase letter is a parameter or measure letter, except x and y (the axes) and except an English function
 * word in Latin-script text (the article «a»). A juxtaposed run inside an equation (`2ax`, `mx`) gives its
 * letters other than x and y; any other lowercase run (`line`, `tan`, `slope`) is a word.
 */
function namesOf(raw: string): NameToken[] {
  let t = normalise(raw);
  const latin = !HEBREW.test(t);
  const out: NameToken[] = [];
  t = takeNumeralNames(t, (key, shown) => out.push({ key, shown, kind: 'numeral' }));
  for (const m of t.matchAll(/[A-Za-z0-9]+/g)) {
    const run = m[0];
    const at = m.index ?? 0;
    const letters = run.replace(/^\d+/, '');
    if (!letters) continue;
    if (POINT_RUN.test(letters)) {
      for (const p of letters.match(POINT_ONE()) ?? []) out.push({ key: p, shown: p, kind: 'point' });
      continue;
    }
    if (/[A-Z]/.test(letters)) continue; // a mixed-case run is a word («Given»)
    if (LETTER_LINE.test(letters)) {
      out.push({ key: letters, shown: letters, kind: 'line' });
      continue;
    }
    if (/^[a-z]\d?$/.test(letters)) {
      if (letters[0] === 'x' || letters[0] === 'y') continue;
      if (latin && LATIN_FILLER.has(letters)) continue;
      out.push({ key: letters, shown: letters, kind: 'symbol' });
      continue;
    }
    const before = t[at - 1] ?? '';
    const after = t[at + run.length] ?? '';
    const inEquation = letters !== run || MATH_CHAR.test(before) || MATH_CHAR.test(after);
    const bare = letters.replace(/\d/g, '');
    if (inEquation && /[xy]/.test(bare) && bare.length <= 3) {
      for (const c of bare) if (c !== 'x' && c !== 'y') out.push({ key: c, shown: c, kind: 'symbol' });
    }
  }
  return out;
}

/**
 * The spans that are NOT magnitudes, blanked before numbers are read: a numeral NAME (its numeral), a
 * letter-glued subscript (`F1`, `l2`, `x_1`), an exponent (`^2` is form, not magnitude), and a COUNT — a bare
 * integer before a plural noun, «2 משיקים» / "3 circles" (2-D #160: a count is consumed by structure).
 */
const NUMBER_BLANKS: readonly RegExp[] = [
  /(?<=[A-Za-z_])\d+/g,
  /\^\s*\(?\s*\d+(?:\.\d+)?\s*\)?/g,
  /\d+(?=\s+[א-ת]+(?:ים|ות)(?![א-ת]))/g,
  /\d+(?=\s+[a-z]+s\b)/g,
];
const numbersOf = (text: string): NumberOccurrence[] =>
  scanNumbers(takeNumeralNames(normalise(text)), NUMBER_BLANKS);

/** A line that states a right angle: the account for a stated 90 («∠ABC = 90» → «AB מאונכת ל-BC»). */
const PERPENDICULAR = /⊥|מאונ[ךכ]|ניצב|ישרה|perpendicular|right/i;

/** Every number and name a line's PARSED FACTS carry: the generous half of the accounting (2-D's payload walk). */
function factAccounts(line: string): { names: string[]; numbers: number[]; perp: boolean } {
  const r = parseLine(line);
  if (!r.ok) return { names: [], numbers: [], perp: false };
  const names: string[] = [];
  const numbers: number[] = [];
  const walk = (v: unknown, key: string): void => {
    if (key === 'src') return;
    if (typeof v === 'number') numbers.push(v);
    else if (typeof v === 'string') for (const n of namesOf(v.replace(/[-_]/g, ' '))) names.push(n.key);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      // An exponent is FORM, not magnitude (blanked from the text too): x^2 must not pay for a stated 2.
      const o = v as Record<string, unknown>;
      if (o.kind === 'pow') return walk(o.a, 'a');
      for (const [k, x] of Object.entries(o)) walk(x, k);
    }
  };
  walk(r.facts, '');
  return { names, numbers, perp: /perp|right/i.test(JSON.stringify(r.facts)) };
}

/**
 * The names the figure already holds, in the gates' key space: a point's letter, a letter line's name, a
 * numeral curve's numeral, a parameter's letter.
 */
export function existingNamesAnalytic(c: Pick<Construction, 'objects' | 'params'>): Set<string> {
  const out = new Set<string>();
  for (const o of c.objects) {
    if (/^[A-Z]\d*$/.test(o.id)) out.add(o.id);
    const num = numeralKey(o.id);
    if (num) out.add(`#${num.slice(num.indexOf('-') + 1)}`);
    const line = /^line-(.+)$/.exec(o.id);
    if (line && LETTER_LINE.test(normalise(line[1]))) out.add(normalise(line[1]));
  }
  for (const p of c.params) if (/^[a-z]\d?$/.test(p.sym)) out.add(p.sym);
  return out;
}

/** What {@link faithfulnessAnalytic} found. Each list is in the student's (or the model's) own spelling. */
export interface Faithfulness {
  /** Names the student stated that the answer never mentions, then numbers it never accounts for: as typed. */
  dropped: string[];
  /** Names the answer wrote that the student did not, and the figure does not hold. */
  invented: string[];
  /**
   * Names the answer wrote that the student did not, though the figure HOLDS them (#2225, ADR-AG-281): an
   * unstated relation pulled onto an existing point or line («ישר l» → «דרך P עובר ישר l»). As typed by the model,
   * which may be shown: the figure shows the name (ADR-W-096).
   */
  inventedExisting: string[];
}

/**
 * THE GATES, on one utterance and the model's whole answer (after the sequence gate). `existing` is the figure's
 * names before the answer ({@link existingNamesAnalytic}).
 *
 * 1. **Dropped name**: every stated name must appear in some model line or its parsed facts, case-blind,
 *    EXISTING names included. A text answer has no context to carry them (#34 dropped `l1`, and the crossing
 *    went with it).
 * 2. **Dropped number**: every stated number must be paid, as a multiset, by a model line's numbers or facts:
 *    the value itself, its square (a radius stated, r² in the equation), its square root, or, for 90, a line
 *    that states a right angle.
 * 3. **Invented name**: every point, line or numeral name the model WROTE must be stated or in the figure. Read
 *    off the text, so a name the grammar mints while lowering (P₁, a canonical centre) is never counted.
 * 4. **Invented existing name** (#2225, ADR-AG-281, operator ruling 2026-10-16): a name the model wrote that the
 *    student did not, though the figure holds it, is refused too — the model attached a relation to it that the
 *    sentence never stated (an existing P made «ישר l» pass through P, and pinned it).
 */
export function faithfulnessAnalytic(utterance: string, modelLines: readonly string[], existing: ReadonlySet<string>): Faithfulness {
  const stated = namesOf(utterance);
  const perLine = modelLines.map((l) => namesOf(l));
  const written = perLine.flat().filter((n) => n.kind !== 'symbol');
  const facts = modelLines.map(factAccounts);
  const shownOf = new Map<string, string>();
  for (const n of [...stated, ...written]) if (!shownOf.has(n.key)) shownOf.set(n.key, n.shown);
  const names = nameAccounting({
    stated: stated.map((n) => n.key),
    written: written.map((n) => n.key),
    accounted: [...perLine.flat().map((n) => n.key), ...facts.flatMap((f) => f.names)],
    existing,
  });

  // #2225: the same difference with the figure's names NOT exempt; what it adds is an existing name pulled in.
  const widened = nameAccounting({ stated: stated.map((n) => n.key), written: written.map((n) => n.key), existing, exemptExistingFromInvented: false });
  const newly = new Set(names.invented);
  const inventedExisting = widened.invented.filter((k) => !newly.has(k));

  const accounts: number[] = [];
  modelLines.forEach((line, i) => {
    accounts.push(...unionByMax(numbersOf(line).map((o) => o.value), facts[i].numbers));
    if (facts[i].perp || PERPENDICULAR.test(line)) accounts.push(90);
  });
  const droppedNumbers = spendAccounts(numbersOf(utterance), accounts, (o) => [o.value, o.value * o.value, Math.sqrt(o.value)]);

  return {
    dropped: [...names.dropped.map((k) => shownOf.get(k) ?? k), ...droppedNumbers.map((o) => o.raw)],
    invented: names.invented.map((k) => shownOf.get(k) ?? k),
    inventedExisting: inventedExisting.map((k) => shownOf.get(k) ?? k),
  };
}
