/**
 * Save/load a 3-D figure as a portable `.geo3.json` (ADR-3D-005 — the 2-D tool's
 * ADR-232 pattern transplanted): the file IS the replay inputs — each fact keeps
 * the student's utterance (human-readable) AND its lowered commands (load replays
 * the COMMANDS, so parser evolution can never break an old file), plus the seed
 * (the sampled configuration reloads as saved). Positions are NEVER stored — the
 * figure re-derives, so a file can't smuggle a stale drawing.
 *
 * Deserialisation is strict and total: anything shape-invalid refuses `bad-file`,
 * a future schema refuses `newer-schema` — never a half-loaded session.
 */

import { nanoid } from 'nanoid';
import type { Command3 } from '../engine/types';
import type { Fact3 } from './store3';

export const SCHEMA_VERSION_3D = 1;

export interface FigureFile3 {
  schemaVersion: number;
  app: '3d-builder';
  savedAt?: string;
  /** The figure's name at save time (issue #42) - PROVENANCE only: on load the FILENAME wins. */
  name?: string;
  seed: number;
  facts: { utterance: string; cmds: Command3[]; enabled?: boolean }[];
  /** Data-panel queries (ADR-3D-057, #274) — questions about the figure, not facts; optional. */
  queries?: string[];
  /** Per-plane patch display (#318): plane name → 'face' (patch = the defining polygon only).
   *  Absent key = 'full' (the default growing patch), so only non-defaults are stored. */
  planeDisplay?: Record<string, 'face' | 'full'>;
}

/** Every `Command3` type, classified as loadable (`true`) or deliberately excluded (`false`).
 *
 *  This `Record` is **exhaustive by construction**: TypeScript requires a key for every member of
 *  `Command3['type']`, so adding a command type to the union without classifying it here is a
 *  COMPILE ERROR. That is the structural guard issue #288 needed and did not get.
 *
 *  History (why the structure, not just the entries, is the fix): the whitelist was a hand-maintained
 *  `Set` and fell 23 types behind the parser — a figure using `|u|=3` (`vec-mag`), a `⊥` (`cos-angle`),
 *  a circle or a diagonal crossing SAVED fine and then failed to RELOAD (`bad-file`), i.e. silent data
 *  loss on a round-trip. #288 restored those 23 and added a catalog-driven round-trip test, but that
 *  test can only cover types some `COMMAND_CATALOG_3D` example happens to emit — so `inject-pair`
 *  (`BD = (-4,5,12)`, the V7-T2 pair-vector injection, emitted by `parse3` and applied by `apply`)
 *  stayed missing and the same silent-reload-failure class stayed open. A list that must be maintained
 *  by hand will drift again; a total function over the union cannot. */
const COMMAND_SAVEABLE: Record<Command3['type'], boolean> = {
  'mutual-rel': true, // S4 (#378): a stated mutual position is a given — it must survive a round-trip
  'plane-rel': true, // S3 (#378): likewise a stated plane relation
  'distance-rel': true, // S5 (#378): a stated distance is a given
  solid: true,
  'point-on-segment3': true,
  'name-vector': true,
  segment3: true,
  centroid3: true,
  'point-in-span': true,
  claim: true,
  point3: true,
  'coord-plane-rel': true,
  'plane-line-perp': true, // #324 (ADR-3D-079): ring ∥/⟂/on a coordinate plane or axis
  plane3: true,
  'plane-angle': true,
  'on-planes': true,
  'foot-on-plane': true,
  'plane-plane-line': true,
  'foot-on-line': true,
  line3: true,
  'line-perp-plane': true,
  'line-plane-point': true,
  'on-line': true,
  'inject-vector': true,
  'inject-pair': true, // #288 follow-up: emitted by parse3, applied by apply — saved but could not reload
  'sign-given': true,
  'plane-through': true,
  'line-through': true,
  revolution: true,
  'vec-rel': true,
  'seg-plane-rel': true,
  'length-rel': true,
  'symbol-value': true,
  'midpoint-auto': true,
  'vertex-angle': true,
  'altitude-foot': true,
  'angle-bound3': true,
  'angle-eq': true,
  'angle-mark': true,
  'angle-pair-eq': true,
  'bisector-point': true,
  circle3: true,
  'cos-angle': true,
  'diag-intersection': true,
  'dot-eq-chain': true,
  'dot-given': true,
  'draw-arrow': true,
  'height-to-face': true,
  'line-common-perp': true,
  'line-plane-angle': true,
  'line-projection': true,
  'param-sign': true,
  'perp-to-base': true,
  'plane-cut': true,
  'point-on-circle3': true,
  'rect-complete': true,
  'rel-plane': true,
  'right-pyramid-point': true,
  'tetra-altitude': true,
  'vec-mag': true,
  'make-right-prism': true, concyclic: true, // #289 (M1): «המנסרה ישרה» — a saved figure reloads
  'line-rel': true, // S2 (#378, ADR-3D-103): ∥/⟂/angle with a named-line side
  'mag-rel': true, 'mag-val': true, // #393/#335 (ADR-3D-107): expression/chained magnitudes
};

const COMMAND_TYPES = new Set<Command3['type']>(
  (Object.keys(COMMAND_SAVEABLE) as Command3['type'][]).filter((t) => COMMAND_SAVEABLE[t]),
);

export function serializeFigure3(
  facts: Fact3[],
  seed: number,
  name?: string,
  queries: string[] = [],
  planeDisplay: Record<string, 'face' | 'full'> = {},
): string {
  const file: FigureFile3 = {
    schemaVersion: SCHEMA_VERSION_3D,
    app: '3d-builder',
    savedAt: new Date().toISOString(),
    ...(name ? { name } : {}),
    seed,
    facts: facts.map((f) => ({ utterance: f.utterance, cmds: f.cmds, ...(f.enabled ? {} : { enabled: false }) })),
    ...(queries.length ? { queries } : {}),
    ...(Object.keys(planeDisplay).length ? { planeDisplay } : {}),
  };
  return JSON.stringify(file, null, 2);
}

export type LoadResult3 =
  | { ok: true; facts: Fact3[]; seed: number; queries: string[]; planeDisplay: Record<string, 'face' | 'full'> }
  | { ok: false; reason: 'bad-file' | 'newer-schema' };

export function deserializeFigure3(text: string): LoadResult3 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'bad-file' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'bad-file' };
  const file = raw as Partial<FigureFile3>;
  if (typeof file.schemaVersion !== 'number' || file.app !== '3d-builder') return { ok: false, reason: 'bad-file' };
  if (file.schemaVersion > SCHEMA_VERSION_3D) return { ok: false, reason: 'newer-schema' };
  if (!Array.isArray(file.facts) || file.facts.length === 0) return { ok: false, reason: 'bad-file' };
  if (typeof file.seed !== 'number' || !Number.isFinite(file.seed)) return { ok: false, reason: 'bad-file' };

  const facts: Fact3[] = [];
  for (const f of file.facts) {
    if (typeof f !== 'object' || f === null) return { ok: false, reason: 'bad-file' };
    if (typeof f.utterance !== 'string' || !Array.isArray(f.cmds) || f.cmds.length === 0) return { ok: false, reason: 'bad-file' };
    for (const cmd of f.cmds) {
      if (typeof cmd !== 'object' || cmd === null || !COMMAND_TYPES.has((cmd as Command3).type)) {
        return { ok: false, reason: 'bad-file' };
      }
    }
    // ids are session-local — always minted fresh on load
    facts.push({ id: nanoid(8), utterance: f.utterance, cmds: f.cmds, enabled: f.enabled !== false });
  }
  const queries = Array.isArray(file.queries) ? file.queries.filter((q): q is string => typeof q === 'string') : [];
  // #318: lenient like `queries` — keep only well-formed entries; anything else falls back to 'full'
  const planeDisplay: Record<string, 'face' | 'full'> = {};
  if (typeof file.planeDisplay === 'object' && file.planeDisplay !== null && !Array.isArray(file.planeDisplay)) {
    for (const [k, v] of Object.entries(file.planeDisplay)) {
      if (v === 'face' || v === 'full') planeDisplay[k] = v;
    }
  }
  return { ok: true, facts, seed: file.seed, queries, planeDisplay };
}

/** This product's save-file suffix (issue #20; registry: docs/22-workflow.md §9). COPIED per product
 *  tree, never imported across src/ ↔ src3d/ (the isolation rule) — the 2-D sibling carries `geo`. */
export const SAVE_SUFFIX_3D = 'vectors';

/** Suggested download name, date-stamped so successive saves don't silently overwrite. */
export function figureFileName3(now: Date): string {
  return `figure-3d-${now.toISOString().slice(0, 10)}.geo3.json`;
}

/**
 * A user-chosen save name → the download filename (issue #20): strip characters illegal in filenames,
 * drop a typed extension, append the per-product suffix unless the name already ends with it, and fall
 * back to the date-stamped default when nothing usable remains (empty / cancelled prompt).
 * "2026summer" → "2026summer-vectors.json". Load is content-based (the `app` marker + schemaVersion),
 * so any name loads — old `.geo3.json` files included.
 */
export function namedFigureFileName3(name: string | null | undefined, now: Date): string {
  const clean = (name ?? '')
    .replace(/[/\:*?"<>|]/g, '')
    .trim()
    .replace(/\.json$/i, '')
    .replace(/\.geo3$/i, '')
    .trim();
  if (!clean) return figureFileName3(now);
  const stem = new RegExp(`-${SAVE_SUFFIX_3D}$`, 'i').test(clean) ? clean : `${clean}-${SAVE_SUFFIX_3D}`;
  return `${stem}.json`;
}

/**
 * The inverse of {@link namedFigureFileName3} (issue #42): a loaded file's NAME gives the figure its
 * on-screen name - drop the `.json`/`.geo3` extensions and the per-product `-vectors` save suffix.
 * "2026summer-vectors.json" -> "2026summer". The FILENAME wins on load (operator ruling - any `name`
 * embedded in the file is provenance only).
 */
export function figureNameFromFileName3(fileName: string): string {
  return fileName
    .replace(/\.json$/i, '')
    .replace(/\.geo3$/i, '')
    .replace(new RegExp(`-${SAVE_SUFFIX_3D}$`, 'i'), '')
    .trim();
}
