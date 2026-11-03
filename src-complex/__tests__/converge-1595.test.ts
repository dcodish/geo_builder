/**
 * #1595 (ADR-CX-086, ADR-W-176) — two named numbers on one dot are accepted, and the page always says so, in 2-D's
 * sentence «{{a}} ו-{{b}} נפלו על אותה נקודה.» (the suite key `suite.notice.converge`).
 *
 * Operator, 2026-09-30: *"when 2 dots are on top of each other we should accept but always give a message about it.
 * this is correct for all tools"*. Here the dots are the named numbers' plotted positions (the plan's step 5).
 *
 * Each line goes through `decideSubmitCx` (the App's door) and the notice is read from `deriveLines(active, seed,
 * seed)`, the derivation the App renders, by the App's own `coincidencesCx`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { complexI18n } from '../i18n';
import { decideSubmitCx } from '../app/submit';
import { deriveLines } from '../app/deriveLines';
import { coincidencesCx } from '../app/coincidences';
import { convergeText } from '../../shell/converge';
import { lockConverge, RULED_CONVERGE } from '../../shell/__tests__/fixtures/converge-1595';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o: Record<string, string>) => plain(complexI18n.getFixedT('he')(k, o) as string);

function play(lines: readonly string[]): { recorded: string[]; seed: number } {
  const recorded: string[] = [];
  let seed = 0;
  for (const line of lines) {
    const v = decideSubmitCx({ lines: recorded, disabled: [], seed }, line);
    expect(v.kind, line).toBe('record');
    if (v.kind !== 'record') break;
    recorded.push(v.line);
    seed = v.seed;
  }
  return { recorded, seed };
}
const pairs = (lines: readonly string[]) => {
  const { recorded, seed } = play(lines);
  return coincidencesCx(deriveLines(recorded, seed, seed));
};

describe('#1595 — complex: two named numbers on one dot record, with the notice', () => {
  it.each([[['z1 = 2+3i', 'z2 = 2+3i']], [['z1 = 2+3i', 'z2 = z1']], [['z1 = 2+3i', 'w = z1']]])('%j', (lines) => {
    const p = pairs(lines);
    expect(p).toHaveLength(1);
    expect(convergeText(p, he)).toMatch(/^.+ ו-.+ נפלו על אותה נקודה\.$/);
  });
  it('names them as the canvas does', () => {
    expect(convergeText(pairs(['z1 = 2+3i', 'z2 = 2+3i']), he)).toBe('z₁ ו-z₂ נפלו על אותה נקודה.');
  });
  it('controls: two different numbers, a letter bound to a number (one dot, one dual label), free numbers', () => {
    expect(pairs(['z1 = 2+3i', 'z2 = 2+3.001i'])).toEqual([]);
    expect(pairs(['z1 = 2+3i', 'A = z1'])).toEqual([]);
    expect(pairs(['z1 ממשי', 'z2 ממשי'])).toEqual([]);
  });
});

lockConverge(
  'complex',
  (lng) => complexI18n.getFixedT(lng)(RULED_CONVERGE.key, { a: 'A', b: 'B' }) as string,
  readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'),
);
