/**
 * #1631 / #1302 — 3-D's letter SWAP and the shared popover's rename, locked.
 *
 * The first block is this tree's thin lock on the cross-product checks (docs/28 §5c rule 3): the REAL
 * `rename` → `letterRename3` (what App3 hands the shared popover) and the REAL `swap` store action.
 * The rest are 3-D's own properties, the ones #1302's plan named as most likely to be dropped:
 * the ID-keyed side state (queries, plane display) follows through the same sentinel triple; the PRIME
 * is its own vertex; the typed form is reachable through the parser and does not widen the plain
 * «החלף E ב-G» rename; and the refusal's taught sentence actually drives a swap (#1183 class).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, undo3, useGeo3 } from '../store/store3';
import { parseRename3, parseRewrite3, parseSwap3 } from '../parser/parse3';
import { letterHolder3, letterRename3, swapSession3 } from '../store/rename3';
import { swapOffered } from '../../shell/frame/letterOffer';
import { errorText3 } from '../i18n/errorText3';
import i18n from '../i18n';
import { letterSwapFaults } from '../../shell/__tests__/fixtures/letter-swap-rows';

const st = () => useGeo3.getState();
function build(us: string[]) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, queries: [], planeDisplay: {} });
  useGeo3.temporal.getState().clear();
  for (const u of us) {
    st().submit(u);
    if (st().lastError) throw new Error(`setup failed on «${u}»: ${JSON.stringify(st().lastError)}`);
  }
  useGeo3.temporal.getState().clear();
}
const utterances = () => st().facts.map((f) => f.utterance);
const points = () => [...derive3(st().facts, st().seed).positions.keys()].filter((id) => /^[A-Z]\d*'?$/.test(id));

const CUBE = "קובייה ABCDA'B'C'D'";

beforeEach(() => build([]));

describe('#1631 — the 3-D builder conforms to the shared letter-swap contract', () => {
  it.each([
    ['a solid vertex and a constructed point', [CUBE, 'M אמצע AB'], 'A', 'M'],
    ['two ADJACENT vertices of one solid', [CUBE], 'A', 'B'],
    ['two OPPOSITE vertices of one face', [CUBE, 'מישור ABCD'], 'A', 'C'],
    ['a vertex and its PRIMED twin', [CUBE], 'A', "A'"],
  ])('%s', (_name, setup, a, b) => {
    const faults = letterSwapFaults({
      setup: () => build(setup),
      a,
      b,
      rename: (from, to) => letterRename3(st().rename(from, to)),
      swap: (x, y) => st().swap(x, y),
      undo: undo3,
      statements: utterances,
      points,
    });
    expect(faults).toEqual([]);
  });
});

describe('#1302 — the holder and the offer', () => {
  it('a taken letter names the statement that introduced it, in both directions, and the offer is shown', () => {
    build([CUBE, 'M אמצע AB']);
    const toM = st().rename('A', 'M');
    expect(toM).toMatchObject({ ok: false, reason: 'target-taken', holder: { utterance: 'M אמצע AB' } });
    const toA = st().rename('M', 'A');
    expect(toA).toMatchObject({ ok: false, reason: 'target-taken', holder: { utterance: CUBE } });
    for (const r of [toM, toA]) {
      const offered = letterRename3(r);
      expect(offered.ok).toBe(false);
      if (!offered.ok) expect(swapOffered(offered.holder)).toBe(true);
    }
  });

  it('a MUTED statement is not a holder — the first ENABLED one is', () => {
    build([CUBE, 'M אמצע AB', 'N אמצע AC']);
    const facts = st().facts.map((f, i) => (i === 0 ? { ...f, enabled: false } : f));
    expect(letterHolder3(facts, 'A')).toMatchObject({ utterance: 'M אמצע AB' });
  });
});

describe('#1302 — the swap carries the session’s letter-keyed state through the same triple', () => {
  it('queries and the plane display follow, the seed is kept, and ONE undo restores all of it', () => {
    build([CUBE, 'M אמצע AB', 'מישור ABCD']);
    st().addQuery('|AM|');
    st().togglePlaneDisplay('ABCD');
    const pd = st().planeDisplay;
    expect(Object.keys(pd)).toEqual(['ABCD']);
    const before = { facts: st().facts, queries: st().queries, planeDisplay: st().planeDisplay, seed: st().seed };

    expect(st().swap('A', 'M')).toEqual({ ok: true });
    expect(utterances()).toEqual(["קובייה MBCDA'B'C'D'", 'A אמצע MB', 'מישור MBCD']);
    expect(st().queries).toEqual(['|MA|']);
    expect(st().planeDisplay).toEqual({ MBCD: pd.ABCD });
    expect(st().seed, 'a letter is a name, not a configuration').toBe(before.seed);

    undo3();
    expect(st().facts).toEqual(before.facts);
    expect(st().queries).toEqual(before.queries);
    expect(st().planeDisplay).toEqual(before.planeDisplay);
  });

  it('the pure core touches nothing when it refuses', () => {
    build([CUBE]);
    const s = { facts: st().facts, queries: [], planeDisplay: {} };
    expect(swapSession3(s, 'A', 'A')).toEqual({ ok: false, reason: 'same' });
    expect(swapSession3(s, 'A', 'Z'), 'both letters must exist — else it is a rename').toEqual({ ok: false, reason: 'no-source' });
    expect(swapSession3(s, 'A', '3')).toEqual({ ok: false, reason: 'no-source' });
  });

  it('a PRIME is its own vertex: swapping A and A′ exchanges exactly those two', () => {
    build([CUBE, 'מישור ABCD']);
    expect(st().swap('A', "A'")).toEqual({ ok: true });
    expect(utterances()).toEqual(["קובייה A'BCDAB'C'D'", "מישור A'BCD"]);
  });

  it('within one declared run the swap is a pure relabelling — measured, not assumed from 2-D', () => {
    // #1302 asked for this to be measured in 3-D. Every swap is a rewrite of the whole history, so the
    // point that WAS A now carries C and stands exactly where A stood — adjacent or opposite alike.
    for (const [a, b] of [
      ['A', 'B'],
      ['A', 'C'],
    ]) {
      build([CUBE]);
      const before = derive3(st().facts, st().seed).positions;
      expect(st().swap(a, b)).toEqual({ ok: true });
      const after = derive3(st().facts, st().seed).positions;
      expect(after.get(b), `${b} now stands where ${a} stood`).toEqual(before.get(a));
      expect(after.get(a), `${a} now stands where ${b} stood`).toEqual(before.get(b));
      expect(derive3(st().facts, st().seed).status[st().facts[0].id]).toBe('ok');
    }
  });
});

describe('#1302 — the typed form', () => {
  it.each([
    ['החלף בין A ל-M', { a: 'A', b: 'M' }],
    ['החלף בין A לבין M', { a: 'A', b: 'M' }],
    ['החלף בין A ו-M', { a: 'A', b: 'M' }],
    ['החליפו בין A ל-M', { a: 'A', b: 'M' }],
    ['החלף בין A ל־M', { a: 'A', b: 'M' }], // a pasted maqaf (#531)
    ["החלף בין A' ל-C", { a: "A'", b: 'C' }],
    ['swap A and M', { a: 'A', b: 'M' }],
    ["swap A' with c", { a: "A'", b: 'C' }],
  ])('«%s» reads as a swap', (u, want) => {
    expect(parseSwap3(u)).toEqual(want);
  });

  it('«בין» is what makes it a swap: the plain «החלף E ב-G» is still a RENAME, and never both', () => {
    expect(parseSwap3('החלף M ב-Q')).toBeNull();
    expect(parseRewrite3('החלף M ב-Q')).toEqual({ kind: 'rename', from: 'M', to: 'Q' });
    expect(parseRename3('החלף בין A ל-M')).toBeNull();
    expect(parseRewrite3('החלף בין A ל-M')).toEqual({ kind: 'swap', a: 'A', b: 'M' });
  });

  it('typed through submit it swaps, is ONE undo step, and never becomes a fact', () => {
    build([CUBE, 'M אמצע AB']);
    const before = st().facts;
    st().submit('החלף בין A ל-M');
    expect(st().lastError).toBeNull();
    expect(utterances()).toEqual(["קובייה MBCDA'B'C'D'", 'A אמצע MB']);
    undo3();
    expect(st().facts).toEqual(before);
  });

  it('a swap it cannot do is a TYPED refusal naming both letters — never escalated as not-understood', () => {
    build([CUBE]);
    st().submit('החלף בין A ל-Z');
    expect(st().lastError).toEqual({ code: 'swap-refused', reason: 'no-source', a: 'A', b: 'Z' });
    expect(st().facts).toHaveLength(1);
  });

  it.each(['he', 'en'])('the taken-letter refusal TEACHES a swap sentence that, typed, swaps (%s)', async (lng) => {
    build([CUBE, 'M אמצע AB']);
    st().submit('שנה שם A ל-M');
    const err = st().lastError;
    expect(err).toMatchObject({ code: 'rename-refused', reason: 'target-taken' });
    await i18n.changeLanguage(lng);
    const msg = errorText3(i18n.t.bind(i18n) as never, err!) ?? "";
    const taught = /«((?:החלף בין|swap) [^»]+)»/.exec(msg)?.[1];
    expect(taught, msg).toBeTruthy();
    st().submit(taught!);
    expect(st().lastError, `the taught «${taught}» must swap`).toBeNull();
    expect(utterances()).toEqual(["קובייה MBCDA'B'C'D'", 'A אמצע MB']);
  });
});
