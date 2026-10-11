/**
 * #1919 (ADR-626 / ADR-3D-328) — the shared input-script rule, and the meta-lock on the rows every
 * builder's thin lock drives.
 *
 * The rule: the tool reads Hebrew and English, Greek stays math, the Cyrillic look-alikes fold silently
 * (#1912's table), and anything else is named back to the student instead of being replaced by A, B, C.
 */
import { describe, expect, it } from 'vitest';
import { MAX_NAME_LETTERS, unreadScript, unreadScriptRuns } from '../inputScript';
import {
  READABLE_ROWS,
  UNREAD_ROWS,
  unreadLetterFaults,
  type UnreadGate,
} from './fixtures/unread-letter-rows';

describe('#1919 — the runs the tool cannot read', () => {
  it('names the letters a shape noun silently replaced with A, B, C', () => {
    expect(unreadScriptRuns('משולש ДЖФ')).toEqual(['ДЖФ']);
    expect(unreadScriptRuns('ריבוע ДЖФИ')).toEqual(['ДЖФИ']);
    expect(unreadScriptRuns('משולש ابج')).toEqual(['ابج']);
    expect(unreadScriptRuns('משולש ÉÜÇ')).toEqual(['ÉÜÇ']);
    expect(unreadScriptRuns('triangle ДЖФ')).toEqual(['ДЖФ']);
  });

  it('finds the letter anywhere in the line, and keeps a glued Latin letter or digit with its run', () => {
    expect(unreadScriptRuns('נקודה Ж על AB')).toEqual(['Ж']);
    expect(unreadScriptRuns('M אמצע Д')).toEqual(['Д']);
    expect(unreadScriptRuns('Д(1,2)')).toEqual(['Д']);
    expect(unreadScriptRuns('משולש ДBC')).toEqual(['ДBC']);
    expect(unreadScriptRuns('משולש Д1Ж1Ф1')).toEqual(['Д1Ж1Ф1']);
  });

  it('reads Hebrew, English, Greek, the look-alikes and the math glyphs — nothing to refuse', () => {
    for (const line of READABLE_ROWS) expect(unreadScriptRuns(line), line).toEqual([]);
  });

  it('the look-alike fold runs first, so a Cyrillic twin is a label and never a refusal', () => {
    expect(unreadScriptRuns('משולש КМО')).toEqual([]);
    expect(unreadScriptRuns('מעגל עם קוטר АВ')).toEqual([]);
    // Ж has no Latin twin, so the mixed run is still named — as typed, with the folded twins in place
    expect(unreadScriptRuns('משולש КЖО')).toEqual(['KЖO']);
  });

  it('the modifier letters and the ordinal indicators are notation, never a script', () => {
    // complex reads a superscript as a power and never folds glyphs (#1912), so these must reach its grammar
    expect(unreadScriptRuns('zⁿ = 8')).toEqual([]);
    expect(unreadScriptRuns('Xₖ = 2 + i')).toEqual([]);
    expect(unreadScriptRuns('זווית ABC = 40º')).toEqual([]);
    expect(unreadScriptRuns("משולש A'B'C'")).toEqual([]);
  });
});

describe('#1919 — which ruled sentence a line gets', () => {
  it('one run of capitals is a NAME; a lowercase word, a long run, or several runs is a WORD', () => {
    expect(unreadScript('משולש ДЖФ')).toEqual({ kind: 'name', detail: 'ДЖФ' });
    expect(unreadScript('מחומש ДЖФИЛ')).toEqual({ kind: 'name', detail: 'ДЖФИЛ' });
    expect(unreadScript('треугольник ABC')).toEqual({ kind: 'word', detail: 'треугольник' });
    expect(unreadScript('мой треугольник')).toEqual({ kind: 'word', detail: 'мой, треугольник' });
    expect(unreadScript('مثلث متساوي الساقين')?.kind).toBe('word');
    expect(unreadScript('משולש ABC')).toBeNull();
  });

  it(`a run longer than ${MAX_NAME_LETTERS} letters is past any vertex list, so it is a word`, () => {
    expect(unreadScript('משולש ' + 'Д'.repeat(MAX_NAME_LETTERS))?.kind).toBe('name');
    expect(unreadScript('משולש ' + 'Д'.repeat(MAX_NAME_LETTERS + 1))?.kind).toBe('word');
  });

  it('every row of the shared table is classed as the row says', () => {
    for (const { line, kind, quotes } of UNREAD_ROWS) {
      const got = unreadScript(line);
      expect(got?.kind, line).toBe(kind);
      expect(got?.detail, line).toContain(quotes);
    }
  });
});

describe('#1919 — the shared rows catch a seam that does not call the rule', () => {
  const faultsOf = (gate: UnreadGate) => unreadLetterFaults(gate);

  it('a conforming gate has no faults', async () => {
    const good: UnreadGate = (line) => {
      const u = unreadScript(line);
      return u ? { unread: u.kind, recorded: false, text: `"${u.detail}" …` } : { unread: null, recorded: false, text: null };
    };
    expect(await faultsOf(good)).toEqual([]);
  });

  it('a seam that draws the line instead (the measured bug) is caught, every row', async () => {
    const drawsIt: UnreadGate = () => ({ unread: null, recorded: true, text: null });
    expect((await faultsOf(drawsIt)).length).toBe(UNREAD_ROWS.length * 2);
  });

  it('a refusal that does not name the letters is caught', async () => {
    const vague: UnreadGate = (line) => {
      const u = unreadScript(line);
      return u ? { unread: u.kind, recorded: false, text: 'לא הבנתי' } : { unread: null, recorded: false, text: null };
    };
    expect(await faultsOf(vague)).toEqual(UNREAD_ROWS.map((r) => `the refusal of «${r.line}» does not name «${r.quotes}»: "לא הבנתי"`));
  });

  it('a gate that refuses the look-alikes or Greek too is caught', async () => {
    const overreach: UnreadGate = (line) => (/[A-Za-z֐-׿\s=<>:,.()'ⁿₖº²π+-]/.test(line) && unreadScript(line) === null
      ? { unread: 'name', recorded: false, text: line }
      : { unread: unreadScript(line)?.kind ?? null, recorded: false, text: line });
    expect((await faultsOf(overreach)).length).toBe(READABLE_ROWS.length);
  });
});
