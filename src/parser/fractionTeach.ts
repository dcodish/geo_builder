/**
 * #1611 ([ADR-591](../../docs/06-decisions.md#adr-591)) — THE FRACTION TEACHER: a length given the grammar
 * declined because it was written as a WORD fraction («רבע», «שלושה רבעים») and/or wrapped in a wish or a
 * command («אני רוצה ש-BE ו-DF יהיו רבע מהצלע של המקבילית», «הפוך את BE ואת DF להיות 3/4 מצלע המקבילית»).
 *
 * Operator ruling (2026-09-30): these are NOT accepted as input — the tool answers with the canonical
 * sentence the student meant («BE = 1/4 BC, DF = 1/4 AD») and pre-fills it, so one Enter builds it.
 *
 * This module only PROPOSES. It is a pure rewrite over the text and the parse context: it never decides
 * that the proposal is right. The caller (`decideDeterministic`) proves it — the candidate must pass the
 * whole real submit decision and COMMIT on the student's own figure — and says nothing when it does not
 * (taught remedies are hypotheses, #1183). A wrong proposal therefore costs a dry run, never a lie.
 *
 * The three pieces, each a class rather than a phrasing:
 * - the WRAPPER («אני רוצה ש… יהיו …», «הפוך את … להיות …», "I want … to be …", "make … …") is peeled;
 * - the FRACTION, a word (any numerator 1–9 over halves … tenths, Hebrew or English) or `p/q`, becomes `p/q`;
 * - the COMPARAND is either a segment the student named, or «הצלע (של) ה<shape>» — a side reference
 *   resolved PER SUBJECT to the one side of the named shape on which the subject segment structurally lies
 *   (its endpoints are that side's ends or points placed on it: `onSegment` / `midpointOf`). A side that
 *   cannot be resolved to exactly one edge yields no proposal — never a guess (ADR-052).
 *
 * A fraction with no comparand («BE = רבע») proposes nothing: there is nothing the canonical form could say.
 */
import type { ParseContext } from './parse';

type Id = string;

const SEG = '[A-Z]\\d*[A-Z]\\d*';
const SEG_RE = new RegExp(`^${SEG}$`);

/** Hebrew denominators: singular (numerator 1) and plural (numerator ≥ 2). חצי has no plural in use. */
const HE_DENOM: readonly { sing: string; plur?: string; q: number }[] = [
  { sing: 'חצי', q: 2 },
  { sing: 'שליש', plur: 'שלישים', q: 3 },
  { sing: 'רבע', plur: 'רבעים', q: 4 },
  { sing: 'חמישית', plur: 'חמישיות', q: 5 },
  { sing: 'שישית', plur: 'שישיות', q: 6 },
  { sing: 'שביעית', plur: 'שביעיות', q: 7 },
  { sing: 'שמינית', plur: 'שמיניות', q: 8 },
  { sing: 'תשיעית', plur: 'תשיעיות', q: 9 },
  { sing: 'עשירית', plur: 'עשיריות', q: 10 },
];
/** Hebrew numerators, both genders (שלושה רבעים / שלוש חמישיות). */
const HE_NUM: Record<string, number> = {
  'שני': 2, 'שתי': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5,
  'שישה': 6, 'שש': 6, 'שבעה': 7, 'שבע': 7, 'שמונה': 8, 'תשעה': 9, 'תשע': 9,
};
const EN_DENOM: readonly { sing: string; plur: string; q: number }[] = [
  { sing: 'half', plur: 'halves', q: 2 },
  { sing: 'third', plur: 'thirds', q: 3 },
  { sing: 'quarter', plur: 'quarters', q: 4 },
  { sing: 'fourth', plur: 'fourths', q: 4 },
  { sing: 'fifth', plur: 'fifths', q: 5 },
  { sing: 'sixth', plur: 'sixths', q: 6 },
  { sing: 'seventh', plur: 'sevenths', q: 7 },
  { sing: 'eighth', plur: 'eighths', q: 8 },
  { sing: 'ninth', plur: 'ninths', q: 9 },
  { sing: 'tenth', plur: 'tenths', q: 10 },
];
const EN_NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/** Shape nouns a side reference may name, with the declared kind they resolve on (`null` = any triangle). */
const SHAPE_NOUN: readonly [RegExp, string | 'triangle'][] = [
  [/^(?:ה)?ריבוע$|^square$/i, 'square'],
  [/^(?:ה)?מלבן$|^rectangle$/i, 'rectangle'],
  [/^(?:ה)?מעוין$|^rhombus$/i, 'rhombus'],
  [/^(?:ה)?טרפז$|^trapezoid$/i, 'trapezoid'],
  [/^(?:ה)?מקבילית$|^parallelogram$/i, 'parallelogram'],
  [/^(?:ה)?דלתון$|^kite$/i, 'kite'],
  [/^(?:ה)?משולש$|^triangle$/i, 'triangle'],
];

/** A parsed fraction: `p/q`, `0 < p/q`. */
interface Frac {
  readonly p: number;
  readonly q: number;
}

/** Read a fraction at the START of `s`; returns it and the rest of the text. */
function readFraction(s: string): { f: Frac; rest: string } | null {
  const num = s.match(/^(\d+)\s*\/\s*(\d+)(?![\d/])\s*/);
  if (num) {
    const p = Number(num[1]);
    const q = Number(num[2]);
    return p > 0 && q > 0 ? { f: { p, q }, rest: s.slice(num[0].length) } : null;
  }
  // Hebrew: «שלושה רבעים», «רבע», «חצי», optionally after a «ל» («שווה לרבע») or an article.
  const he = s.match(/^(?:ל)?(?:ה)?([א-ת]+)(?:\s+([א-ת]+))?/);
  if (he) {
    const [w1, w2] = [he[1], he[2]];
    if (w2 !== undefined && HE_NUM[w1] !== undefined) {
      const d = HE_DENOM.find((x) => x.plur === w2);
      if (d) return { f: { p: HE_NUM[w1], q: d.q }, rest: s.slice(he[0].length).trimStart() };
    }
    const d1 = HE_DENOM.find((x) => x.sing === w1);
    if (d1) {
      const used = s.match(/^(?:ל)?(?:ה)?[א-ת]+/)![0];
      return { f: { p: 1, q: d1.q }, rest: s.slice(used.length).trimStart() };
    }
  }
  const en = s.match(/^(?:(a|an|one|two|three|four|five|six|seven|eight|nine)\s+)?([a-z]+)\b\s*/i);
  if (en) {
    const lead = en[1]?.toLowerCase();
    const w = en[2].toLowerCase();
    const sing = EN_DENOM.find((x) => x.sing === w);
    const plur = EN_DENOM.find((x) => x.plur === w);
    if (sing && (lead === undefined || lead === 'a' || lead === 'an' || lead === 'one')) return { f: { p: 1, q: sing.q }, rest: s.slice(en[0].length) };
    if (plur && lead !== undefined && EN_NUM[lead] !== undefined) return { f: { p: EN_NUM[lead], q: plur.q }, rest: s.slice(en[0].length) };
  }
  return null;
}

/** The comparand after the fraction: a named segment, or a side reference («הצלע של המקבילית»). */
type Comparand = { readonly seg: string } | { readonly side: { readonly kind: string | null; readonly ring: string | null } };

function readComparand(s0: string): Comparand | null {
  // the partitive link: «מ-», «מה», «של ה», "of (the)"
  const s = s0
    .replace(/^(?:מ[-־]?\s*|של\s+)/, '')
    .replace(/^of\s+(?:the\s+)?/i, '')
    .trim();
  // «(ה)צלע BC» / "side BC" / «BC»
  const seg = s.match(new RegExp(`^(?:(?:ה)?צלע\\s+|side\\s+)?(${SEG})$`, 'i'));
  if (seg) return SEG_RE.test(seg[1]) ? { seg: seg[1] } : null;
  // «(ה)צלע (של) (ה)<shape> (ABCD)?» / "the side of the <shape> (ABCD)?"
  const he = s.match(/^(?:ה)?צלע(?:\s+של)?(?:\s+([א-ת]+)(?:\s+([A-Z]{3,}))?)?$/);
  const en = he ? null : s.match(/^(?:the\s+)?side(?:\s+of\s+(?:the\s+)?([a-z]+)(?:\s+([A-Z]{3,}))?)?$/i);
  const m = he ?? en;
  if (!m) return null;
  let kind: string | null = null;
  if (m[1] !== undefined) {
    const hit = SHAPE_NOUN.find(([re]) => re.test(m[1]));
    if (!hit) return null;
    kind = hit[1];
  }
  return { side: { kind, ring: m[2] ?? null } };
}

/** Peel the wish / command wrapper and split `subjects` from the `predicate`. */
function splitStatement(s: string): { subjects: string; predicate: string } | null {
  const forms: RegExp[] = [
    // «אני רוצה ש-BE ו-DF יהיו רבע מ…», «הייתי רוצה ש…», «רוצים ש…»
    /^(?:אני\s+|הייתי\s+)?(?:רוצה|רוצים|מבקש|מבקשת)\s+ש[-־]?\s*(.+?)\s+(?:יהיו|יהיה|תהיה|יהיו\s+שווים\s+ל|יהיו\s+שוות\s+ל|יהיה\s+שווה\s+ל|תהיה\s+שווה\s+ל)\s*(.+)$/,
    // «הפוך את BE ואת DF להיות 3/4 מ…», «קבע את BE להיות …», «תעשה ש-BE יהיה …»
    /^(?:הפוך|הפכי|הפכו|תהפוך|קבע|קבעי|קבעו|תקבע)\s+את\s+(.+?)\s+(?:להיות|שיהיו|שיהיה|ל)\s*(.+)$/,
    /^(?:עשה|עשי|עשו|תעשה)\s+ש[-־]?\s*(.+?)\s+(?:יהיו|יהיה|תהיה)\s+(.+)$/,
    // "I want BE and DF to be a quarter of …", "make BE (and DF) be/equal …"
    /^(?:i\s+want|i'd\s+like|i\s+would\s+like)\s+(.+?)\s+to\s+(?:be|equal)\s+(.+)$/i,
    /^(?:make|set)\s+(.+?)\s+(?:to\s+be|be|equal\s+to|equal)\s+(.+)$/i,
    // the bare copula: «BE = רבע BC», «BE הוא רבע מ-BC», «BE ו-DF הם רבע …», "BE is a quarter of BC"
    /^(.+?)\s*(?:=|שווה\s+ל|שווים\s+ל|שוות\s+ל|הוא|היא|הם|הן|\bis\b|\bare\b|\bequals?\b)\s*(.+)$/i,
  ];
  for (const re of forms) {
    const m = s.match(re);
    if (m) return { subjects: m[1].trim(), predicate: m[2].trim() };
  }
  return null;
}

/** «BE ו-DF», «BE ואת DF», «BE, DF», "BE and DF" → ['BE','DF']; anything else → null. */
function readSubjects(s: string): string[] | null {
  const parts = s
    .replace(/^את\s+/, '')
    .split(/\s*(?:,|\s+ואת\s+|\s+ו[-־]?\s*(?=[A-Z])|\band\b)\s*/i)
    .map((x) => x.trim().replace(/^את\s+/, ''))
    .filter(Boolean);
  if (!parts.length || !parts.every((x) => SEG_RE.test(x))) return null;
  return [...new Set(parts)];
}

const pairKey = (a: Id, b: Id) => [a, b].sort().join('|');

/** The one side of a candidate shape the segment XY lies on, spelled as the figure spells it — or null. */
function sideOf(subject: string, side: { kind: string | null; ring: string | null }, ctx: ParseContext): string | null {
  const [x, y] = subject.match(/[A-Z]\d*/g) as [Id, Id];
  if (x === y) return null;
  let shapes = (ctx.declaredPolygons ?? []).map((p) => ({ ring: p.vertices, kind: p.kind ?? null }));
  if (side.kind === 'triangle') shapes = shapes.filter((p) => p.ring.length === 3);
  else if (side.kind) shapes = shapes.filter((p) => p.kind === side.kind);
  if (side.ring) shapes = shapes.filter((p) => p.ring.join('') === side.ring || [...p.ring].sort().join('') === [...side.ring!].sort().join(''));
  // where each point structurally rides: a vertex rides its own ends; a placed point rides its segment
  const rides = (p: Id, a: Id, b: Id): boolean => {
    if (p === a || p === b) return true;
    const on = ctx.onSegment?.[p] ?? ctx.midpointOf?.[p];
    return !!on && pairKey(on[0], on[1]) === pairKey(a, b);
  };
  const hits = new Map<string, string>();
  for (const { ring } of shapes) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (!rides(x, a, b) || !rides(y, a, b)) continue;
      if (pairKey(x, y) === pairKey(a, b)) continue; // the side itself: «BC = רבע מהצלע» says nothing
      // spell the side as the student placed the rider on it («F על AD» → AD), else in ring order
      const placed = [x, y].map((p) => ctx.onSegment?.[p] ?? ctx.midpointOf?.[p]).find((on) => on && pairKey(on[0], on[1]) === pairKey(a, b));
      hits.set(pairKey(a, b), placed ? `${placed[0]}${placed[1]}` : `${a}${b}`);
    }
  }
  return hits.size === 1 ? [...hits.values()][0] : null;
}

export interface FractionTeachCandidate {
  /** one canonical given per subject, in the student's order («BE = 1/4 BC») */
  readonly sentences: readonly string[];
  /** the one line offered and pre-filled — the sentences joined as a connector compound */
  readonly line: string;
}

/**
 * Propose the canonical sentence(s) for a word-fraction / wrapped length given, or `null`. Pure; the caller
 * must PROVE the proposal (it builds on the student's figure) before showing it.
 */
export function fractionTeachCandidate(utterance: string, ctx: ParseContext): FractionTeachCandidate | null {
  const s = utterance.trim().replace(/\s+/g, ' ').replace(/[.!?׃]+$/, '').trim();
  const st = splitStatement(s);
  if (!st) return null;
  const subjects = readSubjects(st.subjects);
  if (!subjects) return null;
  const fr = readFraction(st.predicate);
  if (!fr) return null;
  const cmp = readComparand(fr.rest);
  if (!cmp) return null;
  const { p, q } = fr.f;
  const sentences: string[] = [];
  for (const subj of subjects) {
    const base = 'seg' in cmp ? cmp.seg : sideOf(subj, cmp.side, ctx);
    if (!base || pairKey(...(subj.match(/[A-Z]\d*/g) as [Id, Id])) === pairKey(...(base.match(/[A-Z]\d*/g) as [Id, Id]))) return null;
    sentences.push(`${subj} = ${p}/${q} ${base}`);
  }
  const line = sentences.join(', ');
  // already canonical: the grammar declined the canonical form itself, so there is nothing to teach
  if (line === s) return null;
  return { sentences, line };
}
