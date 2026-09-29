/**
 * #1446 Arm A (ADR-3D-288) — every empty-state chip builds on the empty canvas it is shown on.
 *
 * The chips render only while `facts.length === 0` (docs/28 D9b: "click and see build without data
 * entry"). ex3 «M אמצע BB'» and ex4 «K על AA' כך ש-AK = 2KA'» presumed a solid and were refused
 * `unknown-point` — from the only place they were ever offered.
 *
 * The list is read from `emptyStateChips3`, the same function App3 renders, and every verdict goes
 * through `decideSubmit3`, the real submit decision.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decideSubmit3, derive3 } from '../store/store3';
import { emptyStateChips3, EMPTY_STATE_CHIP_KEYS } from '../emptyChips3';
import i18n3 from '../i18n';

afterAll(async () => {
  await i18n3.changeLanguage('he');
});

describe('#1446 — every empty-state chip builds on an empty canvas', () => {
  for (const lng of ['he', 'en'] as const) {
    it(`${lng}: each chip records through decideSubmit3 and draws something`, async () => {
      await i18n3.changeLanguage(lng);
      const chips = emptyStateChips3(i18n3.t);
      expect(chips).toHaveLength(EMPTY_STATE_CHIP_KEYS.length);
      for (const c of chips) {
        expect(c, 'a chip resolves to a real string, not its key').not.toMatch(/^examples\./);
        const v = decideSubmit3({ facts: [], seed: 0 }, c);
        expect(v.kind, `«${c}» on an empty canvas: ${JSON.stringify(v)}`).toBe('record');
        if (v.kind !== 'record') continue;
        // a figure STARTS — the chip puts points, a plane or a line on the canvas
        const r = derive3(v.facts, v.seed).resolved;
        expect(r.positions.size + r.planes.size + r.lines.size, `«${c}» draws something`).toBeGreaterThan(0);
      }
    });
  }

  it('the chips are distinct (four different starting points, not one repeated)', async () => {
    await i18n3.changeLanguage('he');
    const chips = emptyStateChips3(i18n3.t);
    expect(new Set(chips).size).toBe(chips.length);
  });

  it('App3 renders its empty-state chips from emptyStateChips3 (the list this file locks)', () => {
    const app = readFileSync(path.join(__dirname, '..', 'App3.tsx'), 'utf8');
    expect(app).toContain('commands={emptyStateChips3(t)}');
  });
});
