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

// ---------------------------------------------------------------------------
// Orthography — character-level folds, always applied
// ---------------------------------------------------------------------------

/**
 * One spelling per symbol. ∢ (U+2222) and ∡ (U+2221) are the exam's angle glyphs and mean ∠ (#1555);
 * ⁰ is typed for °; the Israeli coordinate pair «A(2;10)» separates with a semicolon; «10½» is 10.5;
 * «קודקוד» is the plene spelling of «קדקוד»; the maqaf and the NBSP are a hyphen and a space.
 */
export function orthography(raw: string): string {
  return raw
    .replace(/־/g, '-')
    .replace(/ /g, ' ')
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

/**
 * «הוכיחו כי OB ⊥ AC», «הראו כי …», "prove that …" — what the student is asked to PROVE.
 *
 * The tool draws the givens; it is not a proof engine. A proof target typed into the box must never
 * become a constraint — before this, «הוכיחו כי AC ⊥ BD» reached the operand check, which is one
 * spelling away from drawing the claim as though it were given.
 *
 * «הראו» is also in the imperative lexicon (`scopeAnalytic.ts`, "show me …"), so the `כי`/`ש` that
 * makes it "show THAT" is required; a bare «הראו את …» stays the teaching path's.
 */
const PROOF_HE = /^ו?(?:הוכיחו|הוכח|הוכיחי|תוכיחו|הראו|הראה|הראי|נמקו|נמק)\s+(?:כי|ש-?|את\s+ש-?)\s*\S/;
const PROOF_HE_BARE = /^ו?(?:הוכיחו|הוכח|הוכיחי|תוכיחו)(?:\s|:|$)/;
const PROOF_EN = /^(?:prove|show)\s+that\b/i;

export const isProofTarget = (line: string): boolean =>
  PROOF_HE.test(line) || PROOF_HE_BARE.test(line) || PROOF_EN.test(line);

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

const SIDE = `(?:ה?(?:${SIDE_NOUNS}|ישר)\\s+)?((?:${NAME}){2})`;

/**
 * - «האלכסון BD נמצא על ציר ה-x», «הצלע AO נמצאת על ציר ה-x» — a segment lies on an axis exactly when
 *   both its endpoints do, so that is what it says.
 * - «הישרים AB ו-CD מקבילים זה לזה», «AB ו-CD מאונכים» — the reciprocal form of «AB ∥ CD».
 * - «האלכסון AC מאונך לאלכסון BD» — a relation that names its nouns: the letters are the relation.
 */
export function sideClauses(line: string): string[] | null {
  const onAxis = new RegExp(`^${SIDE}\\s+(?:נמצא(?:ת)?\\s+)?על\\s+(ציר\\s+ה-?[xy])$`).exec(line);
  if (onAxis) {
    const ends = onAxis[1].match(new RegExp(NAME, 'g')) ?? [];
    return ends.map((p) => `${p} על ${onAxis[2]}`);
  }
  const mutual = new RegExp(
    `^(?:ה?(?:ישרים|צלעות|קטעים|אלכסונים)\\s+)?((?:${NAME}){2})\\s+ו-?\\s*((?:${NAME}){2})\\s+(מקביל(?:ים|ות)|מאונכ(?:ים|ות))(?:\\s+(?:זה|זו)\\s+(?:לזה|לזו))?$`,
  ).exec(line);
  if (mutual) return [`${mutual[1]} ${mutual[3].startsWith('מקביל') ? '∥' : '⊥'} ${mutual[2]}`];
  const related = new RegExp(
    `^${SIDE}\\s+(מקביל(?:ה)?|מאונכ(?:ת)?|מאונך)\\s+ל(?:-|ה)?(?:${SIDE_NOUNS}|ישר)?\\s*((?:${NAME}){2})$`,
  ).exec(line);
  if (related) return [`${related[1]} ${related[2].startsWith('מקביל') ? '∥' : '⊥'} ${related[3]}`];
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
  const named = new RegExp(`^(?:ה?נקודת\\s+)?ה?מרכז\\s+(?:של\\s+)?ה?מעגל\\s+(${NAME})(?:\\s+(.+))?$`).exec(line);
  if (named && !isNumeralName(named[1])) {
    const [, p, rest] = named;
    return rest ? [`${p} מרכז המעגל`, `${p} ${rest}`] : [`${p} מרכז המעגל`];
  }
  const namedEn = new RegExp(`^(?:[Tt]he\\s+)?cent(?:re|er)\\s+of\\s+the\\s+circle,?\\s+(${NAME}),?\\s+(.+)$`).exec(line);
  if (namedEn && !isNumeralName(namedEn[1])) return [`${namedEn[1]} is the centre of the circle`, `${namedEn[1]} ${namedEn[2]}`];
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

// ---------------------------------------------------------------------------
// Distribution — «A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה»
// ---------------------------------------------------------------------------

const NAME_LIST = `((?:${NAME})(?:\\s*,\\s*${NAME})*\\s+ו-?\\s*${NAME})`;
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
  const loc = new RegExp(
    `^(?:ה?(?:נקודות|קדקודים)\\s+)?${NAME_LIST}\\s+(?:נמצא(?:ות|ים)|מונח(?:ות|ים)|נמצאות|נמצאים)\\s+(.+)$`,
  ).exec(line);
  if (loc) {
    const names = namesOf(loc[1]);
    let rest = loc[2].trim();
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
