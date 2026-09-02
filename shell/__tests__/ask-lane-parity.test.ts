/**
 * #741 — the data panel's ASK LANE is ONE lane in all three builders (operator, 2026-08-18: *"the data
 * panel is not the same in all tools. in geo, i need to press חשב ערכים to see it… in 3d its there from
 * the start… we need a unified approach here."*).
 *
 * The defect this locks out is not a wrong pixel, it is THREE IMPLEMENTATIONS: 2-D rendered the box
 * inside the values card (so it appeared only after «חשב ערכים» ran, and — since the values layer is
 * invalidated by every new fact — vanished again on the student's next line), 3-D had it unconditionally
 * as a panel child, and complex rebuilt it a third time at #789. All three now render the shared
 * `shell/frame/AskLane`, and the two rules that made them differ are asserted here rather than trusted:
 *
 *  1. **Every product renders the shared component** — nobody keeps a private ask form.
 *  2. **The lane is never gated on a computation having run.** 2-D's regression is specifically a
 *     `valuesLayer &&` ancestor, so that is what is checked: the lane must not sit inside it.
 *
 * Source-scan locks, the `row-parity` / import-direction pattern: the Apps are not rendered here, so a
 * refactor that re-hides the lane fails with a clear message instead of silently regressing the UI.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a parse crash here. */
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** Every builder's App and the panel-bearing file it renders the lane from. */
const APPS: { product: string; file: string }[] = [
  { product: '2-D', file: 'src/App.tsx' },
  { product: '3-D', file: 'src3d/App3.tsx' },
  { product: 'complex', file: 'src-complex/App.tsx' },
];

describe('#741 — one ask lane across the builders', () => {
  for (const { product, file } of APPS) {
    describe(product, () => {
      const src = read(file);

      it('renders the SHARED AskLane, imported from the shell', () => {
        expect(src, `${file} must import the shared lane`).toMatch(/import \{ AskLane \} from '.*shell\/frame\/AskLane'/);
        expect(src, `${file} must render <AskLane`).toContain('<AskLane');
      });

      it('keeps no private ask form — the box lives in the shared component only', () => {
        // A bare <input> whose placeholder is an ask/query string is the shape that used to be
        // duplicated three ways. The shared lane owns it now.
        const privateForm = /<input[^>]*placeholder=\{t\('(?:values\.query|query\.|ask)[^']*'\)\}/s.exec(src);
        expect(privateForm?.[0], `${file} still renders its own ask input`).toBeUndefined();
      });
    });
  }

  it('2-D: the lane is NOT inside the values-gated block (the reported defect)', () => {
    const src = read('src/App.tsx');
    const lane = src.indexOf('<AskLane');
    expect(lane, 'src/App.tsx renders the lane').toBeGreaterThan(0);
    // The values card opens at `{valuesLayer && (` and closes before the lane; if the lane were still
    // inside it, the nearest preceding `{valuesLayer && (` would have no closing `)}` between them.
    const gate = src.lastIndexOf('{valuesLayer && (', lane);
    expect(gate, 'src/App.tsx has a values-gated block').toBeGreaterThan(0);
    const between = src.slice(gate, lane);
    expect(
      between.includes('\n          )}'),
      'the ask lane must sit AFTER the values block closes — it may not be gated on the compute having run',
    ).toBe(true);
  });

  it('2-D: asking is what PULLS the values compute (#217 economics, one step later)', () => {
    const src = read('src/App.tsx');
    const lane = src.slice(src.indexOf('<AskLane'), src.indexOf('</AskLane>'));
    expect(lane, 'the submit handler runs the compute when the layer is stale').toContain('viewValues()');
    expect(lane).toContain('addQuery(');
  });

  it('«חשב ערכים» survives as the SEPARATE trigger that volunteers the automatic rows', () => {
    const src = read('src/App.tsx');
    expect(src, 'the values button is still offered').toContain("t('values.compute')");
  });
});
