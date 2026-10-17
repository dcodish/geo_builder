/**
 * #1834 ([ADR-729](../../../docs/06-decisions.md#adr-729)) — A THIRD CROSSING ASKED OF A CHORD IS REFUSED SAYING WHY,
 * NEVER AS A TANGENT.
 *
 * Operator ruling, 2026-10-07 (`/decisions` pass, «Say why, in the student's terms»):
 *   «AC כבר חותך את המעגל ב-A וב-C — לישר אין נקודת חיתוך שלישית עם המעגל.»
 *   "any third crossing asked of a line that already has two named points on the circle gets this sentence, with the
 *   letters filled in."
 *
 * Measured on `main` @ 688dfb96 through `decideDeterministic2D` and the real humanizer: every chord spelling below was
 * refused «לא ניתן למקם את E: הישר משיק למעגל בנקודה אחת בלבד…» (a chord called a tangent), and with a third point
 * already on the circle the subject read «⟨…⟩». Root cause: `evaluate.ts` `case 'line-circle'` returned the tangent
 * sentence whenever no fresh crossing remained, for both a true tangency and a chord whose two crossings are placed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { chordCrossings } from '@/engine/evaluate';
import { stripFormatControls } from '../../../shell/bidi';
import { studentFacingViolations } from '../../../shell/studentText';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string, lang: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
  const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
  const tr = i18n.getFixedT(lang);
  const t: Translate = (k, o) => tr(k, o) as string;
  const text = raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null;
  return { v, raw, text };
}

const ruled = (a: string, b: string) => `${a}${b} כבר חותך את המעגל ב-${a} וב-${b} — לישר אין נקודת חיתוך שלישית עם המעגל.`;
const ON_O = ['מעגל O', 'A על מעגל O', 'C על מעגל O'];

describe('#1834 — chordCrossings', () => {
  const line = { anchor: { x: -1, y: 0 }, dir: { x: 2, y: 0 } } as never;
  it('two distinct roots both placed → their names, in the line\'s own order', () => {
    const pos = new Map([['C', { x: 1, y: 0 }], ['A', { x: -1, y: 0 }]]);
    expect(chordCrossings([{ x: 1, y: 0 }, { x: -1, y: 0 }], pos, line)).toEqual(['A', 'C']);
  });
  it('a student name wins over an internal id at the same root', () => {
    const pos = new Map([['@ctr', { x: -1, y: 0 }], ['A', { x: -1, y: 0 }], ['C', { x: 1, y: 0 }]]);
    expect(chordCrossings([{ x: -1, y: 0 }, { x: 1, y: 0 }], pos, line)).toEqual(['A', 'C']);
  });
  it('a double root (a tangency) or an unplaced root → null', () => {
    const pos = new Map([['A', { x: -1, y: 0 }]]);
    expect(chordCrossings([{ x: -1, y: 0 }, { x: -1, y: 0 }], pos, line)).toBeNull();
    expect(chordCrossings([{ x: -1, y: 0 }, { x: 1, y: 0 }], pos, line)).toBeNull();
    expect(chordCrossings([{ x: -1, y: 0 }], pos, line)).toBeNull();
  });
});

describe('#1834 — every chord spelling is refused with the ruled sentence', () => {
  const ROWS: [string, string[], string, string, string][] = [
    ['the operator\'s report', ON_O, 'AC חותך את המעגל בנקודה E', 'A', 'C'],
    ['«הישר AC … O»', ON_O, 'הישר AC חותך את המעגל O בנקודה E', 'A', 'C'],
    ['«המיתר AC»', ON_O, 'המיתר AC חותך את המעגל בנקודה E', 'A', 'C'],
    ['a diameter', ['מעגל O', 'AB קוטר'], 'AB חותך את המעגל בנקודה E', 'A', 'B'],
    ['a chord with a point on it', ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על AB'], 'AB חותך את המעגל בנקודה E', 'A', 'B'],
    ['the asked point already on the circle (was «⟨…⟩»)', [...ON_O, 'D על מעגל O'], 'AC חותך את המעגל בנקודה D', 'A', 'C'],
  ];
  for (const [what, prefix, line, a, b] of ROWS) {
    it(`${what}: ${prefix.join(' · ')} · ${line}`, async () => {
      const { v, text } = await decide(prefix, line);
      expect(v.kind, 'refused before it becomes a fact').toBe('refuse');
      expect(text).toBe(ruled(a, b));
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('English locale: the literal rendering', async () => {
    const { text } = await decide(ON_O, 'AC חותך את המעגל בנקודה E', 'en');
    expect(text).toBe('AC already crosses the circle at A and C — a line has no third crossing with a circle.');
  });

  it('the sentence carries only the student\'s letters (ADR-W-096)', async () => {
    const { text } = await decide(ON_O, 'AC חותך את המעגל בנקודה E');
    expect(studentFacingViolations([text!], { typed: [...ON_O, 'AC חותך את המעגל בנקודה E'].join(' '), names: ['A', 'C', 'E', 'O'] })).toEqual([]);
  });
});

describe('#1834 — controls', () => {
  it('a genuine tangent keeps the tangent sentence', async () => {
    const { v, text } = await decide(['מעגל O', 'A על מעגל O', 'הישר AP משיק למעגל O בנקודה A'], 'AP חותך את המעגל בנקודה E');
    expect(v.kind).toBe('refuse');
    expect(text).toBe('לא ניתן למקם את E: הישר משיק למעגל בנקודה אחת בלבד — אין נקודת חיתוך נוספת להמשיך אליה.');
  });

  it('two circles: AC is a chord of P, not of the left circle O, so its crossing with O builds (measured at 688dfb96)', async () => {
    const { v } = await decide(['שני מעגלים נחתכים בנקודות A ו-B', 'C על מעגל P'], 'AC חותך את המעגל השמאלי בנקודה D');
    expect(v.kind).toBe('commit');
  });
});
