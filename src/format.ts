/**
 * THE shared student-facing measure formatter (#164, ADR-393) — one place, so a length prints IDENTICALLY
 * whether STATED or DERIVED, on the canvas or in the readout panel. Before this, five ad-hoc formatters
 * disagreed: derived lengths/angles truncated to 1dp (the operator's `AC = 7.34` → "7.3"), the readout
 * dropped to 0dp above 100 (143.7 → "144"), while stated labels showed 3dp — the same length printing three
 * ways depending on which code path produced it.
 *
 * Contract: **2 decimals, trailing zeros trimmed** ("7.34", "8", never "8.00"); an integer-valued measure
 * (within 2dp) prints as the integer, so a forced 8 reads "8" and not "7.9999999". Display-ONLY — never
 * consumed by a detection / equality path (those compare RAW floats against tolerances; proven in #164). A
 * pure leaf (no imports) so every layer — engine (`lower.ts`), replay (`core.ts`), render (`scene.ts`,
 * `computedValue.ts`) — imports it without an import-direction violation.
 */
export function formatMeasure(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toFixed(2))) : '—';
}

/** The same value with the degree sign — for angle displays. */
export function formatAngle(v: number): string {
  return `${formatMeasure(v)}°`;
}

/**
 * EXACT-FORM recognition (#217, ADR-410): v = (p/q)·√root·(π?) with small p/q, root a small
 * non-square. Display-layer ONLY (never consumed by detection/equality paths — those compare raw
 * floats), recognition-from-numerics with a tight tolerance so a value is dressed as exact only
 * when it truly is one: 7.34 stays "7.34", while 5.656854… reads 4√2 and 28.2743… reads 9π.
 * Preference order = simplest first: rational → √n → π·rational → π·√n (the textbook's own habit).
 * The consumer gates on cross-sample invariance BEFORE calling (honesty: an exact form is printed
 * only when the value itself is knowledge).
 */
export interface ExactForm {
  p: number;
  q: number;
  /** the radicand (1 = none); always a non-square when > 1 */
  root: number;
  pi: boolean;
}

const EXACT_TOL = 1e-6;

/** Recognize v as an exact form, or null (→ the 2-decimal fallback). v must be finite and > 0-ish. */
export function exactFormOf(v: number): ExactForm | null {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return null;
  const sign = v < 0 ? -1 : 1;
  const av = Math.abs(v);
  const tryRational = (x: number): { p: number; q: number } | null => {
    for (let q = 1; q <= 12; q++) {
      const p = Math.round(x * q);
      if (p >= 1 && p <= 999 && Math.abs(x - p / q) <= EXACT_TOL * Math.max(x, 1)) {
        const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
        const d = gcd(p, q);
        return { p: (sign * p) / d, q: q / d };
      }
    }
    return null;
  };
  // rational
  const r0 = tryRational(av);
  if (r0) return { ...r0, root: 1, pi: false };
  // (p/q)·√n — ascending n so √12 prefers 2√3
  for (let n = 2; n <= 50; n++) {
    if (Number.isInteger(Math.sqrt(n))) continue;
    const r = tryRational(av / Math.sqrt(n));
    if (r) return { ...r, root: n, pi: false };
  }
  // (p/q)·π
  const rp = tryRational(av / Math.PI);
  if (rp) return { ...rp, root: 1, pi: true };
  // (p/q)·√n·π
  for (let n = 2; n <= 50; n++) {
    if (Number.isInteger(Math.sqrt(n))) continue;
    const r = tryRational(av / (Math.sqrt(n) * Math.PI));
    if (r) return { ...r, root: n, pi: true };
  }
  return null;
}

/** Plain-text rendering of an exact form: 4√2, 9π, 3/4, 2√5/3, √3π/2. (MathML rendering is the UI's.) */
export function formatExactText(f: ExactForm): string {
  const coefAbs = Math.abs(f.p);
  const sign = f.p < 0 ? '−' : '';
  const symbols = `${f.root > 1 ? `√${f.root}` : ''}${f.pi ? 'π' : ''}`;
  const num = coefAbs === 1 && symbols ? symbols : `${coefAbs}${symbols}`;
  return `${sign}${num}${f.q > 1 ? `/${f.q}` : ''}`;
}

/** The one student-facing value formatter with exact forms: exact when recognized, else 2-decimals. */
export function formatValue(v: number): string {
  const f = exactFormOf(v);
  // an exact form that is JUST an integer/decimal-friendly rational prints via formatMeasure anyway
  if (f && (f.root > 1 || f.pi)) return formatExactText(f);
  return formatMeasure(v);
}
