/**
 * #916 (ADR-3D-232) — THE FIXTURE GENERATOR, AND THE SCHEMA-COVERAGE RULE IT USED TO ERASE.
 *
 * `GEN_FIXTURES3=1` is the documented way to add a fixture (`fixtures3.test.ts`'s own header says so),
 * and it regenerated **every** entry of `SEEDED`, not the new one — so adding a single fixture produced
 * 14 modified files. The diff was not churn: it was a schema MIGRATION (`schemaVersion 1 → 2`,
 * `{sym, k}` → `{terms:[{sym, k}]}`), and those v1 files are the **only** coverage of the
 * backward-compatible load path a student's saved figure depends on. Committing the regeneration would
 * have deleted that coverage while looking like harmless noise in review, and the suite was green
 * before and after — nothing failed when the coverage disappeared. That is the defect.
 *
 * Two changes, and the second is the one that matters:
 *
 * 1. **The generator writes only what is MISSING.** A full rebuild still exists but has to be asked for
 *    by name (`GEN_FIXTURES3_ALL`), so it can no longer happen as a side effect of adding one fixture.
 * 2. **The corpus must hold ≥1 fixture at every schemaVersion the load path still accepts.** Item 1
 *    makes the accident unlikely; item 2 makes it *visible*, which is the actual failure — per standing
 *    rule 1 the class is "silently losing a schema generation's load coverage", not "this one env flag
 *    is too eager". Any other route to the same loss (a hand-edit, a bulk rewrite, a stale file
 *    deleted) fails the same lock.
 *
 * This is a plain module, not a `.test.ts`: the generator has to be callable from a test that drives it
 * against a temp directory, and importing a test file from another test would double-register it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeFigure3, SCHEMA_VERSION_3D } from '../store/figureFile3';
import { useGeo3 } from '../store/store3';

/** file name → the utterance session that produces it. */
export type SeededCorpus = Record<string, string[]>;

/**
 * Write the seeded corpus into `dir`.
 *
 * Default: only files **missing from disk**, so adding one entry to `SEEDED` writes one file. `all`
 * rebuilds every entry — the deliberate, destructive form, which is why it has its own flag and is
 * never the default.
 *
 * Throws on a session that does not build, rather than writing a fixture of a broken figure.
 */
export function generateSeeded(
  dir: string,
  seeded: SeededCorpus,
  opts: { all?: boolean } = {},
): { written: string[]; skipped: string[] } {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [name, seq] of Object.entries(seeded)) {
    if (!opts.all && existsSync(join(dir, name))) {
      skipped.push(name);
      continue;
    }
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
    for (const u of seq) {
      useGeo3.getState().submit(u);
      const err = useGeo3.getState().lastError;
      if (err) throw new Error(`${name}: «${u}» did not build — ${JSON.stringify(err)}`);
    }
    writeFileSync(join(dir, name), serializeFigure3(useGeo3.getState().facts, useGeo3.getState().seed), 'utf8');
    written.push(name);
  }
  return { written, skipped };
}

/**
 * Every schemaVersion the load path still ACCEPTS — `deserializeFigure3` refuses only
 * `schemaVersion > SCHEMA_VERSION_3D`, so that is 1..current. Derived from the constant, never
 * re-listed: a version bump moves this by itself.
 */
export function supportedSchemaVersions(): number[] {
  return Array.from({ length: SCHEMA_VERSION_3D }, (_, i) => i + 1);
}

/** schemaVersion → the fixture files carrying it. */
export function schemaVersionCoverage(dir: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.geo3.json'))) {
    let v: unknown;
    try {
      v = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { schemaVersion?: unknown }).schemaVersion;
    } catch {
      continue; // an unparseable file is the load net's problem, not this one's
    }
    if (typeof v !== 'number') continue;
    out.set(v, [...(out.get(v) ?? []), f]);
  }
  return out;
}

/** The versions that have LOST their load coverage — empty is the healthy state. */
export function versionsWithoutCoverage(dir: string): number[] {
  const have = schemaVersionCoverage(dir);
  return supportedSchemaVersions().filter((v) => (have.get(v) ?? []).length === 0);
}
