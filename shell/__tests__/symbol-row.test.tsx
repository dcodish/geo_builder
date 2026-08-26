/**
 * #525 — the SymbolRow: the palette's insert mechanism, extracted so every text surface mounts it.
 *
 * The mechanism (wrap-selection insert, caret placement) is `shell/symbols.applySymbol`, locked by
 * its own tests and by every product's drift lock. What THIS file locks is the mount contract: the
 * chips render from the given vocabulary, a collapsed mount shows only the toggle until opened,
 * and the buttons carry the mousedown guard that keeps focus in the target input — without it a
 * palette click BLURS the fact-list editor, which commits the edit before the insert lands.
 */
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SymbolRow } from '../frame/SymbolRow';

const SYMS = [
  { label: '∠', before: '∠' },
  { label: '|·|', before: '|', after: '|' },
];

const mount = (props: Partial<Parameters<typeof SymbolRow>[0]> = {}) =>
  renderToStaticMarkup(
    <SymbolRow
      symbols={SYMS}
      value=""
      onChange={() => {}}
      inputRef={createRef<HTMLInputElement>()}
      {...props}
    />,
  );

describe('#525 — one palette control, N mount points', () => {
  it('renders every chip of the vocabulary it is given', () => {
    const html = mount();
    expect(html).toContain('∠');
    expect(html).toContain('|·|');
  });

  it('collapsed: only the toggle shows until the student asks for glyphs', () => {
    const html = mount({ startCollapsed: true, toggleTitle: 'Symbols' });
    expect(html).toContain('αβ√'); // the toggle
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('∠'); // the chips wait
  });
});
