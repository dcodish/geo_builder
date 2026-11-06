/**
 * #1848 ([ADR-794](../../../docs/06-decisions.md#adr-794)) — 2-D's thin lock on the shared ink rows: a stated ratio between
 * two lengths draws both segments, as an equality always did. Measured at pickup (origin/main c0029d25): «AC = BD» drew
 * both; «AC = 2BD», «|AC| = 2|BD|», «AC:BD = 2:1», «AC/BD = 2» and «AC פי 2 מ-BD» drew neither. Each lock drives the real
 * submit gate and reads the replayed figure.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { STATED_LENGTH_RELATION_INK, inkKey } from '../../../shell/__tests__/fixtures/stated-length-relation-ink';

const RING_SIDES = new Set(['AB', 'BC', 'CD', 'AD']);

function play(lines: readonly string[]) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate([...lines]);
  const d = replay(facts, useGeoStore.getState().seed);
  const drawn = [...new Set(d.construction.objects.flatMap((o) => (o.kind === 'segment' ? [inkKey(o.a, o.b)] : [])))].filter((k) => !RING_SIDES.has(k)).sort();
  return { refused: refused.map((r) => r.utterance), ok: Object.values(d.status).every((s) => s === 'ok'), drawn, d };
}

describe('#1848 — a stated relation between two lengths draws both segments (2-D)', () => {
  it.each(STATED_LENGTH_RELATION_INK.map((r) => [r.steps.join(' · '), r] as const))('%s', (_name, row) => {
    expect(play(row.steps)).toMatchObject({ refused: [], ok: true, drawn: row.drawn });
  });

  it.each([
    'AB = 2CD',
    '|AB| = 2|CD|',
    'AB:CD = 2:1',
    'AB/CD = 2',
    'AB פי 2 מ-CD',
    'AB גדול פי 2 מ-CD',
    'CD קטן פי 2 מ-AB',
  ])('the spelling «%s» holds its ratio and draws both', (line) => {
    const { ok, d } = play([line]); // on a blank page: the line introduces every point
    expect(ok).toBe(true);
    const keys = d.construction.objects.flatMap((o) => (o.kind === 'segment' ? [inkKey(o.a, o.b)] : []));
    expect(keys).toEqual(expect.arrayContaining(['AB', 'CD']));
    const p = (id: string) => d.positions.get(id)!;
    const len = (a: string, b: string) => Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);
    expect(len('A', 'B') / len('C', 'D')).toBeCloseTo(2, 6);
  });

  it('a point on a side: the sub-segments are drawn, the side stays, and the point holds the ratio in either entry order', () => {
    for (const lines of [['משולש ABC', 'D על AB', 'AD:DB = 1:2'], ['משולש ABC', 'AD:DB = 1:2']]) {
      const { ok, d } = play(lines);
      expect(ok).toBe(true);
      const keys = d.construction.objects.flatMap((o) => (o.kind === 'segment' ? [inkKey(o.a, o.b)] : []));
      expect(keys).toEqual(expect.arrayContaining(['AD', 'BD']));
    }
  });

  it('a ratio the tool derived draws nothing: a shared letter is a symbolic measure (FR-IN-7)', () => {
    expect(play(['מרובע ABCD', 'AC = 2x', 'BD = 3x']).drawn).toEqual([]);
  });

  it('a ratio that cannot hold stays red, and the line is still one command', () => {
    const { ok } = play(['משולש ABC', 'D אמצע AB', 'AD:DB = 1:2']);
    expect(ok).toBe(false);
  });

  it('a relation draws segments and no mark at rest (ADR-W-118 B2): the same objects as the equality, nothing else', () => {
    const kinds = (lines: string[]) =>
      play(lines).d.construction.objects.map((o) => o.kind).sort();
    expect(kinds(['מרובע ABCD', 'AC = 2BD'])).toEqual(kinds(['מרובע ABCD', 'AC = BD']));
  });
});
