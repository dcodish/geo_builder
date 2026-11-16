/**
 * THE SEGMENT MENU'S DECISIONS (#1653) — pure, so every builder's lock can CALL them.
 *
 * Operator, 2026-10-02: *"in the analytic tool we dont have an option to click on a segment and hide it
 * like we have in 2d"*. 2-D's segment menu (FR-RN-10) is the mechanism: click a segment, choose «הסתירו
 * קטע / הציגו קטע» or «מקווקו / רציף». The analytic builder is the second consumer and 3-D the third
 * candidate, so the menu lives in `shell/` ([ADR-W-106](../../docs/06w-decisions-workspace.md#adr-w-106))
 * and its decisions live HERE, apart from the JSX, for the reason `letterOffer.ts` exists: a lock that
 * drives only a store stays green while the menu or the ink one layer up is wrong ([ADR-W-053]).
 *
 * Nothing here knows which product it serves. The KEY a product files a segment's display under is its
 * own (2-D: the seg id `seg-AB`; analytic: the endpoint pair); this module only reads and writes the flags.
 */

/** One segment's display preference. Only `true` flags are stored — an all-off entry is removed. */
export interface SegDisplay {
  hidden?: boolean;
  dashed?: boolean;
}

/** Every segment's display preference, keyed by the product's own segment key. */
export type SegDisplayMap = Record<string, SegDisplay>;

/**
 * THE ONE TOGGLE (2-D's `setSegFlag`, moved here unchanged). Flips one flag of one segment and keeps the
 * map CANONICAL: only `true` flags are stored and an entry with neither is deleted, so «hide, then show»
 * returns a map equal to the one before — what lets a save file and an undo entry compare clean.
 *
 * Hiding does not forget the dash: un-hiding a dashed segment brings it back dashed (2-D's rule).
 */
export function toggleSegFlag(style: SegDisplayMap, key: string, flag: 'hidden' | 'dashed'): SegDisplayMap {
  const cur = style[key] ?? {};
  const next: SegDisplay = { ...cur, [flag]: !cur[flag] };
  const clean: SegDisplay = {};
  if (next.hidden) clean.hidden = true;
  if (next.dashed) clean.dashed = true;
  const out = { ...style };
  if (!clean.hidden && !clean.dashed) delete out[key];
  else out[key] = clean;
  return out;
}

/**
 * HOW A SEGMENT IS INKED — the decision both renderers paint from.
 *
 * - `solid` / `dashed`: drawn, in the student's chosen stroke;
 * - `ghost`: HIDDEN — no ink. Where the product lets the student click segments, a faint dashed ghost
 *   (an edit affordance, stripped from the exported image) stays on the line so the menu can bring it
 *   back; it is not part of the figure.
 *
 * A hidden segment is display only: it still exists for every reference, measurement and question.
 */
export type SegInk = 'solid' | 'dashed' | 'ghost';

export const segInk = (d: SegDisplay | undefined): SegInk => (d?.hidden ? 'ghost' : d?.dashed ? 'dashed' : 'solid');

/** A segment by its two endpoint point ids (in either order). */
export type SegEnds = readonly [string, string];

/**
 * WHAT A HIDDEN SEGMENT TAKES WITH IT — the canvas's facts about who owns what (#2852).
 *
 * Everything is by POINT ID, so the decision is the same in every builder; each product reads its own scene into it.
 */
export interface HideScene {
  /** The segments the student hid. */
  hidden: readonly SegEnds[];
  /** Every OTHER segment the canvas draws (not hidden). */
  drawn: readonly SegEnds[];
  /** The values written ON a segment (a stated or shown length), by that segment's ends. */
  values: readonly SegEnds[];
  /** The right-angle knees: the vertex and the points its arms run toward. */
  knees: ReadonlyArray<{ v: string; arms: readonly string[] }>;
  /** The equal-length ticks, by the ticked segment's ends. */
  ticks: readonly SegEnds[];
  /** The points every OTHER drawn mark or value touches (an angle's arc and value, an area, an arc's value …). */
  marked: Iterable<string>;
  /**
   * The points that may go with a hidden segment: named by the TOOL, never by the student, and held by nothing
   * outside this canvas's segments and marks — no other active line, no curve, circle or point built from it. The
   * product decides this from its own record of who named what and which line uses what.
   */
  lone: ReadonlySet<string>;
}

/** Which of the scene's values, knees and ticks go with the hidden segments (by index), and which points. */
export interface HiddenWith {
  values: boolean[];
  knees: boolean[];
  ticks: boolean[];
  points: Set<string>;
}

const endsKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * HIDING A SEGMENT HIDES WHAT EXISTS ONLY FOR IT (#2852) — the one decision both flat canvases paint from.
 *
 * Operator, 2026-11-12: *"i wanted to say that the height is 4.8 just so the shape is shown correctly but without
 * showing it on the screen"* — and, of hiding AB in triangle ABC, *"in that case, we can go with the original
 * proposal"*. With its ink, a hidden segment takes:
 * 1. its value (a length written on it);
 * 2. its marks — a right-angle knee with an arm along it, an equal-length tick on it;
 * 3. an endpoint that exists only for it — a {@link HideScene.lone} point that no drawn segment and no kept mark
 *    or value touches.
 *
 * A point the student named, or one anything else uses, never goes (hiding AB in «משולש ABC» takes AB and its
 * label only). Display only: nothing here changes the figure, its rows or any answer.
 */
export function hiddenWith(s: HideScene): HiddenWith {
  const gone = new Set(s.hidden.map(([a, b]) => endsKey(a, b)));
  const out: HiddenWith = {
    values: s.values.map(([a, b]) => gone.has(endsKey(a, b))),
    knees: s.knees.map((k) => k.arms.some((p) => gone.has(endsKey(k.v, p)))),
    ticks: s.ticks.map(([a, b]) => gone.has(endsKey(a, b))),
    points: new Set(),
  };
  if (gone.size === 0) return out;
  const held = new Set<string>(s.marked);
  for (const [a, b] of s.drawn) held.add(a).add(b);
  s.values.forEach(([a, b], i) => { if (!out.values[i]) held.add(a).add(b); });
  s.ticks.forEach(([a, b], i) => { if (!out.ticks[i]) held.add(a).add(b); });
  s.knees.forEach((k, i) => { if (!out.knees[i]) for (const p of [k.v, ...k.arms]) held.add(p); });
  for (const [a, b] of s.hidden) for (const p of [a, b]) if (s.lone.has(p) && !held.has(p)) out.points.add(p);
  return out;
}

/** A segment display map read from a save file, kept only as `key → {hidden?, dashed?: true}` (a
 *  hand-edited file cannot inject anything else, and an all-off entry is dropped). */
export function cleanSegDisplay(raw: unknown): SegDisplayMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SegDisplayMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const e = v as Record<string, unknown>;
    const d: SegDisplay = {};
    if (e.hidden === true) d.hidden = true;
    if (e.dashed === true) d.dashed = true;
    if (d.hidden || d.dashed) out[k] = d;
  }
  return out;
}

/** One entry of the segment menu: which flag it toggles, and which of the caller's strings it reads. */
export interface SegmentMenuItem {
  flag: 'hidden' | 'dashed';
  label: 'hide' | 'show' | 'dashed' | 'solid';
}

/**
 * WHAT THE MENU OFFERS (2-D's FR-RN-10 menu, unchanged): hide or show, then dashed or solid — the dash
 * entry only while the segment is drawn (a hidden segment has no stroke to style). An item appears only
 * when the product wired its toggle.
 */
export function segmentMenuItems(state: SegDisplay, wired: { hide: boolean; dash: boolean }): SegmentMenuItem[] {
  const out: SegmentMenuItem[] = [];
  if (wired.hide) out.push({ flag: 'hidden', label: state.hidden ? 'show' : 'hide' });
  if (wired.dash && !state.hidden) out.push({ flag: 'dashed', label: state.dashed ? 'solid' : 'dashed' });
  return out;
}
