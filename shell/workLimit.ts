/**
 * #2893 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) phase 4, invariant 3) — THE WORK LIMIT: a search
 * is bounded in WORK, never in seconds, so the suite and the browser run the same control flow and the same input
 * gives the same outcome on every machine.
 *
 * A limit is counted by default in the work meter's own unit (`shell/workMeter`: one executed unit of the builder's
 * innermost solving function), so it needs no counter of its own: {@link withWorkLimit} reads the meter's total when a
 * search starts, and the search's loop asks {@link limitReached} where it would have read a clock. A builder whose
 * solver already keeps a warmth-independent count (one that charges a memo hit as the work it saved, so a warm cache
 * and a cold one stop at the same place) passes that counter instead. Reaching the limit is the search's third
 * outcome, "not decided" (`shell/notDecided`): never a verdict.
 *
 * Limits nest: an inner search's limit is its own, and the outer one is reached too once its own units are spent.
 * Nothing here knows a builder or a search: the caller names the limit (a constant, calibrated and documented where
 * it is defined).
 */
import { readWork } from './workMeter';

/** A monotone count of work done. */
export type WorkCounter = () => number;

const meterTotal: WorkCounter = () => readWork().total;

interface Frame {
  /** The counter's reading when the limit was opened. */
  start: number;
  units: number;
  read: WorkCounter;
}
const frames: Frame[] = [];

/**
 * Run `fn` under a limit of `units` units of work, counted by `read` (the work meter's total by default). Returns what
 * `fn` returned, whether the limit was reached, and the units spent.
 */
export function withWorkLimit<T>(units: number, fn: () => T, read: WorkCounter = meterTotal): { value: T; reached: boolean; spent: number } {
  const frame: Frame = { start: read(), units, read };
  frames.push(frame);
  try {
    const value = fn();
    const spent = read() - frame.start;
    return { value, reached: spent >= units, spent };
  } finally {
    frames.splice(frames.lastIndexOf(frame), 1);
  }
}

/** Has any open limit been reached? The check a search's loop makes. False when no limit is open. */
export function limitReached(): boolean {
  for (const f of frames) if (f.read() - f.start >= f.units) return true;
  return false;
}

/** The units left under the tightest open limit (Infinity when none is open). */
export function unitsLeft(): number {
  let left = Number.POSITIVE_INFINITY;
  for (const f of frames) left = Math.min(left, f.units - (f.read() - f.start));
  return left;
}
