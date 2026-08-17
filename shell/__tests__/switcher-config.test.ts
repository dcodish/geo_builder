/**
 * The client overlay merge (A3, #662): curation can narrow and redecorate the registry roster —
 * never extend it — and any absent/partial config leaves the roster untouched (the degraded path).
 */
import { describe, expect, it } from 'vitest';
import { applySwitcherConfig, type SwitcherRosterEntry } from '../switcherConfig';

const roster: SwitcherRosterEntry[] = [
  { id: '2d', label: 'הנדסת המישור', url: '/', icon: '📐' },
  { id: '3d', label: 'הנדסת המרחב', url: '/3d.html', icon: '🧊' },
  { id: 'complex', label: 'מספרים מרוכבים', url: '/complex.html', icon: 'ℂ' },
];

describe('applySwitcherConfig', () => {
  it('null / undefined / empty config passes the roster through untouched', () => {
    expect(applySwitcherConfig(roster, null)).toEqual(roster);
    expect(applySwitcherConfig(roster, undefined)).toEqual(roster);
    expect(applySwitcherConfig(roster, {})).toEqual(roster);
  });

  it('hides configured ids', () => {
    const out = applySwitcherConfig(roster, { switcher: { hidden: ['3d'] } });
    expect(out.map((e) => e.id)).toEqual(['2d', 'complex']);
  });

  it('orders listed ids first, the rest keep registry order', () => {
    const out = applySwitcherConfig(roster, { switcher: { order: ['complex'] } });
    expect(out.map((e) => e.id)).toEqual(['complex', '2d', '3d']);
  });

  it('overrides labels and icons; empty-string overrides are ignored', () => {
    const out = applySwitcherConfig(roster, {
      switcher: { labels: { '2d': 'מישור', '3d': '  ' }, icons: { complex: '∁' } },
    });
    expect(out.find((e) => e.id === '2d')?.label).toBe('מישור');
    expect(out.find((e) => e.id === '3d')?.label).toBe('הנדסת המרחב');
    expect(out.find((e) => e.id === 'complex')?.icon).toBe('∁');
  });

  it('unknown configured ids are inert — curation can never ADD a builder', () => {
    const out = applySwitcherConfig(roster, {
      switcher: { order: ['builder5'], hidden: ['builder6'], labels: { builder7: 'x' } },
    });
    expect(out.map((e) => e.id)).toEqual(['2d', '3d', 'complex']);
  });
});
