/**
 * THE ENGINE NEVER WRITES INTO THE CONSTRUCTION IT IS GIVEN — the class lock of #2370
 * ([ADR-828](../../../docs/06-decisions.md#adr-828); the class [ADR-624](../../../docs/06-decisions.md#adr-624) met first).
 *
 * `applyCommand` copies `prev.objects` and `prev.constraints` as ARRAYS, not element by element, so a branch that
 * assigns into an object it found there writes into `prev`, and into every holder of `prev`: the fold memo's entry
 * for the lines before the step ([ADR-280](../../../docs/06-decisions.md#adr-280), the prefix a later fold resumes
 * from, [ADR-406](../../../docs/06-decisions.md#adr-406)). The right-triangle seat on a placed vertex did
 * (`.solve = …`), and «משולש ABC» kept a right angle at C for the rest of the session.
 *
 * The lock does not list sites. It DEEP-FREEZES the construction before every step and folds, in order, the commands
 * of every 2-D fixture and of every catalog example, through `applyCommand` and through the step the fold really takes
 * (`applyStep`: the solve ladder, the ownership release, the side seats). An in-place write into a frozen object
 * throws a `TypeError` in strict mode, and every such throw is collected and reported with the command that made it.
 *
 * test-budget: it folds all 171 fixtures and the catalog once, step by step, with the solve each step needs (about a
 * minute). One file, because the walk is the lock.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { COMMAND_CATALOG } from '@/parser/catalog';
import {
  applyCommand,
  applyStep,
  buildSymTab,
  emptyConstruction,
  evaluate,
  expandInscribe,
  expandShapeVariant,
  lowerOne,
  type AnyCommand,
  type Command,
  type Construction,
} from '@/engine';

const files = import.meta.glob('../../__tests__/fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Freeze an object and everything it holds (a construction is plain data: objects, arrays, numbers, strings). */
function deepFreeze<T>(v: T, seen = new Set<object>()): T {
  if (v === null || typeof v !== 'object' || seen.has(v as object)) return v;
  seen.add(v as object);
  if (v instanceof Map || v instanceof Set) return v; // none in a construction; a result's maps are not `prev`
  for (const x of Object.values(v as object)) deepFreeze(x, seen);
  return Object.freeze(v);
}

/** A write into a frozen object, as V8 words it. Anything else a step throws is the step refusing, not this lock's. */
const isFrozenWrite = (e: unknown): boolean => e instanceof TypeError && /read only|read-only|not extensible|Cannot (assign|add|delete|define)/i.test(e.message);

/** The engine commands a fact's command lowers to (the fold's lowering, without its whole-list reseats). */
function lowered(cmd: AnyCommand, symtab: ReturnType<typeof buildSymTab>): Command[] {
  const out = cmd.type === 'shape-variant' ? expandShapeVariant(cmd, []) : cmd.type === 'inscribe' ? expandInscribe(cmd) : lowerOne(cmd, symtab);
  return out as Command[];
}

interface Walked {
  steps: number;
  writes: string[];
}

/** Fold `cmds` in order, every step from a deep-frozen construction. */
function foldFrozen(name: string, cmds: AnyCommand[]): Walked {
  const symtab = buildSymTab(cmds);
  const writes: string[] = [];
  let steps = 0;
  let c: Construction = emptyConstruction();
  for (const any of cmds) {
    let engineCmds: Command[];
    try {
      engineCmds = lowered(any, symtab);
    } catch {
      continue; // a command this simple lowering cannot read is not this lock's
    }
    for (const cmd of engineCmds) {
      deepFreeze(c);
      steps++;
      const note = (how: string, e: unknown) => writes.push(`[${name}] ${how} of ${JSON.stringify(cmd).slice(0, 120)}: ${(e as Error).message}`);
      // 1. `applyCommand` itself, over the positions the figure has
      let viaCommand: Construction | null = null;
      try {
        const e = evaluate(c);
        viaCommand = applyCommand(c, cmd, e.ok ? e.positions : new Map());
      } catch (e) {
        if (isFrozenWrite(e)) note('applyCommand', e);
      }
      // 2. the step the fold takes: the next construction is its result (or the bare command's, when the step refuses)
      try {
        const r = applyStep(c, cmd);
        if (r.ok) c = r.construction;
        else if (viaCommand) c = viaCommand;
      } catch (e) {
        if (isFrozenWrite(e)) note('applyStep', e);
        else if (viaCommand) c = viaCommand;
      }
    }
  }
  return { steps, writes };
}

describe('the engine never writes into the construction a step starts from (#2370, ADR-828)', () => {
  it('the lock can see a write: a frozen construction throws on one', () => {
    const c = deepFreeze(applyCommand(emptyConstruction(), { type: 'triangle', ids: ['A', 'B', 'C'] } as Command));
    let thrown: unknown = null;
    try {
      (c.objects[0] as unknown as { solve?: unknown }).solve = {};
    } catch (e) {
      thrown = e;
    }
    expect(isFrozenWrite(thrown), 'an in-place write into a frozen object is a TypeError this lock recognises').toBe(true);
  });

  it('the reported site: a right triangle over three placed points leaves «משולש ABC» as it was', () => {
    const w = foldFrozen('reported', [
      { type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand,
      { type: 'right-triangle', ids: ['A', 'B', 'C'] } as AnyCommand,
    ]);
    expect(w.steps).toBe(2);
    expect(w.writes).toEqual([]);
  });

  it('every 2-D fixture, its commands folded in order', () => {
    const names = Object.keys(files).sort();
    expect(names.length).toBeGreaterThan(150);
    let steps = 0;
    const writes: string[] = [];
    for (const file of names) {
      const facts = (JSON.parse(files[file]) as { facts?: { cmd: AnyCommand; enabled?: boolean }[] }).facts ?? [];
      const w = foldFrozen(file.replace(/^.*\//, ''), facts.filter((f) => f.enabled !== false).map((f) => f.cmd));
      steps += w.steps;
      writes.push(...w.writes);
    }
    expect(steps, 'the walk folded real steps (not an empty pass)').toBeGreaterThan(1000);
    expect(writes).toEqual([]);
  }, 600_000);

  it('every catalog example, Hebrew and English, as a student types it on an empty figure', () => {
    let read = 0;
    let steps = 0;
    const writes: string[] = [];
    for (const row of COMMAND_CATALOG) {
      if (!row.supported) continue;
      for (const text of [row.he, row.en]) {
        const r = parse(text, {});
        if (!r.ok) continue; // an example that needs a figure asks for it; it carries no commands to fold
        read++;
        const w = foldFrozen(`catalog «${text}»`, r.commands as AnyCommand[]);
        steps += w.steps;
        writes.push(...w.writes);
      }
    }
    expect(read, 'catalog examples read standalone').toBeGreaterThan(200);
    expect(steps).toBeGreaterThan(read);
    expect(writes).toEqual([]);
  }, 600_000);
});
