/**
 * #847 — a row that FAILED owns no plane affordance.
 *
 * The operator's screenshot, 2026-08-31, playing round #843:
 *
 *   קובייה ABCDA'B'C'D'
 *   E אמצע AC
 *   BE מוכל במישור ABCD          → green, chip «פאה בלבד»
 *   [delete the «E אמצע AC» row]
 *
 * After the delete the containment goes AMBER — E is undefined, so the relation is refused — **and it
 * kept the chip**. A row displaying an error, which materialised nothing, owned the toggle for a
 * plane. Under any reading of #842 that is wrong, and unlike the ownership question it needs no
 * ruling.
 *
 * The operator then ruled on the coupled half: a relation NEVER owns a plane, and every drawn plane
 * gets its toggle in the data panel's planes section instead. Both are locked below — the removal
 * and the reachability it would otherwise cost (#821: *"the user has the option of disabling it
 * through the input panel"*).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { planeChipsByFact } from '../store/planeChips';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const build = (us: string[]) => {
  reset();
  for (const u of us) st().submit(u);
};
/** Chip ownership as the UI computes it — status included. */
const chips = () => {
  const d = derive3(st().facts, st().seed);
  const owned = planeChipsByFact(st().facts, (id) => d.status[id] === 'ok');
  return [...owned].flatMap(([id, names]) =>
    names.map((n) => [st().facts.find((f) => f.id === id)!.utterance, n] as const),
  );
};

describe('#847 — a non-ok row carries no plane chip', () => {
  beforeEach(reset);

  it("the operator's sequence: the containment row never carries a chip, amber or green", () => {
    build(["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD']);
    expect(chips(), 'a relation states something ABOUT a plane; it does not declare one').toEqual([]);

    const eRow = st().facts.find((f) => f.utterance.includes('אמצע'))!;
    st().remove(eRow.id);

    const d = derive3(st().facts, st().seed);
    const containment = st().facts.find((f) => f.utterance.includes('מוכל'))!;
    expect(d.status[containment.id], 'the containment is refused once E is gone').not.toBe('ok');
    expect(chips(), 'and still owns nothing').toEqual([]);
  });

  it('the plane is still REACHABLE — it appears in the figure, so the panel lists it', () => {
    // The cost the removal would otherwise carry (#821). The panel section enumerates what the
    // FIGURE draws, so a plane a relation materialised is controllable even though no row declared it.
    build(["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD']);
    const d = derive3(st().facts, st().seed);
    expect([...d.resolved.planes.keys()], 'the plane the relation materialised is drawn').toContain('ABCD');
  });

  it('no relation family carries a chip — not ∥, ⟂, distances or claims either', () => {
    // Restricting the rule to containment would special-case the one input that was reported.
    build(["קובייה ABCDA'B'C'D'", "ABCD מקביל למישור A'B'C'D'"]);
    expect(chips()).toEqual([]);
  });

  it('a DECLARED plane keeps its chip on its own row, even when a relation about it fails', () => {
    // The plane row is still fine; only the relation broke. The student must not lose control of a
    // plane they themselves declared because a later sentence stopped holding.
    build(["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD']);
    const eRow = st().facts.find((f) => f.utterance.includes('אמצע'))!;
    st().remove(eRow.id);
    expect(chips()).toEqual([['מישור ABCD', 'ABCD']]);
  });

  it('a DECLARING row that is itself not ok owns nothing', () => {
    build(["קובייה ABCDA'B'C'D'", 'מישור ABCD']);
    const d = derive3(st().facts, st().seed);
    const planeRow = st().facts.find((f) => f.utterance.startsWith('מישור'))!;
    const owned = planeChipsByFact(st().facts, (id) => id !== planeRow.id && d.status[id] === 'ok');
    expect(owned.get(planeRow.id)).toEqual([]);
  });

  it('every chip shown belongs to a row that is ok — stated as a property', () => {
    for (const seq of [
      ["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD'],
      ["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD'],
      ["קובייה ABCDA'B'C'D'", 'מישור ABCD', "מישור A'B'C'D'"],
    ]) {
      build(seq);
      const d = derive3(st().facts, st().seed);
      const owned = planeChipsByFact(st().facts, (id) => d.status[id] === 'ok');
      for (const [id, names] of owned) {
        if (names.length === 0) continue;
        expect(d.status[id], `${JSON.stringify(seq)} → row ${id} owns a chip while not ok`).toBe('ok');
      }
    }
  });

  it('no plane is offered twice — the #842 property still holds', () => {
    build(["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD']);
    const names = chips().map(([, n]) => n);
    expect(names.length).toBe(new Set(names).size);
  });
});
