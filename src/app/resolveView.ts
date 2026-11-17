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
import type { Seed } from '@/engine';
import type { Fact } from '@/store/geoStore';
import type { FoldNode, SearchResume } from '@/replay/core';
import { isNotDecided, type NotDecided } from '../../shell/notDecided';
import { isStaleBasis, type ViewBasis } from '@/store/geoWork';

export interface ViewResolveFound {
  facts: Fact[];
  seed: Seed;
  /** The worker's fold, transplanted by the caller (`primeFoldFor`) so main replays at tail speed. */
  fold: FoldNode | null;
  /** #2757 (ADR-812): the `(facts, seed)` the search ran on — `applyView` refuses it once stale. */
  basis: ViewBasis;
}

export interface ResolveViewDeps {
  getState(): { facts: Fact[]; seed: Seed };
  meetsRequirements(facts: Fact[], seed: Seed): boolean;
  /** The worker search: 'ok' = already fine (worker-side check), found = a validated composite view. #2893 (ADR-831):
   *  "not decided" = it reached its work limit before it decided; `round` is the round to run (0 first). */
  autoResolve(facts: Fact[], seed: Seed, round: number): Promise<'ok' | ViewResolveFound | null | NotDecided<SearchResume>>;
  /** Apply the found composite as part of the SAME user action (temporal paused at the caller). */
  applyView(found: ViewResolveFound): void;
  /** #573: while true the App keeps rendering the last GOOD view (the ADR-293 keep-prior slot) —
   *  the freshly-derived failing view must not paint under the student's eyes for the search's
   *  duration. Always reset in finally: a stuck flag would freeze the canvas on a stale figure. */
  setPending(on: boolean): void;
  /** The search exhausted with the view still failing — surface `figure.noValidConfig` (ADR-445);
   *  the figure stays (keep-prior forever would hide the student's own committed given). */
  onExhausted(): void;
  /**
   * #2893 (ADR-831): the search reached its work limit before it decided. Not "exhausted": the page shows the operator's
   * sentence with «המשיכו לחפש», which runs {@link runViewResolve} again with `round` (the figure stays, as on exhaustion).
   */
  onNotDecided?(round: number, basis: { facts: Fact[]; seed: Seed }): void;
  isCancelled(err: unknown): boolean;
}

/** Run the resolve flow if (and only if) the current view fails its requirements. */
export async function runViewResolve(deps: ResolveViewDeps, round = 0): Promise<void> {
  const st = deps.getState();
  // A clean (or under-determined PENDING) figure pays nothing — same fast path as before.
  if (deps.meetsRequirements(st.facts, st.seed)) return;
  deps.setPending(true);
  try {
    const r = await deps.autoResolve(st.facts, st.seed, round);
    // #2757 (ADR-812): the search answered for the figure as it was when it STARTED. If the student
    // undid, redid, cleared or edited meanwhile, its answer, found or exhausted, is about a figure no
    // longer on screen: apply nothing and say nothing (the store's `applyView` refuses it as well).
    if (isStaleBasis(st, deps.getState())) return;
    if (isNotDecided(r)) deps.onNotDecided?.(r.resume.round, st);
    else if (r && r !== 'ok') deps.applyView(r);
    else if (r === null) deps.onExhausted();
  } catch (err) {
    if (!deps.isCancelled(err)) throw err;
  } finally {
    deps.setPending(false);
  }
}
