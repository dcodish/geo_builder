/**
 * #2874 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 2) — THE WORKING LOOK IS SHOWN ONLY
 * AFTER THE THRESHOLD, and the page's own thread is not what waits.
 *
 * Operator, 2026-11-13, on "show the indicator only after about 0.3 s, so fast actions show nothing":
 * *"i go with your recommendations"*.
 *
 * What a unit test can hold is the CONTRACT that makes the delay work while the page computes; the delay itself
 * is measured in a browser (the amendment records it: the look arrives 320–330 ms into a wait during which the
 * page's thread ran nothing, and an action of 50–130 ms shows nothing).
 *
 *  1. The button is OFF from the first render of a working state, and its text is the working label alone — so
 *     Enter is off at once (ADR-W-198) and a reader of the document is never told two labels.
 *  2. Everything a working button changes is in that first render: the class that holds its strength, the
 *     working label with its mark, and the idle label as an attribute. Nothing is added later, because adding
 *     is the page thread's work.
 *  3. Every reveal is an animation of `opacity` alone, as long as the one threshold: the kind the compositor
 *     runs by itself. A `transition`, a delay on a property that needs layout or paint, or a second number
 *     would put the wait back on the page's thread.
 *  4. The button has one size: the face reserves the working label at rest and the idle label while working.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InputArea } from '../frame/InputArea';
import { WORKING_SHOWN_AFTER_MS, WorkingFace, workingDim } from '../frame/WorkingMark';

const base = { value: '', onChange: () => {}, onSubmit: () => {}, placeholder: 'p', submitLabel: 'הוסף', busyLabel: 'חושב…', symbols: [] };
const submitOf = (html: string) => /<button type="submit"[^>]*>.*?<\/button>/s.exec(html)?.[0] ?? '';
const textOf = (html: string) => html.replace(/<[^>]*>/g, '');
const SOURCE = readFileSync(path.resolve(__dirname, '../frame/WorkingMark.tsx'), 'utf8');
const CSS = /const CSS = `([\s\S]*?)`;/.exec(SOURCE)?.[1] ?? '';

describe('#2874 Am. 2 — the threshold', () => {
  it('is the 0.3 s the operator ruled', () => {
    expect(WORKING_SHOWN_AFTER_MS).toBe(300);
  });
});

describe('#2874 Am. 2 — the submit button', () => {
  it('at rest reads the idle label, is on, and carries no working class', () => {
    const b = submitOf(renderToStaticMarkup(<InputArea {...base} />));
    expect(textOf(b)).toBe('הוסף');
    expect(b).not.toMatch(/disabled/);
    expect(b).not.toMatch(/shell-working-dim/);
    expect(b).not.toMatch(/data-working=/);
    expect(b, 'the working label’s width is reserved at rest').toContain('data-busy="חושב…"');
  });

  it('while working is OFF at once and its text is the working label alone', () => {
    const b = submitOf(renderToStaticMarkup(<InputArea {...base} busy />));
    expect(b).toMatch(/<button type="submit" disabled=""/);
    expect(textOf(b), 'one label in the document, never two').toBe('חושב…');
  });

  it('while working carries the whole look in its first render: the held strength, the label with its mark, the idle label to draw over it', () => {
    const b = submitOf(renderToStaticMarkup(<InputArea {...base} busy />));
    expect(b).toContain('class="shell-working-dim-60"');
    expect(b, 'the strength it greys to is still its own style').toMatch(/opacity:0\.6/);
    expect(b).toContain('class="shell-working-busy"');
    expect(b).toContain('data-working-mark');
    expect(b).toContain('data-working=""');
    expect(b, 'the idle label is drawn from an attribute until the threshold').toContain('data-idle="הוסף"');
  });

  it('with no busy label of its own, a working button keeps its label and still shows the mark', () => {
    const b = submitOf(renderToStaticMarkup(<InputArea {...base} busyLabel={undefined} busy />));
    expect(textOf(b)).toBe('הוסף');
    expect(b).toContain('data-working-mark');
  });
});

describe('#2874 Am. 2 — the face and the dim, for any button', () => {
  it('workingDim names a class only while working, one per strength', () => {
    expect(workingDim(false, 0.6)).toBeUndefined();
    expect(workingDim(false, 0.5)).toBeUndefined();
    expect(workingDim(true, 0.6)).toBe('shell-working-dim-60');
    expect(workingDim(true, 0.5)).toBe('shell-working-dim-50');
  });

  it('the face holds one label in the document and the other as an attribute, either way', () => {
    const rest = renderToStaticMarkup(<WorkingFace working={false} idle="הציגו תצורה אחרת" busy="חושב…" />);
    const busy = renderToStaticMarkup(<WorkingFace working idle="הציגו תצורה אחרת" busy="חושב…" />);
    expect(textOf(rest)).toBe('הציגו תצורה אחרת');
    expect(textOf(busy)).toBe('חושב…');
    for (const html of [rest, busy]) {
      expect(html).toContain('data-idle="הציגו תצורה אחרת"');
      expect(html).toContain('data-busy="חושב…"');
    }
    expect(rest).not.toContain('data-working-mark');
  });

  it('the slack a button lends is passed to the face, and only when it lends some', () => {
    expect(renderToStaticMarkup(<WorkingFace working={false} idle="a" busy="b" slack={16} />)).toContain('--shell-working-slack:16px');
    expect(renderToStaticMarkup(<WorkingFace working={false} idle="a" busy="b" />)).not.toContain('--shell-working-slack');
  });
});

describe('#2874 Am. 2 — the reveal is the compositor’s, never the page thread’s', () => {
  const REVEALS = ['shell-working-in', 'shell-working-out', 'shell-working-dim-60', 'shell-working-dim-50'];

  it('the stylesheet was read', () => {
    expect(CSS.length).toBeGreaterThan(500);
    expect(CSS).toContain('${WORKING_SHOWN_AFTER_MS}ms');
  });

  it('each reveal’s keyframes change opacity and nothing else, and hold the first value to the end', () => {
    for (const name of REVEALS) {
      const body = new RegExp(String.raw`@keyframes ${name} \{(.*)\}\s*$`, 'm').exec(CSS)?.[1] ?? '';
      expect(body, name).toMatch(/^\s*0%, 99\.9% \{ opacity: [\d.]+; \} 100% \{ opacity: [\d.]+; \}\s*$/);
    }
  });

  it('each reveal is used with the one threshold as its length, and stays at its end value', () => {
    const uses = [...CSS.matchAll(/animation: (shell-working-(?:in|out|dim-\d+)) ([^;]+);/g)];
    expect(uses.map((u) => u[1]).sort()).toEqual([...REVEALS].sort());
    for (const u of uses) expect(u[2], u[1]).toBe('${WORKING_SHOWN_AFTER_MS}ms linear forwards');
  });

  it('nothing in the indicator waits by a transition or an animation delay', () => {
    expect(CSS).not.toMatch(/transition/);
    expect(CSS).not.toMatch(/animation-delay/);
  });

  it('the face reserves the working label at rest, and draws the idle label over the working one until the threshold', () => {
    expect(CSS).toMatch(/\.shell-working-face::after \{[^}]*content: attr\(data-busy\)[^}]*visibility: hidden/);
    expect(CSS).toMatch(/\.shell-working-face\[data-working\]::before \{[^}]*content: attr\(data-idle\)[^}]*animation: shell-working-out/);
    expect(CSS, 'the working label is centred over the face, so it never sets the button’s size').toMatch(/\.shell-working-busy \{[^}]*position: absolute/);
  });
});
