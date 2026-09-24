/**
 * #1407 arm 2 ([ADR-AG-158](../../docs/06c-decisions-analytic.md#adr-ag-158)) — A ONE-LETTER NUMERIC ANGLE
 * IS A GIVEN: «זווית C = 60», and «זוית C=200» is refused as the unsatisfiable given it is.
 *
 * Operator, 2026-09-24, playing round #1397 T19: *"writing זוית C=200 is not recognized"*. Arm 1
 * (ADR-AG-155) taught the grammar the defective spelling; this arm reads the lone vertex. Measured at
 * 7234e7be after «משולש ABC»: «זוית C=200», «זווית C = 60», «∠C = 60» and «זווית B = זווית C» were all
 * `not-handled` and escalated, while «זווית ACB = 200» was refused `unsatisfiable`.
 *
 * The mechanism is the one «זווית B ישרה» has used since #1049: a lone vertex is resolved at M1 against the
 * ONE shape through it, and the line then lowers to exactly the constraint its three-letter twin lowers
 * to. Where the vertex is in several shapes the refusal names the three-letter form, and that TAUGHT line
 * is driven through the real gate here (a taught remedy is a hypothesis).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, reachesFallback } from '../app/submit';
import { anotherConfiguration } from '../app/another';
import { derive } from '../engine/derive';
import { canonicalConstraint } from '../engine/solve';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { analyticI18n } from '../i18n';

const TRI = ['משולש ABC'];

const angleDeg = (lines: string[], v: string, a: string, b: string, seed = 0) => {
  const d = derive(lines, seed);
  const P = (id: string) => d.figure.points.find((q) => q.id === id)!;
  const V = P(v), A = P(a), B = P(b);
  const ux = A.x - V.x, uy = A.y - V.y, wx = B.x - V.x, wy = B.y - V.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};

/** The constraint the LAST line added to the construction, canonical — what the line MEANS. */
const meaning = (lines: string[]) => {
  const d = derive(lines, 0);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return canonicalConstraint(d.construction.constraints[d.construction.constraints.length - 1]);
};

describe('#1407 — the issue\'s table, both spellings, through the real submit gate', () => {
  it.each(['זוית C=200', 'זווית C=200', '∠C = 200'])(
    '«%s» after «משולש ABC» is refused unsatisfiable — exactly as «זווית ACB = 200» — and never escalated',
    (line) => {
      const v = decideSubmit(line, TRI, 0);
      expect(v.kind).toBe('refused');
      expect(v.kind === 'refused' && v.error.key).toBe('unsatisfiable');
      expect(reachesFallback(v)).toBe(false);
      const twin = decideSubmit('זווית ACB = 200', TRI, 0);
      expect(twin.kind === 'refused' && twin.error.key).toBe('unsatisfiable');
    },
  );

  it.each(['זווית C = 60', 'זוית C = 60', 'זווית C היא 60', '∠C = 60', '∠C = 60°', 'זוית C=60 מעלות', 'angle C is 60', 'angle C = 60'])(
    '«%s» after «משולש ABC» is accepted, and never escalated',
    (line) => {
      const v = decideSubmit(line, TRI, 0);
      expect(v.kind).toBe('record');
      expect(reachesFallback(v)).toBe(false);
    },
  );
});

describe('#1407 — the lone vertex MEANS what its three-letter twin means', () => {
  it.each([
    ['זווית C = 60', 'זווית ACB = 60'],
    ['זוית C = 60', 'זווית BCA = 60'],
    ['∠B = 40', '∠ABC = 40'],
    ['זווית A = 50', 'זווית BAC = 50'],
    ['זווית B = זווית C', 'זווית ABC = זווית ACB'],
    ['∠B = 2∠C', '∠ABC = 2∠ACB'],
    ['∠ABC = ∠C', '∠ABC = ∠ACB'],
  ])('«%s» lowers to the constraint «%s» lowers to', (lone, three) => {
    expect(meaning([...TRI, lone])).toBe(meaning([...TRI, three]));
  });

  it('restating the angle in three letters, either ray order, is ALREADY KNOWN — one given, not two', () => {
    for (const twin of ['זווית ACB = 60', 'זווית BCA = 60']) {
      expect(decideSubmit(twin, [...TRI, 'זווית C = 60'], 0).kind, twin).toBe('already-known');
    }
  });

  it('a quadrilateral vertex reads its two NEIGHBOURS, as the right angle does', () => {
    expect(meaning(['מרובע ABCD', 'זווית B = 70'])).toBe(meaning(['מרובע ABCD', 'זווית ABC = 70']));
  });
});

describe('#1407 — the figure HOLDS the stated angle, over 24 seeds and «הציגו תצורה אחרת»', () => {
  const lines = [...TRI, 'זווית C = 60'];

  it('60° at C at every one of 24 seeds', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      expect(derive(lines, seed).faults, `seed ${seed}`).toEqual([]);
      expect(angleDeg(lines, 'C', 'A', 'B', seed), `seed ${seed}`).toBeCloseTo(60, 4);
    }
  });

  it('and across the button\'s own walk to other configurations', () => {
    let seed = 0;
    for (let press = 0; press < 5; press += 1) {
      const next = anotherConfiguration(lines, seed);
      expect(next.found, `press ${press}`).toBe(true);
      seed = next.seed;
      expect(angleDeg(lines, 'C', 'A', 'B', seed), `press ${press}`).toBeCloseTo(60, 4);
    }
  });

  it('«זווית B = זווית C» holds the base angles equal at every seed', () => {
    const eq = [...TRI, 'זווית B = זווית C'];
    for (let seed = 0; seed < 24; seed += 1) {
      expect(derive(eq, seed).faults, `seed ${seed}`).toEqual([]);
      expect(angleDeg(eq, 'B', 'A', 'C', seed) - angleDeg(eq, 'C', 'A', 'B', seed), `seed ${seed}`).toBeCloseTo(0, 4);
    }
  });
});

describe('#1407 — an ambiguous vertex is refused with the three-letter form, and the TAUGHT line builds', () => {
  const TWO = ['משולש ABC', 'מרובע ABCD'];

  it.each(['זווית B = 60', 'זוית B = 60', '∠B = 60', 'זווית B ישרה', '∠B = ∠C'])(
    '«%s» with B in two shapes → ambiguous-angle naming «ABC», and the line rewritten to it is accepted',
    (line) => {
      const v = decideSubmit(line, TWO, 0);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused' || v.error.key !== 'ambiguous-angle') throw new Error(JSON.stringify(v));
      expect(v.error.example).toBe('ABC');
      expect(reachesFallback(v)).toBe(false);
      // The student does what the message says: replace the lone vertex with the three letters it names,
      // and again for a second lone vertex (C is in both shapes too), until the line is accepted.
      let taught = line;
      let verdict = v as ReturnType<typeof decideSubmit>;
      for (let round = 0; round < 2 && verdict.kind === 'refused'; round += 1) {
        if (verdict.error.key !== 'ambiguous-angle' || !verdict.error.example) throw new Error(JSON.stringify(verdict));
        const ex = verdict.error.example;
        const vertex = ex.slice(1, -1);
        taught = taught.replace(new RegExp(`(?<![A-Z])${vertex}(?![A-Z0-9])`), ex);
        verdict = decideSubmit(taught, TWO, 0);
      }
      expect(verdict.kind, taught).toBe('record');
    },
  );

  it('a vertex in NO shape is refused too, and invents no rays to teach', () => {
    const v = decideSubmit('זווית B = 60', ['A(0,0)', 'B(4,0)', 'C(1,3)'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('ambiguous-angle');
    expect(v.kind === 'refused' && 'example' in v.error ? v.error.example : undefined).toBeUndefined();
  });

  it('the message carries the three-letter name, in both locales', () => {
    for (const lng of ['he', 'en']) {
      const text = analyticI18n
        .t('errAmbiguousAngleShapes', { lng, detail: 'זווית B = 60', example: 'ABC' })
        .replace(/[⁦-⁩]/g, ''); // the bidi isolates the locale wraps round Latin runs
      expect(text, lng).toContain('ABC');
      expect(text, lng).toContain('זווית B = 60');
    }
  });
});

describe('#1407 — what did NOT change', () => {
  it('the one-letter RIGHT angle keeps its perpendicular lowering, and builds the same figure', () => {
    const r = parseLine('זווית C ישרה');
    expect(r.ok && r.facts[0].t).toBe('right-angle');
    expect(meaning([...TRI, 'זווית C ישרה'])).toBe(meaning([...TRI, 'זווית ACB ישרה']));
    expect(meaning([...TRI, 'זווית C = 90'])).toContain('perpendicular');
  });

  it('two letters name no angle and are never read as a lone vertex', () => {
    expect(parseLine('זווית AB = 5').ok).toBe(false);
  });

  it('a word on the right is still left to its owner', () => {
    expect(parseLine('זווית B חדה').ok).toBe(false);
  });
});

describe('#1407 — the catalog carries the one-letter numeric angle, so the coverage guard exercises it', () => {
  it.each([/^זווית C = 60$/, /^∠B = ∠C$/])('a row %s exists and builds after its needs in both languages', (re) => {
    const row = COMMAND_CATALOG_ANALYTIC.find((e) => re.test(e.he));
    expect(row).toBeDefined();
    for (const line of [row!.he, row!.en]) {
      expect(decideSubmit(line, row!.needs ?? [], 0).kind, line).toBe('record');
    }
  });
});
