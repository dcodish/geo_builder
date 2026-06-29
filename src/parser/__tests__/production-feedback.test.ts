import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import type { AnyCommand } from '@/engine';

/**
 * Regression locks for the gaps surfaced by the FIRST production usage log (2026-06-29, 57 students).
 * Analytics showed ~31% of real submits escalated to the LLM and ~19% failed outright; the failures
 * clustered into a handful of phrasings the deterministic grammar didn't cover. Each `it` below is one
 * of those clusters, asserted from the EXACT utterances students typed (the dominant end-to-end session
 * is locked separately in `src/__tests__/scenarios.test.ts` → `bagrut-chord-diameter-perp-session`).
 */
const types = (u: string, ctx: { points?: string[]; circles?: string[] } = {}) => {
  const r = parse(u, { points: [], circles: [], circleMembers: [], ...ctx } as never);
  return r.ok ? (r.commands as AnyCommand[]).map((c) => c.type) : null;
};

describe('production feedback — definite-article chord "המיתר" (#1)', () => {
  // The #1 failure (11×): the DEFINITE article was missing from CARRIER_NOUN, so "המיתר" missed while
  // "מיתר"/"הצלע"/"הקטע" matched. With a circle in context the point lands on the chord (A,C on the circle).
  const ctx = { circles: ['O'], points: ['A', 'C'] };
  for (const u of ['E על המיתר AC', 'נקודה E על המיתר AC', 'E נקודה על המיתר AC', 'E נמצאת על המיתר AC']) {
    it(`"${u}" places the rider on the chord (point-on-segment, not dropped)`, () => {
      expect(types(u, ctx), u).toContain('point-on-segment');
    });
  }
  it('the indefinite "E על מיתר AC" still works (unchanged)', () => {
    expect(types('E על מיתר AC', ctx)).toContain('point-on-segment');
  });
});

describe('production feedback — perpendicular as the noun "אנך" (#5)', () => {
  // LLM-rescued 8×: the ⟂ CONSTRAINT matched "מאונך"/"⊥" but not the noun "אנך ל".
  for (const u of ['EF אנך ל AB', 'AB אנך ל-EF', 'AB אנך לEF']) {
    it(`"${u}" → set-perpendicular`, () => {
      expect(types(u, { points: ['A', 'B', 'E', 'F'] }), u).toContain('set-perpendicular');
    });
  }
});

describe('production feedback — "AB קוטר במעגל" defines a circle from its diameter (#3)', () => {
  // not-understood as an opener: A,B new, no circle yet → must DEFINE a circle whose diameter is AB.
  for (const u of ['AB קוטר במעגל', 'קוטר במעגל AB', 'AB קוטר במעגל O']) {
    it(`"${u}" → segment + midpoint(centre) + circle-through`, () => {
      expect(types(u), u).toEqual(['segment', 'midpoint', 'circle-through']);
    });
  }
  it('the ADD phrasing "diameter DE in circle O" is unchanged (routes to `diameter`)', () => {
    expect(types('diameter DE in circle O')).not.toContain('midpoint');
    expect(types('diameter DE in circle O')).toContain('diameter');
  });
});

describe('production feedback (2nd batch) — circle centre is keyword-order-independent', () => {
  // Triage of events.jsonl: "O מרכז המעגל" failed (built-nothing, 5×) while "מרכז המעגל O" worked —
  // `circleCenter` only caught the letter AFTER "מעגל". Now order-independent (letter before/after, He/En,
  // copula "הוא/היא" + "נקודה" tolerated). Each must define a circle centred O.
  for (const u of [
    'O מרכז המעגל',
    'מרכז המעגל O',
    'O הוא מרכז המעגל',
    'מרכז המעגל הוא נקודה O',
    'נקודה O היא מרכז המעגל',
    'O is the centre of the circle',
    'the center of the circle is O',
  ]) {
    it(`"${u}" → circle centred O`, () => {
      const r = parse(u, { points: [], circles: [], circleMembers: [] } as never);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const circ = (r.commands as AnyCommand[]).find((c) => c.type === 'circle' || c.type === 'circle-through');
        expect(circ, u).toBeTruthy();
        expect((circ as { center: string }).center).toBe('O');
      }
    });
  }
  it('"O מרכז המעגל החסום במשולש ABC" still routes to the incircle, NOT a plain circle', () => {
    expect(types('O מרכז המעגל החסום במשולש ABC', { points: ['A', 'B', 'C'] })).toContain('bisector');
  });
  // When a circle ALREADY exists (its auto-centre hidden), "O מרכז המעגל" NAMES/reveals that centre
  // (ADR-148 #2) — a `name-center` command — instead of creating a duplicate circle that clobbers it.
  for (const u of ['O מרכז המעגל', 'מרכז המעגל O', 'O is the centre of the circle']) {
    it(`"${u}" with an existing circle → name-center (reveal), not a new circle`, () => {
      expect(types(u, { points: ['O', 'A', 'B'], circles: ['O'] }), u).toEqual(['name-center']);
    });
  }
});

describe('production feedback (2nd batch) — generic incircle (circle inscribed in any polygon)', () => {
  // The incircle generalised from triangle-only to triangle/quad/trapezoid/rhombus/square (operator
  // feature). A quad flexes to TANGENTIAL: bisectors at two adjacent vertices → incentre, foot on each
  // edge, the non-auto edges' feet forced onto the circle. Builds even with NO vertex labels (auto-named).
  const incExpect = (u: string, ctx: Record<string, unknown>, nFeet: number) => {
    const r = parse(u, { points: [], circles: [], circleMembers: [], ...ctx } as never);
    expect(r.ok, u).toBe(true);
    if (r.ok) {
      const cmds = r.commands as AnyCommand[];
      const t = cmds.map((c) => c.type);
      expect(t, u).toContain('bisector');
      expect(t, u).toContain('line-intersection'); // the incentre
      expect(t, u).toContain('circle-through'); // the inradius
      expect(t.filter((x) => x === 'foot').length, `${u}: one foot per edge`).toBe(nFeet);
    }
  };
  it('triangle (unchanged) → 3 feet, no forced tangency', () => incExpect('circle inscribed in triangle ABC', {}, 3));
  it('"O הוא מרכז המעגל החסום בטרפז" (auto-named trapezoid, the original ask) → 4 feet', () =>
    incExpect('O הוא מרכז המעגל החסום בטרפז', {}, 4));
  it('English "circle inscribed in quadrilateral ABCD" → 4 feet', () => incExpect('circle inscribed in quadrilateral ABCD', {}, 4));
  it('Hebrew "מעגל חסום במעוין ABCD" (rhombus) → 4 feet', () => incExpect('מעגל חסום במעוין ABCD', {}, 4));
  it('a quad incircle forces exactly one non-auto edge onto the circle (the tangential flex)', () => {
    const r = parse('circle inscribed in quadrilateral ABCD', { points: [], circles: [], circleMembers: [] } as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.commands as AnyCommand[]).filter((c) => c.type === 'point-on-circle').length).toBe(1);
  });
});

describe('production feedback (2nd batch) — inscribed angle on the diameter (Thales)', () => {
  // "זווית היקפית נשענת על הקוטר" requires an EXISTING circle → a diameter + an apex on the circle + the two
  // chords + a ∠=90 mark (the inscribed angle subtending a diameter is right — Thales).
  const ctx = { points: ['O'], circles: ['O'], circleMembers: [], neighbors: {} } as never;
  for (const u of ['זווית היקפית נשענת על הקוטר', 'זוית היקפית על הקוטר', 'inscribed angle on the diameter']) {
    it(`"${u}" → diameter + on-circle + 2 chords + set-angle(90)`, () => {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const cmds = r.commands as AnyCommand[];
        const t = cmds.map((c) => c.type);
        expect(t).toContain('diameter');
        expect(t).toContain('point-on-circle');
        const sa = cmds.find((c) => c.type === 'set-angle') as { value: number } | undefined;
        expect(sa?.value).toBe(90);
      }
    });
  }
  it('with NO circle present it defers (operator: require an existing circle)', () => {
    expect(parse('זווית היקפית נשענת על הקוטר', { points: [], circles: [], circleMembers: [] } as never).ok).toBe(false);
  });
});

describe('production feedback (2nd batch) — bare "altitude from a point" infers the opposite side', () => {
  // Triage: "גובה מנקודה D"/"הורד גובה מנקודה D" failed when the figure had MORE than two other points (the
  // context fallback required exactly apex+2). Now the opposite side is read off the adjacency — the apex's
  // UNIQUE triangle. Ambiguous (apex in 2+ triangles) still defers (no guessing, ADR-052).
  const ctx = { points: ['A', 'B', 'D', 'M', 'N'], circles: [], circleMembers: [], neighbors: { A: ['B', 'D'], B: ['A', 'D'], D: ['A', 'B'], M: ['N'], N: ['M'] } } as never;
  for (const u of ['גובה מנקודה D', 'הורד גובה מנקודה D', 'altitude from D']) {
    it(`"${u}" → foot+segment, opposite side AB inferred from D's triangle`, () => {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const cmds = r.commands as AnyCommand[];
        expect(cmds.map((c) => c.type)).toEqual(['foot', 'segment']);
        const foot = cmds[0] as { from: string; a: string; b: string };
        expect(foot.from).toBe('D');
        expect([foot.a, foot.b].sort()).toEqual(['A', 'B']);
      }
    });
  }
  it('ambiguous apex (D in two triangles) defers — no guess', () => {
    const amb = { points: ['A', 'B', 'C', 'D'], circles: [], circleMembers: [], neighbors: { D: ['A', 'B', 'C'], A: ['B', 'D'], B: ['A', 'C', 'D'], C: ['B', 'D'] } } as never;
    expect(parse('גובה מנקודה D', amb).ok).toBe(false);
  });
});

describe('production feedback — perpendicular / altitude FROM a point (#6)', () => {
  // LLM-rescued: the from-apex gate required a hyphen ("מ-"), and the descriptor nouns ("מנקודה"/"לצלע")
  // broke the apex/side regexes. Both now tolerated → foot + the segment to it.
  const ctx = { points: ['A', 'B', 'D'] };
  for (const u of ['אנך מD ל AB', 'אנך מD לAB', 'גובה מנקודה D לצלע AB', 'אנך מנקודה D ל AB']) {
    it(`"${u}" → foot + segment`, () => {
      expect(types(u, ctx), u).toEqual(['foot', 'segment']);
    });
  }
  it('the 2-segment ⟂ constraint is NOT mistaken for a from-point altitude', () => {
    expect(types('EF אנך ל AB', { points: ['A', 'B', 'E', 'F'] })).toContain('set-perpendicular');
  });
});

describe('production feedback — divide a segment in a ratio (#7)', () => {
  const ctx = { points: ['C', 'D', 'G'] };
  for (const u of ['G מחלקת את DC ביחס 1:2', 'נקודה G מחלקת את DC ביחס 1:2', 'G divides DC in ratio 1:2', 'היחס בין DG ל-GC הוא 1:2']) {
    it(`"${u}" → point-on-segment at the ratio`, () => {
      const r = parse(u, { points: ['C', 'D', 'G'], circles: [], circleMembers: [] } as never);
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const pos = (r.commands as AnyCommand[]).find((c) => c.type === 'point-on-segment') as { t?: number } | undefined;
      expect(pos, u).toBeDefined();
      expect(pos!.t, `${u} → t = 1/3`).toBeCloseTo(1 / 3, 5);
    });
  }
  it('does not hijack a segment-ratio "AE/ED = 2/3" or an equality "AB = CD"', () => {
    expect(types('AE/ED = 2/3', ctx)).toContain('set-ratio');
    expect(types('AB = CD', ctx)).toContain('set-equal');
  });
});

describe('production feedback — name/draw a radius "OB רדיוס" (#8)', () => {
  const ctx = { circles: ['O'], points: ['A', 'B', 'O'] };
  for (const u of ['OB רדיוס', 'רדיוס OB', 'הוסף רדיוס OB']) {
    it(`"${u}" → rim point on the circle + centre→rim segment`, () => {
      expect(types(u, ctx), u).toEqual(['point-on-circle', 'segment']);
    });
  }
  it('does not hijack "D אמצע הרדיוס OB" (a midpoint) or a numeric radius', () => {
    expect(types('D אמצע הרדיוס OB', { circles: ['O'], points: ['A', 'B', 'O', 'D'] })).toContain('midpoint');
    expect(types('OB רדיוס = 5', ctx)).not.toContain('point-on-circle');
  });
});
