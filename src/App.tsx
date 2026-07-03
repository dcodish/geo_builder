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
import { firstCyclableBranch, freeDofs, freeDofCount, isGeoPoint, VARIANT_COUNT } from '@/engine';
import { CATEGORY_LABELS, CATEGORY_ORDER, COMMAND_CATALOG, parse, parseRename, parseMerge, parseSwap, droppedNewLabels, classifyOutOfScope, buildParseCtx } from '@/parser';
import { llmParse } from '@/parser/llm';
import { figureContext } from '@/parser/llmShared';
import { Figure } from '@/render';
import type { Crossing } from '@/render';
import type { DetectedShape, Id } from '@/engine';
import { bookUrl } from '@/shapes/shapeCatalog';
import { Modal } from '@/ui/Modal';
import { dryRunOutcome, groupKey, hasDeferrableConstraint, introducedIds, meetsRequirements, replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { logDebug } from '@/debug/sessionLog';
import { humanizeError } from '@/i18n/humanizeError';
/**
 * Resolve AFTER the browser has had a chance to paint. A just-set React state (e.g. a "thinking"
 * spinner) is only committed to the DOM on the next frame; a blocking SYNCHRONOUS solve started in
 * the same tick would freeze the thread before that paint, so the spinner never appears. Awaiting two
 * animation frames lets React commit and the browser paint first, THEN the heavy work runs visibly
 * behind the spinner. Mirrors the inline double-rAF the "show another configuration" path uses.
 */
const nextPaint = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));

export default function App() {
  const { t, i18n } = useTranslation();
  const facts = useGeoStore((s) => s.facts);
  const selectedId = useGeoStore((s) => s.selectedId);
  const execute = useGeoStore((s) => s.execute);
  const setGroupEnabled = useGeoStore((s) => s.setGroupEnabled);
  const removeGroup = useGeoStore((s) => s.removeGroup);
  const replaceGroup = useGeoStore((s) => s.replaceGroup);
  const select = useGeoStore((s) => s.select);
  const cycleAlt = useGeoStore((s) => s.cycleAlt);
  const cycleVariant = useGeoStore((s) => s.cycleVariant);
  const resample = useGeoStore((s) => s.resample);
  const autoResolve = useGeoStore((s) => s.autoResolve);
  const radiusOverrides = useGeoStore((s) => s.radiusOverrides);
  const setRadius = useGeoStore((s) => s.setRadius);
  const seed = useGeoStore((s) => s.seed);
  const showMeasures = useGeoStore((s) => s.showMeasures);
  const setShowMeasures = useGeoStore((s) => s.setShowMeasures);
  const showCenters = useGeoStore((s) => s.showCenters);
  const setShowCenters = useGeoStore((s) => s.setShowCenters);
  const rename = useGeoStore((s) => s.rename);
  const swap = useGeoStore((s) => s.swap);
  const merge = useGeoStore((s) => s.merge);
  const hidden = useGeoStore((s) => s.hidden);
  const toggleHidden = useGeoStore((s) => s.toggleHidden);
  const segStyle = useGeoStore((s) => s.segStyle);
  const toggleSegHidden = useGeoStore((s) => s.toggleSegHidden);
  const toggleSegDashed = useGeoStore((s) => s.toggleSegDashed);
  const hiddenCircles = useGeoStore((s) => s.hiddenCircles);
  const toggleCircleHidden = useGeoStore((s) => s.toggleCircleHidden);
  const relations = useGeoStore((s) => s.relations);
  const viewRelations = useGeoStore((s) => s.viewRelations);
  const clearRelations = useGeoStore((s) => s.clearRelations);
  const shapes = useGeoStore((s) => s.shapes);
  const detectShapes = useGeoStore((s) => s.detectShapes);
  const clearShapes = useGeoStore((s) => s.clearShapes);
  const clear = useGeoStore((s) => s.clear);

  // The STORE's undo/redo wrappers (E5/STO-5), not raw zundo: they also clear the dialed-radius
  // scratchpad, and the temporal state itself now carries facts + seed so the restored view matches.
  const undo = useGeoStore((s) => s.undo);
  const redo = useGeoStore((s) => s.redo);
  const executeMany = useGeoStore((s) => s.executeMany);
  const canUndo = useStore(useGeoStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useGeoStore.temporal, (s) => s.futureStates.length > 0);

  const [text, setText] = useState('');
  const [inputNote, setInputNote] = useState(''); // a problem message under the input (not-understood / built-nothing)
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
  const [resampling, setResampling] = useState(false); // "show another configuration" search in flight (synchronous; we paint a busy state first)
  const [analysing, setAnalysing] = useState(false); // "view relations" detection in flight (synchronous; paint a busy state first)
  const [detecting, setDetecting] = useState(false); // "detect shapes" detection in flight (synchronous; paint a busy state first)
  const [openShape, setOpenShape] = useState<DetectedShape | null>(null); // the shape badge whose inline book-link card is open
  const [hoverShape, setHoverShape] = useState<DetectedShape | null>(null); // the shape badge being hovered (transient highlight preview)
  const shapesRef = useRef<HTMLDivElement>(null); // the detected-shapes section — scrolled into view when it appears / a card opens
  const [llmDropped, setLlmDropped] = useState<string[]>([]); // LLM steps the engine couldn't build
  const [renameNote, setRenameNote] = useState(''); // why a relabel was a no-op (target taken / no such point)
  const [altNote, setAltNote] = useState(''); // transient: "show another configuration" found no different drawing
  const [helpOpen, setHelpOpen] = useState(false); // the help modal ("עזרה") — guide + command reference
  const [helpTab, setHelpTab] = useState<'guide' | 'commands'>('guide');
  const [aboutOpen, setAboutOpen] = useState(false); // the "מה זה?" intro modal (first load + reopenable)
  const [showSymbols, setShowSymbols] = useState(false); // the Greek/symbol insert rows — collapsed by default (advanced)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Responsive canvas: the figure fills the space beside the sidebar (use the whole screen) instead
  // of a fixed box. A ResizeObserver feeds the measured size to <Figure>, which fits isotropically.
  const canvasRef = useRef<HTMLDivElement>(null);
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

  // Insert a Greek letter (angle variables are hard to type) at the input's caret —
  // e.g. type "זווית ABC = 2" then press α (ADR-031).
  // `caret` (when given) is where the caret lands WITHIN the inserted text — e.g. "S_{}" inserts the
  // template and drops the caret between the braces so the student types the vertices next. Defaults to
  // the end of the insertion.
  function insertSymbol(sym: string, caret?: number) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + sym + text.slice(end));
    const pos = start + (caret ?? sym.length);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  }
  const GREEK = ['α', 'β', 'γ', 'δ', 'θ'];
  // Math symbols. `label` is shown on the button; `insert` is what lands in the box
  // (x²/xⁿ show their meaning but insert just the operator so the caret sits after it).
  const SYMBOLS: { label: string; insert: string; caret?: number }[] = [
    { label: '√', insert: '√' }, // AD = 12√x
    { label: 'x²', insert: '²' }, // AB = x²
    { label: 'xⁿ', insert: '^' }, // AB = x^3
    { label: 'π', insert: 'π' }, // AB = 2π
    { label: '∠', insert: '∠' }, // ∠ABC = 37°
    { label: '°', insert: '°' },
    { label: '⊥', insert: '⊥' }, // AB ⊥ CD
    { label: '∥', insert: '∥' }, // AB ∥ CD
    { label: '△', insert: '△' }, // △ABC (triangle) / △ABC ≅ △DEF
    { label: '≅', insert: '≅' }, // ABC ≅ DEF (congruent)
    { label: '~', insert: '~' }, // ABC ~ DEF (similar)
    { label: '<', insert: '<' }, // α < β (order between two named measures)
    { label: 'S_{}', insert: 'S_{}', caret: 3 }, // area: S_{ABC} = 13 — caret lands between the braces
  ];
  const he = i18n.language === 'he';

  // Base text direction for a mixed He/En string (geometry labels, numbers, and
  // operators are Latin/neutral even inside Hebrew). `dir="auto"` keys only off
  // the FIRST strong char, so a Hebrew phrase starting with a point label ("C
  // במרחק…") wrongly gets an LTR base and reorders into garbage. Decide by
  // content instead: any Hebrew letter ⇒ RTL base, else LTR.
  const textDir = (s: string): 'rtl' | 'ltr' => (/[֐-׿]/.test(s) ? 'rtl' : 'ltr');

  // Inline step editing: open the row as a text field pre-filled with its
  // phrasing, re-parse on confirm, and replace the whole step group in place
  // (ADR-015; a step may expand to several commands, e.g. an inscribed shape).
  function startEdit(key: string, utterance: string | undefined) {
    setEditingId(key);
    setEditText(utterance ?? '');
    setEditError(false);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditText('');
    setEditError(false);
  }
  function commitEdit(key: string) {
    const r = parse(editText, parseCtx());
    if (!r.ok || r.commands.length === 0) {
      setEditError(true);
      return;
    }
    replaceGroup(key, r.commands, editText.trim());
    cancelEdit();
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
  const parseCtx = () => buildParseCtx(construction, positions);

  // After a step commits, VERIFY the figure meets every requirement; if not, auto-search alternative
  // configurations (seeds + branches) for one that does (ADR-106). The search is synchronous and can be
  // slow on a heavy figure, so it runs behind a "thinking" state painted first (double rAF). Only fires
  // when the figure is actually short of its requirements — a clean (or under-determined PENDING) figure
  // pays nothing.
  const resolveAfterCommit = () => {
    const st = useGeoStore.getState();
    // `submit` has already painted the spinner; if the figure already meets its requirements there's no
    // search to run, so just clear it (the commit itself was the answer).
    if (meetsRequirements(st.facts, st.seed)) {
      setBusy(false);
      return;
    }
    setBusy(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          // autoResolve's branch/seed rewrite belongs to the SAME user action as the commit it follows —
          // pause history so it merges into that entry instead of adding an invisible extra undo step
          // (E4/STO-4; one undo now removes the whole action, auto-resolution included).
          const temporal = useGeoStore.temporal.getState();
          temporal.pause();
          try {
            autoResolve();
          } finally {
            temporal.resume();
          }
        } finally {
          setBusy(false);
        }
      }),
    );
  };

  async function submit(utterance: string) {
    if (busyRef.current) return; // a submit is already in flight (E3) — chips/enter can't race a second one
    setInputNote('');
    setLlmDropped([]);
    setRenameNote('');
    const locale = i18n.language?.startsWith('he') ? 'he' : 'en';
    // A swap ("swap C and D" / "החלף בין C ל-D") EXCHANGES two existing labels — a store
    // operation, handled before the parser (and before rename, whose taken-target guard would
    // otherwise reject it). Lets the student flip which end of a chord is C vs D (ADR-122).
    const swp = parseSwap(utterance);
    if (swp) {
      const res = swap(swp.a, swp.b);
      logDebug({ kind: 'input', utterance, locale, source: 'swap', rename: { from: swp.a, to: swp.b }, result: res.ok ? 'ok' : res.reason });
      if (res.ok) setText('');
      else setRenameNote(t(`input.swap_${res.reason}`, { from: swp.a, to: swp.b }));
      return;
    }
    // A relabel ("rename E to G" / "שנה שם E ל-G") is a store operation, not a
    // geometry command — handle it before the parser so it never enters the figure.
    const ren = parseRename(utterance);
    if (ren) {
      const res = rename(ren.from, ren.to);
      logDebug({ kind: 'input', utterance, locale, source: 'rename', rename: ren, result: res.ok ? 'ok' : res.reason });
      if (res.ok) setText('');
      else setRenameNote(t(`input.rename_${res.reason}`, { from: ren.from, to: ren.to }));
      return;
    }
    // A merge ("merge F into E" / "מזג F ל-E") folds two existing points into one — also a
    // store operation, handled before the parser. Distinct from rename (the target survives).
    const mrg = parseMerge(utterance);
    if (mrg) {
      const res = merge(mrg.from, mrg.to);
      logDebug({ kind: 'input', utterance, locale, source: 'merge', rename: mrg, result: res.ok ? 'ok' : res.reason });
      if (res.ok) setText('');
      else setRenameNote(t(`input.merge_${res.reason}`, { from: mrg.from, to: mrg.to }));
      return;
    }
    // From here on the path runs SYNCHRONOUS solves — the dry-run, the commit replay, and (last) the
    // LLM call — that can take a few seconds on a hard/over-constrained figure (e.g. an impossible
    // "AD>BC"), freezing the UI. Paint the "thinking" state FIRST and yield a frame so the spinner is
    // visible from the moment Submit is pressed until the answer (operator) — the same treatment the
    // "show another configuration" path already gets. Cleared on every synchronous exit below; the
    // commit paths hand off to `resolveAfterCommit`, which owns the spinner through any auto-resolve.
    setBusy(true);
    await nextPaint();
    const pctx = parseCtx();
    const r = parse(utterance, pctx);
    // A single-vertex angle ("∠B = 90") the parser flagged as ambiguous (the vertex has ≠2 edges, so WHICH
    // angle is meant is unclear) — ask the student to name all three letters instead of escalating to the LLM
    // (which would only guess). Keep the text so they can edit it into the three-letter form.
    if (!r.ok && r.reason === 'ambiguous-angle') {
      logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `ambiguous-angle:${r.vertex}` });
      setInputNote(t('input.ambiguousAngle', { vertex: r.vertex }));
      setBusy(false);
      return;
    }
    let weak: 'error' | 'empty' | 'dropped' | null = null;
    if (r.ok) {
      // A typo in a keyword (e.g. "מנוקדה" for "מנקודה") can make a rule match PARTIALLY, silently dropping
      // a NEW label it introduced ("from D …") — committing a wrong/partial figure. When the parse leaves a
      // new input label unused, escalate to the LLM (whose job is freeform/typo input) instead of committing
      // the partial parse (ADR-089). An EXISTING label a command doesn't re-name is fine (context).
      const dropped = droppedNewLabels(utterance, r.commands, pctx.points ?? []);
      if (dropped.length === 0) {
        // A deterministic parse can "succeed" yet build NOTHING — apply with an error (kept-prior) or
        // change nothing at all. Dry-run before committing so a silent fail isn't shown as success
        // (operator request); a step that builds something commits immediately.
        const outcome = dryRunOutcome(facts, r.commands, seed, radiusOverrides);
        if (outcome.produced) {
          // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
          executeMany(r.commands, utterance);
          logDebug({ kind: 'input', utterance, locale, source: 'parser', commands: r.commands });
          setText('');
          resolveAfterCommit();
          return;
        }
        // A cleanly-parsed CONSTRAINT that errored only because it can't be satisfied AT THIS POSITION (an
        // under-determined coupled solve before its pinning givens arrive — e.g. "CE⟂AB" before "CD=36,
        // DE=18") is NOT an LLM problem: the LLM would re-emit the same command, or drop it. Commit it so
        // `replay`'s deferral retries it once the later givens pin the figure (ADR-104) — order-independence.
        // A genuine contradiction then surfaces honestly as a failing step instead of "couldn't read that".
        if (outcome.reason === 'error' && hasDeferrableConstraint(r.commands)) {
          executeMany(r.commands, utterance);
          logDebug({ kind: 'input', utterance, locale, source: 'parser', result: 'deferred-constraint', detail: outcome.detail, commands: r.commands });
          setText('');
          resolveAfterCommit();
          return;
        }
        // A cleanly-PARSED command the engine CAN'T satisfy against the current figure (and not a deferrable
        // constraint) is a CONTRADICTION with the existing data — not a phrasing problem, so the LLM can't fix
        // it (it would re-emit the same in-grammar command). Show the SPECIFIC reason (humanized: "…contradicts
        // an earlier given", "C is already defined — edit/delete the earlier step") instead of the generic
        // "produced nothing". (ADR-156 follow-up — the "impossible with the current data" message.)
        if (outcome.reason === 'error') {
          logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `conflict:${outcome.detail ?? ''}`, commands: r.commands });
          setInputNote(outcome.detail ? humanizeError(outcome.detail, t) : t('input.producedNothing'));
          setBusy(false);
          return; // keep the text so the student can edit/delete it
        }
        // A clean RE-ENTRY of things that already exist (re-typing a shape, re-inscribing points already on
        // the circle) parses fine but produces nothing NEW. That's not a failure and must not escalate to the
        // LLM (which would just say "couldn't build"): tell the student it's already drawn. Signal: produced
        // nothing, NOT an error, and the utterance introduces no new label (every label it names already
        // exists). (ADR-156 follow-up — the friendly no-op message.)
        if (outcome.reason === 'empty') {
          const existing = new Set((pctx.points ?? []).map((p) => p.toUpperCase()));
          const newLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])].filter((l) => !existing.has(l));
          if (newLabels.length === 0) {
            logDebug({ kind: 'input', utterance, locale, source: 'parser', result: 'noop-exists', commands: r.commands });
            setInputNote(t('input.alreadyDrawn'));
            setText('');
            setBusy(false);
            return;
          }
        }
        weak = outcome.reason; // parsed but produced nothing → fall through to the LLM second attempt
        // `intermediate`: this weak grammar attempt ALWAYS escalates to the LLM below, whose outcome is
        // logged as the submission's FINAL result — keep this step in the DEV trace but don't let it
        // become a second analytics `submit` (else the dashboard double-counts the utterance). See sessionLog.
        logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `weak:${outcome.reason}`, detail: outcome.detail, commands: r.commands, intermediate: true });
      } else {
        weak = 'dropped'; // a typo dropped a new label → escalate rather than commit the partial parse
        logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `weak:dropped:${dropped.join(',')}`, commands: r.commands, intermediate: true });
      }
    }
    // out of grammar, OR a deterministic parse that built nothing → ask the LLM (a SECOND try),
    // using the current figure as context. The spinner is already up (painted at the top of submit) and
    // stays up across the network call AND the post-LLM dry-run/commit below; it's cleared on the
    // not-understood return and by `resolveAfterCommit` on success.
    const ctx = figureContext(
      construction.objects.filter(isGeoPoint).map((o) => o.id),
      construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.center] : [])),
    );
    // Abortable + bounded (E3/STO-3): a hung proxy aborts after ~15 s, and the student can cancel —
    // either way the spinner clears instead of hanging forever.
    const controller = new AbortController();
    llmAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let out: Awaited<ReturnType<typeof llmParse>>;
    try {
      out = await llmParse(utterance, ctx, parseCtx(), { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      llmAbortRef.current = null;
    }
    // Cancelled (student) — quietly stand down, keeping the text for a retry; timed out — an honest
    // "service busy" (the request may still be running server-side; it isn't the student's fault).
    if (out === null && controller.signal.aborted) {
      logDebug({ kind: 'input', utterance, locale, source: 'limit', result: 'aborted-or-timeout', intermediate: true });
      setInputNote(t('input.serviceBusy'));
      setBusy(false);
      return;
    }
    // The proxy is throttling (global daily cost ceiling or per-IP limit) — NOT a parse failure. Show a
    // "service busy, try again" message (never "couldn't understand your input" — it isn't the student's
    // fault) and tag the analytics so the operator can see how often the ceiling is reached (SEC-2).
    if (out?.busy) {
      logDebug({ kind: 'input', utterance, locale, source: 'limit', result: out.busy });
      setInputNote(t('input.serviceBusy'));
      setBusy(false);
      return;
    }
    // RE-READ the store after the await (E3/STO-3): the dry-run below must run against the CURRENT
    // facts — an undo/canvas action during the network call would otherwise be validated against the
    // pre-await snapshot while `executeMany` commits onto the live list (a stale-commit race).
    const cur = useGeoStore.getState();
    // The LLM only counts if its decomposition actually BUILDS something — else it's another silent
    // fail. Dry-run the combined commands; if neither grammar nor LLM built anything, say so plainly.
    const llmCmds = out ? out.built.flatMap((g) => g.commands) : [];
    const llmBuilds =
      out !== null && out.built.length > 0 && dryRunOutcome(cur.facts, llmCmds, cur.seed, cur.radiusOverrides).produced;
    if (!llmBuilds) {
      // Both the grammar AND the LLM failed to BUILD anything. Distinguish a deliberately OUT-OF-SCOPE
      // concept — a named angle/theorem relationship, a proof or compute request, or pure free text —
      // from a GENUINE construction gap we should still implement. The out-of-scope cases get a tailored,
      // pedagogical message (what to do instead) and a `scope:<category>` analytics tag, so the admin
      // dashboard separates "no need to implement" from "real gap to build" (operator request). A real
      // gap keeps the plain "couldn't read that" message and the `not-understood` tag.
      const scope = classifyOutOfScope(utterance);
      if (scope) {
        logDebug({ kind: 'input', utterance, locale, source: 'scope', result: `scope:${scope.category}` });
        setInputNote(t(scope.messageKey));
        setBusy(false);
        return;
      }
      logDebug({ kind: 'input', utterance, locale, source: 'llm', result: out && out.built.length ? 'built-nothing' : 'not-understood' });
      // "produced nothing even after a retry" gets the explicit problem message; pure out-of-grammar
      // (the grammar never matched) keeps the gentler "couldn't read that — try an example".
      setInputNote(t(weak ? 'input.producedNothing' : 'input.notUnderstood'));
      setBusy(false);
      return;
    }
    // The LLM understood the (often Hebrew) input and decomposed it into canonical steps; show it as
    // ONE step row labelled by the STUDENT'S ORIGINAL utterance — not the LLM's English canonical lines
    // (a Hebrew input must never surface as an English row). All built commands share one group, exactly
    // like a deterministic multi-command parse, so editing the row re-runs the original wording. The
    // canonical decomposition + any unbuildable steps stay in the debug log / `dropped` report.
    executeMany(llmCmds, utterance); // one batch → one step row AND one undo entry (E4)
    logDebug({ kind: 'input', utterance, locale, source: 'llm', built: out!.built.map((g) => g.step), dropped: out!.dropped });
    setLlmDropped(out!.dropped);
    setText('');
    resolveAfterCommit();
  }

  // Figure + per-fact status are derived from the fact list.
  const { construction, positions, circles, status, lastError, pending, labels, angleMarks, violations, radiusDofs, coincidences } = useMemo(
    () => replay(facts, seed, radiusOverrides),
    [facts, seed, radiusOverrides],
  );

  // The "view relations" layer is shown only while its cached result still matches the CURRENT facts —
  // any fact change makes a new `facts` array (≠ the cached ref), so the layer auto-clears (ADR-134). Ground
  // truths are invariant across configurations, so it deliberately survives "show another configuration".
  const relationsLayer = relations && relations.facts === facts ? relations.result : null;

  // The "detect shapes" badge layer — same facts-keyed cache contract as the relations layer above.
  const shapesLayer = shapes && shapes.facts === facts ? shapes.result : null;

  // Highlight the shape under the cursor (hover) or the one whose card is open: its vertices (dots) and,
  // for a circle, the circle itself. Reuses the canvas `highlight` set, so it overrides the fact-selection
  // highlight while a shape is active. Cleared when the layer clears. The boundary EDGES are highlighted
  // separately as point-pairs (`shapeHighlightEdges`) so a sub-segment through a crossing lights up too.
  const shapeHighlight = useMemo(() => {
    const sh = shapesLayer ? (hoverShape ?? openShape) : null;
    if (!sh) return undefined;
    const ids = new Set<string>(sh.vertices);
    if (sh.type === 'circle') for (const o of construction.objects) if (o.kind === 'circle' && o.center === sh.vertices[0]) ids.add(o.id);
    return ids;
  }, [shapesLayer, hoverShape, openShape, construction]);

  // The active shape's boundary edges as point-PAIRS (consecutive vertices, wrapping). The renderer strokes
  // each between its endpoints' positions, so an edge that is only a PORTION of a longer drawn segment
  // (e.g. G–C ⊂ EC, with no object of its own) is highlighted — the ADR-167-Am. fix for "CDG segments not
  // highlighted correctly". A circle shape has no boundary edges.
  const shapeHighlightEdges = useMemo<[Id, Id][] | undefined>(() => {
    const sh = shapesLayer ? (hoverShape ?? openShape) : null;
    if (!sh || sh.type === 'circle' || sh.vertices.length < 2) return undefined;
    const v = sh.vertices;
    return v.map((id, i) => [id, v[(i + 1) % v.length]] as [Id, Id]);
  }, [shapesLayer, hoverShape, openShape]);

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
    const utterance = he
      ? `${id} = חיתוך ${x.a}${x.b} ו-${x.c}${x.d}`
      : `${id} = intersection of ${x.a}${x.b} and ${x.c}${x.d}`;
    execute({ type: 'line-line-intersection', id, a: x.a, b: x.b, c: x.c, d: x.d }, utterance);
  }

  // Highlight every object introduced by the selected step (all its commands).
  const highlight = useMemo(() => {
    const inGroup = facts.filter((x) => groupKey(x) === selectedId);
    return inGroup.length ? new Set(inGroup.flatMap((x) => introducedIds(x.cmd))) : undefined;
  }, [facts, selectedId]);

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

  useEffect(() => {
    document.documentElement.dir = i18n.dir();
    document.documentElement.lang = i18n.language;
  }, [i18n, i18n.language]);

  // When the shapes are detected, or a badge's book-link card opens, bring that section into view within the
  // scrollable control column — so the badges + link are visible without the student hunting/scrolling (the
  // canvas stays put because the column scrolls internally, not the page).
  useEffect(() => {
    if (shapesLayer && (shapesLayer.shapes.length > 0 || openShape)) {
      shapesRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [shapesLayer, openShape]);

  // The first point with an unshown discrete solution to step to — circle∩circle, line∩circle,
  // arc-midpoint, or a driven on-segment point (the kinds `cycleAlt` can step). A two-circle figure
  // has BOTH crossings on screen (A=branch 0, B=branch 1), so cycling would only collide them —
  // `firstCyclableBranch` excludes it and "show another configuration" resamples the circles
  // instead. With no cyclable branch, it re-samples the free DOFs. (Single source of truth, ADR-043.)
  const branchId = firstCyclableBranch(construction);
  // A kite/isosceles whose equal-pair is a cyclable VARIANT (ADR-138) — so "show another configuration"
  // offers to flip which sides are equal even when the shape is otherwise determined.
  const hasVariant = facts.some((f) => f.enabled && f.cmd.type === 'shape-variant' && VARIANT_COUNT[f.cmd.shape] > 1);
  const examples = t('examples.items', { returnObjects: true }) as string[];

  // The command reference (the coverage map): every construct grouped by category,
  // wired ones clickable to try. Lives in the help modal's "פקודות" tab. Clicking an
  // example also closes the modal so the figure is visible.
  const commandCatalog = () => (
    <div>
      {CATEGORY_ORDER.map((cat) => {
        const items = COMMAND_CATALOG.filter((c) => c.category === cat && c.supported);
        if (items.length === 0) return null;
        return (
          <div key={cat} style={{ marginTop: 10 }}>
            <div style={catHeading}>{he ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map((c) => (
                <li key={c.en} style={cmdRow}>
                  <button type="button" style={helpExample} onClick={() => { submit(he ? c.he : c.en); setHelpOpen(false); }} dir={textDir(he ? c.he : c.en)} title={he ? c.descHe : c.descEn}>
                    {he ? c.he : c.en}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={page}>
      <header style={headerRow}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('app.title')}</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>{t('app.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={ghost} onClick={() => { setHelpTab('guide'); setHelpOpen(true); }}>
            {t('header.help')}
          </button>
          <button type="button" style={ghost} onClick={() => setAboutOpen(true)}>
            {t('header.about')}
          </button>
        </div>
      </header>

      <div style={main}>
        <div ref={canvasRef} style={canvasWrap}>
          <Figure
            construction={construction}
            positions={positions}
            circles={circles}
            width={canvasSize.w}
            height={canvasSize.h}
            highlight={shapeHighlight ?? highlight}
            highlightEdges={shapeHighlightEdges}
            onPickIntersection={markIntersection}
            intersectionLabel={t('actions.markIntersection')}
            labels={labels}
            angleMarks={angleMarks}
            relations={relationsLayer}
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
              copyImage: t('canvas.copyImage'),
              saveImage: t('canvas.saveImage'),
              copied: t('canvas.copied'),
              reset: t('canvas.reset'),
            }}
          />
          {/* Empty canvas → a call to action so a new user knows what to do. The
              container ignores pointer events (so panning isn't blocked); the
              example buttons re-enable them. */}
          {facts.length === 0 && (
            <div style={emptyOverlay}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#334155' }}>{t('canvas.emptyTitle')}</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>{t('canvas.emptyHint')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', pointerEvents: 'auto' }}>
                {examples.slice(0, 3).map((ex) => (
                  <button key={ex} type="button" style={emptyChip} onClick={() => submit(ex)} dir={textDir(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside style={sidebar}>
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) submit(text);
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={inputRef}
                style={input}
                placeholder={t('input.placeholder')}
                value={text}
                dir={textDir(text)}
                onChange={(e) => {
                  setText(e.target.value);
                  if (inputNote) setInputNote('');
                  if (llmDropped.length) setLlmDropped([]);
                  if (renameNote) setRenameNote('');
                }}
                autoFocus
              />
              <button type="submit" style={sendBtn} disabled={!text.trim() || thinking}>
                {thinking ? t('input.loading') : t('input.send')}
              </button>
            </div>
            {/* Greek + math-symbol inserts — advanced (only for symbolic lengths / angle variables /
                relation glyphs), so collapsed behind a toggle to keep the input area clean. */}
            <button type="button" onClick={() => setShowSymbols((v) => !v)} style={symbolsToggle}>
              Ω {t('input.symbols')} {showSymbols ? '▴' : '▾'}
            </button>
            {showSymbols && (
              <>
                {/* Row 1 — Greek-letter inserts for angle variables (∠ABC = 2α), hard to type. */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 70 }}>{t('input.greek')}:</span>
                  {GREEK.map((g) => (
                    <button key={g} type="button" title={t('input.insertGreek')} onClick={() => insertSymbol(g)} style={greekBtn}>
                      {g}
                    </button>
                  ))}
                </div>
                {/* Row 2 — math symbols: roots/powers for symbolic lengths, and the ∠ ° ⊥ ∥ relation glyphs. */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 70 }}>{t('input.symbols')}:</span>
                  {SYMBOLS.map((s) => (
                    <button key={s.label} type="button" title={t('input.insertSymbol')} onClick={() => insertSymbol(s.insert, s.caret)} style={greekBtn}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
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
          </form>

          <div>
            <div style={sectionLabel}>{t('examples.heading')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {examples.map((ex) => (
                <button key={ex} type="button" style={chip} onClick={() => submit(ex)} dir={textDir(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {lastError && <div role="status" aria-live="polite" style={errorBanner}>⚠ {humanizeError(lastError, t)}</div>}

          {pending && <div role="status" aria-live="polite" style={infoBanner}>ⓘ {t('figure.pending')}</div>}

          {coincidences.length > 0 && (
            <div style={infoBanner}>
              ⓘ {coincidences.map(([a, b]) => t('figure.converge', { a, b })).join(' ')}
            </div>
          )}

          {violations.length > 0 && (
            <div role="status" aria-live="polite" style={warnBanner}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ {t('figure.mismatch')}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {violations.map((v) => (
                  <li key={`${v.relation}-${v.ids.join('-')}`}>{t(v.messageKey, v.params)}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div style={sectionLabel}>{t('steps.title')}</div>
            {facts.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{t('steps.empty')}</p>
            ) : (
              <>
              {/* What the status marks mean — a quick legend so ✓ / ✗ / ○ aren't cryptic. */}
              <div style={legend}>
                <span><span style={{ color: '#16a34a' }}>✓</span> {t('steps.statusOk')}</span>
                <span><span style={{ color: '#dc2626' }}>✗</span> {t('steps.statusBroken')}</span>
                <span><span style={{ color: '#94a3b8' }}>○</span> {t('steps.statusOff')}</span>
              </div>
              <ul style={stepList}>
                {groups.map((g) => {
                  const on = g.facts.every((f) => f.enabled);
                  const anyOn = g.facts.some((f) => f.enabled);
                  const brokenFact = g.facts.find((f) => f.enabled && status[f.id] !== 'ok');
                  const state = !anyOn ? 'disabled' : brokenFact ? 'broken' : 'ok';
                  const errText = brokenFact ? humanizeError(status[brokenFact.id] as string, t) : undefined;
                  const label = g.facts[0].utterance ?? g.facts.map((f) => f.cmd.type).join(' + ');
                  const editing = editingId === g.key;
                  return (
                    <li key={g.key} style={factRow(state, g.key === selectedId)}>
                      <input
                        type="checkbox"
                        checked={on}
                        title={t('actions.toggle')}
                        onChange={() => setGroupEnabled(g.key, !on)}
                        disabled={editing}
                        style={{ cursor: editing ? 'default' : 'pointer' }}
                      />
                      {editing ? (
                        <>
                          <input
                            autoFocus
                            value={editText}
                            dir={textDir(editText)}
                            onChange={(e) => {
                              setEditText(e.target.value);
                              if (editError) setEditError(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(g.key);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            style={{ ...editInput, borderColor: editError ? '#dc2626' : '#cbd5e1' }}
                          />
                          <button type="button" style={iconBtn('#16a34a')} title={t('actions.confirmEdit')} onClick={() => commitEdit(g.key)}>
                            ✓
                          </button>
                          <button type="button" style={iconBtn('#94a3b8')} title={t('actions.cancelEdit')} onClick={cancelEdit}>
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <button type="button" style={factLabel(state)} onClick={() => select(g.key)} dir={textDir(label)} title={state === 'broken' ? errText : undefined}>
                              {label}
                            </button>
                            {/* The broken-step REASON, inline (F6): it lived only in a `title` tooltip —
                                invisible on touch and to screen readers. Shown when the row is selected
                                (tap the row to see why it broke), keeping unselected rows compact. */}
                            {state === 'broken' && errText && g.key === selectedId && (
                              <span style={{ fontSize: 11, color: '#dc2626', paddingInlineStart: 6 }} dir={textDir(errText)}>
                                {errText}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>
                            {state === 'ok' ? <span style={{ color: '#16a34a' }}>✓</span> : state === 'broken' ? <span style={{ color: '#dc2626' }}>✗</span> : <span style={{ color: '#94a3b8' }}>○</span>}
                          </span>
                          <button type="button" style={iconBtn('#64748b')} title={t('actions.edit')} onClick={() => startEdit(g.key, g.facts[0].utterance)}>
                            ✎
                          </button>
                          <button type="button" style={del} title={t('actions.delete')} onClick={() => removeGroup(g.key)}>
                            ×
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={ghost} disabled={!canUndo} onClick={() => undo()}>{t('actions.undo')}</button>
            <button type="button" style={ghost} disabled={!canRedo} onClick={() => redo()}>{t('actions.redo')}</button>
            <button type="button" style={ghost} onClick={clear}>{t('actions.clear')}</button>
          </div>

          {/* Display options — what to show on the figure (grouped together; ⊙ centres used to be a
              cryptic button on the canvas — now it sits next to "show measures"). */}
          <div>
            <div style={sectionLabel}>{t('display.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={displayToggle}>
                <input type="checkbox" checked={showMeasures} onChange={(e) => setShowMeasures(e.target.checked)} />
                {t('actions.showMeasures')}
              </label>
              <label style={displayToggle}>
                <input type="checkbox" checked={showCenters} onChange={(e) => setShowCenters(e.target.checked)} />
                {t('canvas.centers')}
              </label>
            </div>
          </div>

          {(branchId || hasVariant || freeDofs(construction).length > 0) && (
            <button
              type="button"
              style={alt}
              disabled={resampling}
              title={t('actions.anotherHint')}
              // Explore the WHOLE configuration space: resample the continuous free DOFs (so free
              // points / on-circle vertices actually move) AND cycle a discrete branch if there is
              // one. Previously this did branch-cycling EXCLUSIVELY whenever any branch existed, so a
              // figure with both (e.g. a circle∩circle point + free secant ends) only flipped between
              // 2 branch options and never varied its free DOFs.
              onClick={() => {
                if (resampling) return;
                // The search is SYNCHRONOUS and can take a moment on a heavy figure (it replays + verifies
                // many candidate seeds), which would freeze the UI with no feedback. Paint a "working" state
                // FIRST (double rAF = after the next paint), then run the blocking search (operator: "no sign
                // of the system thinking").
                setResampling(true);
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    try {
                      const changed = resample(); // true if it found a genuinely different drawing
                      if (branchId) cycleAlt(branchId); // a discrete branch flip is always a real change
                      const flipped = cycleVariant(); // also cycle the equal-pair of a kite/isosceles (ADR-138)
                      if (changed || branchId || flipped) setAltNote('');
                      else {
                        // searched and found nothing different — tell the student something DID happen (the
                        // figure is determined), so "show another" doesn't look like a dead button (operator).
                        setAltNote(t('actions.onlyConfig'));
                        window.setTimeout(() => setAltNote(''), 4000);
                      }
                    } finally {
                      setResampling(false);
                    }
                  }),
                );
              }}
            >
              {resampling ? t('input.loading') : t('actions.another')}
            </button>
          )}
          {resampling && <span style={{ fontSize: 12, color: '#2563eb' }}>{t('input.loading')}</span>}
          {altNote && <span style={{ fontSize: 12, color: '#64748b' }}>{altNote}</span>}

          {/* ADR-018 Stage 3 — the figure's remaining freedom, shrinking as facts accumulate
              until it reads "fully determined" (a single rigid drawing). */}
          {facts.length > 0 && (
            <span style={{ fontSize: 12, color: freeDofCount(construction) > 0 ? '#2563eb' : '#16a34a' }}>
              {freeDofCount(construction) > 0 ? t('actions.dof', { count: freeDofCount(construction) }) : t('actions.determined')}
            </span>
          )}

          {/* "View relations" — the ground-truth layer (ADR-134): on press, mark every equal side / equal
              angle the givens FORCE (ticks / arcs). A button, not a live toggle; the detection samples the
              figure, so we paint a busy state first. Dismiss with the same button; a new fact auto-clears it. */}
          {facts.length > 0 && (
            <button
              type="button"
              style={relationsLayer ? relBtnOn : alt}
              disabled={analysing}
              title={t('actions.relationsHint')}
              onClick={() => {
                if (analysing) return;
                if (relationsLayer) {
                  clearRelations();
                  return;
                }
                // Synchronous detection (samples + replays the figure) — paint a "working" state FIRST
                // (double rAF) so a heavy figure doesn't freeze with no feedback, then run it.
                setAnalysing(true);
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    try {
                      viewRelations();
                    } finally {
                      setAnalysing(false);
                    }
                  }),
                );
              }}
            >
              {analysing ? t('actions.analysing') : relationsLayer ? t('actions.hideRelations') : t('actions.viewRelations')}
            </button>
          )}
          {relationsLayer && relationsLayer.equalSegments.length === 0 && relationsLayer.equalAngles.length === 0 && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{t('actions.relationsNone')}</span>
          )}
          {relationsLayer && (relationsLayer.equalSegments.length > 0 || relationsLayer.equalAngles.length > 0) && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{t('actions.relationsHover')}</span>
          )}

          {/* The detected-shapes section — the button, badges, and inline book-link card grouped in one
              ref'd container so it can be scrolled into view when it appears (kept on one screen). */}
          <div ref={shapesRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* "Detect shapes" (FR-SH) — on press, classify every named shape the figure contains (forced
              across samples) and list each as a badge that links to its page in the geometry book. A
              button, not a live toggle (opt-in, same pedagogy boundary as "view relations"); a new fact
              auto-clears the layer. */}
          {facts.length > 0 && (
            <button
              type="button"
              style={shapesLayer ? shapesBtnOn : alt}
              disabled={detecting}
              title={t('shapes.hint')}
              onClick={() => {
                if (detecting) return;
                setOpenShape(null);
                setHoverShape(null);
                if (shapesLayer) {
                  clearShapes();
                  return;
                }
                setDetecting(true);
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    try {
                      detectShapes();
                    } finally {
                      setDetecting(false);
                    }
                  }),
                );
              }}
            >
              {detecting ? t('shapes.analysing') : shapesLayer ? t('shapes.hide') : t('shapes.detect')}
            </button>
          )}
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
          </div>

          {/* Playable degrees of freedom (first slice): a slider per free-circle radius. Dialing a value
              is a viewing scratchpad — "show another configuration" resets it. */}
          {radiusDofs.length > 0 && (
            <div>
              <div style={sectionLabel}>{t('dof.title')}</div>
              {radiusDofs.map((d) => {
                const value = radiusOverrides[d.circle] ?? d.current;
                return (
                  <div key={d.circle} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, minWidth: 96 }}>{t('dof.radius', { center: d.center })}</span>
                    <input
                      type="range"
                      min={Math.max(0.2, d.base * 0.3)}
                      max={d.base * 2.2}
                      step={d.base * 0.02}
                      value={value}
                      onChange={(e) => setRadius(d.circle, Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 12, minWidth: 34, textAlign: 'end', color: '#64748b' }}>{value.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <footer style={footerRow}>
        <span>
          {t('footer.by')} <strong style={{ color: '#334155' }}>{t('footer.name')}</strong>
        </span>
        <span aria-hidden style={{ color: '#cbd5e1' }}>·</span>
        <span>
          {t('footer.contact')}:{' '}
          <a href="mailto:david.codish@gmail.com" style={{ color: '#2563eb', textDecoration: 'none' }}>
            david.codish@gmail.com
          </a>
        </span>
      </footer>

      {/* "מה זה?" — first-load intro (dismiss persisted), reopenable from the header. */}
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
        <p style={{ marginTop: 0 }}>{t('about.lead')}</p>
        <ul style={{ margin: '8px 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(t('about.points', { returnObjects: true }) as string[]).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div style={{ fontWeight: 600, marginTop: 12 }}>{t('about.tryTitle')}</div>
        <ol style={{ margin: '6px 0 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(t('about.trySteps', { returnObjects: true }) as string[]).map((s) => (
            <li key={s} dir={textDir(s)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
              {s}
            </li>
          ))}
        </ol>
      </Modal>

      {/* "עזרה" — a short guide + the full command reference, in two tabs. */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('header.help')} width={640}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button type="button" style={tabBtn(helpTab === 'guide')} onClick={() => setHelpTab('guide')}>
            {t('help.guideTab')}
          </button>
          <button type="button" style={tabBtn(helpTab === 'commands')} onClick={() => setHelpTab('commands')}>
            {t('help.commandsTab')}
          </button>
        </div>
        {helpTab === 'guide' ? (
          <div>
            <p style={{ marginTop: 0, fontWeight: 600 }}>{t('help.guideLead')}</p>
            <ul style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(t('help.guidePoints', { returnObjects: true }) as string[]).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : (
          commandCatalog()
        )}
      </Modal>

    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
    background: active ? '#eff6ff' : '#fff',
    color: active ? '#1e40af' : '#475569',
    cursor: 'pointer',
  };
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
  color: '#0f172a',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};
const headerRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const main: React.CSSProperties = { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' };
const footerRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  paddingTop: 10,
  borderTop: '1px solid #e2e8f0',
  fontSize: 13,
  color: '#64748b',
};
// The canvas fills the space beside the sidebar and the viewport height (use the big screen);
// it wraps below the sidebar on narrow widths. Its size is measured and passed to <Figure>.
// `order` puts the canvas on the LEFT and the sidebar on the RIGHT under RTL (Hebrew):
// in an RTL flex row, order:1 sits at the right edge, order:2 to its left. (Operator: in
// Hebrew the canvas should be on the left.)
// Height budget: 100vh minus the page padding, header, footer, and the inter-row gaps — so the canvas
// fills the viewport and the whole page (header → canvas → footer) fits WITHOUT scrolling.
const canvasWrap: React.CSSProperties = { order: 2, position: 'relative', flex: '1 1 480px', minWidth: 360, height: 'calc(100vh - 180px)', minHeight: 460 };
// Centered call-to-action shown over the blank canvas; pointer-events off so it never
// blocks the figure (the example buttons re-enable them).
const emptyOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  textAlign: 'center',
  pointerEvents: 'none',
  padding: 24,
};
const emptyChip: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 14,
  borderRadius: 999,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1e40af',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
};
// The control column is capped to the viewport and scrolls INTERNALLY (its own overflow), so a tall stack
// (steps + all the action buttons + the detected-shape badges/card) never pushes the whole PAGE taller than
// the screen — the canvas and the shapes result stay on one screen (operator: "fit it all on the same screen").
// `min(400px, 100%)` (F2, tablet scope): a rigid 400px overflowed viewports narrower than the column
// itself; on a portrait tablet the canvas wraps below and the sidebar spans the width it has.
const sidebar: React.CSSProperties = { order: 1, width: 'min(400px, 100%)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', paddingInlineEnd: 4 };
const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
const displayToggle: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569', cursor: 'pointer' };
const symbolsToggle: React.CSSProperties = { alignSelf: 'flex-start', border: 'none', background: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0 };
const input: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
};
const sendBtn: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};
const chip: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  borderRadius: 999,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1e40af',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
};
const greekBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  fontSize: 14,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#1d4ed8',
  cursor: 'pointer',
};
const helpExample: React.CSSProperties = {
  textAlign: 'start',
  border: 'none',
  background: 'none',
  color: '#1e40af',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 13,
  padding: 0,
};
const catHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 4,
};
const cmdRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const legend: React.CSSProperties = { display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', margin: '0 0 6px' };
// The steps list is the tallest variable part, so it's capped and scrolls on its own — that reclaims the
// vertical space the action buttons + detected-shape badges/card need to stay in view (see `sidebar`).
const stepList: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '32vh', overflowY: 'auto' };
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
const ghost: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
};
const del: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
};
const editInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '4px 8px',
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
};
const iconBtn = (color: string): React.CSSProperties => ({
  border: 'none',
  background: 'transparent',
  color,
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
});
const alt: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #7c3aed',
  background: '#7c3aed',
  color: '#fff',
  cursor: 'pointer',
};
// The "view relations" button while the layer is ON — teal, matching the on-figure tick/arc colour.
const relBtnOn: React.CSSProperties = { ...alt, border: '1px solid #0d9488', background: '#0d9488' };
// The "detect shapes" button while the badge layer is ON — indigo, distinct from the relations teal.
const shapesBtnOn: React.CSSProperties = { ...alt, border: '1px solid #4338ca', background: '#4338ca' };
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
function factRow(state: 'ok' | 'disabled' | 'broken', selected: boolean): React.CSSProperties {
  const border = selected ? '#f59e0b' : state === 'broken' ? '#fecaca' : '#e2e8f0';
  const bg = selected ? '#fffbeb' : state === 'broken' ? '#fef2f2' : '#f8fafc';
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${border}`,
    background: bg,
  };
}
function factLabel(state: 'ok' | 'disabled' | 'broken'): React.CSSProperties {
  return {
    flex: 1,
    textAlign: 'start',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    color: state === 'disabled' ? '#94a3b8' : '#0f172a',
    textDecoration: state === 'disabled' ? 'line-through' : 'none',
  };
}
