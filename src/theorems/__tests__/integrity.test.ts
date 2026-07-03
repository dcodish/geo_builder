/**
 * Catalog-integrity guard: THEOREM_TABLE must stay a faithful projection of the canonical bagrut list
 * ([07](docs/07-theorem-reference.md)). Parses 07's markdown tables and asserts, for every tabled
 * theorem: it exists in 07, its `type` matches, it is NOT an appendix `O` entry, and its `en`/`he`
 * statements are BYTE-EQUAL to 07 (no drift, no paraphrase). 07 stays the single source of truth.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEOREM_TABLE } from '../table';

const here = dirname(fileURLToPath(import.meta.url));
const refPath = resolve(here, '../../../docs/07-theorem-reference.md');
const ref = readFileSync(refPath, 'utf8');

/** Parse every `| N | P/C/O | English | עברית |` row into id → {type, en, he}. */
function parseReference(md: string): Map<number, { type: string; en: string; he: string }> {
  const out = new Map<number, { type: string; en: string; he: string }>();
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([POC])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    out.set(Number(m[1]), { type: m[2], en: m[3], he: m[4] });
  }
  return out;
}

const REF = parseReference(ref);

describe('theorem table integrity vs 07-theorem-reference.md', () => {
  it('parses the reference (sanity: known anchors present)', () => {
    expect(REF.get(2)?.en).toBe('Vertically opposite angles are equal.');
    expect(REF.get(103)?.type).toBe('P');
    expect(REF.size).toBeGreaterThan(100);
  });

  it('has unique ids', () => {
    const ids = THEOREM_TABLE.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const def of THEOREM_TABLE) {
    describe(`#${def.id}`, () => {
      const r = REF.get(def.id);
      it('exists in the reference', () => expect(r, `#${def.id} missing from 07`).toBeDefined());
      it('is not an appendix (O) entry', () => expect(r?.type).not.toBe('O'));
      it('type matches the reference', () => expect(def.type).toBe(r?.type));
      it('English statement is byte-equal to the reference', () => expect(def.en).toBe(r?.en));
      it('Hebrew statement is byte-equal to the reference', () => expect(def.he).toBe(r?.he));
    });
  }

  it('excludes the forbidden derived-premise theorems (68/69/70/71/76)', () => {
    const tabled = new Set(THEOREM_TABLE.map((t) => t.id));
    for (const forbidden of [68, 69, 70, 71, 76]) expect(tabled.has(forbidden)).toBe(false);
  });
});
