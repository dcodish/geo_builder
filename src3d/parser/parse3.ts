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

import type { Command3, Id, LinExpr, VecExpr } from '../engine/types';

export type ParseResult3 = { ok: true; commands: Command3[] } | { ok: false; reason: 'not-handled' };

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
  return null;
};

/** Right triangular prism: `מנסרה ישרה (משולשת) ABCA'B'C'` — 6 vertices, or 3 auto-primed. */
const rightPrism: Rule = (s) => {
  if (!/מנסרה/.test(s) && !/\bprism\b/i.test(s)) return null;
  if (!/ישרה/.test(s) && !/\bright\b/i.test(s)) return null; // oblique unsupported in V0 — honest refusal
  const toks = labelTokens(s);
  if (toks.length === 6) return [{ type: 'solid', kind: 'prism3', ids: toks }];
  if (toks.length === 3 && toks.every(unprimed)) return [{ type: 'solid', kind: 'prism3', ids: [...toks, ...primeAll(toks)] }];
  return null;
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
 * The stated-ratio clause `AK = 2KA'` (P K = c · K Q, K the new point): t from P is c/(c+1).
 * Returns the t measured from segment endpoint `a`; 'invalid' when a ratio clause is present
 * but doesn't fit the segment (never silently dropped); undefined when no clause is stated.
 */
function ratioT(s: string, id: Id, a: Id, b: Id): number | 'invalid' | undefined {
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
    /^([A-Z]\d*'?)([A-Z]\d*'?)\s+(?:מאונך|ניצב|⊥|(?:is\s+)?perpendicular)\s*(?:ל|to\s+(?:the\s+)?)?\s*(?:מישור|plane)\s+([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)\s*$/,
  );
  if (!m) return null;
  const [, s1, s2, p1, p2, p3] = m;
  return [
    { type: 'segment3', a: s1, b: s2 },
    { type: 'segment3', a: p1, b: p2 },
    { type: 'segment3', a: p2, b: p3 },
    { type: 'segment3', a: p3, b: p1 },
    { type: 'claim', claim: { type: 'perp-plane', seg: [s1, s2], plane: [p1, p2, p3] } },
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

/** `AM = ½u + ½v + 5/3w` (both sides linear combinations) — the student's ANSWER, a claim. */
const vecEqClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  if (GREEK.test(s)) return null; // unknown scalars belong to spanPoint, never a claim
  const parts = s.split('=');
  if (parts.length !== 2) return null;
  const lhs = parseVecExpr(parts[0]);
  const rhs = parseVecExpr(parts[1]);
  if (!lhs || !rhs) return null;
  return [...segmentsOf(lhs), ...segmentsOf(rhs), { type: 'claim', claim: { type: 'vec-eq', lhs, rhs } }];
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

/** Plane names: π1 / pi1 → canonical `π1`. */
const PLANE_NAME = /(?:π|pi|Pi|PI)\s?(\d+)/;
const canonicalPlane = (s: string): string => `π${s.match(/\d+/)![0]}`;
/** Line names: ℓ or l → canonical `ℓ`. */
const LINE_NAME = /[ℓl]/;

/**
 * Parse a linear equation in x,y,z with ONE optional lowercase parameter letter
 * (`ay + z - 8 = 0`). Returns each coefficient as a LinExpr (k + p·param).
 * Null on anything else — never a partial read.
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
    const terms = side
      .trim()
      .split(/(?=[+-])/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return false;
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

/** `A(2,-2,6)` (+ optional membership tail: `נמצאת על אחד המישורים` / `is on one of the planes` / `על המישור π2`). */
const coordPoint: Rule = (s) => {
  const m = s.match(
    new RegExp(`^(?:הנקודה\\s+|point\\s+)?([A-Z]\\d*'?)\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)\\s*(.*)$`),
  );
  if (!m) return null;
  const [, id, x, y, z, restRaw] = m;
  const cmds: Command3[] = [{ type: 'point3', id, x: +x, y: +y, z: +z }];
  const rest = restRaw.trim();
  if (rest) {
    if (/^(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?(?:על אחד המישורים|on one of the planes)$/.test(rest)) {
      cmds.push({ type: 'on-planes', id, plane: 'any' });
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
  rightPrism,
  planeByEquation,
  coordPoint,
  membership, // before onSegment: `על אחד המישורים` must never read as a point-on-segment
  angleBetweenPlanes,
  dropPerpToPlane,
  intersectionLine,
  dropPerpToLine,
  nameVectors,
  centroidRule,
  perpPlaneClaim,
  collinearClaim,
  midpoint,
  spanPoint, // MUST precede onSegment: Greek scalars would otherwise parse as a free point, silently dropping the condition
  onSegment,
  vecEqClaim,
  areaClaim,
  lengthClaim,
  bareSegment,
];

// ---------------------------------------------------------------------------

export function parse3(utterance: string): ParseResult3 {
  const s = normalize3(utterance);
  if (!s) return NOT_HANDLED;
  for (const rule of RULES) {
    const commands = rule(s);
    if (commands) return { ok: true, commands };
  }
  return NOT_HANDLED;
}
