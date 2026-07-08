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

export type ScopeCategory = 'analytic' | 'angle-relation' | 'proof' | 'compute' | 'unrelated';

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
];

/**
 * Tokens suggesting a REAL construction: a point label, a number, a math/angle symbol (these are
 * CASE-SENSITIVE — a label is an UPPERCASE letter, so a lowercase greeting isn't mistaken for one)…
 */
const GEO_SYMBOL = /[A-Z]\d*|\d|[∠°⊥⟂∥√△▲◯=<>]/;
/** …or a geometry keyword in Hebrew or English (case-insensitive). Text with NONE of these is `unrelated`. */
const GEO_KEYWORD =
  /נקוד|זווי|ישר|קטע|מעגל|עיגול|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|מקביל|אנך|מאונך|חוצה|תיכון|גובה|קוטר|מיתר|רדיוס|משיק|חותך|דלתון|מחומש|משושה|צלע|point|line|segment|circle|triangle|square|rectangle|quad|angle|tangent|chord|radius|diameter|perpendicular|parallel|bisect|median|midpoint|pentagon|hexagon/i;

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
