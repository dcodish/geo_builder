/**
 * #1990 (ADR-W-152) — complex already said 2-D's sentence (#2268, ADR-CX-084) from its own copy; it reads the suite
 * key now, so the four builders cannot drift apart. The shared assertions: `shell/__tests__/fixtures/already-drawn-1990.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { complexI18n } from '../i18n';
import { decideSubmitCx } from '../app/submit';
import { lockAlreadyDrawn, RULED_ALREADY_DRAWN } from '../../shell/__tests__/fixtures/already-drawn-1990';

describe("#1990 — complex's restatement verdict", () => {
  it('«z1 = 15cis(π/7)» · «|z1| = 15» is known (the note the App words with the suite key)', () => {
    expect(decideSubmitCx({ lines: ['z1 = 15cis(π/7)'], disabled: [], seed: 0 }, '|z1| = 15').kind).toBe('known');
  });
});

lockAlreadyDrawn(
  'complex',
  (lng) => complexI18n.getFixedT(lng)(RULED_ALREADY_DRAWN.key) as string,
  readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'),
);
