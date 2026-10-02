/**
 * THE SENTENCE FRAME (#1618, slice A of #1616) — the one boundary every analytic rule reads.
 *
 * A 4-point bagrut question wraps its givens in a textbook frame: «נתון: A(2;10)», «ידוע כי …»,
 * «במלבן ABCD, …», «… (ראה ציור)», «MO = 8 ס"מ, ∢ACB = 72°», «הנקודה O היא ראשית הצירים»,
 * «טרפז ישר זווית ABCD (AB ∥ CD, AB ⊥ AD)». Measured over the 46 Q4/Q5 questions of the 471 booklet,
 * the analytic tool accepted 23 of 263 lines as printed — and most of the refusals were sentences
 * whose GEOMETRY it already understood, refused for the wrapper around it.
 *
 * The class (docs/17): each rule carried its own optional «נתון» (`HE_GIVEN`) and its own spellings,
 * so a wrapper the rules had not been taught missed EVERY rule at once. 2-D closed the same class
 * once, at `normalizeUtterance` + its multi-statement splitter; this is the analytic copy of that
 * shape (copied, never imported — `BOUNDARIES.json`).
 *
 * Everything here is pure TEXT → CLAUSES. Whether a clause is a sentence is decided by the real rules
 * (`parseLine` drives the readings below through them), so the frame can never accept anything the
 * grammar does not: a reading is taken only when EVERY clause it produces parses.
 *
 * This is the textbook register, not a register aimed at the tool — the exam's own wording — so it is
 * accepted rather than taught ([ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030) teaches
 * commands like «הוסף …»; this tree's rule is that the student types the exam's own sentence). The
 * line that is STORED is always the one the student typed.
 */
import { ANGLE_STEM_HE, EN_SHAPE, SHAPES, normalizeShapeNoun } from '../engine/shapes';
import { isNumeralName } from '../engine/names';
import { stripFormatControls } from '../../shell/bidi';

// ---------------------------------------------------------------------------
// Orthography — character-level folds, always applied
// ---------------------------------------------------------------------------

/**
 * One spelling per symbol. ∢ (U+2222) and ∡ (U+2221) are the exam's angle glyphs and mean ∠ (#1555);
 * ⁰ is typed for °; the Israeli coordinate pair «A(2;10)» separates with a semicolon; «10½» is 10.5;
 * «קודקוד» is the plene spelling of «קדקוד»; the maqaf and the NBSP are a hyphen and a space.
 *
 * #1641 / #1643 (ADR-AG-198) — what a PASTE carries is not what the student wrote: the bidi isolates and marks
 * the page wraps around every name (U+2066…U+2069, U+200E/F — copied off the canvas or the fact list) are
 * stripped by the shared set (`shell/bidi`, the 2-D/3-D parser boundary, ADR-W-029); a leading bullet («·»,
 * «•», «*», or «-» followed by a space) is a list mark, not a word; and «ציר ה- x» with a space after the
 * article's hyphen is «ציר ה-x». Character-level, so every rule reads the one spelling.
 */
export function orthography(raw: string): string {
  return stripFormatControls(raw)
    .replace(/^\s*(?:[·•∙*]|-(?=\s))\s*/, '')
    .replace(/־/g, '-')
    .replace(/ /g, ' ')
    .replace(/(?<![א-ת])ה-\s+([xy])(?![A-Za-z0-9])/g, 'ה-$1')
    .replace(/[∡∢]/g, '∠')
    .replace(/⁰/g, '°')
    .replace(/(\d)\s*½/g, '$1.5')
    .replace(/(\d)\s*¼/g, '$1.25')
    .replace(/(\d)\s*¾/g, '$1.75')
    .replace(/½/g, '0.5')
    .replace(/\(\s*([^();,]+?)\s*;\s*([^();,]+?)\s*\)/g, '($1,$2)')
    .replace(/(?<![א-ת])(ו?ה?)קודקוד/g, '$1קדקוד')
    // «מונח/מונחת/מונחים על» — the exam's verb for lying on a carrier — is «נמצא על».
    .replace(/(?<![א-ת])מונח(ת|ים|ות)?(?![א-ת])/g, (_m, s: string | undefined) => `נמצא${s ?? ''}`)
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Proof targets — refused, never parsed (operator ruling 3 on #1616)
// ---------------------------------------------------------------------------

/*
 * «הוכיחו כי OB ⊥ AC», «הראו כי …», "prove that …" — what the student is asked to PROVE. This tree had the
 * first copy of the rule (#1618); #1666 (ADR-W-107) moved it to `shell/proofTarget.ts` so all three
 * builders refuse the same spellings, and `parseLine` calls it from there.
 */

// ---------------------------------------------------------------------------
// The wrapper — given-prefixes, figure references, units
// ---------------------------------------------------------------------------

const FIGURE = String.raw`(?:ה)?(?:ציור|סרטוט|שרטוט|איור)(?:\s+ש?לפני(?:ך|כם|כן))?`;
const SEE_FIGURE = String.raw`(?:כמתואר|כמו\s+שמתואר|כפי\s+שמתואר|ראה|ראו|ראי|רא(?:ה|ו)\s+גם)\s+(?:ב)?${FIGURE}`;
const SEE_FIGURE_EN = String.raw`(?:see|as\s+(?:shown|drawn)\s+in)\s+(?:the\s+)?(?:figure|diagram|drawing|sketch)`;

const UNWRAP: ReadonlyArray<[RegExp, string]> = [
  // A whole line in parentheses — «(O היא ראשית הצירים)».
  [/^\((.*)\)$/, '$1'],
  // The conjunction that continues the previous sentence — «והנקודה C …», «וידוע כי …», «וכי DO/DE = 2/3».
  [/^וכי\s+/, ''],
  [/^ו(?=ה[א-ת]|ידוע|נתו|עוד\s)/, ''],
  // The given-prefixes, in every form the corpus prints — «נתון», «נתון:», «נתון כי», «נתון גם», «נתון בנוסף:»,
  // «עוד נתון:», «ידוע כי», «ידוע גם ש-». The four inflections are written out: «נתון» ends in FINAL nun.
  [/^(?:עוד\s+)?נתו(?:ן|נה|נים|נות)(?:\s+(?:גם|בנוסף|עוד))?\s*(?::\s*|\s+כי\s+|\s+ש-?|\s+)/, ''],
  [/^ידוע\s+(?:גם\s+)?(?:כי\s+|ש-?)/, ''],
  [/^(?:it\s+is\s+(?:given|known)\s+that|given\s+that|given\s*:|given)\s+/i, ''],
  // The figure that introduces the sentence — «בסרטוט שלפניכם מתואר משולש ABC».
  [new RegExp(String.raw`^ב${FIGURE}\s+(?:מתוא(?:ר|רת|רים|רות)\s+)?`), ''],
  // A reference to the figure — trailing, or parenthesised anywhere — states nothing.
  [new RegExp(String.raw`\s*\(\s*${SEE_FIGURE}\s*\)`, 'g'), ''],
  [new RegExp(String.raw`\s*,?\s*${SEE_FIGURE}\s*\.?$`), ''],
  [new RegExp(String.raw`\s*\(\s*${SEE_FIGURE_EN}\s*\)`, 'gi'), ''],
  [new RegExp(String.raw`\s*,?\s*${SEE_FIGURE_EN}\s*\.?$`, 'i'), ''],
  // «הישרים AB ו-CD שבציור», «המרובע ABCD שלפניכם» — a demonstrative pointing at the figure.
  [/\s+(?:ש(?:ב|ל)(?:ה)?(?:ציור|סרטוט|שרטוט)|שלפני(?:ך|כם|כן))(?=\s|$)/g, ''],
  // Length units — «MO = 8 ס"מ». Units carry no geometry here: every length is in the plane's units.
  [/(\d)\s*(?:ס"מ|ס״מ|סמ'|cm)(?![א-תA-Za-z])/g, '$1'],
  // «O – מרכז המעגל», «O - ראשית הצירים»: a dash between a name and its description.
  [/^([A-Z][0-9₀-₉]?)\s+[–—-]\s+(?=[א-ת])/, '$1 '],
  // «משוואת המעגל הנתון היא …», «הישר הנתון», «הנקודה הנתונה» (#1619 B1) — «הנתון» after a definite noun is
  // the given-prefix as an ADJECTIVE: "the given circle" is the circle. Written out per inflection (final ן).
  [/(?<=(?:^|\s)ה[א-ת]+)\s+הנתו(?:ן|נה|נים|נות)(?=\s|:|,|$)/g, ''],
  [/\s*\.$/, ''],
];

/** Strip the textbook wrapper until nothing more comes off. */
export function unwrap(line: string): string {
  let s = line.trim();
  for (let guard = 0; guard < 8; guard += 1) {
    const before = s;
    for (const [from, to] of UNWRAP) s = s.replace(from, to).trim();
    s = dropShapeQualifier(s);
    if (s === before) break;
  }
  return s;
}

/** The side nouns a shape's side is named by. */
const SIDE_NOUNS = 'צלע|שוק|בסיס|אלכסון|יתר|קטע';

/**
 * «הצלע AB של המלבן», «אורך השוק BC של הטרפז», «משוואת שוק הטרפז AD» — the side, qualified by the shape
 * it belongs to. The letters already say which side it is (the shape is the one that has it), so the
 * qualifier is dropped; a side that is NOT a side of any such shape still fails at the fold, by name.
 */
function dropShapeQualifier(s: string): string {
  return s
    .replace(new RegExp(`(ה?(?:${SIDE_NOUNS}))\\s+((?:${NAME}){2})\\s+של\\s+ה(?:${SHAPE_HE})(?=\\s|$)`, 'g'), '$1 $2')
    .replace(new RegExp(`(?<![א-ת])(${SIDE_NOUNS})\\s+ה(?:${SHAPE_HE})\\s+((?:${NAME}){2})(?![A-Za-z0-9])`, 'g'), 'ה$1 $2')
    .replace(/^\(?[א-י]\)\s*/, '');
}

// ---------------------------------------------------------------------------
// The origin — «O ראשית הצירים» is O(0,0) (#1612)
// ---------------------------------------------------------------------------

const NAME = '[A-Z][0-9₀-₉]?';
const ORIGIN_HE = 'ראשית\\s+(?:ה)?צירים';

/**
 * Every spelling of "P is the origin" lowers to the coordinate given `P(0,0)` — never a construct of
 * its own, so restatement, conflict and "already known" behave exactly as `P(0,0)` does (#1612). A
 * sentence that USES the origin as a point («הצלע AB עוברת דרך ראשית הצירים, O») states the point
 * first and then the sentence with its name.
 */
export function originClauses(line: string): string[] | null {
  const whole = new RegExp(
    `^(?:ה?נקודה\\s+)?(${NAME})\\s+(?:(?:היא|הוא)\\s+)?(?:ב)?${ORIGIN_HE}$|^(?:ה?נקודה\\s+)?${ORIGIN_HE}\\s+(${NAME})$` +
      `|^(?:the\\s+)?(?:point\\s+)?(${NAME})\\s+is\\s+(?:at\\s+)?the\\s+origin$|^the\\s+origin\\s+(${NAME})$`,
    'i',
  ).exec(line);
  if (whole) {
    const p = whole[1] ?? whole[2] ?? whole[3] ?? whole[4];
    return [`${p}(0,0)`];
  }
  // Embedded: «ראשית הצירים O היא …», «… דרך ראשית הצירים, O», «… בראשית הצירים O».
  const lead = new RegExp(`^${ORIGIN_HE},?\\s+(${NAME})(?=\\s)`).exec(line);
  if (lead) return [`${lead[1]}(0,0)`, line.replace(lead[0], lead[1])];
  const inner = new RegExp(`(\\s)(ב)?${ORIGIN_HE},?\\s+(${NAME})(?![A-Za-z0-9])`).exec(line);
  if (inner) {
    const p = inner[3];
    return [`${p}(0,0)`, line.replace(inner[0], `${inner[1]}${inner[2] ? 'בנקודה ' : ''}${p}`)];
  }
  // The origin used as an UNNAMED point (#1628) — «הצלע AB עוברת דרך ראשית הצירים». It is the coordinate
  // point (0,0), which the rule owning the sentence already reads in a point slot; the mint names it O
  // when that letter is free (`resolveMints`, the ADR-AG-184 convention).
  const bare = new RegExp(`(\\s)(ב)?${ORIGIN_HE}(?=\\s|,|$)`).exec(line);
  if (bare) return [line.replace(bare[0], `${bare[1]}${bare[2] ? 'בנקודה ' : ''}(0,0)`)];
  return null;
}

// ---------------------------------------------------------------------------
// The shape frame — context, parenthetical givens, predicate (#1618, #1239)
// ---------------------------------------------------------------------------

/** The shape nouns, DERIVED from the registry — longest first, so «טרפז ישר זווית» wins over «טרפז». */
const SHAPE_KEYS = Object.keys(SHAPES).sort((a, b) => b.length - a.length);
const nounPattern = (key: string): string =>
  key
    .split(' ')
    .map((w) => (w === 'זווית' ? `${ANGLE_STEM_HE}ת` : w === 'מעוין' ? 'מעו?יי?ן' : w === 'שווה' ? 'שוו?ה' : w))
    .join('[\\s-]+');
const SHAPE_HE = `(?:${SHAPE_KEYS.map(nounPattern).join('|')})`;
const EN_KEYS = Object.keys(EN_SHAPE).sort((a, b) => b.length - a.length);
const SHAPE_EN = `(?:${EN_KEYS.map((k) => k.replace(/[ -]/g, '[\\s-]+')).join('|')})`;
const LETTERS = `((?:${NAME}){3,4})`;

/**
 * A CIRCLE NAMED BY ITS RING, INSIDE A SENTENCE (#1663, ADR-AG-203) — «X מרכז המעגל החוסם את המשולש ABC», «A על
 * המעגל החסום במשולש ABC», «… משיק למעגל החוסם את ABC», "the circumcircle of triangle ABC", "the incircle of
 * triangle ABC", "the circle inscribed in triangle ABC". A computed circle has no letter and no equation, so
 * among several circles this description is the only thing that names it.
 *
 * Folded to the described-circle NAME («המעגל ⊙ABC» / «המעגל ○ABC», `names.ts`) that every circle sentence's
 * name slot reads, so the whole reference grammar learns it at once and M1 resolves it by what the figure states
 * (`circleByName`). The ADJECTIVE carries the article («החוסם», «החסום») — that is what makes it a definite
 * reference to a circle the figure has; «מעגל שחוסם …» / «מעגל חוסם …» describe a circle and stay the inscription
 * sentences' own. A line that IS the description and nothing more («המעגל החוסם את המשולש ABC») is the
 * inscription STATEMENT, read by its own rule (it binds or creates, ADR-AG-196) — never folded.
 */
const DESCRIBED_HE: ReadonlyArray<[RegExp, '⊙' | '○']> = [
  [new RegExp(`מעגל\\s+החוס(?:ם|מת)\\s+(?:את\\s+)?(?:ה?${SHAPE_HE}\\s+)?${LETTERS}(?![A-Za-z0-9₀-₉'])`, 'g'), '⊙'],
  [new RegExp(`מעגל\\s+החסו(?:ם|מה)\\s+ב(?:ה)?${SHAPE_HE}\\s+${LETTERS}(?![A-Za-z0-9₀-₉'])`, 'g'), '○'],
];
const DESCRIBED_EN: ReadonlyArray<[RegExp, '⊙' | '○']> = [
  [new RegExp(`\\bcircumcircle\\s+of\\s+(?:the\\s+)?(?:${SHAPE_EN}\\s+)?${LETTERS}(?![A-Za-z0-9₀-₉'])`, 'gi'), '⊙'],
  [new RegExp(`\\bcircle\\s+circumscribing\\s+(?:the\\s+)?(?:${SHAPE_EN}\\s+)?${LETTERS}(?![A-Za-z0-9₀-₉'])`, 'gi'), '⊙'],
  [new RegExp(`\\bincircle\\s+of\\s+(?:the\\s+)?(?:${SHAPE_EN}\\s+)?${LETTERS}(?![A-Za-z0-9₀-₉'])`, 'gi'), '○'],
  [new RegExp(`\\bcircle\\s+inscribed\\s+in\\s+(?:the\\s+)?${SHAPE_EN}\\s+${LETTERS}(?![A-Za-z0-9₀-₉'])`, 'gi'), '○'],
];
/**
 * «… על המעגל שמרכזו M», «… משיק למעגל שמרכזו M …», «… מחוץ למעגל שמרכזו M», «… לרדיוס המעגל שמרכזו M» — a circle
 * REFERRED TO by its centre is «מעגל M» (#1059's reading: the letter is the centre), the name every reference slot
 * reads. Only after a word that makes it a reference — a preposition («על», «של», «בתוך», «ל-») or «רדיוס»: the
 * creation («נתון מעגל שמרכזו M …») and the inscription sentences («… חסום במעגל שמרכזו M», «במעגל שמרכזו M
 * חסום …», «המעגל שמרכזו C החסום במשולש …») read their own «שמרכזו» tail and are never folded.
 */
const CENTRED_REF_HE = new RegExp(
  `(?<![א-ת])((?:על|של|בתוך|ל?רדיוס)\\s+ה?מעגל|ל(?:ה)?מעגל)\\s+ש(?:ה)?מרכזו\\s+(?:(?:הוא|היא)\\s+)?(?:ה?נקודה\\s+)?(${NAME})(?![A-Za-z0-9₀-₉'])`,
  'g',
);
const CENTRED_REF_EN = new RegExp(
  `\\b((?:on|to|of|inside|outside)\\s+(?:the\\s+)?circle)\\s+(?:with|whose)\\s+cent(?:re|er)\\s+(?:is\\s+)?(?:at\\s+)?(${NAME})(?![A-Za-z0-9₀-₉'])`,
  'gi',
);
const WHOLE_DESCRIPTION = /^(?:ה?מעגל|(?:the\s+|a\s+)?circle)\s+[⊙○][A-Z0-9₀-₉]+$/i;
export function describedCircles(line: string): string {
  let out = line
    .replace(CENTRED_REF_HE, (_m, ref: string, centre: string) => `${ref} ${centre}`)
    .replace(CENTRED_REF_EN, (_m, ref: string, centre: string) => `${ref} ${centre}`);
  for (const [re, mark] of DESCRIBED_HE) out = out.replace(re, (_m, run: string) => `מעגל ${mark}${run}`);
  for (const [re, mark] of DESCRIBED_EN) out = out.replace(re, (_m, run: string) => `circle ${mark}${run}`);
  return out === line || WHOLE_DESCRIPTION.test(out) ? line : out;
}

/** A noun phrase the registry knows, in its canonical spelling — or null. */
const shapeKey = (phrase: string): string | null => {
  const he = normalizeShapeNoun(phrase);
  if (SHAPES[he]) return he;
  const en = EN_SHAPE[phrase.trim().toLowerCase().replace(/[\s-]+/g, ' ').replace(/^(?:a|an|the)\s+/, '')];
  return en ?? null;
};

/** Split on commas that are not inside parentheses — «∠C = 90°, AB ∥ OC», never «A(2,3)». */
export function splitTopLevel(s: string, sep: RegExp = /,/): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && sep.test(ch)) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/** «… (g1, g2)» at the end of a line: the line before it, and the givens inside it. */
const trailingParen = (s: string): { head: string; inner: string[] } | null => {
  if (!s.endsWith(')')) return null;
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    if (s[i] === ')') depth += 1;
    if (s[i] === '(') depth -= 1;
    if (depth === 0) {
      // A coordinate pair or a function call is glued to what precedes it — «A(2,3)», «(x-2)²» is not at the end.
      if (i === 0 || s[i - 1] !== ' ') return null;
      return { head: s.slice(0, i).trim(), inner: splitTopLevel(s.slice(i + 1, -1)) };
    }
  }
  return null;
};

/**
 * The shape frame, as clauses — or null when the line is not one.
 *
 * - «במלבן ABCD, הנקודה E נמצאת על הצלע DC» — the shape is the CONTEXT of the statement: declare it,
 *   then the statement.
 * - «טרפז ישר זווית ABCD (AB ∥ CD, AB ⊥ AD)» — the shape and, in parentheses, the givens that make it
 *   that shape. A stated parallel pair REPLACES the pair a trapezoid assumes (`assumedParallel`), it is
 *   not added to it.
 * - «המרובע ABCO הוא טרפז ישר זווית», «ABC הוא משולש ישר זווית», «המשולש AOB הוא ישר זווית»,
 *   «ABC משולש» (#1239) — the shape as a PREDICATE is the same fact as the noun-first form.
 */
export function shapeClauses(line: string): string[] | null {
  const ctx = new RegExp(`^ב(?:ה)?(${SHAPE_HE})\\s+${LETTERS}(?:\\s*,\\s*|\\s+|$)(.*)$`).exec(line);
  if (ctx && shapeKey(ctx[1])) {
    const rest = ctx[3].trim();
    const decl = `${shapeKey(ctx[1])} ${ctx[2]}`;
    if (!rest) return [decl];
    if (rest.startsWith('(') && rest.endsWith(')')) return [decl, ...splitTopLevel(rest.slice(1, -1))];
    return [decl, rest];
  }
  const ctxEn = new RegExp(`^in\\s+(?:the\\s+)?(${SHAPE_EN})\\s+${LETTERS}\\s*,?\\s+(.+)$`, 'i').exec(line);
  if (ctxEn && shapeKey(ctxEn[1])) return [`${shapeKey(ctxEn[1])} ${ctxEn[2]}`, ctxEn[3].trim()];

  const paren = trailingParen(line);
  const head = paren ? paren.head : line;
  const extra = paren ? paren.inner : [];

  const decl =
    new RegExp(`^(?:ה)?(${SHAPE_HE})\\s+${LETTERS}$`).exec(head) ??
    new RegExp(`^(?:the\\s+|a\\s+|an\\s+)?(${SHAPE_EN})\\s+${LETTERS}$`, 'i').exec(head);
  if (decl && paren && shapeKey(decl[1])) return [`${shapeKey(decl[1])} ${decl[2]}`, ...extra];

  // «ABC משולש», «ABCD דלתון» — the letters first (#1239).
  const after = new RegExp(`^${LETTERS}\\s+(?:ה)?(${SHAPE_HE})$`).exec(head);
  if (after && shapeKey(after[2])) return [`${shapeKey(after[2])} ${after[1]}`, ...extra];
  const afterEn = new RegExp(`^${LETTERS}\\s+(?:is\\s+(?:a|an)\\s+)?(${SHAPE_EN})$`, 'i').exec(head);
  if (afterEn && shapeKey(afterEn[2])) return [`${shapeKey(afterEn[2])} ${afterEn[1]}`, ...extra];

  // «(ה)<noun>? <letters> הוא|היא <predicate>» — the predicate is a shape noun, or an adjective the
  // subject noun completes («המשולש AOB הוא ישר זווית» → משולש ישר זווית).
  // The copula is optional when a subject noun is present (#1626): Hebrew drops it routinely, so «מרובע ABCO
  // טרפז ישר זוית» and «משולש ABC ישר זווית» are the same sentences as with «הוא». Without a noun there is
  // nothing to complete an adjective, so «ABC ישר זווית» still needs one. The predicate must resolve through
  // the registry either way, so an unknown word («משולש ABC פיל») never reads as a shape.
  const pred =
    new RegExp(`^(?:(?:ה)?(${SHAPE_HE})\\s+)?${LETTERS}\\s+(?:הוא|היא|הנו|הינו)\\s+(.+)$`).exec(head) ??
    new RegExp(`^(?:ה)?(${SHAPE_HE})\\s+${LETTERS}\\s+(.+)$`).exec(head);
  if (pred) {
    const predicate = pred[3].trim();
    const key = shapeKey(predicate) ?? (pred[1] ? shapeKey(`${normalizeShapeNoun(pred[1])} ${predicate}`) : null);
    if (key) return [`${key} ${pred[2]}`, ...extra];
  }
  const predEn = new RegExp(`^(?:(?:the\\s+)?(${SHAPE_EN})\\s+)?${LETTERS}\\s+is\\s+(?:a|an)?\\s*(.+)$`, 'i').exec(head);
  if (predEn) {
    const predicate = predEn[3].trim();
    const key =
      shapeKey(predicate) ?? (predEn[1] ? shapeKey(`${predicate} ${predEn[1]}`.replace(/\s+/g, ' ')) : null);
    if (key) return [`${key} ${predEn[2]}`, ...extra];
  }
  return null;
}

// ---------------------------------------------------------------------------
// A point and what is said about it, in one sentence
// ---------------------------------------------------------------------------

/**
 * - «הנקודה E(2,7) נמצאת על הבסיס AB» — a point stated by its coordinates AND placed: the point, then
 *   the placement.
 * - «F נקודה שעבורה המרובע FBAD הוא מעוין», «F היא נקודה כך ש-…» — a point DEFINED by a statement that
 *   names it: the statement alone (it introduces F).
 */
export function pointClauses(line: string): string[] | null {
  // «M נמצא בנקודה (4,8)», «הנקודה M נמצאת ב-(4,8)», "M is at (4,8)" (#1619 B1) — the coordinate given, said
  // as a location: the point at those coordinates is `M(4,8)`.
  const at =
    new RegExp(`^(?:ה?נקודה\\s+)?(${NAME})\\s+(?:(?:היא|הוא)\\s+)?(?:נמצא(?:ת)?\\s+)?ב-?\\s*(?:ה?נקודה\\s+)?(\\([^()]+\\))$`).exec(line) ??
    new RegExp(`^(?:[Tt]he\\s+)?(?:[Pp]oint\\s+)?(${NAME})\\s+(?:is|lies)\\s+at\\s+(?:the\\s+point\\s+)?(\\([^()]+\\))$`).exec(line);
  if (at) return [`${at[1]}${at[2]}`];
  const placed = new RegExp(`^(?:ה?נקודה\\s+)?(${NAME})(\\([^()]+\\))\\s+(?!=)(.+)$`).exec(line);
  if (placed) return [`${placed[1]}${placed[2]}`, `${placed[1]} ${placed[3].trim()}`];
  const defined = new RegExp(`^(${NAME})\\s+(?:(?:היא|הוא)\\s+)?(?:ה)?נקודה\\s+(?:ש(?:עבורה|בה)|כך\\s+ש-?)\\s*(.+)$`).exec(line);
  if (defined && new RegExp(`${defined[1]}(?![0-9₀-₉])`).test(defined[2])) return [defined[2].trim()];
  return null;
}

// ---------------------------------------------------------------------------
// Sides as subjects — on an axis, and related to each other
// ---------------------------------------------------------------------------

/**
 * - «האלכסון BD נמצא על ציר ה-x», «הצלע AO נמצאת על ציר ה-x» — a segment lies on an axis exactly when
 *   both its endpoints do, so that is what it says.
 * - «הישרים AB ו-CD מקבילים זה לזה», «AB ו-CD מאונכים» — the reciprocal form of «AB ∥ CD».
 * - «האלכסון AC מאונך לאלכסון BD» — a relation that names its nouns: the letters are the relation.
 */
export function sideClauses(line: string): string[] | null {
  const onAxis = new RegExp(`^(?:ה?(${SIDE_NOUNS}|ישר)\\s+)?((?:${NAME}){2})\\s+(?:נמצא(?:ת)?\\s+)?על\\s+(ציר\\s+ה-?[xy])$`).exec(line);
  if (onAxis) {
    const [, noun, pair, axis] = onAxis;
    const ends = pair.match(new RegExp(NAME, 'g')) ?? [];
    // The sentence NAMES the segment (or the line), so it draws it (#1639, ADR-AG-198): «הישר» the line,
    // every other noun and the bare pair the segment — the declaration the bare «AO» line makes.
    return [...ends.map((p) => `${p} על ${axis}`), `${noun === 'ישר' ? 'הישר' : 'הקטע'} ${pair}`];
  }
  const mutual = new RegExp(
    `^(?:ה?(ישרים|צלעות|קטעים|אלכסונים)\\s+)?((?:${NAME}){2})\\s+ו-?\\s*((?:${NAME}){2})\\s+(מקביל(?:ים|ות)|מאונכ(?:ים|ות))(?:\\s+(?:זה|זו)\\s+(?:לזה|לזו))?$`,
  ).exec(line);
  // The NOUN rides into the relation (#1639, ADR-AG-198): «הישרים AB ו-CD» relates — and so draws — two LINES.
  if (mutual) {
    const n = mutual[1] === 'ישרים' ? 'הישר ' : '';
    return [`${n}${mutual[2]} ${mutual[4].startsWith('מקביל') ? '∥' : '⊥'} ${n}${mutual[3]}`];
  }
  const related = new RegExp(
    `^(?:ה?(${SIDE_NOUNS}|ישר)\\s+)?((?:${NAME}){2})\\s+(מקביל(?:ה)?|מאונכ(?:ת)?|מאונך)\\s+ל(?:-|ה)?(${SIDE_NOUNS}|ישר)?\\s*((?:${NAME}){2})$`,
  ).exec(line);
  if (related) {
    const n = (noun: string | undefined) => (noun === 'ישר' ? 'הישר ' : '');
    return [`${n(related[1])}${related[2]} ${related[3].startsWith('מקביל') ? '∥' : '⊥'} ${n(related[4])}${related[5]}`];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The circle's centre and the circle as a shared subject (#1619 B1)
// ---------------------------------------------------------------------------

/** What may follow a point to say where it is — the predicates the point rules already read. */
const PLACE_PRED = '(?:נמצא(?:ת|ים|ות)?\\s|על\\s|ב-?\\s*(?:ה?נקודה\\s+)?\\(|ברביע|מחוץ\\s|בתוך\\s)';

/**
 * «מרכז המעגל M נמצא על ציר ה-y» · «מרכז המעגל M נמצא בנקודה (4,8)» · «נתון מעגל שמרכזו M נמצא על החלק
 * החיובי של ציר ה-y» · «O – מרכז המעגל» — the centre NAMED and PLACED in one sentence. It says two things the
 * grammar already reads apart: the naming («M מרכז המעגל», or the circle stated on M) and the sentence about
 * M. A NUMERAL after «המעגל» is the circle's own name (ADR-AG-118), never a centre letter, so it is not read.
 */
export function centreClauses(line: string): string[] | null {
  // «מרכז המעגל הוא M» (#1643, ADR-AG-198) — the copula form of the naming is the same naming.
  const named = new RegExp(`^(?:ה?נקודת\\s+)?ה?מרכז\\s+(?:של\\s+)?ה?מעגל\\s+(?:(?:הוא|היא)\\s+)?(${NAME})(?:\\s+(.+))?$`).exec(line);
  if (named && !isNumeralName(named[1])) {
    const [, p, rest] = named;
    return rest ? [`${p} מרכז המעגל`, `${p} ${rest}`] : [`${p} מרכז המעגל`];
  }
  const namedEn = new RegExp(`^(?:[Tt]he\\s+)?cent(?:re|er)\\s+of\\s+the\\s+circle,?\\s+(${NAME}),?\\s+(.+)$`).exec(line);
  if (namedEn && !isNumeralName(namedEn[1])) return [`${namedEn[1]} is the centre of the circle`, `${namedEn[1]} ${namedEn[2]}`];
  const copulaEn = new RegExp(`^(?:[Tt]he\\s+)?cent(?:re|er)\\s+of\\s+the\\s+circle\\s+is\\s+(${NAME})$`).exec(line);
  if (copulaEn && !isNumeralName(copulaEn[1])) return [`${copulaEn[1]} is the centre of the circle`];
  const created = new RegExp(`^(ה?מעגל\\s+ש?מרכזו\\s+(?:ה?נקודה\\s+)?(${NAME}))\\s+(${PLACE_PRED}.*)$`).exec(line);
  if (created) return [created[1], `${created[2]} ${created[3]}`];
  const createdEn = new RegExp(`^((?:a\\s+|the\\s+)?circle\\s+(?:centred|centered)\\s+at\\s+(${NAME}))\\s+((?:is|lies)\\s.+)$`, 'i').exec(line);
  if (createdEn && /^[A-Z]/.test(createdEn[2])) return [createdEn[1], `${createdEn[2]} ${createdEn[3]}`];
  return null;
}

/**
 * «המעגל משיק לציר ה-x וחותך את ציר ה-y בנקודה C» (#1619 B1) — two predicates sharing the circle as their
 * subject. Each is a sentence the grammar reads with the subject written in; the ו-cut is only before one of
 * the circle's verbs, so «… בנקודות B ו-C» is never cut.
 */
const CIRCLE_VERB = '(?:חות(?:ך|כת)|משיק(?:ה)?|עובר(?:ת)?)';
export function sharedSubjectClauses(line: string): string[] | null {
  const he = new RegExp(`^(ה?מעגל(?:\\s+${NAME})?)\\s+(${CIRCLE_VERB}\\s.+?)\\s+ו-?(${CIRCLE_VERB}\\s.+)$`).exec(line);
  if (he) return [`${he[1]} ${he[2]}`, `${he[1]} ${he[3]}`];
  const en = new RegExp(
    `^((?:[Tt]he\\s+)?circle(?:\\s+${NAME})?)\\s+(.+?)\\s+and\\s+((?:cuts|intersects|meets|passes|is\\s+tangent|touches)\\s.+)$`,
  ).exec(line);
  if (en) return [`${en[1]} ${en[2]}`, `${en[1]} ${en[3]}`];
  return null;
}

// ---------------------------------------------------------------------------
// Diameters as subjects (#1619 B2)
// ---------------------------------------------------------------------------

/**
 * - «הקטע AB הוא קוטר במעגל שמרכזו M» — the circle on a centre, named by the sentence that makes AB its
 *   diameter: the circle, then the diameter OF that circle («AB קוטר במעגל M», M1's `diameter-of`).
 * - «הקטע AB הוא קוטר במעגל» — «הקטע» NAMES the segment, which introduces its ends (#1074), so the segment is
 *   stated first; «הצלע AC» refers to a side the figure already has and states nothing new.
 * - «קוטר המעגל AC נמצא על הישר 3y − 2x − 4 = 0» — the line the diameter lies on, and the diameter: «AC נמצא
 *   על …» (the incidence-in-every-order rule's own sentence) and «AC קוטר במעגל».
 */
export function diameterClauses(line: string): string[] | null {
  const DIAM = `(?:(?:הוא|היא)\\s+)?(?:ה)?קוטר`;
  const centred = new RegExp(
    `^(?:ה?(קטע|צלע)\\s+)?((?:${NAME}){2})\\s+${DIAM}\\s+ב(?:ה)?מעגל\\s+ש(?:ה)?מרכזו\\s+(?:(?:הוא|היא)\\s+)?(${NAME})$`,
  ).exec(line);
  if (centred) {
    const [, noun, pair, centre] = centred;
    return [...(noun === 'קטע' ? [`הקטע ${pair}`] : []), `מעגל שמרכזו ${centre}`, `${pair} קוטר במעגל ${centre}`];
  }
  const segment = new RegExp(`^ה?קטע\\s+((?:${NAME}){2})\\s+(${DIAM}(?:\\s+.+)?)$`).exec(line);
  if (segment) return [`הקטע ${segment[1]}`, `${segment[1]} ${segment[2].replace(/^(?:(?:הוא|היא)\s+)/, '')}`];
  const onLine = new RegExp(`^(?:ה)?קוטר\\s+(?:ה)?מעגל(?:\\s+(${NAME}))?\\s+((?:${NAME}){2})\\s+נמצא\\s+(על\\s+.+)$`).exec(line);
  if (onLine) {
    const [, circle, pair, where] = onLine;
    // The incidence first: it introduces the two ends when they are new, and the diameter refers to them.
    return [`${pair} נמצא ${where}`, `${pair} קוטר במעגל${circle ? ` ${circle}` : ''}`];
  }
  return null;
}

/**
 * «הנקודה B נמצאת מחוץ למעגל, על החלק החיובי של ציר ה-x» (#1619 B1) — a point and a list of where it is,
 * the later places with the subject left out. Each place is the sentence with the subject written back in.
 */
const ELIDED_PRED = /^(?:על|מחוץ|בתוך|נמצא(?:ת)?|ברביע)(?:\s|$)/;
export function elidedSubjectClauses(line: string): string[] | null {
  const subject = new RegExp(`^(?:ה?נקודה\\s+)?(${NAME})\\s`).exec(line);
  if (!subject) return null;
  const segs = segmentsOf(line);
  if (segs.length < 2 || !segs.slice(1).every((s) => ELIDED_PRED.test(s.text))) return null;
  return [segs[0].text, ...segs.slice(1).map((s) => `${subject[1]} ${s.text}`)];
}

/**
 * «במשולש AOB חסום מעגל שמרכזו C (הנקודה C נמצאת ברביע השני)» — a sentence, and in parentheses at its end the
 * givens that go with it (#1619 B2). The shape frame reads this for a shape declaration only; any other
 * sentence followed by parenthesised givens is the same two statements. Offered only when the whole line
 * is not itself a sentence (the caller tries it last), and taken only when every clause parses.
 */
/**
 * A SENTENCE AND ITS CONDITION (#1620, ADR-AG-208) — «הנקודה E נמצאת על צלע BC כך ש-AE = AC», «E על המשך BC כך
 * ש-DE = DC», "E is on side BC such that AE = AC". «כך ש» joins two statements the grammar reads apart: where
 * the point is, and what holds there. Both are givens, so the reading is taken only when BOTH parse — a
 * condition the grammar cannot read refuses the whole line rather than vanish (the honesty invariant).
 *
 * …and the RELATIVE CLAUSE about the point a sentence just named — «אלכסוני הטרפז נפגשים בנקודה M, שנמצאת על
 * ציר ה-y», "… at the point M, which lies on the y-axis": the clause is a sentence about that point, with the
 * relative pronoun «ש» standing for its name.
 *
 * Offered after the whole line failed (like the comma split), so it never overrides a rule that owns it.
 */
export function conditionClauses(line: string): string[] | null {
  const such = /^(.+?)\s*,?\s+כך\s+ש-?\s*(.+)$/.exec(line) ?? /^(.+?)\s*,?\s+such\s+that\s+(.+)$/i.exec(line);
  if (such) return [such[1].trim(), such[2].trim()];
  const rel = new RegExp(
    `^(.*?(${NAME}))\\s*,?\\s+ש(?:ה)?((?:נמצא|מונח)(?:ת|ים|ות)?|היא|הוא)\\s+(.+)$`,
  ).exec(line);
  if (rel) return [rel[1].trim(), `${rel[2]} ${rel[3]} ${rel[4].trim()}`];
  const relEn = new RegExp(`^(.*?(${NAME}))\\s*,?\\s+which\\s+((?:lies|is)\\s+.+)$`).exec(line);
  if (relEn) return [relEn[1].trim(), `${relEn[2]} ${relEn[3].trim()}`];
  return null;
}

export function parenClauses(line: string): string[] | null {
  const paren = trailingParen(line);
  if (!paren || !paren.head || paren.inner.length === 0) return null;
  return [paren.head, ...paren.inner];
}

// ---------------------------------------------------------------------------
// Distribution — «A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה»
// ---------------------------------------------------------------------------

/**
 * A LIST of point names, however the student separates it (#1641, ADR-AG-198): «A ו-B», «A, B ו-C», «A, B, C»,
 * «A, B, ו-C». Commas alone are a list, and so is a final «ו-» with or without the comma before it — the frame
 * used to admit one spelling of a list (the final «ו-» required), so three ordinary spellings missed every rule.
 */
const NAME_LIST = `((?:${NAME})(?:(?:\\s*,\\s*${NAME})+(?:\\s*,?\\s*ו-?\\s*${NAME})?|\\s+ו-?\\s*${NAME}))`;
const namesOf = (list: string): string[] => list.match(new RegExp(NAME, 'g')) ?? [];
/** Split «על ציר ה-x ועל ציר ה-y» / «x = 4 ו-x = -4» into its members. */
const objectsOf = (s: string): string[] => s.split(/\s+ו-?(?=\s*(?:על|ב[א-ת]|[A-Za-z0-9(−-]))/).map((x) => x.trim()).filter(Boolean);

/**
 * A plural subject and one predicate, or two lists paired by «בהתאמה» — each subject gets its own
 * clause. Only the LOCATION predicate (נמצא/מונח … על/ב…) and the plural EQUATION form distribute: they
 * are the corpus's two shapes, and a predicate that relates the subjects to EACH OTHER («A ו-B
 * סימטריות») would be changed in meaning by distributing it, so nothing else is.
 */
export function distributeClauses(line: string): string[] | null {
  /*
   * The subject noun is optional, with or without the article («הנקודות», «נקודות»), and so is the VERB when
   * the predicate opens with «על» (#1641): «A, B, C על המעגל» is the location sentence with its verb dropped,
   * exactly as «A על המעגל» is «A נמצאת על המעגל». Without «על» the verb stays required — a bare list and
   * anything else is not this reading, so «A ו-B סימטריות» (a relation BETWEEN the subjects) never distributes.
   */
  const loc = new RegExp(
    `^(?:ה?(?:נקודות|קדקודים)\\s+)?${NAME_LIST}\\s+(?:(?:נמצא(?:ות|ים)|מונח(?:ות|ים))\\s+(.+)|(על\\s.+))$`,
  ).exec(line);
  if (loc) {
    const names = namesOf(loc[1]);
    let rest = (loc[2] ?? loc[3]).trim();
    const respectively = /\s+בהתאמה$/.test(rest);
    if (respectively) rest = rest.replace(/\s+בהתאמה$/, '');
    if (!respectively) return names.map((n) => `${n} ${rest}`);
    const objs = objectsOf(rest);
    if (objs.length !== names.length) return null;
    return names.map((n, i) => `${n} ${objs[i]}`);
  }
  const locEn = new RegExp(
    `^(?:(?:the\\s+)?(?:points|vertices)\\s+)?((?:${NAME})(?:\\s*,\\s*${NAME})*,?\\s+and\\s+${NAME})\\s+(?:are|lie)\\s+(on\\s+.+?)(\\s+respectively)?$`,
    'i',
  ).exec(line);
  if (locEn) {
    const names = namesOf(locEn[1]);
    if (!locEn[3]) return names.map((n) => `${n} is ${locEn[2]}`);
    const objs = locEn[2].split(/\s+and\s+(?=on\s|the\s)/i).map((o) => (/^on\s/i.test(o) ? o : `on ${o}`).trim());
    if (objs.length !== names.length) return null;
    return names.map((n, i) => `${n} is ${objs[i]}`);
  }
  const eqs = new RegExp(
    `^משוואות\\s+(?:ה)?(ישרים|צלעות|אלכסונים)\\s+((?:(?:${NAME}){2})(?:\\s*,\\s*(?:${NAME}){2})*\\s+ו-?\\s*(?:${NAME}){2})\\s+(?:הן|הם)\\s*:?\\s*(.+?)\\s+בהתאמה$`,
  ).exec(line);
  if (eqs) {
    const noun = eqs[1] === 'ישרים' ? 'הישר' : eqs[1] === 'צלעות' ? 'הצלע' : 'האלכסון';
    const pairs = eqs[2].match(new RegExp(`${NAME}${NAME}`, 'g')) ?? [];
    const objs = objectsOf(eqs[3]);
    if (objs.length !== pairs.length) return null;
    return pairs.map((p, i) => `משוואת ${noun} ${p} היא ${objs[i]}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Clause splitting — two givens on one line
// ---------------------------------------------------------------------------

/**
 * The places a line may be cut into clauses: a top-level comma or semicolon, and a «ו» that opens a new
 * sentence («… והנקודה E …», «… וידוע כי …»). The ו-cut is only before a word that BEGINS a sentence, so
 * «A ו-B», «AB ו-CD» are never cut.
 */
export interface Segment {
  /** The text of the segment. */
  text: string;
  /** What separated it from the previous one, verbatim — so re-joining two segments restores the line. */
  sep: string;
}

export function segmentsOf(line: string): Segment[] {
  const out: Segment[] = [];
  let depth = 0;
  let start = 0;
  let sep = '';
  const cut = (end: number, nextSep: string, skip: number) => {
    const text = line.slice(start, end).trim();
    if (text) out.push({ text, sep });
    sep = nextSep;
    start = end + skip;
  };
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === ',' || ch === ';')) cut(i, ch + ' ', 1);
    else if (depth === 0 && ch === ' ' && /^ ו(?:ה[א-ת]|ידוע|נתו|כי\s)/.test(line.slice(i))) cut(i, ' ', 1);
  }
  cut(line.length, '', 0);
  return out;
}

/** A piece that only NAMES a point states nothing, and accepting it would orphan the point from its predicate. */
export const isBareName = (piece: string): boolean =>
  new RegExp(`^(?:ה?(?:נקוד(?:ה|ות)|קדקוד(?:ים)?)\\s+)?${NAME}$|^(?:the\\s+)?(?:point\\s+)?${NAME}$`, 'i').test(piece.trim());

/**
 * Every way to cut `segments` into contiguous groups, FEWEST groups first — so a line that reads as two
 * sentences is never read as three. Bounded: the corpus's longest compound is four segments. Segments
 * kept together are re-joined with their ORIGINAL separator, so a group is always a substring of the line.
 */
export function partitions(segments: readonly Segment[], max = 6): string[][] {
  const n = segments.length;
  if (n <= 1 || n > max) return [];
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << (n - 1); mask += 1) {
    const groups: string[] = [];
    let cur = segments[0].text;
    for (let i = 1; i < n; i += 1) {
      if (mask & (1 << (i - 1))) {
        groups.push(cur);
        cur = segments[i].text;
      } else cur = `${cur}${segments[i].sep}${segments[i].text}`;
    }
    groups.push(cur);
    out.push(groups);
  }
  return out.sort((a, b) => a.length - b.length);
}
