/**
 * #2027 ([ADR-637](../../../docs/06-decisions.md#adr-637)) — a similarity's stated RATIO is a verified constraint.
 *
 * Measured on `main` 6096b643 through `decideDeterministic2D` + `replay`: «משולש ABC · משולש DEF · משולש ABC דומה
 * למשולש DEF ביחס 1/2» committed and drew the triangles congruent (AB/DE = 1.000), green — the similarity rule
 * matched the sentence and never read «ביחס k». «½» did the same; «1:2», «2», «0.5» escalated as a dropped number;
 * «ביחס √2» and "with a similarity ratio of 1/2" restated over an existing similarity were a «כבר קיים» no-op.
 * Now every spelling lowers to `set-ratio |AB| = k·|DE|` beside the angle equalities, which the verifier checks.
 *
 * Half (b) of the issue — an UNSTATED ratio varies on «הציגו תצורה אחרת» (operator ruling 2026-10-13) — already
 * held at that commit (the button reached AB/DE = 1, 2.76, 1.53, …); it is locked here, not changed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { firstSatisfyingSeed, searchAnotherView } from '@/replay/core';
import { driveThroughGate } from '../../__tests__/submit-gate';
import type { Fact } from '@/store/geoStore';

type P = Map<string, { x: number; y: number }>;
const len = (p: P, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
const angle = (p: P, v: string, a: string, b: string) => {
  const V = p.get(v)!, A = p.get(a)!, B = p.get(b)!;
  const x = Math.abs(Math.atan2(A.y - V.y, A.x - V.x) - Math.atan2(B.y - V.y, B.x - V.x));
  return x > Math.PI ? 2 * Math.PI - x : x;
};

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}

/** Drive the sequence, assert it all commits, and return the drawn figure at the store's seed. */
function build(lines: string[]) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  return { facts, fig };
}

/** The two triangles are similar (∠A = ∠D, ∠B = ∠E) at scale `k` = AB/DE, every corresponding side. */
function expectSimilarAt(p: P, k: number) {
  expect(angle(p, 'A', 'B', 'C')).toBeCloseTo(angle(p, 'D', 'E', 'F'), 3);
  expect(angle(p, 'B', 'A', 'C')).toBeCloseTo(angle(p, 'E', 'D', 'F'), 3);
  expect(len(p, 'A', 'B') / len(p, 'D', 'E')).toBeCloseTo(k, 3);
  expect(len(p, 'B', 'C') / len(p, 'E', 'F')).toBeCloseTo(k, 3);
  expect(len(p, 'C', 'A') / len(p, 'F', 'D')).toBeCloseTo(k, 3);
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const TRIS = ['משולש ABC', 'משולש DEF'];

describe('#2027 — the stated similarity ratio is honoured', () => {
  it('the operator-facing case: «ביחס 1/2» draws ABC at half the size of DEF, verified', async () => {
    const v = await decide(TRIS, 'משולש ABC דומה למשולש DEF ביחס 1/2');
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'set-ratio', a: 'A', b: 'B', c: 'D', d: 'E', k: 0.5 });
    expectSimilarAt(build([...TRIS, 'משולש ABC דומה למשולש DEF ביחס 1/2']).fig.positions, 0.5);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each([
    ['משולש ABC דומה למשולש DEF ביחס ½', 0.5],
    ['משולש ABC דומה למשולש DEF ביחס 1:2', 0.5],
    ['משולש ABC דומה למשולש DEF ביחס 0.5', 0.5],
    ['משולש ABC דומה למשולש DEF ביחס 2', 2],
    ['משולש ABC דומה למשולש DEF ביחס √2', Math.SQRT2],
    ['משולש ABC דומה למשולש DEF ביחס דמיון 2', 2],
    ['משולש ABC דומה למשולש DEF ויחס הדמיון הוא 2', 2],
    ['המשולשים ABC ו-DEF דומים ביחס 1:2', 0.5],
    ['ABC ~ DEF ביחס 3', 3],
    ['יחס הדמיון בין המשולשים ABC ו-DEF הוא 1:2', 0.5],
    ['triangle ABC is similar to triangle DEF with ratio 2', 2],
    ['triangle ABC is similar to triangle DEF in ratio 1:2', 0.5],
    ['triangle ABC is similar to triangle DEF with a similarity ratio of 1/2', 0.5],
  ])('«%s» lowers its ratio (AB/DE = %d) and draws it', async (line, k) => {
    const v = await decide(TRIS, line);
    expect(v.kind, line).toBe('commit');
    const r = v.kind === 'commit' ? v.commands.find((c) => c.type === 'set-ratio') : undefined;
    expect(r).toMatchObject({ a: 'A', b: 'B', c: 'D', d: 'E' });
    expect((r as { k: number }).k).toBeCloseTo(k, 9);
    expectSimilarAt(build([...TRIS, line]).fig.positions, k);
  });

  it('a ratio stated on a LATER line over an existing similarity is read, never «כבר קיים»', async () => {
    const prefix = [...TRIS, 'משולש ABC דומה למשולש DEF'];
    for (const line of ['משולש ABC דומה למשולש DEF ביחס 1/2', 'יחס הדמיון בין המשולשים ABC ו-DEF הוא 1:2']) {
      const v = await decide(prefix, line);
      expect(v.kind, line).toBe('commit');
      expectSimilarAt(build([...prefix, line]).fig.positions, 0.5);
    }
  });

  it('the ratio holds beside a stated side, before or after it (entry order, docs/17 §6)', () => {
    const S = 'משולש ABC דומה למשולש DEF ביחס 1/2';
    for (const lines of [
      ['משולש ABC', 'AB = 4', 'משולש DEF', S],
      ['משולש ABC', 'משולש DEF', 'DE = 4', S],
      ['משולש ABC', 'BC = 4', 'משולש DEF', S],
      [...TRIS, S, 'AB = 4'],
      [...TRIS, S, 'DE = 4'],
      ['משולש ABC', 'AB = 4', 'משולש DEF', 'DE = 8', S],
      [S],
    ]) {
      expectSimilarAt(build(lines).fig.positions, 0.5);
    }
  });

  it('a ratio the stated sides contradict is refused with the existing conflict, never drawn', async () => {
    const v = await decide(['משולש ABC', 'AB = 4', 'משולש DEF', 'DE = 4'], 'משולש ABC דומה למשולש DEF ביחס 1/2');
    expect(v.kind).toBe('refuse');
  });

  it.each([
    'משולש ABC דומה למשולש DEF ביחס חצי',
    'משולש ABC דומה למשולש DEF ביחס 1:2:3',
  ])('a ratio this grammar cannot read («%s») is never drawn without it — the line escalates', async (line) => {
    const v = await decide(TRIS, line);
    expect(v.kind).toBe('escalate');
  });

  it('no ratio stated: no ratio constraint, and «הציגו תצורה אחרת» varies the scale (ADR-052, ruling 2026-10-13)', async () => {
    const v = await decide(TRIS, 'משולש ABC דומה למשולש DEF');
    expect(v.kind === 'commit' && v.commands.some((c) => c.type === 'set-ratio')).toBe(false);
    const { facts } = build([...TRIS, 'משולש ABC דומה למשולש DEF']);
    let cur: { facts: Fact[]; seed: number } = { facts, seed: firstSatisfyingSeed(facts) };
    const ratios = new Set<string>();
    for (let press = 0; press < 4; press++) {
      const p = replay(cur.facts, cur.seed).positions;
      ratios.add((len(p, 'A', 'B') / len(p, 'D', 'E')).toFixed(2));
      const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
      if (!next) break;
      cur = next;
    }
    expect(ratios.size, [...ratios].join(', ')).toBeGreaterThan(1);
  });
});
