/**
 * #2890 round 2 ([ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493); ADR-W-210 phase 3) — WHERE A NEW ROW'S ID
 * COMES FROM.
 *
 * A row's id is part of a figure's content (`derive3`'s key). When a worker solves an action and the page then runs
 * the same action over what the worker solved, both heaps must give the new row the SAME id, or the page's figure is
 * another content and it solves again. So every id a store action or a load draws comes from here: the ids the job
 * was handed, in order (the page draws them and sends them with the job), and a fresh one only when none is left.
 * Outside a job nothing is installed, and an id is fresh, as it always was.
 */
import { nanoid } from 'nanoid';

let handed: string[] = [];

/** Fresh ids for one job (the page draws them; both heaps use them in the same order). */
export function drawRowIds3(n = 16): string[] {
  return Array.from({ length: n }, () => nanoid(8));
}

/** From now on, new rows take these ids, in order. An empty list: fresh ids again. */
export function useRowIds3(ids: readonly string[]): void {
  handed = [...ids];
}

/** The next row's id. */
export function rowId3(): string {
  return handed.shift() ?? nanoid(8);
}
