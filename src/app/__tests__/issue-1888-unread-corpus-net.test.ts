/**
 * #1888 / #1889 ([ADR-603](../../../docs/06-decisions.md#adr-603)) — the FALSE-REFUSAL NET for the read-extent
 * member: no committed step of the scenario corpus or of a saved fixture may have a label run its reading
 * does not read.
 *
 * Every step is taken against its REAL prefix context (the figure the steps before it built), with the commands
 * the real parse→fact path committed for it — the plan's measurement, as a lock. A step this flags is a working
 * line the new member would refuse: that is a red test, never a row to silence. Exercised floor: the net must
 * have checked at least 1400 committed steps (measured at pickup: 1465), so it cannot pass by checking nothing.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SCENARIOS } from '@/__tests__/scenarios-corpus';
import { ctxOf, factsOf, scenarioFacts } from '@/__tests__/scenarios-harness';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { unreadParts } from '../unreadParts';

const FIXTURES = path.resolve(__dirname, '../../__tests__/fixtures');

/** The committed groups of a fact list, each with the facts before it. */
function groups(facts: Fact[]): { utterance: string; cmds: AnyCommand[]; before: Fact[] }[] {
  const out: { utterance: string; cmds: AnyCommand[]; before: Fact[] }[] = [];
  let key: string | null = null;
  facts.forEach((f, i) => {
    const k = f.group ?? f.id;
    if (k !== key) {
      key = k;
      out.push({ utterance: f.utterance ?? '', cmds: [], before: facts.slice(0, i) });
    }
    out[out.length - 1].cmds.push(f.cmd);
  });
  return out;
}

describe('#1888 — the read-extent member refuses no working step of the corpus', () => {
  it('every committed scenario and fixture step reads every label it states', () => {
    const cases: { name: string; facts: Fact[]; typed: Set<string> }[] = [
      ...SCENARIOS.map((sc) => ({ name: `scenario:${sc.id}`, facts: scenarioFacts(sc), typed: new Set(sc.steps.filter((s): s is string => typeof s === 'string')) })),
      ...readdirSync(FIXTURES)
        .filter((n) => n.endsWith('.geo.json'))
        .map((file) => {
          const saved = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { facts: { group: string; utterance: string }[] };
          const steps = [...new Map(saved.facts.map((f) => [f.group, f.utterance])).values()];
          return { name: `fixture:${file}`, facts: factsOf(steps), typed: new Set(steps) };
        }),
    ];
    let checked = 0;
    const flagged: string[] = [];
    for (const c of cases) {
      for (const g of groups(c.facts)) {
        if (!c.typed.has(g.utterance)) continue; // a model step or a naming, not a line the grammar read
        checked++;
        const u = unreadParts(g.utterance, g.cmds, ctxOf(g.before));
        if (u) flagged.push(`[${c.name}] «${g.utterance}» → ${u.items.join(', ')}`);
      }
    }
    expect(flagged).toEqual([]);
    expect(checked, 'the net exercised the corpus').toBeGreaterThanOrEqual(1400);
  }, 600_000);
});
