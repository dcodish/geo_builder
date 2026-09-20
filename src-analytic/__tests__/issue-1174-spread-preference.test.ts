/**
 * #1174 — THE SEED SWEEP PREFERS A CONFIGURATION THAT IS NOT A SLIVER.
 *
 * **Reported twice, on two different figures.** Operator, 2026-09-17, playing round #1169: *"still too
 * close to a straight line and there is no reason we need to do this — so many other configs that will
 * look nicer"*. This is #1166's named residue: that issue ruled exact degeneracy INVALID (never drawn)
 * and left near-degeneracy as *"a seed preference, in the `spread.ts` mould"* — and `spread.ts` is
 * 2-D's alone, so this tree had no preference of any kind.
 *
 * `drawableAt`'s `whole()` is a VALIDITY predicate: it answers *may this be drawn*, and among the many
 * configurations that may be, it took the first. Nothing was forcing the sliver — it was the sampler's
 * luck being presented as the answer.
 *
 * ## Measured on `main` @ `55a5f340`, minimum interior angle of `ABC` over seeds 0–7
 *
 * ```
 * F1  «משולש ABC» «A(2,-5)» «AD תיכון לצלע BC»        1.4  2.3 14.9 25.4 14.1 18.2 25.4  1.9
 * F2  …plus «CE תיכון לצלע AB» and their meeting point 2.3  2.4  6.6 19.7 12.2 32.7  9.3  5.4
 * F3  «משולש ABC» alone                               15.9 21.1 29.1 13.8 35.3 22.5 12.3 30.8
 * ```
 *
 * He opened on 1.4° and on 2.3°, with 25.4° and 19.7° a couple of seeds away.
 *
 * ## The one way this change could become an honesty bug, and the lock for it
 *
 * `isKnowledge`, `knownOptions` and the locus determinacy gate ask what is true across the
 * configurations the tool would ADMIT. Narrowing that pool to the pretty ones would make the tool claim
 * knowledge it does not have. So the preference is opt-in, the honesty gates never opt in, and the
 * third block below asserts that by driving both modes rather than by trusting the default.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { anotherConfiguration } from '../app/another';
import { drawableAt, figureSignature, isKnowledge } from '../engine/evaluate';
import { minInteriorAngleOf, SPREAD_MIN_DEG } from '../engine/rings';
import type { Figure } from '../engine/evaluate';

/** The operator's two figures, and the bare triangle that proved it is the sampler and not the median. */
const F1 = ['משולש ABC', 'A(2,-5)', 'AD תיכון לצלע BC'];
const F2 = [...F1, 'CE תיכון לצלע AB', 'P נקודת החיתוך של AD ו-CE'];
const F3 = ['משולש ABC'];

/**
 * The figure's own spread, read through the predicate the engine uses — never re-derived here, or the
 * lock would stay green through a change that redefines what "spread" means (#1102/#1118).
 */
const spreadOf = (lines: readonly string[], seed: number): number => {
  const d = derive(lines, seed);
  return angleOf(d.construction, d.figure);
};
const angleOf = (c: Parameters<typeof drawableAt>[0], f: Figure): number =>
  minInteriorAngleOf(c, (id) => {
    const p = f.points.find((q) => q.id === id);
    return p ? { x: p.x, y: p.y } : undefined;
  });

describe('#1174 — the figure shown is not a sliver when a better one is reachable', () => {
  it.each([
    ['F1 — the operator’s first figure', F1],
    ['F2 — the operator’s second figure', F2],
    ['F3 — the bare triangle', F3],
  ])('%s opens on a well-spread configuration', (_name, lines) => {
    expect(spreadOf(lines, 0)).toBeGreaterThanOrEqual(SPREAD_MIN_DEG);
  });

  /**
   * And it holds for every start, not only seed 0 — the operator's second report was about the next
   * three PRESSES of «הציגו תצורה אחרת», not about the opening figure.
   */
  it.each([
    ['F1', F1],
    ['F2', F2],
    ['F3', F3],
  ])('%s is well-spread at every one of the first eight starts', (_name, lines) => {
    const angles = Array.from({ length: 8 }, (_, s) => spreadOf(lines, s));
    expect(angles.filter((a) => a < SPREAD_MIN_DEG)).toEqual([]);
  });

  /**
   * THE PRECONDITION, so this lock cannot become vacuous. If a later change happens to make seed 0
   * well-spread on its own, the assertions above would pass while the preference did nothing. The
   * un-preferred sweep is therefore asserted to still produce the sliver the operator saw.
   */
  it('the un-preferred sweep still finds the sliver — the preference is doing the work', () => {
    const c = derive(F1, 0).construction;
    expect(angleOf(c, drawableAt(c, 0))).toBeLessThan(SPREAD_MIN_DEG);
    expect(angleOf(c, drawableAt(c, 0, true))).toBeGreaterThanOrEqual(SPREAD_MIN_DEG);
  });
});

/**
 * A PREFERENCE, NEVER A REQUIREMENT ([ADR-052](../../docs/06-decisions.md#adr-052)).
 *
 * A figure whose givens FORCE a tight wedge must still be drawn. Refusing it would assert a given the
 * student never gave, from the other side — and it is the counter-direction that keeps this from being
 * "the tool only draws pretty triangles".
 */
describe('#1174 — a forced sliver is still drawn', () => {
  const FORCED = ['A(0,0)', 'B(10,0)', 'C(5,0.1)', 'משולש ABC'];

  it('a pinned 1° triangle is drawn, not refused and not moved', () => {
    const d = derive(FORCED, 0);
    expect(d.faults).toEqual([]);
    expect(spreadOf(FORCED, 0)).toBeLessThan(SPREAD_MIN_DEG);
    const at = (id: string) => d.figure.points.find((p) => p.id === id);
    expect(at('C')).toMatchObject({ x: 5, y: 0.1 });
  });

  it('a figure with no declared polygon is unaffected — there is no ring to prefer', () => {
    const lines = ['A(0,0)', 'נקודה B', 'AB = 10'];
    expect(derive(lines, 0).faults).toEqual([]);
  });
});

/**
 * THE HONESTY GUARD — the preference must not reach the gates that report what is KNOWN.
 *
 * Driven, not trusted: `drawableAt`'s default is asserted to be the un-preferred answer (so a gate that
 * simply calls it inherits the honest pool), and the gate's own verdict is asserted on a figure with
 * real freedom.
 */
describe('#1174 — the knowledge gates keep the full pool', () => {
  it('drawableAt defaults to the UN-preferred sweep', () => {
    const c = derive(F1, 0).construction;
    expect(figureSignature(drawableAt(c, 0))).not.toBe(figureSignature(drawableAt(c, 0, true)));
  });

  it('a free coordinate is still reported UNKNOWN on the operator’s figure', () => {
    const c = derive(F1, 0).construction;
    const read = (f: Figure) => f.points.find((p) => p.id === 'B')?.x ?? null;
    expect(isKnowledge(c, read).known).toBe(false);
  });

  it('a given the student DID state is still known', () => {
    const c = derive(F1, 0).construction;
    const read = (f: Figure) => f.points.find((p) => p.id === 'A')?.x ?? null;
    expect(isKnowledge(c, read)).toEqual({ known: true, value: 2 });
  });
});

/**
 * VARIETY SURVIVES. The preference narrows what may be shown, so the risk it creates is the #1282
 * collapse: several seeds resolving to one picture and «הציגו תצורה אחרת» running out of answers.
 * Measured as the number of DISTINCT pictures ten presses walk through, never as a seed list.
 */
describe('#1174 — «הציגו תצורה אחרת» still has somewhere to go', () => {
  it.each([
    ['F1', F1],
    ['F2', F2],
    ['F3', F3],
  ])('%s offers at least eight distinct configurations in ten presses', (_name, lines) => {
    const seen = new Set<string>();
    let seed = 0;
    for (let i = 0; i < 10; i += 1) {
      seen.add(figureSignature(derive(lines, seed).figure));
      const next = anotherConfiguration(lines, seed);
      if (!next.found) break;
      seed = next.seed;
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('a DETERMINED figure still honestly reports that there is no other one', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC'];
    expect(anotherConfiguration(lines, 0).found).toBe(false);
  });
});
