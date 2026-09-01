/**
 * #845 — the declared-vs-lowered sweep: a `supported` cell must be REACHABLE.
 *
 * #833 was a ∥-to-plane statement, true by construction, refused `no-solution`. The part worth
 * generalising was how it stayed invisible: `relationTable` declared
 *
 * ```ts
 * 'parallel|segment|plane-run': { status: 'supported', actions: ['drive-dims', 'claim'], … }
 * ```
 *
 * `claim` was listed. Nothing implemented it. The table is the product's own statement of what it can do
 * — it drives coverage reasoning and reads as authoritative — and nothing forced a declared action to
 * correspond to code.
 *
 * `relation-battery.test.ts` already carries the honesty ratchet for cells it EXERCISES, with the
 * unexercised ones parked in `BATTERY_PENDING` citing their own pre-program suites. That is where a
 * hollow row hides: "covered by a suite over there" is a claim nobody re-checks. This file drives each
 * pending cell through the REAL `submit` path and asserts it is reachable at all.
 *
 * The sweep found exactly one hollow row (see `KNOWN_UNREACHABLE`), and it is filed rather than fixed
 * here — the round that added this file was scoped to the sweep.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();

/**
 * A minimal utterance sequence per pending cell, in CANONICAL catalog phrasing.
 *
 * Getting the phrasing right is most of the work: a wrong spelling reads as a hollow row when it is
 * only a bad probe. Every sequence below was cross-checked against `catalog3.ts` or the suite the
 * table's own note cites — the first pass of this sweep reported four "holes" that were entirely my
 * phrasing (`ל-` where the catalog writes `לבין`, degrees where the V8-f lane wants `קוסינוס`).
 */
const PENDING_PROBES: Record<string, string[]> = {
  'perp|segment|plane-run': ['פירמידה משולשת ABCD', 'AB מאונך למישור ACD'],
  'perp|segment|vector': ['פירמידה משולשת ABCD', 'נסמן: CD = v', 'AB מאונך ל-v'],
  'perp|vector|vector': ['פירמידה משולשת ABCD', 'נסמן: AB = u, CD = v', 'u מאונך ל-v'],
  'angle|segment|segment': ['פירמידה משולשת ABCD', 'הזווית בין AB לבין AC היא 60'],
  'angle|vector|vector': [
    'פירמידה משולשת ABCD',
    'נסמן: AB = u, CD = v',
    'קוסינוס הזווית בין הוקטורים u ו-v הוא 1/2',
  ],
  'angle|plane-named|plane-named': ['פירמידה משולשת ABCD', 'הזווית בין המישור ABC למישור ACD היא 60'],
  'on|point|plane-named': ['פירמידה משולשת ABCD', 'E על המישור ABC'],
  'on|point|segment': ['פירמידה משולשת ABCD', 'E על AB'],
  'perp|vector|line': ['פירמידה משולשת', 'l1:x=(0,0,0)+t(1,2,3)', 'נסמן: AB = u', 'u מאונך לישר l1'],
  'parallel|vector|line': ['פירמידה משולשת', 'l1:x=(0,0,0)+t(1,2,3)', 'נסמן: AB = u', 'u מקביל לישר l1'],
  'angle|vector|line': [
    'פירמידה משולשת',
    'l1:x=(0,0,0)+t(1,2,3)',
    'נסמן: AB = u',
    'הזווית בין u לבין הישר l1 היא 60',
  ],
  'angle|line|plane-named': [
    'פירמידה משולשת',
    'l1:x=(0,0,0)+t(1,2,3)',
    'הזווית בין הישר l1 לבין המישור ABC היא 60',
  ],
};

/**
 * A RATCHET, and it may only shrink: cells the table calls `supported` that no utterance reaches.
 *
 * `angle|segment|vector` declares `['drive-dims', 'claim']` with the note *"cos-angle with value
 * (V8-f)"*. Five phrasings were tried — the two `קוסינוס … הוקטורים` orders, `קוסינוס … לבין`, and both
 * degree forms — and every one is `not-understood`. Its PERPENDICULAR twin over the identical operand
 * kinds (`perp|segment|vector`, exercised above) works, so this is the angle lane specifically, not the
 * mixed-operand seam.
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  'angle|segment|vector': '#862 — declared supported, unreachable in 5 phrasings; the ⟂ twin works',
};

describe('#845 — every PENDING supported cell is reachable through the real submit path', () => {
  beforeEach(() => st().clear());

  it.each(Object.entries(PENDING_PROBES))('%s', (cell, lines) => {
    for (const l of lines) {
      st().submit(l);
      expect(st().lastError, `${cell}: «${l}»`).toBeNull();
    }
  });

  it('the KNOWN_UNREACHABLE ratchet is honest — each entry really is still unreachable', () => {
    // If one of these starts working, this test fails and the entry must be DELETED. That is what makes
    // the list a ratchet rather than a note: it cannot quietly outlive the defect it records.
    const setup = ['פירמידה משולשת ABCD', 'נסמן: CD = v'];
    const forms = [
      'קוסינוס הזווית בין הוקטורים AB ו-v הוא 1/2',
      'קוסינוס הזווית בין הוקטורים v ו-AB הוא 1/2',
      'קוסינוס הזווית בין AB לבין v הוא 1/2',
      'הזווית בין AB לבין v היא 60',
      'הזווית בין הוקטורים AB ו-v היא 60',
    ];
    expect(KNOWN_UNREACHABLE['angle|segment|vector']).toBeTruthy();
    for (const f of forms) {
      st().clear();
      for (const l of setup) st().submit(l);
      st().submit(f);
      expect(st().lastError, `«${f}» reaches the engine now — delete the ratchet entry`).not.toBeNull();
    }
  });

  it('the mixed-operand SEAM itself is fine — the ⟂ twin over the same kinds works', () => {
    // This is what pins the diagnosis: segment×vector is not the problem, the ANGLE lane is.
    for (const l of ['פירמידה משולשת ABCD', 'נסמן: CD = v', 'AB מאונך ל-v']) {
      st().submit(l);
      expect(st().lastError, l).toBeNull();
    }
  });
});
