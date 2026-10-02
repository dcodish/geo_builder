/**
 * #1653 — the shared segment menu: its decisions, and the look it carries over from 2-D.
 *
 * The decisions are pure (`segmentDisplay.ts`) so they are called here, not reproduced
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)); the component is rendered statically for what it
 * shows when opened. The cross-product behaviour — each builder's REAL store, renderer and save file — is
 * the §5c lock (`fixtures/segment-display-rows.ts`, its meta-lock beside this file, one thin lock per tree).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SegmentMenu } from '../frame/SegmentMenu';
import { cleanSegDisplay, segInk, segmentMenuItems, toggleSegFlag } from '../frame/segmentDisplay';

const STRINGS = { hide: 'הסתירו קטע', show: 'הציגו קטע', dashed: 'מקווקו', solid: 'רציף' };

describe('#1653 — the segment menu decisions', () => {
  it('the toggle keeps only true flags and drops an all-off entry (2-D’s setSegFlag, unchanged)', () => {
    expect(toggleSegFlag({}, 'AB', 'hidden')).toEqual({ AB: { hidden: true } });
    expect(toggleSegFlag({ AB: { hidden: true } }, 'AB', 'hidden')).toEqual({});
    expect(toggleSegFlag({ AB: { dashed: true } }, 'AB', 'hidden')).toEqual({ AB: { dashed: true, hidden: true } });
    expect(toggleSegFlag({ AB: { dashed: true, hidden: true } }, 'AB', 'hidden')).toEqual({ AB: { dashed: true } });
  });

  it('a hidden segment has no ink (a ghost at most); otherwise its stroke is the choice', () => {
    expect(segInk(undefined)).toBe('solid');
    expect(segInk({ dashed: true })).toBe('dashed');
    expect(segInk({ hidden: true })).toBe('ghost');
    expect(segInk({ hidden: true, dashed: true })).toBe('ghost');
  });

  it('the menu offers hide/show, then dashed/solid only while the segment is drawn — and only what is wired', () => {
    const both = { hide: true, dash: true };
    expect(segmentMenuItems({}, both)).toEqual([
      { flag: 'hidden', label: 'hide' },
      { flag: 'dashed', label: 'dashed' },
    ]);
    expect(segmentMenuItems({ dashed: true }, both)).toEqual([
      { flag: 'hidden', label: 'hide' },
      { flag: 'dashed', label: 'solid' },
    ]);
    expect(segmentMenuItems({ hidden: true, dashed: true }, both)).toEqual([{ flag: 'hidden', label: 'show' }]);
    expect(segmentMenuItems({}, { hide: true, dash: false })).toEqual([{ flag: 'hidden', label: 'hide' }]);
    expect(segmentMenuItems({}, { hide: false, dash: false })).toEqual([]);
  });

  it('a loaded map keeps only key → {hidden?, dashed?: true}', () => {
    expect(cleanSegDisplay({ 'A|B': { dashed: true, x: 1 }, 'B|C': { hidden: 'yes' }, 'C|D': { hidden: true }, '': { hidden: true } })).toEqual({
      'A|B': { dashed: true },
      'C|D': { hidden: true },
    });
    expect(cleanSegDisplay(null)).toEqual({});
    expect(cleanSegDisplay([1])).toEqual({});
  });
});

describe('#1653 — the menu as opened', () => {
  const render = (extra: Partial<Parameters<typeof SegmentMenu>[0]> = {}) =>
    renderToStaticMarkup(
      <SegmentMenu x={10} y={20} bounds={{ width: 400, height: 300 }} title="AB" state={{}} onToggleHidden={() => {}} onToggleDashed={() => {}} strings={STRINGS} onClose={() => {}} {...extra} />,
    );

  it('shows the segment’s name, then the caller’s strings in 2-D’s order', () => {
    const html = render();
    expect(html).toContain('>AB<');
    expect(html.indexOf('הסתירו קטע')).toBeGreaterThan(-1);
    expect(html.indexOf('מקווקו')).toBeGreaterThan(html.indexOf('הסתירו קטע'));
  });

  it('a hidden segment offers «show» and no dash entry; a dashed one offers «solid»', () => {
    const hidden = render({ state: { hidden: true, dashed: true } });
    expect(hidden).toContain('הציגו קטע');
    expect(hidden).not.toContain('רציף');
    expect(hidden).not.toContain('מקווקו');
    expect(render({ state: { dashed: true } })).toContain('רציף');
  });

  it('the product’s own items render below the display entries (2-D: «החליפו קצוות»; analytic: the measures)', () => {
    const html = render({ children: <button type="button">החליפו קצוות</button> });
    expect(html.indexOf('החליפו קצוות')).toBeGreaterThan(html.indexOf('מקווקו'));
  });

  it('it is anchored by PHYSICAL left (an RTL page must not mirror it) and clamped inside its container', () => {
    expect(render()).toMatch(/left:18px;top:28px/);
    expect(render({ x: 390, y: 290 })).toMatch(/left:250px;top:220px/);
  });
});
