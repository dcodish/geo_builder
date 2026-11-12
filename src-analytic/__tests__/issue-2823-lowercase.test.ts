/**
 * #2823 ([ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478), ADR-W-208; the operator's rulings of 2026-11-10
 * and 2026-11-12) — analytic reads a lowercase letter that can only be a point in capitals, records the capitals and
 * says so; every other lowercase point letter that would record in capitals is asked for in capitals.
 *
 * Measured at b9f8b916 through `decideSubmit`: «נקודה j», «משולש abc», «m אמצע AB», «d על AB», «נקודה x» were
 * `not-handled` (the model, no hint), «∠abc = 40» was refused `unknown-reference`, «c(4,7)» was taught.
 *
 * pipeline-lock: the verdict and the recorded text come from `decideSubmit` / `commitRecord` / `decideEditHost`, the
 * functions App.tsx dispatches; the notice is worded by the same `commitRecord` the App calls.
 */
import { describe, expect, it } from 'vitest';
import { analyticI18n } from '../i18n';
import { commitRecord, decideEditHost, decideSubmit, type NoticeT } from '../app/submit';

const tHe = analyticI18n.getFixedT('he') as unknown as NoticeT;
const plain = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩]/g, '');

const decide = (lines: readonly string[], line: string) => decideSubmit(line, lines, 0);

describe('#2823 — a certain lowercase label records in capitals, with the notice', () => {
  it.each([
    [[], 'נקודה j', 'נקודה J'],
    [[], 'נקודה x', 'נקודה X'], // the operator's 2026-11-12 ruling
    [[], 'משולש abc', 'משולש ABC'],
    [[], 'c(4,7)', 'C(4,7)'], // ADR-AG-423's teach, retired into the shared slot
    [[], 'point j', 'point J'],
    [['משולש ABC'], 'm אמצע AB', 'M אמצע AB'],
    [['משולש ABC'], 'x אמצע AB', 'X אמצע AB'], // #1594: an axis is never a midpoint
    [['משולש ABC'], '∠abc = 40', '∠ABC = 40'],
  ] as const)('%j · «%s» → «%s»', (before, line, row) => {
    const v = decide(before, line);
    expect(v.kind, line).toBe('record');
    if (v.kind !== 'record') return;
    expect(v.line).toBe(row);
    expect(v.cased).toBe(true);
    let notice: string | null | undefined;
    let recorded = '';
    commitRecord(v, (l, n) => { recorded = l; notice = n; }, tHe);
    expect(recorded).toBe(row);
    expect(plain(notice)).toBe(`שמות נקודות נכתבים באותיות גדולות, ולכן נרשם: ${row}`);
  });
});

describe('#2823 — never certain', () => {
  it('«k אמצע AB» after «k הוא פרמטר» is not folded (#1594\'s guard): k is the parameter', () => {
    const v = decide(['משולש ABC', 'k הוא פרמטר'], 'k אמצע AB');
    expect(v.kind === 'record' && v.cased).toBeFalsy();
  });

  it('«c(4,7)» after a line that uses c is not folded', () => {
    const v = decide(['הישר y = cx + 1'], 'c(4,7)');
    expect(v.kind === 'record' && v.cased).toBeFalsy();
  });

  it('«d על AB» after a triangle is asked in capitals, with the line that records', () => {
    const v = decide(['משולש ABC'], 'd על AB');
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'lowercase-labels', corrected: 'D על AB' } });
  });

  it('a mixed line («נקודה d על ab») is asked whole', () => {
    const v = decide(['משולש ABC'], 'נקודה d על ab');
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'lowercase-labels', corrected: 'נקודה D על AB' } });
  });

  it('the ask keeps the plane\'s letters: «נקודה d על הישר y = 2x + 1»', () => {
    const v = decide(['הישר y = 2x + 1'], 'נקודה d על הישר y = 2x + 1');
    if (v.kind === 'refused' && v.error.key === 'lowercase-labels') expect(v.error.corrected).toBe('נקודה D על הישר y = 2x + 1');
    else expect(v.kind).toBe('record'); // read whole by a rule: never asked with the axes lifted
  });
});

describe('#2823 — the edit seam reads it the same way', () => {
  it('an edited row typed in lowercase is stored in capitals', () => {
    const r = decideEditHost(1, 'n אמצע AB', ['משולש ABC', 'M אמצע AB'], [], 0);
    expect(r).toMatchObject({ ok: true, text: 'N אמצע AB' });
  });
});
