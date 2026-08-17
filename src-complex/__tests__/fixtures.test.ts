/**
 * THE SAVED-SESSION FIXTURE NET — #624 step 4.
 *
 * Every `fixtures/*.complex.json` is a session saved at a moment it was verified correct. The harness
 * runs the REAL load path — `hydrateSession` → `submitLine` per line → the fold — and asserts, with
 * **zero per-fixture authoring**, that the figure still builds and still satisfies everything it states.
 *
 * The 2-D net's companion ([`src/__tests__/fixtures.test.ts`](../../src/__tests__/fixtures.test.ts))
 * needs a separate parser-drift check, because a 2-D file stores both the utterance and the commands it
 * lowered to. Here the save format IS the student's source lines
 * ([`SavedSession`](../store/useComplexStore.ts)), and hydration re-parses every one of them through the
 * gate — so **a fixture is already a drift net**. If the grammar stops reading a line, or the acceptance
 * gate starts refusing one, the line does not make it into `lines` and assertion 2 fails, naming it.
 *
 * What this deliberately does NOT do is assert figure-specific numbers — that is
 * `cutover-coverage.test.ts` and the unit suites. This net answers *"does everything that used to build
 * green still build green?"*; those answer *"is this specific behaviour still right?"*.
 *
 * ## Adding one
 *
 * Save a session in the app and drop the file here, or hand-author `{app, version, lines, freePos, seed,
 * view}`. `seed: 0` is a fine starting configuration: hydration restores it and the gate advances it per
 * line to a configuration in which every given holds, exactly as a live session does.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { hydrateSession } from '../app/submit';
import { type SavedSession, useComplexStore } from '../store/useComplexStore';

const files = import.meta.glob('./fixtures/*.complex.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const store = () => useComplexStore.getState();

beforeEach(() => {
  store().resetSession();
});

describe('saved-session fixtures net', () => {
  it('the net is not empty', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  for (const [file, text] of Object.entries(files)) {
    const name = file.replace('./fixtures/', '').replace('.complex.json', '');

    describe(name, () => {
      it('loads through the real hydration path', () => {
        expect(hydrateSession(JSON.parse(text))).toBe(true);
      });

      /**
       * EVERY line survived. This is the drift net: a line the grammar can no longer read, or one the
       * acceptance gate now refuses, is dropped by `submitLine` and never reaches `lines`. Comparing
       * against the file names the exact line that stopped working.
       */
      it('replays every saved line — none silently dropped', () => {
        const saved = JSON.parse(text) as SavedSession;
        expect(hydrateSession(JSON.parse(text))).toBe(true);
        expect(store().lines).toEqual(saved.lines);
      });

      /**
       * The verifier, clean. "Green means VERIFIED": nothing the student stated is unread, contradicted,
       * unsatisfied, or filtered into an empty configuration set. An engine change that stops satisfying
       * any given of any fixture fails here.
       */
      it('builds green — nothing unread, contradicted, unsatisfied or emptied', () => {
        expect(hydrateSession(JSON.parse(text))).toBe(true);
        const d = deriveLines(store().lines, store().seed, store().seed);
        expect(d.untranslated.map((u) => u.src)).toEqual([]);
        expect(d.contradiction).toBeNull();
        expect(d.unsatisfied).toEqual([]);
        expect(d.emptiedBy).toBeNull();
        expect(d.points.length).toBeGreaterThan(0);
      });
    });
  }
});
