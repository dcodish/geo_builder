/**
 * #1775 (ADR-AG-416) — «דרך הנקודה P מעבירים אנך לישר AB», the exam's construction sentence, is TAUGHT in analytic.
 *
 * The register read «ישר המאונך» after «מעבירים» and «אנך» only from a point. Through a point the perpendicular is the
 * LINE: the taught sentence is «הישר העובר דרך הנקודה P מאונך ל-AB» (the 2026-10-05 revised arms), honest when P lies on
 * AB, where a foot from P would be P itself. «האנך» then has to name that line, or the exam's next sentence is refused.
 */
import { describe, expect, it } from 'vitest';
import { confirmTaught, decideSubmit } from '../app/submit';
import { constructionCandidates } from '../parser/scopeAnalytic';
import { derive, type Derivation } from '../engine/derive';
import { splitSentences } from '../../shell/sentences';

const LRM = String.fromCharCode(0x200e);
const pointOf = (d: Derivation, id: string): number[] => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return [Math.round(p.x * 1e6) / 1e6 + 0, Math.round(p.y * 1e6) / 1e6 + 0];
};
const PRE = ['A(-2,1)', 'B(10,7)', 'P על הקטע AB'];
const TAUGHT = 'הישר העובר דרך הנקודה P מאונך ל-AB';

const verdict = (line: string, before: readonly string[] = PRE) => decideSubmit(line, before, 0);
const taught = (line: string, before: readonly string[] = PRE) => {
  const v = verdict(line, before);
  return v.kind === 'teach' ? v.canonical : `not taught: ${v.kind}`;
};

describe('#1775 — the through-frame takes the noun «אנך»', () => {
  it.each([
    'דרך הנקודה P מעבירים אנך לישר AB',
    'דרך P מעבירים אנך ל-AB',
    'דרך הנקודה P מעבירים אנך ל-AB',
    'דרך P מעבירים אנך לישר AB',
    'דרך הנקודה P העבירו אנך לישר AB',
    'העבירו דרך P אנך ל-AB',
    `דרך הנקודה ${LRM}P${LRM} מעבירים אנך לישר ${LRM}AB${LRM}`,
  ])('«%s» teaches the ruled sentence', (line) => {
    expect(taught(line)).toBe(TAUGHT);
  });

  it('the taught sentence is the one «ישר המאונך» already teaches, and the next Enter accepts it', () => {
    expect(taught('דרך הנקודה P מעבירים ישר המאונך ל-AB')).toBe(TAUGHT);
    expect(verdict(TAUGHT).kind).toBe('record');
  });

  it('the teach lowers exactly as typing the sentence does (ADR-W-030)', () => {
    const viaTeach = derive(confirmTaught([...PRE, 'דרך הנקודה P מעבירים אנך לישר AB'], 0), 0);
    const typed = derive([...PRE, TAUGHT], 0);
    expect(viaTeach.construction.objects).toEqual(typed.construction.objects);
    expect(viaTeach.faults).toEqual([]);
  });

  it('a line that is not two points keeps its noun: «לישר y = 7»', () => {
    expect(constructionCandidates('דרך P מעבירים אנך לישר y = 7')[0]?.remainder).toBe('הישר העובר דרך הנקודה P מאונך לישר y = 7');
  });

  it('the from-frame is unchanged: from a point it is the piece and its foot', () => {
    expect(taught('מ-P מורידים אנך ל-AB')).toBe('האנך מהנקודה P ל-AB');
    expect(taught('מ-P מורידים אנך לישר AB')).toBe('האנך מהנקודה P לישר AB');
  });

  it.each([
    ['no operand', 'דרך הנקודה P מעבירים אנך'],
    ['a plural through one point', 'דרך הנקודה P מעבירים אנכים לישר AB'],
    ['both anchors', 'מ-P דרך A מעבירים אנך ל-AB'],
  ])('%s is not this frame: nothing is taught', (_why, line) => {
    expect(verdict(line).kind).not.toBe('teach');
  });
});

describe('#1775 — «האנך» names the one perpendicular the figure drew through a point', () => {
  const line = ['A(-2,1)', 'B(10,7)', 'P על הקטע AB', 'AP:PB = 1:2', TAUGHT];

  it('«האנך חותך את הישר y = 7 בנקודה C» lands on that line', () => {
    const lines = [...line, 'האנך חותך את הישר y = 7 בנקודה C'];
    expect(verdict(lines[5], line).kind).toBe('record');
    for (const seed of [0, 1, 2, 3] as const) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      expect(pointOf(d, 'P')).toEqual([2, 3]);
      expect(pointOf(d, 'C')).toEqual([0, 7]); // P(2,3), slope −2: y = 7 at x = 0
    }
  });

  it('the reported paste, bidi marks and all: the perpendicular is taught, confirmed, and its next sentence lands on C(0,7)', () => {
    const paste = `דרך הנקודה ${LRM}P${LRM} מעבירים אנך לישר ${LRM}AB${LRM}. האנך חותך את הישר ${LRM}y = 7${LRM} בנקודה ${LRM}C${LRM}.`;
    const lines = [`נתונות הנקודות ${LRM}A(−2, 1)${LRM}, ${LRM}B(10, 7)${LRM}.`, 'P על הקטע AB', `${LRM}AP:PB = 1:2${LRM}`];
    const sentences = splitSentences(paste);
    expect(sentences).toHaveLength(2);
    expect(taught(sentences![0].text, lines)).toBe(TAUGHT);
    lines.push(TAUGHT);
    expect(verdict(sentences![1].text, lines).kind).toBe('record');
    lines.push(sentences![1].text);
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(pointOf(d, 'C')).toEqual([0, 7]);
  });

  it('a point on «האנך» is a point on that line', () => {
    expect(verdict('E על האנך', line).kind).toBe('record');
  });

  it('a foot is still «האנך» when it is the only one', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'P(1,2)', 'האנך מ-P ל-AB'];
    expect(verdict('האנך חותך את הישר y = 7 בנקודה C', lines).kind).not.toBe('refused');
  });

  it.each<[string, string[], number]>([
    ['two lines', ['A(0,0)', 'B(4,0)', 'P(1,2)', 'Q(3,3)', 'הישר העובר דרך P מאונך ל-AB', 'הישר העובר דרך Q מאונך ל-AB'], 2],
    ['a line and a foot', ['A(0,0)', 'B(4,0)', 'P(1,2)', 'האנך מ-P ל-AB', 'Q(3,3)', 'הישר העובר דרך Q מאונך ל-AB'], 2],
    ['a perpendicular bisector has its own noun', ['A(0,0)', 'B(4,0)', 'אנך אמצעי ל-AB'], 0],
    ['a tangent has its own noun', ['מעגל O', 'B על מעגל O', 'המשיק למעגל בנקודה B'], 0],
    ['nothing drawn', ['A(0,0)', 'B(4,0)'], 0],
  ])('%s: still refused, counting what it found', (_why, lines, found) => {
    const v = verdict('האנך חותך את הישר y = 7 בנקודה C', lines);
    expect(v.kind === 'refused' && v.error.key).toBe('ambiguous-shape');
    expect(v.kind === 'refused' && v.error.key === 'ambiguous-shape' && (v.error as { host?: { found: number } }).host?.found).toBe(found);
  });
});
