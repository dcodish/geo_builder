/**
 * #2583 + #2584 — the perpendicular bisector draws only its line ([ADR-AG-345](../../docs/06c-decisions-analytic.md#adr-ag-345)),
 * and a line stated again gets one verdict in every spelling ([ADR-AG-346](../../docs/06c-decisions-analytic.md#adr-ag-346)).
 *
 * Operator rulings, 2026-10-27: «B» (the bisector's midpoint has no dot, no letter, no «הכלי קרא לנקודה …» until a line
 * letters it); T32's refusal (*"it should refuse to draw second line…"*) WITHDRAWN by the 2026-11-09 ruling "b" (#2790,
 * ADR-AG-463): the restated line under a new name is its own row, names the line, and carries the already-held notice;
 * the equation spelling *"it should rename the line but not create another line"* (#2425 Q3 stands). Driven through the
 * real door, `decideSubmit` line by line → `derive`; the model is never called.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { errorText } from '../app/errorText';
import { decideSubmit, isHeld, sentenceOutcome } from '../app/submit';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { analyticI18n } from '../i18n';
import summerB from './fixtures/exam-2024sB-locus-1138.analytic.json';

/** Submit `seq` line by line through the real decision; every line must record. */
function built(seq: readonly string[]): string[] {
  const lines: string[] = [];
  for (const u of seq) {
    const v = decideSubmit(u, lines, 0, derive(lines, 0));
    expect(v.kind, u).toBe('record');
    if (v.kind === 'record') lines.push(v.line);
  }
  return lines;
}
/** The verdict of the LAST line of `seq` after the others recorded, and the lines it was judged against. */
function lastVerdict(seq: readonly string[]) {
  const lines = built(seq.slice(0, -1));
  return { lines, v: decideSubmit(seq[seq.length - 1], lines, 0, derive(lines, 0)) };
}
const he = analyticI18n.getFixedT('he');
/** The rendered message with the bidi isolates the renderer adds stripped, so the sentence reads as written. */
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const pointIds = (lines: readonly string[]) => derive(lines, 0).figure.points.map((p) => p.id);
const lineAts = (lines: readonly string[]) => derive(lines, 0).construction.objects.filter((o) => o.kind === 'line-at');

const EK = ['K(1,0)', 'נקודה E', 'E על הישר x = -1'];
const EK_EN = ['K(1,0)', 'point E', 'E on the line x = -1'];

describe('#2583 — a perpendicular bisector draws only its line (ADR-AG-345)', () => {
  for (const [label, ctx, line] of [
    ['unnamed, He, M free', EK, 'אנך אמצעי ל-EK'],
    ['named, He, M free', EK, 'l2 אנך אמצעי ל-EK'],
    ['unnamed, He, M taken', ['M(1,2)', ...EK], 'אנך אמצעי ל-EK'],
    ['named, He, M taken (T30)', ['M(1,2)', ...EK], 'l2 אנך אמצעי ל-EK'],
    ['line-first, He', EK, 'הישר l2 הוא האנך האמצעי לקטע EK'],
    ['unnamed, En', EK_EN, 'the perpendicular bisector of EK'],
    ['named, En', EK_EN, 'l2 is the perpendicular bisector of EK'],
  ] as const) {
    it(`${label}: the line is drawn; no midpoint dot, no letter, no row note`, () => {
      const before = pointIds(built(ctx));
      const lines = built([...ctx, line]);
      const d = derive(lines, 0);
      expect(d.figure.points.map((p) => p.id)).toEqual(before);
      expect(d.minted).toEqual([]);
      expect(d.faults).toEqual([]);
      const l = lineAts(lines);
      expect(l).toHaveLength(1);
      expect(d.figure.curves.some((c) => c.id === l[0].id)).toBe(true);
    });
  }

  it('T30, the operator’s exact sequence (fixture exam-2024sB-locus-1138): no N, nothing minted, G still on l1 ∩ l2', () => {
    const lines = built(summerB.lines);
    const d = derive(lines, 0);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['E', 'G', 'K', 'M']);
    expect(d.minted).toEqual([]);
    expect(ask(d, 'המקום הגיאומטרי של G', fmtAnalytic, undefined, 'chip').value).toBe('parabola · y² = 4x');
  });

  it('«P אמצע EK» after the line names its midpoint: P is drawn, the line runs through it, nothing else changes', () => {
    const lines = built([...EK, 'אנך אמצעי ל-EK', 'P אמצע EK']);
    const d = derive(lines, 0);
    expect(d.figure.points.map((p) => p.id)).toContain('P');
    expect(d.minted).toEqual([]);
    const [l] = lineAts(lines);
    expect(l.kind === 'line-at' && l.through).toBe('P');
    const E = d.figure.points.find((p) => p.id === 'E')!;
    const P = d.figure.points.find((p) => p.id === 'P')!;
    expect(P.x).toBeCloseTo((E.x + 1) / 2, 9);
    expect(P.y).toBeCloseTo(E.y / 2, 9);
    // the bisector restated afterwards is the same line; a second name for the point records on P (#1595, ADR-AG-372;
    // operator ruling 2026-11-02, "accept with message" — was the `already-named` refusal)
    expect(isHeld(decideSubmit('אנך אמצעי ל-EK', lines, 0, d))).toBe(true); // #2790: its own row, with the notice
    expect(decideSubmit('Q אמצע EK', lines, 0, d).kind).toBe('record');
  });

  it('«P אמצע EK» before the line: the line runs through P, as before', () => {
    const lines = built([...EK, 'P אמצע EK', 'אנך אמצעי ל-EK']);
    const [l] = lineAts(lines);
    expect(l.kind === 'line-at' && l.through).toBe('P');
    expect(pointIds(lines)).toContain('P');
  });

  it('a sentence that refers to the midpoint («אמצע EK») letters it M, announced on that row', () => {
    const lines = built([...EK, 'אנך אמצעי ל-EK', 'אמצע EK']);
    const d = derive(lines, 0);
    expect(d.figure.points.map((p) => p.id)).toContain('M');
    expect(d.minted).toEqual([{ index: 4, id: 'M' }]);
  });

  it('the named form «… חותך אותו בנקודה K» letters the midpoint K, drawn', () => {
    const d = derive(built(['A(0,0)', 'B(4,0)', 'אנך אמצעי ל-AB חותך אותו בנקודה K']), 0);
    const K = d.figure.points.find((p) => p.id === 'K');
    expect(K).toMatchObject({ x: 2, y: 0 });
    expect(d.minted).toEqual([]);
  });

  it('regression guard: a median’s foot and a midsegment’s ends keep their tool letters', () => {
    const median = derive(built(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', 'תיכון מ-A במשולש ABC']), 0);
    expect(median.minted.map((m) => m.id)).toEqual(['M']);
    expect(median.figure.points.map((p) => p.id)).toContain('M');
    const mid = derive(built(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', 'אמצע AB']), 0);
    expect(mid.minted.map((m) => m.id)).toEqual(['M']);
  });
});

describe('#2584 — a line stated again: one verdict in every spelling (ADR-AG-346)', () => {
  it('T32 under ruling "b" (#2790, ADR-AG-463): the 5th line records as its own row, names the drawn line l2, and says it was there', () => {
    const { lines, v } = lastVerdict([...EK, 'אנך אמצעי ל-EK', 'l2 אנך אמצעי ל-EK']);
    expect(v).toMatchObject({ kind: 'record', line: 'l2 אנך אמצעי ל-EK', notice: { code: 'already-held', holder: 'l2' } });
    expect(sentenceOutcome(v)).toBe('consumed');
    const after = [...lines, 'l2 אנך אמצעי ל-EK'];
    expect(lineAts(after).map((o) => o.kind === 'line-at' && o.name)).toEqual(['l2']);
    // the name is usable: G is defined on l2, and the locus reads as before
    const more = built([...after, 'דרך E עובר ישר l1 מקביל לציר ה-x', 'G נקודת החיתוך של הישר l1 עם הישר l2']);
    expect(ask(derive(more, 0), 'המקום הגיאומטרי של G', fmtAnalytic, undefined, 'chip').value).toBe('parabola · y² = 4x');
    // the earlier, unnamed row deleted: the named row draws the line alone
    expect(lineAts(more.filter((l) => l !== 'אנך אמצעי ל-EK')).map((o) => o.kind === 'line-at' && o.name)).toEqual(['l2', 'l1']);
  });

  it('the naming sentence still records, the line is l2, and G is defined on it', () => {
    const lines = built([...EK, 'אנך אמצעי ל-EK', 'נסמן את האנך האמצעי ל-EK ב-l2', 'דרך E עובר ישר l1 מקביל לציר ה-x', 'G נקודת החיתוך של הישר l1 עם הישר l2']);
    const named = lineAts(lines).filter((o) => o.kind === 'line-at' && o.name === 'l2');
    expect(named).toHaveLength(1);
    expect(lineAts(lines)).toHaveLength(2);
    expect(ask(derive(lines, 0), 'המקום הגיאומטרי של G', fmtAnalytic, undefined, 'chip').value).toBe('parabola · y² = 4x');
  });

  it('the parallel through a point: named, one line', () => {
    const { lines, v } = lastVerdict([...EK, 'דרך E עובר ישר מקביל לציר ה-x', 'דרך E עובר ישר l1 מקביל לציר ה-x']);
    expect(v).toMatchObject({ kind: 'record', notice: { code: 'already-held', holder: 'l1' } });
    expect(lineAts([...lines, 'דרך E עובר ישר l1 מקביל לציר ה-x']).map((o) => o.kind === 'line-at' && o.name)).toEqual(['l1']);
  });

  it('the line-first and English spellings name the line the same way', () => {
    const lineFirst = lastVerdict([...EK, 'האנך האמצעי לקטע EK', 'הישר l2 הוא האנך האמצעי לקטע EK']);
    expect(lineFirst.v).toMatchObject({ kind: 'record', notice: { code: 'already-held', holder: 'l2' } });
    expect(lineAts([...lineFirst.lines, 'הישר l2 הוא האנך האמצעי לקטע EK']).map((o) => o.kind === 'line-at' && o.name)).toEqual(['l2']);
    const english = lastVerdict([...EK_EN, 'the perpendicular bisector of EK', 'l2 is the perpendicular bisector of EK']);
    expect(english.v).toMatchObject({ kind: 'record', notice: { code: 'already-held', holder: 'l2' } });
  });

  it('a second name for a named line is refused naming the holder, as a line, and no second line is drawn', () => {
    const { lines, v } = lastVerdict([...EK, 'l1 אנך אמצעי ל-EK', 'l2 אנך אמצעי ל-EK']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'l1', holderKind: 'line' } });
    if (v.kind !== 'refused') return;
    expect(plain(errorText(v.error, he))).toBe('לישר הזה כבר יש שם: l1. כדי לשנות את השם, מחקו את השורה של l1 וכתבו אותה מחדש.');
    expect(lineAts(lines)).toHaveLength(1);
    // the naming sentence too: a named line is never renamed
    expect(decideSubmit('נסמן את האנך האמצעי ל-EK ב-l2', lines, 0, derive(lines, 0))).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'l1' } });
  });

  it('the equation spelling: a second name is refused as a line; a name over the tool’s l-number renames, one line', () => {
    const second = lastVerdict(['נתון ישר l1: y=2x+1', 'נתון ישר l2: y=2x+1']).v;
    expect(second).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'l1', holderKind: 'line' } });
    const lines = built(['נתון ישר y=2x+1', 'נתון ישר l2: y=2x+1']);
    const curves = derive(lines, 0).construction.objects.filter((o) => o.kind === 'curve');
    expect(curves).toHaveLength(1);
    expect(curves[0].kind === 'curve' && curves[0].label.name).toBe('l2');
    // #2790 (ADR-AG-463 Am. 1, judged Q-2790b (a)): the renaming row is its own row, with the already-held notice
    expect(lastVerdict(['נתון ישר y=2x+1', 'נתון ישר l2: y=2x+1']).v).toMatchObject({ kind: 'record', notice: { code: 'already-held', holder: 'l2' } });
  });

  it('the named-then-unnamed order stays known; a point’s second name records on it (#1595)', () => {
    expect(isHeld(lastVerdict([...EK, 'l2 אנך אמצעי ל-EK', 'אנך אמצעי ל-EK']).v)).toBe(true); // #2790
    // ⚠ FLIPPED by #1595 (ADR-AG-372, ADR-W-177; operator ruling 2026-11-02, "accept with message"): «Q אמצע AB» after
    // «P אמצע AB» records, with «P ו-Q נפלו על אותה נקודה.» (was «כבר יש שם לנקודה הזו: P.»). A curve's centre named
    // twice keeps that sentence (issue-1153).
    expect(lastVerdict(['A(0,0)', 'B(4,0)', 'P אמצע AB', 'Q אמצע AB']).v.kind).toBe('record');
    const { v } = lastVerdict(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'P מרכז המעגל I', 'O מרכז המעגל I']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'P' } });
    if (v.kind === 'refused') expect(plain(errorText(v.error, he))).toContain('P');
  });

  it('a free-direction line is never matched as a restatement', () => {
    const lines = built(['נקודה N', 'דרך N עובר ישר', 'דרך N עובר ישר l3']);
    expect(lineAts(lines).length).toBeGreaterThanOrEqual(1);
  });

  it('the naming sentence on a figure without the line builds it under the name, He and En', () => {
    for (const [ctx, s] of [[EK, 'נסמן את האנך האמצעי ל-EK ב-l2'], [EK, 'נסמן ב-l2 את האנך האמצעי ל-EK'], [EK_EN, 'denote the perpendicular bisector of EK by l2']] as const) {
      const lines = built([...ctx, s]);
      expect(lineAts(lines).map((o) => o.kind === 'line-at' && o.name), s).toEqual(['l2']);
      expect(derive(lines, 0).figure.points.map((p) => p.id), s).toEqual(['K', 'E']);
    }
  });
});
