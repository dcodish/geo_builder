/**
 * #157 ([ADR-401](docs/06-decisions.md#adr-401)) — the RATCHET that keeps heavy geometry off the UI thread.
 *
 * The bug class this locks: "a heavy sweep (any loop that replays/evaluates a figure more than once)
 * reaches the main thread because it was entered through a store action or a component." The ADR-290
 * worker seam existed, but it was wired op-by-op as each hot path got reported — so `viewRelations`,
 * `detectShapes` and `detectCrossings` were still sampling on the UI thread years after the seam landed.
 *
 * The guard is a source ratchet in the spirit of `lexical-ratchet.test.ts`: the main-thread modules may
 * hold only the call sites recorded below, and the counts may only go DOWN. Adding one means either
 * routing the work through `geoWork` (the fix) or an ADR arguing why this one belongs on the UI thread.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Functions whose cost is "many replays/evaluates" — never acceptable on the UI thread. */
const HEAVY = ['sharedSamples', 'detectAll', 'firstSatisfyingSeed', 'findValidConfig', 'searchAnotherView', 'searchResample'];

/**
 * Modules that execute on the MAIN thread. Deliberately excluded: `geoWorker.ts` (the worker itself),
 * `geoWork.ts` (the seam — its no-Worker fallback is how tests and old browsers run the same functions),
 * `replay/core.ts` (where they are defined), and `validation/` (a dev/CI-only oracle, never shipped).
 */
const MAIN_THREAD = ['src/App.tsx', 'src/store/geoStore.ts', 'src/app/submitPipeline.ts', 'src/render/scene.ts', 'src/render/Figure.tsx'];

/**
 * The recorded call sites. THIS TABLE MAY ONLY SHRINK.
 *
 * `geoStore.firstSatisfyingSeed` ×2 — the submit/edit seed auto-advance in `commitCommands` and
 * `replaceGroup`. Still synchronous, still budget-capped at `SEARCH_BUDGET_MS` (2.5 s): moving it
 * off-thread splits the one-transaction commit (facts now, seed later) and makes the pre-search
 * configuration briefly visible, which is a UX call for the operator — filed, not smuggled in here.
 *
 * `geoStore.{searchAnotherView,findValidConfig,meetsRequirements}` — the store's own `resample`/
 * `autoResolve` actions. The App does not call them (it uses `geoWork` + `applyView`); they remain as
 * the synchronous path the tests and the scenario harness drive.
 */
const BASELINE: Record<string, Record<string, number>> = {
  'src/App.tsx': {},
  'src/store/geoStore.ts': { firstSatisfyingSeed: 2, findValidConfig: 1, searchAnotherView: 1 },
  'src/app/submitPipeline.ts': {},
  'src/render/scene.ts': {},
  'src/render/Figure.tsx': {},
};

const countCalls = (src: string, fn: string): number => (src.match(new RegExp(`(?<![\\w.])${fn}\\(`, 'g')) ?? []).length;

describe('#157 — no heavy geometry sweep runs on the main thread (ADR-401 ratchet)', () => {
  for (const file of MAIN_THREAD) {
    it(`${file} holds no more heavy call sites than recorded`, () => {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const fn of HEAVY) {
        const found = countCalls(src, fn);
        const allowed = BASELINE[file][fn] ?? 0;
        expect(
          found,
          found > allowed
            ? `${file} calls ${fn}() ${found}× (recorded: ${allowed}). A heavy sweep on the UI thread freezes the tab — route it through geoWork (src/store/geoWork.ts), or add an ADR and update BASELINE.`
            : `${file}: ${fn} baseline is stale — it now calls it ${found}×, so lower BASELINE (the ratchet only goes down).`,
        ).toBe(allowed);
      }
    });
  }

  it('the detection layers have no main-thread sampler to fall back to', () => {
    const core = readFileSync(resolve(process.cwd(), 'src/replay/core.ts'), 'utf8');
    // `sharedSamplesAsync` (the batched main-thread sweep) was deleted with ADR-401 — its yield
    // granularity assumed cheap samples, so it froze the tab in multi-second chunks on a coupled figure.
    expect(core).not.toMatch(/export async function sharedSamplesAsync/);
  });
});
