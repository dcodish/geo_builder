/**
 * THE FORMULA SHEET, as data — the three formulas the official 5-unit sheet carries for this topic.
 *
 * Transcribed from [docs/29](../../docs/29-complex-formula-reference.md), which is transcribed from
 * `5-MATH-Formula_NEW.pdf` p. 4, and **byte-matched to it by an integrity test**: every `statement`
 * below must appear verbatim in that document. That is the docs/07 ↔ `THEOREM_TABLE` pattern from the
 * 2-D tree, and the reason for it is the same — the student has this sheet in front of them in the
 * exam, so a paraphrase would teach them a formula they cannot find when they look down at the page.
 *
 * **Three rows, and no more.** The conjugate, division and `|z|` are not on the sheet; they are
 * reference call-outs elsewhere in the app, never detection targets here
 * ([#623](https://github.com/dcodish/geo_builder/issues/623)).
 */

import type { Constraint } from '../model/constraint';
import type { Expr } from '../model/expr';

export type FormulaId = 'CX-F1' | 'CX-F2' | 'CX-F3';

export interface FormulaRow {
  readonly id: FormulaId;
  /** the sheet's own line, byte-identical to docs/29 */
  readonly statement: string;
  readonly he: string;
  readonly en: string;
}

export const FORMULA_TABLE: readonly FormulaRow[] = [
  {
    id: 'CX-F1',
    statement: 'r₁(cos α + i·sin α) · r₂(cos β + i·sin β) = r₁·r₂·[cos(α + β) + i·sin(α + β)]',
    he: 'כפל בהצגה קוטבית',
    en: 'polar multiplication',
  },
  {
    id: 'CX-F2',
    statement: '[r(cos α + i·sin α)]ⁿ = rⁿ·(cos nα + i·sin nα)',
    he: 'משפט דה־מואבר',
    en: 'De Moivre',
  },
  {
    id: 'CX-F3',
    statement:
      'z_k = ⁿ√R·[cos(φ/n + 2πk/n) + i·sin(φ/n + 2πk/n)],  k = 0, 1, …, n−1',
    he: 'שורשים מסדר n',
    en: 'the n-th roots',
  },
];

/** One surfaced row: the formula, and the student's OWN LINES that brought it up. */
export interface SurfacedFormula {
  readonly id: FormulaId;
  /** the statements that triggered it — the premise highlighting reads these */
  readonly premises: readonly string[];
}

const isIntegerPower = (e: Expr): e is Extract<Expr, { t: 'pow' }> =>
  e.t === 'pow' && e.exp.d === 1n && e.exp.n >= 2n;

const hasRef = (e: Expr): boolean => {
  switch (e.t) {
    case 'ref':
      return true;
    case 'mul':
    case 'div':
    case 'add':
    case 'sub':
      return hasRef(e.l) || hasRef(e.r);
    case 'pow':
      return hasRef(e.base);
    case 'conj':
    case 'neg':
    case 'abs':
      return hasRef(e.e);
    default:
      return false;
  }
};

/** Every subexpression, so a formula is found wherever it actually occurs. */
function* walk(e: Expr): Generator<Expr> {
  yield e;
  switch (e.t) {
    case 'mul':
    case 'div':
    case 'add':
    case 'sub':
      yield* walk(e.l);
      yield* walk(e.r);
      return;
    case 'pow':
      yield* walk(e.base);
      return;
    case 'conj':
    case 'neg':
    case 'abs':
      yield* walk(e.e);
      return;
    default:
  }
}

/**
 * Which sheet formulas this figure is actually using, and which statements brought them up.
 *
 * Structural, over the constraints — never a keyword match on the student's text. A formula surfaces
 * because the figure *does the operation*, which is the only reading of "relevant" that survives the
 * student phrasing the same construction differently.
 *
 * The power case splits by what the figure DID with it: an equation `Xⁿ = c` that produced more than
 * one configuration is the roots formula (the k in it is what «show another configuration» walks);
 * every other integer power is De Moivre. Both can surface from one line, and that is correct — solving
 * `z³ = 8` uses the roots formula and checking a solution uses De Moivre.
 */
export function surfacedFormulas(
  constraints: readonly Constraint[],
  configCount: number,
): SurfacedFormula[] {
  const found = new Map<FormulaId, string[]>();
  const note = (id: FormulaId, src: string | undefined): void => {
    const list = found.get(id) ?? [];
    if (src && !list.includes(src)) list.push(src);
    found.set(id, list);
  };

  for (const c of constraints) {
    for (const side of [c.lhs, c.rhs]) {
      for (const e of walk(side)) {
        // a product of two numbers — moduli multiply, arguments add
        if (e.t === 'mul' && hasRef(e.l) && hasRef(e.r)) note('CX-F1', c.src);
        if (!isIntegerPower(e) || !hasRef(e.base)) continue;
        const other = side === c.lhs ? c.rhs : c.lhs;
        // an equation `Xⁿ = <no unknowns>` with several configurations IS the roots formula
        if (!hasRef(other) && configCount > 1) note('CX-F3', c.src);
        else note('CX-F2', c.src);
      }
    }
  }
  return FORMULA_TABLE.filter((f) => found.has(f.id)).map((f) => ({
    id: f.id,
    premises: found.get(f.id) ?? [],
  }));
}
