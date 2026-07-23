/**
 * The 3-D tool's shell (docs/20 §6.6) — V0 minimal: input → parse → fact list →
 * derived figure on the orbitable canvas. RTL Hebrew default. A deliberate
 * rewrite-following-the-template of the 2-D App (pattern-copy, no imports from
 * src/ — docs/20 §12 rule 1).
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { dataView } from './engine/dataView';
import { answerQuery } from './engine/queries';
import { freeDofCount3 } from './engine/evaluate';
import { COMMAND_CATALOG_3D } from './parser/catalog3';
import { logDebug3 } from './debug/sessionLog3';
import { escalate3 } from './parser/llm3';
import { classifyGuidance3 } from './parser/scope3';
import Figure3 from './render/Figure3';
import { deserializeFigure3, figureNameFromFileName3, namedFigureFileName3, serializeFigure3 } from './store/figureFile3';
import { derive3, redo3, undo3, useGeo3, type FactStatus3, type StoreError3 } from './store/store3';

function errorText(t: (k: string, o?: Record<string, unknown>) => string, err: StoreError3): string | null {
  if (!err) return null;
  switch (err.code) {
    case 'bound-unsatisfiable':
      return t('err.boundUnsatisfiable', { id: err.id });
    case 'ambiguous-vector-length':
      return t('err.ambiguousVectorLength');
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
    case 'unknown-symbol':
      return t('err.unknownSymbol', { id: err.id });
    case 'ambiguous-angle':
      return t('err.ambiguousAngle', { id: err.id });
    case 'no-prism-to-make-right':
      return t('err.noPrismToMakeRight');
    case 'ambiguous-prism':
      return t('err.ambiguousPrism');
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
    case 'not-coplanar':
      return t('err.notCoplanar', { id: err.id });
    case 'plane-side-undefined':
      return t('err.planeSideUndefined', { id: err.id });
    case 'wrong-side-of-plane':
      return t('err.wrongSideOfPlane', { id: err.id });
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
  const { t, i18n } = useTranslation();
  const facts = useGeo3((s) => s.facts);
  const seed = useGeo3((s) => s.seed);
  const figureName = useGeo3((s) => s.figureName);
  const setFigureName = useGeo3((s) => s.setFigureName);
  // the "organize your data" panel (ADR-3D-014): derived vector/point presentations,
  // OPT-IN by checkbox — it shows derived results, so the student chooses to peek
  const [showData, setShowData] = useState(false);
  const lastError = useGeo3((s) => s.lastError);
  const submit = useGeo3((s) => s.submit);
  const toggle = useGeo3((s) => s.toggle);
  const remove = useGeo3((s) => s.remove);
  const clear = useGeo3((s) => s.clear);
  const resample = useGeo3((s) => s.resample);
  const loadFigure = useGeo3((s) => s.loadFigure);
  const queries = useGeo3((s) => s.queries);
  const addQuery = useGeo3((s) => s.addQuery);
  const removeQuery = useGeo3((s) => s.removeQuery);
  const reportLoadError = useGeo3((s) => s.reportLoadError);

  const submitSteps = useGeo3((s) => s.submitSteps);

  const [text, setText] = useState('');
  // steps display: a VECTOR fact renders in proper notation — pairs get the arrow
  // (SE⃗ = 3/4 SD⃗), declared vector names get the textbook underline (u̲) — the
  // stored utterance stays untouched (the word וקטור reads as decoration).
  const VEC_CMD_TYPES = new Set(['name-vector', 'vec-rel', 'dot-given', 'inject-vector', 'point-in-span']);
  const factDisplay = (f: { utterance: string; cmds: { type: string; claim?: { type: string } }[] }, vecNames: Set<string>): string => {
    const isVec = f.cmds.some((cmd) => VEC_CMD_TYPES.has(cmd.type) || (cmd.type === 'claim' && cmd.claim?.type === 'vec-eq'));
    if (!isVec) return f.utterance;
    let u = f.utterance.replace(/(?:^|(?<=[\s,:]))(?:ה?ו?וקטור|vectors?)\s+/gi, '');
    u = u.replace(/([A-Z]\d*'?[A-Z]\d*'?)(?![\u20D7A-Za-z\d'])/g, '$1\u20D7');
    if (vecNames.size > 0) {
      const names = [...vecNames].join('|');
      u = u.replace(new RegExp('(?:^|(?<=[\\s,:=+\\-·(]))(' + names + ')(?=$|[\\s,.·+\\-=)])', 'g'), '$1\u0332');
    }
    return u;
  };
  const inputRef = useRef<HTMLInputElement>(null);
  // symbol palette (the 2-D App's pattern): insert at the caret, keep focus
  const insertSym = (sym: string, caretBack = 0) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + sym + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const p = start + sym.length - caretBack;
      el?.setSelectionRange(p, p);
    });
  };
  const [busy, setBusy] = useState(false);
  // #73 (ADR-3D-040): the guidance register's what-to-do-instead note (shown in place of an error)
  const [guidanceNote, setGuidanceNote] = useState<string | null>(null);
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
    // A set figure name (issue #42) IS the save name - no prompt. Unset -> today's prompt, and a
    // name typed there is adopted as the figure's name (the field + page title pick it up).
    let name = figureName.trim();
    if (!name) {
      name = (window.prompt(t('actions.saveNamePrompt')) ?? '').trim();
      if (name) setFigureName(name);
    }
    const blob = new Blob([serializeFigure3(facts, seed, name || undefined, queries)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // The user names the file; the per-product -vectors suffix is appended automatically (issue #20).
    // Empty/cancelled → the date-stamped default, the pre-#20 behaviour.
    a.download = namedFigureFileName3(name, new Date());
    a.click();
    URL.revokeObjectURL(url);
  };

  const onLoadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-loading the same file
    if (!f) return;
    const r = deserializeFigure3(await f.text());
    if (r.ok) {
      logDebug3({ kind: 'action', action: 'load', detail: `${r.facts.length} facts` }); // #182: a load replaces the figure — the replay must know
      loadFigure(r.facts, r.seed, r.queries);
      setFigureName(figureNameFromFileName3(f.name)); // the FILENAME names the figure (issue #42)
    } else reportLoadError(r.reason);
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

  const dataPanel = useMemo(() => (showData ? dataView(derived.construction, seed) : null), [showData, derived, seed]);
  // #274 (ADR-3D-057): answer each saved query against the current figure. Coordinate-free honesty gate
  // lives in `answerQuery` — a query it can't answer as knowledge reports WHY, never a sampled number.
  const queryResults = useMemo(
    () => (showData ? queries.map((q) => answerQuery(derived.construction, q, seed)) : []),
    [showData, queries, derived, seed],
  );
  const [queryText, setQueryText] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setGuidanceNote(null); // a fresh submit clears the previous guidance
    submit(text);
    let err = useGeo3.getState().lastError;
    logDebug3({ kind: 'input', utterance: text, locale: i18n.language, source: 'parser', result: err ? err.code : 'ok', intermediate: err?.code === 'not-understood' });
    // out-of-grammar → escalate to the LLM proxy; the returned canonical lines re-parse deterministically
    if (err?.code === 'not-understood') {
      // #73 (ADR-3D-040): the GUIDANCE register short-circuits BEFORE the LLM — a non-constructive
      // family can never build, so an LLM call on it is pure cost (the 2-D ADR-289 twin, copied).
      const g = classifyGuidance3(text);
      if (g) {
        logDebug3({ kind: 'input', utterance: text, locale: i18n.language, source: 'scope', result: `scope:${g.category}` });
        setGuidanceNote(t(g.messageKey));
        useGeo3.setState({ lastError: null });
        return;
      }
      setBusy(true);
      try {
        const ctx = `Existing points: ${[...derived.construction.points.keys()].join(', ') || '(none)'}.`;
        const steps = await escalate3(text, ctx);
        if (steps) submitSteps(text, steps);
        err = useGeo3.getState().lastError;
        // `commands` = the canonical lines that re-parsed onto the figure (#182): without them a prod
        // `llm, ok` submit is opaque and every later step of the session is unreplayable (`steps` stays
        // for the dev trace; the lean sink reads `commands`, mirroring the 2-D #84 field).
        logDebug3({ kind: 'input', utterance: text, locale: i18n.language, source: 'llm', steps: steps ?? null, commands: steps ?? undefined, result: err ? err.code : 'ok' });
      } finally {
        setBusy(false);
      }
    }
    if (!err) {
      setText('');
      setGuidanceNote(null);
    }
  };

  const statusDot = (st: FactStatus3 | undefined) => {
    if (st === 'ok') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
    if (st === 'disabled') return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />;
    return <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title={t('status.inactive')} />;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-xl font-bold">
          {t('title')} <span className="ms-2 align-middle text-xs font-normal text-slate-400">{t('tagline')}</span>
        </h1>
        {/* The figure's name (issue #42): an inline-editable title - one control is both the field and
            the visible name. */}
        <input
          type="text"
          value={figureName}
          onChange={(e) => setFigureName(e.target.value)}
          placeholder={t('actions.namePlaceholder')}
          dir="auto"
          aria-label={t('actions.namePlaceholder')}
          className="min-w-0 max-w-md flex-1 rounded-lg border border-dashed border-slate-300 bg-transparent px-3 py-1.5 text-center text-base font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
        />
      </header>

      <main className="mx-auto flex max-w-screen-2xl flex-col gap-5 p-5 md:flex-row">
        {/* Input + fact list */}
        <section className="flex w-full flex-col gap-3 md:w-96">
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              ref={inputRef}
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

          <div className="flex flex-wrap gap-1" dir="ltr">
            {(
              [
                // Greek letters for angle names (#272): 2-D has had these since ADR-039 — «∠SAB = α»
                // is unusable when the letter can't be typed.
                ['α', 'α', 0],
                ['β', 'β', 0],
                ['γ', 'γ', 0],
                ['δ', 'δ', 0],
                ['θ', 'θ', 0],
                ['<', '<', 0], // a bound / ordering between measures
                ['⃗', '⃗', 0],
                ['|·|', '||', 1],
                ['√', '√', 0],
                ['½', '½', 0],
                ['¾', '¾', 0],
                ['·', '·', 0],
                ['⊥', '⊥', 0],
                ['∠', '∠', 0],
                ['°', '°', 0],
                ['′', '′', 0],
                ['ℓ', 'ℓ', 0],
                ['π', 'π', 0],
              ] as [string, string, number][]
            ).map(([label, sym, back]) => (
              <button
                key={label}
                type="button"
                onClick={() => insertSym(sym, back)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-600 hover:border-sky-400 hover:text-sky-700"
              >
                {label}
              </button>
            ))}
          </div>

          {guidanceNote && !lastError && !busy && (
            <div role="note" className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              {guidanceNote}
            </div>
          )}
          {lastError && !busy && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {errorText(t, lastError)}
            </div>
          )}

          {/* Examples folded into a dropdown so they don't crowd the panel (matches the 2-D app). */}
          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">{t('examples.title')}</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
          </details>

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
                  {factDisplay(f, new Set(derived.construction.vectors.keys()))}
                </span>
                <button
                  type="button"
                  aria-label={t('facts.delete')}
                  title={t('facts.delete')}
                  onClick={() => { logDebug3({ kind: 'action', action: 'delete', detail: f.id }); remove(f.id); }} // #182: so a reported session replays deletions
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
            coordLabels={showData && dataPanel ? dataPanel.pointCoords : undefined}
            width={canvasW}
            height={Math.max(360, Math.round(canvasW * 0.72))}
            resetLabel={t('actions.resetView')}
          />
          {facts.length > 0 && (
            <p className="text-xs text-slate-500" data-testid="dof-cue">
              {dof === 0 ? t('cue.determined') : t('cue.free', { n: dof })}
            </p>
          )}
          <p className="text-xs text-slate-400">{t('hint.orbit')}</p>
          <div className="flex flex-wrap gap-2">
            {/* #182: each store interaction logs one lean `action` line so a reported prod session
                replays end-to-end (the 2-D #84/#189 mirror — delete logs at its own button above). */}
            <button type="button" onClick={() => { logDebug3({ kind: 'action', action: 'show-another' }); resample(); }} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.another')}
            </button>
            <button type="button" onClick={() => { logDebug3({ kind: 'action', action: 'undo' }); undo3(); }} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.undo')}
            </button>
            <button type="button" onClick={() => { logDebug3({ kind: 'action', action: 'redo' }); redo3(); }} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
              {t('actions.redo')}
            </button>
            <button type="button" onClick={() => { logDebug3({ kind: 'action', action: 'clear' }); clear(); }} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
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
        {/* organize-your-data (ADR-3D-014): derived presentations, student opt-in */}
        <section className="flex w-full flex-col gap-2 md:w-64">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showData} onChange={(e) => setShowData(e.target.checked)} />
            {t('dataPanel.toggle')}
          </label>
          {showData && (
            /* #274 (ADR-3D-057): the query lane — ask for a quantity («w·v», «|AB|», «∠SAB», «area ABC»,
               «volume SABCD») and see it if it's genuinely determined. A question, never a fact. */
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 text-sm">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addQuery(queryText);
                  setQueryText('');
                }}
                className="flex gap-1"
              >
                <input
                  dir="ltr"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder={t('query.placeholder')}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
                <button type="submit" className="rounded-lg bg-sky-600 px-2 py-1 text-sm text-white hover:bg-sky-700">
                  {t('query.add')}
                </button>
              </form>
              {queryResults.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1" dir="ltr">
                  {queryResults.map((r, i) => (
                    <li key={r.text + i} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                      <span>
                        {r.text}
                        {r.answer !== null ? <span className="font-medium"> = {r.answer}</span> : <span className="text-slate-400"> — {t(`query.note.${r.note}`, { param: r.param })}</span>}
                      </span>
                      <button type="button" onClick={() => removeQuery(i)} className="shrink-0 text-slate-400 hover:text-rose-600" aria-label={t('query.remove')}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {showData && dataPanel && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              {dataPanel.vectors.length === 0 && dataPanel.points.length === 0 && dataPanel.planes.length === 0 ? (
                <p className="text-slate-400">{t('dataPanel.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1" dir="ltr">
                  {dataPanel.relations.map((r) => (
                    <li key={r} className="border-b border-slate-100 pb-1 font-medium">
                      {r}
                    </li>
                  ))}
                  {dataPanel.vectors.map((v) => (
                    <li key={v.label} className="border-b border-slate-100 pb-1 last:border-0">
                      {v.decomp && (
                        <div>
                          {v.label}⃗ = {v.decomp}
                        </div>
                      )}
                      {v.coords && (
                        <div>
                          {v.label}⃗ = {v.coords}
                        </div>
                      )}
                      {v.mag && (
                        <div>
                          {v.mag}{v.sq ? ' \u00A0·\u00A0 ' + v.sq : ''}
                        </div>
                      )}
                    </li>
                  ))}
                  {dataPanel.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {dataPanel.planes.map((p) => (
                    <li key={p} className="border-t border-slate-100 pt-1">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>
      {/* The in-app privacy note (NFR-SE-3 / ADR-278) — this app has no about modal, so it lives in a footer. */}
      <footer className="px-5 pb-4 text-center text-xs text-slate-400">{t('privacy')}</footer>
    </div>
  );
}
