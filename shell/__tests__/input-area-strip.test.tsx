/**
 * #1088 — the SAME contract as `quick-chips.test.tsx`, on the other component that renders commands.
 *
 * #751 (ADR-W-029) separated a chip's LABEL from its COMMAND in `QuickChips`. `InputArea` has its own
 * quick strip, written to the same purpose, and it never got the seam: it rendered `{cmd}` raw. 2-D and
 * 3-D pass no `quickCommands` at all, so the gap sat unexercised until the analytic builder — whose every
 * command is a Hebrew sentence carrying an equation — became the first consumer and the operator read
 * «(x-3)^2+(y-4)^2=9» back as «2+(y-4)^2=9^(x-3)».
 *
 * Locked at the component, in the shape #751 chose, so the contract cannot hold on one path only again.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InputArea } from '../frame/InputArea';
import { makeBidi, stripFormatControls } from '../bidi';

const kit = makeBidi({ extraCore: '_' });
const CONTROLS = /[؜​-‏‪-‮⁦-⁩﻿]/;
const RAW = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';

const base = {
  value: '',
  onChange: () => {},
  onSubmit: () => {},
  placeholder: 'p',
  submitLabel: 's',
  symbols: [],
  quickCommands: [RAW],
};

describe('#1088 — InputArea’s quick strip has the display seam', () => {
  it('renders the display form', () => {
    const html = renderToStaticMarkup(
      <InputArea {...base} onQuickCommand={() => {}} quickDisplay={kit.isolateLtrRuns} />,
    );
    expect(CONTROLS.test(html)).toBe(true);
    // The equation survives as ONE isolated run — which is the whole point: an unisolated run under an
    // RTL base reorders the student's own characters.
    expect(html).toContain('⁦(x-3)^2+(y-4)^2=9⁩');
    expect(stripFormatControls(html)).toContain(RAW);
  });

  it('keeps the RAW command alongside the display form', () => {
    // The strip holds both values: `quickDisplay` is handed the command the student would have
    // typed, and only its RETURN reaches the label. (The other half of the contract — that a click
    // submits the raw command — is the shared one, locked on `QuickChips` by #751's own test; these
    // components render from the same `quickCommands` array binding.)
    const seen: string[] = [];
    const html = renderToStaticMarkup(
      <InputArea
        {...base}
        onQuickCommand={() => {}}
        quickDisplay={(c) => {
          seen.push(c);
          return 'DISPLAY-ONLY';
        }}
      />,
    );
    expect(seen).toEqual([RAW]);
    expect(html).toContain('DISPLAY-ONLY');
    expect(html).not.toContain('(x-3)');
  });

  it('without the seam it renders the command itself — the pre-#1088 behaviour, kept for callers with no bidi', () => {
    const html = renderToStaticMarkup(<InputArea {...base} onQuickCommand={() => {}} />);
    expect(CONTROLS.test(html)).toBe(false);
    expect(html).toContain('(x-3)^2+(y-4)^2=9');
  });
});
