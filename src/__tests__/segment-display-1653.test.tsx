/**
 * #1653 — the 2-D builder conforms to the shared segment-display contract (docs/28 §5c rule 3).
 *
 * This tree's thin lock on `shell/__tests__/fixtures/segment-display-rows.ts`: the REAL store toggles
 * (`toggleSegHidden` / `toggleSegDashed`, what App wires to the shared `SegmentMenu`), the REAL renderer
 * (`render/Figure.tsx`, read off its static markup), the real replay, and the real save path
 * (`figureStateOf` → `serializeFigure` → `deserializeFigure` → `loadFigure`, what the save button and the
 * loader run) — never a re-implementation of any of them.
 *
 * No `undo`: 2-D's segment display is a display preference outside the undo slice (FR-RN-10 — the
 * student reverses it with the menu's second press; `hidden.test.ts`). The shared rows run the «show
 * restores» row instead. Whether 2-D should join the analytic builder in undoing a hide is ADR-W-106's
 * open question, not this lock's to decide.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { replay, useGeoStore } from '@/store/geoStore';
import { deserializeFigure, figureStateOf, serializeFigure } from '@/store/figureFile';
import { parse, buildParseCtx } from '@/parser';
import { Figure } from '@/render/Figure';
import { segmentDisplayFaults, type InkSeen } from '../../shell/__tests__/fixtures/segment-display-rows';

const s = () => useGeoStore.getState();
const fig = () => replay(s().facts, s().seed);

function submit(u: string) {
  const { construction, positions } = fig();
  const r = parse(u, buildParseCtx(construction, positions));
  if (!r.ok) throw new Error(`test utterance did not parse: ${u}`);
  s().executeMany(r.commands, u);
}

function inkOf(id: string): InkSeen {
  const { construction, positions } = fig();
  const noop = () => {};
  const html = renderToStaticMarkup(
    <Figure construction={construction} positions={positions} segStyle={s().segStyle} onToggleSegHidden={noop} onToggleSegDashed={noop} />,
  );
  const m = html.match(new RegExp(`data-id="${id}" data-ink="(\\w+)"`));
  return (m?.[1] as InkSeen | undefined) ?? 'absent';
}

describe('#1653 — the 2-D builder conforms to the shared segment-display contract', () => {
  it('a square’s side', () => {
    const faults = segmentDisplayFaults({
      setup: () => {
        s().clear();
        submit('ריבוע ABCD');
      },
      toggleHidden: () => s().toggleSegHidden('seg-AB'),
      toggleDashed: () => s().toggleSegDashed('seg-AB'),
      ink: () => inkOf('seg-AB'),
      // the segment stays in the construction with both ends placed — a hide changes no fact
      measurable: () => {
        const { construction, positions } = fig();
        return construction.objects.some((o) => o.id === 'seg-AB') && !!positions.get('A') && !!positions.get('B');
      },
      statements: () => s().facts.map((f) => f.utterance ?? ''),
      saveLoad: () => {
        const json = serializeFigure(figureStateOf(s()));
        s().clear();
        const r = deserializeFigure(json);
        if (!r.ok) throw new Error(`2-D save did not load: ${r.reason}`);
        s().loadFigure(r.file);
      },
    });
    expect(faults).toEqual([]);
  });
});
