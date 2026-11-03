/**
 * The checked-in list of KNOWN failing sibling phrasings, one file per builder (#2654 idea 3, ADR-W-171).
 *
 * `SIBLING_PHRASINGS_WRITE=1 npx vitest run <the builder's sibling-phrasings test>` rewrites the
 * builder's list from what the sweep found, and prints the counts. Use it only to SHRINK the list after
 * a fix, or once to seed it — a new failing variant is either fixed or, if the fix is not this
 * session's, added on purpose (docs/22 §10a); never re-seeded to make red go away.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Builder, type FailingVariant, type SweepReport, failingByOperator } from './sibling-phrasings';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'sibling-phrasings');

export const knownPath = (builder: Builder) => join(DIR, `known-${builder}.json`);

export function readKnown(builder: Builder): FailingVariant[] {
  const p = knownPath(builder);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as FailingVariant[]) : [];
}

export const writeMode = () => process.env.SIBLING_PHRASINGS_WRITE === '1';

/** Rewrite the builder's list from a sweep (sorted, so the diff of a fix is just the deleted rows). */
export function writeKnown(builder: Builder, report: SweepReport): void {
  const rows = [...report.failing].sort((a, b) => (a.base + a.operator).localeCompare(b.base + b.operator));
  writeFileSync(knownPath(builder), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify({ builder, bases: report.bases, skipped: report.skipped.length, variants: report.variants, failing: rows.length, failingByOperator: failingByOperator(rows) }),
  );
}
