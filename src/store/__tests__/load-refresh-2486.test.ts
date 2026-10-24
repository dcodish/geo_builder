/**
 * #2486 (ADR-759) — a figure saved under the old centre-first reading re-opens with the ruled one.
 *
 * Operator ruling 2026-10-24 (e8 A): the middle letter is the centre — «רבע מעגל AOB» is centred at O. A save made
 * before the change stores the old lowering (centre A). The standing load rule (ADR-314, the operator's #120 request of
 * 2026-07-13) re-parses every deterministic step on load and adopts the fresh lowering when it differs, with the
 * existing "updated" note; nothing new is built for this ruling, and this lock documents that it applies.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { serializeFigure } from '@/store/figureFile';
import { loadFigureText } from '@/store/figureLoad';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

function lower(u: string, prefix: Fact[] = []): AnyCommand[] {
  const { construction, positions } = replay(prefix);
  const r = parse(u, buildParseCtx(construction, positions));
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  return r.commands;
}

/** Swap the capitals A and O in every string of a command — the old centre-A lowering from today's centre-O one. */
const swapAO = (c: AnyCommand): AnyCommand =>
  JSON.parse(JSON.stringify(c), (_k, v) => (typeof v === 'string' ? v.replace(/[AO]/g, (ch) => (ch === 'A' ? 'O' : 'A')) : v));

const facts = (u: string, cmds: AnyCommand[], g = 0): Fact[] => cmds.map((cmd, i) => ({ id: `${g}.${i}`, utterance: u, group: `g${g}`, cmd, enabled: true }));

const arcCentre = (fs: Fact[]) => (fs.find((f) => f.cmd.type === 'arc')?.cmd as { center?: string } | undefined)?.center;

beforeEach(() => st().clear());

describe('#2486 — saves made under the centre-first reading re-open with the middle-letter centre', () => {
  it('an old «רבע מעגל AOB» save (centre A) re-opens centred at O, reported refreshed, with no violation', async () => {
    // Today's «רבע מעגל OAB» is centre O, ends A then B; swapping A↔O gives exactly the centre-first lowering of
    // «רבע מעגל AOB» that main 1944d866 saved: centre A, ends O then B.
    const old = facts('רבע מעגל AOB', lower('רבע מעגל OAB').map(swapAO));
    expect(arcCentre(old), 'the save holds the old reading').toBe('A');
    const r = await loadFigureText(serializeFigure({ facts: old, seed: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed, 'step 1 is reported updated (file.loadRefreshed)').toEqual([1]);
    expect(arcCentre(st().facts)).toBe('O');
    expect(replay(st().facts, st().seed).violations).toEqual([]);
  });

  it('an old «חצי מעגל AOB» save (centre A) re-opens centred at O', async () => {
    const old = facts('חצי מעגל AOB', lower('חצי מעגל OAB').map(swapAO));
    expect(arcCentre(old)).toBe('A');
    const r = await loadFigureText(serializeFigure({ facts: old, seed: 0 }));
    expect(r.ok && r.refreshed).toEqual([1]);
    expect(arcCentre(st().facts)).toBe('O');
  });

  it('[unchanged] a «רבע מעגל OAB» save and a «גזרה AOB» save re-open byte-identical, nothing refreshed', async () => {
    for (const u of ['רבע מעגל OAB', 'גזרה AOB']) {
      st().clear();
      const saved = facts(u, lower(u));
      const r = await loadFigureText(serializeFigure({ facts: saved, seed: 0 }));
      expect(r.ok && r.refreshed, u).toEqual([]);
      expect(st().facts.map((f) => f.cmd), u).toEqual(saved.map((f) => f.cmd));
    }
  });

  it('a later LLM-stored step naming the old circle id is not silently re-pointed: the load refuses or reports it', async () => {
    // An escalated step is stored as saved (it does not re-parse). If it names `circle-A`, which the refreshed quarter no
    // longer mints, the honest outcomes are a refused load or a step that reports its failure — never a quiet re-binding.
    const quarter = facts('רבע מעגל AOB', lower('רבע מעגל OAB').map(swapAO));
    const llm: Fact = { id: '1.0', utterance: 'הנקודה C נמצאת איפשהו על הקשת הזאת בבקשה', group: 'g1', cmd: { type: 'point-on-circle', id: 'C', circle: 'circle-A' } as AnyCommand, enabled: true };
    const r = await loadFigureText(serializeFigure({ facts: [...quarter, llm], seed: 0 }));
    if (!r.ok) {
      expect(r.reason).toBe('replay-failed');
      return;
    }
    const fig = replay(st().facts, st().seed);
    const row = st().facts.find((f) => f.utterance === llm.utterance)!;
    expect(row.cmd, 'the escalated step is kept as saved').toEqual(llm.cmd);
    expect(fig.status[row.id], 'the stale step reports its failure').not.toBe('ok');
  });
});
