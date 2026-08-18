/**
 * The 3-D tool's shell (docs/20 §6.6) — V0 minimal: input → parse → fact list →
 * derived figure on the orbitable canvas. RTL Hebrew default. A deliberate
 * rewrite-following-the-template of the 2-D App (pattern-copy, no imports from
 * src/ — docs/20 §12 rule 1).
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
// The shared frame (Track B, B3 #668): the deliberate src3d -> shell adoption ADR-W-019 reserved.
import { AppFrame } from '../shell/frame/AppFrame';
import { DataPanel } from '../shell/frame/DataPanel';
import { FactList } from '../shell/frame/FactList';
import { ManualScreen } from '../shell/frame/ManualScreen';
import { QuickChips } from '../shell/frame/QuickChips';
import { Workbench } from '../shell/frame/Workbench';
import { FigureName } from '../shell/frame/FigureName';
import { InputArea } from '../shell/frame/InputArea';
import { ToolButton } from '../shell/frame/ToolButton';
import registry from '../products.json';
import { dataView, panelIsEmpty } from './engine/dataView';
import { answerQuery } from './engine/queries';
import { freeDofCount3 } from './engine/evaluate';
import { COMMAND_CATALOG_3D } from './parser/catalog3';
import { logDebug3 } from './debug/sessionLog3';
import { inputPreview3, isolateLtrRuns3, textDir3 } from './i18n/bidi';
import { SYMBOL_SPECS_3 } from './ui/symbols3';
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
    // #612 (ADR-3D-158): name BOTH shapes — the honesty invariant is that a refusal names the
    // student's own statement and what the figure actually holds, never internal state.
    case 'shape-less-specific':
      return t('err.shapeLessSpecific', { stated: t(`notice.shape.${err.stated}`), actual: t(`notice.shape.${err.actual}`) });
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
    case 'line-not-determined':
      return t('err.lineNotDetermined', { id: err.id });
  }
}

/**
 * #559 (ADR-3D-156): a MATH-ONLY data-panel row — `|u| = |v| = 2`, `N(6, 6, 6)`, a plane equation.
 *
 * Its CONTENT is laid out LTR (that is how mathematics is written, in either locale), while the ROW
 * itself follows the app's own direction, so every row in the panel sits on the same edge. The inner
 * `dir="ltr"` span is what makes those two facts independent: setting `dir` on the `<li>` would also
 * reset its `text-align` to that direction's start, which is exactly how the panel ended up with
 * math hugging one edge and Hebrew hugging the other.
 */
function MathRun({ children }: { children: React.ReactNode }) {
  return (
    <span dir="ltr" className="inline-block">
      {children}
    </span>
  );
}

const EXAMPLE_KEYS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8'] as const;

export default function App3() {
  const { t, i18n } = useTranslation();
  const facts = useGeo3((s) => s.facts);
  const seed = useGeo3((s) => s.seed);
  const figureName = useGeo3((s) => s.figureName);
  /** The switcher roster — A2's registry as DATA (ADR-W-021); labels resolve through THIS
   *  product's own locales, devUrl under the one-origin dev server. */
  const roster = useMemo(
    () =>
      registry.products
        .filter((p) => p.enabled)
        .map((p) => ({
          id: p.id,
          label: t(p.labelKey),
          icon: p.icon,
          url: import.meta.env.DEV ? p.devUrl : p.url,
        })),
    [t],
  );
  const setFigureName = useGeo3((s) => s.setFigureName);
  const [manualOpen, setManualOpen] = useState(false); // the D9 manual SCREEN (B7) — catalog-backed
  // The data panel (ADR-3D-014, reshaped by B6 #671): derived presentations, student opt-in.
  // B6 follow-up (operator 2026-08-18, "the same way we trigger"): the trigger is the SHARED
  // DataPanel head — open by default on wide screens, exactly like the complex column.
  const [showData, setShowData] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1000px)').matches,
  );
  const [showWitness, setShowWitness] = useState(true); // #397: distance witnesses, default on
  const lastError = useGeo3((s) => s.lastError);
  const submit = useGeo3((s) => s.submit);
  const toggle = useGeo3((s) => s.toggle);
  const remove = useGeo3((s) => s.remove);
  const replaceFact = useGeo3((s) => s.replaceFact);
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
  // the palette's insert lives in shell/InputArea now (wrap-selection, applySymbol — B4)
  const [busy, setBusy] = useState(false);
  // #73 (ADR-3D-040): the guidance register's what-to-do-instead note (shown in place of an error)
  const [guidanceNote, setGuidanceNote] = useState<string | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null); // #309: a loaded file that does not rebuild
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  /** #718 — the drawing HOST: the flex-1 area the svg must fill. Both dimensions are measured,
   *  because deriving height from width (the old `canvasW * 0.72`) overflowed the workbench card
   *  at wide viewports — the operator's "the cube draws very large / doesn't fit". */
  const canvasHost = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 460 });
  const derived = useMemo(() => derive3(facts, seed), [facts, seed]);
  const dof = useMemo(() => freeDofCount3(derived.construction, derived.resolved), [derived]);
  const notices = derived.notices; // #305 (ADR-3D-090): non-error "here is what changed" messages

  // responsive canvas: track the HOST's box (V5; #718: height too)
  useEffect(() => {
    const el = canvasHost.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0) setCanvasSize({ w: Math.round(r.width), h: Math.max(300, Math.round(r.height)) });
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

  // `raw` defaults to the box's text; a QUICK-COMMAND pick passes its command directly (D9b:
  // click and see it BUILD, no data entry) and rides the identical path — parser, guidance
  // short-circuits, LLM escalation, logging.
  const submitText = async (raw = text) => {
    if (!raw.trim() || busy) return;
    setGuidanceNote(null); // a fresh submit clears the previous guidance
    setLoadNote(null); // …and the load note, which described the file as opened
    submit(raw);
    let err = useGeo3.getState().lastError;
    logDebug3({ kind: 'input', utterance: raw, locale: i18n.language, source: 'parser', result: err ? err.code : 'ok', intermediate: err?.code === 'not-understood' });
    // out-of-grammar → escalate to the LLM proxy; the returned canonical lines re-parse deterministically
    if (err?.code === 'not-understood') {
      // #73 (ADR-3D-040): the GUIDANCE register short-circuits BEFORE the LLM — a non-constructive
      // family can never build, so an LLM call on it is pure cost (the 2-D ADR-289 twin, copied).
      // #353: lowercase NODE labels — if reading them as uppercase makes the utterance parse, the only
      // problem was the case convention. Say so (with the corrected spelling) instead of paying for an LLM
      // call. Proof-based, so a genuine gap stays a genuine gap; checked before the pattern register.
      const upper = upperCasedLabelCandidate3(raw);
      if (upper && parse3(upper).ok) {
        logDebug3({ kind: 'input', utterance: raw, locale: i18n.language, source: 'scope', result: 'scope:lowercase-labels' });
        setGuidanceNote(t('scope.lowercase-labels', { corrected: upper }));
        useGeo3.setState({ lastError: null });
        return;
      }
      const g = classifyGuidance3(raw);
      if (g) {
        logDebug3({ kind: 'input', utterance: raw, locale: i18n.language, source: 'scope', result: `scope:${g.category}` });
        setGuidanceNote(t(g.messageKey));
        useGeo3.setState({ lastError: null });
        return;
      }
      setBusy(true);
      try {
        const ctx = `Existing points: ${[...derived.construction.points.keys()].join(', ') || '(none)'}.`;
        const steps = await escalate3(raw, ctx);
        if (steps) submitSteps(raw, steps);
        err = useGeo3.getState().lastError;
        // `commands` = the canonical lines that re-parsed onto the figure (#182): without them a prod
        // `llm, ok` submit is opaque and every later step of the session is unreplayable (`steps` stays
        // for the dev trace; the lean sink reads `commands`, mirroring the 2-D #84 field).
        logDebug3({ kind: 'input', utterance: raw, locale: i18n.language, source: 'llm', steps: steps ?? null, commands: steps ?? undefined, result: err ? err.code : 'ok' });
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
    <AppFrame
      title={t('title')}
      subtitle={t('tagline')}
      utilityActions={
        /* ONE look for the session actions in every builder (shell/ToolButton) — the operator's
           2026-08-18 catch: shared row, per-product buttons still rendered differently. */
        <>
          <ToolButton onClick={onSaveFile} disabled={facts.length === 0}>
            💾 {t('actions.save')}
          </ToolButton>
          <ToolButton onClick={() => fileInput.current?.click()}>📂 {t('actions.load')}</ToolButton>
          <ToolButton onClick={() => setManualOpen(true)}>{t('manual.button')}</ToolButton>
          {/* image export appears only once there is something to save (operator, 2026-08-18);
              it rides LAST so the constant buttons keep their suite positions. */}
          {facts.length > 0 && (
            <ToolButton onClick={onSaveImage}>{t('actions.saveImage')}</ToolButton>
          )}
        </>
      }
      roster={roster}
      activeProductId="3d"
      switcherLabel={t('switcherAria')}
      about={{
        label: t('aboutLabel'),
        title: t('aboutTitle'),
        body: <p style={{ marginTop: 0 }}>{t('aboutLead')}</p>,
        privacy: t('privacy'),
        closeLabel: t('aboutClose'),
      }}
      buildStamp={typeof __BUILD__ !== 'undefined' ? __BUILD__ : undefined}
    >
    {/* THE WORKBENCH (#734): the three-zone GEOMETRY is the shell's — identical columns, canvas
        card and empty-state placement in every builder; this product passes zone content only.
        (The old min-h-screen page + per-product Tailwind columns retired.) */}
    <Workbench
      emptyOverlay={
        facts.length === 0 ? (
          <QuickChips
            title={t('emptyTitle')}
            hint={t('emptyHintChips')}
            commands={EXAMPLE_KEYS.slice(0, 4).map((k) => t(`examples.${k}`))}
            onPick={(c) => void submitText(c)}
          />
        ) : undefined
      }
      inputZone={<>
          {/* THE SHARED INPUT AREA (B4, the shared-components rule): box, palette, preview seam
              and quick strip exist ONCE in shell/. The #482 preview discipline is preserved by
              the props: inputPreview3 gates it, textDir3 sets its base direction (#118). */}
          <InputArea
            value={text}
            onChange={setText}
            onSubmit={() => void submitText()}
            placeholder={t('input.placeholder')}
            submitLabel={t('input.add')}
            busy={busy}
            busyLabel={t('input.thinking')}
            symbols={SYMBOL_SPECS_3}
            preview={(s) => inputPreview3(s)}
            previewDir={(s) => textDir3(s)}
          />
          {/* No example strip above the box (operator ruling 2026-08-18): the examples are the
              CLEAN-CANVAS QuickChips (below) and, with B7, the manual screen. */}

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
            <div key={`notice-${i}`} role="note" className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {n.kind === 'base-constrained'
                ? t('notice.baseConstrained', { ids: n.ids.join(''), from: t(`notice.shape.${n.from}`), to: t(`notice.shape.${n.to}`) })
                : n.kind === 'shape-redundant'
                  ? t('notice.shapeRedundant', { ids: n.ids.join(''), shape: t(`notice.shape.${n.base}`) })
                : n.kind === 'line-rel-noun'
                  ? t('notice.lineRelNoun', { line: n.line })
                  : n.kind === 'redundant-relation'
                    ? t('notice.redundantRelation', { a: n.a, b: n.b })
                    : n.kind === 'line-auto-named'
                      ? t('notice.lineAutoNamed', { requested: n.requested, assigned: n.assigned })
                      : t('notice.lineCalledPlane', { ids: n.ids.join(''), line: n.line })}
            </div>
          ))}
          {guidanceNote && !lastError && !busy && (
            <div role="note" className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {guidanceNote}
            </div>
          )}
          {lastError && !busy && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {errorText(t, lastError)}
            </div>
          )}

          {/* The examples dropdown retired (B4 completed, operator's parity catch 2026-08-18):
              the examples are the shared quick-command STRIP inside the input card now, the same
              place as in every builder — and a pick BUILDS (D9b), instead of only filling the box. */}

          {/* B5 (#670, D6): the SHARED fact-list chrome — row cards, mute checkbox, ✎ edit-in-place,
              ✕ delete, one look across the builders. The row CONTENT stays this product's:
              claim-✓/status dot, the bidi-isolated utterance (#482 ADR-3D-121: display-only,
              idempotent; a VECTOR fact renders through VecMath, whose tokenizer must not see
              injected isolates), and the per-plane display-cycle chips (#318/#395 ADR-3D-108 —
              relation-operand and claim-carrier planes cycle exactly like a stated «מישור ABC»). */}
          <FactList
            testId="fact-list"
            rows={facts.map((f) => ({
              id: f.id,
              disabled: !f.enabled,
              content: (
                <span className="flex min-w-0 items-center gap-2">
                  {f.cmds.some((c) => c.type === 'claim') && derived.status[f.id] === 'ok' ? (
                    <span className="text-xs font-bold text-emerald-600" title={t('facts.claimVerified')}>
                      ✓
                    </span>
                  ) : (
                    statusDot(derived.status[f.id])
                  )}
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                    {isVectorFact3(f) ? (
                      <VecMath text={factDisplay(f, new Set(derived.construction.vectors.keys()))} vecNames={new Set(derived.construction.vectors.keys())} />
                    ) : (
                      isolateLtrRuns3(f.utterance)
                    )}
                  </span>
                  {[...new Set(f.cmds.flatMap((cm) =>
                    cm.type === 'plane-through' ? [cm.name]
                    : cm.type === 'free-plane' ? [cm.name] // #487: the declaring row cycles its patch like any other plane-materialising fact
                    : cm.type === 'plane-rel' || cm.type === 'mutual-rel' || cm.type === 'distance-rel'
                      ? [cm.a, cm.b].flatMap((op) => (op.kind === 'plane-run' ? [op.ids.join('')] : []))
                      : cm.type === 'line-rel' && cm.op.kind === 'plane-run' ? [cm.op.ids.join('')]
                      : cm.type === 'claim' && (cm.claim.type === 'plane-eq' || cm.claim.type === 'coord-plane-rel') ? [cm.claim.ids.join('')]
                      : cm.type === 'coord-plane-rel' && cm.ids.length > 0 ? [cm.ids.join('')]
                      : cm.type === 'line-plane-angle' ? [cm.plane.join('')]
                      : [],
                  ))].map((name) => (
                    <button
                      key={name}
                      type="button"
                      title={t('facts.planeToggleTitle', { name })}
                      onClick={() => togglePlaneDisplay(name)}
                      className="shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] leading-4 text-slate-500 hover:border-blue-400 hover:text-blue-700"
                    >
                      {(planeDisplay[name] ?? 'full') === 'full' ? t('facts.planeFace') : (planeDisplay[name] === 'face' ? t('facts.planeHide') : t('facts.planeFull'))}
                    </button>
                  ))}
                </span>
              ),
            }))}
            emptyHint={t('facts.empty')}
            onToggle={toggle}
            toggleLabel={t('facts.toggleTitle')}
            editValueOf={(id) => facts.find((f) => f.id === id)?.utterance ?? ''}
            onEditCommit={(id, next) => {
              logDebug3({ kind: 'action', action: 'edit', detail: id }); // #182: a reported session replays edits
              return replaceFact(id, next);
            }}
            editLabel={t('facts.edit')}
            onDelete={(id) => { logDebug3({ kind: 'action', action: 'delete', detail: id }); remove(id); }} // #182: so a reported session replays deletions
            deleteLabel={t('facts.delete')}
          />

          {/* The commands catalog graduated into the MANUAL screen (B7, D9) — the מדריך button in
              the tool row opens it; the sidebar accordion retired. */}
      </>}
      canvasZone={
        <div className="flex min-w-0 flex-1 flex-col gap-2 min-h-0" ref={canvasBox}>
          {/* The figure's NAME (issue #42), centered above the drawing it names — the SHARED
              component (operator: "isn't the whole idea a shared GUI component?"), one look in
              every builder. */}
          <FigureName value={figureName} onChange={setFigureName} placeholder={t('actions.namePlaceholder')} />
          {/* the empty-state chips render through the WORKBENCH's one overlay slot (#734) */}
          {/* #718 — the drawing fills the REMAINING card height (measured host), so a solid can
              never overflow the card: the svg gets the space the layout actually has. */}
          <div ref={canvasHost} className="min-h-0 flex-1">
            <Figure3
              construction={derived.construction}
              resolved={derived.resolved}
              planeDisplay={planeDisplay}
              showWitnesses={showWitness}
              coordLabels={showData && dataPanel ? dataPanel.pointCoords : undefined}
              width={canvasSize.w}
              height={canvasSize.h}
              resetLabel={t('actions.resetView')}
              crossingLabel={t('actions.nameCrossing')}
              onNameCrossing={onNameCrossing}
            />
          </div>
          {/* B6 (#671): the DOF cue moved to the data panel's head-line — its generic home across
              the builders (operator: "people who care about it will look at it"). */}
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
            {/* #397's witness toggle moved INTO the נתונים panel (#739 — operator: "show
                distances and so on, that's part of the data panel"), matching 2-D's display
                checkboxes. The row now carries exactly what every builder has. */}
            {/* שמור/טען/תמונה moved to the TOOL ROW (B3, the level model): they act on the
                session, not the fact list. The load target stays here so it outlives the frame. */}
            <input ref={fileInput} type="file" accept=".geo3.json,application/json,.json" className="hidden" onChange={onLoadFile} />
          </div>
        </div>
      }
      dataZone={
        /* organize-your-data (ADR-3D-014, B6 #671): the D8 SKELETON via the SHARED DataPanel —
           same sections, same head/trigger as every builder. The query lane (#274, ADR-3D-057: a
           question, never a fact) IS this product's ask section. */
        (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <DataPanel
                title={t('dataPanel.title')}
                open={showData}
                onToggle={() => setShowData((s) => !s)}
                showLabel={t('dataPanel.show')}
                hideLabel={t('dataPanel.hide')}
                status={facts.length > 0 ? (dof === 0 ? t('cue.determined') : t('cue.free', { n: dof })) : undefined}
                sections={[
                  {
                    key: 'points',
                    title: t('dataPanel.secPoints'),
                    dir: 'app',
                    rows: (dataPanel?.points ?? []).map((p) => <MathRun key={p}>{p}</MathRun>),
                  },
                  {
                    /* the vectors' decomp/coords/magnitude readings + the plane equations — this
                       product's MEASURES rows. Rows follow the APP's direction with math as inner
                       LTR islands (#559, ADR-3D-156: a list-wide dir made one panel hug two edges). */
                    key: 'measures',
                    title: t('dataPanel.secMeasures'),
                    dir: 'app',
                    rows: [
                      ...(dataPanel?.vectors ?? []).map((v) => (
                        <span key={v.label}>
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
                              <MathRun>{v.mag}{v.sq ? ' · ' + v.sq : ''}</MathRun>
                            </div>
                          )}
                        </span>
                      )),
                      ...(dataPanel?.planes ?? []).map((p) => <MathRun key={p}>{p}</MathRun>),
                    ],
                  },
                  {
                    /* S4 (#378): mutual positions read as WORDS in the reader's language — there is
                       no standard symbol for skew lines. #559: their dir comes from `textDir3`, NOT
                       `dir="auto"` — these rows routinely START with a Latin point label («AB ו-CD
                       מצטלבים»), and auto keys off the FIRST strong character (the ADR-312/#118
                       trap). #577 (ADR-3D-154): a LINEAR×PLANAR row words asymmetrically — «FG
                       מקביל למישור ABCD» — the row says which kind it is, never guessed from labels. */
                    key: 'relations',
                    title: t('dataPanel.secRelations'),
                    dir: 'app',
                    rows: [
                      ...(dataPanel?.relations ?? []).map((r) => (
                        <span key={r} className="font-medium">
                          <MathRun>{r}</MathRun>
                        </span>
                      )),
                      ...(dataPanel?.mutual ?? []).map((m) => {
                        const line = t(
                          m.mixed && (m.rel === 'parallel' || m.rel === 'perpendicular')
                            ? `dataPanel.mutual.${m.rel === 'parallel' ? 'parallelPlane' : 'perpendicularPlane'}`
                            : `dataPanel.mutual.${m.rel}`,
                          { a: m.a, b: m.b },
                        );
                        return (
                          <span key={`${m.rel}-${m.a}-${m.b}`} dir={textDir3(line)} className="block font-medium">
                            {line}
                          </span>
                        );
                      }),
                    ],
                  },
                  {
                    /* #325 (ADR-3D-079 Am. 2): a determined value prints, a free one reads open
                       with a hint, so the given visibly registered */
                    key: 'parameters',
                    title: t('dataPanel.secParams'),
                    dir: 'app',
                    rows: (dataPanel?.params ?? []).map((p) => (
                      <span key={p.sym} className={p.open ? 'text-slate-500' : undefined}>
                        <MathRun>{p.text}</MathRun>
                        {p.open && <span className="ms-1 text-xs text-slate-400">— {t('dataPanel.openParam')}</span>}
                      </span>
                    )),
                  },
                  {
                    /* #274 (ADR-3D-057): the query lane — a question, never a fact. #398
                       (ADR-3D-108): per-ROW dir="auto" — a Hebrew query lays out RTL with the math
                       tokens as isolated LTR islands; a symbol-only query (|AB|, w·v) stays LTR. */
                    key: 'ask',
                    title: t('dataPanel.secAsk'),
                    dir: 'app',
                    rows: queryResults.map((r, i) => (
                      <span key={r.text + i} dir="auto" className="flex items-center justify-between gap-2">
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
                      </span>
                    )),
                  },
                ]}
              >
                {(!dataPanel || panelIsEmpty(dataPanel)) && queryResults.length === 0 && (
                  <p className="text-slate-400">{t('dataPanel.empty')}</p>
                )}
                {/* #739: the distance-witness display toggle — a checkbox HERE like 2-D's display
                    toggles (#738), not a button on the figure row (reverses the B6 placement). */}
                {facts.length > 0 && (
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" checked={showWitness} onChange={(e) => setShowWitness(e.target.checked)} />
                    {t('display.witnesses')}
                  </label>
                )}
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
                  <button type="submit" className="rounded-lg bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700">
                    {t('query.add')}
                  </button>
                </form>
              </DataPanel>
            </div>
        )
      }
    />
      {/* NFR-SE-3's note now lives in the frame's About modal (B3) — the footer fallback retired. */}
      {/* THE MANUAL (B7 #672, D9): the catalog as a separate SCREEN — a click SUBMITS the example
          through the full path (parser → guidance → LLM lane), replacing the old fill-the-box. */}
      <ManualScreen
        open={manualOpen}
        title={t('manual.title')}
        intro={t('manual.intro')}
        closeLabel={t('manual.close')}
        tryHint={t('manual.try')}
        sectionCap={6}
        moreNote={t('manual.more')}
        sections={(['solids', 'points', 'vectors', 'planesLines', 'claims', 'drawing'] as const).map((cat) => ({
          key: cat,
          title: t(`catalog.${cat}`),
          entries: COMMAND_CATALOG_3D.filter((c) => c.category === cat).map((c) => {
            const raw = i18n.language === 'he' ? c.he : c.en;
            return {
              example: isolateLtrRuns3(raw),
              dir: textDir3(raw),
              onTry: () => {
                setManualOpen(false);
                void submitText(raw);
              },
            };
          }),
        }))}
        onClose={() => setManualOpen(false)}
      />
    </AppFrame>
  );
}
