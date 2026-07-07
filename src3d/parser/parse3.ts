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

import type { Command3, Id, LinExpr, SymTerm, VecExpr } from '../engine/types';

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

/** Right triangular prism: `מנסרה ישרה (משולשת) ABCA'B'C'` — 6 vertices, or 3 auto-primed. */
const rightPrism: Rule = (s) => {
  if (!/מנסרה/.test(s) && !/\bprism\b/i.test(s)) return null;
  if (!/ישרה/.test(s) && !/\bright\b/i.test(s)) return null; // oblique unsupported in V0 — honest refusal
  const toks = labelTokens(s);
  if (toks.length === 6) return [{ type: 'solid', kind: 'prism3', ids: toks }];
  if (toks.length === 3 && toks.every(unprimed)) return [{ type: 'solid', kind: 'prism3', ids: [...toks, ...primeAll(toks)] }];
  if (toks.length === 0 && (/משולש/.test(s) || /\btriangular\b/i.test(s)))
    return [{ type: 'solid', kind: 'prism3', ids: ['A', 'B', 'C', ...primeAll(['A', 'B', 'C'])] }];
  return null;
};

/** Right pyramid: `פירמידה ישרה ABCDS` / `ABCS`. WITHOUT ישרה, 4 ids = a GENERAL tetrahedron (V7 T2). */
const rightPyramid: Rule = (s) => {
  if (!/פירמידה/.test(s) && !/\bpyramid\b/i.test(s)) return null;
  const right = /ישרה/.test(s) || /\bright\b/i.test(s);
  const square = /ריבוע/.test(s) || /\bsquare\b/i.test(s);
  const toks = labelTokens(s);
  if (toks.length === 0) {
    // label-less: a stated base word makes the shape determined — default lettering
    // (base ring first, apex last), deterministic; bare 'פירמידה' stays ambiguous
    const rect = /מלבן/.test(s) || /\brectang/i.test(s);
    const tri = /משולש/.test(s) || /\btriangular\b/i.test(s);
    if (tri) return [{ type: 'solid', kind: right ? 'pyramid3' : 'tetra', ids: ['A', 'B', 'C', 'D'] }];
    if (square || rect) {
      const kind = right ? (square ? 'pyramid4' : 'pyramid4r') : square ? ('pyramid4g' as const) : 'pyramid4gr';
      return [{ type: 'solid', kind, ids: ['A', 'B', 'C', 'D', 'S'] }];
    }
    return null;
  }
  if (toks.length === 5) {
    // rightness and base shape are INDEPENDENT givens (ADR-052): a square base must be
    // STATED (שבסיסה ריבוע / with a square base); unstated = free-aspect rectangle DOF
    const kind = right ? (square ? 'pyramid4' : 'pyramid4r') : square ? ('pyramid4g' as const) : 'pyramid4gr';
    return [{ type: 'solid', kind, ids: toks }];
  }
  if (right && toks.length === 4) return [{ type: 'solid', kind: 'pyramid3', ids: toks }];
  if (!right && toks.length === 4) return [{ type: 'solid', kind: 'tetra', ids: toks }]; // general — apex free
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
  // [coefficient ·]? tail — tail is |ZW|, |w|, אורך/length ZW, צלע הריבוע ABCD, or bare ZW
  const tail = (re: string): { c: number; g: string[] } | null => {
    const mm = r.match(new RegExp(`^(.*?)\\s*[·×*]?\\s*${re}\\s*$`));
    if (!mm) return null;
    const c = mm[1].trim() === '' ? 1 : evalRadical(mm[1]);
    return c === null ? null : { c, g: mm.slice(2) };
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
  const m = s.match(new RegExp(`^(?:המישור\\s+|plane\\s+)?(${PLANE_NAME.source})\\s*:\\s*(.+)$`));
  if (!m) return null;
  const eq = parseLinearEq(m[m.length - 1]);
  if (!eq) return null;
  return [
    {
      type: 'plane3',
      name: canonicalPlane(m[1]),
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

/** `הזווית בין המישורים π1 ו-π2 היא 45` / `the angle between planes π1 and π2 is 45`. */
const angleBetweenPlanes: Rule = (s) => {
  const m = s.match(
    new RegExp(
      `^(?:הזווית בין המישורים|the angle between (?:the )?planes)\\s+(${PLANE_NAME.source})\\s*(?:ל|ו|and)-?\\s*(${PLANE_NAME.source})\\s*(?:היא|הוא|is|=)?\\s*(${NUM})\\s*°?$`,
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
  // an utterance that names the solid but binds NOTHING legible refuses (never a half-read)
  if (!apex && !center && radius === undefined && height === undefined) return null;
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
  const part = s.match(/^(?:הקודקוד\s+|הנקודה\s+)?([A-Z]\d*'?)\s+(?:נמצאת?\s+)?על\s+החלק\s+(החיובי|השלילי)\s+של\s+ציר\s+ה-?([xyz])$/);
  if (part) {
    const ax = part[3] as 'x' | 'y' | 'z';
    const zero = { x: 0 as number | null, y: 0 as number | null, z: 0 as number | null };
    zero[ax] = null;
    return [
      { type: 'point3', id: part[1], x: zero.x, y: zero.y, z: zero.z },
      { type: 'sign-given', id: part[1], axis: ax, positive: part[2] === 'החיובי' },
    ];
  }
  const axis = s.match(
    /^([A-Z]\d*'?)\s+(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?(?:על ציר ה-?([xyz])(?:\s+(החיובי|השלילי))?|on the (positive |negative )?([xyz])[- ]axis)$/,
  );
  if (!axis) return null;
  const id = axis[1];
  const ax = (axis[2] ?? axis[5]) as 'x' | 'y' | 'z';
  const signWord = axis[3] ?? axis[4]?.trim();
  const zero = { x: 0 as number | null, y: 0 as number | null, z: 0 as number | null };
  zero[ax] = null; // the on-axis coordinate stays free
  const cmds: Command3[] = [{ type: 'point3', id, x: zero.x, y: zero.y, z: zero.z }];
  if (signWord) cmds.push({ type: 'sign-given', id, axis: ax, positive: signWord === 'החיובי' || signWord === 'positive' });
  return cmds;
};

/** `∠PC'C = 82.1` / `הזווית PC'C היא 90` — the vertex form lowers to the angle-between-segments claim. */
const vertexAngleClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m = s.match(
    new RegExp(`^(?:∠|הזווית\\s+|the angle\\s+)([A-Z]\\d*'?)([A-Z]\\d*'?)([A-Z]\\d*'?)\\s*(?:היא|הוא|is|=)\\s*(${NUM})\\s*°?$`),
  );
  if (!m) return null;
  const [, p, vertex, q, deg] = m;
  return [
    { type: 'segment3', a: vertex, b: p },
    { type: 'segment3', a: vertex, b: q },
    { type: 'claim', claim: { type: 'angle-seg-eq', a1: vertex, b1: p, a2: vertex, b2: q, deg: +deg } },
  ];
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

const RULES: Rule[] = [
  cubeOrBox,
  rhombusPrism,
  rightPrism,
  volumeEqPoly, // BEFORE volumePolyClaim: its RHS is a volume, not a number
  volumePolyClaim, // BEFORE rightPyramid: נפח הפירמידה ABCD must never build a pyramid
  rightPyramid,
  dotGiven,
  revolutionSolid,
  volumeClaim,
  lateralAreaClaim,
  parametricLine, // before planeByEquation: both carry `:`, but ℓ ≠ π so either order is safe — kept explicit
  planeByEquation,
  planeEqClaim, // plane named by POINTS + an equation — a claim, not a definition
  injectionList,
  signGiven,
  pointPlanesLine, // point-run planes before the π-name intersection rule
  segLineCutsPointPlane, // `הישר A'C חותך את המישור BC'D בנקודה K` — before the ℓ-name cut rule
  coordPoint,
  vectorInjection,
  onAxes, // `על ציר ה-x` before the generic membership/on-segment rules
  membership, // before onSegment: `על אחד המישורים` must never read as a point-on-segment
  onLineMembership, // likewise for `על הישר ℓ`
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
  heightOfSolid,
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
