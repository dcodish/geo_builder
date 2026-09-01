/**
 * #835 — plain n-gon nouns, and the closed supported set.
 *
 * Prod session `khf8ht6c` (log-triage 2026-08-30): a student typed «מחומש תלת מימדי», «מחומש 0», «מחומש»
 * and left with no figure at all. Two defects behind it:
 *   (a) the bare noun was DELIBERATELY excluded — `regularPolygon` returned null unless «משוכלל»/regular/
 *       an n-gon form was present, "so a bare pentagon (possibly irregular) is left to the LLM net";
 *   (b) «מתומן», the standard modern-Hebrew octagon, was absent from EVERY list — the noun table, the
 *       strip regex, SHAPE_NOUNS_HE, the span accountant, and the geometry-word gate — so it came back
 *       `scope:unrelated`: the tool told a student a real geometry word was not about geometry.
 *
 * Two operator rulings, 2026-09-01:
 *   1. *"we should support מחומש, משושה, מתומן. if משוכלל is not mentioned, so its just the shape and if
 *      its משוכלל so draw it like that. for all other types of poligons, issue a note saying they are not
 *      supported."* — and «מצולע משוכלל בעל n צלעות» is WITHDRAWN (it had been the 2026-08-31 plan).
 *   2. *"dont delete capability. if its there and works, leave it"* — so the existing «משוכלל» builds for
 *      7/9/10 and «מצולע משוכלל ABCDE» must NOT regress. That is the sharpest lock in this file: the new
 *      refusal lane must not swallow a form that already worked.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../index';
import { classifyOutOfScope } from '../scope';

const cmds = (u: string) => {
  const r = parse(u, {});
  if (!r.ok) throw new Error(`expected ${u} to parse, got ${r.reason}`);
  return r.commands;
};
const refusal = (u: string) => {
  const r = parse(u, {});
  if (r.ok) throw new Error(`expected ${u} to be refused, but it built`);
  return r;
};

describe('#835 (a) — the three supported BARE nouns build a GENERIC n-gon', () => {
  it.each([
    ['מחומש', 5],
    ['מחומש ABCDE', 5],
    ['משושה', 6],
    ['משושה ABCDEF', 6],
    ['מתומן', 8],
    ['מתומן ABCDEFGH', 8],
    // the English mirrors — the operator tests in Hebrew, the suite covers both (CLAUDE.md)
    ['pentagon', 5],
    ['hexagon', 6],
    ['octagon', 8],
  ])('%s builds one generic polygon with %i vertices', (utterance, n) => {
    const c = cmds(utterance);
    expect(c.map((x) => x.type)).toEqual(['polygon']);
    const poly = c[0] as { type: 'polygon'; ids: string[]; place?: boolean };
    expect(poly.ids).toHaveLength(n);
    // `place` is what makes the vertices FREE — without it `polygon` only wires edges over points that
    // some earlier command placed, and a bare noun has no earlier command.
    expect(poly.place, 'the bare noun owns its vertices').toBe(true);
  });

  it('a bare noun asserts NOTHING about regularity — no circle, no pinned angles (ADR-052)', () => {
    // the regular route seats vertices on a hidden circle at equal spacing; the generic one must not.
    expect(cmds('מחומש').map((c) => c.type)).not.toContain('circle');
    expect(cmds('מחומש').map((c) => c.type)).not.toContain('point-on-circle');
  });
});

describe('#835 (b) — מתומן is a geometry word', () => {
  it('is no longer classified out of scope (was: scope:unrelated — "not about geometry")', () => {
    expect(classifyOutOfScope('מתומן')).toBeNull();
    expect(classifyOutOfScope('מתומן משוכלל')).toBeNull();
  });

  it('both octagon spellings parse — מתומן is primary, משומן kept as a variant', () => {
    expect((cmds('מתומן')[0] as { ids: string[] }).ids).toHaveLength(8);
    expect(cmds('מתומן משוכלל').filter((c) => c.type === 'point-on-circle')).toHaveLength(8);
    expect(cmds('משומן משוכלל').filter((c) => c.type === 'point-on-circle')).toHaveLength(8);
  });
});

describe('#835 (c) — «משוכלל» still means REGULAR', () => {
  it.each([
    ['מחומש משוכלל', 5],
    ['משושה משוכלל', 6],
    ['מתומן משוכלל', 8],
  ])('%s seats %i vertices on a hidden circle at equal spacing', (utterance, n) => {
    const c = cmds(utterance);
    expect(c[0].type).toBe('circle');
    expect(c.filter((x) => x.type === 'point-on-circle')).toHaveLength(n);
    expect(c[c.length - 1].type).toBe('polygon');
  });
});

describe('#835 (d) — NO CAPABILITY IS DELETED (operator ruling 2: "if its there and works, leave it")', () => {
  it.each([
    ['משובע משוכלל', 7],
    ['מתושע משוכלל', 9],
    ['מעושר משוכלל', 10],
    ['מצולע משוכלל ABCDE', 5],
    ['regular 7-gon ABCDEFG', 7],
  ])('%s still builds its regular %i-gon, untouched by the new refusal lane', (utterance, n) => {
    const c = cmds(utterance);
    expect(c.filter((x) => x.type === 'point-on-circle')).toHaveLength(n);
  });

  it('the untouched neighbours still lower exactly as before', () => {
    expect(cmds('מרובע ABCD').map((c) => c.type)).toEqual(['quadrilateral']);
    expect(cmds('משולש ABC').map((c) => c.type)).toEqual(['triangle']);
    expect(cmds('ריבוע ABCD').map((c) => c.type)).toEqual(['square']);
  });
});

describe('#835 (e) — every other polygon is refused BY NAME, never escalated', () => {
  it.each(['משובע', 'מתושע', 'מעושר', 'heptagon', 'decagon'])(
    'bare %s returns polygon-not-supported naming the word the student typed',
    (utterance) => {
      const r = refusal(utterance);
      expect(r.reason).toBe('polygon-not-supported');
      if (r.reason === 'polygon-not-supported') {
        expect(r.noun).toBe(utterance);
        // the refusal must point somewhere useful, not merely say no
        expect(r.offer).toEqual(['מחומש', 'משושה', 'מתומן']);
      }
    },
  );

  it.each([
    'מצולע משוכלל בעל 7 צלעות',
    'מצולע משוכלל בעל 5 צלעות',
    'regular polygon with 7 sides',
  ])('the WITHDRAWN «בעל N צלעות» format refuses too: %s', (utterance) => {
    // the 2026-08-31 ruling named this as the taught format; the 2026-09-01 ruling withdrew it. It must
    // neither build nor reach the LLM — the notice names the three nouns that do work.
    expect(refusal(utterance).reason).toBe('polygon-not-supported');
  });

  it('a refusal is never `not-handled` — that is the lane that would reach the paid LLM', () => {
    for (const u of ['משובע', 'מתושע', 'מצולע משוכלל בעל 7 צלעות']) {
      expect(parse(u, {}), u).not.toMatchObject({ reason: 'not-handled' });
    }
  });
});

describe("#835 — the reporter's own session", () => {
  it('«מחומש תלת מימדי» stays a cross-app answer (a 3-D request typed into the 2-D app)', () => {
    expect(classifyOutOfScope('מחומש תלת מימדי')?.category).toBe('cross-app');
  });

  it('«מחומש» — the line they ended on — now builds', () => {
    expect(cmds('מחומש').map((c) => c.type)).toEqual(['polygon']);
  });
});
