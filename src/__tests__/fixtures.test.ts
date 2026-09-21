/**
 * Saved-figure fixtures net (the regression companion of FR-HS-10 save/load).
 *
 * Every `fixtures/*.geo.json` file is a figure saved at a moment it was verified correct
 * (corpus figures generated through the real parse → replay path; operator-promoted saves join
 * them the same way — save in the app, eyeball against the textbook image, drop the file here).
 * The harness runs the REAL load path (raw text → `deserializeFigure` → `replay`) and asserts two
 * things per file, with zero per-figure authoring:
 *
 *  1. **Replays green** — builds with no error, nothing pending, the givens verifier clean, every
 *     fact `ok`. "Green means VERIFIED" (ADR-053), so this is a strong net, not a smoke test:
 *     an engine change that stops satisfying any stated given in any fixture fails here.
 *  2. **Parser drift** — each fact stores both the utterance and the lowered commands; re-parsing
 *     the utterance (with the figure context of the facts before it, as the app does) must lower
 *     to the SAME commands. An utterance the parser can't read is skipped — that's an
 *     LLM-escalated step, stored as its canonical commands (the no-live-calls rule).
 *
 * What this deliberately does NOT do: assert figure-specific facts (angles, orderings) — that's
 * `scenarios.test.ts`. This net answers "does everything that used to build green still build
 * green?"; scenarios answer "is this specific behavior still right?".
 *
 * NOTE the drift check parses with the seed-0 prefix context (same as scenario `ctxOf` and the
 * fixture generator). A file saved from a live session whose steps were typed at a non-zero seed
 * could in principle re-parse differently; if a promoted fixture ever trips only on the drift
 * check, compare the commands by hand before assuming a parser regression.
 */
import { describe, it, expect } from 'vitest';
import { deserializeFigure } from '@/store/figureFile';
import { replay, groupKey } from '@/store/geoStore';
import { findValidConfig } from '@/replay/core';
import type { Fact } from '@/store/geoStore';
import { parse, buildParseCtx } from '@/parser';
import type { AnyCommand } from '@/engine';

const files = import.meta.glob('./fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Consecutive facts sharing a group = one user step (one utterance → possibly many commands). */
function stepsOf(facts: Fact[]): { utterance?: string; cmds: AnyCommand[]; start: number }[] {
  const steps: { utterance?: string; cmds: AnyCommand[]; start: number }[] = [];
  for (let i = 0; i < facts.length; i++) {
    const prev = steps[steps.length - 1];
    if (prev && i > 0 && groupKey(facts[i]) === groupKey(facts[i - 1])) prev.cmds.push(facts[i].cmd);
    else steps.push({ utterance: facts[i].utterance, cmds: [facts[i].cmd], start: i });
  }
  return steps;
}

/** #945 (ADR-513): the saved figures MEASURED flat on 2026-09-13 (recorded in the ADR); every other fixture must stay silent. */
const FIXTURE_DEGENERATE: Record<string, string[]> = {

};

/**
 * #1328 (ADR-537): saved figures whose DEFAULT configuration the accept gate now refuses and whose load the
 * app rescues through the config search at the display event (ADR-446) — the seat tier of ADR-445. The
 * one member is the operator's saved collapse figure itself: «משולש ישר זווית ABC» seats the right angle at
 * C, where «קשת AB = קשת BC» holds only as a needle; the app reseats it at B on load. The net applies that
 * same rescue for a fixture listed here and for NO other — a fixture newly needing it fails loudly, which
 * is the point of a net. The artifact's bytes are untouched.
 */
const FIXTURE_LOAD_RESCUED = new Set<string>(['issue-572-load-collapse']);

describe('figure-file fixtures net', () => {
  it('the net is not empty', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  for (const [file, text] of Object.entries(files)) {
    const name = file.replace('./fixtures/', '').replace('.geo.json', '');

    describe(name, () => {
      const r = deserializeFigure(text);

      it('deserializes through the real load path', () => {
        expect(r.ok, !r.ok ? `refused: ${(r as { reason: string }).reason}` : undefined).toBe(true);
      });
      if (!r.ok) return;
      const { facts: savedFacts, seed: savedSeed } = r.file;
      // ADR-537: the load rescue (ADR-446), for the fixtures that name themselves above — and only those.
      const rescued = FIXTURE_LOAD_RESCUED.has(name) ? findValidConfig(savedFacts) : null;
      if (FIXTURE_LOAD_RESCUED.has(name)) {
        it('the load rescue reseats a figure whose default configuration is refused (ADR-537 on ADR-446)', () => {
          expect(replay(savedFacts, savedSeed).lastError, 'the default configuration IS refused — else this fixture no longer belongs in FIXTURE_LOAD_RESCUED').not.toBeNull();
          expect(rescued, 'the app finds the honest configuration').not.toBeNull();
        });
      }
      // The parser-drift check below compares against the SAVED commands (the artifact); the replay checks use
      // the configuration the app would display.
      const facts = savedFacts;
      const built = rescued?.facts ?? savedFacts;
      const builtSeed = rescued?.seed ?? savedSeed;

      it('replays green: builds, verified, nothing pending', () => {
        const fig = replay(built, builtSeed);
        expect(fig.lastError).toBeNull();
        expect(fig.pending).toBe(false);
        expect(fig.violations).toEqual([]);
        for (const f of facts.filter((f) => f.enabled)) expect(fig.status[f.id], `status of ${f.utterance ?? f.id}`).toBe('ok');
      });

      it('says so if the givens force a declared polygon flat, and stays SILENT otherwise (#945, ADR-513)', () => {
        const fig = replay(built, builtSeed);
        const want = [...(FIXTURE_DEGENERATE[name] ?? [])].sort();
        expect(fig.degeneracies.map((d) => d.object).sort(), `degeneracy notices of ${name} (ratios ${fig.degeneracies.map((d) => d.ratio.toExponential(2)).join(', ')})`).toEqual(want);
      });

      it('its utterances still lower to the same commands (parser drift)', () => {
        for (const step of stepsOf(facts)) {
          if (!step.utterance) continue; // a direct command (no text) — nothing to re-parse
          const prefix = facts.slice(0, step.start);
          const { construction, positions } = replay(prefix);
          const p = parse(step.utterance, buildParseCtx(construction, positions));
          if (!p.ok) continue; // out-of-grammar — an LLM-escalated step, stored as canonical commands
          expect(p.commands, `"${step.utterance}" lowers differently than when saved`).toEqual(step.cmds);
        }
      });
    });
  }
});
