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
