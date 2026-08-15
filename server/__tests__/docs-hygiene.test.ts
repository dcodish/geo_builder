/**
 * Orientation-file guards (ADR-W-002; issue #452).
 *
 * CLAUDE.md loads into EVERY session unconditionally. It had grown to 188 KB, of which 90% was two
 * append-only session chronologies (95 `**Then (date):**` entries) that duplicated the ADR logs —
 * ordered by date instead of by id, with no anchor, and by then nine days stale.
 *
 * The measured regrowth rate is what makes these guards the deliverable rather than a nicety:
 * 135,150 B (2026-07-23) -> 192,188 B (2026-07-30) on the main line, ~2 KB per commit. A cleanup
 * without a guard returns to 188 KB in about three weeks of active work.
 *
 * The chronology ban is the load-bearing assertion. Size creeps back one justified paragraph at a
 * time and any single paragraph looks reasonable; the `**Then (` form is the specific habit that
 * produced 172 KB, so banning the FORM makes the pressure visible at the moment it recurs.
 *
 * These live in server/__tests__ for the same reason as isolation.test.ts: the shared-server tests
 * run in EVERY per-product CI lane, so a violation added by any product fails its own lane.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Ceilings are set ABOVE current size on purpose. A guard that fires on a legitimate addition gets
 * relaxed, and then there is no guard at all. Legitimate growth here (a new module row, a new
 * standing rule) is a few hundred bytes; the 2 KB/commit rate that produced 188 KB was chronology.
 */
const ORIENTATION_FILES = [
  { file: 'CLAUDE.md', ceiling: 20_000 },
  { file: 'src3d/CLAUDE.md', ceiling: 10_000 },
  { file: 'src-complex/CLAUDE.md', ceiling: 10_000 },
] as const;

/** The ADR logs an orientation file may reference. */
const ADR_LOGS = [
  'docs/06-decisions.md',
  'docs/06b-decisions-3d.md',
  'docs/06w-decisions-workspace.md',
  'docs/06d-decisions-complex.md',
];

/**
 * An ADR id in any product's scheme. The prefix alternation must cover every log in ADR_LOGS —
 * an id whose prefix is missing here is not "allowed", it is INVISIBLE to the resolution test,
 * which is the enumeration failure mode this suite exists to catch.
 */
const ADR_ID = String.raw`ADR-(?:3D-|W-|CX-)?\d+`;

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('orientation files stay orientation files (ADR-W-002)', () => {
  it('the guarded files exist (guard is not vacuous)', () => {
    for (const { file } of ORIENTATION_FILES) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
    }
  });

  it.each(ORIENTATION_FILES)('$file stays under its size ceiling', ({ file, ceiling }) => {
    const bytes = Buffer.byteLength(read(file), 'utf8');
    expect(
      bytes,
      `${file} is ${bytes} B, over the ${ceiling} B ceiling. This file is an ORIENTATION file: ` +
        `what exists, where it lives, what must never be done. History belongs in the ADR logs ` +
        `(docs/06*.md), status in the issue queue. Do not raise the ceiling to fit new prose — ` +
        `move the prose to its ADR.`,
    ).toBeLessThan(ceiling);
  });

  it.each(ORIENTATION_FILES)('$file carries no dated session chronology', ({ file }) => {
    const text = read(file);
    // The exact form that produced 172 KB of duplicated ADR narrative.
    const chronology = text.match(/\*\*Then \(/g) ?? [];
    expect(
      chronology.length,
      `${file} has ${chronology.length} "**Then (" entries. A dated progress entry belongs in its ` +
        `ADR (docs/06-decisions.md, docs/06b-decisions-3d.md, docs/06w-decisions-workspace.md), ` +
        `not here — that is the copy that is actually kept current.`,
    ).toBe(0);
  });

  it('every ADR id referenced by an orientation file resolves in a log', () => {
    const declared = new Set<string>();
    for (const log of ADR_LOGS) {
      for (const heading of read(log).match(new RegExp(String.raw`^#+\s*${ADR_ID}`, 'gm')) ?? []) {
        declared.add(heading.replace(/^#+\s*/, ''));
      }
    }
    expect(declared.size, 'no ADR headings parsed — the log format changed').toBeGreaterThan(100);

    const dangling: string[] = [];
    for (const { file } of ORIENTATION_FILES) {
      // The trailing \b keeps the `ADR-3D-NNN` placeholder from matching as `ADR-3`.
      for (const id of new Set(read(file).match(new RegExp(String.raw`${ADR_ID}\b`, 'g')) ?? [])) {
        if (!declared.has(id)) dangling.push(`${file} -> ${id}`);
      }
    }
    expect(dangling, 'referenced ADR ids with no entry in any log').toEqual([]);
  });
});
