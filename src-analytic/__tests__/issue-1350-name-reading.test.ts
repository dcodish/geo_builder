/**
 * #1350 ([ADR-AG-183](../../docs/06c-decisions-analytic.md#adr-ag-183)) — TWO LINES WHOSE NAMES READ ALIKE.
 *
 * Operator, 2026-09-22, playing round #1345 T19: *"2 line 3 defined"* — «נתון הישר l3: …» and «נתון הישר 3: …»
 * both live, nothing said. The engine was unambiguous (two ids, every reference resolves), but the taken-name
 * check compared TOKENS, and a student reads «l3» and «ישר 3» as one name.
 *
 * Operator ruling (2026-09-22): a NOTICE — both lines are kept, and the tool says at the moment the second is
 * created that they are different lines. The narrow reading is `lN ⇄ N`; `m3`/`k1` read as their own names.
 *
 * Every assertion here CALLS the decision code — `nameReading`, `decideSubmit`, `derive`, `commitRecord` and the
 * real store — never a reproduction of it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runFallback } from '../app/fallback';
import { commitRecord, decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { nameReading } from '../engine/names';
import { curveByName } from '../engine/types';
import { analyticI18n } from '../i18n';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { studentFacingViolations } from '../../shell/studentText';
import { stripFormatControls } from '../../shell/bidi';

const L3_PARAM = 'נתון הישר l3: (k+1)x+2y-12+5k=0';
const L3 = 'נתון הישר l3: x+y-1=0';
const N3 = 'נתון הישר 3: 3x+2y-2=0';

describe('#1350 — nameReading: what a line name READS as', () => {
  it.each([
    ['l3', 'III'],
    ['ℓ3', 'III'],
    ['3', 'III'],
    ['ישר 3', 'III'],
    ['line 3', 'III'],
    ['III', 'III'],
    ['l1', 'I'],
  ])('«%s» reads as %s', (name, reading) => {
    expect(nameReading(name)).toBe(reading);
  });

  it.each(['m3', 'k1', 'AB', 'l', 'ℓ', 'l0'])('«%s» reads only as itself (null) — not flagged', (name) => {
    expect(nameReading(name)).toBeNull();
  });
});

describe('#1350 — the issue\'s five measured rows', () => {
  it.each([
    ['«3» then «3» (different equation) — refused, as before', N3, 'נתון הישר 3: x+y-1=0', 'refused', undefined],
    ['«l3» then «l3» (different equation) — refused, as before', L3, 'נתון הישר l3: 3x+2y-2=0', 'refused', undefined],
    ['«l3» then «3» — recorded WITH the notice', L3_PARAM, N3, 'record', { detail: '3', holder: 'l3' }],
    ['«3» then «l3» — likewise', N3, L3, 'record', { detail: 'l3', holder: '3' }],
    ['«l1» then «1» — likewise', 'נתון הישר l1: 3x+2y-2=0', 'נתון הישר 1: x+y-1=0', 'record', { detail: '1', holder: 'l1' }],
  ])('%s', (_why, first, second, kind, notice) => {
    const v = decideSubmit(second, [first], 0);
    expect(v.kind).toBe(kind);
    if (v.kind === 'record') expect(v.notice).toEqual({ code: 'name-reads-as', ...notice });
  });

  it('both lines are KEPT, and each name still resolves to its own line', () => {
    const d = derive([L3_PARAM, N3], 0);
    expect(d.faults).toEqual([]);
    expect(curveByName(d.construction, 'l3')?.id).toBe('line-l3');
    expect(curveByName(d.construction, '3')?.id).toBe('line-3');
    expect(curveByName(d.construction, 'ישר 3')?.id).toBe('line-3');
    // the notice sits on the SECOND line, the one that created the confusion — never on the first
    expect(d.notices.map((n) => n.index)).toEqual([1]);
  });
});

describe('#1350 — the class, not the instance', () => {
  it('a line named through a POINT reads the same way («ישר l4» through M, then «הישר 4»)', () => {
    const v = decideSubmit('נתון הישר 4: x-y+2=0', ['M(0,2)', 'דרך M עובר ישר l4'], 0);
    expect(v.kind).toBe('record');
    expect(v.kind === 'record' && v.notice).toEqual({ code: 'name-reads-as', detail: '4', holder: 'l4' });
  });

  it('a Roman numeral reads as its digit («ישר III» after «l3»)', () => {
    const v = decideSubmit('נתון הישר III: 3x+2y-2=0', [L3], 0);
    expect(v.kind === 'record' && v.notice).toEqual({ code: 'name-reads-as', detail: 'III', holder: 'l3' });
  });

  it('a NAME GIVEN TO AN ANONYMOUS LINE (narrowed) is noticed too', () => {
    const lines = ['נתון הישר 2x-y+8=0', L3];
    const v = decideSubmit('נתון הישר 3: 2x-y+8=0', lines, 0);
    expect(v.kind).toBe('record');
    expect(v.kind === 'record' && v.notice).toEqual({ code: 'name-reads-as', detail: '3', holder: 'l3' });
  });

  it('a CIRCLE with the numeral is a different noun — not flagged', () => {
    const v = decideSubmit('נתון מעגל 3: x^2+y^2=9', [L3], 0);
    expect(v.kind).toBe('record');
    expect(v.kind === 'record' && v.notice).toBeUndefined();
  });

  it('a genuinely unrelated name is not flagged («AB» beside «ישר 3»)', () => {
    const v = decideSubmit('נתון הישר AB: x+y-1=0', [N3], 0);
    expect(v.kind).toBe('record');
    expect(v.kind === 'record' && v.notice).toBeUndefined();
  });

  it('two lines with the SAME scheme and different numerals are not flagged («l3», «l4»)', () => {
    const v = decideSubmit('נתון הישר l4: 3x+2y-2=0', [L3], 0);
    expect(v.kind === 'record' && v.notice).toBeUndefined();
  });

  it('a restatement of a held name adds nothing and raises nothing — «כבר ידוע», unchanged', () => {
    expect(decideSubmit(L3, [N3, L3], 0).kind).toBe('already-known');
  });

  it('mixing digit and Roman for ONE name is still refused (ADR-AG-170 Am. 2), not noticed', () => {
    const v = decideSubmit('נתון הישר III: x+y-1=0', [N3], 0);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('numeral-notation');
  });

  it('#1342\'s own rows are unchanged', () => {
    expect(decideSubmit('נתון הישר 2x-y+8=0', ['נתון הישר 1: 2x-y+8=0'], 0).kind).toBe('already-known');
    const v = decideSubmit('נתון הישר l2: 2x-y+8=0', ['נתון הישר l1: 2x-y+8=0'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('already-named');
  });
});

describe('#1350 — the notice SURVIVES the commit that earns it (the recordLine trap)', () => {
  beforeEach(() => {
    useAnalyticStore.getState().clearAll();
    void analyticI18n.changeLanguage('he');
  });

  const submitThroughStore = (raw: string) => {
    const s = useAnalyticStore.getState();
    const v = decideSubmit(raw, s.lines, s.seed);
    if (v.kind !== 'record') throw new Error(`expected record, got ${v.kind}`);
    commitRecord(v, useAnalyticStore.getState().recordLine, analyticI18n.t.bind(analyticI18n));
  };

  it('«l3» then «3»: both rows recorded, and the notice is on screen after the second commit', () => {
    submitThroughStore(L3_PARAM);
    expect(useAnalyticStore.getState().notice).toBeNull();
    submitThroughStore(N3);
    const s = useAnalyticStore.getState();
    expect(s.lines).toHaveLength(2);
    // the names arrive bidi-isolated (the i18n bootstrap wraps interpolations); the words are what is judged
    expect(stripFormatControls(s.notice ?? '')).toBe('שימו לב: הישר 3 והישר l3 הם שני ישרים שונים — השמות נקראים דומה, אבל כל שם מתייחס לישר שלו.');
    expect(s.error).toBeNull();
  });

  it('the next ordinary line clears it — a notice is about the moment it was earned', () => {
    submitThroughStore(L3_PARAM);
    submitThroughStore(N3);
    submitThroughStore('A(1,1)');
    expect(useAnalyticStore.getState().notice).toBeNull();
  });

  it('the text names only the student\'s own tokens, in both locales (no id, no «line-3»)', () => {
    const v = decideSubmit(N3, [L3_PARAM], 0);
    if (v.kind !== 'record' || !v.notice) throw new Error('no notice');
    const he = analyticI18n.getFixedT('he')('noticeNameReadsAs', { detail: v.notice.detail, holder: v.notice.holder });
    const en = analyticI18n.getFixedT('en')('noticeNameReadsAs', { detail: v.notice.detail, holder: v.notice.holder });
    expect(studentFacingViolations([he], { typed: `${L3_PARAM} ${N3}`, names: [] })).toEqual([]);
    for (const text of [he, en]) {
      expect(text).not.toMatch(/line-|\{\{/);
      expect(text).toContain('l3');
    }
  });
});

describe('#1350 — the LLM lane carries the same notice (mocked transport; no live call)', () => {
  it('a model-produced «ישר 3» beside «l3» records with the notice', async () => {
    const ask = vi.fn().mockResolvedValue({ steps: [N3] });
    const out = await runFallback('תוסיף ישר שלוש', [L3_PARAM], 0, ask);
    expect(out.kind).toBe('lines');
    expect(out.kind === 'lines' && out.notice).toEqual({ code: 'name-reads-as', detail: '3', holder: 'l3' });
  });
});
