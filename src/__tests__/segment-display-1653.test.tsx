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
import { hiddenRowGroups, lonePoints } from '@/app/hideOwnership';

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

/**
 * #2852 (ADR-825) — hiding a segment hides what exists only for it: its length, its knee, and a foot the TOOL named
 * that no other row uses. Never a point the student named or one another drawn line uses. Read off the REAL canvas
 * (`Figure`, static markup — the markup the image export serialises, so what is not here is not exported), fed the
 * REAL `lonePoints` over the store's facts, as App wires it.
 */
describe('#2852 — a hidden segment takes its value, its marks and a point that exists only for it', () => {
  function canvas(): string {
    const d = fig();
    const noop = () => {};
    return renderToStaticMarkup(
      <Figure
        construction={d.construction}
        positions={d.positions}
        labels={d.labels}
        angleMarks={d.angleMarks}
        segStyle={s().segStyle}
        lonePoints={lonePoints(s().facts, d.construction)}
        onToggleSegHidden={noop}
        onToggleSegDashed={noop}
      />,
    );
  }
  const has = (html: string, id: string) => html.includes(`data-id="${id}"`);
  const valueShown = (html: string, v: string) => new RegExp(`>${v}</text>`).test(html);
  const knees = (html: string) => (html.match(/<polyline[^>]*stroke="#1d4ed8"/g) ?? []).length;
  const rows = () => {
    const d = fig();
    return hiddenRowGroups(s().facts, new Map(d.construction.objects.flatMap((o) => (o.kind === 'segment' && s().segStyle[o.id]?.hidden ? [[o.id, [o.a, o.b] as [string, string]] as const] : []))));
  };

  it('«משולש ABC» · «AB = 5», hide AB: the AB ghost, no «5»; A, B, C and the other sides drawn; the row marked; show restores', () => {
    s().clear();
    submit('משולש ABC');
    submit('AB = 5');
    expect(valueShown(canvas(), '5')).toBe(true);
    s().toggleSegHidden('seg-AB');
    const html = canvas();
    expect(html).toMatch(/data-id="seg-AB" data-ink="ghost"/);
    expect(valueShown(html, '5')).toBe(false);
    for (const p of ['A', 'B', 'C']) expect(has(html, p)).toBe(true);
    expect(html).toMatch(/data-id="seg-BC" data-ink="solid"/);
    expect([...rows().keys()]).toHaveLength(1);
    expect(s().facts.find((f) => rows().has(f.group ?? f.id))?.utterance).toBe('AB = 5');
    s().toggleSegHidden('seg-AB');
    expect(valueShown(canvas(), '5')).toBe(true);
    expect(rows().size).toBe(0);
  });

  it('a height whose foot the TOOL named («גובה מ-C לצלע AB» → F), hidden: F goes with it; show brings F back', () => {
    s().clear();
    submit('משולש ABC');
    submit('גובה מ-C לצלע AB');
    const seg = fig().construction.objects.find((o) => o.kind === 'segment' && [o.a, o.b].includes('C') && !['A', 'B'].some((p) => [(o as { a: string }).a, (o as { b: string }).b].includes(p)))!;
    const foot = [(seg as { a: string }).a, (seg as { b: string }).b].find((p) => p !== 'C')!;
    expect(has(canvas(), foot)).toBe(true);
    s().toggleSegHidden(seg.id);
    const html = canvas();
    expect(has(html, foot)).toBe(false);
    for (const p of ['A', 'B', 'C']) expect(has(html, p)).toBe(true);
    expect(rows().size).toBe(1);
    s().toggleSegHidden(seg.id);
    expect(has(canvas(), foot)).toBe(true);
  });

  it('a height whose foot the STUDENT named («CH גובה לצלע AB»), hidden: the knee at H goes, H stays', () => {
    s().clear();
    submit('משולש ABC');
    submit('CH גובה לצלע AB');
    expect(knees(canvas())).toBe(1);
    s().toggleSegHidden('seg-CH');
    const html = canvas();
    expect(knees(html)).toBe(0);
    expect(has(html, 'H')).toBe(true);
  });

  it('a tool-named foot another row uses stays («M אמצע CF» holds F)', () => {
    s().clear();
    submit('משולש ABC');
    submit('גובה מ-C לצלע AB');
    const seg = fig().construction.objects.find((o) => o.id.startsWith('seg-') && o.id.includes('C') && o.id !== 'seg-BC' && o.id !== 'seg-AC')!;
    const foot = seg.id.replace('seg-', '').replace('C', '');
    submit(`M אמצע C${foot}`);
    s().toggleSegHidden(seg.id);
    expect(has(canvas(), foot)).toBe(true);
  });
});
