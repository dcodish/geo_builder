/**
 * THE COMPLEX-NUMBERS ACTION DRIVER (#2873, ADR-W-210 phase 0; lifted out of `scripts/perf/complex/harness.ts`, #2867).
 *
 * One student action, run through the builder's real code — measured twice in the same run: the wall time of each
 * part (the timing harness reads it) and the work meter's three counts (the gate reads them).
 *
 *   submit  = decideSubmitCx + the render
 *   another = the next seed + the render
 *   load    = hydrateSession (a cold hydrate of the saved file) + the render
 *   edit    = editLine(the last line, its own text): the gateChange path (config tries, and blame on failure) + the render
 *   delete  = removeLine(the first line) + the render
 *
 * "The render" is what App.tsx's useMemo chain recomputes after the store changes (letterLines empty: no chip
 * toggled): deriveLines + coincidencesCx + askRowsOf + realParamNotes + buildScene. There is no Worker anywhere in
 * src-complex and no work after the paint: every unit is page work before the paint, and the meter says so rather
 * than this file.
 */
import { decideSubmitCx, hydrateSession, editLine } from '../../app/submit';
import { deriveLines, complexScopeOf } from '../../app/deriveLines';
import { coincidencesCx } from '../../app/coincidences';
import { realParamNotes } from '../../app/paramNote';
import { askRowsOf } from '../../app/askLane';
import { buildScene } from '../../scene/scene';
import { useComplexStore } from '../../store/useComplexStore';
import { ingestTypedText } from '../../../shell/bidi';
import { meterAction, type WorkCounts } from '../../../shell/workMeter';

/** The figure as the driver threads it through a sequence of submits. */
export interface StCx {
  lines: string[];
  disabled: number[];
  seed: number;
  queries: string[];
}

export interface RenderCx {
  ms: number;
  parts: Record<string, number>;
  pts: number;
}

/** One measured action. `ms` is the whole action; `parts` its split. */
export interface ActionRecordCx {
  ms: number;
  parts: Record<string, number>;
  verdict?: string;
  nLines: number;
  /** load only: how many rows the load audit failed. */
  audit?: number;
  work: WorkCounts;
}

const activeOf = (s: StCx): string[] => s.lines.filter((_, i) => !s.disabled.includes(i));
export const blankCx = (): StCx => ({ lines: [], disabled: [], seed: 0, queries: [] });
const storeState = (): StCx => {
  const g = useComplexStore.getState();
  return { lines: [...g.lines], disabled: [...g.disabled], seed: g.seed, queries: [...g.queries] };
};

/** App.tsx's useMemo chain after a store change. */
export function renderCx(s: StCx): RenderCx {
  const active = activeOf(s);
  const t0 = performance.now();
  const d = deriveLines(active, s.seed, s.seed, s.queries, new Set());
  const t1 = performance.now();
  coincidencesCx(d);
  askRowsOf(s.queries, d.knowledge, new Set(complexScopeOf(active).keys()));
  const t2 = performance.now();
  realParamNotes(active, d, s.seed);
  const t3 = performance.now();
  buildScene(d, { n: 1 });
  const t4 = performance.now();
  return { ms: t4 - t0, parts: { derive: t1 - t0, misc: t2 - t1, paramNotes: t3 - t2, scene: t4 - t3 }, pts: d.points.length };
}

/** Thread one line into `s` without measuring it (the state before a later action). */
export function applyLineCx(s: StCx, u: string): void {
  const v = decideSubmitCx(s, u);
  if (v.kind === 'record') {
    s.lines.push(ingestTypedText(v.line));
    s.seed = v.seed;
  } else if (v.kind === 'ask') s.queries.push(v.line);
}

function metered(fn: () => Omit<ActionRecordCx, 'work'>): ActionRecordCx {
  const m = meterAction();
  try {
    const r = fn();
    return { ...r, work: m.end() };
  } catch (e) {
    m.end();
    throw e;
  }
}

/** Submit one typed line on `s` (mutated when the line is recorded). */
export function submitCx(s: StCx, u: string): ActionRecordCx {
  return metered(() => {
    const t0 = performance.now();
    const v = decideSubmitCx(s, u);
    const decide = performance.now() - t0;
    if (v.kind === 'record') {
      s.lines.push(ingestTypedText(v.line));
      s.seed = v.seed;
    } else if (v.kind === 'ask') s.queries.push(v.line);
    const r: RenderCx = v.kind === 'refuse' ? { ms: 0, parts: {}, pts: -1 } : renderCx(s);
    return { ms: decide + r.ms, parts: { decide, ...r.parts }, verdict: v.kind === 'refuse' ? `refuse:${v.error.key}` : v.kind, nLines: s.lines.length };
  });
}

/** «הציגו תצורה אחרת»: the figure of `s` at `seed`. */
export function anotherCx(s: StCx, seed: number): ActionRecordCx {
  return metered(() => {
    s.seed = seed;
    const r = renderCx(s);
    return { ms: r.ms, parts: r.parts, nLines: s.lines.length };
  });
}

/** A cold hydrate of a saved file, then the render of what the store holds. */
export function loadCx(file: unknown): ActionRecordCx {
  return metered(() => {
    const t0 = performance.now();
    hydrateSession(file);
    const h = performance.now() - t0;
    const g = useComplexStore.getState();
    const r = renderCx(storeState());
    return { ms: h + r.ms, parts: { hydrate: h, ...r.parts }, nLines: g.lines.length, audit: g.loadAudit ? g.loadAudit.failed.length : 0 };
  });
}

/** Edit the store's LAST line in place to its own text. Null on an empty session. */
export function editLastCx(): ActionRecordCx | null {
  const g0 = useComplexStore.getState();
  if (g0.lines.length < 1) return null;
  const idx = g0.lines.length - 1;
  return metered(() => {
    const t0 = performance.now();
    const ok = editLine(idx, g0.lines[idx]);
    const e = performance.now() - t0;
    const r = renderCx(storeState());
    return { ms: e + r.ms, parts: { gate: e }, verdict: ok ? 'ok' : 'refused', nLines: useComplexStore.getState().lines.length };
  });
}

/** Delete the store's first line. Null when it holds fewer than two. */
export function removeFirstCx(): ActionRecordCx | null {
  const g1 = useComplexStore.getState();
  if (g1.lines.length < 2) return null;
  return metered(() => {
    const t0 = performance.now();
    g1.removeLine(0);
    const r = renderCx(storeState());
    return { ms: performance.now() - t0, parts: r.parts, nLines: useComplexStore.getState().lines.length };
  });
}

/** What a save of `s` writes. */
export function savedFileCx(s: StCx): unknown {
  return { app: 'complex-builder', version: 1, lines: s.lines, freePos: {}, seed: s.seed, view: 'cart', ...(s.queries.length ? { queries: s.queries } : {}) };
}
