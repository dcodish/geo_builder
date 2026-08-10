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
 *  - `oblique-prism` (#321, ADR-3D-078; narrowed by #349/ADR-3D-089) — a prism NOT stated right whose
 *    base has no honest oblique model: a REGULAR pentagon/hexagon (the template would assert unstated
 *    regularity, ADR-052), or a base-less «מנסרה נטויה». Triangle / quad / parallelogram-family bases
 *    now BUILD oblique, so they are deliberately excluded.
 *
 * No-theft invariant (locked by scope3.test.ts): every supported catalog3 example, both locales,
 * classifies null — a real construction never gets a guidance brush-off.
 */

export type ScopeCategory3 =
  | 'valueless-query'
  | 'cross-app'
  | 'bare-solid'
  | 'ui-command'
  | 'oblique-prism'
  | 'lowercase-labels'
  | 'ambiguous-height'
  | 'latin-angle-label'
  // S2 (#378, DoD 12) added two forward-pointing categories; S4 and S3 have since retired both by
  // SUPPORTING their forms. Guidance for something the parser handles is a lie — the #73 no-theft
  // sweep enforces that, and it is what caught the stale entry.
  ;

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
    /**
     * #467 — a height stated from a POINT ALONE. Operator ruling, 2026-08-09: *"גובה מנקודה D in 3d
     * setting should give a message saying there are several options for this and user should give
     * better input."* With no solid and no base named there is genuinely nothing to drop the ⟂ onto, so
     * guessing a plane would assert a given the student never gave (ADR-052) — and unlike #448 this does
     * not become buildable later, so the guidance is the END STATE, not a placeholder.
     *
     * The lookaheads are what keep this honest: any utterance that DOES name a base, a solid, a face or
     * a triangle is a #448 form that parses, so it must never reach here. Belt and braces — the register
     * only runs on a FAILED parse — but a pattern whose own semantics are wrong is a trap for the next
     * person to widen it.
     */
    category: 'ambiguous-height',
    patterns: [
      /^ה?גובה\s+מ(?![\s\S]*(?:ל-?\s*ה?בסיס|פירמידה|מנסרה|משולש|פאה|טטר|ארבעון|חרוט))/,
      /^(?:the\s+)?(?:height|altitude)\s+from\s+(?![\s\S]*(?:base|pyramid|prism|triangle|face|tetrahedr|cone))/i,
    ],
  },
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
    // #247: a leading «נתון/נתונה(:)» is tolerated (the noun stays bare — «נתון מעויין», prod piyrx56a)
    // and the double-yod spelling «מעויין» joins the noun list.
    category: 'cross-app',
    patterns: [
      /^\s*(?:נתו(?:ן|נה)\s*:?\s+)?(?:ה?מעגל|מעגל|עיגול|מלבן|מעויי?ן|טרפז|דלתון|מקבילית)\s*\.?\s*$/,
      // #442 RETIRED the inscription pattern (`חסום במעגל` / `inscribed in a circle`): the 3-D tool now
      // BUILDS a polygon's circumscribed and inscribed circle, so pointing the student at the 2-D app
      // would be guidance for something the parser handles — the lie this register's own header forbids,
      // and the third category retired this way after S3/S4.
      /^\s*(?:given\s+a\s+)?(?:circle|rectangle|rhombus|trapezoid|kite|parallelogram)\s*\.?\s*$/i,
    ],
  },
  {
    /**
     * #394 — an angle labelled with a LOWERCASE LATIN letter («60<a<90», prod 2026-07-28).
     * **Operator ruling (2026-07-29, re-affirming earlier ones): not supported, and the student is told
     * what to use instead.** Lowercase latin is this product's vector/parameter namespace (u,v,w and
     * t,k,m), so admitting it as an angle label would collide with it — this is a deliberate
     * NON-feature, and its end state is guidance, never a build.
     *
     * Both supported forms are offered by the message: name the angle by its POINTS («∠ABC», whose
     * bounds already work — ADR-3D-064) or use a Greek label from the palette («60 < α < 90»,
     * ADR-3D-063).
     *
     * The guard that keeps it honest: a parameter-SIGN given («t > 0», «k חיובי», ADR-3D-079) is the
     * same shape and must never be stolen. Two things prevent it — the register only runs on a FAILED
     * parse (those forms parse), and the pattern demands a two-sided bound or an explicit angle noun,
     * which a sign given never has.
     */
    category: 'latin-angle-label',
    patterns: [
      // a TWO-SIDED numeric bound around a lone lowercase letter: 60<a<90, 60 ≤ a ≤ 90.
      // The RESERVED letters are excluded by name — «60<t<90» is a student bounding the figure
      // PARAMETER, and answering it with "use ∠ABC or α" would be guidance about the wrong thing; it
      // stays an honest not-understood until a parameter-bound form exists.
      /^\s*\d+(?:\.\d+)?\s*[<≤]\s*(?![tkmuvwxyz](?![a-z]))[a-z]\s*[<≤]\s*\d+(?:\.\d+)?\s*$/,
      // Deliberately NOT extended to «זווית a» / «angle a = 60»: the #181 ANCHORED UPLIFT already owns
      // a single letter after an angle noun — it reads as the point label A and «angle b = 60» builds
      // the vertex angle at B. Steering that to "use ∠ABC or α" would describe something the tool did
      // not do. The two-sided bound is the reported form precisely because no anchor precedes the letter.
    ],
  },
  {
    // a bare solid noun whose BASE is deliberately required (ADR-3D-008) — say what to add.
    // #247: «פרמידה» (missing-yod spelling) + the same «נתון» prefix tolerance.
    category: 'bare-solid',
    patterns: [/^\s*(?:נתו(?:ן|נה)\s*:?\s+)?(?:ה?פי?רמידה|מנסרה)\s*\.?\s*$/, /^\s*(?:given\s+a\s+)?(?:pyramid|prism)\s*\.?\s*$/i],
  },
  {
    // #321 (ADR-3D-078), narrowed by #349 (ADR-3D-089): a prism NOT stated right whose base has no
    // honest oblique model. Since #349 obliqueness is a MODIFIER of any prism kind, so the triangle /
    // general-quad / parallelogram-family bases all BUILD oblique and are excluded here.
    // What REMAINS refused:
    //  - a REGULAR pentagon/hexagon base — the only template asserts regularity, which the student did
    //    not state (ADR-052), so building it would invent a given;
    //  - an explicitly-oblique «מנסרה נטויה» / «oblique prism» with NO base noun — the base is missing,
    //    the same ambiguity as the bare «מנסרה» (`bare-solid`).
    category: 'oblique-prism',
    patterns: [
      // the noun is anchored to the base marker / the adjectival slot, so a failed utterance that merely
      // MENTIONS a pentagon near an existing prism is never stolen from the LLM lane
      /^(?!.*ישרה)(?=.*מנסרה)[\s\S]*(?:שבסיס[הו]\s+ה?(?:מחומש|משושה)|מנסרה\s+(?:מחומשת|משושה))/,
      /^(?!.*ישרה)(?=.*מנסרה\s+נטויה)(?!.*(?:שבסיס[הו]|משולשת|מרובעת|מקבילון))/,
      /^(?!.*\bright\b)(?=.*\bprism\b)[\s\S]*(?:\b(?:pentagonal|hexagonal)\s+prism\b|\b(?:pentagon|hexagon)\s+base\b|\bbase\s+is\s+(?:a\s+)?(?:pentagon|hexagon)\b)/i,
      /^(?!.*\bright\b)(?=.*\boblique\b)(?=.*\bprism\b)(?!.*\bbase\b)/i,
    ],
  },
  // S4 (#378, ADR-3D-104): the `seg-parallel-given` guidance is RETIRED — «AB מקביל ל-CD» is now
  // a supported given (it drives, the plural spelling lowers identically). Guidance for a form the
  // parser handles would be a lie, so the category is deleted rather than reworded.
  // S3 (#378, ADR-3D-105): the `plane-plane-rel` guidance is RETIRED for the same reason — a
  // plane↔plane ∥/⟂ is now a supported given. Both of S2's guidance categories have now been
  // consumed by the slices they were pointing forward to, which is what guidance is FOR.
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

/**
 * #353 (ADR-397, operator ruling 2026-07-26): a candidate re-spelling of an utterance whose NODE labels
 * were typed lowercase — «as=w» for «AS=w». The 2-D `upperCasedLabelCandidate` COPIED per docs/20 §12
 * (the guidance registers are deliberately never shared across products).
 *
 * The 3-D convention is load-bearing in both directions: node labels are UPPERCASE, while lowercase
 * letters are vectors (u, v, w), parameters (t, k, m) and coordinates (x, y, z) — and angle measures are
 * GREEK (α, β, γ, θ; the operator's ruling: a latin `a` is not an acceptable angle label). So the case is
 * never silently accepted; the caller offers the convention as guidance, and only when it would actually
 * have helped: this returns the upper-cased candidate, the caller re-parses it, and the note fires only if
 * that candidate parses. A genuine gap fails either way and stays a genuine gap.
 *
 * Only maximal 2–4 character lowercase runs are lifted — a single lowercase letter is far more likely a
 * vector/parameter than a node, and lifting it would fight the convention being taught.
 */
/** A plane equation with SYMBOLIC coefficients (`ax+by+cz+d=0`, issue #339) — those lowercase letters are
 *  coefficients, never nodes (operator: "except for the plane equation we have open where aX+bY+cZ+D=0
 *  are not nodes"), so the family is excluded by construction. */
const SYMBOLIC_PLANE_EQ3 = /[a-z]\s*[xyz]\s*[-+=]/;
export function upperCasedLabelCandidate3(utterance: string): string | null {
  if (SYMBOLIC_PLANE_EQ3.test(utterance)) return null;
  let changed = false;
  const out = utterance.replace(/(?<![A-Za-z])([a-z][a-z0-9']{1,3})(?![A-Za-z])/g, (run: string) => {
    changed = true;
    return run.toUpperCase();
  });
  return changed ? out : null;
}
