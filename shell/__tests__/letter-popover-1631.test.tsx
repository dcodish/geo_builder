/**
 * #1631 — the shared letter popover: its decisions, and the look it carries over from 2-D.
 *
 * The decisions are pure (`letterOffer.ts`) so they are called here, not reproduced
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)); the component is rendered statically for what a
 * first render shows. The cross-product behaviour — each builder's REAL store answering it — is the §5c
 * lock (`fixtures/letter-swap-rows.ts`, its meta-lock beside this file, and one thin lock per tree).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LetterPopover, letterPopoverBtn } from '../frame/LetterPopover';
import { afterRename, afterSwap, fillLetters, swapOffered, typedLetter } from '../frame/letterOffer';

const STRINGS = {
  placeholder: 'אות',
  apply: 'החילו',
  taken: 'האות כבר בשימוש',
  bad: 'אות לא תקינה',
  takenBy: 'האות תפוסה על ידי: «{{what}}»',
  swapLetters: 'החליפו בין {{a}} ל-{{b}}',
};

describe('#1631 — the popover decisions', () => {
  it('a rename that went through closes the popover', () => {
    expect(afterRename({ ok: true }, 'D')).toEqual({ close: true, note: null, takenBy: null });
  });

  it('a taken letter stays OPEN, says so, and carries the holder and the asked-for letter (the offer)', () => {
    const holder = { text: 'משולש ABC' };
    expect(afterRename({ ok: false, reason: 'taken', holder }, 'B')).toEqual({ close: false, note: 'taken', takenBy: { holder, to: 'B' } });
  });

  it('a taken letter with no known holder says «taken» and offers nothing', () => {
    expect(afterRename({ ok: false, reason: 'taken', holder: null }, 'B')).toEqual({ close: false, note: 'taken', takenBy: null });
  });

  it('any other refusal — including a product reason like busy — is the «invalid» note, no offer', () => {
    expect(afterRename({ ok: false, reason: 'bad' }, '3')).toEqual({ close: false, note: 'bad', takenBy: null });
    expect(afterRename({ ok: false, reason: 'busy', holder: { text: 'x' } }, 'B')).toEqual({ close: false, note: 'bad', takenBy: null });
  });

  it('the swap offer is shown wherever a letter has a holder — and only then (#1199)', () => {
    expect(swapOffered({ text: 'x' })).toBe(true);
    expect(swapOffered(null)).toBe(false);
    expect(swapOffered(undefined)).toBe(false);
  });

  it('a swap that went through closes; a refused one stays open with the note', () => {
    expect(afterSwap({ ok: true })).toEqual({ close: true, note: null });
    expect(afterSwap({ ok: false })).toEqual({ close: false, note: 'bad' });
  });

  it('the typed letter is trimmed and upper-cased; the strings are filled from the caller’s template', () => {
    expect(typedLetter('  d ')).toBe('D');
    expect(typedLetter("a'")).toBe("A'");
    expect(fillLetters(STRINGS.swapLetters, { a: 'A', b: 'B' })).toBe('החליפו בין A ל-B');
    expect(fillLetters(STRINGS.takenBy, { what: 'נקודה D' })).toBe('האות תפוסה על ידי: «נקודה D»');
  });
});

describe('#1631 — the popover as first rendered', () => {
  const render = (extra: Partial<Parameters<typeof LetterPopover>[0]> = {}) =>
    renderToStaticMarkup(
      <LetterPopover x={10} y={20} bounds={{ width: 400, height: 300 }} title="A" label="A" onRename={() => ({ ok: true })} strings={STRINGS} onClose={() => {}} {...extra} />,
    );

  it('opens with the letter input focused, the caller’s placeholder and title, and the ✓', () => {
    const html = render();
    expect(html).toMatch(/<input[^>]*autofocus/i);
    expect(html).toContain('placeholder="אות"');
    expect(html).toContain('maxLength="3"');
    expect(html).toContain('title="החילו"');
    expect(html).toContain('✓');
  });

  it('the label length is the caller’s (3-D types C1′ in four characters)', () => {
    expect(render({ maxLength: 4 })).toContain('maxLength="4"');
  });

  it('no rename callback = no input (2-D: a hidden point offers only «show label»), and the caller’s items render below', () => {
    const html = render({ onRename: undefined, children: <button type="button">הציגו תווית</button> });
    expect(html).not.toContain('<input');
    expect(html).toContain('הציגו תווית');
  });

  it('it is anchored by PHYSICAL left at the click, clamped into the canvas (2-D F1/REN-1 — never mirrored under RTL)', () => {
    expect(render()).toContain('left:18px');
    expect(render({ x: 1000 })).toContain('left:250px');
    expect(render()).not.toMatch(/inset-inline-start/);
  });

  it('nothing is noted or offered before the student types', () => {
    const html = render();
    expect(html).not.toContain(STRINGS.taken);
    expect(html).not.toContain('החליפו בין');
  });

  it('the buttons DECLARE their colour, so a live offer never reads as disabled (ADR-520 Am. 2)', () => {
    expect(String(letterPopoverBtn.color)).toContain('--color-text');
    expect(String(letterPopoverBtn.color)).not.toContain('muted');
  });
});
