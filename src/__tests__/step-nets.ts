/**
 * #2739 (ADR-W-191, restoring ADR-394) — THE STEP NETS, run on the corpus's ONE walk.
 *
 * Every committed step of the scenario corpus and of the saved fixtures is a line that works today, so every
 * honesty member that could refuse a line must refuse none of them. These nets used to be their own files
 * (#1888 / #1889 the read-extent member and its #1904, #2198, #2532, #2545 siblings; #1906 the AI-answer word
 * member), and each paid a whole cold walk of the corpus: 8 CPU-minutes apiece, for checks that cost seconds.
 * ADR-394's rule is that a corpus-wide check is an oracle on the walk the scenario shards and the fixture net
 * already make: there, every prefix's replay is a fold-memo hit (ADR-280), so the net pays only its own members.
 *
 * A step is checked when the GRAMMAR committed it: the line was typed (not a model step or a naming), and it
 * re-reads, in its real prefix, to the commands it holds. Each member then runs against that prefix context.
 *
 * Callers: `scenarios-e2e-*.test.ts` (scenario half) and `fixtures.test.ts` (fixture half). Each asserts the
 * flagged list is empty per scenario or fixture, and that its counters moved on its slice.
 */
import type { AnyCommand } from '@/engine';
import type { Fact } from '@/store/geoStore';
import { droppedGivenNumbers, parse, statedNumberOccurrences } from '@/parser';
import { droppedPropertyWords, propertyOccurrences2 } from '@/parser/propertyWords';
import { hasRingSpan } from '@/parser/ringRoles';
import { loweringKey, unreadParts } from '@/app/unreadParts';
import { unreadRoles } from '@/app/unreadRoles';
import { unreadNumbers } from '@/app/unreadNumbers';
import { unreadThrough } from '@/app/unreadThrough';
import { unreadRingRole } from '@/app/unreadRingRole';
import { ctxOf } from './scenario-pipeline';

export interface StepNetCounters {
  /** committed steps the members judged */
  checked: number;
  /** #1904: steps holding a cevian role word */
  withRole: number;
  /** #2198: steps stating a number */
  withNumber: number;
  /** #2532: steps holding a through-phrase opener */
  withThrough: number;
  /** #2545: steps naming a circle by its relation */
  withRingRole: number;
  /** #1906: steps holding a shape or role property word */
  withWord: number;
}

export const newStepNetCounters = (): StepNetCounters => ({ checked: 0, withRole: 0, withNumber: 0, withThrough: 0, withRingRole: 0, withWord: 0 });

/** The committed groups of a fact list, each with the facts before it. */
export function committedGroups(facts: readonly Fact[]): { utterance: string; cmds: AnyCommand[]; before: Fact[] }[] {
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

/**
 * Run every step member over the committed steps of one scenario or fixture. Returns what was flagged, one line
 * per flag naming the source, the step and the member; the caller asserts it is empty.
 */
export function stepNets(name: string, facts: readonly Fact[], typed: ReadonlySet<string>, c: StepNetCounters): string[] {
  const flagged: string[] = [];
  for (const g of committedGroups(facts)) {
    if (!typed.has(g.utterance)) continue; // a model step or a naming, not a line the grammar read
    const ctx = ctxOf(g.before);
    // only a step the GRAMMAR committed: the line re-reads, in its real prefix, to the commands it holds
    const r = parse(g.utterance, ctx);
    if (!r.ok || loweringKey(r.commands) !== loweringKey(g.cmds)) continue;
    c.checked++;
    // #1888 / #1889 (ADR-603): the read-extent member
    const u = unreadParts(g.utterance, g.cmds, ctx);
    if (u) flagged.push(`[${name}] «${g.utterance}» → ${u.items.join(', ')}`);
    // #1904 (ADR-604): the role-word member
    if (/גוב|גבה|תיכו|חוצ|altitude|height|median|bisect/i.test(g.utterance)) c.withRole++;
    const role = unreadRoles(g.utterance, g.cmds, ctx);
    if (role) flagged.push(`[${name}] «${g.utterance}» → role ${role.items.join(', ')}`);
    // #2532 (ADR-765): the incidence-phrase member
    if (/עוב(?:ר|רת|רים|רות)\s|דרך|במרכז|through/i.test(g.utterance)) c.withThrough++;
    const through = unreadThrough(g.utterance, g.cmds, ctx);
    if (through) flagged.push(`[${name}] «${g.utterance}» → through ${through.items.join(', ')}`);
    // #2545 (ADR-768): the relation member
    if (hasRingSpan(g.utterance)) c.withRingRole++;
    const ring = unreadRingRole(g.utterance, g.cmds, ctx);
    if (ring) flagged.push(`[${name}] «${g.utterance}» → ring ${ring.items.join(', ')}`);
    // #1906 (ADR-722): the AI-answer word member — the grammar's own lowering, standing in for a faithful answer
    if (propertyOccurrences2(g.utterance).length > 0) c.withWord++;
    const lost = droppedPropertyWords(g.utterance, g.cmds, ctx);
    if (lost.length) flagged.push(`[${name}] «${g.utterance}» → word ${lost.join(', ')}`);
    // #2198 (ADR-677 / ADR-678): a seed never pays for a stated number, and every stated number is read
    if (statedNumberOccurrences(g.utterance).occurrences.length === 0) continue;
    c.withNumber++;
    const acc = droppedGivenNumbers(g.utterance, g.cmds);
    if (acc.length) flagged.push(`[${name}] «${g.utterance}» → number not accounted ${acc.join(', ')}`);
    const nums = unreadNumbers(g.utterance, g.cmds, ctx);
    if (nums.length) flagged.push(`[${name}] «${g.utterance}» → number unread ${nums.join(', ')}`);
  }
  return flagged;
}
