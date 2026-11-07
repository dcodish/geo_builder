/**
 * #1936 (ADR-658, ADR-746) — THE NO-ROOM SPY, on the corpus's one walk (#2739, ADR-W-191, restoring ADR-394).
 *
 * The widened angle-sum prover refuses a stated angle that leaves an unstated one no room (`kind: 'no-room'`), and
 * since #2344 a base angle an equal pair forces (`limit-collapse`). Both operator rulings (2026-10-09, 2026-10-10)
 * name one risk: the verdict must fire only on a contradiction no later given can clear. So across every scenario
 * and every saved fixture, the verdict may fire only on the listed class rows, and the prover must have been asked.
 *
 * This used to be its own file, which folded the whole corpus cold (11 CPU-minutes). Now each file that already
 * walks the corpus installs the spy with:
 *
 *   vi.mock('@/engine/metricFeasibility', async (importOriginal) =>
 *     (await import('./no-room-spy')).spyOnProver(await importOriginal()));
 *
 * sets `noRoom.current` before anything of a scenario or fixture folds, and asserts `noRoomOutsideClass(current)`
 * is empty. The spy returns the real verdict: it records and never changes an answer.
 */

/** Rows whose FOLDED facts may meet the verdict. The #1936 and #2344 scenarios drive their refused line through the
 *  gate in `check` (a refused line never becomes a fact), so they are no members. ADR-537's own figure is
 *  («AB = AC» · «∠ABC = ∠ACB» · «∠ABC = 90», its last line a fact by construction): an isosceles pair with a base
 *  right angle, refused by the prover's limit-collapse reading since #2344 (ADR-746). */
export const NO_ROOM_CLASS_ROWS = new Set<string>(['scenario:contradictory-right-angles-refused-not-drawn-1328']);

export const noRoom = {
  /** the scenario or fixture whose folds are running: `scenario:<id>` or `fixture:<name>` */
  current: '',
  calls: 0,
  hits: [] as { at: string; polygon: string; angles: string }[],
};

type Angle = { ray1: string; vertex: string; ray2: string; value: unknown };
type Verdict = { kind?: string; polygon: string[]; angles: Angle[]; inferred?: Angle[] } | null | undefined;

/** Wrap the module so `angleSumImpossibility` records every call and every no-room / limit-collapse verdict. */
export function spyOnProver<M extends { angleSumImpossibility: (...a: never[]) => unknown }>(real: M): M {
  const prove = real.angleSumImpossibility as (...a: unknown[]) => Verdict;
  return {
    ...real,
    angleSumImpossibility: (...a: unknown[]) => {
      noRoom.calls++;
      const m = prove(...a);
      if (m?.kind === 'no-room' || m?.kind === 'limit-collapse')
        noRoom.hits.push({ at: noRoom.current, polygon: m.polygon.join(''), angles: [...m.angles, ...(m.inferred ?? [])].map((x) => `${x.ray1}${x.vertex}${x.ray2}=${x.value}`).join(',') });
      return m;
    },
  } as M;
}

/** The verdicts that fired while `at` was folding, unless `at` is a class row. */
export function noRoomOutsideClass(at: string): { at: string; polygon: string; angles: string }[] {
  if (NO_ROOM_CLASS_ROWS.has(at)) return [];
  return noRoom.hits.filter((h) => h.at === at);
}
