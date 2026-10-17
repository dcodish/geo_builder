/**
 * #2028 ([ADR-W-130](../../../docs/06w-decisions-workspace.md#adr-w-130)) — the rule-4 lock: #2001's exact
 * sequence through the real submit path (`runSubmit`, the model mocked), every message rendered through the one
 * display function the page uses (`explainError`).
 *
 * Measured on b0ef3240: the third line is refused as over-constrained and the reason clause interpolated the
 * anonymous touch point — «…הסיבה: |OD| = |O@f-AB|.». Whatever #2001's own fix decides about the verdict, no
 * rendered message may carry an engine token; while the refusal stands the student reads the floor or a ruled
 * message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import i18n from '@/i18n';
import { explainError, type Translate } from '@/i18n/humanizeError';
import { replay, useGeoStore } from '@/store/geoStore';
import { otherUtteranceForError } from '@/app/errorSubject';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { hasEngineToken } from '../../../shell/studentText';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const st = () => useGeoStore.getState();
const notes: string[] = [];

function deps(): SubmitDeps {
  return {
    t: he,
    locale: 'he',
    ui: {
      setInputNote: (m) => { if (m) notes.push(m); },
      setRenameNote: (m) => { if (m) notes.push(m); },
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw, said, other) => explainError(raw, he, said, other),
  };
}

beforeEach(() => {
  st().clear();
  notes.length = 0;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#2028 — #2001’s sequence: no rendered message carries an engine token', () => {
  it('«משולש ABC» · «מעגל חסום במשולש ABC» · «AB משיק למעגל בנקודה D»', async () => {
    for (const line of ['משולש ABC', 'מעגל חסום במשולש ABC', 'AB משיק למעגל בנקודה D']) await runSubmit(line, deps());
    // everything the student can read: the submit notes, the banner, and each row's status
    const d = replay(st().facts, st().seed);
    const banner = d.lastError ? explainError(d.lastError, he, undefined, otherUtteranceForError(st().facts, d.lastError)) : '';
    const rows = st().facts.map((f) => d.status[f.id]).filter((s): s is string => typeof s === 'string' && s !== 'ok').map((s) => explainError(s, he));
    const shown = [...notes, banner, ...rows].filter(Boolean);
    for (const m of shown) {
      expect(m, `«${m}»`).not.toMatch(/[@~]/);
      expect(hasEngineToken(m), `«${m}»`).toBe(false);
    }
    // #2001 landed a build (ADR-724, round #2318): the refusal this lock was written over is gone — the line
    // commits, no row is red, no banner shows, and D is drawn. The token assertion above still guards every
    // message the sequence can render; the outcome it now reads is the build.
    expect(rows.length + (banner ? 1 : 0)).toBe(0);
    expect(d.positions.has('D')).toBe(true);
  });
});
