/**
 * The 3-D tool's shell (docs/20 §6.6) — V0 minimal: input → parse → fact list →
 * derived figure on the orbitable canvas. RTL Hebrew default. A deliberate
 * rewrite-following-the-template of the 2-D App (pattern-copy, no imports from
 * src/ — docs/20 §12 rule 1).
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { dataView, panelIsEmpty } from './engine/dataView';
import { answerQuery } from './engine/queries';
import { freeDofCount3 } from './engine/evaluate';
import { COMMAND_CATALOG_3D } from './parser/catalog3';
import { logDebug3 } from './debug/sessionLog3';
import { inputPreview3, isolateLtrRuns3, textDir3 } from './i18n/bidi';
import { SYMBOL_PALETTE_3 } from './ui/symbols3';
import { crossingUtterance3, nextFreeLabel3 } from './engine/crossings3';
import { escalate3 } from './parser/llm3';
import { classifyGuidance3, upperCasedLabelCandidate3 } from './parser/scope3';
import { parse3 } from './parser/parse3';
import Figure3 from './render/Figure3';
import { deserializeFigure3, figureNameFromFileName3, namedFigureFileName3, serializeFigure3 } from './store/figureFile3';
import { auditLoad3 } from './store/loadAudit3';
import { derive3, redo3, undo3, useGeo3, type FactStatus3, type StoreError3 } from './store/store3';
import { factDisplay3, isVectorFact3 } from './render/notation';
import { VecMath } from './render/VecMath';

/** #492/#425: the student's own statements, quoted and comma-joined, for a refusal that names the
 *  conflict. Quoting keeps a multi-word utterance readable as ONE item in the list. */
const quoteList = (items: string[]): string => items.map((s) => (s === '…' ? s : `«${s}»`)).join(', ');

function errorText(t: (k: string, o?: Record<string, unknown>) => string, err: StoreError3): string | null {
  if (!err) return null;
  switch (err.code) {
    case 'bound-unsatisfiable':
      return t('err.boundUnsatisfiable', { id: err.id });
    case 'incircle-needs-triangle': // #442 — only a tangential polygon has an incircle
      return t('err.incircleNeedsTriangle');
    case 'ambiguous-vector-length':
      return t('err.ambiguousVectorLength');
    case 'param-roles-conflated':
      return t('err.paramRolesConflated', { letter: err.letter });
    case 'dropped-given':
      return t('err.droppedGiven', { items: err.items });
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
    // #492/#425: the refusal quotes the student's own statements — the honesty invariant (name the
    // conflicting STATEMENT, never internal state). The «…With» variant is used only when there are
    // other statements to name, so the message never trails an empty list.
    case 'no-roots':
      return err.others.length > 0
        ? t('err.noRootsWith', { sym: err.sym, stated: err.stated, others: quoteList(err.others) })
        : t('err.noRoots', { sym: err.sym, stated: err.stated });
    case 'givens-contradict':
      return err.others.length > 0
        ? t('err.givensContradict', { stated: err.stated, others: quoteList(err.others) })
        : t('err.givensContradictAlone', { stated: err.stated });
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
    case 'placement-not-fixed':
      return t('err.placementNotFixed');
    case 'vacuous-relation':
      return t('err.vacuousRelation');
    case 'plane-not-determined':
      return t('err.planeNotDetermined', { id: err.id });
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
  const [showWitness, setShowWitness] = useState(true); // #397: distance witnesses, default on
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
  const planeDisplay = useGeo3((s) => s.planeDisplay);
  const togglePlaneDisplay = useGeo3((s) => s.togglePlaneDisplay);
  const reportLoadError = useGeo3((s) => s.reportLoadError);

  const submitSteps = useGeo3((s) => s.submitSteps);

  const [text, setText] = useState('');
  // steps display: vector notation moved to src3d/render/notation.ts (#312 — the boundary-class
  // fix lives there, unit-tested; the stored utterance stays untouched).
  const factDisplay = factDisplay3;
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
  const [loadNote, setLoadNote] = useState<string | null>(null); // #309: a loaded file that does not rebuild
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(640);
  const derived = useMemo(() => derive3(facts, seed), [facts, seed]);
  const dof = useMemo(() => freeDofCount3(derived.construction, derived.resolved), [derived]);
  const notices = derived.notices; // #305 (ADR-3D-090): non-error "here is what changed" messages

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
    const blob = new Blob([serializeFigure3(facts, seed, name || undefined, queries, planeDisplay)], { type: 'application/json' });
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
      loadFigure(r.facts, r.seed, r.queries, r.planeDisplay);
      setFigureName(figureNameFromFileName3(f.name)); // the FILENAME names the figure (issue #42)
      // #309 (ADR-3D-087): deserializing checks the SCHEMA, not the OUTCOME. A file this build cannot
      // rebuild used to load with lastError cleared and an empty canvas. The load still opens the file
      // exactly as saved (never destructive) — it just stops claiming the figure is fine when it is not.
      const audit = auditLoad3(r.facts, r.seed);
      setLoadNote(
        audit.failed.length === 0
          ? null
          : audit.unbuildable
            ? t('load.unbuildable', { count: audit.total })
            : t('load.partial', { count: audit.failed.length, steps: audit.failed.map((x) => x.step).join(', ') }),
      );
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

  /**
   * #336 — "clear the session" has TWO OWNERS: the store (facts / queries / plane display / figure
   * name / lastError, all reset by `clear()`) and this component's own session state. The button was
   * wired to the store half only, so the command input kept the text the student had just cleared —
   * along with the guidance note and the data-panel query box. 2-D closed exactly this in #146 by
   * routing its button through one handler that resets both owners; 3-D never received that fix, so
   * the same defect lived on a product apart. Both owners now clear in one place.
   *
   * Deliberately NOT reset: display and language preferences (`showData`, the locale). Those are
   * session-INDEPENDENT — 2-D's rule, kept identical here — and clearing a figure is not a request to
   * put the panels back the way they started.
   */
  const clearAll = () => {
    logDebug3({ kind: 'action', action: 'clear' });
    clear();
    setText('');
    setGuidanceNote(null);
    setQueryText('');
    setLoadNote(null);
  };

  /**
   * #483 — clicking an offered ℓ∩π crossing NAMES it. Deliberately routed through the ordinary
   * `submit` with a real sentence rather than pushed as a command: the click then produces a fact the
   * student can read, undo, re-order and save, and replaying the file re-derives the same point. That
   * is why #485's noun frame had to land first — this utterance has to parse in both languages.
   */
  const onNameCrossing = (k: { line: string; plane: string }) => {
    if (busy) return;
    const id = nextFreeLabel3(derived.construction);
    if (!id) return; // A–Z exhausted — no name to give, so no silent renaming of something else
    setGuidanceNote(null);
    setLoadNote(null);
    const utterance = crossingUtterance3({ ...k, point: { x: 0, y: 0, z: 0 } }, id, i18n.language !== 'en');
    submit(utterance);
    logDebug3({
      kind: 'input',
      utterance,
      locale: i18n.language,
      source: 'parser',
      result: useGeo3.getState().lastError?.code ?? 'ok',
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setGuidanceNote(null); // a fresh submit clears the previous guidance
    setLoadNote(null); // …and the load note, which described the file as opened
    submit(text);
    let err = useGeo3.getState().lastError;
    logDebug3({ kind: 'input', utterance: text, locale: i18n.language, source: 'parser', result: err ? err.code : 'ok', intermediate: err?.code === 'not-understood' });
    // out-of-grammar → escalate to the LLM proxy; the returned canonical lines re-parse deterministically
    if (err?.code === 'not-understood') {
      // #73 (ADR-3D-040): the GUIDANCE register short-circuits BEFORE the LLM — a non-constructive
      // family can never build, so an LLM call on it is pure cost (the 2-D ADR-289 twin, copied).
      // #353: lowercase NODE labels — if reading them as uppercase makes the utterance parse, the only
      // problem was the case convention. Say so (with the corrected spelling) instead of paying for an LLM
      // call. Proof-based, so a genuine gap stays a genuine gap; checked before the pattern register.
      const upper = upperCasedLabelCandidate3(text);
      if (upper && parse3(upper).ok) {
        logDebug3({ kind: 'input', utterance: text, locale: i18n.language, source: 'scope', result: 'scope:lowercase-labels' });
        setGuidanceNote(t('scope.lowercase-labels', { corrected: upper }));
        useGeo3.setState({ lastError: null });
        return;
      }
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

          {/* #482 half (b), operator ruling 2026-08-10 — OPTION 3 (ADR-3D-123 Am. 1): a read-only live
              preview of the input, isolated at render, shown only while isolation would CHANGE the
              layout (the gate lives in inputPreview3). The box itself stays raw — isolates cannot enter
              an editable value without corrupting the caret, and dir="ltr" is what 2-D reverted (#118).
              aria-hidden: it duplicates the input for sighted users; a screen reader has the input. */}
          {(() => {
            const preview = inputPreview3(text);
            return preview === null ? null : (
              <div
                aria-hidden="true"
                data-testid="bidi-preview"
                dir={textDir3(text)}
                className="overflow-x-auto whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600"
              >
                {preview}
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-1" dir="ltr">
            {SYMBOL_PALETTE_3.map(([label, sym, back]) => (
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

          {/* #309 (ADR-3D-087): a file that deserializes cleanly but does not REBUILD must say so —
              it used to load "successfully" onto a blank canvas. Persists until the next submit. */}
          {loadNote && !busy && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {loadNote}
            </div>
          )}
          {/* #305 (ADR-3D-090): a NON-error build notice — the step committed, and the figure was
              adjusted so the statement could hold («ישרה» over a non-cyclic base). Distinct from the
              amber error strip: nothing failed, so it reads as information, not a warning. */}
          {!busy && notices.map((n, i) => (
            <div key={`notice-${i}`} role="note" className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              {n.kind === 'base-constrained'
                ? t('notice.baseConstrained', { ids: n.ids.join(''), from: t(`notice.shape.${n.from}`), to: t(`notice.shape.${n.to}`) })
                : n.kind === 'line-rel-noun'
                  ? t('notice.lineRelNoun', { line: n.line })
                  : n.kind === 'redundant-relation'
                    ? t('notice.redundantRelation', { a: n.a, b: n.b })
                    : t('notice.lineCalledPlane', { ids: n.ids.join(''), line: n.line })}
            </div>
          ))}
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
                {/* #482 (ADR-3D-121): the STUDENT'S OWN text needs the same bidi isolation the
                    messages get. ADR-3D-116 registered `isolateLtrRuns3` as an i18next post-processor —
                    one chokepoint for every translated string, and the right place for those — but an
                    utterance never passes through `t()`, so «מישור π1 - x+(m-2)y+(m-1)z-5» rendered with
                    its equation reversed against the Hebrew. Display-only: the stored fact is untouched,
                    and the transform is idempotent and byte-reversible (its safety property).
                    A VECTOR fact is left alone deliberately — `VecMath` emits one element per token, so
                    the bidi algorithm sees structure rather than one neutral run, and injecting isolates
                    into its input would feed the tokenizer characters it has no token for. */}
                <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                  {isVectorFact3(f) ? (
                    <VecMath text={factDisplay(f, new Set(derived.construction.vectors.keys()))} vecNames={new Set(derived.construction.vectors.keys())} />
                  ) : (
                    isolateLtrRuns3(f.utterance)
                  )}
                </span>
                {/* #318 + #395 (ADR-3D-108): a fact that MATERIALISES a plane patch gets the
                    per-plane display cycle (full → face → hidden → full); the label shows the mode
                    the click SWITCHES TO. Enumeration covers relation-operand planes too — a patch
                    born from «המישור ABC מאונך למישור ABD» is toggleable exactly like a stated
                    «מישור ABC» (the operator's play-1/7/8 ask). */}
                {[...new Set(f.cmds.flatMap((cm) =>
                  cm.type === 'plane-through' ? [cm.name]
                  : cm.type === 'free-plane' ? [cm.name] // #487: the declaring row cycles its patch like any other plane-materialising fact
                  : cm.type === 'plane-rel' || cm.type === 'mutual-rel' || cm.type === 'distance-rel'
                    ? [cm.a, cm.b].flatMap((op) => (op.kind === 'plane-run' ? [op.ids.join('')] : []))
                    : cm.type === 'line-rel' && cm.op.kind === 'plane-run' ? [cm.op.ids.join('')]
                    : [],
                ))].map((name) => (
                  <button
                    key={name}
                    type="button"
                    title={t('facts.planeToggleTitle', { name })}
                    onClick={() => togglePlaneDisplay(name)}
                    className="shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] leading-4 text-slate-500 hover:border-sky-400 hover:text-sky-700"
                  >
                    {(planeDisplay[name] ?? 'full') === 'full' ? t('facts.planeFace') : (planeDisplay[name] === 'face' ? t('facts.planeHide') : t('facts.planeFull'))}
                  </button>
                ))}
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
            planeDisplay={planeDisplay}
            showWitnesses={showWitness}
            coordLabels={showData && dataPanel ? dataPanel.pointCoords : undefined}
            width={canvasW}
            height={Math.max(360, Math.round(canvasW * 0.72))}
            resetLabel={t('actions.resetView')}
            crossingLabel={t('actions.nameCrossing')}
            onNameCrossing={onNameCrossing}
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
            <button type="button" onClick={clearAll} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
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
          {/* #397 (ADR-3D-108): the stated-distance witness (the "height") — on by default,
              hideable "for educational purposes" per the operator's ask. Only rendered relevant
              when a distance given exists; harmless otherwise. */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showWitness} onChange={(e) => setShowWitness(e.target.checked)} />
            {t('display.witnesses')}
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
                <ul className="mt-2 flex flex-col gap-1">
                  {/* #398 (ADR-3D-108): per-row dir="auto" — a Hebrew query («המרחק בין D למישור ABC»)
                      lays out RTL with the math tokens as isolated LTR islands (the ADR-3D-031 Am. 2
                      bidi rule, panel edition); a symbol-only query (|AB|, w·v) stays LTR. The old
                      list-wide dir="ltr" scrambled every Hebrew sentence. */}
                  {queryResults.map((r, i) => (
                    <li key={r.text + i} dir="auto" className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                      <span>
                        <VecMath text={r.text} vecNames={new Set(derived.construction.vectors.keys())} />
                        {r.answer !== null ? (
                          <span className="font-medium">
                            {' = '}
                            <VecMath text={r.answer} vecNames={new Set(derived.construction.vectors.keys())} />
                          </span>
                        ) : (
                          <span className="text-slate-400"> — {t(`query.note.${r.note}`, { param: r.param })}</span>
                        )}
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
              {panelIsEmpty(dataPanel) ? (
                <p className="text-slate-400">{t('dataPanel.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1" dir="ltr">
                  {dataPanel.relations.map((r) => (
                    <li key={r} className="border-b border-slate-100 pb-1 font-medium">
                      {r}
                    </li>
                  ))}
                  {/* S4 (#378): mutual positions read as WORDS in the reader's language — there is no
                      standard symbol for skew lines. `dir="auto"` keeps the Latin labels LTR while the
                      Hebrew predicate lays out correctly. */}
                  {dataPanel.mutual.map((m) => (
                    <li key={`${m.rel}-${m.a}-${m.b}`} dir="auto" className="border-b border-slate-100 pb-1 font-medium">
                      {t(`dataPanel.mutual.${m.rel}`, { a: m.a, b: m.b })}
                    </li>
                  ))}
                  {dataPanel.vectors.map((v) => (
                    <li key={v.label} className="border-b border-slate-100 pb-1 last:border-0">
                      {v.decomp && (
                        <div>
                          <VecMath text={`${v.label} = ${v.decomp}`} vecNames={new Set(derived.construction.vectors.keys())} />
                        </div>
                      )}
                      {v.coords && (
                        <div>
                          <VecMath text={`${v.label} = ${v.coords}`} vecNames={new Set(derived.construction.vectors.keys())} />
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
                  {/* #325 (ADR-3D-079 Am. 2): the open symbols of B(2t,t,k) — a determined value
                      prints, a free one reads open with a hint, so the given visibly registered */}
                  {dataPanel.params.map((p) => (
                    <li key={p.sym} className={p.open ? 'text-slate-500' : undefined}>
                      {p.text}
                      {p.open && <span dir="rtl" className="mr-1 text-xs text-slate-400"> — {t('dataPanel.openParam')}</span>}
                    </li>
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
