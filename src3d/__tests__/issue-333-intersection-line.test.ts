/**
 * Issue #333 (ADR-3D-153): `ישר החיתוך` — the plane∩plane line — is ONE robust rule.
 *
 * The construct was fully built end-to-end; what failed was the grammar around it. TWO sibling rules
 * carried one relation, each with its own hand-rolled connective grammar: the named-π rule accepted
 * `בין המישורים π1 ו-π2`, the point-run rule accepted only `בין המישור X ו/ל בין המישור Y`. So which
 * natural phrasing worked was an accident of which rule you happened to hit, and four independent
 * narrownesses fell out of it — measured live, from the operator's report and two prod sessions:
 * the `ומישור`/`למישור`/`עם`/`של` connectives, the plural `המישורים` over point-runs, an uppercase
 * `L2` name, and no line name at all (what one prod user typed twice).
 *
 * Part B, operator ruling 2026-07-25: a bare `ℓ` that collides auto-indexes to the next free `ℓN`
 * WITH a notice, instead of a `already-defined` the student cannot act on. An identical restatement
 * stays an idempotent M1 no-op.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import type { Command3 } from '../engine/types';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const parse = (u: string) => parse3(u);
const cmds = (u: string): Command3[] => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
const lineCmd = (u: string) => cmds(u).find((c) => c.type === 'plane-plane-line') as
  | Extract<Command3, { type: 'plane-plane-line' }>
  | undefined;

describe('#333 Part A — the full phrasing battery parses (was: four independent narrownesses)', () => {
  // every row was measured `not-handled` on the reporting revision unless marked "worked"
  const NAMED_PLANES = [
    'ℓ ישר החיתוך בין המישורים π1 ו-π2', // worked (named-π rule)
    'ℓ ישר החיתוך של המישורים π1 ו-π2',
    'ℓ ישר החיתוך בין המישור π1 למישור π2',
    'ℓ is the intersection line of π1 and π2', // worked
  ];
  const POINT_RUNS = [
    "ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'", // worked (point-run rule)
    'ℓ ישר החיתוך של המישורים ABC ו-DEF',
    'ℓ ישר החיתוך של מישור ABC ומישור SBC',
    'ℓ ישר החיתוך בין המישור ABC למישור SBC',
    'ℓ ישר החיתוך בין המישורים ABC ו-SBC',
    'ℓ קו החיתוך בין המישור ABC למישור SBC',
    'ℓ ישר החיתוך של המישור ABC עם המישור SBC',
    'ℓ ישר החיתוך של פאה ABCD ופאה BCC1B1',
    'ℓ is the intersection line of plane ABC and plane SBC', // worked
    'ℓ is the line of intersection of planes ABC and DEF',
  ];
  // the three forms from the prod sessions (log-triage 2026-07-28) — one user hunting for the syntax
  const PROD = [
    "ℓ ישר החיתוך בין המישור A'BD ומישור AA'BB'", // the `ומישור` connector
    "ℓ ישר החיתוך בין המישורים A'BD ו-AA'BB'", // plural over point-runs
    "L2 ישר החיתוך בין המישור A'BD ובין המישור AA'BB'", // uppercase line name
    "ישר החיתוך בין מישור A'BD ומישור AA'BB'", // NO line name — typed twice
  ];

  for (const u of [...NAMED_PLANES, ...POINT_RUNS, ...PROD]) {
    it(`parses: "${u}"`, () => {
      const r = parse(u);
      expect(r.ok, `"${u}" must parse`).toBe(true);
      expect(lineCmd(u), 'emits the plane∩plane line').toBeDefined();
    });
  }

  it('a π-named operand needs no plane-through; a point-run DECLARES its plane', () => {
    expect(cmds('ℓ ישר החיתוך בין המישורים π1 ו-π2').filter((c) => c.type === 'plane-through')).toHaveLength(0);
    expect(cmds('ℓ ישר החיתוך של המישורים ABC ו-DEF').filter((c) => c.type === 'plane-through')).toHaveLength(2);
  });

  it('every connective reaches the SAME commands — the phrasing carries no meaning', () => {
    const canonical = cmds('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    for (const u of [
      'ℓ ישר החיתוך של המישור ABC עם המישור SBC',
      'ℓ ישר החיתוך בין המישור ABC למישור SBC',
      'ℓ ישר החיתוך של מישור ABC ומישור SBC',
      'ℓ קו החיתוך בין המישורים ABC ו-SBC',
      'ℓ is the intersection line of plane ABC and plane SBC',
    ]) {
      expect(cmds(u), u).toEqual(canonical);
    }
  });

  it('uppercase L2 canonicalises exactly like its lowercase twin (ruling 2026-08-13)', () => {
    expect(lineCmd('L2 ישר החיתוך בין המישורים π1 ו-π2')?.name).toBe('ℓ2');
    expect(lineCmd('l2 ישר החיתוך בין המישורים π1 ו-π2')?.name).toBe('ℓ2');
  });

  it('a nameless statement carries NO name — apply assigns it', () => {
    expect(lineCmd('ישר החיתוך בין המישורים π1 ו-π2')?.name).toBeUndefined();
  });

  it('the uppercase-letter ruling is scoped to THIS rule — it does not leak', () => {
    // `L` stays a point label everywhere else; the sentence here is what declares it a line
    expect(parse('L על AB').ok).toBe(true);
    const onSeg = cmds('L על AB');
    expect(onSeg.some((c) => c.type === 'point-on-segment3' && c.id === 'L')).toBe(true);
  });

  it('a plane cannot cut ITSELF — that says nothing, so it escalates', () => {
    expect(parse('ℓ ישר החיתוך בין המישור ABC ובין המישור ABC').ok).toBe(false);
  });
});

describe('#333 Part B — naming: auto-index a collision, never a bare already-defined', () => {
  beforeEach(reset);

  it("the operator's exact report: two `ℓ` intersection lines coexist", () => {
    submit('פירמידה SABC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    expect(state().lastError, 'the first line takes ℓ').toBe(null);
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SAB');
    expect(state().lastError, 'the second must NOT refuse already-defined').toBe(null);

    const d = derive3(state().facts, 0);
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const names = [...d.construction.lines.keys()].sort();
    expect(names, 'two distinct lines exist').toEqual(['ℓ', 'ℓ1']);
  });

  it('the auto-naming is SURFACED as a notice naming both names', () => {
    submit('פירמידה SABC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SAB');
    const notices = derive3(state().facts, 0).notices;
    const n = notices.find((x) => x.kind === 'line-auto-named');
    expect(n, 'the student must be told which name it got').toBeDefined();
    if (n?.kind === 'line-auto-named') {
      expect(n.requested).toBe('ℓ');
      expect(n.assigned).toBe('ℓ1');
    }
  });

  it('an IDENTICAL restatement is an idempotent no-op — one line, said twice', () => {
    submit('פירמידה SABC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    expect(state().lastError).toBe(null);
    const d = derive3(state().facts, 0);
    expect([...d.construction.lines.keys()]).toEqual(['ℓ']);
    expect(d.notices.some((n) => n.kind === 'line-auto-named'), 'nothing was renamed').toBe(false);
  });

  it('the same holds with the operands written in the other ORDER (a line has no direction of statement)', () => {
    submit('פירמידה SABC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    submit('ℓ ישר החיתוך בין המישור SBC ובין המישור ABC');
    expect(state().lastError).toBe(null);
    expect([...derive3(state().facts, 0).construction.lines.keys()]).toEqual(['ℓ']);
  });

  it('a NAMELESS statement is auto-named and builds (what the prod user typed twice)', () => {
    submit('פירמידה SABC');
    submit('ישר החיתוך בין מישור ABC ומישור SBC');
    expect(state().lastError).toBe(null);
    const d = derive3(state().facts, 0);
    expect([...d.construction.lines.keys()]).toEqual(['ℓ']);
    // nothing was RENAMED — no name was asked for, so there is nothing to report
    expect(d.notices.some((n) => n.kind === 'line-auto-named')).toBe(false);
  });

  it('explicit ℓ1 / ℓ2 naming still works exactly as before (ADR-3D-038)', () => {
    submit('פירמידה SABC');
    submit('ℓ1 ישר החיתוך בין המישור ABC ובין המישור SBC');
    submit('ℓ2 ישר החיתוך בין המישור ABC ובין המישור SAB');
    expect(state().lastError).toBe(null);
    expect([...derive3(state().facts, 0).construction.lines.keys()].sort()).toEqual(['ℓ1', 'ℓ2']);
  });
});

describe('#333 — the line is real geometry, not just a parse', () => {
  beforeEach(reset);

  it('the catalog skeleton still builds and draws the line (the pre-existing behaviour)', () => {
    submit('פירמידה SABC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
    const d = derive3(state().facts, 0);
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const def = d.construction.lines.get('ℓ');
    expect(def?.kind).toBe('plane-plane');
  });

  it('an unknown π operand still refuses honestly', () => {
    submit('פירמידה SABC');
    submit('ℓ ישר החיתוך בין המישורים π1 ו-π2');
    expect(state().lastError, 'π1/π2 were never declared').not.toBe(null);
  });
});
