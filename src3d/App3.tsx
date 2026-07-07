/**
 * The 3-D tool's shell (docs/20 §6.6) — V0 minimal: input → parse → fact list →
 * derived figure on the orbitable canvas. RTL Hebrew default. A deliberate
 * rewrite-following-the-template of the 2-D App (pattern-copy, no imports from
 * src/ — docs/20 §12 rule 1).
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { freeDofCount3 } from './engine/evaluate';
import { COMMAND_CATALOG_3D } from './parser/catalog3';
import { logDebug3 } from './debug/sessionLog3';
import { escalate3 } from './parser/llm3';
import Figure3 from './render/Figure3';
import { deserializeFigure3, serializeFigure3 } from './store/figureFile3';
import { derive3, redo3, undo3, useGeo3, type FactStatus3, type StoreError3 } from './store/store3';

function errorText(t: (k: string, o?: Record<string, unknown>) => string, err: StoreError3): string | null {
  if (!err) return null;
  switch (err.code) {
    case 'not-understood':
      return t('err.notUnderstood');
    case 'bad-file':
      return t('err.badFile');
    case 'newer-schema':
      return t('err.newerSchema');
    case 'already-defined':
      return t('err.alreadyDefined', { id: err.id });
    case 'unknown-point':
      return t('err.unknownPoint', { id: err.id });
    case 'unknown-vector':
      return t('err.unknownVector', { id: err.id });
    case 'unknown-plane':
      return t('err.unknownPlane', { id: err.id });
    case 'unknown-line':
      return t('err.unknownLine', { id: err.id });
    case 'bad-solid':
      return t('err.badSolid');
    case 'two-params':
      return t('err.twoParams');
    case 'no-roots':
      return t('err.noRoots');
    case 'not-on-plane':
      return t('err.notOnPlane', { id: err.id });
    case 'not-on-line':
      return t('err.notOnLine', { id: err.id });
    case 'line-misses-plane':
      return t('err.lineMissesPlane', { id: err.id });
    case 'symbolic-new-point':
      return t('err.symbolicNewPoint', { id: err.id });
    case 'injection-unsatisfiable':
      return t('err.injectionUnsatisfiable');
    case 'sign-unsatisfiable':
      return t('err.signUnsatisfiable', { id: err.id });
    case 'no-such-solid':
      return t('err.noSuchSolid', { id: err.id });
    case 'free-size-claim':
      return t('err.freeSizeClaim', { id: err.id });
    case 'two-unknowns':
      return t('err.twoUnknowns', { id: err.id });
    case 'size-on-solid':
      return t('err.sizeOnSolid');
    case 'bad-name':
      return t('err.badName');
    case 'need-basis':
      return t('err.needBasis');
    case 'no-solution':
      return t('err.noSolution', { id: err.id });
    case 'not-on-segment':
      return t('err.notOnSegment', { id: err.id });
    case 'claim-refuted':
      return t('err.claimRefuted');
  }
}

const EXAMPLE_KEYS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8'] as const;

export default function App3() {
  const { t } = useTranslation();
  const facts = useGeo3((s) => s.facts);
  const seed = useGeo3((s) => s.seed);
  const lastError = useGeo3((s) => s.lastError);
  const submit = useGeo3((s) => s.submit);
  const toggle = useGeo3((s) => s.toggle);
  const remove = useGeo3((s) => s.remove);
  const clear = useGeo3((s) => s.clear);
  const resample = useGeo3((s) => s.resample);
  const loadFigure = useGeo3((s) => s.loadFigure);
  const reportLoadError = useGeo3((s) => s.reportLoadError);

  const submitSteps = useGeo3((s) => s.submitSteps);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(640);
  const derived = useMemo(() => derive3(facts, seed), [facts, seed]);
  const dof = useMemo(() => freeDofCount3(derived.construction, derived.resolved), [derived]);

  // responsive canvas: track the container's width (V5)
  useEffect(() => {
    const el = canvasBox.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setCanvasW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onSaveImage = () => {
    const svg = canvasBox.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth * scale;
      canvas.height = svg.clientHeight * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `figure-3d-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = url;
  };

  const onSaveFile = () => {
    const blob = new Blob([serializeFigure3(facts, seed)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `figure-3d-${new Date().toISOString().slice(0, 10)}.geo3.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onLoadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-loading the same file
    if (!f) return;
    const r = deserializeFigure3(await f.text());
    if (r.ok) loadFigure(r.facts, r.seed);
    else reportLoadError(r.reason);
  };

  // Debug log (dev only): snapshot the fact list + statuses whenever the figure
  // changes, so a session is reconstructable from logs/debug-log-3d.jsonl.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const snapshot = () => {
      const st = useGeo3.getState();
      const d = derive3(st.facts, st.seed);
      logDebug3({
        kind: 'figure',
        seed: st.seed,
        lastError: st.lastError ?? null,
        facts: st.facts.map((f) => ({ id: f.id, enabled: f.enabled, utterance: f.utterance, cmds: f.cmds, status: d.status[f.id] })),
      });
    };
    snapshot();
    return useGeo3.subscribe((s, prev) => {
      if (s.facts !== prev.facts || s.seed !== prev.seed) snapshot();
    });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    submit(text);
    let err = useGeo3.getState().lastError;
    logDebug3({ kind: 'input', utterance: text, source: 'parser', result: err ? err.code : 'ok', intermediate: err?.code === 'not-understood' });
    // out-of-grammar → escalate to the LLM proxy; the returned canonical lines re-parse deterministically
    if (err?.code === 'not-understood') {
      setBusy(true);
      try {
        const ctx = `Existing points: ${[...derived.construction.points.keys()].join(', ') || '(none)'}.`;
        const steps = await escalate3(text, ctx);
        if (steps) submitSteps(text, steps);
        err = useGeo3.getState().lastError;
        logDebug3({ kind: 'input', utterance: text, source: 'llm', steps: steps ?? null, result: err ? err.code : 'ok' });
      } finally {
        setBusy(false);
      }
    }
    if (!err) setText('');
  };

  const statusDot = (st: FactStatus3 | undefined) => {
    if (st === 'ok') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
    if (st === 'disabled') return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />;
    return <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title={t('status.inactive')} />;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-xl font-bold">
          {t('title')} <span className="ms-2 align-middle text-xs font-normal text-slate-400">{t('tagline')}</span>
        </h1>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 p-5 md:flex-row">
        {/* Input + fact list */}
        <section className="flex w-full flex-col gap-3 md:w-96">
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('input.placeholder')}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-sky-500 focus:outline-none"
            />
            <button type="submit" disabled={busy} className="rounded-xl bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {busy ? t('input.thinking') : t('input.add')}
            </button>
          </form>

          {lastError && !busy && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {errorText(t, lastError)}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setText(t(`examples.${k}`))}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-sky-400 hover:text-sky-700"
              >
                {t(`examples.${k}`)}
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-1.5" data-testid="fact-list">
            {facts.length === 0 && <li className="py-2 text-sm text-slate-400">{t('facts.empty')}</li>}
            {facts.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={() => toggle(f.id)}
                  title={t('facts.toggleTitle')}
                  className="accent-sky-600"
                />
                {f.cmds.some((c) => c.type === 'claim') && derived.status[f.id] === 'ok' ? (
                  <span className="text-xs font-bold text-emerald-600" title={t('facts.claimVerified')}>
                    ✓
                  </span>
                ) : (
                  statusDot(derived.status[f.id])
                )}
                <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                  {f.utterance}
                </span>
                <button
                  type="button"
                  aria-label={t('facts.delete')}
                  title={t('facts.delete')}
                  onClick={() => remove(f.id)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {/* the commands catalog (V5) — every supported form, clickable */}
          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">{t('catalog.title')}</summary>
            {['solids', 'points', 'vectors', 'planesLines', 'claims', 'drawing'].map((cat) => (
              <div key={cat} className="mt-2">
                <div className="text-xs font-bold text-slate-400">{t(`catalog.${cat}`)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {COMMAND_CATALOG_3D.filter((c) => c.category === cat).map((c) => (
                    <button
                      key={c.he}
                      type="button"
                      onClick={() => setText(c.he)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 hover:border-sky-400 hover:text-sky-700"
                    >
                      {c.he}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </details>
        </section>

        {/* Canvas + view/session controls */}
        <section className="flex min-w-0 flex-1 flex-col gap-2" ref={canvasBox}>
          <Figure3
            construction={derived.construction}
            resolved={derived.resolved}
            width={canvasW}
            height={Math.max(320, Math.round(canvasW * 0.7))}
            resetLabel={t('actions.resetView')}
          />
          {facts.length > 0 && (
            <p className="text-xs text-slate-500" data-testid="dof-cue">
              {dof === 0 ? t('cue.determined') : t('cue.free', { n: dof })}
            </p>
          )}
          <p className="text-xs text-slate-400">{t('hint.orbit')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resample} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.another')}
            </button>
            <button type="button" onClick={undo3} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.undo')}
            </button>
            <button type="button" onClick={redo3} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.redo')}
            </button>
            <button type="button" onClick={clear} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
              {t('actions.clear')}
            </button>
            <span className="mx-1 self-center text-slate-300">|</span>
            <button
              type="button"
              onClick={onSaveFile}
              disabled={facts.length === 0}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40"
            >
              {t('actions.save')}
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              {t('actions.load')}
            </button>
            <input ref={fileInput} type="file" accept=".geo3.json,application/json,.json" className="hidden" onChange={onLoadFile} />
            <button
              type="button"
              onClick={onSaveImage}
              disabled={facts.length === 0}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40"
            >
              {t('actions.saveImage')}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
