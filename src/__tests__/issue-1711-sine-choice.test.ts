/**
 * #1711 (ADR-573) — «sin∢ACB = 3/4» BUILDS: its two angles (θ and 180° − θ) are a configuration choice.
 *
 * Operator ruling, 2026-10-03 (playing T33): "sin∢ACB = 3/4 gives to options but this is just a dof and the
 * show other config should deal with it. so in this case we accept the constrain but have 2 options for it.
 * sometimes the other figure data will only allow 1 option and then we can nail it". |sin| > 1 stays refused.
 *
 * Measured at pickup (on the #1718 tip, with the sine lowered as a variant and nothing else changed):
 *  - «sin∢ACB = 3/4» · then «זווית ACB קהה»: the gate REFUSED the obtuse line («∠ACB = 48.59° contradicts
 *    ∠ACB > 90°»), and `findValidConfig` on the committed pair returned null — it never left the variants
 *    the facts held.
 *  - two sines in two triangles: repeated «הציגו תצורה אחרת» reached 2 of the 4 combinations (0,0 · 1,0) —
 *    `searchAnotherView` stepped only the FIRST variant fact.
 *
 * These locks CALL the real decisions: `decideDeterministic2D` (the submit gate), `driveThroughGate` + the
 * store's own `autoResolve` (the post-commit search), and `searchAnotherView` (what the button runs).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, searchAnotherView, meetsRequirements, findValidConfig, lastConfigTier } from '@/replay/core';
import { useGeoStore, type Fact } from '@/store/geoStore';
import { cyclableVariant, type AnyCommand } from '@/engine';
import { factsOf } from './scenario-pipeline';
import { driveThroughGate } from './submit-gate';
import { at, angle, allStepsOk } from './scenarios-harness';

const DEG = 180 / Math.PI;
const ACUTE = Math.asin(0.75) * DEG; // 48.59°
const OBTUSE = 180 - ACUTE; // 131.41°
const TRI = ['משולש ABC'];

async function decide(prefix: string[], line: string): Promise<Verdict2D> {
  const facts = factsOf(prefix);
  const d = replay(facts, 0);
  return decideDeterministic2D({ facts, seed: 0, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const angleAt = (facts: Fact[], seed: number, p: string, v: string, q: string): number => {
  const fig = replay(facts, seed);
  return angle(at(fig, p), at(fig, v), at(fig, q));
};
/** The variant each sine fact holds, in fact order. */
const sineVariants = (facts: Fact[]): string =>
  facts
    .filter((f) => f.cmd.type === 'measure-angle' && 'roots' in f.cmd.expr && f.cmd.expr.roots)
    .map((f) => (f.cmd as { variant?: number }).variant ?? 0)
    .join(',');

beforeEach(() => useGeoStore.getState().clear());

describe('#1711 — a sine in (0, 1) builds as a two-root choice', () => {
  for (const line of ['sin∢ACB = 3/4', 'סינוס הזווית ACB = 3/4', 'נתון כי סינוס הזווית ACB שווה ל-0.75', 'sin C = 3/4']) {
    it(`«${line}» commits the acute root with both roots on the measure`, async () => {
      const v = await decide(TRI, line);
      expect(v.kind, `«${line}» is read deterministically`).toBe('commit');
      const m = (v.kind === 'commit' ? v.commands : []).find((c): c is Extract<AnyCommand, { type: 'measure-angle' }> => c.type === 'measure-angle');
      expect(m && 'value' in m.expr ? m.expr.value : NaN).toBeCloseTo(ACUTE, 9);
      expect(m && 'value' in m.expr ? m.expr.roots : undefined).toEqual([expect.closeTo(ACUTE, 9), expect.closeTo(OBTUSE, 9)]);
      expect(m && cyclableVariant(m), 'the choice is a cyclable variant').toBe(true);
    });
  }

  it('the default figure draws the acute root, labelled with it, at seeds 0–3', () => {
    const facts = factsOf([...TRI, 'sin∢ACB = 3/4']);
    for (let seed = 0; seed < 4; seed++) {
      allStepsOk(replay(facts, seed));
      expect(angleAt(facts, seed, 'A', 'C', 'B'), `seed ${seed}`).toBeCloseTo(ACUTE, 4);
    }
    expect(replay(facts, 0).labels.angles.filter((l) => l.vertex === 'C').map((l) => l.text)).toEqual(['48.59°']);
  });

  it('«הציגו תצורה אחרת» reaches the obtuse root, labelled with it, and comes back', () => {
    const facts = factsOf([...TRI, 'sin∢ACB = 3/4']);
    let cur = { facts, seed: 0 };
    const seen = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      expect(next, `press ${k + 1} finds a view`).not.toBeNull();
      cur = next!;
      expect(meetsRequirements(cur.facts, cur.seed)).toBe(true);
      const c = angleAt(cur.facts, cur.seed, 'A', 'C', 'B');
      seen.add(Math.abs(c - OBTUSE) < 1e-4 ? 'obtuse' : Math.abs(c - ACUTE) < 1e-4 ? 'acute' : `other ${c}`);
      if (Math.abs(c - OBTUSE) < 1e-4) {
        expect(replay(cur.facts, cur.seed).labels.angles.filter((l) => l.vertex === 'C').map((l) => l.text)).toEqual(['131.41°']);
      }
    }
    expect([...seen].sort()).toEqual(['acute', 'obtuse']);
  });

  it('sin = 1 is the one angle 90°, not a choice', async () => {
    const v = await decide(TRI, 'sin∢ACB = 1');
    const m = (v.kind === 'commit' ? v.commands : []).find((c) => c.type === 'measure-angle');
    expect(m && m.type === 'measure-angle' && 'value' in m.expr ? m.expr.value : NaN).toBeCloseTo(90, 9);
    expect(m && cyclableVariant(m)).toBe(false);
  });
});

describe('#1711 — when the other givens admit only one root, that root is drawn — never a refusal', () => {
  it('obtuse stated FIRST: the sine commits and settles on the obtuse root', async () => {
    const v = await decide([...TRI, 'זווית ACB קהה'], 'sin∢ACB = 3/4');
    expect(v.kind).toBe('commit');
    const facts = factsOf([...TRI, 'זווית ACB קהה', 'sin∢ACB = 3/4']);
    allStepsOk(replay(facts, 0));
    expect(angleAt(facts, 0, 'A', 'C', 'B')).toBeCloseTo(OBTUSE, 4);
  });

  it('obtuse stated AFTER: the gate commits, and the post-commit search flips the earlier sine', () => {
    const { facts, refused } = driveThroughGate([...TRI, 'sin∢ACB = 3/4', 'זווית ACB קהה']);
    expect(refused, 'no line is refused').toEqual([]);
    expect(meetsRequirements(facts, 0), 'the committed acute root cannot hold beside «קהה»').toBe(false);
    expect(useGeoStore.getState().autoResolve(), 'the store’s own post-commit search finds a view').toBe(true);
    const st = useGeoStore.getState();
    expect(meetsRequirements(st.facts, st.seed)).toBe(true);
    expect(lastConfigTier).toBe('variant');
    expect(sineVariants(st.facts)).toBe('1');
    expect(angleAt(st.facts, st.seed, 'A', 'C', 'B')).toBeCloseTo(OBTUSE, 4);
  });

  it('an angle sum that leaves room for the acute root only: every press keeps C acute', () => {
    const facts = factsOf([...TRI, '∢ABC = 100', 'sin∢ACB = 3/4']);
    allStepsOk(replay(facts, 0));
    let cur = { facts, seed: 0 };
    for (let k = 0; k < 4; k++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      if (!next) break;
      cur = next;
      expect(angleAt(cur.facts, cur.seed, 'A', 'C', 'B'), `press ${k + 1}`).toBeCloseTo(ACUTE, 4);
    }
  });

  it('findValidConfig reaches a variant the CURRENT facts do not hold (the tier itself)', () => {
    const base = factsOf([...TRI, 'sin∢ACB = 3/4']);
    const ob = factsOf([...TRI, 'זווית ACB קהה']).slice(factsOf(TRI).length);
    const facts = [...base, ...ob.map((f, i) => ({ ...f, id: `late.${i}`, group: 'late' }))];
    expect(meetsRequirements(facts, 0)).toBe(false);
    const found = findValidConfig(facts, 0);
    expect(found).not.toBeNull();
    expect(sineVariants(found!.facts)).toBe('1');
  });
});

describe('#1711 — «הציגו תצורה אחרת» walks the PRODUCT of every variant', () => {
  it('two sines in two triangles reach all four combinations', () => {
    const facts = factsOf(['משולש ABC', 'משולש DEF', 'sin∢ACB = 3/4', 'sin∢DFE = 1/2']);
    let cur = { facts, seed: 0 };
    const seen = new Set<string>([sineVariants(facts)]);
    for (let k = 0; k < 8; k++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      expect(next, `press ${k + 1}`).not.toBeNull();
      cur = next!;
      seen.add(sineVariants(cur.facts));
    }
    expect([...seen].sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('the ambiguous case (two sides and the sine): a determined figure still cycles both triangles', () => {
    const facts = factsOf([...TRI, 'AB = 4', 'AC = 3', 'sin∢ACB = 3/4']);
    allStepsOk(replay(facts, 0));
    const next = searchAnotherView(facts, 0);
    expect(next).not.toBeNull();
    expect(angleAt(next!.facts, next!.seed, 'A', 'C', 'B')).toBeCloseTo(OBTUSE, 4);
    const fig = replay(next!.facts, next!.seed);
    expect(Math.hypot(at(fig, 'A').x - at(fig, 'B').x, at(fig, 'A').y - at(fig, 'B').y)).toBeCloseTo(4, 4);
  });
});

describe('#1711 — a sine with no angle is refused by name, never drawn and never escalated', () => {
  for (const line of ['sin∢ACB = 5/4', 'sin∢ACB = 2', 'סינוס הזווית ACB = -1/2', 'sin∢ACB = 0']) {
    it(`«${line}» → input.trigGiven.sine-out-of-range`, async () => {
      const v = await decide(TRI, line);
      expect(v.kind).toBe('refuse');
      expect(v.kind === 'refuse' && 'key' in v.note ? v.note.key : undefined).toBe('input.trigGiven.sine-out-of-range');
    });
  }
  it('the model is never consulted', () => expect(llmParseMock).not.toHaveBeenCalled());
});
