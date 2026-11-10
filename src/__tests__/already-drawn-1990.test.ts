/**
 * #1990 (ADR-W-152) → #2790 ([ADR-822](../../docs/06-decisions.md#adr-822), ADR-W-200 / ADR-W-204) — 2-D's held row.
 *
 * A line the figure already holds is ACCEPTED as its own row with the one suite notice (`suite.notice.alreadyHeld`),
 * moves nothing, and keeps the relation in force once the earlier row is unticked or deleted. The table is shared:
 * `shell/__tests__/fixtures/held-row-2790.ts`. Controls: a contradiction is refused; a muted twin re-ticks with no
 * notice; a pinning value records with no notice.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ ok: false, reason: 'test: no live calls' })) }));

import i18n from '../i18n';
import { decideDeterministic2D } from '../app/decideDeterministic';
import { commitVerdict } from '../app/submitPipeline';
import { groupKey, replay, useGeoStore } from '../store/geoStore';
import { HELD_CASES_2D, HELD_NOTICE } from '../../shell/__tests__/fixtures/held-row-2790';

const st = () => useGeoStore.getState();

interface Typed {
  kind: string;
  key?: string;
}

/** Type one line as the App does (decide, then the one commit seam); the verdict kind and note key. */
async function type(line: string): Promise<Typed> {
  const d = replay(st().facts, st().seed);
  const v = (await decideDeterministic2D(
    { facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never,
    line,
    'he',
  )) as never as { kind: string; note?: { key?: string } | null };
  if (v.kind !== 'store-op') commitVerdict(v as never, line);
  return { kind: v.kind, key: v.note?.key };
}

const rows = () => new Set(st().facts.map(groupKey)).size;

function maxMove(a: Map<string, { x: number; y: number }>, b: Map<string, { x: number; y: number }>): number {
  let m = 0;
  for (const [id, p] of a) {
    const q = b.get(id);
    if (q) m = Math.max(m, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return m;
}

describe('#2790 — 2-D accepts a held line as its own row, with the notice', () => {
  for (const c of HELD_CASES_2D) {
    it(`${c.lines.join(' · ')} — ${c.why}`, async () => {
      st().clear();
      for (const line of c.lines.slice(0, -1)) await type(line);
      const before = st().facts;
      const last = await type(c.lines[c.lines.length - 1]);
      // (i) one row appended, (ii) the notice
      expect(last).toEqual({ kind: 'commit', key: HELD_NOTICE.key });
      expect(rows(), 'exactly one row appended').toBe(new Set(before.map(groupKey)).size + 1);
      const after = st().facts;
      // (iii) nothing moves, at 4 seeds; every row stays ok
      for (const seed of [0, 2, 3]) {
        const a = replay(before, seed), b = replay(after, seed);
        if (a.lastError) continue; // not a figure at this seed before the line either
        expect(maxMove(a.positions, b.positions), `seed ${seed}: no point moves`).toBeLessThan(1e-6);
        expect(b.lastError, `seed ${seed}`).toBeNull();
      }
      // (iv) unticking, then deleting, the earlier row leaves the restated row holding
      if (c.earlier !== undefined) {
        const key = groupKey(after.filter((f) => f.utterance === c.lines[c.earlier!])[0]);
        st().setGroupEnabled(key, false);
        const muted = replay(st().facts, st().seed);
        const mine = st().facts.filter((f) => f.utterance === c.lines[c.lines.length - 1] && f.enabled);
        expect(mine.length).toBeGreaterThan(0);
        for (const f of mine) expect(muted.status[f.id], 'unticked: the restated row holds').toBe('ok');
        st().removeGroup(key);
        const gone = replay(st().facts, st().seed);
        for (const f of mine) expect(gone.status[f.id], 'deleted: the restated row holds').toBe('ok');
        expect(gone.lastError).toBeNull();
      }
    });
  }

  it('control — a muted twin re-ticks with no notice and no second row', async () => {
    st().clear();
    await type('משולש ABC');
    await type('AB = AC');
    const twin = st().facts.find((f) => f.utterance === 'AB = AC')!;
    st().toggle(twin.id);
    const n = rows();
    const v = await type('AB = AC');
    expect(v.kind).toBe('commit');
    expect(v.key).not.toBe(HELD_NOTICE.key);
    expect(rows()).toBe(n);
    expect(st().facts.find((f) => f.id === twin.id)!.enabled).toBe(true);
  });

  it('control — a pinning value («AB = 3» on a free triangle) records with no notice', async () => {
    st().clear();
    await type('משולש ABC');
    const v = await type('AB = 3');
    expect(v.kind).toBe('commit');
    expect(v.key).not.toBe(HELD_NOTICE.key);
  });

  it('control — a default-pinning line («טרפז ABCD» · «AB ∥ DC») records with no notice', async () => {
    st().clear();
    await type('טרפז ABCD');
    const v = await type('AB ∥ DC');
    expect(v.kind).toBe('commit');
    expect(v.key).not.toBe(HELD_NOTICE.key);
  });

  it('control — a contradiction is refused', async () => {
    st().clear();
    await type('ריבוע ABCD');
    await type('AB = 3');
    const v = await type('AC = 5');
    expect(v.kind).toBe('refuse');
  });
});

describe('#2790 — the notice text (new text of the session, ADR-W-174)', () => {
  for (const lng of ['he', 'en'] as const) {
    it(lng, () => {
      expect(i18n.getFixedT(lng)(HELD_NOTICE.key).replace(/[⁦-⁩]/g, '')).toBe(HELD_NOTICE[lng]);
    });
  }
});
