/**
 * Per-matcher unit tests. Each drives the REAL pipeline — parse-with-context → fact list → `replay`
 * → `detectShapes` → `detectTheorems` — exactly as the app will, and asserts which theorem ids the
 * given utterances surface (and, for the gated ones, which they must NOT surface yet).
 *
 * The parser is deterministic here (no LLM); a step that fails to parse fails the test.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { detectShapes } from '@/engine';
import type { AnyCommand } from '@/engine';
import { detectTheorems } from '../detect';
import { detectConcepts } from '../concepts';
import type { TheoremFeedEntry, TheoremId } from '../types';

function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

/** Fold utterances into a fact list through the real parser (one group per utterance). */
function factsOf(utterances: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const group = `g${g++}`;
    const r = parse(u, ctxOf(facts));
    if (!r.ok) throw new Error(`did not parse (would escalate): ${JSON.stringify(u)} → ${JSON.stringify(r)}`);
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  return facts;
}

/** The full surfaced feed for a sequence of utterances (full real pipeline). */
function feedOf(utterances: string[]): TheoremFeedEntry[] {
  const facts = factsOf(utterances);
  const { construction } = replay(facts);
  const shapes = detectShapes(construction).shapes;
  return detectTheorems({ facts, construction, shapes });
}

/** The surfaced theorem-id set for a sequence of utterances (full real pipeline). */
function surfaced(...utterances: string[]): TheoremId[] {
  return feedOf(utterances).map((e) => e.id);
}

describe('theorem matchers (real pipeline)', () => {
  it('an empty figure surfaces nothing', () => {
    expect(detectTheorems({ facts: [], construction: { objects: [], constraints: [] } })).toEqual([]);
  });

  describe('triangle basics + isosceles', () => {
    it('a plain triangle surfaces the background triangle facts (10,11,12,13,14) but not isosceles (22)', () => {
      const ids = surfaced('triangle ABC');
      expect(ids).toEqual(expect.arrayContaining([10, 11, 12, 13, 14]));
      expect(ids).not.toContain(22);
    });

    it('an isosceles triangle surfaces base-angles-equal (22)', () => {
      expect(surfaced('isosceles triangle ABC')).toContain(22);
    });

    it('equal legs stated on a triangle surface 22', () => {
      expect(surfaced('triangle ABC', 'AB = AC')).toContain(22);
    });

    it('a right triangle surfaces Pythagoras (28)', () => {
      expect(surfaced('right triangle ABC')).toContain(28);
    });

    // ADR-218 — isosceles ENTAILED by a circle's radii (no equality typed). Two radii drawn to a chord
    // make an isosceles triangle by the definition of a circle; the feed reads it from `ctx.circles`.
    it('two radii drawn to a chord surface isosceles (22) with NO equality stated', () => {
      const ids = surfaced('circle O', 'A on circle O', 'B on circle O', 'OA', 'OB', 'AB');
      expect(ids).toContain(22);
    });

    it('a bare circle with no drawn radii-triangle does NOT surface isosceles (22) — no flood', () => {
      expect(surfaced('circle O', 'A on circle O', 'B on circle O')).not.toContain(22);
    });
  });

  // ADR-218 — the kite family (37/38): DECLARED, or ENTAILED by two intersecting circles.
  describe('kite (37, 38)', () => {
    it('a declared kite surfaces its properties (37, 38)', () => {
      const ids = surfaced('kite ABCD');
      expect(ids).toEqual(expect.arrayContaining([37, 38]));
    });

    it('two intersecting circles with the kite drawn out surface 37, 38 (entailed, none typed as a kite)', () => {
      const ids = surfaced('שני מעגלים נחתכים', 'AB', 'OP', 'PA', 'PB', 'OA=OB');
      expect(ids).toEqual(expect.arrayContaining([37, 38]));
    });

    it('two intersecting circles WITHOUT the kite sides drawn do NOT surface the kite (37/38)', () => {
      // Only the common chord AB is drawn — the four kite sides (OA/OB/PA/PB) are not, so the quad
      // is not on the canvas and the kite stays silent (no coordinate-coincidence surfacing).
      expect(surfaced('שני מעגלים נחתכים', 'AB')).not.toContain(37);
    });
  });

  describe('circle — points/arcs/inscribed', () => {
    it('a triangle inscribed in a circle surfaces the triangle-circumscribed background (84) and inscribed-angle (99), but NOT 91 (points placed ON a circle, no circumcircle construction)', () => {
      const ids = surfaced('triangle ABC inscribed in circle O');
      expect(ids).toEqual(expect.arrayContaining([84, 99]));
      expect(ids).not.toContain(91);
    });

    it('91 ("three points → one circle") surfaces only for a circle CONSTRUCTED through three points (a circumcircle)', () => {
      expect(surfaced('circle through A B C')).toContain(91);
      expect(surfaced('circumscribed circle of triangle ABC')).toContain(91);
    });

    it('an arc midpoint surfaces the equal-arcs ⟺ equal-central-angles / equal-chords theorems (92,94)', () => {
      const ids = surfaced('circle O', 'A on circle O', 'B on circle O', 'D is the midpoint of arc AB');
      expect(ids).toEqual(expect.arrayContaining([92, 94]));
    });
  });

  describe('cyclic quadrilateral / inscribed trapezoid (operator 2026-07-04, ADR-209)', () => {
    // The operator's exact utterance: a trapezoid inscribed in a circle should surface its
    // configuration-specific theorems, not only the generic inscribed-angle ones.
    it('טרפז ABCD חסום במעגל surfaces cyclic-quad (87), co-interior parallels (8), equal-chords/arcs (94), and inscribed-trapezoid-isosceles (201)', () => {
      const ids = surfaced('טרפז ABCD חסום במעגל');
      expect(ids).toEqual(expect.arrayContaining([87, 8, 94, 201]));
    });

    it('a plain inscribed quadrilateral surfaces cyclic-quad (87) but NOT the trapezoid corollary (201)', () => {
      const ids = surfaced('quadrilateral ABCD inscribed in circle O');
      expect(ids).toContain(87);
      expect(ids).not.toContain(201);
    });

    it('an inscribed triangle surfaces neither the cyclic-quad (87) nor the trapezoid (201) theorems', () => {
      const ids = surfaced('triangle ABC inscribed in circle O');
      expect(ids).not.toContain(87);
      expect(ids).not.toContain(201);
    });

    it('a standalone trapezoid (no circle) surfaces co-interior parallels (8) but not the cyclic theorems (87/201)', () => {
      const ids = surfaced('trapezoid ABCD');
      expect(ids).toContain(8);
      expect(ids).not.toContain(87);
      expect(ids).not.toContain(201);
    });
  });

  describe('background surfaces only when the shape justifies it (operator 2026-07-04, ADR-210)', () => {
    // The operator's exact figure: a trapezoid inscribed in an UNNAMED circle. It has no triangle, no
    // transversal cutting its parallels, and no given centre — so the triangle-background (84), the
    // alternate/corresponding parallels (4/6), and the central-angle theorems (92/97/98/99) must all
    // stay silent; only the configuration theorems it actually justifies (8/87/94/201) surface.
    it('an inscribed trapezoid suppresses 84 (no triangle), 91 (no circumcircle construction), 4/6 (no transversal), and 92/97/98/99 (centre not given)', () => {
      const ids = surfaced('טרפז ABCD חסום במעגל');
      expect(ids).toEqual(expect.arrayContaining([8, 87, 94, 201]));
      for (const x of [84, 91, 4, 6, 92, 97, 98, 99]) expect(ids).not.toContain(x);
    });

    it('the parallels 4/6 surface once a transversal is present (a triangle in the figure)', () => {
      const ids = surfaced('triangle ABC', 'DE parallel to AB');
      expect(ids).toEqual(expect.arrayContaining([4, 6, 8]));
    });

    it('a bare trapezoid (parallels, no transversal) surfaces co-interior 8 but not alternate/corresponding 4/6', () => {
      const ids = surfaced('trapezoid ABCD');
      expect(ids).toContain(8);
      expect(ids).not.toContain(4);
      expect(ids).not.toContain(6);
    });

    it('a NAMED circle gives its centre — the central-angle theorems (97/98/99) and triangle background (84) return', () => {
      const ids = surfaced('triangle ABC inscribed in circle O');
      expect(ids).toEqual(expect.arrayContaining([84, 97, 98, 99]));
    });
  });

  describe('similarity from a parallel-cut triangle + discovery levels (operator 2026-07-04, ADR-220)', () => {
    // The operator's exact figure: a parallelogram ABCD, E on the base DC, then BE and AD produced to meet
    // at F. The parallelogram edge AB is parallel to DC (E's carrier), and the segments FB, FA cut off the
    // triangle FAB whose base AB is parallel to the line through E — the classic "line parallel to a side"
    // config. So the transversal parallels 4/6 surface (Declared, L1 — the cutting triangle is drawn), and
    // the similarity AA (#69) + its ratio consequences (#71) surface Entailed (L2 — never typed "similar").
    const OP_FIGURE = ['מקבילית ABCD', 'E על DC', 'המשך BE ו AD נפגשים בנקודה F'];
    const levelOf = (id: TheoremId, ...u: string[]) => feedOf(u).find((e) => e.id === id)?.level;

    it("the operator's figure surfaces alternate/corresponding parallels 4/6 at Declared (L1)", () => {
      expect(surfaced(...OP_FIGURE)).toEqual(expect.arrayContaining([4, 6]));
      expect(levelOf(4, ...OP_FIGURE)).toBe(1);
      expect(levelOf(6, ...OP_FIGURE)).toBe(1);
    });

    it("the operator's figure surfaces similarity AA (#69) + ratios (#71) at Entailed (L2)", () => {
      expect(surfaced(...OP_FIGURE)).toEqual(expect.arrayContaining([69, 71]));
      expect(levelOf(69, ...OP_FIGURE)).toBe(2);
      expect(levelOf(71, ...OP_FIGURE)).toBe(2);
    });

    it("the operator's figure raises the 'look for similar triangles' concept", () => {
      const facts = factsOf(OP_FIGURE);
      const ids = detectConcepts({ facts, construction: replay(facts).construction }).map((c) => c.id);
      expect(ids).toContain('parallels-seek-similar-triangles');
    });

    it('a bare trapezoid (no cutting triangle) surfaces neither 4/6 nor similarity 69/71', () => {
      const ids = surfaced('trapezoid ABCD');
      for (const x of [4, 6, 69, 71]) expect(ids).not.toContain(x);
    });

    it('a bare parallelogram surfaces its co-interior 8 but no transversal 4/6 and no similarity 69/71', () => {
      const ids = surfaced('parallelogram ABCD');
      expect(ids).toContain(8);
      for (const x of [4, 6, 69, 71]) expect(ids).not.toContain(x);
    });

    it('similarity 69/71 stay silent without a parallel (a lone triangle)', () => {
      const ids = surfaced('triangle ABC');
      for (const x of [69, 71]) expect(ids).not.toContain(x);
    });
  });

  describe('special-quadrilateral property families (operator 2026-07-04: "a quad shape should surface its theorems")', () => {
    // The operator drew מקבילית and saw only the generic co-interior #8 — its own defining properties
    // (opposite sides/angles, bisecting diagonals, consecutive-angle sum) never surfaced. Each special
    // quad must now surface its property bundle, honouring the class hierarchy.
    it('a parallelogram surfaces its property bundle (43 sides, 46 diagonals, 48 angles, 50 consecutive) — He and En', () => {
      for (const u of ['מקבילית ABCD', 'parallelogram ABCD']) {
        expect(surfaced(u), u).toEqual(expect.arrayContaining([43, 46, 48, 50]));
      }
    });

    it('a rectangle inherits the parallelogram bundle AND adds equal diagonals (52)', () => {
      const ids = surfaced('rectangle ABCD');
      expect(ids).toEqual(expect.arrayContaining([43, 46, 48, 50, 52]));
    });

    it('a rhombus inherits the parallelogram bundle AND adds bisecting/perpendicular diagonals (55, 56)', () => {
      const ids = surfaced('rhombus ABCD');
      expect(ids).toEqual(expect.arrayContaining([43, 46, 48, 50, 55, 56]));
    });

    it('a square inherits every parallelogram/rectangle/rhombus property (43,46,48,50,52,55,56)', () => {
      const ids = surfaced('square ABCD');
      expect(ids).toEqual(expect.arrayContaining([43, 46, 48, 50, 52, 55, 56]));
    });

    it('an isosceles trapezoid surfaces its base-angles/equal-diagonals properties (39, 41)', () => {
      const ids = surfaced('isosceles trapezoid ABCD');
      expect(ids).toEqual(expect.arrayContaining([39, 41]));
    });

    it('a GENERIC trapezoid does NOT surface the isosceles-trapezoid properties (39/41) or the parallelogram bundle', () => {
      const ids = surfaced('trapezoid ABCD');
      for (const x of [39, 41, 43, 46, 48, 50, 52, 55, 56]) expect(ids).not.toContain(x);
    });

    it('a triangle surfaces NO quadrilateral properties', () => {
      const ids = surfaced('triangle ABC');
      for (const x of [39, 41, 43, 46, 48, 50, 52, 55, 56]) expect(ids).not.toContain(x);
    });
  });

  describe('quad property theorems are MAIN, and drawn diagonals lead (operator 2026-07-04, ADR-211/212 + Turn-4)', () => {
    const entryOf = (id: number, ...utterances: string[]) => {
      const facts = factsOf(utterances);
      const { construction } = replay(facts);
      const shapes = detectShapes(construction).shapes;
      return detectTheorems({ facts, construction, shapes }).find((e) => e.id === id);
    };
    // The ordered feed (headline entries first, most-recent attribution leading) — its id sequence.
    const feed = (...utterances: string[]): TheoremId[] => {
      const facts = factsOf(utterances);
      const { construction } = replay(facts);
      const shapes = detectShapes(construction).shapes;
      return detectTheorems({ facts, construction, shapes }).map((e) => e.id);
    };

    it('every parallelogram property (incl. the diagonal one #46) is MAIN — a headline, not additional', () => {
      for (const id of [43, 46, 48, 50]) expect(entryOf(id, 'מקבילית ABCD')?.salience, `#${id}`).toBe('headline');
    });

    it('a rhombus/rectangle/square surfaces every inherited property as MAIN headlines', () => {
      for (const id of [43, 46, 48, 50, 55, 56]) expect(entryOf(id, 'מעוין ABCD')?.salience, `#${id}`).toBe('headline');
      for (const id of [43, 46, 48, 50, 52]) expect(entryOf(id, 'מלבן ABCD')?.salience, `#${id}`).toBe('headline');
      for (const id of [43, 46, 48, 50, 52, 55, 56]) expect(entryOf(id, 'ריבוע ABCD')?.salience, `#${id}`).toBe('headline');
    });

    it('WITH the diagonals drawn, the diagonal theorem #46 attributes to that step (marks ● new) and leads the quad headlines', () => {
      const drawn = ['מקבילית ABCD', 'segment AC', 'segment BD'];
      const e46 = entryOf(46, ...drawn)!;
      expect(e46.salience).toBe('headline');
      expect(e46.isNew).toBe(true); // the diagonals are the latest step → the diagonal theorem is new-this-step
      // #46 (attributed to the just-drawn diagonals) ranks ahead of the non-diagonal quad properties.
      const order = feed(...drawn);
      for (const id of [43, 48, 50]) expect(order.indexOf(46), `46 before ${id}`).toBeLessThan(order.indexOf(id));
    });

    it('a single drawn diagonal already counts (a diagonal is any non-adjacent vertex join)', () => {
      expect(entryOf(46, 'מקבילית ABCD', 'segment AC')?.isNew).toBe(true);
    });

    it('WITHOUT diagonals no quad theorem claims to be new off an unrelated later step', () => {
      // The shape is the only step, so its properties attribute to it and are new when it lands…
      expect(entryOf(46, 'מקבילית ABCD')?.isNew).toBe(true);
      // …but drawing a SIDE (an adjacent pair, not a diagonal) must not re-mark #46 (premise unchanged).
      expect(entryOf(46, 'מקבילית ABCD', 'segment AB')?.isNew).toBe(false);
    });

    it('a rhombus with diagonals leads with BOTH its diagonal properties (55, 56) and the inherited #46', () => {
      const drawn = ['מעוין ABCD', 'segment AC', 'segment BD'];
      for (const id of [46, 55, 56]) expect(entryOf(id, ...drawn)?.isNew, `#${id}`).toBe(true);
      const order = feed(...drawn);
      for (const diag of [46, 55, 56]) for (const plain of [43, 48, 50])
        expect(order.indexOf(diag), `${diag} before ${plain}`).toBeLessThan(order.indexOf(plain));
    });
  });

  describe('a dropped height moves a headline (operator 2026-07-04, Turn-5)', () => {
    const entryOf = (id: number, ...utterances: string[]) => {
      const facts = factsOf(utterances);
      const { construction } = replay(facts);
      const shapes = detectShapes(construction).shapes;
      return detectTheorems({ facts, construction, shapes }).find((e) => e.id === id);
    };

    it('a height dropped in a parallelogram surfaces Pythagoras (#28) and distance-between-parallels (#3)', () => {
      const ids = surfaced('מקבילית ABCD', 'DE גובה על AB');
      expect(ids).toEqual(expect.arrayContaining([28, 3]));
    });

    it('#28 (Pythagoras) is a MAIN headline, not a background fold', () => {
      expect(entryOf(28, 'מקבילית ABCD', 'DE גובה על AB')?.salience).toBe('headline');
    });

    it('#3 (distance between parallels) is headline and attributes to the height step (marks ● new)', () => {
      const e3 = entryOf(3, 'מקבילית ABCD', 'DE גובה על AB')!;
      expect(e3.salience).toBe('headline');
      expect(e3.isNew).toBe(true);
    });

    it('#28 attributes to the height step (● new) — the height, not the shape, announces it', () => {
      expect(entryOf(28, 'מקבילית ABCD', 'DE גובה על AB')?.isNew).toBe(true);
    });

    it('#3 does NOT fire without a height (a bare parallelogram has parallels but no dropped perpendicular)', () => {
      expect(surfaced('מקבילית ABCD')).not.toContain(3);
    });

    it('#3 does NOT fire for a height in a triangle (no parallel lines to measure between)', () => {
      const ids = surfaced('triangle ABC', 'AD גובה על BC');
      expect(ids).toContain(28); // the height still makes a right angle → Pythagoras
      expect(ids).not.toContain(3);
    });
  });

  describe('guiding-principle concepts (operator 2026-07-04, Turn-5)', () => {
    const conceptsOf = (...utterances: string[]): string[] => {
      const facts = factsOf(utterances);
      const { construction } = replay(facts);
      const shapes = detectShapes(construction).shapes;
      return detectConcepts({ facts, construction, shapes }).map((c) => c.id);
    };

    it('a right triangle surfaces the α / 90°−α complementary-angles principle', () => {
      expect(conceptsOf('right triangle ABC')).toContain('right-triangle-complementary');
    });

    it('a dropped height surfaces the same principle (the foot creates a right triangle)', () => {
      expect(conceptsOf('מקבילית ABCD', 'DE גובה על AB')).toContain('right-triangle-complementary');
    });

    it('a plain triangle (no right angle) surfaces no complementary-angle principle', () => {
      expect(conceptsOf('triangle ABC')).not.toContain('right-triangle-complementary');
    });

    it('the principle attributes to the step that introduced the right angle (marks ● new)', () => {
      const facts = factsOf(['מקבילית ABCD', 'DE גובה על AB']);
      const { construction } = replay(facts);
      const c = detectConcepts({ facts, construction }).find((x) => x.id === 'right-triangle-complementary');
      expect(c?.isNew).toBe(true);
    });

    it('an empty figure surfaces no concepts', () => {
      expect(detectConcepts({ facts: [], construction: { objects: [], constraints: [] } })).toEqual([]);
    });
  });

  describe('30-60-90 special right triangle (operator 2026-07-04, session x73i1cpx)', () => {
    // מקבילית ABCD · DE גובה לצעל BC · DC=2CE ⇒ triangle CDE is right-angled at E with hypotenuse
    // DC = 2·CE ⇒ ∠DCE=60°, ∠CDE=30° — a 30-60-90 the size given FORCES (emergent, not stated).
    const seq = ['מקבילית ABCD', 'DE גובה לצעל BC', 'DC=2CE'];
    const entryOf = (id: number, ...utterances: string[]) => {
      const facts = factsOf(utterances);
      const { construction } = replay(facts);
      const shapes = detectShapes(construction).shapes;
      return detectTheorems({ facts, construction, shapes }).find((e) => e.id === id);
    };

    it('detects the emergent 30-60-90 triangle as its own shape type', () => {
      const facts = factsOf(seq);
      const { construction } = replay(facts);
      const shapes = detectShapes(construction).shapes;
      expect(shapes.some((s) => s.type === '30-60-90-triangle')).toBe(true);
    });

    it('surfaces BOTH the property (33) and its converse (34)', () => {
      expect(surfaced(...seq)).toEqual(expect.arrayContaining([33, 34]));
    });

    it('33/34 attribute to the size given that forces 30° (● new on DC=2CE)', () => {
      expect(entryOf(33, ...seq)?.isNew).toBe(true);
      expect(entryOf(34, ...seq)?.isNew).toBe(true);
    });

    it('33/34 do NOT fire before the special angles are forced (parallelogram + height only)', () => {
      const ids = surfaced('מקבילית ABCD', 'DE גובה לצעל BC');
      expect(ids).toContain(28); // the height still makes a right angle → Pythagoras
      expect(ids).not.toContain(33);
      expect(ids).not.toContain(34);
    });

    it('a plain right triangle (no 30°) surfaces neither 33 nor 34', () => {
      const ids = surfaced('right triangle ABC');
      expect(ids).not.toContain(33);
      expect(ids).not.toContain(34);
    });
  });

  describe('circle — diameter / Thales (103 gated on a STATED diameter)', () => {
    it('an inscribed triangle WITHOUT a stated diameter surfaces neither 103 nor 104', () => {
      const ids = surfaced('triangle ABC inscribed in circle O');
      expect(ids).not.toContain(103);
      expect(ids).not.toContain(104);
    });

    it('a stated diameter surfaces BOTH 103 and its converse 104 (same footing)', () => {
      const ids = surfaced('circle O', 'AB diameter of circle O', 'C on circle O');
      expect(ids).toEqual(expect.arrayContaining([103, 104]));
    });
  });

  describe('circle — tangent family (105/107/108/109)', () => {
    it('a single tangent surfaces tangent⟂radius (105) but not the two-tangent theorems (108,109)', () => {
      const ids = surfaced('circle O radius 5', 'tangent from P to circle O');
      expect(ids).toContain(105);
      expect(ids).not.toContain(108);
      expect(ids).not.toContain(109);
    });
  });

  // ===== Appendix theorems — SUPPORTING ONLY (operator 2026-07-04, ADR-217) =====
  // "keep A2, A3, A4, A5, A6, B3 — they should never appear in the main theorems, only as supporting."
  // Each must SURFACE in the right configuration, and must always be `background` salience (folded, never
  // a headline). `assertBackground` locks the supporting-only guarantee at the live-pipeline level.
  describe('appendix theorems (A2–A6, B3) — supporting only', () => {
    const assertBackground = (feed: TheoremFeedEntry[], id: TheoremId) => {
      const e = feed.find((x) => x.id === id);
      expect(e, `${id} should surface`).toBeDefined();
      expect(e?.salience, `${id} is supporting-only ⇒ background`).toBe('background');
    };

    it('A2 — two chords crossing inside a circle (intersecting chords)', () => {
      const feed = feedOf(['circle O', 'chord AC', 'chord BD', 'AC and BD meet at E']);
      assertBackground(feed, 'A2');
    });

    it('A3 — two secants from the same external point (and NOT A4)', () => {
      const utt = ['from a point E outside circle O a line cuts the circle at A and B', 'from point E a line cuts the circle at C and D'];
      const feed = feedOf(utt);
      assertBackground(feed, 'A3');
      expect(feed.map((e) => e.id)).not.toContain('A4');
    });

    it('A3 — same, Hebrew phrasing', () => {
      assertBackground(
        feedOf(['מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B', 'מנקודה E ישר חותך את המעגל בנקודות C ו-D']),
        'A3',
      );
    });

    it('A4 — a secant AND a tangent from the same external point (and NOT the two-secant A3 or B3)', () => {
      const feed = feedOf(['from a point E outside circle O a line cuts the circle at A and B', 'from point E a tangent touches circle O at D']);
      assertBackground(feed, 'A4');
      const surfacedIds = feed.map((e) => e.id);
      expect(surfacedIds).not.toContain('A3'); // the tangency point is not a second secant
      expect(surfacedIds).not.toContain('B3'); // the Thales auxiliary circle must not read as "two circles"
    });

    it('A5 + A6 — the altitude from the right-angle vertex to the hypotenuse (geometric-mean config)', () => {
      const feed = feedOf(['right triangle ABC', 'D is the foot of the perpendicular from C to AB']);
      assertBackground(feed, 'A5');
      assertBackground(feed, 'A6');
    });

    it('A5 + A6 — same, Hebrew (height dropped to the hypotenuse)', () => {
      const feed = feedOf(['משולש ישר זווית ABC', 'CD גובה ל AB']);
      assertBackground(feed, 'A5');
      assertBackground(feed, 'A6');
    });

    it('B3 — two intersecting circles (line of centers bisects the common chord)', () => {
      assertBackground(feedOf(['שני מעגלים נחתכים בנקודות A ו B']), 'B3');
    });

    it('a plain circle with one chord does NOT surface any appendix theorem', () => {
      const ids = surfaced('circle O', 'chord AC');
      for (const id of ['A2', 'A3', 'A4', 'A5', 'A6', 'B3']) expect(ids).not.toContain(id);
    });
  });

  // ===== Discovery level tags (ADR-219) — HOW the tool knew each surfaced theorem's premise. =====
  // The App dial shows entries with `level ≤ selected`; `detectTheorems` stays level-complete, so the
  // tag lives on the feed entry and these tests read it off the real pipeline.
  describe('discovery level (ADR-219)', () => {
    const levelOf = (id: TheoremId, ...utterances: string[]) =>
      feedOf(utterances).find((e) => e.id === id)?.level;

    it('DECLARED isosceles (typed AB=AC) tags level 1', () => {
      expect(levelOf(22, 'triangle ABC', 'AB = AC')).toBe(1);
    });

    it('ENTAILED isosceles (radii, no equality typed) tags level 2', () => {
      expect(levelOf(22, 'circle O', 'A on circle O', 'B on circle O', 'OA', 'OB', 'AB')).toBe(2);
    });

    it('a DECLARED kite tags its properties (37) level 1', () => {
      expect(levelOf(37, 'kite ABCD')).toBe(1);
    });

    it('an ENTAILED kite (two intersecting circles) tags 37 level 2', () => {
      expect(levelOf(37, 'שני מעגלים נחתכים', 'AB', 'OP', 'PA', 'PB', 'OA=OB')).toBe(2);
    });

    it('an EMERGENT 30-60-90 (forced by a size given, never stated) tags 33/34 level 3', () => {
      const seq = ['מקבילית ABCD', 'DE גובה לצעל BC', 'DC=2CE'];
      expect(levelOf(33, ...seq)).toBe(3);
      expect(levelOf(34, ...seq)).toBe(3);
    });

    it('a DECLARED triangle keeps its background facts (10–14) at level 1', () => {
      for (const id of [10, 11, 12, 13, 14]) expect(levelOf(id, 'triangle ABC')).toBe(1);
    });

    it('the L1 filter hides the entailed premise but keeps the declared one (the dial contract)', () => {
      const declared = feedOf(['triangle ABC', 'AB = AC']);
      const entailed = feedOf(['circle O', 'A on circle O', 'B on circle O', 'OA', 'OB', 'AB']);
      const at = (feed: TheoremFeedEntry[], lvl: 1 | 2 | 3) => feed.filter((e) => e.level <= lvl).map((e) => e.id);
      expect(at(declared, 1)).toContain(22); // typed equality is visible even at the most conservative level
      expect(at(entailed, 1)).not.toContain(22); // the radii-entailed isosceles is hidden at L1…
      expect(at(entailed, 2)).toContain(22); // …and revealed once the dial reaches L2
    });
  });
});
