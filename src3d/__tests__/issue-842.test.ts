/**
 * #842 (ADR-3D-192) — the two halves of the operator's #839 report that ADR-3D-191 did not answer.
 *
 * Operator, 2026-08-31, playing prod/2026-08-31:
 *
 *   *"I'm pretty sure that the last one BE מוכל במישור ABCD just drew the plane … by the הסתר מישור
 *   that was added, make me think it just drew the plane again (which already existed)."*
 *
 * Two defects produced that one reading, and they are independent:
 *
 *  3. every row MENTIONING a point-run plane grew a «הסתר מישור» chip, so two rows offered to toggle
 *     one plane and the relation's SOLE affordance was "hide plane";
 *  4. the containment was true, changed nothing, and said nothing — a ✓ that reads as "something
 *     happened" when nothing did.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { planeChipsByFact, planesNamedBy } from '../store/planeChips';
import { buildNotices3 } from '../engine/notices';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const st = () => useGeo3.getState();
const build = (us: string[]) => {
  reset();
  for (const u of us) {
    submit(u);
    expect(st().lastError, `«${u}» should build`).toBeNull();
  }
  return derive3(st().facts, st().seed);
};
const chips = () => planeChipsByFact(st().facts);
const utterOf = (id: string) => st().facts.find((f) => f.id === id)!.utterance;
/** Which utterances currently offer a plane chip, and for which plane. */
const chipRows = () =>
  [...chips()].flatMap(([id, names]) => names.map((n) => [utterOf(id), n] as const));

/** The operator's exact sequence (#839 steps 1–4). */
const OPERATOR = ["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD'];

describe('#842 step 3 — only the row that MATERIALISED the plane offers its toggle', () => {
  beforeEach(reset);

  it("the operator's figure: «מישור ABCD» keeps the chip, «BE מוכל במישור ABCD» does not", () => {
    build(OPERATOR);
    expect(chipRows()).toEqual([['מישור ABCD', 'ABCD']]);
  });

  it('SUPERSEDED by #847 — a relation that is the only mention gets NO chip either', () => {
    // This file originally locked the opposite: the containment kept the chip because nothing else
    // had declared the plane. That was clause 2 of ADR-3D-192 — an inference, not the operator's
    // instruction — and they rejected it on sight (a relation is a statement ABOUT a plane, never a
    // declaration of one). The reachability it protected now lives in the data panel's planes
    // section (ADR-3D-197). Kept as a test, inverted, so the superseded behaviour cannot creep back.
    build(["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD']);
    expect(chipRows()).toEqual([]);
  });

  it('the DECLARING row wins even when a relation named the plane first', () => {
    // Order must not decide ownership: whoever declares the plane owns its chip, wherever they sit.
    build(["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD', 'מישור ABCD']);
    expect(chipRows()).toEqual([['מישור ABCD', 'ABCD']]);
  });

  it('the rule is not containment-only — a ∥ row does not toggle a plane another row drew', () => {
    // The defect was identical for every relation family; fixing only the reported one would be the
    // special-case patch standing rule 1 forbids.
    build(["קובייה ABCDA'B'C'D'", 'מישור ABCD', "מישור A'B'C'D'", "ABCD מקביל למישור A'B'C'D'"]);
    const rows = chipRows();
    expect(rows.map((r) => r[0])).not.toContain("ABCD מקביל למישור A'B'C'D'");
    expect(new Set(rows.map((r) => r[1]))).toEqual(new Set(['ABCD', "A'B'C'D'"]));
  });

  it('two distinct planes keep two distinct owners', () => {
    build(["קובייה ABCDA'B'C'D'", 'מישור ABCD', "מישור A'B'C'D'"]);
    expect(chipRows()).toEqual([
      ['מישור ABCD', 'ABCD'],
      ["מישור A'B'C'D'", "A'B'C'D'"],
    ]);
  });

  it('every plane a fact list mentions is still REACHABLE — via a row or the panel (#847)', () => {
    // The property that matters beyond any one sequence: narrowing ownership must never orphan a
    // plane. After #847 the answer is no longer "some row" — a plane nobody declared is reachable
    // from the data panel's planes section, which lists what the FIGURE draws.
    for (const seq of [
      OPERATOR,
      ["קובייה ABCDA'B'C'D'", 'E אמצע AC', 'BE מוכל במישור ABCD'],
      ["קובייה ABCDA'B'C'D'", 'מישור ABCD', "מישור A'B'C'D'", "ABCD מקביל למישור A'B'C'D'"],
    ]) {
      build(seq);
      const mentioned = new Set(st().facts.flatMap((f) => f.cmds.flatMap(planesNamedBy)));
      const onRows = new Set(chipRows().map(([, name]) => name));
      const inPanel = new Set(derive3(st().facts, st().seed).resolved.planes.keys());
      for (const name of mentioned) {
        expect(onRows.has(name) || inPanel.has(name), `${name} unreachable in ${JSON.stringify(seq)}`).toBe(true);
      }
    }
  });

  it('each plane is offered by EXACTLY ONE row — the reported symptom, stated as a property', () => {
    build(OPERATOR);
    const names = chipRows().map(([, n]) => n);
    expect(names.length).toBe(new Set(names).size);
  });
});

describe('#842 step 4 — a redundant containment says so', () => {
  beforeEach(reset);

  it("the operator's figure: «BE מוכל במישור ABCD» is true, changes nothing, and is reported redundant", () => {
    const d = build(OPERATOR);
    expect(buildNotices3(d.construction)).toContainEqual({
      kind: 'already-known',
      rel: 'contained',
      subject: 'BE',
      object: 'ABCD',
    });
  });

  it('a containment that RE-HOMED a free endpoint is never called redundant (ADR-3D-191)', () => {
    // The trap: after #839's fix the re-homed endpoint is itself an `on-plane` rider, so a naive
    // "both ends lie in the plane" test would report the containment that just did the work as
    // pointless. The `implied` flag is what separates them.
    const d = build(["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'קטע BE', 'BE מוכל במישור ABCD']);
    expect(d.construction.points.get('E')).toMatchObject({ kind: 'on-plane', plane: 'ABCD', implied: true });
    expect(buildNotices3(d.construction).some((n) => n.kind === 'already-known' && n.rel === 'contained')).toBe(false);
  });

  it('the notice survives reload and undo — it is derived, never a one-shot event', () => {
    build(OPERATOR);
    // Derived twice from the same facts, and once more after a round trip through the store.
    const first = buildNotices3(derive3(st().facts, st().seed).construction);
    const again = buildNotices3(derive3([...st().facts], st().seed).construction);
    expect(again).toEqual(first);
    expect(first.some((n) => n.kind === 'already-known' && n.rel === 'contained')).toBe(true);
  });

  it('is seed-invariant — a structural entailment cannot depend on where the figure was sampled', () => {
    // Deliberately the opposite of #827's defect: this verdict never consults a sampled position, so
    // it must read identically at every seed. If it ever does not, it has started guessing.
    for (const seed of [0, 1, 3, 17, 42]) {
      reset();
      OPERATOR.forEach(submit);
      const d = derive3(st().facts, seed);
      expect(buildNotices3(d.construction).some((n) => n.kind === 'already-known' && n.rel === 'contained'), `seed ${seed}`).toBe(true);
    }
  });

  it('a midpoint chain still counts as entailed — the class, not the one reported point', () => {
    // E is the midpoint of AC, F the midpoint of AE: both are entailed in ABCD by recursion.
    const d = build(["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'E אמצע AC', 'F אמצע AE', 'BF מוכל במישור ABCD']);
    expect(buildNotices3(d.construction)).toContainEqual({
      kind: 'already-known',
      rel: 'contained',
      subject: 'BF',
      object: 'ABCD',
    });
  });

  it('parses the operator sequence through the real grammar (no hand-built commands)', () => {
    for (const u of OPERATOR) expect(parse3(u).ok, u).toBe(true);
  });
});
