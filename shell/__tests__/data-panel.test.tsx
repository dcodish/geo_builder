/**
 * B6 (#671) — the shared data-panel chrome (docs/28 §4a D8): the sections render in the order the
 * caller gives (the D8 ruling fixes that order product-side: points · measures · relations ·
 * parameters · ask), an EMPTY section is absent heading and all (never a hollow title), and the
 * status head-line renders only when passed.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataPanel } from '../frame/DataPanel';

const SECTIONS = [
  { key: 'points', title: 'נקודות', rows: ['z1 = 3+4i'] },
  { key: 'measures', title: 'מדידות', rows: [] as string[] },
  { key: 'relations', title: 'יחסים', rows: ['w = z1·z2'] },
  { key: 'ask', title: 'חישוב', rows: ['|z1| = 5'] },
];

describe('DataPanel', () => {
  it('renders sections in caller order, dropping empty ones whole', () => {
    const html = renderToStaticMarkup(<DataPanel sections={SECTIONS} />);
    expect(html).not.toContain('מדידות'); // empty section: no hollow heading
    const points = html.indexOf('נקודות');
    const relations = html.indexOf('יחסים');
    const ask = html.indexOf('חישוב');
    expect(points).toBeGreaterThanOrEqual(0);
    expect(relations).toBeGreaterThan(points);
    expect(ask).toBeGreaterThan(relations);
  });

  it('the status head-line renders before everything, and only when passed', () => {
    const withStatus = renderToStaticMarkup(<DataPanel status="דרגות חופש: 2" sections={SECTIONS} />);
    expect(withStatus.indexOf('דרגות חופש: 2')).toBeGreaterThanOrEqual(0);
    expect(withStatus.indexOf('דרגות חופש: 2')).toBeLessThan(withStatus.indexOf('נקודות'));
    const without = renderToStaticMarkup(<DataPanel sections={SECTIONS} />);
    expect(without).not.toContain('דרגות חופש');
  });

  it('the shared head: one title, one toggle; closed = head only (the one-trigger ruling)', () => {
    const open = renderToStaticMarkup(
      <DataPanel title="נתונים" open={true} onToggle={() => {}} showLabel="הצגה" hideLabel="הסתרה" sections={SECTIONS} />,
    );
    expect(open).toContain('נתונים');
    expect(open).toContain('הסתרה'); // open shows the hide label
    expect(open).toContain('נקודות');
    const closed = renderToStaticMarkup(
      <DataPanel title="נתונים" open={false} onToggle={() => {}} showLabel="הצגה" hideLabel="הסתרה" sections={SECTIONS} />,
    );
    expect(closed).toContain('הצגה'); // closed shows the show label
    expect(closed).not.toContain('נקודות'); // ...and no content
  });

  it('value rows are LTR; app-direction rows carry no dir of their own (#559)', () => {
    const html = renderToStaticMarkup(
      <DataPanel
        sections={[
          { key: 'a', title: 'A', rows: ['x = 1'] },
          { key: 'b', title: 'B', rows: ['שורה עברית'], dir: 'app' },
        ]}
      />,
    );
    expect(html).toContain('dir="ltr"');
    // the app-direction row's wrapper div carries NO dir attribute — it follows the app
    const bRow = html.slice(html.indexOf('שורה עברית') - 80, html.indexOf('שורה עברית'));
    expect(bRow).not.toContain('dir=');
  });
});
