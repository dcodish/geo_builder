/**
 * #1604 ([ADR-579](../../../docs/06-decisions.md#adr-579)) — loading a figure saved a second ago says
 * nothing: save → load is the identity.
 *
 * Operator report (2026-09-30): «when loading a diagram i just saved a sec ago, i get
 * 'הקובץ נשמר בגרסה קודמת — 1 צעדים עודכנו'». Re-measured on the #1748 tip through `runSubmit` (LLM mocked)
 * → `serializeFigure` → `loadFigureText`: the #1601 figure loaded with `refreshed = [8, 9]` (18 saved rows,
 * 20 loaded) and the ADR-242 audit flagged the same two steps as `drift`.
 *
 * Root cause: the commit folds each command through the shared fold rule (`foldCommand`, ADR-578), which
 * drops a command duplicating an earlier fact — «AC⊥DB» and «PD חותך את AC בנקודה E» re-mention
 * `segment AC`/… — while the load refresh and the load audit compared the RAW re-parse to the saved rows.
 * Both now compare through `committedStepCommands` on both sides, and the refresh writes the folded rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import { replay, groupKey, useGeoStore, type Fact } from '@/store/geoStore';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { deserializeFigure, serializeFigure } from '@/store/figureFile';
import { loadFigureText } from '@/store/figureLoad';
import { auditLoadedFigure, committedStepCommands, refreshLoadedFigure } from '@/store/loadAudit';
import { buildParseCtx, parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

function deps(): SubmitDeps {
  return {
    t: (key) => key,
    locale: 'he',
    ui: { setInputNote: () => {}, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
}

/** The operator's figure (#1601), the one he saved and re-loaded. */
const OPERATOR = ['מעגל O', 'נקודה P מחוץ למעגל', 'PA ו PB משיקים למעגל', 'המשך BO חותך את המעגל בנקודה D', 'PO', 'AD', 'C נמצאת על DB', 'AC⊥DB', 'PD חותך את AC בנקודה E', 'EC=x'];

const shape = (facts: Fact[]) => facts.map((f) => ({ cmd: f.cmd, enabled: f.enabled, utterance: f.utterance }));

/** Save the session as the app does, clear it, load the text back through THE load path. */
async function roundTrip() {
  const saved = st().facts;
  const text = serializeFigure({ facts: saved, seed: st().seed });
  const back = deserializeFigure(text);
  const audit = auditLoadedFigure(back.ok ? back.file.facts : []);
  st().clear();
  const r = await loadFigureText(text);
  expect(r.ok, 'the save loads').toBe(true);
  return { saved, refreshed: r.ok ? r.refreshed : null, loaded: st().facts, audit };
}

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#1604 — the operator\'s figure, saved and loaded a second later', () => {
  it('loads with nothing refreshed, no drift, and exactly the saved rows', async () => {
    for (const l of OPERATOR) await runSubmit(l, deps());
    expect(st().facts.map((f) => f.utterance), 'every line committed').toEqual(expect.arrayContaining(OPERATOR));
    const { saved, refreshed, loaded, audit } = await roundTrip();
    expect(refreshed, 'no step reads as «saved by an older version»').toEqual([]);
    expect(audit.findings, 'the ADR-242 audit finds no drift').toEqual([]);
    expect(shape(loaded), 'the loaded rows are the saved rows (no duplicate written back)').toEqual(shape(saved));
  }, 120_000);
});

describe('#1604 — committedStepCommands is the commit\'s fold', () => {
  const seg: AnyCommand = { type: 'segment', a: 'A', b: 'C' };
  const prefix: Fact[] = [{ id: 'f0', enabled: true, cmd: seg }];
  const meet: AnyCommand = { type: 'midpoint', id: 'M', a: 'A', b: 'C' };

  it('drops a command that duplicates an earlier fact, keeps the rest in order', () => {
    expect(committedStepCommands(prefix, [seg, meet])).toEqual([meet]);
  });
  it('folds a command repeated inside the step once', () => {
    expect(committedStepCommands([], [seg, seg])).toEqual([seg]);
  });
});

describe('#1604 — a genuinely stale save still refreshes (#120 unchanged), and never writes a duplicate back', () => {
  it('a step whose saved rows the current parser no longer produces is re-lowered to the FOLDED reading', async () => {
    for (const l of OPERATOR) await runSubmit(l, deps());
    const facts = st().facts;
    // Simulate an older save: the «PD חותך את AC בנקודה E» step stored a DIFFERENT meet (its lines swapped
    // and the duplicate segment AC still in it — what a pre-fold version would have saved).
    const i = facts.findIndex((f) => f.utterance === 'PD חותך את AC בנקודה E');
    const key = groupKey(facts[i]);
    const prefix = facts.slice(0, i);
    const { construction, positions } = replay(prefix);
    const p = parse('PD חותך את AC בנקודה E', buildParseCtx(construction, positions));
    expect(p.ok).toBe(true);
    const rawParse = p.ok ? p.commands : [];
    const stale: AnyCommand[] = [{ type: 'segment', a: 'A', b: 'C' }, { type: 'free-point', id: 'E', x: 1, y: 1 } as AnyCommand];
    const old: Fact[] = [
      ...prefix,
      ...stale.map((cmd, j) => ({ id: `old.${j}`, utterance: 'PD חותך את AC בנקודה E', group: key, cmd, enabled: true })),
      ...facts.slice(i).filter((f) => groupKey(f) !== key),
    ];
    const { facts: out, refreshed } = refreshLoadedFigure(old);
    expect(refreshed, 'the stale step is refreshed').toEqual([new Set(prefix.map(groupKey)).size + 1]);
    const written = out.filter((f) => groupKey(f) === key).map((f) => f.cmd);
    expect(written, 'the refresh writes what a commit stores — the folded reading').toEqual(committedStepCommands(prefix, rawParse));
    expect(written.some((c) => c.type === 'segment' && c.a === 'A' && c.b === 'C'), 'segment AC is not written back as a second fact').toBe(false);
  }, 120_000);
});

/**
 * THE CLASS LOCK — save → load is the identity over every saved fixture.
 *
 * Each fixture's steps are committed through the store's REAL commit (`executeMany`, the fold the save
 * sees), each deterministic utterance re-parsed against the live figure exactly as a typed line is; a step
 * the parser cannot read is an LLM step and commits its stored commands. Then save → load: nothing may be
 * refreshed, the audit must be silent, and the loaded rows must be the committed rows.
 */
describe('#1604 — save → load round-trip over the fixtures', () => {
  const files = import.meta.glob('../../__tests__/fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
  let exercised = 0;

  for (const [file, text] of Object.entries(files)) {
    const name = file.replace(/^.*\//, '');
    it(name, async () => {
      const r = deserializeFigure(text);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const steps: { utterance?: string; cmds: AnyCommand[] }[] = [];
      for (const [k, f] of r.file.facts.entries()) {
        if (k > 0 && groupKey(f) === groupKey(r.file.facts[k - 1])) steps[steps.length - 1].cmds.push(f.cmd);
        else steps.push({ utterance: f.utterance, cmds: [f.cmd] });
      }
      for (const s of steps) {
        let cmds = s.cmds;
        if (s.utterance) {
          const { construction, positions } = replay(st().facts);
          const p = parse(s.utterance, buildParseCtx(construction, positions));
          if (p.ok) cmds = p.commands;
        }
        st().executeMany(cmds, s.utterance);
      }
      const { saved, refreshed, loaded, audit } = await roundTrip();
      expect(refreshed, `${name}: nothing refreshed`).toEqual([]);
      expect(audit.findings, `${name}: no drift findings`).toEqual([]);
      expect(shape(loaded), `${name}: the loaded rows are the saved rows`).toEqual(shape(saved));
      exercised++;
    }, 120_000);
  }

  it('the property exercised every fixture (an empty glob would pass by checking nothing)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(10);
    expect(exercised).toBe(Object.keys(files).length);
  });
});
