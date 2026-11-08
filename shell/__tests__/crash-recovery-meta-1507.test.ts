/**
 * The META-lock for the crash-recovery checks (#1507, ADR-W-195; docs/28 §5c rule 5).
 *
 * The four per-tree locks all call `crashRecoveryFaults`, so a check that silently stops checking
 * turns four green tests into four that prove nothing. This runs the SAME function against a
 * miniature builder (a real zustand + zundo store, wired through the real `crashSessionOf`) and
 * against deliberately broken copies of it, and asserts each fault is caught and named.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { temporal } from 'zundo';
import type { SessionAdapter } from '../session/adapter';
import { crashSessionOf, type CrashReport, type CrashSession } from '../session/crash';
import { writeSession } from '../session/persist';
import { makeUsagePoster } from '../usageLog';
import { crashRecoveryFaults, crashMountFaults, type CrashRecoverySubject } from './fixtures/crash-recovery-rows';
import { installFakeStorage, uninstallFakeStorage } from './fixtures/fakeStorage';

interface Mini {
  lines: string[];
  seed: number;
  /** tracked by undo AND persisted */
  shown: Record<string, string>;
  /** transient — neither */
  selected: string | null;
}

type Bug = 'unstable-state' | 'no-op-rollback' | 'no-persist' | 'naive-set' | 'narrow-slice' | 'silent-log';

function miniBuilder(bug?: Bug): CrashRecoverySubject<Mini> {
  const store = create<Mini>()(
    temporal(() => ({ lines: [], seed: 0, shown: {}, selected: null }) as Mini, {
      partialize: (s) => ({ lines: s.lines, seed: s.seed, shown: s.shown }) as Mini,
      equality: (a, b) => a.lines === b.lines && a.seed === b.seed && a.shown === b.shown,
    }),
  );
  const spec = { key: 'mini:session' };
  const snapshot = () => {
    const s = store.getState();
    return s.lines.length ? JSON.stringify({ lines: s.lines, seed: s.seed, shown: s.shown }) : null;
  };
  const persist = () => {
    const p = snapshot();
    if (p) writeSession(spec, p);
  };
  const adapter: SessionAdapter = {
    spec,
    snapshot,
    restore: async (payload) => {
      try {
        const d = JSON.parse(payload) as Partial<Mini>;
        if (!Array.isArray(d.lines) || d.lines.length === 0) return false;
        store.setState({ lines: d.lines, seed: d.seed ?? 0, shown: d.shown ?? {} });
        store.temporal.getState().clear();
        return true;
      } catch {
        return false;
      }
    },
    isEmpty: () => store.getState().lines.length === 0,
    reset: () => {
      store.setState({ lines: [], seed: 0, shown: {}, selected: null });
      store.temporal.getState().clear();
    },
  };

  const real = crashSessionOf(store, { slice: bug === 'narrow-slice' ? ['lines', 'seed'] : ['lines', 'seed', 'shown'], persist: bug === 'no-persist' ? () => {} : persist });
  const session: CrashSession<Mini> = {
    ...real,
    getState: bug === 'unstable-state' ? () => ({ ...store.getState() }) : real.getState,
    rollback:
      bug === 'no-op-rollback'
        ? () => true
        : bug === 'naive-set'
          ? (to) => {
              store.setState({ lines: to.lines, seed: to.seed, shown: to.shown });
              persist();
              return true;
            }
          : real.rollback,
  };
  const post = makeUsagePoster({ tool: 'mini', url: '/api/log' });
  const onCrash = bug === 'silent-log' ? () => {} : (r: CrashReport) => post({ kind: 'crash', ...r });

  let n = 0;
  return {
    session,
    store,
    adapter,
    onCrash,
    populate: () => store.setState({ lines: ['z = 1 + i'], shown: {} }),
    step: () => store.setState((s) => ({ lines: [...s.lines, `w${++n} = 2`], shown: { [`w${n}`]: 'hidden' } })),
    construction: () => ({ lines: store.getState().lines, shown: store.getState().shown }),
  };
}

beforeEach(() => {
  installFakeStorage();
});
afterEach(uninstallFakeStorage);

describe('#1507 — the shared crash-recovery checks really check', () => {
  it('a conforming builder reports no faults', async () => {
    expect(await crashRecoveryFaults(miniBuilder())).toEqual([]);
  });

  const caught: [Bug, RegExp][] = [
    ['unstable-state', /stable reference/],
    ['no-op-rollback', /not the last one that drew/],
    ['no-persist', /offers the state that failed/],
    ['naive-set', /undo after recovery brought back the state that crashed/],
    ['narrow-slice', /without the history leaves the undo-tracked field «shown»/],
    ['silent-log', /debug log holds no crash line/],
  ];
  for (const [bug, fault] of caught) {
    it(`CATCHES a builder whose crash wiring is broken: ${bug}`, async () => {
      const faults = await crashRecoveryFaults(miniBuilder(bug));
      expect(faults.some((f) => fault.test(f)), faults.join('\n') || '(no faults reported)').toBe(true);
    });
  }
});

describe('#1507 — the mount check really checks', () => {
  const GOOD = `root.render(
  <StrictMode>
    <CrashBoundary session={crashSessionX} onCrash={logCrashX} devCrash={import.meta.env.DEV ? devCrashMode(window.location.search) : null}>
      <AppX />
    </CrashBoundary>
  </StrictMode>,
);`;
  const NAMES = { session: 'crashSessionX', log: 'logCrashX', app: 'AppX' };

  it('a correct mount reports no faults', () => {
    expect(crashMountFaults(GOOD, NAMES)).toEqual([]);
  });
  it('CATCHES a missing boundary, an app outside it, a missing session or log, and an ungated trigger', () => {
    expect(crashMountFaults('root.render(<AppX />)', NAMES)).toEqual(['main.tsx does not mount the CrashBoundary']);
    expect(crashMountFaults(GOOD.replace('      <AppX />\n', '').replace('</StrictMode>', '<AppX /></StrictMode>'), NAMES)).toContain('the CrashBoundary does not wrap <AppX />');
    expect(crashMountFaults(GOOD.replace('session={crashSessionX} ', ''), NAMES)).toContain('the CrashBoundary is not handed crashSessionX');
    expect(crashMountFaults(GOOD.replace('onCrash={logCrashX} ', ''), NAMES)).toContain('the CrashBoundary does not log to logCrashX');
    expect(crashMountFaults(GOOD.replace('import.meta.env.DEV ? ', 'true ? '), NAMES)).toContain('the dev trigger is not gated on import.meta.env.DEV');
  });
});
