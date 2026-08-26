/**
 * #714 — the presets are actually RENDERED, with their translated names.
 *
 * The gap this closes: `view-presets-714.test.ts` proves the four cameras are the views they claim to
 * be, and proved nothing about whether a student can reach them. The operator played the round and
 * reported "I don't see what to test for 787" — the immediate cause was that the PR was unmerged, but
 * a camera-only test would not have caught a genuinely unreachable control either.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Figure3 from '../render/Figure3';
import { derive3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import type { Fact3 } from '../store/store3';

/** A minimal real figure — a box, through the real parse → derive path. */
function box() {
  const r = parse3("תיבה ABCDA'B'C'D'");
  if (!r.ok) throw new Error('the box must parse');
  const facts: Fact3[] = [{ id: 'f0', utterance: "תיבה ABCDA'B'C'D'", cmds: r.commands, enabled: true }];
  return derive3(facts, 0);
}

const LABELS = { front: 'מבט מלפנים', top: 'מבט מלמעלה', side: 'מבט מהצד', iso: 'מבט איזומטרי' };

describe('#714 — the presets are reachable, not just correct', () => {
  it('all four render, each carrying its translated accessible name', () => {
    const d = box();
    const html = renderToStaticMarkup(
      <Figure3 construction={d.construction} resolved={d.resolved} resetLabel="reset" presetLabels={LABELS} />,
    );
    for (const label of Object.values(LABELS)) {
      expect(html, `«${label}» must be reachable`).toContain(`aria-label="${label}"`);
    }
  });

  it('the glyphs are decorative — the NAME is the translated label, never the glyph', () => {
    const d = box();
    const html = renderToStaticMarkup(
      <Figure3 construction={d.construction} resolved={d.resolved} resetLabel="reset" presetLabels={LABELS} />,
    );
    // every preset button carries both title and aria-label, so a screen reader and a hover agree
    for (const label of Object.values(LABELS)) expect(html).toContain(`title="${label}"`);
  });

  it('WITHOUT labels the component stays translation-free — no presets, and no untranslated stubs', () => {
    const d = box();
    const html = renderToStaticMarkup(<Figure3 construction={d.construction} resolved={d.resolved} resetLabel="reset" />);
    for (const glyph of ['⬒', '⬓', '◧', '⬔']) expect(html, `${glyph} must not render unlabelled`).not.toContain(glyph);
    expect(html, 'the reset control is unaffected').toContain('aria-label="reset"');
  });
});
