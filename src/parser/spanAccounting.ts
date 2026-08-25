/**
 * SPAN ACCOUNTING — ENFORCING (S3.1 of docs/24; the mechanism ADR-250 named and deferred).
 *
 * The docs/23 review's G1 finding: the honesty-gate family (~16 `dropped*` gates, one per syntactic
 * category — labels → numbers → words → verbs → relations → compounds → comparisons → subjects…)
 * grows monotonically because each gate validates ONE category's token presence, and every newly
 * discovered category of stated content needs a fresh gate (two P1s in the record's final week).
 * The TOTAL mechanism: every significant token span of the utterance must be ACCOUNTED for by the
 * winning parse, or the parse is weak — one function, no category enumeration.
 *
 * ENFORCING ON HARD SPANS since 2026-08-19 (the operator's flip, #659 step 3 / docs/24 §4.2 —
 * ADR-453). `accountUtterance` classifies the utterance's tokens and reports which significant ones
 * the committed commands do not account for. A LABEL / NUMBER / RELATION left unaccounted now makes
 * the parse weak, exactly as a `dropped*` gate does — that is `unaccountedSpans`, the enforcing
 * verdict, wired at both submit seams (grammar and the ADR-240 LLM second attempt).
 *
 * `unknown-word` spans stay a REPORT bucket and never refuse: the flip evidence showed the
 * accountant's vocabulary is complete on the corpus but not off it (it flags «מבחוץ» on a sentence
 * whose kind IS carried, in `circles-tangent.external`), so enforcing on words would false-refuse
 * working input. Growing that bucket into an enforcing one needs the vocabulary work #757 scopes.
 *
 * IT JOINS THE GATE FAMILY, IT HAS NOT REPLACED IT — deliberately, and against the flip's own first
 * instinct ("if it merely joins them, 2-D carries both mechanisms forever"). The flip session measured
 * what replacement would cost and the answer was: not yet. The gates' exemption sets are ~10 ADRs of
 * accumulated knowledge, and "clean in shadow" never tested any of it, because shadow mode reports
 * what the accountant WOULD flag and nothing ever compared that against what the gates DO flag.
 * Measured hole: `accountUtterance` decides relation symbols with ONE global `hasConstraint` flag, so
 * the whole ADR-264 class — a relation between points that ALL already exist («CE⊥AB» on a figure
 * that has A, B, C, E) — is invisible to it while `droppedGivenRelations` names it exactly.
 *
 * `span-gate-differential.test.ts` is that comparison, and it is the retirement criterion: a gate may
 * be deleted when its column there is empty. Retirement is tracked by #758, one gate per PR.
 *
 * `span-shadow-report` (env-gated) still sweeps the catalog + scenario corpus into
 * reports/span-accounting-shadow.md — now a FALSE-REFUSAL net rather than a divergence review.
 *
 * Honest boundary: true span accounting needs per-RULE claimed-extent reporting; this accountant
 * approximates at TOKEN level (labels / numbers / relation symbols / keyword-vs-unknown words),
 * which already generalizes every existing gate's signal. An `unknown` word is reported as its own
 * bucket, never silently treated as filler.
 */
import type { AnyCommand } from '@/engine';
import { normalizeUtterance } from './parse';

export interface UnaccountedSpan {
  kind: 'label' | 'number' | 'relation' | 'unknown-word';
  text: string;
}

/** Words that carry no geometric content — safe to leave unclaimed. Deliberately conservative:
 *  a word NOT here and NOT a known keyword lands in `unknown-word`, which is a REPORT bucket,
 *  never a silent pass. */
const FILLER = new Set([
  // Hebrew connectives/articles/prepositions/copulas
  'של', 'את', 'עם', 'על', 'אל', 'מן', 'בין', 'לבין', 'הוא', 'היא', 'הם', 'הן', 'זה', 'זו', 'זהו',
  'כך', 'ש', 'כי', 'גם', 'או', 'אז', 'יש', 'אשר', 'כאשר', 'שבו', 'שבה', 'בו', 'בה', 'לה', 'לו',
  'נתון', 'נתונים', 'נתונה', 'נסמן', 'יהי', 'תהי', 'בבקשה', 'עוד', 'אחר', 'אחרת', 'כל', 'שני', 'שתי',
  'זר', 'זרה', 'אחד', 'אחת', 'so', 'that', 'the', 'a', 'an', 'of', 'and', 'is', 'are', 'to', 'in',
  'on', 'at', 'with', 'given', 'let', 'we', 'denote', 'such', 'it', 'its', 'be', 'by', 'from',
  // #659 — the maqaf PARTICLES. «ו-», «מ-», «ל-», «ב-», «כ-» are the bound prepositions written with a
  // hyphen («מ-A», «ל-AB»); peeling leaves nothing, so they must be filler in their own right.
  'ו-', 'מ-', 'ל-', 'ב-', 'כ-', 'עליו',
  // #659 — quantifiers, relatives and unit words: they carry no geometric content, the number does
  'two', 'both', 'each', 'as', 'where', 'whose', 'different', 'degrees', 'shared',
  'שונים', 'שונות', 'בעלי', 'בעלת',
]);

/** Keyword STEMS (prefix-match after stripping ה/ב/ל/ו/ש/מ/כ prefixes) — the construct vocabulary.
 *  Compact by design: stems, not full alternations; a stem match accounts the word. */
const KEYWORD_STEMS = [
  // shapes & objects
  'משולש', 'ריבוע', 'מלבן', 'מעוין', 'מעויין', 'טרפז', 'מקבילית', 'דלתון', 'מרובע', 'מחומש', 'משושה',
  'מעגל', 'עיגול', 'קטע', 'ישר', 'צלע', 'קודקוד', 'נקוד', 'אלכסון', 'מיתר', 'קוטר', 'רדיוס', 'קשת',
  'זוית', 'זווית', 'שטח', 'היקף', 'גובה', 'תיכון', 'אנך', 'חוצה', 'אמצע', 'המשך', 'מרכז', 'משיק',
  'triangle', 'square', 'rectangle', 'rhombus', 'trapezoid', 'parallelogram', 'kite', 'quadrilateral',
  'pentagon', 'hexagon', 'circle', 'segment', 'line', 'side', 'vertex', 'point', 'diagonal', 'chord',
  'diameter', 'radius', 'arc', 'angle', 'area', 'perimeter', 'height', 'altitude', 'median',
  'bisect', 'midpoint', 'exten', 'center', 'centre', 'tangen', 'regular',
  // verbs / relations
  'חסום', 'חוסם', 'חותך', 'נחתך', 'נפגש', 'פוגש', 'פגש', 'עובר', 'מונח', 'נמצא', 'יוצא', 'מחבר',
  'שוקיים', 'שוק', 'צלעות', 'מקביל', 'מאונך', 'ניצב', 'שוה', 'שווה', 'ישרה', 'חד', 'קהה', 'בסיס',
  'ראשי', 'משני', 'חיצוני', 'פנימי', 'גדול', 'קטן', 'ימני', 'שמאלי', 'עליון', 'תחתון', 'הזה', 'ההוא',
  'inscrib', 'circumscrib', 'meet', 'intersect', 'cut', 'cross', 'pass', 'through', 'lie',
  'outside', 'inside', 'equal', 'isosceles', 'equilateral', 'right', 'acute', 'obtuse',
  'perpendicular', 'parallel', 'base', 'external', 'internal', 'bigger', 'smaller', 'larger',
  'מחוץ', 'בתוך', 'מעל', 'מתחת', 'פי', 'יחס', 'חצי', 'רבע', 'שליש', 'כפול', 'half', 'quarter',
  'third', 'twice', 'ratio', 'times', 'draw', 'צייר', 'העבר', 'העבירו', 'סמן', 'בנה',
  // #659 — the vocabulary the shadow report proved the accountant could not classify, added one word
  // at a time and CLASSIFIED as construct vocabulary (the report's own rule: grow the lists
  // deliberately, never auto-treat an unknown as filler — that is how an accountant stops being honest)
  'משותף', 'חיתוך', 'חוצי', 'זוויות', 'דרך', 'רגל', 'קו', 'סביב', 'נוגע', 'משוכלל', 'מחלק', 'מבפנים',
  'חסימה', 'גזרה', 'צדד', 'מרחק', 'מידות', 'גבה', 'זרים', 'בר',
  'semicircle', 'midsegment', 'contain', 'touch', 'sector', 'foot', 'divide', 'disjoint', 'cyclic',
  'circumference', 'central', 'common',
];

/**
 * #659 — the Hebrew prefix particles, peeled EVERY way rather than greedily.
 *
 * The first cut took the longest run of prefix letters it could («[ובלכשמה]{0,3}»), and Hebrew stems
 * BEGIN with those same letters: «במעגל» stripped to «עגל», «במשולש» to «ולש», so four whole word
 * families were unknown while their stems sat in the list. Greedy stripping cannot work here — only the
 * stem list knows where the prefix ends, so every peeling is offered and any match accounts the word.
 */
const hePeelings = (w: string): string[] => {
  const out = [w, w.replace(/^-/, '')];
  for (let n = 1; n <= 3; n++) {
    const m = w.match(new RegExp(`^[ובלכשמה]{${n}}-?(.+)$`));
    if (m) out.push(m[1]);
  }
  return out;
};

/**
 * #659 — the FINAL-LETTER trap (the register in `src3d/CLAUDE.md`, 2-D edition). A Hebrew letter takes
 * its final form only at a word's END, so adding a suffix flips it: «תיכון» → «תיכונים», «אלכסון» →
 * «אלכסונים», «אנך» → «אנכים». A stem ending in a final letter can therefore never prefix-match its own
 * plural, which is why the accountant knew «תיכון» and not «התיכונים». Normalizing the stem's last
 * letter to its medial form fixes the whole inflection family instead of listing each plural.
 */
const MEDIAL: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const medialStem = (stem: string): string => stem.replace(/[ךםןףץ]$/, (c) => MEDIAL[c]);

const wordAccounted = (word: string): boolean => {
  const w = word.toLowerCase();
  for (const p of hePeelings(w)) {
    if (FILLER.has(p)) return true;
    if (KEYWORD_STEMS.some((stem) => p.startsWith(stem) || p.startsWith(medialStem(stem)))) return true;
  }
  return false;
};

/**
 * Classify the utterance's significant tokens and report the ones `commands` does not account for.
 * Accounting rules (token-level, see the header's honest boundary):
 *  - a LABEL run's letters must each appear in the commands' JSON (as ids/refs);
 *  - a NUMBER must appear in the commands (exact string or numeric equality);
 *  - a RELATION SYMBOL (=, ⊥/⟂, ∥, <, >, ≅, ~) requires at least one constraint-ish command;
 *  - a WORD must be filler or a known keyword stem — else it lands in `unknown-word`.
 */
export interface AccountCtx {
  /** Labels already ON the figure — a reference to an existing point is context, never a drop
   *  (mirrors droppedNewLabels' exemption; closes the idempotent-membership + circumscribe classes). */
  existingPoints?: string[];
  /** Bound radius-symbol letters (R/r, #54) — measure names, not points. */
  radiusSymbols?: string[];
  /** Bound angle-alias names (ADR-386, «נסמן זוית BAM כ-A1») — notation, not points. */
  angleAliases?: string[];
}

export function accountUtterance(utterance: string, commands: AnyCommand[], actx: AccountCtx = {}): UnaccountedSpan[] {
  const s = normalizeUtterance(utterance);
  // Label accounting is CASE-SENSITIVE over command string VALUES: an id like 'seg-AB' contributes
  // the uppercase tokens A,B (its lowercase machine prefix contributes nothing), so a field name or
  // a type string can never false-account a student label (the "TYPE contains E" trap).
  const strVals: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') strVals.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'type' && collect(x));
  };
  commands.forEach(collect);
  const valueLabels = new Set(strVals.flatMap((v) => v.match(/[A-Z]\d*/g) ?? []));
  // #779: a WHOLE value that is one label token claims its canonical form case-blind — the bound
  // radius symbol `name: "r"` (#54) accounts a lowercase-stated «r» without letting a type string's
  // letters account anything (values only, `type` excluded above).
  for (const v of strVals) if (/^[A-Za-z]\d*$/.test(v)) valueLabels.add(v.toUpperCase());
  const cmdNumbers = (JSON.stringify(commands).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: UnaccountedSpan[] = [];

  // labels: split glued runs (ABCD → A,B,C,D; O1 stays O1). The AREA MARKER S is notation, not a
  // point (the ADR-121/236 class): in «S_{ABC}» / the normalized glued «SABC», the leading S names
  // the measure — mask it exactly like the honesty gates do.
  const areaMarker = /(?<![A-Za-z])S(?=[A-Z]{3,4}(?![A-Z]))/.test(s) || /S_/.test(utterance);
  const existing = new Set((actx.existingPoints ?? []).map((x) => x.toUpperCase()));
  const symbols = new Set([...(actx.radiusSymbols ?? []), ...(actx.angleAliases ?? [])]);
  // #779: symbol masks compare case-blind — a bound «r» masks the canonical R the case-blind
  // extraction below produces, exactly as droppedNewLabels' mask does.
  const symbolsUpper = new Set([...symbols].map((x) => x.toUpperCase()));
  const account = (label: string): void => {
    if (label === 'S' && areaMarker) return;
    if (existing.has(label) || symbols.has(label) || symbolsUpper.has(label)) return;
    if (!valueLabels.has(label)) out.push({ kind: 'label', text: label });
  };
  for (const run of s.match(/(?:[A-Z]\d*)+/g) ?? []) for (const label of run.match(/[A-Z]\d*/g) ?? []) account(label);
  // #779: in HEBREW text a standalone Latin run is notation regardless of case — the parser's own
  // captures accept lowercase, so the accountant must too, or «… על המעגל a ו b» commits green while
  // its uppercase twin refuses (the P1). Latin-only text keeps the uppercase-only read: lowercase
  // words there are English, not labels (the word loop reports them instead). Unit tokens excluded.
  const labelWords = new Set<string>();
  if (/[א-ת]/.test(s)) {
    for (const run of s.match(/(?<![A-Za-z\d])(?=[A-Za-z]*[a-z])[A-Za-z][A-Za-z\d]*(?![A-Za-z\d])/g) ?? []) {
      if (['cm', 'mm'].includes(run.toLowerCase())) continue;
      labelWords.add(run.toLowerCase());
      for (const label of run.toUpperCase().match(/[A-Z]\d*/g) ?? []) account(label);
    }
  }
  // numbers — the divergence classes the first catalog sweep surfaced (reports/span-accounting-shadow.md):
  //  · a minus glued after a Hebrew letter is the maqaf preposition («מ-40»), not a sign → lookbehind;
  //  · a stated value may LOWER halved (diameter→radius; circumference 6π → r = 6/2) or ÷100 (40% → t=0.4);
  //  · a stated ratio pair «3/4» lowers to the single quotient 0.75 — accept both members when a/b lands.
  const ratioPairs = new Set<string>();
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)) {
    const q = Number(m[1]) / Number(m[2]);
    if (cmdNumbers.some((c) => Math.abs(c - q) < 1e-9)) {
      ratioPairs.add(m[1]);
      ratioPairs.add(m[2]);
    }
  }
  // colon ratios «DF:FC=1:4» lower to the single parameter a/(a+b) (or its complement)
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g)) {
    const a = Number(m[1]), b = Number(m[2]);
    const t1 = a / (a + b), t2 = b / (a + b), t3 = a / b;
    if (cmdNumbers.some((c) => [t1, t2, t3].some((t) => Math.abs(c - t) < 1e-9))) {
      ratioPairs.add(m[1]);
      ratioPairs.add(m[2]);
    }
  }
  for (const n of s.match(/(?<![֐-׿])-?\d+(?:\.\d+)?/g) ?? []) {
    if (/[A-Z]\d*/.test(n)) continue; // part of a label like O1 (already handled)
    if (ratioPairs.has(n.replace(/^-/, ''))) continue;
    const v = Math.abs(Number(n));
    const hit = cmdNumbers.some(
      (c) =>
        Math.abs(Math.abs(c) - v) < 1e-9 ||
        Math.abs(Math.abs(c) - v / 2) < 1e-9 ||
        Math.abs(Math.abs(c) - v / 100) < 1e-9 ||
        Math.abs(Math.abs(c) - Math.sqrt(v)) < 1e-9, // «√3·CO» keeps sqrt(3); «שטח = 81π» lowers r = 9
    );
    if (!hit) out.push({ kind: 'number', text: n });
  }
  // relation symbols
  const REL = /[=⊥⟂∥<>≅~]/g;
  const hasConstraint = commands.some((c) => /^set-|^measure-|coincide|circle|polygon|segment|point|line|diameter|midpoint|foot|inscribe|area|perimeter/.test(c.type));
  for (const sym of s.match(REL) ?? []) {
    if (!hasConstraint) out.push({ kind: 'relation', text: sym });
  }
  // words — a run the label pass above classified as notation is not a word (#779)
  for (const word of s.match(/[֐-׿a-z][֐-׿a-z'"-]*/g) ?? []) {
    if (word.length < 2) continue;
    if (labelWords.has(word.toLowerCase())) continue;
    if (!wordAccounted(word)) out.push({ kind: 'unknown-word', text: word });
  }
  return out;
}

/**
 * The ENFORCING verdict (#659 step 3, ADR-453): the HARD unaccounted spans — a label, a number or a
 * relation symbol the student stated that the winning parse does not account for. Non-empty means the
 * rule claimed the utterance while leaving stated content unread, so the parse is weak and escalates,
 * exactly as the `dropped*` gates make it weak. One function, no category enumeration — which is the
 * whole point (docs/23 G1: the gate family grows monotonically, one gate per syntactic category).
 *
 * `unknown-word` is deliberately NOT here: it is the accountant's own vocabulary debt, not the
 * parse's, and refusing on it would false-refuse working input (see the module header).
 */
export function unaccountedSpans(utterance: string, commands: AnyCommand[], actx: AccountCtx = {}): UnaccountedSpan[] {
  return accountUtterance(utterance, commands, actx).filter((x) => x.kind !== 'unknown-word');
}

/** The shadow verdict for logging: null when fully accounted (labels/numbers/relations — the
 *  buckets today's gates cover), else the compact span list. `unknown-word` spans are reported
 *  separately: they are the accountant's own coverage debt, not the parse's. */
export function spanShadow(utterance: string, commands: AnyCommand[], actx: AccountCtx = {}): { hard: UnaccountedSpan[]; words: UnaccountedSpan[] } | null {
  const spans = accountUtterance(utterance, commands, actx);
  if (spans.length === 0) return null;
  const hard = spans.filter((x) => x.kind !== 'unknown-word');
  const words = spans.filter((x) => x.kind === 'unknown-word');
  return hard.length || words.length ? { hard, words } : null;
}
