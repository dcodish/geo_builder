/**
 * #2339 ([ADR-743](../../../docs/06-decisions.md#adr-743)) — A TANGENCY KIND THAT CONTRADICTS AN EARLIER ONE IS REFUSED
 * BEFORE COMMIT (operator, round #2291 T10, 2026-10-17: *"the first error tells the story - the last input contradicts
 * the prior one."*).
 *
 * Measured at `97f6364a` (#2237's tip) through `decideDeterministic2D` → `commitVerdict` → `replay`: «מעגל O» · «מעגל P» ·
 * «המעגלים O ו-P משיקים מבפנים» · «המעגלים O ו-P משיקים מבחוץ» was COMMITTED, green per row, with only the ⚠ panel
 * objecting. Root cause: the free-radius internal device put its witness on the inner circle "toward M", which an
 * external touch satisfies too, and a second kind at the same touch point reused the witness id, so `addObj` dropped it.
 * Fix: the witness points AWAY from the outer centre (it holds only at |OP| = r_out − r_in) and its id carries the kind.
 * The existing over-constrained path then refuses the later line, naming the earlier one, as it already did with both
 * radii stated.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** Plays every line through the real decision; returns the last verdict's kind and its Hebrew refusal, if any. */
async function play(lines: string[]) {
  st().clear();
  let last = { kind: '', said: null as string | null };
  for (const line of lines) {
    const facts = st().facts;
    const f = replay(facts, st().seed);
    const v = await decideDeterministic2D({ facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
    commitVerdict(v, line);
    const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
    last = { kind: v.kind, said: raw ? stripFormatControls(humanizeError(raw, he, line, otherUtteranceForError(facts, raw))) : null };
  }
  return last;
}

const kindAt0 = () => {
  const cs = [...replay(st().facts, 0).circles.values()];
  const [a, b] = cs;
  const d = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
  return Math.abs(d - (a.r + b.r)) < 1e-4 ? 'EXT' : Math.abs(d - Math.abs(a.r - b.r)) < 1e-4 ? 'INT' : 'none';
};

const PAIR = ['מעגל O', 'מעגל P'];
const INT = 'המעגלים O ו-P משיקים מבפנים';
const EXT = 'המעגלים O ו-P משיקים מבחוץ';

describe('#2339 — a contradicting tangency kind is refused before commit, naming the earlier line', () => {
  const ROWS: [string, string[], string, string][] = [
    ['the report: internal, then external', [...PAIR, INT], EXT, INT],
    ['external, then internal', [...PAIR, EXT], INT, EXT],
    ['one radius stated', ['מעגל O ברדיוס 5', 'מעגל P', INT], EXT, INT],
    ['touch points A, then B', [...PAIR, `${INT} בנקודה A`], `${EXT} בנקודה B`, `${INT} בנקודה A`],
    ['both at a named A', [...PAIR, `${INT} בנקודה A`], `${EXT} בנקודה A`, `${INT} בנקודה A`],
    ['the subject form', [...PAIR, 'מעגל P משיק למעגל O מבפנים'], 'מעגל P משיק למעגל O מבחוץ', 'מעגל P משיק למעגל O מבפנים'],
    ['English', ['circle O', 'circle P', 'circles O and P are internally tangent'], 'circles O and P are externally tangent', 'circles O and P are internally tangent'],
    ['both radii stated (the control, unchanged)', ['מעגל O ברדיוס 5', 'מעגל P ברדיוס 2', INT], EXT, INT],
  ];
  for (const [name, prefix, line, earlier] of ROWS)
    it(`${name}: «${line}» is refused, the figure unchanged`, async () => {
      await play(prefix);
      const before = st().facts.length;
      const kindBefore = kindAt0();
      const out = await play([...prefix, line]);
      expect(out.kind).toBe('refuse');
      expect(out.said).toMatch(new RegExp(`^לא ניתן: «${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}» סותר את «${earlier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}»`));
      expect(st().facts.length, 'nothing committed').toBe(before);
      expect(kindAt0()).toBe(kindBefore);
      expect(replay(st().facts, 0).violations, 'no ⚠ panel').toEqual([]);
    });

  it('«…משיקים» · «…מבפנים» · «…מבחוץ»: the last line is refused before commit (no panel)', async () => {
    const out = await play([...PAIR, 'המעגלים O ו-P משיקים', INT, EXT]);
    expect(out.kind).toBe('refuse');
    expect(out.said).toMatch(/^לא ניתן: «המעגלים O ו-P משיקים מבחוץ» סותר/);
    expect(st().facts).toHaveLength(4);
    expect(replay(st().facts, 0).violations).toEqual([]);
  });
});

describe('#2339 — one kind, stated once or restated, still builds', () => {
  it('internal alone: internally tangent, green, at seeds 0–3', async () => {
    expect((await play([...PAIR, INT])).kind).toBe('commit');
    for (const seed of [0, 1, 2, 3]) {
      const r = replay(st().facts, seed);
      const [a, b] = [...r.circles.values()];
      expect(Math.abs(Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) - Math.abs(a.r - b.r)), `seed ${seed}`).toBeLessThan(1e-4);
      expect(r.violations).toEqual([]);
    }
  });
  it('external alone: externally tangent, green', async () => {
    expect((await play([...PAIR, EXT])).kind).toBe('commit');
    expect(kindAt0()).toBe('EXT');
  });
  it('«…משיקים» then «…מבפנים»: the stated kind wins (ADR-704), internal, green', async () => {
    expect((await play([...PAIR, 'המעגלים O ו-P משיקים', INT])).kind).toBe('commit');
    expect(kindAt0()).toBe('INT');
    expect(replay(st().facts, 0).violations).toEqual([]);
  });
  it('internal restated: the «כבר קיים» no-op', async () => {
    expect((await play([...PAIR, INT, INT])).kind).toBe('noop');
  });
  it('the model is never called', async () => {
    await play([...PAIR, INT, EXT]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
