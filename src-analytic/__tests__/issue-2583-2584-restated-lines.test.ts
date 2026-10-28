/**
 * #2583 + #2584 — the perpendicular bisector draws only its line ([ADR-AG-345](../../docs/06c-decisions-analytic.md#adr-ag-345)),
 * and a line stated again gets one verdict in every spelling ([ADR-AG-346](../../docs/06c-decisions-analytic.md#adr-ag-346)).
 *
 * Operator rulings, 2026-10-27: «B» (the bisector's midpoint has no dot, no letter, no «הכלי קרא לנקודה …» until a line
 * letters it); T32 *"it should refuse to draw second line and say that already exists and offer to rename the line"*;
 * the equation spelling *"it should rename the line but not create another line"* (#2425 Q3 stands). Driven through the
 * real door, `decideSubmit` line by line → `derive`; the model is never called.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { errorText } from '../app/errorText';
import { decideSubmit, sentenceOutcome } from '../app/submit';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { analyticI18n } from '../i18n';
import { lineOfferCandidate } from '../parser/lineOffer';
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
const en = analyticI18n.getFixedT('en');
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
    expect(ask(d, 'המקום הגיאומטרי של G', fmtAnalytic).value).toBe('parabola · y² = 4x');
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
    // the bisector restated afterwards is the same line; a second name for the point is refused, naming P
    expect(decideSubmit('אנך אמצעי ל-EK', lines, 0, d).kind).toBe('already-known');
    expect(decideSubmit('Q אמצע EK', lines, 0, d)).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'P' } });
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
  it('T32, the operator’s exact sequence: the 5th line is refused, names the row, and offers the naming sentence', () => {
    const { lines, v } = lastVerdict([...EK, 'אנך אמצעי ל-EK', 'l2 אנך אמצעי ל-EK']);
    expect(v).toEqual({
      kind: 'refused',
      error: { key: 'line-exists', detail: 'l2 אנך אמצעי ל-EK', lineName: 'l2', declared: 'אנך אמצעי ל-EK', offer: 'נסמן את האנך האמצעי ל-EK ב-l2' },
    });
    if (v.kind !== 'refused') return;
    expect(plain(errorText(v.error, he))).toBe('הישר הזה כבר קיים באיור: «אנך אמצעי ל-EK». כדי לקרוא לו l2, לחצו Enter — המשפט כבר בתיבה.');
    expect(sentenceOutcome(v)).toEqual({ prefill: 'נסמן את האנך האמצעי ל-EK ב-l2' });
    expect(lines).toHaveLength(4);
  });

  it('the taught remedy is a grammar claim: the offered sentence records, the line is l2, and G is defined on it', () => {
    const lines = built([...EK, 'אנך אמצעי ל-EK', 'נסמן את האנך האמצעי ל-EK ב-l2', 'דרך E עובר ישר l1 מקביל לציר ה-x', 'G נקודת החיתוך של הישר l1 עם הישר l2']);
    const named = lineAts(lines).filter((o) => o.kind === 'line-at' && o.name === 'l2');
    expect(named).toHaveLength(1);
    expect(lineAts(lines)).toHaveLength(2);
    expect(ask(derive(lines, 0), 'המקום הגיאומטרי של G', fmtAnalytic).value).toBe('parabola · y² = 4x');
  });

  it('the parallel through a point: refused, and its offer records', () => {
    const { lines, v } = lastVerdict([...EK, 'דרך E עובר ישר מקביל לציר ה-x', 'דרך E עובר ישר l1 מקביל לציר ה-x']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'line-exists', lineName: 'l1', declared: 'דרך E עובר ישר מקביל לציר ה-x', offer: 'נסמן את הישר העובר דרך E המקביל לציר ה-x ב-l1' } });
    if (v.kind !== 'refused' || v.error.key !== 'line-exists') return;
    const after = built([...lines, v.error.offer!]);
    expect(lineAts(after).map((o) => o.kind === 'line-at' && o.name)).toEqual(['l1']);
  });

  it('the line-first and English spellings get the same refusal', () => {
    const lineFirst = lastVerdict([...EK, 'האנך האמצעי לקטע EK', 'הישר l2 הוא האנך האמצעי לקטע EK']).v;
    expect(lineFirst).toMatchObject({ kind: 'refused', error: { key: 'line-exists', declared: 'האנך האמצעי לקטע EK', offer: 'נסמן את האנך האמצעי ל-EK ב-l2' } });
    const english = lastVerdict([...EK_EN, 'the perpendicular bisector of EK', 'l2 is the perpendicular bisector of EK']).v;
    expect(english).toMatchObject({ kind: 'refused', error: { key: 'line-exists', offer: 'denote the perpendicular bisector of EK by l2' } });
    if (english.kind !== 'refused') return;
    expect(plain(errorText(english.error, en))).toBe('This line is already in the figure: «the perpendicular bisector of EK». To call it l2, press Enter — the sentence is already in the box.');
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
  });

  it('the named-then-unnamed order stays known; a point’s second name keeps the point sentence', () => {
    expect(lastVerdict([...EK, 'l2 אנך אמצעי ל-EK', 'אנך אמצעי ל-EK']).v.kind).toBe('already-known');
    const { v } = lastVerdict(['A(0,0)', 'B(4,0)', 'P אמצע AB', 'Q אמצע AB']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'P' } });
    if (v.kind === 'refused') expect(plain(errorText(v.error, he))).toMatch(/^כבר יש שם לנקודה הזו: P\./);
  });

  it('the offer is written from the line, whatever row drew it (unit: lineOfferCandidate)', () => {
    const c = derive(built([...EK, 'האנך האמצעי לקטע EK', 'דרך E עובר ישר מקביל לציר ה-x']), 0).construction;
    const [bis, par] = c.objects.filter((o) => o.kind === 'line-at').map((o) => o.id);
    expect(lineOfferCandidate(c, bis, 'l2', 'he')).toBe('נסמן את האנך האמצעי ל-EK ב-l2');
    expect(lineOfferCandidate(c, bis, 'l2', 'en')).toBe('denote the perpendicular bisector of EK by l2');
    expect(lineOfferCandidate(c, par, 'l1', 'he')).toBe('נסמן את הישר העובר דרך E המקביל לציר ה-x ב-l1');
    expect(lineOfferCandidate(c, 'no-such-line', 'l1', 'he')).toBeNull();
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
