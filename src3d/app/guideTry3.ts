/**
 * #1566 ([ADR-3D-398](../../docs/06b-decisions-3d.md#adr-3d-398); #2048 ruling A, card d6, and the operator's ruling
 * of 2026-10-30, 3A) — WHAT A GUIDE CLICK SUBMITS.
 *
 * Every guide example builds on a blank canvas. An example that names nothing it could create — a free-vector line,
 * a role noun («גובה הפירמידה»), a value for a letter («α = 70») — carries the lines it needs (`CatalogEntry3.needs`),
 * and a click on an EMPTY canvas submits them first, each as its own row, then the example. On a canvas that already
 * holds a figure the click submits the example alone: the student is adding to their own figure, and a context line
 * would put a second solid beside it.
 *
 * Pure, so the click and the blank-canvas lock (`catalog-blank-canvas-1566.test.ts`) read one answer.
 */
import type { CatalogEntry3 } from '../parser/catalog3';

export function guideTryLines3(entry: Pick<CatalogEntry3, 'he' | 'en' | 'needs'>, lang: 'he' | 'en', factCount: number): string[] {
  const example = entry[lang];
  if (factCount > 0 || !entry.needs) return [example];
  return [...entry.needs[lang], example];
}
