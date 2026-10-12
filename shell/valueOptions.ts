/**
 * TWO POSSIBLE VALUES, ONCE (#1867, [ADR-634](../docs/06-decisions.md#adr-634)) — how a quantity whose values
 * across a COMPLETE configuration set number one or two is classified and written, in every builder.
 *
 * ## The rulings it carries
 *
 * - B12 (operator, 2026-10-07): a quantity with two possible values shows BOTH, joined by «או», in every tool —
 *   *"complex should also show both values - so it should follow all of the tools"*.
 * - #1861 (2026-10-07): *"up to 2. if there are 3 and more, dont show options and the user can switch between
 *   configs"* — three or more values classify as `null`, and the caller prints no value.
 * - W1 (2026-10-08): one spelling in every tool — «x = ±a» when the two values are opposites, otherwise
 *   «x = a או x = b» (ascending). This keeps 3-D's #1591 «m = ±√2» and replaces its comma form «m = -2, m = 4».
 *
 * ## Why it is in `shell/`
 *
 * Analytic had one copy (`valueText`, ADR-AG-226) and 3-D another (`formatBranches`/`branchAnswer`,
 * ADR-3D-303); 2-D and complex each needed one. The fourth copy is the rule's home (docs/22 §9). It knows no
 * product: the CALLER vouches that the values it passes are the quantity over its builder's complete
 * configuration set (each builder enumerates its own — the engine layer is copied, never shared), and the
 * caller supplies the joiner word from its own locale. The engine-free classification is the shared decision;
 * the text is a convenience for builders whose rows are plain strings (2-D typesets each value as MathML and
 * reads the classification only).
 */

/** One value, a ± pair (`value` is the positive member), or two values in ascending order. */
export type ValueOptions<T = number> =
  | { readonly kind: 'one'; readonly value: T }
  | { readonly kind: 'opposites'; readonly value: T }
  | { readonly kind: 'two'; readonly values: readonly [T, T] };

/** The most values a row ever lists (#1861). */
export const MAX_VALUE_OPTIONS = 2;

/** How a value type is compared, for {@link valueOptionsOf}. */
export interface OptionAlgebra<T> {
  /** the same value, at the builder's own tolerance */
  same(a: T, b: T): boolean;
  /** a = −b (and not both zero) */
  opposite(a: T, b: T): boolean;
  /** the stable order two values are listed in (ascending); the LAST of a ± pair is the one printed */
  compare(a: T, b: T): number;
}

/**
 * Classify the values one quantity takes over a complete configuration set: distinct members (deduplicated by
 * `same`) → one, a ± pair, two, or `null` for none or for three and more (the #1861 cap).
 */
export function valueOptionsOf<T>(values: readonly T[], alg: OptionAlgebra<T>): ValueOptions<T> | null {
  const distinct: T[] = [];
  for (const v of values) if (!distinct.some((d) => alg.same(d, v))) distinct.push(v);
  if (distinct.length === 0 || distinct.length > MAX_VALUE_OPTIONS) return null;
  if (distinct.length === 1) return { kind: 'one', value: distinct[0] };
  const [a, b] = [...distinct].sort(alg.compare);
  if (alg.opposite(a, b)) return { kind: 'opposites', value: b };
  return { kind: 'two', values: [a, b] };
}

/** The real-number algebra at a relative tolerance (default 1e-6; 2-D's sampled pool passes its own 1e-4). */
export const realAlgebra = (relTol = 1e-6): OptionAlgebra<number> => ({
  same: (a, b) => Math.abs(a - b) <= relTol * Math.max(1, Math.abs(a), Math.abs(b)),
  opposite: (a, b) => Math.abs(a + b) <= relTol * Math.max(1, Math.abs(a), Math.abs(b)) && Math.abs(a - b) > relTol * Math.max(1, Math.abs(a)),
  compare: (a, b) => a - b,
});

/** {@link valueOptionsOf} over real numbers. */
export const realValueOptions = (values: readonly number[], relTol = 1e-6): ValueOptions<number> | null =>
  valueOptionsOf(values, realAlgebra(relTol));

export interface ValueOptionsWords<T = unknown> {
  /** the joiner word in the caller's locale — «או», "or" */
  readonly or: string;
  /**
   * The row's own name, repeated before the second value as W1 writes it («m = -2 או m = 4»). Omitted where a
   * row has no «name =» shape (a compound row), which then reads «-2 או 4».
   */
  readonly label?: string;
  /** wraps a ± operand that needs it — a compound complex value reads «±(2+3i)»; default: as is */
  readonly pmOperand?: (text: string) => string;
  /** the relation before the repeated label's value — "=" unless the caller spells a rounded value «≈» */
  readonly rel?: (v: T) => string;
}

/**
 * The ANSWER half of «name = …» for a classification: «4», «±√2», «-2 או m = 4». `null` when the two values
 * print the same at the caller's display precision — two options the student cannot tell apart are not two
 * answers (ADR-AG-226), so the row reads open rather than printing one "option".
 */
export function valueOptionsText<T>(o: ValueOptions<T>, fmt: (v: T) => string, words: ValueOptionsWords<T>): string | null {
  if (o.kind === 'one') return fmt(o.value);
  if (o.kind === 'opposites') return `±${(words.pmOperand ?? ((s: string) => s))(fmt(o.value))}`;
  const [a, b] = o.values.map(fmt);
  if (a === b) return null;
  return words.label ? `${a} ${words.or} ${words.label} ${words.rel?.(o.values[1]) ?? '='} ${b}` : `${a} ${words.or} ${b}`;
}
