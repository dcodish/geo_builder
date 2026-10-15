/**
 * #1934 ([ADR-660](../../../docs/06-decisions.md#adr-660)) — A SHAPE OVER FREE POINTS IS REFUSED AS FLAT ONLY WHEN THE
 * GIVENS FORCE IT, NEVER BECAUSE THE TOOL'S OWN DEFAULT PUT ITS VERTICES ON A LINE.
 *
 * Operator ruling 2026-10-10 (option C): *"Both. Fix the placement so three points draw as three dots, and make the
 * tool search other configurations before refusing a shape."* Measured on d8e591a2 through the browser's path
 * (`runSubmit` with the post-commit view search): «נקודה A» · «נקודה B» · «נקודה C» · «משולש ABC» refused
 * «…המשולש ABC היה נעשה קו ישר…» although the drawing showed three spread dots (C stacked on B at the base layout,
 * which replay folds on at every seed); four points and «מרובע ABCD» the same; and «קטע AC» · «קטע BD» ·
 * «משולש ABC» refused because the second segment's template put B on line AC.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { replay, useGeoStore } from '@/store/geoStore';
import { findValidConfig, meetsRequirements } from '@/replay/core';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

const strip = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
type P = { x: number; y: number };

/** Play through the submit door with the App's post-commit view search; the notes of the LAST line. */
async function play(lines: string[]) {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
  useGeoStore.getState().clear();
  let notes: string[] = [];
  let committed = false;
  for (const line of lines) {
    notes = [];
    const before = useGeoStore.getState().facts.length;
    let resolving: Promise<void> = Promise.resolve();
    const deps: SubmitDeps = {
      t: (key, opts) => t(key, opts),
      locale: 'he',
      ui: { setInputNote: (m) => m && notes.push(strip(m)), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const r = replay(st.facts, st.seed);
        return { construction: r.construction, positions: r.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {
        resolving = runViewResolve({
          getState: () => useGeoStore.getState(),
          meetsRequirements,
          autoResolve: async (facts, seed) => {
            const f = findValidConfig(facts, seed);
            return f ? { ...f, fold: null } : null;
          },
          applyView: (found) => useGeoStore.getState().applyView({ facts: found.facts, seed: found.seed }),
          setPending: () => {},
          onExhausted: () => notes.push(strip(t('figure.noValidConfig'))),
          isCancelled: () => false,
        });
      },
      llmAbortRef: { current: null },
      explainError: (raw, said, other) => humanizeError(raw, t, said, other),
    };
    await runSubmit(line, deps);
    await resolving;
    committed = useGeoStore.getState().facts.length > before;
  }
  const st = useGeoStore.getState();
  const r = replay(st.facts, st.seed);
  return { notes, committed, r, positions: r.positions as Map<string, P> };
}

/** The ring's doubled area over its span² — zero for a flat ring. */
function flatness(ids: string[], at: Map<string, P>): number {
  const p = ids.map((id) => at.get(id)!);
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  const s = Math.max(...p.flatMap((u) => p.map((v) => Math.hypot(u.x - v.x, u.y - v.y))));
  return Math.abs(a) / (s * s);
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1934 — a shape over points the DEFAULT put on a line builds', () => {
  const BUILDS: [string[], string[]][] = [
    [['נקודה A', 'נקודה B', 'נקודה C', 'משולש ABC'], ['A', 'B', 'C']],
    [['נקודה A', 'נקודה B', 'נקודה C', 'נקודה D', 'מרובע ABCD'], ['A', 'B', 'C', 'D']],
    [['קטע AC', 'קטע BD', 'משולש ABC'], ['A', 'B', 'C']],
    [['נקודה A', 'נקודה B', 'משולש ABC'], ['A', 'B', 'C']],
  ];
  for (const [lines, ring] of BUILDS) {
    it(lines.join(' · '), async () => {
      const g = await play(lines);
      expect(g.notes, 'no refusal, no exhausted search').toEqual([]);
      expect(g.committed, 'the shape line committed').toBe(true);
      expect(Object.values(g.r.status).every((s) => s === 'ok')).toBe(true);
      expect(flatness(ring, g.positions), 'the drawn ring is not flat').toBeGreaterThan(0.05);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

describe('#1934 — a shape the GIVENS force flat keeps its refusal and its message', () => {
  const REFUSED: [string[], string][] = [
    [['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'], 'לא ניתן: «AC = 8» סותר את «משולש ABC» — יחד עם שאר הנתונים הנקודות A, B, C היו על ישר אחד, וקו ישר אינו משולש. בדקו את הנתונים.'],
    [['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 9'], 'לא ניתן: |AC| = 9 — סכום שתי צלעות תמיד גדול מהצלע השלישית, וכאן |AB| + |BC| = 7. בדקו את הנתונים.'],
  ];
  for (const [lines, note] of REFUSED) {
    it(lines.join(' · '), async () => {
      const g = await play(lines);
      expect(g.committed).toBe(false);
      expect(g.notes).toEqual([note]);
    });
  }

  it('three points the student put on one line by a stated incidence are still refused as a triangle', async () => {
    const g = await play(['קטע AB', 'C על AB', 'משולש ABC']);
    expect(g.committed).toBe(false);
    expect(g.notes.join(' ')).toContain('קו ישר');
  });

  it('the #408 shape (D the midpoint of AB and on AC) keeps its refusal', async () => {
    const g = await play(['משולש ABC', 'D אמצע AB', 'D על AC']);
    expect(g.committed).toBe(false);
    expect(g.notes.join(' ')).toContain('קו ישר');
  });
});
