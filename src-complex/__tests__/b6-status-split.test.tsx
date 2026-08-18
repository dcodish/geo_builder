/**
 * B6 (#671) — the status-strip split, per the operator's 2026-08-18 rulings:
 *  - the freedom cue is a COUNT («the 2-D way»), never a per-DOF listing of what can move;
 *  - the configuration count died — «הציגו תצורה אחרת» already says alternatives exist;
 *  - a CONTRADICTION stays a refusal (strip material), split from the freedom half;
 *  - and the NO-GUESS rule (follow-up ruling, same day): a value prints ONLY when the givens
 *    determine it — on canvas and panel alike; an undetermined number reads as its bare name and
 *    the panel says the value is missing. The ~ convention for printed numerals died with this.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { v2Contradiction, v2Freedom, v2Labels } from '../replay/scene2';
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

describe('the NO-GUESS rule (operator, 2026-08-18): an undetermined value is never printed', () => {
  it('a determined point reads its value — on the canvas too (the panel may be hidden)', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0);
    const html = renderToStaticMarkup(<PolarPlane scene={buildScene(d)} showGrid={false} labels={LABELS} />);
    expect(html).toContain('cis53.13'); // the only check that z₁ landed right when the panel is hidden
  });

  it('an undetermined point reads as its bare NAME — no sampled numerals, no ~ marks', () => {
    // z2 is implicitly created free; w derives from it — neither value is determined
    const d = deriveLines(['z1 = 3+4i', 'w = z1*z2'], 0, 0);
    const z2 = d.points.find((p) => p.name === 'z2')!;
    const w = d.points.find((p) => p.name === 'w')!;
    expect(z2.reading).toBe('z₂'); // "we just say we don't have them"
    expect(w.reading).toBe('w');
    expect(z2.reading).not.toContain('~');
    const html = renderToStaticMarkup(<PolarPlane scene={buildScene(d)} showGrid={false} labels={LABELS} />);
    // no point VALUE on the canvas is a sampled guess — old formats were «~1.81·cis~193°» and
    // «5·cis~193°». (The S5 arc layers still print sampled angle labels; they leave the default
    // view wholesale under #722, where this rule follows them.)
    expect(html).not.toMatch(/~\d[^°<]*·cis/);
    expect(html).not.toContain('cis~');
  });

  it('the panel OMITS an undetermined point — no letter, no "cannot compute" (refined ruling)', () => {
    // "Don't show the letter and say we cannot compute it" — the missing-value explanation belongs
    // to the ASK lane when the student asks for the name explicitly (3-D's query lane behaves that
    // way; the complex ask input rides #623).
    const d = deriveLines(['z1 = 3+4i', 'w = z1*z2'], 0, 0);
    const rows = v2Labels(d);
    expect(rows).toEqual(['z₁ ≈ 5·cis53.13°']); // determined only — z2 and w have no row at all
  });

  it('displayed decimals cap at two — the #723 typography rule, model precision untouched', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0);
    expect(d.points[0].reading).toBe('z₁ ≈ 5·cis53.13°'); // not 53.1301
  });

  it('a composite-modulus reading prints the COMBINED radical: √74, never √2√37 (#702)', () => {
    const d = deriveLines(['z1 = 5+7i'], 0, 0);
    expect(d.points[0].reading).toBe('z₁ ≈ √74·cis54.46°');
  });
});
