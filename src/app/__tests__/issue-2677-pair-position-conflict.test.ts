/**
 * #2677 ([ADR-779](../../../docs/06-decisions.md#adr-779)) — a circle pair's stated mutual positions that exclude each
 * other are refused, naming the earlier statement, in either order.
 *
 * Measured at pickup (`main` ebacadd1, `decideDeterministic2D` → the store → `replay`, model mocked): after «מעגל P מוכל
 * בתוך מעגל O», «המעגלים O ו-P משיקים מבחוץ» and «… נחתכים בנקודות X ו-Y» COMMITTED with every row `ok` and the
 * verifier flagging `circle-contained`; the reverse orders and «זרים» against the containment the same, and so did a
 * containment stated both ways (found in round #2697). «זרים» against a tangency or a crossing also commits with the
 * disjointness flagged; that outcome is unruled, so it is left as it is (a Question of round #2697). «משיקים מבחוץ» then «נחתכים» was already refused
 * (ADR-645's one-common-point guard) and keeps that refusal.
 *
 * Controls: containment with internal tangency (ADR-704) builds, so does a tangency of unstated kind on either side of
 * a containment (the fold resolves it internal).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { pairPositionConflictOf } from '@/engine/radiusFeasibility';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

type Out = { kind: string; text: string | null; green?: boolean };

/** Submit each line through the real decision; a commit is executed into the store. */
async function submit(lines: string[]): Promise<Out[]> {
  useGeoStore.getState().clear();
  const out: Out[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
      const s2 = useGeoStore.getState();
      const f2 = replay(s2.facts, s2.seed);
      out.push({ kind: 'commit', text: null, green: Object.values(f2.status).every((x) => x === 'ok') && f2.violations.length === 0 });
      continue;
    }
    if (v.kind === 'refuse' && v.note && 'explain' in v.note)
      out.push({ kind: 'refuse', text: stripFormatControls(humanizeError(v.note.explain, he, line, otherUtteranceForError(st.facts, v.note.explain))) });
    else if (v.kind === 'refuse' && v.note && 'key' in v.note) out.push({ kind: 'refuse', text: stripFormatControls(he(v.note.key, v.note.params)) });
    else out.push({ kind: v.kind, text: null });
  }
  return out;
}

const REASON = {
  'contained-ext-tangent': 'מעגל שמוכל בתוך מעגל אחר נמצא בתוכו, ולכן אינו יכול להשיק לו מבחוץ',
  'contained-crossing': 'מעגל שמוכל בתוך מעגל אחר נמצא כולו בתוכו, ולכן אין להם נקודות חיתוך',
  'contained-disjoint': 'מעגל שמוכל בתוך מעגל אחר נמצא בתוכו, ולכן אינו מחוץ לו',
  'contained-contained': 'מעגל שמוכל בתוך מעגל אחר קטן ממנו, ולכן המעגל האחר אינו מוכל בתוכו',
} as const;
const contradicts = (line: string, other: string, why: keyof typeof REASON) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${REASON[why]}.`;

const C = ['מעגל O', 'מעגל P'];
const CONTAINED = 'מעגל P מוכל בתוך מעגל O';
const EXT = 'המעגלים O ו-P משיקים מבחוץ';
const CROSS = 'המעגלים O ו-P נחתכים בנקודות X ו-Y';
const DISJOINT = 'המעגלים O ו-P זרים';

describe('#2677 — a stated pair position an earlier one excludes is refused, naming it', () => {
  const ROWS: [string[], string, string, keyof typeof REASON][] = [
    // the report, both lines
    [[...C, CONTAINED], EXT, CONTAINED, 'contained-ext-tangent'],
    [[...C, CONTAINED], CROSS, CONTAINED, 'contained-crossing'],
    // the reverse orders
    [[...C, EXT], CONTAINED, EXT, 'contained-ext-tangent'],
    [[...C, CROSS], CONTAINED, CROSS, 'contained-crossing'],
    // «זרים» («מחוץ», the plan's third member) against containment, both orders
    [[...C, CONTAINED], DISJOINT, CONTAINED, 'contained-disjoint'],
    [[...C, DISJOINT], CONTAINED, DISJOINT, 'contained-disjoint'],
    // a containment stated both ways (found in round #2697)
    [[...C, 'מעגל O מוכל בתוך מעגל P'], CONTAINED, 'מעגל O מוכל בתוך מעגל P', 'contained-contained'],
    // the pair named by the two-circle noun
    [['שני מעגלים מוכלים'], 'המעגלים משיקים מבחוץ', 'שני מעגלים מוכלים', 'contained-ext-tangent'],
  ];
  for (const [prefix, line, other, why] of ROWS) {
    it(`[${prefix.join(' · ')}] «${line}» → refused, naming «${other}»`, async () => {
      const out = await submit([...prefix, line]);
      expect(out.slice(0, -1).map((o) => o.kind)).toEqual(prefix.map(() => 'commit'));
      expect(out.slice(0, -1).every((o) => o.green)).toBe(true);
      expect(out[out.length - 1]).toEqual({ kind: 'refuse', text: contradicts(line, other, why) });
    });
  }
});

describe('#2677 — controls: what the plane allows still builds green', () => {
  const OK: string[][] = [
    [...C, CONTAINED, 'המעגלים O ו-P משיקים מבפנים'], // ADR-704
    [...C, CONTAINED, 'המעגלים O ו-P משיקים מבפנים בנקודה T'],
    [...C, CONTAINED, 'המעגלים O ו-P משיקים'], // unstated kind, resolved internal
    [...C, 'המעגלים O ו-P משיקים', CONTAINED],
    [...C, EXT, 'המעגלים O ו-P משיקים מבחוץ בנקודה T'],
    [...C, CROSS],
    [...C, DISJOINT],
  ];
  for (const lines of OK) {
    it(`«${lines.join(' · ')}» builds green`, async () => {
      const out = await submit(lines);
      expect(out.map((o) => o.kind)).toEqual(lines.map(() => 'commit'));
      expect(out[out.length - 1].green).toBe(true);
    });
  }

  // «זרים» against a tangency or a crossing is not this item's (no ruling; a Question of round #2697): unchanged, drawn
  // with the disjointness flagged
  for (const lines of [[...C, DISJOINT, CROSS], [...C, DISJOINT, EXT]])
    it(`«${lines.join(' · ')}» is unchanged: committed, the disjointness flagged`, async () => {
      const out = await submit(lines);
      expect(out.map((o) => o.kind)).toEqual(lines.map(() => 'commit'));
      expect(out[out.length - 1].green).toBe(false);
    });

  it('«משיקים מבחוץ» then «נחתכים» keeps its own one-common-point refusal (ADR-645), not this reader', async () => {
    const out = await submit([...C, EXT, CROSS]);
    expect(out[out.length - 1].kind).toBe('refuse');
    expect(out[out.length - 1].text).not.toMatch(/זרים|מוכל/);
  });
});

describe('#2677 — the reader is a reading of statements, never of coordinates', () => {
  const pos = (relation: 'contained' | 'disjoint', a = 'circle-O', b = 'circle-P') => ({ kind: 'circle-position' as const, relation, a, b });
  const tan = (external: boolean, kindStated?: false) => ({ kind: 'circle-position' as const, relation: 'tangent' as const, a: 'circle-P', b: 'circle-O', at: 'T', external, ...(kindStated === false ? { kindStated } : {}) });
  const cc = { kind: 'circle-circle', id: 'X', circle1: 'circle-P', circle2: 'circle-O', branch: 0 } as never;
  it('reads each exclusion, in either argument order', () => {
    expect(pairPositionConflictOf({ objects: [], requirements: [pos('contained'), tan(true)] }, 'circle-P', 'circle-O')).toEqual(['contained', 'ext-tangent']);
    expect(pairPositionConflictOf({ objects: [cc], requirements: [pos('contained')] }, 'circle-O', 'circle-P')).toEqual(['contained', 'crossing']);
    expect(pairPositionConflictOf({ objects: [], requirements: [pos('contained'), pos('disjoint', 'circle-P', 'circle-O')] }, 'circle-O', 'circle-P')).toEqual(['contained', 'disjoint']);
    expect(pairPositionConflictOf({ objects: [], requirements: [pos('contained'), pos('contained', 'circle-P', 'circle-O')] }, 'circle-O', 'circle-P')).toEqual(['contained', 'contained']);
  });
  it('allows what the plane allows', () => {
    expect(pairPositionConflictOf({ objects: [], requirements: [pos('contained'), tan(false)] }, 'circle-O', 'circle-P')).toBeNull();
    expect(pairPositionConflictOf({ objects: [], requirements: [pos('contained'), tan(true, false)] }, 'circle-O', 'circle-P')).toBeNull(); // kind unstated
    expect(pairPositionConflictOf({ objects: [cc], requirements: [pos('contained'), tan(false)] }, 'circle-O', 'circle-P')).toBeNull(); // the touch point
    expect(pairPositionConflictOf({ objects: [cc], requirements: [tan(true)] }, 'circle-O', 'circle-P')).toBeNull(); // ADR-645's, not this reader's
    expect(pairPositionConflictOf({ objects: [], requirements: [pos('contained', 'circle-Q', 'circle-P'), pos('disjoint')] }, 'circle-O', 'circle-P')).toBeNull(); // another pair
  });
});
