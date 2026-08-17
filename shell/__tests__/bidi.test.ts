/**
 * The shared bidi core — the complex-shaped cases that motivated sharing it (the third builder
 * shipped with NO isolation, docs/28 §1a), plus the mechanics inherited from the 3-D refinement:
 * partner-debt growth, balanced-hug absorption, liveTail, and the never-nest guard.
 */
import { describe, expect, it } from 'vitest';
import { makeBidi } from '../bidi';

const LRI = '⁦';
const PDI = '⁩';
const kit = makeBidi();

describe('makeBidi — the shared isolation core', () => {
  it('isolates an LTR expression inside an RTL sentence', () => {
    const out = kit.isolateLtrRuns('z3 ברביע הראשון');
    expect(out).toBe(`${LRI}z3${PDI} ברביע הראשון`);
  });

  it('keeps a full equation — operators, spaces, digits — in ONE island', () => {
    const out = kit.isolateLtrRuns('המשפט לא נוסף: z1 = 3+4i');
    expect(out).toBe(`המשפט לא נוסף: ${LRI}z1 = 3+4i${PDI}`);
  });

  it('a quoted statement absorbs its hugging quotes', () => {
    const out = kit.isolateLtrRuns('אינו מתיישב עם: "z1 = 3+4i"');
    expect(out).toBe(`אינו מתיישב עם: ${LRI}"z1 = 3+4i"${PDI}`);
  });

  it('grows the span over a delimiter whose partner is inside (the stray-paren defect)', () => {
    const out = kit.isolateLtrRuns('הזווית של 2cis(30°) חיובית');
    expect(out).toContain(`${LRI}2cis(30°)${PDI}`);
  });

  it('leaves a pure-Hebrew or pure-LTR string untouched', () => {
    expect(kit.isolateLtrRuns('שלום לכולם')).toBe('שלום לכולם');
    expect(kit.isolateLtrRuns('z1 = 3+4i')).toBe('z1 = 3+4i');
  });

  it('never nests isolates', () => {
    const once = kit.isolateLtrRuns('z3 ברביע הראשון');
    expect(kit.isolateLtrRuns(once)).toBe(once);
  });

  it('trailing sentence punctuation stays OUTSIDE the island — unless liveTail', () => {
    expect(kit.isolateLtrRuns('הקלידו z1 = 5.')).toBe(`הקלידו ${LRI}z1 = 5${PDI}.`);
    // a line being typed has an incomplete expression, not punctuation — the run takes the tail
    expect(kit.isolateLtrRuns('הקלידו z1 = 5.', true)).toBe(`הקלידו ${LRI}z1 = 5.${PDI}`);
  });

  it('inputPreview returns null exactly when isolation changes nothing', () => {
    expect(kit.inputPreview('z1 = 3+4i')).toBeNull();
    expect(kit.inputPreview('z3 ברביע הראשון')).not.toBeNull();
  });

  it('textDir keys off ANY Hebrew letter, not the first strong character', () => {
    expect(kit.textDir('C במרחק 5')).toBe('rtl');
    expect(kit.textDir('z1 = 3+4i')).toBe('ltr');
  });

  it('extraCore extends the run alphabet', () => {
    const plain = makeBidi();
    const extended = makeBidi({ extraCore: '؋' });
    expect(plain.RUN_CORE.test('؋')).toBe(false);
    expect(extended.RUN_CORE.test('؋')).toBe(true);
  });

  it('declSplit renders a declaration as name island · separator · equation island', () => {
    const split = makeBidi({
      declSplit: (span) => {
        const m = /^(l)(\s*:\s*)(.+)$/.exec(span);
        return m && m[3].includes('=') ? [m[1], m[2], m[3]] : null;
      },
    });
    const out = split.isolateLtrRuns('הישר l: x=1 נחמד');
    expect(out).toBe(`הישר ${LRI}l${PDI}: ${LRI}x=1${PDI} נחמד`);
  });

  it('the postProcessor passes non-strings through untouched', () => {
    const p = kit.postProcessor('bidiTest');
    expect(p.process('z3 ברביע הראשון')).toContain(LRI);
    expect(p.process(42 as unknown as string)).toBe(42);
  });
});
