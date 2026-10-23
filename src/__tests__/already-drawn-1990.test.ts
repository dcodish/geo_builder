/**
 * #1990 (ADR-W-152) — 2-D's already-there note is the suite key every builder reads. 2-D is the reference the ruling
 * names, so this lock holds that the key moved without changing what 2-D says: a restated line and a restatement in
 * another spelling both answer it. The assertions are shared: `shell/__tests__/fixtures/already-drawn-1990.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ ok: false, reason: 'test: no live calls' })) }));

import i18n from '../i18n';
import { decideDeterministic2D } from '../app/decideDeterministic';
import { commitVerdict } from '../app/submitPipeline';
import { replay, useGeoStore } from '../store/geoStore';
import { lockAlreadyDrawn, RULED_ALREADY_DRAWN } from '../../shell/__tests__/fixtures/already-drawn-1990';

const st = () => useGeoStore.getState();

/** Type each line as the App does; the note key of the LAST line. */
async function lastNote(lines: string[]): Promise<string | undefined> {
  st().clear();
  let note: { key?: string } | undefined;
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never,
      line,
      'he',
    )) as never as { kind: string; note?: { key?: string } | null };
    note = v.note ?? undefined;
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return note?.key;
}

describe('#1990 — 2-D answers its no-ops with the suite key', () => {
  it('a restated line («ריבוע ABCD» · «ריבוע ABCD»)', async () => {
    expect(await lastNote(['ריבוע ABCD', 'ריבוע ABCD'])).toBe(RULED_ALREADY_DRAWN.key);
  });
  it('a restatement in another spelling («∠ABC = 90» · «AB ⟂ BC», FR-EN-9)', async () => {
    expect(await lastNote(['משולש ABC', '∠ABC = 90', 'AB ⟂ BC'])).toBe(RULED_ALREADY_DRAWN.key);
  });
});

// 2-D's note is a KEY its decision returns (above) and the submit pipeline words; it has no App branch to scan.
lockAlreadyDrawn('2d', (lng) => i18n.getFixedT(lng)(RULED_ALREADY_DRAWN.key), null);
