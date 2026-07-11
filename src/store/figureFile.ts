/**
 * Figure file save/load (FR-HS-10) — serialize the build session to a portable `.geo.json`
 * file and restore it by replay.
 *
 * The store's ordered fact list is the single source of truth and the figure is DERIVED by
 * `replay(facts, seed, radiusOverrides)` — so the file is exactly those replay inputs plus a
 * small header, and **no positions**: loading feeds the facts back through the normal replay
 * path, so a loaded figure is indistinguishable from a built one (editable, undoable,
 * cycleable), and the file stays compact, human-diffable, and robust to engine layout changes.
 *
 * Each saved fact carries both the `utterance` (human-readable; the fixtures harness re-parses
 * it as a parser-drift differential) and the lowered `cmd` (what load actually replays — an
 * LLM-escalated step never re-escalates on load, and `cmd.branch` keeps the chosen alternative).
 * The `seed` + dialed radii ride in the header so the loaded figure shows the SAME configuration
 * that was saved, not the canonical seed-0 view. Display preferences (hidden labels, dashed
 * segments, hidden circles) are included so an author's styled figure survives the round trip.
 *
 * `schemaVersion` gates loading: a file from a NEWER app version refuses gracefully
 * (`newer-version`) instead of producing a corrupt figure; unknown fields are dropped by the
 * sanitizer, never trusted. This module is pure data-in/data-out (no engine import) — the
 * caller decides what to do with a deserialized file.
 */

import { nanoid } from 'nanoid';
import type { AnyCommand, Id } from '@/engine';
import type { Fact } from './geoStore';

/** Bump when the file shape changes incompatibly; keep loading every older version. */
export const FIGURE_FILE_VERSION = 1;

/** Marker distinguishing our files from arbitrary JSON. */
const APP_MARKER = 'geo-builder';

/** Display preferences that travel with the figure (all optional — UI scratch, not geometry). */
export interface FigureFileDisplay {
  hidden?: Id[];
  segStyle?: Record<Id, { hidden?: boolean; dashed?: boolean }>;
  hiddenCircles?: Id[];
  showMeasures?: boolean;
  showCenters?: boolean;
}

/** The persisted session: the replay inputs plus an informational header. */
export interface FigureFile {
  app: typeof APP_MARKER;
  schemaVersion: number;
  /** Informational only — load never switches the UI language. */
  locale?: string;
  /** Informational only (ISO timestamp supplied by the caller). */
  savedAt?: string;
  /** The figure's name at save time (issue #42) — PROVENANCE only: on load the FILENAME wins
   *  (operator ruling), so this field is never read back into the session. */
  name?: string;
  seed: number;
  radiusOverrides: Record<Id, number>;
  facts: Fact[];
  display?: FigureFileDisplay;
}

export type FigureLoadFailure = 'bad-json' | 'not-figure' | 'newer-version' | 'no-facts';
export type FigureLoadResult = { ok: true; file: FigureFile } | { ok: false; reason: FigureLoadFailure };

/** Serialize the session to pretty-printed JSON (human-diffable — the point of a text format). */
export function serializeFigure(
  state: { facts: Fact[]; seed: number; radiusOverrides: Record<Id, number>; display?: FigureFileDisplay },
  meta: { locale?: string; savedAt?: string; name?: string } = {},
): string {
  const file: FigureFile = {
    app: APP_MARKER,
    schemaVersion: FIGURE_FILE_VERSION,
    ...(meta.locale ? { locale: meta.locale } : {}),
    ...(meta.savedAt ? { savedAt: meta.savedAt } : {}),
    ...(meta.name ? { name: meta.name } : {}),
    seed: state.seed,
    radiusOverrides: state.radiusOverrides,
    facts: state.facts.map(sanitizeFactOut),
    ...(state.display ? { display: state.display } : {}),
  };
  return JSON.stringify(file, null, 2);
}

/** Keep exactly the fields a fact persists — a saved file never leaks future in-memory extras. */
function sanitizeFactOut(f: Fact): Fact {
  return {
    id: f.id,
    ...(f.utterance !== undefined ? { utterance: f.utterance } : {}),
    ...(f.group !== undefined ? { group: f.group } : {}),
    cmd: f.cmd,
    enabled: f.enabled,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A fact from disk, reduced to the known fields — or null when it can't be one. */
function sanitizeFactIn(v: unknown): Fact | null {
  if (!isRecord(v)) return null;
  const cmd = v.cmd;
  if (!isRecord(cmd) || typeof cmd.type !== 'string') return null;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : nanoid(),
    ...(typeof v.utterance === 'string' ? { utterance: v.utterance } : {}),
    ...(typeof v.group === 'string' ? { group: v.group } : {}),
    cmd: cmd as unknown as AnyCommand,
    // A hand-edited file may omit `enabled` — default to on (a saved fact was entered to be used).
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
}

/**
 * Parse + validate a saved figure file. Refuses (never a corrupt figure):
 * - `bad-json` — the text isn't JSON at all;
 * - `not-figure` — JSON, but not a Geo Builder figure file (or its facts are malformed);
 * - `newer-version` — saved by a newer app (the caller should say "update to open this");
 * - `no-facts` — a structurally valid file with nothing in it.
 */
export function deserializeFigure(text: string): FigureLoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
  if (!isRecord(raw) || raw.app !== APP_MARKER || typeof raw.schemaVersion !== 'number' || !Array.isArray(raw.facts))
    return { ok: false, reason: 'not-figure' };
  if (raw.schemaVersion > FIGURE_FILE_VERSION) return { ok: false, reason: 'newer-version' };

  const facts: Fact[] = [];
  for (const f of raw.facts) {
    const fact = sanitizeFactIn(f);
    if (!fact) return { ok: false, reason: 'not-figure' }; // one malformed fact poisons the file — refuse whole
    facts.push(fact);
  }
  if (facts.length === 0) return { ok: false, reason: 'no-facts' };

  const radiusOverrides: Record<Id, number> = {};
  if (isRecord(raw.radiusOverrides))
    for (const [k, v] of Object.entries(raw.radiusOverrides)) if (typeof v === 'number' && isFinite(v)) radiusOverrides[k] = v;

  const d = isRecord(raw.display) ? raw.display : {};
  const display: FigureFileDisplay = {
    hidden: Array.isArray(d.hidden) ? d.hidden.filter((x): x is Id => typeof x === 'string') : [],
    segStyle: isRecord(d.segStyle)
      ? Object.fromEntries(
          Object.entries(d.segStyle)
            .filter(([, v]) => isRecord(v))
            .map(([k, v]) => {
              const s = v as Record<string, unknown>;
              return [k, { hidden: s.hidden === true || undefined, dashed: s.dashed === true || undefined }];
            }),
        )
      : {},
    hiddenCircles: Array.isArray(d.hiddenCircles) ? d.hiddenCircles.filter((x): x is Id => typeof x === 'string') : [],
    ...(typeof d.showMeasures === 'boolean' ? { showMeasures: d.showMeasures } : {}),
    ...(typeof d.showCenters === 'boolean' ? { showCenters: d.showCenters } : {}),
  };

  return {
    ok: true,
    file: {
      app: APP_MARKER,
      schemaVersion: raw.schemaVersion,
      ...(typeof raw.locale === 'string' ? { locale: raw.locale } : {}),
      ...(typeof raw.savedAt === 'string' ? { savedAt: raw.savedAt } : {}),
      ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
      seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : 0,
      radiusOverrides,
      facts,
      display,
    },
  };
}

/** Suggested download name, date-stamped so successive saves don't silently overwrite. */
export function figureFileName(now: Date): string {
  return `figure-${now.toISOString().slice(0, 10)}.geo.json`;
}

/** This product's save-file suffix (issue #20; registry: docs/22-workflow.md §9). COPIED per product
 *  tree, never imported across src/ ↔ src3d/ (the isolation rule) — the 3-D sibling carries `vectors`. */
export const SAVE_SUFFIX = 'geo';

/**
 * A user-chosen save name → the download filename (issue #20): strip characters illegal in filenames,
 * drop a typed extension, append the per-product suffix unless the name already ends with it, and fall
 * back to the date-stamped default when nothing usable remains (empty / cancelled prompt).
 * "2026summer" → "2026summer-geo.json"; "2026summer-geo" stays single-suffixed. Load is content-based
 * (the `app` marker + schemaVersion), so any name loads — old `.geo.json` files included.
 */
export function namedFigureFileName(name: string | null | undefined, now: Date): string {
  const clean = (name ?? '')
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .replace(/\.json$/i, '')
    .replace(/\.geo$/i, '')
    .trim();
  if (!clean) return figureFileName(now);
  const stem = new RegExp(`-${SAVE_SUFFIX}$`, 'i').test(clean) ? clean : `${clean}-${SAVE_SUFFIX}`;
  return `${stem}.json`;
}

/**
 * The inverse of {@link namedFigureFileName} (issue #42): a loaded file's NAME gives the figure its
 * on-screen name — drop the `.json`/`.geo` extensions and the per-product `-geo` save suffix.
 * "2026summer-geo.json" → "2026summer". The FILENAME wins on load (operator ruling — any `name`
 * embedded in the file is provenance only). A date-stamped default save ("geo-figure-2026-07-11…")
 * is a real name too — the student sees what they loaded.
 */
export function figureNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.json$/i, '')
    .replace(/\.geo$/i, '')
    .replace(new RegExp(`-${SAVE_SUFFIX}$`, 'i'), '')
    .trim();
}
