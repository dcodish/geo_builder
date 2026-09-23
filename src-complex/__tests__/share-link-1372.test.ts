/**
 * The complex builder's thin lock on the share LINK (#1372) — the shared checks, this tree's
 * wiring (docs/28 §5c rule 3), plus the one field this tree had to think about.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { submitLine } from '../app/submit';
import { openSharedComplex, shareLinkForComplex } from '../app/shareLinkCx';
import { useComplexStore } from '../store/useComplexStore';
import { shareLinkFaults } from '../../shell/__tests__/fixtures/share-link-rows';
import { decodeFigurePayload } from '../../shell/session/link';

const FOREIGN = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [] });

const build = () => {
  for (const l of ['z1 = 3 + 4i', 'z2 = 1 - 2i']) if (!submitLine(l)) throw new Error(`setup failed on «${l}»`);
};

beforeEach(() => useComplexStore.getState().resetSession());
afterEach(() => useComplexStore.getState().resetSession());

describe('#1372 — the complex builder conforms to the shared share contract', () => {
  it('no faults against the cross-product checks', async () => {
    expect(
      await shareLinkFaults({
        build,
        clear: () => useComplexStore.getState().resetSession(),
        isEmpty: () => useComplexStore.getState().lines.length === 0,
        link: shareLinkForComplex,
        open: openSharedComplex,
        foreign: FOREIGN,
      }),
    ).toEqual([]);
  });
});

describe('#1372 — the shared figure is the SAME figure, freePos included', () => {
  it('the lines come back in order, through the real audited hydrate', () => {
    build();
    const priorLines = [...useComplexStore.getState().lines];
    const link = shareLinkForComplex();
    if (!link.ok) throw new Error('refused');

    useComplexStore.getState().resetSession();
    const payload = decodeFigurePayload(link.url.slice(link.url.indexOf('#') + 1));
    expect(openSharedComplex(payload as string)).toBe(true);
    expect(useComplexStore.getState().lines).toEqual(priorLines);
  });

  /**
   * `freePos` is where the student PLACED a free point. It looks like a position and is not one: it
   * is an input, the same kind of thing as a typed line, so FR-SL-4's "replay inputs, not positions"
   * keeps it. Dropping it to shorten the URL would silently move someone's construction.
   */
  it('a dragged free point travels with the link', () => {
    build();
    useComplexStore.setState({ freePos: { z1: { re: 2.5, im: -1.25 } } });
    const link = shareLinkForComplex();
    if (!link.ok) throw new Error('refused');
    const payload = JSON.parse(decodeFigurePayload(link.url.slice(link.url.indexOf('#') + 1)) as string);
    expect(payload.freePos, 'a placed point is a given, not a rendering detail').toEqual({
      z1: { re: 2.5, im: -1.25 },
    });
  });
});
