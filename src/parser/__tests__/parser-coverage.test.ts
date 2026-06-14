/**
 * Parser coverage matrix — the combination space, both locales.
 *
 * Two contracts:
 *  (1) PARSES — every supported phrasing (and its order/spacing/filler variants)
 *      resolves to the right command(s).
 *  (2) ESCALATES — an utterance that carries meaning the deterministic parser
 *      can't fully express (a modified shape, a compound, a second construct,
 *      an unsupported construct) returns `not-handled` so it goes to the LLM —
 *      it must NEVER silently *half-parse* (the bug that drew a bare triangle
 *      for "משולש ABC חסום במעגל"). Half-parses draw a wrong figure; misses
 *      escalate. This pins that boundary across the whole vocabulary.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

/** [utterance, a command type that must appear in the result]. */
const PARSES: [string, string][] = [
  // ── shapes (He/En, order/spacing/filler variants) ──
  ['triangle ABC', 'triangle'],
  ['משולש ABC', 'triangle'],
  ['right triangle ABC', 'right-triangle'],
  ['משולש ישר-זווית ABC', 'right-triangle'],
  ['משולש ABC ישר זוית', 'right-triangle'], // defective spelling זוית (one vav), label-first, no hyphen
  ['משולש ישר זווית ABC', 'right-triangle'], // plene spelling, space not hyphen
  ['square ABCD', 'square'],
  ['ריבוע ABCD', 'square'],
  ['ABCD square', 'square'],
  ['square A B C D', 'square'],
  ['draw a square ABCD', 'square'],
  ['rectangle ABCD', 'rectangle'],
  ['מלבן ABCD', 'rectangle'],
  ['rhombus ABCD', 'rhombus'],
  ['מעוין ABCD', 'rhombus'],
  ['parallelogram ABCD', 'parallelogram'],
  ['מקבילית ABCD', 'parallelogram'],
  ['trapezoid ABCD', 'trapezoid'],
  ['טרפז ABCD', 'trapezoid'],
  ['quadrilateral ABCD', 'quadrilateral'],
  ['מרובע ABCD', 'quadrilateral'],
  // ── inscribed (named + UNNAMED centre; every cyclic polygon) ──
  ['triangle ABC inscribed in circle O', 'circle'],
  ['triangle ABC inscribed in a circle', 'circle'],
  ['משולש ABC חסום במעגל', 'circle'],
  ['right triangle ABC inscribed in a circle', 'circle'], // Thales — hypotenuse is a diameter
  ['inscribe triangle ABC in a circle', 'circle'], // imperative "inscribe" / "inscribing" too, not only "inscribed"
  ['inscribing triangle ABC in a circle', 'circle'],
  ['quadrilateral ABCD inscribed in a circle', 'circle'],
  ['square ABCD inscribed in a circle', 'circle'],
  ['ריבוע ABCD חסום במעגל', 'circle'],
  ['rectangle ABCD inscribed in circle O', 'circle'],
  ['rhombus ABCD inscribed in a circle', 'circle'],
  ['trapezoid ABCD inscribed in a circle', 'circle'],
  ['טרפז ABCD חסום במעגל', 'circle'],
  ['circle through A B C', 'circumcircle'], // circumscribed circle (3 points)
  ['circle circumscribing ABC', 'circumcircle'],
  ['מעגל חוסם את ABC', 'circumcircle'],
  // ── incircle: a CIRCLE inscribed in a TRIANGLE (≠ triangle inscribed in a circle) ──
  ['circle inscribed in triangle ABC', 'circle-through'],
  ['incircle of triangle ABC', 'circle-through'],
  ['מעגל חסום במשולש ABC', 'circle-through'],
  ['circle centered at I radius r inscribed in triangle ABC', 'circle-through'],
  // ── points ──
  ['point A at (0,0)', 'free-point'],
  ['נקודה A ב-(0,0)', 'free-point'],
  ['point E on AC', 'point-on-segment'],
  ['point E on AC at 40%', 'point-on-segment'],
  ['נקודה E על AC ב-40%', 'point-on-segment'],
  ['point F on the extension of AD', 'point-on-segment'],
  ['C is 5 from A and 5 from B', 'point-by-distances'],
  ['M is the midpoint of AB', 'midpoint'],
  ['M אמצע AB', 'midpoint'],
  ['M is the intersection of AC and BD', 'line-line-intersection'],
  ['F is the foot of the perpendicular from C to AD', 'foot'],
  // ── lines ──
  ['segment AC', 'segment'],
  ['diagonal AC', 'segment'],
  ['קטע AC', 'segment'],
  ['E is where the bisectors of BAC and BCA meet', 'line-intersection'],
  ['bisector of angle ABC', 'bisector'],
  ['חוצה זווית ABC', 'bisector'],
  ['line through P perpendicular to AB', 'perpendicular-line'],
  ['line through P parallel to AB', 'parallel-line'],
  // ── special lines (constructible: midpoint/foot/bisector + segment) ──
  ['median from A in ABC', 'midpoint'],
  ['תיכון מ-A במשולש ABC', 'midpoint'],
  ['height from A in ABC', 'foot'],
  ['altitude from A in ABC', 'foot'],
  ['גובה מ-A במשולש ABC', 'foot'],
  ['perpendicular from A to BC', 'foot'],
  ['triangle ABC with a height from A', 'foot'], // triangle + its altitude (compound handled directly)
  ['triangle ABC with a median from A', 'midpoint'],
  ['perpendicular bisector of AB', 'perpendicular-line'],
  ['אנך אמצעי ל-AB', 'perpendicular-line'],
  ['AD bisects angle BAC', 'line-intersection'],
  ['AD חוצה את הזווית BAC', 'line-intersection'],
  // ── circles ──
  ['circle centered at O radius 5', 'circle'],
  ['מעגל סביב O רדיוס 5', 'circle'],
  ['A is on circle O', 'point-on-circle'],
  ['chord AB in circle O', 'point-on-circle'],
  ['מיתר AB במעגל O', 'segment'],
  ['diameter AB in circle O', 'diameter'],
  ['M is the midpoint of arc BC in circle O', 'arc-midpoint'],
  ['tangent to circle O at A', 'tangent'],
  ['משיק למעגל O בנקודה A', 'tangent'],
  ['G is the intersection of circle O and circle P', 'circle-circle-intersection'],
  // ── constraints ──
  ['angle GBA = 37', 'set-angle'],
  ['זווית GBA = 37', 'set-angle'],
  ['זוית GBA = 37', 'set-angle'], // defective spelling זוית (one vav)
  ['AB = 6', 'set-distance'],
  ['AB = CD', 'set-equal'],
  ['AB = 2 AD', 'set-ratio'], // a proportion |AB| = 2·|AD| (NOT half-parsed to "AB = 2")
  ['AB = 2AD', 'set-ratio'],
  ['AB = 2·AD', 'set-ratio'],
  ['2 AB = 3 CD', 'set-ratio'],
  ['AB פי 2 מ-AD', 'set-ratio'],
  ['BC parallel to AD', 'set-parallel'],
  ['BC מקביל ל-AD', 'set-parallel'],
  ['AB perpendicular to CD', 'set-perpendicular'],
  ['AB מאונך ל-CD', 'set-perpendicular'],
];

/** Utterances that must escalate (not-handled) rather than half-parse or draw a wrong figure. */
const ESCALATES: string[] = [
  // ── modified shapes the engine can't build → must not drop the modifier ──
  'square ABCD inscribed in a circle with AB = 6', // inscribed + a constraint on top
  // ── shape + a constraint (compound — LLM should decompose) ──
  'square ABCD with AB = 6',
  'parallelogram ABCD where AB = CD',
  'triangle ABC with angle BAC = 37',
  'משולש ABC עם זווית BAC = 37',
  // ── an intersection whose operands are themselves new constructs (diameter/chord) ──
  // the rule must not drop "diameter"/"chord" and leave the intersection's deps unbuilt
  'diameter AB and chord DE meet at point C',
  'קוטר AB ומיתר DE נפגשים בנקודה C',
  // ── shape + a second construct ──
  'square ABCD and segment AC',
  'ריבוע ABCD וקטע AC',
  'square ABCD with point E on AB',
  'משולש ABC עם נקודה D על AB',
  'rectangle ABCD with diagonals',
  // ── nothing to build ──
  'draw a circle somewhere',
  'hello there',
  'make it bigger',
];

describe('parser coverage — supported phrasings parse to the right commands', () => {
  for (const [utterance, type] of PARSES) {
    it(`"${utterance}" → ${type}`, () => {
      const r = parse(utterance);
      expect(r.ok, `"${utterance}" should parse`).toBe(true);
      if (r.ok) expect(r.commands.map((c) => c.type)).toContain(type);
    });
  }
});

describe('compound "<place a point> such that <condition>" parses BOTH halves', () => {
  for (const u of [
    'point F on the extension of AD such that CF⊥DF',
    'נקודה F נמצאת על המשך AD כך ש CF⊥DF',
  ]) {
    it(`"${u}" → point + perpendicular (F created, then CF⟂DF)`, () => {
      const r = parse(u);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.commands.map((c) => c.type)).toEqual(['point-on-segment', 'set-perpendicular']);
      const perp = r.commands.find((c) => c.type === 'set-perpendicular') as { a: string; b: string; c: string; d: string };
      expect([perp.a, perp.b, perp.c, perp.d]).toEqual(['C', 'F', 'D', 'F']); // CF ⟂ DF, not AD ⟂ CF
    });
  }
});

describe('parser coverage — out-of-scope input escalates, never half-parses', () => {
  for (const utterance of ESCALATES) {
    it(`"${utterance}" escalates`, () => {
      expect(parse(utterance).ok, `"${utterance}" must NOT be (half-)parsed`).toBe(false);
    });
  }
});
