/**
 * #2894 part 2 F ([ADR-AG-484](../../docs/06c-decisions-analytic.md#adr-ag-484)) — THE POOL STOPS WHEN EVERY READER HAS
 * DECIDED. The worker's `show` stops filling the 24-configuration pool once every reader of the page, run on the held
 * pool, answers nothing pending; the page reads the values on the same configurations, held. The locks: such a figure
 * stops early, its panel reads exactly what the full pool reads, and a figure with a value still to confirm fills.
 *
 * pipeline-lock: the check compares the page's reading after the worker's `show` with the full pool's reading of the
 * same figure; a fixture or a corpus scenario sees only one of the two.
 */
import { describe, expect, it } from 'vitest';
import { clearAnalyticCaches, derive } from '../engine/derive';
import { configurationPool, drawableAt, POOL_SIZE } from '../engine/evaluate';
import { opsAn, type Shown } from '../app/opsAn';
import { panelKnowledge, segmentKnowledge } from '../app/panelRows';

const ctx = { part: () => {}, tick: async () => false } as never;
const basisOf = (lines: string[]) => ({ lines, disabled: [], seed: 0, seedNames: {}, hosts: {} });
const readPanel = (lines: string[], partial: Shown['partial']) => {
  const d = derive(lines, 0);
  if (partial) {
    for (const s of partial.seeds) drawableAt(d.construction, s);
    configurationPool(d.construction).hold();
  } else configurationPool(d.construction).fill();
  return JSON.stringify([panelKnowledge(d), segmentKnowledge(d)]);
};

describe('#2894 F — the values pool stops once every reader has decided', () => {
  it('a figure whose every value is open stops early, and the page reads what the full pool reads', () => {
    const lines = ['נקודה A', 'נקודה B', 'קטע AB'];
    clearAnalyticCaches();
    const shown = opsAn.show({ basis: basisOf(lines), inputs: { asks: [], annotations: {} } }, ctx) as Shown;
    expect(shown.complete).toBe(true);
    expect(shown.partial?.seeds.length).toBeLessThan(POOL_SIZE);
    const early = readPanel(lines, shown.partial);
    expect(early).not.toContain('"pending":true');
    clearAnalyticCaches();
    expect(readPanel(lines, undefined)).toBe(early);
  });

  it('a figure with a value to confirm (a stated point) fills the whole pool', () => {
    clearAnalyticCaches();
    const shown = opsAn.show({ basis: basisOf(['A(1,2)', 'נקודה B', 'קטע AB']), inputs: { asks: [], annotations: {} } }, ctx) as Shown;
    expect(shown.complete).toBe(true);
    expect(shown.partial).toBeUndefined();
  });
});
