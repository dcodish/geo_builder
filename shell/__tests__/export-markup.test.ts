/**
 * #713 (ADR-W-051) — the markup twin of `svgToPng`'s DOM strip: every `[data-noexport]` subtree goes, nothing
 * else does. The three product clean-export locks stand on this helper, so its own contract is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { normalizeForExport, revertExportAccents, stripNoExport } from '../export/exportMarkup';

describe('stripNoExport', () => {
  it('removes a self-closing tagged element and keeps its siblings', () => {
    expect(stripNoExport('<g><circle data-noexport="1" r="1"/><line x1="0"/></g>')).toBe('<g><line x1="0"/></g>');
  });

  it('removes a tagged group with everything nested inside it, including nested groups', () => {
    const svg = '<svg><g data-noexport="1"><g><circle r="2"/></g><text>x</text></g><text>keep</text></svg>';
    expect(stripNoExport(svg)).toBe('<svg><text>keep</text></svg>');
  });

  it('leaves untagged markup byte-identical', () => {
    const svg = '<svg><g class="a"><circle r="2"/><text>A</text></g></svg>';
    expect(stripNoExport(svg)).toBe(svg);
  });

  it('is not fooled by an attribute that merely contains the word', () => {
    const svg = '<svg><circle data-id="data-noexport-lookalike" r="2"/></svg>';
    expect(stripNoExport(svg)).toBe(svg);
  });
});

describe('revertExportAccents', () => {
  it('restores the resting stroke/width a selection accent replaced, exactly as the rasteriser does', () => {
    const accented = '<line x1="0" stroke="#f59e0b" stroke-width="3" data-export-stroke="#334155" data-export-width="1.5"></line>';
    expect(revertExportAccents(accented)).toBe('<line x1="0" stroke="#334155" stroke-width="1.5"></line>');
  });
});

describe('normalizeForExport', () => {
  it('drops the non-painting parts: class, cursor styles, tooltips', () => {
    const a = normalizeForExport('<g class="cursor-pointer" style="cursor: pointer;"><title>tip</title><circle r="1"/></g>');
    const b = normalizeForExport('<g><circle r="1"/></g>');
    expect(a).toBe(b);
  });
});
