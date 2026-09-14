/**
 * #713 ([ADR-W-051](../../../docs/06w-decisions-workspace.md#adr-w-051)) — the 3-D clean-export lock: a
 * downloaded image never contains on-screen chrome.
 *
 * Measured before this lock: the 3-D renderer painted two interaction-only things inside its SVG and
 * tagged neither — the #483 crossing OFFER (a hollow dashed dot with a transparent hit ring, "click to
 * name") and the #578 point hit rings — while the shared rasteriser (`shell/export/svgToPng`) strips
 * only `[data-noexport]`. So a worksheet PNG carried a dashed "available" dot that is not part of the
 * figure. The lock renders the same figure with every chrome prop ON (`onNameCrossing`, `onRenamePoint`),
 * strips the markup the way the rasteriser does, and asserts the ink is the chrome-free render. A new
 * chrome affordance must be added HERE with its prop ON, or it ships in the download untested.
 * (Pattern copied from the 2-D lock, never imported across the product boundary.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Figure3 from '../Figure3';
import { derive3, useGeo3 } from '../../store/store3';
import { normalizeForExport, stripNoExport } from '../../../shell/export/exportMarkup';

const submit = (u: string) => useGeo3.getState().submit(u);
const RENAME = { title: 'rename', placeholder: 'new letter', apply: 'apply', taken: 'taken', bad: 'bad' };

describe('#713 — 3-D: the export is the chrome-free render', () => {
  beforeEach(() => useGeo3.getState().clear());

  /** The #483 figure: a ⟂ line and plane whose crossing is knowledge — the renderer OFFERS it. */
  const figure = () => {
    submit('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
    submit('המישור π: 3x + my + (m+6)z + 4 = 0');
    submit('הישר ℓ ניצב למישור π');
    const d = derive3(useGeo3.getState().facts, 0);
    return { construction: d.construction, resolved: d.resolved };
  };

  it('the chrome is really on: the offer and the hit rings are painted, and tagged', () => {
    const { construction, resolved } = figure();
    const plain = renderToStaticMarkup(<Figure3 construction={construction} resolved={resolved} resetLabel="reset" />);
    const withChrome = renderToStaticMarkup(
      <Figure3 construction={construction} resolved={resolved} resetLabel="reset" onNameCrossing={() => {}} crossingLabel="name" onRenamePoint={() => ({ ok: true })} renameText={RENAME} />,
    );
    expect(withChrome).not.toBe(plain);
    expect(withChrome, 'the dashed offer dot').toContain('stroke-dasharray="2.5 2"');
    expect(withChrome, 'the transparent hit rings').toContain('fill="transparent"');
    expect(withChrome).toContain('data-noexport');
  });

  it('after the strip, the ink equals the chrome-free render', () => {
    const { construction, resolved } = figure();
    const plain = renderToStaticMarkup(<Figure3 construction={construction} resolved={resolved} resetLabel="reset" />);
    const withChrome = renderToStaticMarkup(
      <Figure3 construction={construction} resolved={resolved} resetLabel="reset" onNameCrossing={() => {}} crossingLabel="name" onRenamePoint={() => ({ ok: true })} renameText={RENAME} />,
    );
    expect(normalizeForExport(withChrome)).toBe(normalizeForExport(plain));
    const stripped = stripNoExport(withChrome);
    expect(stripped, 'no dashed offer in the download').not.toContain('stroke-dasharray="2.5 2"');
    expect(stripped, 'no hit ring in the download').not.toContain('fill="transparent"');
  });
});
