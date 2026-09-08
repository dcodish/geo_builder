/**
 * WHICH SENTENCE was refused (#943).
 *
 * CLAUDE.md's honesty invariant: *"Error messages name the conflicting **statement**, never internal
 * state."* A refusal assembled from an engine string alone cannot do that — `humanizeError` is a pure
 * UI string-pattern consumer with no figure (ADR-228 Am.6), so the student's own sentence has to be
 * supplied to it from the layer that HAS the fact list.
 *
 * That link already exists and needs no new plumbing: `ReplayResult.status` is `factId → FactStatus`,
 * and [ADR-398](../../docs/06-decisions.md#adr-398) makes the banner's `lastError` and the failing
 * row's status the SAME string on purpose ("`lastError` (the banner) and the per-row status below can
 * never disagree about whose fault the failed sample was", `replay/core.ts`). So the fact that owns a
 * banner error is the first enabled fact whose status is that very string.
 *
 * Pure over `(facts, status, raw)` — no store, no React, no engine — so it is unit-testable and the
 * component stays free of the lookup (CLAUDE.md: submit/display orchestration lives in `src/app/`,
 * never inline in the component).
 */
import type { Fact, FactStatus } from '@/replay/core';

/**
 * The utterance of the fact that owns `raw`, or `undefined` when there is none to quote.
 *
 * `undefined` is a first-class answer and the caller must render today's message unchanged: a fact
 * built from a direct command or loaded from a `.geo.json` saved before the utterance was recorded
 * carries no `utterance` at all (it is optional on `Fact`), and a refusal must never render an empty
 * «» or the word `undefined`.
 */
export function utteranceForError(
  facts: readonly Fact[],
  status: Record<string, FactStatus>,
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const owner = facts.find((f) => f.enabled && status[f.id] === raw);
  const said = owner?.utterance?.trim();
  return said ? said : undefined;
}
