/**
 * 3-D's thin lock on the share LINK (#1372) — the shared checks, this tree's wiring
 * (docs/28 §5c rule 3), plus the determinism row's reason in this tree's own terms.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { openShared3, shareLinkFor3 } from '../store/shareLink3';
import { serializeFigure3, serializeFigure3ForLink } from '../store/figureFile3';
import { shareLinkFaults } from '../../shell/__tests__/fixtures/share-link-rows';
import { decodeFigurePayload } from '../../shell/session/link';

const FOREIGN = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [] });

/** The real submit path — one utterance is one step, as the app commits it. */
function build() {
  useGeo3.getState().submit('תיבה ABCDA1B1C1D1');
  if (useGeo3.getState().lastError) throw new Error(`setup failed: ${JSON.stringify(useGeo3.getState().lastError)}`);
}

beforeEach(() => useGeo3.getState().clear());
afterEach(() => useGeo3.getState().clear());

describe('#1372 — the 3-D builder conforms to the shared share contract', () => {
  it('no faults against the cross-product checks', async () => {
    expect(
      await shareLinkFaults({
        build,
        clear: () => useGeo3.getState().clear(),
        isEmpty: () => useGeo3.getState().facts.length === 0,
        link: shareLinkFor3,
        open: (payload) => {
          const r = openShared3(payload);
          return r.ok ? true : r.reason === 'too-large' ? 'too-large' : 'broken';
        },
        statements: 'facts',
        foreign: FOREIGN,
      }),
    ).toEqual([]);
  });
});

describe('#1372 — the link payload omits savedAt, and that is why the link is stable', () => {
  it('the SAVE envelope stamps a time; the LINK envelope does not', () => {
    build();
    const s = useGeo3.getState();
    const saved = JSON.parse(serializeFigure3(s.facts, s.seed));
    const link = JSON.parse(serializeFigure3ForLink(s.facts, s.seed));
    expect(typeof saved.savedAt, 'a saved FILE keeps its provenance').toBe('string');
    expect('savedAt' in link, 'a LINK carries no timestamp — it must be byte-stable').toBe(false);
  });

  it('two presses a moment apart produce the SAME url', async () => {
    build();
    const first = shareLinkFor3();
    await new Promise((r) => setTimeout(r, 1100)); // past a whole second, where an ISO stamp changes
    const second = shareLinkFor3();
    expect(first.ok && second.ok && first.url === second.url).toBe(true);
  });
});

describe('#1372 — a shared 3-D figure comes back as the same figure', () => {
  it('round trip: same commands, same seed, and an empty undo history', () => {
    build();
    const priorCmds = useGeo3.getState().facts.map((f) => f.cmds);
    const priorSeed = useGeo3.getState().seed;
    const before = derive3(useGeo3.getState().facts, priorSeed);
    expect(before.positions.size, 'the setup figure must actually have points').toBeGreaterThan(3);

    const link = shareLinkFor3();
    if (!link.ok) throw new Error('refused');
    useGeo3.getState().clear();
    const payload = decodeFigurePayload(link.url.slice(link.url.indexOf('#') + 1));
    expect(openShared3(payload as string).ok).toBe(true);

    const st = useGeo3.getState();
    expect(st.facts.map((f) => f.cmds)).toEqual(priorCmds);
    expect(st.seed).toBe(priorSeed);
    expect(useGeo3.temporal.getState().pastStates.length, 'a link arrives with nothing behind it').toBe(0);
  });
});
