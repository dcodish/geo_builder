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
 * TWO distinct edges the figure draws at it (2-D's rule, by operator ruling 2026-09-27), and the line then
 * lowers to exactly the constraint its three-letter twin lowers to. Where more than two edges meet the
 * refusal names a real three-letter angle, and that TAUGHT line is driven through the real gate here (a
 * taught remedy is a hypothesis).
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

/**
 * Operator ruling, 2026-09-27 (#1407, playing round #1408 T64): *"B has no confusion here and should be
 * accepted"*. A lone vertex is ambiguous only when the figure draws MORE THAN TWO distinct edges at it (the
 * union over every shape and segment) — 2-D's rule (`src/parser/parse.ts`, `nb.length !== 2`) — never
 * because the vertex is in several shapes. The ruling's own table, on its own figure.
 */
describe('#1407 ruling — the distinct edges at the vertex decide, not the number of shapes', () => {
  const TWO = ['משולש ABC', 'מרובע ABCD'];

  it.each([
    ['זווית B = 60', 'זווית ABC = 60'],
    ['זוית B = 60', 'זווית ABC = 60'],
    ['∠B = 60', '∠ABC = 60'],
    ['זווית B ישרה', 'זווית ABC ישרה'],
    ['זווית D = 60', 'זווית ADC = 60'],
  ])('«%s»: B (BA, BC) and D (DA, DC) have two edges across both shapes → accepted, meaning «%s»', (lone, three) => {
    const v = decideSubmit(lone, TWO, 0);
    expect(v.kind, JSON.stringify(v)).toBe('record');
    expect(reachesFallback(v)).toBe(false);
    expect(meaning([...TWO, lone])).toBe(meaning([...TWO, three]));
  });

  it.each([
    ['זווית C = 60', 'ACB'],
    ['∠C = 60', 'ACB'],
    ['זווית C ישרה', 'ACB'],
    ['זווית A = 60', 'BAC'],
  ])('«%s»: three edges meet there → ambiguous-angle teaching «%s», and the taught line builds', (line, ex) => {
    const v = decideSubmit(line, TWO, 0);
    if (v.kind !== 'refused' || v.error.key !== 'ambiguous-angle') throw new Error(JSON.stringify(v));
    expect(v.error.example).toBe(ex);
    expect(reachesFallback(v)).toBe(false);
    // The student does what the message says: the lone letter becomes the taught three letters.
    const vertex = ex.slice(1, -1);
    const taught = line.replace(new RegExp(`(?<![A-Z])${vertex}(?![A-Z0-9])`), ex);
    expect(decideSubmit(taught, TWO, 0).kind, taught).toBe('record');
  });

  it('the RATIO form uses the same predicate: «∠B = ∠D» is accepted, «∠B = ∠C» refused at C, and the taught line for C builds', () => {
    expect(decideSubmit('∠B = ∠D', TWO, 0).kind).toBe('record');
    expect(meaning([...TWO, '∠B = ∠D'])).toBe(meaning([...TWO, '∠ABC = ∠ADC']));
    expect(decideSubmit('∠B = 2∠D', TWO, 0).kind).toBe('record');
    const v = decideSubmit('∠B = ∠C', TWO, 0);
    if (v.kind !== 'refused' || v.error.key !== 'ambiguous-angle') throw new Error(JSON.stringify(v));
    expect(v.error.example).toBe('ACB');
    expect(decideSubmit('∠B = ∠ACB', TWO, 0).kind).toBe('record');
  });

  it('edges from separately drawn SEGMENTS count as 2-D counts them: two segments at A give ∠BAC', () => {
    const SEG = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'הקטע AB', 'הקטע AC'];
    // The coordinates already make ∠BAC right, so 90 follows from them and 60 cannot hold — both read ∠BAC.
    const v = decideSubmit('זווית A = 90', SEG, 0);
    expect(v.kind, JSON.stringify(v)).toBe('already-follows');
    expect(reachesFallback(v)).toBe(false);
    const w = decideSubmit('זווית A = 60', SEG, 0);
    expect(w.kind === 'refused' && w.error.key, JSON.stringify(w)).toBe('unsatisfiable');
    // Without the segments A has no arms, and the same line is ambiguous.
    const bare = decideSubmit('זווית A = 90', SEG.slice(0, 3), 0);
    expect(bare.kind === 'refused' && bare.error.key).toBe('ambiguous-angle');
    // A segment and a shape side on the same line are ONE edge.
    expect(decideSubmit('זווית B = 60', ['משולש ABC', 'הקטע AB'], 0).kind).toBe('record');
    // A third segment at A makes it ambiguous, and the example is two real edges.
    const three = decideSubmit('זווית A = 60', ['A(0,0)', 'B(4,0)', 'C(0,3)', 'D(-2,-2)', 'הקטע AB', 'הקטע AC', 'הקטע AD'], 0);
    if (three.kind !== 'refused' || three.error.key !== 'ambiguous-angle') throw new Error(JSON.stringify(three));
    expect(three.error.example).toBe('BAC');
  });

  it('fewer than two edges is refused too, and invents no rays to teach — no edge, or a single segment', () => {
    for (const lines of [['A(0,0)', 'B(4,0)', 'C(1,3)'], ['A(0,0)', 'B(4,0)', 'C(1,3)', 'הקטע AB']]) {
      const v = decideSubmit('זווית B = 60', lines, 0);
      expect(v.kind === 'refused' && v.error.key, lines.join(' · ')).toBe('ambiguous-angle');
      expect(v.kind === 'refused' && 'example' in v.error ? v.error.example : undefined).toBeUndefined();
    }
  });

  it('the message carries the three-letter name, in both locales, and no longer blames the shape count', () => {
    for (const lng of ['he', 'en']) {
      const text = analyticI18n
        .t('errAmbiguousAngleArms', { lng, detail: 'זווית C = 60', example: 'ACB' })
        .replace(/[⁦-⁩]/g, ''); // the bidi isolates the locale wraps round Latin runs
      expect(text, lng).toContain('ACB');
      expect(text, lng).toContain('זווית C = 60');
      expect(text, lng).not.toMatch(/יותר מצורה אחת|more than one shape/);
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
