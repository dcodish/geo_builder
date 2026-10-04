/**
 * #1459 (ADR-W-112) — below the stack breakpoint the INPUT sits above the canvas, in every builder.
 *
 * Operator ruling 2026-09-27: *"input above the canvas"*. On a portrait tablet the stacked layout put
 * the figure first and the input under it (analytic: y = 1092 of a 1080 viewport), so after «הוסף»
 * the student could not see the figure they had changed. All four builders lay out through the one
 * shared `Workbench`, so the lock is on it: the DOM order (which is also the tab and screen-reader
 * order) is entry → canvas → fact list → data when narrow, and the wide three-column layout is
 * unchanged. The fact list is its own zone because, above the canvas, a list that grows with every
 * add pushed the figure back off the screen (analytic: canvas top at y = 958 of 1080).
 *
 * The screenshot evidence at 810×1080 / 390×844 / 1440×900 for all four products is in the round
 * report; this lock is the part that runs in the suite.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workbench } from '../frame/Workbench';

function render(narrow: boolean): string {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: narrow, addEventListener() {}, removeEventListener() {} }) });
  return renderToStaticMarkup(
    <Workbench
      inputZone={<div data-zone="input">INPUT</div>}
      factsZone={<div data-zone="facts">FACTS</div>}
      canvasZone={<div data-zone="canvas">CANVAS</div>}
      dataZone={<div data-zone="data">DATA</div>}
      emptyOverlay={<div data-zone="chips">CHIPS</div>}
    />,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('#1459 — the stacked (narrow) workbench', () => {
  it('orders entry → canvas → fact list → data in the DOM', () => {
    const html = render(true);
    const at = (z: string) => html.indexOf(`data-zone="${z}"`);
    for (const z of ['input', 'facts', 'canvas', 'data', 'chips']) expect(at(z), z).toBeGreaterThanOrEqual(0);
    expect(at('input')).toBeLessThan(at('canvas'));
    expect(at('canvas')).toBeLessThan(at('facts'));
    expect(at('facts')).toBeLessThan(at('data'));
  });

  it('keeps the empty-state chips over the CANVAS, not with the input', () => {
    const html = render(true);
    const canvasCard = html.slice(html.indexOf('<section'), html.indexOf('</section>'));
    expect(canvasCard).toContain('data-zone="canvas"');
    expect(canvasCard).toContain('data-zone="chips"');
    expect(canvasCard).not.toContain('data-zone="input"');
    expect(canvasCard).not.toContain('data-zone="facts"');
  });
});

describe('#1459 — the wide workbench is unchanged', () => {
  it('is still the three-column row: input aside (entry, then list), canvas section, data aside', () => {
    const html = render(false);
    expect(html.match(/<aside/g)).toHaveLength(2);
    const firstAside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    expect(firstAside).toContain('data-zone="input"');
    expect(firstAside).toContain('data-zone="facts"');
    const at = (z: string) => html.indexOf(`data-zone="${z}"`);
    expect(at('input')).toBeLessThan(at('facts'));
    expect(at('facts')).toBeLessThan(at('canvas'));
    expect(at('input')).toBeLessThan(at('canvas'));
    expect(at('canvas')).toBeLessThan(at('data'));
    expect(html).toContain('calc(100vh - 126px)');
  });
});
