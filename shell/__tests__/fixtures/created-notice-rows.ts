/**
 * #1467 ([ADR-W-162](../../../docs/06w-decisions-workspace.md#adr-w-162)) — the shared half of the four-builder
 * created-points lock (docs/28 §5c). Each tree hands its REAL submit path as a `CreatedPointsAdapter`, plus its own
 * sentences, from `<tree>/__tests__/created-notice-1467.test.ts`. Shell may not import a product tree (ADR-W-016
 * rule 2). Test-only: nothing here is imported by runtime code.
 *
 * The meta-lock (`shell/__tests__/created-notice-meta.test.ts`) runs these rows against broken adapters, so the
 * suite cannot pass by checking nothing.
 */
import { expect } from 'vitest';
import type { CreatedPointsAdapter } from '../../session/createdPoints';

export interface CreatedNoticeSentences {
  /** A line referring to points an EMPTY canvas lacks, and the labels its notice must name (in order). */
  referenceLine: string;
  referenceNames: readonly string[];
  /** Lines that build a figure, then a line naming exactly one missing label (`typoName`). */
  typoSetup: readonly string[];
  typoLine: string;
  typoName: string;
  /** A line that DECLARES its points: it announces nothing. */
  declarationLine: string;
}

/** One row: a name and a check that throws (an `expect`) when the adapter breaks the contract. */
export interface CreatedNoticeRow {
  name: string;
  run(a: CreatedPointsAdapter, s: CreatedNoticeSentences): Promise<void>;
}

const sameNames = (a: readonly string[] | undefined, b: readonly string[]) => expect([...(a ?? [])]).toEqual([...b]);

export const CREATED_NOTICE_ROWS: readonly CreatedNoticeRow[] = [
  {
    name: 'a reference on an empty canvas records, and the notice names exactly the referenced labels',
    async run(a, s) {
      a.reset();
      await a.submit(s.referenceLine);
      expect(a.lineCount(), 'the line recorded').toBe(1);
      for (const n of s.referenceNames) expect(a.pointNames(), n).toContain(n);
      sameNames(a.lastCreated()?.names, s.referenceNames);
    },
  },
  {
    name: "the notice's ✕ removes the line, and with it the created points",
    async run(a, s) {
      a.reset();
      await a.submit(s.referenceLine);
      a.undoLastLine();
      expect(a.lineCount()).toBe(0);
      for (const n of s.referenceNames) expect(a.pointNames(), n).not.toContain(n);
    },
  },
  {
    name: 'a mistyped label on an existing figure is created, and the notice names only it',
    async run(a, s) {
      a.reset();
      for (const l of s.typoSetup) await a.submit(l);
      const before = a.lineCount();
      await a.submit(s.typoLine);
      expect(a.lineCount(), 'the typo line recorded').toBe(before + 1);
      sameNames(a.lastCreated()?.names, [s.typoName]);
    },
  },
  {
    name: 'a declaration announces nothing',
    async run(a, s) {
      a.reset();
      await a.submit(s.declarationLine);
      expect(a.lineCount()).toBe(1);
      expect(a.lastCreated()).toBeNull();
    },
  },
  {
    name: 'the next line retires the notice',
    async run(a, s) {
      a.reset();
      await a.submit(s.referenceLine);
      expect(a.lastCreated()).not.toBeNull();
      await a.submit(s.declarationLine);
      expect(a.lastCreated()).toBeNull();
    },
  },
];

/** Run every row; returns the names of the rows that failed (empty = the adapter honours the contract). */
export async function createdNoticeFaults(a: CreatedPointsAdapter, s: CreatedNoticeSentences): Promise<string[]> {
  const failed: string[] = [];
  for (const row of CREATED_NOTICE_ROWS) {
    try {
      await row.run(a, s);
    } catch {
      failed.push(row.name);
    }
  }
  return failed;
}
