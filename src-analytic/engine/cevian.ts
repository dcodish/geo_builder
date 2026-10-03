/**
 * THE ONE LOWERING OF A CEVIAN (#1284, #1222, #1240; ADR-AG-209).
 *
 * A median, an altitude and an angle bisector are one sentence shape with three roles: a segment from an
 * APEX to a FOOT on the opposite side, with a property the role adds. Before this module the lowering lived
 * inline in the parser's one cevian rule, as a binary (`median ? midpoint : perpendicular`), and every new
 * spelling would have needed its own copy of it — the drift #1231 and #1232 each paid for. Now every spelling
 * reaches the facts below: the parser's fully-named forms («AD תיכון לצלע BC», «CE חוצה זווית C במשולש ABC»)
 * call it directly, and the forms whose target only the FIGURE knows («AD גובה», «תיכון לצלע BC», «AD חוצה
 * זווית A») call it from M1 once the target is resolved (`apply.ts`, `cevian-of` / `bisects`).
 *
 * The conjunction is ADR-AG-025's and #1232's: the foot lies ON the side's line, and each role then states
 * what it adds — the midpoint, the right angle, or the two equal angles at the apex. An angle bisector's foot
 * needs no closed form: the internal bisector line meets the opposite side's line exactly once, inside the
 * side, so «foot on BC» + «∠BAD = ∠DAC» (the unsigned angle residual, #1331) determines it — the same
 * `set-angle-ratio` 2-D lowers «AD חוצה את הזווית BAC» to when D already exists.
 */
import type { AngleRef, Constraint } from './solve';
import type { DerivedRule } from './derived';
import type { Fact, Id } from './types';

export type CevianRole = 'median' | 'altitude' | 'bisector';

/** The one segment id rule (the parser's `segmentId`): sorted ends, so «AD» and «DA» are one segment. */
export const segmentIdOf = (a: Id, b: Id): Id => `seg-${[a, b].sort().join('')}`;

const ONE = { kind: 'num' as const, value: 1 };
const angle = (v: Id, a: Id, b: Id): AngleRef => ({ v, a, b });

/**
 * «AD <role> לצלע BC» — apex `A`, foot `D`, side `BC`. The facts every spelling of the role lowers to.
 *
 * The foot is on the LINE `uv`, never bounded: an obtuse triangle's altitude lands beyond an endpoint and is
 * an honest figure (#1232's ruling). A median's and a bisector's foot is inside the side by its own property.
 */
export function cevianFacts(role: CevianRole, apex: Id, foot: Id, u: Id, v: Id, src: string): Fact[] {
  const k: Constraint =
    role === 'median'
      ? { t: 'midpoint', id: foot, a: u, b: v }
      : role === 'altitude'
        ? { t: 'perpendicular', a: apex, b: foot, c: u, d: v }
        : { t: 'angle-ratio', left: angle(apex, u, foot), right: angle(apex, foot, v), k: ONE };
  return [
    // The sentence NAMES the foot — «AD תיכון לצלע BC» is where `D` first appears — so it is declared here.
    { t: 'declare', id: apex, src },
    { t: 'declare', id: foot, src },
    { t: 'segment', id: segmentIdOf(apex, foot), a: apex, b: foot, src },
    { t: 'constraint', k: { t: 'on-line-2pt', id: foot, a: u, b: v }, src },
    { t: 'constraint', k, src },
  ];
}

/**
 * A FOOT THE TOOL NAMES is a DERIVED point (#1620 S6, ADR-AG-211): a median's is the `midpoint` of the side, an
 * altitude's the `foot` of the perpendicular from the apex (ADR-AG-207's rule) — 0-DOF closed forms, so adding the
 * cevian never moves the triangle (stability is structural), and the same point reached another way («D אמצע BC»,
 * «האנך מ-A ל-BC») is ONE point with one name (#1153; `toolLetters.ts` reuses it). A foot the STUDENT names keeps
 * `cevianFacts`: it may already exist, and its conjunction is what a refusal names (ADR-AG-109).
 */
export function toolFootRule(role: 'median' | 'altitude', apex: Id, u: Id, v: Id): DerivedRule {
  return role === 'median' ? { t: 'midpoint', a: u, b: v } : { t: 'foot', from: apex, onto: { k: 'points', a: u, b: v } };
}
export function toolFootFacts(role: 'median' | 'altitude', apex: Id, foot: Id, u: Id, v: Id, src: string): Fact[] {
  return [
    { t: 'derived', id: foot, rule: toolFootRule(role, apex, u, v), src },
    { t: 'segment', id: segmentIdOf(apex, foot), a: apex, b: foot, src },
  ];
}

/**
 * «DB חוצה את הזווית ADC» where `B` is ALREADY a point of the figure — `B` lies on the bisector's RAY from `D`.
 *
 * One equation and one region. «∠ADB = ∠BDC» (unsigned) holds on the whole bisector LINE — on the opposite ray
 * both angles are 180° − α/2, a configuration the sentence does not describe — so WHICH ray is stated as the
 * `angle-side` selector (D7's kind 2: a region, consuming no freedom). A second angle row («∠ADB = ½∠ADC») would
 * also pick the ray, and was measured first: the pair is one condition analytically, but the numeric rank of the
 * two near-parallel rows read 2 at some seeds, so the figure's freedom cue lied. A selector cannot.
 */
export function onBisectorFacts(at: AngleRef, p: Id, src: string): Fact[] {
  return [
    { t: 'segment', id: segmentIdOf(at.v, p), a: at.v, b: p, src },
    { t: 'constraint', k: { t: 'angle-ratio', left: angle(at.v, at.a, p), right: angle(at.v, p, at.b), k: ONE }, src },
    { t: 'selector', sel: { kind: 'angle-side', id: p, v: at.v, a: at.a, b: at.b }, src },
  ];
}
