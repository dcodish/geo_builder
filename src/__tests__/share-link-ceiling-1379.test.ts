/**
 * #1379 — the issue's own attack, end to end in 2-D: a 96-fact link a stranger hand-builds.
 *
 * Measured in the issue: the `defining-interaction` figure copied with distinct ids replays in 8 ms at
 * 6 facts and 5,383 ms at 96, and the 96-fact link is only ~1,360 characters — an ordinary-looking URL,
 * under every character ceiling. So the character and byte bounds cannot catch it; only the STATEMENT
 * ceiling (`shell/save`) can, and it must do so before a single fact replays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/defining-interaction.geo.json';
import { encodeFigurePayload, readFigurePayload } from '../../shell/session/link';
import { openSharedFigure } from '@/store/shareLink';
import { useGeoStore } from '@/store/geoStore';

type RawFact = { utterance?: string; group?: string; cmd: Record<string, unknown>; enabled?: boolean };

/** `copies` copies of the fixture, every point id suffixed per copy — distinct, CONSTRAINED facts. */
function attackEnvelope(copies: number): string {
  const facts: RawFact[] = [];
  for (let k = 0; k < copies; k++) {
    for (const f of fixture.facts as RawFact[]) {
      const cmd = JSON.parse(JSON.stringify(f.cmd).replace(/"([A-Z])"/g, (_, p: string) => `"${p}${k}"`));
      facts.push({ utterance: f.utterance, cmd, enabled: true });
    }
  }
  return JSON.stringify({ app: 'geo-builder', schemaVersion: fixture.schemaVersion, seed: 0, facts });
}

beforeEach(() => useGeoStore.getState().clear());
afterEach(() => useGeoStore.getState().clear());

describe('#1379 — the 96-fact link is refused as too large, and never replays', () => {
  it('builds the issue\'s link: 96 constrained facts in an ordinary-length URL that DECODES fine', () => {
    const env = attackEnvelope(16);
    expect(JSON.parse(env).facts).toHaveLength(96);
    const fragment = encodeFigurePayload(env);
    expect(fragment.length, 'short enough to pass every character and byte ceiling').toBeLessThan(2000);
    expect(readFigurePayload(fragment).ok).toBe(true);
  });

  it('opening it refuses with `too-large`, the fold is never started, and the canvas is untouched', async () => {
    const before = useGeoStore.getState().facts;
    const prefold = vi.fn(async () => undefined);
    const t0 = performance.now();
    const out = await openSharedFigure(attackEnvelope(16), { prefold });
    const ms = performance.now() - t0;

    expect(out).toEqual({ ok: false, reason: 'too-large' });
    expect(prefold, 'the worker fold would have been the 5.4 s').not.toHaveBeenCalled();
    expect(ms, 'refused before replay, not after it').toBeLessThan(100);
    expect(useGeoStore.getState().facts).toBe(before);
  });
});
