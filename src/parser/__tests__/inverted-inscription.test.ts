/**
 * ADR-245 — inscription roles are assigned by the CONTAINER MARKER (the ב prefix / "in …"), not by
 * word order; a definite unnamed shape reference binds to THE existing polygon.
 *
 * Root cause locked here: `isCircleInPolygon` discriminated "circle in polygon" vs "polygon in
 * circle" by which word came FIRST — a proxy that flips the roles on every inverted passive
 * phrasing (the bagrut-standard "במרובע ABCD חסום מעגל O" = a circle IS INSCRIBED IN quad ABCD),
 * so the parser silently built the CONVERSE figure (the quad ON the circle). Production members:
 * session ufxrtyp2 (the operator's report, 2026-07-06) and "במשולש ABC חסום מעגל" → circumcircle
 * (session 1dela1c9, 2026-06-22). Sibling closed by the shared poly-word list: "מעגל חסום בדלתון"
 * built a kite-in-circle (kite was missing from the order test's polygon words).
 */
import { describe, it, expect } from 'vitest';
import { parse, type ParseContext } from '../parse';
import type { AnyCommand } from '@/engine';

const empty: ParseContext = { points: [], circles: [], lines: [] };

const cmds = (input: string, ctx: ParseContext = empty): AnyCommand[] => {
  const r = parse(input, ctx);
  expect(r.ok, `"${input}" should parse: ${JSON.stringify(r)}`).toBe(true);
  return r.ok ? r.commands : [];
};

const types = (input: string, ctx?: ParseContext) => cmds(input, ctx).map((c) => c.type);

/** The figure reads as an INCIRCLE: the polygon is drawn as itself (its vertices are NOT placed on
 *  the circle) and the circle is derived from the incentre (bisector∩bisector → circle-through). */
const expectIncircle = (c: AnyCommand[]) => {
  expect(c.some((x) => x.type === 'point-on-circle' && (x as { free?: boolean }).free)).toBe(false);
  expect(c.filter((x) => x.type === 'bisector')).toHaveLength(2);
  expect(c.some((x) => x.type === 'circle-through')).toBe(true);
};

/** The figure reads as a polygon INSCRIBED IN a circle: every vertex rides the circle. */
const expectInscribed = (c: AnyCommand[], n: number) => {
  expect(c.filter((x) => x.type === 'point-on-circle')).toHaveLength(n);
  expect(c.some((x) => x.type === 'bisector')).toBe(false);
};

describe('container-marker role assignment (ADR-245) — circle inscribed IN a polygon', () => {
  it.each([
    // canonical circle-first forms (must keep working)
    'מעגל חסום במרובע ABCD',
    'מעגל חסום במשולש ABC',
    'circle inscribed in trapezoid ABCD',
    // INVERTED passives — the container comes first (the reported class)
    'במרובע ABCD חסום מעגל O', // the operator's exact phrasing (session ufxrtyp2)
    'במשולש ABC חסום מעגל', // production 2026-06-22 — used to build the CIRCUMCIRCLE
    'בטרפז ABCD חסום מעגל',
    'in quadrilateral ABCD a circle is inscribed',
  ])('%s → the incircle (never the converse)', (u) => {
    expectIncircle(cmds(u));
  });

  it.each([
    'מעגל חסום בדלתון ABCD',
    'circle inscribed in kite ABCD',
  ])('%s → a KITE incircle (shape-variant + incircle, not a kite-on-circle)', (u) => {
    const c = cmds(u);
    expect(c[0]).toMatchObject({ type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'] });
    expectIncircle(c);
  });

  it('מעגל חסום במקבילית ABCD → a parallelogram incircle (was not-handled)', () => {
    const c = cmds('מעגל חסום במקבילית ABCD');
    expect(c[0]).toMatchObject({ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] });
    expectIncircle(c);
  });
});

describe('container-marker role assignment (ADR-245) — polygon inscribed IN a circle (the mirror)', () => {
  it.each([
    // canonical polygon-first forms (must keep working)
    ['טרפז ABCD חסום במעגל', 4],
    ['משולש ABC חסום במעגל', 3],
    ['triangle ABC inscribed in circle O', 3],
    // INVERTED — the circle-container comes first (was mis-routed to the incircle)
    ['במעגל O חסום מרובע ABCD', 4],
    ['במעגל חסום משולש ABC', 3],
  ] as [string, number][])('%s → the polygon rides the circle (never an incircle)', (u, n) => {
    expectInscribed(cmds(u), n);
  });
});

describe('a definite unnamed shape reference binds to THE existing polygon (ADR-245)', () => {
  const quadCtx: ParseContext = {
    points: ['A', 'B', 'C', 'D'],
    circles: [],
    lines: [],
    polygons: [['A', 'B', 'C', 'D']],
  };

  it('"במרובע חסום מעגל" after מרובע ABCD exists → the incircle of ABCD (no fresh EFGH quad)', () => {
    const c = cmds('במרובע חסום מעגל', quadCtx);
    expect(c[0]).toMatchObject({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] });
    expectIncircle(c);
  });

  it('"מרובע חסום במעגל" after מרובע ABCD exists → ABCD becomes concyclic (ADR-099 semantics)', () => {
    expect(types('מרובע חסום במעגל', quadCtx)).toContain('set-concyclic');
    expect(cmds('מרובע חסום במעגל', quadCtx).some((x) => x.type === 'set-concyclic' && (x as { points: string[] }).points.join('') === 'ABCD')).toBe(true);
  });

  it('zero existing polygons → auto-named fresh shape (unchanged)', () => {
    const c = cmds('במרובע חסום מעגל');
    expect(c[0]).toMatchObject({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] });
  });

  it('TWO existing quads → ambiguous, does NOT bind (falls back to fresh auto-named vertices)', () => {
    const c = cmds('במרובע חסום מעגל', {
      points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      circles: [],
      lines: [],
      polygons: [
        ['A', 'B', 'C', 'D'],
        ['E', 'F', 'G', 'H'],
      ],
    });
    const quad = c.find((x) => x.type === 'quadrilateral') as { ids: string[] };
    expect(quad.ids).not.toEqual(['A', 'B', 'C', 'D']);
    expect(quad.ids).not.toEqual(['E', 'F', 'G', 'H']);
  });

  it('NAMED vertices always win over the existing polygon (explicit beats definite)', () => {
    const c = cmds('במרובע KLMN חסום מעגל', quadCtx);
    expect(c[0]).toMatchObject({ type: 'quadrilateral', ids: ['K', 'L', 'M', 'N'] });
  });
});
