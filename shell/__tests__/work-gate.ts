/**
 * THE WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0) — the part every
 * builder's gate shares: the baseline file, the comparison, the message a fix session reads, and the re-record.
 *
 * A builder's `work-meter-gate.test.ts` walks its fixtures through its own action driver and hands each figure's
 * counts to {@link WorkGate.check}. Nothing here knows a builder: a figure and an action are names, a count is a
 * number, and the caller says what one unit is.
 *
 * THE BASELINE is `work-meter/baseline.jsonl` in the builder's tests: one line per figure-action, sorted by key, so two
 * branches that each add a fixture merge as two insertions (`reports/test-tiers.json` is the precedent).
 *
 * THE RULE. An action whose `total`, `page` or `prePaint` count is ABOVE its baseline fails. So does an action with no
 * baseline line, a baseline line whose action no longer exists, and a builder whose summed `page` count is above its
 * baseline's. The tolerance is ZERO: the counts are exactly reproducible (the lock at the end of each gate re-walks
 * figures in a different order and compares), so any difference is a real change in what the code does. A count BELOW
 * its baseline is reported, never failed, and is locked by re-recording.
 *
 * RE-RECORDING is the same walk with `WORK_METER=record` (`npm run work:record -- <builder>`). It adds new figures,
 * drops deleted ones and lowers fallen counts. It writes a RISE only with `WORK_METER_ACCEPT_RISE=1` (`--accept-rise`),
 * and then prints the before and after that the change's ADR must carry (docs/17 §7).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface WorkCounts {
  total: number;
  page: number;
  prePaint: number;
}

export interface WorkLine extends WorkCounts {
  /** `<figure>|<action>` */
  k: string;
}

export interface MeasuredAction {
  /** The action's name inside its figure: `load`, `submit#3`, `another#1`, `edit`, `delete`, `detect`. */
  action: string;
  work: WorkCounts;
  /** Wall time, for the run report only. Never compared and never committed. */
  ms?: number;
  /** What the student did, in words (the typed line), for the failure message. */
  label?: string;
}

export interface GateConfig {
  /** `2d` | `3d` | `analytic` | `complex` — the name the re-record command takes. */
  product: string;
  /** The builder's display name in a message. */
  title: string;
  /** What one unit of work is, and where it is counted. */
  unit: string;
  /** The builder's `work-meter` folder (holds `baseline.jsonl` and `baseline-slow.jsonl`). */
  dir: string;
  /** Which corpus is walked: the fixtures (the suite's gate), or the slow corpus (on demand). */
  corpus?: 'fixtures' | 'slow';
  /** How the timing harness is asked for one figure, given the figure's name. */
  perfCommand: (figure: string) => string;
}

const FIELDS = ['total', 'page', 'prePaint'] as const;
const HEADER =
  'THE WORK-METER BASELINE (#2873, ADR-W-210). One line per figure-action, sorted by key: solver work in units, never seconds (total = all of it, page = on the UI thread, prePaint = before the figure can paint). Never edited by hand: `npm run work:record -- <builder>` rewrites it, and docs/08 says when.';

const keyOf = (figure: string, action: string): string => `${figure}|${action}`;
const figureOf = (k: string): string => k.slice(0, k.lastIndexOf('|'));
const actionOf = (k: string): string => k.slice(k.lastIndexOf('|') + 1);
const byKey = (a: WorkLine, b: WorkLine): number => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
const n = (x: number): string => x.toLocaleString('en-US');

/** Parse a baseline file's text. A repeated key is a merge that kept both sides, and is an error. */
export function parseBaseline(text: string): Map<string, WorkLine> {
  const out = new Map<string, WorkLine>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const o = JSON.parse(line) as Partial<WorkLine> & { _?: string };
    if (o._ !== undefined) continue;
    if (typeof o.k !== 'string' || FIELDS.some((f) => typeof o[f] !== 'number')) throw new Error(`work-meter baseline: not a count line: ${line}`);
    if (out.has(o.k)) throw new Error(`work-meter baseline: «${o.k}» is recorded twice (a merge kept both sides). Re-record the baseline.`);
    out.set(o.k, { k: o.k, total: o.total!, page: o.page!, prePaint: o.prePaint! });
  }
  return out;
}

/** The baseline file's text for a set of lines: the header, then one line per key, sorted. */
export function formatBaseline(lines: Iterable<WorkLine>): string {
  const sorted = [...lines].sort(byKey);
  return [JSON.stringify({ _: HEADER }), ...sorted.map((l) => JSON.stringify({ k: l.k, total: l.total, page: l.page, prePaint: l.prePaint }))].join('\n') + '\n';
}

export interface Change {
  k: string;
  before: WorkCounts;
  after: WorkCounts;
  label?: string;
}

const rose = (c: Change): boolean => FIELDS.some((f) => c.after[f] > c.before[f]);
const fell = (c: Change): boolean => !rose(c) && FIELDS.some((f) => c.after[f] < c.before[f]);

function changeText(c: Change): string {
  const rows = FIELDS.filter((f) => c.after[f] !== c.before[f]).map((f) => {
    const d = c.after[f] - c.before[f];
    const pct = c.before[f] > 0 ? ` (${d > 0 ? '+' : ''}${((100 * d) / c.before[f]).toFixed(1)}%)` : '';
    return `      ${f.padEnd(9)} ${n(c.before[f])} → ${n(c.after[f])}${pct}`;
  });
  return [`  figure  ${figureOf(c.k)}`, `  action  ${actionOf(c.k)}${c.label ? `   «${c.label}»` : ''}`, ...rows].join('\n');
}

/** How many changed actions a message spells out. The rest are counted, and all of them are in the run report. */
const SHOWN = 8;
const sizeOf = (c: Change): number => Math.max(...FIELDS.map((f) => Math.abs(c.after[f] - c.before[f])));
function changesText(changes: readonly Change[], reportFile: string): string {
  const largest = [...changes].sort((a, b) => sizeOf(b) - sizeOf(a) || (a.k < b.k ? -1 : 1));
  const more = largest.length - SHOWN;
  return largest.slice(0, SHOWN).map(changeText).join('\n\n') + (more > 0 ? `\n\n  … and ${more} more, smaller ones. All of them: ${reportFile}` : '');
}

export interface WorkGate {
  /** True when this run re-records the baseline instead of checking against it. */
  readonly recording: boolean;
  /** Only figures whose name contains one of these are walked (`WORK_METER_ONLY`); null = all. */
  readonly only: string[] | null;
  /** Is this figure part of the run? */
  wants(figure: string): boolean;
  /** One figure's measured actions. Throws, with the whole message, when one fails the rule. */
  check(figure: string, actions: readonly MeasuredAction[]): void;
  /** The counts `check` was handed for a figure (the determinism lock compares a second walk against them). */
  measured(figure: string): readonly MeasuredAction[] | undefined;
  /** The figures walked so far, costliest first. */
  walkedByCost(): string[];
  /** After every figure: the corpus-wide rules, the run report, and in record mode the new baseline. */
  finish(corpus: readonly string[]): void;
}

export function openWorkGate(cfg: GateConfig, env: Record<string, string | undefined> = process.env): WorkGate {
  const recording = env.WORK_METER === 'record';
  const acceptRise = env.WORK_METER_ACCEPT_RISE === '1';
  const only = env.WORK_METER_ONLY ? env.WORK_METER_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const slow = cfg.corpus === 'slow';
  const file = join(cfg.dir, slow ? 'baseline-slow.jsonl' : 'baseline.jsonl');
  const baseline = existsSync(file) ? parseBaseline(readFileSync(file, 'utf8')) : new Map<string, WorkLine>();
  const baselineFigures = new Map<string, WorkLine[]>();
  for (const l of baseline.values()) baselineFigures.set(figureOf(l.k), [...(baselineFigures.get(figureOf(l.k)) ?? []), l]);
  const run = new Map<string, readonly MeasuredAction[]>();
  const reportFile = resolve(env.WORK_METER_REPORT ?? join('reports', 'work-meter', `${cfg.product}${slow ? '-slow' : ''}.json`));
  const record = `npm run work:record -- ${cfg.product}${slow ? ' --slow' : ''}`;

  const footer = (figure: string | null): string =>
    [
      '',
      `One unit = ${cfg.unit}. Counts are exact: the same code gives the same count on every machine, so this is a change in what the code does.`,
      'What to do:',
      ...(figure ? [`  1. See where the work goes: ${cfg.perfCommand(figure)}   (the same action, timed, with the same three counts)`] : []),
      `  ${figure ? 2 : 1}. If the extra work is not meant, remove it. That is the usual answer.`,
      `  ${figure ? 3 : 2}. If it is the price of a change the operator wants, re-record in the same commit:  ${record} --accept-rise`,
      '     and put the before and after it prints in the change\'s ADR (docs/17 §7: "measure before and after, put both numbers in the ADR";',
      '     a change that doubles an action needs the operator\'s sign-off).',
    ].join('\n');

  /** A figure's run against its baseline lines. */
  function compare(figure: string, actions: readonly MeasuredAction[]): { rises: Change[]; falls: Change[]; unrecorded: string[]; stale: string[] } {
    const rises: Change[] = [];
    const falls: Change[] = [];
    const unrecorded: string[] = [];
    const seen = new Set<string>();
    for (const a of actions) {
      const k = keyOf(figure, a.action);
      seen.add(k);
      const before = baseline.get(k);
      if (!before) {
        unrecorded.push(k);
        continue;
      }
      const c: Change = { k, before, after: a.work, label: a.label };
      if (rose(c)) rises.push(c);
      else if (fell(c)) falls.push(c);
    }
    const stale = (baselineFigures.get(figure) ?? []).map((l) => l.k).filter((k) => !seen.has(k));
    return { rises, falls, unrecorded, stale };
  }

  return {
    recording,
    only,
    wants: (figure) => !only || only.some((o) => figure.includes(o)),
    measured: (figure) => run.get(figure),
    walkedByCost: () => [...run].map(([f, as]) => [f, as.reduce((s, a) => s + a.work.total, 0)] as const).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([f]) => f),

    check(figure, actions) {
      const dup = actions.map((a) => a.action).find((a, i, all) => all.indexOf(a) !== i);
      if (dup) throw new Error(`work-meter gate (${cfg.title}): «${figure}» produced the action «${dup}» twice — an action's name must identify it.`);
      run.set(figure, actions);
      if (recording) return;
      const { rises, unrecorded, stale } = compare(figure, actions);
      const parts: string[] = [];
      if (rises.length)
        parts.push(
          `WORK METER — ${cfg.title}: ${rises.length} recorded student action${rises.length > 1 ? 's' : ''} now ${rises.length > 1 ? 'do' : 'does'} MORE solver work than the baseline (ADR-W-210, invariant 5).\n\n` +
            changesText(rises, reportFile) +
            '\n' +
            footer(figure),
        );
      if (unrecorded.length)
        parts.push(
          `WORK METER — ${cfg.title}: «${figure}» has ${unrecorded.length} action${unrecorded.length > 1 ? 's' : ''} with no recorded count (${unrecorded.map(actionOf).join(', ')}).\n` +
            `A new ${slow ? 'sequence' : 'fixture'}, or a new action of an old one, is recorded before it is committed:  ${record}\n` +
            '(it adds what is new and lowers what fell; it never writes a rise).',
        );
      if (stale.length)
        parts.push(
          `WORK METER — ${cfg.title}: the baseline records ${stale.length} action${stale.length > 1 ? 's' : ''} of «${figure}» that the walk no longer makes (${stale.map(actionOf).join(', ')}).\n` +
            `The figure changed, or an action stopped applying to it. Look at why, then re-record:  ${record}`,
        );
      if (parts.length) throw new Error(parts.join('\n\n'));
    },

    finish(corpus) {
      const walked = new Set(run.keys());
      const missingWalk = corpus.filter((f) => (!only || only.some((o) => f.includes(o))) && !walked.has(f));
      // what this run measured, as baseline lines
      const lines: WorkLine[] = [];
      const ms = new Map<string, number>();
      for (const [figure, actions] of run)
        for (const a of actions) {
          lines.push({ k: keyOf(figure, a.action), ...a.work });
          if (a.ms !== undefined) ms.set(keyOf(figure, a.action), Math.round(a.ms * 10) / 10);
        }
      lines.sort(byKey);
      const all = { rises: [] as Change[], falls: [] as Change[], unrecorded: [] as string[], stale: [] as string[] };
      for (const [figure, actions] of run) {
        const c = compare(figure, actions);
        all.rises.push(...c.rises);
        all.falls.push(...c.falls);
        all.unrecorded.push(...c.unrecorded);
        all.stale.push(...c.stale);
      }
      // a baseline figure the corpus no longer holds (never judged on a filtered run)
      const inCorpus = new Set(corpus);
      const goneFigures = only ? [] : [...baselineFigures.keys()].filter((f) => !inCorpus.has(f));
      // the builder's page-lane total, over the actions both sides know
      let pageBefore = 0;
      let pageAfter = 0;
      for (const l of lines) {
        const b = baseline.get(l.k);
        if (!b) continue;
        pageBefore += b.page;
        pageAfter += l.page;
      }
      const sum = (f: (typeof FIELDS)[number]): number => lines.reduce((s, l) => s + l[f], 0);
      const totals = { total: sum('total'), page: sum('page'), prePaint: sum('prePaint') };
      const report = {
        product: cfg.product,
        corpus: slow ? 'slow' : 'fixtures',
        mode: recording ? 'record' : 'check',
        only,
        figures: run.size,
        actions: lines.length,
        totals,
        pageLane: { before: pageBefore, after: pageAfter },
        rises: all.rises,
        falls: all.falls,
        unrecorded: all.unrecorded,
        stale: [...all.stale, ...goneFigures.map((f) => `${f}|*`)],
        lines: lines.map((l) => ({ ...l, ...(ms.has(l.k) ? { ms: ms.get(l.k) } : {}) })),
      };
      mkdirSync(dirname(reportFile), { recursive: true });
      writeFileSync(reportFile, JSON.stringify(report, null, 1));

      if (missingWalk.length) throw new Error(`work-meter gate (${cfg.title}): ${missingWalk.length} figure(s) of the corpus were not walked (${missingWalk.slice(0, 5).join(', ')}…). The gate's own loop is broken.`);

      if (recording) {
        if (all.rises.length && !acceptRise)
          throw new Error(
            `WORK METER — ${cfg.title}: NOT re-recorded. ${all.rises.length} action${all.rises.length > 1 ? 's' : ''} would be recorded HIGHER than the baseline, and a rise is written only on purpose.\n\n` +
              changesText(all.rises, reportFile) +
              '\n' +
              footer(null),
          );
        // a filtered run replaces only the figures it walked; a full run replaces everything
        const kept = only ? [...baseline.values()].filter((l) => !walked.has(figureOf(l.k))) : [];
        const next = [...kept, ...lines];
        writeFileSync(file, formatBaseline(next));
        const added = all.unrecorded.length;
        const removed = only ? all.stale.length : all.stale.length + goneFigures.reduce((s, f) => s + (baselineFigures.get(f)?.length ?? 0), 0);
        const out = [
          `WORK METER — ${cfg.title}: baseline re-recorded (${next.length} lines; ${added} added, ${removed} removed, ${all.falls.length} fell, ${all.rises.length} rose).`,
          `  ${file}`,
          `  this run: total ${n(totals.total)} · page ${n(totals.page)} · before the paint ${n(totals.prePaint)}   (unit: ${cfg.unit})`,
          ...(all.falls.length ? ['', 'FELL:', changesText(all.falls, reportFile)] : []),
          ...(all.rises.length ? ['', 'ROSE (accepted) — these numbers go in the ADR:', changesText(all.rises, reportFile)] : []),
        ];
        console.log(out.join('\n'));
        return;
      }

      if (all.falls.length)
        console.warn(
          `WORK METER — ${cfg.title}: ${all.falls.length} action${all.falls.length > 1 ? 's' : ''} now ${all.falls.length > 1 ? 'do' : 'does'} LESS work than the baseline. Not a failure. Lock the gain:  ${record}\n\n` +
            changesText(all.falls, reportFile),
        );
      const parts: string[] = [];
      if (goneFigures.length)
        parts.push(
          `WORK METER — ${cfg.title}: the baseline records ${goneFigures.length} figure(s) that are no longer in the corpus (${goneFigures.slice(0, 5).join(', ')}${goneFigures.length > 5 ? ', …' : ''}).\n` +
            `Re-record:  ${record}`,
        );
      if (pageAfter > pageBefore)
        parts.push(
          `WORK METER — ${cfg.title}: the builder's work on the page's UI thread ROSE: ${n(pageBefore)} → ${n(pageAfter)} units over the recorded actions (ADR-W-210, invariant 1: the page never solves, and this total only goes down).\n` +
            'The actions that moved are named in the failures above.' +
            footer(null),
        );
      if (parts.length) throw new Error(parts.join('\n\n'));
    },
  };
}

/**
 * The order the figures are walked in: sorted, unless `WORK_METER_ORDER` asks for `reverse` or `shuffle:<seed>`.
 * The counts must not depend on it; the two other orders exist to show that they do not.
 */
export function walkOrder<T>(sorted: readonly T[], env: Record<string, string | undefined> = process.env): T[] {
  const order = env.WORK_METER_ORDER ?? '';
  if (order === 'reverse') return [...sorted].reverse();
  const m = /^shuffle:(\d+)$/.exec(order);
  if (!m) return [...sorted];
  // a small seeded generator (mulberry32): the same seed gives the same order on every machine
  let s = Number(m[1]) >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...sorted];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The first difference between two walks of one figure, or null when they are identical. */
export function firstDifference(a: readonly MeasuredAction[], b: readonly MeasuredAction[]): string | null {
  if (a.length !== b.length) return `${a.length} actions, then ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i].action !== b[i].action) return `action ${i + 1} was «${a[i].action}», then «${b[i].action}»`;
    for (const f of FIELDS) if (a[i].work[f] !== b[i].work[f]) return `${a[i].action}: ${f} ${n(a[i].work[f])}, then ${n(b[i].work[f])}`;
  }
  return null;
}
