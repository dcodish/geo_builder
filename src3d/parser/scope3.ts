/**
 * #73 (ADR-3D-040): the 3-D GUIDANCE register — the 2-D scope.ts pattern, COPIED per docs/20 §12
 * (never shared). Runs ONLY on a failed parse (App3 consults it before the LLM escalation): a match
 * yields a tailored "what to do instead" message (i18n key `scope.<category>`) + a `scope:<category>`
 * analytics tag, so the dashboard separates deliberate non-features from genuine gaps.
 *
 * Families (each from VERBATIM prod utterances, baseline log-triage 2026-07-11):
 *  - `valueless-query` — «הזווית בין הישר AC' לבין המישור ABCD», «∠DEF=?», «מצא את הזווית D'FD»:
 *    the reproduce-verify charter (ADR-3D-027) — the tool enforces/verifies STATED values, it
 *    doesn't solve; the message says to state the value.
 *  - `cross-app` — a bare 2-D noun («מעגל», «מלבן», «מעוין», «חסום במעגל») → the 2-D Geo Builder
 *    (a circle in R³ IS supported, in the tangent form — the message shows it).
 *  - `bare-solid` — a bare «פירמידה»/«מנסרה» (deliberately refused, the base is ambiguous): say
 *    WHAT to add instead of a flat refusal.
 *  - `ui-command` — «סימון זווית ישרה D»: marks derive from givens; state the given («זווית D = 90»).
 *
 * No-theft invariant (locked by scope3.test.ts): every supported catalog3 example, both locales,
 * classifies null — a real construction never gets a guidance brush-off.
 */

export type ScopeCategory3 = 'valueless-query' | 'cross-app' | 'bare-solid' | 'ui-command';

export interface ScopeMatch3 {
  category: ScopeCategory3;
  /** i18n key for the tailored student-facing message. */
  messageKey: string;
}

interface ScopeRule3 {
  category: ScopeCategory3;
  patterns: RegExp[];
}

const RULES3: ScopeRule3[] = [
  {
    // marks derive from GIVENS — state the given itself. Before valueless-query (its ∠ pattern is generic).
    category: 'ui-command',
    patterns: [/סימון\s+זו?וית|תסמן|סמנו?\s+זו?וית|תוסיף\s+(?:את\s+)?ה?זוו?יות/, /\bmark\b.*\bangles?\b/i],
  },
  {
    category: 'valueless-query',
    patterns: [
      /^\s*∠\s*[A-Za-z]{1,3}\d*'?\s*(?:=\s*\??|\?)\s*$/, // a QUERY only: ∠DEF? · ∠DEF= · ∠DEF=? — NOT bare ∠DEF or ∠DEF=α (those BUILD a marker, #94)
      // "the angle between …" with NO stated value (a valued form has =/היא/is/a digit and PARSES)
      /^ה?זו?וית\s+בין(?![\s\S]*(?:=|היא|הוא|\bis\b|\d))/,
      /^the\s+angle\s+between(?![\s\S]*(?:=|\bis\b|\d))/i,
      /^מצא(?:ו|י)?\s+(?:את\s+)?ה?זו?וית|^מהי\s+ה?זו?וית|^find\s+(?:the\s+)?angle|^what\s+is\s+(?:the\s+)?angle/i,
    ],
  },
  {
    // a BARE 2-D noun — plane-geometry work belongs in the 2-D Geo Builder. Single-word / inscribed
    // forms only, so the SUPPORTED in-space circle («מעגל שמרכזו O משיק לישר AB») is never touched.
    category: 'cross-app',
    patterns: [
      /^\s*(?:ה?מעגל|מעגל|עיגול|מלבן|מעוין|טרפז|דלתון|מקבילית)\s*\.?\s*$/,
      /חסום\s+במעגל|inscribed\s+in\s+(?:a\s+|the\s+)?circle/i,
      /^\s*(?:circle|rectangle|rhombus|trapezoid|kite|parallelogram)\s*\.?\s*$/i,
    ],
  },
  {
    // a bare solid noun whose BASE is deliberately required (ADR-3D-008) — say what to add.
    category: 'bare-solid',
    patterns: [/^\s*(?:ה?פירמידה|פירמידה|מנסרה)\s*\.?\s*$/, /^\s*(?:pyramid|prism)\s*\.?\s*$/i],
  },
];

/** Classify a FAILED utterance into a guidance family, or null = a genuine gap (stays not-understood). */
export function classifyGuidance3(utterance: string): ScopeMatch3 | null {
  const s = utterance.trim();
  if (!s) return null;
  for (const rule of RULES3) {
    if (rule.patterns.some((p) => p.test(s))) return { category: rule.category, messageKey: `scope.${rule.category}` };
  }
  return null;
}
