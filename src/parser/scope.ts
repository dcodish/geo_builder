/**
 * Out-of-scope classifier — the boundary between "a real construction we should build" and "a concept
 * the tool DELIBERATELY doesn't take as input."
 *
 * Runs ONLY after BOTH the deterministic grammar AND the LLM fallback have failed to build anything
 * (see `App.submit`). A match yields:
 *   - a tailored, pedagogical student-facing message (so they learn what to do INSTEAD of a flat
 *     "couldn't read that"), via the i18n key `input.scope.<category>`; and
 *   - an analytics tag `scope:<category>` on the usage event, so the admin dashboard separates these
 *     deliberate non-features from GENUINE gaps we still need to implement (the operator's request:
 *     don't let "alternate angles" inflate the real-gap count).
 *
 * Categories (all surfaced by the tool elsewhere or simply not its job):
 *   - `analytic`       — analytic / coordinate geometry: axes, coordinates, slope, line equations, origin.
 *     This tool builds SYNTHETIC constructions; a separate coordinate-geometry tool is planned. `App.submit`
 *     short-circuits this category BEFORE the LLM call (it can never build — no reason to spend a call).
 *   - `angle-relation` — named angle relationships / theorem names (alternate/corresponding/co-interior
 *     angles, Pythagoras, Thales…). The tool DETECTS and surfaces these (Phase 6); they're never typed.
 *   - `proof`          — "prove / show that / הוכח". The tool draws figures, it doesn't write proofs.
 *   - `compute`        — "calculate / find the value / חשב". The tool constructs, it doesn't compute answers.
 *   - `unrelated`      — free text with NO geometric construction signal at all (greeting, question, gibberish).
 *
 * Extending it: add a pattern to the relevant rule's `patterns` (bilingual). Keep patterns SPECIFIC —
 * they must NOT match a legitimate construction (a real gap must stay a real gap, not be mislabelled).
 */

export type ScopeCategory =
  | 'analytic'
  | 'angle-relation'
  | 'proof'
  | 'compute'
  | 'unrelated'
  // #43 (ADR-289, baseline log-triage): the GUIDANCE register — non-constructive input families that can
  // never build, each answered with a specific "what to do instead" (never a bare not-understood).
  | 'cross-app' // a 3-D solid typed into the 2-D tool → point to the 3-D Space Builder
  | 'ui-command' // "add/mark/show …" — marks derive from GIVENS; say the given itself
  | 'valueless-query' // "∠DEF = ?" — the tool enforces/verifies stated values, it doesn't solve
  | 'orientation' // canvas layout words (horizontal / upper / rotate…) — not geometry givens
  | 'bare-point' // a lone point label — say WHERE it sits
  | 'unnamed-sides' // "one side 10, other side 5" — name the sides (AB=10, BC=5) — #105
  | 'compound-relation' // a compound measure relation the vocabulary doesn't cover (mixed units, unequal-degree product) — #153/#154/#144
  | 'latex' // LaTeX-pasted input ($…$, \triangle, \parallel) — use plain notation / the symbol palette (#329)
  | 'word-root'; // a magnitude written with the WORD «שורש N» — use the √ symbol (toolbar), operator ruling (#246)

export interface ScopeMatch {
  category: ScopeCategory;
  /** i18n key for the tailored student-facing message. */
  messageKey: string;
}

interface ScopeRule {
  category: Exclude<ScopeCategory, 'unrelated'>; // 'unrelated' is the no-signal fallback, not a keyword rule
  patterns: RegExp[];
}

const RULES: ScopeRule[] = [
  {
    // #43: a 3-D SOLID typed into the 2-D tool — the sibling app exists; point the student there.
    category: 'cross-app',
    patterns: [/תיבה|קוביי?ה|פירמידה|מנסרה|טטרא?דר|ארבעון/, /\bbox\b|\bcube\b|pyramid|prism|tetrahedron/i],
  },
  {
    // #43: UI/mark commands — "תוסיף זוויות", "תסמן זוית ישרה", "להוסיף את מרכז המעגל", "E זוית ישרה
    // הוסף סימון", bare "זוויות"/"angles". Marks derive from GIVENS; the message says to state the
    // given itself ("זווית B = 90"). Kept SPECIFIC: an imperative that names a real CONSTRUCT
    // ("הוסף תיכון לצלע AB") parses via its own rule and never reaches this classifier.
    category: 'ui-command',
    patterns: [
      /(?:תוסיף|הוסף|הוסיפו|להוסיף|תסמן|סמנו?|תמחק|מחקו?|הצג|תציג|הראה?|הראו)\s+(?:את\s+)?(?:ה?זוו?יות|ה?סימו(?:ן|נים)|זו?וית\s+ישרה|מרכז)/,
      /זו?וית\s+ישרה\s*(?:הוסף|תסמן|סמן|תוסיף)|סימון\s+זו?וית/,
      /^(?:זוו?יות|angles?)\s*[°α]?\s*$/i,
      /\b(?:mark|show|add|display)\b.*\b(?:right\s+angles?|angles?|marks?|cent(?:er|re))\b/i,
    ],
  },
  {
    // #43: a VALUE-LESS angle query — "∠DEF", "∠DEF=", "∠DEF=?". The tool enforces/verifies STATED
    // values (reproduce-verify); it doesn't solve. (A valued "∠DEF = 60" parses and never reaches here.)
    category: 'valueless-query',
    patterns: [/^\s*∠\s*[A-Za-z]{1,3}\d*\s*=?\s*\??\s*$/, /^\s*(?:זו?וית\s+)?[A-Za-z]{3}\s*=\s*\??\s*$/],
  },
  {
    // #43: ORIENTATION / canvas-layout words — "BD אופקי", "AB בסיס למטה", "A הקודקוד העליון",
    // "תזיז את הקוטר ב40 מעלות", "נקודה מימין לקו". Layout is the tool's choice (ADR-052 — an
    // unstated orientation is not a given); "show another configuration" explores it.
    category: 'orientation',
    patterns: [
      /אופקית?|אנכית?(?![א-ת])|בסיס\s+למטה|למעלה|למטה|ה?עליו(?:ן|נה)|ה?תחתו(?:ן|נה)|מימין\s+ל|משמאל\s+ל|תזיז|הזז|סובב|תסובב/,
      /\bhorizontal\b|\bvertical\b|\bupper\b|\blower\b|\bleftmost\b|\brightmost\b|\brotate\b|\bmove\s+(?:the|it)\b/i,
    ],
  },
  {
    // Analytic / coordinate geometry — a DIFFERENT tool. This one builds synthetic constructions on a
    // free canvas (no axes); axes, coordinates, slopes and line equations belong to a coordinate-geometry
    // tool that's planned separately. Placed FIRST so "the slope of AB" / "calculate the slope" surface the
    // helpful "wrong tool" message rather than the generic compute refusal. Patterns are kept SPECIFIC so a
    // real construction is never mislabelled: the Hebrew stems ("ציר"/"שיפוע"/"קואורדינ") and English words
    // ("axis"/"slope"/"coordinate"/"origin"/"cartesian") appear in NO supported construct, and the numeric
    // line-equation form requires BOTH `y =` and an `x` term (so a given like "AB = 4" can't trip it).
    // NOTE: placing a free point AT coordinates ("A = (3,5)") stays supported — the `freePoint` grammar
    // rule builds it, so it never reaches this classifier (which runs only on a FAILED parse).
    category: 'analytic',
    patterns: [
      /מערכת\s*צירים|ראשית\s*הצירים|צירים|ציר\s+ה|ציר\s*[-]?\s*[xy]|שיפוע|קואורדינ|שיעורי\s+ה|שיעור\S*\s*ה?-?\s*[xy]|משוואת?\s+ה?(?:ישר|קו|פונקצי)|קרטזי/, // axes / origin / slope / coordinates ("שיעורי הנקודה" / "שיעור ה-x") / line-equation / cartesian
      /\b[xy][-\s]?axis\b|\baxes\b|\baxis\b|\bslope\b|\bcoordinate(?:s)?\b|\bcartesian\b|\borigin\b|equation\s+of\s+(?:the\s+)?(?:line|curve|function)/i,
      /(?:^|[^A-Za-z])[yY]\s*=\s*[-+\d.\s/*]*[xX](?![A-Za-z])/, // a line equation "y = 2x + 3" / "y = -x" (needs both y= and an x term)
    ],
  },
  {
    // Named angle relationships + theorem names — surfaced by the tool (Phase 6), never typed as input.
    // (Hebrew has no regex `\b`, so Hebrew stems are matched bare; theorem names are kept SPECIFIC —
    // a bare "משפט" also means "sentence", so we require a named theorem after it.)
    category: 'angle-relation',
    patterns: [
      /מתחלפות|מתאימות|חד[\s-]?צדדיות|קודקודיות/, // alternate / corresponding / co-interior / vertical angles
      /alternate\s+angles|corresponding\s+angles|co[\s-]?interior|same[\s-]?side\s+angles|vertical(?:ly)?\s+(?:opposite\s+)?angles/i,
      /פיתגורס|תאלס|משפט\s+ה?(?:סינוס|קוסינוס|פיתגורס|תאלס)/, // Pythagoras / Thales / the sine·cosine·Pythagoras·Thales theorem
      /\btheorem\b|pythagoras|thales|law\s+of\s+(?:sines|cosines)/i,
    ],
  },
  {
    category: 'proof',
    patterns: [
      /הוכ(?:ח|יח|חה|יחו)|הרא[הו]?\s+ש|צריך\s+להוכיח/, // הוכח / הוכיחו / הוכחה / הראה ש
      /\bprove\b|\bproof\b|show\s+that|demonstrate\s+that/i,
    ],
  },
  {
    category: 'compute',
    patterns: [
      /חשב(?:ו|י|תי?)?\s+את|מהו\s+הערך|כמה\s+(?:שווה|הוא|זה)/, // חשב/חשבו/לחשב את… / מהו הערך / כמה שווה
      /מצא(?:ו|י)?\s+את\s+ה?(?:שטח|אורך|זווית|ערך|גודל|היקף|רדיוס|נפח)/, // "find the area/length/angle/value/…" (NOT "find point/intersection" — those are constructions)
      /\bcalculate\b|\bcompute\b|solve\s+for\b|find\s+(?:the\s+)?(?:value|area|length|measure|perimeter|radius)\b|what\s+is\s+the\s+(?:value|area|measure|length|perimeter)\b/i,
    ],
  },
  {
    // #105: the UNNAMED-SIDES form — "צלע אחת 10 צלע שניה 5" / "one side 10 the other 5". The magnitudes
    // are stated but not tied to labelled sides, so nothing can build; the message says to name the sides
    // (AB=10, BC=5). Kept SPECIFIC — requires "side/צלע" + a number TWICE — so a labelled given never trips it.
    category: 'unnamed-sides',
    patterns: [
      /צלע\s+אחת\s+\S*\d.*?צלע\s+(?:שניי?ה|אחרת|נוספת)\s+\S*\d/s,
      /one\s+side\s+\S*\d.*?(?:other|another|second)\s+side\s+\S*\d/is,
    ],
  },
  {
    // #153/#154/#144: a MIXED-UNIT measure sum — a bare segment PAIR joined by +/− to an arc/angle term
    // («AB + ∠ABC = 90»). Dimensionally invalid, so it can NEVER parse (measureSum enforces unit
    // homogeneity and no other rule reads a term list) — which is what qualifies it for this classifier
    // (the scope invariant: a pattern must never match a supported catalog example). The SUPPORTED
    // compounds (same-unit sums, equal-degree products — ADR-335) parse and never reach here; the other
    // refused variants (an unequal-degree product like «4·DM/ME=BM·DM») carry no never-parseable lexical
    // signature, so they take the ordinary honesty lane (the structural gate refuses the truncated parse
    // AND the LLM's re-lowering → the labelsDropped message). The negative lookbehind keeps an ARC/ANGLE
    // term's own label pair («arc AC + arc BE») from reading as a bare segment pair.
    category: 'compound-relation',
    patterns: [
      /(?<!(?:arcs?|הקשת|קשת|⌢|⏜|∠|∢|angle|הזוו?ית|זוו?ית)\s*)(?<![A-Za-z\d])[A-Z]\d*[A-Z]\d*(?![A-Za-z\d])\s*[+−]\s*(?:arcs?|קשת|⌢|⏜|∠|∢|angle|זוו?ית)/u,
    ],
  },
  {
    // A LONE point label with NO keyword — "C", "A." — builds nothing; the message says to state WHERE it
    // sits. The KEYWORD forms ("נקודה A" / "point A") now BUILD a bare free point (#104, ADR-328), so they
    // are deliberately NOT matched here — they fall through to the `bareFreePoint` rule. "קו ועליו נקודה A"
    // BUILDS too since #185 (the `pointOnTheLine` rule — a line with a named rider), so its old guidance
    // pattern is gone. LAST (the most generic pattern).
    category: 'bare-point',
    patterns: [/^\s*[A-Za-z]\d*\s*\.?\s*$/],
  },
];

/**
 * Tokens suggesting a REAL construction: a point label, a number, a math/angle symbol (these are
 * CASE-SENSITIVE — a label is an UPPERCASE letter, so a lowercase greeting isn't mistaken for one)…
 */
const GEO_SYMBOL = /[A-Z]\d*|\d|[∠°⊥⟂∥√△▲◯=<>]/;
/** …or a geometry keyword in Hebrew or English (case-insensitive). Text with NONE of these is `unrelated`.
 *  The angle stem is `זו?וי` — BOTH the single-vav «זוית» and double-vav «זווית» spellings (the ADR-3D-032
 *  vav class): «זווי» alone missed the single-vav form, so «זוית abc» (lowercase labels, so no GEO_SYMBOL
 *  either) was mis-classified `unrelated` and got a "not geometry" brush-off (#244). */
const GEO_KEYWORD =
  /נקוד|זו?וי|ישר|קטע|מעגל|עיגול|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|מקביל|אנך|מאונך|חוצה|תיכון|גובה|קוטר|מיתר|רדיוס|משיק|חותך|דלתון|מחומש|משושה|צלע|point|line|segment|circle|triangle|square|rectangle|quad|angle|tangent|chord|radius|diameter|perpendicular|parallel|bisect|median|midpoint|pentagon|hexagon/i;

/** Statement separators for the compound-input heuristic — list/clause punctuation plus the common He/En
 *  conjunctions and sentence enders. Also the bare Hebrew ו glued to a following construct noun ("…ומעגל…"):
 *  safe to split liberally here because the keyword-bearing-piece guard below rejects false positives (a ו
 *  glued to a non-construct word yields a keyword-less piece that doesn't count). NOT a parser — a hint only. */
const COMPOUND_SEP =
  /\s*[,;.\n]\s*|\s+(?:וגם|ואז|\band\b|\bthen\b)\s+|\s+ו(?:-|\s+|(?=[A-Z]))\s*|\s+ו(?=מעגל|עיגול|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|נקוד|זווי|ישר|קטע|מחומש|משושה|דלתון)/gi;

/**
 * A FAILED utterance that packs several independent statements into one line — a shape AND a point-on-side
 * AND an angle, say (the "ריבוע Abcd, נקודה f על צלע ab, זווית cfd 37" class). Splitting on the statement
 * separators, ≥2 pieces each carry a geometry KEYWORD (a construct/relation word, NOT a bare label — so a
 * single construction with list-commas like "circle through A, B, C" stays ONE statement and isn't flagged).
 * `App.submit` consults it ONLY after both the grammar AND the LLM failed to build, to advise the student to
 * break the input into smaller steps (each of which the tool is far likelier to read) — never on success.
 */
export function looksCompound(utterance: string): boolean {
  const parts = utterance.split(COMPOUND_SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.filter((p) => GEO_KEYWORD.test(p)).length >= 2;
}

/**
 * Classify a failed utterance as a deliberately out-of-scope concept, or `null` if it's a GENUINE
 * construction gap (which keeps the plain "couldn't read that" message + the `not-understood` tag).
 */
export function classifyOutOfScope(utterance: string): ScopeMatch | null {
  const s = utterance.trim();
  if (!s) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(s))) {
      return { category: rule.category, messageKey: `input.scope.${rule.category}` };
    }
  }
  // No construction signal at all → free text (greeting, question, gibberish).
  if (!GEO_SYMBOL.test(s) && !GEO_KEYWORD.test(s)) return { category: 'unrelated', messageKey: 'input.scope.unrelated' };
  return null; // has geometric content but unmatched → a real gap to implement (stays 'not-understood').
}

/**
 * A FORMAT (not semantic) guidance detector for input that can never build usefully — checked on the RAW
 * utterance regardless of whether the deterministic parse partially succeeded (unlike `classifyOutOfScope`,
 * which runs only on a FAILED parse). Two families:
 *  - `'latex'` (#329): a `$…$` delimiter or a `\`-command (`\triangle`, `\parallel`, `\frac`, …). Plain
 *    input uses the Unicode glyphs (△ ∥ ∠ ⊥ · √) and NEVER a `$` or a backslash-command, so this cannot
 *    swallow a real construction — which is why it can run PRE-parse (a `$…$` ratio partial-parses to a
 *    wrong figure, so the post-failure register would miss it). Checked pre-parse.
 *  - `'word-root'` (#246, operator ruling 2026-07-21): a magnitude written with the WORD «שורש N» (the
 *    #105 `שורש→√` normalization handles the forms that DO build, e.g. «AB = שורש 27»; the rest — the area
 *    copula «שטח … שווה לשורש 27» — reach the escalation seam and get the "use the √ symbol" nudge instead
 *    of a paid LLM call). Checked ONLY at the escalation seam, so a form that already builds is untouched.
 */
export const looksLikeLatex = (utterance: string): boolean =>
  /\$[^$\n]*\$/.test(utterance) || /\\[a-zA-Z]{2,}/.test(utterance); // a $…$ span, or a \command (≥2 letters — never a stray backslash)
/** A «שורש N» word-form magnitude (the word + a number/paren). Case-less; the symbol form (√) never matches. */
export const wordRootMagnitude = (utterance: string): boolean => /שורש\s*[\d(]/.test(utterance);
