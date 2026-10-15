/**
 * #1996 ([ADR-655](../../../docs/06-decisions.md#adr-655), the 2-D half of ADR-W-129) — THE GIVENS FORCED A
 * NARROWER KIND, AND 2-D SAYS SO.
 *
 * Measured on `main` @ b0ef3240 through the real submit door: «מקבילית ABCD · ABCD חסום במעגל» drew a rectangle,
 * «מקבילית ABCD · AB = BC» a rhombus, «משולש שווה שוקיים ABC · זווית BAC = 60» an equilateral triangle — all
 * silently. The operator hit it twice on 2026-10-14 (the #2107 sheet, T56 and T41).
 *
 * The thin lock: the shared rows (`shell/__tests__/fixtures/narrowing-note-rows.ts`) through 2-D's REAL path —
 * `runSubmit` (the model mocked, never called), then the store's own always-on sweep (`detectCrossings`, which
 * reads each row's noun through the parser and stores `narrowed`), rendered by the App's `narrowingText` in the
 * real i18n. Then 2-D's lifecycle: a muted cause removes the note, a reload says what typing said, a cut pool says
 * nothing, and the note moves no point.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { narrowingText } from '../narrowingText';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { serializeFigure, deserializeFigure } from '@/store/figureFile';
import { rowNouns } from '@/store/rowNouns';
import { detectAll, sharedSamples, type Fact } from '@/replay/core';
import { QUAD_IMPLIES, type QuadKind } from '@/engine/shapeKinds';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { stripFormatControls } from '../../../shell/bidi';
import { NARROW_IMPLIES, type NarrowKind } from '../../../shell/narrowing';
import { narrowingFaults, type NarrowGate } from '../../../shell/__tests__/fixtures/narrowing-note-rows';

const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;

/** Type `lines` through the submit door; true when every line committed a step. */
async function play(lines: readonly string[]): Promise<boolean> {
  useGeoStore.getState().clear();
  let all = true;
  for (const line of lines) {
    const before = new Set(useGeoStore.getState().facts.map(groupKey)).size;
    const deps: SubmitDeps = {
      t: (key, opts) => he(key, opts),
      locale: 'he',
      ui: { setInputNote: () => {}, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const r = replay(st.facts, st.seed);
        return { construction: r.construction, positions: r.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw, said) => humanizeError(raw, he, said),
    };
    await runSubmit(line, deps);
    if (new Set(useGeoStore.getState().facts.map(groupKey)).size <= before) all = false;
  }
  return all;
}

/** The notes the App shows: the store's own sweep, rendered by the App's text function. */
async function shown(): Promise<string[]> {
  await useGeoStore.getState().detectCrossings();
  const st = useGeoStore.getState();
  if (st.narrowed?.facts !== st.facts) return [];
  return narrowingText(st.narrowed.list, he).map(stripFormatControls);
}

const gate: NarrowGate = async (steps) => {
  const recorded = await play(steps);
  return { recorded, notes: await shown() };
};

describe('#1996 — 2-D says the narrowing, in the shared family', () => {
  it('every shared row: the note, word for word, or silence (known gaps still fail)', async () => {
    expect(await narrowingFaults(gate, '2d')).toEqual([]);
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 600_000);
});

describe('#1996 — 2-D lifecycle: the note is derived', () => {
  const CIRCLE = 'כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.';

  it('muting the cause removes the note; unmuting brings it back', async () => {
    expect(await play(['מקבילית ABCD', 'ABCD חסום במעגל'])).toBe(true);
    expect(await shown()).toEqual([CIRCLE]);
    const cause = groupKey(useGeoStore.getState().facts.at(-1)!);
    useGeoStore.getState().setGroupEnabled(cause, false);
    expect(await shown()).toEqual([]);
    useGeoStore.getState().setGroupEnabled(cause, true);
    expect(await shown()).toEqual([CIRCLE]);
  }, 120_000);

  it('a reload says what typing said (the noun is re-read from the saved line)', async () => {
    expect(await play(['משולש שווה שוקיים ABC', 'זווית BAC = 60'])).toBe(true);
    const typed = await shown();
    expect(typed).toHaveLength(1);
    const st = useGeoStore.getState();
    const file = deserializeFigure(serializeFigure({ facts: st.facts, seed: st.seed }));
    if (!file.ok) throw new Error('load failed');
    useGeoStore.getState().clear();
    useGeoStore.getState().loadFigure(file.file);
    expect(await shown()).toEqual(typed);
  }, 120_000);

  it('an incomplete pool says nothing (ADR-558) — the saved #1771 figure', async () => {
    const raw = readFileSync(join(__dirname, '../../__tests__/fixtures/issue-1771-semicircle-three-vertices.geo.json'), 'utf8');
    const file = deserializeFigure(raw);
    if (!file.ok) throw new Error('load failed');
    const facts = file.file.facts as Fact[];
    expect(sharedSamples(facts).complete).toBe(false);
    expect(detectAll(facts, rowNouns(facts)).narrowed).toEqual([]);
  }, 300_000);

  it('the note moves no point and changes no fact', async () => {
    expect(await play(['מקבילית ABCD', 'AB = BC'])).toBe(true);
    const st = useGeoStore.getState();
    const before = [...replay(st.facts, st.seed).positions.entries()].map(([k, v]) => `${k}:${v.x.toFixed(9)},${v.y.toFixed(9)}`);
    const factsBefore = JSON.stringify(st.facts);
    expect(await shown()).toHaveLength(1);
    const after = useGeoStore.getState();
    expect(JSON.stringify(after.facts)).toBe(factsBefore);
    expect([...replay(after.facts, after.seed).positions.entries()].map(([k, v]) => `${k}:${v.x.toFixed(9)},${v.y.toFixed(9)}`)).toEqual(before);
  }, 120_000);

  it('English reads the same family', async () => {
    expect(await play(['מקבילית ABCD', 'AB = BC'])).toBe(true);
    await useGeoStore.getState().detectCrossings();
    const en = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'en' }) as string;
    expect(narrowingText(useGeoStore.getState().narrowed!.list, en).map(stripFormatControls)).toEqual([
      'Because of the given AB = BC, ABCD was constrained from a parallelogram to a rhombus — a rhombus is a kind of parallelogram.',
    ]);
  }, 120_000);
});

describe('#1996 — the shared lattice agrees with 2-D’s QUAD_IMPLIES (ADR-619)', () => {
  it('on every kind both know', () => {
    const map: Record<QuadKind, NarrowKind> = {
      square: 'square', rectangle: 'rectangle', rhombus: 'rhombus', parallelogram: 'parallelogram', kite: 'kite',
      trapezoid: 'trapezoid', 'isosceles-trapezoid': 'isosceles-trapezoid', 'right-trapezoid': 'right-trapezoid', quadrilateral: 'quadrilateral',
    };
    for (const a of Object.keys(QUAD_IMPLIES) as QuadKind[]) {
      for (const b of Object.keys(QUAD_IMPLIES) as QuadKind[]) {
        expect(NARROW_IMPLIES[map[a]].includes(map[b]), `${a} ⇒ ${b}`).toBe(QUAD_IMPLIES[a].includes(b));
      }
    }
  });
});
