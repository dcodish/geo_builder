/**
 * #1808 ([ADR-793](../../docs/06-decisions.md#adr-793)) — a colon ratio's term is a number like any other.
 *
 * `RATPQ` read digits only, so «AB:AC=3:√13» was refused while «AB/AC = 3/√13» was read, and its missing end anchor read
 * a prefix: «AB:AC=3:2.5x» committed k = 1.2. Measured at pickup, the slash form itself reached the model at the submit
 * gate: a ratio keeps one quotient, and the honesty gates hunted its digits in it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from './submit-gate';

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const ratioOf = async (prefix: string[], line: string) => {
  const v = await decide(prefix, line);
  const c = v.kind === 'commit' ? v.commands.find((x) => x.type === 'set-ratio') : undefined;
  return c && c.type === 'set-ratio' ? c.k : v.kind;
};

beforeEach(() => useGeoStore.getState().clear());
const TRIANGLE = ['משולש ABC'];

describe('#1808 — the bare colon', () => {
  it.each<[string, number]>([
    ['AB:AC=3:√13', 3 / Math.sqrt(13)],
    ['AB:AC=3:√(13)', 3 / Math.sqrt(13)],
    ['AB:AC = 3 : √13', 3 / Math.sqrt(13)],
    ['AB:AC=3:2√3', 3 / (2 * Math.sqrt(3))],
    ['AB:AC=√3:2', Math.sqrt(3) / 2],
    ['AB:AC=√2:√3', Math.sqrt(2 / 3)],
    ['AB:AC=√(2/3):1', Math.sqrt(2 / 3)],
    ['AB:AC=3:3/2', 2],
    ['AB:AC=3:2', 1.5],
    ['AB:AC=2.5:5', 0.5],
  ])('%s', async (line, k) => {
    expect(await ratioOf(TRIANGLE, line)).toBeCloseTo(k, 9);
  });

  it('the slash form commits too: the gate no longer hunts its digits in the quotient', async () => {
    expect(await ratioOf(TRIANGLE, 'AB/AC=3/√13')).toBeCloseTo(3 / Math.sqrt(13), 9);
  });

  it('the end is anchored: a tail is not a prefix read green', async () => {
    expect(await ratioOf(TRIANGLE, 'AB:AC=3:2.5x')).toBe('escalate');
  });

  it.each(['AB:AC=0:2', 'AB:AC=2:0', 'AB:AC=√0:2'])('a term of zero is not a ratio: %s', async (line) => {
    expect(await ratioOf(TRIANGLE, line)).toBe('escalate');
  });
});

describe('#1808 — the divider', () => {
  const tOf = async (prefix: string[], line: string) => {
    const v = await decide(prefix, line);
    const c = v.kind === 'commit' ? v.commands.find((x) => x.type === 'point-on-segment') : undefined;
    return c && c.type === 'point-on-segment' ? c.t : v.kind;
  };
  it.each<[string[], string, number]>([
    [['קטע AB'], 'C מחלקת את AB ביחס 1:√2', 1 / (1 + Math.SQRT2)],
    [['קטע AB'], 'C מחלקת את AB ביחס 1:2', 1 / 3],
    [['קטע AB'], 'היחס בין AC ל-CB הוא 1:√2', 1 / (1 + Math.SQRT2)],
    [['קטע AB'], 'the ratio AC:CB is √2:√3', Math.SQRT2 / (Math.SQRT2 + Math.sqrt(3))],
  ])('%s · %s', async (prefix, line, t) => {
    expect(await tOf(prefix, line)).toBeCloseTo(t, 9);
  });
});

describe('#1808 — the gates are not loosened', () => {
  it('a plain ratio that a rule dropped is still a dropped given', async () => {
    expect((await decide(TRIANGLE, 'AB = 3:2')).kind).not.toBe('commit');
  });
});
