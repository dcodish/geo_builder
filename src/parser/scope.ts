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
 *   - `angle-relation` — named angle relationships / theorem names (alternate/corresponding/co-interior
 *     angles, Pythagoras, Thales…). The tool DETECTS and surfaces these (Phase 6); they're never typed.
 *   - `proof`          — "prove / show that / הוכח". The tool draws figures, it doesn't write proofs.
 *   - `compute`        — "calculate / find the value / חשב". The tool constructs, it doesn't compute answers.
 *   - `unrelated`      — free text with NO geometric construction signal at all (greeting, question, gibberish).
 *
 * Extending it: add a pattern to the relevant rule's `patterns` (bilingual). Keep patterns SPECIFIC —
 * they must NOT match a legitimate construction (a real gap must stay a real gap, not be mislabelled).
 */

export type ScopeCategory = 'angle-relation' | 'proof' | 'compute' | 'unrelated';

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
  /נקוד|זווי|ישר|קטע|מעגל|משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|מקביל|אנך|מאונך|חוצה|תיכון|גובה|קוטר|מיתר|רדיוס|משיק|חותך|דלתון|מחומש|משושה|point|line|segment|circle|triangle|square|rectangle|quad|angle|tangent|chord|radius|diameter|perpendicular|parallel|bisect|median|midpoint|pentagon|hexagon/i;

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
