/**
 * B6 (#671) — the status-strip split, per the operator's 2026-08-18 rulings:
 *  - the freedom cue is a COUNT («the 2-D way»), never a per-DOF listing of what can move;
 *  - the configuration count died — «אפשרות נוספת» already says alternatives exist;
 *  - a CONTRADICTION stays a refusal (strip material), split from the freedom half;
 *  - the CANVAS carries point NAMES only — the full reading lives in the panel (de-clutter ruling).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { v2Contradiction, v2Freedom } from '../replay/scene2';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };

describe('the freedom cue (panel head-line)', () => {
  it('reports a COUNT — no DOF names, no configuration count', () => {
    // z2 is implicitly created free (2 DOF: |z2|, arg z2); w derives from it
    const d = deriveLines(['z1 = 3+4i', 'w = z1*z2'], 0, 0);
    const line = v2Freedom(d);
    expect(line).toBe('דרגות חופש: 2');
    expect(line).not.toContain('z2'); // never "resolutions of what can move"
    expect(line).not.toContain('תצורה'); // the config count died
  });

  it('a fully determined figure says so', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0);
    expect(v2Freedom(d)).toBe('הצורה נקבעה במלואה');
  });
});

describe('the contradiction half (strip material)', () => {
  it('null when the figure holds; the refusal line when it does not', () => {
    expect(v2Contradiction(deriveLines(['z1 = 3+4i'], 0, 0))).toBeNull();
    // deriveLines is pure and ungated, so a contradictory pair CAN be folded directly
    const bad = deriveLines(['z1 = 3+4i', '|z1| = 7'], 0, 0);
    expect(bad.contradiction).toBeTruthy(); // the fixture really contradicts
    expect(v2Contradiction(bad)).toContain('✗');
  });
});

describe('the canvas layer (names only)', () => {
  it('point labels on the canvas carry the NAME, not the value reading', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0);
    const html = renderToStaticMarkup(<PolarPlane scene={buildScene(d)} showGrid={false} labels={LABELS} />);
    expect(html).toContain('z₁');
    expect(html).not.toContain('cis53.13'); // the reading lives in the panel now
  });
});
