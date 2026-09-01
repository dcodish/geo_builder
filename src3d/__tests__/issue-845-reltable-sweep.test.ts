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
  // #862 (ADR-3D-205) — the one cell this sweep found hollow, now REACHABLE and therefore promoted out
  // of the ratchet below and into the probe table, where it is checked like every other supported cell.
  'angle|segment|vector': ['פירמידה משולשת ABCD', 'נסמן: CD = v', 'קוסינוס הזווית בין הוקטורים AB ו-v הוא 1/2'],
};

/**
 * A RATCHET, and it may only shrink: cells the table calls `supported` that no utterance reaches.
 *
 * **It is now EMPTY**, and that is the sweep's whole point arriving. `angle|segment|vector` was its one
 * entry — declared `['drive-dims', 'claim']` with the note *"cos-angle with value (V8-f)"* while five
 * phrasings all came back `not-understood` — and #862 made it reachable, which failed the honesty test
 * below exactly as designed and forced this deletion. Leave the structure standing: the next sweep that
 * finds a hollow row records it here, and the same test will make it impossible to forget.
 */
const KNOWN_UNREACHABLE: Record<string, { why: string; setup: string[]; forms: string[] }> = {};

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
    // #862 (ADR-3D-205): generic over the map rather than naming one cell, because naming it is what
    // would have had to be edited anyway the moment the entry went — and the next hollow row deserves
    // the same net without anyone remembering to rebuild it.
    for (const [cell, entry] of Object.entries(KNOWN_UNREACHABLE)) {
      expect(PENDING_PROBES[cell], `${cell}: a cell cannot be both probed and known-unreachable`).toBeUndefined();
      for (const f of entry.forms) {
        st().clear();
        for (const l of entry.setup) st().submit(l);
        st().submit(f);
        expect(st().lastError, `«${f}» reaches the engine now — delete the ${cell} ratchet entry`).not.toBeNull();
      }
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
