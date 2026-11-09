/**
 * #2341 ([ADR-3D-449](../../docs/06b-decisions-3d.md#adr-3d-449)) — TYPE A LINE, OR KEEP IT AS A SAVED ROW.
 *
 * Since ADR-3D-449 a statement the figure already holds is answered «כבר קיים» and adds no row. A row saved before the
 * rule still replays as saved: a load never reads the submit decision, so the fold, its notices and the plane chips still
 * see it. The locks of those read-outs (#396, #842, #847, #850, #853, #1475, #1476, #1486, #1491) build their figure
 * here: each line is typed through the store's own `submit`, and a line answered «כבר קיים» is appended as the row a
 * saved file would hold. `typedKnown` lists those lines, so a lock can also assert what typing them does today.
 */
import { parse3 } from '../parser/parse3';
import { useGeo3, type Fact3 } from '../store/store3';

let saved = 0;

export function submitOrSave3(u: string): 'typed' | 'saved' {
  const st = useGeo3.getState();
  const rows = st.facts.length;
  st.submit(u);
  const now = useGeo3.getState();
  if (now.lastError !== null || now.facts.length !== rows || now.lastNotice?.code !== 'already-stated') return 'typed';
  const p = parse3(u);
  if (!p.ok) throw new Error(`«${u}» answered already-stated but does not parse`);
  const row: Fact3 = { id: `saved-${++saved}`, utterance: u, cmds: p.commands, enabled: true };
  useGeo3.setState({ facts: [...now.facts, row], lastNotice: null });
  return 'saved';
}

/** Build `lines` with {@link submitOrSave3}; the lines answered «כבר קיים» when typed. */
export function buildSaved3(lines: readonly string[]): string[] {
  return lines.filter((u) => submitOrSave3(u) === 'saved');
}
