/**
 * #2362 + #2369 ([ADR-748](../../../docs/06-decisions.md#adr-748)) — A CIRCLE'S CENTRE LETTER CARRIES ITS PROVENANCE.
 *
 * Measured at `37800b85` through `decideDeterministic2D` → `commitVerdict` → `replay`, the model mocked and never called:
 * a circle drawn through points already on the figure (`circumcircle`) recorded nothing about who picked its centre
 * letter. So (#2362) the tool's hidden O answered to the student's «O» — «F אמצע הקשת BC במעגל O» after two such circles
 * escalated, «C על מעגל O» was refused as a conflict, «מעגל O ברדיוס 3» resized the first circle — and (#2369) a centre
 * the student named («מעגל O חוסם את הריבוע ABCD») was hidden like a minted one.
 *
 * Operator ruling 2026-10-20: a centre letter the student did not define and cannot see is not a name they can bind to
 * (Q1); with «הציגו מרכזי מעגלים» on, the shown letters count as defined (Q2). The visibility is read at the submit seam
 * and written into the line's facts (`step-aside` / `adopt`), never read at replay.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { drawnPointIds } from '@/engine/inkCrossings';
import { deserializeFigure, figureStateOf, serializeFigure } from '@/store/figureFile';
import { buildParseCtx, parse } from '@/parser';
import { COMMAND_CATALOG } from '@/parser/catalog';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

async function submit(line: string, shown = false, lang: 'he' | 'en' = 'he') {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D(
    { facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions }, centresShown: shown },
    line,
    lang,
  );
  commitVerdict(v, line);
  return v;
}

async function play(pre: string[], last: string, opts: { shown?: boolean; lang?: 'he' | 'en' } = {}) {
  st().clear();
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const before = replay(st().facts, st().seed).positions;
  const n0 = st().facts.length;
  const v = await submit(last, opts.shown, opts.lang);
  return { v, kind: v.kind, note: (v as { note?: { key?: string } }).note?.key, added: st().facts.length - n0, before };
}

/** The circle (by its centre letter) that X rides at `seed`. */
function onCircle(x: string, k: string, seed = st().seed): boolean {
  const r = replay(st().facts, seed);
  const p = r.positions.get(x), c = r.positions.get(k), g = r.circles.get(`circle-${k}`);
  return !!p && !!c && !!g && Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - g.r) < 1e-6;
}
const drawnAtRest = () => {
  const r = replay(st().facts, st().seed);
  return drawnPointIds(r.construction, r.positions);
};
function green() {
  const r = replay(st().facts, st().seed);
  expect(r.violations).toEqual([]);
  expect(r.lastError).toBeNull();
  expect(llmParseMock).not.toHaveBeenCalled();
}
/** No point that existed before the line moved (renaming a circle moves nothing). */
function nothingMoved(before: Map<string, { x: number; y: number }>, ids: string[]) {
  const after = replay(st().facts, st().seed).positions;
  for (const id of ids) {
    const a = before.get(id)!, b = after.get(id)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y), `${id} did not move`).toBeLessThan(1e-9);
  }
}
const cmds = () => st().facts.map((f) => f.cmd);

beforeEach(() => llmParseMock.mockReset());

// The report's figure: circle 1 through A, B, E, D; circle 2 through A, B, C. Both drawn through drawn points, both unnamed.
const PRE = ['משולש CDE', 'A על CD', 'B על CE', 'מרובע ABED חסום במעגל', 'משולש ABC חסום במעגל'];
const PRE_PTS = ['A', 'B', 'C', 'D', 'E'];
// One circle drawn through a drawn triangle (the existing-vertex single-circle twin).
const TRI = ['משולש ABC', 'משולש ABC חסום במעגל'];

describe('#2362 — centres not shown: the tool\'s letter is not a name, an arc names its circle by use', () => {
  const ARC_LINES: [string, 'he' | 'en', string][] = [
    ['F אמצע הקשת BC במעגל O', 'he', 'O'], // the report
    ['F על הקשת BC במעגל O', 'he', 'O'],
    ['F is the midpoint of arc BC in circle O', 'en', 'O'],
    ['F אמצע הקשת BC במעגל K', 'he', 'K'], // a letter never minted
  ];
  for (const [line, lang, letter] of ARC_LINES)
    it(`«${line}» names the circle through B and C «${letter}» and builds F on it, green, nothing moves`, async () => {
      const r = await play(PRE, line, { lang });
      expect(r.kind).toBe('commit');
      for (const seed of [0, 1, 2, 3]) {
        expect(onCircle('F', letter, seed), `F on circle ${letter}, seed ${seed}`).toBe(true);
        expect(onCircle('C', letter, seed), `circle ${letter} is the one through C, seed ${seed}`).toBe(true);
      }
      nothingMoved(r.before, PRE_PTS);
      green();
    });

  for (const line of ['C על מעגל O', 'BC מיתר במעגל O'])
    it(`«${line}» names the circle through B and C by use — never a conflict`, async () => {
      const r = await play(PRE, line);
      expect(['commit', 'noop']).toContain(r.kind);
      expect(onCircle('C', 'O') && onCircle('B', 'O')).toBe(true);
      nothingMoved(r.before, PRE_PTS);
      green();
    });

  it('«X על מעגל O» asks which circle — never silently on the first', async () => {
    const r = await play(PRE, 'X על מעגל O');
    expect(r.kind).toBe('refuse');
    expect(r.note).toBe('input.unknownCircle');
    expect(r.added).toBe(0);
  });

  it('«משיק למעגל O בנקודה C» asks which circle — never commits a tangent with a violation', async () => {
    const r = await play(PRE, 'משיק למעגל O בנקודה C');
    expect(r.kind).toBe('refuse');
    expect(r.note).toBe('input.unknownCircle');
  });

  for (const line of ['מעגל O', 'מעגל O ברדיוס 3'])
    it(`«${line}» draws a NEW circle O — never «כבר קיים», never a resize of the first`, async () => {
      const r = await play(PRE, line);
      expect(r.kind).toBe('commit');
      expect(cmds().some((c) => c.type === 'circle' && c.center === 'O')).toBe(true);
      nothingMoved(r.before, PRE_PTS);
      green();
    });

  it('«זווית BOC = 100» reads O as a new point, exactly as a fresh letter («זווית BXC = 100»)', async () => {
    const o = await play(PRE, 'זווית BOC = 100');
    const x = await play(PRE, 'זווית BXC = 100');
    expect(o.kind).toBe(x.kind);
    expect(cmds().some((c) => c.type === 'set-angle' && c.vertex === 'O')).toBe(o.kind === 'commit');
  });

  it('the control «F אמצע הקשת BC» is unchanged: F on the circle through B and C', async () => {
    expect((await play(PRE, 'F אמצע הקשת BC')).kind).toBe('commit');
    expect(onCircle('F', 'P')).toBe(true);
    green();
  });

  describe('the existing-vertex single circle now matches the fresh-vertex circle', () => {
    it('«מעגל O» declares a new circle O (was «כבר קיים»)', async () => {
      const r = await play(TRI, 'מעגל O');
      expect(r.kind).toBe('commit');
      expect(cmds().filter((c) => c.type === 'circle' && c.center === 'O')).toHaveLength(1);
      expect(cmds().some((c) => c.type === 'name-by-use' && c.op === 'step-aside')).toBe(true);
    });
    it('«D על מעגל O» names the drawn circle O by use, and O is drawn', async () => {
      expect((await play(TRI, 'D על מעגל O')).kind).toBe('commit');
      expect(onCircle('D', 'O') && onCircle('A', 'O')).toBe(true);
      expect(drawnAtRest().has('O')).toBe(true);
      green();
    });
    it('«זווית BOC = 100» makes O a new point, not the centre', async () => {
      expect((await play(TRI, 'זווית BOC = 100')).kind).toBe('commit');
      const r = replay(st().facts, st().seed);
      const O = r.positions.get('O')!, A = r.positions.get('A')!, B = r.positions.get('B')!;
      const centre = [...r.circles.values()][0];
      expect(Math.hypot(O.x - centre.center.x, O.y - centre.center.y), 'O is not the circle centre').toBeGreaterThan(1e-6);
      expect(Math.abs(Math.hypot(A.x - centre.center.x, A.y - centre.center.y) - Math.hypot(B.x - centre.center.x, B.y - centre.center.y))).toBeLessThan(1e-6);
    });
    it('«משולש DEF חוסם את המעגל O» declares a new circle O (the ruled reading)', async () => {
      const r = await play(TRI, 'משולש DEF חוסם את המעגל O');
      expect(r.kind).toBe('commit');
      expect(cmds().some((c) => (c.type === 'circle' || c.type === 'circle-through') && c.center === 'O')).toBe(true);
    });
    it('«O מרכז המעגל» names the drawn circle O — the same circle, no extra point', async () => {
      expect((await play(TRI, 'O מרכז המעגל')).kind).toBe('commit');
      expect(onCircle('A', 'O') && onCircle('B', 'O') && onCircle('C', 'O')).toBe(true);
      expect([...replay(st().facts, st().seed).circles.keys()]).toEqual(['circle-O']);
      expect(drawnAtRest().has('O')).toBe(true);
      // and a later line then means that centre
      expect((await submit('זווית BOC = 100')).kind).toBe('commit');
      expect(cmds().some((c) => c.type === 'set-angle' && c.vertex === 'O')).toBe(true);
      green();
    });
    it('«O מרכז המעגל» on the two-circle figure names one circle O and adds no point', async () => {
      const r = await play(PRE, 'O מרכז המעגל');
      expect(r.kind).not.toBe('escalate');
      expect(replay(st().facts, st().seed).circles.size).toBe(2);
      nothingMoved(r.before, PRE_PTS);
    });
  });
});

describe('#2362 — centres shown (ruling Q2): the shown letter is the student\'s', () => {
  it('«זווית BOC = 100» typed while O is shown binds the centre, records an adoption, and O stays drawn at rest', async () => {
    const r = await play(TRI, 'זווית BOC = 100', { shown: true });
    expect(r.kind).toBe('commit');
    expect(cmds().some((c) => c.type === 'name-by-use' && c.op === 'adopt')).toBe(true);
    expect(cmds().some((c) => c.type === 'set-angle' && c.vertex === 'O')).toBe(true);
    expect(onCircle('A', 'O')).toBe(true);
    expect(drawnAtRest().has('O'), 'O is drawn with the toggle off').toBe(true);
    green();
  });
  it('«D על מעגל O» while shown puts D on the shown circle O (today\'s existing-vertex result)', async () => {
    expect((await play(TRI, 'D על מעגל O', { shown: true })).kind).toBe('commit');
    expect(onCircle('D', 'O') && onCircle('A', 'O')).toBe(true);
    expect(cmds().some((c) => c.type === 'name-by-use' && c.op === 'adopt')).toBe(true);
  });
  it('the report line while O is shown means the shown O — which does not hold C: still not drawn (ADR-735)', async () => {
    const r = await play(PRE, 'F אמצע הקשת BC במעגל O', { shown: true });
    expect(r.kind).not.toBe('commit');
    expect(r.added).toBe(0);
  });
  it('shown, then hidden, then typed: the letter steps aside (it was not on screen when typed)', async () => {
    st().clear();
    for (const l of TRI) await submit(l);
    expect((await submit('D על AB', true)).kind).toBe('commit'); // a line typed while shown that never uses O
    expect((await submit('מעגל O', false)).kind).toBe('commit');
    expect(cmds().some((c) => c.type === 'name-by-use' && c.op === 'step-aside')).toBe(true);
    expect(cmds().some((c) => c.type === 'circle' && c.center === 'O')).toBe(true);
  });
  it('undo of the adopting line restores the minted O, hidden at rest; redo brings the adoption back', async () => {
    await play(TRI, 'זווית BOC = 100', { shown: true });
    st().undo();
    expect(cmds().some((c) => c.type === 'name-by-use')).toBe(false);
    expect(drawnAtRest().has('O')).toBe(false);
    st().redo();
    expect(cmds().some((c) => c.type === 'name-by-use' && c.op === 'adopt')).toBe(true);
    expect(drawnAtRest().has('O')).toBe(true);
  });
});

describe('#2362 — save / load', () => {
  const roundTrip = () => {
    const loaded = deserializeFigure(serializeFigure(figureStateOf(st())));
    if (!loaded.ok) throw new Error(loaded.reason);
    return loaded.file.facts;
  };
  it('a session with an adoption round-trips to the same figure and the same next verdict', async () => {
    await play(TRI, 'זווית BOC = 100', { shown: true });
    const facts = roundTrip();
    expect(facts.map((f) => f.cmd)).toEqual(cmds());
    const a = replay(facts, 0), b = replay(st().facts, 0);
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()]);
  });
  it('a LEGACY file (no provenance on its circumcircles) loads: the named centre is drawn, the minted one stays minted', () => {
    const legacy = (utterance: string, center: string, extra: Record<string, unknown> = {}) => ({ utterance, cmd: { type: 'circumcircle', id: `circle-${center}`, center, a: 'A', b: 'B', c: 'C', ...extra }, enabled: true });
    const file = (facts: unknown[]) => JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [{ utterance: 'משולש ABC', cmd: { type: 'triangle', ids: ['A', 'B', 'C'] }, enabled: true }, ...facts] });
    const named = deserializeFigure(file([legacy('משולש ABC חסום במעגל O', 'O')]));
    const minted = deserializeFigure(file([legacy('משולש ABC חסום במעגל', 'O')]));
    const bare = deserializeFigure(file([{ cmd: { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C' }, enabled: true }]));
    if (!named.ok || !minted.ok || !bare.ok) throw new Error('load');
    const flag = (fs: Fact[]) => (fs[1].cmd as { autoCenter?: boolean }).autoCenter;
    expect(flag(named.file.facts)).toBe(false);
    expect(flag(minted.file.facts)).toBe(true);
    expect(flag(bare.file.facts), 'no sentence: stays minted (today\'s behaviour)').toBe(true);
    const drawn = (fs: Fact[]) => { const r = replay(fs, 0); return drawnPointIds(r.construction, r.positions); };
    expect(drawn(named.file.facts).has('O')).toBe(true);
    expect(drawn(minted.file.facts).has('O')).toBe(false);
  });
});

describe('#2369 — a centre the student named on a circle drawn through drawn points is drawn', () => {
  const ROWS: [string[], string][] = [
    [['משולש ABC'], 'משולש ABC חסום במעגל O'],
    [['ריבוע ABCD'], 'מעגל O חוסם את הריבוע ABCD'],
    [['משולש ABC'], 'מעגל O חוסם את משולש ABC'],
    [['משולש ABC'], 'מעגל שמרכזו O חוסם את משולש ABC'],
  ];
  for (const [pre, line] of ROWS)
    it(`«${line}» draws O at rest`, async () => {
      expect((await play(pre, line)).kind).toBe('commit');
      expect(drawnAtRest().has('O')).toBe(true);
      green();
    });
  const CONTROLS: [string[], string][] = [
    [[], 'משולש ABC חסום במעגל O'],
    [['משולש ABC'], 'מעגל O חסום במשולש ABC'],
    [['משולש ABC'], 'משולש ABC חוסם מעגל O'],
    [['ריבוע ABCD'], 'מעגל O חסום בריבוע ABCD'],
  ];
  for (const [pre, line] of CONTROLS)
    it(`control «${line}» still draws O`, async () => {
      expect((await play(pre, line)).kind).toBe('commit');
      expect(drawnAtRest().has('O')).toBe(true);
    });
  it('an unnamed circle drawn through drawn points still hides its centre at rest', async () => {
    await play(['משולש ABC'], 'משולש ABC חסום במעגל');
    expect(drawnAtRest().has('O')).toBe(false);
  });
});

describe('#2362 — emitter guard: every circumcircle a rule emits records its provenance', () => {
  const circumcircles = (out: AnyCommand[]) => out.filter((c) => c.type === 'circumcircle');
  const ctxs = (() => {
    const empty = replay([], 0);
    const tri = replay([{ id: 't', utterance: 'משולש ABC', cmd: { type: 'triangle', ids: ['A', 'B', 'C'] }, enabled: true }], 0);
    const sq = replay([{ id: 's', utterance: 'ריבוע ABCD', cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] }, enabled: true }], 0);
    return [empty, tri, sq].map((d) => buildParseCtx(d.construction, d.positions));
  })();
  const lines = [
    ...COMMAND_CATALOG.flatMap((d) => [d.he, d.en]),
    'משולש ABC חסום במעגל', 'משולש ABC חסום במעגל O', 'מעגל O חוסם את משולש ABC', 'מעגל שמרכזו O חוסם את משולש ABC',
    'מעגל O חוסם את הריבוע ABCD', 'מרובע ABCD חסום במעגל', 'המעגל החוסם את משולש ABC חותך את CE בנקודה D',
    'מעגל דרך A B C', 'מעגל דרך A B C D', 'משולש ABC בר חסימה',
  ];
  it('every circumcircle command carries a boolean autoCenter', () => {
    let seen = 0;
    for (const ctx of ctxs)
      for (const line of lines) {
        const r = parse(line, ctx);
        if (!r.ok) continue;
        for (const c of circumcircles(r.commands)) {
          seen++;
          expect(typeof (c as { autoCenter?: unknown }).autoCenter, `«${line}» → ${JSON.stringify(c)}`).toBe('boolean');
        }
      }
    expect(seen, 'the guard saw circumcircles').toBeGreaterThan(3);
  });
});
