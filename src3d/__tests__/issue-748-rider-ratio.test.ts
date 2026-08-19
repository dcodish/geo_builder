/**
 * #748: a segment ratio stated as its OWN fact determines an on-segment rider.
 *
 * Operator report (2026-08-19, prod): «מקבילון» / «E על AA'» / «AE=2*EA'» — the third line came back
 * «הטענה לא מתקיימת בציור — בדקו את החישוב». The ratio is not merely satisfiable, it is closed-form
 * DETERMINED (t = ⅔); the tool was refuting a correct given on the strength of a configuration it had
 * sampled itself (ADR-052). The reading existed but was welded to the declaration utterance
 * («E על AA' כך ש-AE = 2EA'»), so the incremental form — the interaction this product is built on —
 * could not reach it.
 *
 * The lock is the SPLIT form reaching the same figure as the one-line form, across every spelling.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const build = (lines: string[]) => {
  reset();
  for (const u of lines) submit(u);
  const st = useGeo3.getState();
  return { err: st.lastError, facts: st.facts, pos: derive3(st.facts, st.seed).positions };
};
const dist = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
/** |AE| / |EA'| as actually drawn. */
const ratio = (pos: Map<string, { x: number; y: number; z: number }>) =>
  dist(pos.get('A')!, pos.get('E')!) / dist(pos.get('E')!, pos.get("A'")!);

describe('#748 — the ratio determines the rider, stated on its own line', () => {
  beforeEach(reset);

  it("the operator's exact sequence builds, and E actually sits at AE = 2·EA'", () => {
    const { err: e, pos } = build(['מקבילון', "E על AA'", "AE=2*EA'"]);
    expect(e).toBeNull();
    expect(ratio(pos)).toBeCloseTo(2, 6);
  });

  it('the split form reaches the SAME figure as the one-line clause (one semantics, two ways to say it)', () => {
    const split = build(['מקבילון', "E על AA'", "AE = 2EA'"]);
    const oneLine = build(['מקבילון', "E על AA' כך ש-AE = 2EA'"]);
    expect(split.err).toBeNull();
    expect(oneLine.err).toBeNull();
    for (const id of ['A', "A'", 'E', 'B', 'C', 'D', "B'", "C'", "D'"]) {
      expect(split.pos.get(id)!.x).toBeCloseTo(oneLine.pos.get(id)!.x, 6);
      expect(split.pos.get(id)!.y).toBeCloseTo(oneLine.pos.get(id)!.y, 6);
      expect(split.pos.get(id)!.z).toBeCloseTo(oneLine.pos.get(id)!.z, 6);
    }
  });

  // every spelling of the one statement — the three command shapes it lowers to
  it.each([
    ["AE=2*EA'", 2], // vec-rel
    ["AE = 2EA'", 2],
    ["|AE| = 2|EA'|", 2], // length-rel
    ["AE:EA' = 2:1", 2], // length-ratio claim
    ["אורך AE = 2*EA'", 2],
    ["|EA'| = 0.5|AE|", 2], // the rider stated FIRST
    ["A'E = 2EA", 0.5], // the host named the other way round ⇒ t = ⅓
    ["AE:EA' = 3:2", 1.5],
    // a LENGTH pair is unordered — the operator's report on the first cut: every one of these is the
    // SAME statement as its EA' twin above, and each was refused for writing the pair the other way
    ["|AE|=2|A'E|", 2],
    ["|AE| = 2|A'E|", 2],
    ["|A'E| = 0.5|AE|", 2],
    ["אורך AE = 2*A'E", 2],
    ["AE:A'E = 2:1", 2],
    ["A'E:AE = 1:2", 2],
  ])('«%s» builds and gives |AE|/|EA\'| = %s', (utterance, expected) => {
    const { err: e, pos } = build(['מקבילון', "E על AA'", utterance as string]);
    expect(e).toBeNull();
    expect(ratio(pos)).toBeCloseTo(expected as number, 6);
  });

  it('English mirror: "E on AA\'" then "AE=2*EA\'"', () => {
    const { err: e, pos } = build(['parallelepiped', "E on AA'", "AE=2*EA'"]);
    expect(e).toBeNull();
    expect(ratio(pos)).toBeCloseTo(2, 6);
  });

  it('the rider slides on a PRISM edge too — the class is the rider, not the parallelepiped', () => {
    const { err: e, pos } = build(['מנסרה ישרה משולשת ABC', "K על AA'", "AK = 2KA'"]);
    expect(e).toBeNull();
    expect(dist(pos.get('A')!, pos.get('K')!) / dist(pos.get('K')!, pos.get("A'")!)).toBeCloseTo(2, 6);
  });
});

describe('#748 — honesty: what must still refuse, and what must not move', () => {
  beforeEach(reset);

  it('a ratio CONTRADICTING an already-stated one still refuses — a determined rider is claimed about, not redefined', () => {
    const { err: e } = build(['מקבילון', "E על AA' כך ש-AE = 2EA'", "AE = 3EA'"]);
    expect(e).not.toBeNull();
    expect(e).toMatchObject({ code: 'claim-refuted' });
  });

  it('a ratio AGREEING with the stated one verifies (idempotent, no false accusation)', () => {
    const { err: e, pos } = build(['מקבילון', "E על AA' כך ש-AE = 2EA'", "AE = 2EA'"]);
    expect(e).toBeNull();
    expect(ratio(pos)).toBeCloseTo(2, 6);
  });

  it('«אמצע» stays determined — a stated t is never re-opened by the retarget', () => {
    const { err: e, pos } = build(['מקבילון', "M אמצע AA'", "AM = 2MA'"]);
    expect(e).not.toBeNull(); // the midpoint makes AM = MA'; 2 is genuinely false
    expect(dist(pos.get('A')!, pos.get('M')!)).toBeCloseTo(dist(pos.get('M')!, pos.get("A'")!), 6);
  });

  it('the NON-chain spelling is not guessed at — «AE = 2*A\'E» reads vector≠length, so it is no ratio given', () => {
    // The rider is not the shared middle letter, so the vector reading (t = 2, off the segment) and the
    // length reading (t = ⅔) disagree — believing either would be a guess. It REFUSES, and leaves E
    // where the seed put it rather than quietly adopting the chain value.
    const { err: e, pos } = build(['מקבילון', "E על AA'", "AE = 2*A'E"]);
    expect(e).toMatchObject({ code: 'claim-refuted' });
    expect(ratio(pos)).not.toBeCloseTo(2, 3);
  });

  it('STABILITY: adding the ratio moves E and nothing else', () => {
    const before = build(['מקבילון', "E על AA'"]);
    const after = build(['מקבילון', "E על AA'", "AE = 2EA'"]);
    for (const id of ['A', "A'", 'B', 'C', 'D', "B'", "C'", "D'"]) {
      expect(after.pos.get(id)!.x).toBeCloseTo(before.pos.get(id)!.x, 6);
      expect(after.pos.get(id)!.y).toBeCloseTo(before.pos.get(id)!.y, 6);
      expect(after.pos.get(id)!.z).toBeCloseTo(before.pos.get(id)!.z, 6);
    }
    expect(ratio(after.pos)).toBeCloseTo(2, 6);
  });

  it("the CLAUSE is about lengths too — «כך ש-AE = 2A'E» is the same given as «כך ש-AE = 2EA'»", () => {
    const reversed = build(['מקבילון', "E על AA' כך ש-AE = 2A'E"]);
    const chain = build(['מקבילון', "E על AA' כך ש-AE = 2EA'"]);
    expect(reversed.err).toBeNull();
    expect(ratio(reversed.pos)).toBeCloseTo(2, 6);
    expect(reversed.pos.get('E')!.z).toBeCloseTo(chain.pos.get('E')!.z, 6);
  });

  it('the one-line clause still parses to a determined t (the 2020 קיץ Q2 form must not regress)', () => {
    const r = parse3("K על AA' כך ש-AK = 2KA'");
    expect(r).toMatchObject({ ok: true, commands: [{ type: 'point-on-segment3', id: 'K', a: 'A', b: "A'" }] });
    expect((r as { commands: { t: number }[] }).commands[0].t).toBeCloseTo(2 / 3, 9);
  });

  it('a bare membership stays a FREE rider (no t invented — ADR-052)', () => {
    expect(parse3("E על AA'")).toMatchObject({ ok: true, commands: [{ type: 'point-on-segment3', id: 'E', a: 'A', b: "A'" }] });
    expect((parse3("E על AA'") as { commands: { t?: number }[] }).commands[0].t).toBeUndefined();
  });
});
