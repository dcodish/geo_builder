/**
 * #2890 ([ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); ADR-W-210 phase 3) — THE ANALYTIC PAGE'S WORKER
 * CLIENT, ITS WORKER ENTRY, AND THE FIGURE THE PAGE SHOWS.
 *
 * 1. The worker entry (`app/analyticWorker.ts`) serves `opsAn` on its global scope: a decision and a figure answered,
 *    the figure as a part before the values, the page's checkpoint adopted.
 * 2. The page's client (`app/workerAn.ts`), served in process here (node has no `Worker`): a decision's verdict comes
 *    back with what it solved adopted, so the page reads it for no work of its own; a figure is held at stage `figure`
 *    and then `values`; a question is answered only once the values are; a second request for the same figure is the
 *    same request; a figure whose line list the page no longer holds is not "held".
 * 3. `useShownFigure` draws the store's own figure where no worker serves, at stage `figure` first.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clearAnalyticCaches, derive } from '../engine/derive';
import { activePins } from '../app/active';
import { readWork } from '../../shell/workMeter';
import { configurationPool } from '../engine/evaluate';
import { decideAn, figureStage, forgetFiguresAn, isAnswered, owesValues, showFigure, workerServes } from '../app/workerAn';
import { basisOfState, useShownFigure } from '../app/useShownFigure';
import type { BasisAn } from '../app/opsAn';
import type { FromWorker, ToWorker } from '../../shell/workerProtocol';

const LINES = ['משולש ABC', 'AB = 5', 'AC = 6', 'D על BC', 'AD = 4'];
const basis = (lines: string[]): BasisAn => ({ lines, disabled: [], seed: 0, seedNames: {}, hosts: {} });
const NO_INPUTS = { asks: [], annotations: {} };
/** Page-lane solver work spent by `fn`. */
async function pageUnits(fn: () => unknown): Promise<number> {
  const before = readWork().page;
  await fn();
  return readWork().page - before;
}

afterEach(() => {
  clearAnalyticCaches();
  forgetFiguresAn();
});

describe('#2890 — the worker entry serves the operations', () => {
  it('answers a decision, and a figure as a part before its values', async () => {
    const posted: FromWorker[] = [];
    const scope: { postMessage(m: FromWorker): void; onmessage: ((e: { data: ToWorker }) => void) | null } = { postMessage: (m) => posted.push(structuredClone(m)), onmessage: null };
    (globalThis as { self?: unknown }).self = scope;
    try {
      await import('../app/analyticWorker'); // load-in-body-ok: the worker entry serves the global scope it finds, set just above
    } finally {
      delete (globalThis as { self?: unknown }).self;
    }
    expect(posted[0]).toEqual({ t: 'ready' });
    scope.onmessage!({ data: { t: 'run', id: 1, op: 'submit', args: { raw: 'AB = 5', basis: basis(['משולש ABC']) } } });
    const decided = posted.find((m) => m.t === 'done' && m.id === 1) as Extract<FromWorker, { t: 'done' }>;
    expect((decided.value as { value: { kind: string } }).value.kind).toBe('record');
    scope.onmessage!({ data: { t: 'run', id: 2, op: 'show', args: { basis: basis(LINES), inputs: NO_INPUTS } } });
    const two = posted.filter((m) => 'id' in m && m.id === 2).map((m) => m.t);
    expect(two).toEqual(['part', 'done']);
    expect((posted.find((m) => m.t === 'done' && m.id === 2) as Extract<FromWorker, { t: 'done' }>).value).toMatchObject({ complete: true });
  });
});

describe('#2890 — the page client: decisions and figures from the worker, adopted', () => {
  it('serves in process where there is no Worker', () => {
    expect(workerServes()).toBe(false);
  });

  it('a decision answers its verdict, and the page then reads the figure it decided on for nothing', async () => {
    const v = await decideAn('submit', { raw: 'AD = 4', basis: basis(LINES.slice(0, 4)) });
    expect(v.kind).toBe('record');
    expect(await pageUnits(() => derive(LINES.slice(0, 4), 0, {}, activePins({}, 4, [])))).toBe(0);
  });

  it('a figure is held first, then its values; the page reads both for nothing', async () => {
    const b = basis(LINES);
    expect(figureStage(b)).toBeNull();
    const asked = showFigure({ basis: b, inputs: NO_INPUTS });
    expect(showFigure({ basis: b, inputs: NO_INPUTS })).toBe(asked);
    await asked.figure;
    expect(figureStage(b)).not.toBeNull();
    await asked.values;
    expect(figureStage(b)).toBe('values');
    expect(owesValues({ basis: b, inputs: NO_INPUTS })).toBe(false);
    expect(
      await pageUnits(() => {
        const d = derive(LINES, 0);
        configurationPool(d.construction).fill();
      }),
    ).toBe(0);
  });

  it('a question is answered only with the values that hold it', async () => {
    const b = basis(LINES);
    const q = { sentence: 'AD' };
    await showFigure({ basis: b, inputs: NO_INPUTS }).values;
    expect(isAnswered(b, q)).toBe(false);
    expect(owesValues({ basis: b, inputs: { asks: [q], annotations: {} } })).toBe(true);
    await showFigure({ basis: b, inputs: { asks: [q], annotations: {} } }).values;
    expect(isAnswered(b, q)).toBe(true);
  });

  it('a figure whose line list the page no longer holds is not held', async () => {
    const b = basis(LINES);
    await showFigure({ basis: b, inputs: NO_INPUTS }).values;
    clearAnalyticCaches();
    expect(figureStage(b)).toBeNull();
  });

  it('the empty figure is held from the start', () => {
    expect(figureStage(basis([]))).toBe('values');
  });
});

describe('#2890 — useShownFigure', () => {
  it('where no worker serves, the store\'s own figure is drawn in the render, at stage figure first', () => {
    const state = { ...basis(LINES), other: 1 };
    let seen: { state: unknown; stage: string } | null = null;
    const Probe = () => {
      seen = useShownFigure(state, NO_INPUTS);
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    expect(seen!.state).toBe(state);
    expect(seen!.stage).toBe('figure');
    expect(figureStage(basisOfState(state))).toBe('figure');
  });
});
