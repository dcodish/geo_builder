/**
 * SPAN ACCOUNTING — SHADOW MODE (S3.1 of docs/24; the mechanism ADR-250 named and deferred).
 *
 * The docs/23 review's G1 finding: the honesty-gate family (~16 `dropped*` gates, one per syntactic
 * category — labels → numbers → words → verbs → relations → compounds → comparisons → subjects…)
 * grows monotonically because each gate validates ONE category's token presence, and every newly
 * discovered category of stated content needs a fresh gate (two P1s in the record's final week).
 * The TOTAL mechanism: every significant token span of the utterance must be ACCOUNTED for by the
 * winning parse, or the parse is weak — one function, no category enumeration.
 *
 * THIS MODULE IS SHADOW-ONLY (docs/24 §4.2 — the enforcing flip is an operator decision): it never
 * refuses anything. `accountUtterance` classifies the utterance's tokens and reports which
 * significant ones the committed commands do not account for; the submit pipeline logs the result
 * in dev (`spanShadow` on the debug event), and `span-shadow-report` (env-gated) sweeps the catalog
 * + scenario corpus into reports/span-accounting-shadow.md for the operator's divergence review.
 * When the shadow log shows zero false flags on real traffic, enforcement replaces the gate family
 * (each gate deleted one by one, its tests retargeted at this accountant).
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
  'bisector', 'midpoint', 'extension', 'center', 'centre', 'tangent', 'regular',
  // verbs / relations
  'חסום', 'חוסם', 'חותך', 'נחתך', 'נפגש', 'פוגש', 'פגש', 'עובר', 'מונח', 'נמצא', 'יוצא', 'מחבר',
  'שוקיים', 'שוק', 'צלעות', 'מקביל', 'מאונך', 'ניצב', 'שוה', 'שווה', 'ישרה', 'חד', 'קהה', 'בסיס',
  'ראשי', 'משני', 'חיצוני', 'פנימי', 'גדול', 'קטן', 'ימני', 'שמאלי', 'עליון', 'תחתון', 'הזה', 'ההוא',
  'inscribed', 'circumscribed', 'meets', 'intersect', 'cuts', 'crosses', 'passes', 'through', 'lies',
  'outside', 'inside', 'equal', 'equals', 'isosceles', 'equilateral', 'right', 'acute', 'obtuse',
  'perpendicular', 'parallel', 'base', 'external', 'internal', 'bigger', 'smaller', 'larger',
  'מחוץ', 'בתוך', 'מעל', 'מתחת', 'פי', 'יחס', 'חצי', 'רבע', 'שליש', 'כפול', 'half', 'quarter',
  'third', 'twice', 'ratio', 'times', 'draw', 'צייר', 'העבר', 'העבירו', 'סמן', 'בנה',
];

const stripHePrefixes = (w: string): string => w.replace(/^[ובלכשמה]{0,3}-?/, '');

const wordAccounted = (word: string): boolean => {
  const w = word.toLowerCase();
  if (FILLER.has(w)) return true;
  const stripped = stripHePrefixes(w);
  if (FILLER.has(stripped)) return true;
  return KEYWORD_STEMS.some((stem) => w.startsWith(stem) || stripped.startsWith(stem));
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
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  commands.forEach(collect);
  const valueLabels = new Set(strVals.flatMap((v) => v.match(/[A-Z]\d*/g) ?? []));
  const cmdNumbers = (JSON.stringify(commands).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: UnaccountedSpan[] = [];

  // labels: split glued runs (ABCD → A,B,C,D; O1 stays O1). The AREA MARKER S is notation, not a
  // point (the ADR-121/236 class): in «S_{ABC}» / the normalized glued «SABC», the leading S names
  // the measure — mask it exactly like the honesty gates do.
  const areaMarker = /(?<![A-Za-z])S(?=[A-Z]{3,4}(?![A-Z]))/.test(s) || /S_/.test(utterance);
  const existing = new Set((actx.existingPoints ?? []).map((x) => x.toUpperCase()));
  const symbols = new Set([...(actx.radiusSymbols ?? []), ...(actx.angleAliases ?? [])]);
  for (const run of s.match(/(?:[A-Z]\d*)+/g) ?? []) {
    for (const label of run.match(/[A-Z]\d*/g) ?? []) {
      if (label === 'S' && areaMarker) continue;
      if (existing.has(label) || symbols.has(label)) continue;
      if (!valueLabels.has(label)) out.push({ kind: 'label', text: label });
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
  // words
  for (const word of s.match(/[֐-׿a-z][֐-׿a-z'"-]*/g) ?? []) {
    if (word.length < 2) continue;
    if (!wordAccounted(word)) out.push({ kind: 'unknown-word', text: word });
  }
  return out;
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
