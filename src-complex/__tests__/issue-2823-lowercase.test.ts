/**
 * #2823 ([ADR-CX-092](../../docs/06d-decisions-complex.md#adr-cx-092), ADR-W-208) — complex reads a lowercase letter
 * that can only be a point in capitals, records the capitals and says so; its own lowercase names (the z and w
 * families, i, o, declared and used names) are never read so; any other lowercase point letter that would record in
 * capitals is asked for in capitals.
 *
 * Measured at b9f8b916 through `decideSubmitCx`: «משולש abc» and "triangle abc" were refused not-understood.
 *
 * pipeline-lock: the fold runs inside `decideSubmitCx` before the grammar; the row text and its note are what the submit
 * decision returns, which a saved fixture (replayed as saved, never folded) cannot reach.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmitCx, labelCaseFoldCx } from '../app/submit';
import { noteText } from '../app/errorText';
import { complexI18n } from '../i18n';

const decide = (lines: readonly string[], line: string) => decideSubmitCx({ lines, disabled: [], seed: 0 }, line);
const t = complexI18n.getFixedT('he') as unknown as (k: string, p?: Record<string, unknown>) => string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

describe('#2823 — a certain lowercase label records in capitals, with the notice', () => {
  it.each([
    ['משולש abc', 'משולש ABC'],
    ['triangle abc', 'triangle ABC'],
  ])('«%s» → «%s»', (line, row) => {
    const v = decide([], line);
    expect(v).toMatchObject({ kind: 'record', line: row, note: { key: 'label-case', detail: row } });
    if (v.kind === 'record' && v.note) expect(plain(noteText(v.note, t))).toBe(`שמות נקודות נכתבים באותיות גדולות, ולכן נרשם: ${row}`);
  });
});

describe('#2823 — complex\'s own lowercase names are never read as points', () => {
  it('the z/w families, i and o, and a declared or used name are `used`', () => {
    expect(labelCaseFoldCx('משולש zwa', [])).toBeNull();
    expect(labelCaseFoldCx('משולש abo', [])).toBeNull();
    expect(labelCaseFoldCx('משולש abc', ['u מספר מרוכב', 'a = 5+i'])).toBeNull();
    expect(labelCaseFoldCx('נקודה z1', [])).toBeNull();
  });

  it('a recorded number line is untouched', () => {
    expect(decide([], 'z1 = 3+4i')).toMatchObject({ kind: 'record', line: 'z1 = 3+4i' });
  });
});

describe('#2823 — the ask', () => {
  it('a lowercase point letter in no certain slot is asked for in capitals when that line records', () => {
    const v = decide(['משולש ABC'], 'אורך ab');
    if (v.kind === 'refuse' && v.error.key === 'lowercase-labels') expect(v.error.corrected).toBe('אורך AB');
    else expect(v.kind).not.toBe('record'); // never read as typed
  });
});
