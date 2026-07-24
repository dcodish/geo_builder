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

import type { Command3, Id, LinExpr, SolidKind, SymTerm, VecAtom, VecExpr } from '../engine/types';

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

/** Normalise an utterance: unify primes to `'`, strip vector arrows (AB→ ≡ AB),
 *  unify minus/maqaf to `-`, collapse whitespace, uplift anchored lowercase labels (#181). */
export function normalize3(s: string): string {
  return upliftLowercaseLabels(
    s
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
      .trim(),
  );
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

/** Right prism, dispatched by its BASE shape (#117): `מנסרה ישרה [שבסיסה <shape>] <labels>`.
 *  triangle→prism3, equilateral→prism3e, parallelogram→prism4, general quad→prism4g, square→prism4sq,
 *  rectangle→box, pentagon→prismReg5, hexagon→prismReg6. (Rhombus is left to `rhombusPrism`.) Labels: the
 *  2n primed run, or n unprimed auto-primed, or a base noun with no labels → the default A,B,C(,D…) base.
 *  A bare `מנסרה ישרה` with NO base noun and no labels stays the honest ADR-052 refusal. */
const rightPrism: Rule = (s) => {
  if (!/מנסרה/.test(s) && !/\bprism\b/i.test(s)) return null;
  if (!/ישרה/.test(s) && !/\bright\b/i.test(s)) return null; // oblique unsupported — honest refusal
  if (/מעוין/.test(s) || /\brhombus\b/i.test(s)) return null; // rhombus base → rhombusPrism
  const equi = /שווה[\s-]?צלעות/.test(s) || /כל\s+מקצועותיה\s+שוו/.test(s) || /\bequilateral\b/i.test(s);
  let kind: SolidKind, bn: number, namedBase: boolean;
  if (/מקבילית/.test(s) || /\bparallelogram\b/i.test(s)) { kind = 'prism4'; bn = 4; namedBase = true; }
  else if (/מלבן/.test(s) || /\brectangle\b/i.test(s)) { kind = 'box'; bn = 4; namedBase = true; }
  else if (/ריבוע/.test(s) || /\bsquare\b/i.test(s)) { kind = 'prism4sq'; bn = 4; namedBase = true; }
  else if (/מרובע/.test(s) || /\bquadrilateral\b/i.test(s) || /\bquad\b/i.test(s)) { kind = 'prism4g'; bn = 4; namedBase = true; }
  else if (/מחומש/.test(s) || /\bpentagon\b/i.test(s)) { kind = 'prismReg5'; bn = 5; namedBase = true; }
  else if (/משושה/.test(s) || /\bhexagon\b/i.test(s)) { kind = 'prismReg6'; bn = 6; namedBase = true; }
  else { kind = equi ? 'prism3e' : 'prism3'; bn = 3; namedBase = /משולש/.test(s) || /\btriangular\b/i.test(s) || equi; }
  const base = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, bn);
  const toks = firstLabelRun(s);
  if (toks.length === 2 * bn) return [{ type: 'solid', kind, ids: toks }];
  if (toks.length === bn && toks.every(unprimed)) return [{ type: 'solid', kind, ids: [...toks, ...primeAll(toks)] }];
  if (toks.length === 0 && namedBase) return [{ type: 'solid', kind, ids: [...base, ...primeAll(base)] }];
  return null;
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

/** The oblique parallelepiped `מקבילון` / `parallelepiped` (#117): a parallelogram base translated by a
 *  FREE lateral vector — 8 labels, or 4 auto-primed, or the default ABCD base. Allowed despite being
 *  oblique: it is a NAMED oblique solid carrying its own free DOF, so it asserts no unstated "right" given.
 *
 *  #295: a bare `מנסרה שבסיסה מקבילית` / `prism with a parallelogram base` (a parallelogram-base prism with
 *  NO `ישרה`) is the SAME oblique solid (ADR-052: rightness is unstated, so the lateral tilt is a free DOF,
 *  pinned upright by `המנסרה ישרה`, #289). `rightPrism` owns the `ישרה` form (→ `prism4`); only the
 *  parallelogram has an oblique model, so other bases without `ישרה` stay `rightPrism`'s honest refusal. */
const parallelepiped: Rule = (s) => {
  const named = /מקבילון/.test(s) || /\bparallelepiped\b/i.test(s);
  const barePrismPar =
    (/מנסרה/.test(s) || /\bprism\b/i.test(s)) &&
    !/ישרה/.test(s) &&
    !/\bright\b/i.test(s) &&
    (/מקבילית/.test(s) || /\bparallelogram\b/i.test(s)) &&
    !/מעוין/.test(s) &&
    !/\brhombus\b/i.test(s);
  if (!named && !barePrismPar) return null;
  const toks = firstLabelRun(s);
  if (toks.length === 8) return [{ type: 'solid', kind: 'parallelepiped', ids: toks }];
  if (toks.length === 4 && toks.every(unprimed)) return [{ type: 'solid', kind: 'parallelepiped', ids: [...toks, ...primeAll(toks)] }];
  if (toks.length === 0) return [{ type: 'solid', kind: 'parallelepiped', ids: ['A', 'B', 'C', 'D', ...primeAll(['A', 'B', 'C', 'D'])] }];
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
  // the triangular-base pyramid kind (equilateral only when right — a right equilateral pyramid)
  const triKind = right ? (equi ? 'pyramid3e' : 'pyramid3') : 'tetra';
  if (firstLabelRun(s).length === 0) {
    // label-less: a stated base word makes the shape determined — default lettering
    const rect = /מלבן/.test(s) || /\brectang/i.test(s);
    const tri = tetraWord || /משולש/.test(s) || /\btriangular\b/i.test(s) || equi;
    if (par) return withEqEdges([{ type: 'solid', kind: 'pyramidPar', ids: ['A', 'B', 'C', 'D', 'S'] }]);
    if (tri) return withEqEdges([{ type: 'solid', kind: triKind, ids: ['A', 'B', 'C', 'D'] }]);
    if (square || rect) {
      const kind = right ? (square ? 'pyramid4' : 'pyramid4r') : square ? ('pyramid4g' as const) : 'pyramid4gr';
      return withEqEdges([{ type: 'solid', kind, ids: ['A', 'B', 'C', 'D', 'S'] }]);
    }
    return null;
  }
  const toks = orientPyramid(s, firstLabelRun(s));
  // a tetrahedron has exactly 4 vertices — a 5-label `טטראדר` is contradictory (refuse → honest)
  if (toks.length === 5 && !tetraWord) {
    if (par) return withEqEdges([{ type: 'solid', kind: 'pyramidPar', ids: toks }]);
    // rightness and base shape are INDEPENDENT givens (ADR-052): a square base must be STATED
    const kind = right ? (square ? 'pyramid4' : 'pyramid4r') : square ? ('pyramid4g' as const) : 'pyramid4gr';
    return withEqEdges([{ type: 'solid', kind, ids: toks }]);
  }
  if (toks.length === 4) return withEqEdges([{ type: 'solid', kind: triKind, ids: toks }]);
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

/** `M אמצע BC` / `M is the midpoint of BC` → on-segment t = ½.
 *  #225 (ADR-3D-048): the UN-named `אמצע BB'` / `midpoint of BB'` (2 tokens) lowers to
 *  `midpoint-auto` — the label is picked at APPLY, where the taken ids are known. */
const midpoint: Rule = (s) => {
  if (!/אמצע/.test(s) && !/\b(midpoint|middle)\b/i.test(s)) return null;
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
  // the intersection verb, in every form the student writes it: מפגש (noun), חיתוך/נחתכ (cut),
  // and נפגש (meet — both nun endings נפגשים/נפגשות, the ADR-3D-035 `קט[ןנ]` discipline). «נפגשים»
  // was the one gap the operator hit — «נחתכים» worked, «נפגשים» didn't (#284).
  if (!/מפגש|נפגש|נחתכ|חיתוך|intersection|meet/i.test(s)) return null;
  const toks = labelTokens(s);
  if (toks.length === 0) return null;
  // The crossing point is named by a TRAILING marker when the student writes «…נפגשים בנקודה O» /
  // «…meet at O» (the point LAST); otherwise it is the FIRST label («O מפגש אלכסוני ABCD», point
  // first). Reading the first token as the crossing regardless — the old behaviour — silently
  // mis-bound the point-last form (English «diagonals of ABCD meet at O» built id=A, face=[B,C,D,O]).
  const trailing = s.match(/(?:בנקוד[הת]|at)\s+([A-Z]\d*'?)\s*$/i);
  const [id, ...rest] = trailing ? [trailing[1], ...toks.filter((t) => t !== trailing[1])] : toks;
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

/** `CA' מאונך למישור BC'D` / `CA' is perpendicular to plane BC'D` — a CLAIM; draws the segment + the plane triangle.
 *  The plane keyword is optional when the target run is 3–4 points (`MO ⊥ABCD`, issue #14) —
 *  a run of ≥3 points can only be a plane (a segment is exactly 2), so the symbol form is unambiguous. */
const perpPlaneClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m = s.match(
    /^([A-Z]\d*'?)([A-Z]\d*'?)\s*(?:מאונך|ניצב|אנך|⊥|(?:is\s+)?perpendicular)\s*(?:ל|to\s+(?:the\s+)?)?\s*(?:מישור|plane)?\s*([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)([A-Z]\d*'?)?\s*$/,
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
 * A target run of 3–4 points is a PLANE and stays with perpPlaneClaim (which runs first).
 */
const perpSegGiven: Rule = (s0) => {
  const s = stripProofPrefix(s0);
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
  /^([+-])?\s*(?:\(([^()]+)\)\s*[·×*]?\s*)?((?:\d+(?:\.\d+)?)?\s*(?:√\s*\d+(?:\.\d+)?)?(?:\s*\/\s*\d+(?:\.\d+)?)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛])?\s*[·×*]?\s*([a-w])?\s*[·×*]?\s*(?:([A-Z]\d*'?)([A-Z]\d*'?)|([a-z]))\s*(?:\/\s*(\d+(?:\.\d+)?))?$/;

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
  if (!m) return null;
  return [{ type: 'perp-to-base', from: m[1] }];
};

/** A bare auxiliary segment: `AM` / `קטע AM` / `segment CA'` — plus the #72 prod forms: the
 *  connect-imperative (`נחבר את D'F`) and the diagonal noun (`אלכסון BD'` — a diagonal IS a
 *  segment, pure ink; the final-ם slip `אלכסום` admitted per the ADR-3D-035 מאונ[כך] precedent).
 *  Last rule — everything else wins first. */
const bareSegment: Rule = (s) => {
  const m = s.match(
    /^(?:קטע\s+|העבירו\s+(?:את\s+)?|נ?חבר\s+(?:את\s+)?|ה?אלכסו[ןם]\s+|segment\s+|draw\s+|connect\s+|join\s+|(?:the\s+)?diagonal\s+)?([A-Z]\d*'?)([A-Z]\d*'?)\s*$/,
  );
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

/** Parse `m-1` / `5-m` / `-2` / `2m` → a LinExpr (k + p·param). Null on anything else. */
export function parseParamExpr(src: string): { expr: LinExpr; param?: string } | null {
  const terms = splitTopLevelTerms(src);
  if (!terms || terms.length === 0) return null;
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
  const m = s.match(new RegExp(`^(?:ה?מישור\\s+|(?:the\\s+)?plane\\s+)?(${PLANE_NAME.source})?\\s*(?::|הוא\\s|is\\s)?\\s*([^:]*=[^:]*)$`));
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

/** `A(2,-2,6)` / `A(3,n,p)` / `נתונה נקודה M(k,1,3), k הוא פרמטר חיובי` (+ optional
 *  membership tail: `נמצאת על אחד המישורים` / `על המישור π2` / `על הישר ℓ`). */
const coordPoint: Rule = (s) => {
  const m = s.match(
    new RegExp(`^(?:נתונה\\s+)?(?:ה?נקודה\\s+|point\\s+)?([A-Z]\\d*'?)\\s*\\(\\s*(${COMP})\\s*,\\s*(${COMP})\\s*,\\s*(${COMP})\\s*\\)\\s*(.*)$`),
  );
  if (!m) return null;
  const [, id, x, y, z, restRaw] = m;
  const syms = [x, y, z].map((t) => (/^[a-w]$/.test(t) ? t : null)) as [string | null, string | null, string | null];
  const cmds: Command3[] = [
    syms.some((t) => t !== null)
      ? { type: 'point3', id, x: compVal(x), y: compVal(y), z: compVal(z), syms }
      : { type: 'point3', id, x: compVal(x), y: compVal(y), z: compVal(z) },
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
    const onLine = rest.match(new RegExp(`^(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?(?:על הישר|on (?:the )?line)\\s+(${LINE_NAME.source})$`));
    if (/^(?:נמצאת\s+|נמצא\s+|is\s+|lies\s+)?(?:על אחד המישורים|on one of the planes)$/.test(rest)) {
      cmds.push({ type: 'on-planes', id, plane: 'any' });
    } else if (onLine) {
      cmds.push({ type: 'on-line', id, line: canonicalLine(onLine[1]) });
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
      new RegExp(`^ה?זו?וית\\s+בין\\s+ה?ישר\\s+([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+ל?בין\\s+ה?מישור\\s+((?:[A-Z]\\d*'?){3,4})\\s*(?:היא|הוא|=)\\s*(${NUM})\\s*°?$`),
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
      `^(?:הזו?וית בין ה?מישור(?:ים)?|the angle between (?:the )?planes)\\s+(${PLANE_NAME.source})\\s*(?:ל|ו|and)-?\\s*(${PLANE_NAME.source})\\s*(?:היא|הוא|is|=)?\\s*(${NUM})\\s*°?$`,
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
  const touch = (s.match(/(?:בנקודה|at)\s+([A-Z]\d*'?)/i) ?? [])[1];
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

/** `ℓ ישר החיתוך בין המישורים π1 ו-π2` / `ℓ is the intersection line of π1 and π2`. */
const intersectionLine: Rule = (s) => {
  const m = s.match(
    new RegExp(
      `^(${LINE_NAME.source})\\s+(?:הוא\\s+)?(?:ישר\\s+החיתוך|is the (?:intersection line|line of intersection))\\s+(?:בין\\s+)?(?:המישורים\\s+|of\\s+(?:the\\s+)?(?:planes\\s+)?)?(${PLANE_NAME.source})\\s*(?:ל|ו|and)-?\\s*(${PLANE_NAME.source})$`,
    ),
  );
  if (!m) return null;
  return [{ type: 'plane-plane-line', name: canonicalLine(m[1]), p1: canonicalPlane(m[2]), p2: canonicalPlane(m[4]) }];
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
    s.match(new RegExp(`^(?:הישר\\s+|line\\s+)?${NAME}\\s*:\\s*(.+)$`)) ??
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
  if (!head) return null;
  const m = head[2].match(/^(?:x\s*=\s*)?\(([^()]*)\)\s*\+\s*t\s*[·×*]?\s*\(([^()]*)\)$/);
  if (!m) return null;
  const triple = (str: string) => str.split(',').map((p) => parseParamExpr(p));
  const anchor = triple(m[1]);
  const dir = triple(m[2]);
  if (anchor.length !== 3 || dir.length !== 3 || [...anchor, ...dir].some((x) => !x)) return null;
  const params = new Set([...anchor, ...dir].flatMap((x) => (x!.param ? [x!.param] : [])));
  if (params.size > 1) return null;
  const isLineName = LINE_NAME_ONLY.test(head[1]);
  const name = isLineName ? canonicalLine(head[1]) : head[1];
  const cmds: Command3[] = [
    {
      type: 'line3',
      name,
      anchor: [anchor[0]!.expr, anchor[1]!.expr, anchor[2]!.expr],
      dir: [dir[0]!.expr, dir[1]!.expr, dir[2]!.expr],
      src: `x = (${m[1].trim()}) + t·(${m[2].trim()})`,
      param: [...params][0],
    },
  ];
  if (!isLineName) for (const id of name.match(/[A-Z]\d*'?/g)!) cmds.push({ type: 'on-line', id, line: name });
  return cmds;
};

/** `הישר ℓ ניצב למישור π` — a GIVEN that pins the parameter (line ⟂ plane). */
const linePerpPlane: Rule = (s) => {
  const m =
    s.match(new RegExp(`^(?:הישר\\s+)?(${LINE_NAME.source})\\s+(?:ניצב|מאונך)\\s+למישור\\s+(${PLANE_NAME.source})$`)) ??
    s.match(new RegExp(`^(?:line\\s+)?(${LINE_NAME.source})\\s+is\\s+perpendicular\\s+to\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})$`));
  if (!m) return null;
  return [{ type: 'line-perp-plane', line: canonicalLine(m[1]), plane: canonicalPlane(m[2]) }];
};

/** `ℓ חותך את π בנקודה A` / `ℓ cuts plane π at A` — the line∩plane point. */
const lineCutsPlane: Rule = (s) => {
  const m =
    s.match(
      new RegExp(`^(?:הישר\\s+)?(${LINE_NAME.source})\\s+חותך\\s+(?:את\\s+)?(?:המישור\\s+)?(${PLANE_NAME.source})\\s+בנקודה\\s+([A-Z]\\d*'?)$`),
    ) ??
    s.match(new RegExp(`^(?:line\\s+)?(${LINE_NAME.source})\\s+cuts\\s+(?:the\\s+)?plane\\s+(${PLANE_NAME.source})\\s+at\\s+([A-Z]\\d*'?)$`));
  if (!m) return null;
  return [{ type: 'line-plane-point', id: m[m.length - 1], line: canonicalLine(m[1]), plane: canonicalPlane(m[2]) }];
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
  return [{ type: 'claim', claim: { type: 'never-parallel', line: canonicalLine(m[1]), plane: canonicalPlane(m[2]) } }];
};

/** Standalone `B על הישר ℓ` / `B is on line ℓ` — an on-line membership GIVEN (verified). */
const onLineMembership: Rule = (s) => {
  const m = s.match(
    new RegExp(`^([A-Z]\\d*'?)\\s+(?:נמצאת\\s+|נמצא\\s+|is\\s+|lies\\s+)?(?:על הישר|on (?:the )?line)\\s+(${LINE_NAME.source})$`),
  );
  if (!m) return null;
  return [{ type: 'on-line', id: m[1], line: canonicalLine(m[2]) }];
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

/** ADR-3D-032: `k הוא פרמטר חיובי` / `k חיובי` / `k > 0` / `k is (a) positive (parameter)` —
 *  a sign given on the figure's symbolic parameter (selects among the root branches).
 *  A letter the figure doesn't carry as its parameter refuses at apply (unknown-symbol). */
const paramSign: Rule = (s) => {
  const m =
    s.match(/^([a-w])\s+(?:הוא\s+)?(?:פרמטר\s+)?(חיובי|שלילי)$/) ??
    s.match(/^([a-w])\s+is\s+(?:a\s+)?(positive|negative)(?:\s+parameter)?$/) ??
    s.match(/^([a-w])\s*([<>])\s*0$/);
  if (!m) return null;
  return [{ type: 'param-sign', sym: m[1], positive: m[2] === 'חיובי' || m[2] === 'positive' || m[2] === '>' }];
};

/** Standalone `v = (10,-5,0)` — a single vector injection. */
const vectorInjection: Rule = (s) => {
  const m = s.match(new RegExp(`^([a-w])\\s*=\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)$`));
  if (!m) return null;
  return [{ type: 'inject-vector', name: m[1], x: +m[2], y: +m[3], z: +m[4] }];
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
    { type: 'plane-plane-line', name: canonicalLine(m[1]), p1: m[2], p2: m[3] },
  ];
};

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

/** `הזווית בין A'C לבין BC' היא 90` / the exam's `גודל הזווית שבין הישר AB ובין הישר AM
 *  הוא 60` — the angle between two SEGMENT-lines (≤90°), a claim. */
const angleSegClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
  const m =
    s.match(
      new RegExp(
        `^(?:גודל\\s+)?ה?זו?וית\\s+ש?בין\\s+(?:ה?ישר\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+(?:לבין|ובין|ל|ו)-?\\s*(?:ה?ישר\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+(?:היא|הוא)\\s+(${NUM})\\s*°?$`,
      ),
    ) ??
    s.match(
      new RegExp(
        `^the\\s+angle\\s+between\\s+(?:line\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+and\\s+(?:line\\s+)?([A-Z]\\d*'?)([A-Z]\\d*'?)\\s+is\\s+(${NUM})\\s*°?$`,
      ),
    );
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

/** `∠PC'C = 82.1` / `הזווית PC'C היא 90` — the vertex form lowers to the angle-between-segments claim.
 *  #251 (ADR-3D-049): also the `ישרה`/`is right` word-form (deg 90), and the SINGLE-VERTEX form
 *  (`זוית O ישרה`, `זווית O = 90`, `angle at O is right`) → `vertex-angle`, arms resolved at APPLY. */
const vertexAngleClaim: Rule = (s0) => {
  const s = stripProofPrefix(s0);
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
  const s = stripProofPrefix(s0).trim();
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
const angleEquality3: Rule = (s0) => {
  const s = stripProofPrefix(s0).trim();
  const A = `(?:∠|ה?זו?וית\\s+|(?:the\\s+)?angle\\s+)([A-Z]\\d*'?)([A-Z]\\d*'?)([A-Z]\\d*'?)`;
  const EQ = `\\s*(?:=|שווה\\s*ל?|equals?|is\\s+equal\\s+to)\\s*`;
  const m = s.match(new RegExp(`^${A}${EQ}${A}(?:\\s*=\\s*([A-Za-zα-ωΑ-Ω]))?\\s*$`));
  if (!m) return null;
  const [, p1, v1, q1, p2, v2, q2, label] = m;
  if (v1 === p1 || v1 === q1 || v2 === p2 || v2 === q2) return null; // an angle needs three distinct points
  const pair = (from: string, to: string): VecAtom => ({ kind: 'pair', from, to });
  const out: Command3[] = [
    { type: 'angle-mark', vertex: v1, p: p1, q: q1, ...(label ? { label } : {}) },
    { type: 'angle-mark', vertex: v2, p: p2, q: q2, ...(label ? { label } : {}) },
  ];
  // With a trailing label the two marks share it, and the label-binding rule (apply) already asserts the
  // equality — emitting it again here would double the pin. Without one, state it explicitly.
  if (!label) out.push({ type: 'angle-pair-eq', a: pair(v1, p1), b: pair(v1, q1), c: pair(v2, p2), d: pair(v2, q2) });
  return out;
};

/** `∠SDB` / `∠SDB = α` — a named-angle MARKER (#94): draw the arc at the middle vertex, no value drives.
 *  A NUMERIC RHS (`∠SDB = 82`) is a claim (owned by `vertexAngleClaim`, before this); a `?`/bare `=` is a
 *  query (owned by scope3). A single-LETTER RHS (`= α`, Greek or Latin) is a display NAME for the angle. */
const angleMarker: Rule = (s0) => {
  const s = stripProofPrefix(s0).trim();
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
  let m =
    s.match(/קוסינוס\s+(?:ה?זו?וית\s+)?בין\s+(?:ה?וקטורים\s+)?([a-w])\s+ו-?\s*([a-w])\s+(?:הוא|היא|שווה\s+ל-?|=)\s*(.+)$/) ??
    s.match(/(?:the\s+)?cosine\s+of\s+the\s+angle\s+between\s+(?:the\s+vectors?\s+)?([a-w])\s+and\s+([a-w])\s+(?:is|equals?|=)\s*(.+)$/i) ??
    s.match(/^cos\s*(?:∠|∡)?\s*\(\s*([a-w])\s*,\s*([a-w])\s*\)\s*=\s*(.+)$/i);
  if (m) {
    const v = evalRadical(m[3].trim());
    return v === null ? null : [{ type: 'cos-angle', u: { kind: 'named', name: m[1] }, v: { kind: 'named', name: m[2] }, cos: v }];
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
  if (!/(?:משולש.*ישר\s*[-\s]?\s*זו?וית|ישר\s*[-\s]?\s*זו?וית.*משולש|right[-\s]?(?:angled\s+)?triangle)/i.test(s)) return null;
  const toks = firstLabelRun(s);
  const ids = toks.length === 3 ? toks : toks.length === 0 ? ['A', 'B', 'C'] : null;
  if (!ids) return null;
  const [a, mid, b] = ids;
  return [
    { type: 'solid', kind: 'polygon3', ids },
    { type: 'cos-angle', u: { kind: 'pair', from: mid, to: a }, v: { kind: 'pair', from: mid, to: b }, cos: 0, soft: true },
  ];
};

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
  makeRightPrism, // #289 (M1): `המנסרה ישרה` — make THE existing solid a right prism
  parallelepiped, // מקבילון / parallelepiped — an oblique named solid (#117)
  volumeEqPoly, // BEFORE volumePolyClaim: its RHS is a volume, not a number
  volumePolyClaim, // BEFORE rightPyramid: נפח הפירמידה ABCD must never build a pyramid
  rightPyramidPoint, // V8-j: `T על SC כך ש-TABCD פירמידה ישרה` — before rightPyramid (which would build a solid)
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
  paramSign, // ADR-3D-032: `k הוא פרמטר חיובי` — before generic rules can misread the letter
  vectorInjection,
  onAxes, // `על ציר ה-x` before the generic membership/on-segment rules
  membership, // before onSegment: `על אחד המישורים` must never read as a point-on-segment
  onCircle3, // V8-i: `A על המעגל` — before onSegment/membership
  pointRelPlane, // on/above/below a point-run plane (+ above/below π) — likewise before onSegment
  onLineMembership, // likewise for `על הישר ℓ`
  linePlaneAngle, // `הזווית בין הישר AC' לבין המישור ABCD היא 30` — before angleBetweenPlanes/angleSegClaim
  angleBetweenPlanes,
  angleSegClaim,
  vertexAngleClaim,
  angleBound3, // `∠SAB > 60` / `60 < α < 90` — a stated numeric BOUND (ADR-3D-053, #273); before the equality/marker rules
  angleEquality3, // `∠SAB = ∠SAD` — a general angle EQUALITY (ADR-3D-052, #271); BEFORE angleMarker, which would claim the left angle and drop the right
  angleMarker, // `∠SDB` / `∠SDB = α` — a named-angle marker (no driver); after vertexAngleClaim (numeric = claim), #94
  mutualPositionClaim,
  rectComplete,
  linePerpPlane,
  neverParallelClaim,
  lineCutsPlane,
  dropPerpToPlane,
  commonPerp, // V8-h: common perpendicular of two lines — before the ⟂-to-a-line rules; tight two-line-target regex
  lineProjection, // V8-h: `היטל הישר TB על המישור ABCD`
  circleTangentLine, // V8-i: `מעגל O משיק לישר AB בנקודה B`
  intersectionLine,
  dropPerpToLine,
  nameVectors,
  centroidRule,
  diagIntersection, // `מפגש האלכסונים` — before onSegment/midpoint grab the tokens
  bisectorPoint, // V8-f (G11): `D על AC כך ש-OD חוצה זווית AOC` — before onSegment grabs `D על AC`
  perpPlaneClaim,
  perpSegGiven, // issue #14: `SM ⊥ DB` / `u ⊥ v` — after perpPlaneClaim (3–4-point targets are planes)
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
  drawArrow, // #72: an unnamed ink arrow — before bareSegment (the noun must not read as a label)
  perpToBase, // #72: the base-directed ⟂ from a point (auto-minted foot)
  rightTriangle, // #116: `משולש … ישר זווית` — BEFORE planarPolygon (which would swallow bare `משולש`)
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
