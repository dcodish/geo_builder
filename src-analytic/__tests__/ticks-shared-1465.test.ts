/**
 * #1465 (ADR-W-094) — analytic's grid step IS the shared rule (shell/ticks), not a copy: its exported
 * `tickStep` is the same function object, so its grid is byte-identical to before the lift by construction.
 */
import { describe, expect, it } from 'vitest';
import { tickStep } from '../render/scene';
import { tickStep as shared } from '../../shell/ticks';

describe('#1465 — analytic grids through the shared step', () => {
  it('the same function', () => {
    expect(tickStep).toBe(shared);
  });
});
