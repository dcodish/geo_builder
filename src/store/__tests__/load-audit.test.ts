/**
 * Load-time honesty audit (ADR-242) — the in-app twin of the fixtures net's drift check, plus the
 * `dropped` differential the fixtures net lacked.
 *
 * The `dropped` case is the operator's real exported file (2026-07-06): the step "A ו C נמצאות על
 * המעגל" was saved with only `point-on-circle A` (the pre-ADR-240 single-subject parse escaped
 * through the LLM round-trip), so on EVERY machine the file replayed with C off the circle while the
 * row read ✓. Crucially, drift alone cannot catch a file saved under the same broken parser — the
 * re-parse returns the identical partial commands — which is why the label differential is a separate
 * probe.
 */
import { describe, expect, it } from 'vitest';
import { deserializeFigure } from '@/store/figureFile';
import { auditLoadedFigure, liveAuditFindings } from '@/store/loadAudit';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const fact = (id: string, utterance: string, cmd: AnyCommand, group?: string): Fact =>
  ({ id, utterance, ...(group ? { group } : {}), cmd, enabled: true }) as Fact;

/** The operator's exported file, verbatim structure (ids shortened): the partial on-circle lowering. */
const OPERATOR_FILE = JSON.stringify({
  app: 'geo-builder',
  schemaVersion: 1,
  locale: 'he',
  seed: 1,
  radiusOverrides: {},
  facts: [
    { id: 'f1', utterance: 'מעגל O', cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true }, enabled: true },
    { id: 'f2', utterance: 'A ו C נמצאות על המעגל', cmd: { type: 'point-on-circle', id: 'A', circle: 'circle-O' }, enabled: true },
    { id: 'f3', utterance: 'OC', cmd: { type: 'segment', a: 'O', b: 'C' }, enabled: true },
    { id: 'f4', utterance: 'OA', cmd: { type: 'segment', a: 'O', b: 'A' }, enabled: true },
    { id: 'f5', utterance: 'AC', cmd: { type: 'segment', a: 'A', b: 'C' }, enabled: true },
  ],
});

describe('load-time figure-file audit (ADR-242)', () => {
  it("flags the operator's partial-lowering file: C was stated on the circle but never covered", () => {
    const r = deserializeFigure(OPERATOR_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { findings, complete } = auditLoadedFigure(r.file.facts);
    expect(complete).toBe(true);
    expect(findings).toMatchObject([{ step: 2, utterance: 'A ו C נמצאות על המעגל', kind: 'dropped', labels: ['C'] }]);
    expect(findings[0].group).toBeTypeOf('string'); // carries a stable row handle (issue #24)
    expect(findings[0].cmds.length).toBeGreaterThan(0);
  });

  it('flags a stale lowering as drift: the pre-ADR-241 "AC קוטר" set-collinear snapshot', () => {
    // Saved by a version whose diameter rule lowered existing-endpoints to the bare collinearity —
    // today the same utterance carries the memberships too, so the stored commands differ.
    const facts: Fact[] = [
      fact('f1', 'מעגל O', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand),
      fact('f2', 'BD⊥AC', { type: 'segment', a: 'B', b: 'D' } as AnyCommand, 'g1'),
      fact('f3', 'BD⊥AC', { type: 'segment', a: 'A', b: 'C' } as AnyCommand, 'g1'),
      fact('f4', 'BD⊥AC', { type: 'set-perpendicular', a: 'B', b: 'D', c: 'A', d: 'C' } as AnyCommand, 'g1'),
      fact('f5', 'AC קוטר', { type: 'set-collinear', a: 'A', b: 'O', c: 'C' } as AnyCommand),
    ];
    const { findings } = auditLoadedFigure(facts);
    expect(findings.map((f) => ({ step: f.step, kind: f.kind }))).toEqual([{ step: 3, kind: 'drift' }]);
  });

  it('a file saved under the current parser is clean', () => {
    const facts: Fact[] = [
      fact('f1', 'מעגל O', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand),
      fact('f2', 'A ו C נמצאות על המעגל', { type: 'point-on-circle', id: 'A', circle: 'circle-O' } as AnyCommand, 'g1'),
      fact('f3', 'A ו C נמצאות על המעגל', { type: 'point-on-circle', id: 'C', circle: 'circle-O' } as AnyCommand, 'g1'),
      fact('f4', 'AC', { type: 'segment', a: 'A', b: 'C' } as AnyCommand),
    ];
    const { findings, complete } = auditLoadedFigure(facts);
    expect(complete).toBe(true);
    expect(findings).toEqual([]);
  });
});

describe('liveAuditFindings — the note self-clears when its rows are fixed (issue #24)', () => {
  const loaded = (): Fact[] => {
    const r = deserializeFigure(OPERATOR_FILE);
    if (!r.ok) throw new Error('deserialize failed');
    return r.file.facts;
  };

  it('keeps the finding while the flagged row is unchanged and enabled', () => {
    const facts = loaded();
    const { findings } = auditLoadedFigure(facts);
    expect(findings.length).toBe(1);
    expect(liveAuditFindings(facts, findings)).toHaveLength(1);
  });

  it('drops the finding when the flagged row is DELETED (group gone)', () => {
    const facts = loaded();
    const { findings } = auditLoadedFigure(facts);
    const flagged = findings[0].group;
    const without = facts.filter((f) => (f.group ?? f.id) !== flagged);
    expect(liveAuditFindings(without, findings)).toHaveLength(0);
  });

  it('drops the finding when the flagged row is TOGGLED OFF', () => {
    const facts = loaded();
    const { findings } = auditLoadedFigure(facts);
    const flagged = findings[0].group;
    const off = facts.map((f) => ((f.group ?? f.id) === flagged ? { ...f, enabled: false } : f));
    expect(liveAuditFindings(off, findings)).toHaveLength(0);
  });

  it('drops the finding when the flagged row is ✎ RE-LOWERED (commands change)', () => {
    const facts = loaded();
    const { findings } = auditLoadedFigure(facts);
    const flagged = findings[0].group;
    // Simulate replaceGroup covering C too — the re-read the note asked for.
    const relowered = facts.map((f) =>
      (f.group ?? f.id) === flagged
        ? { ...f, cmd: { type: 'point-on-circle', id: 'C', circle: 'circle-O' } as AnyCommand }
        : f,
    );
    expect(liveAuditFindings(relowered, findings)).toHaveLength(0);
  });

  it('empty findings stay empty (a clean load shows no note)', () => {
    expect(liveAuditFindings(loaded(), [])).toHaveLength(0);
  });
});
