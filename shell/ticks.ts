/**
 * #1465 (ADR-W-094) — THE ONE AXIS-STEP RULE, shared by every product that draws a grid.
 *
 * A grid step is "nice" — 1, 2 or 5 times a power of ten — or the labels drift into values like 3.7,
 * which no textbook axis has ever shown. Analytic had this rule and gridded its visible range with it;
 * the complex Builder kept its own copy with different thresholds and gridded the CONTENT box instead,
 * so zooming out left the grid in the middle of an empty canvas. One pure helper, no product knowledge.
 */

/** A nice step for `span` split into about `target` intervals (at most 1.5 × `target` of them). */
export function tickStep(span: number, target = 10): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/**
 * Every multiple of `step` inside [`min`, `max`], except zero (the axis itself), rounded clear of the
 * binary noise that repeated addition accumulates (0.30000000000000004).
 */
export function tickValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return out;
  for (let i = Math.ceil(min / step - 1e-9); i * step <= max + 1e-9 * step; i++) {
    if (i === 0) continue;
    out.push(Number((i * step).toPrecision(12)));
  }
  return out;
}
