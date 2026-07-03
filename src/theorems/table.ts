/**
 * THEOREM_TABLE — the v1 (6a) matcher set: the circle block (the corpus's centre of gravity), the
 * tangent family, triangle-basics + isosceles + right-triangle, and the angle-pair backgrounds.
 * Each {@link TheoremDef} authors its own premise-side trigger (plan §3 D3 — authored, not computed
 * from premise-completeness).
 *
 * Statements (`en`/`he`) are copied VERBATIM from [07](docs/07-theorem-reference.md); a guard test
 * (`integrity.test.ts`) asserts byte-equality, so 07 stays the single source.
 *
 * Deliberately EXCLUDED from the 6a table (their premise is DERIVED, never given-announced in v1 — the
 * sharpest no-reveal cases): similarity criteria 68/69/70/71 and the bisector-ratio 76. Keeping them
 * out of the table makes every corpus `mustNotSurface` assertion hold structurally.
 */

import type { AnyCommand, Id } from '../engine/types';
import type { Fact } from '../store/geoStore';
import type { MatchCtx, TheoremDef, TheoremMatch } from './types';

// ---------- premise-scan helpers (symbolic; no coordinates) ----------

const cmdOf = (f: Fact): AnyCommand => f.cmd;
const factsWith = (ctx: MatchCtx, pred: (c: AnyCommand) => boolean): Fact[] => ctx.facts.filter((f) => pred(cmdOf(f)));

/** A value read as 90° from either a `set-angle` or a symbolic `measure-angle`. */
const isRightValue = (c: AnyCommand): boolean => {
  if (c.type === 'set-angle') return Math.abs(c.value - 90) < 1e-6;
  if (c.type === 'measure-angle') return 'value' in c.expr && Math.abs(c.expr.value - 90) < 1e-6;
  return false;
};

/** The circle (from ctx.circles) that contains every id in `ids` as a stated member, or null. */
function circleContaining(ctx: MatchCtx, ids: Id[]): { id: Id; center: Id; members: Id[]; hidden: boolean } | null {
  return ctx.circles.find((c) => ids.every((id) => c.members.includes(id))) ?? null;
}

/**
 * Facts that STATE a diameter, with the circle. Two lowered forms (both are the SAME premise):
 *  - a `diameter` command — "AB is a diameter of circle O" when A,B are fresh;
 *  - a `set-collinear` through the CENTRE — when A,B already lie on the circle, "AB is a diameter"
 *    lowers to "A, O, B collinear" (a chord through the centre IS a diameter). Recognising only the
 *    first form silently dropped the stated diameter of an inscribed figure (Q7).
 */
function statedDiameterFacts(ctx: MatchCtx): { fact: Fact; circleId: Id; ids: Id[] }[] {
  const out: { fact: Fact; circleId: Id; ids: Id[] }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'diameter') {
      out.push({ fact: f, circleId: c.circle, ids: [c.id1, c.id2] });
    } else if (c.type === 'set-collinear') {
      const pts = [c.a, c.b, c.c];
      for (const circ of ctx.circles) {
        if (!pts.includes(circ.center)) continue;
        const ends = pts.filter((p) => p !== circ.center);
        if (ends.length === 2 && ends.every((e) => circ.members.includes(e))) {
          out.push({ fact: f, circleId: circ.id, ids: ends });
          break;
        }
      }
    }
  }
  return out;
}

/** Facts stating a 90° INSCRIBED angle — vertex + both ray ends all on one circle. */
function rightInscribedFacts(ctx: MatchCtx): { fact: Fact; vertex: Id; ray1: Id; ray2: Id; circleId: Id }[] {
  const out: { fact: Fact; vertex: Id; ray1: Id; ray2: Id; circleId: Id }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (!isRightValue(c)) continue;
    if (c.type !== 'set-angle' && c.type !== 'measure-angle') continue;
    const { vertex, ray1, ray2 } = c;
    const circ = circleContaining(ctx, [vertex, ray1, ray2]);
    if (circ) out.push({ fact: f, vertex, ray1, ray2, circleId: circ.id });
  }
  return out;
}

/** The id of any command carrying `id === objId` — the fact that defined an object (for attribution). */
function definingFactIds(ctx: MatchCtx, objId: Id): string[] {
  return ctx.facts.filter((f) => 'id' in cmdOf(f) && (cmdOf(f) as { id: Id }).id === objId).map((f) => f.id);
}

/**
 * Tangencies grouped by circle, read from the structural {@link MatchCtx.tangents} (covers the `tangent`
 * command AND the Thales external-tangent construction). Each entry carries the tangency points and the
 * facts that defined them (for attribution).
 */
function tangentsByCircle(ctx: MatchCtx): Map<Id, { factIds: string[]; ats: Id[] }> {
  const byCircle = new Map<Id, { factIds: string[]; ats: Id[] }>();
  for (const t of ctx.tangents) {
    const e = byCircle.get(t.circle) ?? { factIds: [], ats: [] };
    e.ats.push(t.at);
    e.factIds.push(...definingFactIds(ctx, t.at));
    byCircle.set(t.circle, e);
  }
  return byCircle;
}

/** A stated triangle exists (a `triangle`/`right-triangle` command, a 3-vertex polygon, or a detected one). */
function triangleFacts(ctx: MatchCtx): { facts: Fact[]; vertices: Id[] } {
  const facts = factsWith(ctx, (c) => c.type === 'triangle' || c.type === 'right-triangle' || (c.type === 'polygon' && c.ids.length === 3));
  const vertices = new Set<Id>();
  for (const f of facts) {
    const c = cmdOf(f);
    if (c.type === 'triangle' || c.type === 'right-triangle') c.ids.forEach((v) => vertices.add(v));
    else if (c.type === 'polygon') c.ids.forEach((v) => vertices.add(v));
  }
  // Emergent/detected triangles (plan §10 B1) also count.
  const detectedTri = ctx.shapes.filter((s) => s.type.endsWith('triangle'));
  return { facts, vertices: [...vertices, ...detectedTri.flatMap((s) => s.vertices)] };
}

/** A stated isosceles/equilateral premise: equal sides sharing a vertex, or a detected iso/equilateral. */
function isoscelesEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[] } | null {
  const facts: Fact[] = [];
  const vertices = new Set<Id>();
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'set-equal') {
      // |ab| = |cd| with a shared endpoint ⇒ the apex — two equal legs of a triangle.
      const s1 = new Set([c.a, c.b]);
      if ([c.c, c.d].some((x) => s1.has(x))) {
        facts.push(f);
        [c.a, c.b, c.c, c.d].forEach((x) => vertices.add(x));
      }
    } else if (c.type === 'shape-variant' && c.shape === 'isosceles') {
      facts.push(f);
      c.ids.forEach((x) => vertices.add(x));
    }
  }
  const detectedIso = ctx.shapes.filter((s) => s.type === 'isosceles-triangle' || s.type === 'equilateral-triangle' || s.type === 'right-isosceles-triangle');
  detectedIso.forEach((s) => s.vertices.forEach((v) => vertices.add(v)));
  if (facts.length === 0 && detectedIso.length === 0) return null;
  return { facts, vertices: [...vertices] };
}

/** A stated right-angle premise (right-triangle, a 90° angle, or a stated ⟂ with a shared vertex). */
function rightAngleFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => {
    if (c.type === 'right-triangle') return true;
    if (isRightValue(c)) return true;
    if (c.type === 'set-perpendicular' && !c.implicit) return true;
    return false;
  });
}

/** Two chords/segments cross at a stated point (a line-line / line-intersection object). */
function crossingFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => c.type === 'line-line-intersection' || c.type === 'line-intersection');
}

/** A stated collinear straight-line datum (linear-pair background). */
function collinearFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => c.type === 'set-line' || c.type === 'set-collinear' || (c.type === 'point-on-segment' && !!c.extension));
}

const ids = (fs: Fact[]) => fs.map((f) => f.id);

// A tiny builder to cut boilerplate.
const match = (tier: TheoremMatch['tier'], triggerFactIds: string[], triggerObjectIds: Id[]): TheoremMatch => ({
  tier,
  triggerFactIds,
  triggerObjectIds,
});

// ---------- the table ----------

export const THEOREM_TABLE: TheoremDef[] = [
  // ===== Angles =====
  {
    id: 1, type: 'P', salience: 'background', family: 'angles',
    en: 'Angles on a straight line (a linear pair) are supplementary — they sum to 180°.',
    he: 'זוויות צמודות משלימות זו את זו ל-180°.',
    match: (ctx) => {
      const fs = collinearFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 2, type: 'P', salience: 'background', family: 'angles',
    en: 'Vertically opposite angles are equal.',
    he: 'זוויות קודקודיות שוות זו לזו.',
    match: (ctx) => {
      const fs = crossingFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },

  // ===== Triangle basics (background fold) =====
  ...([
    [10, 'The interior angles of a triangle sum to 180°.', 'סכום הזוויות של משולש הוא 180°.'],
    [11, 'An exterior angle of a triangle equals the sum of the two non-adjacent interior angles.', 'זווית חיצונית למשולש שווה לסכום שתי הזוויות הפנימיות שאינן צמודות לה.'],
    [12, 'The sum of any two sides exceeds the third (triangle inequality).', 'סכום כל שתי צלעות במשולש גדול מהצלע השלישית (אי-שוויון המשולש).'],
    [13, 'In a non-equilateral triangle, the larger angle lies opposite the larger side.', 'במשולש (שאינו שווה צלעות), מול הצלע הגדולה יותר מונחת זווית גדולה יותר.'],
    [14, 'In a non-equiangular triangle, the larger side lies opposite the larger angle.', 'במשולש (שאינו שווה זוויות), מול הזווית הגדולה יותר מונחת צלע גדולה יותר.'],
  ] as [number, string, string][]).map(([id, en, he]): TheoremDef => ({
    id, type: 'P', salience: 'background', family: 'triangle', en, he,
    match: (ctx) => {
      const { facts, vertices } = triangleFacts(ctx);
      return facts.length || vertices.length ? match('certain', ids(facts), vertices) : null;
    },
  })),

  // ===== Isosceles =====
  {
    id: 22, type: 'P', salience: 'headline', family: 'isosceles',
    en: 'In an isosceles triangle, the base angles are equal.',
    he: 'במשולש שווה שוקיים זוויות הבסיס שוות זו לזו.',
    match: (ctx) => {
      const ev = isoscelesEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices) : null;
    },
  },

  // ===== Right triangle =====
  {
    id: 28, type: 'P', salience: 'background', family: 'triangle',
    en: 'Pythagoras — in a right triangle, the sum of the squares of the legs equals the square of the hypotenuse.',
    he: 'משפט פיתגורס: במשולש ישר זווית, סכום ריבועי הניצבים שווה לריבוע היתר.',
    match: (ctx) => {
      const fs = rightAngleFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },

  // ===== Circle — circumscribed/points (background) =====
  {
    id: 84, type: 'P', salience: 'background', family: 'circle',
    en: 'Every triangle has a circumscribed circle.',
    he: 'כל משולש ניתן לחסום במעגל.',
    match: (ctx) => {
      const c = ctx.circles.find((c) => c.members.length >= 3);
      return c ? match('certain', [], [c.id, c.center, ...c.members]) : null;
    },
  },
  {
    id: 91, type: 'P', salience: 'background', family: 'circle',
    en: 'Through any three non-collinear points passes exactly one circle.',
    he: 'דרך כל שלוש נקודות שאינן על ישר אחד עובר מעגל אחד ויחיד.',
    match: (ctx) => {
      const c = ctx.circles.find((c) => c.members.length >= 3);
      return c ? match('certain', [], [c.id, ...c.members]) : null;
    },
  },

  // ===== Circle — chords/arcs/centre =====
  {
    id: 92, type: 'P', salience: 'headline', family: 'circle',
    en: 'Two central angles are equal if and only if their corresponding arcs are equal.',
    he: 'במעגל, שתי זוויות מרכזיות שוות זו לזו אם ורק אם הקשתות המתאימות להן שוות.',
    match: (ctx) => {
      const fs = factsWith(ctx, (c) => c.type === 'arc-midpoint');
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 94, type: 'P', salience: 'headline', family: 'circle',
    en: 'Chords are equal if and only if their corresponding arcs are equal.',
    he: 'במעגל, מיתרים שווים זה לזה אם ורק אם הקשתות המתאימות להם שוות.',
    match: (ctx) => {
      const fs = factsWith(ctx, (c) => c.type === 'arc-midpoint');
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 97, type: 'P', salience: 'background', family: 'circle',
    en: 'The perpendicular from the center to a chord bisects the chord, its central angle, and its arc.',
    he: 'האנך ממרכז המעגל למיתר חוצה את המיתר, את הזווית המרכזית המתאימה ואת הקשת המתאימה.',
    match: (ctx) => {
      const c = ctx.circles.find((c) => c.members.length >= 2);
      return c ? match('certain', [], [c.id, c.center]) : null;
    },
  },
  {
    id: 98, type: 'P', salience: 'background', family: 'circle',
    en: 'The segment from the center that bisects a chord is perpendicular to it.',
    he: 'קטע ממרכז המעגל החוצה את המיתר מאונך למיתר.',
    match: (ctx) => {
      const c = ctx.circles.find((c) => c.members.length >= 2);
      return c ? match('certain', [], [c.id, c.center]) : null;
    },
  },
  {
    id: 99, type: 'P', salience: 'headline', family: 'circle',
    en: 'An inscribed angle equals half the central angle subtending the same arc.',
    he: 'במעגל, זווית היקפית שווה למחצית הזווית המרכזית הנשענת על אותה הקשת.',
    match: (ctx) => {
      const c = ctx.circles.find((c) => c.members.length >= 3);
      return c ? match('certain', [], [c.id, c.center, ...c.members]) : null;
    },
  },
  {
    id: 102, type: 'P', salience: 'headline', family: 'circle',
    en: 'Inscribed angles subtending the same chord from the same side are equal.',
    he: 'במעגל, כל הזוויות ההיקפיות הנשענות על מיתר מאותו צד של המיתר שוות זו לזו.',
    match: (ctx) => {
      // Two inscribed angles on a chord need ≥4 concyclic points. Authored amber (plan §5, Q6 precedent).
      const c = ctx.circles.find((c) => c.members.length >= 4);
      return c ? match('possible', [], [c.id, ...c.members]) : null;
    },
  },

  // ===== Circle — diameter / Thales =====
  {
    id: 103, type: 'P', salience: 'headline', family: 'circle',
    en: 'An inscribed angle subtending a diameter is a right angle (90°).',
    he: 'זווית היקפית הנשענת על קוטר היא זווית ישרה (90°).',
    match: (ctx) => {
      const ds = statedDiameterFacts(ctx);
      if (!ds.length) return null; // a STATED diameter only — never a bare 90° (keeps Q5's 103 off)
      const objIds = ds.flatMap((d) => [d.circleId, ...d.ids]);
      return match('certain', ids(ds.map((d) => d.fact)), objIds);
    },
  },
  {
    id: 104, type: 'C', salience: 'headline', family: 'circle',
    en: 'A 90° inscribed angle subtends a diameter.',
    he: 'זווית היקפית בת 90° נשענת על קוטר.',
    match: (ctx) => {
      // Bundled with a stated diameter (converse, same footing — plan §9.3) OR announced by a stated
      // 90° inscribed angle (the "diameter moment" — the corpus's canonical case, Q5).
      const ds = statedDiameterFacts(ctx);
      const rs = rightInscribedFacts(ctx);
      if (!ds.length && !rs.length) return null;
      const fs = [...ds.map((d) => d.fact), ...rs.map((r) => r.fact)];
      const objIds = [...ds.flatMap((d) => [d.circleId, ...d.ids]), ...rs.flatMap((r) => [r.circleId, r.vertex, r.ray1, r.ray2])];
      return match('certain', ids(fs), objIds);
    },
  },

  // ===== Circle — tangents =====
  {
    id: 105, type: 'P', salience: 'headline', family: 'tangent',
    en: 'A tangent to a circle is perpendicular to the radius at the point of tangency.',
    he: 'המשיק למעגל מאונך לרדיוס בנקודת ההשקה.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      if (!byCircle.size) return null;
      const factIds = [...byCircle.values()].flatMap((e) => e.factIds);
      const objIds = [...byCircle.entries()].flatMap(([circle, e]) => [circle, ...e.ats]);
      return match('certain', factIds, objIds);
    },
  },
  {
    id: 107, type: 'P', salience: 'headline', family: 'tangent',
    en: 'The tangent–chord angle equals the inscribed angle subtending that chord on the other side.',
    he: 'זווית בין משיק למיתר שווה לזווית ההיקפית הנשענת על מיתר זה מצידו השני.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      // needs a tangent AND a chord (≥2 members) on the same circle.
      for (const [circle, e] of byCircle) {
        const c = ctx.circles.find((c) => c.id === circle);
        if (c && c.members.length >= 2) return match('certain', e.factIds, [circle, ...e.ats, ...c.members]);
      }
      return null;
    },
  },
  {
    id: 108, type: 'P', salience: 'headline', family: 'tangent',
    en: 'Two tangents to a circle from the same external point are equal.',
    he: 'שני משיקים למעגל היוצאים מאותה נקודה שווים זה לזה.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      for (const [circle, e] of byCircle) if (e.ats.length >= 2) return match('certain', e.factIds, [circle, ...e.ats]);
      return null;
    },
  },
  {
    id: 109, type: 'P', salience: 'headline', family: 'tangent',
    en: 'The segment from the center to an external point bisects the angle between the two tangents drawn from it.',
    he: 'הקטע המחבר את מרכז המעגל לנקודה ממנה יוצאים שני משיקים חוצה את הזווית שבין המשיקים.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      for (const [circle, e] of byCircle) if (e.ats.length >= 2) return match('certain', e.factIds, [circle, ...e.ats]);
      return null;
    },
  },
];
