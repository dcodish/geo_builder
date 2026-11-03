/**
 * #2654 idea 2 ([ADR-W-170](../../docs/06w-decisions-workspace.md#adr-w-170)) — the sentence × builder view
 * of the parity rows. What this locks: the view is a pure read of the rows (every (row, builder) pair is
 * exactly one cell, and its gap cells are exactly the rows' `knownGap` entries), and an unscheduled cell,
 * a known gap with no issue, shows as one. Offline.
 */
import { describe, expect, it } from 'vitest';
import * as fx from '../../shell/__tests__/fixtures/geo-input-parity';
import type { ParityRow } from '../../shell/__tests__/fixtures/geo-input-parity';
// @ts-expect-error — plain .mjs tool scripts, deliberately not part of the TS project
import { STATES, cellText, countCells, parityCells, renderCounts, renderHtml, renderMarkdown } from '../parity-table.mjs';

type Cell = { state: string; issue?: string | null; verdict?: string; exception?: string };
type TableRow = { id: string; cells: Record<string, Cell> };

describe('ADR-W-170 — the parity table is a pure read of the rows', () => {
  const table: TableRow[] = parityCells(fx);
  const counts = countCells(table, fx.PRODUCTS);

  it('every (row, builder) pair is exactly one cell, in one of the named states', () => {
    expect(table).toHaveLength(fx.PARITY_ROWS.length);
    let sum = 0;
    for (const p of fx.PRODUCTS) for (const s of STATES) sum += counts.byProduct[p][s];
    expect(sum).toBe(fx.PARITY_ROWS.length * fx.PRODUCTS.length);
    for (const r of table) for (const p of fx.PRODUCTS) expect(STATES).toContain(r.cells[p].state);
  });

  it('its gap cells are exactly the known-gap entries, in their state', () => {
    const gaps = fx.PARITY_ROWS.flatMap((r) => (r.knownGap ?? []).map((g) => ({ id: r.id, g })));
    const gapCells = table.flatMap((r) => fx.PRODUCTS.filter((p) => ['scheduled', 'unscheduled', 'parked'].includes(r.cells[p].state)).map((p) => ({ id: r.id, p, c: r.cells[p] })));
    expect(gapCells).toHaveLength(gaps.length);
    for (const { id, g } of gaps) {
      const c = table.find((r) => r.id === id)!.cells[g.product];
      expect(c.state).toBe(fx.gapState(g));
      expect(c.issue ?? undefined).toBe(g.issue);
    }
  });

  it('an unscheduled cell (a gap with no issue) is counted and rendered as one', () => {
    const rows: ParityRow[] = [
      { id: 'u1', family: 'lengths', steps: ['משולש ABC', 'AB = 6'], expect: 'builds', knownGap: [{ product: 'analytic' }] },
      { id: 's1', family: 'lengths', steps: ['משולש ABC', 'AB = 7'], expect: 'builds', knownGap: [{ product: '3d', issue: '#9' }] },
    ];
    const t: TableRow[] = parityCells(fx, rows);
    const c = countCells(t, fx.PRODUCTS);
    expect(c.total.unscheduled).toBe(1);
    expect(c.total.scheduled).toBe(1);
    expect(cellText(t[0].cells.analytic)).toBe('gap · unscheduled');
    expect(cellText(t[1].cells['3d'])).toBe('gap · scheduled #9');
    const pick = renderMarkdown(t, fx.PRODUCTS, { product: 'analytic', state: 'unscheduled' });
    expect(pick).toMatch(/\| u1 \| משולש ABC · AB = 6 \| gap · unscheduled \|/);
    expect(pick).not.toMatch(/s1/);
    expect(renderCounts(c, fx.PRODUCTS)).toMatch(/\| unscheduled \| 0 \| 1 \| 0 \| 1 \|/);
    expect(renderHtml(t, fx.PRODUCTS, c, '2026-11-02')).toMatch(/<td class="c unscheduled">gap · unscheduled<\/td>/);
  });
});
