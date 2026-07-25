/**
 * #312 — a vector atom keeps its styling under ANY coefficient syntax (the docs/17 §2.2 boundary
 * class: the old regex enumerated some expression punctuation as boundaries, so `u/6`, `2v`,
 * `(1-t)u` silently lost the underline — the operator's «in FE=u/6-v/6 the u is not underlined»).
 */
import { describe, expect, it } from 'vitest';
import { factDisplay3, vectorNotation } from '../notation';

const UV = new Set(['u', 'v']);
const UVW = new Set(['u', 'v', 'w']);
const U_UNDER = 'u̲';
const V_UNDER = 'v̲';
const W_UNDER = 'w̲';

describe('vectorNotation — atom styling boundaries', () => {
  it('styles a divided atom: u/6 (the operator’s exact report)', () => {
    const out = vectorNotation('FE=u/6-v/6', UV);
    expect(out).toContain(`${U_UNDER}/6`);
    expect(out).toContain(`${V_UNDER}/6`);
  });

  it('styles a digit-coefficient atom: 2v', () => {
    expect(vectorNotation('AS=2v', UV)).toContain(`2${V_UNDER}`);
  });

  it('styles a paren-coefficient atom: (1-t)u', () => {
    expect(vectorNotation('AS=(1-t)u+0.5v', UVW)).toContain(`)${U_UNDER}`);
  });

  it('still styles the plain standalone forms', () => {
    const out = vectorNotation('SB=u', UV);
    expect(out).toContain(U_UNDER);
  });

  it('never styles a letter EMBEDDED in a word (no false positives)', () => {
    const out = vectorNotation('נקודה E על SC', new Set(['v']));
    expect(out).not.toContain(V_UNDER); // the v in nothing — and Hebrew words with ו are untouched
    const out2 = vectorNotation('vertex V under uv', new Set(['u', 'v']));
    expect(out2).not.toContain(`${U_UNDER}${V_UNDER}`); // 'uv' juxtaposition stays unstyled (needs the term grammar — #313)
  });

  it('pair arrows still applied; the וקטור decoration stripped', () => {
    const out = vectorNotation('וקטור SD = (2/3)SB', UV);
    expect(out).toContain('SD⃗');
    expect(out).toContain('SB⃗');
    expect(out).not.toContain('וקטור');
  });
});

describe('factDisplay3 — routing', () => {
  it('a vector fact gets notation; a plain fact passes through verbatim', () => {
    const vec = { utterance: 'FE=u/6-v/6', cmds: [{ type: 'vec-rel' }] };
    const plain = { utterance: 'F אמצע SC', cmds: [{ type: 'midpoint3' }] };
    expect(factDisplay3(vec, UV)).toContain(U_UNDER);
    expect(factDisplay3(plain, UV)).toBe('F אמצע SC');
  });
});
