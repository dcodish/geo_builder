/**
 * The 3-D tool's deterministic grammar parser (docs/20 §6.5) — V0 rule set.
 *
 * Same architecture as the 2-D parser (transplanted as a PATTERN, not imported —
 * docs/20 §12 rule 1): an ordered, first-match-wins rule list; each rule returns
 * commands or null; unmatched input returns { ok:false, reason:'not-handled' }
 * (the honest refusal — the LLM fallback arrives in a later slice).
 *
 * Tokens: a point is an uppercase letter + optional digits + optional prime,
 * canonicalised to ASCII `'` (U+2032/’ normalised here — ADR-3D-001). Labels may
 * be glued (`ABCDA'B'C'D'`). Lowercase words never yield tokens (`Cube` ≠ point C).
 *
 * V0 honesty rules:
 *  - `מנסרה` WITHOUT `ישרה`/right is NOT handled — an oblique prism is real
 *    geometry we don't support yet; assuming "right" would assert an unstated
 *    given (ADR-052). Same for a stated ratio clause that doesn't validate:
 *    refuse rather than silently drop it.
 */

import { readOperand, readRelationSides } from './operandToken';
import { stripFormatControls } from '../../shell/bidi';
import { isPlanar, sameOperand } from '../engine/operands';
import type { Command3, Id, LinExpr, MutualRel3, Operand3, PlaneRel3, SolidKind, SolidNoun, SymComp, SymTerm, VecAtom, VecExpr, Circle3Def } from '../engine/types';
import { MAX_SYM_DEGREE, soleSymOf, symsOfAffine } from '../engine/types';
import { DECL_WORDS_EN, DECL_WORDS_HE, HE_PREFIX } from '../lexicon/nouns3';
import { CYCLIC_MEMBER, type QuadBase } from '../engine/baseShapes';
import { riderPairsT } from '../engine/onSegmentRatio';

export type ParseResult3 =
  | { ok: true; commands: Command3[] }
  | { ok: false; reason: 'not-handled' }
  // bare `AS = AB` — vector equation or length equality? NEVER assumed (operator rule):
  // the student is asked to write וקטור AS = וקטור AB (or with the ⃗ arrow), or |AS| = |AB|.
  | { ok: false; reason: 'ambiguous-vector-length' }
  // #516: «x=m(m-1, 5-m, -2)» — one letter as BOTH the running parameter and a figure DOF. A typed
  // refusal, never `not-handled`: an ambiguity the parser RECOGNIZED must surface a clarification,
  // because `not-handled` escalates to the LLM lane, whose job is to guess — and it resolved exactly
  // the ambiguity this guard refused to resolve (built the `t` reading, silently rewriting the
  // student's letter). A refusal implemented as a decline is not a refusal.
  | { ok: false; reason: 'param-roles-conflated'; letter: string }
  // #836: «אלכסון ראשי» / «האלכסון הראשי» used as a REFERENCE — a cube or box has FOUR space diagonals,
  // so the role phrase names none of them. Operator ruling 2026-08-31: *"there is more than one אלכסון
  // ראשי so we should ask user to indicate the letters."* A typed refusal, never `not-handled`: the LLM
  // answered this line by PICKING one, which is exactly the invented given (ADR-052) the clarify exists
  // to prevent. The candidate PAIRS are not listed here — `parse3` is context-free by design — they are
  // derived from the figure's own rings where the construction is known (the store), so the message can
  // name them.
  | { ok: false; reason: 'ambiguous-main-diagonal' };

const NOT_HANDLED: ParseResult3 = { ok: false, reason: 'not-handled' };

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Lowercase point labels in LABEL POSITION → uppercase (#181, the 2-D `up()` discipline copied per
 * docs/20 §12 — never imported). 3-D has CASE-SIGNIFICANT tokens 2-D lacks (axes x/y/z, parameters
 * k/m/t, vector names u/v/w, R vs r, ℓ), so a blanket `/i` is impossible; instead a lowercase run is
 * uplifted only where an ANCHOR proves it is a label — after the angle glyph/word («∠sdb», «זווית sdb»)
 * or after an explicit point/vertex noun («הקודקוד c», «הנקודות a ו-b»). The lone axis letters x/y/z
 * are never uplifted (a student's «נקודה x» stays theirs to disambiguate), and after an ENGLISH anchor
 * a run is uplifted only when it isn't an English function word ("angle of …", "point of intersection").
 * New label-demanding anchors join HERE — the one chokepoint — never per-rule.
 */
const EN_STOP = new Set(['of', 'at', 'in', 'on', 'is', 'to', 'the', 'and', 'are', 'for', 'its', 'was', 'has', 'be', 'by', 'a', 'an', 'no', 'not', 'it', 'all', 'any', 'one', 'two']);
function upliftLowercaseLabels(s: string): string {
  const LIST = String.raw`[A-Za-z][A-Za-z0-9']{0,5}(?:\s*(?:,|ו-?|\band\b)\s*[A-Za-z][A-Za-z0-9']{0,5})*(?![A-Za-z])`;
  const upTokens = (list: string, en: boolean) =>
    list.replace(/\b[a-z][a-z0-9']*/g, (t) => (/^[xyz]$/.test(t) || (en && EN_STOP.has(t)) ? t : t.toUpperCase()));
  return s
    .replace(new RegExp(String.raw`((?:[∠∡∢]|זו?וית|ה?קודקוד(?:ים)?|ה?נקוד(?:ה|ות))\s*)(${LIST})`, 'g'), (_m, pre: string, list: string) => `${pre}${upTokens(list, false)}`)
    .replace(new RegExp(String.raw`(\b(?:angle|points?|vert(?:ex|ices))\s+)(${LIST})`, 'gi'), (_m, pre: string, list: string) => `${pre}${upTokens(list, true)}`);
}

/** Normalise an utterance: strip invisible bidi/format controls, unify primes to `'`, strip vector
 *  arrows (AB→ ≡ AB), unify minus/maqaf to `-`, collapse whitespace, uplift anchored lowercase
 *  labels (#181). */
export function normalize3(s: string): string {
  // #751 (ADR-W-029): the control set is the SHARED one (shell/bidi) — it had three copies.
  return upliftLowercaseLabels(
    stripFormatControls(s)
      // #531 ([ADR-3D-144](../../docs/06b-decisions-3d.md)): INVISIBLE bidi/format controls are not
      // something the student typed — the APP injects them (`isolateLtrRuns3` isolates LTR runs for
      // display, ADR-3D-116/121), and the rendered fact list is text the student SELECTS AND COPIES
      // (the tool itself teaches that workflow, #525). Prod hit twice in one day: a leading U+2066
      // made the fully-supported «מישור x+2y-2z+28=0» refuse and burn a paid LLM call, with nothing
      // visible to act on. Stripped HERE — the one boundary every rule, honesty gate, scope register
      // and LLM lane reads (the prime's seam) — never per-rule and never in the UI: paste from a PDF
      // or another RTL editor carries the same controls. The invariant this restores: display-layer
      // transforms can never reach the parser.
      // AMENDED by #751 (ADR-W-029): "the stored fact stays RAW" was the half that did not hold up.
      // Cleaning only here protects the GRAMMAR; the fact list is also saved, logged, exported and
      // compared, and a chip-seeded utterance carried U+2066/U+2069 into all four (the .docx printed
      // them as missing-glyph boxes). The store now strips at its own boundary with the SAME shared
      // set, so both copies are clean and save/load still round-trips to the same parse.
      // NBSP → space + collapse doubled spaces — the same paste paths carry both (the prod log's
      // «מישור  x+…» double space), and a literal-space gate must not care which space arrived.
      .replace(/ /g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/[′’‘`]/g, "'")
      .replace(/[→⃗⟶]/g, '')
      .replace(/[−־]/g, '-')
      // #773 — a SCRIPT TRANSITION is a token boundary, in both directions.
      //
      // Hebrew and Latin runs carry no separator of their own, so a missing space between them is not a
      // typo the student can see: «Eעל BB'» renders identically to «E על BB'» in an RTL box, and only
      // the second one parsed. #530 (a P1) fixed exactly this for «נחתכים בנקודהS» — but AT THE RULE,
      // by making that rule's own marker separator optional, so every other He/Latin boundary in the
      // grammar stayed broken. #494 fixed the mirror direction (a DETACHED clitic) HERE, at the
      // normaliser, which is the shape that generalises. This is that fix's other half.
      //
      // Prod, 2026-08-19…24: «Eעל bb'» reached the paid LLM, and only the LLM read it.
      //
      // Placed BEFORE the vector-word strip and the clitic fold, because both of those read a SPACE
      // they can only see once the boundary exists («וקטורSE» must become «וקטור SE» before the word
      // «וקטור» can be recognised and dropped).
      //
      // The single guard, and why it is a length bound rather than a word list: Hebrew's prefixes
      // ל/ב/מ/ה/ש/כ/ו are written GLUED to their operand, the whole grammar spells them that way
      // (`ל?מישור`, `ב-?`), and #494 deliberately glues a detached one — so «לAB» must survive. A
      // prefix is ONE letter, so requiring two adjacent Hebrew letters protects every glued clitic
      // while leaving every WORD to split. A first draft exempted runs made only of clitic letters
      // instead; «משולש» is spelled entirely from that set (מ‑ש‑ו‑ל‑ש), so the exemption silently
      // swallowed the commonest noun in the corpus. Measured, not reasoned: the catalog-wide property
      // below is what caught it.
      .replace(/([A-Za-z][A-Za-z0-9']*)(?=[א-ת])/g, '$1 ')
      .replace(/([א-ת]{2,})(?=[A-Za-z])/g, '$1 ')
      .replace(/(?:^|(?<=[\s:,]))(?:ה?ו?וקטור|vectors?)\s+/gi, '') // the vector WORD marks vector meaning (recorded before normalize), then reads as decoration
      // #494 — a DETACHED clitic re-binds to its operand. Hebrew's ל/ב/מ/ה/ש/כ are prefixes, and every
      // gate in this tree spells them glued (`ל?מישור`, `ב-?`), so «מקביל ל π1» was not-handled while
      // «מקביל לπ1» parsed. The spaced form is not a typo: a Hebrew writer separates the prefix exactly
      // when the operand is a SYMBOL rather than a word, because «לπ1» looks wrong — so the failing form
      // is the natural keystroke in precisely the figures that need it, and it was escalating to the LLM,
      // burning a paid call for a non-deterministic answer (the silent-cost failure, not a visible one).
      // Folded HERE rather than per-rule so every frame inherits it, including frames added later — the
      // ADR-3D-120 shared-vocabulary seam, one level lower. «ו» is deliberately NOT in the set: it is the
      // conjunction between labels («A ו B»), not a prefix, and gluing it would corrupt label lists.
      .replace(/(?<![א-ת])([לבמהשכ])\s+(?=[א-תA-Zπℓ])/g, '$1')
      // «מעויין» → «מעוין» (#498, the ADR-405 fold ported): the plene spelling was HALF-supported —
      // `statedQuadBase` reads `מעויי?ן`, but `rhombusPrism` and `rightPrism`'s rhombus bail-out spell
      // the defective form only, so «מנסרה ישרה שבסיסה מעויין …» fell through to the TRIANGULAR default
      // and dropped the stated base (caught downstream by `droppedShapeNoun3`, but only as a refusal).
      // Folding at the one boundary every rule reads makes the whole grammar accept both spellings.
      .replace(/מעויין/g, 'מעוין')
      // «זוות» → «זווית» (#498, the #497 fold ported): the one OBSERVED misspelling of the angle noun
      // (operator report, 2026-08-10 — «משולש ישר זוות ABC» drew a bare triangle). Phonetically
      // identical, not a Hebrew word of its own. Folding it HERE — the one boundary every rule reads —
      // makes the whole ישר-זווית family read it; unobserved variants (זויית, זות…) are deliberately NOT
      // enumerated: they hit the fail-closed declaration gate and escalate to the LLM, whose job is
      // typos. Guarded on both sides so it can never fire inside another word («זוויות» is untouched).
      .replace(/(?<![א-ת])זוות(?![א-ת])/g, 'זווית')
      .replace(/½/g, '1/2')
      .replace(/¼/g, '1/4')
      .replace(/¾/g, '3/4')
      .replace(/⅓/g, '1/3')
      .replace(/⅔/g, '2/3')
      .replace(/\s+/g, ' ')
      .trim()
      // ADR-3D-079 Am. 2: a trailing sentence period is decoration (book lines end with «.» —
      // «t פרמטר חיובי.» used to dead-end); a decimal never ends in a bare dot, so this is safe
      .replace(/\s*\.+$/, ''),
  );
}

const TOKEN = /[A-Z]\d*'?/g;
/** The label-token SOURCE fragment (no captures) — compose new rules from this, never re-spell
 *  the fragment inline (the S2.1 lexical-ratchet discipline). */
const LBL = String.raw`[A-Z]\d*'?`;

/**
 * #486 — Hebrew noun gates, shared. Two things a student writes freely and a hand-written rule keeps
 * forgetting:
 *
 * 1. **The definite article is optional.** «B על מישור π2» and «B על המישור π2» are the same sentence;
 *    a gate spelling only the second is a SILENT drop, which then costs a paid LLM call on input the
 *    parser can already lower. This is the register in `src3d/CLAUDE.md` (`מאונ[ךכ]`, `זו?וית`,
 *    `ניצבים?`) — the article is the same class and belongs in it.
 * 2. **The subject noun is optional.** «הנקודה B …» / «נקודה B …» / «B …» all name the same point.
 *
 * Written once and consumed by the rules, so a rule added later inherits the tolerance instead of
 * re-learning it one report at a time.
 */
const HE_PLANE = String.raw`ה?מישור`;
const HE_LINE = String.raw`ה?ישר`;
const HE_SEG = String.raw`ה?(?:קטע|צלע|מקצוע)`;
/** An optional «the point» / «the vertex» before a label. */
const HE_SUBJ = String.raw`(?:ה?(?:נקוד[הת]|קודקוד)\s+)?`;
/**
 * #640 — the DEFINING-BODY separator, shared. A rule of the shape «<noun> <name><sep><body>» — a
 * parametric line, a plane equation — reads three optional things before the body: the noun, its
 * definite article (both above), and the SEPARATOR between the name and the body. The separator was
 * spelled privately by each rule and the two drifted apart: `parametricLine` demanded a literal `:`
 * (so «ישר l x=…», the form the book prints, was a paid LLM call), while `planeByEquation` accepted a
 * spaced dash by ACCIDENT — it fell into the equation and became a unary minus, so «מישור π1 - x+y+z=1»
 * silently built the plane «-x+y+z=1». One reader, so the tolerance and the reading are the same
 * everywhere.
 *
 * A spaced dash counts as a separator only AFTER a name («π1 - x+…»); a glued minus («π1 -x+…», or a
 * dash with no name before it) is the student's sign and is left in the body. That is typography, not
 * a per-input rule: a leading negative is written glued or after a colon, and a name-then-dash is how
 * a book labels a defining line.
 */
/**
 * The head of a defining statement: an optional noun (article included), the object's NAME, and the
 * separator `defBody` reads. Returns `[full, name, body]` so a rule reads its two halves positionally.
 * The BODY stays each rule's own strict gate — a permissive head can therefore never steal an utterance
 * from a later rule: a rule whose body does not match declines and the registry moves on.
 */
function matchDefHead(s: string, nounSrc: string, nameSrc: string): RegExpMatchArray | null {
  const m = s.match(new RegExp(`^${nounSrc}${nameSrc}([\\s\\S]*)$`));
  if (!m) return null;
  const name = m[1];
  const body = defBody(m[m.length - 1] ?? '', !!name);
  if (body === null) return null;
  return [m[0], name, body] as unknown as RegExpMatchArray;
}

function defBody(rest: string, named: boolean): string | null {
  const colon = rest.match(/^\s*:\s*(\S.*)$/); // `:` — always a separator
  if (colon) return colon[1];
  const copula = rest.match(/^\s+(?:הוא|is)\s+(\S.*)$/i); // the copula
  if (copula) return copula[1];
  if (named) {
    const dash = rest.match(/^\s+[-–—]\s+(\S.*)$/); // a SPACED dash after a NAME
    if (dash) return dash[1];
  }
  const bare = rest.match(/^\s*(\S.*)$/); // nothing at all: the body follows the name directly
  return bare ? bare[1] : null;
}

/** The optional «is / lies» copula that can precede a membership verb, in either language. */
const IS_AT = String.raw`(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?`;

/**
 * #485 — the INTERSECTION vocabulary, shared. A crossing is stated in two frames — verb-headed
 * («ℓ חותך את π בנקודה A») and noun-headed («A נקודת החיתוך של ℓ עם π») — and a rule that spells only
 * one silently drops the other. The diagonal-crossing rule already discovered this and centralised the
 * WORDS; the FRAMES stayed per-rule, so every new crossing rule paid the tuition again. Both live here.
 */
const CROSS_HE_VERB = String.raw`חותך|חותכת|פוגש|פוגשת|נחתך|חוצה`;
const CROSS_HE_NOUN = String.raw`נקודת\s+ה?חיתוך|נקודת\s+ה?מפגש|ה?חיתוך|ה?מפגש`;
const CROSS_EN_VERB = String.raw`cuts|intersects|meets|crosses`;
const CROSS_EN_NOUN = String.raw`intersection\s+point|point\s+of\s+intersection|intersection|meeting\s+point`;
// #819 (ADR-3D-177): the inline `RUN_3_4` plane atom is gone — the last rules spelling a plane run
// by hand (`perpPlaneClaim`/`segParallelPlane`) were replaced by `segPlaneRel`, which classifies its
// operands through `readOperand`. The plane-run shape now lives once, in `operandToken.ts` (S2.1: the
// lexical-ratchet counts may only go DOWN).
/** A label RUN: starts an uppercase letter not embedded in a latin word (so `Cube` yields nothing). */
const RUN = /(?<![A-Za-z])[A-Z][A-Z0-9']*(?![a-z])/g;

/** All point tokens in the utterance, in order (glued runs split). */
export function labelTokens(s: string): Id[] {
  const runs = s.match(RUN) ?? [];
  return runs.flatMap((r) => r.match(TOKEN) ?? []);
}

/** The FIRST label run only (a solid's vertex glob), so a later `שבסיסה ABCD` clause
 *  that re-names the base doesn't inflate the vertex count. */
export function firstLabelRun(s: string): Id[] {
  const first = s.match(RUN)?.[0];
  return first ? (first.match(TOKEN) ?? []) : [];
}

const unprimed = (t: Id) => !t.includes("'");
const primeAll = (ts: Id[]) => ts.map((t) => `${t}'`);

// ---------------------------------------------------------------------------
// The fail-closed DECLARATION gate (#498 — the #497 class, 3-D edition)
// ---------------------------------------------------------------------------

/**
 * A solid/polygon DECLARATION rule reads its noun, takes the label run, and builds. Everything it did
 * not read it silently discarded — and every guard written against that was a DENYLIST of correctly
 * spelled vocabulary (the per-rule bow-outs at `planarPolygon`, `rightTriangle`), which necessarily
 * **fails open on a word it has never met**. A typo of a significant modifier is by definition such a
 * word: «משולש ישר זוות ABC» drew a bare triangle with the right angle dropped and a green ✓, exactly
 * as «טרפז ישר זוות» did in 2-D ([ADR-435](../../docs/06-decisions.md#adr-435), #497). Ported as a
 * PATTERN, never imported (docs/20 §12) — the mechanism is the same, the vocabulary is this tree's.
 *
 * The closure: after a rule has consumed its own vocabulary and its labels, every surviving token must
 * be POSITIVELY harmless — declaration vocabulary ({@link DECL_VOCAB}), a neutral connective/request
 * word ({@link NEUTRAL3_HE}/{@link NEUTRAL3_EN}), or a bare prefix remnant. A digit is a stated
 * magnitude this family cannot express; an unclaimed label is an object it did not build; an
 * unrecognised word is a statement nobody read. All three DECLINE the rule, which is the escalation
 * path (`parse3` falls through to `not-handled` → the LLM, whose job is typos).
 *
 * The asymmetry that makes this the right default: growing the neutral list costs one unnecessary LLM
 * call; a gap in the denylist costs a WRONG FIGURE under a green ✓ — the honesty invariant.
 *
 * **Division of labour with the honesty gates.** A noun that IS known vocabulary but produced no
 * object is `droppedConstructNoun3`'s business ({@link CONSTRUCT_NOUNS} — «אלכסון» on a box, «גובה» on
 * a pyramid), and those nouns are therefore part of the gate's known vocabulary rather than leftovers:
 * they get the honest refusal that ADR-3D chose for them, not a paid escalation. This gate answers the
 * question no gate could: *was there a word here that no vocabulary knows at all?*
 */

/**
 * The CONSTRUCT nouns — objects a student asks to EXIST, which a bare shape declaration can never be.
 * Lives here (rather than in `honesty3.ts`, which imports this module) so the declaration gate and
 * `droppedConstructNoun3` read ONE list: a noun the gate lets through is exactly a noun the honesty
 * gate is watching, and neither can drift into a silent drop while the other believes it is covered.
 */
// #463: «תיכון» ends in FINAL nun (ן, U+05DF) — a different character from the medial נ — so the stem
// `תיכונ` matched the PLURAL «תיכונים» and never the singular a student actually types. The diagonal
// alternative beside it got this right (`אלכסו[ןנ]`); the median did not, and this tree folds no final
// letters (it spells both forms out everywhere else). A stated median that no command produced was
// therefore ungated — the exact #438/#440 class the gate exists to close, left open for one noun.
export const CONSTRUCT_NOUNS =
  /מעגל|אלכסו[ןנ]|גובה|גבהי|תיכו[ןנ]|חוצ[הת]?[-\s]?זו?וית|\b(?:circle|diagonal|altitude|height|median|bisect\w*)\b/i;

/**
 * Every word the declaration family itself reads: the solid nouns, the base/flat-shape nouns, the
 * qualifiers (`statedTriShape` / `statedQuadBase` / the rightness tests), and the base clause. Written
 * with the tolerances `src3d/CLAUDE.md` records — both kaf/nun forms, `זו?וית`'s single and double vav,
 * the optional definite article and the prosthetic prefixes — because a spelling this list misses is
 * now an ESCALATION rather than a silent drop, which is the safe direction but still a lost parse.
 */
// #753 (ADR-3D-188): the noun vocabulary moved to `src3d/lexicon/nouns3.ts` — a leaf that imports
// nothing, so `engine/queries.ts` can read the SAME words without importing from `parser/`. The gates
// had already drifted three times as private copies; the list itself is unchanged, only its home.
const DECL_VOCAB = new RegExp(`(?:${HE_PREFIX}(?:${DECL_WORDS_HE}))|\\b(?:${DECL_WORDS_EN})\\b`, 'gi');

/** Tokens a declaration sentence may legitimately wrap around its nouns without stating geometry —
 *  the connectives, copulas, request verbs and book-register words. «נתו[נן]…» carries the final-nun
 *  trap the 2-D fix flushed out (the recorded ADR-3D-035 kaf class): the bare «נתון» ends in FINAL nun,
 *  so it can never match as a prefix of «נתונה», whose nun is medial. */
const NEUTRAL3_HE = /^(?:של|עם|גם|הוא|היא|הם|הן|זה|זו|כך|אז|את|יש|כאשר|אשר|במרחב|מרחב|כל|נתו[נן](?:ים|ה|ות)?|שרטט(?:ו|י)?|ציירי?|צייר(?:ו)?|לשרטט|לצייר|אנא|בבקשה|לפניכם|הבא(?:ה)?|נסמן)$/;
const NEUTRAL3_EN = /^(?:a|an|the|is|are|be|of|in|on|with|and|to|it|its|this|that|has|have|whose|let|there|draw|sketch|construct|given|add|please|called|named|space|shown|below)$/i;
/** «הטרפז» → «ה» once the noun is stripped; the prosthetic prefixes, standing alone. */
const HE_PREFIX_REMNANT3 = /^[ובלכשמה]{1,3}$/;

/** Remove the label RUNS a rule CLAIMED — run-aware, because a per-id `\bA\b` can never reach inside a
 *  glued «ABCD» (the removal trap #497 recorded). A run every one of whose tokens is claimed is the
 *  rule's own; a run carrying an UNCLAIMED label survives, and the gate then flags it. */
const removeClaimedRuns = (s: string, ids: Id[]): string => {
  const claimed = new Set(ids);
  return s.replace(new RegExp(RUN.source, 'g'), (r) => {
    const toks = r.match(TOKEN) ?? [];
    return toks.length > 0 && toks.every((t) => claimed.has(t)) ? ' ' : r;
  });
};

/**
 * The gate itself. `ids` are the labels the rule claimed; `consumed` is any EXTRA vocabulary this
 * particular rule read beyond the shared set (e.g. `cubeOrBox`'s space-diagonal phrase, which it
 * emits a segment for). True ⇒ something in the sentence was never read ⇒ the rule must decline.
 */
function declLeftover(s: string, ids: Id[], consumed?: RegExp): boolean {
  let rest = removeClaimedRuns(s, ids);
  if (consumed) rest = rest.replace(consumed, ' ');
  rest = rest.replace(CONSTRUCT_NOUNS, ' ').replace(DECL_VOCAB, ' ');
  for (const t of rest.match(/[A-Za-z0-9']+|[א-ת]+/g) ?? []) {
    if (/\d/.test(t)) return true; // a stated magnitude this family cannot express
    if (/^[A-Za-z]/.test(t)) {
      if (!NEUTRAL3_EN.test(t)) return true; // an unclaimed label, or an unknown English word
    } else if (!NEUTRAL3_HE.test(t) && !NEUTRAL3_HE.test(t.replace(/^[ובלכשמה]{1,3}/, '')) && !HE_PREFIX_REMNANT3.test(t)) {
      return true; // a Hebrew word nothing in this family knows — content, not filler
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Rule = (s: string) => Command3[] | null;

/**
 * Wrap a DECLARATION rule in the fail-closed gate (#498). The labels the rule CLAIMED are read back off
 * the commands it emitted (the `droppedNewLabels3` trick — command type strings and field keys are all
 * lowercase, so an uppercase match in the JSON is a label and nothing else), so the gate needs no
 * per-rule plumbing: it is applied ONCE, in the rule list, and a rule that later grows a new branch or
 * a new label path inherits it rather than having to remember it. `consumed` is extra vocabulary this
 * one rule reads beyond the shared {@link DECL_VOCAB}.
 */
const gated = (rule: Rule, consumed?: RegExp): Rule => {
  const wrapped: Rule = (s) => {
    const cmds = rule(s);
    if (!cmds) return null;
    const claimed = [...new Set(JSON.stringify(cmds).match(/[A-Z]\d*'?/g) ?? [])];
    return declLeftover(s, claimed, consumed) ? null : cmds;
  };
  // The wrapper INHERITS the rule's name: the shadow matrix identifies rules by `fn.name`, so an
  // anonymous wrapper would rename every gated rule to `(anon)` and blind the instrument that measures
  // exactly this kind of change.
  Object.defineProperty(wrapped, 'name', { value: rule.name });
  return wrapped;
};

/**
 * #836 — «אלכסון ראשי» as a REFERENCE asks WHICH one.
 *
 * Prod session `u1y60bg6`, the user's entire session: «קובייה ABCD עם אלכסון ראשי» → not-handled →
 * escalated → the LLM built it, silently choosing one of four space diagonals. Operator ruling
 * (2026-08-31): *"there is more than one אלכסון ראשי so we should ask user to indicate the letters."*
 *
 * A cube or box has FOUR space diagonals (AC', BD', CA', DB'), so the role phrase names none of them.
 * Per [ADR-052](../../docs/06-decisions.md#adr-052) — never a silent pick, never a paid LLM guess — this
 * returns a CLARIFY, which short-circuits before escalation like the rest of the `ambiguous-*` family.
 *
 * WITH letters it simply builds: «אלכסון ראשי AC'» is «אלכסון AC'» with a redundant role word, so the
 * role word is dropped and the ordinary diagonal rule owns the line (a pair that is NOT a space diagonal
 * is then refused by name downstream, rather than silently drawing a face diagonal).
 *
 * NOT in scope, deliberately: the DECLARATION form «תיבה מלבנית עם אלכסון תיבה» (#438, two prod users)
 * keeps building. There the student declares a figure and asks for *a* space diagonal indefinitely —
 * its lock is geometric (any of the four satisfies the box identity) precisely because none is meant in
 * particular. This rule is about a DEFINITE reference to "the main diagonal", which is the one that
 * cannot be answered without asking. The user's full line «קובייה ABCD עם אלכסון ראשי» additionally
 * needs the shape-plus-construct family (#461) and resolves through both once that lands.
 */
const MAIN_DIAGONAL_ROLE = /(?:ה)?אלכסו[ןנ]\s+(?:ה)?(?:ראשי|מרחב(?:י)?)|\bmain\s+diagonal\b/i;

const mainDiagonalRef: Rule = (s) => {
  if (!MAIN_DIAGONAL_ROLE.test(s)) return null;
  // WITH letters the role word is REDUNDANT, not an error — and the line is then owned by `bareSegment`,
  // the ONE rule of the qualified-diagonal family (#449: «אלכסון תיבה AC'», "space diagonal AC'"). The
  // role qualifier was added to that rule's own alternation rather than answered here, so «אלכסון ראשי
  // AC'» lowers to EXACTLY what «אלכסון AC'» lowers to, which is what #836 asks for. Declining here is
  // what lets the family rule win.
  if (labelTokens(s).length > 0) return null;
  // A solid DECLARATION in the same utterance is #438's / #461's business, not a bare reference.
  if (/קוביי?ה|תיבה|מנסרה|פירמידה|\bcube\b|\bbox\b|\bcuboid\b|\bprism\b|\bpyramid\b/i.test(s)) return null;
  // The #516 pattern: a rule that RECOGNISES an ambiguity records it and declines, and `parse3` turns
  // the flag into a typed refusal after the loop — so a later rule may still legitimately own the line,
  // but nothing falls through to `not-handled` (which escalates to the LLM, whose job is to guess).
  MAIN_DIAGONAL_AMBIGUOUS = true;
  return null;
};

/** cube / box: 8 vertices as given, or 4 base vertices auto-primed to the top face.
 *
 *  #438: the sentence may state a SPACE DIAGONAL along with the solid («תיבה מלבנית עם אלכסון תיבה»,
 *  typed by two users as their opening move). This rule used to read its own noun, branch on the label
 *  count and return — the words `עם אלכסון תיבה` were never read at all, so the student who asked for a
 *  box *with a diagonal* got a box, reported ✓. A rule that claims an utterance owns the WHOLE of it:
 *  the ids it just assigned are exactly what naming the diagonal needs, so it emits the segment itself.
 *
 *  Only the UNAMBIGUOUS solid-qualified form («אלכסון תיבה» / «אלכסון קובייה» / "space diagonal") is
 *  built. A bare «אלכסון» on a box could mean a FACE diagonal, and guessing between them would assert a
 *  given the student never gave (ADR-052) — it stays unbuilt and is now caught by `droppedConstructNoun3`
 *  as an honest refusal instead of a silent drop. Naming the endpoints («אלכסון תיבה AC'») is #449. */
const SPACE_DIAGONAL_RE = /אלכסו[ןנ]\s*(?:ה?(?:תיבה|קוביי?ה))|\b(?:space|body|main)\s+diagonal\b/i;

const cubeOrBox: Rule = (s) => {
  const kind = /קוביי?ה/.test(s) || /\bcube\b/i.test(s) ? 'cube' : /תיבה/.test(s) || /\b(box|cuboid)\b/i.test(s) ? 'box' : null;
  if (!kind) return null;
  const toks = labelTokens(s);
  // the solid's 8 ids, base-first then top (the drawing convention everywhere in the engine), or null
  const ids =
    toks.length === 8 ? toks
    : toks.length === 4 && toks.every(unprimed) ? [...toks, ...primeAll(toks)]
    // label-less: a cube/box is fully determined — default lettering, no LLM needed
    : toks.length === 0 ? ['A', 'B', 'C', 'D', ...primeAll(['A', 'B', 'C', 'D'])]
    : null;
  if (!ids) return null;
  const solid: Command3 = { type: 'solid', kind, ids };
  // a space diagonal joins a base vertex to the top vertex DIAGONALLY opposite it: base[0] → top[2].
  return SPACE_DIAGONAL_RE.test(s) ? [solid, { type: 'segment3', a: ids[0], b: ids[6] }] : [solid];
};

/** Right prism, dispatched by its BASE shape (#117): `מנסרה ישרה [שבסיסה <shape>] <labels>`.
 *  triangle→prism3, equilateral→prism3e, parallelogram→prism4, general quad→prism4g, square→prism4sq,
 *  rectangle→box, pentagon→prismReg5, hexagon→prismReg6. (Rhombus is left to `rhombusPrism`.) Labels: the
 *  2n primed run, or n unprimed auto-primed, or a base noun with no labels → the default A,B,C(,D…) base.
 *  A bare `מנסרה ישרה` with NO base noun and no labels stays the honest ADR-052 refusal. */
const rightPrism: Rule = (s) => {
  if (!/מנסרה/.test(s) && !/\bprism\b/i.test(s)) return null;
  // #435: the solid's OWN rightness, read WITHOUT the base triangle's qualifier — `prism with a right
  // triangle base` is not a right prism (the English `\bright\b` used to match the base's qualifier).
  const sr = withoutTriQualifier(s);
  if (!/ישרה/.test(sr) && !/\bright\b/i.test(sr)) return null; // oblique unsupported — honest refusal
  if (/מעוין/.test(s) || /\brhombus\b/i.test(s)) return null; // rhombus base → rhombusPrism
  const tri3 = statedTriShape(s); // #424: ONE vocabulary — `שווה שוקיים` used to be read nowhere
  const equi = tri3.equal === 'equilateral';
  let kind: SolidKind, bn: number, namedBase: boolean;
  if (/מקבילית/.test(s) || /\bparallelogram\b/i.test(s)) { kind = 'prism4'; bn = 4; namedBase = true; }
  else if (/מלבן/.test(s) || /\brectangle\b/i.test(s)) { kind = 'box'; bn = 4; namedBase = true; }
  else if (/ריבוע/.test(s) || /\bsquare\b/i.test(s)) { kind = 'prism4sq'; bn = 4; namedBase = true; }
  else if (/מרובע/.test(s) || /\bquadrilateral\b/i.test(s) || /\bquad\b/i.test(s)) { kind = 'prism4g'; bn = 4; namedBase = true; }
  else if (/מחומש/.test(s) || /\bpentagon\b/i.test(s)) { kind = 'prismReg5'; bn = 5; namedBase = true; }
  else if (/משושה/.test(s) || /\bhexagon\b/i.test(s)) { kind = 'prismReg6'; bn = 6; namedBase = true; }
  else { kind = equi ? 'prism3e' : 'prism3'; bn = 3; namedBase = /משולש/.test(s) || /\btriangular\b/i.test(s) || /\btriangle\b/i.test(s) || hasTriShape(tri3); }
  const base = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, bn);
  const toks = firstLabelRun(s);
  let ids: Id[] | null = null;
  if (toks.length === 2 * bn) ids = toks;
  else if (toks.length === bn && toks.every(unprimed)) ids = [...toks, ...primeAll(toks)];
  else if (toks.length === 0 && namedBase) ids = [...base, ...primeAll(base)];
  if (!ids) return null;
  // #424: `prism3e` already IS the equilateral base, so it needs no constraints (bit-identical);
  // an isosceles base has no template of its own and rides the macro on the base ring.
  // `prism3e` already IS the equilateral base (bit-identical), but a stated RIGHT angle still lowers.
  const spec: TriSpec = bn === 3 ? { equal: kind === 'prism3' ? tri3.equal : null, right: tri3.right } : { equal: null, right: false };
  return [{ type: 'solid', kind, ids }, ...triShapeCommands(spec, ids.slice(0, 3))];
};

/** #289 (M1): `המנסרה ישרה` / `המנסרה היא ישרה` / `the prism is right` / `make the prism right` — a
 *  DEFINITE statement that THE existing solid is a RIGHT prism (no base noun, no labels). Lowers to
 *  `make-right-prism`; apply converts an oblique `parallelepiped` to `prism4`, is idempotent on an
 *  already-right prism, and refuses honestly when there is no prism (never re-constructs → no `already-defined`).
 *  Scoped to the DEFINITE form (ה / "the") so a base-less CONSTRUCTION attempt (`מנסרה ישרה`) is untouched —
 *  it stays a `rightPrism` refusal (needs a base) rather than being read as a statement. */
const makeRightPrism: Rule = (s) => {
  const he = /^המנסרה\s+(?:היא\s+)?ישרה$/.test(s);
  const en = /^(?:make\s+)?the\s+prism\s+(?:is\s+)?(?:a\s+)?right(?:\s+prism)?$/i.test(s);
  if (!he && !en) return null;
  return [{ type: 'make-right-prism' }];
};

/** An OBLIQUE prism — the mirror of {@link rightPrism}, dispatched by the SAME base nouns but with the
 *  lateral tilt left FREE (#349, ADR-3D-089). A prism the student did not state `ישרה` is oblique
 *  (ADR-052: rightness is a given, never assumed) and `המנסרה ישרה` (#289) pins it upright later.
 *
 *  Covers: `מקבילון` / `parallelepiped` (the named parallelogram-base solid — 8 labels, 4 auto-primed, or
 *  the default ABCD base), the bare `מנסרה שבסיסה <shape>` over the parallelogram family (#295/#321), and
 *  — new in #349 — the TRIANGLE and general-QUAD bases the `oblique-prism` guidance used to refuse:
 *  `מנסרה משולשת` / `מנסרה שבסיסה משולש` / `triangular prism`, equilateral (`prism3e`), `מנסרה מרובעת`.
 *
 *  Base shapes that are not a template on their own ride the ADR-110/#199 constraint-macro pattern (no new
 *  engine construct): rhombus ⇒ adjacent sides equal (`length-rel |AB|=|AD|`), rectangle ⇒ a right base
 *  angle (`cos-angle (AB,AD)=0`), square ⇒ both. Regular pentagon/hexagon bases stay with the guidance —
 *  their only template asserts REGULARITY, which the student did not state (ADR-052). */
const obliquePrism: Rule = (s) => {
  const named = /מקבילון/.test(s) || /\bparallelepiped\b/i.test(s);
  const rhombus = /מעויי?ן/.test(s) || /\brhombus\b/i.test(s);
  const square = /ריבוע/.test(s) || /\bsquare\b/i.test(s);
  const rect = /מלבן/.test(s) || /\brectang/i.test(s);
  const par = /מקבילית/.test(s) || /\bparallelogram\b/i.test(s);
  const tri3 = statedTriShape(s); // #424: ONE vocabulary — `שווה שוקיים` used to be read nowhere
  const equi = tri3.equal === 'equilateral';
  const tri = /משולש/.test(s) || /\btriangular\b/i.test(s) || /\btriangle\b/i.test(s);
  const quad = /מרובע/.test(s) || /\bquadrilateral\b/i.test(s) || /\bquad\b/i.test(s);
  const isPrism = /מנסרה/.test(s) || /\bprism\b/i.test(s);
  const stated = par || rhombus || square || rect || tri || quad;
  // #435: rightness read WITHOUT the base triangle's own qualifier (see rightPrism).
  const sr = withoutTriQualifier(s);
  // #392 ([ADR-3D-143](../../docs/06b-decisions-3d.md)): NO base noun at all — derive the base arity
  // from the LABEL RUN when it is unambiguous: 2n labels (n = 3..4) whose second half mirrors the
  // first with primes («מנסרה ABCA'B'C'» — a 6-label primed-mirror run fully determines a TRIANGULAR
  // prism; no unstated assumption is needed). The derived base is the GENERAL triangle/quad — deriving
  // a parallelogram or regularity would assert a property the student never stated (ADR-052) — and
  // obliqueness stays the default (ADR-3D-089). A mismatched run (odd count, unmirrored primes, n≥5)
  // keeps the honest not-handled/guidance.
  const toks0 = firstLabelRun(s);
  let derived: 3 | 4 | null = null;
  if (isPrism && !stated && !named && (toks0.length === 6 || toks0.length === 8)) {
    const n = toks0.length / 2;
    const head = toks0.slice(0, n);
    const tail = toks0.slice(n);
    if (head.every(unprimed) && tail.join(' ') === primeAll(head).join(' ')) derived = n as 3 | 4;
  }
  const barePrism = isPrism && !/ישרה/.test(sr) && !/\bright\b/i.test(sr) && (stated || derived !== null);
  if (!named && !barePrism) return null;
  // The base template: a triangle/quad of its own, else the parallelogram carrying the family's constraints.
  const kind: SolidKind =
    derived === 3 ? 'prism3'
    : derived === 4 ? 'prism4g'
    : tri && !quad ? (equi ? 'prism3e' : 'prism3')
    : quad && !par && !rhombus && !square && !rect ? 'prism4g'
    : 'prism4';
  const bn = kind === 'prism3' || kind === 'prism3e' ? 3 : 4;
  const base = ['A', 'B', 'C', 'D'].slice(0, bn);
  const toks = firstLabelRun(s);
  let ids: Id[] | null = null;
  if (toks.length === 2 * bn) ids = toks;
  else if (toks.length === bn && toks.every(unprimed)) ids = [...toks, ...primeAll(toks)];
  else if (toks.length === 0) ids = [...base, ...primeAll(base)];
  if (!ids) return null;
  const cmds: Command3[] = [{ type: 'solid', kind, ids, oblique: true }];
  const [a, b, , d] = ids; // base ring a-b-c-d: adjacent sides at `a` are a–b and a–d
  if (bn === 4 && (rhombus || square)) cmds.push({ type: 'length-rel', a1: a, b1: b, rhs: { pair: [a, d] }, c: 1 });
  if (bn === 4 && (rect || square))
    cmds.push({ type: 'cos-angle', u: { kind: 'pair', from: a, to: b }, v: { kind: 'pair', from: a, to: d }, cos: 0 });
  // #424: a TRIANGLE base's stated qualifier, on the same macro footing as the quad family above
  // (`prism3e` already IS equilateral, so only the template-less isosceles needs constraints).
  // #435: a stated RIGHT angle lowers for either triangular kind.
  if (bn === 3)
    cmds.push(...triShapeCommands({ equal: kind === 'prism3' ? tri3.equal : null, right: tri3.right }, ids.slice(0, 3)));
  return cmds;
};

/** A maximal consecutive alphabetical run of single unprimed letters (e.g. A,B,C). */
function isConsecutiveRun(toks: Id[]): boolean {
  if (toks.length === 0 || !toks.every((t) => /^[A-Z]$/.test(t))) return false;
  const codes = toks.map((t) => t.charCodeAt(0)).sort((a, b) => a - b);
  return codes.every((code, i) => i === 0 || code === codes[i - 1] + 1);
}

/** The base run named by `שבסיסה ABCD` / `whose base ABCD` / `with base ABCD`, if present. */
function namedBaseIds(s: string): Id[] | null {
  const m = s.match(new RegExp(String.raw`(?:שבסיס[הו]|whose\s+base|with\s+(?:an?\s+)?base)\s+((?:${LBL})+)`));
  if (!m) return null;
  const ids = m[1].match(TOKEN);
  return ids && ids.length >= 3 ? ids : null;
}

/**
 * Apex-first naming (V8-a, ADR-3D-018): the pyramid template treats the LAST id as the
 * apex (base ring first). Legacy 572 exams routinely name the apex FIRST (`SABCD`,
 * `EABCD`, `OBCD`). Reorder to [base ring…, apex]:
 *  - an explicit named base (`שבסיסה ABCD`) fixes the base → apex = the remaining id;
 *  - else apex-FIRST when removing the first token leaves a consecutive base run AND
 *    removing the last does not (`SABC`→apex S; `ABCDS`/`ABCDT` keep their apex-last
 *    reading — no regression). Ambiguous or already-last ⇒ unchanged.
 */
function orientPyramid(s: string, toks: Id[]): Id[] {
  if (toks.length < 4 || toks.length > 5) return toks;
  const nb = namedBaseIds(s);
  if (nb && nb.length === toks.length - 1 && nb.every((t) => toks.includes(t))) {
    const apex = toks.filter((t) => !nb.includes(t));
    if (apex.length === 1) return [...nb, apex[0]];
  }
  if (isConsecutiveRun(toks.slice(1)) && !isConsecutiveRun(toks.slice(0, -1))) return [...toks.slice(1), toks[0]];
  return toks;
}

/**
 * V8-j (G12): a point on a segment positioned so a DERIVED pyramid is RIGHT — `T נמצאת על הקטע SC
 * כך ש-TABCD היא פירמידה ישרה` / `T on SC such that TABCD is a right pyramid` (2019-קיץ-ב, 2019-חורף).
 * The apex = the on-segment point (anywhere in the 5-letter name); the base = the other 4 vertices.
 * MUST run before `rightPyramid` (which would otherwise build a pyramid solid from `TABCD`).
 */
const rightPyramidPoint: Rule = (s) => {
  if ((!/פירמידה\s+ישרה/.test(s) && !/right\s+pyramid/i.test(s)) || (!/כך\s+ש/.test(s) && !/such\s+that/i.test(s))) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  const m =
    s.match(new RegExp(`^(?:ה?נקודה\\s+)?${L}\\s+(?:נמצאת\\s+|נמצא\\s+)?על\\s+(?:ה?קטע\\s+|ה?מקצוע\\s+|ה?צלע\\s+)?${L}${L}\\s+כך\\s+ש-?\\s*((?:[A-Z]\\d*'?){5})\\s+(?:היא\\s+)?פירמידה\\s+ישרה`)) ??
    s.match(new RegExp(`^(?:point\\s+)?${L}\\s+(?:is\\s+)?on\\s+(?:the\\s+)?(?:segment\\s+|edge\\s+)?${L}${L}\\s+such\\s+that\\s+((?:[A-Z]\\d*'?){5})\\s+is\\s+a\\s+right\\s+pyramid`, 'i'));
  if (!m) return null;
  const [, pt, a, b, pyr] = m;
  const verts = pyr.match(/[A-Z]\d*'?/g)!;
  if (verts.length !== 5 || !verts.includes(pt)) return null;
  const base = verts.filter((v) => v !== pt);
  if (base.length !== 4) return null;
  return [{ type: 'right-pyramid-point', id: pt, a, b, base }];
};

/**
 * #305/#341/#358 (ADR-3D-090): the quad base a stated noun names. ONE vocabulary, so a base a
 * rule RECOGNISES is exactly a base it can LOWER — the ADR-3D-084 class (a noun the positive-test
 * chain did not happen to test took the "no noun was stated" path and silently drew a rectangle)
 * cannot recur. Ordered specific → generic, so `מעוין` is never claimed by the generic `מרובע`.
 */
function statedQuadBase(s: string): QuadBase | null {
  if (/ריבוע/.test(s) || /\bsquare\b/i.test(s)) return 'square';
  if (/מלבן/.test(s) || /\brectang/i.test(s)) return 'rectangle';
  if (/מעויי?ן/.test(s) || /\brhombus\b/i.test(s)) return 'rhombus';
  if (/מקבילית/.test(s) || /\bparallelogram\b/i.test(s)) return 'parallelogram';
  if (/דלתון/.test(s) || /\bkite\b/i.test(s)) return 'kite';
  if (/טרפז/.test(s) || /\btrapez/i.test(s)) return 'trapezoid';
  if (/מרובע/.test(s) || /\bquadrilateral\b/i.test(s)) return 'quad';
  return null;
}

/**
 * #424: the TRIANGLE shape a stated qualifier names — the triangle sibling of {@link statedQuadBase},
 * carrying the same doctrine: ONE vocabulary, so a qualifier a rule RECOGNISES is exactly a qualifier
 * it can LOWER. Before this existed each position tested for `שווה צלעות` inline (three copies) and
 * for `שווה שוקיים` nowhere, so which (qualifier × position) pairs worked was an accident of which
 * regex someone happened to write — `ABC משולש שווה צלעות` drew a scalene triangle and reported ✓.
 *
 * Ordered specific → generic: an equilateral triangle IS isosceles, but the student said equilateral.
 */
export type TriShape = 'equilateral' | 'isosceles';

/**
 * The FULL triangle qualifier (#435). Equal-sidedness and right-angledness are INDEPENDENT givens — a
 * triangle may be stated both (`משולש ישר זווית ושווה שוקיים`) — so the vocabulary answers both at once
 * rather than returning whichever one a caller happened to ask about.
 */
export type TriSpec = { equal: TriShape | null; right: boolean };

/**
 * The right-angled-triangle qualifier, as WORDS (#435). Kept separate from {@link RIGHT_TRI_PHRASE}
 * because this is the form a solid's own rightness test must be able to REMOVE from the utterance
 * ({@link withoutTriQualifier}): `right` counts as the triangle's qualifier only when it modifies the
 * noun `triangle`, never when it modifies `prism`/`pyramid`.
 */
const TRI_RIGHT_WORDS = /ישר\s*[-\s]?\s*זו?וית|\bright[-\s]?angled\b|\bright\b(?=[-\s]+triangle\b)/gi;

/** The right-angled qualifier bound to a TRIANGLE noun — the form that recognises the given. */
const RIGHT_TRI_PHRASE = /משולש.*ישר\s*[-\s]?\s*זו?וית|ישר\s*[-\s]?\s*זו?וית.*משולש|right[-\s]?(?:angled\s+)?triangle/i;

function statedTriShapeWord(s: string): TriShape | null {
  if (/שווה[\s-]?צלעות/.test(s) || /כל\s+מקצועותיה\s+שוו/.test(s) || /\bequilateral\b/i.test(s)) return 'equilateral';
  if (/שווה[\s-]?שוקיים/.test(s) || /\bisosceles\b/i.test(s)) return 'isosceles';
  return null;
}

/**
 * The triangle qualifier stated FOR A TRIANGLE. A qualifier modifies the noun it was written beside:
 * `טרפז שווה שוקיים` is an isosceles TRAPEZOID, so a stated quad base takes its qualifier with it
 * (that quad reading is {@link quadShapeCommands}) and no triangle may claim it.
 */
function statedTriShape(s: string): TriSpec {
  if (statedQuadBase(s)) return { equal: null, right: false };
  return { equal: statedTriShapeWord(s), right: RIGHT_TRI_PHRASE.test(s) };
}

/** Whether a spec carries anything at all to lower. */
function hasTriShape(spec: TriSpec): boolean {
  return spec.equal !== null || spec.right;
}

/**
 * The utterance with the TRIANGLE's own qualifier words removed (#435), for a SOLID rule about to test
 * its OWN rightness modifier. A qualifier modifies the noun it was written beside — so the `ישר` of
 * `ישר זווית` and the `right` of `right triangle` describe the BASE, and a solid that reads them as its
 * own `ישרה`/`right` asserts a property the student never stated (ADR-052). This is why the test is a
 * removal rather than a bow-out (docs/17 §2.4): the solid still answers its own question, on the part of
 * the sentence that is actually about it.
 */
function withoutTriQualifier(s: string): string {
  return s.replace(TRI_RIGHT_WORDS, ' ');
}

/**
 * The constraints a qualifier stated on a QUAD base adds beyond the base kind itself (#424) — today
 * exactly one pair needs it: `טרפז שווה שוקיים` / `isosceles trapezoid`, whose equal legs are already
 * the registry's own `CYCLIC_MEMBER.trapezoid.fix`. Every other quad qualifier is carried by a noun of
 * its own (an equilateral parallelogram is a `מעוין`), so this stays a one-member reading rather than
 * a second vocabulary. `already` are the commands the caller has emitted, so a RIGHT trapezoid — which
 * receives the same constraint from its cyclic fix — is not given it twice.
 */
function quadShapeCommands(s: string, base: QuadBase, ring: Id[], already: Command3[]): Command3[] {
  if (base !== 'trapezoid' || statedTriShapeWord(s) !== 'isosceles') return [];
  const legs = cyclicFixCommands('trapezoid', ring);
  const has = already.some((c) => c.type === 'length-rel' && legs.some((l) => l.type === 'length-rel' && l.a1 === c.a1 && l.b1 === c.b1));
  return has ? [] : legs;
}

/**
 * The constraints a stated triangle qualifier lowers to on a ring `[a,b,c]` — the ADR-110/#199 macro
 * pattern (no new engine construct: `length-rel` is already M1-routed, so it DRIVES a free figure and
 * VERIFIES a determined one, and the solver flexes the ring into shape).
 *
 *  - **equilateral** → all three sides equal, HARD: the words leave the student no further choice.
 *  - **isosceles** → ONE **soft** pair at `apex` (default: the first-named vertex). "Isosceles" asserts
 *    only that SOME two sides are equal — WHICH pair is the student's to state (ADR-052) — so the
 *    default yields to a later explicit pair (M4 / ADR-114 / the #116 ruling already applied to
 *    `rightTriangle`), instead of stacking with it into an equilateral triangle nobody asked for.
 *
 * `apex` lets a caller that knows better name the vertex: for a RIGHT isosceles triangle the equal
 * sides are necessarily the two legs, so the right-angle vertex is the apex (`|BA| = |BC|`) — the
 * first-vertex default would demand a leg equal to the hypotenuse, which no triangle satisfies.
 */
function triShapeCommands(spec: TriSpec, ring: Id[], apexHint?: Id): Command3[] {
  const [a, b, c] = ring;
  const rel = (a1: Id, b1: Id, pair: [Id, Id], soft?: boolean): Command3 => ({
    type: 'length-rel', a1, b1, rhs: { pair }, c: 1, ...(soft ? { soft: true } : {}),
  });
  const out: Command3[] = [];
  // #435: right-angledness. The vertex is the caller's hint, else the MIDDLE letter — in `ABC` the
  // angle named by the middle letter is ∠ABC. `soft` so a later explicit angle wins (M4 / ADR-114).
  const rightVertex = apexHint ?? b;
  if (spec.right) {
    const [p, q] = ring.filter((v) => v !== rightVertex);
    out.push({
      type: 'cos-angle',
      u: { kind: 'pair', from: rightVertex, to: p }, v: { kind: 'pair', from: rightVertex, to: q },
      cos: 0, soft: true,
    });
  }
  // A RIGHT triangle's equal sides can only be its two legs, so the right-angle vertex is the apex —
  // the first-vertex default would demand a leg equal to the hypotenuse, which no triangle satisfies.
  const apex = apexHint ?? (spec.right ? rightVertex : ring[0]);
  if (spec.equal === 'equilateral') out.push(rel(a, b, [b, c]), rel(b, c, [c, a]));
  else if (spec.equal === 'isosceles') {
    const [p, q] = ring.filter((v) => v !== apex);
    out.push(rel(apex, p, [apex, q], true));
  }
  return out;
}

/** (base x rightness) → the kind naming that pair. Rightness is a MODIFIER of ANY base (ADR-3D-090). */
const QUAD_PYRAMID_KIND: Record<QuadBase, { free: SolidKind; right: SolidKind }> = {
  square: { free: 'pyramid4g', right: 'pyramid4' },
  rectangle: { free: 'pyramid4gr', right: 'pyramid4r' },
  rhombus: { free: 'pyramidRhomb', right: 'pyramidRhombR' },
  parallelogram: { free: 'pyramidPar', right: 'pyramidParR' },
  kite: { free: 'pyramidKite', right: 'pyramidKiteR' },
  trapezoid: { free: 'pyramidTrap', right: 'pyramidTrapR' },
  quad: { free: 'pyramidQuad', right: 'pyramidQuadR' },
};

/**
 * The constraint «ישרה» adds so the stated base becomes CYCLIC — the operator's 2026-07-27 ruling
 * (#305). A right pyramid's apex sits over the base's circumcentre, which exists iff the base is
 * cyclic; rather than refuse, the base is constrained into the cyclic member of its OWN family and
 * a build notice names what it became. Nothing is invented: the base noun and «ישרה» jointly
 * ENTAIL it (the ADR-165 / ADR-123 allowed-with-a-notice precedent). Lowered as ordinary relations —
 * the ADR-110 macro pattern — so the solver does the work and no new engine construct is needed.
 * A contradiction with a STATED value stays an honest over-constraint refusal (ADR-052 / ADR-114).
 */
function cyclicFixCommands(base: QuadBase, ring: Id[]): Command3[] {
  const fix = CYCLIC_MEMBER[base].fix;
  switch (fix.kind) {
    case 'none':
      return [];
    case 'right-angle': {
      const v = ring[fix.vertex];
      const prev = ring[(fix.vertex + 3) % 4];
      const nxt = ring[(fix.vertex + 1) % 4];
      return [{ type: 'cos-angle', u: { kind: 'pair', from: v, to: prev }, v: { kind: 'pair', from: v, to: nxt }, cos: 0 }];
    }
    case 'equal-legs': // an isosceles trapezoid: the legs AD and BC are equal
      return [{ type: 'length-rel', a1: ring[0], b1: ring[3], rhs: { pair: [ring[1], ring[2]] }, c: 1 }];
    case 'concyclic':
      return [{ type: 'concyclic', ids: [...ring] }];
  }
}

/** Right pyramid: `פירמידה ישרה ABCDS` / `ABCS`. WITHOUT ישרה, 4 ids = a GENERAL tetrahedron (V7 T2).
 *  V8-d: an equilateral triangular base → `pyramid3e`; a parallelogram base → `pyramidPar`. */
const rightPyramid: Rule = (s) => {
  // `טטראדר`/`tetrahedron` IS a triangular pyramid by definition — it carries its own base
  // `טטראדר`/`טטרדר` (transliterations, the [אה] optional so a missing vowel-letter still reads),
  // `ארבעון` (the Hebrew word), `tetrahedron` — all a triangular pyramid by definition
  const tetraWord = /טטר[אה]?ה?דר(?:ון)?/.test(s) || /ארבעון/.test(s) || /\btetrahedr(?:on)?\b/i.test(s);
  if (!/פירמידה/.test(s) && !/\bpyramid\b/i.test(s) && !tetraWord) return null;
  // #435: the solid's OWN rightness, read WITHOUT the base triangle's qualifier. `/ישרה?/` used to
  // match the `ישר` of `ישר זווית` (and `\bright\b` the `right` of `right triangle`), so stating a
  // right-ANGLED base silently turned a free tetra into a RIGHT pyramid — a property never stated.
  const sr = withoutTriQualifier(s);
  const right = /ישרה?/.test(sr) || /\bright\b/i.test(sr); // ישרה (fem, פירמידה) or ישר (masc, טטראדר)
  const tri3 = statedTriShape(s); // #424: ONE vocabulary (was an inline equilateral-only test)
  const equi = tri3.equal === 'equilateral';
  // #199 (ADR-3D-047): «שווה מקצועות» on a TETRA is a macro (the ADR-110 pattern) — the solid plus
  // five equal-edge `length-rel` constraints, M1 at apply (drives a free tetra into the regular one,
  // verifies a pinned one). On any other kind the qualifier has no lowering — DEFER (escalate),
  // never the silent drop it used to be.
  const eqEdges = /שווה[\s-]?מקצועות/.test(s) || /כל\s+מקצועותיו\s+שוו/.test(s) || /\bequal[\s-]edges?\b/i.test(s) || /\bregular\s+tetrahedr(?:on)?\b/i.test(s);
  const withEqEdges = (cmds: Command3[]): Command3[] | null => {
    if (!eqEdges) return cmds;
    const solid = cmds[0];
    if (cmds.length !== 1 || solid.type !== 'solid' || solid.kind !== 'tetra') return null;
    const [a, b, c3, d] = solid.ids;
    const rel = (a1: Id, b1: Id): Command3 => ({ type: 'length-rel', a1, b1, rhs: { pair: [a, b] }, c: 1 });
    return [solid, rel(a, c3), rel(a, d), rel(b, c3), rel(b, d), rel(c3, d)];
  };
  // #305 (ADR-3D-090): ANY stated quad base x rightness, from the registry. A right form over a
  // base that is not cyclic by default carries its family's CYCLIC_FIX, so it BUILDS (constrained,
  // with a build notice) instead of deferring -- superseding #304's right+rhombus bail.
  const quadPyramid = (ids: Id[], base: QuadBase): Command3[] | null => {
    const kind = right ? QUAD_PYRAMID_KIND[base].right : QUAD_PYRAMID_KIND[base].free;
    const cmds: Command3[] = [{ type: 'solid', kind, ids }];
    // the base's OWN defining constraint (a rhombus is a parallelogram ring + equal adjacent sides)
    if (base === 'rhombus') cmds.push({ type: 'length-rel', a1: ids[0], b1: ids[1], rhs: { pair: [ids[0], ids[3]] }, c: 1 });
    if (right) cmds.push(...cyclicFixCommands(base, ids.slice(0, 4)));
    cmds.push(...quadShapeCommands(s, base, ids.slice(0, 4), cmds)); // #424: `שבסיסה טרפז שווה שוקיים`
    return withEqEdges(cmds);
  };
  // the triangular-base pyramid kind. #424: the base SHAPE and rightness are independent givens
  // (ADR-3D-090's ruling, triangle edition) — `pyramid3e` is the one kind whose base is equilateral by
  // construction, and every other (shape × rightness) cell carries the qualifier as CONSTRAINTS
  // instead of dropping it (`פירמידה שבסיסה משולש שווה צלעות`, with no `ישרה`, used to draw a scalene tetra).
  const triKind = right ? (equi ? 'pyramid3e' : 'pyramid3') : 'tetra';
  const withTriShape = (cmds: Command3[] | null): Command3[] | null => {
    // #435: `pyramid3e`'s base IS equilateral, so only its EQUAL half is already carried — a stated
    // right angle still has to lower. Independent givens, independently accounted.
    const spec: TriSpec = { equal: triKind === 'pyramid3e' ? null : tri3.equal, right: tri3.right };
    if (!cmds || !hasTriShape(spec)) return cmds;
    const solid = cmds[0];
    if (solid.type !== 'solid') return cmds;
    return [...cmds, ...triShapeCommands(spec, solid.ids.slice(0, 3))];
  };
  if (firstLabelRun(s).length === 0) {
    // label-less: a stated base word makes the shape determined — default lettering
    const tri = tetraWord || /משולש/.test(s) || /\btriangular\b/i.test(s) || /\btriangle\b/i.test(s) || hasTriShape(tri3);
    if (tri) return withTriShape(withEqEdges([{ type: 'solid', kind: triKind, ids: ['A', 'B', 'C', 'D'] }]));
    const base = statedQuadBase(s);
    if (base) return quadPyramid(['A', 'B', 'C', 'D', 'S'], base);
    return null;
  }
  const toks = orientPyramid(s, firstLabelRun(s));
  // a tetrahedron has exactly 4 vertices — a 5-label `טטראדר` is contradictory (refuse → honest)
  if (toks.length === 5 && !tetraWord) {
    // rightness and base shape are INDEPENDENT givens (ADR-052): a square base must be STATED.
    // An unstated base keeps its historical free-aspect RECTANGLE default (documented in types.ts).
    return quadPyramid(toks, statedQuadBase(s) ?? 'rectangle');
  }
  if (toks.length === 4) return withTriShape(withEqEdges([{ type: 'solid', kind: triKind, ids: toks }]));
  return null;
};

/** `מנסרה ישרה שבסיסה מעוין ABCDA'B'C'D'` — a right prism over a rhombus (V7 T2). */
const rhombusPrism: Rule = (s) => {
  if ((!/מנסרה/.test(s) && !/\bprism\b/i.test(s)) || (!/מעוין/.test(s) && !/\brhombus\b/i.test(s))) return null;
  if (!/ישרה/.test(s) && !/\bright\b/i.test(s)) return null;
  const toks = labelTokens(s);
  if (toks.length === 8) return [{ type: 'solid', kind: 'prism4r', ids: toks }];
  if (toks.length === 4 && toks.every(unprimed)) return [{ type: 'solid', kind: 'prism4r', ids: [...toks, ...primeAll(toks)] }];
  if (toks.length === 0) return [{ type: 'solid', kind: 'prism4r', ids: ['A', 'B', 'C', 'D', ...primeAll(['A', 'B', 'C', 'D'])] }];
  return null;
};

/** `u·v = 24` — a dot-product GIVEN on declared vectors (V7 T2). */
const dotGiven: Rule = (s) => {
  const m = s.match(/^([a-w])\s*[·×*]\s*([a-w])\s*=\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return [{ type: 'dot-given', v1: m[1], v2: m[2], value: +m[3] }];
};

/** `BD = (-4,5,12)` — a PAIR-vector injection (V7 T2).
 *  #794 (ADR-3D-168): components take `COMP`, the ONE tuple-component grammar (#325's shape) —
 *  `AA' = (k-1, k-7, k+1)` rides the same parseComp/symStructure chokepoints as `B(2t,t,k)`,
 *  so the exam's symbolic pair-vector given parses instead of burning an LLM call. */
const pairInjection: Rule = (s) => {
  const m = s.match(new RegExp(String.raw`^(${LBL})(${LBL})\s*=\s*\(\s*(${COMP})\s*,\s*(${COMP})\s*,\s*(${COMP})\s*\)$`));
  if (!m) return null;
  const comps = [m[3], m[4], m[5]].map(parseComp);
  if (comps.some(unreadableComp)) return null; // #510: a malformed literal is never an unknown component
  const symExprs = symStructure(comps);
  const syms = symNames(comps);
  return [{ type: 'inject-pair', a: m[1], b: m[2], x: comps[0].num, y: comps[1].num, z: comps[2].num, ...(symExprs ? { symExprs } : {}), ...(syms ? { syms } : {}) }];
};

/**
 * A solid's stated VOLUME (V7 T2) — «נפח הפירמידה ABCD = 11», «נפח SABCD שווה ל 11», «נפח הפירמידה = 11».
 *
 * #766/#765 (ADR-3D-169). The rule used to gate on "exactly 4 uppercase tokens + `=`", which read one
 * spelling of one shape: on «פירמידה ישרה מרובעת ABCDS» — the commonest bagrut solid — the student had NO
 * working form at all, because the only accepted run named the coplanar base and was then refuted
 * arithmetically. Three things it could not read, each already solved elsewhere in this file:
 *
 *  1. the «שווה ל-» copula (the twin rule `volumeEqPoly` one screen away already takes it);
 *  2. runs of other lengths — `SABCD` / `ABCDS`, apex-first and base-last;
 *  3. the definite solid NOUN, which the operator's ruling makes a first-class subject.
 *
 * The #642 sweep (ADR-3D-160) fixed exactly this class on the point, length and coordinate heads and left
 * the volume head behind. WHICH solid the sentence denotes is not decided here — `parse3` is context-free,
 * so the claim carries the noun and the run as the student wrote them and `resolveSolidSubject` answers at
 * apply, where the declared figure is known.
 */
const SOLID_NOUNS_HE: [string, SolidNoun][] = [
  [String.raw`ה?פירמיד[הות]+`, 'pyramid'],
  [String.raw`ה?(?:טטר[אה]?ה?דר(?:ון)?|ארבעון)`, 'tetra'],
  [String.raw`ה?קוביי?[הות]+`, 'cube'],
  [String.raw`ה?תיב[הות]+`, 'box'],
  [String.raw`ה?מנסר[הות]+`, 'prism'],
  [String.raw`ה?גוף`, 'any'],
];
const SOLID_NOUNS_EN: [string, SolidNoun][] = [
  [String.raw`pyramids?`, 'pyramid'],
  [String.raw`tetrahedr(?:on|a)?`, 'tetra'],
  [String.raw`cubes?`, 'cube'],
  [String.raw`(?:box(?:es)?|cuboids?)`, 'box'],
  [String.raw`prisms?`, 'prism'],
  [String.raw`solids?`, 'any'],
];
/**
 * The noun is matched by an EXPLICIT alternation of the solid vocabulary, never by a generic `\S+`.
 * A generic word-slot swallows the letter run — «נפח SABCD שווה ל 11» reads `SABCD` as the noun and the
 * rule then declines, with no backtracking to the noun-less reading, so the widening would have missed the
 * very spelling #765 was filed for. Matching the vocabulary itself makes the two readings disjoint.
 */
const solidNounOf = (word: string | undefined, en: boolean): SolidNoun | null => {
  if (word === undefined) return 'any';
  const table = en ? SOLID_NOUNS_EN : SOLID_NOUNS_HE;
  for (const [src, noun] of table) {
    if (new RegExp(`^(?:the\s+)?(?:${src})$`, en ? 'i' : '').test(word.trim())) return noun;
  }
  return null;
};
const NOUN_HE = SOLID_NOUNS_HE.map(([src]) => src).join('|');
const NOUN_EN = SOLID_NOUNS_EN.map(([src]) => src).join('|');

const volumePolyClaim: Rule = (s) => {
  const RUN = String.raw`(?:[A-Z]\d*'?){3,}`;
  const VAL = String.raw`(-?\d+(?:\.\d+)?)`;
  const he = s.match(new RegExp(String.raw`^נפח\s+(?:(${NOUN_HE})\s*)?(${RUN})?\s*(?:=|שווה\s+ל-?\s*|הוא\s+)\s*${VAL}$`));
  const en = he ? null : s.match(new RegExp(String.raw`^(?:the\s+)?volume\s+of\s+(?:(?:the\s+)?(${NOUN_EN})\s*)?(${RUN})?\s*(?:=|is|equals?)\s*${VAL}$`, 'i'));
  const m = he ?? en;
  if (!m) return null;
  const noun = solidNounOf(m[1], !he);
  if (noun === null) return null;
  const ids = m[2] ? m[2].match(/[A-Z]\d*'?/g)! : [];
  // A statement must name SOMETHING: «נפח = 11» and «נפח הגוף = 11» (a noun that denotes no family)
  // identify nothing in the figure, so they are not claims — decline rather than invent a subject.
  if (ids.length === 0 && noun === 'any') return null;
  return [{ type: 'claim', claim: { type: 'volume-poly', noun, ids, value: +m[3] } }];
};

/** `M אמצע BC` / `M is the midpoint of BC` → on-segment t = ½.
 *  #225 (ADR-3D-048): the UN-named `אמצע BB'` / `midpoint of BB'` (2 tokens) lowers to
 *  `midpoint-auto` — the label is picked at APPLY, where the taken ids are known. */
const midpoint: Rule = (s) => {
  // #330: `אמצע` (midpoint) but NOT `אמצעי`/`אמצעים`/`אמצעית` — the perpendicular-bisector adjective
  // (`אנך אמצעי`) and the midsegment (`קטע אמצעים`) share the `אמצע` prefix and must not be reduced to
  // a bare midpoint (dropping their meaning + any named line). The `(?!י)` word-boundary is the fix; the
  // perp-bisector then escalates honestly (a 3-D perp-bisector construct is a needs-operator decision).
  if (!/אמצע(?!י)/.test(s) && !/\b(midpoint|middle)\b/i.test(s)) return null;
  const toks = labelTokens(s);
  if (toks.length === 2) {
    const [a, b] = toks;
    if (a === b) return null;
    return [{ type: 'midpoint-auto', a, b }];
  }
  if (toks.length !== 3) return null;
  const [id, a, b] = toks;
  if (id === a || id === b || a === b) return null;
  return [{ type: 'point-on-segment3', id, a, b, t: 0.5 }];
};

/**
 * The stated-ratio clause: `AK = 2KA'` (t from A is c/(c+1)) or the colon form
 * `AE:EC = 2:1` (t from A is p/(p+q)). Returns the t measured from segment endpoint
 * `a`; 'invalid' when a ratio clause is present but doesn't fit the segment (never
 * silently dropped); undefined when no clause is stated.
 */
function ratioT(s: string, id: Id, a: Id, b: Id): number | 'invalid' | undefined {
  // #748: the letters-and-arithmetic reading lives in `riderPairsT`, shared with the apply reducer, so
  // this clause and the same ratio typed as its OWN fact cannot drift apart. Here we only find the
  // numbers; `undefined` means "no ratio clause was stated" (a free slider), never "it is false".
  // A ratio CLAUSE is about lengths — there is no vector reading inside «X על YZ כך ש-…» — so either
  // spelling of either pair is the same statement («כך ש-AE = 2A'E» is «כך ש-AE = 2EA'»).
  const colon = s.match(/([A-Z]\d*'?)([A-Z]\d*'?)\s*:\s*([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (colon) {
    const [, p1, x, y, q1, pNum, qNum] = colon;
    return riderPairsT(id, a, b, p1, x, y, q1, parseFloat(pNum) / parseFloat(qNum));
  }
  const m = s.match(/([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*(\d+(?:\.\d+)?)\s*[·×*]?\s*([A-Z]\d*'?)([A-Z]\d*'?)/);
  if (!m) return undefined;
  const [, p, x, num, y, q] = m;
  return riderPairsT(id, a, b, p, x, y, q, parseFloat(num));
}

/** `K על AA'` (+ optional `כך ש-AK = 2KA'`) / `K on AA' such that AK = 2KA'`. No ratio ⇒ a free slider. */
const onSegment: Rule = (s) => {
  if (GREEK.test(s)) return null; // Greek scalars = the spanPoint form; never swallow its condition as a free point
  const m = s.match(
    new RegExp(`^${HE_SUBJ}(${LBL})\\s+(?:נמצאת\\s+|נמצא\\s+|is\\s+)?(?:על|on)\\s+(?:${HE_SEG}\\s+|segment\\s+|edge\\s+)?(${LBL})(${LBL})(?![A-Z0-9'])`),
  );
  if (!m) return null;
  const [, id, a, b] = m;
  if (id === a || id === b || a === b) return null;
  const t = ratioT(s, id, a, b);
  if (t === 'invalid') return null;
  return [{ type: 'point-on-segment3', id, a, b, t }];
};

// ---------------------------------------------------------------------------
// V1 — the geometric-vector lane (docs/20 §8 V1, ADR-3D-002)
// ---------------------------------------------------------------------------

const GREEK = /[α-ωΑ-Ω]/;

/** An optional proof-verb prefix (`הוכיחו כי`, `prove that`) — claims accept it and ignore it. */
/**
 * Strip a leading DISCOURSE marker — text that frames the statement without being part of it.
 *
 * Two families, one class: the proof framing (`הוכיחו כי` / `prove that`) and the given framing
 * (`נתון ש` / `נתון כי` / `given that`). Neither changes WHAT is asserted — drive-vs-verify is decided
 * by the figure's freedom at apply (M1), never by the wording — so a rule that understands the bare
 * statement must understand the framed one. #337 (ADR-3D-088): the corpus wording
 * «נתון שהזווית שבין … שווה לזווית שבין …» reached no rule for want of exactly this.
 */
const stripStatementPrefix = (s: string): string =>
  s.replace(
    /^(?:הוכיחו?\s+(?:כי|ש-?)\s*|הראו?\s+(?:כי|ש-?)\s*|prove\s+that\s+|show\s+that\s+|נתון\s+(?:כי\s+|ש-?)\s*|given\s+that\s+)/i,
    '',
  );

const FRACTION_GLYPHS: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8,
};

/** `5/3`, `0.5`, `2`, `½`, `√2`, `2√3`, `√6/4`… — absent ⇒ 1. Null on malformed. */
function parseCoeff(s: string | undefined): number | null {
  if (s === undefined || s === '') return 1;
  if (FRACTION_GLYPHS[s] !== undefined) return FRACTION_GLYPHS[s];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = parseInt(frac[2], 10);
    return den === 0 ? null : parseInt(frac[1], 10) / den;
  }
  if (/√/.test(s)) return evalRadical(s); // #55 gap (a): a RADICAL coefficient (`√2·OD`) makes `AB = √2·OD`
  // a vec-rel exactly like `A'K = 4/5 DN` (the neutral vector lane — coefficient pair=pair is NOT the bare
  // c=1 ambiguity), instead of falling through to not-handled → the LLM.
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

/** #510 — the reader paired with the `VAL` atom: a signed VALUE literal (`-√2`, `½`, `5/3`, `1.5`).
 *  One reader for the family, so a coordinate, a vector injection and a point in an injection LIST can
 *  never disagree about what «√6/4» means. Null on malformed — never a silent NaN in a figure. */
function literalValue(raw: string): number | null {
  const t = raw.replace(/\s+/g, '');
  const neg = t.startsWith('-');
  const v = parseCoeff(neg ? t.slice(1) : t);
  return v === null || !Number.isFinite(v) ? null : neg ? -v : v;
}

const TERM =
  /^([+-])?\s*((?:\d+\s*\/\s*\d+)|(?:\d*\.\d+)|(?:\d+)|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])?\s*[·×*]?\s*(?:([a-z])|([A-Z]\d*'?)([A-Z]\d*'?))\s*$/;

/**
 * Split a linear expression into its terms at TOP-LEVEL `+`/`-` only
 * ([ADR-3D-068](../../docs/06b-decisions-3d.md)).
 *
 * The one tokenizer every linear-expression parser here shares. A naive
 * `split(/(?=[+-])/)` is paren-BLIND — it breaks `(1-t)u` into `(1` and `-t)u`,
 * so a grouped coefficient carrying an internal sign is shredded before any term
 * regex ever sees it. Depth tracking is the whole fix: a term keeps its own
 * leading sign, and an unbalanced paren returns null so a malformed expression is
 * rejected outright rather than half-read (the all-or-nothing discipline).
 */
export function splitTopLevelTerms(src: string): string[] | null {
  const terms: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of src.trim()) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return null;
    if ((ch === '+' || ch === '-') && depth === 0 && cur.trim() !== '') {
      terms.push(cur.trim());
      cur = ch;
      continue;
    }
    cur += ch;
  }
  if (depth !== 0) return null;
  if (cur.trim() !== '') terms.push(cur.trim());
  return terms;
}

/** Parse a linear combination `½u + 5/3·w - 1/3v` / `AM` / `2KA'`. Null when any term is malformed. */
export function parseVecExpr(src: string): VecExpr | null {
  const parts = splitTopLevelTerms(src);
  if (!parts || parts.length === 0) return null;
  const expr: VecExpr = [];
  for (const part of parts) {
    const m = part.match(TERM);
    if (!m) return null;
    const coeff = parseCoeff(m[2]);
    if (coeff === null) return null;
    const signed = (m[1] === '-' ? -1 : 1) * coeff;
    if (m[3]) expr.push({ coeff: signed, atom: { kind: 'named', name: m[3] } });
    else expr.push({ coeff: signed, atom: { kind: 'pair', from: m[4], to: m[5] } });
  }
  return expr;
}

/** Draw-commands for every pair atom in an expression (idempotent segments — auto-draw, the 2-D FR-IN-7 idiom). */
const segmentsOf = (expr: VecExpr): Command3[] =>
  expr.flatMap((t) => (t.atom.kind === 'pair' ? [{ type: 'segment3', a: t.atom.from, b: t.atom.to } as Command3] : []));

/** `נסמן: AA' = w, KC = v, KB = u` / `denote AB = u, AD = v` — bind lowercase names to pairs.
 *  Each named vector also AUTO-DRAWS its segment (idempotent) — the exam figure shows the
 *  named arrows (KC, KB in 2020-Q2 are not edges), and the renderer marks name + direction on it. */
const nameVectors: Rule = (s) => {
  if (!/נסמן|\bdenote\b|\blet\b/i.test(s)) return null;
  const ms = [...s.matchAll(/([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*([a-z])(?![a-z])/g)];
  if (ms.length === 0) return null;
  return ms.flatMap((m) => [
    { type: 'segment3', a: m[1], b: m[2] } as Command3,
    { type: 'name-vector', name: m[3], from: m[1], to: m[2] } as Command3,
  ]);
};

/**
 * The centroid = where a triangle's three MEDIANS meet: `P מפגש התיכונים של משולש SAB` /
 * `P מפגש תיכונים במשולש SAB` (ה optional) / `E is the centroid of triangle BC'D`. Also draws the triangle.
 *
 * #330: the point is named FIRST or LAST — the book writes `תיכוני הפאה SAB נפגשים בנקודה P` /
 * `מפגש התיכונים של משולש SAB הוא P`. The point-last forms were silently absorbed by `planarPolygon`
 * (a bare triangle SAB, the centroid point P dropped). Widened to both orders, ה optional, `פאה`/`משולש`,
 * the construct-state `תיכוני` as well as `תיכונים`, and the English point-last mirrors. The centroid
 * signal (medians + a MEETING word) keeps it disjoint from the single-median rule (`CD תיכון…`, medianFoot).
 */
const centroidRule: Rule = (s) => {
  const he = /תיכונ/.test(s) && /מפגש|נפגש|נחתכ|חיתוך/.test(s);
  const en = /\bcentroid\b/i.test(s) || (/\bmedians?\b/i.test(s) && /\b(meet|intersect|intersection)\b/i.test(s));
  if (!he && !en) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  const MED = String.raw`ה?תיכוני(?:ם)?`; // תיכוני (construct) / התיכונים (absolute)
  const T = String.raw`(?:ה?משולש\s+|ה?פאה\s+|triangle\s+)?`;
  const RUN = `${L}${L}${L}`;
  let id: string, a: string, b: string, c: string;
  // point-FIRST
  let m =
    s.match(new RegExp(`^${L}\\s+מפגש\\s+${MED}\\s+(?:של\\s+|ב)?${T}\\s*${RUN}\\s*$`)) ??
    s.match(new RegExp(`^${L}\\s+is\\s+the\\s+centroid\\s+of\\s+${T}${RUN}\\s*$`, 'i')) ??
    s.match(new RegExp(`^${L}\\s+is\\s+the\\s+intersection\\s+of\\s+the\\s+medians\\s+of\\s+${T}${RUN}\\s*$`, 'i'));
  if (m) [, id, a, b, c] = m;
  else {
    // point-LAST
    m =
      s.match(new RegExp(`^(?:מפגש\\s+)?${MED}\\s+(?:של\\s+|ב)?${T}\\s*${RUN}\\s+(?:נפגשים|נפגשות|נחתכים|הוא|היא|=)\\s+(?:ב?נקוד[הת]\\s*)?${L}\\s*$`)) ??
      s.match(new RegExp(`^(?:the\\s+)?medians\\s+of\\s+${T}${RUN}\\s+(?:meet|intersect)\\s+(?:at\\s+)?(?:the\\s+)?(?:point\\s+)?${L}\\s*$`, 'i')) ??
      s.match(new RegExp(`^(?:the\\s+)?(?:centroid|intersection\\s+of\\s+the\\s+medians)\\s+of\\s+${T}${RUN}\\s+is\\s+(?:the\\s+)?(?:point\\s+)?${L}\\s*$`, 'i'));
    if (!m) return null;
    [, a, b, c, id] = m;
  }
  if (new Set([id, a, b, c]).size !== 4) return null;
  return [
    { type: 'segment3', a, b },
    { type: 'segment3', a: b, b: c },
    { type: 'segment3', a: c, b: a },
    { type: 'centroid3', id, of: [a, b, c] },
  ];
};

/**
 * #530 — the «בנקודה X» marker that NAMES a construction's point, in ONE spelling. Hebrew glues the
 * noun into the word, so «בנקודהS» is an ordinary keystroke slip, not a malformed sentence; the
 * separator must therefore be optional. It was spelled `בנקודה\s+` independently at six sites, and
 * each site failed silently in its own way — `diagIntersection` invented a quad from the leftover
 * letters (#530, P1, reached prod), `circleTangentLine` DROPPED the student's tangency label and
 * committed with a green ✓. One fragment, so the next rule that needs the marker inherits the
 * tolerance instead of re-learning it one report at a time (the #494 clitic precedent).
 */
const AT_POINT = String.raw`בנקוד[הת]\s*`;

/**
 * `E מפגש האלכסונים של הפאה ABCD` / `O נקודת חיתוך אלכסוני הבסיס` / `O = intersection
 * of diagonal AC with diagonal BD` (V8-a, G3) — the diagonal crossing of a
 * parallelogram face/base. Three forms: a NAMED quad (4 cyclic vertices → the crossing
 * is the midpoint of the 1st & 3rd), TWO explicit diagonals (→ midpoint of the first),
 * or the implicit `the base` (0 vertices → the base sentinel, resolved by apply).
 */
const diagIntersection: Rule = (s) => {
  if (!/אלכסו[ןנ]|diagonal/i.test(s)) return null;
  // the intersection verb, in every form the student writes it: מפגש (noun), חיתוך/נחתכ (cut),
  // and נפגש (meet — both nun endings נפגשים/נפגשות, the ADR-3D-035 `קט[ןנ]` discipline). «נפגשים»
  // was the one gap the operator hit — «נחתכים» worked, «נפגשים» didn't (#284).
  // `intersect` (not `intersection`) so the VERB forms match too — the noun-only spelling
  // meant `…intersect at point O` fell through while `…meet at O` worked
  if (!/מפגש|נפגש|נחתכ|חיתוך|intersect|meet/i.test(s)) return null;
  const toks = labelTokens(s);
  if (toks.length === 0) return null;
  // The crossing point is named by a TRAILING marker when the student writes «…נפגשים בנקודה O» /
  // «…meet at O» (the point LAST); otherwise it is the FIRST label («O מפגש אלכסוני ABCD», point
  // first). Reading the first token as the crossing regardless — the old behaviour — silently
  // mis-bound the point-last form (English «diagonals of ABCD meet at O» built id=A, face=[B,C,D,O]).
  // `…at O` and `…at point O` are the same marker (the Hebrew `בנקודה` carries the noun
  // inside the word, so the English noun was simply missing — with it unmatched, the id fell
  // back to the FIRST label and the rule built a garbage quad)
  // #530 (P1) — the marker's OWN label is the only source of `id` once the marker word is present.
  // The positional fallback below is safe only for a sentence with no marker at all («O מפגש אלכסוני
  // ABCD», point FIRST). When the student wrote the point LAST and the marker failed to read, falling
  // back to `toks` does not fail — it silently REINTERPRETS: «אלכסוני A'B'C'D' נחתכים בנקודהS» (an
  // ordinary missing space) took A′ as the crossing and invented the quad B′C′D′S, a face the student
  // never wrote, from letters lifted out of two different roles. It reached prod. The comment above
  // records this same fallback biting once before, for the English point-last form — that fix widened
  // the marker VOCABULARY and left the fallback armed, which is why this is the second occurrence.
  //
  // So the rule is structural, not another spelling: marker present ⇒ `id` comes from the marker or
  // the rule DECLINES (escalate — the LLM may still read it), and it can never be sourced positionally.
  // That closes the class including the mistypes nobody has produced yet. Tolerating the missing
  // separator (`בנקוד[הת]\s*` — Hebrew glues the noun into the word, so «בנקודהS» is a natural slip)
  // is ergonomics ON TOP of the guard, never instead of it.
  const trailing = s.match(new RegExp(String.raw`(?:${AT_POINT}|at(?:\s+the)?(?:\s+point)?\s+)([A-Z]\d*'?)\s*$`, 'i'));
  if (!trailing && /בנקוד[הת]|\bat\b/i.test(s)) return null;
  const [id, ...rest] = trailing ? [trailing[1], ...toks.filter((t) => t !== trailing[1])] : toks;
  // TWO EXPLICITLY NAMED DIAGONALS vs. a NAMED QUAD is decided by how the student GROUPED
  // the letters — `AC ו BD` is two runs of two, `ABCD` is one run of four ([ADR-3D-071](
  // ../../docs/06b-decisions-3d.md)). Counting occurrences of the word `אלכסון` instead read
  // the Hebrew PLURAL `האלכסונים AC ו BD` (both diagonals in ONE word) as a single mention,
  // fell through to the cyclic-quad branch as the quad A→C→B→D, and silently put the crossing
  // on edge A–B instead of the face centre.
  const groups = (s.match(RUN) ?? [])
    .map((r) => r.match(TOKEN) ?? [])
    .filter((g) => !(g.length === 1 && g[0] === id));
  if (rest.length === 4 && groups.length === 2 && groups.every((g) => g.length === 2)) {
    const [a, b] = groups[0]; // two explicit diagonals — the crossing is on the first, a–b
    if (new Set(rest).size !== 4 || rest.includes(id)) return null;
    return [{ type: 'point-on-segment3', id, a, b, t: 0.5 }];
  }
  if (rest.length === 4) return [{ type: 'diag-intersection', id, face: rest }]; // named quad, cyclic
  if (rest.length === 0) return [{ type: 'diag-intersection', id, face: [] }]; // `the base` sentinel
  return null;
};

/**
 * #834 — `אלכסוני הבסיס` / `אלכסוני ABCD` / `the diagonals of the base`: DRAW the quad's two diagonals,
 * naming no crossing point.
 *
 * Two prod users (2026-08-23, same lesson) typed «אלכסוני הבסיס» and «הוסף אלכסוני בסיס» on a square
 * pyramid. Both were not-handled and escalated to the paid LLM, which built something for one and failed
 * the other — while «אלכסוני הבסיס נפגשים בנקודה O» built fine. This is a missing ARM of an existing
 * construct, not a new construct: the base carrier and the diagonal pair both existed and were reachable
 * ONLY through the form that names the crossing.
 *
 * Ownership: `diagIntersection` runs FIRST and owns any sentence with an intersection verb, so the
 * naming form is untouched; this rule declines those explicitly rather than relying on order alone.
 *
 * The leading imperative («הוסף…») is tolerated exactly as the height rule's `IMP` fragment tolerates
 * «שרטטו/ציירו/העבירו» — consistency with the neighbouring rules, not a ruling. [ADR-W-030](
 * ../../docs/06w-decisions-workspace.md) (#778) re-decides imperatives for every rule at once; when it
 * lands, this fragment goes with the rest.
 */
const quadDiagonals: Rule = (s) => {
  if (!/אלכסונ|diagonal/i.test(s)) return null;
  // the crossing form owns any sentence that names a meeting point (belt and braces over rule order)
  if (/מפגש|נפגש|נחתכ|חיתוך|intersect|meet/i.test(s)) return null;
  const IMP = String.raw`(?:(?:שרטטו?|ציירו?|העבירו?|נעביר|הוסיפו?|הוסף)\s+(?:את\s+)?)?`;
  // PLURAL only: «אלכסון AC'» is a single named segment and belongs to the diagonal-noun rule.
  const HE_DIAGS = String.raw`ה?אלכסונ(?:ים|י)\s*(?:של\s+)?`;
  const EN_DIAGS = String.raw`(?:the\s+)?diagonals\s+(?:of\s+)?`;
  const BASE = String.raw`(?:ה?בסיס(?:\s+(?:של\s+)?ה?\S+)?|(?:the\s+)?base(?:\s+of\s+the\s+\S+)?)`;
  // (a) THE BASE — the sentinel; apply resolves it to the single solid's base ring.
  if (new RegExp(`^${IMP}(?:${HE_DIAGS}|${EN_DIAGS})${BASE}\s*$`, 'i').test(s.trim())) {
    return [{ type: 'quad-diagonals', face: [] }];
  }
  // (b) A NAMED QUAD — «אלכסוני ABCD» — the same lowering with the ring spelled out.
  const named = new RegExp(`^${IMP}(?:${HE_DIAGS}|${EN_DIAGS})((?:${LBL})+)\s*$`, 'i').exec(s.trim());
  if (named) {
    const ids = named[1].match(TOKEN) ?? [];
    if (ids.length === 4 && new Set(ids).size === 4) return [{ type: 'quad-diagonals', face: ids }];
  }
  return null;
};

/**
 * #819 (ADR-3D-177) — the SEGMENT × PLANE-RUN cell of ⟂/∥: either relation, either ORDER, either
 * NOTATION, read through the shared operand seam (ADR-3D-140's `readRelationSides`).
 *
 * This replaces two hand-written rules that each spelled their own operand order and notation, and had
 * drifted apart in the process: the ⟂ one accepted the `⊥` symbol, an optional plane keyword and the
 * «בסיס» sentinel, while its ∥ twin demanded the literal «מקביל למישור» and so refused «AB∥ACD» and
 * «AB מקביל ל-ACD» outright. Neither accepted the PLANE-FIRST order, so «המישור ACD מקביל ל-SB» was
 * not-handled while its own mirror «SB מקביל למישור ACD» built — a relation the engine resolves
 * symmetrically, readable in one frame only. That is the trap `src3d/CLAUDE.md` names: a rule carrying
 * one frame silently drops the other on a capability the engine already has.
 *
 * Classifying instead of spelling makes order-freedom, the symbol forms, the plural/noun morphology
 * («המישורים», «פאה», «בסיס») and He+En consequences rather than cases anyone has to remember. The
 * split regexes (`PERP_SPLIT`/`PAR_SPLIT`) already carried every predicate spelling; only the operand
 * halves were enumerated.
 *
 * The ring's edges are drawn for whatever arity the student named (#380), and a run of ≥3 labels can
 * only be a plane (a segment is exactly 2), which is why the plane keyword may be omitted.
 */
const segPlaneRel: Rule = (s0) => {
  const s = stripStatementPrefix(s0);
  for (const [split, rel] of [[PERP_SPLIT, 'perp'], [PAR_SPLIT, 'parallel']] as const) {
    const parts = s.split(split);
    if (parts.length !== 2) continue;
    // the BASE sentinel: «AS ניצב לבסיס» / «AB מקביל לבסיס» — a bare role noun heads no token, so it
    // never reaches the operand reader; plane [] is resolved by apply from the figure's single solid.
    const seg = readOperand(parts[0]);
    if (/^(?:מישור\s+|plane\s+(?:of\s+the\s+)?)?(?:ה?בסיס|the\s+base|base)$/i.test(parts[1].trim()) && seg?.op.kind === 'segment') {
      return [{ type: 'seg-plane-rel', rel, a: seg.op.a, b: seg.op.b, plane: [] }];
    }
    const sides = readRelationSides(parts[0], parts[1]);
    if (!sides) continue;
    const [a, b] = sides;
    const segSide = a.op.kind === 'segment' ? a : b.op.kind === 'segment' ? b : null;
    const planeSide = a.op.kind === 'plane-run' ? a : b.op.kind === 'plane-run' ? b : null;
    if (segSide?.op.kind !== 'segment' || planeSide?.op.kind !== 'plane-run') continue;
    const ring = planeSide.op.ids;
    // lowered as a RELATION: the engine decides — a symbol PIN when an endpoint is a symbolic
    // vec-defined point (V7), else the V1 claim (segments drawn by apply).
    //
    // #821 (ADR-3D-177 Am. 1, operator ruling 2026-08-30): a plane the student NAMES in a relation is
    // DRAWN — its ring's edges — for ∥ exactly as for ⟂ («if we reference a plane … we should draw
    // ACD; the user has the option of disabling it through the input panel»). The honesty invariant:
    // everything the student stated is visible on the figure. Both arities, both operand orders, both
    // notations, because the ring comes from the classified operand, not from a spelled rule.
    const edges: Command3[] = ring.map((q, i) => ({ type: 'segment3', a: q, b: ring[(i + 1) % ring.length] }));
    return [...edges, { type: 'seg-plane-rel', rel, a: segSide.op.a, b: segSide.op.b, plane: ring }];
  }
  return null;
};

/** A ⟂-operand: a point PAIR (`SM`) or a named vector (`u`). Strict case — a single
 *  uppercase letter is a point, never a vector name, so it yields no atom. */
const perpOperand = (tok: string): VecAtom | null => {
  const pm = tok.match(/^([A-Z]\d*'?)([A-Z]\d*'?)$/);
  if (pm) return pm[1] === pm[2] ? null : { kind: 'pair', from: pm[1], to: pm[2] };
  return /^[a-w]$/.test(tok) ? { kind: 'named', name: tok } : null;
};

/**
 * Issue #14: a stated ⟂ between two SEGMENTS / named VECTORS — `SM ⊥ DB` / `SM מאונך ל-DB` /
 * `SM is perpendicular to DB` / `u ⊥ v` / plural `SM ו-DB מאונכים זה לזה`. Lowers to the
 * V8-f `cos-angle` with cos = 0 (no new engine construct) — M1 at apply: a driving scalar
 * pin on a free-dim solid, a verified claim on a determined figure; both operands auto-draw.
 * A target run of 3–4 points is a PLANE and stays with segPlaneRel (which runs first).
 */
const perpSegGiven: Rule = (s0) => {
  const s = stripStatementPrefix(s0);
  if (!/⊥|מאונ[ךכ]|ניצב|אנך|perpendicular/i.test(s)) return null; // מאונ[ךכ]: the plural מאונכים has a REGULAR kaf
  const TOK = String.raw`([A-Z]\d*'?[A-Z]\d*'?|[a-w])`;
  const NOUN = String.raw`(?:ה?קטע\s+|ה?מקצוע\s+|ה?ישר\s+|ה?ו?וקטור\s+|(?:the\s+)?(?:segment|edge|line|vector)\s+)?`;
  const NOUNS = String.raw`(?:ה?קטעים\s+|ה?ישרים\s+|ה?מקצועות\s+|ה?ו?וקטורים\s+|(?:the\s+)?(?:segments|edges|lines|vectors)\s+)?`;
  const m =
    s.match(new RegExp(`^${NOUN}${TOK}\\s*(?:⊥|מאונך|ניצב|אנך|(?:is\\s+)?perpendicular)\\s*(?:ל|to\\s+(?:the\\s+)?)?-?\\s*${NOUN}${TOK}\\s*$`, 'i')) ??
    s.match(new RegExp(`^${NOUNS}${TOK}\\s+(?:ו-?|and\\s+)\\s*${TOK}\\s+(?:מאונכים|ניצבים|are\\s+perpendicular)(?:\\s+זה\\s+לזה)?\\s*$`, 'i'));
  if (!m) return null;
  const u = perpOperand(m[1]);
  const v = perpOperand(m[2]);
  if (!u || !v) return null;
  return [{ type: 'cos-angle', u, v, cos: 0 }];
};

/** `E, C, A' על ישר אחד` / `E, C, A' are collinear` — a CLAIM. */
const collinearClaim: Rule = (s0) => {
  const s = stripStatementPrefix(s0);
  if (!/על\s+ישר\s+אחד|on\s+one\s+line|collinear/i.test(s)) return null;
  const ids = labelTokens(s);
  if (ids.length < 3 || new Set(ids).size !== ids.length) return null;
  return [{ type: 'claim', claim: { type: 'collinear3', ids } }];
};

/**
 * 2020-Q2's span-defined point: `P על AM כך ש-KP = αu + βv` — Greek scalars mark
 * the UNKNOWN coefficients, so this DEFINES P (t driven closed-form), it is not a claim.
 */
const spanPoint: Rule = (s) => {
  const m = s.match(
    /^([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+|is\s+)?(?:על|on)\s+(?:הקטע\s+|segment\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:כך\s+ש-?|such\s+that\s+)\s*([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*[α-ω]\s*·?\s*([a-z])\s*\+\s*[α-ω]\s*·?\s*([a-z])\s*$/,
  );
  if (!m) return null;
  const [, id, a, b, vFrom, vTo, n1, n2] = m;
  if (vTo !== id || n1 === n2 || id === a || id === b || a === b) return null;
  return [
    { type: 'point-in-span', id, a, b, vecFrom: vFrom, span: [n1, n2] },
    { type: 'segment3', a, b },
    { type: 'segment3', a: vFrom, b: id },
  ];
};

/**
 * #513 — a RADICAND: a bare number, or a PARENTHESISED number or fraction. `√48` parsed while
 * `√(48)` did not, though parenthesising the radicand is the ordinary way to write it and nothing in
 * the UI signals that the bare spelling is the required one — the operator needed four attempts and
 * burnt two paid LLM escalations to state one magnitude.
 *
 * It is ONE fragment, shared by every √-bearing lexical atom below ({@link VAL}, {@link SYM_TERM}),
 * and read by the ONE reader {@link evalRadical}. That pairing is the point: the recurring
 * paren-blindness class (#299, #300, and this) keeps coming back because each reader grows its own
 * private term grammar, so widening the atom without widening the reader — or one atom without its
 * siblings — is how the next instance gets written. A radicand needing real ARITHMETIC (`√(4·3)`)
 * still refuses honestly; that is the arithmetic-expression reader ruled for #509, not a fourth
 * private branch here.
 */
/** The UNSIGNED decimal — the atom every numeric fragment in this file is built from, and the one
 *  {@link NUM} signs. Introduced with #513 because the lexical ratchet (docs/24 S2.1) is right: a new
 *  regex must COMPOSE from an atom, never inline a fresh copy. Composing the radicand work from it
 *  retires more inline copies than the fix adds, so the recorded ceiling moves DOWN. */
const UNUM = String.raw`\d+(?:\.\d+)?`;

const RADICAND = String.raw`(?:\(\s*${UNUM}(?:\s*\/\s*${UNUM})?\s*\)|${UNUM})`;

/**
 * A term whose coefficient may carry ONE scalar symbol (V7): `(k/2)DB`, `kDC`,
 * `2k·u`, `t·BE`, plus every numeric form. Null on anything else.
 */
const SYM_TERM = new RegExp(
  String.raw`^([+-])?\s*(?:\(([^()]+)\)\s*[·×*]?\s*)?((?:${UNUM})?\s*(?:√\s*${RADICAND})?(?:\s*\/\s*${UNUM})?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])?\s*[·×*]?\s*([a-w])?\s*[·×*]?\s*(?:([A-Z]\d*'?)([A-Z]\d*'?)|([a-z]))\s*(?:\/\s*(${UNUM}))?$`,
);

export function parseSymExpr(src: string): { terms: SymTerm[]; symbol?: string } | null {
  const parts = splitTopLevelTerms(src);
  if (!parts || parts.length === 0) return null;
  const terms: SymTerm[] = [];
  let symbol: string | undefined;
  const bindSymbol = (letter: string): boolean => {
    if (symbol && symbol !== letter) return false;
    symbol = letter;
    return true;
  };
  for (const part of parts) {
    const m = part.match(SYM_TERM);
    if (!m) return null;
    const [, sign, paren, numRaw, symLetter, pairA, pairB, named, divisor] = m;
    let coeff: LinExpr = { k: 1, p: 0 };
    if (paren) {
      // every parenthesised coefficient goes through the ONE grammar — the `(k/2)`
      // form has no fast path of its own (ADR-3D-069: the carve-out was what hid
      // the gap, since it made `(k/6)` work where `(0.5+k/6)` did not)
      const pe = parseParamExpr(paren);
      if (!pe) return null;
      if (pe.param && !bindSymbol(pe.param)) return null;
      coeff = pe.expr;
    }
    if (numRaw !== undefined && numRaw !== '') {
      const n = parseCoeff(numRaw);
      if (n === null) return null;
      coeff = { k: coeff.k * n, p: coeff.p * n };
    }
    if (symLetter) {
      if (!bindSymbol(symLetter)) return null;
      coeff = { k: 0, p: coeff.k }; // the letter multiplies the numeric part
    }
    if (divisor) {
      coeff = { k: coeff.k / +divisor, p: coeff.p / +divisor };
    }
    const neg = (x: number) => (x === 0 ? 0 : -x); // never emit -0 (JSON round-trips it to 0)
    const signed: LinExpr = sign === '-' ? { k: neg(coeff.k), p: neg(coeff.p) } : coeff;
    if (pairA) terms.push({ coeff: signed, atom: { kind: 'pair', from: pairA, to: pairB } });
    else terms.push({ coeff: signed, atom: { kind: 'named', name: named } });
  }
  return { terms, symbol };
}

/**
 * `AM = ½u + ½v + 5/3w` / `DF = (k/2)DB + kDC` / `A'K = 4/5 DN` — a VECTOR
 * RELATION: pair-LHS forms lower to `vec-rel` and the ENGINE decides claim vs
 * definition (the M1 shape); a non-pair LHS stays a plain claim.
 */
let VEC_MARKED = false; // set per-parse; see parse3()

/** #516 — the letter `parametricLine`'s both-roles guard refused on, recorded so `parse3`'s
 *  fallthrough can surface the TYPED refusal instead of `not-handled` (which would hand the
 *  ambiguity to the LLM lane to guess). Set by the rule, read only after NO rule matched — so it
 *  can never steal an utterance some other rule legitimately owns. Reset per-parse. */
let PARAM_CONFLATED: string | null = null;
/** #836: a rule saw «אלכסון ראשי» used as a definite REFERENCE — four candidates, so it must ask. */
let MAIN_DIAGONAL_AMBIGUOUS = false;

/** The VALUE of a {@link RADICAND} capture — `48`, `(48)`, `(12/4)`. Null on a zero denominator, so a
 *  malformed radicand refuses rather than reaching a figure as NaN or Infinity. */
const RADICAND_FRAC_RE = new RegExp(String.raw`^(${UNUM})\s*\/\s*(${UNUM})$`);
function radicandValue(raw: string): number | null {
  const inner = raw.trim().replace(/^\(\s*(.*?)\s*\)$/, '$1');
  const frac = inner.match(RADICAND_FRAC_RE);
  if (frac) return +frac[2] === 0 ? null : +frac[1] / +frac[2];
  const v = +inner;
  return Number.isFinite(v) ? v : null;
}

/** Evaluate a small numeric expression with radicals: 3, 3/4, √6/4, 2√3, (√6/4), and — #513 — a
 *  parenthesised radicand: √(48), 2√(3), √(12/4), √(48)/4. */
const RADICAL_RE = new RegExp(String.raw`^(${UNUM})?\s*(?:√\s*(${RADICAND}))?\s*(?:\/\s*(${UNUM}))?$`);
function evalRadical(raw: string): number | null {
  const s0 = raw.trim().replace(/^\((.*)\)$/, '$1').trim();
  if (s0 === '') return null;
  const m = s0.match(RADICAL_RE);
  if (!m || (!m[1] && !m[2])) return null;
  const a = m[1] ? +m[1] : 1;
  const radicand = m[2] !== undefined ? radicandValue(m[2]) : 1;
  if (radicand === null || radicand < 0) return null; // √ of a negative is not a real magnitude
  const r = m[2] !== undefined ? Math.sqrt(radicand) : 1;
  const d = m[3] ? +m[3] : 1;
  if (d === 0) return null;
  return (a * r) / d;
}

/** `|EN| = (√6/4)·|w|` / `|AS| = |AB|` / `אורך EN שווה לאורך AS` / bare `AS = AB` — a
 *  LENGTH relation (never a vector equation unless an explicit ⃗ arrow was typed). */
const lengthRel: Rule = (s) => {
  if (VEC_MARKED) return null; // the arrow says VECTOR — vecEqClaim's territory
  const P = "([A-Z]\\d*'?)([A-Z]\\d*'?)";
  // |w| = 2 — a numeric magnitude on a NAMED vector (resolved to its pair at apply)
  const vm = s.match(/^\|([a-w])\|\s*(?:=|שווה\s+ל)\s*(.+)$/);
  if (vm) {
    const val = evalRadical(vm[2]);
    return val === null ? null : [{ type: 'vec-mag', name: vm[1], value: val }];
  }
  // the copula `הוא`/`is` joins the separators (the exam's `אורך המקצוע AB הוא 5√5` —
  // the ADR-3D-026 phrasing class)
  const lhs = s.match(new RegExp(`^(?:\\|${P}\\||(?:אורך|length)\\s+(?:המקצוע\\s+|הצלע\\s+|צלע\\s+)?${P})\\s*(?:=|שווה\\s+ל|הוא\\s|is\\s)\\s*(.+)$`));
  if (!lhs) return null; // bare `AS = AB` is AMBIGUOUS — parse3 surfaces the clarification, never a guess
  const a1 = lhs[1] ?? lhs[3];
  const b1 = lhs[2] ?? lhs[4];
  const r = lhs[5].trim();
  // purely numeric RHS (`|AS| = 12`) → the ordinary length given
  const num = evalRadical(r);
  if (num !== null)
    return [
      { type: 'segment3', a: a1, b: b1 },
      { type: 'claim', claim: { type: 'length-eq', a: a1, b: b1, value: num } },
    ];
  // [coefficient ·]? tail — tail is |ZW|, |w|, אורך/length ZW, צלע הריבוע ABCD, or bare ZW.
  // The product commutes: the coefficient may come BEFORE (√6/4·|w|) or AFTER (|w|·√6/4).
  const tail = (re: string): { c: number; g: string[] } | null => {
    let mm = r.match(new RegExp(`^(.*?)\\s*[·×*]?\\s*${re}\\s*$`));
    if (mm) {
      const c = mm[1].trim() === '' ? 1 : evalRadical(mm[1]);
      if (c !== null) return { c, g: mm.slice(2) };
    }
    mm = r.match(new RegExp(`^${re}\\s*[·×*]?\\s*(.+)$`));
    if (mm) {
      const c = evalRadical(mm[mm.length - 1]);
      if (c !== null) return { c, g: mm.slice(1, -1) };
    }
    return null;
  };
  let t = tail(`\\|${P}\\|`) ?? tail(`(?:אורך|length)\\s+(?:המקצוע\\s+)?${P}`);
  if (t) return [{ type: 'segment3', a: a1, b: b1 }, { type: 'length-rel', a1, b1, rhs: { pair: [t.g[0], t.g[1]] }, c: t.c }];
  t = tail("\\|([a-w])\\|");
  if (t) return [{ type: 'segment3', a: a1, b: b1 }, { type: 'length-rel', a1, b1, rhs: { vec: t.g[0] }, c: t.c }];
  // `שווה לאורך צלע הריבוע ABCD` — any side of the named square; its first edge stands in
  const sq = r.match(/^(?:אורך\s+)?(?:ה?צלע\s+)?(?:של\s+)?הריבוע\s+([A-Z]\d*'?)([A-Z]\d*'?)(?:[A-Z]\d*'?)*\s*$/) ?? r.match(/^(?:אורך\s+)?צלע\s+([A-Z]\d*'?)([A-Z]\d*'?)(?:[A-Z]\d*'?)*\s*$/);
  if (sq) return [{ type: 'segment3', a: a1, b: b1 }, { type: 'length-rel', a1, b1, rhs: { pair: [sq[1], sq[2]] }, c: 1 }];
  // #72 / #55 gap (b): a BARE pair RHS, with or without a radical coefficient (`אורך AB=BC`,
  // `|AB| = √2·OD`, `|AB| = OD`) — the explicit length marker on the LHS already disambiguated the whole
  // utterance to LENGTH, so the bare pair reads as |ZW| (bare `AB=BC` with NO length marker stays the
  // ambiguous-vector-length clarification — this rule is only reached through the marked lhs). `tail(P)`
  // carries the coefficient (before OR after the pair), so `√2·OD` lands c=√2 and plain `OD` lands c=1.
  t = tail(P);
  if (t) return [{ type: 'segment3', a: a1, b: b1 }, { type: 'length-rel', a1, b1, rhs: { pair: [t.g[0], t.g[1]] }, c: t.c }];
  return null;
};

/**
 * Magnitude equality over vector EXPRESSIONS, chained (#393/#335, ADR-3D-107):
 * `|u|=|v|=1` · `|u|=|v|=|w|` · `|w+u| = |w-u|` · `|2w+3v|=|3v-2w|` · `|AB+AC|=|AB-AC|` ·
 * `2|u| = |v|` · `|u| שווה ל-|v|`.
 *
 * Runs AFTER lengthRel, so every form that rule owns (`|w|=2`, `|AB|=5`, `|EN|=(√6/4)·|w|`…)
 * keeps its owner byte-identical; this rule takes only what used to fall to the LLM. Grammar:
 * links separated by `=`/«שווה ל», each link a magnitude `[c·]|expr|[·c]` (radical coefficient,
 * expr via the ONE shared parseVecExpr — so `(1-t)u` with a SYMBOL is honestly rejected, the
 * all-or-nothing discipline) or a NUMBER. All stated numbers must agree; each magnitude then
 * pins to the value (`mag-val`, |e| = v/c), else adjacent pairs relate (`mag-rel`,
 * |eᵢ| = (cᵢ₊₁/cᵢ)·|eᵢ₊₁|). Apply normalizes simple atoms onto vec-mag/length-eq/length-rel.
 */
const magEquality: Rule = (s) => {
  if (!s.includes('|')) return null;
  const links = s.split(/\s*=\s*|\s+שווה\s+ל-?\s*/).map((t0) => t0.trim()).filter((t0) => t0 !== '');
  if (links.length < 2) return null;
  type MagLink = { expr: VecExpr; c: number };
  const mags: MagLink[] = [];
  const nums: number[] = [];
  for (const link of links) {
    const num = evalRadical(link);
    if (num !== null) {
      nums.push(num);
      continue;
    }
    let cs = '';
    let inner = '';
    let m = link.match(/^(.*?)\s*[·×*]?\s*\|([^|]+)\|\s*$/);
    if (m) {
      cs = m[1].trim();
      inner = m[2];
    } else {
      m = link.match(/^\|([^|]+)\|\s*[·×*]?\s*(.+)$/);
      if (!m) return null;
      inner = m[1];
      cs = m[2].trim();
    }
    const c = cs === '' ? 1 : evalRadical(cs);
    if (c === null || c <= 0) return null;
    const expr = parseVecExpr(inner);
    if (!expr || expr.length === 0) return null;
    mags.push({ expr, c });
  }
  if (mags.length === 0) return null;
  if (new Set(nums).size > 1) return null; // |u|=1=2 is a contradiction, not a parse
  const draw = (e: VecExpr): Command3[] => segmentsOf(e);
  if (nums.length > 0) {
    const v = nums[0];
    return mags.flatMap((mg) => [...draw(mg.expr), { type: 'mag-val', e: mg.expr, value: v / mg.c } as Command3]);
  }
  if (mags.length < 2) return null; // a lone magnitude with no value/partner says nothing
  const out: Command3[] = [];
  for (let i = 0; i + 1 < mags.length; i++) {
    out.push(...draw(mags[i].expr), ...draw(mags[i + 1].expr));
    out.push({ type: 'mag-rel', e1: mags[i].expr, e2: mags[i + 1].expr, c: mags[i + 1].c / mags[i].c } as Command3);
  }
  return out;
};

/** `k = 1/2` (הציבו) — assign the named parameter; also `α = 70`, a value for an angle NAME
 *  ([ADR-3D-052](docs/06b-decisions-3d.md), issue #272). One command for "give this symbol a value":
 *  `apply` resolves what the letter denotes (a vector-def parameter or a labelled angle), the way 2-D's
 *  `set-var` resolves through its symbol table. x/y/z stay coordinates. */
const symbolValue: Rule = (s) => {
  const m = s.match(/^([a-wα-ωΑ-Ω])\s*(?:=|היא|הוא|is)\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?\s*°?\s*$/);
  if (!m || 'xyz'.includes(m[1])) return null;
  const v = m[3] ? +m[2] / +m[3] : +m[2];
  return [{ type: 'symbol-value', symbol: m[1], value: v }];
};

/** `נפח הפירמידה SENB שווה לנפח הפירמידה CENB` — two tetra volumes are equal (a claim). */
const volumeEqPoly: Rule = (s) => {
  const P4 = "((?:[A-Z]\\d*'?){4})";
  const m =
    s.match(new RegExp(`^נפח\\s+(?:הפירמידה\\s+)?${P4}\\s*(?:=|שווה\\s+ל-?)\\s*(?:נפח\\s+)?(?:הפירמידה\\s+)?${P4}$`)) ??
    s.match(new RegExp(`^(?:the\\s+)?volume\\s+of\\s+(?:the\\s+)?pyramid\\s+${P4}\\s+(?:=|equals?)\\s+(?:the\\s+)?volume\\s+of\\s+(?:the\\s+)?pyramid\\s+${P4}$`, 'i'));
  if (!m) return null;
  const split = (g: string) => g.match(/[A-Z]\d*'?/g)!;
  return [{ type: 'claim', claim: { type: 'volume-eq-poly', ids1: split(m[1]), ids2: split(m[2]) } }];
};

const vecEqClaim: Rule = (s0) => {
  const s = stripStatementPrefix(s0);
  if (GREEK.test(s)) return null; // unknown scalars belong to spanPoint, never a claim
  const parts = s.split('=');
  if (parts.length !== 2) return null;
  const lhsPair = parts[0].trim().match(/^([A-Z]\d*'?)([A-Z]\d*'?)$/);
  if (lhsPair) {
    const rhs = parseSymExpr(parts[1]);
    if (!rhs) return null;
    return [{ type: 'vec-rel', from: lhsPair[1], to: lhsPair[2], terms: rhs.terms, symbol: rhs.symbol }];
  }
  const lhs = parseVecExpr(parts[0]);
  const rhs = parseVecExpr(parts[1]);
  if (!lhs || !rhs) return null;
  return [...segmentsOf(lhs), ...segmentsOf(rhs), { type: 'claim', claim: { type: 'vec-eq', lhs, rhs } }];
};

/** `AS גובה (הפירמידה)` / `AS אנך` / `AS is the height` — a solid's stated height: the
 *  segment is ⟂ the base (the base-sentinel plane: [], resolved by apply). */
const heightOfSolid: Rule = (s) => {
  // V8-e (G5): a height to a NAMED FACE → the foot of the ⟂ from the apex onto that face's plane
  const faceM = s.match(/(?:לפאה|לפאת|to\s+(?:the\s+)?face)\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)/);
  if (faceM) {
    const seg =
      s.match(/(?:המקצוע\s+|הצלע\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:הוא\s+)?(?:גובה|אנך)/) ??
      s.match(/([A-Z]\d*'?)([A-Z]\d*'?)\s+is\s+the\s+(?:height|altitude)/i);
    if (!seg) return null;
    return [{ type: 'height-to-face', id: seg[2], from: seg[1], face: [faceM[1], faceM[2], faceM[3]] }];
  }
  const m =
    s.match(/^(?:המקצוע\s+|הצלע\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:הוא\s+)?(?:גובה|אנך)(?:\s+(?:בפירמידה|במנסרה|הפירמידה|המנסרה|של\s+הפירמידה|של\s+המנסרה))?\s*$/) ??
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s+is\s+the\s+(?:height|altitude)(?:\s+of\s+the\s+(?:pyramid|prism))?\s*$/i);
  if (!m) return null;
  return [{ type: 'seg-plane-rel', rel: 'perp', a: m[1], b: m[2], plane: [] }];
};

/** #72: `חץ A'C` / `arrow A'C` — draw the pair as an UNNAMED ink arrow (the named-basis lane
 *  stays `נסמן: AB = u`; an unnamed arrow never joins the basis). The vector WORD (`וקטור AB`)
 *  is normalize3-stripped decoration and deliberately keeps its established segment reading. */
const drawArrow: Rule = (s) => {
  const m = s.match(/^(?:ה?חץ|(?:the\s+)?arrow)\s+([A-Z]\d*'?)([A-Z]\d*'?)\s*$/);
  if (!m || m[1] === m[2]) return null;
  return [{ type: 'draw-arrow', from: m[1], to: m[2] }];
};

/** #72: `אנך יורד מ-M לבסיס` (the prod form was fully GLUED: `מMלבסיס`) / `מ-M מורידים אנך
 *  לבסיס` / `drop a perpendicular from M to the base` — the ⟂ from a point onto the solid's
 *  base; the foot is auto-minted at apply (parse3 is context-free). */
const perpToBase: Rule = (s) => {
  const m =
    s.match(/^ה?אנך\s+(?:ה?יורד\s+)?מ-?\s*([A-Z]\d*'?)\s*ל-?\s*ה?בסיס\s*$/) ??
    s.match(/^מ-?\s*([A-Z]\d*'?)\s+(?:מורידים|הורידו|מעבירים|העבירו)\s+אנך\s+ל-?\s*ה?בסיס\s*$/) ??
    s.match(/^(?:drop\s+)?(?:a\s+|the\s+)?perpendicular\s+from\s+([A-Z]\d*'?)\s+to\s+(?:the\s+)?base\s*$/i);
  if (m) return [{ type: 'perp-to-base', from: m[1] }];
  return heightFromApex(s);
};

/**
 * #448 — the height stated by its APEX instead of by its segment: `גובה הפירמידה מנקודה D`,
 * `גובה לפירמידה מ-D`, `גובה מנקודה D לבסיס ABC`, `גובה מ D לבסיס`.
 *
 * Operator, 2026-08-09: *"I want to be able to support גובה הפירמידה מנקודה X … without having to name
 * the segment (of course we can if user wants but tool should understand the meaning)."* Every existing
 * `גובה` rule requires the student to name the segment FIRST (`AS גובה הפירמידה`, `CD גובה במשולש ABC`),
 * which is not how a bagrut question words it — it names the apex and the base, and the foot is a point
 * the student never mentions. That foot is exactly what `perp-to-base` already auto-mints (#72), so this
 * is a phrasing gap, not a missing construct: the whole family lowers onto the existing command.
 *
 * **A solid noun or a base clause is REQUIRED — the bare `גובה מנקודה D` deliberately does not match.**
 * The operator ruled that form genuinely unclear (#467: no solid, no base, nothing to drop onto), so it
 * must keep falling through to the guidance register rather than being silently resolved here. That is
 * the one thing this rule must not over-reach on, and it is why the two optional groups are checked
 * rather than merely allowed.
 *
 * #503 ([ADR-3D-142](../../docs/06b-decisions-3d.md)) — the #448 remainder, orphaned by PR #469's
 * auto-close and re-filed by triage:
 *  - the APEX-LESS «גובה הפירמידה» / "the height of the pyramid": no FROM at all — the apex is the
 *    solid's, derived at apply (base ids first, apex last). Gated to the PYRAMID noun: a prism has no
 *    apex to derive, so its bare height stays out (apply refuses `bad-solid` even if reached).
 *  - the IMPERATIVE + relative clause «שרטט גובה לפירמידה שיוצא מהקודקוד D לבסיס הפירמידה»: an optional
 *    leading imperative, «שיוצא מ…» as a FROM variant, and the base clause may carry the solid noun
 *    («לבסיס הפירמידה») — each a stated-in-more-than-one-FRAME gap, not a new construct.
 * Named groups per the src3d convention — the positional read broke the first time a pattern grew.
 */
const heightFromApex: Rule = (s) => {
  const SOLID = String.raw`(?:ה|ל|של\s+ה)?(?:פירמידה|מנסרה|חרוט|גוף)`;
  const IMP = String.raw`(?:(?:שרטטו?|ציירו?|העבירו?|נעביר|הוסיפו?)\s+(?:את\s+)?)?`;
  const FROM = String.raw`(?:ש?יוצא\s+)?מ-?\s*(?:נקודה\s+|ה?קודקוד\s+)?`;
  const m =
    s.match(
      new RegExp(
        `^${IMP}ה?גובה(?<solid>\\s+${SOLID})?` +
          `(?:\\s+${FROM}(?<from>[A-Z]\\d*'?))?` +
          `(?:\\s+ל-?\\s*ה?בסיס(?<baseSolid>\\s+ה?(?:פירמידה|מנסרה|חרוט|גוף))?(?:\\s+(?<b1>[A-Z]\\d*'?)(?<b2>[A-Z]\\d*'?)(?<b3>[A-Z]\\d*'?))?)?\\s*$`,
      ),
    ) ??
    s.match(
      new RegExp(
        `^(?:draw\\s+)?(?:a\\s+|the\\s+)?(?:height|altitude)(?<solid>\\s+(?:of|to)\\s+(?:the\\s+)?(?:pyramid|prism|cone|solid))?` +
          `(?:\\s+(?:that\\s+goes\\s+)?from\\s+(?:point\\s+|(?:the\\s+)?vertex\\s+)?(?<from>[A-Z]\\d*'?))?` +
          `(?:\\s+to\\s+(?:the\\s+)?base(?<baseSolid>\\s+of\\s+the\\s+(?:pyramid|prism|cone|solid))?(?:\\s+(?<b1>[A-Z]\\d*'?)(?<b2>[A-Z]\\d*'?)(?<b3>[A-Z]\\d*'?))?)?\\s*$`,
        'i',
      ),
    );
  if (!m?.groups) return null;
  const { solid, from, b1, b2, b3 } = m.groups;
  const face = b1 && b2 && b3 ? [b1, b2, b3] : undefined;
  // the base clause is present iff the utterance said בסיס/base at all — a named face implies it
  const saidBase = /ל-?\s*ה?בסיס|to\s+(?:the\s+)?base/i.test(s);
  if (!solid && !saidBase) return null; // the #467 bare form — guidance, never a guess
  if (face && new Set(face).size !== 3) return null;
  // #503 apex-less: only the pyramid's height names a derivable apex — «גובה המנסרה» is not a
  // vertex-to-base perpendicular and must keep escalating rather than guess a vertex (ADR-052).
  if (!from && !/פירמידה|pyramid/i.test(solid ?? '')) return null;
  return [{ type: 'perp-to-base', ...(from ? { from } : {}), ...(face ? { face } : {}) }];
};

/** A bare auxiliary segment: `AM` / `קטע AM` / `segment CA'` — plus the #72 prod forms: the
 *  connect-imperative (`נחבר את D'F`) and the diagonal noun (`אלכסון BD'` — a diagonal IS a
 *  segment, pure ink; the final-ם slip `אלכסום` admitted per the ADR-3D-035 מאונ[כך] precedent).
 *  Last rule — everything else wins first.
 *
 *  #449 (2 users, operator-approved from the 2026-08-08 triage): the diagonal noun may carry the SOLID
 *  it belongs to. «אלכסון תיבה AC'» names exactly the segment «אלכסון AC'» names — a space diagonal IS
 *  a segment (the #72 ruling) — but the qualifier was not admitted, so the label group had to match
 *  «תיבה», the rule declined, and every occurrence burnt a paid LLM call. The solid nouns are one
 *  shared fragment rather than a private spelling, and the English «(space|body|main) diagonal of the
 *  box» forms join here. No ordering risk: this rule runs last, and `cubeOrBox` returns null on a
 *  two-token utterance, so a solid DECLARATION can never be read as a diagonal. */
// #836: the ROLE qualifier joins the SOLID one — «אלכסון ראשי AC'» / «אלכסון המרחב AC'» name exactly the
// segment «אלכסון AC'» names, so they belong to this family rather than to a parallel path. One rule, one
// lowering: the role word is redundant, not an error.
const SOLID_QUALIFIER = String.raw`(?:ה?(?:תיב[הת]|קוביי?[הת]|מנסר[הת]|פירמיד[הת]|ראשי|מרחב(?:י)?)\s+)`;
/** #859 — the PAIR-FIRST order: «AC אלכסון ראשי», «AC אלכסון». Every other construct noun in this
 *  grammar reads either order; the diagonal noun read only noun-first, so the operator's own spelling
 *  was `not-handled`. Normalised to the noun-first form the family rule already owns, rather than
 *  duplicating the rule — one lowering, two word orders. */
const PAIR_FIRST_DIAGONAL = new RegExp(
  String.raw`^((?:[A-Z]\d*'?){2})\s+(ה?אלכסו[ןם](?:\s+ה?(?:ראשי|מרחב(?:י)?|תיב[הת]|קוביי?[הת]))?)\s*$`,
);

const BARE_SEGMENT_RE = new RegExp(
  String.raw`^(?:קטע\s+|העבירו\s+(?:את\s+)?|נ?חבר\s+(?:את\s+)?|ה?אלכסו[ןם]\s+${SOLID_QUALIFIER}?|segment\s+|draw\s+|connect\s+|join\s+|(?:the\s+)?(?:space|body|main)?\s*diagonal\s+(?:of\s+the\s+(?:box|cube|prism|pyramid)\s+)?)?([A-Z]\d*'?)([A-Z]\d*'?)\s*$`,
);
/**
 * #859 — WHICH claim the sentence made about the pair, so apply can check it.
 *
 * Operator ruling 2026-09-01: *"the term אלכסון should be sure to be a diagonal … if the word is used."*
 * The word was decoration before: «אלכסון AB» drew an EDGE and called it a diagonal, «אלכסון ראשי AC»
 * drew a FACE diagonal and called it a main one — both silent, both with a green ✓.
 *
 *  - `space`  — «ראשי» / «המרחב» / «תיבה» / «קובייה» / space|body|main: a diagonal THROUGH the solid.
 *  - `any`    — a bare «אלכסון» / «diagonal»: face or space, but never an edge.
 *  - absent   — «קטע AB» / «חבר AB» and friends assert nothing about the pair, so nothing is checked.
 *
 * `מנסרה` / `פירמידה` deliberately yield `any`, not `space`: a pyramid HAS no space diagonal, so
 * demanding one would refuse the face diagonal the student legitimately drew.
 */
const SPACE_CLAIM = /ה?אלכסו[ןם]\s+ה?(?:ראשי|מרחב(?:י)?|תיב[הת]|קוביי?[הת])|(?:space|body|main)\s+diagonal|diagonal\s+of\s+the\s+(?:box|cube)/i;
const ANY_CLAIM = /ה?אלכסו[ןם]|diagonal/i;

const bareSegment: Rule = (s) => {
  const pf = s.match(PAIR_FIRST_DIAGONAL);
  if (pf) s = `${pf[2]} ${pf[1]}`; // «AC אלכסון ראשי» ⇒ «אלכסון ראשי AC»
  const m = s.match(BARE_SEGMENT_RE);
  if (!m) return null;
  const [, a, b] = m;
  if (a === b) return null;
  const claim = SPACE_CLAIM.test(s) ? 'space' : ANY_CLAIM.test(s) ? 'any' : undefined;
  // #840: this rule IS the drawing register — the student's whole sentence is this segment, so an
  // unstated endpoint is theirs to introduce. Every other `segment3` in this file is a carrier.
  return [{ type: 'segment3', a, b, bare: true, ...(claim ? { diagonal: claim } : {}) }];
};

// ---------------------------------------------------------------------------
// V2 — the algebraic lane (docs/20 §6.3, ADR-3D-004)
// ---------------------------------------------------------------------------

/** Plane names: π1 / pi1 / a bare π → canonical `π<digits?>`. */
const PLANE_NAME = /(?:π|pi|Pi|PI)\s?(\d*)/;
const canonicalPlane = (s: string): string => `π${s.match(/\d+/)?.[0] ?? ''}`;
/** Line names (#69, multi-line): ℓ/l + an optional digit index (`ℓ1`, `l2`, subscript `ℓ₂`)
 *  → canonical `ℓ<digits?>`. Digit-indexed by operator ruling — prime forms (ℓ') are NOT in
 *  the vocabulary. NOTE: ℓ is not a `\w` character — never `\b` after a line name, use an
 *  explicit lookahead. */
const LINE_NAME = /[ℓl][\d₀-₉]*/;
const LINE_NAME_ONLY = new RegExp(`^(?:${LINE_NAME.source})$`);
const canonicalLine = (s: string): string =>
  `ℓ${[...s]
    .filter((ch) => /[\d₀-₉]/.test(ch))
    .map((ch) => (/\d/.test(ch) ? ch : String.fromCharCode(ch.charCodeAt(0) - 0x2080 + 48)))
    .join('')}`;
/** #552: canonicalise ONLY convention names (`l1` → `ℓ1`); a noun-declared arbitrary name (`k`)
 *  passes through — `canonicalLine` would strip its letters. Use at every operand-fed site. */
const canonLineName = (s: string): string => (LINE_NAME_ONLY.test(s) ? canonicalLine(s) : s);

/**
 * One term of a parameter expression, in the RATIONAL forms a coefficient
 * actually takes ([ADR-3D-069](../../docs/06b-decisions-3d.md)): `5`, `3.5`,
 * `1/6`, `m`, `2m`, `m/6`, `2m/3`, `1/6m`. A denominator may sit on either side
 * of the symbol — `2k/3` and `1/6k` are the same number, and students write both.
 */
const PARAM_TERM = /^([+-])?\s*(\d+(?:\.\d+)?)?\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*·?\s*([a-w])?\s*(?:\/\s*(\d+(?:\.\d+)?))?$/;

/** Parse `m-1` / `5-m` / `-2` / `2m` / `0.5+k/6` → a LinExpr (k + p·param). Null on anything else. */
export function parseParamExpr(src: string): { expr: LinExpr; param?: string } | null {
  const terms = splitTopLevelTerms(src);
  if (!terms || terms.length === 0) return null;
  const expr: LinExpr = { k: 0, p: 0 };
  let param: string | undefined;
  for (const t of terms) {
    const m = t.match(PARAM_TERM);
    if (!m) return null;
    const [, sign, numRaw, den1, letter, den2] = m;
    if (numRaw === undefined && !letter) return null; // a bare sign or a lone `/3` is not a term
    let value = (sign === '-' ? -1 : 1) * (numRaw !== undefined ? parseFloat(numRaw) : 1);
    for (const den of [den1, den2]) {
      if (den === undefined) continue;
      const d = parseFloat(den);
      if (d === 0) return null; // never a silent Infinity
      value /= d;
    }
    if (letter) {
      if (param && param !== letter) return null; // one parameter per expression (the V7 boundary)
      param = letter;
      expr.p += value;
    } else {
      expr.k += value;
    }
  }
  return { expr, param };
}

/**
 * Parse a linear equation in x,y,z with ONE optional lowercase parameter letter
 * (`ay + z - 8 = 0`, incl. parenthesised coefficients `(m+6)z`). Returns each
 * coefficient as a LinExpr (k + p·param). Null on anything else — never a partial read.
 */
export function parseLinearEq(eq: string): { cx: LinExpr; cy: LinExpr; cz: LinExpr; d: LinExpr; param?: string } | null {
  const sides = eq.split('=');
  if (sides.length !== 2) return null;
  const acc: Record<'x' | 'y' | 'z' | 'c', LinExpr> = {
    x: { k: 0, p: 0 },
    y: { k: 0, p: 0 },
    z: { k: 0, p: 0 },
    c: { k: 0, p: 0 },
  };
  let param: string | undefined;
  const addSide = (side: string, sign: number): boolean => {
    // parenthesised coefficients first: `(m+6)z` — the inner expr folds into the slot
    let rest = side.trim();
    let hadParen = false;
    rest = rest.replace(/([+-]?)\s*\(([^()]+)\)\s*([xyz])/g, (_all, sgn: string, inner: string, varName: string) => {
      const parsed = parseParamExpr(inner);
      if (!parsed) return '§'; // poison — fails the term scan below
      if (parsed.param) {
        if (param && param !== parsed.param) return '§';
        param = parsed.param;
      }
      const s2 = sign * (sgn === '-' ? -1 : 1);
      const slot = acc[varName as 'x' | 'y' | 'z'];
      slot.k += s2 * parsed.expr.k;
      slot.p += s2 * parsed.expr.p;
      hadParen = true;
      return '';
    });
    if (rest.includes('§') || rest.includes('(') || rest.includes(')')) return false;
    const terms = splitTopLevelTerms(rest); // paren-free by the guard above — the shared tokenizer regardless
    if (!terms) return false;
    if (terms.length === 0) return hadParen;
    for (const term of terms) {
      const m = term.match(/^([+-])?\s*(\d+(?:\.\d+)?)?\s*([a-w])?\s*([xyz])?$/);
      if (!m || (m[2] === undefined && !m[3] && !m[4])) return false;
      const sgn = sign * (m[1] === '-' ? -1 : 1);
      const num = m[2] !== undefined ? parseFloat(m[2]) : 1;
      if (m[3]) {
        if (param && param !== m[3]) return false; // one parameter per figure (V2 boundary)
        param = m[3];
      }
      const slot = acc[(m[4] ?? 'c') as 'x' | 'y' | 'z' | 'c'];
      if (m[3]) slot.p += sgn * num;
      else slot.k += sgn * num;
    }
    return true;
  };
  if (!addSide(sides[0], 1) || !addSide(sides[1], -1)) return null;
  if ([acc.x, acc.y, acc.z].every((e) => e.k === 0 && e.p === 0)) return null; // no variable at all
  return { cx: acc.x, cy: acc.y, cz: acc.z, d: acc.c, param };
}

/** `המישור π1: z - 3 = 0` / `plane π2: ay + z - 8 = 0`. */
const planeByEquation: Rule = (s) => {
  // name OPTIONAL (unnamed ⇒ π) and the separator OPTIONAL — `:` or the copula
  // `הוא`/`is` (`המישור x-y+z=1`, `המישור π2 x-y+z=1`, `מישור π1 הוא z-3=0`); the tail
  // must contain `=` so a point-run plane (`מישור ABC`, no `=`) is never stolen, and
  // parseLinearEq strictly validates it (all-or-nothing).
  const m = matchDefHead(s, `(?:${HE_PLANE}\\s+|(?:the\\s+)?plane\\s+)?`, `(${PLANE_NAME.source})?`);
  if (!m) return null;
  // #504: the equation may be stated with the `= 0` LEFT OFF — the book prints a plane both ways and
  // they name the same plane. `parseLinearEq` stays the gate: it is all-or-nothing and demands a real
  // x/y/z term, so a point-run plane (uppercase labels) and a bare free-plane declaration (no body at
  // all) can never be read as one.
  const src = m[2].includes('=') ? m[2] : `${m[2]}=0`;
  const eq = parseLinearEq(src);
  if (!eq) return null;
  return [
    {
      type: 'plane3',
      name: m[1] ? canonicalPlane(m[1]) : 'π',
      plane: { cx: eq.cx, cy: eq.cy, cz: eq.cz, d: eq.d, src: src.trim() },
      param: eq.param,
    },
  ];
};

/** #487 (ADR-3D-124): «מישור π2» / «נתון מישור π2» / «plane π2» — and, per Am. 1, bare «π2» — a FREE
 *  plane, declared before anything about it is known. The noun was REQUIRED by the original ruling 2;
 *  the operator's play reversed it (2026-08-10): the bare form escalated to the LLM, which drew the
 *  plane anyway — a paid, non-deterministic detour to the same outcome — and «π…» is standard notation
 *  ("anything that starts with pi is commonly referred to as a plane"). The utterance must still END
 *  at the name — a trailing equation belongs to `planeByEquation`, a trailing point-run to the
 *  point-run rules. */
const freePlaneDecl: Rule = (s) => {
  const m = s.match(new RegExp(`^(?:נתון\\s+)?(?:(?:${HE_PLANE}|(?:the\\s+)?plane)\\s+)?(${PLANE_NAME.source})$`));
  if (!m) return null;
  return [{ type: 'free-plane', name: canonicalPlane(m[1]) }];
};

/** #552 (the #487 shape, line edition): «ישר l1» / «נתון ישר k» / «line k» — and bare «l» / «l1»,
 *  the ℓ-convention being to lines exactly what the π-prefix is to planes (#487 Am. 1: "anything
 *  that starts with pi is commonly referred to as a plane" — the l/ℓ names carry the same signal).
 *  A NON-convention single-letter name has no shape signal at all (it reads as a vector everywhere
 *  else), so the NOUN is what states its kind — REQUIRED for «ישר k», and a bare «k» stays
 *  not-handled rather than guessed. The utterance must END at the name — a trailing `:`/equation
 *  belongs to `parametricLine`, a trailing relation to the relation rules. */
const freeLineDecl: Rule = (s) => {
  const conv = s.match(new RegExp(`^(?:נתון\\s+)?(?:(?:${HE_LINE}|(?:the\\s+)?line)\\s+)?(${LINE_NAME.source})$`));
  if (conv) return [{ type: 'free-line', name: canonicalLine(conv[1]) }];
  const named = s.match(new RegExp(`^(?:נתון\\s+)?(?:${HE_LINE}|(?:the\\s+)?line)\\s+([a-w])$`));
  if (named) return [{ type: 'free-line', name: named[1] }];
  return null;
};

const NUM = String.raw`-?${UNUM}`;

/**
 * #523 — what an angle's value slot accepts: a number, or a GREEK NAME for the measure.
 *
 * `#319` gave the naming form to `linePlaneAngle`'s value reader alone, so «…היא α» worked for exactly
 * one operand pairing (segment × point-run) and the identical sentence refused the moment either side
 * changed kind. The angle sentence is read by three parallel rules split by operand kind; a value form
 * added to one of them is a divergent shadow pair by construction. One atom, used by all three.
 */
const ANGLE_VAL = String.raw`${NUM}|[αβγδθ]`;
const ANGLE_LABEL_RE = /^[αβγδθ]$/;

/**
 * #510 — a VALUE literal: everything {@link parseCoeff} already reads. `√2`, `2√3`, `√6/4`, `5/3`,
 * `0.5`, `½` — the forms this tool offers on its own symbol palette and accepts as a stated magnitude
 * («|BD'| = √48» parses today). A coordinate component accepted only DECIMALS, so «C(√2,1,0)» refused
 * while the same character in a length given worked: offered in one slot and refused in another, the
 * asymmetry #493 was filed on.
 *
 * `VAL` is the LEXICAL half and `parseCoeff` the reader — they are defined as a pair on purpose. The
 * filed plan was to widen `NUM` itself, and that would have been a silent NaN generator: ~47 rules
 * compose from `NUM` and read their capture with `+`/`parseFloat`, so a widened atom without a widened
 * reader turns «√48» into `NaN` INSIDE a committed figure — far worse than the refusal it fixes.
 * Migrating those rules onto `VAL` one at a time, each with its reader, is filed as follow-up work.
 */
const VAL = String.raw`-?(?:\d+\s*\/\s*\d+|\d*\.\d+|(?:${UNUM})?\s*√\s*${RADICAND}(?:\s*\/\s*${UNUM})?|\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])`;

/** A tuple component: a VALUE literal (#510), or an AFFINE symbolic expression (#325, ADR-3D-079) —
 *  `t` / `2t` / `-t` / `2·t` / `t+1` / `2t-3` is coefficient·symbol + constant.
 *  Composed from the shared atoms (the S2.1 lexical-ratchet discipline). The SYMBOLIC branch keeps
 *  `NUM` for its coefficient and offset: widening those runs into the affine model itself, which is
 *  #509's territory and needs a design ruling, not a lexical change. */
/** A superscript power, the way the exam writes it: `p²`, `p³`. */
const SUP_POW = String.raw`[²³]`;
/**
 * ONE term: an optional signed coefficient on a symbol, now with an optional POWER (#509, Option A) —
 * `2p^2`, `p³`, `-3p²`, and every degree-1 form unchanged.
 *
 * The grammar admits any integer power; {@link parseComp} enforces `MAX_SYM_DEGREE`. That split is
 * deliberate: an over-degree component then refuses with a REASON rather than silently failing to
 * match, which is the 2026-08-26 ruling's second lock — *"a recognised-but-unsupported shape is a
 * refusal we own, not a question we outsource"*.
 */
const COMP_TERM = String.raw`[+-]?\s*(?:${UNUM}\s*[·*]?\s*)?[a-w](?:\s*(?:\^\s*\d+|${SUP_POW}))?`;
/**
 * #509 ([ADR-3D-213](../../docs/06b-decisions-3d.md), widened by ADR-3D-214): a component is a
 * SEQUENCE of terms with an optional numeric offset — `p+q`, `2p+3q`, `2t-3`, `p^2`, `2p²-3`, `p³`.
 *
 * Bounded polynomial, Option A. What stays out is arithmetic INSIDE a component — `p/2`, `2(p+1)` —
 * the operator's sanctioned permanent boundary, and the line that keeps the solver a numeric
 * root-find (docs/20 D3): a polynomial is EVALUATED at a sampled assignment, never rearranged.
 */
const COMP = String.raw`(?:${COMP_TERM}(?:\s*${COMP_TERM})*(?:\s*[+-]\s*${UNUM})?|${VAL})`;
const COMP_NUM_RE = new RegExp(String.raw`^${VAL}$`);
/** Scans a symbolic component: the first term, the remaining terms, and the numeric offset.
 *  Anchored, so anything that is not a clean sum of coefficient·symbol[^n] terms does not match. */
const COMP_COMP_TERMS_RE = new RegExp(String.raw`^(${COMP_TERM})((?:\s*${COMP_TERM})*)(?:\s*([+-])\s*(${UNUM}))?$`);
/** One term of that sequence: sign, coefficient, symbol, and the power in either notation. */
const ONE_COMP_TERM_RE = new RegExp(String.raw`^([+-]?)\s*(${UNUM})?\s*[·*]?\s*([a-w])(?:\s*(?:\^\s*(\d+)|(${SUP_POW})))?$`);
/** The terms after the first, scanned out of the run `COMP_COMP_TERMS_RE` captured. */
const COMP_TERM_SCAN_RE = new RegExp(COMP_TERM, 'g');
/** #325: attach symExprs only when they carry STRUCTURE beyond bare distinct letters — a
 *  coefficient/offset (`2t`, `t+1`) or a symbol SHARED across components (`B(t,t,3)`). Bare
 *  distinct letters keep the V4 register byte-identical: placeholders, not open symbols. */
function symStructure(
  comps: { num: number | null; expr: SymComp | null }[],
): [SymComp | null, SymComp | null, SymComp | null] | undefined {
  const named = comps.flatMap((t) => (t.expr !== null ? [t.expr] : []));
  // #509: a component naming SEVERAL symbols carries structure by itself — «C(p+q,1,0)» can never
  // be a bare placeholder letter, so it must reach the solver as open unknowns.
  const allSyms = named.flatMap(symsOfAffine);
  const structured =
    named.some((e) => e.terms.length > 1 || e.terms[0].k !== 1 || (e.terms[0].e ?? 1) !== 1 || e.c !== 0) ||
    new Set(allSyms).size < allSyms.length;
  return structured ? (comps.map((t) => t.expr) as [SymComp | null, SymComp | null, SymComp | null]) : undefined;
}

/** #814 (ADR-3D-175): the letters as NAMES, for the lanes that carry a `syms` channel. Emitted
 *  whenever the tuple names anything — unlike `symStructure`, which decides whether the letters
 *  become solver unknowns. A name changes nothing about how a component solves; it only lets a
 *  later statement address the component the student named. */
const symNames = (
  comps: { num: number | null; expr: SymComp | null }[],
): [string | null, string | null, string | null] | undefined =>
  comps.some((t) => t.expr !== null)
    ? (comps.map((t) => (t.expr ? soleSymOf(t.expr) : null)) as [string | null, string | null, string | null])
    : undefined;

/** Parse one component: a plain number, or {sym, k, c} for k·sym + c. */
function parseComp(t: string): { num: number | null; expr: SymComp | null } {
  const s = t.replace(/\s+/g, '');
  // #510: the literal branch is read by `parseCoeff` — the ONE reader for this literal family, already
  // used by the vec-rel coefficient lane. A second evaluator here would be a second set of rounding and
  // malformed-input rules to keep in step (docs/17: reuse the chokepoint).
  if (COMP_NUM_RE.test(s)) return { num: literalValue(s), expr: null };
  const m = s.match(COMP_COMP_TERMS_RE);
  if (!m) return { num: null, expr: null };
  // #509: read every term of the sequence, then the optional numeric offset. A repeated symbol is
  // kept as written and summed by the consumers — `k+k` is 2k, not two unknowns.
  const terms: { sym: string; k: number }[] = [];
  for (const raw of [m[1], ...(m[2].match(COMP_TERM_SCAN_RE) ?? [])]) {
    const t = raw.replace(/\s+/g, '').match(ONE_COMP_TERM_RE);
    if (!t) return { num: null, expr: null };
    // #509: the power, in either notation. Degree is BOUNDED here rather than in the grammar, so an
    // over-degree component is a refusal we own instead of a silent non-match (the 2026-08-26 lock).
    const e = t[4] !== undefined ? +t[4] : t[5] !== undefined ? (t[5] === '²' ? 2 : 3) : 1;
    if (e < 1 || e > MAX_SYM_DEGREE) return { num: null, expr: null };
    terms.push({ sym: t[3], k: (t[1] === '-' ? -1 : 1) * (t[2] === undefined ? 1 : +t[2]), ...(e === 1 ? {} : { e }) });
  }
  const c = m[3] ? (m[3] === '-' ? -1 : 1) * +m[4] : 0;
  return { num: null, expr: { terms, c } };
}

/** #510 — a component that matched LEXICALLY but could not be evaluated (`1/0`): neither a number nor a
 *  symbol. Before the VALUE atom this could not happen — anything matching `COMP` parsed — so the rules
 *  read `num: null` as "symbolic". Left ungated, a malformed literal would commit as an UNKNOWN
 *  coordinate, which is the honesty invariant inverted: the student stated a value and the figure would
 *  claim not to know it. The rules decline instead, and the LLM lane gets it. */
const unreadableComp = (t: { num: number | null; expr: SymComp | null }): boolean => t.num === null && t.expr === null;

/** `A(2,-2,6)` / `A(3,n,p)` / `נתונה נקודה M(k,1,3), k הוא פרמטר חיובי` (+ optional
 *  membership tail: `נמצאת על אחד המישורים` / `על המישור π2` / `על הישר ℓ`). */
const coordPoint: Rule = (s) => {
  const m = s.match(
    new RegExp(`^(?:נתונה\\s+)?(?:ה?נקודה\\s+|point\\s+)?([A-Z]\\d*'?)\\s*\\(\\s*(${COMP})\\s*,\\s*(${COMP})\\s*,\\s*(${COMP})\\s*\\)\\s*(.*)$`),
  );
  if (!m) return null;
  const [, id, x, y, z, restRaw] = m;
  const comps = [x, y, z].map(parseComp);
  if (comps.some(unreadableComp)) return null; // #510: a malformed literal is never an unknown coordinate
  const syms = comps.map((t) => (t.expr ? soleSymOf(t.expr) : null)) as [string | null, string | null, string | null];
  const symExprs = symStructure(comps);
  const cmds: Command3[] = [
    comps.some((t) => t.expr !== null)
      ? { type: 'point3', id, x: comps[0].num, y: comps[1].num, z: comps[2].num, syms, ...(symExprs ? { symExprs } : {}) }
      : { type: 'point3', id, x: comps[0].num, y: comps[1].num, z: comps[2].num },
  ];
  let rest = restRaw.trim();
  // ADR-3D-032: the exam's appositive sign clause — `M(k,1,3), k הוא פרמטר חיובי` /
  // bare `, k חיובי` / `, k > 0` / En mirrors (the same family as the standalone rule)
  const signTail = rest.match(
    /^,?\s*([a-w])\s+(?:הוא\s+)?(?:פרמטר\s+)?(חיובי|שלילי)$|^,?\s*(?:where\s+)?([a-w])\s+is\s+(?:a\s+)?(positive|negative)(?:\s+parameter)?$|^,?\s*([a-w])\s*([<>])\s*0$/,
  );
  if (signTail) {
    const sym = signTail[1] ?? signTail[3] ?? signTail[5];
    const word = signTail[2] ?? signTail[4] ?? signTail[6];
    cmds.push({ type: 'param-sign', sym, positive: word === 'חיובי' || word === 'positive' || word === '>' });
    rest = '';
  }
  if (rest) {
    const onLine = rest.match(new RegExp(`^${IS_AT}(?:על\\s+${HE_LINE}|on\\s+(?:the\\s+)?line)\\s+(${LINE_NAME.source}|[a-w])$`));
    if (/^(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?(?:על אחד המישורים|on one of the planes)$/.test(rest)) {
      cmds.push({ type: 'on-planes', id, plane: 'any' });
    } else if (onLine) {
      cmds.push({ type: 'on-line', id, line: canonLineName(onLine[1]) });
    } else {
      const named = rest.match(new RegExp(`^${IS_AT}(?:על\\s+${HE_PLANE}|on\\s+(?:the\\s+)?plane)\\s+(${PLANE_NAME.source})$`));
      if (!named) return null; // trailing text we don't understand — refuse the whole utterance
      cmds.push({ type: 'on-planes', id, plane: canonicalPlane(named[1]) });
    }
  }
  return cmds;
};

/** Standalone membership for an existing point. */
const membership: Rule = (s) => {
  const any = s.match(new RegExp(`^${HE_SUBJ}(${LBL})\\s+${IS_AT}(?:על אחד המישורים|on one of the planes)$`));
  if (any) return [{ type: 'on-planes', id: any[1], plane: 'any' }];
  const named = s.match(
    new RegExp(`^${HE_SUBJ}(${LBL})\\s+${IS_AT}(?:על\\s+${HE_PLANE}|on\\s+(?:the\\s+)?plane)\\s+(${PLANE_NAME.source})$`),
  );
  if (named) return [{ type: 'on-planes', id: named[1], plane: canonicalPlane(named[2]) }];
  return null;
};

/** `E על המישור ABC` / `E מעל המישור ABCD` / `E מתחת למישור ABC` (En on/above/below) —
 *  a point ON a plane, or on a stated SIDE of it (ADR-3D-015). A point-run plane is
 *  materialised (idempotent plane-through), so referencing it also highlights it; apply
 *  decides by id (M1): an EXISTING point is a verified given, a NEW id becomes a free
 *  point riding the plane (2 DOF) or floating on the stated side (3 DOF). */
const pointRelPlane: Rule = (s) => {
  const RUN = `(?:[A-Z]\\d*'?){3,4}`;
  const m =
    s.match(
      new RegExp(`^${HE_SUBJ}(${LBL})\\s+(?:נמצאת\\s+|נמצא\\s+)?(מעל|מתחת|על)\\s+ל?${HE_PLANE}\\s+(${RUN}|${PLANE_NAME.source})$`),
    ) ??
    s.match(
      new RegExp(`^([A-Z]\\d*'?)\\s+(?:is\\s+|lies\\s+)?(on|above|below)\\s+(?:the\\s+)?plane\\s+(${RUN}|${PLANE_NAME.source})$`),
    );
  if (!m) return null;
  const [, id, word, token] = m;
  const side =
    word === 'מעל' || word === 'above'
      ? ('above' as const)
      : word === 'מתחת' || word === 'below'
        ? ('below' as const)
        : undefined;
  const ids = token.match(/[A-Z]\d*'?/g);
  if (ids && ids.length >= 3) {
    return [
      { type: 'plane-through', name: token, ids },
      side ? { type: 'on-planes', id, plane: token, side } : { type: 'on-planes', id, plane: token },
    ];
  }
  if (!side) return null; // π-membership without a side is `membership`'s (one owner)
  return [{ type: 'on-planes', id, plane: canonicalPlane(token), side }];
};

/** `הזווית בין המישורים π1 ו-π2 היא 45` / `the angle between planes π1 and π2 is 45`. */
/** triage 3-D: the angle between a LINE and a PLANE — `הזווית בין הישר AC' לבין המישור ABCD היא 30`
 *  / `the angle between line AC' and plane ABCD is 30`. A VALUELESS form (a "what is" query) is
 *  outside the reproduce-and-verify charter → not matched (escalates), never a silent build. */
const linePlaneAngle: Rule = (s) => {
  const m =
    s.match(
      new RegExp(`^ה?זו?וית\\s+(?:ש)?בין\\s+(?:ה?ישר\\s+|ה?קטע\\s+|ה?מקצוע\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+(?:[לו]?בין\\s+)?[לו]?-?ה?מישור\\s+((?:[A-Z]\\d*'?){3,4})\\s*(?:היא|הוא|=|שווה\\s+ל?-?)\\s*(${NUM}|[αβγδθ])\\s*°?$`),
    ) ??
    s.match(
      new RegExp(`^(?:the\\s+)?angle\\s+between\\s+(?:the\\s+)?(?:line\\s+|segment\\s+|edge\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+and\\s+(?:the\\s+)?plane\\s+((?:[A-Z]\\d*'?){3,4})\\s*(?:is|=)\\s*(${NUM}|[αβγδθ])\\s*°?$`, 'i'),
    );
  if (!m) return null;
  const plane = m[3].match(/[A-Z]\d*'?/g)!;
  const val = m[4];
  // #319: a GREEK value NAMES the measure (a mark, never a driver — the panel derives its degrees)
  if (/^[αβγδθ]$/.test(val)) return [{ type: 'line-plane-angle', a: m[1], b: m[2], plane, label: val }];
  return [{ type: 'line-plane-angle', a: m[1], b: m[2], plane, deg: +val }];
};

const angleBetweenPlanes: Rule = (s) => {
  const m = s.match(
    new RegExp(
      `^(?:הזו?וית בין ה?מישור(?:ים)?|the angle between (?:the )?planes)\\s+(${PLANE_NAME.source})\\s*(?:ל|ו|and)-?\\s*(${PLANE_NAME.source})\\s*(?:היא|הוא|is|=)?\\s*(${NUM})\\s*°?$`,
    ),
  );
  if (!m) return null;
  return [{ type: 'plane-angle', p1: canonicalPlane(m[1]), p2: canonicalPlane(m[3]), deg: +m[5] }];
};

/** `מ-A מורידים אנך למישור π1 החותך אותו בנקודה B` / `from A drop a perpendicular to plane π1, it cuts it at B`. */
const dropPerpToPlane: Rule = (s) => {
  const he = s.match(
    new RegExp(`^מ-?([A-Z]\\d*'?)\\s+(?:מורידים|הורידו|מוריד|מעבירים|העבירו)\\s+אנך\\s+ל${HE_PLANE}\\s+(${PLANE_NAME.source})\\b.*?${AT_POINT}([A-Z]\\d*'?)$`),
  );
  const en =
    he ??
    s.match(new RegExp(`^from ([A-Z]\\d*'?) drop a perpendicular to (?:the )?plane (${PLANE_NAME.source})\\b.*? at ([A-Z]\\d*'?)$`));
  if (!en) return null;
  const [, from, plane, , foot] = en;
  return [{ type: 'foot-on-plane', id: foot, from, plane: canonicalPlane(plane) }];
};

/**
 * V8-h (G8): the COMMON PERPENDICULAR of two lines — `הישר d מאונך לישר AB ולישר CD` /
 * `d is the common perpendicular of AB and CD` / `אנך משותף ל-AB ו-CD`. A source line is a
 * through-line (point pair, created as needed) or — #69, the 2010-Q3 form — an already-NAMED
 * line (`הישר d מאונך לישר ℓ1 ולישר ℓ2`; the named lines must exist, apply refuses
 * `unknown-line` otherwise).
 */
const commonPerp: Rule = (s) => {
  if (!/מאונך|ניצב|מאונ[כך]|common\s+perpendicular|אנך\s+משותף/i.test(s)) return null;
  // an operand: a point PAIR (through-line) or a NAMED line (#69)
  const OP = String.raw`((?:[A-Z]\d*'?){2}|${LINE_NAME.source})`;
  const NAME = String.raw`(${LINE_NAME.source}|ℓ\d*'?|[a-z]'?)`;
  // He: a named line ⟂ to two line targets (two explicit "לישר" targets — distinctive enough not to
  // collide with the ⟂-constraint / ⟂-plane rules), or the "אנך משותף" phrasing
  let m =
    s.match(new RegExp(`^ה?ישר\\s+${NAME}\\s+(?:מאונך|ניצב|מאונ[כך])\\s+ל(?:ה?ישר\\s+)?${OP}\\s+ול(?:ה?ישר\\s+)?${OP}$`)) ??
    s.match(new RegExp(`^(?:ה?ישר\\s+${NAME}\\s+)?אנך\\s+משותף\\s+ל(?:ה?ישרים\\s+)?${OP}\\s+ו-?(?:ל(?:ה?ישר\\s+)?)?${OP}$`)) ??
    s.match(new RegExp(`^(?:(?:ה?ישר\\s+|line\\s+)?${NAME}\\s+is\\s+)?the\\s+common\\s+perpendicular\\s+of\\s+(?:lines?\\s+)?${OP}\\s+and\\s+${OP}$`, 'i'));
  if (!m) return null;
  const [, name, opA, opB] = m;
  const nm = name ? (LINE_NAME_ONLY.test(name) ? canonicalLine(name) : name) : 'd';
  const cmds: Command3[] = [];
  const lineOf = (op: string): string => {
    if (LINE_NAME_ONLY.test(op)) return canonicalLine(op);
    const [a, b] = op.match(/[A-Z]\d*'?/g)!;
    cmds.push({ type: 'line-through', name: `${a}${b}`, a, b });
    return `${a}${b}`;
  };
  const line1 = lineOf(opA);
  const line2 = lineOf(opB);
  cmds.push({ type: 'line-common-perp', name: nm, line1, line2 });
  return cmds;
};

/**
 * V8-h (G8): the PROJECTION (`היטל`) of a line onto a plane — `BE היטל הישר TB על המישור ABCD` /
 * `BE is the projection of line TB onto plane ABCD`. Each line operand is a through-line
 * (point pair, created as needed) or — #69 — a NAMED line (`הישר ℓ2 הוא היטל הישר ℓ1 על
 * המישור π1`); plane = a point-run (or a π-name).
 */
const lineProjection: Rule = (s) => {
  if (!/היטל|projection/i.test(s)) return null;
  const OP = String.raw`((?:[A-Z]\d*'?){2}|${LINE_NAME.source})`;
  const PL = String.raw`((?:[A-Z]\d*'?){3,4}|${PLANE_NAME.source})`;
  const m =
    s.match(new RegExp(`^(?:ה?ישר\\s+)?${OP}\\s+(?:הוא\\s+)?(?:ה?היטל)\\s+(?:של\\s+)?(?:ה?ישר\\s+)?${OP}\\s+על\\s+(?:ה?מישור\\s+)?${PL}$`)) ??
    s.match(new RegExp(`^(?:line\\s+)?${OP}\\s+is\\s+the\\s+projection\\s+of\\s+(?:line\\s+)?${OP}\\s+onto\\s+(?:the\\s+)?(?:plane\\s+)?${PL}$`, 'i'));
  if (!m) return null;
  const [, resOp, srcOp, planeRaw] = m;
  const cmds: Command3[] = [];
  const lineOf = (op: string): string => {
    if (LINE_NAME_ONLY.test(op)) return canonicalLine(op);
    const [a, b] = op.match(/[A-Z]\d*'?/g)!;
    cmds.push({ type: 'line-through', name: `${a}${b}`, a, b });
    return `${a}${b}`;
  };
  const srcLine = lineOf(srcOp);
  // the RESULT is only a NAME (nothing to create) — a pair keeps its pair name, a ℓ-name canonicalizes
  const resName = LINE_NAME_ONLY.test(resOp) ? canonicalLine(resOp) : resOp;
  let planeName: string;
  if (/^(?:π|pi)/i.test(planeRaw)) planeName = canonicalPlane(planeRaw);
  else {
    const ids = planeRaw.match(/[A-Z]\d*'?/g)!;
    planeName = `plane-${ids.join('')}`;
    cmds.push({ type: 'plane-through', name: planeName, ids });
  }
  cmds.push({ type: 'line-projection', name: resName, line: srcLine, plane: planeName });
  return cmds;
};

/**
 * V8-i (G13): a CIRCLE in R³ tangent to a line — `מעגל שמרכזו O משיק לישר AB בנקודה B` /
 * `circle centered at O tangent to line AB at B`. The circle's plane, radius (= dist O→line) and
 * touch point are all derived; the id is `circle-<centre>` (ADR-029). The line is a through-line
 * (point pair) or the single ℓ. (`במישור π` is redundant — the plane is derived — and is ignored.)
 */
const circleTangentLine: Rule = (s) => {
  if (!/מעגל|\bcircle\b/i.test(s) || !/משיק|tangent/i.test(s)) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  const centre =
    s.match(/(?:שמרכזו|מרכזו|centered\s+at|cent(?:er|re)(?:ed)?\s+(?:at\s+)?)\s*([A-Z]\d*'?)/i)?.[1] ??
    s.match(/^מעגל\s+([A-Z]\d*'?)\b/)?.[1] ??
    s.match(/^circle\s+([A-Z]\d*'?)\b/i)?.[1];
  if (!centre) return null;
  // the tangent line: a point pair (AB, creating a through-line) or the single ℓ
  const pair =
    s.match(new RegExp(`(?:משיק\\s+)?ל(?:ה?ישר\\s+)?${L}${L}(?![A-Z0-9'])`)) ??
    s.match(new RegExp(`tangent\\s+(?:to\\s+)?(?:the\\s+)?(?:line\\s+)?${L}${L}(?![A-Z0-9'])`, 'i'));
  const lname =
    s.match(new RegExp(`ל(?:ה?ישר\\s+)?(${LINE_NAME.source})(?![\\w'])`)) ??
    s.match(new RegExp(`tangent\\s+(?:to\\s+)?(?:the\\s+)?line\\s+(${LINE_NAME.source})`, 'i'));
  const touch = (s.match(new RegExp(String.raw`(?:${AT_POINT}|at\s+)([A-Z]\d*'?)`, 'i')) ?? [])[1];
  const id = `circle-${centre}`;
  if (pair) {
    const line = `${pair[1]}${pair[2]}`;
    return [
      { type: 'line-through', name: line, a: pair[1], b: pair[2] },
      { type: 'circle3', id, def: { kind: 'tangent-line', center: centre, line }, touch },
    ];
  }
  if (lname) return [{ type: 'circle3', id, def: { kind: 'tangent-line', center: centre, line: canonicalLine(lname[1]) }, touch }];
  return null;
};

/** V8-i: `A נמצאת על המעגל` / `A על המעגל O` / `A is on the circle` — a verified membership. `''` = the single circle. */
const onCircle3: Rule = (s) => {
  const m =
    s.match(/^(?:ה?נקודה\s+)?([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+)?על\s+ה?מעגל(?:\s+([A-Z]\d*'?))?$/) ??
    s.match(/^(?:point\s+)?([A-Z]\d*'?)\s+(?:is\s+|lies\s+)?on\s+(?:the\s+)?circle(?:\s+([A-Z]\d*'?))?$/i);
  if (!m) return null;
  return [{ type: 'point-on-circle3', point: m[1], circle: m[2] ? `circle-${m[2]}` : '' }];
};

/**
 * #333 (ADR-3D-153): `ישר החיתוך` — the line where two planes meet. ONE rule for the whole phrasing
 * space, replacing the two sibling rules (named-π at the old L1388, point-run at the old L1800) that
 * each carried their own hand-rolled connective grammar and between them left four independent
 * narrownesses: the `ומישור`/`למישור`/`עם`/`של` connectives, the plural `המישורים` with point-run
 * planes, an uppercase `L2` line name, and no line name at all. The ADR-3D-103 precedent
 * (`PERP_SPLIT`/`PAR_SPLIT` extracted, and the registry SHRANK) applied to the same shape of defect.
 *
 * The tail reader is deliberately TOTAL rather than an enumeration of connectives: once the head has
 * committed the sentence to "this is an intersection line", the operands are the only Latin/Greek
 * tokens left, so stripping the Hebrew words (a different script entirely) and the English function
 * words leaves exactly them. A connective nobody thought to list can no longer cost a student the
 * construct — the enumeration-one-member-short class `src3d/CLAUDE.md` warns about.
 *
 * Line name: OPTIONAL (students name the relation, not the result) and uppercase `L2` is accepted here
 * — the sentence itself declares the token a line, so the `O1` point-label convention is not in play
 * (operator ruling 2026-08-13). Naming and collisions are settled at APPLY.
 */
const INTERSECTION_HEAD = new RegExp(
  `^(?:([ℓlL][\\d₀-₉]*)\\s+)?(?:הוא\\s+|is\\s+)?(?:the\\s+)?` +
    `(?:(?:ישר|קו)\\s+ה?חיתוך|intersection\\s+line|line\\s+of\\s+intersection)\\s+(.+)$`,
  'i',
);
/** A plane operand: a π name, or a run of 3–5 point labels (a point-run plane or a solid's face). */
const PLANE_OPERAND = new RegExp(`(?:${PLANE_NAME.source})|(?:[A-Z]\\d*'?){3,5}`, 'g');

const intersectionLine: Rule = (s) => {
  const head = s.match(INTERSECTION_HEAD);
  if (!head) return null;
  const [, lname, tail] = head;
  const operands = (
    tail
      // every Hebrew word — markers (מישור/פאה, singular, plural, definite) AND connectives
      // (בין/ובין/של/עם/ו/ל) are Hebrew, and no operand ever is
      .replace(/[֐-׿]+/g, ' ')
      .replace(/\b(?:of|and|between|with|the|planes?|faces?)\b/gi, ' ')
      .replace(/[-־]/g, ' ')
      .match(PLANE_OPERAND) ?? []
  ).map((t) => t.trim());
  if (operands.length !== 2) return null; // exactly two planes meet in a line
  const NAMED = new RegExp(`^(?:${PLANE_NAME.source})$`);
  const cmds: Command3[] = [];
  const resolve = (op: string): string => {
    if (NAMED.test(op)) return canonicalPlane(op);
    // a point-run names its plane and DECLARES it (the L1800 rule's own behaviour, kept)
    const ids = op.match(/[A-Z]\d*'?/g)!;
    cmds.push({ type: 'plane-through', name: op, ids });
    return op;
  };
  const p1 = resolve(operands[0]);
  const p2 = resolve(operands[1]);
  if (p1 === p2) return null; // a plane does not cut itself — let it escalate rather than build nothing
  // an uppercase `L2` canonicalises like its lowercase twin; a missing name is left to apply
  cmds.push({ type: 'plane-plane-line', ...(lname ? { name: canonicalLine(lname) } : {}), p1, p2 });
  return cmds;
};

/** `מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C` / `from B drop a perpendicular to line ℓ, it cuts it at C`. */
const dropPerpToLine: Rule = (s) => {
  // NOTE: `ℓ` is not a \w character, so `\b` after it never matches — use an explicit lookahead.
  const he = s.match(
    new RegExp(`^מ-?([A-Z]\\d*'?)\\s+(?:מעבירים|העבירו|מורידים|הורידו)\\s+אנך\\s+לישר\\s+(${LINE_NAME.source})(?=[\\s,.]|$).*?${AT_POINT}([A-Z]\\d*'?)$`),
  );
  const en =
    he ?? s.match(new RegExp(`^from ([A-Z]\\d*'?) drop a perpendicular to (?:the )?line (${LINE_NAME.source})(?=[\\s,.]|$).*? at ([A-Z]\\d*'?)$`));
  if (!en) return null;
  const [, from, line, foot] = en;
  return [{ type: 'foot-on-line', id: foot, from, line: canonicalLine(line) }];
};

// ---------------------------------------------------------------------------
// V3 — parameters in lines (docs/20 §8 V3, ADR-3D-006; gate 2024-Q2)
// ---------------------------------------------------------------------------

/** `הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)` — a typed parametric line (components may carry
 *  the parameter). ADR-3D-031: the name may also be a POINT PAIR (`משוואת הישר AB היא
 *  (0,7,6)+t(0,2,1)` / `the equation of line AB is …` / the textbook `הצגה פרמטרית של הישר AB
 *  היא x = …`), which ALSO puts the named points ON the line — new ids become free riders
 *  (1 sampled DOF each, ADR-052), existing ids become verified membership givens (M1). */
const parametricLine: Rule = (s) => {
  const NAME = `(${LINE_NAME.source}|[A-Z]\\d*'?[A-Z]\\d*'?)`;
  const head =
    matchDefHead(s, `(?:${HE_LINE}\\s+|line\\s+)?`, NAME) ??
    s.match(
      new RegExp(
        `^(?:נתון\\s+(?:כי\\s+|ש))?(?:משוואת|ה?משוואה\\s+של|ה?הצגה\\s+ה?פרמטרית\\s+של)\\s+(?:ה?ישר\\s+)?${NAME}\\s+(?:היא|הוא)\\s*:?\\s*(.+)$`,
      ),
    ) ??
    s.match(
      new RegExp(
        `^(?:given\\s+that\\s+)?(?:the\\s+|a\\s+)?(?:equation|parametric\\s+(?:representation|form|equation))\\s+of\\s+(?:the\\s+)?(?:line\\s+)?${NAME}\\s+is\\s*:?\\s*(.+)$`,
      ),
    );
  // #275: the BARE form «x = (a,b,c) + t(d,e,f)» typed with NO «הישר ℓ:» prefix (the textbook's exact
  // notation) auto-binds the canonical ℓ. Gated to a leading «x = (» — or «x = t(» for the #351 anchor-less
  // form below — so a plane equation («x-y+z=1») is never stolen (and the `t(…)` tail is the real
  // discriminator). A second bare line collides on ℓ at apply — never a silently-minted ℓ2 (the
  // ADR-3D-038 indexed names are the student's to state).
  const headName = head ? head[1] : /^\s*x\s*=\s*(?:\(|[a-w]\s*[·×*]?\s*\()/.test(s) ? 'ℓ' : null;
  const body = head ? head[2] : s;
  if (headName === null) return null;
  // #351: the anchor is OPTIONAL — a line through the ORIGIN is written `x = t(d,e,f)` with no `(a,b,c) +`
  // part at all (prod: `l1:x=t(0,m,2m-2)`). A missing anchor means (0,0,0); everything downstream (the
  // symbolic components, the single-param guard, the point-pair membership) is untouched.
  // #422 — the RUNNING parameter letter is the STUDENT'S, not ours. A parametric line carries two
  // letters in two roles and only one of them is the tool's business: the running parameter (outside the
  // parens) is a BOUND variable whose identity means nothing to the figure, while a letter INSIDE a
  // component is the figure parameter — a free DOF the givens later pin. The grammar fixed the bound one
  // at `t`, so «l1: x=(4,5,-1)+m(k,1,0)» — the identical geometry with the two letters swapped between
  // roles — had no rule, while the `t` spelling of that exact line builds end-to-end. The ADR-3D-038
  // shape again: a fixed token standing in for something the student states.
  //
  // Position decides the roles unambiguously (a constant scale on a direction vector is meaningless), so
  // no new engine concept is needed. `[a-w]` mirrors `PARAM_COMP_TERM`'s symbol charset, which keeps x/y/z out
  // — «x = x(1,0,0)» can never be read as a line.
  const m = body.match(/^(?:x\s*=\s*)?(?:\(([^()]*)\)\s*\+\s*)?([a-w])\s*[·×*]?\s*\(([^()]*)\)$/);
  if (!m) return null;
  const runner = m[2];
  const triple = (str: string) => str.split(',').map((p) => parseParamExpr(p));
  const anchor = triple(m[1] ?? '0,0,0');
  const dir = triple(m[3]);
  if (anchor.length !== 3 || dir.length !== 3 || [...anchor, ...dir].some((x) => !x)) return null;
  const params = new Set([...anchor, ...dir].flatMap((x) => (x!.param ? [x!.param] : [])));
  if (params.size > 1) return null;
  // #422: one letter in BOTH roles («m(m-1, 5-m, -2)») conflates a bound variable with a figure DOF.
  // #516: which the student meant is not ours to guess — and not the LLM lane's either. Deferring via
  // `return null` alone sent this to the fallback, which happily built the `t` reading (operator play,
  // 2026-08-11): a refusal implemented as a decline is not a refusal. The rule still declines (rule
  // contract), but records the letter so parse3's fallthrough surfaces the TYPED clarification.
  if (params.has(runner)) {
    PARAM_CONFLATED = runner;
    return null;
  }
  const isLineName = LINE_NAME_ONLY.test(headName);
  const name = isLineName ? canonicalLine(headName) : headName;
  const cmds: Command3[] = [
    {
      type: 'line3',
      name,
      anchor: [anchor[0]!.expr, anchor[1]!.expr, anchor[2]!.expr],
      dir: [dir[0]!.expr, dir[1]!.expr, dir[2]!.expr],
      // the echoed form always shows the anchor, so an anchor-less input reads back as the origin it means
      src: `x = (${(m[1] ?? '0,0,0').trim()}) + ${runner}·(${m[3].trim()})`,
      // #422: recorded only when it is NOT the conventional `t`, so every existing save round-trips unchanged
      ...(runner === 't' ? {} : { runner }),
      param: [...params][0],
    },
  ];
  if (!isLineName) for (const id of name.match(/[A-Z]\d*'?/g)!) cmds.push({ type: 'on-line', id, line: name });
  return cmds;
};

/** `הישר ℓ ניצב למישור π` — a GIVEN that pins the parameter (line ⟂ plane). */
const linePerpPlane: Rule = (s) => {
  const m =
    s.match(new RegExp(`^(?:${HE_LINE}\\s+)?(${LINE_NAME.source})\\s+(?:ניצב|מאונך)\\s+ל${HE_PLANE}\\s+(${PLANE_NAME.source})$`)) ??
    s.match(new RegExp(`^(?:line\\s+)?(${LINE_NAME.source})\\s+is\\s+perpendicular\\s+to\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})$`));
  if (!m) return null;
  return [{ type: 'line-perp-plane', line: canonicalLine(m[1]), plane: canonicalPlane(m[2]) }];
};

/**
 * #375: a POINT-RUN plane stated ⟂ a named LINE — «מישור ACD אנך לישר ℓ1», «הישר l1 ניצב למישור ACD»,
 * and the English mirrors. `linePerpPlane` above covers only a NAMED (equation) plane, so this cell of
 * the operand matrix — a plane written as its points against a line — was unreachable.
 *
 * Rather than enumerate phrasings, the rule SPLITS on the perpendicularity connective and classifies
 * each side by what it IS: a run of 3–4 labels is the plane, a line name is the line. Order therefore
 * costs nothing (ADR-3D-088, "one relation, every phrasing"), and neither does the noun — which is what
 * lets the operator's own «ACD אנך למישור l1» work: they called ℓ1 a plane, but ℓ1 is a line, and the
 * kinds are known. That slip is recorded as `statedAsPlane` so the build notice can correct the wording
 * instead of the tool silently pretending it was never made (issue #375, operator ruling A).
 */
// The ⟂ / ∥ connective SPLITTERS shared by the operand-classified relation rules (planeLinePerp,
// lineRelGiven). No capture groups on purpose — String.split would splice captures into the parts.
// The plural suffix is ־ים, not ־ם: `ניצבים?` would demand the yod and reject the bare `ניצב`
// (the ADR-3D-035 morphology trap — a Hebrew keyword gate must admit every form it names).
// #522/#524 — the predicate AGREES with its subject, so every number-and-gender form must be admitted
// wherever one is: «מאונכים» for a plural subject, «מאונכת» for a feminine one (which is exactly what
// «הפאה» takes). `מקביל(?:ים|ות|ה)?` below already carried its full set; ⟂ carried only the plural, so
// the face/base vocabulary would have parsed its operands and then failed on the verb.
const PERP_SPLIT = /\s*(?:(?:is|are)\s+)?(?:מאונ[ךכ](?:ים|ות|ת)?|ניצב(?:ים|ות|ה)?|אנך|⊥|perpendicular)\s*(?:ל(?=\S)|to\s+)?-?\s*/;
// #821: `||` is how the operator TYPED ∥ («ACD||AB») — an Israeli keyboard has no ∥ glyph (the #493 argument).
const PAR_SPLIT = /\s*(?:(?:is|are)\s+)?(?:מקביל(?:ים|ות|ה)?|∥|\|\||parallel)\s*(?:ל(?=\S)|to\s+)?-?\s*/;

/**
 * #614 (ADR-3D-189) — CONTAINMENT, verb-headed: «ℓ מוכל במישור P», «נמצא ב…», «מונח על…»,
 * `is contained in`, `lies in`, `lies on`.
 *
 * The tool PRINTED «מוכל במישור» in the data panel (ADR-3D-154) and could not hear the same sentence
 * back — the asymmetry the operator hit within minutes of the row existing. Both frames are added
 * together, per the CROSS_HE_VERB/CROSS_HE_NOUN precedent: reach for only one and the other silently
 * drops.
 */
const CONTAINED_SPLIT =
  /\s*(?:(?:is|are)\s+)?(?:מוכל(?:ים|ות|ת)?|נמצא(?:ים|ות|ת)?|מונח(?:ים|ות|ת)?|contained(?:\s+in)?|lies?\s+(?:in|on)|lying\s+(?:in|on))\s*(?:ב(?=\S)|על\s+|in\s+|on\s+)?-?\s*/;

/** The CONTAINER-headed frame — «המישור P מכיל את ℓ», `plane P contains ℓ`. Directed: the sides arrive
 *  reversed, so it cannot ride the symmetric splitter table and gets its own reader. */
const CONTAINS_SPLIT = /\s*(?:(?:the\s+)?)?(?:מכיל(?:ה|ים|ות)?|contains?|containing)\s*(?:את\s+)?-?\s*/;

const planeLinePerp: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  const parts = s.split(PERP_SPLIT);
  if (parts.length !== 2) return null;

  // S1 (#378): the sides are classified by the shared operand tokenizer — by what each token IS,
  // never by its noun (the ADR-3D-100 lesson, now a mechanism). This rule owns exactly the
  // plane-run × line cell; every other operand pair falls through to its own rule unchanged.
  const sides = readRelationSides(parts[0], parts[1]);
  if (!sides) return null;
  const [a, b] = sides;
  const plane = a.op.kind === 'plane-run' ? a : b.op.kind === 'plane-run' ? b : null;
  const line = a.op.kind === 'line' ? a : b.op.kind === 'line' ? b : null;
  if (!plane || plane.op.kind !== 'plane-run' || !line || line.op.kind !== 'line') return null;

  return [
    {
      type: 'plane-line-perp',
      ids: plane.op.ids,
      line: canonLineName(line.op.name),
      // the student attached a PLANE noun to the line — build it, and say so
      ...(line.noun === 'plane' ? { statedAsPlane: true as const } : {}),
    },
  ];
};

/**
 * THE crossing point where a LINE-ish operand meets a PLANE-ish operand — one rule, every cell
 * (#755, ADR-3D-164).
 *
 * Three rules used to split this cell, and each generalised one side while leaving the other
 * name-only, so their union still had an empty square:
 *
 * | rule (retired) | line side | plane side | frames |
 * | --- | --- | --- | --- |
 * | `lineCutsPlane` | `ℓ`/`l1` only | π-name **or** point run | verb + noun, he + en |
 * | `planeCut` | two-point segment | π-name only | verb + noun, he + en |
 * | `segLineCutsPointPlane` | two-point segment, `הישר` REQUIRED | point run only | verb only |
 *
 * The hole was **segment × point-run plane in the noun frame** — «G נקודת חיתוך של AC' עם מישור ADE»,
 * which is the COMMON case: a student's crossing line is nearly always an edge or a diagonal of the
 * solid, and their plane is nearly always three of its vertices. The named-token forms the grammar
 * did cover are the rarer half. The engine had the capability all along (`plane-cut` accepts an
 * equation plane, a point-run plane or a rel-plane), so this was a silent drop — the #485 shape again.
 *
 * The class: *the crossing rules decided their operands by hand-written token shape PER RULE, so each
 * reached only the operands its author happened to spell.* `lineCutsPlane`'s own header recorded this
 * one level up ("the vocabulary was centralised but the FRAMES stayed enumerated per rule"); it was
 * just as true of the OPERANDS. Both sides now read through `readOperand` — kinds decide, nouns never
 * (ADR-3D-100) — so the matrix {named line, segment} × {π-name, point run} × {verb, noun} × {he, en} ×
 * {either order} is reachable, and order-freedom is a consequence of classifying rather than a frame
 * anyone had to spell.
 *
 * LOWERING IS DELIBERATELY UNCHANGED per cell. The two shipped lowerings differ in what they DRAW —
 * `plane-cut` records the point against a referenced segment, while the run-plane path also names the
 * carrier line — and both are asserted by existing tests. Unifying the MATCHING is this fix; unifying
 * the DRAWING is a visible change to shipped figures and is filed separately rather than taken here.
 */
const crossingPoint: Rule = (s) => {
  if (!/חות|חיתוך|נחתך|חוצה|פוגש|מפגש|\bcuts?\b|intersect|\bmeets?\b|\bcrosses\b/i.test(s)) return null;

  const ID = `(?<id>${LBL})`;
  const m =
    // verb frame — «X חותך את Y בנקודה P» / «X cuts Y at P». Either operand may be the line side.
    s.match(new RegExp(`^(?<x>.+?)\\s+(?:${CROSS_HE_VERB})\\s+(?:את\\s+)?(?<y>.+?)\\s+(?:${AT_POINT}|ב-?)${ID}$`)) ??
    s.match(new RegExp(`^(?<x>.+?)\\s+(?:${CROSS_EN_VERB})\\s+(?<y>.+?)\\s+at\\s+${ID}$`, 'i')) ??
    // noun frame — the point is named first and DEFINED as the crossing
    s.match(
      new RegExp(`^${HE_SUBJ}${ID}\\s*(?:היא\\s+|הוא\\s+|=\\s*)?(?:${CROSS_HE_NOUN})\\s+(?:של\\s+)?(?<x>.+?)\\s+(?:עם|ו)-?\\s*(?<y>.+?)$`),
    ) ??
    s.match(
      new RegExp(
        `^(?:point\\s+)?${ID}\\s*(?:is\\s+|=\\s*)?(?:the\\s+)?(?:${CROSS_EN_NOUN})\\s+(?:of\\s+)?(?<x>.+?)\\s+(?:and|with)\\s+(?<y>.+?)$`,
        'i',
      ),
    );
  if (!m?.groups) return null;
  const { x, y, id } = m.groups as { x: string; y: string; id: string };

  const ox = readOperand(x);
  const oy = readOperand(y);
  if (!ox || !oy) return null;

  // Roles by KIND, not by position — which is what makes both orders work without a frame each.
  const isLine = (o: Operand3) => o.kind === 'line' || o.kind === 'segment';
  const isPlane = (o: Operand3) => o.kind === 'plane-named' || o.kind === 'plane-run';
  const [lineOp, planeOp] =
    isLine(ox.op) && isPlane(oy.op) ? [ox.op, oy.op]
    : isPlane(ox.op) && isLine(oy.op) ? [oy.op, ox.op]
    : [null, null];
  // Anything else is another rule's cell (segment∩segment, plane∩plane…) — decline, never guess.
  if (!lineOp || !planeOp) return null;

  const planeName = planeOp.kind === 'plane-named' ? canonicalPlane(planeOp.name) : planeOp.ids.join('');
  // A POINT-RUN plane must exist before it can be cut (#401) — idempotent, like every plane-through.
  const materialisePlane: Command3[] =
    planeOp.kind === 'plane-run' ? [{ type: 'plane-through', name: planeName, ids: planeOp.ids }] : [];

  if (lineOp.kind === 'line')
    return [...materialisePlane, { type: 'line-plane-point', id, line: canonLineName(lineOp.name), plane: planeName }];

  // SEGMENT side → `plane-cut` (the V8-b lowering: the segment is a REFERENCE, not a new object),
  // whatever form the plane took.
  //
  // #780 — this used to fork on the PLANE's form, which had nothing to do with the operand: a π-name
  // referenced the segment, while a point-run plane first minted `line-through` for the carrier. On a
  // solid that is catastrophic — «G נקודת חיתוך של CC' עם מישור ADE» on a תיבה grew a full-height
  // vertical line through an EDGE the student was merely pointing at, and «הקטע» made no difference
  // because both spellings produced byte-identical commands.
  //
  // ADR-3D-164 (#755) taught the MATCHER that a student's crossing line is drawn ink; the lowering
  // then converted it back into an unbounded line object, undoing the fix at the last step. #756's
  // own offer half already gets this right — it derives candidates from the solids' edges and bounds
  // segments to 0 < t < 1, "because a crossing outside the ink is not on the figure". One definition
  // of the lines in this figure, now used by BOTH paths.
  //
  // A named line the student declared themselves (`ישר ℓ`) keeps the unbounded `line-plane-point`
  // route above: that is the drawn-ink-vs-declared-line distinction #755 taught the matcher, and the
  // lowering now asks the same question the matcher already answers.
  return [...materialisePlane, { type: 'plane-cut', id, plane: planeName, a: lineOp.a, b: lineOp.b }];
};

/** `ℓ אינו מקביל ל-π לכל m` / `ℓ is not parallel to plane π for every m` — the 2024-א probe, a CLAIM. */
const neverParallelClaim: Rule = (s) => {
  const m =
    s.match(
      new RegExp(`^(?:${HE_LINE}\\s+)?(${LINE_NAME.source})\\s+אינו\\s+מקביל\\s+ל-?(?:${HE_PLANE}\\s+)?(${PLANE_NAME.source})\\s+לכל\\s+([a-w])$`),
    ) ??
    s.match(
      new RegExp(
        `^(?:line\\s+)?(${LINE_NAME.source})\\s+is\\s+not\\s+parallel\\s+to\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})\\s+for\\s+(?:every|all|any)\\s+([a-w])$`,
      ),
    );
  if (!m) return null;
  return [{ type: 'claim', claim: { type: 'never-parallel', line: canonicalLine(m[1]), plane: canonicalPlane(m[2]) } }];
};

/** Standalone `B על הישר ℓ` / `B is on line ℓ` — an on-line membership statement (M1 at apply:
 *  an EXISTING id is a verified/driven given, a NEW id becomes a free 1-DOF rider, ADR-3D-031).
 *  S2 (#378, the #377 reported item): the noun is OPTIONAL on both sides — `B על l1`,
 *  `נקודה B נמצאת על ישר l1`, `point B on l1` all reach the built on-line capability; the
 *  LINE_NAME token after על/on is what keeps `B על AC` (a segment rider) with onSegment. */
const onLineMembership: Rule = (s) => {
  const HEAD = `^(?:ה?נקודה\\s+|(?:the\\s+)?point\\s+)?([A-Z]\\d*'?)\\s+(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?`;
  const m =
    // #552: the NOUN form also admits a noun-declared arbitrary name — «B על הישר k»
    s.match(new RegExp(`${HEAD}(?:על\\s+ה?ישר|on\\s+(?:the\\s+)?line)\\s+(${LINE_NAME.source}|[a-w])$`)) ??
    // the noun-less form stays convention-only: a bare «B על k» carries no kind signal
    s.match(new RegExp(`${HEAD}(?:על|on)\\s+(${LINE_NAME.source})$`));
  if (!m) return null;
  return [{ type: 'on-line', id: m[1], line: canonLineName(m[2]) }];
};

/**
 * S2 (#378, ADR-3D-103): ∥ / ⟂ where ONE side is a NAMED LINE (ℓ, l1, …) — the named-line column
 * of the RELATION_TABLE, one rule. Splits on the shared connective and classifies each side through
 * the operand tokenizer — kinds decide, nouns never (the ADR-3D-100 mechanism): «AB מאונך לישר l1»,
 * «l1 ⊥ AB», «u מקביל ל-l1», «הישר l1 מקביל לישר l2», «הישר l1 מקביל למישור π/ACD», the flipped
 * «המישור π מאונך לישר l1», and the English mirrors — order and noun both cost nothing.
 *
 * Ownership boundaries (first-match-wins): `linePerpPlane` keeps line⟂π (this rule emits the SAME
 * frozen lowering for the flipped order); `planeLinePerp` keeps plane-run⟂line (runs earlier; the
 * plane-run⟂ combination here defers to it); a statement with NO line-kind side returns null, so
 * the segment/vector rules (perpSegGiven, segPlaneRel, …) keep their cells untouched.
 */
const lineRelGiven: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  // #614: containment joins the named-line column too — «הישר ℓ מוכל במישור ABCD» and the
  // container-headed «המישור ABCD מכיל את הישר ℓ». `reversed` marks the frame whose sides arrive the
  // other way round; both reach the SAME `line-rel` command.
  const FORMS: readonly (readonly ['perp' | 'parallel' | 'contained', RegExp, boolean?])[] = [
    ['perp', PERP_SPLIT],
    ['parallel', PAR_SPLIT],
    ['contained', CONTAINED_SPLIT],
    ['contained', CONTAINS_SPLIT, true],
  ];
  for (const [rel, splitter, reversed] of FORMS) {
    const parts = s.split(splitter);
    if (parts.length !== 2) continue;
    const sides = readRelationSides(reversed ? parts[1] : parts[0], reversed ? parts[0] : parts[1]);
    if (!sides) continue;
    const [a, b] = sides;
    const line = a.op.kind === 'line' ? a : b.op.kind === 'line' ? b : null;
    if (!line || line.op.kind !== 'line') continue;
    const other = line === a ? b : a;
    const op = other.op;
    if (op.kind === 'point') return null; // a point has no direction — nothing to relate
    // #614: a line is contained in a PLANE — nothing else. Another line, a segment or a vector is not
    // a container, so the statement is refused rather than given an invented meaning.
    if (rel === 'contained' && !isPlanar(op)) return null;
    if (op.kind === 'line' && op.name === line.op.name) return null; // a line related to itself is vacuous
    if (rel === 'perp') {
      // line ⟂ named plane is the FROZEN line-perp-plane lowering (linePerpPlane owns the
      // line-first order; the plane-first order lands here and lowers identically)
      if (op.kind === 'plane-named') return [{ type: 'line-perp-plane', line: canonLineName(line.op.name), plane: canonicalPlane(op.name) }];
      if (op.kind === 'plane-run') return null; // planeLinePerp's cell (it runs earlier — defensive)
    }
    const canonical: Operand3 =
      op.kind === 'line' ? { kind: 'line', name: canonLineName(op.name) }
      : op.kind === 'plane-named' ? { kind: 'plane-named', name: canonicalPlane(op.name) }
      : op;
    return [
      {
        type: 'line-rel',
        rel,
        op: canonical,
        line: canonLineName(line.op.name),
        // the student attached a PLANE noun to the line — build it, and say so (ADR-3D-100)
        ...(line.noun === 'plane' ? { statedAsPlane: true as const } : {}),
      },
    ];
  }
  return null;
};

/**
 * S2 (#378, ADR-3D-103): a stated ANGLE VALUE where one side is a NAMED LINE — «הזווית בין הישר l1
 * לבין המישור ACD היא 30», «הזווית בין l1 לבין l2 היא 60», «the angle between AB and line l1 is 45».
 * Requires a line-kind side, so `linePlaneAngle` (segment×point-run, its lowering frozen) and
 * `angleBetweenPlanes` (π×π param-root) keep their cells; a valueless "what is the angle" query
 * stays not-handled (outside the reproduce-and-verify charter).
 */
const lineRelAngle: Rule = (s) => {
  const m =
    s.match(new RegExp(`^ה?זו?וית\\s+(?:ש)?בין\\s+(.+?)\\s+(?:[לו]בין\\s+|ו-?\\s*|ל-?\\s*)(.+?)\\s*(?:היא|הוא|=|שווה\\s+ל?-?)\\s*(${ANGLE_VAL})\\s*°?$`)) ??
    s.match(new RegExp(`^(?:the\\s+)?angle\\s+between\\s+(.+?)\\s+and\\s+(.+?)\\s*(?:is|=)\\s*(${ANGLE_VAL})\\s*°?$`, 'i'));
  if (!m) return null;
  const sides = readRelationSides(m[1], m[2]);
  if (!sides) return null;
  const [a, b] = sides;
  const line = a.op.kind === 'line' ? a : b.op.kind === 'line' ? b : null;
  if (!line || line.op.kind !== 'line') return null;
  const other = line === a ? b : a;
  const op = other.op;
  if (op.kind === 'point') return null;
  if (op.kind === 'line' && op.name === line.op.name) return null;
  const canonical: Operand3 =
    op.kind === 'line' ? { kind: 'line', name: canonLineName(op.name) }
    : op.kind === 'plane-named' ? { kind: 'plane-named', name: canonicalPlane(op.name) }
    : op;
  return [
    {
      type: 'line-rel',
      rel: 'angle',
      // #523: a Greek NAME states which measure the question is about, not a value — mark, never drive
      ...(ANGLE_LABEL_RE.test(m[3]) ? { label: m[3] } : { deg: +m[3] }),
      op: canonical,
      line: canonLineName(line.op.name),
      ...(line.noun === 'plane' ? { statedAsPlane: true as const } : {}),
    },
  ];
};

// ---------------------------------------------------------------------------
// V4 — the coordinate-injection pivot (docs/20 §4; ADR-3D-007; gate 2020-ג + 2023-ג–ד)
// ---------------------------------------------------------------------------

/**
 * `נתון: v = (10,-5,0), u = (5,5,-5), P(0,4,6)` — the exam's mid-question injection:
 * numeric values for declared vectors + coordinates for existing points (possibly
 * partial: `A(3,n,p)`). One utterance, many givens.
 */
const injectionList: Rule = (s) => {
  // #326 (ADR-3D-079): the book register inflects the prefix — «נתונות הנקודות: …» / bare
  // «הנקודות …» / "given the points …". PLURAL nouns only: the singular «נתונה (ה)נקודה M(k,1,3),
  // k הוא פרמטר חיובי» belongs to coordPoint, whose appositive sign tail this rule would drop.
  const m = s.match(
    /^(?:(?:נתון|נתונים|נתונות|given)\s*:?\s*(?:ה?נקודות|the\s+points)?\s*:?\s+|ה?נקודות\s+|the\s+points\s+)(.+)$/i,
  );
  if (!m) return null;
  // #793 (ADR-3D-167): a label inside a longer run must never START an item — without the
  // lookbehind, `AA' = (…)` bound `A' = (…)` and `AB = (…)` bound `B = (…)`, reinterpreting a stated
  // pair-vector as point coordinates. #794 (ADR-3D-168): the PAIR item (`AB = (…)` — two labels, `=`
  // mandatory as in the standalone rule) now exists, tried before the single-label point item; named
  // groups because the alternation carries several operands (the src3d/CLAUDE.md shifting-index trap).
  const itemRe = new RegExp(
    `(?<![A-Za-z\\d'])(?:(?<vec>[a-w])\\s*=\\s*|(?<pa>[A-Z]\\d*'?)(?<pb>[A-Z]\\d*'?)\\s*=\\s*|(?<pt>[A-Z]\\d*'?)\\s*=?\\s*)\\(\\s*(?<c1>${COMP})\\s*,\\s*(?<c2>${COMP})\\s*,\\s*(?<c3>${COMP})\\s*\\)`,
    'g',
  );
  // #793 (ADR-3D-167): a gap between harvested items (or before the first) may hold only separators and a bare
  // list conjunction («ו-», "and") — any other residue is stated text this rule cannot read, and
  // harvesting around it would silently drop a given. Same principle as Am. 2's tail check, extended
  // from the tail to the whole string.
  const SEP_GAP = /^[\s.,;:]*(?:(?:ו|and)[-־‑]?[\s.,;:]*)?$/i;
  const cmds: Command3[] = [];
  let lastEnd = 0;
  for (const g of m[1].matchAll(itemRe)) {
    if (!SEP_GAP.test(m[1].slice(lastEnd, g.index ?? 0))) return null; // all-or-nothing, never a partial read
    lastEnd = (g.index ?? 0) + g[0].length;
    const gr = g.groups!;
    const comps = [gr.c1, gr.c2, gr.c3].map(parseComp);
    if (comps.some(unreadableComp)) return null; // #510, as above — all-or-nothing, never a partial read
    const [x, y, z] = comps.map((t) => t.num);
    // #794 (ADR-3D-168): one component grammar for every item kind — vector and pair items take
    // symbolic affine components exactly as point items do (the lifted "must be numeric" gate).
    const symExprs = symStructure(comps);
    const syms = symNames(comps);
    if (gr.vec) {
      cmds.push({ type: 'inject-vector', name: gr.vec, x, y, z, ...(symExprs ? { symExprs } : {}), ...(syms ? { syms } : {}) });
    } else if (gr.pa) {
      cmds.push({ type: 'inject-pair', a: gr.pa, b: gr.pb!, x, y, z, ...(symExprs ? { symExprs } : {}), ...(syms ? { syms } : {}) });
    } else if (comps.some((t) => t.expr !== null)) {
      // #325: symbolic affine components ride the list too (`נתונות הנקודות: B(2t, t, k)`)
      cmds.push({
        type: 'point3', id: gr.pt!, x, y, z,
        syms: comps.map((t) => (t.expr ? soleSymOf(t.expr) : null)) as [string | null, string | null, string | null],
        ...(symExprs ? { symExprs } : {}),
      });
    } else {
      cmds.push({ type: 'point3', id: gr.pt!, x, y, z });
    }
  }
  if (cmds.length === 0) return null;
  // ADR-3D-079 Am. 2: the book states the sign IN THE SAME SENTENCE — «נתונות הנקודות: B(2t, t, k),
  // A(1, 4, -3). t פרמטר חיובי». A trailing sign clause is picked up; any OTHER meaningful trailing
  // text defers the whole utterance (never a silent drop of a stated given).
  const tail = m[1].slice(lastEnd).replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
  if (tail) {
    const signCmds = paramSign(tail);
    if (!signCmds) return null;
    cmds.push(...signCmds);
  }
  return cmds;
};

/**
 * #324 (ADR-3D-079): a named ring's relation to a COORDINATE plane or axis —
 * «הבסיס ABCD מונח על מישור שמקביל למישור [xy]» (parallel), «המישור ABC מאונך למישור [xz]»,
 * «הבסיס ABCD מונח על המישור [xy]» (lies ON it), «המישור ABC מקביל לציר ה-z», En mirrors
 * («base ABCD lies on a plane parallel to the xy-plane», «plane ABC is perpendicular to the
 * xz-plane», «parallel to the z-axis»). Coordinate letters are LOWERCASE x/y/z (deliberate —
 * uppercase X,Y,Z are point labels, so «מקביל למישור XYZ» is a plane∥plane statement, not ours).
 * Lowers to `coord-plane-rel` (pivot residuals + a recorded claim). Everything reduces to the
 * axis ⟂ to the named coordinate plane: ∥ plane ⇔ the ring SHARES that axis coordinate; ON the
 * plane ⇔ that coordinate is 0; ⟂ plane ⇔ the ring's normal ⟂ that axis; an AXIS object maps
 * dually (∥ axis ⇔ normal ⟂ axis; ⟂ axis ⇔ shares it; lies on the axis ⇔ contains it).
 */
const coordPlaneRel: Rule = (s) => {
  // Subject: a noun + run; a POLYGON noun + run (also BUILDS the flat polygon, so a first-line
  // «המרובע ABCD מונח במישור [xy]» works — the polygon rule used to claim it and silently DROP
  // the plane clause); or the definite bare «הבסיס» (ids [] — resolved to THE solid's base ring
  // at apply, the ADR-3D-048 context-at-apply pattern).
  let ids: Id[] = [];
  let rest: string;
  let polyKind: 'polygon3' | 'polygon4' | null = null;
  const subj = s.match(
    new RegExp(String.raw`(?:ה?בסיס|ה?מישור|ה?פאה|ה?משולש|ה?מרובע|(?:the\s+)?(?:base|plane|face|triangle|quadrilateral))\s+((?:${LBL}){3,})`),
  );
  if (subj) {
    ids = subj[1].match(TOKEN)!;
    rest = s.slice((subj.index ?? 0) + subj[0].length);
    if (/משולש|triangle/i.test(subj[0])) polyKind = 'polygon3';
    else if (/מרובע|quadrilateral/i.test(subj[0])) polyKind = 'polygon4';
    if (polyKind && ids.length !== (polyKind === 'polygon3' ? 3 : 4)) return null;
  } else {
    const bare = s.match(/^\s*(?:ה?בסיס(?:\s+ה?(?:מנסרה|פירמידה|תיבה|קוביי?ה))?|the\s+base)\s+/);
    if (!bare) return null;
    rest = s.slice(bare[0].length);
  }
  const obj = (txt: string): { axis: 'x' | 'y' | 'z'; kind: 'plane' | 'axis' } | null => {
    const ax = txt.match(/ציר\s+ה?[-־‑]?\s*([xyz])|(?:the\s+)?([xyz])\s*[- ]?axis/);
    if (ax) return { axis: (ax[1] ?? ax[2]) as 'x' | 'y' | 'z', kind: 'axis' };
    const pl = txt.match(/\[?\s*([xyz])\s*,?\s*([xyz])\s*\]?/);
    if (!pl || pl[1] === pl[2]) return null;
    const missing = ['x', 'y', 'z'].find((a) => a !== pl[1] && a !== pl[2]);
    return missing ? { axis: missing as 'x' | 'y' | 'z', kind: 'plane' } : null;
  };
  const par = rest.match(/(?:(?:ש|ה)?מקביל(?:ה|ים|ות)?|parallel)\s*(?:ל[-\s]?\s*|to\s+)?(.+)$/i);
  const perp = rest.match(
    /(?:(?:ש|ה)?מאונ[ךכ](?:ת|ים)?|(?:ש|ה)?ניצב(?:ת|ים)?|(?:ש|ה)?אנכי(?:ת|ים)?|perpendicular)\s*(?:ל[-\s]?\s*|to\s+)?(.+)$/i,
  );
  const on = rest.match(
    /(?:(?:מונח(?:ת|ים)?|נמצא(?:ת|ים)?|שוכ(?:ן|נת|נים))\s+(?:על\s+|ב-?\s*)|lies?\s+(?:on|in)\s+|is\s+(?:on|in)\s+)(.+)$/i,
  );
  const pick = par ?? perp ?? on;
  if (!pick) return null;
  const o = obj(pick[1]);
  if (!o) return null; // the object is not a coordinate plane/axis — not this rule (no theft)
  const mode: 'share' | 'zero' | 'perp' | 'contains' =
    par ? (o.kind === 'plane' ? 'share' : 'perp')
    : perp ? (o.kind === 'plane' ? 'perp' : 'share')
    : o.kind === 'plane' ? 'zero' : 'contains';
  const rel: Command3 = { type: 'coord-plane-rel', ids, axis: o.axis, mode };
  return polyKind ? [{ type: 'solid', kind: polyKind, ids }, rel] : [rel];
};

/** ADR-3D-032: `k הוא פרמטר חיובי` / `k חיובי` / `k > 0` / `k is (a) positive (parameter)` —
 *  a sign given on the figure's symbolic parameter (selects among the root branches).
 *  A letter the figure doesn't carry as its parameter refuses at apply (unknown-symbol). */
const paramSign: Rule = (s) => {
  // #325 widening: «הפרמטר t חיובי», «t הוא מספר חיובי», "the parameter t is positive" (+ number)
  const m =
    s.match(/^(?:ה?פרמטר\s+)?([a-w])\s+(?:הוא\s+)?(?:פרמטר\s+|מספר\s+)?(חיובי|שלילי)$/) ??
    s.match(/^(?:the\s+parameter\s+)?([a-w])\s+is\s+(?:a\s+)?(positive|negative)(?:\s+(?:parameter|number))?$/i) ??
    s.match(/^([a-w])\s*([<>])\s*0$/);
  if (!m) return null;
  return [{ type: 'param-sign', sym: m[1], positive: /^(?:חיובי|positive|>)$/i.test(m[2]) }];
};

/** Standalone `v = (10,-5,0)` — a single vector injection.
 *  #794 (ADR-3D-168): components take `COMP` — the #325 widening reaching the vector lane. */
const vectorInjection: Rule = (s) => {
  const m = s.match(new RegExp(`^([a-w])\\s*=\\s*\\(\\s*(${COMP})\\s*,\\s*(${COMP})\\s*,\\s*(${COMP})\\s*\\)$`));
  if (!m) return null;
  const comps = [m[2], m[3], m[4]].map(parseComp); // #510: the shared reader, never a bare `+`
  if (comps.some(unreadableComp)) return null;
  const symExprs = symStructure(comps);
  const syms = symNames(comps);
  return [{ type: 'inject-vector', name: m[1], x: comps[0].num, y: comps[1].num, z: comps[2].num, ...(symExprs ? { symExprs } : {}), ...(syms ? { syms } : {}) }];
};

/** `שיעור ה-z של C' חיובי` / `the z-coordinate of C' is positive` — a sign branch given.
 *  Article spaced or hyphenated (`ה z`/`ה-z`/`הz`, the on-axes idiom) and the copula
 *  (`הוא`/`היא`/`is`) optional — the ADR-3D-026 phrasing class. */
const signGiven: Rule = (s) => {
  const m =
    s.match(/^שיעור\s+ה\s*[-־]?\s*([xyz])\s+של\s+(?:הקודקוד\s+|הנקודה\s+)?([A-Z]\d*'?)\s+(?:הוא\s+|היא\s+)?(חיובי|שלילי)$/) ??
    s.match(/^(?:the\s+)?([xyz])(?:-coordinate|\s+coordinate)\s+of\s+(?:vertex\s+|point\s+)?([A-Z]\d*'?)\s+is\s+(positive|negative)$/);
  if (!m) return null;
  return [{ type: 'sign-given', id: m[2], axis: m[1] as 'x' | 'y' | 'z', positive: m[3] === 'חיובי' || m[3] === 'positive' }];
};

// #333 (ADR-3D-153): `pointPlanesLine` — the POINT-RUN sibling of `intersectionLine` — is gone.
// Two rules for one relation, each with its own hand-rolled connective grammar, IS the overfit this
// issue reported: the named-π rule took `בין המישורים π1 ו-π2` while the point-run rule took only
// `בין המישור X ו/ל בין המישור Y`, so which phrasings worked was an accident of which rule you hit.
// `intersectionLine` above now reads both operand kinds through one tail reader, and the registry
// shrank by a rule (the ADR-3D-103 outcome, repeated).

/** `המישור KBC: x + 2y + 3z - 26 = 0` / `מישור A'B'C'D' הוא x-4y-8z-142=0` — a
 *  plane-EQUATION claim on a plane through points; separator `:` or the copula `הוא`/`is`. */
const planeEqClaim: Rule = (s) => {
  const m = s.match(/^(?:ה?מישור\s+|(?:the\s+)?plane\s+)((?:[A-Z]\d*'?){3,4})\s*(?::|הוא\s|is\s)\s*(.+)$/);
  if (!m) return null;
  const eq = parseLinearEq(m[2]);
  if (!eq || eq.param) return null; // a claimed equation must be numeric
  const ids = m[1].match(/[A-Z]\d*'?/g)!;
  return [{ type: 'claim', claim: { type: 'plane-eq', ids, cx: eq.cx.k, cy: eq.cy.k, cz: eq.cz.k, d: eq.d.k } }];
};

/** `מישור ABC` / `המישור BC'D` / `plane ABCD` — a bare point-run plane declaration
 *  (ADR-3D-015): HIGHLIGHTS the plane — the renderer draws its translucent patch, and
 *  the patch always extends to cover the named points. Points must already exist. */
const planeThroughBare: Rule = (s) => {
  const RUN = `(?:[A-Z]\\d*'?){3,4}`;
  const m = s.match(new RegExp(`^(?:ה?מישור|(?:the\\s+)?plane)\\s+(${RUN})$`));
  if (!m) return null;
  return [{ type: 'plane-through', name: m[1], ids: m[1].match(/[A-Z]\d*'?/g)! }];
};

// ---------------------------------------------------------------------------
// V5 corpus additions (2019 gate) + V6 solids of revolution (ADR-3D-008/009)
// ---------------------------------------------------------------------------


/**
 * `הזווית בין A'C לבין BC' היא 90` / the exam's `גודל הזווית שבין הישר AB ובין הישר AM הוא 60` — a
 * stated angle VALUE between two direction operands.
 *
 * #862 (ADR-3D-205): the sides are read through the shared operand seam instead of two hard-coded
 * point-pair captures, so the MIXED arm — a segment against a declared vector, «הזווית בין AB לבין v
 * היא 60» — reaches the cell `relationTable` has advertised as supported all along. Two lowerings,
 * chosen by what the arms ARE and never by which sentence was typed:
 *
 *  - **pair × pair** keeps the frozen `angle-seg-eq` CLAIM — the ≤90° segment-line reading this rule
 *    has always produced. Nothing about that cell changes.
 *  - **any VECTOR arm** lowers to `cos-angle` at `cos(deg)` — the very command the cosine spelling of
 *    the identical fact produces, so «…היא 60» and «קוסינוס… הוא 0.5» are one fact stated two ways.
 *    That is the `angle|vector|vector` cell's own lowering, inherited rather than re-invented.
 */
const angleSegClaim: Rule = (s0) => {
  const s = stripStatementPrefix(s0);
  const m =
    s.match(
      new RegExp(
        `^(?:גודל\\s+)?ה?זו?וית\\s+ש?בין\\s+(.+?)\\s+(?:לבין|ובין|ל|ו)-?\\s*(.+?)\\s+(?:היא|הוא)\\s+(${NUM})\\s*°?$`,
      ),
    ) ??
    s.match(new RegExp(`^the\\s+angle\\s+between\\s+(.+?)\\s+and\\s+(.+?)\\s+is\\s+(${NUM})\\s*°?$`, 'i'));
  if (!m) return null;
  const sides = readRelationSides(m[1], m[2]);
  if (!sides) return null;
  const u = vecAtomOf(sides[0].op);
  const v = vecAtomOf(sides[1].op);
  if (!u || !v) return null; // a line / plane / point arm belongs to another cell — decline, never guess
  const deg = +m[3];
  const draw: Command3[] = [];
  for (const at of [u, v]) if (at.kind === 'pair') draw.push({ type: 'segment3', a: at.from, b: at.to });
  if (u.kind === 'pair' && v.kind === 'pair')
    return [...draw, { type: 'claim', claim: { type: 'angle-seg-eq', a1: u.from, b1: u.to, a2: v.from, b2: v.to, deg } }];
  return [...draw, { type: 'cos-angle', u, v, cos: Math.cos((deg * Math.PI) / 180) }];
};

/** `A'K : A'C = 2 : 3` — a length-RATIO claim (draws both segments). */
const lengthRatioClaim: Rule = (s) => {
  const m = s.match(
    new RegExp(`^([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*:\\s*([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*=\\s*(${NUM})\\s*:\\s*(${NUM})$`),
  );
  if (!m) return null;
  const [, a1, b1, a2, b2, p, q] = m;
  return [
    { type: 'segment3', a: a1, b: b1 },
    { type: 'segment3', a: a2, b: b2 },
    { type: 'claim', claim: { type: 'length-ratio', a1, b1, a2, b2, p: +p, q: +q } },
  ];
};

/** `חרוט שקודקודו S ומרכז בסיסו O, רדיוס הבסיס 5 וגובהו 12` — a solid of revolution; unstated sizes stay FREE. */
const revolutionSolid: Rule = (s) => {
  const kind = /חרוט|\bcone\b/i.test(s) ? 'cone' : /גליל|\bcylinder\b/i.test(s) ? 'cylinder' : /כדור|\bsphere\b/i.test(s) ? 'sphere' : null;
  if (!kind) return null;
  const apex = s.match(/(?:שקודקודו|קודקודו|apex(?:\s+is)?(?:\s+at)?)\s+([A-Z]\d*'?)/)?.[1];
  const center = s.match(/(?:שמרכזו|מרכזו|מרכז\s+ה?בסיסו?|(?:base\s+)?cent(?:er|re)(?:\s+is)?(?:\s+at)?)\s+([A-Z]\d*'?)/)?.[1];
  const radius = s.match(new RegExp(`(?:שרדיוסו|רדיוסו?|רדיוס\\s+ה?בסיסו?|radius(?:\\s+is)?)\\s*(?:הוא\\s*)?(${NUM})`))?.[1];
  const height = s.match(new RegExp(`(?:שגובהו|גובהו?|height(?:\\s+is)?)\\s*(?:הוא\\s*)?(${NUM})`))?.[1];
  // a BARE solid noun (no name/size bound) is a free-size solid (ADR-052 — unstated radius/
  // height are free DOFs), UNLESS it carries a number we failed to bind (a half-read → refuse).
  if (!apex && !center && radius === undefined && height === undefined && /\d/.test(s)) return null;
  if (kind !== 'cone' && apex) return null; // only a cone has an apex
  return [
    {
      type: 'revolution',
      kind,
      center,
      apex,
      radius: radius !== undefined ? +radius : undefined,
      height: height !== undefined ? +height : undefined,
    },
  ];
};

const REV_KIND: Record<string, 'cylinder' | 'cone' | 'sphere'> = {
  חרוט: 'cone', גליל: 'cylinder', כדור: 'sphere', cone: 'cone', cylinder: 'cylinder', sphere: 'sphere',
};

/** `נפח החרוט = 100π` / `the volume of the cone = 100π` — a volume claim (π multiplies). */
const volumeClaim: Rule = (s) => {
  const m =
    s.match(new RegExp(`^נפח\\s+ה?(חרוט|גליל|כדור)\\s*(?:הוא\\s*)?=?\\s*(${NUM})\\s*(π|pi)?$`)) ??
    s.match(new RegExp(`^the\\s+volume\\s+of\\s+the\\s+(cone|cylinder|sphere)\\s*(?:is\\s*)?=?\\s*(${NUM})\\s*(π|pi)?$`));
  if (!m) return null;
  const value = +m[2] * (m[3] ? Math.PI : 1);
  return [{ type: 'claim', claim: { type: 'volume-eq', solid: REV_KIND[m[1]], value } }];
};

/** `שטח המעטפת של החרוט = 65π` (cone/cylinder) / `שטח הפנים של הכדור = 36π` (sphere) — lateral/surface area claims. */
const lateralAreaClaim: Rule = (s) => {
  const m =
    s.match(new RegExp(`^שטח\\s+המעטפת\\s+של\\s+ה?(חרוט|גליל)\\s*(?:הוא\\s*)?=?\\s*(${NUM})\\s*(π|pi)?$`)) ??
    s.match(new RegExp(`^שטח\\s+הפנים\\s+של\\s+ה?(כדור)\\s*(?:הוא\\s*)?=?\\s*(${NUM})\\s*(π|pi)?$`)) ??
    s.match(new RegExp(`^the\\s+lateral\\s+area\\s+of\\s+the\\s+(cone|cylinder)\\s*(?:is\\s*)?=?\\s*(${NUM})\\s*(π|pi)?$`)) ??
    s.match(new RegExp(`^the\\s+surface\\s+area\\s+of\\s+the\\s+(sphere)\\s*(?:is\\s*)?=?\\s*(${NUM})\\s*(π|pi)?$`));
  if (!m) return null;
  const value = +m[2] * (m[3] ? Math.PI : 1);
  return [{ type: 'claim', claim: { type: 'lateral-area-eq', solid: REV_KIND[m[1]], value } }];
};

// --- V7 T3: exam terminology sugar ---

/** `D בראשית הצירים` / `A על ציר ה-x החיובי` — on-axes phrasings lower to (partial) pins + sign givens. */
const onAxes: Rule = (s) => {
  const origin = s.match(/^([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+|is\s+)?(?:בראשית הצירים|at the origin)$/);
  if (origin) return [{ type: 'point3', id: origin[1], x: 0, y: 0, z: 0 }];
  const lower = (id: string, ax: 'x' | 'y' | 'z', signWord?: string): Command3[] => {
    const zero = { x: 0 as number | null, y: 0 as number | null, z: 0 as number | null };
    zero[ax] = null; // the on-axis coordinate stays free
    const cmds: Command3[] = [{ type: 'point3', id, x: zero.x, y: zero.y, z: zero.z }];
    if (signWord) cmds.push({ type: 'sign-given', id, axis: ax, positive: signWord === 'החיובי' || signWord === 'positive' });
    return cmds;
  };
  // the "positive PART/SIDE of the axis" family — one shared axis fragment covers
  // ציר ה-z / ציר ה z / ציר z; the container word covers על החלק / בחלק / בצד
  const part =
    s.match(/^(?:הקודקוד\s+|הנקודה\s+)?([A-Z]\d*'?)\s+(?:נמצאת?\s+)?(?:על\s+|ב)?ה?(?:חלק|צד)\s+(החיובי|השלילי)\s+של\s+ציר\s*ה?\s*[-־]?\s*([xyz])$/) ??
    s.match(/^([A-Z]\d*'?)\s+(?:is\s+|lies\s+)?on\s+the\s+(positive|negative)\s+(?:part|side)\s+of\s+the\s+([xyz])[- ]axis$/i);
  if (part) return lower(part[1], part[3] as 'x' | 'y' | 'z', part[2] === 'positive' || part[2] === 'החיובי' ? 'החיובי' : 'השלילי');
  const he = s.match(/^(?:הקודקוד\s+|הנקודה\s+)?([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+)?על\s+ציר\s*ה?\s*[-־]?\s*([xyz])(?:\s+(החיובי|השלילי))?$/);
  if (he) return lower(he[1], he[2] as 'x' | 'y' | 'z', he[3]);
  const en = s.match(/^([A-Z]\d*'?)\s+(?:is\s+|lies\s+)?on\s+the\s+(positive\s+|negative\s+)?([xyz])[- ]axis$/i);
  if (en) return lower(en[1], en[3] as 'x' | 'y' | 'z', en[2] && en[2].trim().toLowerCase() === 'positive' ? 'positive' : en[2] ? 'השלילי' : undefined);
  return null;
};

/** `∠PC'C = 82.1` / `הזווית PC'C היא 90` — the vertex form lowers to the angle-between-segments claim.
 *  #251 (ADR-3D-049): also the `ישרה`/`is right` word-form (deg 90), and the SINGLE-VERTEX form
 *  (`זוית O ישרה`, `זווית O = 90`, `angle at O is right`) → `vertex-angle`, arms resolved at APPLY. */
const vertexAngleClaim: Rule = (s0) => {
  const s = stripStatementPrefix(s0);
  const L = String.raw`([A-Z]\d*'?)`;
  const PRE = String.raw`(?:∠|ה?זו?וית\s+|the angle\s+(?:at\s+)?|angle\s+(?:at\s+)?)`;
  const RIGHT = String.raw`(?:היא\s+|הוא\s+)?ישרה|is\s+(?:a\s+)?right(?:\s+angle)?`;
  const m =
    s.match(new RegExp(`^${PRE}${L}${L}${L}\\s*(?:היא|הוא|is|=)\\s*(${NUM})\\s*°?$`)) ??
    s.match(new RegExp(`^${PRE}${L}${L}${L}\\s+(?:${RIGHT})$`));
  if (m) {
    const [, p, vertex, q, deg] = m;
    return [
      { type: 'segment3', a: vertex, b: p },
      { type: 'segment3', a: vertex, b: q },
      { type: 'claim', claim: { type: 'angle-seg-eq', a1: vertex, b1: p, a2: vertex, b2: q, deg: deg !== undefined ? +deg : 90 } },
    ];
  }
  const sv =
    s.match(new RegExp(`^${PRE}${L}\\s*(?:היא|הוא|is|=)\\s*(${NUM})\\s*°?$`)) ??
    s.match(new RegExp(`^${PRE}${L}\\s+(?:${RIGHT})$`));
  if (sv) return [{ type: 'vertex-angle', vertex: sv[1], deg: sv[2] !== undefined ? +sv[2] : 90 }];
  return null;
};

/**
 * A stated numeric BOUND on an angle — `∠SAB > 60`, `60 < ∠SAB < 90`, `60 < α < 90`, `α > 60`, plus the
 * word forms (`זווית SAB גדולה מ-60`, `angle SAB is between 60 and 90`) — [ADR-3D-053](docs/06b-decisions-3d.md),
 * issue #273.
 *
 * A bound is NOT an equation: it determines nothing, so it becomes a REQUIREMENT on which sampled
 * configuration may be shown (the angle keeps its DOF, and no value is ever reported for it). The
 * grammar mirrors the 2-D `measureBound` (ADR-390) — patterns are copied, never imported.
 */
const angleBound3: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  // both nun spellings: קטן (m) / קטנה (f) — a gate on one silently rejects the other (the ADR-3D-035
  // kaf trap, nun edition; the same slip cost «זווית ABC קטנה מ-60» a wrong parse in 2-D, ADR-390)
  if (!/(?:<|>|≤|≥|גדול|קט[ןנ]|בין|greater|less|between)/i.test(s)) return null;
  const NUMB = String.raw`(-?\d+(?:\.\d+)?)`;
  const ANG = String.raw`(?:(?:∠|ה?זו?וית\s+|(?:the\s+)?angle\s+)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)|([α-ωΑ-Ω]))`;
  const mk = (m: RegExpMatchArray, i: number, min?: number, max?: number): Command3[] => {
    if (min !== undefined && max !== undefined && min >= max) return []; // an empty window states nothing
    const named = m[i + 3];
    const cmd: Command3 = named
      ? { type: 'angle-bound3', label: named, min, max }
      : { type: 'angle-bound3', vertex: m[i + 1], p: m[i], q: m[i + 2], min, max };
    return [cmd];
  };
  const one = (out: Command3[]) => (out.length ? out : null);
  // "X בין 60 ל-90" / "X is between 60 and 90"
  let m = s.match(new RegExp(String.raw`^${ANG}\s*(?:היא|הוא|is)?\s*(?:בין|between)\s*${NUMB}\s*(?:ל-?|עד|and|to)\s*${NUMB}\s*°?$`, 'i'));
  if (m) return one(mk(m, 1, Math.min(+m[5], +m[6]), Math.max(+m[5], +m[6])));
  // "X גדולה מ-60" / "X is greater than 60" (and the small twin)
  m = s.match(new RegExp(String.raw`^${ANG}\s*(?:היא|הוא|is)?\s*(?:(גדול[֐-׿]*|greater|larger|bigger|more)|(קט[ןנ][֐-׿]*|smaller|less))\s*(?:than\s+|מ-?|מן\s+)?\s*${NUMB}\s*°?$`, 'i'));
  if (m) return one(mk(m, 1, m[5] ? +m[7] : undefined, m[6] ? +m[7] : undefined));
  // "60 < X < 90" (either direction)
  m = s.match(new RegExp(String.raw`^${NUMB}\s*(<=|<|≤)\s*${ANG}\s*(<=|<|≤)\s*${NUMB}\s*°?$`));
  if (m) return one(mk(m, 3, +m[1], +m[8]));
  m = s.match(new RegExp(String.raw`^${NUMB}\s*(>=|>|≥)\s*${ANG}\s*(>=|>|≥)\s*${NUMB}\s*°?$`));
  if (m) return one(mk(m, 3, +m[8], +m[1]));
  // "X > 60" / "60 < X"
  m = s.match(new RegExp(String.raw`^${ANG}\s*(<=|>=|<|>|≤|≥)\s*${NUMB}\s*°?$`));
  if (m) {
    const less = m[5] === '<' || m[5] === '<=' || m[5] === '≤';
    return one(mk(m, 1, less ? undefined : +m[6], less ? +m[6] : undefined));
  }
  m = s.match(new RegExp(String.raw`^${NUMB}\s*(<=|>=|<|>|≤|≥)\s*${ANG}\s*°?$`));
  if (m) {
    const less = m[2] === '<' || m[2] === '<=' || m[2] === '≤';
    return one(mk(m, 3, less ? +m[1] : undefined, less ? undefined : +m[1]));
  }
  return null;
};

/**
 * `∠SAB = ∠SAD` / `זווית SAB = זווית SAD` / `angle SAB = angle SAD` / `הזווית SAB שווה לזווית SAD`, and
 * the chained naming form `∠SAB = ∠SAD = α` — a general angle EQUALITY ([ADR-3D-052](docs/06b-decisions-3d.md),
 * issue #271).
 *
 * The relation itself was already in the engine (`cos-eq`, V8-f/G10) but reachable through ONE phrasing —
 * the construction wording "AS יוצר זוויות שוות עם AB ו-AD" — because the rule was written as a construction
 * rather than as the equality a textbook states. The four atoms are independent, so a shared vertex/arm is a
 * special case, not a requirement. Runs BEFORE `angleMarker`, which would otherwise claim the left angle and
 * silently drop the right-hand side.
 */
/**
 * ONE angle phrase → its two arm vectors (#337, [ADR-3D-088]).
 *
 * The same angle is written two ways in the corpus and they mean exactly the same thing:
 *   - the glued VERTEX TRIPLE  `∠SAB` / `זווית SAB` / `angle SAB`         → arms A→S and A→B
 *   - the BETWEEN form         `הזווית שבין הוקטור BE לבין הוקטור BC'`     → the two named operands
 *
 * Only the triple was ever expressible in an equality, so the textbook's between-form wording reached
 * no rule and fell to the LLM. The noun prefix (הוקטור / הישר / הקטע / vector / line / segment) is
 * optional and interchangeable — it says how the student pictures the operand, not which relation is
 * meant — and an operand may equally be a declared vector (`u`).
 */
const PT3 = String.raw`[A-Z]\d*'?`;

interface AnglePhrase3 {
  a: VecAtom;
  b: VecAtom;
  /** the wedge to mark, when the two arms share a tail (always for a triple) */
  mark?: { vertex: string; p: string; q: string };
  /** segments the phrase named explicitly and should therefore draw */
  draw: Command3[];
}

/**
 * #862 (ADR-3D-205) — the ARM of an angle, as an operand kind rather than a spelling.
 *
 * An angle's arm is a direction, and exactly two operand kinds carry one here: a point PAIR («AB») and
 * a declared VECTOR («v»). Everything else — a named line, a plane, a bare point — belongs to another
 * angle cell and must fall through, so the rule declines exactly where a hand-written regex would have.
 */
const vecAtomOf = (op: Operand3): VecAtom | null =>
  op.kind === 'segment' ? (op.a === op.b ? null : { kind: 'pair', from: op.a, to: op.b })
  : op.kind === 'vector' ? { kind: 'named', name: op.name }
  : null;

/**
 * One operand of a between-form angle, read through the SHARED operand seam (`readOperand`,
 * ADR-3D-140) rather than a private regex.
 *
 * #862: the private version spelled its own noun list (a private singular-only noun list) and its own token
 * shapes, so «הוקטורים AB ו-v» — the plural head noun #522 taught the seam to read — failed here while
 * the singular twin parsed, and the angle family drifted from the ⟂/∥ family that had already been
 * migrated. The kinds are still decided by what the token IS; `vecAtomOf` says which kinds are arms.
 */
function angleOperand3(t: string): VecAtom | null {
  const read = readOperand(t);
  return read ? vecAtomOf(read.op) : null;
}

function parseAnglePhrase3(t: string): AnglePhrase3 | null {
  const s = t.trim();
  const tri = s.match(new RegExp(String.raw`^(?:∠|ה?זו?וית\s+|(?:the\s+)?angle\s+)` + `(${PT3})(${PT3})(${PT3})$`));
  if (tri) {
    const [, p, v, q] = tri;
    if (v === p || v === q) return null; // an angle needs three distinct points
    return { a: { kind: 'pair', from: v, to: p }, b: { kind: 'pair', from: v, to: q }, mark: { vertex: v, p, q }, draw: [] };
  }
  const bet = s.match(
    /^(?:גודל\s+)?(?:ה?זו?וית\s+ש?בין|(?:the\s+)?angle\s+between)\s+(.+?)\s+(?:לבין|ובין|and|ל|ו)-?\s*(.+)$/,
  );
  if (!bet) return null;
  const a = angleOperand3(bet[1]);
  const b = angleOperand3(bet[2]);
  if (!a || !b) return null;
  const draw: Command3[] = [];
  for (const at of [a, b]) if (at.kind === 'pair') draw.push({ type: 'segment3', a: at.from, b: at.to });
  const mark =
    a.kind === 'pair' && b.kind === 'pair' && a.from === b.from ? { vertex: a.from, p: a.to, q: b.to } : undefined;
  return { a, b, mark, draw };
}

const angleEquality3: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  // #337 (ADR-3D-088): the two SIDES are parsed by the shared angle-phrase atom, so an angle written as
  // the glued vertex triple (`∠SAB`) and one written as the between-form (`הזווית שבין הוקטור BE לבין
  // הוקטור BC'`) are the same operand to this rule — previously only the triple was expressible, so the
  // textbook wording reached no rule at all and fell to the LLM (docs/17 §2.2: one relation reachable
  // through only one phrasing). The equality may also mix the two forms.
  const parts = s
    .split(/(?:=|שווה\s*ל?|equals?|is\s+equal\s+to)/i)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  // the chained naming form `∠SAB = ∠SAD = α` — a trailing single letter NAMES both angles
  const label = parts.length === 3 ? (/^[A-Za-zα-ωΑ-Ω]$/.test(parts[2]) ? parts[2] : null) : undefined;
  if (label === null) return null;
  const left = parseAnglePhrase3(parts[0]);
  const right = parseAnglePhrase3(parts[1]);
  if (!left || !right) return null;
  const out: Command3[] = [];
  // A between-form operand names its segments explicitly, so draw them (the `angleSegClaim` precedent);
  // a vertex triple draws nothing, exactly as before.
  for (const ph of [left, right]) out.push(...ph.draw);
  // An arc is drawn only where the two arms share a vertex — always for a triple, and for a between-form
  // whose operands share their tail (BE / BC' both from B). Otherwise there is no wedge to mark.
  for (const ph of [left, right]) {
    if (ph.mark) out.push({ type: 'angle-mark', vertex: ph.mark.vertex, p: ph.mark.p, q: ph.mark.q, ...(label ? { label } : {}) });
  }
  // With a trailing label the two marks share it, and the label-binding rule (apply) already asserts the
  // equality — emitting it again here would double the pin. Without one, state it explicitly.
  if (!label) out.push({ type: 'angle-pair-eq', a: left.a, b: left.b, c: right.a, d: right.b });
  return out.length ? out : null;
};

/** `∠SDB` / `∠SDB = α` — a named-angle MARKER (#94): draw the arc at the middle vertex, no value drives.
 *  A NUMERIC RHS (`∠SDB = 82`) is a claim (owned by `vertexAngleClaim`, before this); a `?`/bare `=` is a
 *  query (owned by scope3). A single-LETTER RHS (`= α`, Greek or Latin) is a display NAME for the angle. */
const angleMarker: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  const m = s.match(
    new RegExp(`^(?:∠|ה?זו?וית\\s+|the angle\\s+)([A-Z]\\d*'?)([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*(?:(?:=|היא|הוא|is)\\s*([A-Za-zα-ωΑ-Ω]))?\\s*$`),
  );
  if (!m) return null;
  const [, p, vertex, q, label] = m;
  return [{ type: 'angle-mark', vertex, p, q, ...(label ? { label } : {}) }];
};

/** Build a VecAtom from a regex operand triple: a lowercase name, or a point pair. */
const mkAtom = (named?: string, pa?: string, pb?: string): VecAtom | null =>
  named ? { kind: 'named', name: named } : pa && pb ? { kind: 'pair', from: pa, to: pb } : null;

/**
 * V8-f (G6): the cosine of the angle between two operands = a value.
 * Named vectors: `קוסינוס הזווית בין הוקטורים w ו-u הוא √35/10` / `the cosine of the angle
 * between u and w is √35/10` / `cos(u,v) = 0.5`. Vertex form: `cos∠ACB = 3/4` / `קוסינוס
 * הזווית ACB = 3/4` (rays from the middle vertex). The value may carry a radical (evalRadical).
 */
const cosAngleGiven: Rule = (s) => {
  if (!/cos|קוסינוס/i.test(s)) return null;
  // #862 (ADR-3D-205): the two sides are OPERANDS, not two spellings of `[a-w]`. The regexes below
  // capture the raw text and the shared seam classifies it, so «AB» and «v» are the same kind of thing
  // to this rule and the mixed pair the capability table has always advertised finally has a sentence.
  let m =
    s.match(/קוסינוס\s+(?:ה?זו?וית\s+)?ש?בין\s+(.+?)\s+(?:לבין|ובין|ל|ו)-?\s*(.+?)\s+(?:הוא|היא|שווה\s+ל-?|=)\s*(.+)$/) ??
    s.match(/(?:the\s+)?cosine\s+of\s+the\s+angle\s+between\s+(.+?)\s+and\s+(.+?)\s+(?:is|equals?|=)\s*(.+)$/i) ??
    s.match(/^cos\s*(?:∠|∡)?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*=\s*(.+)$/i);
  if (m) {
    const sides = readRelationSides(m[1], m[2]);
    const u = sides && vecAtomOf(sides[0].op);
    const v2 = sides && vecAtomOf(sides[1].op);
    if (!u || !v2) return null;
    const v = evalRadical(m[3].trim());
    if (v === null) return null;
    // the V1 convention: an operand the student named as a point pair is DRAWN
    const draw: Command3[] = [];
    for (const at of [u, v2]) if (at.kind === 'pair') draw.push({ type: 'segment3', a: at.from, b: at.to });
    return [...draw, { type: 'cos-angle', u, v: v2, cos: v }];
  }
  // vertex form: cos∠ACB / cos ACB / קוסינוס הזווית ACB = value — rays CA, CB from the middle vertex
  m = s.match(/(?:cos|קוסינוס(?:\s+ה?זו?וית)?)\s*(?:∠|∡)?\s*([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s*(?:הוא|היא|שווה\s+ל-?|is|=)\s*(.+)$/i);
  if (m) {
    const v = evalRadical(m[4].trim());
    if (v === null) return null;
    const [, p, vtx, q] = m;
    return [
      { type: 'segment3', a: vtx, b: p },
      { type: 'segment3', a: vtx, b: q },
      { type: 'cos-angle', u: { kind: 'pair', from: vtx, to: p }, v: { kind: 'pair', from: vtx, to: q }, cos: v },
    ];
  }
  return null;
};

/** V8-f (G9): a CHAIN of equal dot products `u·v = v·w = u·w` (RHS a dot, not a number —
 *  `u·v = 24` falls through to dotGiven). Named vectors; ≥ 2 dot terms. */
const dotEqGiven: Rule = (s) => {
  const norm = s.replace(/[×*]/g, '·');
  if (!/·/.test(norm)) return null;
  const parts = norm.split('=').map((x) => x.trim());
  if (parts.length < 2) return null;
  const ops: [VecAtom, VecAtom][] = [];
  for (const part of parts) {
    const mm = part.match(/^([a-w])\s*·\s*([a-w])$/);
    if (!mm) return null; // any non-dot term (e.g. a number) ⇒ not this rule
    ops.push([{ kind: 'named', name: mm[1] }, { kind: 'named', name: mm[2] }]);
  }
  return [{ type: 'dot-eq-chain', ops }];
};

/** V8-f (G10): `AE יוצר זוויות שוות עם AB ו-AD` / `AE makes equal angles with AB and AD`.
 *  Operands may be named vectors or point pairs. */
const equalAnglesGiven: Rule = (s) => {
  if (!/יוצר|equal\s+angles/i.test(s)) return null;
  const REF = String.raw`(?:([a-w])(?![a-z])|([A-Z]\d*'?)([A-Z]\d*'?))`;
  const m =
    s.match(new RegExp(`^${REF}\\s+יוצר(?:ת)?\\s+זוויות\\s+שוות\\s+עם\\s+(?:ה?וקטורים\\s+)?${REF}\\s+ו-?\\s*${REF}\\s*$`)) ??
    s.match(new RegExp(`^${REF}\\s+(?:makes|creates|forms)\\s+equal\\s+angles\\s+with\\s+(?:the\\s+vectors?\\s+)?${REF}\\s+and\\s+${REF}\\s*$`, 'i'));
  if (!m) return null;
  const base = mkAtom(m[1], m[2], m[3]);
  const a = mkAtom(m[4], m[5], m[6]);
  const b = mkAtom(m[7], m[8], m[9]);
  return base && a && b ? [{ type: 'angle-eq', base, a, b }] : null;
};

/** V8-f (G11): `D על AC כך ש-OD חוצה-זווית AOC` / `D on AC such that OD bisects angle AOC`.
 *  D on segment a–b, ray apex→D bisects ∠(a)(apex)(b) — apex = OD's non-D endpoint. */
const bisectorPoint: Rule = (s) => {
  if (!/חוצ|bisect/i.test(s)) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  const m =
    s.match(
      new RegExp(
        `^(?:ה?נקודה\\s+)?${L}\\s+(?:נמצאת\\s+|נמצא\\s+)?על\\s+(?:ה?קטע\\s+|ה?צלע\\s+)?${L}${L}\\s+כך\\s+ש-?\\s*${L}${L}\\s+חוצ[הת]?\\s*-?\\s*(?:את\\s+)?(?:ה?זו?וית\\s+)?${L}${L}${L}\\s*$`,
      ),
    ) ??
    s.match(
      new RegExp(
        `^(?:point\\s+)?${L}\\s+(?:is\\s+|lies\\s+)?on\\s+(?:the\\s+)?(?:segment\\s+|edge\\s+)?${L}${L}\\s+such\\s+that\\s+${L}${L}\\s+bisects\\s+(?:the\\s+)?(?:angle\\s+|∠)?${L}${L}${L}\\s*$`,
        'i',
      ),
    );
  if (!m) return null;
  const [, d, a, b, o1, o2, an1, anV, an2] = m;
  const apex = o1 === d ? o2 : o2 === d ? o1 : null; // OD's other endpoint is the apex
  if (!apex || anV !== apex) return null; // the angle's vertex must be the apex
  if ((an1 !== a && an1 !== b) || (an2 !== a && an2 !== b) || an1 === an2) return null; // rays = segment endpoints
  return [{ type: 'bisector-point', id: d, a, b, apex }];
};

/**
 * #343 (ADR-3D-207) — «OD חוצה זווית AOC»: the bisector RAY, stated on its own.
 *
 * `bisectorPoint` above handles the CARRIER form — «D על AC כך ש-OD חוצה זווית AOC» — where a stated
 * segment determines D. A textbook states the bisector by itself far more often, and every such
 * spelling escaped to the paid LLM lane: the bare form, the `את` form, and the English «bisects» /
 * «is the bisector of». Nothing was missing from the geometry; the sentence had no rule.
 *
 * What the sentence states is the DIRECTION. How far along the bisector `D` sits was never said, so it
 * is a free sampled DOF (ADR-052) — which is exactly the difference from the carrier form, and why this
 * is a distinct construct rather than a widened regex.
 *
 * The apex is DERIVED, not positional: it is the letter the segment and the angle share, and it must be
 * the angle's middle letter. So «OD חוצה זווית AOC» and «AD חוצה זווית BAC» are one rule, and a pair
 * that does not touch the angle's vertex correctly declines.
 */
const bisectorRay: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  if (!/חוצ|bisect/i.test(s)) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  const m =
    s.match(new RegExp(`^${L}${L}\\s+חוצ[הת]?\\s*-?\\s*(?:את\\s+)?(?:ה?זו?וית\\s+)?${L}${L}${L}\\s*$`)) ??
    s.match(
      new RegExp(
        `^${L}${L}\\s+(?:is\\s+the\\s+bisector\\s+of|bisects)\\s+(?:the\\s+)?(?:angle\\s+|∠)?${L}${L}${L}\\s*$`,
        'i',
      ),
    );
  if (!m) return null;
  const [, p1, p2, r1, apex, r2] = m;
  // the apex is the letter the PAIR and the ANGLE share; the pair's other letter is the rider
  const id = p1 === apex ? p2 : p2 === apex ? p1 : null;
  if (!id) return null; // the segment does not start at the angle's vertex — not this sentence
  if (r1 === apex || r2 === apex || r1 === r2 || id === r1 || id === r2) return null; // an angle needs three distinct points
  return [{ type: 'bisector-ray', id, a: r1, b: r2, apex }];
};

/**
 * MUTUAL POSITION — «NK ו-PL מצטלבים» / «NK and PL are skew» / «AB מקביל ל-CD» / «AB חותך את CD»,
 * over the general operand pair (S4, #378, ADR-3D-104).
 *
 * V7-T3 read only the plural SEGMENT-pair spelling and lowered it to a `lines-rel` claim. S4 widens
 * it two ways at once, which is why it stays ONE rule rather than growing a second:
 *
 *  - OPERANDS are read by the shared tokenizer, so a named line is a first-class side
 *    («ℓ1 ו-ℓ2 מצטלבים») — the S2 lesson that a relation's sides are classified by what they ARE.
 *  - the DIRECTED singular («AB מקביל ל-CD») is the same statement as the plural, so both now lower
 *    to `mutual-rel`, whose apply decides claim-vs-drive per M1. Two spellings of one statement had
 *    two different semantics — the plural verified, the singular was refused with "coming".
 *
 * Ownership (first-match-wins): ∥ with a NAMED-LINE side stays S2's `lineRelGiven` cell; a crossing
 * that NAMES its point («אלכסוני… נחתכים בנקודה O») is `diagIntersection`'s — the `$` anchor after
 * the relation word leaves it untouched.
 */
const MUTUAL_WORDS: { rel: MutualRel3; plural: RegExp; directed: RegExp }[] = [
  { rel: 'skew', plural: /מצטלב(?:ים|ות)|skew/, directed: /\s+(?:מצטלב(?:ת)?\s+עם|is\s+skew\s+(?:to|with)|skew\s+(?:to|with))\s+/ },
  {
    rel: 'intersecting',
    plural: /נחתכ(?:ים|ות)|נפגש(?:ים|ות)|intersecting|intersect|meet/,
    directed: /\s+(?:חותכ(?:ת)?\s+את|פוגש(?:ת)?\s+את|נחתך\s+עם|intersects?|meets?)\s+(?:the\s+)?/,
  },
  { rel: 'parallel', plural: /מקביל(?:ים|ות)|parallel/, directed: PAR_SPLIT },
  { rel: 'coincident', plural: /מתלכד(?:ים|ות)|coincident|coinciding|coincide/, directed: /\s+(?:מתלכד(?:ת)?\s+עם|coincides?\s+with|is\s+coincident\s+with)\s+/ },
];

const mutualPositionClaim: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  for (const { rel, plural, directed } of MUTUAL_WORDS) {
    // FORM A — plural/symmetric: «X ו-Y מצטלבים» · «X and Y are skew»
    const a =
      s.match(new RegExp(`^(?:ה?ישרים\\s+|ה?קטעים\\s+)?(.+?)\\s+ו-?\\s*(.+?)\\s+(?:${plural.source})$`)) ??
      // `are` is optional: English states this both adjectivally («are skew») and verbally
      // («intersect», «meet», «coincide») — one form per relation would drop half the register
      s.match(new RegExp(`^(?:lines\\s+|segments\\s+)?(.+?)\\s+and\\s+(.+?)\\s+(?:are\\s+)?(?:${plural.source})$`, 'i'));
    // FORM B — directed: «AB מקביל ל-CD» · «AB intersects CD»
    const bParts = a ? null : s.split(directed);
    const pair =
      a ? [a[1], a[2]]
      : bParts && bParts.length === 2 ? bParts
      : null;
    if (!pair) continue;
    const o1 = readOperand(pair[0]);
    const o2 = readOperand(pair[1]);
    if (!o1 || !o2) continue;
    const [x, y] = [o1.op, o2.op];
    if (sameOperand(x, y)) return null; // says nothing — let it escalate rather than record a vacuous truth
    // ∥ with a named-line side is S2's cell (drive-gauge / param-root) — it owns the lowering
    if (rel === 'parallel' && (x.kind === 'line' || y.kind === 'line')) return null;
    const located = (op: Operand3) => op.kind === 'segment' || op.kind === 'line';
    const directional = (op: Operand3) => located(op) || op.kind === 'vector';
    // a mutual POSITION needs located objects; ∥ is a direction relation, so a free vector qualifies
    const ok = rel === 'parallel' ? directional(x) && directional(y) : located(x) && located(y);
    if (!ok) continue;
    const canon = (op: Operand3): Operand3 => (op.kind === 'line' ? { kind: 'line', name: canonLineName(op.name) } : op);
    return [
      // the statement leaves ink (the ADR-3D-035 rule); apply draws it too, so this is belt-and-braces
      // for the pair RECORD (ADR-3D-030 Am.) that a bare solid edge would otherwise not get
      ...([x, y].filter((op) => op.kind === 'segment') as Extract<Operand3, { kind: 'segment' }>[]).map(
        (op) => ({ type: 'segment3', a: op.a, b: op.b }) as const,
      ),
      { type: 'mutual-rel', rel, a: canon(x), b: canon(y) },
    ];
  }
  return null;
};

/**
 * #587 (ADR-3D-152): the constraint-carrying command a stated FLAT quad noun lowers to, on the ring it
 * names. The quad sibling of {@link triShapeCommands} — and, like it, the ONE place the reading lives,
 * so a rule that RECOGNISES a quad noun is exactly a rule that can LOWER it.
 *
 * Unlike the triangle case the lowering is an ENGINE command rather than a macro of relations: which of
 * the three arms applies (declare / complete a corner / verify a statement) depends on which corners
 * already exist, and `parse3` is context-free — only apply knows.
 */
function quadShapeCommand(base: QuadBase | null, ids: Id[]): Command3[] {
  // `quad` is the generic noun (`מרובע`) — it states NOTHING beyond four-sidedness, which the plain
  // `polygon4` declaration already says. Lowering it too would only swap the declaring command (and
  // with it #586's bare-run byte-identity) for no semantic gain, so the six SHAPE nouns route here
  // and the generic one keeps the path it has always taken.
  if (!base || base === 'quad' || ids.length !== 4) return [];
  return [{ type: 'quad-shape', base, ids: ids as [Id, Id, Id, Id] }];
}

/** `ABEC מלבן` / `ABEC is a rectangle` — the RECTANGLE instance of `quad-shape` (#587). */
const rectComplete: Rule = (s) => {
  const m =
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:הוא\s+)?מלבן$/) ??
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s+is\s+a\s+rectangle$/) ??
    s.match(/^מלבן\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)$/);
  if (!m) return null;
  // #587: lowered to the GENERAL command, not the legacy `rect-complete` — `planarPolygon` now claims
  // these same three phrasings too, and emitting the identical command is what keeps that overlap from
  // being a divergent shadow (shadow-matrix3). The `rect-complete` command type stays in the engine so
  // `.geo3.json` files saved before ADR-3D-152 still load; nothing in the grammar emits it any more.
  return quadShapeCommand('rectangle', [m[1], m[2], m[3], m[4]]);
};

/** `A = (2, 0, -10)` — a coordinates CLAIM (the student's answer for a derived point). */
const coordsClaim: Rule = (s) => {
  const m = s.match(new RegExp(`^([A-Z]\\d*'?)\\s*=\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)$`));
  if (!m) return null;
  return [{ type: 'claim', claim: { type: 'coords-eq', id: m[1], x: +m[2], y: +m[3], z: +m[4] } }];
};

/** `AB = 3` — a scalar length CLAIM (Lane A: all points pinned ⇒ a check, never a driver). */
const lengthClaim: Rule = (s) => {
  const m = s.match(new RegExp(`^([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*=\\s*(${NUM})$`));
  if (!m) return null;
  return [
    { type: 'segment3', a: m[1], b: m[2] },
    { type: 'claim', claim: { type: 'length-eq', a: m[1], b: m[2], value: +m[3] } },
  ];
};

/** `שטח המשולש ABC = 4.5` / `the area of triangle ABC = 4.5` — an area CLAIM (draws the triangle). */
const areaClaim: Rule = (s) => {
  const m = s.match(
    new RegExp(`^(?:שטח\\s+(?:ה?משולש\\s+)?|the area of (?:the )?triangle\\s+|area of\\s+)([A-Z]\\d*'?)([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*=\\s*(${NUM})$`),
  );
  if (!m) return null;
  const [, a, b, c, value] = m;
  return [
    { type: 'segment3', a, b },
    { type: 'segment3', a: b, b: c },
    { type: 'segment3', a: c, b: a },
    { type: 'claim', claim: { type: 'area-eq', ids: [a, b, c], value: +value } },
  ];
};

// V8-b: a non-capturing plane-name fragment (PLANE_NAME injects an inner digit group;
// this one doesn't, so group indices stay simple in the rel-plane / cut rules).
const PN = "(?:π|pi|Pi|PI)\\s?\\d*";

/**
 * V8-b (G1): a plane DEFINED by a ⊥/∥ relation to an edge, through a point (⟂) or two
 * points (∥). `מישור π העובר דרך F וניצב ל-SC` / `plane π through F perpendicular to SC`;
 * `מישור π דרך K ו-P ומקביל ל-CD` / `plane π through K and P parallel to CD`. The
 * through- and relation-clauses may appear in either order; an unnamed plane defaults to π.
 */
const relPlaneRule: Rule = (s) => {
  if (!/מישור|\bplane\b/i.test(s)) return null;
  const perp = /ניצב|מאונך|אנך|perpendicular|⊥/.test(s);
  const par = /מקביל|parallel|∥/.test(s);
  if (perp === par) return null; // exactly one relation
  // #819 (ADR-3D-177): «דרך AC» — the exam writes the two through-points as a SEGMENT, glued, the way
  // it writes every other pair. The rule read only «דרך A ו-C», so «דרך AC העבירו מישור המקביל ל-SD»
  // captured one point, found no second, and refused a plane the engine builds from the other frame.
  const through =
    s.match(/(?:דרך|through)\s+([A-Z]\d*'?)\s*(?:(?:ו-?|and|,)\s*([A-Z]\d*'?))(?![A-Z0-9'])/) ??
    s.match(/(?:דרך|through)\s+([A-Z]\d*'?)([A-Z]\d*'?)(?![A-Z0-9'])/) ??
    s.match(/(?:דרך|through)\s+([A-Z]\d*'?)(?![A-Z0-9'])/);
  if (!through) return null;
  const edge = s.match(/(?:ניצב|מאונך|אנך|מקביל|perpendicular|parallel)\s*(?:ל|to)?\s*-?\s*(?:ה?מקצוע\s+|ה?קטע\s+|ה?ישר\s+|the\s+edge\s+|edge\s+|line\s+)?([A-Z]\d*'?)\s*([A-Z]\d*'?)(?![A-Z0-9'])/);
  if (!edge || !edge[1] || !edge[2]) return null;
  const nameM = s.match(new RegExp(`(?:מישור|plane)\\s+(${PN})`, 'i'));
  const name = nameM ? canonicalPlane(nameM[1]) : 'π';
  // #819: the exam states the plane and the point it cuts out in ONE sentence — «…וחותך את SB בנקודה K».
  // Read as a compound so the whole sentence is one utterance; a tail that is PRESENT but unreadable
  // refuses the rule outright rather than committing the plane and dropping the point the student named
  // (docs/17 §2.4 / the honesty invariant: a stated given never vanishes).
  // Composed from the SHARED crossing atoms, never re-spelled (the #333/#755 discipline), and with no
  // `` after a Hebrew word: Hebrew letters are not `\w`, so a word boundary there never matches and
  // the tail would be silently dropped — the same trap `src3d/CLAUDE.md` records for `ℓ`.
  const tailM = s.match(new RegExp(String.raw`[\s,]+ו?(?:${CROSS_HE_VERB})(.*)$|[\s,]+and\s+(?:it\s+)?(?:${CROSS_EN_VERB})(.*)$`));
  let cut: Command3 | null = null;
  if (tailM) {
    const t = (tailM[1] ?? tailM[2] ?? '').match(
      /^\s*(?:את\s+)?(?:ה?מקצוע\s+|ה?קטע\s+|ה?ישר\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s*(?:ב(?:ה?נקודה)?\s*|at\s+(?:the\s+)?(?:point\s+)?)([A-Z]\d*'?)\s*$/,
    );
    if (!t) return null;
    cut = { type: 'plane-cut', id: t[3], plane: name, a: t[1], b: t[2] };
  }
  const withCut = (c: Command3): Command3[] => (cut ? [c, cut] : [c]);
  if (perp) return withCut({ type: 'rel-plane', name, rel: 'perp', through: [through[1]], a: edge[1], b: edge[2] });
  if (!through[2]) return null; // ∥ an edge needs TWO through-points to fix the plane (1-DOF otherwise — deferred)
  return withCut({ type: 'rel-plane', name, rel: 'par', through: [through[1], through[2]], a: edge[1], b: edge[2] });
};

/**
 * V8-g: a FLAT polygon of free points in the plane (the 2-D vector lane) — `משולש ABC`
 * (triangle), `מרובע MKNL` (quadrilateral), `מחומש ABCDE` (pentagon). Excludes the 3-D
 * solid words (a prism/pyramid rule owns those). Label-less ⇒ default lettering.
 */
/**
 * #116 (ADR-3D-042): a RIGHT triangle — `AOB משולש ישר זווית` / `right(-angled) triangle ABC` (both
 * `זוית`/`זווית`, single/double vav — the ADR-3D-032 `זו?וית` class). The 3-D counterpart of the 2-D
 * ADR-163/164 class. Emits the triangle (`polygon3`) PLUS a right angle at the MIDDLE-named vertex as a
 * SOFT default (operator ruling, issue #116): "right triangle" states SOME vertex is 90° — which is the
 * student's to say (ADR-052) — so the default yields (dropped in derive3) to an explicit later `∠XYZ = 90`
 * on the same triangle. The right angle lowers to the existing V7-T3 `cos-angle` (cos = 0) — M1 at apply:
 * DRIVES a free-dim solid (the reported prism base flexes so ∠AOB = 90) or VERIFIES a determined figure;
 * no new engine construct. The polygon `solid` is idempotent on EXISTING ids (M1, apply.ts), so re-stating
 * the prism base as `AOB משולש …` references it instead of erroring `already-defined`.
 */
const rightTriangle: Rule = (s) => {
  if (!RIGHT_TRI_PHRASE.test(s)) return null;
  // #435 leftover guard (ADR-024, the `planarPolygon` discipline this rule was missing): a SOLID
  // sentence whose BASE is a right triangle is not a flat triangle. Without this, a pyramid/prism rule
  // that declines (an ill-formed label count) let this rule silently answer with a bare polygon —
  // dropping the solid entirely. Escalating is honest; drawing the wrong dimensionality is not.
  if (/מנסרה|פירמידה|\bprism\b|\bpyramid\b/i.test(s)) return null;
  const toks = firstLabelRun(s);
  const ids = toks.length === 3 ? toks : toks.length === 0 ? ['A', 'B', 'C'] : null;
  if (!ids) return null;
  const [, mid] = ids;
  // #424: a right triangle may ALSO be stated isosceles/equilateral — the qualifier must not vanish
  // just because this rule claimed the utterance first. #435: the right angle and the equal pair now
  // BOTH come from the one vocabulary, anchored at the right-angle vertex (a right triangle's equal
  // sides can only be its two legs), so this rule states no qualifier of its own.
  return [{ type: 'solid', kind: 'polygon3', ids }, ...triShapeCommands(statedTriShape(s), ids, mid)];
};

/** The polygon nouns an inscription statement can name — one alternation per language, shared by the
 *  container-marker test and the ring reader below so the two can never drift (the 2-D ADR-245 lesson:
 *  a noun missing from one list silently built the CONVERSE figure). */
const POLY_WORDS_HE3 = 'משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|מקבילית|דלתון|מצולע';
const POLY_WORDS_EN3 = String.raw`triangle|quad\w*|square|rectangle|rhombus|trapez\w*|parallelogram|kite|polygon`;

/**
 * #442 — a circle INSCRIBED IN / CIRCUMSCRIBED ABOUT a polygon, in R³.
 *
 * Roles are assigned by the CONTAINER MARKER — the noun carrying Hebrew's ב prefix or English "in" —
 * wherever it sits in the sentence, never by word order. This is [ADR-245](docs/06-decisions.md#adr-245)
 * ported verbatim, and it is ported because 2-D learned it the hard way: the order test silently built
 * the CONVERSE for every inverted Hebrew passive, in production, for months. It also settles the
 * operator's own mixed phrasing `משולש ABC חוסם במעגל` — circumscribe VERB, but the ב marker sits on
 * מעגל, so the circle is the container and the triangle is inscribed in it.
 *
 *   משולש ABC חסום במעגל   → the triangle is IN the circle  → `circum` (through A,B,C)
 *   מעגל חסום במשולש ABC   → the circle is IN the triangle  → `incircle`
 *   מעגל חוסם את משולש ABC → the circle contains it         → `circum`
 *   משולש ABC חוסם מעגל    → the triangle contains it       → `incircle`
 *
 * The ring may be a flat polygon or a SOLID'S FACE (the operator's case: ABC as a pyramid base) — both
 * are just a run of existing labels lying in a plane, so one rule serves both. The circle's centre is
 * derived, never a created point (the V6 unnamed-centre rule).
 */
const polygonCircle3: Rule = (s) => {
  if (!/חסומ?|חוסמ?|inscrib\w*|circumscrib\w*/i.test(s)) return null;
  if (!/מעגל|\bcircle\b/i.test(s)) return null;
  const polyRe = new RegExp(`${POLY_WORDS_HE3}|${POLY_WORDS_EN3}`, 'i');
  const ring = firstLabelRun(s);
  if (ring.length < 3 || ring.length > 5) return null; // the polygon must be NAMED — an unnamed one has no ring to fit
  // #586: the polygon NOUN is OPTIONAL. The ring is what identifies the polygon, and students write it
  // bare — «מעגל חוסם את ABCD». Requiring the noun made this the #494/#513/#529 framing gap (a rule
  // spelling one form of a subject written several ways); everything downstream already worked.
  const nounIdx = s.search(polyRe);
  const runIdx = s.indexOf(ring.join(''));
  // which side carries the "in" marker — the CONTAINER. With no noun, the marker rides the RUN itself
  // («מעגל חסום ב-ABCD»), which is the bare-run twin of `בתוך ה?<noun>`.
  const polyContainer =
    new RegExp(
      String.raw`(?:ב|בתוך\s+ה?)(?:${POLY_WORDS_HE3})|\bin(?:side)?\s+(?:an?\s+|the\s+)?(?:${POLY_WORDS_EN3})`,
      'i',
    ).test(s) ||
    (nounIdx < 0 &&
      new RegExp(String.raw`(?:(?:ב|בתוך\s+ה?)-?\s*|\bin(?:side)?\s+(?:the\s+)?)${ring.join('')}\b`, 'i').test(s));
  const circContainer = /(?:ב|בתוך\s+ה?)מעגל|\bin(?:side)?\s+(?:an?\s+|the\s+)?circle/i.test(s);
  let circleIsContainer: boolean;
  if (polyContainer !== circContainer) circleIsContainer = circContainer;
  else {
    // neither (or both) marked — fall back to the VERB: «חוסם» names what CONTAINS.
    const circIdx = s.search(/מעגל|\bcircle\b/i);
    const polyIdx = nounIdx >= 0 ? nounIdx : runIdx;
    if (circIdx < 0 || polyIdx < 0) return null;
    circleIsContainer = /חוסמ?\s*(?:את\s*)?(?:ה?מעגל)|circumscrib\w*\s+(?:about|around)/i.test(s)
      ? false
      : circIdx < polyIdx;
  }
  // an explicitly named circle keeps its letter; otherwise the id is derived from the ring, so the
  // implicit-reference lane (`c.circles3.length === 1`) still resolves «המעגל»
  const named = s.match(/(?:מעגל|circle)\s+([A-Z]\d*)/);
  const id = named ? `circle-${named[1]}` : `circle-${ring.join('')}`;
  const def: Circle3Def = circleIsContainer ? { kind: 'circum', ring } : { kind: 'incircle', ring };
  // #440: the sentence states TWO objects — the polygon AND its circle — so it must emit both. This rule
  // took the utterance off `planarPolygon` (the ADR-024 leftover guard at its head), which made the
  // POLYGON the newly-dropped half: `משולש ABC חסום במעגל` as an opening move referenced A, B, C that
  // nothing had declared and refused `unknown-point A`. Declaring the ring here is unconditional and
  // context-free — M1 owns existence: a flat polygon whose ids ALL exist is a statement ABOUT those
  // points, an idempotent no-op (apply.ts, #116), which is exactly the operator's pyramid-base case
  // («ABC» already a face) and why this cannot re-declare anything.
  // #586: the RING'S LENGTH names the polygon kind. The old three-noun arity map was an enumeration,
  // not a rule — it forgot every quad noun `POLY_WORDS_HE3` admits, so `מעגל חוסם את ריבוע ABCD` passed
  // the noun gate, emitted the circle ALONE, and refused `unknown-point A` as an opening move: the #440
  // half-drop re-opened on the nouns the map happened to miss. A STATED noun still has to agree with the
  // run it names (`statedQuadBase` is the one quad vocabulary, #305/ADR-3D-090) — a mismatch is a
  // contradiction the student wrote, and refusing is honest where guessing which half to believe is not.
  const statedArity = /משולש|\btriangle\b/i.test(s) ? 3 : statedQuadBase(s) ? 4 : /מחומש|\bpentagon\b/i.test(s) ? 5 : null;
  if (statedArity !== null && statedArity !== ring.length) return null;
  const polyKind = ring.length === 3 ? 'polygon3' : ring.length === 4 ? 'polygon4' : 'polygon5';
  // #424's ONE vocabulary: a qualifier the parser recognises must be one it can lower, on every rule
  // that declares a polygon — `משולש שווה שוקיים ABC חסום במעגל` states the equal pair too.
  const shape: TriSpec = polyKind === 'polygon3' ? statedTriShape(s) : { equal: null, right: false };
  // #587: the quad half — `מעגל חוסם את ריבוע ABCD` states the square too, and `quad-shape` declares
  // the ring itself (its arm 1), exactly as it does on the bare-declaration rule. ADR-3D-149 already
  // made this rule's arity come from the ring, so the quad nouns reach here; they stopped at the
  // honesty gate only because nothing lowered them.
  const lowered = quadShapeCommand(polyKind === 'polygon4' ? statedQuadBase(s) : null, ring);
  const poly: Command3[] = lowered.length
    ? lowered
    : [{ type: 'solid', kind: polyKind, ids: ring }, ...triShapeCommands(shape, ring)];
  return [...poly, { type: 'circle3', id, def }];
};

const planarPolygon: Rule = (s) => {
  if (/מנסרה|פירמידה|\bprism\b|\bpyramid\b/i.test(s)) return null;
  // #442 leftover guard (ADR-024): an INSCRIPTION statement is about the circle of an existing polygon,
  // not a bare polygon declaration — `polygonCircle3` owns it. Without this, `משולש ABC חסום במעגל`
  // re-declares the triangle and silently drops the circle (the exact #440 defect).
  if (/(?:חסומ?|חוסמ?|inscrib\w*|circumscrib\w*)/i.test(s) && /מעגל|\bcircle\b/i.test(s)) return null;
  // #330 leftover guard (ADR-024): a SPECIAL-LINE statement about a derived point/line OF the polygon
  // (a median-meet / bisector / altitude / diagonal-meet) is not a bare polygon declaration — its own
  // rule owns it, and if that rule misses a phrasing this must ESCALATE, never silently drop the derived
  // point by building a bare triangle (the #330 silent-wrong-build class).
  if (/תיכונ|חוצ|גובה|אלכסו[ןנ]|\b(median|centroid|bisect|altitude|diagonal)\b/i.test(s)) return null;
  // #587: the quad nouns are read through `statedQuadBase` — the ONE quad vocabulary — so every noun
  // this rule RECOGNISES is one it can LOWER. Before this the kind test spelled `מרובע` alone, so
  // `ריבוע ABCD` / `ABCD ריבוע` were `not-handled` (an LLM burn on a construct the engine has), while
  // the one form that did parse (`המרובע ABCD הוא ריבוע`) dropped the qualifier and drew an arbitrary
  // quadrilateral — the #424/ADR-3D-084 silent-drop class, quad edition.
  const quadBase = statedQuadBase(s);
  const kind: 'polygon3' | 'polygon4' | 'polygon5' | null =
    /משולש/.test(s) || /\btriangle\b/i.test(s) ? 'polygon3' :
    quadBase || /\bquad\b/i.test(s) ? 'polygon4' :
    /מחומש/.test(s) || /\bpentagon\b/i.test(s) ? 'polygon5' : null;
  if (!kind) return null;
  const n = kind === 'polygon3' ? 3 : kind === 'polygon4' ? 4 : 5;
  const toks = firstLabelRun(s);
  const ids = toks.length === n ? toks : toks.length === 0 ? ['A', 'B', 'C', 'D', 'E'].slice(0, n) : null;
  if (!ids) return null;
  // #424: the stated qualifier lowers to its constraints (the V8-g flat lane was built for FREE-point
  // polygons and never got the macro treatment, so `ABC משולש שווה צלעות` silently drew a scalene
  // triangle — byte-identical to the plain `משולש ABC` — and reported ✓).
  const shape: TriSpec = kind === 'polygon3' ? statedTriShape(s) : { equal: null, right: false };
  // #587: a stated quad noun is lowered by `quad-shape` ALONE — it owns the declaration too (its arm 1),
  // because only apply knows how many corners already exist. Emitting the bare `solid` first would fix
  // the answer to "declare" before that is known, and a ring with ONE new corner (`ריבוע ABCE` over an
  // existing ABC) would refuse `already-defined` instead of completing it.
  const lowered = quadShapeCommand(kind === 'polygon4' ? quadBase : null, ids);
  if (lowered.length) return lowered;
  return [{ type: 'solid', kind, ids }, ...triShapeCommands(shape, ids)];
};

/**
 * V8-g: a triangle altitude — `גובה המשולש לצלע AB הוא CD` / `CD גובה לצלע AB` /
 * `CD is the altitude to AB`. D = foot of the ⟂ from the apex (CD's first letter) onto side AB.
 */
const altitudeFoot: Rule = (s) => {
  if (!/גובה|altitude/i.test(s)) return null;
  if (/פירמידה|\bpyramid\b|פאה|\bface\b/i.test(s)) return null; // the 3-D height rule owns those
  const L = String.raw`([A-Z]\d*'?)`;
  const SIDE = String.raw`(?:ל|אל\s+)?(?:ה?צלע\s+)?`;
  // the altitude-foot command creates the foot AND draws the segment — never emit a segment3
  // first (it would reference the not-yet-created foot). apex = the altitude's first letter.
  // #330 vertex form (mirrors medianFoot): `CD גובה במשולש ABC` — the opposite side is inferred from the
  // named triangle (apex = CD's first letter, the foot drops onto the other two vertices). BEFORE the
  // explicit-side forms so `במשולש ABC` is read as the triangle, never as a `ל<side>` fragment.
  let m =
    s.match(new RegExp(`^${L}${L}\\s+(?:הוא\\s+|היא\\s+)?ה?גובה\\s+(?:ב|ל?)?(?:ה?משולש\\s+)${L}${L}${L}\\s*$`)) ??
    s.match(new RegExp(`^${L}${L}\\s+is\\s+(?:the\\s+)?altitude\\s+(?:in|of)\\s+(?:triangle\\s+)?${L}${L}${L}\\s*$`, 'i'));
  if (m) {
    const [, from, foot, a, b, c] = m;
    const tri = [a, b, c];
    if (!tri.includes(from) || new Set(tri).size !== 3) return null;
    const opp = tri.filter((x) => x !== from);
    return [{ type: 'altitude-foot', id: foot, from, a: opp[0], b: opp[1] }];
  }
  m = s.match(new RegExp(`גובה\\s+(?:ה?משולש\\s+)?${SIDE}${L}${L}\\s+(?:הוא|היא)\\s+${L}${L}`)); // ...לצלע AB הוא CD
  if (m) return [{ type: 'altitude-foot', id: m[4], from: m[3], a: m[1], b: m[2] }];
  // #8 (2012-קיץ-ב): «SM הגובה לצלע BC במשולש SBC» — the DEFINITE article on the noun, and the naming
  // triangle stated AFTER the side. Ordinary book phrasing on a construct that already exists; the
  // in-face altitude needed no new geometry once the dihedral vocabulary (#524) let the face be named.
  m = s.match(new RegExp(`${L}${L}\\s+(?:הוא\\s+|היא\\s+)?ה?גובה\\s+(?:ה?משולש\\s+)?${SIDE}${L}${L}(?:\\s+ב?ה?משולש\\s+${L}${L}${L})?\\s*$`)); // CD גובה לצלע AB
  if (m) return [{ type: 'altitude-foot', id: m[2], from: m[1], a: m[3], b: m[4] }];
  m = s.match(new RegExp(`${L}${L}\\s+is\\s+the\\s+altitude\\s+(?:to|onto)\\s+(?:side\\s+)?${L}${L}`, 'i')); // CD is the altitude to AB
  if (m) return [{ type: 'altitude-foot', id: m[2], from: m[1], a: m[3], b: m[4] }];
  m = s.match(new RegExp(`the\\s+altitude\\s+(?:to|onto)\\s+(?:side\\s+)?${L}${L}\\s+is\\s+${L}${L}`, 'i')); // the altitude to AB is CD
  if (m) return [{ type: 'altitude-foot', id: m[4], from: m[3], a: m[1], b: m[2] }];
  return null;
};

/**
 * triage 3-D: a triangle MEDIAN — `CD תיכון במשולש ABC` / `CD is the median in triangle ABC`
 * / `CD תיכון לצלע AB`. The foot (CD's 2nd letter) = the MIDPOINT of the opposite side (the
 * triangle's other two vertices, or the stated side). No new engine construct — a midpoint + segment.
 */
const medianFoot: Rule = (s) => {
  if (!/תיכון|\bmedian\b/i.test(s)) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  // vertex form: infer the opposite side from the named triangle
  let m =
    s.match(new RegExp(`^${L}${L}\\s+(?:הוא\\s+|היא\\s+)?תיכון\\s+(?:ב|ל?)?(?:ה?משולש\\s+)${L}${L}${L}`)) ??
    s.match(new RegExp(`^${L}${L}\\s+is\\s+(?:the\\s+)?median\\s+(?:in|of)\\s+(?:triangle\\s+)?${L}${L}${L}`, 'i'));
  if (m) {
    const [, from, foot, a, b, c] = m;
    const tri = [a, b, c];
    if (!tri.includes(from) || new Set(tri).size !== 3) return null;
    const opp = tri.filter((x) => x !== from);
    return [{ type: 'point-on-segment3', id: foot, a: opp[0], b: opp[1], t: 0.5 }, { type: 'segment3', a: from, b: foot }];
  }
  // explicit-side form: `CD תיכון לצלע AB`
  m =
    s.match(new RegExp(`^${L}${L}\\s+(?:הוא\\s+|היא\\s+)?תיכון\\s+(?:ל|אל\\s+)(?:ה?צלע\\s+)?${L}${L}`)) ??
    s.match(new RegExp(`^${L}${L}\\s+is\\s+(?:the\\s+)?median\\s+to\\s+(?:side\\s+)?${L}${L}`, 'i'));
  if (m) {
    const [, from, foot, a, b] = m;
    return [{ type: 'point-on-segment3', id: foot, a, b, t: 0.5 }, { type: 'segment3', a: from, b: foot }];
  }
  return null;
};

/** triage 3-D: `DE גובה בטטראדר` / `DE גובה בארבעון` / `DE altitude in the tetrahedron` — the
 *  altitude from vertex `from` to the opposite face of THE tetra (face resolved at apply). */
const tetraAltitude: Rule = (s) => {
  if (!/גובה|altitude/i.test(s)) return null;
  const L = String.raw`([A-Z]\d*'?)`;
  const m =
    s.match(new RegExp(`^${L}${L}\\s+(?:הוא\\s+|היא\\s+)?גובה\\s+(?:ב|של\\s+ה?)(?:טטר[אה]?ה?דר(?:ון)?|ארבעון)`)) ??
    s.match(new RegExp(`^${L}${L}\\s+is\\s+(?:the\\s+)?(?:altitude|height)\\s+(?:in|of)\\s+(?:the\\s+)?tetrahedr(?:on)?`, 'i'));
  return m ? [{ type: 'tetra-altitude', id: m[2], from: m[1] }] : null;
};

/** Exported ONLY for the shadow-matrix ordering guard (`__tests__/shadow-matrix3.test.ts` — the 2-D
 *  A1/PAR-11 pattern copied per docs/20 §12): the guard runs EVERY rule against the catalog corpus (not
 *  stopping at the first match) and hard-gates the divergent winner/later-claimer pairs against a
 *  reviewed allowlist. Zero runtime cost — production code must keep calling `parse3`. */
/**
 * S3 (#378, ADR-3D-105): a DIRECTION relation with a PLANE on at least one side —
 * «המישור ABC מקביל למישור A'B'C'», «π1 ניצב ל-π2», «AB מקביל למישור π»,
 * «הזווית בין המישור ABC לבין המישור ABD היא 60», «המישורים מתלכדים».
 *
 * Ownership (first-match-wins): every rule with a FROZEN lowering runs earlier and keeps its cell —
 * `linePerpPlane` (ℓ⟂π), `planeLinePerp` (point-run ⟂ ℓ), `angleBetweenPlanes` (π×π angle, the
 * param-root 2022-Q2 form) and `segPlaneRel` (segment × point-run, either order). What
 * reaches here is exactly the matrix's unfilled plane cells, so the rule DEFERS unless a plane is
 * present and no earlier owner applies.
 */
const planeRelGiven: Rule = (s0) => {
  const s = stripStatementPrefix(s0).trim();
  // #614: `reversed` marks the CONTAINER-headed frame («המישור P מכיל את ℓ»), whose sides arrive the
  // other way round. Both frames reach ONE command, so the panel row and the typed sentence agree.
  const forms: [PlaneRel3, RegExp, boolean?][] = [
    ['perp', PERP_SPLIT],
    ['parallel', PAR_SPLIT],
    ['coincident', /\s*(?:מתלכד(?:ים|ות)?\s*(?:עם\s*)?|coincides?\s+with|are\s+coincident\s+with|is\s+coincident\s+with)\s*-?\s*/],
    ['contained', CONTAINED_SPLIT],
    ['contained', CONTAINS_SPLIT, true],
  ];
  for (const [rel, splitter, reversed] of forms) {
    const parts = s.split(splitter);
    if (parts.length !== 2) continue;
    const sides = readRelationSides(reversed ? parts[1] : parts[0], reversed ? parts[0] : parts[1]);
    if (!sides) continue;
    const [a, b] = sides;
    if (!isPlanar(a.op) && !isPlanar(b.op)) continue; // no plane: not this rule's business
    if (a.op.kind === 'line' || b.op.kind === 'line') continue; // a named line's cells are S2's
    // #512 — a COORDINATE-FRAME side. Relating a gauge object to the absolute frame requires the
    // FIGURE to move, which is the pivot's lane and not a similarity-invariant pin's (#386). Lowering
    // it to `plane-rel` would record a claim nothing drives, so a perfectly satisfiable «BD' ⊥ [xy]»
    // would come back `claim-refuted` — the false accusation ADR-3D-138 exists to kill, re-created by
    // a new operand. So: the point-run cell lowers to the #324 `coord-plane-rel` command, which DRIVES
    // and is the one spelling authority for this relation; every other gauge pairing DEFERS (escalates)
    // rather than committing a claim that can be wrongly refuted. The missing drives are filed, not
    // faked (#537).
    const frame = a.op.kind === 'plane-coord' ? a.op : b.op.kind === 'plane-coord' ? b.op : null;
    if (frame) {
      const other = (a.op === frame ? b : a).op;
      // the POINT-RUN cell already HAS a driving command — reuse it rather than record a second
      // spelling of the same relation (the issue's "one spelling authority"). Every other pairing
      // stays a claim, kept honest by the store's placement guard rather than by a parse-time refusal.
      // #614: CONTAINMENT against the coordinate frame is `coordPlaneRel`'s cell — it has its own
      // `contains` mode (#324). Falling into the line below would have mapped it to `share`, a
      // DIFFERENT relation wearing the same utterance: the shadow-matrix gate caught exactly that.
      if (rel === 'contained') return null;
      if (other.kind === 'plane-run' && rel !== 'coincident') {
        const axis = frame.axes === 'xy' ? 'z' : frame.axes === 'yz' ? 'x' : 'y';
        return [{ type: 'coord-plane-rel', ids: other.ids, axis, mode: rel === 'perp' ? 'perp' : 'share' }];
      }
    }
    if (a.op.kind === 'axis' || b.op.kind === 'axis') return null; // the axis cells have no drive yet
    if (a.op.kind === 'point' || b.op.kind === 'point') return null; // a point has no direction
    if (sameOperand(a.op, b.op)) return null;
    // the frozen segment × POINT-RUN owners keep their cells (they run earlier; defensive)
    if (rel !== 'coincident' && rel !== 'contained' && (a.op.kind === 'segment' || b.op.kind === 'segment')) {
      const other = a.op.kind === 'segment' ? b.op : a.op;
      if (other.kind === 'plane-run') continue;
    }
    // #614: containment has no frozen owner and no direction-only reading — it needs a LINEAR side and
    // a PLANAR one, in either order, and refuses anything else rather than inventing a meaning.
    if (rel === 'contained') {
      // the CONTAINER must be planar; the contained side may be linear (a segment) or planar (a
      // polygon run — #532 capability 2, «משולש ACS מונח על מישור π2»). Two linear sides state nothing.
      if (!isPlanar(b.op)) continue;
    }
    if (rel === 'coincident' && (!isPlanar(a.op) || !isPlanar(b.op))) continue; // only planes coincide here
    const canon = (op: Operand3): Operand3 => (op.kind === 'plane-named' ? { kind: 'plane-named', name: canonicalPlane(op.name) } : op);
    return [{ type: 'plane-rel', rel, a: canon(a.op), b: canon(b.op) }];
  }
  return null;
};

/** S3 (#378): a stated ANGLE VALUE with a PLANE on at least one side that `linePlaneAngle` (segment ×
 *  point-run) and `angleBetweenPlanes` (named π × π) do not already own. */
const planeRelAngle: Rule = (s) => {
  const m =
    s.match(new RegExp(`^ה?זו?וית\\s+(?:ש)?בין\\s+(.+?)\\s+(?:[לו]בין\\s+|ו-?\\s*|ל-?\\s*)(.+?)\\s*(?:היא|הוא|=|שווה\\s+ל?-?)\\s*(${ANGLE_VAL})\\s*°?$`)) ??
    s.match(new RegExp(`^(?:the\\s+)?angle\\s+between\\s+(.+?)\\s+and\\s+(.+?)\\s*(?:is|=)\\s*(${ANGLE_VAL})\\s*°?$`, 'i'));
  if (!m) return null;
  const sides = readRelationSides(m[1], m[2]);
  if (!sides) return null;
  const [a, b] = sides;
  if (!isPlanar(a.op) && !isPlanar(b.op)) return null;
  if (a.op.kind === 'line' || b.op.kind === 'line') return null; // S2's cells
  // #512: an ANGLE to the coordinate frame has no `coord-plane-rel` mode to drive it, so it stays a
  // CLAIM — and the store's placement guard is what keeps an unfixed figure from refuting it (#537).
  if ([a.op, b.op].some((op) => op.kind === 'axis')) return null; // the axis cells have no home yet
  if (a.op.kind === 'point' || b.op.kind === 'point') return null;
  if (sameOperand(a.op, b.op)) return null;
  // `linePlaneAngle` owns SEGMENT × point-run (its `line-plane-angle` lowering is frozen). Deferring
  // here rather than relying on rule order keeps the two from being a divergent shadow pair at all.
  if ((a.op.kind === 'segment' && b.op.kind === 'plane-run') || (b.op.kind === 'segment' && a.op.kind === 'plane-run')) return null;
  // …and by the same discipline, `angleBetweenPlanes` owns NAMED π × NAMED π with a NUMERIC value: its
  // `plane-angle` lowering is the one the parameter root-find and branch choice ride on. Teaching the
  // operand seam the plural noun (#522) made this rule able to claim «הזווית בין המישורים π1 ו-π2 היא
  // 45» for the first time, and the shadow-matrix HARD gate caught the pair immediately — the winner
  // was unchanged, but two rules that read one sentence differently is a trap waiting on rule order.
  // The LABELLED form is NOT that cell (`angleBetweenPlanes` reads numbers only), so it stays here.
  if (a.op.kind === 'plane-named' && b.op.kind === 'plane-named' && !ANGLE_LABEL_RE.test(m[3])) return null;
  const canon = (op: Operand3): Operand3 => (op.kind === 'plane-named' ? { kind: 'plane-named', name: canonicalPlane(op.name) } : op);
  // #523: a Greek NAME states which measure the question is about, not a value — mark, never drive
  if (ANGLE_LABEL_RE.test(m[3])) return [{ type: 'plane-rel', rel: 'angle', label: m[3], a: canon(a.op), b: canon(b.op) }];
  return [{ type: 'plane-rel', rel: 'angle', deg: +m[3], a: canon(a.op), b: canon(b.op) }];
};


/**
 * S5 (#378, ADR-3D-106): a stated DISTANCE between two operands — «המרחק בין A למישור ABC הוא 6»,
 * «המרחק בין הישר l1 לישר l2 שווה 4», «the distance between A and plane ABC is 6».
 *
 * The curriculum's four cases (point–plane, point–line, skew lines, parallel planes) are all the one
 * command; which formula applies is the geometry's business, not the grammar's. A distance carries
 * UNITS, so unlike every other relation here it pins the figure's scale.
 */
const distanceGiven: Rule = (s) => {
  // #529 ([ADR-3D-145](../../docs/06b-decisions-3d.md)): the SUBJECT framing comes in two spellings —
  // «המרחק בין X ל-Y» AND «המרחק מ X ל-Y» — and only the first was read, so the second (at least as
  // natural, and the one matching the imperative forms «אנך יורד מ-M ל…», «גובה מ A ל…») burned a paid
  // LLM call per use. The #494 clitic fold glues «מ A» to «מA» before rules run, so the branch reads
  // both the glued and the dashed spellings; the En side already had from/to. (The sibling measure
  // rules were checked once per the plan: the angle family's «בין» is not stated «מ…ל» in natural
  // Hebrew — no change there.)
  const m =
    s.match(new RegExp(`^ה?מרחק\\s+(?:(?:ש)?בין\\s+|מ-?\\s*(?:ה?נקודה\\s+)?)(.+?)\\s+(?:[לו]בין\\s+|ל-?\\s*|ו-?\\s*)(.+?)\\s*(?:הוא|היא|=|שווה\\s+ל?-?)\\s*(${NUM})\\s*$`)) ??
    s.match(new RegExp(`^(?:the\\s+)?distance\\s+(?:from|between)\\s+(.+?)\\s+(?:and|to)\\s+(.+?)\\s*(?:is|=)\\s*(${NUM})\\s*$`, 'i'));
  if (!m) return null;
  const a = readOperand(m[1]);
  const b = readOperand(m[2]);
  if (!a || !b) return null;
  if (sameOperand(a.op, b.op)) return null;
  // a point-to-point distance is the MAGNITUDE family's (`|AB| = 5`) — never double-owned here
  if (a.op.kind === 'point' && b.op.kind === 'point') return null;
  const canon = (op: Operand3): Operand3 =>
    op.kind === 'plane-named' ? { kind: 'plane-named', name: canonicalPlane(op.name) }
    : op.kind === 'line' ? { kind: 'line', name: canonLineName(op.name) }
    : op;
  return [{ type: 'distance-rel', a: canon(a.op), b: canon(b.op), value: +m[3] }];
};


export const RULES: Rule[] = [
  // #836: FIRST, and it never claims a line — it only RECORDS that «אלכסון ראשי» was used as a definite
  // reference, so parse3 can refuse with a clarify instead of letting the line reach the LLM. Declining
  // always means a later rule may still own the utterance legitimately.
  mainDiagonalRef,
  // #324: FIRST — gated by the lowercase-coordinate object so it can never steal, while the
  // polygon rules WOULD steal its polygon-noun subjects (building the shape, dropping the clause)
  coordPlaneRel,
  gated(cubeOrBox, SPACE_DIAGONAL_RE), // #498: the fail-closed declaration gate, applied at the ONE seam
  gated(rhombusPrism),
  gated(rightPrism),
  makeRightPrism, // #289 (M1): `המנסרה ישרה` — make THE existing solid a right prism
  gated(obliquePrism), // #349: a prism NOT stated right — מקבילון (#117) + every base noun rightPrism dispatches
  volumeEqPoly, // BEFORE volumePolyClaim: its RHS is a volume, not a number
  volumePolyClaim, // BEFORE rightPyramid: נפח הפירמידה ABCD must never build a pyramid
  rightPyramidPoint, // V8-j: `T על SC כך ש-TABCD פירמידה ישרה` — before rightPyramid (which would build a solid)
  gated(rightPyramid),
  dotEqGiven, // `u·v = v·w` (a dot RHS) — before dotGiven, which only matches a numeric RHS
  dotGiven,
  cosAngleGiven, // V8-f (G6): cos∠ACB / cos(u,v) — before the plane-angle & vertex-angle rules
  equalAnglesGiven, // V8-f (G10): AE makes equal angles with AB, AD
  revolutionSolid,
  volumeClaim,
  lateralAreaClaim,
  parametricLine, // before planeByEquation: both carry `:`, but ℓ ≠ π so either order is safe — kept explicit
  planeByEquation,
  freePlaneDecl, // #487: AFTER planeByEquation — a name followed by an equation is never stolen (this rule demands END after the name)
  freeLineDecl, // #552: the line twin — after parametricLine for the same reason (demands END after the name)
  planeEqClaim, // plane named by POINTS + an equation — a claim, not a definition
  relPlaneRule, // `מישור π דרך F וניצב ל-SC` — before planeThroughBare (which is bare points)
  // #755 (ADR-3D-164): ONE rule owns the whole line∩plane crossing cell — both operands read
  // through `readOperand`, so every {named line, segment} × {π-name, point run} × {verb, noun} ×
  // {he, en} × {either order} square is reachable. It replaces `planeCut`, `lineCutsPlane` and
  // `segLineCutsPointPlane`, and keeps their slot: before onSegment/coordPoint grab the tokens.
  crossingPoint,
  planeThroughBare, // bare `מישור ABC` — after the `:`-carrying plane rules
  injectionList,
  signGiven,
  // #333 (ADR-3D-153): ONE intersection-line rule, at the slot its point-run half used to hold —
  // its head is specific (`ישר/קו החיתוך`), so it can claim nothing else. `crossingPoint` (above)
  // declines a plane×plane pair by KIND, so the old ordering hazard against it is structural now.
  intersectionLine,
  coordPoint,
  paramSign, // ADR-3D-032: `k הוא פרמטר חיובי` — before generic rules can misread the letter
  vectorInjection,
  onAxes, // `על ציר ה-x` before the generic membership/on-segment rules
  membership, // before onSegment: `על אחד המישורים` must never read as a point-on-segment
  onCircle3, // V8-i: `A על המעגל` — before onSegment/membership
  pointRelPlane, // on/above/below a point-run plane (+ above/below π) — likewise before onSegment
  onLineMembership, // likewise for `על הישר ℓ`
  linePlaneAngle, // `הזווית בין הישר AC' לבין המישור ABCD היא 30` — before angleBetweenPlanes/angleSegClaim
  angleBetweenPlanes,
  lineRelAngle, // S2 (#378): an angle value with a NAMED-LINE side — after the frozen segment×plane-run and π×π owners
  angleSegClaim,
  vertexAngleClaim,
  angleBound3, // `∠SAB > 60` / `60 < α < 90` — a stated numeric BOUND (ADR-3D-053, #273); before the equality/marker rules
  angleEquality3, // `∠SAB = ∠SAD` — a general angle EQUALITY (ADR-3D-052, #271); BEFORE angleMarker, which would claim the left angle and drop the right
  angleMarker, // `∠SDB` / `∠SDB = α` — a named-angle marker (no driver); after vertexAngleClaim (numeric = claim), #94
  mutualPositionClaim,
  rectComplete,
  linePerpPlane,
  planeLinePerp, // #375: after linePerpPlane (named plane) — this one takes the POINT-RUN plane
  neverParallelClaim,
  dropPerpToPlane,
  commonPerp, // V8-h: common perpendicular of two lines — before the ⟂-to-a-line rules; tight two-line-target regex
  lineProjection, // V8-h: `היטל הישר TB על המישור ABCD`
  circleTangentLine, // V8-i: `מעגל O משיק לישר AB בנקודה B`
  dropPerpToLine,
  lineRelGiven, // S2 (#378): ∥/⟂ with a NAMED-LINE side — after the line⟂π / plane-run⟂line / common-perp owners
  distanceGiven, // S5 (#378): a stated distance between two operands
  planeRelAngle, // S3 (#378): an angle value with a PLANE side — after linePlaneAngle/angleBetweenPlanes
  planeRelGiven, // S3 (#378): ∥/⟂/coincident with a PLANE side — after every frozen plane owner
  nameVectors,
  centroidRule,
  diagIntersection, // `מפגש האלכסונים` — before onSegment/midpoint grab the tokens
  quadDiagonals, // #834 `אלכסוני הבסיס` — AFTER diagIntersection, which owns the naming form
  bisectorPoint, // V8-f (G11): `D על AC כך ש-OD חוצה זווית AOC` — before onSegment grabs `D על AC`
  bisectorRay, // #343: the carrier-LESS twin `OD חוצה זווית AOC` — after it, so the longer form wins
  segPlaneRel, // #819: segment × plane-run, ⟂ and ∥, either order, either notation
  perpSegGiven, // issue #14: `SM ⊥ DB` / `u ⊥ v` — after segPlaneRel (3–4-point targets are planes)
  collinearClaim,
  midpoint,
  spanPoint, // MUST precede onSegment: Greek scalars would otherwise parse as a free point, silently dropping the condition
  onSegment,
  lengthRel, // BEFORE vecEqClaim: bare AS = AB is a LENGTH equality unless ⃗-marked
  magEquality, // #393/#335: chained/expression magnitudes — AFTER lengthRel (its forms keep their owner)
  symbolValue,
  vecEqClaim,
  coordsClaim,
  pairInjection,
  lengthRatioClaim,
  areaClaim,
  lengthClaim,
  tetraAltitude, // `DE גובה בטטראדר` — before altitudeFoot/heightOfSolid (more specific)
  medianFoot, // `CD תיכון במשולש ABC`
  altitudeFoot, // V8-g: `גובה ... לצלע AB הוא CD` — before heightOfSolid (which owns 3-D heights)
  heightOfSolid,
  drawArrow, // #72: an unnamed ink arrow — before bareSegment (the noun must not read as a label)
  perpToBase, // #72: the base-directed ⟂ from a point (auto-minted foot)
  polygonCircle3, // #442: a circle inscribed in / circumscribed about a polygon — BEFORE the polygon rules
  gated(rightTriangle), // #116: `משולש … ישר זווית` — BEFORE planarPolygon (which would swallow bare `משולש`)
  gated(planarPolygon), // V8-g: bare `משולש/מרובע/מחומש` — after the שטח/מפגש/prism/pyramid consumers of those nouns
  bareSegment,
];

// ---------------------------------------------------------------------------

/** Set the per-parse VECTOR-marked flag from the RAW utterance (an explicit arrow ⃗/→ or the vector
 *  word — both stripped by `normalize3` — mark bare pair=pair as a VECTOR equation; without them
 *  `AS = AB` reads as a LENGTH equality, the bagrut default). Extracted from `parse3` and exported
 *  ONLY so the shadow-matrix guard can run rules under the exact pre-state `parse3` gives them. */
export function markVectorContext(utterance: string): void {
  VEC_MARKED = /[→⃗⟶]/.test(utterance) || /(?:^|[\s:,])(?:ה?ו?וקטור|vectors?)\s/i.test(utterance);
}


/**
 * #837 — DECLARATIVE NOUN PREFIXES, normalised ONCE at the seam.
 *
 * Prod sessions `fwynr5ws` + `8p8o74z2` (log-triage 2026-08-30, 1 user, 6 refusals across two sessions):
 *
 * ```
 * AA'=(k-1, k-7, k+1)                            ✓ inject-pair
 * ישר AA'=(k-1,k-7, k+1)                         ✗ not-handled
 * משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)    ✓ line3, on-line, on-line
 * AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)            ✗ not-handled
 * ישר AC x=(8,-1,-1)+t(k+1,0,k-3)                ✓ line3, on-line, on-line   (#815)
 * ```
 *
 * Session `8p8o74z2` shows the cost: five consecutive refusals, then the student **solved for `k` by
 * hand** and typed `t(3,0,-1)` to get past the tool — ending with a figure that no longer carries the
 * symbolic parameter their exercise is about.
 *
 * These are ordinary textbook noun phrases naming exactly the statement the bare form makes; the prefix
 * carries no extra given. Note `ישר AC x=…` DOES parse while `ישר AA'=…` does not — the tolerance was
 * added at a RULE (#815), so it covers whichever lane happened to be fixed. That asymmetry is the
 * defect's signature, and it is why this is a seam and not a sixth rule: a rewrite table applied to the
 * whole utterance cannot cover one lane and miss another.
 *
 * Applied ONLY after every rule has declined, so no currently-working form can change: a rewrite that
 * fires on a sentence nothing parsed is either an improvement or still `not-handled`.
 *
 * Explicitly NOT #778 (ADR-W-030). That governs IMPERATIVE wrappers — «הוסף», «שרטט», «סמן» — whose
 * ruling is *state the given, don't command the tool*, i.e. teach them away. There is no verb here and
 * nothing is being commanded; «ישר AA' = (k-1, k-7, k+1)» is how the statement appears in a textbook,
 * arguably more canonical than the bare form. So the right answer is to PARSE it, not to teach it away.
 *
 * `וקטור` is deliberately absent from the strip list: it is not decoration. «וקטור AB = …» is a
 * different statement from «|AB| = …», and the ambiguous-vector-length guard exists to keep them apart.
 */
const PAIR_TOK = String.raw`[A-Z]\d*'?`;
const NOUN_PREFIX_REWRITES: { when: RegExp; to: (m: RegExpMatchArray) => string }[] = [
  // «ישר AA'=(…)» / «הקטע AB = (…)» — the object noun agrees with what the pair already is, so it can be
  // normalised away. Covers the injection lane that #815's rule-level tolerance never reached.
  {
    when: new RegExp(String.raw`^ה?(?:ישר|קטע)\s+((?:${PAIR_TOK}){2}\s*=.*)$`),
    to: (m) => m[1],
  },
  // «AC על הישר x=…» — a MEMBERSHIP phrasing of the fact «משוואת הישר AC היא x=…» already lowers
  // (line3 + on-line + on-line). Routed to that lowering rather than duplicated.
  {
    when: new RegExp(String.raw`^((?:${PAIR_TOK}){2})\s+על\s+ה?ישר\s+(.+)$`),
    to: (m) => `משוואת הישר ${m[1]} היא ${m[2]}`,
  },
];

/** Guards the single re-parse below against any possibility of recursion. */
let REWRITING = false;

export function parse3(utterance: string): ParseResult3 {
  markVectorContext(utterance);
  PARAM_CONFLATED = null;
  MAIN_DIAGONAL_AMBIGUOUS = false;
  const s = normalize3(utterance);
  if (!s) return NOT_HANDLED;
  if (!VEC_MARKED && /^([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*([A-Z]\d*'?)([A-Z]\d*'?)\s*$/.test(s))
    return { ok: false, reason: 'ambiguous-vector-length' };
  for (const rule of RULES) {
    const commands = rule(s);
    if (commands) return { ok: true, commands };
  }
  // #516: no rule matched, but a rule RECOGNIZED an ambiguity — that is a refusal with a
  // clarification, never `not-handled` (which escalates to the LLM lane, whose job is to guess).
  if (PARAM_CONFLATED) return { ok: false, reason: 'param-roles-conflated', letter: PARAM_CONFLATED };
  // #836: «אלכסון ראשי» names none of a solid's four space diagonals — ask which, never pick one. A
  // RECOGNISED ambiguity is reported, never rewritten around, so it is checked before the #837 seam.
  if (MAIN_DIAGONAL_AMBIGUOUS) return { ok: false, reason: 'ambiguous-main-diagonal' };
  // #837: LAST — a declarative noun prefix is normalised away and the line is re-read ONCE. Reaching
  // here means every rule declined, so this can only turn a refusal into a parse, never alter one.
  if (!REWRITING) {
    for (const { when, to } of NOUN_PREFIX_REWRITES) {
      const m = s.match(when);
      if (!m) continue;
      const rewritten = to(m);
      if (rewritten === s) continue;
      REWRITING = true;
      try {
        const r = parse3(rewritten);
        if (r.ok) return r;
      } finally {
        REWRITING = false;
      }
    }
  }
  return NOT_HANDLED;
}

/**
 * «שנה שם E ל-O» / "rename E to O" — a RENAME request (#578, ADR-3D-211).
 *
 * Not a construction command: it rewrites the fact list's history rather than adding to it, so it
 * returns its own shape and never reaches `parse3`'s command lane. The grammar mirrors 2-D's
 * `parseRename` verbatim (the two products should answer to the same sentence) with this product's
 * label token — the PRIME — added: on a cube «שנה שם A' ל-M» must name the top vertex, not the base one.
 *
 * Normalised through {@link normalize3} first, exactly like every parse path: this runs BEFORE `parse3`
 * on the raw text, so a pasted maqaf («שנה שם E ל־O») or an invisible bidi control would otherwise break
 * the connector group — the #531 lesson, which cost two prod refusals the day it was found.
 */
export function parseRename3(raw: string): { from: string; to: string } | null {
  const s = normalize3(raw);
  const L = String.raw`([A-Za-z]\d*'?)`;
  const m =
    s.match(new RegExp(String.raw`(?:rename|relabel|replace)\s+${L}(?:\s+(?:to|as|into|with|by|->|→|=))?\s+${L}(?![A-Za-z0-9'])`, 'i')) ??
    s.match(new RegExp(String.raw`(?:שנה|החלף)\s*(?:שם\s*)?(?:את\s*)?${L}\s*(?:ל-?|ב-?|עם|→|=)?\s*${L}(?![A-Za-z0-9'])`, 'i'));
  if (!m) return null;
  const from = m[1].toUpperCase();
  const to = m[2].toUpperCase();
  return from === to ? null : { from, to };
}
