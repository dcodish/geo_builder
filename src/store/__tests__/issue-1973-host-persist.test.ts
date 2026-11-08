/**
 * #1973 ([ADR-797](../../../docs/06-decisions.md#adr-797)) — THE HOST AN ACCEPTED CEVIAN WAS RESOLVED IN STAYS ON ITS
 * FACTS: through undo/redo, a save and a load, a share link and a letter change, and it is shown BESIDE the row.
 *
 * The operator's ruling of 2026-10-10 (option C): *"persist the host, and show it beside the student's words rather
 * than inside them"*. The parser reports the host (`src/parser/__tests__/cevian-host-1973.test.ts`) and the commit
 * stamps it (`src/app/__tests__/submitPipeline.test.ts`); this file is the unit test of the STORE half — the `Fact.host`
 * field, its file format and the row's tag — so it commits through the store's own API and loads the operator's own
 * saved sequence (`fixtures/issue-1973-cevian-host.geo.json`), never re-parsing a sentence.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { deserializeFigure, figureStateOf, serializeFigure, serializeFigureForLink } from '@/store/figureFile';
import { loadFigureText } from '@/store/figureLoad';
import { openSharedFigure } from '@/store/shareLink';
import { hostTag, type CevianHost } from '../../../shell/cevianHost';
import { CEVIAN_HOST_TAG } from '../../../shell/__tests__/fixtures/geo-input-parity';

const st = () => useGeoStore.getState();
const FIXTURE = readFileSync(path.join(__dirname, '../../__tests__/fixtures/issue-1973-cevian-host.geo.json'), 'utf8');
const ABC: CevianHost = { ring: ['A', 'B', 'C'], kind: 'triangle' };
/** The operator's three lines, committed as the pipeline commits them (one `executeMany` per line, the host on its own). */
const build = () => {
  st().clear();
  st().executeMany([{ type: 'triangle', ids: ['A', 'B', 'C'] }], 'משולש ABC');
  st().executeMany([{ type: 'foot', id: 'E', from: 'A', a: 'B', b: 'C', named: true }, { type: 'segment', a: 'A', b: 'E' }], 'AE גובה', ABC);
  st().executeMany([{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }], 'מרובע ABCD');
};
/** Each row as the list shows it: its utterance, and the host its facts carry. */
const rows = (facts: readonly Fact[] = st().facts) => {
  const out: { said: string | undefined; host: CevianHost | null }[] = [];
  for (const f of facts) {
    const last = out[out.length - 1];
    if (last && last.said === f.utterance) continue;
    out.push({ said: f.utterance, host: facts.find((g) => g.utterance === f.utterance && g.host)?.host ?? null });
  }
  return out;
};
const OPERATOR = [
  { said: 'משולש ABC', host: null },
  { said: 'AE גובה', host: ABC },
  { said: 'מרובע ABCD', host: null },
];

beforeEach(() => {
  st().clear();
  useGeoStore.temporal.getState().clear();
});

describe('#1973 — the host rides on the line’s facts', () => {
  it('every fact the cevian line appends carries it; the other lines carry none', () => {
    build();
    expect(rows()).toEqual(OPERATOR);
    expect(st().facts.filter((f) => f.utterance === 'AE גובה').every((f) => f.host?.ring.join('') === 'ABC')).toBe(true);
  });

  it('the row keeps the student’s words — the host never enters the utterance or a command', () => {
    build();
    const line = st().facts.filter((f) => f.utterance === 'AE גובה');
    expect(line.map((f) => f.cmd)).toEqual([{ type: 'foot', id: 'E', from: 'A', a: 'B', b: 'C', named: true }, { type: 'segment', a: 'A', b: 'E' }]);
  });

  it('replay never reads it: the same facts without the host draw the same figure', () => {
    build();
    const bare = st().facts.map(({ host: _h, ...f }) => f);
    const a = replay(st().facts, st().seed).positions;
    const b = replay(bare, st().seed).positions;
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe('#1973 — undo and redo restore it with its line', () => {
  it('undo past the second shape keeps the host; undo past the cevian removes the line; redo restores both', () => {
    build();
    st().undo();
    expect(rows()).toEqual(OPERATOR.slice(0, 2));
    st().undo();
    expect(rows()).toEqual(OPERATOR.slice(0, 1));
    st().redo();
    st().redo();
    expect(rows()).toEqual(OPERATOR);
  });
});

describe('#1973 — a save, a load and a share link keep it', () => {
  it('the operator’s saved sequence loads with the host on «AE גובה»', async () => {
    const r = await loadFigureText(FIXTURE);
    expect(r.ok).toBe(true);
    expect(rows()).toEqual(OPERATOR);
  });

  it('save → load round-trips it (the file the save button and the session restore write)', async () => {
    build();
    const text = serializeFigure(figureStateOf(st()));
    st().clear();
    expect((await loadFigureText(text)).ok).toBe(true);
    expect(rows()).toEqual(OPERATOR);
  });

  it('the share link’s trimmed envelope keeps it', async () => {
    build();
    const payload = serializeFigureForLink(figureStateOf(st()));
    st().clear();
    expect((await openSharedFigure(payload)).ok).toBe(true);
    expect(rows()).toEqual(OPERATOR);
  });

  it('a file saved before the field loads with no host and no error, and draws the same figure', async () => {
    const old = JSON.parse(FIXTURE) as { facts: Record<string, unknown>[] };
    for (const f of old.facts) delete f.host;
    const r = await loadFigureText(JSON.stringify(old));
    expect(r.ok).toBe(true);
    expect(rows().map((x) => x.host)).toEqual([null, null, null]);
    const withHost = deserializeFigure(FIXTURE);
    expect(withHost.ok).toBe(true);
    if (!withHost.ok) return;
    expect([...replay(st().facts, st().seed).positions.entries()]).toEqual([...replay(withHost.file.facts, withHost.file.seed).positions.entries()]);
  });

  it('a malformed host in a hand-edited file is dropped, never trusted — the file still loads', () => {
    const bad = JSON.parse(FIXTURE) as { facts: Record<string, unknown>[] };
    bad.facts[1].host = { ring: ['A', 'B'], kind: 'triangle' };
    bad.facts[2].host = { ring: ['A', 'B', 'C'], kind: 'hexahedron' };
    const r = deserializeFigure(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.facts.map((f) => f.host ?? null)).toEqual([null, null, null, null]);
  });
});

describe('#1973 — a letter change carries the host’s letters, as it carries the row’s', () => {
  it('rename A → P: «PE גובה» in triangle PBC', () => {
    build();
    expect(st().rename('A', 'P').ok).toBe(true);
    expect(rows()[1]).toEqual({ said: 'PE גובה', host: { ring: ['P', 'B', 'C'], kind: 'triangle' } });
  });
  it('swap A ↔ B: «BE גובה» in triangle BAC', () => {
    build();
    expect(st().swap('A', 'B').ok).toBe(true);
    expect(rows()[1]).toEqual({ said: 'BE גובה', host: { ring: ['B', 'A', 'C'], kind: 'triangle' } });
  });
});

describe('#1973 — the tag beside the row (the shared fact list’s `tag`)', () => {
  it.each(['he', 'en'] as const)('names triangle ABC in %s — the text analytic shows for the same sentence', async (lng) => {
    const r = await loadFigureText(FIXTURE);
    expect(r.ok).toBe(true);
    const host = st().facts.find((f) => f.utterance === CEVIAN_HOST_TAG.row && f.host)?.host;
    const tag = hostTag(host, (k, o) => i18n.t(k, { ...o, lng }) as string);
    expect(tag?.text).toBe(CEVIAN_HOST_TAG[lng]);
    expect(tag?.title).toBeTruthy();
  });
  it('a row with no host gets no tag', () => {
    expect(hostTag(undefined, (k) => k)).toBeUndefined();
  });
});
