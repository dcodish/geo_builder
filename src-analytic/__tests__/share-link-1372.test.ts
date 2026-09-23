/**
 * The analytic builder's thin lock on the share LINK (#1372) — the shared checks, this tree's
 * wiring (docs/28 §5c rule 3).
 *
 * The operator's own file is the fixture: «עבודת סוכות - שאלה 4», the 13-line session he could not
 * send, which is what the issue was filed about.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSharedAnalytic, shareLinkForAnalytic } from '../app/shareLinkAn';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { shareLinkFaults } from '../../shell/__tests__/fixtures/share-link-rows';
import { decodeFigurePayload, LINK_MAX_CHARS } from '../../shell/session/link';

/** The operator's Sukkot #4, verbatim (2026-09-23). */
const SUKKOT_4 = [
  'משולש ABC',
  'AB=AC',
  'D אמצע קטע AB',
  'E אמצע קטע AC',
  'DE',
  'משוואת הקטע DE היא y=-0.5x+3.5',
  'משוואת הצלע AC היא y=x+2',
  'שיעור ה- x של נקודה C הוא -4',
  'נקודה M',
  'שיעור ה-x  של נקודה M הוא 2',
  'נתון מעגל שמרכזו M',
  'נקודה B נמצאת על המעגל',
  'נקודה C נמצאת על המעגל',
];

const FOREIGN = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [] });

const build = () => {
  for (const l of SUKKOT_4) useAnalyticStore.getState().recordLine(l);
};

beforeEach(() => useAnalyticStore.getState().clearAll());
afterEach(() => useAnalyticStore.getState().clearAll());

describe('#1372 — the analytic builder conforms to the shared share contract', () => {
  it('no faults against the cross-product checks', async () => {
    expect(
      await shareLinkFaults({
        build,
        clear: () => useAnalyticStore.getState().clearAll(),
        isEmpty: () => useAnalyticStore.getState().lines.length === 0,
        link: shareLinkForAnalytic,
        open: openSharedAnalytic,
        foreign: FOREIGN,
      }),
    ).toEqual([]);
  });
});

describe('#1372 — the operator’s own session travels', () => {
  it('«עבודת סוכות - שאלה 4» round-trips through a link, line for line', () => {
    build();
    const link = shareLinkForAnalytic();
    expect(link.ok, JSON.stringify(link)).toBe(true);
    if (!link.ok) return;

    useAnalyticStore.getState().clearAll();
    const payload = decodeFigurePayload(link.url.slice(link.url.indexOf('#') + 1));
    expect(openSharedAnalytic(payload as string)).toBe(true);

    const st = useAnalyticStore.getState();
    expect(st.lines).toEqual(SUKKOT_4);
    expect(st.name, 'a link has no filename, so the envelope’s own name is the figure’s').toBe('');
    // #1087: a shared session is audited exactly as a loaded file is.
    expect(st.loadAudit?.total).toBe(SUKKOT_4.length);
  });

  it('and it fits a WhatsApp message with room to spare', () => {
    build();
    const link = shareLinkForAnalytic();
    if (!link.ok) throw new Error('refused');
    // Measured at 407 characters when the issue was filed; the row guards the order of magnitude,
    // not the exact number, so adding a line to the tool does not break it spuriously.
    expect(link.url.length).toBeLessThan(LINK_MAX_CHARS / 2);
  });
});
