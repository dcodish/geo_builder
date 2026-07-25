/**
 * Issue #319 — line↔plane angle: bare-pair phrasings, α naming, and the query kinds.
 * Operator (exam part ד.1): «זוית בין SB ומישור ABC היא α» — the old rule required הישר + לבין +
 * a numeric value. The α form NAMES the measure (never a driver); the panel derives `α = X°` when
 * seed-stable; the valueless form is a QUERY. Panel and query share linePlaneAngleAt/newellNormal.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { answerQuery } from '../engine/queries';
import { dataView, linePlaneAngleAt } from '../engine/dataView';

function build(utts: string[]): Fact3[] {
  return utts.map((u, i) => {
    const r = parse3(u);
    expect(r.ok, `parse: ${u}`).toBe(true);
    return { id: `f${i}`, utterance: u, cmds: r.ok ? r.commands : [], enabled: true };
  });
}

const EXAM = [
  'פירמידה משולשת ABCS',
  'SD=(2/3)SB',
  'F אמצע SC',
  'BC=v',
  'SB=u',
  'FE=u/6-v/6',
  'DE',
  'DE=(0,2,0)',
  'BA=(6,0,6)',
  'B(3,9,-9)',
  'D=(8,10,-12)',
];

describe('#319 — parse matrix', () => {
  const forms: [string, 'label' | 'deg'][] = [
    ['זוית בין SB ומישור ABC היא α', 'label'],
    ['הזווית בין הישר SB לבין המישור ABC היא 30', 'deg'],
    ['זווית בין המקצוע SB למישור ABC = β', 'label'],
    ['הזוית בין הקטע SB ובין מישור ABC שווה ל-45', 'deg'],
    ['the angle between SB and plane ABC is α', 'label'],
    ['the angle between edge SB and the plane ABC = 30', 'deg'],
  ];
  for (const [form, kind] of forms) {
    it(`${form} → ${kind}`, () => {
      const r = parse3(form);
      expect(r.ok, form).toBe(true);
      if (!r.ok) return;
      const cmd = r.commands[0] as { type: string; label?: string; deg?: number };
      expect(cmd.type).toBe('line-plane-angle');
      if (kind === 'label') expect(cmd.label).toMatch(/^[αβ]$/);
      else expect(cmd.deg).toBeGreaterThan(0);
    });
  }
});

describe('#319 — the exam flow: name the angle α, read it from the panel, query it', () => {
  const facts = build([...EXAM, 'זוית בין SB ומישור ABC היא α']);
  const d = derive3(facts, 0);

  it('the labeled statement builds (a mark, not a driver — nothing moves)', () => {
    for (const [id, st] of Object.entries(d.status)) expect(st, id).toBe('ok');
  });

  it('the panel prints α = the closed-form angle', () => {
    const pos = resolve3(d.construction, 0).positions;
    const expected = linePlaneAngleAt(pos, 'S', 'B', ['A', 'B', 'C'])!;
    const rel = dataView(d.construction, 0).relations.find((r) => r.startsWith('α ='));
    expect(rel).toBeDefined();
    expect(Number(rel!.match(/= ([\d.]+)°/)![1])).toBeCloseTo(expected, 2);
    expect(expected).toBeGreaterThan(1); // sanity: a real angle, not a degenerate 0
  });

  it('the QUERY lane answers the valueless question (both locales) with the same value', () => {
    const pos = resolve3(d.construction, 0).positions;
    const expected = linePlaneAngleAt(pos, 'S', 'B', ['A', 'B', 'C'])!;
    for (const q of ['הזווית בין SB למישור ABC', 'angle between SB and plane ABC']) {
      const r = answerQuery(d.construction, q, 0);
      expect(r.answer, q).toBeTruthy();
      expect(Number(r.answer!.match(/([\d.]+)/)![1])).toBeCloseTo(expected, 1);
    }
  });

  it('plane↔plane: the dihedral between base ABC and face SBC answers stably', () => {
    const r = answerQuery(d.construction, 'הזווית בין מישור ABC למישור SBC', 0);
    expect(r.answer).toBeTruthy();
  });

  it('under-determined (no D given): the angle varies, so α stays unprinted and the query refuses', () => {
    const free = derive3(build([...EXAM.slice(0, 7), 'זוית בין SB ומישור ABC היא α']), 0);
    expect(dataView(free.construction, 0).relations.some((r) => r.startsWith('α ='))).toBe(false);
    const q = answerQuery(free.construction, 'הזווית בין SB למישור ABC', 0);
    expect(q.answer).toBeNull();
  });
});
