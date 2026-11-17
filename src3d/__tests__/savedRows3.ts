/**
 * #2341 (ADR-3D-449) → #2790 ([ADR-3D-484](../../docs/06b-decisions-3d.md#adr-3d-484)) — TYPE A LINE.
 *
 * Under ADR-3D-449 a held line answered «כבר קיים» and added no row, so the locks of the fold's read-outs (#396, #842,
 * #847, #850, #853, #1475, #1476, #1486, #1491) appended it here as the row a saved file would hold. Since ADR-W-200 a held
 * line is typed again: it is its own row, with the held notice. The helpers stay as the locks' one entry point; a line
 * the figure held is reported `'held'`.
 */
import { useGeo3 } from '../store/store3';

export function submitOrSave3(u: string): 'typed' | 'held' {
  useGeo3.getState().submit(u);
  return useGeo3.getState().lastNotice?.code === 'already-held' ? 'held' : 'typed';
}

/** Build `lines` with {@link submitOrSave3}; the lines the figure already held when typed. */
export function buildSaved3(lines: readonly string[]): string[] {
  return lines.filter((u) => submitOrSave3(u) === 'held');
}
