/**
 * THE FACT VOCABULARY — what a statement IS, separately from what any engine does with it.
 *
 * This is the half of the retiring prototype's `engine/model.ts` that is not the prototype: the shape
 * of a lowered statement, the deterministic id that makes re-issuing one idempotent, and the two
 * questions the store asks of every fact (*which names does it introduce*, *which does it consume*).
 * Fourteen files imported from `engine/`, and most of them wanted exactly this and none of the
 * evaluator — which is why the cutover ([#624](https://github.com/dcodish/geo_builder/issues/624))
 * could not simply delete the directory: `parser/parse.ts` survives the deletion as the parity oracle
 * of [ADR-CX-019](../../docs/06d-decisions-complex.md#adr-cx-019) (*v2 must read everything the
 * prototype reads*), and a parser cannot outlive the vocabulary it produces.
 *
 * So the vocabulary moves DOWN into `model/`, where the layer order already says it belongs — above
 * `value/`, below everything that reads statements — and the evaluator stays in `engine/` to be
 * deleted whole. Nothing here evaluates, samples a configuration or draws: those are `replay/`'s job.
 *
 * **On the two `Expr` types.** [`expr.ts`](expr.ts) holds v2's expression AST, whose defining question
 * is whether a node is *monomial*. The `Expr` here is the prototype grammar's, carrying IEEE doubles
 * rather than exact values. They are deliberately separate rather than reconciled: the prototype's
 * survives only as long as `parse.ts` does, and merging a doubles-only tree into the exact one would
 * push the prototype's precision boundary into the layer built to not have it (ADR-CX-006).
 */

import { type Cx, cPolar } from '../value/value';

export type Expr =
  | { t: 'lit'; v: Cx }
  | { t: 'ref'; name: string }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; l: Expr; r: Expr }
  | { t: 'pow'; base: Expr; exp: number }
  | { t: 'neg'; e: Expr }
  | { t: 'conj'; e: Expr }
  | { t: 'abs'; e: Expr }
  | { t: 're'; e: Expr }
  | { t: 'im'; e: Expr };

export type Fact =
  | { id: string; kind: 'free'; name: string; src: string; implicit?: boolean }
  | { id: string; kind: 'def'; name: string; expr: Expr; src: string }
  /** X^n = expr. Three modes (operator ruling 2026-08-15): X fresh → enumerate the solution
   *  set X1..Xn and RESERVE the bare letter (X is related to its indexed letters); X an
   *  existing free number → the equation CONSTRAINS it (snap to the nearest solution, show
   *  the candidates); X determined → the equation VERIFIES (✓/✗). `constrains` is stamped
   *  by the store from whether X already existed. */
  | {
      id: string;
      kind: 'roots';
      varName: string;
      n: number;
      rhs: Expr;
      src: string;
      norm: string;
      constrains?: boolean;
      /** enumeration whose indexed names are already taken (the §2b Z vs Z₁ case): the
       *  solutions are an ANONYMOUS SET — marked points, no names claimed (exam-faithful) */
      anon?: boolean;
    }
  /** an unnamed expression line — plotted, labeled by the expression itself, never referencable
   *  (ADR-447: anonymous ids never reach a rendered string; the label is the student's text) */
  | { id: string; kind: 'show'; expr: Expr; src: string; norm: string }
  /** a relation (F3 modulus / F4 argument): DRIVES a free number when one is available,
   *  VERIFIES (✓/✗) when everything is determined — driveOrCheck-lite */
  | { id: string; kind: 'rel'; rel: RelSpec; src: string; norm: string }
  /** F9 list form (ADR-CX-003; operator 2026-08-15 — "the list form is correct for now"):
   *  the named numbers are CONSECUTIVE terms of one sequence. driveOrCheck: all determined →
   *  verify; `defines` (stamped by the store: exactly one unknown name) → that term is DERIVED
   *  from the others; one FREE term among determined ones → driven. */
  | {
      id: string;
      kind: 'seq';
      stype: 'geo' | 'ari';
      names: string[];
      defines?: string;
      src: string;
      norm: string;
    }
  /** general equation between expressions (#605): driveOrCheck — one free unclaimed unknown
   *  is solved numerically (2-D Newton, verified residual); determined sides verify */
  | { id: string; kind: 'eq'; lhs: Expr; rhs: Expr; src: string; norm: string }
  /** F6: a segment (2 pts) or polygon (3+ pts) over named points; 'o' is always the origin */
  | { id: string; kind: 'shape'; pts: string[]; src: string; norm: string }
  /** F7 measure: area/perimeter of a polygon, length of a segment — a calc-panel entry */
  | { id: string; kind: 'smeasure'; mtype: 'area' | 'perim' | 'len'; pts: string[]; src: string; norm: string }
  /** F7 given/claim: area/perimeter = k·param^pow — drives a free angular DOF (1-D root
   *  find over the constraint replay) or verifies when nothing is free */
  | {
      id: string;
      kind: 'srel';
      mtype: 'area' | 'perim';
      pts: string[];
      k: number;
      param?: string;
      pow?: 1 | 2;
      src: string;
      norm: string;
    };

export interface ArgTerm {
  sign: 1 | -1;
  name: string;
}

export type Cmp = '=' | '<' | '>' | '<=' | '>=';

export type RelSpec =
  /** Σ sign·arg(name) ⟨cmp⟩ rhsDeg — '=' drives; inequalities verify, folding a free number
   *  into range (the branch-selector reading of `arg z2 < 45`) */
  | { type: 'arg'; terms: ArgTerm[]; rhsDeg: number; cmp?: Cmp }
  /** |name| ⟨cmp⟩ k · (param | |other| | 1) — a PARAM is a shared real DOF sampled per seed:
   *  `|z1| = 9r` and `|z2| = 12r` share the same r (the exam's parameter convention) */
  | { type: 'mod'; name: string; k: number; other?: string; param?: string; cmp?: Cmp }
  /** quadrant membership (F5): strict interior of quadrant q — verifies when determined,
   *  folds a free number's argument into the quadrant when violated */
  | { type: 'quad'; name: string; q: 1 | 2 | 3 | 4 };

/** The exam's naming convention (ADR-CX-004): z- and w-family names ARE complex numbers — first
 * reference auto-creates a free number. Other letters stay explicit (a,d,m,n,r are real params). */
export const IMPLICIT_COMPLEX_RE = /^[zw]\d*$/;

export const collectRefs = (e: Expr, out: string[] = []): string[] => {
  switch (e.t) {
    case 'ref':
      out.push(e.name);
      break;
    case 'bin':
      collectRefs(e.l, out);
      collectRefs(e.r, out);
      break;
    case 'pow':
      collectRefs(e.base, out);
      break;
    case 'neg':
    case 'conj':
    case 'abs':
    case 're':
    case 'im':
      collectRefs(e.e, out);
      break;
    case 'lit':
      break;
  }
  return out;
};

/** Distributive Omit — plain Omit collapses the union and loses the discriminant's payload. */
type FactBody = Fact extends infer F ? (F extends Fact ? Omit<F, 'id'> : never) : never;

/** Deterministic ids (the sibling convention): re-adding the same statement is idempotent. */
export const factId = (f: FactBody): string =>
  f.kind === 'free' || f.kind === 'def'
    ? `${f.kind}-${f.name}`
    : `${f.kind}-${f.norm.replace(/ /g, '')}`;

/** Static scalarness: is this expression a MEASURE (a real calc) rather than a point?
 * abs/re/im produce scalars; arithmetic containing a scalar stays scalar. */
export const isScalarExpr = (e: Expr): boolean => {
  switch (e.t) {
    case 'abs':
    case 're':
    case 'im':
      return true;
    case 'neg':
      return isScalarExpr(e.e);
    case 'pow':
      return isScalarExpr(e.base);
    case 'bin':
      return isScalarExpr(e.l) || isScalarExpr(e.r);
    default:
      return false;
  }
};

const relNames = (r: RelSpec): string[] =>
  r.type === 'arg'
    ? r.terms.map((t) => t.name)
    : r.type === 'mod' && r.other
      ? [r.name, r.other]
      : [r.name];

/** Names a fact introduces — used by the store's duplicate-name honesty check.
 * A solution-enumerating roots fact also RESERVES its bare letter: z is related to z1..zn,
 * so a later independent `z = …` (or implicit creation of z) must refuse, naming this fact. */
export const factNames = (f: Fact): string[] =>
  f.kind === 'roots'
    ? f.constrains
      ? [] // constraint/claim mode: the candidates are display-only, no names introduced
      : f.anon
        ? [f.varName] // anonymous set: the letter stays reserved, the indices stay everyone else's
        : [f.varName, ...Array.from({ length: f.n }, (_, k) => `${f.varName}${k + 1}`)]
    : f.kind === 'free' || f.kind === 'def'
      ? [f.name]
      : f.kind === 'seq' && f.defines
        ? [f.defines]
        : [];

/** Names a fact CONSUMES — drives the store's implicit z/w auto-creation (ADR-CX-004). */
export const factRefs = (f: Fact): string[] =>
  f.kind === 'def' || f.kind === 'show'
    ? collectRefs(f.expr)
    : f.kind === 'eq'
      ? [...collectRefs(f.lhs), ...collectRefs(f.rhs)]
      : f.kind === 'roots'
      ? collectRefs(f.rhs)
      : f.kind === 'rel'
        ? relNames(f.rel)
        : f.kind === 'shape' || f.kind === 'smeasure' || f.kind === 'srel'
          ? f.pts.filter((p) => p !== 'o') // O always exists; never implicit-created
          : f.kind === 'seq'
            ? f.names.filter((n) => n !== 'o' && n !== f.defines)
              : [];

/** Deterministic positive sample for a real parameter, per (name, seed) — 0.6 .. 2.4. */
export const paramValue = (name: string, seed = 0): number => {
  let h = 0;
  for (const ch of `${name}@${seed}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.6 + (h % 181) / 100;
};

/** Deterministic default position for a free number, keyed by NAME + configuration seed
 * (never insertion order) — the stability discipline: adding another fact cannot move an
 * existing free point; "show another configuration" bumps the seed and resamples them all. */
export const defaultFree = (name: string, seed = 0): Cx => {
  let h = 0;
  for (const ch of `${name}#${seed}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const angle = 15 + (h % 8) * 45 + ((h >> 5) % 15); // spread, avoiding axis-hugging
  const r = 1.5 + ((h >> 3) % 20) / 10; // 1.5 .. 3.4
  return cPolar(r, angle);
};
