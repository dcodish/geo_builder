/** #1348 (ADR-W-095) — this product's palette inserts what each one-character face shows. */
import { describe, expect, it } from 'vitest';
import { SYMBOL_SPECS_3 } from '../ui/symbols3';
import { paletteFaceViolations } from '../../shell/__tests__/fixtures/palette-faces';

describe('#1348 — the palette face is the payload (src3d)', () => {
  it('every one-character button inserts its own glyph, or says why not', () => {
    expect(paletteFaceViolations(SYMBOL_SPECS_3)).toEqual([]);
  });

  it('the check can fail: a face with a different payload is reported', () => {
    expect(paletteFaceViolations([{ label: '≥', before: '>=' }])).toEqual(['«≥» inserts «>=»']);
  });
});
