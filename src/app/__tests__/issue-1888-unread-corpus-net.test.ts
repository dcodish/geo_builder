/**
 * #1888 / #1889 ([ADR-603](../../../docs/06-decisions.md#adr-603)) — the FALSE-REFUSAL NET for the read-extent
 * member: no committed step of the scenario corpus or of a saved fixture may have a label run its reading
 * does not read.
 *
 * Every step is taken against its REAL prefix context (the figure the steps before it built), with the commands
 * the real parse→fact path committed for it — the plan's measurement, as a lock. #1904 (ADR-604) runs its role-word
 * member over the same steps, #2198 (ADR-677/678) its number member and the seed-blind number accountant, and #2532
 * (ADR-765) its incidence-phrase member. A step this flags is a working
 * line the new member would refuse: that is a red test, never a row to silence. Exercised floor: the net must
 * have checked at least 1400 committed steps (measured at pickup: 1465), so it cannot pass by checking nothing.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SCENARIOS } from '@/__tests__/scenarios-corpus';
import { ctxOf, scenarioFacts } from '@/__tests__/scenarios-harness';
import { droppedGivenNumbers, parse, statedNumberOccurrences } from '@/parser';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { loweringKey, unreadParts } from '../unreadParts';
import { unreadRoles } from '../unreadRoles';
import { unreadNumbers } from '../unreadNumbers';
import { unreadThrough } from '../unreadThrough';

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
          // a fixture's saved facts ARE what was committed (some steps by the model, which no re-parse reproduces)
          const saved = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { facts: Fact[] };
          return { name: `fixture:${file}`, facts: saved.facts, typed: new Set(saved.facts.map((f) => f.utterance ?? '')) };
        }),
    ];
    let checked = 0;
    let withRole = 0;
    let withNumber = 0;
    let withThrough = 0;
    const flagged: string[] = [];
    for (const c of cases) {
      for (const g of groups(c.facts)) {
        if (!c.typed.has(g.utterance)) continue; // a model step or a naming, not a line the grammar read
        const ctx = ctxOf(g.before);
        // only a step the GRAMMAR committed: the line re-reads, in its real prefix, to the commands it holds
        const r = parse(g.utterance, ctx);
        if (!r.ok || loweringKey(r.commands) !== loweringKey(g.cmds)) continue;
        checked++;
        const u = unreadParts(g.utterance, g.cmds, ctx);
        if (u) flagged.push(`[${c.name}] «${g.utterance}» → ${u.items.join(', ')}`);
        // #1904 (ADR-604): the role-word member, over the same steps
        if (/גוב|גבה|תיכו|חוצ|altitude|height|median|bisect/i.test(g.utterance)) withRole++;
        const role = unreadRoles(g.utterance, g.cmds, ctx);
        if (role) flagged.push(`[${c.name}] «${g.utterance}» → role ${role.items.join(', ')}`);
        // #2532 (ADR-765): the incidence-phrase member, over the same steps
        if (/עוב(?:ר|רת|רים|רות)\s|דרך|במרכז|through/i.test(g.utterance)) withThrough++;
        const through = unreadThrough(g.utterance, g.cmds, ctx);
        if (through) flagged.push(`[${c.name}] «${g.utterance}» → through ${through.items.join(', ')}`);
        // #2198 (ADR-677 / ADR-678): a seed never pays for a stated number, and every stated number is read
        if (statedNumberOccurrences(g.utterance).occurrences.length === 0) continue;
        withNumber++;
        const acc = droppedGivenNumbers(g.utterance, g.cmds);
        if (acc.length) flagged.push(`[${c.name}] «${g.utterance}» → number not accounted ${acc.join(', ')}`);
        const nums = unreadNumbers(g.utterance, g.cmds, ctx);
        if (nums.length) flagged.push(`[${c.name}] «${g.utterance}» → number unread ${nums.join(', ')}`);
      }
    }
    console.info(`#1888 corpus net: ${checked} committed steps checked (${withRole} with a role word, ${withNumber} with a stated number, ${withThrough} with a through-phrase), ${flagged.length} flagged`);
    expect(flagged).toEqual([]);
    expect(checked, 'the net exercised the corpus').toBeGreaterThanOrEqual(1400);
    // measured at pickup: 1485 steps, 38 holding a cevian role word
    expect(withRole, 'the role-word member met real role words').toBeGreaterThanOrEqual(35);
    // #2198: measured at pickup (ef78f15c) 218 of 1718 steps state a number by the gate's own scanner (counts and
    // name indices blanked; the plan's 261 counted every digit run)
    expect(withNumber, 'the number member met real stated numbers').toBeGreaterThanOrEqual(200);
    // #2532: measured at pickup (045a8546) 17 of 2056 committed steps hold a through-phrase opener
    expect(withThrough, 'the incidence-phrase member met real through-phrases').toBeGreaterThanOrEqual(15);
  }, 600_000);
});
