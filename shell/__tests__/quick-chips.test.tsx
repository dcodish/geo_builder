/**
 * #751 (ADR-W-029) — the chip's LABEL and its COMMAND are two values.
 *
 * The component used to render the same string it submitted, so any caller handing it a
 * post-processed `t()` value shipped the display form — Unicode isolates and all — into the fact
 * list. The plan deliberately fixed the shared CONTRACT rather than the two call sites: a
 * one-line-per-product fix would have left this component still able to conflate them.
 *
 * Locked here at the component, so a future product cannot re-introduce the defect by wiring the
 * chips the old way.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuickChips } from '../frame/QuickChips';
import { makeBidi, stripFormatControls } from '../bidi';

const kit = makeBidi();
const CONTROLS = /[؜​-‏‪-‮⁦-⁩﻿]/;
const RAW = ['טרפז ABCD חסום במעגל', 'קובייה ABCD'];

describe('QuickChips', () => {
  it('renders the display form but hands onPick the RAW command', () => {
    const picked: string[] = [];
    const chips = QuickChips({
      title: 't',
      hint: 'h',
      commands: RAW,
      display: kit.isolateLtrRuns,
      onPick: (c) => picked.push(c),
    });
    // the rendered markup carries the isolates (that is what `display` is for)
    const html = renderToStaticMarkup(chips);
    expect(CONTROLS.test(html)).toBe(true);
    expect(stripFormatControls(html)).toContain('טרפז ABCD חסום במעגל');

    // ...and the click still yields the raw command
    const onPick = vi.fn();
    const props = { title: 't', hint: 'h', commands: RAW, display: kit.isolateLtrRuns, onPick };
    const tree = QuickChips(props) as { props: { children: unknown[] } };
    const row = (tree.props.children as { props: { children: unknown } }[])[2];
    const buttons = (row.props.children as { props: { onClick: () => void } }[]);
    buttons.forEach((b) => b.props.onClick());
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(RAW);
    expect(onPick.mock.calls.every(([c]) => !CONTROLS.test(c as string))).toBe(true);
    expect(picked).toEqual([]); // the first render was never clicked
  });

  it('without `display` the label IS the command — an unisolated product still works', () => {
    const html = renderToStaticMarkup(QuickChips({ title: 't', hint: 'h', commands: RAW, onPick: () => {} }));
    expect(CONTROLS.test(html)).toBe(false);
    expect(html).toContain('קובייה ABCD');
  });
});
