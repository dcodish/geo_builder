/**
 * Catalog-integrity guard: THEOREM_TABLE must stay a faithful projection of the canonical bagrut list
 * ([07](docs/07-theorem-reference.md)). Parses 07's markdown tables and asserts, for every tabled
 * theorem: it exists in 07, its `type` matches, and its `en`/`he` statements are BYTE-EQUAL to 07 (no
 * drift, no paraphrase). 07 stays the single source of truth.
 *
 * Appendix `O` theorems (practice-only Appendix A / removed-curriculum Appendix B) MAY be tabled
 * (ADR-217, operator: "keep A2–A6, B3 — never main, only supporting") but ONLY as SUPPORTING entries:
 * every `O` def MUST carry `salience: 'background'`. The invariant is checked here, encoding
 * "supporting-only, never a headline" structurally rather than per entry.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEOREM_TABLE } from '../table';
import { THEOREM_COVERAGE } from '../coverage';

const here = dirname(fileURLToPath(import.meta.url));
const refPath = resolve(here, '../../../docs/07-theorem-reference.md');
const ref = readFileSync(refPath, 'utf8');

/** Parse every `| N | P/C/O | English | עברית |` row (numeric ids AND Appendix `A2`/`B3` labels) into
 *  id-string → {type, en, he}. Ids are keyed as strings so `201` and `A2` share one map. */
function parseReference(md: string): Map<string, { type: string; en: string; he: string }> {
  const out = new Map<string, { type: string; en: string; he: string }>();
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*([A-Za-z]?\d+)\s*\|\s*([POC])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    out.set(m[1], { type: m[2], en: m[3], he: m[4] });
  }
  return out;
}

const REF = parseReference(ref);
const refOf = (id: number | string) => REF.get(String(id));

describe('theorem table integrity vs 07-theorem-reference.md', () => {
  it('parses the reference (sanity: known anchors present)', () => {
    expect(refOf(2)?.en).toBe('Vertically opposite angles are equal.');
    expect(refOf(103)?.type).toBe('P');
    expect(refOf('A2')?.type).toBe('O'); // appendix rows now parse too
    expect(REF.size).toBeGreaterThan(100);
  });

  it('has unique ids', () => {
    const ids = THEOREM_TABLE.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const def of THEOREM_TABLE) {
    describe(`#${def.id}`, () => {
      const r = refOf(def.id);
      it('exists in the reference', () => expect(r, `#${def.id} missing from 07`).toBeDefined());
      it('type matches the reference', () => expect(def.type).toBe(r?.type));
      // The supporting-only invariant: an Appendix (O) theorem may be tabled, but never as a headline.
      it('an appendix (O) theorem is supporting-only (background salience)', () => {
        if (r?.type === 'O') expect(def.salience, `#${def.id} is O ⇒ must be background`).toBe('background');
      });
      it('English statement is byte-equal to the reference', () => expect(def.en).toBe(r?.en));
      it('Hebrew statement is byte-equal to the reference', () => expect(def.he).toBe(r?.he));
    });
  }

  it('the kept appendix supporting theorems (A2–A6, B3) are all tabled as background', () => {
    const byId = new Map(THEOREM_TABLE.map((t) => [String(t.id), t]));
    for (const id of ['A2', 'A3', 'A4', 'A5', 'A6', 'B3']) {
      const def = byId.get(id);
      expect(def, `${id} must be tabled`).toBeDefined();
      expect(def?.type).toBe('O');
      expect(def?.salience).toBe('background');
    }
  });

  // ===== Coverage totality (theorem-discovery v2 T1 — docs/18 §4) =====
  // From here on, "absent from the table" is a tracked STATE, not an invisible gap: every id in 07
  // carries an explicit disposition, and the tabled/no-reveal/supplemental kinds are equivalences,
  // so the map can never drift from the table or the ADR-208/217 policy sets.
  describe('coverage disposition map (THEOREM_COVERAGE)', () => {
    const tabledIds = new Set(THEOREM_TABLE.map((t) => String(t.id)));

    it('is TOTAL over 07: every reference id has a disposition', () => {
      for (const id of REF.keys()) {
        expect(THEOREM_COVERAGE[id], `#${id} is in 07 but has no disposition`).toBeDefined();
      }
    });

    it('has no key outside 07', () => {
      for (const id of Object.keys(THEOREM_COVERAGE)) {
        expect(REF.has(id), `coverage key #${id} is not a 07 id`).toBe(true);
      }
    });

    it("kind 'tabled' ⇔ present in THEOREM_TABLE (both directions)", () => {
      for (const [id, d] of Object.entries(THEOREM_COVERAGE)) {
        if (d.kind === 'tabled') expect(tabledIds.has(id), `#${id} marked tabled but absent from THEOREM_TABLE`).toBe(true);
        else expect(tabledIds.has(id), `#${id} is in THEOREM_TABLE but marked '${d.kind}'`).toBe(false);
      }
    });

    it("kind 'no-reveal' ⇔ the ADR-208 forbidden set {68, 70, 76}", () => {
      const noReveal = Object.entries(THEOREM_COVERAGE)
        .filter(([, d]) => d.kind === 'no-reveal')
        .map(([id]) => id)
        .sort();
      expect(noReveal).toEqual(['68', '70', '76']);
    });

    it("kind 'supplemental' ⇔ the Appendix ids ADR-217 did NOT keep {A1, B1, B2, B4}", () => {
      const supplemental = Object.entries(THEOREM_COVERAGE)
        .filter(([, d]) => d.kind === 'supplemental')
        .map(([id]) => id)
        .sort();
      expect(supplemental).toEqual(['A1', 'B1', 'B2', 'B4']);
    });
  });

  it('excludes the forbidden derived-premise theorems (68/70/76)', () => {
    // ADR-208 no-reveal: the SAS/SSS similarity criteria (68/70) and the bisector-ratio (76) have a DERIVED
    // premise (they ARE the proof task) → never tabled. ADR-220 admits 69 (AA) + 71 (ratios) because a
    // stated parallel-to-a-side ENTAILS the similarity coordinate-free (help, not a reveal) — their byte
    // statements are checked against 07 by the equality loop above.
    const tabled = new Set(THEOREM_TABLE.map((t) => t.id));
    for (const forbidden of [68, 70, 76]) expect(tabled.has(forbidden)).toBe(false);
    for (const admitted of [69, 71]) expect(tabled.has(admitted)).toBe(true);
  });
});
