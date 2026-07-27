/**
 * Issue #309 (ADR-3D-087): a `.geo3.json` this build cannot REBUILD used to load "successfully" onto
 * a blank canvas.
 *
 * `deserializeFigure3` validates the SCHEMA (version, shape, whitelisted command types — ADR-3D-086);
 * `loadFigure` then commits the facts and CLEARS `lastError`. Nothing asked whether the figure
 * actually built, even though `derive3` had already recorded the per-fact failure in `status`. A file
 * saved by a newer build (or holding a construct whose semantics changed) therefore reported success
 * with zero points drawn — the honesty failure the issue was filed for.
 *
 * `auditLoad3` is the read-only check that closes it. The load itself is unchanged: the file still
 * opens exactly as saved (ADR-3D-005 — a load is never destructive, so a file we cannot rebuild is
 * still the student's file and is never refused). It just stops claiming the figure is fine.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { deserializeFigure3, serializeFigure3 } from '../figureFile3';
import { auditLoad3 } from '../loadAudit3';
import { derive3, useGeo3 } from '../store3';
import type { Command3 } from '../../engine/types';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

/** A command a NEWER build could emit: the `solid` type is whitelisted, this `kind` is unknown here. */
const FUTURE_CMD = [{ type: 'solid', kind: 'dodecahedron', ids: ['A', 'B', 'C', 'D'] }] as unknown as Command3[];
const fileWith = (cmds: Command3[], utterance: string) =>
  serializeFigure3([{ id: 'x', utterance, cmds, enabled: true }], 0);

describe('#309 — a load reports the OUTCOME, not just the schema', () => {
  beforeEach(reset);

  it('a file that deserializes but does not rebuild is reported unbuildable (was: silent empty canvas)', () => {
    const r = deserializeFigure3(fileWith(FUTURE_CMD, 'דודקהדרון ABCD'));
    expect(r.ok).toBe(true); // the schema IS fine — that was never the problem
    if (!r.ok) return;

    // the pre-fix state: load succeeds, error cleared, nothing on the canvas
    useGeo3.getState().loadFigure(r.facts, r.seed);
    expect(useGeo3.getState().lastError).toBeNull();
    expect(derive3(r.facts, r.seed).positions.size).toBe(0);

    // …and the audit is what now makes that visible
    const audit = auditLoad3(r.facts, r.seed);
    expect(audit.unbuildable).toBe(true);
    expect(audit.total).toBe(1);
    expect(audit.failed).toHaveLength(1);
    expect(audit.failed[0].step).toBe(1);
    expect(audit.failed[0].code).toBe('bad-solid');
  });

  it('a healthy file audits clean — no false alarm on the normal path', () => {
    ["קובייה ABCDA'B'C'D'", 'AB=u'].forEach((u) => useGeo3.getState().submit(u));
    const { facts, seed } = useGeo3.getState();
    const r = deserializeFigure3(serializeFigure3(facts, seed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const audit = auditLoad3(r.facts, r.seed);
    expect(audit.failed).toEqual([]);
    expect(audit.unbuildable).toBe(false);
    expect(audit.total).toBe(facts.filter((f) => f.enabled).length);
  });

  it('a PARTIALLY broken file names the failing rows and is not called unbuildable', () => {
    useGeo3.getState().submit("קובייה ABCDA'B'C'D'");
    const good = useGeo3.getState().facts[0];
    const json = serializeFigure3(
      [good, { id: 'y', utterance: 'דודקהדרון EFGH', cmds: FUTURE_CMD, enabled: true }],
      0,
    );
    const r = deserializeFigure3(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const audit = auditLoad3(r.facts, r.seed);
    expect(audit.unbuildable).toBe(false); // something DID build
    expect(audit.failed.map((f) => f.step)).toEqual([2]); // 1-based, as the student sees the row
    expect(derive3(r.facts, r.seed).positions.size).toBeGreaterThan(0);
  });

  it('a DISABLED broken row is not warned about (it is not part of the figure)', () => {
    useGeo3.getState().submit("קובייה ABCDA'B'C'D'");
    const good = useGeo3.getState().facts[0];
    const json = serializeFigure3(
      [good, { id: 'y', utterance: 'דודקהדרון EFGH', cmds: FUTURE_CMD, enabled: false }],
      0,
    );
    const r = deserializeFigure3(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const audit = auditLoad3(r.facts, r.seed);
    expect(audit.failed).toEqual([]);
    expect(audit.total).toBe(1);
  });

  it('an empty file audits clean rather than dividing by zero', () => {
    const audit = auditLoad3([], 0);
    expect(audit).toEqual({ failed: [], total: 0, unbuildable: false });
  });
});
