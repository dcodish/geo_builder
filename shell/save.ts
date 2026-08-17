/**
 * The save-file envelope, naming convention, and load audit — shared mechanisms (ADR-W-016 seed:
 * "the save-file envelope + naming + load audit").
 *
 * What is shared is the CONTRACT, not the payload: each product's file body stays its own replay
 * inputs (2-D: facts+commands; complex: the student's source lines). This module holds the three
 * behaviours that were implemented-or-forgotten per product:
 *
 *  - **envelope** — an `app` marker + integer `version`, validated on load so a foreign or
 *    future file REFUSES gracefully instead of producing a corrupt figure (the 2-D
 *    `deserializeFigure` discipline; complex ignored `version` entirely before this).
 *  - **naming** — `<name>-<suffix>.json` with a date-stamped fallback so successive saves don't
 *    silently overwrite (issue #20 / ADR-274/286; suffixes per docs/22 §9: `geo`, `vectors`,
 *    `complex`).
 *  - **load audit** — the ADR-242 rule: *the load reports what it could not restore.* The type
 *    is here; each product collects entries through its own replay path and translates its own
 *    reasons.
 */

export type EnvelopeFailure = 'not-a-session' | 'wrong-app' | 'newer-version';

export type EnvelopeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: EnvelopeFailure };

/**
 * Validate a parsed save file's envelope. `wrong-app` is distinguished from `not-a-session` so the
 * caller can say "this file belongs to another builder" rather than "not a save file". A missing
 * `version` reads as 1 (the lenient-load posture — hand-authored fixtures omit fields); a version
 * NEWER than `maxVersion` refuses so an old app never half-loads a future format.
 */
export function readEnvelope(
  data: unknown,
  spec: { app: string; maxVersion: number },
): EnvelopeResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { ok: false, reason: 'not-a-session' };
  const rec = data as Record<string, unknown>;
  if (typeof rec.app !== 'string' || rec.app === '') return { ok: false, reason: 'not-a-session' };
  if (rec.app !== spec.app) return { ok: false, reason: 'wrong-app' };
  const version = rec.version === undefined ? 1 : rec.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { ok: false, reason: 'not-a-session' };
  if (version > spec.maxVersion) return { ok: false, reason: 'newer-version' };
  return { ok: true, data: rec };
}

/**
 * A user-chosen save name → the download filename: strip characters illegal in filenames, drop a
 * typed `.json` extension, append `-<suffix>` unless already present, and fall back to a
 * date-stamped default when nothing usable remains. "2026summer" → "2026summer-complex.json";
 * an empty name → "figure-2026-08-17-complex.json". Load stays content-based (the envelope), so
 * any name loads. `suffix` is a plain word from the docs/22 §9 registry — never a regex.
 */
export function savedFileName(name: string | null | undefined, now: Date, suffix: string): string {
  const clean = (name ?? '')
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .replace(/\.json$/i, '')
    .trim();
  const stem = clean
    ? new RegExp(`-${suffix}$`, 'i').test(clean)
      ? clean
      : `${clean}-${suffix}`
    : `figure-${now.toISOString().slice(0, 10)}-${suffix}`;
  return `${stem}.json`;
}

/**
 * The inverse (issue #42's rule): a loaded file's NAME names the figure — drop the `.json`
 * extension and the `-<suffix>` tail. "2026summer-complex.json" → "2026summer".
 */
export function figureNameFromFileName(fileName: string, suffix: string): string {
  return fileName
    .replace(/\.json$/i, '')
    .replace(new RegExp(`-${suffix}$`, 'i'), '')
    .trim();
}

/**
 * The load audit (ADR-242): what the load could NOT restore, named line by line. `total` is how
 * many statements the file carried; a caller shows nothing when `failed` is empty. `Reason` is
 * the product's own typed failure (e.g. its input-error union) so the report speaks the product's
 * error voice — a reason is translated where it is shown, never stringified here.
 */
export interface LoadAudit<Reason = string> {
  total: number;
  failed: { line: string; reason: Reason }[];
}
