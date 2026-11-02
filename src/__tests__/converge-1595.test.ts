/**
 * #1595 (ADR-W-176) — 2-D's «two letters on one dot» notice is the suite key every builder reads.
 *
 * 2-D is the reference (ADR-W-118 B1): it has accepted a coincidence its givens force, with the ADR-123 notice, since
 * 2026-06-25. This lock holds that hoisting the sentence into `shell/` changed nothing a student sees here: the two
 * rows the 2026-10-07 plan update measured still commit with the same sentence, and the shared assertions
 * (`shell/__tests__/fixtures/converge-1595.ts`) hold for this tree's i18n and App.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ ok: false, reason: 'test: no live calls' })) }));

import i18n from '../i18n';
import { decideDeterministic2D } from '../app/decideDeterministic';
import { commitVerdict } from '../app/submitPipeline';
import { replay, useGeoStore } from '../store/geoStore';
import { visibleCoincidences } from '../render/pointDescriptions';
import { convergeText } from '../../shell/converge';
import { lockConverge, RULED_CONVERGE } from '../../shell/__tests__/fixtures/converge-1595';

const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** Type each line as the App does; every verdict kind, and the notice the App would show for the drawn figure. */
async function play(lines: string[]): Promise<{ kinds: string[]; notice: string }> {
  st().clear();
  const kinds: string[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never,
      line,
      'he',
    )) as never as { kind: string };
    kinds.push(v.kind);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  const fig = replay(st().facts, st().seed);
  const t = (k: string, o: Record<string, string>) => plain(i18n.getFixedT('he')(k, o) as string);
  return { kinds, notice: convergeText(visibleCoincidences(fig.coincidences), t) };
}

describe('#1595 — 2-D, unchanged: a forced coincidence commits with the notice', () => {
  it('«משולש ABC · AB=4 · נקודה D על AB · AD=4» — D on B', async () => {
    const r = await play(['משולש ABC', 'AB=4', 'נקודה D על AB', 'AD=4']);
    expect(r.kinds.includes('refuse')).toBe(false);
    expect(replay(st().facts, st().seed).lastError).toBeFalsy();
    expect(r.notice).toBe('B ו-D נפלו על אותה נקודה.');
  });
  it('«משולש ABC · M אמצע AB · N אמצע AB» — M = N', async () => {
    const r = await play(['משולש ABC', 'M אמצע AB', 'N אמצע AB']);
    expect(r.kinds.includes('refuse')).toBe(false);
    expect(replay(st().facts, st().seed).lastError).toBeFalsy();
    expect(r.notice).toBe('M ו-N נפלו על אותה נקודה.');
  });
  it('control: a point that is not forced onto another shows nothing', async () => {
    const r = await play(['משולש ABC', 'נקודה D על AB']);
    expect(r.notice).toBe('');
  });
});

lockConverge(
  '2d',
  (lng) => i18n.getFixedT(lng)(RULED_CONVERGE.key, { a: 'A', b: 'B' }) as string,
  readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'),
);
