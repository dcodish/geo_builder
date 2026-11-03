/**
 * THE ANNOTATION CHANNEL (#1863, ADR-AG-375) — the one place a student's choice "show this derived thing on the figure"
 * is recorded, for every object kind.
 *
 * Operator, 2026-10-09 (#1218, the five answers): *one annotation channel, reached from both the click menu and the
 * control, living beside `queries` — replayable, undoable, saved with the session, and never in «נתונים»*. The
 * 2026-11-03 ruling (card d1, option A) ships the model with its first surface, the conic chip.
 *
 * ## The record
 *
 * `AnnotationMap` is keyed by the OBJECT id (a curve's id, later a point's), one `Annotation` per object, each kind of
 * annotation a FACET of that one record:
 *
 * - `conic` — the conic chip's state (this PR): `directrix` · `focus` · `both`; absent is «nothing shown».
 * - `coords` — #1211, a point's coordinates shown on the canvas (later PR; the click menu writes it).
 * - `line` — #1121, a line's equation / slope shown beside its name (later PR; the click menu writes it).
 *
 * A facet is added to `Annotation` and given a reader in `cleanAnnotations`; nothing else in the store, the undo
 * slice, the save file or the share link changes, because they carry the map whole. That is the point of one channel:
 * a fourth per-surface list is the #1107 mistake.
 *
 * ## What it is not
 *
 * It is not a given and not a question: the fold never reads it, «נתונים» never lists it, the given count never moves.
 * A key whose object is gone (a deleted line, an edited equation) is kept and ignored — the figure decides what draws.
 */

/** The conic chip's four states, in the order the chip cycles them (operator, 2026-10-09: «כלום → רק מדריך → רק מוקד → מוקד ומדריך»). */
export const CONIC_CYCLE = ['none', 'directrix', 'focus', 'both'] as const;
export type ConicState = (typeof CONIC_CYCLE)[number];

/** One object's annotations — one facet per surface. */
export interface Annotation {
  /** #1863 — the conic chip's state; absent = «nothing shown». */
  conic?: Exclude<ConicState, 'none'>;
}

export type AnnotationMap = Record<string, Annotation>;

/** The state after one press — the cycle returns to nothing after «both». */
export function nextConic(s: ConicState): ConicState {
  return CONIC_CYCLE[(CONIC_CYCLE.indexOf(s) + 1) % CONIC_CYCLE.length];
}

/** The conic state recorded for an object (nothing when unrecorded). */
export function conicStateOf(map: AnnotationMap, id: string): ConicState {
  return map[id]?.conic ?? 'none';
}

/** Does the state draw the focus / the directrix? */
export const showsFocus = (s: ConicState): boolean => s === 'focus' || s === 'both';
export const showsDirectrix = (s: ConicState): boolean => s === 'directrix' || s === 'both';

/** A NEW map with one object's conic facet set; an emptied record is dropped, so «nothing» leaves no trace. */
export function withConic(map: AnnotationMap, id: string, s: ConicState): AnnotationMap {
  const { conic: _old, ...rest } = map[id] ?? {};
  const rec: Annotation = s === 'none' ? rest : { ...rest, conic: s };
  const out = { ...map };
  if (Object.keys(rec).length) out[id] = rec;
  else delete out[id];
  return out;
}

const CONIC_KEPT = new Set<string>(['directrix', 'focus', 'both']);

/** A loaded map (a save file, a share link, a hand edit) kept only where it can be true: string keys, known facets. */
export function cleanAnnotations(raw: unknown): AnnotationMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: AnnotationMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const conic = (v as Record<string, unknown>).conic;
    if (typeof conic === 'string' && CONIC_KEPT.has(conic)) out[k] = { conic: conic as Annotation['conic'] };
  }
  return out;
}
