/**
 * #2021 (ADR-CX-085) — the ORIGIN can be MARKED as a point.
 *
 * The operator, playing round #1998 T31: *"i wanted to be able to mark the center of axis (0,0) and there
 * is no way to do it"*. His ruling (2026-10-12): *"O should be recognized and the center. and ראשית
 * הצירים shold also be recognized"* — so «O ראשית הצירים», «נקודה O», a bare «O» and «ראשית הצירים»
 * each mark the origin. Before this, every one was `not-handled`, and a bare «O» went to the ask lane.
 *
 * The marker is an OBJECT, never a number: it declares nothing, adds no point and no free DOF, and
 * leaves the reserved-constant refusal («o ממשי») exactly as it was.
 *
 * Everything runs through the real `submitLine` → `deriveLines` → `buildScene` → `PolarPlane` path.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { activeLines, submitLine, toggleLine } from '../app/submit';
import { deriveLines } from '../app/deriveLines';
import { parseLineV2 } from '../parser/rules';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };
const scene = () => buildScene(deriveLines(activeLines(), store().seed, store().seed, []));

/** The operator's case: «z1 = 3+4i» · «w = z1*i», then the marking line. */
const play = (line: string): boolean => {
  submitLine('z1 = 3+4i');
  submitLine('w = z1*i');
  return submitLine(line);
};

const SPELLINGS = [
  // the ruling's four
  'O',
  'O ראשית הצירים',
  'נקודה O',
  'ראשית הצירים',
  // the same noun in the other word orders and with the copula
  'O היא ראשית הצירים',
  'ראשית הצירים O',
  'הנקודה O',
  'הראשית O',
  // "and the center"
  'מרכז הצירים',
  'O מרכז הצירים',
  // English twins
  'O is the origin',
  'the origin',
  'point O',
  'the origin O',
];

describe('#2021 — every spelling marks the origin', () => {
  it.each(SPELLINGS)('«%s» is recorded as a given and draws O at (0,0)', (line) => {
    expect(play(line)).toBe(true);
    expect(store().lastError).toBeNull();
    // a GIVEN, not a question in the ask lane
    expect(activeLines()).toEqual(['z1 = 3+4i', 'w = z1*i', line]);
    expect(store().queries).toEqual([]);
    const marks = scene().marks;
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toBe('O');
    expect(marks[0].z).toEqual({ re: 0, im: 0 });
  });

  it.each(SPELLINGS)('«%s» lowers to an origin object that declares nothing', (line) => {
    const r = parseLineV2(line);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.line.objects.map((o) => o.kind)).toEqual(['origin']);
    expect(r.line.declares).toEqual([]);
    expect(r.line.constraints).toEqual([]);
    expect(r.line.exprQueries).toEqual([]);
  });
});

describe('#2021 — the marker is not a number', () => {
  it('adds no point and leaves the figure as it was', () => {
    play('O ראשית הצירים');
    const d = deriveLines(activeLines(), store().seed, store().seed, []);
    expect(d.points.map((p) => p.name).sort()).toEqual(['w', 'z1']);
    expect(d.objects.map((o) => o.kind)).toEqual(['point']);
  });

  it('works as the first line of an empty figure', () => {
    expect(submitLine('O')).toBe(true);
    expect(activeLines()).toEqual(['O']);
    expect(scene().marks).toHaveLength(1);
  });

  it('marking it twice draws one dot', () => {
    play('O');
    submitLine('ראשית הצירים');
    expect(scene().marks).toHaveLength(1);
  });

  it('muting the row hides the marker', () => {
    play('נקודה O');
    expect(toggleLine(2)).toBe(true);
    expect(scene().marks).toEqual([]);
  });

  it('a reserved-constant sentence is still refused with its own message', () => {
    expect(play('o ממשי')).toBe(false);
    expect(store().lastError?.key).toBe('reserved-constant');
  });

  it('a polygon through O is unchanged — no marker unless the student asks for one', () => {
    play('המשולש Oz1w');
    expect(scene().marks).toEqual([]);
    expect(scene().shapes).toHaveLength(1);
  });
});

describe('#2021 — the canvas', () => {
  it('draws the marked origin as a labelled dot, and one «O» only', () => {
    play('O ראשית הצירים');
    const html = renderToStaticMarkup(<PolarPlane scene={scene()} labels={LABELS} />);
    expect(html).toContain('data-mark="O"');
    expect(html.match(/>O</g)).toHaveLength(1);
  });

  it('without a marker the axis letter O stays, with no dot', () => {
    submitLine('z1 = 3+4i');
    const html = renderToStaticMarkup(<PolarPlane scene={scene()} labels={LABELS} />);
    expect(html).not.toContain('data-mark');
    expect(html.match(/>O</g)).toHaveLength(1);
  });
});
