/**
 * #1906 ([ADR-722](../../../docs/06-decisions.md#adr-722)) — the FALSE-REFUSAL NET for the AI-answer word member.
 *
 * The member refuses an AI answer that drops a shape or role word the student typed. Its one real risk is a
 * faithful answer it calls unfaithful — a lowering its evidence families miss. So every faithful lowering we have
 * is run through it, standing in for the answer:
 *  - every committed step of the scenario corpus and of the saved fixtures, against its REAL prefix context, with
 *    the commands the grammar committed for it (an AI answer that says exactly what the grammar said must pass).
 *    That half rides the corpus's one walk since #2739 (ADR-W-191, restoring ADR-394): `src/__tests__/step-nets.ts`,
 *    called from the scenario shards and the fixture net, where every prefix replay is a fold-memo hit;
 *  - every supported catalog example, both locales, on an empty figure and parsed by the grammar.
 * A step this flags is a working line the member would refuse: a red test, never a row to silence. Floors keep the
 * net from passing by checking nothing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@/parser';
import { COMMAND_CATALOG } from '@/parser/catalog';
import { droppedPropertyWords, propertyOccurrences2 } from '@/parser/propertyWords';
import type { AnyCommand } from '@/engine';

describe('#1906 — the AI-answer word member refuses no faithful lowering', () => {
  /**
   * A catalog example is read standalone, so a sentence that PRESUPPOSES its polygon («חצי מעגל על צלע AB מחוץ
   * למשולש ABC») names a triangle no command draws: on an empty figure the polygon name is unaccounted, exactly as a
   * model answer there would be. With the line's own letters on the figure the noun is a reference (ADR-595's
   * exemption) and must pass; on the empty figure the only words it may flag are such polygon names.
   */
  it('every supported catalog example, both locales, as an answer to itself, keeps every word', () => {
    let checked = 0;
    const flagged: string[] = [];
    const emptyFlags: string[] = [];
    for (const doc of COMMAND_CATALOG.filter((d) => d.supported && !d.needsFigure)) {
      for (const line of [doc.he, doc.en]) {
        const r = parse(line, {});
        if (!r.ok) continue;
        checked++;
        const letters = [...new Set(line.match(/[A-Z]\d*/g) ?? [])];
        const lost = droppedPropertyWords(line, r.commands, { points: letters });
        if (lost.length) flagged.push(`«${line}» → ${lost.join(', ')}`);
        const occs = propertyOccurrences2(line);
        for (const w of droppedPropertyWords(line, r.commands, {})) {
          const o = occs.find((x) => x.text === w);
          if (!o || !o.candidates.every((c) => c.phrase.props.every((p) => p.kind === 'ring'))) emptyFlags.push(`«${line}» → ${w}`);
        }
      }
    }
    console.info(`#1906 catalog net: ${checked} examples checked, ${flagged.length} flagged`);
    expect(flagged).toEqual([]);
    expect(emptyFlags, 'on an empty figure only a presupposed polygon name may be unaccounted').toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(300);
  });

  /**
   * The answers models actually gave. A log line carries no figure, so the line's own letters stand in for it
   * (every noun a reference unless the answer must draw it). One is a TRUE catch: the operator's prod run
   * (#1891), «מעגל חסום במחומש ABCDE» answered with the bare pentagon — today refused before the model.
   */
  it('the recorded AI answers: only the true catch is flagged', () => {
    const { answers } = JSON.parse(readFileSync(path.resolve(__dirname, 'recorded-ai-answers-1906.json'), 'utf8')) as {
      answers: { utterance: string; commands?: AnyCommand[]; steps?: string[] }[];
    };
    const flagged: string[] = [];
    let checked = 0;
    for (const a of answers) {
      let cmds = a.commands;
      if (!cmds) {
        const all: AnyCommand[] = [];
        for (const st of a.steps ?? []) {
          const r = parse(st, {});
          if (!r.ok) { cmds = undefined; break; }
          all.push(...r.commands);
          cmds = all;
        }
      }
      if (!cmds) continue;
      checked++;
      // a definite bare polygon noun («המשולש») presupposes a polygon on the figure the line was typed on
      const definite = /(?:^|\s)[ובלמש]?ה(?:משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|דלתון|מקבילית|מחומש|משושה)(?![א-ת])(?!\s*[A-Z])/.test(a.utterance);
      const lost = droppedPropertyWords(a.utterance, cmds, {
        points: [...new Set(a.utterance.match(/[A-Z]\d*/g) ?? [])],
        polygons: definite ? [['A', 'B', 'C']] : [],
      });
      if (lost.length) flagged.push(`«${a.utterance}» → ${lost.join(', ')}`);
    }
    console.info(`#1906 recorded answers: ${checked} checked, ${flagged.length} flagged`);
    expect(flagged).toEqual(['«מעגל חסום במחומש ABCDE» → חסום']);
    expect(checked).toBeGreaterThanOrEqual(25);
  });
});
