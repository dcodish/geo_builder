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
