/**
 * THE FORMULA-SHEET INTEGRITY GATE (S6, #623) — the docs/07 ↔ `THEOREM_TABLE` pattern.
 *
 * The student sits the exam with the official sheet in front of them. A tool that surfaces a
 * *paraphrase* teaches a formula they will not find when they look down at the page — so the table the
 * app prints and the document that transcribes the sheet must be the same text, checked in **both**
 * directions: nothing in the table that the sheet does not say, and nothing in the document that the
 * table does not carry.
 *
 * Both directions matter. A one-way check lets the table quietly grow a fourth formula (the conjugate,
 * division, `|z|` — the three most tempting, and none of them on the sheet), which is the app teaching
 * as "the formula sheet says" something the sheet does not say.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { FORMULA_TABLE } from '../table';
import { deriveLines } from '../../app/deriveLines';

const DOC = path.resolve(__dirname, '../../../docs/29-complex-formula-reference.md');

describe('the formula table is byte-matched to docs/29', () => {
  const text = fs.readFileSync(DOC, 'utf8');

  it('the document exists and is the transcription it claims to be', () => {
    expect(text).toContain('5-MATH-Formula_NEW.pdf');
    expect(text).toContain('exactly');
  });

  it.each(FORMULA_TABLE)('$id appears in the document verbatim', (row) => {
    expect(text.includes(row.statement), `«${row.statement}» is not in docs/29 byte for byte`).toBe(
      true,
    );
  });

  it('every id in the document is in the table, and there are exactly three', () => {
    const ids = [...text.matchAll(/### (CX-F\d)/g)].map((m) => m[1]);
    expect(ids).toEqual(FORMULA_TABLE.map((f) => f.id));
    expect(FORMULA_TABLE).toHaveLength(3);
  });

  it('every fenced formula in the document is one of the table rows', () => {
    const blocks = [...text.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());
    for (const b of blocks) {
      expect(
        FORMULA_TABLE.some((f) => f.statement === b),
        `docs/29 carries a formula the table does not: «${b}»`,
      ).toBe(true);
    }
    expect(blocks).toHaveLength(3);
  });

  it('the sheet has no conjugate, no division and no |z| — so neither has the table', () => {
    for (const row of FORMULA_TABLE) {
      expect(row.statement).not.toMatch(/conj|z̄/);
    }
  });
});

describe('a formula surfaces because the figure DOES the operation', () => {
  it('a product surfaces polar multiplication, and names the line that did it', () => {
    const d = deriveLines(['z1 = 2', 'z2 = 2cis30', 'w = z1*z2']);
    const f = d.formulas.find((x) => x.id === 'CX-F1');
    expect(f).toBeDefined();
    expect(f!.premises).toEqual(['w = z1*z2']); // premise highlighting reads exactly this
  });

  it('an integer power surfaces De Moivre', () => {
    const d = deriveLines(['z1 = 2cis30', 'w = z1^3']);
    expect(d.formulas.map((f) => f.id)).toContain('CX-F2');
  });

  it('an equation with several configurations surfaces the ROOTS formula — the k it walks', () => {
    const d = deriveLines(['z^3 = 8']);
    expect(d.configCount).toBe(3);
    const f = d.formulas.find((x) => x.id === 'CX-F3');
    expect(f?.premises).toEqual(['z^3 = 8']);
  });

  it('a figure that multiplies nothing and powers nothing surfaces nothing', () => {
    expect(deriveLines(['z1 = 3+4i']).formulas).toEqual([]);
  });

  it('the rows come out in sheet order, whatever order the student typed', () => {
    const d = deriveLines(['z^3 = 8', 'z2 = 2cis30', 'w = z2*z2']);
    const ids = d.formulas.map((f) => f.id);
    expect([...ids].sort()).toEqual(ids);
  });
});
