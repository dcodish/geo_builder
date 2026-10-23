/**
 * #1995 batch 1 ([ADR-W-155](../../../docs/06w-decisions-workspace.md#adr-w-155)) — 2-D's rename / swap / merge notes
 * and six cevian refusals now give one next step, or say plainly there is none (the operator's rule of 2026-10-13,
 * card 18 B). These are `input.*` notes: `t()` renders them with no retry hint appended, so before this batch they
 * named the student's letters and stopped.
 *
 * Every row goes through `runSubmit` — the whole submit pipeline the component calls — with the real Hebrew `t`, and
 * reads the note the student is shown. A row whose sentence teaches a next step then submits that step and asserts
 * it is taken (docs/17 §9, "a taught remedy is a grammar claim").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';

type Lng = 'he' | 'en';
const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** One line through the real pipeline: the note the student reads ('' when none), and whether a row was added. */
async function submit(line: string, lng: Lng = 'he'): Promise<{ note: string; added: boolean }> {
  const t = i18n.getFixedT(lng);
  const notes: string[] = [];
  const before = st().facts.length;
  const deps: SubmitDeps = {
    t: (key, opts) => t(key, opts) as string,
    locale: lng,
    ui: {
      setInputNote: (m) => notes.push(m),
      setRenameNote: (m) => notes.push(m),
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const d = replay(st().facts, st().seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  await runSubmit(line, deps);
  return { note: plain(notes.filter(Boolean).join(' ')), added: st().facts.length > before };
}
async function setUp(lines: readonly string[]) {
  st().clear();
  for (const l of lines) expect(await submit(l), `setup «${l}»`).toEqual({ note: '', added: true });
}
const TAKEN = { note: '', added: true };

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1995 batch 1 — 2-D: the store-operation notes say plainly there is nothing to do', () => {
  it('rename', async () => {
    await setUp(['משולש ABC']);
    expect((await submit('שנה שם Z ל-Q')).note).toBe('אין בשרטוט נקודה בשם Z, ולכן אין מה לשנות.');
    expect((await submit('שנה שם A ל-Q')).note).toBe('');
  });
  it('swap', async () => {
    await setUp(['משולש ABC']);
    expect((await submit('החלף בין Z ל-B')).note).toBe('Z או B אינה בשרטוט, ולכן אין מה להחליף — אפשר להחליף רק בין שתי נקודות שבשרטוט.');
    expect((await submit('החלף בין A ל-B')).note).toBe('');
  });
  it('merge', async () => {
    await setUp(['משולש ABC']);
    expect((await submit('מזג את Z עם B')).note).toBe('אין בשרטוט נקודה בשם Z, ולכן אין מה למזג.');
  });
});

describe('#1995 batch 1 — 2-D: each cevian refusal teaches the line that builds', () => {
  it('a bisector named by a side of the triangle → give its other end a new letter', async () => {
    await setUp(['משולש ABC']);
    expect(await submit('AB חוצה זווית')).toEqual({
      note: 'AB היא צלע של המשולש ולכן אינה יכולה לחצות את זווית A. חוצה זווית יוצא מקודקוד אל הצלע שמולו — תנו לקצה השני שלו אות חדשה.',
      added: false,
    });
    expect(await submit('AD חוצה זווית A')).toEqual(TAKEN);
  });
  it('a bisector named by a side of a quadrilateral → give its other end a new letter', async () => {
    await setUp(['מרובע ABCD']);
    expect(await submit('AB חוצה זווית')).toEqual({ note: 'AB היא צלע של המרובע ולכן אינה יכולה לחצות את זווית A. תנו לקצה השני של חוצה הזווית אות חדשה.', added: false });
    expect(await submit('AE חוצה זווית A')).toEqual(TAKEN);
  });
  it('a median whose midpoint would be a vertex → from the opposite vertex, to a new letter', async () => {
    await setUp(['משולש ABC']);
    expect(await submit('AC תיכון לצלע BC')).toEqual({
      note: 'אמצע הצלע BC אינו יכול להיות C — לשם כך BC הייתה צריכה להיות באורך אפס. תיכון יוצא מהקודקוד שמול הצלע — תנו לאמצע הצלע אות חדשה.',
      added: false,
    });
    expect(await submit('AD תיכון לצלע BC')).toEqual(TAKEN);
  });
  it('an altitude from a vertex on its own side → write it from the opposite vertex', async () => {
    await setUp(['משולש ABC']);
    expect(await submit('BD גובה לצלע AB')).toEqual({
      note: 'B נמצאת על הצלע AB, ולכן הגובה מ-B אל AB הוא באורך אפס. הגובה נמתח מקודקוד אל הצלע שמולו. כתבו אותו מהקודקוד שמול AB.',
      added: false,
    });
    expect(await submit('CD גובה לצלע AB')).toEqual(TAKEN);
  });
  it('an altitude from a vertex to itself → give the point on the side a new letter', async () => {
    await setUp(['משולש ABC']);
    expect(await submit('AA גובה לצלע BC')).toEqual({ note: 'AA אינו קטע — הגובה נמתח מקודקוד אל נקודה אחרת. תנו לנקודה שעל הצלע אות חדשה.', added: false });
    expect(await submit('AD גובה לצלע BC')).toEqual(TAKEN);
  });
  it('a bisector sent to the wrong side → write the side it meets', async () => {
    await setUp(['משולש ABC']);
    expect(await submit('AD חוצה זווית A לצלע AB')).toEqual({ note: 'חוצה הזווית מ-A פוגש את הצלע BC, לא את AB. כתבו BC במקום AB.', added: false });
    expect(await submit('AD חוצה זווית A לצלע BC')).toEqual(TAKEN);
  });
  it('the English twin takes the same shape', async () => {
    await setUp(['משולש ABC']);
    expect((await submit('AD חוצה זווית A לצלע AB', 'en')).note).toBe('The bisector from A meets side BC, not AB. Write BC instead of AB.');
  });
});
