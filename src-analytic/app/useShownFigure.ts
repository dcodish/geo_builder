/**
 * THE FIGURE THE PAGE SHOWS IS ONE IT HOLDS (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478)).
 *
 * The store's basis (lines, muted rows, configuration, seed names, hosts) changes the moment an action commits; the
 * figure of that basis is solved in the worker. So the page renders the LAST store state whose figure it holds, and
 * switches to the store's own state as soon as that figure is adopted: the row list, the canvas and the panel change
 * together, as they always did, and nothing on the page derives what it does not hold. A figure already held (an
 * undo, a redo, a delete back to rows typed before) switches in the same render.
 *
 * Where no worker serves (node, the suites, an old browser) the figure stage is solved in the render's own task
 * (`figureNow`), so the store's state is always the one shown; its values still follow, as from a worker.
 *
 * The stage says what the render may read: `figure` (the pool held: every value pending, «בודק…» after 0.3 s) or
 * `values` (the pool complete: every value final).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { adoptedVersion, figureNow, figureStage, owesValues, showFigure, subscribeAn, workerServes, type FigureRequest } from './workerAn';
import type { BasisAn } from './opsAn';
import type { ReaderInputs } from './figureReaders';

/** The store fields that name a figure. */
export const basisOfState = (s: BasisAn): BasisAn => ({ lines: s.lines, disabled: s.disabled, seed: s.seed, seedNames: s.seedNames, hosts: s.hosts });

export interface ShownFigure<S extends BasisAn> {
  /** The store state the page renders: the store's own, or the last one whose figure the page held. */
  state: S;
  stage: 'figure' | 'values';
  /** Grows with every adoption: a memo keyed on it reads what was adopted. */
  version: number;
}

export function useShownFigure<S extends BasisAn>(state: S, inputs: ReaderInputs): ShownFigure<S> {
  const version = useSyncExternalStore(subscribeAn, adoptedVersion, adoptedVersion);
  const request: FigureRequest = { basis: basisOfState(state), inputs };
  if (!workerServes()) figureNow(request);
  const ready = figureStage(request.basis) !== null;
  const [held, setHeld] = useState<S>(state);
  const shown = ready ? state : held;
  useEffect(() => {
    if (ready && held !== state) setHeld(state);
  });
  // ask for the store's figure, and for its values and answers, until the page holds them
  const owes = owesValues(request);
  const key = JSON.stringify([request.basis, inputs.asks]);
  useEffect(() => {
    if (owes) void showFigure(request);
    // `request` is rebuilt every render; `key` is its content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, owes, version]);
  const stage = figureStage(basisOfState(shown)) === 'values' ? 'values' : 'figure';
  return { state: shown, stage, version };
}
