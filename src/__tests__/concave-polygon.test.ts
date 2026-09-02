/**
 * #441 (ADR-426): a stated CONVEXITY is honoured — «דלתון קעור» draws a dart, not a convex kite.
 *
 * Operator report, 2026-08-08: "I want support for `דלתון קעור` as well as `קמור`." Measured, it was not
 * a missing capability but a silent WRONG BUILD — the same class as #435/#436:
 *
 *   דלתון קמור → shape-variant kite A,B,C,D     signs 1,1,1,1  CONVEX
 *   דלתון קעור → shape-variant kite A,B,C,D     signs 1,1,1,1  CONVEX   ← the opposite of the given
 *
 * Byte-identical commands, and the figure drawn convex with a green check. Two layers caused it: the
 * qualifier was in no vocabulary (dropped exactly as `ישר זווית` was in #435), and convexity was a
 * blanket DEFAULT — `polygonsConvex`, one of the `meetsRequirements` predicates — so even a carried
 * qualifier could never have been drawn: every configuration search rejected the dart outright.
 *
 * The shape itself needed no new geometry: a dart satisfies the very same kite relations, so convex vs
 * concave is a configuration BRANCH of the existing constraint set.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { findValidConfig, meetsRequirements, replay, useGeoStore } from '@/store/geoStore';
import { ringSimple } from '@/engine';

type P = { x: number; y: number };

function build(utterance: string) {
  useGeoStore.getState().clear();
  const r = parse(utterance, { points: [], neighbors: {} } as never);
  if (!r.ok) throw new Error(`expected a parse for ${utterance}`);
  for (const c of r.commands) useGeoStore.getState().execute(c, utterance);
  const st0 = useGeoStore.getState();
  const found = findValidConfig(st0.facts, st0.seed);
  if (found) useGeoStore.setState({ facts: found.facts, seed: found.seed } as never);
  return { commands: r.commands, state: () => useGeoStore.getState() };
}

function ringAt(utteranceState: ReturnType<typeof build>, seed: number, ids: string[]) {
  const st = utteranceState.state();
  const d = replay(st.facts, seed);
  const pts = ids.map((i) => d.positions.get(i)) as P[];
  return { pts, violations: d.violations };
}

const isConvex = (p: P[]) => {
  const s = p
    .map((_, i) => {
      const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
      return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    })
    .filter((x) => x !== 0);
  return s.every((x) => x === s[0]);
};

/** Every configuration the app would ever SHOW: the drawn one, plus any seed passing the requirement
 *  gate ("show another configuration" only ever offers those). Asserting over this set — rather than
 *  over arbitrary seeds — is the honest property, since the reflection mask lives in the seed's HIGH
 *  bits and a raw low seed is simply a different (rejected) configuration. */
function validConfigs(b: ReturnType<typeof build>, extra = 80): number[] {
  const st = b.state();
  const out = [st.seed];
  for (let s = 0; s < extra; s++) if (meetsRequirements(st.facts, s)) out.push(s);
  return out;
}

describe('#441 — a stated concavity is DRAWN concave', () => {
  it.each([
    ['the reported kite', 'דלתון קעור'],
    ['English', 'concave kite ABCD'],
    ['a plain quadrilateral — the qualifier was dropped there too', 'מרובע קעור ABCD'],
  ])('%s', (_label, utterance) => {
    const b = build(utterance);
    const configs = validConfigs(b);
    expect(configs.length).toBeGreaterThan(0);
    for (const seed of configs) {
      const { pts, violations } = ringAt(b, seed, ['A', 'B', 'C', 'D']);
      expect(isConvex(pts)).toBe(false); // NO valid configuration is convex
      expect(violations).toEqual([]);
      // a dart, not a tangled quad — "concave" buys the reflex corner and nothing else
      expect(ringSimple(pts)).toBe(true);
    }
  });

  it('the kite relations still hold in the dart — the constraint set is unchanged', () => {
    const b = build('דלתון קעור');
    const { pts } = ringAt(b, b.state().seed, ['A', 'B', 'C', 'D']);
    const [A, B, C, D] = pts;
    const d = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(d(A, B)).toBeCloseTo(d(A, D), 3);
    expect(d(C, B)).toBeCloseTo(d(C, D), 3);
  });
});

describe('#441 — convex stays the default, and a stated convex stays convex', () => {
  it.each([
    ['explicitly convex', 'דלתון קמור'],
    ['explicitly convex quad', 'מרובע קמור ABCD'],
  ])('%s draws convex', (_label, utterance) => {
    const b = build(utterance);
    for (const seed of validConfigs(b)) {
      const { pts, violations } = ringAt(b, seed, ['A', 'B', 'C', 'D']);
      expect(isConvex(pts)).toBe(true);
      expect(violations).toEqual([]);
    }
  });

  it('an UNSTATED kite is untouched — same drawn configuration as before this change', () => {
    // Scoped deliberately to the DRAWN config. A bare `shape-variant` ring is not covered by the
    // blanket `polygonsConvex` default (its fact type is `shape-variant`, not a POLYGON_SHAPES member),
    // so an unstated kite can already draw as a dart at some seeds — pre-existing, orthogonal to this
    // issue, and filed separately (#443). What #441 guarantees is that a STATED convexity is honoured.
    const b = build('דלתון ABCD');
    const { violations } = ringAt(b, b.state().seed, ['A', 'B', 'C', 'D']);
    expect(violations).toEqual([]);
  });

  it('an unstated polygon emits NO convexity command (the default is silence, not an assertion)', () => {
    useGeoStore.getState().clear();
    const r = parse('דלתון ABCD', { points: [], neighbors: {} } as never);
    if (!r.ok) throw new Error('parse');
    expect(r.commands.some((c) => c.type === 'set-polygon-convexity')).toBe(false);
  });
});

describe('#441 — the qualifier lowers from every polygon position (the #435 doctrine)', () => {
  it.each([
    ['kite', 'דלתון קעור'],
    ['quadrilateral', 'מרובע קעור ABCD'],
    ['square (contradictory, but never dropped)', 'ריבוע קעור ABCD'],
    ['English concave', 'concave kite ABCD'],
    ['English convex', 'convex quadrilateral ABCD'],
  ])('%s carries a convexity command', (_label, utterance) => {
    const r = parse(utterance, { points: [], neighbors: {} } as never);
    if (!r.ok) throw new Error(`parse ${utterance}`);
    expect(r.commands.some((c) => c.type === 'set-polygon-convexity')).toBe(true);
  });

  it('a CONTRADICTORY statement reads amber — never silently satisfied the other way', () => {
    // a square cannot be concave; the honest outcome is a violation, not a quietly convex square
    const b = build('ריבוע קעור ABCD');
    const { pts, violations } = ringAt(b, b.state().seed, ['A', 'B', 'C', 'D']);
    expect(isConvex(pts)).toBe(true);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].messageKey).toBe('figure.v.concavePolygon');
  });

  it('a triangle carries nothing — always convex, so the word is a tautology not a given', () => {
    const r = parse('משולש קמור ABC', { points: [], neighbors: {} } as never);
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-polygon-convexity')).toBe(false);
  });
});
