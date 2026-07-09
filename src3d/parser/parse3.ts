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

import type { Command3, Id, LinExpr, SymTerm, VecAtom, VecExpr } from '../engine/types';

export type ParseResult3 =
  | { ok: true; commands: Command3[] }
  | { ok: false; reason: 'not-handled' }
  // bare `AS = AB` — vector equation or length equality? NEVER assumed (operator rule):
  // the student is asked to write וקטור AS = וקטור AB (or with the ⃗ arrow), or |AS| = |AB|.
  | { ok: false; reason: 'ambiguous-vector-length' };

const NOT_HANDLED: ParseResult3 = { ok: false, reason: 'not-handled' };

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/** Normalise an utterance: unify primes to `'`, strip vector arrows (AB→ ≡ AB),
 *  unify minus/maqaf to `-`, collapse whitespace. */
export function normalize3(s: string): string {
  return s
    .replace(/[′’‘`]/g, "'")
    .replace(/[→⃗⟶]/g, '')
    .replace(/[−־]/g, '-')
    .replace(/(?:^|(?<=[\s:,]))(?:ה?ו?וקטור|vectors?)\s+/gi, '') // the vector WORD marks vector meaning (recorded before normalize), then reads as decoration
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOKEN = /[A-Z]\d*'?/g;
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
// Rules
// ---------------------------------------------------------------------------

type Rule = (s: string) => Command3[] | null;

/** cube / box: 8 vertices as given, or 4 base vertices auto-primed to the top face. */
const cubeOrBox: Rule = (s) => {
  const kind = /קוביי?ה/.test(s) || /\bcube\b/i.test(s) ? 'cube' : /תיבה/.test(s) || /\b(box|cuboid)\b/i.test(s) ? 'box' : null;
  if (!kind) return null;
  const toks = labelTokens(s);
  if (toks.length === 8) return [{ type: 'solid', kind, ids: toks }];
  if (toks.length === 4 && toks.every(unprimed)) return [{ type: 'solid', kind, ids: [...toks, ...primeAll(toks)] }];
  // label-less: a cube/box is fully determined — default lettering, no LLM needed
  if (toks.length === 0) return [{ type: 'solid', kind, ids: ['A', 'B', 'C', 'D', ...primeAll(['A', 'B', 'C', 'D'])] }];
  return null;
};

/** Right triangular prism: `מנסרה ישרה (משולשת) ABCA'B'C'` — 6 vertices, or 3 auto-primed.
 *  V8-d: an equilateral base (`שווה צלעות` / `כל מקצועותיה שווים` / `equilateral`) → `prism3e`. */
const rightPrism: Rule = (s) => {
  if (!/מנסרה/.test(s) && !/\bprism\b/i.test(s)) return null;
  if (!/ישרה/.test(s) && !/\bright\b/i.test(s)) return null; // oblique unsupported in V0 — honest refusal
  const equi = /שווה[\s-]?צלעות/.test(s) || /כל\s+מקצועותיה\s+שוו/.test(s) || /\bequilateral\b/i.test(s);
  const kind = equi ? 'prism3e' : 'prism3';
  const toks = firstLabelRun(s);
  if (toks.length === 6) return [{ type: 'solid', kind, ids: toks }];
  if (toks.length === 3 && toks.every(unprimed)) return [{ type: 'solid', kind, ids: [...toks, ...primeAll(toks)] }];
  if (toks.length === 0 && (/משולש/.test(s) || /\btriangular\b/i.test(s) || equi))
    return [{ type: 'solid', kind, ids: ['A', 'B', 'C', ...primeAll(['A', 'B', 'C'])] }];
  return null;
};

/** A maximal consecutive alphabetical run of single unprimed letters (e.g. A,B,C). */
function isConsecutiveRun(toks: Id[]): boolean {
  if (toks.length === 0 || !toks.every((t) => /^[A-Z]$/.test(t))) return false;
  const codes = toks.map((t) => t.charCodeAt(0)).sort((a, b) => a - b);
  return codes.every((code, i) => i === 0 || code === codes[i - 1] + 1);
}

/** The base run named by `שבסיסה ABCD` / `whose base ABCD` / `with base ABCD`, if present. */
function namedBaseIds(s: string): Id[] | null {
  const m = s.match(/(?:שבסיס[הו]|whose\s+base|with\s+(?:an?\s+)?base)\s+((?:[A-Z]\d*'?)+)/);
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

/** Right pyramid: `פירמידה ישרה ABCDS` / `ABCS`. WITHOUT ישרה, 4 ids = a GENERAL tetrahedron (V7 T2).
 *  V8-d: an equilateral triangular base → `pyramid3e`; a parallelogram base → `pyramidPar`. */
const rightPyramid: Rule = (s) => {
  // `טטראדר`/`tetrahedron` IS a triangular pyramid by definition — it carries its own base
  // `טטראדר`/`טטרדר` (transliterations, the [אה] optional so a missing vowel-letter still reads),
  // `ארבעון` (the Hebrew word), `tetrahedron` — all a triangular pyramid by definition
  const tetraWord = /טטר[אה]?ה?דר(?:ון)?/.test(s) || /ארבעון/.test(s) || /\btetrahedr(?:on)?\b/i.test(s);
  if (!/פירמידה/.test(s) && !/\bpyramid\b/i.test(s) && !tetraWord) return null;
  const right = /ישרה?/.test(s) || /\bright\b/i.test(s); // ישרה (fem, פירמידה) or ישר (masc, טטראדר)
  const square = /ריבוע/.test(s) || /\bsquare\b/i.test(s);
  const equi = /שווה[\s-]?צלעות/.test(s) || /\bequilateral\b/i.test(s);
  const par = /מקבילית/.test(s) || /\bparallelogram\b/i.test(s);
  // the triangular-base pyramid kind (equilateral only when right — a right equilateral pyramid)
  const triKind = right ? (equi ? 'pyramid3e' : 'pyramid3') : 'tetra';
  if (firstLabelRun(s).length === 0) {
    // label-less: a stated base word makes the shape determined — default lettering
    const rect = /מלבן/.test(s) || /\brectang/i.test(s);
    const tri = tetraWord || /משולש/.test(s) || /\btriangular\b/i.test(s) || equi;
    if (par) return [{ type: 'solid', kind: 'pyramidPar', ids: ['A', 'B', 'C', 'D', 'S'] }];
    if (tri) return [{ type: 'solid', kind: triKind, ids: ['A', 'B', 'C', 'D'] }];
    if (square || rect) {
      const kind = right ? (square ? 'pyramid4' : 'pyramid4r') : square ? ('pyramid4g' as const) : 'pyramid4gr';
      return [{ type: 'solid', kind, ids: ['A', 'B', 'C', 'D', 'S'] }];
    }
    return null;
  }
  const toks = orientPyramid(s, firstLabelRun(s));
  // a tetrahedron has exactly 4 vertices — a 5-label `טטראדר` is contradictory (refuse → honest)
  if (toks.length === 5 && !tetraWord) {
    if (par) return [{ type: 'solid', kind: 'pyramidPar', ids: toks }];
    // rightness and base shape are INDEPENDENT givens (ADR-052): a square base must be STATED
    const kind = right ? (square ? 'pyramid4' : 'pyramid4r') : square ? ('pyramid4g' as const) : 'pyramid4gr';
    return [{ type: 'solid', kind, ids: toks }];
  }
  if (toks.length === 4) return [{ type: 'solid', kind: triKind, ids: toks }];
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

/** `BD = (-4,5,12)` — a PAIR-vector injection (V7 T2). */
const pairInjection: Rule = (s) => {
  const m = s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (!m) return null;
  return [{ type: 'inject-pair', a: m[1], b: m[2], x: +m[3], y: +m[4], z: +m[5] }];
};

/** `נפח הפירמידה ABCD = 64` — a tetrahedron volume claim (V7 T2). */
const volumePolyClaim: Rule = (s) => {
  const m =
    s.match(/^נפח\s+הפירמידה\s+((?:[A-Z]\d*'?){4})\s*=\s*(-?\d+(?:\.\d+)?)$/) ??
    s.match(/^the\s+volume\s+of\s+(?:the\s+)?pyramid\s+((?:[A-Z]\d*'?){4})\s*=\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return [{ type: 'claim', claim: { type: 'volume-poly', ids: m[1].match(/[A-Z]\d*'?/g)!, value: +m[2] } }];
};

/** `M אמצע BC` / `M is the midpoint of BC` → on-segment t = ½. */
const midpoint: Rule = (s) => {
  if (!/אמצע/.test(s) && !/\b(midpoint|middle)\b/i.test(s)) return null;
  const toks = labelTokens(s);
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
  const colon = s.match(/([A-Z]\d*'?)([A-Z]\d*'?)\s*:\s*([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (colon) {
    const [, p1, x, y, q1, pNum, qNum] = colon;
    if (x !== id || y !== id) return 'invalid';
    const p = parseFloat(pNum);
    const q = parseFloat(qNum);
    if (!(p > 0) || !(q > 0)) return 'invalid';
    if (p1 === a && q1 === b) return p / (p + q);
    if (p1 === b && q1 === a) return q / (p + q);
    return 'invalid';
  }
  const m = s.match(/([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*(\d+(?:\.\d+)?)\s*[·×*]?\s*([A-Z]\d*'?)([A-Z]\d*'?)/);
  if (!m) return undefined;
  const [, p, x, num, y, q] = m;
  if (x !== id || y !== id) return 'invalid';
  const c = parseFloat(num);
  if (!(c > 0)) return 'invalid';
  if (p === a && q === b) return c / (c + 1);
  if (p === b && q === a) return 1 / (c + 1);
  return 'invalid';
}

/** `K על AA'` (+ optional `כך ש-AK = 2KA'`) / `K on AA' such that AK = 2KA'`. No ratio ⇒ a free slider. */
const onSegment: Rule = (s) => {
  if (GREEK.test(s)) return null; // Greek scalars = the spanPoint form; never swallow its condition as a free point
  const m = s.match(/^([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+|is\s+)?(?:על|on)\s+(?:הקטע\s+|הצלע\s+|segment\s+|edge\s+)?([A-Z]\d*'?)([A-Z]\d*'?)(?![A-Z0-9'])/);
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
const stripProofPrefix = (s: string): string =>
  s.replace(/^(?:הוכיחו?\s+(?:כי|ש-?)\s*|הראו?\s+(?:כי|ש-?)\s*|prove\s+that\s+|show\s+that\s+)/i, '');

const FRACTION_GLYPHS: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8,
};

/** `5/3`, `0.5`, `2`, `½`… — absent ⇒ 1. Null on malformed. */
function parseCoeff(s: string | undefined): number | null {
  if (s === undefined || s === '') return 1;
  if (FRACTION_GLYPHS[s] !== undefined) return FRACTION_GLYPHS[s];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = parseInt(frac[2], 10);
    return den === 0 ? null : parseInt(frac[1], 10) / den;
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

const TERM =
  /^([+-])?\s*((?:\d+\s*\/\s*\d+)|(?:\d*\.\d+)|(?:\d+)|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])?\s*[·×*]?\s*(?:([a-z])|([A-Z]\d*'?)([A-Z]\d*'?))\s*$/;

/** Parse a linear combination `½u + 5/3·w - 1/3v` / `AM` / `2KA'`. Null when any term is malformed. */
export function parseVecExpr(src: string): VecExpr | null {
  const parts = src
    .trim()
    .split(/(?=[+-])/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
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

/** `E מפגש התיכונים של משולש BC'D` / `E is the centroid of triangle BC'D` — also draws the triangle. */
const centroidRule: Rule = (s) => {
  const m = s.match(
    /^([A-Z]\d*'?)\s+(?:מפגש\s+התיכונים\s+(?:של\s+|ב)?משולש|is\s+the\s+centroid\s+of\s+(?:triangle\s+)?|is\s+the\s+intersection\s+of\s+the\s+medians\s+of\s+(?:triangle\s+)?)\s*([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s*$/,
  );
  if (!m) return null;
  const [, id, a, b, c] = m;
  if (new Set([id, a, b, c]).size !== 4) return null;
  return [
    { type: 'segment3', a, b: b },
    { type: 'segment3', a: b, b: c },
    { type: 'segment3', a: c, b: a },
    { type: 'centroid3', id, of: [a, b, c] },
  ];
};

/**
 * `E מפגש האלכסונים של הפאה ABCD` / `O נקודת חיתוך אלכסוני הבסיס` / `O = intersection
 * of diagonal AC with diagonal BD` (V8-a, G3) — the diagonal crossing of a
 * parallelogram face/base. Three forms: a NAMED quad (4 cyclic vertices → the crossing
 * is the midpoint of the 1st & 3rd), TWO explicit diagonals (→ midpoint of the first),
 * or the implicit `the base` (0 vertices → the base sentinel, resolved by apply).
 */
const diagIntersection: Rule = (s) => {
  if (!/אלכסו[ןנ]|diagonal/i.test(s)) return null;
  if (!/מפגש|חיתוך|נחתכים|intersection|meet/i.test(s)) return null;
  const toks = labelTokens(s);
  if (toks.length === 0) return null;
  const [id, ...rest] = toks;
  const twoDiag = (s.match(/אלכסו[ןנ]|diagonal/gi) ?? []).length >= 2;
  if (rest.length === 4 && twoDiag) {
    const [a, b] = rest; // two explicit diagonals — the crossing is on the first, a–b
    if (id === a || id === b || a === b) return null;
    return [{ type: 'point-on-segment3', id, a, b, t: 0.5 }];
  }
  if (rest.length === 4) return [{ type: 'diag-intersection', id, face: rest }]; // named quad, cyclic
  if (rest.length === 0) return [{ type: 'diag-intersection', id, face: [] }]; // `the base` sentinel
  return null;
};

/** `CA' מאונך למישור BC'D` / `CA' is perpendicular to plane BC'D` — a CLAIM; draws the segment + the plane triangle. */
const perpPlaneClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m = s.match(
    /^([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:מאונך|ניצב|אנך|⊥|(?:is\s+)?perpendicular)\s*(?:ל|to\s+(?:the\s+)?)?\s*(?:מישור|plane)\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)?\s*$/,
  );
  if (!m) {
    // "AS ניצב לבסיס / למישור הבסיס" / "AS is perpendicular to the base" — the base
    // sentinel plane: [] (resolved by apply from the figure's single solid)
    const mb = s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:מאונך|ניצב|אנך|⊥|(?:is\s+)?perpendicular)\s*(?:ל|to\s+(?:the\s+)?)?\s*(?:מישור\s+)?ה?(?:בסיס|base)\s*$/);
    if (!mb) return null;
    return [{ type: 'seg-plane-rel', rel: 'perp', a: mb[1], b: mb[2], plane: [] }];
  }
  const [, s1, s2, p1, p2, p3] = m;
  // lowered as a RELATION: the engine decides — a symbol PIN when an endpoint is a
  // symbolic vec-defined point (V7), else the V1 perp-plane claim (segments drawn by apply)
  return [
    { type: 'segment3', a: p1, b: p2 },
    { type: 'segment3', a: p2, b: p3 },
    { type: 'segment3', a: p3, b: p1 },
    { type: 'seg-plane-rel', rel: 'perp', a: s1, b: s2, plane: [p1, p2, p3] },
  ];
};

/** `E, C, A' על ישר אחד` / `E, C, A' are collinear` — a CLAIM. */
const collinearClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
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
 * A term whose coefficient may carry ONE scalar symbol (V7): `(k/2)DB`, `kDC`,
 * `2k·u`, `t·BE`, plus every numeric form. Null on anything else.
 */
const SYM_TERM =
  /^([+-])?\s*(?:\(([^()]+)\)\s*[·×*]?\s*)?((?:\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])?\s*[·×*]?\s*([a-w])?\s*[·×*]?\s*(?:([A-Z]\d*'?)([A-Z]\d*'?)|([a-z]))\s*(?:\/\s*(\d+(?:\.\d+)?))?$/;

export function parseSymExpr(src: string): { terms: SymTerm[]; symbol?: string } | null {
  const parts = src
    .trim()
    .split(/(?=[+-])/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
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
      const inner = paren.match(/^([a-w])\s*\/\s*(\d+(?:\.\d+)?)$/); // the (k/2) form
      if (inner) {
        if (!bindSymbol(inner[1])) return null;
        coeff = { k: 0, p: 1 / +inner[2] };
      } else {
        const pe = parseParamExpr(paren);
        if (!pe) return null;
        if (pe.param && !bindSymbol(pe.param)) return null;
        coeff = pe.expr;
      }
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

/** Evaluate a small numeric expression with radicals: 3, 3/4, √6/4, 2√3, (√6/4). */
function evalRadical(raw: string): number | null {
  const s0 = raw.trim().replace(/^\((.*)\)$/, '$1').trim();
  if (s0 === '') return null;
  const m = s0.match(/^(\d+(?:\.\d+)?)?\s*(?:√\s*(\d+(?:\.\d+)?))?\s*(?:\/\s*(\d+(?:\.\d+)?))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const a = m[1] ? +m[1] : 1;
  const r = m[2] ? Math.sqrt(+m[2]) : 1;
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
  const lhs = s.match(new RegExp(`^(?:\\|${P}\\||(?:אורך|length)\\s+(?:המקצוע\\s+|הצלע\\s+|צלע\\s+)?${P})\\s*(?:=|שווה\\s+ל)\\s*(.+)$`));
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
  return null;
};

/** `k = 1/2` (הציבו) — assign the named parameter. x/y/z stay coordinates. */
const symbolValue: Rule = (s) => {
  const m = s.match(/^([a-w])\s*=\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?\s*$/);
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
  const s = stripProofPrefix(s0);
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

/** `EF מקביל למישור ABC` / `EF is parallel to plane ABC` — pins a symbol or (⟂ only) claims. */
const segParallelPlane: Rule = (s) => {
  const m =
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s+מקביל\s+למישור\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s*$/) ??
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:is\s+)?parallel\s+to\s+(?:the\s+)?plane\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s*$/);
  if (!m) {
    const mb =
      s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s+מקביל\s+ל(?:מישור\s+)?ה?בסיס\s*$/) ??
      s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:is\s+)?parallel\s+to\s+(?:the\s+)?base\s*$/i);
    if (!mb) return null;
    return [{ type: 'seg-plane-rel', rel: 'parallel', a: mb[1], b: mb[2], plane: [] }];
  }
  return [{ type: 'seg-plane-rel', rel: 'parallel', a: m[1], b: m[2], plane: [m[3], m[4], m[5]] }];
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

/** A bare auxiliary segment: `AM` / `קטע AM` / `segment CA'`. Last rule — everything else wins first. */
const bareSegment: Rule = (s) => {
  const m = s.match(/^(?:קטע\s+|העבירו\s+(?:את\s+)?|segment\s+|draw\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s*$/);
  if (!m) return null;
  const [, a, b] = m;
  if (a === b) return null;
  return [{ type: 'segment3', a, b }];
};

// ---------------------------------------------------------------------------
// V2 — the algebraic lane (docs/20 §6.3, ADR-3D-004)
// ---------------------------------------------------------------------------

/** Plane names: π1 / pi1 / a bare π → canonical `π<digits?>`. */
const PLANE_NAME = /(?:π|pi|Pi|PI)\s?(\d*)/;
const canonicalPlane = (s: string): string => `π${s.match(/\d+/)?.[0] ?? ''}`;
/** Line names: ℓ or l → canonical `ℓ`. */
const LINE_NAME = /[ℓl]/;

/** Parse `m-1` / `5-m` / `-2` / `2m` → a LinExpr (k + p·param). Null on anything else. */
export function parseParamExpr(src: string): { expr: LinExpr; param?: string } | null {
  const terms = src
    .trim()
    .split(/(?=[+-])/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length === 0) return null;
  const expr: LinExpr = { k: 0, p: 0 };
  let param: string | undefined;
  for (const t of terms) {
    const m = t.match(/^([+-])?\s*(\d+(?:\.\d+)?)?\s*([a-w])?$/);
    if (!m || (m[2] === undefined && !m[3])) return null;
    const sgn = m[1] === '-' ? -1 : 1;
    const num = m[2] !== undefined ? parseFloat(m[2]) : 1;
    if (m[3]) {
      if (param && param !== m[3]) return null;
      param = m[3];
      expr.p += sgn * num;
    } else {
      expr.k += sgn * num;
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
    const terms = rest
      .trim()
      .split(/(?=[+-])/)
      .map((t) => t.trim())
      .filter(Boolean);
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
  // name OPTIONAL (unnamed ⇒ π) and the `:` separator OPTIONAL (`המישור x-y+z=1`,
  // `המישור π2 x-y+z=1`); the tail must contain `=` so a point-run plane (`מישור ABC`,
  // no `=`) is never stolen, and parseLinearEq strictly validates it (all-or-nothing).
  const m = s.match(new RegExp(`^(?:המישור\\s+|plane\\s+)?(${PLANE_NAME.source})?\\s*:?\\s*([^:]*=[^:]*)$`));
  if (!m) return null;
  const eq = parseLinearEq(m[m.length - 1]);
  if (!eq) return null;
  return [
    {
      type: 'plane3',
      name: m[1] ? canonicalPlane(m[1]) : 'π',
      plane: { cx: eq.cx, cy: eq.cy, cz: eq.cz, d: eq.d, src: m[m.length - 1].trim() },
      param: eq.param,
    },
  ];
};

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** A tuple component: a number, or a lowercase letter = a symbolic unknown (V4: only numerics constrain). */
const COMP = `(?:${NUM}|[a-w])`;
const compVal = (t: string): number | null => (/^[a-w]$/.test(t) ? null : +t);

/** `A(2,-2,6)` / `A(3,n,p)` (+ optional membership tail: `נמצאת על אחד המישורים` / `על המישור π2` / `על הישר ℓ`). */
const coordPoint: Rule = (s) => {
  const m = s.match(
    new RegExp(`^(?:הנקודה\\s+|point\\s+)?([A-Z]\\d*'?)\\s*\\(\\s*(${COMP})\\s*,\\s*(${COMP})\\s*,\\s*(${COMP})\\s*\\)\\s*(.*)$`),
  );
  if (!m) return null;
  const [, id, x, y, z, restRaw] = m;
  const cmds: Command3[] = [{ type: 'point3', id, x: compVal(x), y: compVal(y), z: compVal(z) }];
  const rest = restRaw.trim();
  if (rest) {
    const onLine = rest.match(new RegExp(`^(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?(?:על הישר|on (?:the )?line)\\s+(${LINE_NAME.source})$`));
    if (/^(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?(?:על אחד המישורים|on one of the planes)$/.test(rest)) {
      cmds.push({ type: 'on-planes', id, plane: 'any' });
    } else if (onLine) {
      cmds.push({ type: 'on-line', id, line: 'ℓ' });
    } else {
      const named = rest.match(new RegExp(`^(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?(?:על המישור|on plane)\\s+(${PLANE_NAME.source})$`));
      if (!named) return null; // trailing text we don't understand — refuse the whole utterance
      cmds.push({ type: 'on-planes', id, plane: canonicalPlane(named[1]) });
    }
  }
  return cmds;
};

/** Standalone membership for an existing point. */
const membership: Rule = (s) => {
  const any = s.match(/^([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?(?:על אחד המישורים|on one of the planes)$/);
  if (any) return [{ type: 'on-planes', id: any[1], plane: 'any' }];
  const named = s.match(new RegExp(`^([A-Z]\\d*'?)\\s+(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?(?:על המישור|on plane)\\s+(${PLANE_NAME.source})$`));
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
      new RegExp(`^([A-Z]\\d*'?)\\s+(?:נמצאת\\s+|נמצא\\s+)?(מעל|מתחת|על)\\s+ל?ה?מישור\\s+(${RUN}|${PLANE_NAME.source})$`),
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
      new RegExp(`^ה?זווית\\s+בין\\s+ה?ישר\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+ל?בין\\s+ה?מישור\\s+((?:[A-Z]\\d*'?){3,4})\\s*(?:היא|הוא|=)\\s*(${NUM})\\s*°?$`),
    ) ??
    s.match(
      new RegExp(`^the\\s+angle\\s+between\\s+(?:the\\s+)?line\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+and\\s+(?:the\\s+)?plane\\s+((?:[A-Z]\\d*'?){3,4})\\s*(?:is|=)\\s*(${NUM})\\s*°?$`, 'i'),
    );
  if (!m) return null;
  const plane = m[3].match(/[A-Z]\d*'?/g)!;
  return [{ type: 'line-plane-angle', a: m[1], b: m[2], plane, deg: +m[4] }];
};

const angleBetweenPlanes: Rule = (s) => {
  const m = s.match(
    new RegExp(
      `^(?:הזווית בין ה?מישור(?:ים)?|the angle between (?:the )?planes)\\s+(${PLANE_NAME.source})\\s*(?:ל|ו|and)-?\\s*(${PLANE_NAME.source})\\s*(?:היא|הוא|is|=)?\\s*(${NUM})\\s*°?$`,
    ),
  );
  if (!m) return null;
  return [{ type: 'plane-angle', p1: canonicalPlane(m[1]), p2: canonicalPlane(m[3]), deg: +m[5] }];
};

/** `מ-A מורידים אנך למישור π1 החותך אותו בנקודה B` / `from A drop a perpendicular to plane π1, it cuts it at B`. */
const dropPerpToPlane: Rule = (s) => {
  const he = s.match(
    new RegExp(`^מ-?([A-Z]\\d*'?)\\s+(?:מורידים|הורידו|מוריד|מעבירים|העבירו)\\s+אנך\\s+למישור\\s+(${PLANE_NAME.source})\\b.*?בנקודה\\s+([A-Z]\\d*'?)$`),
  );
  const en =
    he ??
    s.match(new RegExp(`^from ([A-Z]\\d*'?) drop a perpendicular to (?:the )?plane (${PLANE_NAME.source})\\b.*? at ([A-Z]\\d*'?)$`));
  if (!en) return null;
  const [, from, plane, , foot] = en;
  return [{ type: 'foot-on-plane', id: foot, from, plane: canonicalPlane(plane) }];
};

/** `ℓ ישר החיתוך בין המישורים π1 ו-π2` / `ℓ is the intersection line of π1 and π2`. */
const intersectionLine: Rule = (s) => {
  const m = s.match(
    new RegExp(
      `^(${LINE_NAME.source})\\s+(?:הוא\\s+)?(?:ישר\\s+החיתוך|is the (?:intersection line|line of intersection))\\s+(?:בין\\s+)?(?:המישורים\\s+|of\\s+(?:the\\s+)?(?:planes\\s+)?)?(${PLANE_NAME.source})\\s*(?:ל|ו|and)-?\\s*(${PLANE_NAME.source})$`,
    ),
  );
  if (!m) return null;
  return [{ type: 'plane-plane-line', name: 'ℓ', p1: canonicalPlane(m[2]), p2: canonicalPlane(m[4]) }];
};

/** `מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C` / `from B drop a perpendicular to line ℓ, it cuts it at C`. */
const dropPerpToLine: Rule = (s) => {
  // NOTE: `ℓ` is not a \w character, so `\b` after it never matches — use an explicit lookahead.
  const he = s.match(
    new RegExp(`^מ-?([A-Z]\\d*'?)\\s+(?:מעבירים|העבירו|מורידים|הורידו)\\s+אנך\\s+לישר\\s+(${LINE_NAME.source})(?=[\\s,.]|$).*?בנקודה\\s+([A-Z]\\d*'?)$`),
  );
  const en =
    he ?? s.match(new RegExp(`^from ([A-Z]\\d*'?) drop a perpendicular to (?:the )?line (${LINE_NAME.source})(?=[\\s,.]|$).*? at ([A-Z]\\d*'?)$`));
  if (!en) return null;
  const [, from, , foot] = en;
  return [{ type: 'foot-on-line', id: foot, from, line: 'ℓ' }];
};

// ---------------------------------------------------------------------------
// V3 — parameters in lines (docs/20 §8 V3, ADR-3D-006; gate 2024-Q2)
// ---------------------------------------------------------------------------

/** `הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)` — a typed parametric line (components may carry the parameter). */
const parametricLine: Rule = (s) => {
  const m = s.match(new RegExp(`^(?:הישר\\s+|line\\s+)?(${LINE_NAME.source})\\s*:\\s*x\\s*=\\s*\\(([^()]*)\\)\\s*\\+\\s*t\\s*[·×*]?\\s*\\(([^()]*)\\)$`));
  if (!m) return null;
  const triple = (str: string) => str.split(',').map((p) => parseParamExpr(p));
  const anchor = triple(m[2]);
  const dir = triple(m[3]);
  if (anchor.length !== 3 || dir.length !== 3 || [...anchor, ...dir].some((x) => !x)) return null;
  const params = new Set([...anchor, ...dir].flatMap((x) => (x!.param ? [x!.param] : [])));
  if (params.size > 1) return null;
  return [
    {
      type: 'line3',
      name: 'ℓ',
      anchor: [anchor[0]!.expr, anchor[1]!.expr, anchor[2]!.expr],
      dir: [dir[0]!.expr, dir[1]!.expr, dir[2]!.expr],
      src: `x = (${m[2].trim()}) + t·(${m[3].trim()})`,
      param: [...params][0],
    },
  ];
};

/** `הישר ℓ ניצב למישור π` — a GIVEN that pins the parameter (line ⟂ plane). */
const linePerpPlane: Rule = (s) => {
  const m =
    s.match(new RegExp(`^(?:הישר\\s+)?(${LINE_NAME.source})\\s+(?:ניצב|מאונך)\\s+למישור\\s+(${PLANE_NAME.source})$`)) ??
    s.match(new RegExp(`^(?:line\\s+)?(${LINE_NAME.source})\\s+is\\s+perpendicular\\s+to\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})$`));
  if (!m) return null;
  return [{ type: 'line-perp-plane', line: 'ℓ', plane: canonicalPlane(m[2]) }];
};

/** `ℓ חותך את π בנקודה A` / `ℓ cuts plane π at A` — the line∩plane point. */
const lineCutsPlane: Rule = (s) => {
  const m =
    s.match(
      new RegExp(`^(?:הישר\\s+)?(${LINE_NAME.source})\\s+חותך\\s+(?:את\\s+)?(?:המישור\\s+)?(${PLANE_NAME.source})\\s+בנקודה\\s+([A-Z]\\d*'?)$`),
    ) ??
    s.match(new RegExp(`^(?:line\\s+)?(${LINE_NAME.source})\\s+cuts\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})\\s+at\\s+([A-Z]\\d*'?)$`));
  if (!m) return null;
  return [{ type: 'line-plane-point', id: m[m.length - 1], line: 'ℓ', plane: canonicalPlane(m[2]) }];
};

/** `ℓ אינו מקביל ל-π לכל m` / `ℓ is not parallel to plane π for every m` — the 2024-א probe, a CLAIM. */
const neverParallelClaim: Rule = (s) => {
  const m =
    s.match(
      new RegExp(`^(?:הישר\\s+)?(${LINE_NAME.source})\\s+אינו\\s+מקביל\\s+ל-?(?:מישור\\s+)?(${PLANE_NAME.source})\\s+לכל\\s+([a-w])$`),
    ) ??
    s.match(
      new RegExp(
        `^(?:line\\s+)?(${LINE_NAME.source})\\s+is\\s+not\\s+parallel\\s+to\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})\\s+for\\s+(?:every|all|any)\\s+([a-w])$`,
      ),
    );
  if (!m) return null;
  return [{ type: 'claim', claim: { type: 'never-parallel', line: 'ℓ', plane: canonicalPlane(m[2]) } }];
};

/** Standalone `B על הישר ℓ` / `B is on line ℓ` — an on-line membership GIVEN (verified). */
const onLineMembership: Rule = (s) => {
  const m = s.match(
    new RegExp(`^([A-Z]\\d*'?)\\s+(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?(?:על הישר|on (?:the )?line)\\s+(${LINE_NAME.source})$`),
  );
  if (!m) return null;
  return [{ type: 'on-line', id: m[1], line: 'ℓ' }];
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
  const m = s.match(/^(?:נתון|נתונים|given)\s*:?\s+(.+)$/i);
  if (!m) return null;
  const itemRe = new RegExp(
    `(?:([a-w])\\s*=\\s*|([A-Z]\\d*'?)\\s*=?\\s*)\\(\\s*(${COMP})\\s*,\\s*(${COMP})\\s*,\\s*(${COMP})\\s*\\)`,
    'g',
  );
  const cmds: Command3[] = [];
  for (const g of m[1].matchAll(itemRe)) {
    const [x, y, z] = [compVal(g[3]), compVal(g[4]), compVal(g[5])];
    if (g[1]) {
      if (x === null || y === null || z === null) return null; // a vector value must be numeric
      cmds.push({ type: 'inject-vector', name: g[1], x, y, z });
    } else {
      cmds.push({ type: 'point3', id: g[2], x, y, z });
    }
  }
  return cmds.length > 0 ? cmds : null;
};

/** Standalone `v = (10,-5,0)` — a single vector injection. */
const vectorInjection: Rule = (s) => {
  const m = s.match(new RegExp(`^([a-w])\\s*=\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)$`));
  if (!m) return null;
  return [{ type: 'inject-vector', name: m[1], x: +m[2], y: +m[3], z: +m[4] }];
};

/** `שיעור ה-z של C' חיובי` / `the z-coordinate of C' is positive` — a sign branch given. */
const signGiven: Rule = (s) => {
  const m =
    s.match(/^שיעור\s+ה-?([xyz])\s+של\s+([A-Z]\d*'?)\s+(חיובי|שלילי)$/) ??
    s.match(/^the\s+([xyz])(?:-coordinate|\s+coordinate)\s+of\s+([A-Z]\d*'?)\s+is\s+(positive|negative)$/);
  if (!m) return null;
  return [{ type: 'sign-given', id: m[2], axis: m[1] as 'x' | 'y' | 'z', positive: m[3] === 'חיובי' || m[3] === 'positive' }];
};

/** `ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'` — planes THROUGH POINTS, then their line. */
const pointPlanesLine: Rule = (s) => {
  const RUN = `(?:[A-Z]\\d*'?){3,4}`;
  const m =
    s.match(
      new RegExp(
        `^(${LINE_NAME.source})\\s+(?:הוא\\s+)?ישר\\s+החיתוך\\s+(?:בין\\s+)?המישור\\s+(${RUN})\\s+(?:ל|ו)-?(?:בין\\s+)?המישור\\s+(${RUN})$`,
      ),
    ) ??
    s.match(
      new RegExp(
        `^(${LINE_NAME.source})\\s+is\\s+the\\s+intersection\\s+line\\s+of\\s+(?:the\\s+)?plane\\s+(${RUN})\\s+and\\s+(?:the\\s+)?plane\\s+(${RUN})$`,
      ),
    );
  if (!m) return null;
  const idsOf = (run: string) => run.match(/[A-Z]\d*'?/g)!;
  return [
    { type: 'plane-through', name: m[2], ids: idsOf(m[2]) },
    { type: 'plane-through', name: m[3], ids: idsOf(m[3]) },
    { type: 'plane-plane-line', name: 'ℓ', p1: m[2], p2: m[3] },
  ];
};

/** `המישור KBC: x + 2y + 3z - 26 = 0` — a plane-EQUATION claim on a plane through points. */
const planeEqClaim: Rule = (s) => {
  const m = s.match(/^(?:המישור\s+|plane\s+)((?:[A-Z]\d*'?){3,4})\s*:\s*(.+)$/);
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

/** `הישר A'C חותך את המישור BC'D בנקודה K` — a line through two points cutting a point-plane. */
const segLineCutsPointPlane: Rule = (s) => {
  const RUN = `(?:[A-Z]\\d*'?){3,4}`;
  const m =
    s.match(new RegExp(`^הישר\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+חותך\\s+(?:את\\s+)?המישור\\s+(${RUN})\\s+בנקודה\\s+([A-Z]\\d*'?)$`)) ??
    s.match(new RegExp(`^line\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+cuts\\s+(?:the\\s+)?plane\\s+(${RUN})\\s+at\\s+([A-Z]\\d*'?)$`));
  if (!m) return null;
  const [, a, b, run, id] = m;
  const lineName = `${a}${b}`;
  return [
    { type: 'line-through', name: lineName, a, b },
    { type: 'plane-through', name: run, ids: run.match(/[A-Z]\d*'?/g)! },
    { type: 'line-plane-point', id, line: lineName, plane: run },
  ];
};

/** `הזווית בין A'C לבין BC' היא 90` — the angle between two SEGMENT-lines (≤90°), a claim. */
const angleSegClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m =
    s.match(new RegExp(`^הזווית\\s+בין\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+(?:לבין|ל)-?\\s*([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+(?:היא|הוא)\\s+(${NUM})\\s*°?$`)) ??
    s.match(new RegExp(`^the\\s+angle\\s+between\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+and\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+is\\s+(${NUM})\\s*°?$`));
  if (!m) return null;
  const [, a1, b1, a2, b2, deg] = m;
  return [
    { type: 'segment3', a: a1, b: b1 },
    { type: 'segment3', a: a2, b: b2 },
    { type: 'claim', claim: { type: 'angle-seg-eq', a1, b1, a2, b2, deg: +deg } },
  ];
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

/** `∠PC'C = 82.1` / `הזווית PC'C היא 90` — the vertex form lowers to the angle-between-segments claim. */
const vertexAngleClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m = s.match(
    new RegExp(`^(?:∠|ה?זווית\\s+|the angle\\s+)([A-Z]\\d*'?)([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*(?:היא|הוא|is|=)\\s*(${NUM})\\s*°?$`),
  );
  if (!m) return null;
  const [, p, vertex, q, deg] = m;
  return [
    { type: 'segment3', a: vertex, b: p },
    { type: 'segment3', a: vertex, b: q },
    { type: 'claim', claim: { type: 'angle-seg-eq', a1: vertex, b1: p, a2: vertex, b2: q, deg: +deg } },
  ];
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
  let m =
    s.match(/קוסינוס\s+(?:ה?זווית\s+)?בין\s+(?:ה?וקטורים\s+)?([a-w])\s+ו-?\s*([a-w])\s+(?:הוא|היא|שווה\s+ל-?|=)\s*(.+)$/) ??
    s.match(/(?:the\s+)?cosine\s+of\s+the\s+angle\s+between\s+(?:the\s+vectors?\s+)?([a-w])\s+and\s+([a-w])\s+(?:is|equals?|=)\s*(.+)$/i) ??
    s.match(/^cos\s*(?:∠|∡)?\s*\(\s*([a-w])\s*,\s*([a-w])\s*\)\s*=\s*(.+)$/i);
  if (m) {
    const v = evalRadical(m[3].trim());
    return v === null ? null : [{ type: 'cos-angle', u: { kind: 'named', name: m[1] }, v: { kind: 'named', name: m[2] }, cos: v }];
  }
  // vertex form: cos∠ACB / cos ACB / קוסינוס הזווית ACB = value — rays CA, CB from the middle vertex
  m = s.match(/(?:cos|קוסינוס(?:\s+ה?זווית)?)\s*(?:∠|∡)?\s*([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s*(?:הוא|היא|שווה\s+ל-?|is|=)\s*(.+)$/i);
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
        `^(?:ה?נקודה\\s+)?${L}\\s+(?:נמצאת\\s+|נמצא\\s+)?על\\s+(?:ה?קטע\\s+|ה?צלע\\s+)?${L}${L}\\s+כך\\s+ש-?\\s*${L}${L}\\s+חוצ[הת]?\\s*-?\\s*(?:את\\s+)?(?:ה?זווית\\s+)?${L}${L}${L}\\s*$`,
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

/** `NK ו-PL מצטלבים` / `NK and PL are skew` (+ מקבילים/parallel, נחתכים/intersect) — mutual-position claims. */
const mutualPositionClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m =
    s.match(/^(?:הישרים\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s+ו-?([A-Z]\d*'?)([A-Z]\d*'?)\s+(מצטלבים|מקבילים|נחתכים)$/) ??
    s.match(/^(?:lines\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s+and\s+([A-Z]\d*'?)([A-Z]\d*'?)\s+are\s+(skew|parallel|intersecting)$/);
  if (!m) return null;
  const rel = m[5] === 'מצטלבים' || m[5] === 'skew' ? 'skew' : m[5] === 'מקבילים' || m[5] === 'parallel' ? 'parallel' : 'intersect';
  return [
    { type: 'segment3', a: m[1], b: m[2] },
    { type: 'segment3', a: m[3], b: m[4] },
    { type: 'claim', claim: { type: 'lines-rel', a1: m[1], b1: m[2], a2: m[3], b2: m[4], rel } },
  ];
};

/** `ABEC מלבן` / `ABEC is a rectangle` — completes the single unknown corner (verified right-angled). */
const rectComplete: Rule = (s) => {
  const m =
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:הוא\s+)?מלבן$/) ??
    s.match(/^([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s+is\s+a\s+rectangle$/) ??
    s.match(/^מלבן\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)$/);
  if (!m) return null;
  return [{ type: 'rect-complete', ids: [m[1], m[2], m[3], m[4]] }];
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
  const through = s.match(/(?:דרך|through)\s+([A-Z]\d*'?)(?:\s*(?:ו-?|and|,)\s*([A-Z]\d*'?))?/);
  if (!through) return null;
  const edge = s.match(/(?:ניצב|מאונך|אנך|מקביל|perpendicular|parallel)\s*(?:ל|to)?\s*-?\s*(?:ה?מקצוע\s+|ה?קטע\s+|ה?ישר\s+|the\s+edge\s+|edge\s+|line\s+)?([A-Z]\d*'?)\s*([A-Z]\d*'?)(?![A-Z0-9'])/);
  if (!edge || !edge[1] || !edge[2]) return null;
  const nameM = s.match(new RegExp(`(?:מישור|plane)\\s+(${PN})`, 'i'));
  const name = nameM ? canonicalPlane(nameM[1]) : 'π';
  if (perp) return [{ type: 'rel-plane', name, rel: 'perp', through: [through[1]], a: edge[1], b: edge[2] }];
  if (!through[2]) return null; // ∥ an edge needs TWO through-points to fix the plane (1-DOF otherwise — deferred)
  return [{ type: 'rel-plane', name, rel: 'par', through: [through[1], through[2]], a: edge[1], b: edge[2] }];
};

/**
 * V8-b (G2): a point where a plane crosses an edge/segment. `המישור π חותך את SA בנקודה E`
 * / `plane π cuts SA at E` / `E חיתוך המישור π עם SA` / `E is the intersection of plane π with SA`.
 */
const planeCut: Rule = (s) => {
  if (!/מישור|\bplane\b/i.test(s)) return null;
  if (!/חות|חיתוך|נחתך|\bcuts?\b|intersect|\bmeets?\b/i.test(s)) return null;
  let m =
    s.match(new RegExp(`(?:ה?מישור)\\s+(${PN})\\s+חות[ךכ]\\s+(?:את\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+(?:בנקודה\\s+|ב-?)([A-Z]\\d*'?)$`)) ??
    s.match(new RegExp(`plane\\s+(${PN})\\s+(?:cuts|intersects|meets)\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+at\\s+([A-Z]\\d*'?)$`, "i"));
  if (m) return [{ type: "plane-cut", id: m[4], plane: canonicalPlane(m[1]), a: m[2], b: m[3] }];
  m =
    s.match(new RegExp(`^([A-Z]\\d*'?)\\s+(?:היא\\s+)?(?:נקודת\\s+ה?חיתוך\\s+של\\s+|ה?חיתוך\\s+(?:של\\s+)?)?(?:ה?מישור)\\s+(${PN})\\s+(?:עם|ו)\\s+(?:ה?מקצוע\\s+|ה?קטע\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)$`)) ??
    s.match(new RegExp(`^([A-Z]\\d*'?)\\s+is\\s+the\\s+intersection\\s+of\\s+plane\\s+(${PN})\\s+with\\s+(?:the\\s+edge\\s+|edge\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)$`, "i"));
  if (m) return [{ type: "plane-cut", id: m[1], plane: canonicalPlane(m[2]), a: m[3], b: m[4] }];
  return null;
};

/**
 * V8-g: a FLAT polygon of free points in the plane (the 2-D vector lane) — `משולש ABC`
 * (triangle), `מרובע MKNL` (quadrilateral), `מחומש ABCDE` (pentagon). Excludes the 3-D
 * solid words (a prism/pyramid rule owns those). Label-less ⇒ default lettering.
 */
const planarPolygon: Rule = (s) => {
  if (/מנסרה|פירמידה|\bprism\b|\bpyramid\b/i.test(s)) return null;
  const kind: 'polygon3' | 'polygon4' | 'polygon5' | null =
    /משולש/.test(s) || /\btriangle\b/i.test(s) ? 'polygon3' :
    /מרובע/.test(s) || /\b(quadrilateral|quad)\b/i.test(s) ? 'polygon4' :
    /מחומש/.test(s) || /\bpentagon\b/i.test(s) ? 'polygon5' : null;
  if (!kind) return null;
  const n = kind === 'polygon3' ? 3 : kind === 'polygon4' ? 4 : 5;
  const toks = firstLabelRun(s);
  if (toks.length === n) return [{ type: 'solid', kind, ids: toks }];
  if (toks.length === 0) return [{ type: 'solid', kind, ids: ['A', 'B', 'C', 'D', 'E'].slice(0, n) }];
  return null;
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
  let m = s.match(new RegExp(`גובה\\s+(?:ה?משולש\\s+)?${SIDE}${L}${L}\\s+(?:הוא|היא)\\s+${L}${L}`)); // ...לצלע AB הוא CD
  if (m) return [{ type: 'altitude-foot', id: m[4], from: m[3], a: m[1], b: m[2] }];
  m = s.match(new RegExp(`${L}${L}\\s+(?:הוא\\s+|היא\\s+)?גובה\\s+(?:ה?משולש\\s+)?${SIDE}${L}${L}`)); // CD גובה לצלע AB
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

const RULES: Rule[] = [
  cubeOrBox,
  rhombusPrism,
  rightPrism,
  volumeEqPoly, // BEFORE volumePolyClaim: its RHS is a volume, not a number
  volumePolyClaim, // BEFORE rightPyramid: נפח הפירמידה ABCD must never build a pyramid
  rightPyramid,
  dotEqGiven, // `u·v = v·w` (a dot RHS) — before dotGiven, which only matches a numeric RHS
  dotGiven,
  cosAngleGiven, // V8-f (G6): cos∠ACB / cos(u,v) — before the plane-angle & vertex-angle rules
  equalAnglesGiven, // V8-f (G10): AE makes equal angles with AB, AD
  revolutionSolid,
  volumeClaim,
  lateralAreaClaim,
  parametricLine, // before planeByEquation: both carry `:`, but ℓ ≠ π so either order is safe — kept explicit
  planeByEquation,
  planeEqClaim, // plane named by POINTS + an equation — a claim, not a definition
  relPlaneRule, // `מישור π דרך F וניצב ל-SC` — before planeThroughBare (which is bare points)
  planeCut, // `המישור π חותך את SA בנקודה E` — before onSegment/coordPoint grab the tokens
  planeThroughBare, // bare `מישור ABC` — after the `:`-carrying plane rules
  injectionList,
  signGiven,
  pointPlanesLine, // point-run planes before the π-name intersection rule
  segLineCutsPointPlane, // `הישר A'C חותך את המישור BC'D בנקודה K` — before the ℓ-name cut rule
  coordPoint,
  vectorInjection,
  onAxes, // `על ציר ה-x` before the generic membership/on-segment rules
  membership, // before onSegment: `על אחד המישורים` must never read as a point-on-segment
  pointRelPlane, // on/above/below a point-run plane (+ above/below π) — likewise before onSegment
  onLineMembership, // likewise for `על הישר ℓ`
  linePlaneAngle, // `הזווית בין הישר AC' לבין המישור ABCD היא 30` — before angleBetweenPlanes/angleSegClaim
  angleBetweenPlanes,
  angleSegClaim,
  vertexAngleClaim,
  mutualPositionClaim,
  rectComplete,
  linePerpPlane,
  neverParallelClaim,
  lineCutsPlane,
  dropPerpToPlane,
  intersectionLine,
  dropPerpToLine,
  nameVectors,
  centroidRule,
  diagIntersection, // `מפגש האלכסונים` — before onSegment/midpoint grab the tokens
  bisectorPoint, // V8-f (G11): `D על AC כך ש-OD חוצה זווית AOC` — before onSegment grabs `D על AC`
  perpPlaneClaim,
  segParallelPlane,
  collinearClaim,
  midpoint,
  spanPoint, // MUST precede onSegment: Greek scalars would otherwise parse as a free point, silently dropping the condition
  onSegment,
  lengthRel, // BEFORE vecEqClaim: bare AS = AB is a LENGTH equality unless ⃗-marked
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
  planarPolygon, // V8-g: bare `משולש/מרובע/מחומש` — after the שטח/מפגש/prism/pyramid consumers of those nouns
  bareSegment,
];

// ---------------------------------------------------------------------------

export function parse3(utterance: string): ParseResult3 {
  // an explicit vector arrow (⃗/→, stripped by normalize3) marks bare pair=pair as a
  // VECTOR equation; without it, AS = AB reads as a LENGTH equality (the bagrut default)
  VEC_MARKED = /[→⃗⟶]/.test(utterance) || /(?:^|[\s:,])(?:ה?ו?וקטור|vectors?)\s/i.test(utterance);
  const s = normalize3(utterance);
  if (!s) return NOT_HANDLED;
  if (!VEC_MARKED && /^([A-Z]\d*'?)([A-Z]\d*'?)\s*=\s*([A-Z]\d*'?)([A-Z]\d*'?)\s*$/.test(s))
    return { ok: false, reason: 'ambiguous-vector-length' };
  for (const rule of RULES) {
    const commands = rule(s);
    if (commands) return { ok: true, commands };
  }
  return NOT_HANDLED;
}
