/**
 * #424 (ADR-3D-109): a stated TRIANGLE-shape qualifier is lowered to constraints in EVERY position,
 * and can never silently vanish.
 *
 * Reported (operator, 2026-07-29): `ABC משולש שווה צלעות` "is not recognized". It was worse than
 * unrecognized — it parsed `ok`, committed with no error and no note, and drew a SCALENE triangle
 * byte-identical to the plain `משולש ABC` (measured 1.000 / 1.102 / 1.281 at seed 0, both forms).
 * The ADR-052 cardinal sin — a figure contradicting its own givens — reporting ✓.
 *
 * The class was wider than the report: `שווה שוקיים` was read NOWHERE (silently dropped in all five
 * positions — flat, both prisms, both pyramids), and `שווה צלעות` was honoured only where someone had
 * happened to write an inline regex (three copies), so a non-right pyramid dropped it too. Which
 * (qualifier × position) pairs worked was an accident of coverage — the ADR-3D-069 shape verbatim.
 *
 * What this locks:
 *  1. the operator's exact utterance, measured GEOMETRICALLY at several seeds (not "a length-rel was emitted");
 *  2. the isosceles default, and an explicit later pair OVERRIDING it (the ADR-114 / M4 yield) rather
 *     than stacking with it into an equilateral triangle nobody asked for;
 *  3. every position: flat polygon, right prism, oblique prism, right pyramid, tetra;
 *  4. `משולש ABC` unchanged — the proof the macro adds constraints only when the words are there;
 *  5. the QUALIFIER ATTACHES TO ITS OWN NOUN: `טרפז שווה שוקיים` is an isosceles TRAPEZOID and must not
 *     be claimed by the triangle reading;
 *  6. right + isosceles anchors the equal pair at the RIGHT-ANGLE vertex (a right triangle's equal
 *     sides can only be its legs — the first-vertex default would demand a leg equal to the hypotenuse);
 *  7. the honesty gate runs on the DETERMINISTIC path, so a qualifier no command accounts for is
 *     refused by name instead of committing silently.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { droppedTriShape3 } from '../parser/honesty3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** |AB|, |BC|, |CA| of the base ring at a seed — the figure itself, never the command list. */
function baseSides(seed: number, ids: string[] = ['A', 'B', 'C']): [number, number, number] {
  const pos = derive3(state().facts, seed).positions;
  const d = (p: string, q: string) => {
    const a = pos.get(p)!, b = pos.get(q)!;
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  };
  return [d(ids[0], ids[1]), d(ids[1], ids[2]), d(ids[2], ids[0])];
}

const SEEDS = [0, 1, 2, 3];

describe('#424 — the reported utterance builds an equilateral triangle', () => {
  beforeEach(reset);

  for (const u of ['ABC משולש שווה צלעות', 'משולש שווה צלעות ABC', 'equilateral triangle ABC']) {
    it(`«${u}» has all three sides equal at every seed`, () => {
      submit(u);
      expect(state().lastError).toBeNull();
      for (const s of SEEDS) {
        const [ab, bc, ca] = baseSides(s);
        expect(bc).toBeCloseTo(ab, 6);
        expect(ca).toBeCloseTo(ab, 6);
      }
    });
  }

  it('the plain triangle is UNCHANGED — scalene at every seed (the macro adds nothing unstated)', () => {
    submit('משולש ABC');
    expect(state().lastError).toBeNull();
    for (const s of SEEDS) {
      const [ab, bc, ca] = baseSides(s);
      // genuinely three different lengths — not merely "no constraint object was emitted"
      expect(Math.abs(bc - ab)).toBeGreaterThan(1e-3);
      expect(Math.abs(ca - ab)).toBeGreaterThan(1e-3);
    }
  });
});

describe('#424 — isosceles states SOME two sides equal, and the default yields (M4 / ADR-114)', () => {
  beforeEach(reset);

  for (const u of ['ABC משולש שווה שוקיים', 'isosceles triangle ABC']) {
    it(`«${u}» makes exactly ONE pair equal — apex A, and NOT equilateral`, () => {
      submit(u);
      expect(state().lastError).toBeNull();
      for (const s of SEEDS) {
        const [ab, bc, ca] = baseSides(s);
        expect(ca).toBeCloseTo(ab, 6); // |AB| = |AC| — the default apex
        expect(Math.abs(bc - ab)).toBeGreaterThan(1e-3); // the third side stays free
      }
    });
  }

  it('an EXPLICIT pair overrides the soft default instead of stacking into an equilateral', () => {
    submit('ABC משולש שווה שוקיים');
    submit('|AB| = |BC|');
    expect(state().lastError).toBeNull();
    for (const s of SEEDS) {
      const [ab, bc, ca] = baseSides(s);
      expect(bc).toBeCloseTo(ab, 6); // the STATED pair holds
      // and the soft default was retired — the triangle is NOT equilateral
      expect(Math.abs(ca - ab)).toBeGreaterThan(1e-3);
    }
  });

  it('the apex angle stays a free DOF — an isosceles triangle is not pinned to one shape', () => {
    submit('ABC משולש שווה שוקיים');
    const third = SEEDS.map((s) => baseSides(s)[1]);
    expect(new Set(third.map((x) => x.toFixed(4))).size).toBeGreaterThan(1);
  });
});

describe('#424 — every position honours the qualifier (the class, not the instance)', () => {
  beforeEach(reset);

  const EQUILATERAL: [string, string][] = [
    ['flat polygon', 'ABC משולש שווה צלעות'],
    ['right prism', 'מנסרה ישרה שבסיסה משולש שווה צלעות'],
    ['oblique prism', 'מנסרה שבסיסה משולש שווה צלעות'],
    ['right pyramid', 'פירמידה ישרה שבסיסה משולש שווה צלעות'],
    ['tetra (no ישרה)', 'פירמידה שבסיסה משולש שווה צלעות'],
  ];
  for (const [where, u] of EQUILATERAL) {
    it(`${where}: «${u}» — base equilateral at every seed`, () => {
      submit(u);
      expect(state().lastError).toBeNull();
      for (const s of SEEDS) {
        const [ab, bc, ca] = baseSides(s);
        expect(bc).toBeCloseTo(ab, 6);
        expect(ca).toBeCloseTo(ab, 6);
      }
    });
  }

  const ISOSCELES: [string, string][] = [
    ['flat polygon', 'ABC משולש שווה שוקיים'],
    ['right prism', 'מנסרה ישרה שבסיסה משולש שווה שוקיים'],
    ['oblique prism', 'מנסרה שבסיסה משולש שווה שוקיים'],
    ['right pyramid', 'פירמידה ישרה שבסיסה משולש שווה שוקיים'],
    ['tetra (no ישרה)', 'פירמידה שבסיסה משולש שווה שוקיים'],
  ];
  for (const [where, u] of ISOSCELES) {
    it(`${where}: «${u}» — the base has an equal pair at every seed`, () => {
      submit(u);
      expect(state().lastError).toBeNull();
      for (const s of SEEDS) {
        const [ab, , ca] = baseSides(s);
        expect(ca).toBeCloseTo(ab, 6);
      }
    });
  }
});

describe('#424 — the qualifier attaches to the noun it was written beside', () => {
  beforeEach(reset);

  it('«טרפז שווה שוקיים» is an isosceles TRAPEZOID base — never claimed by the triangle reading', () => {
    const p = parse3('פירמידה ישרה שבסיסה טרפז שווה שוקיים');
    expect(p.ok).toBe(true);
    const solid = (p as { commands: { type: string; kind?: string }[] }).commands[0];
    expect(solid.type).toBe('solid');
    expect(solid.kind).toBe('pyramidTrapR'); // a TRAPEZOID base, not a triangular pyramid
  });

  it('an isosceles trapezoid base gets its equal legs exactly ONCE (never doubled by the cyclic fix)', () => {
    const p = parse3('פירמידה ישרה שבסיסה טרפז שווה שוקיים');
    const rels = (p as { commands: { type: string }[] }).commands.filter((c) => c.type === 'length-rel');
    expect(rels).toHaveLength(1);
  });

  it('a non-right isosceles trapezoid base still carries its equal legs', () => {
    const p = parse3('פירמידה שבסיסה טרפז שווה שוקיים');
    expect(p.ok).toBe(true);
    const rels = (p as { commands: { type: string }[] }).commands.filter((c) => c.type === 'length-rel');
    expect(rels).toHaveLength(1);
  });
});

describe('#424 — right + isosceles anchors the equal pair at the RIGHT-ANGLE vertex', () => {
  beforeEach(reset);

  it('«ABC משולש ישר זווית ושווה שוקיים» — the two LEGS are equal, hypotenuse = √2·leg', () => {
    submit('ABC משולש ישר זווית ושווה שוקיים');
    expect(state().lastError).toBeNull();
    for (const s of SEEDS) {
      const [ab, bc, ca] = baseSides(s); // right angle at the middle vertex B ⇒ legs BA, BC
      expect(bc).toBeCloseTo(ab, 6);
      expect(ca).toBeCloseTo(ab * Math.SQRT2, 5);
    }
  });
});

describe('#424 — the honesty gate is bound to the EVENT, not to the LLM path', () => {
  it('a stated qualifier no command accounts for is named as lost', () => {
    expect(droppedTriShape3('ABC משולש שווה צלעות', [{ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] }]))
      .toEqual(['שווה צלעות']);
    expect(droppedTriShape3('isosceles triangle ABC', [{ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] }]))
      .toEqual(['isosceles']);
  });

  it('an equal-length relation OR an equilateral-by-construction kind accounts for it (generous side)', () => {
    expect(droppedTriShape3('ABC משולש שווה צלעות', [
      { type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] },
      { type: 'length-rel', a1: 'A', b1: 'B', rhs: { pair: ['B', 'C'] }, c: 1 },
    ])).toEqual([]);
    expect(droppedTriShape3('מנסרה ישרה שבסיסה משולש שווה צלעות', [
      { type: 'solid', kind: 'prism3e', ids: ['A', 'B', 'C', "A'", "B'", "C'"] },
    ])).toEqual([]);
  });

  it('an utterance with no qualifier is never gated', () => {
    expect(droppedTriShape3('משולש ABC', [{ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] }])).toEqual([]);
  });

  it('every shipped form passes its own gate (no false positive on the real parser)', () => {
    for (const u of [
      'ABC משולש שווה צלעות', 'ABC משולש שווה שוקיים', 'equilateral triangle ABC', 'isosceles triangle ABC',
      'מנסרה ישרה שבסיסה משולש שווה צלעות', 'מנסרה שבסיסה משולש שווה שוקיים',
      'פירמידה ישרה שבסיסה משולש שווה שוקיים', 'פירמידה שבסיסה משולש שווה צלעות',
      'פירמידה ישרה שבסיסה טרפז שווה שוקיים', 'טטראדר שווה מקצועות ABCD',
    ]) {
      const p = parse3(u);
      expect(p.ok, u).toBe(true);
      if (!p.ok) continue;
      expect(droppedTriShape3(u, p.commands), u).toEqual([]);
    }
  });
});
