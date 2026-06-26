/**
 * Auto-naming a polygon's vertices when the student names NONE ("מרובע חסום במעגל", "square").
 * The labels-required convention used to send every unlabeled polygon to the LLM; a bare shape is a
 * common, simple input the deterministic parser should own (operator report, session lag0hgpa). Vertices
 * default to A,B,C,… (skipping existing points). A PARTIAL/typo'd label run still escalates.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const types = (u: string, ctx = {}) => {
  const r = parse(u, ctx);
  return r.ok ? r.commands.map((c) => c.type) : `not-ok:${r.reason}`;
};
const idsOf = (u: string, ctx = {}): string[] => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error('parse failed: ' + u);
  const poly = r.commands.find((c): c is Extract<AnyCommand, { ids: string[] }> => 'ids' in c)!;
  return (poly as { ids: string[] }).ids;
};

describe('unlabeled inscribed polygons auto-name their vertices', () => {
  it('quadrilateral inscribed (He + En) → circle + 4 on-circle vertices A,B,C,D', () => {
    for (const u of ['מרובע חסום במעגל', 'quadrilateral inscribed in a circle']) {
      expect(types(u), u).toEqual(['circle', 'point-on-circle', 'point-on-circle', 'point-on-circle', 'point-on-circle', 'quadrilateral']);
      expect(idsOf(u), u).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('triangle inscribed (He + En) → circle + 3 on-circle vertices A,B,C', () => {
    for (const u of ['משולש חסום במעגל', 'triangle inscribed in a circle']) {
      expect(idsOf(u), u).toEqual(['A', 'B', 'C']);
    }
  });

  it('trapezoid inscribed → quad + a persistent set-parallel (ADR-131), auto-named', () => {
    expect(types('טרפז חסום במעגל')).toContain('set-parallel');
    expect(idsOf('טרפז חסום במעגל')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('auto-named vertices SKIP points already in the figure', () => {
    // A, B already exist → the inscribed quad names its vertices C,D,E,F
    expect(idsOf('מרובע חסום במעגל', { points: ['A', 'B'] })).toEqual(['C', 'D', 'E', 'F']);
  });
});

describe('unlabeled standalone shapes auto-name their vertices', () => {
  it('bare polygons (He + En)', () => {
    expect(idsOf('מרובע')).toEqual(['A', 'B', 'C', 'D']);
    expect(idsOf('square')).toEqual(['A', 'B', 'C', 'D']);
    expect(idsOf('משולש')).toEqual(['A', 'B', 'C']);
    expect(idsOf('דלתון')).toEqual(['A', 'B', 'C', 'D']); // kite macro
    expect(idsOf('regular pentagon')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('explicit and partial labels are unchanged', () => {
  it('a full label run is honoured', () => {
    expect(idsOf('מרובע ABCD חסום במעגל')).toEqual(['A', 'B', 'C', 'D']);
    expect(idsOf('square WXYZ')).toEqual(['W', 'X', 'Y', 'Z']);
  });

  it('a PARTIAL run (some but not n labels) escalates — it is NOT auto-completed', () => {
    expect(types('מרובע ABC')).toBe('not-ok:not-handled'); // 3 labels for a quad → not auto-named
  });
});
