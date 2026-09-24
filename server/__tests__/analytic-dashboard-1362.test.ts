/**
 * #1362 — analytic's events are READ: the dashboard profile, its taxonomy, its mount, and the triage
 * app list that no longer has a 2-D else-arm.
 *
 * #1243 made analytic POST usage events; until this, nothing read them, so the data accumulated in the
 * same "unread" state that issue was filed about — one layer further out.
 *
 * The taxonomy is the operator's 2026-09-24 ruling: `not-handled` = build this, `out-of-scope` =
 * correctly declined, `bad-equation` / `unknown-reference` / `bad-arity` = REVIEW (neither auto-filed
 * nor discarded). These rows call the one classifier the dashboard and `/log-triage` both use.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTIC_REVIEW_RULED, PROFILE_ANALYTIC, aggregate, outcomeOfAnalytic } from '../admin';
import type { UsageEvent } from '../eventLog';
import { PRODUCT_IDS } from '../toolRouting';
import { TRIAGE_ADAPTED, localEventsFile, remoteEventsFile, triagePlan } from '../../.claude/skills/log-triage/apps';

const ROOT = path.join(__dirname, '..', '..');
const ev = (source: string, result: string, utterance = 'x'): UsageEvent =>
  ({ ev: 'submit', sid: 's1', iph: 'v1', serverTs: '2026-09-23T10:00:00.000Z', utterance, locale: 'he', source, result }) as UsageEvent;

describe('#1362 — the analytic taxonomy is the operator\'s ruling', () => {
  it('not-handled is a GAP to build (a final one — the fallback did not answer)', () => {
    expect(outcomeOfAnalytic(ev('parser', 'not-handled'))).toBe('not-understood');
    expect(outcomeOfAnalytic(ev('llm', 'none'))).toBe('not-understood');
    expect(outcomeOfAnalytic(ev('llm', 'rejected'))).toBe('not-understood');
  });

  it('out-of-scope is CORRECTLY DECLINED', () => {
    expect(outcomeOfAnalytic(ev('parser', 'out-of-scope'))).toBe('out-of-scope');
  });

  it('the three ruled middle codes go to REVIEW', () => {
    for (const code of ANALYTIC_REVIEW_RULED) expect(outcomeOfAnalytic(ev('parser', code)), code).toBe('review');
    expect([...ANALYTIC_REVIEW_RULED].sort()).toEqual(['bad-arity', 'bad-equation', 'unknown-reference']);
  });

  it('an UNRULED refusal code is reviewed too — never silently filed as declined', () => {
    for (const code of ['unsatisfiable', 'already-named', 'repeated-vertex', 'reserved-coordinate'])
      expect(outcomeOfAnalytic(ev('parser', code)), code).toBe('review');
  });

  it('understood lines are parsed — built, already known, or taught', () => {
    for (const r of ['record', 'already-known', 'already-follows', 'teach']) expect(outcomeOfAnalytic(ev('parser', r)), r).toBe('parsed');
  });

  it('the LLM lane: lines built are llm-built, a throttle is throttled', () => {
    expect(outcomeOfAnalytic(ev('llm', 'lines'))).toBe('llm-built');
    expect(outcomeOfAnalytic(ev('llm', 'busy'))).toBe('throttled');
  });
});

describe('#1362 — the analytic dashboard aggregates through that taxonomy', () => {
  const sample = [
    ev('parser', 'record', 'נקודה A (1,2)'),
    ev('parser', 'not-handled', 'CE חוצה זווית C'),
    ev('llm', 'lines', 'DMCE מקבילית'),
    ev('parser', 'bad-equation', 'y = 2x +'),
    ev('parser', 'unsatisfiable', 'AB = 1'),
    ev('parser', 'out-of-scope', 'הוכח כי'),
  ];

  it('each event lands in its ruled bucket', () => {
    const by = Object.fromEntries(aggregate(sample, PROFILE_ANALYTIC).outcomes.map((o) => [o.key, o.count]));
    expect(by).toMatchObject({ parsed: 1, 'not-understood': 1, 'llm-built': 1, review: 2, 'out-of-scope': 1 });
  });

  it('the review bucket is broken down by refusal CODE — the count the ruling\'s revisit trigger reads', () => {
    const by = Object.fromEntries(aggregate(sample, PROFILE_ANALYTIC).scopeBreakdown.map((o) => [o.key, o.count]));
    expect(by['bad-equation']).toBe(1);
    expect(by.unsatisfiable).toBe(1);
  });

  it('the profile is the analytic tool\'s own — its tool id and its own verdicts file', () => {
    expect(PROFILE_ANALYTIC.tool).toBe('analytic');
    expect(PROFILE_ANALYTIC.verdictsFile).toBe('verdicts-analytic.json');
    expect(PROFILE_ANALYTIC.gapKey).toBe('not-understood');
    expect(PROFILE_ANALYTIC.secondaryKey).toBe('review');
  });
});

describe('#1362 — the dashboard is MOUNTED, on a tail that cannot reach another product', () => {
  const conf = readFileSync(path.join(ROOT, 'deploy', 'apache-analytic-builder.conf'), 'utf8');
  const standalone = readFileSync(path.join(ROOT, 'server', 'standalone.ts'), 'utf8');

  it('Apache maps /analytic-builder/admin to the DISTINCT /admin-analytic tail, never the bare /admin', () => {
    expect(conf).toMatch(/^ProxyPass \/analytic-builder\/admin http:\/\/127\.0\.0\.1:8788\/admin-analytic$/m);
    expect(conf).toMatch(/^ProxyPassReverse \/analytic-builder\/admin http:\/\/127\.0\.0\.1:8788\/admin-analytic$/m);
    expect(conf).not.toMatch(/^ProxyPass \/analytic-builder\/admin http:\/\/127\.0\.0\.1:8788\/admin$/m);
  });

  it('standalone routes /admin-analytic BEFORE /admin — the substring would otherwise serve the 2-D dashboard', () => {
    const at = standalone.indexOf("path.includes('/admin-analytic')");
    const bare = standalone.indexOf("path.includes('/admin')");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(bare);
    expect(standalone.slice(at, at + 400)).toContain('profile: PROFILE_ANALYTIC');
  });
});

describe('#1362 — /log-triage reads its product list from the registry', () => {
  it('`all` covers EVERY registered product: triaged, or reported as silent — never simply absent', () => {
    const plan = triagePlan('all');
    expect([...plan.apps, ...plan.silent].sort()).toEqual([...PRODUCT_IDS].sort());
    expect(plan.apps).toContain('analytic');
  });

  it('complex has no events yet, so it is reported silent rather than triaged or dropped', () => {
    expect(triagePlan('all').silent).toEqual(PRODUCT_IDS.filter((id) => !TRIAGE_ADAPTED.includes(id)));
    expect(triagePlan('complex')).toEqual({ apps: [], silent: ['complex'] });
  });

  it('an unknown --app throws instead of falling back to 2-D; `both` keeps its old meaning', () => {
    expect(() => triagePlan('nope')).toThrow(/not a registered product/);
    expect(triagePlan('both')).toEqual({ apps: ['2d', '3d'], silent: [] });
  });

  it('the filenames are the router\'s own: 2-D unsuffixed, everyone else events-<id>.jsonl', () => {
    expect(remoteEventsFile('2d')).toBe('events.jsonl');
    expect(remoteEventsFile('3d')).toBe('events-3d.jsonl');
    expect(remoteEventsFile('analytic')).toBe('events-analytic.jsonl');
    expect(localEventsFile('analytic')).toBe('prod-events-analytic.jsonl');
  });

  /**
   * The script runs on import, so it is read, not imported (the triage-mirror precedent). What is
   * asserted is that it CALLS the shared pieces rather than restating them — a copy of the classifier
   * would drift from the dashboard's, which is the ADR-W-053 failure.
   */
  it('triage.mjs uses the plan and the dashboard\'s classifier, and keeps no two-way product branch', () => {
    const src = readFileSync(path.join(ROOT, '.claude', 'skills', 'log-triage', 'triage.mjs'), 'utf8');
    expect(src).toMatch(/import \{ outcomeOfAnalytic \} from '\.\.\/\.\.\/\.\.\/server\/admin\.ts'/);
    expect(src).toMatch(/import \{ triagePlan, remoteEventsFile, localEventsFile \} from '\.\/apps\.ts'/);
    expect(src).toMatch(/import \{ replayAnalyticSession \} from '\.\.\/\.\.\/\.\.\/src-analytic\/app\/triageReplay\.ts'/);
    // the five old branches: `a === '2d' ? …` in code (a comment may still describe them)
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/a === '2d' \?/);
    expect(code).not.toMatch(/\['2d', '3d'\]/);
  });
});
