/**
 * Every example chip on the page MUST build a figure on an empty canvas — the first thing a new user
 * clicks can't be a dead end or an error (operator report: "1 doesn't and 1 breaks"). This guards both
 * locales' `examples.items` (the empty-canvas CTA shows the first 3; the sidebar shows all) by replaying
 * each through the real parse → replay path and asserting it builds cleanly.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

let n = 0;
function buildsCleanly(u: string): { ok: boolean; why: string } {
  const r = parse(u, {});
  if (!r.ok) return { ok: false, why: `parse not-handled` };
  const facts: Fact[] = r.commands.map((cmd: AnyCommand) => ({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  const fig = replay(facts);
  if (fig.lastError) return { ok: false, why: `lastError: ${fig.lastError}` };
  const allOk = Object.values(fig.status).every((s) => s === 'ok' || s === 'disabled');
  return { ok: allOk, why: allOk ? '' : 'a step did not apply' };
}

describe('every example chip builds standalone', () => {
  for (const [loc, dict] of [['he', he], ['en', en]] as const) {
    const items = (dict as { examples: { items: string[] } }).examples.items;
    it(`${loc}: all ${items.length} examples build with no error`, () => {
      for (const u of items) {
        const { ok, why } = buildsCleanly(u);
        expect(ok, `"${u}" (${loc}) → ${why}`).toBe(true);
      }
    });
  }
});
