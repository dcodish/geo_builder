/**
 * Load-time OUTCOME audit for a deserialized `.geo3.json` (ADR-3D-087, issue #309).
 *
 * `deserializeFigure3` validates the file's SCHEMA — version, shape, and that every command type is
 * whitelisted (ADR-3D-086). Passing that gate says the file is well-formed; it says nothing about
 * whether this build can still *rebuild* the figure. A file saved by a newer build, or one holding a
 * construct whose semantics have since changed, deserializes cleanly and then fails at `apply` —
 * leaving the student with a blank canvas and a load that reported success (`loadFigure` even clears
 * `lastError`). The failure is already known: `derive3` records it per fact in `status`. Nothing looked.
 *
 * This module looks. It is READ-ONLY and derives nothing the store does not already derive — load
 * still opens the file exactly as saved (ADR-3D-005 / ADR-232: a load is never destructive, so a file
 * we cannot rebuild is still the student's file and is never refused). The caller decides what to say.
 *
 * The 2-D sibling `loadAudit.ts` (ADR-242) audits a different axis of the same honesty problem — its
 * `dropped`/`drift` findings compare the stored lowering against the CURRENT parser. That check
 * presumes the figure builds at all; this one asks whether it does. Patterns are copied between the
 * products, never imported (docs/20 §12).
 */
import type { Fact3 } from './store3';
import { derive3 } from './store3';

export interface LoadFailure3 {
  /** 1-based row number as the student sees it in the fact list. */
  step: number;
  utterance?: string;
  /** The engine's own failure code for the row (`bad-solid`, `unknown-point`, …). */
  code: string;
}

export interface LoadAudit3Result {
  /** Rows that did not build. Empty = the figure rebuilt completely. */
  failed: LoadFailure3[];
  /** Enabled rows examined. */
  total: number;
  /** Every enabled row failed — this build cannot rebuild the file at all (the blank-canvas case). */
  unbuildable: boolean;
}

/** A fact's status entry is either absent (ok) or an object carrying a `code`. */
function failureCode(status: unknown): string | null {
  if (!status || typeof status !== 'object') return null;
  const code = (status as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * Replay the loaded facts and report which rows failed to build.
 *
 * Only ENABLED rows count: a deliberately disabled row is not part of the figure, so its failure is
 * not something the load should warn about. `unbuildable` is reserved for the case the issue was filed
 * for — nothing drew at all — so the caller can distinguish "some steps are broken" from "this file
 * does not open in this version".
 */
export function auditLoad3(facts: Fact3[], seed: number): LoadAudit3Result {
  const enabled = facts.filter((f) => f.enabled);
  if (enabled.length === 0) return { failed: [], total: 0, unbuildable: false };

  const derived = derive3(facts, seed);
  const failed: LoadFailure3[] = [];
  enabled.forEach((f, i) => {
    const code = failureCode(derived.status[f.id]);
    if (code) failed.push({ step: i + 1, utterance: f.utterance, code });
  });

  return { failed, total: enabled.length, unbuildable: failed.length === enabled.length };
}
