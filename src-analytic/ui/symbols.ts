/**
 * The symbol palette — the characters this tool OFFERS the student, declared once as a MODULE.
 *
 * **Operator, 2026-09-16:** *"another item for analytics is the symbols pallet. we need all relevant
 * ones for analytics and we probably need to add `d_{}`"*, and ruling the audit: *"Be INCLUSIVE: π is
 * in … Only `°`/`∡` are held — they need the unbuilt angle capability, and a chip that cannot parse
 * is worse than no chip."*
 *
 * The #482 discipline arriving in the fourth builder: this list lived **inline in `App.tsx`**, which
 * is how a palette drifts from the bidi run alphabet and from the grammar. The SHAPE is the shared
 * `shell/symbols` contract (wrap-selection insert, docs/28 §4a D5); the DATA is this product's own —
 * #525's ruling that only relevant symbols appear per tool.
 *
 * **Everything offered must PARSE**, locked by `__tests__/symbols-module.test.ts`, which drives every
 * entry through the real grammar with a totality guard so a new button cannot be added without a
 * proof. That is the #511 rule: a builder must never offer a glyph it refuses in every position.
 *
 * ## What is deliberately NOT here (#1696, ADR-AG-212)
 *
 * The 2-D chips whose sentences analytic does not read yet — measured, and locked as still refused in
 * `symbols-module.test.ts`, so the day one parses the lock goes red and the chip is owed:
 * the Greek angle names α β γ δ θ, `S_{}` and `<` between two measures (slice D, #1621);
 * `△` `≅` `~` and `⌢{}` (slice E, #1622). A chip inserting a character the grammar then refuses
 * hands the student `not-handled` on their own click, so each joins in its notation's own PR.
 * `xⁿ` is not offered: `²` and `³` cover the exam's powers and `^` is on every keyboard.
 */
import type { SymbolSpec } from '../../shell/symbols';

export const SYMBOLS: readonly SymbolSpec[] = [
  // The six that shipped inline, unchanged in label and in insert text.
  { label: '²', titleKey: 'symSq', before: '²' }, // #1348: the face IS the payload (the grammar reads ² as ^2)
  // #1696 — 2-D's wrapping radical: select «2/3», press it, get «√(2/3)», so the radicand is explicit.
  { label: '√()', titleKey: 'symSqrt', before: '√(', after: ')' },
  { label: 'ℓ', titleKey: 'symEll', before: 'ℓ' },
  { label: '≤', titleKey: 'symLe', before: '≤' },
  { label: '≥', titleKey: 'symGe', before: '≥' },
  { label: '≠', titleKey: 'symNe', before: '≠' },
  // #1129 — free the day they were measured: `normalizeMath` maps `·⋅×` to `*`, and `³` is `^3`
  // exactly as `²` is `^2`.
  { label: '³', titleKey: 'symCube', before: '³' },
  { label: '·', titleKey: 'symMul', before: '·' },
  /**
   * π, per the ruling. It is a `num` token in `expr.ts` rather than a free symbol — a symbol would
   * make «AB = 2π» a length the solver may choose.
   */
  { label: 'π', titleKey: 'symPi', before: 'π' },
  /**
   * The three that were BLOCKED when this issue was written and are not any more — #1127 landed the
   * component notation and #1128 the distance notations, both in this same run. The issue said the
   * chip belongs in the notation's own PR; `d_{}` did ship with #1128, and these two arrive here
   * because #1127 shipped before this palette existed to put them in.
   */
  { label: '|x|', titleKey: 'symAbs', before: '|', after: '|' },
  { label: 'd_{}', titleKey: 'symDist', before: 'd_{', after: '}' },
  { label: 'x_{}', titleKey: 'symComponent', before: 'x_{', after: '}' },
  /**
   * #1696 (ADR-AG-212) — the 2-D palette's relation and angle chips, now that analytic reads every one of
   * them: «AD ⊥ BC», «AB ∥ CD» (#1160, slice C #1620), «∠ABC = 37» (#1330 — the same lowering as «∢» and
   * «זווית»), and «∢ABC = 90°» (the angle capability that held `°` on 2026-09-16 has since landed).
   * Operator, playing PR #1695: *"analytics tool doesnt have parallel and perpendiculatr symbols"*.
   */
  { label: '⊥', titleKey: 'symPerp', before: '⊥' },
  { label: '∥', titleKey: 'symPar', before: '∥' },
  { label: '∠', titleKey: 'symAngle', before: '∠' },
  { label: '°', titleKey: 'symDeg', before: '°' },
];
