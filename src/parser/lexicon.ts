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
/** Hebrew optional inflection on an adjective/participle stem: masc pl (`מקבילים`), fem pl
 *  (`מקבילות`), fem sg (`מאונכת`, `מקבילה`), and the CONSTRUCT state (`חוצי זווית`, `משיקי המעגל`).
 *  Longest-first so a greedy read takes `ים` before `י`; the {@link HE_END} boundary makes the order
 *  immaterial, but it keeps the intent readable. */
export const HE_SUFFIX = String.raw`(?:יים|ים|ות|ה|ת|י)?`;

/**
 * #771 — THE MORPHOLOGICAL BOUNDARY, the thing every Hebrew word pattern in this tree was missing.
 *
 * JavaScript's `\b` is defined over `[A-Za-z0-9_]`, so it is **inert around Hebrew letters**: there
 * is no word boundary anywhere inside — or at either end of — a Hebrew word, and `/\bמקביל\b/`
 * silently never matches at all. Every Hebrew keyword pattern therefore behaves as a bare SUBSTRING
 * test, and a stem that is the prefix of a longer, unrelated word matches inside it.
 *
 * Not hypothetical: the Hebrew for **parallelogram** is `מקבילית`, which contains the Hebrew for
 * **parallel** (`מקביל`), so the ADR-292 verb gate read every parallelogram utterance as *stating a
 * parallel relation* and false-blocked the tool's own correct parses to the paid LLM (#771).
 *
 * Only the TRAILING side is guarded, deliberately: Hebrew clitics (ה/ו/ב/ל/כ/מ/ש) attach at the
 * FRONT of a stem, so `המקביל` / `ולמקביל` are the same word, and a leading guard would create false
 * NEGATIVES — a dropped given going unnoticed, which is the dangerous direction. A stem may be
 * followed by its own inflection ({@link HE_SUFFIX}) and by nothing else Hebrew.
 */
export const HE_END = String.raw`(?![א-ת])`;
/** The English twin. `\b` does work for Latin, but spelling it as a lookahead keeps the two halves of
 *  a bilingual pattern symmetrical — and `parallel` ⊂ `parallelogram` is the same trap in English. */
export const EN_END = String.raw`(?![A-Za-z])`;

/** A Hebrew stem plus its own inflection, bounded: matches the word and its forms, never inside a
 *  longer word. NO capture group — wrap at the use site. */
export const heWord = (stem: string): string => String.raw`(?:${stem})${HE_SUFFIX}${HE_END}`;
/** The English twin. `suffix` is per-word because English derivation is not uniform: `bisect` must
 *  still reach `bisector`, while `parallel` must NOT reach `parallelogram`. */
export const enWord = (stem: string, suffix = String.raw`s?`): string => String.raw`(?:${stem})(?:${suffix})${EN_END}`;
/**
 * A bilingual WORD-form keyword — {@link heWord} | {@link enWord}, the shape every atom below uses.
 *
 * The honesty battery's `VERB_GATES` (`parse.ts`) composes through these same helpers, which is what
 * makes #771's class closed rather than its one row fixed: one boundary rule, one place.
 */
export const wordForm = (he: string, en: string, enSuffix = String.raw`s?`): string =>
  String.raw`${heWord(he)}|${enWord(en, enSuffix)}`;

/** The angle noun — single-vav and double-vav spellings (the ADR-3D-032 class: `זוית` keystrokes are
 *  as common as the full `זווית`), plus the symbol and the English word. The stem stops before the
 *  ת so {@link HE_SUFFIX} supplies both the singular (`זווית`) and the plural (`זוויות`). */
export const ANGLE_KW = String.raw`(?:∠|${wordForm(String.raw`זו?וי`, 'angle')})`;
/** Perpendicular (word forms): מאונך/מאונכת/מאונכים/מאונכות + English. Symbol ⟂/⊥ handled where
 *  symbols are read. NOTE `ניצב` is also the NOUN for a right triangle's LEG («הניצב AB»), so a
 *  consumer that must not read a leg as a stated perpendicularity picks its own stems (the honesty
 *  gates do exactly that) rather than taking this atom whole. */
export const PERP_KW = String.raw`(?:${heWord(`מאונ${KAF}`)}|${heWord('ניצב')}|${enWord('perpendicular')})`;
/** Parallel (word forms). The `מקביל` ⊂ `מקבילית` / `parallel` ⊂ `parallelogram` pair is #771's. */
export const PARALLEL_KW = String.raw`(?:${wordForm('מקביל', 'parallel')})`;
/** Meet/cut verbs — the ADR-3D-055 lesson: BOTH nun forms (`נפגש` meet, `פוגש`), both cut families
 *  (`חותך`, `נחתך`), medial-kaf plurals included via KAF+suffix. */
export const MEET_KW = String.raw`(?:${heWord(String.raw`נ?פגש`)}|${heWord('פוגש')}|${heWord(`נ?חת${KAF}`)}|${heWord(`חות${KAF}`)}|${enWord('meet')}|${enWord('intersect')}|${enWord('cut')}|${enWord('cross', String.raw`es`)})`;
/** Tangent (word forms): משיק/משיקים/tangent. */
export const TANGENT_KW = String.raw`(?:${wordForm('משיק', 'tangent')})`;
/** Bisect (word forms): חוצה/חוצי/חוצים/חוצות + the English derivation family — `bisector` included,
 *  which is why this stem declares its own `enSuffix`. */
export const BISECT_KW = String.raw`(?:${wordForm('חוצ', 'bisect', String.raw`s|ed|ing|ors|or|ion`)})`;

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
