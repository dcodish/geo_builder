/**
 * #1939 (ADR-AG-256) — A DECLARED RING A FREE PARAMETER CAN MAKE SIMPLE IS DRAWN SIMPLE: the search reaches past the
 * sampler's default window before anything is called crossed.
 *
 * Operator ruling, 2026-10-09 (#1927, transcribed on #1939): *"Search first, refuse last. When a letter in the sentence
 * can move the shape, hunt for a value that makes it valid and DRAW it. Refuse only when nothing the student wrote can
 * save it."* — «A(k,0) · B(4,0) · C(1,3) · D(3,3) · טרפז ABCD» *"must be drawn as a genuine trapezoid by searching k
 * past the ±4 sampling window — not refused, and not recorded crossed."*
 *
 * Measured on main @ e0f4260c through `decideSubmit` and `derive`: every line recorded, and at seeds 0–3 the figure
 * drew k at 3.46, 1.31, −3.4, −2.89 — a bow-tie with the `crossed` fault, green. The trapezoid is genuine only for k > 4
 * (AB and DC must point the same way) and k ≠ 6 (a parallelogram); the sampler drew an unbounded parameter at a
 * magnitude in 1..4.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { drawableAt, evaluateStats } from '../engine/evaluate';
import { fold } from '../engine/apply';
import { parseLine } from '../parser/parseAnalytic';
import type { Fact } from '../engine/types';

/** The construction `derive` builds, so the search can be asked directly. */
function construct(lines: readonly string[]) {
  const facts: Fact[] = [];
  for (const l of lines) {
    const r = parseLine(l);
    if (!r.ok) throw new Error(`no parse: ${l}`);
    facts.push(...r.facts);
  }
  return fold(facts).construction;
}

const SEQ = ['A(k,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD'];
const play = (seq: readonly string[], seed = 0) => {
  const lines: string[] = [];
  for (const [i, l] of seq.entries()) {
    const v = decideSubmit(l, lines, seed);
    if (v.kind === 'refused') return { at: i, error: v.error };
    if (v.kind === 'record') lines.push(v.line);
  }
  return null;
};
const xOf = (seq: readonly string[], seed: number, id: string) => derive(seq, seed).figure.points.find((p) => p.id === id)!.x;

describe('#1939 — the operator’s figure is drawn as a genuine trapezoid', () => {
  it('every line records, never refused', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) expect(play(SEQ, seed), `seed ${seed}`).toBeNull();
  });

  it('at every configuration the trapezoid is simple: k > 4, no ring fault, and not a parallelogram', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive(SEQ, seed);
      expect(d.figure.ringFaults, `seed ${seed}`).toEqual([]);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const k = xOf(SEQ, seed, 'A');
      expect(k, `seed ${seed}`).toBeGreaterThan(4);
      expect(Math.abs(k - 6), `seed ${seed}: k = 6 is a parallelogram`).toBeGreaterThan(1e-6);
    }
  });

  it('«הציגו תצורה אחרת» still moves k: the configurations do not all draw one value', () => {
    const ks = new Set([0, 1, 2, 3, 4, 5].map((s) => xOf(SEQ, s, 'A').toFixed(3)));
    expect(ks.size).toBeGreaterThan(1);
  });
});

describe('#1939 — the class: a free parameter the default window cannot reach', () => {
  it.each([
    // the same trapezoid, its letter on the other base end
    [['A(0,0)', 'B(k,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD'], 'B', (x: number) => x < 0],
    // a half-bounded parameter: the region needs k > 6, the window drew 1..4 above the bound
    [['k > 0', 'A(k,0)', 'B(6,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD'], 'A', (x: number) => x > 6],
  ])('%j is drawn simple', (seq, id, ok) => {
    for (const seed of [0, 1, 2]) {
      expect(play(seq, seed), `seed ${seed}`).toBeNull();
      const d = derive(seq, seed);
      expect(d.figure.ringFaults, `seed ${seed}`).toEqual([]);
      expect(ok(xOf(seq, seed, id)), `seed ${seed}: ${id}.x = ${xOf(seq, seed, id)}`).toBe(true);
    }
  });
});

describe('#1939 — the search is paid only where a declared ring is crossed everywhere', () => {
  it('an ordinary parameterised figure evaluates no more configurations than before (the walk stops at the first whole one)', () => {
    const c = construct(['A(k,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'מרובע ABDC']);
    const before = evaluateStats.uncached;
    drawableAt(c, 0, true);
    expect(evaluateStats.uncached - before).toBeLessThanOrEqual(1 + 24);
  });

  it('a refusal the search cannot save still refuses, at every seed — nothing the student wrote moves the ring', () => {
    for (const seed of [0, 1, 2, 3]) {
      expect(play(['A(0,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD'], seed)?.error, `seed ${seed}`).toMatchObject({ key: 'ring-contradicts-noun' });
    }
  });
});
