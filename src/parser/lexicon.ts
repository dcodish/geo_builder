/**
 * THE lexical atoms (S2.1 of docs/24 — closes the docs/23 G3 generator's supply line).
 *
 * The docs/23 review measured the cost of having no lexical layer: the point-label fragment was
 * re-spelled 342× in parse.ts (163× in parse3.ts), the number grammar existed under three names
 * (`num`/`COEF`/`isNumChunk`), the angle-keyword alternation ~21×, and Hebrew morphology (final
 * kaf, single/double-vav, plurals) was handled per-regex — which is exactly how the recurring
 * "proxy-signal" lexical defect family kept re-opening (ADR-3D-068/069/071, the זוית sweep of
 * ADR-3D-032, the מאונ[ךכ] trap of ADR-3D-035, the נפגש gap of ADR-3D-055). Everywhere a shared
 * atom was introduced (`splitTopLevelTerms`, `LINE_CUT`, `NUMTERM`), the class closed and stayed
 * closed.
 *
 * REGISTRY RULES (docs/17 §3 — this file is a registered chokepoint):
 *  - NEW rules must compose their regexes from these atoms, never re-spell a fragment inline.
 *  - EXISTING inline fragments are swept onto the atoms opportunistically; the ratchet test
 *    (`lexical-ratchet.test.ts`) records the current inline counts and fails on ANY growth, so the
 *    debt can only shrink. (A blind mass regex substitution was deliberately rejected: the atoms
 *    carry NO capture groups precisely so that adopting one never renumbers a rule's captures —
 *    wrap in `(...)` at the use site.)
 *  - Adding an atom or changing an alternation is a parse-behavior change — same scrutiny as a rule.
 *
 * All atoms are SOURCE FRAGMENTS (strings for `new RegExp`) with no capture groups and no anchors.
 */

// ── Labels ────────────────────────────────────────────────────────────────────────────────────────
/** A point-label token: one Latin letter + optional glued digits (`A`, `B2`, `O1`). Case-insensitive
 *  contexts must validate case at the use site (see parse.ts `isUpperLabel`). */
export const LABEL = String.raw`[A-Za-z]\d*`;
/** An explicitly-uppercase label (the student-vertex convention). */
export const ULABEL = String.raw`[A-Z]\d*`;
/** A RUN of ≥2 glued uppercase labels — a segment/polygon name (`AB`, `ABCD`, `A1B2`). */
export const LABEL_RUN = String.raw`(?:[A-Z]\d*){2,}`;

// ── Numbers ───────────────────────────────────────────────────────────────────────────────────────
/** The one number fragment: optional sign, decimal point allowed. NO capture — wrap at use site.
 *  (parse.ts's legacy `num` aliases `(${NUM})`; `COEF`/`isNumChunk` are its other historical names.) */
export const NUM = String.raw`-?\d+(?:\.\d+)?`;

// ── Keywords (bilingual, morphology handled ONCE) ────────────────────────────────────────────────
/** Hebrew kaf in both positional forms — the ADR-3D-035 recorded trap (`מאונ[ךכ]` — a final-ך-only
 *  gate silently rejects the plural `מאונכים`, where kaf is medial). */
export const KAF = String.raw`[כך]`;
/** Hebrew optional plural/feminine verb suffix (masc pl / fem pl / fem sg). */
export const HE_SUFFIX = String.raw`(?:ים|ות|ת)?`;
/** The angle noun — single-vav and double-vav spellings (the ADR-3D-032 class: `זוית` keystrokes are
 *  as common as the full `זווית`), plus the symbol and the English word. */
export const ANGLE_KW = String.raw`(?:∠|זו?וית|angle)`;
/** Perpendicular (word forms): מאונך/מאונכת/מאונכים/מאונכות + English. Symbol ⟂/⊥ handled where
 *  symbols are read. */
export const PERP_KW = String.raw`(?:מאונ${KAF}${HE_SUFFIX}|ניצב${HE_SUFFIX}|perpendicular)`;
/** Parallel (word forms). */
export const PARALLEL_KW = String.raw`(?:מקביל${HE_SUFFIX}|parallel)`;
/** Meet/cut verbs — the ADR-3D-055 lesson: BOTH nun forms (`נפגש` meet, `פוגש`), both cut families
 *  (`חותך`, `נחתך`), medial-kaf plurals included via KAF+suffix. */
export const MEET_KW = String.raw`(?:נ?פגש${HE_SUFFIX}|פוגש${HE_SUFFIX}|נ?חת${KAF}${HE_SUFFIX}|חות${KAF}${HE_SUFFIX}|meets?|intersects?|cuts?|crosses)`;
/** Tangent (word forms): משיק/משיקים/tangent. */
export const TANGENT_KW = String.raw`(?:משיק${HE_SUFFIX}|tangent)`;

// ── Gate-neutral vocabulary (#497 — the fail-closed leftover gate) ───────────────────────────────
/** Hebrew tokens a shape rule may legitimately leave unconsumed: bare connectives/copulas a construct
 *  sentence wraps around its nouns, plus the convexity adjectives a POST-PASS (`withStatedConvexity`),
 *  not the claiming rule, consumes («דלתון קמור»). Everything else that survives a rule's own
 *  vocabulary + labels is CONTENT — unknown words included, which is the point: the gate fails
 *  CLOSED. Growing this list costs an unnecessary LLM escalation; growing the old denylist's gaps
 *  cost a WRONG figure under a green ✓. */
export const NEUTRAL_HE_WORDS = String.raw`של|עם|גם|הוא|היא|זה|זו|כך|אז|אחר(?:ת|ים|ות)?|קמור(?:ה|ים|ות)?|קעור(?:ה|ים|ות)?`;
/** The English twin — FILLER/REQUEST_WORDS (parse.ts) are stripped before the gate tokenizes, so only
 *  the post-pass adjectives and the request/copula words those regexes lack belong here. */
export const NEUTRAL_EN_WORDS = String.raw`convex|concave|sketch|construct|let|be|another|other|whose`;

/** Compile an atom-composed fragment case-insensitively (the parser's convention). */
export const rx = (fragment: string, flags = 'i'): RegExp => new RegExp(fragment, flags);
