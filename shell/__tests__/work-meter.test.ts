/**
 * The work meter and its gate (#2873, ADR-W-210 phase 0): the counter every builder's solver calls, and the rule
 * every builder's `work-meter-gate.test.ts` applies. The builders' own gates prove the counts; this proves the
 * instrument — the lane, the phase, and that the gate fails on a rise and only on a rise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inWorkerLane, meterAction, meterWork, readWork, workLane } from '../workMeter';
import { firstDifference, formatBaseline, openWorkGate, parseBaseline, walkOrder, type GateConfig, type MeasuredAction } from './work-gate';

describe('the work meter', () => {
  it('charges a unit to the page unless the work runs in the worker lane', () => {
    const m = meterAction();
    meterWork();
    inWorkerLane(() => meterWork(4));
    meterWork(2);
    expect(m.end()).toEqual({ total: 7, page: 3, prePaint: 7 });
  });

  it('restores the lane when the worker-lane work throws, so nothing after it is mischarged', () => {
    expect(() =>
      inWorkerLane(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(workLane()).toBe('page');
    const m = meterAction();
    meterWork();
    expect(m.end().page).toBe(1);
  });

  it('counts work before the paint apart from work after it', () => {
    const m = meterAction();
    meterWork(5); // decide, commit, the render
    m.painted();
    meterWork(3); // an effect
    inWorkerLane(() => meterWork(10)); // background detection
    m.unpainted();
    meterWork(1); // a second figure the student waits for
    expect(m.end()).toEqual({ total: 19, page: 9, prePaint: 6 });
  });

  it('a new action starts before the paint, whatever the last one ended in', () => {
    const first = meterAction();
    first.painted();
    first.end();
    const second = meterAction();
    meterWork();
    expect(second.end().prePaint).toBe(1);
  });

  it('only ever grows: an action is the difference of two readings', () => {
    const before = readWork();
    meterWork(3);
    const after = readWork();
    expect(after.total - before.total).toBe(3);
  });
});

describe('the work-meter gate', () => {
  let dir: string;
  let report: string;
  const cfg = (): GateConfig => ({ product: 'demo', title: 'demo builder', unit: 'one solve', dir, perfCommand: (figure) => `perf --only ${figure}` });
  const act = (action: string, total: number, page = total, prePaint = total): MeasuredAction => ({ action, work: { total, page, prePaint } });
  const check = (env: Record<string, string> = {}) => openWorkGate(cfg(), { WORK_METER_REPORT: report, ...env });
  const record = (figures: Record<string, MeasuredAction[]>, env: Record<string, string> = {}): void => {
    const g = check({ WORK_METER: 'record', ...env });
    for (const [f, as] of Object.entries(figures)) g.check(f, as);
    g.finish(Object.keys(figures));
  };
  const baselineText = (): string => readFileSync(join(dir, 'baseline.jsonl'), 'utf8');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'work-gate-'));
    report = join(dir, 'report.json');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records one line per figure-action, sorted by key, under a header', () => {
    record({ 'b.json': [act('load', 5), act('submit#1', 2)], 'a.json': [act('submit#1', 9, 4, 9)] });
    const lines = baselineText().trim().split('\n');
    expect(JSON.parse(lines[0])._).toMatch(/WORK-METER BASELINE/);
    expect(lines.slice(1)).toEqual([
      '{"k":"a.json|submit#1","total":9,"page":4,"prePaint":9}',
      '{"k":"b.json|load","total":5,"page":5,"prePaint":5}',
      '{"k":"b.json|submit#1","total":2,"page":2,"prePaint":2}',
    ]);
    expect(formatBaseline(parseBaseline(baselineText()).values())).toBe(baselineText());
  });

  it('passes on the counts it recorded', () => {
    const figures = { 'a.json': [act('load', 5), act('submit#1', 2)] };
    record(figures);
    const g = check();
    g.check('a.json', figures['a.json']);
    expect(() => g.finish(['a.json'])).not.toThrow();
  });

  it('fails on a rise, and the message is enough to act on', () => {
    record({ 'a.json': [act('load', 5), { ...act('submit#1', 100), label: 'AB = 3' }] });
    const g = check();
    let message = '';
    try {
      g.check('a.json', [act('load', 5), { ...act('submit#1', 200), label: 'AB = 3' }]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('demo builder');
    expect(message).toContain('figure  a.json');
    expect(message).toContain('action  submit#1   «AB = 3»');
    expect(message).toContain('100 → 200 (+100.0%)');
    expect(message).toContain('perf --only a.json');
    expect(message).toContain('npm run work:record -- demo --accept-rise');
    expect(message).toContain('docs/17 §7');
    expect(message).not.toContain('action  load'); // the action that did not move is not named
  });

  it('spells out the largest rises and counts the rest, so one figure with many actions stays readable', () => {
    const rows = Array.from({ length: 12 }, (_, i) => act(`submit#${i + 1}`, 10));
    record({ 'a.json': rows });
    let message = '';
    try {
      check().check('a.json', rows.map((a, i) => act(a.action, 10 + i + 1)));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('12 recorded student actions now do MORE');
    expect(message).toContain('action  submit#12'); // the largest rise is shown
    expect(message).not.toContain('action  submit#1\n'); // the smallest is counted, not shown
    expect(message).toContain('… and 4 more, smaller ones. All of them: ' + report);
  });

  it('a rise in any one of the three counts fails: work moved onto the page, or before the paint, is a rise', () => {
    record({ 'a.json': [act('another#1', 100, 0, 100), act('detect', 50, 0, 0)] });
    expect(() => check().check('a.json', [act('another#1', 100, 30, 100), act('detect', 50, 0, 0)])).toThrow(/page\s+0 → 30/);
    expect(() => check().check('a.json', [act('another#1', 100, 0, 100), act('detect', 50, 0, 50)])).toThrow(/prePaint\s+0 → 50/);
  });

  it('a fall is reported, never failed, and re-recording locks it', () => {
    record({ 'a.json': [act('load', 50)] });
    const g = check();
    g.check('a.json', [act('load', 40)]);
    expect(() => g.finish(['a.json'])).not.toThrow();
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/LESS work[\s\S]*50 → 40/);
    record({ 'a.json': [act('load', 40)] });
    expect(() => check().check('a.json', [act('load', 50)])).toThrow(/40 → 50/);
  });

  it('fails on an action with no recorded count, and on a recorded action the walk no longer makes', () => {
    record({ 'a.json': [act('load', 5), act('edit', 1)] });
    expect(() => check().check('a.json', [act('load', 5), act('edit', 1), act('delete', 1)])).toThrow(/no recorded count \(delete\)[\s\S]*npm run work:record -- demo/);
    expect(() => check().check('a.json', [act('load', 5)])).toThrow(/no longer makes \(edit\)/);
    expect(() => check().check('new.json', [act('load', 5)])).toThrow(/«new.json» has 1 action with no recorded count/);
  });

  it('fails when the baseline records a figure the corpus no longer holds', () => {
    record({ 'a.json': [act('load', 5)], 'gone.json': [act('load', 5)] });
    const g = check();
    g.check('a.json', [act('load', 5)]);
    expect(() => g.finish(['a.json'])).toThrow(/no longer in the corpus \(gone.json\)/);
  });

  it("fails when the builder's page-lane total rises", () => {
    record({ 'a.json': [act('load', 100, 10, 100)], 'b.json': [act('load', 100, 10, 100)] });
    const g = check();
    expect(() => g.check('a.json', [act('load', 100, 25, 100)])).toThrow();
    g.check('b.json', [act('load', 100, 10, 100)]);
    expect(() => g.finish(['a.json', 'b.json'])).toThrow(/UI thread ROSE: 20 → 35 units/);
  });

  it('re-recording never writes a rise unless it is accepted, and then prints the before and after', () => {
    record({ 'a.json': [act('load', 5)] });
    const before = baselineText();
    expect(() => record({ 'a.json': [act('load', 9)] })).toThrow(/NOT re-recorded[\s\S]*5 → 9/);
    expect(baselineText()).toBe(before);
    record({ 'a.json': [act('load', 9)] }, { WORK_METER_ACCEPT_RISE: '1' });
    expect(parseBaseline(baselineText()).get('a.json|load')!.total).toBe(9);
    expect(vi.mocked(console.log).mock.calls.at(-1)![0]).toMatch(/ROSE \(accepted\)[\s\S]*5 → 9/);
  });

  it('a filtered re-record replaces only the figures it walked', () => {
    record({ 'a.json': [act('load', 5)], 'b.json': [act('load', 7)] });
    const g = check({ WORK_METER: 'record', WORK_METER_ONLY: 'new' });
    expect(g.wants('a.json')).toBe(false);
    g.check('new.json', [act('load', 3)]);
    g.finish(['a.json', 'b.json', 'new.json']);
    expect([...parseBaseline(baselineText()).keys()]).toEqual(['a.json|load', 'b.json|load', 'new.json|load']);
  });

  it('refuses a baseline a merge left with one action recorded twice', () => {
    writeFileSync(join(dir, 'baseline.jsonl'), '{"k":"a|load","total":1,"page":1,"prePaint":1}\n{"k":"a|load","total":2,"page":2,"prePaint":2}\n');
    expect(() => check()).toThrow(/recorded twice/);
  });

  it('the slow corpus has its own baseline file and its own re-record command', () => {
    const g = openWorkGate({ ...cfg(), corpus: 'slow' }, { WORK_METER_REPORT: report, WORK_METER: 'record' });
    g.check('#1 slow', [act('submit#1', 5)]);
    g.finish(['#1 slow']);
    expect(readFileSync(join(dir, 'baseline-slow.jsonl'), 'utf8')).toContain('"k":"#1 slow|submit#1"');
    const again = openWorkGate({ ...cfg(), corpus: 'slow' }, { WORK_METER_REPORT: report });
    expect(() => again.check('#1 slow', [act('submit#1', 6)])).toThrow(/npm run work:record -- demo --slow --accept-rise/);
  });

  it('walks in the order asked for, the same way every time', () => {
    const sorted = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(walkOrder(sorted, {})).toEqual(sorted);
    expect(walkOrder(sorted, { WORK_METER_ORDER: 'reverse' })).toEqual([...sorted].reverse());
    const shuffled = walkOrder(sorted, { WORK_METER_ORDER: 'shuffle:7' });
    expect([...shuffled].sort()).toEqual(sorted);
    expect(shuffled).not.toEqual(sorted);
    expect(walkOrder(sorted, { WORK_METER_ORDER: 'shuffle:7' })).toEqual(shuffled);
  });

  it('names the first difference between two walks of one figure', () => {
    expect(firstDifference([act('load', 5)], [act('load', 5)])).toBeNull();
    expect(firstDifference([act('load', 5)], [act('load', 6)])).toBe('load: total 5, then 6');
    expect(firstDifference([act('load', 5)], [act('load', 5), act('edit', 1)])).toBe('1 actions, then 2');
  });
});
