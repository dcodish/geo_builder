/**
 * The analytic engine's data model.
 *
 * The ordered FACT LIST is the source of truth and the figure is derived from it (the 2-D
 * invariant, carried over): positions are never stored, so undo cannot desync. What is different
 * here — and it is the deepest difference from the synthetic tool — is that **the gauge is
 * pinned**. There is an absolute coordinate frame, so a coordinate is KNOWLEDGE rather than one
 * sample's accident ([docs/19 §6](../../docs/19-analytic-geometry-tool.md)). The honesty gate
 * moves accordingly: what must be checked is no longer "is this position meaningful" but "is this
 * value invariant across every admissible parameter value".
 *
 * A CURVE IS ONE THING: an implicit equation `f(x, y; params) = 0`, carried as an `Expr` and
 * classified into the canonical family at parse time. That uniformity is deliberate — the corpus
 * hands the tool equations in half a dozen spellings (`(x−3)²+(y−4)²=9`, `x²+y²−2ax−2x=0`,
 * `x²−6x+y²+t=0`), and normalizing them by *fitting* rather than by pattern-matching means a
 * spelling nobody anticipated still lands in the right family. Constructive forms
 * («מעגל שמרכזו M ורדיוסו 5») synthesize the same `Expr`, so there is one representation, not two.
 */
import type { Expr } from './expr';

export type Id = string;

// ---------------------------------------------------------------------------
// Parameters and the THREE kinds of inequality (ADR-AG-005 D7)
// ---------------------------------------------------------------------------

/**
 * KIND 1 — a parameter's DOMAIN. Declaration-time, and a precondition rather than a given to be
 * satisfied: it FILTERS the roots of every later pin, silently, because a value outside it was
 * never a candidate. Conflating this with a branch selector is the bug D7 exists to prevent —
 * `a > 0` must never report "no valid configuration", it must simply never propose a negative `a`.
 */
export interface Domain {
  /** Inclusive unless the matching `*Open` flag is set. */
  min?: number;
  minOpen?: boolean;
  max?: number;
  maxOpen?: boolean;
  /** «שונה מאפס» — isolated excluded values. */
  exclude?: number[];
}

export const UNBOUNDED: Domain = {};

export function inDomain(d: Domain, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (d.min !== undefined && (d.minOpen ? v <= d.min : v < d.min)) return false;
  if (d.max !== undefined && (d.maxOpen ? v >= d.max : v > d.max)) return false;
  if (d.exclude?.some((e) => Math.abs(v - e) < 1e-9)) return false;
  return true;
}

/** Human-readable, for the data panel. */
export function domainText(sym: string, d: Domain): string {
  const bits: string[] = [];
  if (d.min !== undefined) bits.push(`${d.min} ${d.minOpen ? '<' : '≤'} ${sym}`);
  if (d.max !== undefined) bits.push(`${sym} ${d.maxOpen ? '<' : '≤'} ${d.max}`);
  if (d.exclude?.length) bits.push(`${sym} ≠ ${d.exclude.join(', ')}`);
  return bits.length ? bits.join(',  ') : sym;
}

// ---------------------------------------------------------------------------
// Curves — the closed four-member family (docs/19 §2a)
// ---------------------------------------------------------------------------

/**
 * The whole curve vocabulary of twenty exams. No hyperbola, no rotated conic, no translated conic
 * — every parabola sits on the x-axis and every ellipse is centred at the origin. A student who
 * types one anyway gets an honest refusal naming what is out of scope, never a mis-drawn figure.
 */
export type CurveKind = 'line' | 'circle' | 'parabola' | 'ellipse';

export interface Curve {
  kind: CurveKind;
  /** `f(x, y; params)`; the curve is the zero set. `x` and `y` are reserved symbols. */
  eq: Expr;
}

/** A curve with every coefficient resolved to a number — what geometry and rendering consume. */
export type NumCurve =
  | { kind: 'line'; a: number; b: number; c: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  /** `y² = 2p·x`. Focus `(p/2, 0)`, directrix `x = −p/2`. */
  | { kind: 'parabola'; p: number }
  /** `x²/a² + y²/b² = 1`, semi-axes. */
  | { kind: 'ellipse'; a: number; b: number };

/**
 * How a curve is NAMED (ADR-AG-005 D6, taken from what the corpus does): circles are named because
 * they regularly arrive in twos (`מעגל I` / `מעגל II`); parabolas and ellipses are anonymous
 * because no exam in twenty carries two of either — so a second one is a REFUSAL, not a silently
 * shadowed object. Lines are `ℓ1`/`ℓ2` or named by two points.
 */
export interface CurveLabel {
  /** Display name — `ℓ1`, `מעגל I`, `AB`; '' for the anonymous conics. */
  name: string;
  kind: CurveKind;
}

// ---------------------------------------------------------------------------
// Facts — the ordered source of truth
// ---------------------------------------------------------------------------

export interface FactBase {
  /** The student's own line, kept verbatim for the fact list, the save file and the export. */
  src: string;
}

export type Fact =
  | (FactBase & { t: 'param'; sym: string; domain: Domain })
  | (FactBase & { t: 'point'; id: Id; x: Expr; y: Expr })
  | (FactBase & { t: 'curve'; id: Id; label: CurveLabel; curve: Curve });

// ---------------------------------------------------------------------------
// Construction — the fold of the fact list
// ---------------------------------------------------------------------------

export interface ParamDecl {
  sym: string;
  domain: Domain;
}

export interface PointDef {
  id: Id;
  x: Expr;
  y: Expr;
}

export interface CurveDef {
  id: Id;
  label: CurveLabel;
  curve: Curve;
}

export interface Construction {
  params: ParamDecl[];
  points: PointDef[];
  curves: CurveDef[];
}

export const EMPTY_CONSTRUCTION: Construction = { params: [], points: [], curves: [] };

/** The at-most-one rule for the anonymous conics (D6). */
export function conicSlotTaken(c: Construction, kind: CurveKind): boolean {
  return (kind === 'parabola' || kind === 'ellipse') && c.curves.some((d) => d.curve.kind === kind);
}
