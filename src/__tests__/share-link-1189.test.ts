/**
 * 2-D's lock on the share LINK (#1189, ADR-W-079).
 *
 * The acceptance the issue asks for, as rows: a figure copied as a link and opened in a fresh
 * session is the SAME figure — same facts, same seed, same configuration — and an over-long or
 * malformed link is refused, never opened half-way.
 *
 * The trim is checked as a property of the payload rather than a character count: the ids and the
 * archive header are gone, `app`/`schemaVersion` stay (they are what makes a foreign payload
 * refuse), and the result still loads losslessly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { openSharedFigure, shareLinkFor, sharedPayloadIn } from '@/store/shareLink';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFigure, serializeFigureForLink } from '@/store/figureFile';
import { LINK_MAX_CHARS, decodeFigurePayload, encodeFigurePayload } from '../../shell/session/link';
import { shareLinkFaults } from '../../shell/__tests__/fixtures/share-link-rows';

const ctxOf = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
};

function build(utterances: string[]) {
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    if (!r.ok) throw new Error(`setup failed on «${u}»: ${JSON.stringify(r)}`);
    useGeoStore.getState().executeMany(r.commands, u);
  }
}

const fragmentOf = (url: string) => url.slice(url.indexOf('#') + 1);

beforeEach(() => useGeoStore.getState().clear());
afterEach(() => useGeoStore.getState().clear());

describe('#1189 — a figure copied as a link opens as the same figure', () => {
  it('round trip: same facts, same seed, same positions, in a fresh session', async () => {
    build(['ריבוע ABCD', 'נקודה G על AD']);
    const priorCmds = useGeoStore.getState().facts.map((f) => f.cmd);
    const priorSeed = useGeoStore.getState().seed;
    const before = replay(useGeoStore.getState().facts, priorSeed);
    expect(before.positions.size, 'the setup figure must actually have points').toBeGreaterThan(3);

    const link = shareLinkFor();
    expect(link.ok, JSON.stringify(link)).toBe(true);
    if (!link.ok) return;

    // What the student's browser does: read the fragment, decode it, load it.
    useGeoStore.getState().clear();
    const payload = sharedPayloadIn(`#${fragmentOf(link.url)}`);
    expect(payload).not.toBeNull();
    const outcome = await openSharedFigure(payload as string);
    expect(outcome.ok).toBe(true);

    const st = useGeoStore.getState();
    expect(st.facts.map((f) => f.cmd)).toEqual(priorCmds);
    expect(st.seed).toBe(priorSeed);
    const after = replay(st.facts, st.seed);
    expect([...after.positions.keys()].sort()).toEqual([...before.positions.keys()].sort());
    for (const [id, p0] of before.positions) {
      const p1 = after.positions.get(id)!;
      expect(p1.x).toBeCloseTo(p0.x, 9);
      expect(p1.y).toBeCloseTo(p0.y, 9);
    }
  });

  it('the student lands in an EDITABLE session with no history behind it', async () => {
    build(['משולש ABC']);
    const link = shareLinkFor();
    if (!link.ok) throw new Error('setup: no link');
    useGeoStore.getState().clear();
    await openSharedFigure(sharedPayloadIn(`#${fragmentOf(link.url)}`) as string);

    expect(useGeoStore.temporal.getState().pastStates.length, 'a link arrives with no earlier session').toBe(0);

    // Fully editable, which was the operator's ruling — no read-only mode, no unlock affordance.
    const opened = useGeoStore.getState().facts.length;
    build(['נקודה D על AB']);
    expect(useGeoStore.getState().facts.length).toBeGreaterThan(opened);
    expect(useGeoStore.temporal.getState().pastStates.length, 'and undoable from there').toBeGreaterThan(0);
  });

  it('the payload is TRIMMED — no fact ids, no savedAt/locale — and still loads losslessly', async () => {
    build(['ריבוע ABCD']);
    const link = shareLinkFor();
    if (!link.ok) throw new Error('setup: no link');
    const payload = JSON.parse(decodeFigurePayload(fragmentOf(link.url)) as string);

    expect(payload.facts.every((f: Record<string, unknown>) => !('id' in f)), 'ids are dropped').toBe(true);
    expect('savedAt' in payload, 'a link is not an archive').toBe(false);
    expect('locale' in payload, 'a load never switches the UI language').toBe(false);
    // The two fields that STAY are the ones a refusal depends on.
    expect(payload.app).toBe('geo-builder');
    expect(typeof payload.schemaVersion).toBe('number');

    const priorCmds = useGeoStore.getState().facts.map((f) => f.cmd);
    useGeoStore.getState().clear();
    expect((await openSharedFigure(decodeFigurePayload(fragmentOf(link.url)) as string)).ok).toBe(true);
    expect(useGeoStore.getState().facts.map((f) => f.cmd)).toEqual(priorCmds);
  });

  it('the payload rides in the FRAGMENT, so it never reaches a server', () => {
    build(['משולש ABC']);
    const link = shareLinkFor();
    if (!link.ok) throw new Error('setup: no link');
    expect(link.url).toContain('#');
    expect(link.url.split('#')[0], 'nothing of the figure is in the path or the query').not.toMatch(/[A-Za-z0-9_-]{40,}/);
  });
});

describe('#1189 — the refusals', () => {
  it('an empty canvas offers no link at all', () => {
    expect(shareLinkFor()).toEqual({ ok: false, reason: 'empty' });
  });

  it('an over-long figure is REFUSED, never emitted truncated', () => {
    build(['ריבוע ABCD']);
    const st = useGeoStore.getState();
    /**
     * A figure far past the threshold. The rows must be DISTINCT — 600 copies of one fact deflate
     * to almost nothing, which is the encoder working, not the threshold failing. (That was this
     * case's first draft, and it passed the wrong way.)
     */
    const huge = {
      ...st,
      facts: Array.from(
        { length: 400 },
        (_, i): Fact => ({
          id: `f${i}`,
          utterance: `ריבוע A${i}B${i}C${i}D${i}`,
          // A literal command, not a spread of the real one: spreading a union member and overriding
          // its ids leaves TS unable to prove the result is still an AnyCommand.
          cmd: { type: "square", ids: [`A${i}`, `B${i}`, `C${i}`, `D${i}`] },
          enabled: true,
        }),
      ),
    };
    const link = shareLinkFor(huge);
    expect(link.ok).toBe(false);
    if (link.ok || link.reason !== 'too-long') throw new Error(`expected a too-long refusal, got ${JSON.stringify(link)}`);
    // The refusal reports what the link WOULD have been — evidence the length was measured on a
    // real encoding rather than guessed from the fact count.
    expect(link.length).toBeGreaterThan(LINK_MAX_CHARS);
  });

  it.each([
    ['no fragment', ''],
    ['a bare hash', '#'],
    ['a foreign fragment', '#section-2'],
    ['a truncated payload', '#eJyrVkpUslJ'],
  ])('%s yields no payload — the app says so instead of opening an empty canvas', (_label, hash) => {
    expect(sharedPayloadIn(hash)).toBeNull();
  });

  it("another builder's figure, correctly encoded, is refused by the LOAD", async () => {
    const foreign = encodeFigurePayload(
      JSON.stringify({ app: '3d-builder', schemaVersion: 1, seed: 0, facts: [{ utterance: 'תיבה ABCDA1B1C1D1', cmds: [] }] }),
    );
    const payload = sharedPayloadIn(`#${foreign}`);
    expect(payload, 'it decodes — the refusal must come from the envelope, not the encoding').not.toBeNull();
    const outcome = await openSharedFigure(payload as string);
    expect(outcome.ok).toBe(false);
    expect(useGeoStore.getState().facts).toEqual([]);
  });
});

/**
 * The claim the feature is sold on — "a real figure fits in a WhatsApp message" — measured over the
 * whole saved corpus rather than asserted from one example. If a construct ever encodes much larger
 * (a future command carrying a lot of inline data), this is where it shows up, before a teacher
 * discovers it.
 */
describe('#1189 — every saved fixture fits in a link', () => {
  const dir = join(__dirname, 'fixtures');
  const files = readdirSync(dir).filter((f) => f.endsWith('.geo.json'));

  it('the corpus is non-empty (the guard is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('every one encodes to a link well inside the threshold', () => {
    const sizes: { file: string; chars: number }[] = [];
    for (const file of files) {
      const parsed = deserializeFigure(readFileSync(join(dir, file), 'utf8'));
      if (!parsed.ok) throw new Error(`${file}: ${parsed.reason}`);
      const payload = serializeFigureForLink({
        facts: parsed.file.facts,
        seed: parsed.file.seed,
        display: parsed.file.display,
      });
      sizes.push({ file, chars: encodeFigurePayload(payload).length });
    }
    const worst = sizes.sort((a, b) => b.chars - a.chars)[0];
    expect(worst.chars, `worst case: ${worst.file} at ${worst.chars} chars`).toBeLessThan(LINK_MAX_CHARS - 200);
  });
});

/**
 * #1372 — 2-D joins the shared cross-product contract.
 *
 * The rows above are 2-D's own and stay. This one asserts 2-D satisfies the SAME checks its three
 * siblings now do, so "every builder shares the same way" is a property of the suite rather than of
 * four files that happen to look alike.
 */
describe('#1372 — 2-D conforms to the shared share contract', () => {
  it('no faults against the cross-product checks', async () => {
    expect(
      await shareLinkFaults({
        build: () => build(['משולש ABC']),
        clear: () => useGeoStore.getState().clear(),
        isEmpty: () => useGeoStore.getState().facts.length === 0,
        link: () => shareLinkFor(),
        open: async (payload) => {
          const r = await openSharedFigure(payload);
          return r.ok ? true : r.reason === 'too-large' ? 'too-large' : 'broken';
        },
        statements: 'facts',
        foreign: JSON.stringify({ app: '3d-builder', schemaVersion: 1, seed: 0, facts: [] }),
      }),
    ).toEqual([]);
  });
});
