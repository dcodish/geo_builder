/**
 * #1391 ([ADR-W-051](../../../docs/06w-decisions-workspace.md#adr-w-051), FR-EX-3) — the analytic
 * clean-export lock: a downloaded image never contains on-screen chrome.
 *
 * Found on prod: «הורידו תמונה» exported the dashed crossing-offer rings (one per crossing, one around a
 * circle's centre), because none of analytic's chrome was inside `[data-noexport]`. The shared rasteriser
 * (`shell/export/svgToPng`) strips exactly that subtree, so the opt-in is this renderer's tagging. The
 * other three builders have had this lock since #713; analytic's image export only started working on
 * 2026-09-23 (#1378), so the question had never come up for it.
 *
 * The lock renders the same figure with EVERY chrome affordance the renderer takes switched ON (crossing
 * offers, the pick handler that paints the hit layer and each point's hit ring), strips the markup the way
 * the rasteriser does, and asserts that the ink is the chrome-free render. A new affordance must be added
 * here with its prop ON, or it ships in the download untested. (Pattern copied from the 2-D lock, never
 * imported.)
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Figure } from '../Figure';
import { buildScene } from '../scene';
import { derive } from '../../engine/derive';
import { crossingsOf } from '../../engine/crossings';
import { normalizeForExport, stripNoExport } from '../../../shell/export/exportMarkup';

describe('#1391 — analytic: the export is the chrome-free render', () => {
  // the prod report's own figure: a circle and a line through it
  const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'נתון הישר l1: y=x']);
  const box = { minX: -2, minY: -2, maxX: 9, maxY: 9 };
  const crossings = [
    ...crossingsOf(d.figure, d.construction).map((k) => ({ id: k.id, x: k.x, y: k.y, sentence: `crossing ${k.id}` })),
    // the centre offer (#1109) rides the same list in the app
    { id: 'centre-I', x: 3, y: 4, sentence: 'name the centre' },
  ];

  const plain = renderToStaticMarkup(<Figure scene={buildScene(d.figure, box, 600, 600)} />);
  const withChrome = renderToStaticMarkup(
    <Figure scene={buildScene(d.figure, box, 600, 600, { crossings })} onCrossing={() => {}} onPick={() => {}} />,
  );

  it('the chrome is really on (the fixture is not vacuous)', () => {
    expect(crossings.length).toBeGreaterThanOrEqual(3);
    expect(withChrome).not.toBe(plain);
    expect(withChrome).toContain('data-crossing');
    expect(withChrome).toContain('data-noexport');
  });

  it('after the strip, the ink equals the chrome-free render', () => {
    expect(normalizeForExport(withChrome)).toBe(normalizeForExport(plain));
  });

  it('no crossing ring and no hit target survives the strip', () => {
    const stripped = stripNoExport(withChrome);
    expect(stripped).not.toContain('data-noexport');
    expect(stripped).not.toContain('data-crossing');
    expect(stripped).not.toContain('stroke="transparent"');
    expect(stripped).not.toContain('fill="transparent"');
    expect(stripped).not.toContain('cursor:pointer');
  });
});
