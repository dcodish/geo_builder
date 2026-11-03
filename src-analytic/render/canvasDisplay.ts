/**
 * THE CANVAS DISPLAY SWITCHES (#2688, ADR-AG-388) — the grid, the axis numbers, the point coordinates.
 *
 * Operator, 2026-11-03: *"an option to remove the grid and numbers from the axis and an option to show/hide the
 * coordinates of the points. This will allow teachers to print the shape more like a text book. Of course the save
 * to image/word needs to also follow this."* All three start shown (*"All shown, as today"*), and the choice is
 * *"Saved with the figure"*.
 *
 * One record, read by ONE consumer — `buildScene` — so the canvas, «הורידו תמונה» and «הורידו שאלה» (both of which
 * rasterise the drawn `<svg>`) cannot disagree about what is shown. A display preference, never a given: hiding a
 * coordinate hides it from the canvas only; the givens list and the data panel are untouched.
 */

/** What the canvas shows. Every field `true` is today's canvas. */
export interface CanvasDisplay {
  /** The grid lines. */
  grid: boolean;
  /** The axis tick numbers. The axis lines and the O marker stay either way (operator, 2026-11-03). */
  numbers: boolean;
  /**
   * EVERY VALUE WRITTEN ON THE FIGURE (operator, 2026-11-03, playing the PR: *"שיעורי הנקודות should also remove the
   * S= and any other data that is added"*): the coordinate part of each point label («A(2, 3)» → «A»), a circle
   * centre's coordinates, stated lengths, angle sizes, arc values, the area's «S=…», a median's 2x / x, an answered
   * distance and a traced locus's equation. The letters and the MARKS stay: the knee, the equal-length ticks, the arcs.
   */
  values: boolean;
}

export const ALL_SHOWN: CanvasDisplay = Object.freeze({ grid: true, numbers: true, values: true });

export const DISPLAY_KEYS = ['grid', 'numbers', 'values'] as const satisfies ReadonlyArray<keyof CanvasDisplay>;

/**
 * A loaded display record — from a save file, a share link or a restored session. Absent, or anything but a plain
 * object, is all shown (every file from before #2688); a key is hidden only when it is literally `false`, so a
 * hand-edited file cannot hide something by accident of type.
 */
export function cleanCanvasDisplay(raw: unknown): CanvasDisplay {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ALL_SHOWN;
  const r = raw as Record<string, unknown>;
  const out = { grid: r.grid !== false, numbers: r.numbers !== false, values: r.values !== false };
  return isAllShown(out) ? ALL_SHOWN : out;
}

export const isAllShown = (d: CanvasDisplay): boolean => d.grid && d.numbers && d.values;

/** The save file's field: only the HIDDEN switches, `{ grid: false }`; omitted (undefined) when all are shown. */
export function displayForSave(d: CanvasDisplay): Partial<CanvasDisplay> | undefined {
  if (isAllShown(d)) return undefined;
  const out: Partial<CanvasDisplay> = {};
  for (const k of DISPLAY_KEYS) if (!d[k]) out[k] = false;
  return out;
}
