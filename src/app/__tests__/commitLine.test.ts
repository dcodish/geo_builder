/**
 * `commitLine.ts` (ADR-588, ADR-769; moved out of the submit pipeline by #2890, ADR-830) — THE ONE PLACE a
 * deterministic verdict reaches the store. A unit test of the module itself: a commit is one batch (one row, one undo
 * entry), a refusal and an escalation commit nothing, an exact repeat is absorbed, and the created-points notice says
 * nothing for a line that created no point by reference.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { commitLine, commitVerdict } from '../commitLine';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import type { Verdict2D } from '../decideDeterministic';

const st = () => useGeoStore.getState();
const commandsOf = (line: string) => {
  const d = replay(st().facts, st().seed);
  const r = parse(line, buildParseCtx(d.construction, d.positions));
  if (!r.ok) throw new Error(`«${line}» did not parse`);
  return r.commands;
};
const commit = (line: string): Verdict2D => ({ kind: 'commit', deferred: false, binds: [], commands: commandsOf(line), logs: [], note: null });
const rows = () => new Set(st().facts.map(groupKey)).size;

describe('commitLine — a verdict reaches the store in one place', () => {
  beforeEach(() => {
    st().clear();
    useGeoStore.temporal.getState().clear();
  });

  it('a commit is ONE batch: one row and one undo entry, labelled by the line', () => {
    commitVerdict(commit('משולש ABC'), 'משולש ABC');
    const before = useGeoStore.temporal.getState().pastStates.length;
    const created = commitVerdict(commit('M אמצע AB'), 'M אמצע AB');
    expect(rows()).toBe(2);
    expect(useGeoStore.temporal.getState().pastStates.length).toBe(before + 1);
    expect(st().facts[st().facts.length - 1].utterance).toBe('M אמצע AB');
    expect(created, 'M is defined by the line, not created by reference').toBeNull();
  });

  it('a refusal, an escalation and a noop with no naming commit nothing', () => {
    commitVerdict(commit('משולש ABC'), 'משולש ABC');
    const facts = st().facts;
    const note = { key: 'x' } as never;
    expect(commitVerdict({ kind: 'refuse', category: 'conflict', preParse: false, binds: [], logs: [], note }, 'AB = 5')).toBeNull();
    expect(commitVerdict({ kind: 'escalate', binds: [], logs: [], weak: null, parseReason: null }, 'AB = 5')).toBeNull();
    expect(commitVerdict({ kind: 'noop', binds: [], logs: [], note: null }, 'AB = 5')).toBeNull();
    expect(st().facts).toBe(facts);
  });

  it('commitLine: an exact repeat of what the figure holds adds no row and no notice', () => {
    const cmds = commandsOf('משולש ABC');
    commitLine(cmds, cmds, 'משולש ABC');
    const facts = st().facts;
    expect(commitLine(cmds, cmds, 'משולש ABC')).toBeNull();
    expect(st().facts).toBe(facts);
  });
});
