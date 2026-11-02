/**
 * #1423 — A REFUSAL ABOUT A REUSED LETTER NAMES THE LETTER, AND ITS DEFINING SENTENCE.
 *
 * Operator, playing round #1408 (T41): «there is a refusal but there is an intersect to select».
 * His P was already the second crossing of AB, so «P … של הצלע CA» is — by the #1046 lowering — a
 * (false) statement about THAT P, rightly refused; but the refusal said only «לא נמצאה תצורה» and
 * the student saw a free crossing on screen with no way to know the LETTER was the problem.
 *
 * The rule is structural at the ONE submit chokepoint (the line's subject id exists before it),
 * never by sentence kind — crossings, coordinates and midpoints are locked below, and any future
 * point sentence inherits it. The taught remedy is locked to DRIVE (a fresh letter records).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';

/** The operator's exact canvas, from logs/debug-log-analytic.jsonl session m49ph672. */
const CANVAS = [
  'A(-5,1)',
  'B(5,1)',
  'x^2+y^2=16',
  'AB',
  'P נקודת החיתוך השנייה של הקטע AB עם המעגל x^2+y^2=16',
  'Q נקודת החיתוך הראשונה של הקטע AB עם המעגל x^2+y^2=16',
  'C(3,5)',
  'משולש ABC',
  'R נקודת החיתוך הראשונה של הצלע CA עם המעגל x^2+y^2=16',
];

const build = (): string[] => {
  let lines: string[] = [];
  for (const l of CANVAS) {
    const v = decideSubmit(l, lines, 0);
    expect(v.kind, `setup «${l}»`).toBe('record');
    lines = [...lines, l];
  }
  return lines;
};

const P_DEFINER = 'P נקודת החיתוך השנייה של הקטע AB עם המעגל x^2+y^2=16';

describe('#1423 — the operator’s exact sequence', () => {
  it('«P … של הצלע CA» refuses NAMING P and the sentence that defines it — never a bare «no configuration»', () => {
    const lines = build();
    for (const probe of [
      'P נקודת החיתוך השנייה של הצלע CA עם המעגל x^2+y^2=16',
      'P נקודת החיתוך הראשונה של הצלע CA עם המעגל x^2+y^2=16',
    ]) {
      const v = decideSubmit(probe, lines, 0);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') continue;
      expect(v.error).toMatchObject({ key: 'unsatisfiable', reusedId: 'P', definedBy: P_DEFINER });
    }
  });

  it('the class, not the sentence kind: coordinates and midpoint statements about P get the same naming', () => {
    const lines = build();
    for (const probe of ['P(1,1)', 'P אמצע AC']) {
      const v = decideSubmit(probe, lines, 0);
      expect(v.kind, probe).toBe('refused');
      if (v.kind !== 'refused') continue;
      expect(v.error, probe).toMatchObject({ key: 'unsatisfiable', reusedId: 'P', definedBy: P_DEFINER });
    }
  });

  it('the taught remedy DRIVES: the same sentence with a fresh letter records', () => {
    const lines = build();
    const v = decideSubmit('S נקודת החיתוך השנייה של הצלע CA עם המעגל x^2+y^2=16', lines, 0);
    expect(v.kind).toBe('record');
  });
});

describe('#1423 — neighbours unchanged', () => {
  it('#1046: a reused-letter statement that HOLDS is still absorbed, never refused', () => {
    const lines = build();
    const v = decideSubmit('P על המעגל x^2+y^2=16', lines, 0);
    expect(v.kind === 'already-known' || v.kind === 'already-follows' || v.kind === 'record', JSON.stringify(v)).toBe(true);
  });

  it('ADR-AG-157: a new letter for a crossing that is already named is recorded on it (#1595)', () => {
    // ⚠ FLIPPED by #1595 (ADR-AG-372, ADR-W-177; operator ruling 2026-11-02, "accept with message"): S is forced onto R,
    // so the line records and the notice says «R ו-S נפלו על אותה נקודה.» (was the `crossing-already-named` refusal).
    // A REUSED letter keeps its own refusal (the cases above).
    const lines = build();
    const v = decideSubmit('S נקודת החיתוך הראשונה של הצלע CA עם המעגל x^2+y^2=16', lines, 0);
    expect(v.kind).toBe('record');
  });

  it('a refusal with NO reused letter carries no reused fields', () => {
    const lines = build();
    // a fresh-letter statement that genuinely cannot hold: T on two disjoint carriers via midpoint of
    // a segment it also crosses — use a plainly unsatisfiable fresh-letter line instead
    const v = decideSubmit('D נקודת החיתוך השלישית של הקטע AB עם המעגל x^2+y^2=16', lines, 0);
    if (v.kind === 'refused') {
      expect('reusedId' in v.error && (v.error as { reusedId?: string }).reusedId).toBeFalsy();
    }
  });
});
