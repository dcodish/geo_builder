/**
 * THE PROBE ENVIRONMENTS (#2566, [ADR-AG-412](../../docs/06c-decisions-analytic.md#adr-ag-412)) — the two parameter
 * assignments every identity or restatement question in this builder is answered at (no CAS, ADR-AG-001 D1).
 *
 * They were a constant over eight letters. `evalExpr` answers NaN for a symbol its environment lacks, deliberately
 * (*"never a guessed 0"*), so any other letter made every comparison answer "different": «…=R^2» typed twice was a
 * contradiction, and «…-R^2=0» after it was a second circle drawn on the first. The alphabet was the defect, so the
 * environments are now BUILT from the expressions a question asks about, and no read can hold a fixed list again.
 *
 * - **Keyed by NAME, never by position.** One name has one value in both expressions, which is what identity needs
 *   (`carriers.ts`'s `SIZE_PROBES` assign by first-seen index: right for sizing one expression, wrong here).
 * - **Distinct across names,** so `…=R^2` and `…=r^2` stay two curves.
 * - **The eight old letters keep their values,** so every verdict over them stands.
 * - **Every other value is a mixed hash, never an arithmetic rule of the code point:** with evenly spaced values
 *   `R+T` and `2S` would agree at every probe.
 * - **Only a letter a student can type is assigned.** The plane's `x`, `y`, a length placeholder and a tool symbol
 *   (`r_O`, `θ_<id>`) stay NaN, as they always have: none of them is a parameter value to compare.
 */
import { RESERVED_SYMBOLS } from './carriers';
import { isStudentLetter, symbolsOf, type Env, type Expr } from './expr';

/** The values that predate #2566. A verdict over these letters must not move, so they are kept, not re-derived. */
const SETTLED: Readonly<Record<string, readonly [number, number]>> = {
  a: [1.7, 3.1],
  b: [2.3, 1.1],
  k: [1.3, 2.9],
  m: [0.7, 1.3],
  n: [2.1, 0.9],
  p: [1.9, 3.3],
  r: [1.1, 2.3],
  t: [2.7, 1.3],
};

/** Positive and of the settled letters' order of magnitude, so a letter squared is a radius a circle can have. */
const PROBE_MIN = 0.7;
const PROBE_SPAN = 2.6;

/** The value of the letter `name` at probe `i` (0 or 1). Deterministic: it depends on nothing but the two arguments. */
export function probeValue(name: string, i: 0 | 1): number {
  const settled = Object.prototype.hasOwnProperty.call(SETTLED, name) ? SETTLED[name] : undefined;
  if (settled) return settled[i];
  // The MurmurHash3 finalizer over (code point, probe): every input bit reaches every output bit.
  let h = Math.imul(name.codePointAt(0) ?? 0, 2) + i + 1;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return PROBE_MIN + PROBE_SPAN * (h / 2 ** 32);
}

/** The two environments for a question about these expressions: every student letter they mention, by name. */
export function probeEnvs(...exprs: Expr[]): [Env, Env] {
  const names = new Set<string>();
  for (const e of exprs) {
    for (const s of symbolsOf(e)) if (isStudentLetter(s) && !RESERVED_SYMBOLS.has(s)) names.add(s);
  }
  const at = (i: 0 | 1): Env => Object.fromEntries([...names].map((s) => [s, probeValue(s, i)]));
  return [at(0), at(1)];
}
