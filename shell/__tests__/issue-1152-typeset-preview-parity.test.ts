/**
 * #1152 — THE INPUT'S LIVE PREVIEW TYPESETS MATHEMATICS, IN EVERY BUILDER.
 *
 * **Operator, 2026-09-16**, typing «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9» into the analytic input:
 * *"on data input — the bidi text should also be MathML so the squared needs to show nice."*
 *
 * The strip under the box already repairs the bidi — that is what it is for. It rendered that repaired
 * sentence as PLAIN TEXT, so `(x-3)^2` kept its caret a few pixels above a fact row showing a real
 * superscript: the student's own equation, two ways, in two elements.
 *
 * #1082 ruled that mathematics is typeset rather than printed and #1097 already had to chase that
 * ruling into a second panel. This is the third surface, and the shape of the defect is sibling drift:
 * the mechanism shipped in the oldest tree and the younger ones were written from the older template.
 *
 * ## Two things a naive port gets wrong, and both are asserted
 *
 * 1. **ISOLATE FIRST, THEN TYPESET.** 2-D's line typesets the RAW string. Copying it verbatim into an
 *    RTL-Hebrew product would typeset unisolated text and could reorder the equation — the very thing
 *    the strip exists to prevent. Every RTL builder must pass `isolateLtrRuns(…)` output to `MathText`.
 * 2. **The trigger is `hasMath`, not the isolation.** `inputPreview` returns `null` when isolation
 *    changes nothing, so a pure-LTR equation (`(x-3)^2+(y-4)^2=9`) had no strip at all. It gets one
 *    now — the strip stops being "a bidi repair" and becomes "what you typed, typeset".
 *
 * ## Why this is a source scan and why it still CALLS the decision
 *
 * `shell/` may not import a product tree ([ADR-W-016](../../docs/06w-decisions-workspace.md) rule 2), so
 * the wiring is asserted by reading each App — the `row-parity` / `import-direction` pattern. But the
 * DECISION under test — *does this string contain mathematics?* — is never restated here: the rows below
 * call the real `hasMath`, and the scan only checks that each builder routes through it. A lock that
 * re-implemented "contains mathematics" beside the products would stay green through the change that
 * breaks them ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasMath } from '../math';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a parse crash here. */
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** Every builder in the suite. Adding builder five means adding one line here. */
const APPS = [
  { product: '2-D', file: 'src/App.tsx' },
  { product: '3-D', file: 'src3d/App3.tsx' },
  { product: 'complex', file: 'src-complex/App.tsx' },
  { product: 'analytic', file: 'src-analytic/App.tsx' },
] as const;

/** The `preview={…}` prop's expression, which is the thing under test. */
function previewExpr(file: string): string {
  const src = read(file);
  const at = src.indexOf('preview={');
  expect(at, `${file} must pass a preview to the input`).toBeGreaterThanOrEqual(0);
  // Far enough to cover the multi-line arrow the typeset form needs, and no further.
  return src.slice(at, at + 400);
}

describe('#1152 — every builder typesets mathematics in the input preview', () => {
  it.each(APPS)('$product routes its preview through hasMath + MathText', ({ file }) => {
    const expr = previewExpr(file);
    expect(expr, `${file}: the preview must decide on hasMath(...)`).toContain('hasMath(s)');
    expect(expr, `${file}: and render it with MathText`).toContain('MathText');
  });

  /**
   * THE RTL TRAP. 2-D is excluded by name and with its reason: it is the tree the mechanism came from
   * and it typesets the raw string. Every builder that JOINED via this port must isolate first — which
   * is exactly the mistake a verbatim copy would make.
   */
  it.each(APPS.filter((a) => a.product !== '2-D'))(
    '$product isolates BEFORE typesetting — the raw string never reaches MathText',
    ({ file }) => {
      const expr = previewExpr(file);
      expect(
        /MathText text=\{[A-Za-z0-9_.]*[iI]solateLtrRuns3?\(/.test(expr),
        `${file}: MathText must receive isolated text, not the raw input`,
      ).toBe(true);
    },
  );
});

/**
 * THE TRIGGER ITSELF, called rather than described. These rows are what make the scan above mean
 * something: they fix WHAT `hasMath` answers for the strings the ruling is about, so a change that
 * narrowed it would fail here instead of silently emptying every builder's preview.
 */
describe('#1152 — what counts as mathematics', () => {
  it.each([
    ['(x-3)^2+(y-4)^2=9', true],
    ['x^2', true],
    ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', true],
    ['משולש ABC', false],
    ['נקודה D', false],
  ])('hasMath(%s) = %s', (text, expected) => {
    expect(hasMath(text)).toBe(expected);
  });

  /**
   * The product choice this change makes explicit: a pure-LTR equation has no bidi work to do, so it
   * had NO strip at all. `hasMath` is true for it, so it gets one now.
   */
  it('a pure-LTR equation is mathematics, so it now gets a strip where it had none', () => {
    expect(hasMath('(x-3)^2+(y-4)^2=9')).toBe(true);
  });
});
