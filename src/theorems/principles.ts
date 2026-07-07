/**
 * T5 — the PRINCIPLES lane (ADR-248; docs/18 §6): the operator-authored teacher-tips feed, the
 * concepts feed (ADR-214) made first-class and renamed. A principle is NOT a bagrut theorem — it is
 * the teacher's voice: "whenever X is given, or emerges from the diagram, think about Y." Same
 * coordinate-free `MatchCtx`, same attribution/●-new machinery; rendered in its own 💡 section.
 *
 * INTENT ARCHETYPES are a subspecies, not a separate lane: a principle whose trigger is a
 * givens-CONSTELLATION and whose tip names the question's likely direction ("three equal segments
 * between two triangles — congruent triangles?"). They typically carry `boosts` — theorem ids lifted
 * to band 0 while the principle is active (at most the top 2 principles boost, §6 anti-flood).
 *
 * PEDAGOGY GUARDRAILS (the D5 ruling, amending 16 §10 B1): an intent hint derives from the STATED
 * givens' shape only — the tool never sees the question text; it names a FAMILY direction, phrased
 * as a question, never an instantiated pair or conclusion ("אולי חפיפת משולשים?", never
 * "△ABE ≅ △DCE"). The no-reveal ids (68/70/76) may be pointed at BY FAMILY in a tip but are never
 * tabled or instantiated.
 *
 * SOURCE OF TRUTH: the operator-editable catalog in docs/10-pedagogy.md §"עקרונות" — an integrity
 * test asserts this table matches it byte-for-byte (the 07 pattern applied to the operator's own
 * text). Dictating a principle in a session lands it in both places, tested.
 */

import { buildMatchCtx } from './context';
import { makeAttributor } from './detect';
import { rightAngleFacts, parallelFacts, bisectorStatements, statedDiameterFacts, medianFacts, midsegmentFacts, externalSecantHubs, tangentsByCircle, triangleVertexSets, structuralTriangles } from './table';
import type { Id } from '../engine/types';
import type { DetectInput, MatchCtx, TheoremId, TheoremMatch } from './types';

/** One principle: a slug identity + the teacher's bilingual tip + a premise-side matcher. */
export interface PrincipleDef {
  /** Stable string slug (principles have no bagrut number). */
  id: string;
  en: string;
  he: string;
  /** Pure over `ctx` (no coordinates), like a theorem matcher; `level` rides the match result, so
   *  the SAME discovery dial filters principles and theorems. */
  match: (ctx: MatchCtx) => TheoremMatch | null;
  /** Theorem ids lifted to band 0 while this principle is active (intent archetypes). */
  boosts?: TheoremId[];
}

/** A surfaced principle — a matched {@link PrincipleDef} plus run-specific attribution/●-new. */
export interface PrincipleFeedEntry {
  id: string;
  en: string;
  he: string;
  level: number;
  triggerFactIds: string[];
  triggerObjectIds: Id[];
  boosts?: TheoremId[];
  attributionIndex: number;
  attributionGroup: string | null;
  isNew: boolean;
}

/** ≥2 stated cross-triangle equalities between two typed/structural triangles — the operator's
 *  "שלושה קטעים שווים" constellation, read loosely (the archetype hints EARLIER than the full
 *  criterion matchers, which need 3). */
function congruenceHunt(ctx: MatchCtx): TheoremMatch | null {
  const tris: Id[][] = [];
  const add = (v: Id[]) => {
    if (!tris.some((t) => t.length === v.length && v.every((x) => t.includes(x)))) tris.push([...v]);
  };
  for (const v of triangleVertexSets(ctx)) add(v.ids);
  for (const s of structuralTriangles(ctx)) add(s);
  if (tris.length < 2) return null;
  const ek = (a: Id, b: Id) => [a, b].sort().join('|');
  for (let i = 0; i < tris.length; i++) {
    for (let j = i + 1; j < tris.length; j++) {
      const sides = (T: Id[]) => [ek(T[0], T[1]), ek(T[1], T[2]), ek(T[2], T[0])];
      const [s1, s2] = [sides(tris[i]), sides(tris[j])];
      const facts = ctx.facts.filter((f) => {
        const c = f.cmd;
        if (c.type === 'set-equal' && !c.soft) {
          const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
          return (s1.includes(p) && s2.includes(q)) || (s1.includes(q) && s2.includes(p));
        }
        if (c.type === 'set-angle-ratio' && c.k === 1) {
          return (tris[i].includes(c.v1) && tris[j].includes(c.v2)) || (tris[j].includes(c.v1) && tris[i].includes(c.v2));
        }
        return false;
      });
      if (facts.length >= 2) {
        return { tier: 'possible', triggerFactIds: facts.map((f) => f.id), triggerObjectIds: [...new Set([...tris[i], ...tris[j]])], level: 1 };
      }
    }
  }
  return null;
}

export const PRINCIPLE_TABLE: PrincipleDef[] = [
  {
    // Migrated from the ADR-214 concepts feed.
    id: 'right-triangle-complementary',
    en: 'Right triangle: name one acute angle α and the other is 90°−α (the two acute angles are complementary).',
    he: 'משולש ישר-זווית: נסמן זווית חדה אחת ב-α, והשנייה היא 90°−α (שתי הזוויות החדות משלימות ל-90°).',
    match: (ctx) => {
      const fs = rightAngleFacts(ctx);
      return fs.length ? { tier: 'certain', triggerFactIds: fs.map((f) => f.id), triggerObjectIds: [], level: 1 } : null;
    },
  },
  {
    // Migrated from the ADR-214/220 concepts feed; now an archetype (boosts the similarity band).
    id: 'parallels-seek-similar-triangles',
    en: 'If the figure has parallel lines, look for similar triangles.',
    he: 'אם יש ישרים מקבילים, חפשו משולשים דומים.',
    boosts: [69, 71, 72, 73],
    match: (ctx) => {
      const fs = parallelFacts(ctx);
      return fs.length ? { tier: 'certain', triggerFactIds: fs.map((f) => f.id), triggerObjectIds: [], level: 1 } : null;
    },
  },
  {
    // The operator's motivating example (docs/18 §6): equalities spread over two triangles point at
    // the congruence toolbox — a FAMILY direction, phrased as a question, nothing instantiated.
    id: 'congruence-hunt',
    en: 'Several equal segments/angles between two triangles are given — perhaps congruent triangles?',
    he: 'נתונים כמה קטעים/זוויות שווים בין שני משולשים — אולי חפיפת משולשים?',
    boosts: [18, 19, 20, 21, 30],
    match: congruenceHunt,
  },
  {
    id: 'bisector-setup',
    en: 'An angle is bisected — check the angle-bisector theorems.',
    he: 'זווית שחוצים אותה — בדקו את משפטי חוצה הזווית.',
    boosts: [75, 77, 78, 80],
    match: (ctx) => {
      const bs = bisectorStatements(ctx);
      return bs.length ? { tier: 'possible', triggerFactIds: bs.map((b) => b.fact.id), triggerObjectIds: bs.map((b) => b.vertex), level: 1 } : null;
    },
  },
  {
    id: 'midsegment-setup',
    en: 'Two side midpoints are given — a midsegment?',
    he: 'שני אמצעי צלעות — קטע אמצעים?',
    boosts: [62, 63, 64, 65, 66, 67],
    match: (ctx) => {
      // Two stated midpoints whose host sides share a vertex — even BEFORE the joining segment is
      // drawn (the archetype hints earlier than the 62 matcher, which needs the segment).
      const mids = ctx.facts.filter((f) => f.cmd.type === 'midpoint');
      for (let i = 0; i < mids.length; i++) {
        for (let j = i + 1; j < mids.length; j++) {
          const m1 = mids[i].cmd as { id: Id; a: Id; b: Id };
          const m2 = mids[j].cmd as { id: Id; a: Id; b: Id };
          const shared = [m1.a, m1.b].filter((x) => [m2.a, m2.b].includes(x));
          if (shared.length === 1) {
            return { tier: 'possible', triggerFactIds: [mids[i].id, mids[j].id], triggerObjectIds: [m1.id, m2.id], level: 1 };
          }
        }
      }
      // The full midsegment evidence (construct / joined midpoints) also invites the family.
      const ms = midsegmentFacts(ctx)[0];
      return ms ? { tier: 'possible', triggerFactIds: ms.facts.map((f) => f.id), triggerObjectIds: ms.objIds, level: ms.level } : null;
    },
  },
  {
    id: 'thales-chain',
    en: 'A diameter is given — which inscribed angle stands on it?',
    he: 'קוטר נתון — איזו זווית היקפית נשענת עליו?',
    boosts: [103, 104, 31],
    match: (ctx) => {
      const ds = statedDiameterFacts(ctx);
      if (!ds.length) return null;
      // The question is live only while inscribed vertices exist to stand on the diameter.
      const anyMember = ctx.circles.some((c) => ds.some((d) => (d.circleId === c.id || d.circleId === c.center) && c.members.some((m) => !d.ids.includes(m))));
      return anyMember
        ? { tier: 'possible', triggerFactIds: ds.map((d) => d.fact.id), triggerObjectIds: ds.flatMap((d) => d.ids), level: 1 }
        : null;
    },
  },
  {
    id: 'power-of-a-point',
    en: 'Two secants / a tangent from an external point — see the supporting (appendix) product relations.',
    he: 'שני חותכים/משיק מנקודה חיצונית — המשפטים התומכים (נספח).',
    match: (ctx) => {
      const hubs = externalSecantHubs(ctx);
      if (hubs.length) return { tier: 'possible', triggerFactIds: hubs.map((h) => h.fact.id), triggerObjectIds: hubs.map((h) => h.hub), level: 1 };
      // Two tangencies from one named external point (the 108/109 configuration) also invite it.
      for (const [, tset] of tangentsByCircle(ctx)) {
        if (new Set(tset.ats).size >= 2) return { tier: 'possible', triggerFactIds: tset.factIds, triggerObjectIds: [...tset.ats], level: 1 };
      }
      return null;
    },
  },
  {
    // The median-to-hypotenuse workhorse, the medians' own direction-question.
    id: 'median-hunt',
    en: 'A median is given — in a right triangle remember the median to the hypotenuse equals half of it.',
    he: 'נתון תיכון — במשולש ישר-זווית זכרו שהתיכון ליתר שווה למחציתו.',
    boosts: [15, 16, 17, 31, 32],
    match: (ctx) => {
      const ms = medianFacts(ctx);
      return ms.length ? { tier: 'possible', triggerFactIds: ms.flatMap((m) => m.facts.map((f) => f.id)), triggerObjectIds: ms.map((m) => m.mid), level: 1 } : null;
    },
  },
];

/** The number of principles shown at once (§6 anti-flood); the rest fold behind a count. */
export const PRINCIPLES_VISIBLE = 3;
/** At most this many (most recent) active principles contribute band-0 boosts (§5/§6). */
export const BOOSTING_PRINCIPLES = 2;

/**
 * `detectPrinciples` — the principles feed. Same shape as {@link detectTheorems}: folds
 * {@link PRINCIPLE_TABLE} over the coordinate-free `MatchCtx`, attributes each match to the latest
 * stated fact that completed it, marks ●-new. Ordered most-recent-first, then id.
 */
export function detectPrinciples(input: DetectInput): PrincipleFeedEntry[] {
  const { facts, construction, shapes = [], observed } = input;
  const ctx = buildMatchCtx(facts, construction, shapes, observed);
  if (ctx.facts.length === 0) return [];

  const attribute = makeAttributor(ctx);
  const entries: PrincipleFeedEntry[] = [];
  for (const def of PRINCIPLE_TABLE) {
    const m = def.match(ctx);
    if (!m) continue;
    const { attributionIndex, attributionGroup, isNew } = attribute(m.triggerFactIds);
    entries.push({
      id: def.id,
      en: def.en,
      he: def.he,
      level: m.level,
      triggerFactIds: m.triggerFactIds,
      triggerObjectIds: m.triggerObjectIds,
      ...(def.boosts ? { boosts: def.boosts } : {}),
      attributionIndex,
      attributionGroup,
      isNew,
    });
  }
  entries.sort((a, b) => b.attributionIndex - a.attributionIndex || a.id.localeCompare(b.id));
  return entries;
}

/** The band-0 boost set: the union of the top {@link BOOSTING_PRINCIPLES} active principles' boosts. */
export function activeBoosts(principles: PrincipleFeedEntry[]): TheoremId[] {
  return [...new Set(principles.slice(0, BOOSTING_PRINCIPLES).flatMap((p) => p.boosts ?? []))];
}
