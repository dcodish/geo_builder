/** #1348 (ADR-W-095) — this product's palette inserts what each one-character face shows. */
import { describe, expect, it } from 'vitest';
import { SYMBOLS } from '../ui/symbols';
import { paletteFaceViolations } from '../../shell/__tests__/fixtures/palette-faces';

describe('#1348 — the palette face is the payload (src-analytic)', () => {
  it('every one-character button inserts its own glyph, or says why not', () => {
    expect(paletteFaceViolations(SYMBOLS)).toEqual([]);
  });

  it('the check can fail: a face with a different payload is reported', () => {
    expect(paletteFaceViolations([{ label: '≥', before: '>=' }])).toEqual(['«≥» inserts «>=»']);
  });
});
