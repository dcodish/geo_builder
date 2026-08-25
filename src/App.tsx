/**
 * App shell (Phase 3) — the usable build loop, driven by the store.
 *
 * The fact list is the source of truth; the figure is derived by replaying the
 * enabled facts (see store `replay`). Each fact can be selected (highlighted on
 * the canvas), deselected (kept but turned off — the figure re-derives, and any
 * fact depending on it auto-drops), or deleted. A text input is present but
 * disabled — the parser is Phase 4; until then a row of "quick facts" drives the
 * same pipeline. i18n is wired with Hebrew default and RTL. Old UI lives in
 * /archive for reference.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
// The shared frame (B3-2d #668): the deliberate src -> shell adoption — the LAST product joins the
// suite chrome (ADR-W-019; BOUNDARIES.json src -> shell edge flipped with this import).
import { AppFrame } from '../shell/frame/AppFrame';
import { DataPanel } from '../shell/frame/DataPanel';
import { FactList } from '../shell/frame/FactList';
import { ManualScreen } from '../shell/frame/ManualScreen';
import { Workbench } from '../shell/frame/Workbench';
import { FigureName } from '../shell/frame/FigureName';
import { InputArea } from '../shell/frame/InputArea';
import { QuickChips } from '../shell/frame/QuickChips';
import { ToolButton } from '../shell/frame/ToolButton';
import registry from '../products.json';
import { firstCyclableBranch, freeDofs, freeDofCount, isGeoPoint, VARIANT_COUNT } from '@/engine';
import { CATEGORY_LABELS, CATEGORY_ORDER, COMMAND_CATALOG, parse, impliedCircleBinding, impliedPointBinding, buildParseCtx, stepLabel, lowercaseLabelFold } from '@/parser';
import { Figure } from '@/render';
import { crossingCommands } from '@/engine';
import type { Crossing } from '@/engine';
import { MathText, hasMath } from '@/render/mathText';
import { MathValue } from '@/render/MathValue';
import { formatMeasure } from '@/format';
import { readoutForGroup } from '@/render/computedValue';
import type { DetectedShape, Id, SimilarClass } from '@/engine';
import { bookUrl } from '@/shapes/shapeCatalog';
import { detectTheorems, detectPrinciples, activeBoosts, visibleFeed, PRINCIPLES_VISIBLE } from '@/theorems';
import type { TheoremFeedEntry, TheoremId, DiscoveryLevel } from '@/theorems';
import { Modal } from '@/ui/Modal';
import { SYMBOL_SPECS } from '@/ui/symbols';
import { btn, card as themeCard, color as pal, fs, sectionTitle } from '@/ui/theme';
// #743: the under-canvas row's ONE look — the style contract lives in shell (seeded from this
// tree's own btn.accent/btn.subtle, which the operator praised); every builder's row consumes it.
import { figureRowStyle, rowAccentStyle, rowAccentOffStyle, rowSubtleStyle, rowSubtleOffStyle, rowDangerInk } from '../shell/frame/figureRow';
import { autoNamedLabels, groupKey, introducedIds, meetsRequirements, primeFoldFor, replay, useGeoStore, viewUsable } from '@/store/geoStore';
import { cancelGeoWork, geoWork, isCancelled } from '@/store/geoWork';
import type { Fact } from '@/store/geoStore';
import { chooseSaveName, deserializeFigure, figureNameFromFileName, namedFigureFileName, serializeFigure } from '@/store/figureFile';
import { questionLines } from '@/export/questionLines';
import { bidiSegments, isolateLtrRuns } from '@/i18n/bidi';
// #742: the exports live in the TOP TOOL ROW now (ADR-W-024) — App rasterises the canvas svg itself.
// #745: the rasteriser and the printed width are SHARED (shell/export/svgToPng), so every builder that
// prints a figure prints it at one width and one ink weight. Two copies could drift; one cannot.
import { QUESTION_IMAGE_WIDTH_PX, svgToPng } from '../shell/export/svgToPng';
import { auditLoadedFigure, liveAuditFindings, refreshLoadedFigure } from '@/store/loadAudit';
import type { LoadAuditFinding } from '@/store/loadAudit';
import { logDebug } from '@/debug/sessionLog';
import { runSubmit } from '@/app/submitPipeline';
import { runViewResolve } from '@/app/resolveView';
import { anonPointDescriptor, visibleCoincidences } from '@/render/pointDescriptions';
import { humanizeError, translateParams } from '@/i18n/humanizeError';
/**
 * Resolve AFTER the browser has had a chance to paint. A just-set React state (e.g. a "thinking"
 * spinner) is only committed to the DOM on the next frame; a blocking SYNCHRONOUS solve started in
 * the same tick would freeze the thread before that paint, so the spinner never appears. Awaiting two
 * animation frames lets React commit and the browser paint first, THEN the heavy work runs visibly
 * behind the spinner. Mirrors the inline double-rAF the "show another configuration" path uses.
 */
const nextPaint = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));

// The live theorem-discovery feed (Phase 6a/6b) shipped live 2026-07-07, opt-in via a checkbox.
// #740 (operator 2026-08-18): the SURFACE is disabled for now — "not ready and just confusing".
// ONE flag: the panel checkbox and the per-step detection key off it; the feed sections stay
// written (they gate on showTheorems, unreachable while the checkbox is gone). The theorems
// ENGINE (src/theorems/) and its tests stay live — this hides the product surface, not the spine.
// Re-enabling is an operator decision: flip this AND delete the lock in
// src/__tests__/theorems-disabled.test.ts, which exists to keep the surface from returning by accident.
const THEOREMS_SURFACE: boolean = false;

export default function App() {
  const { t, i18n } = useTranslation();
  // A humanized build error + a gentle "try a different order/wording/smaller steps" nudge (the book often
  // describes what's SEEN, not how to construct it, so a single complex line may not build — the hint points
  // the student at the manual decomposition). Appended only to real errors, at the display layer, so
  // `humanizeError` stays a pure mapping. (ADR-228 Am.6.)
  const explainError = (raw: string | null | undefined): string => {
    const m = humanizeError(raw, t);
    return m ? `${m} ${t('errors.retryHint')}` : m;
  };
  const facts = useGeoStore((s) => s.facts);
  const selectedId = useGeoStore((s) => s.selectedId);
  const setGroupEnabled = useGeoStore((s) => s.setGroupEnabled);
  const removeGroup = useGeoStore((s) => s.removeGroup);
  const replaceGroup = useGeoStore((s) => s.replaceGroup);
  const select = useGeoStore((s) => s.select);
  const radiusOverrides = useGeoStore((s) => s.radiusOverrides);
  const figureName = useGeoStore((s) => s.figureName);
  const setFigureName = useGeoStore((s) => s.setFigureName);
  const setRadius = useGeoStore((s) => s.setRadius);
  const seed = useGeoStore((s) => s.seed);
  const showMeasures = useGeoStore((s) => s.showMeasures);
  const setShowMeasures = useGeoStore((s) => s.setShowMeasures);
  const showCenters = useGeoStore((s) => s.showCenters);
  const setShowCenters = useGeoStore((s) => s.setShowCenters);
  const rename = useGeoStore((s) => s.rename);
  const nameCentre = useGeoStore((s) => s.nameCentre);
  const swap = useGeoStore((s) => s.swap);
  const hidden = useGeoStore((s) => s.hidden);
  const toggleHidden = useGeoStore((s) => s.toggleHidden);
  const segStyle = useGeoStore((s) => s.segStyle);
  const toggleSegHidden = useGeoStore((s) => s.toggleSegHidden);
  const toggleSegDashed = useGeoStore((s) => s.toggleSegDashed);
  const hiddenCircles = useGeoStore((s) => s.hiddenCircles);
  const toggleCircleHidden = useGeoStore((s) => s.toggleCircleHidden);
  const relations = useGeoStore((s) => s.relations);
  const valuesState = useGeoStore((s) => s.values);
  const viewValues = useGeoStore((s) => s.viewValues);
  // clearValues retired from the UI (B6-2d): the panel head hides the column; a fact change
  // stales the layer store-side, and the in-panel button re-pulls.
  const addQuery = useGeoStore((s) => s.addQuery);
  const removeQuery = useGeoStore((s) => s.removeQuery);
  const viewRelations = useGeoStore((s) => s.viewRelations);
  const clearRelations = useGeoStore((s) => s.clearRelations);
  const shapes = useGeoStore((s) => s.shapes);
  const crossings = useGeoStore((s) => s.crossings);
  const detectShapes = useGeoStore((s) => s.detectShapes);
  const clearShapes = useGeoStore((s) => s.clearShapes);
  const clear = useGeoStore((s) => s.clear);
  const loadFigure = useGeoStore((s) => s.loadFigure);

  // The STORE's undo/redo wrappers (E5/STO-5), not raw zundo: they also clear the dialed-radius
  // scratchpad, and the temporal state itself now carries facts + seed so the restored view matches.
  const undo = useGeoStore((s) => s.undo);
  const redo = useGeoStore((s) => s.redo);
  const executeMany = useGeoStore((s) => s.executeMany);
  const canUndo = useStore(useGeoStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useGeoStore.temporal, (s) => s.futureStates.length > 0);

  const [text, setText] = useState('');
  const [inputNote, setInputNote] = useState(''); // a problem message under the input (not-understood / built-nothing)
  const [queryText, setQueryText] = useState(''); // #477: the values-panel query box
  const [thinking, setThinking] = useState(false); // LLM fallback in flight (Phase 7)
  // Re-entry gate + abort for the submit pipeline (E3/STO-3). `busyRef` is the SYNCHRONOUS truth —
  // React state lags a render, so two rapid example-chip clicks could both enter `submit` and race
  // their dry-runs/commits; the ref blocks the second immediately. `llmAbortRef` lets the ~15 s
  // timeout or the student's cancel abort a hung proxy call instead of a permanent spinner.
  const busyRef = useRef(false);
  const llmAbortRef = useRef<AbortController | null>(null);
  const setBusy = (b: boolean) => {
    busyRef.current = b;
    setThinking(b);
  };
  const [resampling, setResampling] = useState(false);
  const [altProgress, setAltProgress] = useState(''); // "show another configuration" search in flight (synchronous; we paint a busy state first)
  const [analysing, setAnalysing] = useState(false); // "view relations" detection in flight (synchronous; paint a busy state first)
  const [computingValues, setComputingValues] = useState(false); // #217: the values panel compute in flight (worker-side)
  const [valueHl, setValueHl] = useState<[Id, Id][] | null>(null); // #217: the clicked value row's canvas highlight
  const [detecting, setDetecting] = useState(false); // "detect shapes" detection in flight (synchronous; paint a busy state first)
  const [openShape, setOpenShape] = useState<DetectedShape | null>(null); // the shape badge whose inline book-link card is open
  const [hoverShape, setHoverShape] = useState<DetectedShape | null>(null); // the shape badge being hovered (transient highlight preview)
  const [openSimilar, setOpenSimilar] = useState<SimilarClass | null>(null); // the similar/congruent-triangle row kept highlighted (click)
  const [hoverSimilar, setHoverSimilar] = useState<SimilarClass | null>(null); // the similar-triangle row being hovered (transient preview)
  const shapesRef = useRef<HTMLDivElement>(null); // the detected-shapes section — scrolled into view when it appears / a card opens
  const [llmDropped, setLlmDropped] = useState<string[]>([]); // LLM steps the engine couldn't build
  const [renameNote, setRenameNote] = useState(''); // why a relabel was a no-op (target taken / no such point)
  const [altNote, setAltNote] = useState(''); // transient: "show another configuration" found no different drawing
  const [fileNote, setFileNote] = useState(''); // transient: why a figure file couldn't be loaded (FR-HS-10)
  // Persistent ADR-242 load-audit findings (issue #24). Unlike `fileNote` (a one-shot string), the audit note
  // must live exactly as long as the rows it flags: it is DERIVED from these findings against the current
  // facts (a finding drops when its row is deleted / toggled off / ✎ re-lowered), so it self-clears without a
  // timer. `×` dismisses this load's note outright; a fresh load re-audits.
  const [fileAudit, setFileAudit] = useState<LoadAuditFinding[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null); // the hidden <input type=file> behind "load figure"
  const [manualOpen, setManualOpen] = useState(false); // the D9 manual SCREEN (B7) — catalog-backed
  const [aboutOpen, setAboutOpen] = useState(false); // the "מה זה?" intro modal (first load + reopenable)
  // examplesOpen retired (operator 2026-08-18): no example strip above the input — the examples
  // live on the clean canvas (QuickChips) and in עזרה.
  // B6-2d: the נתונים panel — permanent column on wide screens (content collapsible), the same
  // default as the complex/3-D panels. Opening it PULLS the values compute (#217's pull-only rule).
  const [showData, setShowData] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches,
  );
  // editingId/editText/editError retired with the shared FactList (B5-2d): the editor state is the
  // chrome's; commitEdit takes the text and answers with a boolean.
  const [showTheorems, setShowTheorems] = useState(false); // the live theorem feed (Phase 6a) — live in prod but OFF by default (operator 2026-07-07); the student opts in from תצוגה
  const [discoveryLevel, setDiscoveryLevel] = useState<DiscoveryLevel>(1); // the theorem discovery dial (ADR-219) — L1 Given by default
  const [theoremSel, setTheoremSel] = useState<TheoremId | null>(null); // the theorem row whose premise is highlighted on the canvas
  const [bgOpen, setBgOpen] = useState(false); // the collapsed "background theorems" family fold is expanded

  // The ADR-242 load-audit note, DERIVED from the persistent findings against the current facts (issue #24):
  // a finding drops the moment its row is deleted / toggled off / ✎ re-lowered, so the note self-clears — no
  // timer, no orphaned banner. Empty ⇒ nothing shown.
  const auditNote = useMemo(() => {
    const live = liveAuditFindings(facts, fileAudit);
    if (live.length === 0) return '';
    const rows = live
      .map((f) => `${f.step}. "${f.utterance}"${f.labels.length ? ` (${f.labels.join(', ')})` : ''}`)
      .join(' · ');
    return t('file.loadAudit', { steps: rows });
  }, [facts, fileAudit, t]);

  // Responsive canvas: the figure fills the space beside the sidebar (use the whole screen) instead
  // of a fixed box. A ResizeObserver feeds the measured size to <Figure>, which fits isotropically.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [exportFlash, setExportFlash] = useState<'' | 'ok' | 'err'>(''); // #742: feedback on the top-row copy button
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 600 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setCanvasSize({ w: Math.max(320, Math.floor(r.width)), h: Math.max(320, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Show the "what is this?" intro once, on a visitor's first load (persisted in
  // localStorage). It stays reopenable from the header button afterwards.
  useEffect(() => {
    try {
      if (!localStorage.getItem('geo_intro_seen')) setAboutOpen(true);
    } catch {
      /* private mode / no storage — just don't auto-open */
    }
  }, []);
  function dismissAbout() {
    setAboutOpen(false);
    try {
      localStorage.setItem('geo_intro_seen', '1');
    } catch {
      /* ignore */
    }
  }

  // Debug log (dev only): snapshot the fact list + per-fact status whenever the
  // figure changes (any submit / edit / delete / undo / clear / resample), so a
  // session can be reconstructed later from logs/debug-log.jsonl. Best-effort.
  // Gated on DEV at the SUBSCRIPTION (E1/STO-1): in production the `figure` event is
  // discarded by `logDebug` anyway, but the `replay` it ran first was real work on
  // every store change — and it also closes the SEC-7 note about prod figure payloads.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const snapshot = () => {
      const st = useGeoStore.getState();
      const { status, lastError } = replay(st.facts, st.seed);
      logDebug({
        kind: 'figure',
        seed: st.seed,
        lastError: lastError ?? null,
        facts: st.facts.map((f) => ({ id: f.id, group: f.group, enabled: f.enabled, utterance: f.utterance, cmd: f.cmd, status: status[f.id] })),
      });
    };
    snapshot(); // initial state (e.g. a restored session)
    return useGeoStore.subscribe((s, prev) => {
      if (s.facts !== prev.facts || s.seed !== prev.seed) snapshot();
    });
  }, []);

  // Symbol insertion is the SHARED palette's now (B4-2d, ADR-031's caret behaviour preserved by
  // shell/symbols.applySymbol — an empty selection lands the caret inside the template, and a
  // SELECTION wraps). The palette data lives in `ui/symbols.ts` (#482): a module can be asserted,
  // and the bidi CORE lock still guards every character it offers.
  const he = i18n.language === 'he';
  // A2 (#661): the switcher renders products.json's roster; labelKeys resolve in THIS product's
  // locales. In dev each product serves from its own entry html.
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
  /** The locale `canonicalText` renders in — the same normalisation the submit pipeline uses (#450). */
  const canonLocale: 'he' | 'en' = i18n.language?.startsWith('he') ? 'he' : 'en';

  // Base text direction for a mixed He/En string (geometry labels, numbers, and
  // operators are Latin/neutral even inside Hebrew). `dir="auto"` keys only off
  // the FIRST strong char, so a Hebrew phrase starting with a point label ("C
  // במרחק…") wrongly gets an LTR base and reorders into garbage. Decide by
  // content instead: any Hebrew letter ⇒ RTL base, else LTR.
  const textDir = (s: string): 'rtl' | 'ltr' => (/[֐-׿]/.test(s) ? 'rtl' : 'ltr');

  // Inline step editing: open the row as a text field pre-filled with its
  // phrasing, re-parse on confirm, and replace the whole step group in place
  // (ADR-015; a step may expand to several commands, e.g. an inscribed shape).
  // B5-2d: the editor is the SHARED FactList's (its internal state, Enter/Esc, stay-open-on-false).
  // This commit takes the edited text as a parameter and returns whether it was accepted — a
  // refusal keeps the editor open and says why through the aria-live input note.
  function commitEdit(key: string, editText: string): boolean {
    // Parse against the PREFIX context — the figure as it stands BEFORE the edited step — because the
    // replacement is spliced back at the step's original position and replayed there (ADR-015). The
    // end-state context lied: it contains points created by LATER steps (and by the old version of this
    // step), so context-sensitive lowering (M1 existing-id → constraint) chose a constraint form that is
    // wrong at the replay position — editing "AB קוטר"→"AC קוטר" saw the ⊥-step's C "existing" and
    // lowered to a bare collinearity, silently dropping the diameter's circle membership (ADR-241).
    const prefixCtx = () => {
      const facts = useGeoStore.getState().facts;
      const start = facts.findIndex((f) => groupKey(f) === key);
      const prefix = start >= 0 ? facts.slice(0, start) : facts;
      const before = replay(prefix);
      return buildParseCtx(before.construction, before.positions);
    };
    let ectx = prefixCtx();
    let r = parse(editText, ectx);
    // #186: an edit referencing a circle by a name that matches no circle binds an UNNAMED circle the
    // same way submit does (the prod session's «מעגל O!» → «מעגל O1» edit) — clarify when ambiguous.
    for (let guard = 0; r.ok && guard < 3; guard++) {
      const bind = impliedCircleBinding(r.commands, ectx);
      if (bind && 'clarify' in bind) {
        setInputNote(t('input.unknownCircle', { center: bind.center }));
        return false;
      }
      if (bind) {
        const res = nameCentre(bind.from, bind.to);
        if (!res.ok) break;
      } else {
        // #539: the POINT edition, mirroring submit — a fresh set-line label whose slot an auto-named
        // drawn point structurally occupies renames that point (auto-named judged over ALL facts, so a
        // label the student typed anywhere is never grabbed).
        const pbind = impliedPointBinding(r.commands, ectx, autoNamedLabels(useGeoStore.getState().facts));
        if (!pbind) break;
        const res = rename(pbind.from, pbind.to);
        if (!res.ok) break;
      }
      ectx = prefixCtx();
      r = parse(editText, ectx);
    }
    if (!r.ok || r.commands.length === 0) {
      setInputNote(t('steps.editRefused'));
      return false;
    }
    // #779 — the convention nudge holds on the EDIT seam too (a commit seam is a commit seam):
    // an edited step whose parse read a lowercase label refuses with the corrected sentence.
    const fold = lowercaseLabelFold(editText, r.commands);
    if (fold) {
      setInputNote(t('input.scope.lowercase-labels', { corrected: fold.corrected }));
      return false;
    }
    replaceGroup(key, r.commands, editText.trim());
    logDebug({ kind: 'action', action: 'edit', detail: `${key} → ${editText.trim()}` }); // #84: so a reported session replays edits
    setInputNote('');
    return true;
  }

  // The text → command[] path: the deterministic parser runs first; anything it
  // can't read escalates to the LLM proxy (Phase 7, ADR-023), which normalises
  // the freeform input into canonical lines we re-parse. The engine never knows
  // which path produced the commands.
  // Figure context for the parser: the circles' centres (resolve "the circle") and
  // the existing point ids (inscribing an existing triangle becomes its circumcircle).
  // The shared figure→parser context builder (single source of truth — App, scenarios, and the triage
  // harness all use it; the copies had drifted, ADR-171). Excludes ~scaffolding circles; supplies the
  // circle-members / neighbours / parallels / lines hints the grammar consumes.
  // (the submit pipeline builds its own parse context from the injected display view — S0.4)

  // ── save / load a figure file (FR-HS-10) ─────────────────────────────────
  // The file is the store's replay inputs (facts + seed + dialed radii) plus display preferences —
  // no positions (the figure is re-derived on load). See src/store/figureFile.ts.
  const saveFigure = () => {
    const st = useGeoStore.getState();
    // A NAMED figure (issue #42) asks overwrite-vs-copy (issue #121) instead of silently re-saving the
    // same name; an UNNAMED one prompts for a first name. A name typed in either dialog is adopted as the
    // figure's name (the field + page title pick it up).
    let name = st.figureName.trim();
    if (name) {
      const choice = chooseSaveName(
        name,
        () => window.confirm(t('file.overwriteOrCopy', { name })),
        () => window.prompt(t('file.copyNamePrompt'), name),
      );
      if (!choice) return; // overwrite declined + copy cancelled → abort the save
      name = choice.name;
      if (choice.adopt) setFigureName(choice.name);
    } else {
      name = (window.prompt(t('file.saveNamePrompt')) ?? '').trim();
      if (name) setFigureName(name);
    }
    const json = serializeFigure(
      {
        facts: st.facts,
        seed: st.seed,
        radiusOverrides: st.radiusOverrides,
        display: {
          hidden: st.hidden,
          segStyle: st.segStyle,
          hiddenCircles: st.hiddenCircles,
          showMeasures: st.showMeasures,
          showCenters: st.showCenters,
        },
        queries: st.queries, // #477: questions travel with the figure
      },
      { locale: i18n.language, savedAt: new Date().toISOString(), ...(name ? { name } : {}) },
    );
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    // The name (field or prompt) becomes the filename; the per-product -geo suffix is appended
    // automatically (issue #20). Empty/cancelled -> the date-stamped default, the pre-#20 behaviour.
    a.download = namedFigureFileName(name, new Date());
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── download the question as a .docx (FR-HS-11, ADR-251) ────────────────
  // Figure hands up the clean PNG (its own svgToPng export path); we pair it with
  // the verbatim enabled utterances and pack a Word document — deterministic, no
  // LLM (the low-tech cousin of FR-HS-9). The docx-heavy builder is dynamically
  // imported so the library stays out of the main chunk. Errors propagate back
  // to Figure's ✕ export flash.
  const saveQuestion = async (png: Blob) => {
    const { pngDimensions, questionDocxBlob, questionFileName } = await import('../shell/export/questionDoc');
    const lines = questionLines(useGeoStore.getState().facts, canonLocale);
    const data = new Uint8Array(await png.arrayBuffer());
    const blob = await questionDocxBlob({
      title: useGeoStore.getState().figureName.trim() || undefined,
      heading: t('questionDoc.given'),
      lines,
      png: { data, ...pngDimensions(data) },
      rtl: i18n.language !== 'en',
      // the SAME segmenter the step list renders through (#464/#465) — screen and paper cannot drift
      segments: bidiSegments,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = questionFileName(new Date());
    a.click();
    URL.revokeObjectURL(url);
  };

  // #742 / ADR-W-024: the image exports moved OUT of the canvas toolbar into the top tool row —
  // one export home in every builder. App queries the svg from its own canvas card (the 3-D
  // pattern) and rasterises via shell/export/svgToPng; the renderer no longer knows exports exist.
  const canvasSvg = () => canvasRef.current?.querySelector('svg') ?? null;
  const flashExport = (v: 'ok' | 'err') => {
    setExportFlash(v);
    window.setTimeout(() => setExportFlash(''), 1400);
  };
  const copyImageTop = async () => {
    const svg = canvasSvg();
    if (!svg) return;
    try {
      const blob = await svgToPng(svg);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashExport('ok');
    } catch {
      flashExport('err');
    }
  };
  const saveImageTop = async () => {
    const svg = canvasSvg();
    if (!svg) return;
    try {
      const blob = await svgToPng(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'figure.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      flashExport('err');
    }
  };
  const saveQuestionTop = async () => {
    const svg = canvasSvg();
    if (!svg) return;
    try {
      await saveQuestion(await svgToPng(svg, 2, QUESTION_IMAGE_WIDTH_PX));
    } catch {
      flashExport('err');
    }
  };

  const noteFileProblem = (key: string, vals?: Record<string, unknown>) => {
    setFileNote(t(key, vals));
    window.setTimeout(() => setFileNote(''), 6000);
  };

  // "Clear the session" spans two owners — the store (facts/figure) and this component's local UI state —
  // and the button used to invoke only the store half (issue #146), leaving the typed input text and every
  // transient note (input/file/rename/alt/LLM notes + any in-progress inline edit) behind, misrepresenting a
  // cleared session. clearAll resets BOTH: the store figure plus every session-scoped local field. Display /
  // help / fold PREFERENCES are deliberately left untouched — those are not session data.
  const clearAll = () => {
    logDebug({ kind: 'action', action: 'clear' }); // #189: so a reported session's replay can follow the wipe
    clear();
    setText('');
    setInputNote('');
    setFileNote('');
    setFileAudit([]);
    setRenameNote('');
    setAltNote('');
    setLlmDropped([]);
    // the FactList editor state is the chrome's own (B5-2d) — a clear needs no reset here
  };

  const loadFigureFile = async (f: File) => {
    const r = deserializeFigure(await f.text());
    if (!r.ok) {
      noteFileProblem(r.reason === 'newer-version' ? 'file.newerVersion' : 'file.badFile');
      return;
    }
    // Auto-re-lower the DETERMINISTIC steps against the current parser (ADR-232 Am. / issue #120): an old
    // save replays its saved lowering, so a parser/engine fix that landed since would otherwise never
    // reach it (the #119 K stayed misplaced on a pre-fix save). LLM steps stay byte-for-byte (no
    // re-escalation). Do it BEFORE the fold/replay so the refreshed facts are what loads.
    const { facts: refreshedFacts, refreshed } = refreshLoadedFigure(r.file.facts);
    r.file.facts = refreshedFacts;
    // #41 (ADR-290, + the #67 core): a saved heavy figure's ENTIRE load cost is one cold fold (27 s
    // measured on the #59 file) — compute it in the geometry WORKER behind the busy cue and transplant
    // it, so the smoke-replay below and the post-load render both run at tail speed on the main thread.
    setBusy(true);
    try {
      const fold = await geoWork.prefold(r.file.facts, r.file.seed);
      if (fold) primeFoldFor(r.file.facts, fold);
    } catch (err) {
      if (!isCancelled(err)) {
        setBusy(false);
        noteFileProblem('file.badFile'); // the worker replay threw — same refusal as the smoke-replay
        return;
      }
    }
    // Smoke-replay before committing: a file that makes the derivation THROW (not merely flag a fact)
    // must never become the session — refuse it instead of a white screen on the next render.
    try {
      replay(r.file.facts, r.file.seed, r.file.radiusOverrides);
    } catch {
      setBusy(false);
      noteFileProblem('file.badFile');
      return;
    } finally {
      setBusy(false);
    }
    loadFigure(r.file); // one undo restores the session that was open before
    setFigureName(figureNameFromFileName(f.name)); // the FILENAME names the figure (issue #42)
    setFileNote('');
    setFileAudit([]); // drop the prior load's audit before the new one (issue #24)
    // Honesty audit (ADR-242): the file replays its SAVED lowering (deterministic restore, ADR-232), so
    // a step whose stored commands dropped a stated label, or whose utterance the current parser reads
    // differently (a fix landed since the save), silently shows an outdated figure. Load still opens
    // exactly as saved — but the student is told which rows to re-read (✎ edit re-parses the step
    // against its prefix context, ADR-241). Persistent note (no 6 s auto-clear): it names a truth
    // problem, not a file-handling hiccup.
    // #572 (ADR-446): a LOADED figure that fails its requirements gets the SAME rescue the submit
    // path has — the search + the ADR-445 note were bound to the submit code path, not to the
    // "requirements-failing figure about to display" event, so the operator's saved collapse file
    // re-drew C-on-A on every load, silently. One undo still restores the pre-load session: the
    // resolve's applyView merges into the load's own history entry (temporal paused there).
    void resolveAfterCommit();
    const audit = auditLoadedFigure(r.file.facts);
    if (audit.findings.length > 0) {
      setFileAudit(audit.findings); // note is DERIVED from these against live facts (issue #24) — self-clears
    } else if (refreshed.length > 0) {
      // The save was from an older version and some steps were re-lowered to the current one (issue #120).
      // Route it through the auto-clearing lane (issue #147): a "refreshed" note is a transient
      // informational hiccup like the file refusals, not a persistent truth-audit — it inherits the
      // 6 s auto-clear instead of hanging forever with no dismissal path.
      noteFileProblem('file.loadRefreshed', { count: refreshed.length });
    }
  };

  // After a step commits OR a file loads, VERIFY the figure meets every requirement; if not,
  // auto-search alternative configurations (seeds + branches + the ADR-445 seat) for one that does
  // (ADR-106). The flow itself lives in src/app/resolveView.ts (#572/#573, ADR-446 — extracted per the
  // S0.4 testability precedent, and so the LOAD path runs the same rescue the submit path always had);
  // this wrapper binds the App's real deps. While the search is pending, `resolvePending` keeps the
  // LAST GOOD view on canvas (#573 — the ADR-293 keep-prior slot) instead of painting the failing one.
  const [resolvePending, setResolvePending] = useState(false);
  const resolveAfterCommit = async () => {
    setBusy(true);
    try {
      await runViewResolve({
        getState: () => useGeoStore.getState(),
        meetsRequirements,
        // #41 (ADR-290): the config search runs in the geometry WORKER — the main thread stays free.
        autoResolve: (facts, seed) => geoWork.autoResolve(facts, seed),
        applyView: (found) => {
          if (found.fold) primeFoldFor(found.facts, found.fold); // transplant — main replays at tail speed
          // the rewrite belongs to the SAME user action as the commit/load it follows — pause history
          // so it merges into that entry (E4/STO-4; one undo removes the whole action).
          const temporal = useGeoStore.temporal.getState();
          temporal.pause();
          try {
            useGeoStore.getState().applyView({ facts: found.facts, seed: found.seed });
          } finally {
            temporal.resume();
          }
        },
        setPending: setResolvePending,
        // #566 (ADR-445): an EXHAUSTED search is never silent — the figure stays (keep-prior forever
        // would hide a committed given); the note says the drawing could not honour everything at once.
        onExhausted: () => setInputNote(t('figure.noValidConfig')),
        isCancelled,
      });
    } finally {
      setBusy(false);
    }
  };

  // The submit orchestration lives in src/app/submitPipeline.ts (S0.4 of docs/24) — extracted so the
  // routing (store-ops / grammar / clarifications / honesty gates / dry-run / LLM second attempt) is
  // directly testable. This wrapper only binds the App's UI surface into the pipeline's deps.
  async function submit(utterance: string) {
    await runSubmit(utterance, {
      t: (key, opts) => t(key, opts) as string,
      locale: i18n.language?.startsWith('he') ? 'he' : 'en',
      ui: {
        setInputNote,
        setRenameNote,
        setLlmDropped,
        clearText: () => setText(''),
        setBusy,
      },
      view: () => ({ construction, positions }),
      isBusy: () => busyRef.current,
      nextPaint,
      resolveAfterCommit,
      llmAbortRef,
      explainError,
    });
  }

  // Figure + per-fact status are derived from the fact list.
  const derivedRaw = useMemo(() => replay(facts, seed, radiusOverrides), [facts, seed, radiusOverrides]);
  // #85 ([ADR-293](docs/06-decisions.md#adr-293)) — view-level keep-prior, the NEVER-BLANK principle: when
  // the current (facts, seed, overrides) state evaluates to NOTHING (positions empty) or to non-finite
  // coordinates (a NaN viewBox renders an empty canvas with every status green), the canvas keeps drawing
  // the LAST GOOD configuration — dimmed, with a stale notice — instead of going blank under the error
  // banner. A CLEAN empty state (fresh session / clear / all facts deselected: no error, no positions) is
  // legitimately empty and resets the fallback, so a ghost figure never outlives its facts.
  const lastGoodViewRef = useRef<ReturnType<typeof replay> | null>(null);
  const usable = viewUsable(derivedRaw);
  // #573 (ADR-446): while a config search is PENDING the freshly-derived view is known to fail its
  // requirements — do not paint it (the operator watched the C-on-A collapse for the whole ~5 s
  // search) and do not let it overwrite the keep-prior slot; the search's answer (the rescued view,
  // or the failing one WITH the ADR-445 note) is what paints. With no prior view (a load into a
  // fresh session) the raw view shows — there is nothing better to keep.
  if (usable && !resolvePending) lastGoodViewRef.current = derivedRaw;
  else if (derivedRaw.positions.size === 0 && derivedRaw.lastError === null) lastGoodViewRef.current = null;
  const viewStale = !usable && lastGoodViewRef.current !== null;
  const searchHold = resolvePending && lastGoodViewRef.current !== null;
  const display = searchHold || viewStale ? lastGoodViewRef.current! : derivedRaw;
  // GEOMETRY from the displayable state; STATUS/ERROR from the real current state (the step list and the
  // error banner must tell the truth about what just happened).
  const { construction, positions, circles, labels, angleMarks, violations, radiusDofs, coincidences } = display;
  const { status, lastError, pending } = derivedRaw;
  // #574 (ADR-447): the one seam turning an anonymous id into words the student can act on.
  const describePoint = (id: string): string => {
    const d = anonPointDescriptor(id, construction);
    return d ? (t(d.key, d.params) as string) : id;
  };

  // The "view relations" layer is shown only while its cached result still matches the CURRENT facts —
  // any fact change makes a new `facts` array (≠ the cached ref), so the layer auto-clears (ADR-134). Ground
  // truths are invariant across configurations, so it deliberately survives "show another configuration".
  const relationsLayer = relations && relations.facts === facts ? relations.result : null;
  // #444: the equalities the DRAWN named shape DECLARES — a separate channel from the discovered ones
  // (which pool across variants and so never report a variant-specific pair). Flattened to classes for
  // the canvas; the panel below keeps the shape labels so it can explain WHERE they come from.
  const statedEq = relations && relations.facts === facts ? relations.stated : null;
  const statedClasses: [Id, Id][][] = statedEq ? statedEq.flatMap((s0) => s0.classes) : [];
  const valuesLayer = valuesState && valuesState.facts === facts ? valuesState.result : null;

  // The "detect shapes" badge layer — same facts-keyed cache contract as the relations layer above.
  const shapesLayer = shapes && shapes.facts === facts ? shapes.result : null;

  // Highlight the shape under the cursor (hover) or the one whose card is open: its vertices (dots) and,
  // for a circle, the circle itself. Reuses the canvas `highlight` set, so it overrides the fact-selection
  // highlight while a shape is active. Cleared when the layer clears. The boundary EDGES are highlighted
  // separately as point-pairs (`shapeHighlightEdges`) so a sub-segment through a crossing lights up too.
  const shapeHighlight = useMemo(() => {
    const sh = shapesLayer ? (hoverShape ?? openShape) : null;
    const sim = shapesLayer ? (hoverSimilar ?? openSimilar) : null;
    if (!sh && !sim) return undefined;
    const ids = new Set<string>(sh ? sh.vertices : []);
    if (sh?.type === 'circle') for (const o of construction.objects) if (o.kind === 'circle' && o.center === sh.vertices[0]) ids.add(o.id);
    if (sim) for (const tri of sim.triangles) for (const v of tri) ids.add(v); // a similar-class row lights its member triangles
    return ids;
  }, [shapesLayer, hoverShape, openShape, hoverSimilar, openSimilar, construction]);

  // The active shape's boundary edges as point-PAIRS (consecutive vertices, wrapping). The renderer strokes
  // each between its endpoints' positions, so an edge that is only a PORTION of a longer drawn segment
  // (e.g. G–C ⊂ EC, with no object of its own) is highlighted — the ADR-167-Am. fix for "CDG segments not
  // highlighted correctly". A circle shape has no boundary edges.
  const shapeHighlightEdges = useMemo<[Id, Id][] | undefined>(() => {
    const sh = shapesLayer ? (hoverShape ?? openShape) : null;
    const sim = shapesLayer ? (hoverSimilar ?? openSimilar) : null;
    const edges: [Id, Id][] = [];
    if (sh && sh.type !== 'circle' && sh.vertices.length >= 2) {
      const v = sh.vertices;
      for (let i = 0; i < v.length; i++) edges.push([v[i], v[(i + 1) % v.length]]);
    }
    if (sim) for (const tri of sim.triangles) for (let i = 0; i < 3; i++) edges.push([tri[i], tri[(i + 1) % 3]]);
    return edges.length ? edges : undefined;
  }, [shapesLayer, hoverShape, openShape, hoverSimilar, openSimilar]);

  // The LIVE theorem feed (Phase 6a): the bagrut theorems the student's STATED givens *announce*,
  // re-derived from scratch each step (coordinate-free — plan §7.5, so it can run live, unlike the
  // sampled relations/shapes layers). Emergent-shape triggers ride the "detect shapes" layer when it
  // is on — an emergent rhombus surfaces its theorems once shapes are detected. Attribution/●-new and
  // headline-vs-background ordering come from `detectTheorems`.
  // The PRINCIPLES lane (T5, ADR-248) — the operator-authored teacher tips ("whenever X is given,
  // think about Y"), with intent archetypes as a boosting subspecies: the top active principles lift
  // their `boosts` ids to band 0 in the theorem feed.
  const principleFeed = useMemo(
    () => (THEOREMS_SURFACE ? detectPrinciples({ facts, construction, shapes: shapesLayer?.shapes }) : []),
    [facts, construction, shapesLayer],
  );
  const theoremFeed = useMemo(
    () =>
      !THEOREMS_SURFACE ? [] :
      detectTheorems({
        facts,
        construction,
        shapes: shapesLayer?.shapes,
        // The OBSERVED lane (T4): what the sampled layers noticed — similar/congruent classes and
        // forced relations — feeds the L3 evidence paths. Both ride the store's shared budgeted
        // sample core; when a layer hasn't run, its observed paths simply stay silent.
        observed: { relations: relationsLayer ?? undefined, similar: shapesLayer?.similar },
        boosts: activeBoosts(principleFeed),
      }),
    [facts, construction, shapesLayer, relationsLayer, principleFeed],
  );
  // The discovery dial (ADR-219): show only entries whose evidence is at or below the selected level —
  // L1 Given / L2 Implied (+ construction entailments) / L3 Observed (+ what the coordinates reveal).
  // `detectTheorems` stays level-complete; filtering lives here at the presentation layer.
  const visibleTheorems = useMemo(
    () => theoremFeed.filter((e) => e.level <= discoveryLevel),
    [theoremFeed, discoveryLevel],
  );
  // The FR-TH-6 display cap (T3): at most ~7 visible headline rows before an expandable fold —
  // bands 0-1 (intent-aligned / new+pointed) are never capped. `visibleFeed` is the shared, tested
  // contract (the corpus flood budgets assert the same function).
  const { visible: headlineTheorems, folded: foldedTheorems } = useMemo(() => visibleFeed(visibleTheorems), [visibleTheorems]);
  const [moreOpen, setMoreOpen] = useState(false);
  // Background theorems collapse into per-family fold rows (plan §5) — present but never noise.
  const backgroundFamilies = useMemo(() => {
    const by = new Map<TheoremFeedEntry['family'], TheoremFeedEntry[]>();
    for (const e of visibleTheorems) if (e.salience === 'background') (by.get(e.family) ?? by.set(e.family, []).get(e.family)!).push(e);
    return [...by.entries()];
  }, [visibleTheorems]);
  const backgroundCount = useMemo(() => visibleTheorems.filter((e) => e.salience === 'background').length, [visibleTheorems]);



  // The premise objects of the SELECTED theorem row — highlighted on the canvas (NEVER conclusion
  // objects, plan §2). Takes precedence over the shape/fact highlight while a theorem row is picked.
  const theoremHighlight = useMemo(() => {
    if (theoremSel === null) return undefined;
    const e = theoremFeed.find((x) => x.id === theoremSel);
    return e && e.triggerObjectIds.length ? new Set<string>(e.triggerObjectIds) : undefined;
  }, [theoremSel, theoremFeed]);

  // Snap-to-intersection: a clicked crossing becomes a real named point. Pick the
  // first free single capital letter, then create it via the same command path.
  function markIntersection(x: Crossing) {
    const used = new Set(construction.objects.filter(isGeoPoint).map((o) => o.id));
    let id = '';
    for (let k = 0; k < 26; k++) {
      const ch = String.fromCharCode(65 + k);
      if (!used.has(ch)) {
        id = ch;
        break;
      }
    }
    if (!id) return; // A–Z all taken (won't happen in practice)
    // The lowering itself lives in `crossingCommands` (ADR-379) — one seam, shared with the tests.
    const operands = x.line1 ? `${x.line1} ${he ? 'ו-' : 'and '}${x.c}${x.d}` : `${x.a}${x.b} ${he ? 'ו-' : 'and '}${x.c}${x.d}`;
    const utterance = he ? `${id} = חיתוך ${operands}` : `${id} = intersection of ${operands}`;
    executeMany(crossingCommands(x, id), utterance);
  }

  // Highlight every object introduced by the selected step (all its commands).
  const highlight = useMemo(() => {
    const inGroup = facts.filter((x) => groupKey(x) === selectedId);
    return inGroup.length ? new Set(inGroup.flatMap((x) => introducedIds(x.cmd))) : undefined;
  }, [facts, selectedId]);

  // #39: the COMPUTED VALUE of the selected step's size/ratio given, measured on the current drawing — so
  // the student can SEE that `S(DBCA)/S(GAD)=15` was actually enforced (a green figure already means it holds;
  // this shows the numbers). Read-only over the coordinates; null for steps that carry no measurable given.
  const selectedReadout = useMemo(() => {
    if (!selectedId) return null;
    const groupCmds = facts.filter((x) => groupKey(x) === selectedId).map((x) => x.cmd);
    const allEnabled = facts.filter((x) => x.enabled).map((x) => x.cmd);
    return readoutForGroup(groupCmds, allEnabled, positions);
  }, [facts, selectedId, positions]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const hiddenCircleSet = useMemo(() => new Set(hiddenCircles), [hiddenCircles]);

  // Collapse the flat fact list into step rows: all commands from one submission
  // (same group) become one row, so an inscribed shape isn't shown as 6 rows.
  const groups = useMemo(() => {
    const out: { key: string; facts: Fact[] }[] = [];
    for (const f of facts) {
      const key = groupKey(f);
      const last = out[out.length - 1];
      if (last && last.key === key) last.facts.push(f);
      else out.push({ key, facts: [f] });
    }
    return out;
  }, [facts]);

  // The crossing-dot affordance is always on, so its forcedness verdict (#228) recomputes after EVERY fact
  // change rather than behind a toggle. Async by design (ADR-380): the figure paints at once and the dots
  // resolve a beat later, off the main thread's critical path — the alternative, sampling synchronously on
  // submit, is exactly the freeze issue #157 is about.
  useEffect(() => {
    void useGeoStore.getState().detectCrossings();
  }, [facts]);

  // The dir/lang flip is the FRAME's (B3-2d): one language toggle, one direction effect, in the
  // one component every builder mounts — the product copy retired like 3-D's and complex's did.

  // When the shapes are detected, or a badge's book-link card opens, bring that section into view within the
  // scrollable control column — so the badges + link are visible without the student hunting/scrolling (the
  // canvas stays put because the column scrolls internally, not the page).
  useEffect(() => {
    if (shapesLayer && (shapesLayer.shapes.length > 0 || openShape)) {
      shapesRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [shapesLayer, openShape]);

  // Discovery level 3 (Observed, ADR-219) surfaces theorems whose premise only the evaluated coordinates
  // reveal — those matchers read the emergent detected shapes. So whenever L3 is active and the shape
  // layer is stale (a new fact clears it, since it's keyed on `facts`), auto-run the detection to keep the
  // observed-level feed live. The sweep runs in the geometry worker (#157 / ADR-401), so the busy state
  // just brackets the await; the guards make it fire once per staleness (detecting-true short-circuits,
  // then shapesLayer-truthy short-circuits).
  useEffect(() => {
    if (discoveryLevel !== 3 || shapesLayer || detecting || facts.length === 0) return;
    setDetecting(true);
    void detectShapes().finally(() => setDetecting(false));
  }, [discoveryLevel, shapesLayer, detecting, facts, detectShapes]);

  // The first point with an unshown discrete solution to step to — circle∩circle, line∩circle,
  // arc-midpoint, or a driven on-segment point (the kinds `cycleAlt` can step). A two-circle figure
  // has BOTH crossings on screen (A=branch 0, B=branch 1), so cycling would only collide them —
  // `firstCyclableBranch` excludes it and "show another configuration" resamples the circles
  // instead. With no cyclable branch, it re-samples the free DOFs. (Single source of truth, ADR-043.)
  const branchId = firstCyclableBranch(construction);
  // A kite/isosceles whose equal-pair is a cyclable VARIANT (ADR-138) — so "show another configuration"
  // offers to flip which sides are equal even when the shape is otherwise determined.
  const hasVariant = facts.some((f) => f.enabled && f.cmd.type === 'shape-variant' && VARIANT_COUNT[f.cmd.shape] > 1);
  // #751 (ADR-W-029): the chips submit what they show, so what they hold must be the RAW command.
  // `postProcess: []` asks i18next for the value BEFORE the bidi-isolate post-processor; the chip
  // re-applies isolation for DISPLAY only. Without this the fact list, the saved file, the prod log
  // and the .docx all received U+2066/U+2069.
  const examples = t('examples.items', { returnObjects: true, postProcess: [] }) as string[];

  // One theorem-feed row: a tier dot (green certain / amber possible), the statement in the current
  // locale, and a ● "new this step" badge. Clicking toggles the premise highlight on the canvas.
  const theoremButton = (e: TheoremFeedEntry) => {
    const active = theoremSel === e.id;
    // The row tooltip carries the T3 rankTrace (row-by-row explainability, docs/18 §5 — "this is
    // first BECAUSE…"); a subsumption-DEMOTED row is muted and labelled "covered by #X" (D6).
    const demoted = e.band === 5;
    return (
      <button
        key={e.id}
        type="button"
        style={active ? theoremRowOn : demoted ? { ...theoremRow, opacity: 0.55 } : theoremRow}
        title={`${t('theorems.highlightHint')}\n${e.rankTrace}`}
        onClick={() => setTheoremSel(active ? null : e.id)}
      >
        <span style={tierDot(e.tier)} aria-hidden />
        <span style={{ flex: 1, textAlign: he ? 'right' : 'left' }}>
          {/* The L3 "hint dress" (T4, docs/18 §7): an OBSERVED entry is the tool noticing for you —
              a 💡-tinted "seen in the drawing:" prefix makes that legible. */}
          {e.level === 3 && <span style={{ color: '#b45309', fontSize: 11 }}>💡 {t('theorems.observedPrefix')} </span>}
          {he ? e.he : e.en}
          {demoted && e.demotedBy !== undefined && (
            <span style={{ fontSize: 10, color: '#94a3b8', marginInlineStart: 6 }}>{t('theorems.coveredBy', { id: e.demotedBy })}</span>
          )}
        </span>
        {e.isNew && <span style={newBadge}>{t('theorems.new')}</span>}
      </button>
    );
  };

  // The command reference graduated into the MANUAL screen (B7, D9) — the catalog (the coverage
  // map) renders through shell/ManualScreen below; the help modal and its tabs retired.

  // "Show another configuration" — lifted out of the JSX (B6-2d moves the button under the canvas,
  // D7). #41 (ADR-290): the seed search runs in the geometry WORKER; ADR-340 (#175): the search
  // returns the whole COMPOSITE view, applied as ONE undo-tracked transition.
  const runResample = async () => {
    if (resampling) return;
    setResampling(true);
    try {
      const st = useGeoStore.getState();
      const found = await geoWork.resample(st.facts, st.seed, (k, n) => setAltProgress(`${k}/${n}`));
      const changed = found !== null;
      if (changed) useGeoStore.getState().applyView(found!);
      logDebug({ kind: 'action', action: 'show-another', detail: `seed=${changed ? found!.seed : st.seed}`, result: changed ? 'changed' : 'only-config' }); // #84
      if (changed) setAltNote('');
      else {
        // searched and found nothing different — tell the student something DID happen (the
        // figure is determined), so "show another" doesn't look like a dead button (operator).
        setAltNote(t('actions.onlyConfig'));
        window.setTimeout(() => setAltNote(''), 4000);
      }
    } catch (err) {
      if (!isCancelled(err)) throw err; // cancelled: quiet — the student chose to stop
    } finally {
      setResampling(false);
      setAltProgress('');
    }
  };

  // The About content, composed ONCE: the frame's About modal shows it (suite chrome), and the
  // first-load intro modal below shows the same node (2-D pedagogy: auto-opens for a new student,
  // dismiss persisted). The old footer's contact line lives here now — the footer retired with the
  // frame adoption, like 3-D's did in B3.
  const aboutBody = (
    <>
      <p style={{ marginTop: 0 }}>{t('about.lead')}</p>
      <ul style={{ margin: '8px 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(t('about.points', { returnObjects: true }) as string[]).map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div style={{ fontWeight: 600, marginTop: 12 }}>{t('about.tryTitle')}</div>
      <ol style={{ margin: '6px 0 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(t('about.trySteps', { returnObjects: true }) as string[]).map((s) => (
          <li key={s} dir={textDir(s)} style={{ fontSize: 13, color: pal.primaryInk }}>
            {s}
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: pal.muted }}>
        {t('footer.by')} <strong style={{ color: '#334155' }}>{t('footer.name')}</strong> · {t('footer.contact')}:{' '}
        <a href="mailto:david.codish@gmail.com" style={{ color: '#2563eb', textDecoration: 'none' }}>
          david.codish@gmail.com
        </a>
      </p>
    </>
  );

  return (
    /* B3-2d (#668): the LAST product adopts the shared frame — suite bar (switcher, language,
       About), tool row (title + session actions), one look across the builders. The product's
       header, its own language toggle, its dir effect and its footer all retire here. */
    <AppFrame
      title={t('app.title')}
      subtitle={t('app.subtitle')}
      utilityActions={
        /* שמור/טען FIRST so they sit at the same position as in every other builder (the
           operator's parity ruling); the product's extra עזרה rides after them. */
        <>
          <ToolButton onClick={saveFigure} disabled={facts.length === 0}>
            💾 {t('file.save')}
          </ToolButton>
          <ToolButton onClick={() => fileInputRef.current?.click()}>📂 {t('file.load')}</ToolButton>
          {/* #742 / ADR-W-024: the image exports live HERE in every builder — one home (they sat
              on the 2-D canvas toolbar while 3-D had them up here; that drift is the defect). */}
          <ToolButton onClick={() => void copyImageTop()} disabled={facts.length === 0}>
            {exportFlash === 'ok' ? `✓ ${t('canvas.copied')}` : exportFlash === 'err' ? '✕' : `⧉ ${t('canvas.copyImage')}`}
          </ToolButton>
          <ToolButton onClick={() => void saveImageTop()} disabled={facts.length === 0}>
            ⤓ {t('canvas.saveImage')}
          </ToolButton>
          <ToolButton onClick={() => void saveQuestionTop()} disabled={questionLines(facts, canonLocale).length === 0}>
            ⤓ {t('canvas.saveQuestion')}
          </ToolButton>
          <ToolButton onClick={() => setManualOpen(true)}>{t('manualButton')}</ToolButton>
        </>
      }
      roster={roster}
      activeProductId="2d"
      switcherLabel={t('switcherAria')}
      about={{
        label: t('header.about'),
        title: t('about.title'),
        body: aboutBody,
        privacy: t('about.privacy'),
        closeLabel: t('about.close'),
      }}
      buildStamp={typeof __BUILD__ !== 'undefined' ? __BUILD__ : undefined}
    >
      {/* THE WORKBENCH (#734): the three-zone GEOMETRY is the shell's — identical columns, canvas
          card and empty-state placement in every builder; this product passes zone content only. */}
      <Workbench
        emptyOverlay={
          facts.length === 0 ? (
            <QuickChips
              title={t('canvas.emptyTitle')}
              hint={t('canvas.emptyHint')}
              commands={examples.slice(0, 4)}
              display={isolateLtrRuns}
              onPick={(c) => submit(c)}
            />
          ) : undefined
        }
        canvasZone={<>
        {/* The figure's NAME, centered above the drawing it names — the SHARED component (one look
            in every builder). It lived inline in the retired header. */}
        <FigureName value={figureName} onChange={setFigureName} placeholder={t('file.namePlaceholder')} />
        <div ref={canvasRef} style={{ ...canvasWrap, ...(viewStale || searchHold ? { opacity: 0.55 } : {}) }}>
          {/* #580 (ADR-449): the two notices split by purpose. SEARCHING is a transient state that
              explains why the whole canvas is dimmed and about to change — a centred banner the
              student cannot miss. STALE is a persistent warning and deliberately keeps the quiet
              ADR-293 corner slot. `left` (physical) centres identically in RTL and LTR. */}
          {searchHold ? (
            <div
              role="note"
              style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', zIndex: 5, maxWidth: '85%', textAlign: 'center', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '10px 18px', fontSize: 15, fontWeight: 600, color: '#92400e' }}
            >
              {t('view.searching')}
            </div>
          ) : viewStale ? (
            <div
              role="note"
              style={{ position: 'absolute', top: 8, insetInlineStart: 8, zIndex: 5, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#92400e' }}
            >
              {t('view.stale')}
            </div>
          ) : null}
          <Figure
            construction={construction}
            positions={positions}
            circles={circles}
            width={canvasSize.w}
            height={canvasSize.h}
            highlight={theoremHighlight ?? shapeHighlight ?? highlight}
            highlightEdges={theoremHighlight ? undefined : (shapeHighlightEdges ?? valueHl ?? undefined)}
            onPickIntersection={markIntersection}
            forcedCrossings={crossings?.facts === facts ? crossings.forced : undefined}
            intersectionLabel={t('actions.markIntersection')}
            onPromotePoint={(id) => useGeoStore.getState().promote(id)}
            promoteLabel={t('actions.promotePoint')}
            labels={labels}
            angleMarks={angleMarks}
            relations={relationsLayer}
            statedEqual={statedClasses}
            showMeasures={showMeasures}
            showCenters={showCenters}
            hidden={hiddenSet}
            onRename={rename}
            onToggleHidden={toggleHidden}
            pointMenuText={{
              rename: t('pointMenu.rename'),
              hide: t('pointMenu.hide'),
              show: t('pointMenu.show'),
              apply: t('pointMenu.apply'),
              taken: t('pointMenu.taken'),
              bad: t('pointMenu.bad'),
            }}
            segStyle={segStyle}
            onToggleSegHidden={toggleSegHidden}
            onToggleSegDashed={toggleSegDashed}
            onSwap={swap}
            segMenuText={{
              hide: t('segMenu.hide'),
              show: t('segMenu.show'),
              dashed: t('segMenu.dashed'),
              solid: t('segMenu.solid'),
              swap: t('segMenu.swap'),
            }}
            hiddenCircles={hiddenCircleSet}
            onToggleCircleHidden={toggleCircleHidden}
            circleMenuText={{ hide: t('segMenu.hide'), show: t('segMenu.show') }}
            toolbarText={{
              rotate90: t('canvas.rotate90'),
              rotate180: t('canvas.rotate180'),
              flipH: t('canvas.flipH'),
              flipV: t('canvas.flipV'),
              rotate: t('canvas.rotate'),
              transform: t('canvas.transform'),
              alignSeg: t('canvas.alignSeg'),
              reset: t('canvas.reset'),
            }}
          />
          {/* Empty canvas → a call to action so a new user knows what to do. The
              container ignores pointer events (so panning isn't blocked); the
              example buttons re-enable them. */}
          {/* the empty-state chips render through the WORKBENCH's one overlay slot (#734) */}
          {/* Why a figure file couldn't be loaded (FR-HS-10) — shown right under the toolbar's "load from
              file" button. `fileNote` is a transient problem/refreshed message; `auditNote` is the ADR-242
              honesty audit DERIVED from live facts (issue #24), so it self-clears when its rows are fixed
              and carries a × to dismiss this load's note outright. */}
          {(fileNote || auditNote) && (
            <div
              style={{
                position: 'absolute',
                top: 48,
                insetInlineEnd: 8,
                maxWidth: 260,
                padding: '6px 10px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: 12,
                zIndex: 5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <span style={{ flex: 1 }}>{fileNote || auditNote}</span>
              {!fileNote && auditNote && (
                <button
                  type="button"
                  onClick={() => setFileAudit([])}
                  aria-label={t('file.dismissAudit')}
                  title={t('file.dismissAudit')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#991b1b',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>

        {/* LEVEL 3 — figure actions UNDER the canvas (D7, B6-2d): things done TO the figure, the
            same zone as in the other builders. «הציגו תצורה אחרת» keeps its prominence (operator:
            it "looks nice" — the look moves with it). */}
        {/* #742: the row renders ALWAYS — buttons disable, never hide (operator ruling; the row
            vanished on an empty canvas here while the other builders kept theirs). */}
        {(
          <div style={figureActions}>
            {(() => {
              const canCycle = facts.length > 0 && (branchId || hasVariant || freeDofs(construction).length > 0);
              return (
                <button
                  type="button"
                  style={!canCycle || resampling ? rowAccentOffStyle : alt}
                  disabled={!canCycle || resampling}
                  title={t('actions.anotherHint')}
                  onClick={() => void runResample()}
                >
                  {resampling ? t('input.loading') : t('actions.another')}
                </button>
              );
            })()}
            {resampling && (
              <span style={{ fontSize: 12, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {altProgress && <span>({altProgress})</span>}
                {/* #41: real preemption — terminate the worker; the in-flight promise rejects {cancelled} */}
                <button
                  type="button"
                  onClick={() => cancelGeoWork()}
                  title={t('actions.cancelSearch')}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: '16px', padding: '0 6px' }}
                >
                  ✕
                </button>
              </span>
            )}
            {altNote && <span style={{ fontSize: 12, color: '#64748b' }}>{altNote}</span>}
            {/* #738 — the relations/shapes buttons moved INTO the נתונים panel (operator: the row
                should match the other tools, which have no such buttons here at all). */}
            <span style={{ flex: 1 }} />
            <button type="button" style={canUndo ? subtleBtn : subtleBtnOff} disabled={!canUndo} onClick={() => { logDebug({ kind: 'action', action: 'undo' }); undo(); }}>{t('actions.undo')}</button>
            <button type="button" style={canRedo ? subtleBtn : subtleBtnOff} disabled={!canRedo} onClick={() => { logDebug({ kind: 'action', action: 'redo' }); redo(); }}>{t('actions.redo')}</button>
            <button type="button" style={facts.length > 0 ? { ...subtleBtn, color: rowDangerInk } : subtleBtnOff} disabled={facts.length === 0} onClick={clearAll}>{t('actions.clear')}</button>
          </div>
        )}
        {/* #738 — the display checkboxes moved INTO the נתונים panel with the analysis buttons
            (operator: "the same would be for the checkboxes... it doesn't belong at the bottom").
            The under-canvas row now carries exactly what every tool has. */}
        </>}
        inputZone={<>
          {/* B4-2d (#729): the SHARED InputArea — the box, submit, wrap-selection palette, live
              preview and quick strip exist ONCE in shell/; this product passes its content. The
              maths preview (#77 Am. / #40: √(2/3) shows a radical OVER the fraction while typing)
              rides the shared preview seam as a rendered node; box and preview direction follow
              the CONTENT via textDir (#118 / ADR-312 — dir="auto" keys off the first strong
              character and «AB שווה…» would scramble). The caret-template symbols became
              before/after WRAPS (select ABC, press S_{} → S_{ABC}). */}
          <div style={sideCard}>
            <InputArea
              value={text}
              onChange={(next) => {
                setText(next);
                if (inputNote) setInputNote('');
                if (llmDropped.length) setLlmDropped([]);
                if (renameNote) setRenameNote('');
              }}
              onSubmit={() => {
                if (text.trim() && !thinking) submit(text);
              }}
              placeholder={t('input.placeholder')}
              submitLabel={t('input.send')}
              busy={thinking}
              busyLabel={t('input.loading')}
              symbols={SYMBOL_SPECS}
              preview={(s) => (hasMath(s) ? <MathText text={s} /> : null)}
              previewDir={(s) => textDir(s)}
              boxDir={(s) => textDir(s)}
            >
            {/* No example strip above the box (operator ruling 2026-08-18: "expensive screen
                space"): the examples live on the CLEAN CANVAS (QuickChips) and in עזרה. */}
            {thinking && <span style={{ fontSize: 12, color: '#2563eb' }}>{t('input.loading')}</span>}
            {thinking && llmAbortRef.current && (
              <button
                type="button"
                style={{ fontSize: 12, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => llmAbortRef.current?.abort()}
              >
                {t('input.cancel')}
              </button>
            )}
            {/* role="status" / aria-live (F6): a screen-reader student must HEAR that a step failed or
                was partial — these appear after the submit completes, outside their focus. */}
            {inputNote && <span role="status" aria-live="polite" style={{ fontSize: 12, color: '#b45309' }} dir={textDir(inputNote)}>{inputNote}</span>}
            {renameNote && <span role="status" aria-live="polite" style={{ fontSize: 12, color: '#b45309' }} dir={textDir(renameNote)}>{renameNote}</span>}
            {llmDropped.length > 0 && (
              <span role="status" aria-live="polite" style={{ fontSize: 12, color: '#b45309' }} dir={textDir(llmDropped[0])}>
                {t('input.partial')}: {llmDropped.join('; ')}
              </span>
            )}

            </InputArea>
          </div>

          {lastError && <div role="status" aria-live="polite" style={errorBanner}>⚠ {explainError(lastError)}</div>}

          {pending && <div role="status" aria-live="polite" style={infoBanner}>ⓘ {t('figure.pending')}</div>}

          {visibleCoincidences(coincidences).length > 0 && (
            <div style={infoBanner}>
              {/* #581 (ADR-447 Am. 1, operator ruling): a pair with a machinery-minted member is not
                  shown at all — the notice explains why two points the STUDENT KNOWS merged. What
                  remains is student-named, so `describePoint` is a no-op here today; it stays as the
                  ADR-447 seam should a described anonymous pair ever be ruled back in. */}
              ⓘ {visibleCoincidences(coincidences).map(([a, b]) => t('figure.converge', { a: describePoint(a), b: describePoint(b) })).join(' ')}
            </div>
          )}

          {violations.length > 0 && (
            <div role="status" aria-live="polite" style={warnBanner}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ {t('figure.mismatch')}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {violations.map((v) => (
                  // The verifier's `figure.v.constraint` embeds a `describeConstraint` fragment in its
                  // `desc` param, so it needs the same vocabulary pass as the error banner (#413) —
                  // otherwise an amber notice says «… collinear אינו מתקיים בציור».
                  <li key={`${v.relation}-${v.ids.join('-')}`}>{t(v.messageKey, translateParams(v.params, t))}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={sideCard}>
            {/* Card header: title, the figure's remaining freedom as a compact pill (was a loose
                line floating between buttons), and undo/redo/clear as small in-context utilities
                (they act on the step list, so they live with it — and vanish on an empty session). */}
            {/* B6-2d: the DOF pill moved to the panel's status line (its generic home), and
                undo/redo/clear moved under the canvas (D7) — the header keeps the title only. */}
            <div style={sectionLabel}>{t('steps.title')}</div>
            {facts.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{t('steps.empty')}</p>
            ) : (
              <>
              {/* What the status marks mean — shown only when some row ISN'T a plain ✓ (an
                  all-green list needs no legend). */}
              {facts.some((f) => !f.enabled || (status[f.id] && status[f.id] !== 'ok')) && (
                <div style={legend}>
                  <span><span style={{ color: '#16a34a' }}>✓</span> {t('steps.statusOk')}</span>
                  <span><span style={{ color: '#dc2626' }}>✗</span> {t('steps.statusBroken')}</span>
                  <span><span style={{ color: '#94a3b8' }}>○</span> {t('steps.statusOff')}</span>
                </div>
              )}
              {/* B5-2d (#729): the SHARED fact-list chrome — row cards, mute checkbox, ✎ edit
                  (FactList's internal editor: Enter commits, Esc cancels, a refusal keeps it open
                  with the aria-live note saying why), ✕ delete — one look in every builder. The
                  row CONTENT stays this product's: the tri-state mark, the CANONICAL label
                  (ADR-428 obligation 3 / #450: the row shows what the tool UNDERSTOOD, rendered
                  from the group's commands; the editor is seeded with the same canonical text,
                  safe by the round-trip lock), the selected row's broken-reason (F6) and measured
                  readout (#39). */}
              <FactList
                testId="step-list"
                editDir={(s) => textDir(s)}
                rows={groups.map((g) => {
                  const anyOn = g.facts.some((f) => f.enabled);
                  const brokenFact = g.facts.find((f) => f.enabled && status[f.id] !== 'ok');
                  const state = !anyOn ? 'disabled' : brokenFact ? 'broken' : 'ok';
                  const errText = brokenFact ? explainError(status[brokenFact.id] as string) : undefined;
                  const label = stepLabel(g.facts.map((f) => f.cmd), g.facts[0].utterance, canonLocale);
                  return {
                    id: g.key,
                    disabled: !anyOn,
                    selected: g.key === selectedId,
                    content: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>
                          {state === 'ok' ? <span style={{ color: '#16a34a' }}>✓</span> : state === 'broken' ? <span style={{ color: '#dc2626' }}>✗</span> : <span style={{ color: '#94a3b8' }}>○</span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <button type="button" style={factLabel(state)} onClick={() => select(g.key)} dir={textDir(label)} title={state === 'broken' ? errText : undefined}>
                            {hasMath(label) ? <MathText text={label} /> : label}
                          </button>
                          {state === 'broken' && errText && g.key === selectedId && (
                            <span style={{ fontSize: 11, color: '#dc2626', paddingInlineStart: 6 }} dir={textDir(errText)}>
                              {errText}
                            </span>
                          )}
                          {state === 'ok' && g.key === selectedId && selectedReadout && (
                            <span style={{ fontSize: 11, paddingInlineStart: 6, direction: 'ltr', unicodeBidi: 'isolate' }}>
                              {selectedReadout.measured.length > 0 && (
                                <span style={{ color: '#64748b' }}>
                                  {selectedReadout.measured.map((m) => `${m.label} = ${m.value}`).join(' · ')} →{' '}
                                </span>
                              )}
                              <strong style={{ color: selectedReadout.verdict.ok ? '#16a34a' : '#dc2626' }}>
                                {selectedReadout.verdict.label} = {selectedReadout.verdict.value} {selectedReadout.verdict.ok ? '✓' : '✗'}
                              </strong>
                            </span>
                          )}
                        </span>
                      </span>
                    ),
                  };
                })}
                emptyHint={t('steps.empty')}
                onToggle={(id) => {
                  const g = groups.find((x) => x.key === id);
                  if (g) setGroupEnabled(id, !g.facts.every((f) => f.enabled));
                }}
                toggleLabel={t('actions.toggle')}
                editValueOf={(id) => {
                  const g = groups.find((x) => x.key === id);
                  return g ? stepLabel(g.facts.map((f) => f.cmd), g.facts[0].utterance, canonLocale) : '';
                }}
                onEditCommit={(id, next) => commitEdit(id, next)}
                editLabel={t('actions.edit')}
                onDelete={(id) => { logDebug({ kind: 'action', action: 'delete', detail: id }); removeGroup(id); }}
                deleteLabel={t('actions.delete')}
              />
              </>
            )}
          </div>

          {/* Save/load a figure file (FR-HS-10) live in the canvas export toolbar, next to
              copy/save-image — where a student reaches for "save my work". Only the hidden picker that
              the toolbar's "load from file" button triggers stays here in the DOM. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // so picking the SAME file again still fires a change event
              if (f) void loadFigureFile(f);
            }}
          />

        </>}
        dataZone={
        /* THE נתונים COLUMN (B6-2d, #729): the SHARED DataPanel head/status, with 2-D's knowledge
           surfaces as its content — values (#217 pull-only), the query lane (#477), the sliders,
           the relations/shape results and the theorem feed. */
          <div style={sideCard}>
            <DataPanel
              title={t('dataTitle')}
              open={showData}
              onToggle={() => {
                const opening = !showData;
                setShowData(opening);
                if (opening && facts.length > 0 && !valuesLayer && !computingValues) {
                  setComputingValues(true);
                  void viewValues().finally(() => setComputingValues(false));
                }
              }}
              showLabel={t('panelShow')}
              hideLabel={t('panelHide')}
              status={
                facts.length > 0
                  ? freeDofCount(construction) > 0
                    ? t('actions.dof', { count: freeDofCount(construction) })
                    : `✓ ${t('actions.determined')}`
                  : undefined
              }
              sections={[]}
            >
          {facts.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>{t('values.emptyFigure')}</span>}
          {/* #738 — the analysis TRIGGERS live WITH their results (operator: "when someone presses
              Data, you should see the ability to press those buttons"): the relations and shapes
              buttons moved here from the under-canvas row, which now matches the other tools. */}
          {facts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={relationsLayer ? relBtnOn : exploreToggle}
                disabled={analysing}
                title={t('actions.relationsHint')}
                onClick={() => {
                  if (analysing) return;
                  if (relationsLayer) {
                    clearRelations();
                    return;
                  }
                  setAnalysing(true);
                  void viewRelations().finally(() => setAnalysing(false));
                }}
              >
                {analysing ? t('actions.analysing') : relationsLayer ? t('actions.hideRelations') : t('actions.viewRelations')}
              </button>
              <button
                type="button"
                style={shapesLayer ? shapesBtnOn : exploreToggle}
                disabled={detecting}
                title={t('shapes.hint')}
                onClick={() => {
                  if (detecting) return;
                  setOpenShape(null);
                  setHoverShape(null);
                  setOpenSimilar(null);
                  setHoverSimilar(null);
                  if (shapesLayer) {
                    clearShapes();
                    return;
                  }
                  setDetecting(true);
                  void (async () => {
                    try {
                      await detectShapes();
                    } finally {
                      setDetecting(false);
                    }
                  })();
                }}
              >
                {detecting ? t('shapes.analysing') : shapesLayer ? t('shapes.hide') : t('shapes.detect')}
              </button>
            </div>
          )}
          {/* #738 — the display toggles live here too (the centers checkbox's exact home is
              provisional — operator: "not quite sure where, but not at the bottom"). */}
          {facts.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={displayToggle}>
                <input type="checkbox" checked={showMeasures} onChange={(e) => setShowMeasures(e.target.checked)} />
                {t('actions.showMeasures')}
              </label>
              <label style={displayToggle}>
                <input type="checkbox" checked={showCenters} onChange={(e) => setShowCenters(e.target.checked)} />
                {t('canvas.centers')}
              </label>
              {THEOREMS_SURFACE && (
                <label style={displayToggle}>
                  <input type="checkbox" checked={showTheorems} onChange={(e) => setShowTheorems(e.target.checked)} />
                  {t('theorems.toggle')}
                </label>
              )}
            </div>
          )}
          {computingValues && <span style={{ fontSize: 12, color: '#2563eb' }}>{t('values.computing')}</span>}
          {facts.length > 0 && !valuesLayer && !computingValues && (
            <button
              type="button"
              style={exploreToggle}
              title={t('values.hint')}
              onClick={() => {
                setComputingValues(true);
                void viewValues().finally(() => setComputingValues(false));
              }}
            >
              {t('values.compute')}
            </button>
          )}
          {valuesLayer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px' }}>
              {valuesLayer.rows.length === 0 && valuesLayer.areaClasses.length === 0 && (
                <span style={{ color: '#64748b', fontSize: 12 }}>{t('values.none')}</span>
              )}
              {(['given', 'derived'] as const).map((grp) => {
                const rows = valuesLayer.rows.filter((r) => (grp === 'given') === r.stated);
                if (rows.length === 0) return null;
                return (
                  <div key={grp}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{t(`values.${grp}`)}</div>
                    {rows.map((r, i) => (
                      <button
                        key={`${r.kind}-${r.label}-${i}`}
                        type="button"
                        style={{ display: 'flex', gap: 6, alignItems: 'baseline', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 2px', font: 'inherit', color: '#334155' }}
                        title={t('values.rowHint')}
                        onClick={() => {
                          const hl: [Id, Id][] =
                            r.kind === 'length' ? [[r.ids[0], r.ids[1]]]
                            : r.kind === 'angle' ? [[r.ids[1], r.ids[0]], [r.ids[1], r.ids[2]]]
                            : (r.kind === 'area' || r.kind === 'perimeter') && r.ids.length >= 3 ? r.ids.map((id, k) => [id, r.ids[(k + 1) % r.ids.length]] as [Id, Id])
                            : [];
                          setValueHl((cur) => (cur && JSON.stringify(cur) === JSON.stringify(hl) ? null : hl));
                        }}
                      >
                        <bdi style={{ direction: 'ltr' }}>
                          {r.kind === 'radius' ? t('values.radius', { c: r.label })
                            : r.kind === 'area' ? t('values.area', { ids: r.label })
                            : r.kind === 'perimeter' ? t('values.perimeter', { ids: r.label })
                            : r.label}
                        </bdi>
                        <span>=</span>
                        <MathValue value={r.value} exact={r.exact} degrees={r.kind === 'angle'} unit={r.unit} />
                      </button>
                    ))}
                  </div>
                );
              })}
              {/* #477 — the QUERY lane. The auto rows above are what the figure volunteers; this is where
                  the student ASKS. Deliberately inside the values panel (operator ruling), because the
                  answer belongs beside the list it extends and is computed from the very same sample
                  pool — a separate widget would invite a separate computation, and two lists that can
                  disagree are worse than one short list. */}
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{t('values.queryTitle')}</div>
                {valuesLayer.queryRows.map((qr) => (
                  <div key={qr.text} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '1px 2px' }}>
                    <button
                      type="button"
                      title={t('values.queryRemove')}
                      onClick={() => removeQuery(qr.text)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', font: 'inherit', padding: 0 }}
                    >
                      ×
                    </button>
                    <bdi style={{ direction: 'ltr', color: '#334155' }}>{qr.label ?? qr.text}</bdi>
                    {qr.value !== null ? (
                      <>
                        <span style={{ color: '#334155' }}>=</span>
                        <MathValue value={qr.value} exact={qr.exact} degrees={qr.kind === 'angle'} unit={qr.unit} />
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{t(`values.q.${qr.note ?? 'undetermined'}`)}</span>
                    )}
                  </div>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addQuery(queryText);
                    setQueryText('');
                  }}
                  style={{ display: 'flex', gap: 4, marginTop: 3 }}
                >
                  <input
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    placeholder={t('values.queryPlaceholder')}
                    title={t('values.queryHint')}
                    dir={textDir(queryText)}
                    style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                  />
                  <button type="submit" disabled={!queryText.trim()} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: queryText.trim() ? 'pointer' : 'default' }}>
                    {t('values.queryAdd')}
                  </button>
                </form>
              </div>
              {valuesLayer.areaClasses.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{t('values.areaRatios')}</div>
                  {/* One ROW per ratio (#415): these are independent facts, so the ` · ` run read as a single
                      expression — and in RTL, with Latin labels and ½S terms mixed in, the boundaries were the
                      hardest part to find. Each row now gets the same treatment (and click-to-highlight) as its
                      siblings in the נתון/נגזר sections; a class stays visually grouped by its indent. */}
                  {valuesLayer.areaClasses.map((cls, ci) => (
                    <div key={ci} style={{ display: 'flex', flexDirection: 'column' }}>
                      {cls.labels.map((lab, k) => (
                        <button
                          key={lab}
                          type="button"
                          style={{ display: 'flex', gap: 6, alignItems: 'baseline', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 2px', font: 'inherit', color: '#334155', textAlign: 'inherit' }}
                          title={t('values.rowHint')}
                          onClick={() => {
                            const ids = cls.idsPer[k];
                            const hl: [Id, Id][] =
                              ids && ids.length >= 3 ? ids.map((id, j) => [id, ids[(j + 1) % ids.length]] as [Id, Id]) : [];
                            setValueHl((cur) => (cur && JSON.stringify(cur) === JSON.stringify(hl) ? null : hl));
                          }}
                        >
                          <bdi style={{ direction: 'ltr' }}>{t('values.area', { ids: lab })}</bdi>
                          <span>=</span>
                          <bdi style={{ direction: 'ltr' }}>
                            {cls.coefs[k] === 1 ? cls.letter : cls.coefs[k] === 0.5 ? `½${cls.letter}` : `${formatMeasure(cls.coefs[k])}${cls.letter}`}
                          </bdi>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {relationsLayer && relationsLayer.equalSegments.length === 0 && relationsLayer.equalAngles.length === 0 && statedClasses.length === 0 && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{t('actions.relationsNone')}</span>
          )}
          {/* #444 — the named shape's OWN equal pairs. Marked dashed-amber with a `?` on the canvas and
              explained here, because WHICH pair is equal was the tool's choice, not the student's
              statement: cycling the configuration moves it. Never folded into the forced rows above. */}
          {statedEq && statedEq.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
              {statedEq.map((sh) => (
                <div key={`${sh.shape}-${sh.ids.join('')}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>?</span>
                  <bdi style={{ direction: 'ltr', fontSize: 12, color: '#b45309' }}>
                    {sh.classes.map((cls) => cls.map(([a, b]) => `${a}${b}`).join(' = ')).join(', ')}
                  </bdi>
                  <span style={{ fontSize: 11, color: '#92400e' }}>
                    {t('actions.relationsStated', { shape: t(`shapeName.${sh.shape}`), ids: sh.ids.join('') })}
                  </span>
                </div>
              ))}
            </div>
          )}
          {relationsLayer && (relationsLayer.equalSegments.length > 0 || relationsLayer.equalAngles.length > 0) && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{t('actions.relationsHover')}</span>
          )}

          {/* The detected-shapes RESULTS — badges + inline book-link card + similar classes, grouped in
              one ref'd container so it can be scrolled into view when it appears (kept on one screen). */}
          <div ref={shapesRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shapesLayer && shapesLayer.shapes.length === 0 && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{t('shapes.none')}</span>
          )}
          {shapesLayer && shapesLayer.shapes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {shapesLayer.shapes.map((sh) => {
                const active = openShape === sh;
                return (
                  <button
                    key={`${sh.type}-${sh.label}`}
                    type="button"
                    style={active ? shapeBadgeOn : shapeBadge}
                    // Hover previews the highlight; click opens (toggles) the inline book-link card and
                    // keeps the shape highlighted while the card is open.
                    onMouseEnter={() => setHoverShape(sh)}
                    onMouseLeave={() => setHoverShape(null)}
                    onClick={() => setOpenShape(active ? null : sh)}
                    title={t('shapes.badgeHint')}
                  >
                    {t(`shapes.name.${sh.type}`)} {sh.label}
                  </button>
                );
              })}
            </div>
          )}
          {/* The clicked shape's inline card — name, definition, and the book link — shown BELOW the
              badges so the figure (with the shape highlighted) stays visible (no figure-hiding modal). */}
          {shapesLayer && openShape && (
            <div style={shapeCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{t(`shapes.name.${openShape.type}`)} {openShape.label}</strong>
                <button type="button" style={iconBtn('#64748b')} title={t('shapes.close')} onClick={() => setOpenShape(null)}>×</button>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#334155' }}>{t(`shapes.def.${openShape.type}`)}</p>
              <a style={bookLink} href={bookUrl(openShape.type)} target="_blank" rel="noopener noreferrer">
                {t('shapes.openInBook')} ↗
              </a>
            </div>
          )}
          {/* Similar / congruent triangle CLASSES (ADR-224) — one row per class ("△DEG ~ △CEF"), listed in
              corresponding vertex order. Opt-in with the shape badges (the same student-initiated reveal
              boundary): naming a pair similar still leaves the PROOF to the student. Hover/click lights the
              member triangles on the canvas. */}
          {shapesLayer && shapesLayer.similar.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={sectionLabel}>{t('shapes.similarTitle')}</div>
              {shapesLayer.similar.map((cls, i) => {
                const active = openSimilar === cls;
                const sep = cls.kind === 'congruent' ? ' ≅ ' : ' ~ ';
                return (
                  <button
                    key={`sim-${i}`}
                    type="button"
                    // LTR math notation ("△MOA ~ △OEA"): force LTR so the leading △ glyph and the ~/≅
                    // separators don't reorder under the RTL document (the #26/#89 garble). `unicodeBidi:
                    // isolate` keeps this run from disturbing surrounding RTL.
                    dir="ltr"
                    style={{ ...(active ? shapeBadgeOn : shapeBadge), unicodeBidi: 'isolate' }}
                    onMouseEnter={() => setHoverSimilar(cls)}
                    onMouseLeave={() => setHoverSimilar(null)}
                    onClick={() => setOpenSimilar(active ? null : cls)}
                    title={t('shapes.similarHint')}
                  >
                    {cls.triangles.map((tri) => `△${tri.join('')}`).join(sep)}
                  </button>
                );
              })}
            </div>
          )}
          </div>

          {/* Playable degrees of freedom (first slice): a slider per free-circle radius. Dialing a value
              is a viewing scratchpad — "show another configuration" resets it. */}
          {radiusDofs.length > 0 && (
            <div>
              <div style={sectionLabel}>{t('dof.title')}</div>
              {radiusDofs.map((d) => {
                const value = radiusOverrides[d.circle] ?? d.current;
                // A concentric pair (ADR-244) shares a centre letter — label its sliders outer/inner.
                const paired = radiusDofs.some((o) => o.circle !== d.circle && o.center === d.center);
                const isInner = construction.objects.some((o) => o.kind === 'circle' && o.id === d.circle && o.innerOf);
                // A bound radius SYMBOL (issue #54 — "מעגל שרדיוסו R") names the slider, so the student
                // sees the letter they typed pointing at the DOF it denotes (§6 visibility).
                const circObj = construction.objects.find((o) => o.kind === 'circle' && o.id === d.circle);
                const sym = circObj && circObj.kind === 'circle' ? circObj.radiusSymbol : undefined;
                // An anonymous centre ('@ctr-O', ADR-342) is displayed by its reference token — the letter
                // the student uses for the circle («מעגל O»), never the internal id.
                const ctrTok = d.center.startsWith('@ctr-') ? d.center.slice(5) : d.center;
                const base = paired ? t(isInner ? 'dof.radiusInner' : 'dof.radiusOuter', { center: ctrTok }) : t('dof.radius', { center: ctrTok });
                const label = sym ? `${base} (${sym})` : base;
                // Two circles under a stated RADIUS ORDER (R>r, ADR-305/244) share ONE common slider scale,
                // so the order is VISIBLE — R's thumb always sits to the right of r's on the same axis
                // (issue #113 follow-up: with per-slider ranges the small circle's thumb could sit further
                // right than the big one's, so the order was enforced but not shown). The order itself is
                // still guaranteed by `setRadius` (rejects a value that violates radius-order/ratio); the
                // shared scale makes it legible. A circle not in an order keeps its own range.
                const orderPartner =
                  circObj && circObj.kind === 'circle' && circObj.orderedBelow
                    ? circObj.orderedBelow // d is inner → its outer
                    : construction.objects.find((o) => o.kind === 'circle' && o.orderedBelow === d.circle)?.id; // d is outer → its inner
                const partnerDof = orderPartner ? radiusDofs.find((x) => x.circle === orderPartner) : undefined;
                const bases = partnerDof ? [d.base, partnerDof.base] : [d.base];
                const min = Math.max(0.2, Math.min(...bases) * 0.3);
                const max = Math.max(...bases) * 2.2;
                return (
                  <div key={d.circle} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, minWidth: 96 }} dir={textDir(label)}>{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={d.base * 0.02}
                      value={Math.min(max, Math.max(min, value))}
                      onChange={(e) => setRadius(d.circle, Number(e.target.value))}
                      // #84: log the FINAL dialed value on release (not every drag tick) so a session replays.
                      onPointerUp={(e) => logDebug({ kind: 'action', action: 'slider', detail: `${d.circle}=${Number((e.target as HTMLInputElement).value).toFixed(2)}` })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 12, minWidth: 34, textAlign: 'end', color: '#64748b' }}>{value.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* The LIVE theorem feed (Phase 6a) — the bagrut theorems the STATED givens announce, updated
              every step (help, don't reveal: only what the givens *announce*, never the derived "aha").
              Headline entries are listed individually (tier dot + ● new-this-step); background theorems
              fold into one collapsed row per family. Clicking a row highlights that theorem's PREMISE on
              the canvas — never the conclusion. Toggled off from Display options. */}
          {showTheorems && facts.length > 0 && (
            <div style={{ ...sideCard, gap: 6 }}>
              <div style={sectionLabel}>{t('theorems.title')}</div>
              {/* Discovery-level dial (ADR-219) — cumulative L1→L3 selector; each level includes the ones
                  below. L3 (Observed) needs evaluated coordinates, so selecting it auto-runs shape detection
                  (an effect keeps the layer live as the figure grows). The dial lives WITH the feed it
                  controls (operator: the discovery levels are important — never bury them in settings). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>{t('theorems.discovery.label')}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([1, 2, 3] as DiscoveryLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDiscoveryLevel(lvl)}
                      title={t(`theorems.discovery.l${lvl}hint`)}
                      style={discoveryLevel === lvl ? discoveryBtnOn : discoveryBtn}
                    >
                      {t(`theorems.discovery.l${lvl}`)}
                      {/* The dial AFFORDANCE (D4 follow-through): with L1 kept as the default, the
                          dial itself must say "there is more here" — a +n badge counts the entries
                          a higher level would reveal. */}
                      {lvl > discoveryLevel && theoremFeed.filter((e) => e.level <= lvl).length > theoremFeed.filter((e) => e.level <= discoveryLevel).length && (
                        <span style={{ fontSize: 10, color: '#b45309', marginInlineStart: 3 }}>
                          +{theoremFeed.filter((e) => e.level <= lvl).length - theoremFeed.filter((e) => e.level <= discoveryLevel).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {visibleTheorems.length === 0 && (
                <span style={{ fontSize: 12, color: '#64748b' }}>{t('theorems.empty')}</span>
              )}
              {headlineTheorems.map(theoremButton)}
              {foldedTheorems.length > 0 && (
                <>
                  <button type="button" style={bgToggle} onClick={() => setMoreOpen((v) => !v)}>
                    {moreOpen ? '▾' : '▸'} {t('theorems.moreFold', { count: foldedTheorems.length })}
                  </button>
                  {moreOpen && foldedTheorems.map(theoremButton)}
                </>
              )}
              {backgroundCount > 0 && (
                <>
                  <button type="button" style={bgToggle} onClick={() => setBgOpen((v) => !v)}>
                    {bgOpen ? '▾' : '▸'} {t('theorems.backgroundToggle', { count: backgroundCount })}
                  </button>
                  {bgOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingInlineStart: 10 }}>
                      {backgroundFamilies.map(([family, list]) => (
                        <div key={family} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{t(`theorems.family.${family}`)}</div>
                          {list.map(theoremButton)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* The PRINCIPLES lane (💡, T5/ADR-248) — the teacher's tips: "whenever X is given, think
              about Y". Intent archetypes are direction-QUESTIONS derived from the stated givens'
              shape only (never the question text, never an instantiated pair — the D5 guardrails);
              at most a few show at once (§6 anti-flood). Same Display toggle as the theorems. */}
          {showTheorems && principleFeed.length > 0 && (
            <div style={{ ...sideCard, gap: 6 }}>
              <div style={sectionLabel}>{t('principles.title')}</div>
              {principleFeed.slice(0, PRINCIPLES_VISIBLE).map((c) => (
                <div key={c.id} style={conceptRow}>
                  <span aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }}>💡</span>
                  <span style={{ flex: 1, textAlign: he ? 'right' : 'left' }}>{he ? c.he : c.en}</span>
                  {c.isNew && <span style={newBadge}>{t('theorems.new')}</span>}
                </div>
              ))}
              {principleFeed.length > PRINCIPLES_VISIBLE && (
                <span style={{ fontSize: 11, color: '#64748b' }}>{t('principles.more', { count: principleFeed.length - PRINCIPLES_VISIBLE })}</span>
              )}
            </div>
          )}

            </DataPanel>
          </div>
        }
      />

      {/* "מה זה?" — the FIRST-LOAD intro (dismiss persisted): the same About content the frame's
          אודות button shows, auto-opened once for a new student. The footer retired with the frame
          adoption (B3-2d) — its contact line lives inside the About body now. */}
      <Modal
        open={aboutOpen}
        onClose={dismissAbout}
        title={t('about.title')}
        footer={
          <button type="button" style={sendBtn} onClick={dismissAbout}>
            {t('about.close')}
          </button>
        }
      >
        {aboutBody}
        {/* The in-app privacy note (NFR-SE-3 / ADR-278) — the deploy README alone is not user-facing. */}
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: pal.muted }}>{t('about.privacy')}</p>
      </Modal>

      {/* "עזרה" — a short guide + the full command reference, in two tabs. */}
      {/* THE MANUAL (B7 #672, D9): the עזרה modal graduated into the separate SCREEN — the guide
          prose is the intro, the catalog (supported entries only) is the body, and a click
          SUBMITS the example (context-dependent examples refuse honestly through the normal
          submit path, naming what is missing). */}
      <ManualScreen
        open={manualOpen}
        title={t('manualTitle')}
        intro={
          <>
            <span style={{ fontWeight: 600 }}>{t('help.guideLead')}</span>
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(t('help.guidePoints', { returnObjects: true }) as string[]).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {/* the partial-list framing + the honest collection note (TRUE here: prod inputs are
                logged and triaged — the log-triage loop is how unsupported phrasings become
                features) */}
            <span style={{ display: 'block', marginTop: 10 }}>{t('manualPartial')}</span>
          </>
        }
        closeLabel={t('manualClose')}
        tryHint={t('manualTry')}
        sectionCap={6}
        moreNote={t('manualMore')}
        sections={CATEGORY_ORDER.map((cat) => ({
          key: cat,
          title: he ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en,
          entries: COMMAND_CATALOG.filter((c) => c.category === cat && c.supported).map((c) => {
            const raw = he ? c.he : c.en;
            return {
              example: raw,
              dir: textDir(raw),
              description: he ? c.descHe : c.descEn,
              onTry: () => {
                setManualOpen(false);
                submit(raw);
              },
            };
          }),
        }))}
        onClose={() => setManualOpen(false)}
      />
    </AppFrame>
  );
}

// tabBtn retired with the help modal (B7): the manual SCREEN replaced its tabs.

/** B2-2d (#729, operator: "users shouldn't have to always scroll up and down"): the page is a
 *  VIEWPORT-HEIGHT flex column under the frame's two bars — the columns scroll INTERNALLY and the
 *  canvas takes the remaining height, so the page itself never scrolls. 112px = suite bar + tool
 *  row (measured; the parity checker pins the bars' geometry). */
// page/main and the column styles retired (#734): the three-zone GEOMETRY is shell/Workbench's.
// headerRow / figureNameInput / footerRow retired with the frame adoption (B3-2d): the header and
// footer are the FRAME's, and the figure name is the shared FigureName component.
// B2-2d: three columns — input+steps (order 1) · canvas (order 2) · the נתונים panel (order 3),
// the same zone order as the complex tool under RTL. `stretch` + minHeight:0 lets each column
// scroll internally inside the viewport-height page.
/** LEVEL 3 — the figure-action rows under the canvas (D7): things done TO the figure. */
const figureActions: React.CSSProperties = figureRowStyle; // #743: the shell row contract
// The canvas fills the space beside the sidebar and the viewport height (use the big screen);
// it wraps below the sidebar on narrow widths. Its size is measured and passed to <Figure>.
// `order` puts the canvas on the LEFT and the sidebar on the RIGHT under RTL (Hebrew):
// in an RTL flex row, order:1 sits at the right edge, order:2 to its left. (Operator: in
// Hebrew the canvas should be on the left.)
// Height budget: 100vh minus the page padding, header, footer, and the inter-row gaps — so the canvas
// fills the viewport and the whole page (header → canvas → footer) fits WITHOUT scrolling.
/** The canvas COLUMN — the flex item (FigureName above the drawing, B3-2d). Order 2 puts the
 *  canvas LEFT of the sidebar under RTL. B2-2d: the canvas takes the REMAINING height (flex:1
 *  inside the viewport-height page) — the fixed calc() budget died with the no-scroll ruling. */
/** The middle column is a WHITE CARD like its neighbours (operator, 2026-08-18: the column read
 *  as "lowered" because its white started only at the canvas box — the name field sat on the page
 *  ground). One card wraps name + canvas + figure actions, so the three columns align. */
const canvasWrap: React.CSSProperties = { position: 'relative', flex: 1, minHeight: 320 };
// Centered call-to-action shown over the blank canvas; pointer-events off so it never
// blocks the figure (the example buttons re-enable them).
// emptyChip retired with QuickChips (B4-2d) — the empty-canvas chips are the shared component's.
// The control column is capped to the viewport and scrolls INTERNALLY (its own overflow), so a tall stack
// (steps + all the action buttons + the detected-shape badges/card) never pushes the whole PAGE taller than
// the screen — the canvas and the shapes result stay on one screen (operator: "fit it all on the same screen").
// `min(400px, 100%)` (F2, tablet scope): a rigid 400px overflowed viewports narrower than the column
// itself; on a portrait tablet the canvas wraps below and the sidebar spans the width it has.
// A sidebar section card — the visual grouping the old flat stack lacked (GUI overhaul).
const sideCard: React.CSSProperties = themeCard;
const sectionLabel: React.CSSProperties = sectionTitle;
// dofPillFree/dofPillDone retired (B6-2d): the freedom cue lives in the panel's status line.
// Compact in-card utility buttons (undo/redo/clear in the steps header).
const subtleBtn: React.CSSProperties = rowSubtleStyle; // #743: the shell row contract
const subtleBtnOff: React.CSSProperties = rowSubtleOffStyle;
const displayToggle: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', fontSize: fs.body, color: '#475569', cursor: 'pointer' };
// symbolsToggle / input / chip / greekBtn retired with the shared InputArea (B4-2d): the box, the
// palette buttons and the quick chips are shell chrome now.
const sendBtn: React.CSSProperties = btn.primary;
// helpExample / catHeading / cmdRow retired with the help modal (B7): the manual screen's chrome
// renders the catalog now.
const legend: React.CSSProperties = { display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', margin: '0 0 6px' };
// stepList retired with the shared FactList (B5-2d); its scroll cap moves to the wrapping card if
// tall sessions demand it again.
const errorBanner: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#b91c1c',
};
const warnBanner: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #fde68a',
  background: '#fffbeb',
  color: '#92400e',
};
const infoBanner: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
};
// del / editInput retired with the shared FactList (B5-2d): row actions and the editor are chrome.
const iconBtn = (color: string): React.CSSProperties => ({
  border: 'none',
  background: 'transparent',
  color,
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
});
// The headline explore action ("show another configuration") — the ONE loud violet button.
const alt: React.CSSProperties = rowAccentStyle; // #743: the shell row contract
// The relations / shapes analysis toggles — quiet outlines beside `alt`, half-width each.
const exploreToggle: React.CSSProperties = { ...btn.accentOutline, flex: 1 };
// The "view relations" toggle while the layer is ON — teal, matching the on-figure tick/arc colour.
const relBtnOn: React.CSSProperties = { ...exploreToggle, border: '1px solid #0d9488', background: '#0d9488', color: '#fff' };
// The "detect shapes" toggle while the badge layer is ON — indigo, matching the badge colour.
const shapesBtnOn: React.CSSProperties = { ...exploreToggle, border: '1px solid #4338ca', background: '#4338ca', color: '#fff' };
// One segment of the discovery-level dial (ADR-219) — the cumulative L1/L2/L3 selector.
const discoveryBtn: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
};
const discoveryBtnOn: React.CSSProperties = { ...discoveryBtn, border: '1px solid #7c3aed', background: '#7c3aed', color: '#fff' };
// A detected-shape badge chip (hover → highlight on canvas; click → its inline book-link card).
const shapeBadge: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 13,
  borderRadius: 999,
  border: '1px solid #c7d2fe',
  background: '#eef2ff',
  color: '#3730a3',
  cursor: 'pointer',
};
// The chip whose inline card is open — filled indigo to mark the active selection.
const shapeBadgeOn: React.CSSProperties = { ...shapeBadge, border: '1px solid #4338ca', background: '#4338ca', color: '#fff' };

// A theorem-feed row (Phase 6a): a tier dot + the statement + optional ● new badge. Left-aligned text
// block so long bilingual statements wrap cleanly; click toggles the premise highlight on the canvas.
const theoremRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '7px 10px',
  fontSize: 12.5,
  lineHeight: 1.4,
  textAlign: 'start',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#334155',
  cursor: 'pointer',
};
// The selected theorem row — tinted amber-neutral to mark the active premise highlight.
const theoremRowOn: React.CSSProperties = { ...theoremRow, border: '1px solid #2563eb', background: '#eff6ff' };
// A guiding-principle (💡) row — informational, no click-to-highlight, warm neutral to read as advice.
const conceptRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '7px 10px',
  fontSize: 12.5,
  lineHeight: 1.4,
  borderRadius: 8,
  border: '1px solid #fde68a',
  background: '#fffbeb',
  color: '#713f12',
};
// The tier dot: green when the theorem certainly applies now, amber for a sparing secondary condition.
const tierDot = (tier: TheoremFeedEntry['tier']): React.CSSProperties => ({
  flex: '0 0 auto',
  width: 8,
  height: 8,
  marginTop: 5,
  borderRadius: 999,
  background: tier === 'certain' ? '#16a34a' : '#d97706',
});
// The ● "new this step" badge on a freshly-announced theorem.
const newBadge: React.CSSProperties = {
  flex: '0 0 auto',
  fontSize: 10,
  fontWeight: 700,
  color: '#2563eb',
  background: '#dbeafe',
  borderRadius: 999,
  padding: '1px 6px',
};
// The collapsed "background theorems (N)" fold row.
const bgToggle: React.CSSProperties = {
  textAlign: 'start',
  fontSize: 12,
  color: '#64748b',
  background: 'none',
  border: 'none',
  padding: '2px 0',
  cursor: 'pointer',
};
// The inline card under the badges with the shape's definition + book link (replaces a figure-hiding modal).
const shapeCard: React.CSSProperties = {
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #c7d2fe',
  background: '#f8faff',
};
const bookLink: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #4338ca',
  background: '#4338ca',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 14,
};
// factRow retired with the shared FactList (B5-2d): the row card is chrome; the SELECTED accent
// rides the FactRow.selected flag, and brokenness reads from the ✗ mark + inline reason.
function factLabel(state: 'ok' | 'disabled' | 'broken'): React.CSSProperties {
  return {
    flex: 1,
    textAlign: 'start',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: fs.small,
    color: state === 'disabled' ? '#94a3b8' : '#0f172a',
    textDecoration: state === 'disabled' ? 'line-through' : 'none',
  };
}
