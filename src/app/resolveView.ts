/**
 * #572/#573 ([ADR-446](../../docs/06-decisions.md#adr-446)) — the config-search + honest-note flow,
 * bound to the EVENT it guards: *a requirements-failing figure is about to display*.
 *
 * Until this module, only the SUBMIT path asked (`resolveAfterCommit`, an App closure) — the
 * FILE-LOAD path replayed the stored facts and displayed the result unchecked, so the operator's
 * saved collapse figure (`6-geo.json`, the #566 play file) re-drew C-on-A on every load with no
 * search and no note (#572). And while the search ran, the failing view itself was painted for the
 * whole ~5 s (#573) — the student watched a degenerate figure until the rescue landed.
 *
 * Extracted from the App closure per the S0.4 testability precedent: the flow takes injected deps,
 * so the load rescue and the pending/keep-prior state machine are unit-tested directly against the
 * real search (`resolve-view.test.ts`), not through a rendered App. (There is no session-restore
 * path — the store resets on refresh — so post-commit + file-load are the event's only reach-points.)
 */
import type { Fact } from '@/store/geoStore';
import type { FoldNode } from '@/replay/core';

export interface ViewResolveFound {
  facts: Fact[];
  seed: number;
  /** The worker's fold, transplanted by the caller (`primeFoldFor`) so main replays at tail speed. */
  fold: FoldNode | null;
}

export interface ResolveViewDeps {
  getState(): { facts: Fact[]; seed: number };
  meetsRequirements(facts: Fact[], seed: number): boolean;
  /** The worker search: 'ok' = already fine (worker-side check), found = a validated composite view. */
  autoResolve(facts: Fact[], seed: number): Promise<'ok' | ViewResolveFound | null>;
  /** Apply the found composite as part of the SAME user action (temporal paused at the caller). */
  applyView(found: ViewResolveFound): void;
  /** #573: while true the App keeps rendering the last GOOD view (the ADR-293 keep-prior slot) —
   *  the freshly-derived failing view must not paint under the student's eyes for the search's
   *  duration. Always reset in finally: a stuck flag would freeze the canvas on a stale figure. */
  setPending(on: boolean): void;
  /** The search exhausted with the view still failing — surface `figure.noValidConfig` (ADR-445);
   *  the figure stays (keep-prior forever would hide the student's own committed given). */
  onExhausted(): void;
  isCancelled(err: unknown): boolean;
}

/** Run the resolve flow if (and only if) the current view fails its requirements. */
export async function runViewResolve(deps: ResolveViewDeps): Promise<void> {
  const st = deps.getState();
  // A clean (or under-determined PENDING) figure pays nothing — same fast path as before.
  if (deps.meetsRequirements(st.facts, st.seed)) return;
  deps.setPending(true);
  try {
    const r = await deps.autoResolve(st.facts, st.seed);
    if (r && r !== 'ok') deps.applyView(r);
    else if (r === null) deps.onExhausted();
  } catch (err) {
    if (!deps.isCancelled(err)) throw err;
  } finally {
    deps.setPending(false);
  }
}
