/**
 * The analytic builder's app shell.
 *
 * Everything visible here that is not the figure comes from `shell/` — frame, switcher, workbench,
 * input area, fact list, data panel, quick chips, canvas controls, theme. That is not thrift, it is
 * the V0 acceptance gate: [ADR-AG-004](../docs/06c-decisions-analytic.md#adr-ag-004) makes suite
 * conformance half of what V0 must pass, because "make it match the others" is the item that slips
 * to a follow-up when a new product is being built fast. This product is the first born after the
 * shared chassis existed ([docs/28 §5](../docs/28-product-unification.md) Phase 4), and mounting
 * rather than re-deriving the chrome is the whole return on that work.
 */
import { useCallback, useMemo, useState, useRef, useEffect, type ChangeEvent, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import registry from '../products.json';
import { AppFrame } from '../shell/frame/AppFrame';
import { DataPanel } from '../shell/frame/DataPanel';
import { FactList } from '../shell/frame/FactList';
import { InputArea } from '../shell/frame/InputArea';
import { QuickChips } from '../shell/frame/QuickChips';
import { ToolButton } from '../shell/frame/ToolButton';
import { Workbench } from '../shell/frame/Workbench';
import { canvasClusterStyle, canvasCtrlStyle, CANVAS_ZOOM_STEP } from '../shell/frame/canvasControls';
import { INITIAL_VIEW, centreOf, figureIsVisible, panned, toWorld, viewBox, zoomedAt, type CanvasView } from './render/view';
import { figureRowStyle, rowAccentStyle, rowAccentOffStyle, rowSpacerStyle, rowSubtleStyle, rowSubtleOffStyle, rowDangerInk } from '../shell/frame/figureRow';
import { fmtAnalytic } from './format';
import { curveDetailsKey, curveParts } from './app/curveText';
import { color, fs } from '../shell/theme';
import { paramRegister, reportedDof } from './engine/carriers';
import { derive } from './engine/derive';
import { decideSubmit } from './app/submit';
import { runFallback } from './app/fallback';
import { panelListsCurve } from './app/panelRows';
import { llmParseAnalytic, LLM_TIMEOUT_MS_ANALYTIC } from './parser/llmAnalytic';
import { domainText, positionalOf } from './engine/types';
import { isKnowledge, knownCurve, knownOptions } from './engine/evaluate';
import { drawnBox as composeDrawnBox } from './app/drawnBox';
import { SYMBOLS } from './ui/symbols';
import { logAnalytic, logAnalyticFigure } from './debug/sessionLogAnalytic';
import { exprText } from './engine/expr';
import { MathText, hasMath } from '../shell/math';
import { Banner } from '../shell/frame/Banner';
import { FigureName } from '../shell/frame/FigureName';
import { ManualScreen } from '../shell/frame/ManualScreen';
import { svgToPng } from '../shell/export/svgToPng';
import { figureNameFromFileName, readEnvelope, savedFileName } from '../shell/save';
import { ANALYTIC_APP, ANALYTIC_SAVE_VERSION } from './store/useAnalyticStore';
import { COMMAND_CATALOG_ANALYTIC } from './parser/catalogAnalytic';
import { analyticBidi } from './i18n';
import { Figure } from './render/Figure';
import { buildScene } from './render/scene';
import { AskLane } from '../shell/frame/AskLane';
import { ask, figureIsOpen, type Answer } from './app/ask';
import { askOnceAnswer, drawnLoci, drawnMarks, isDrawn, removeAnswerAt, toggleDrawn } from './app/answers';
import { measurablesOf, type Measurable } from './app/measurable';
import { anotherConfiguration } from './app/another';
import { centresOf, crossingSentence, crossingsOf, freeLetter, pointAt } from './engine/crossings';
import { VERTICAL_TOL, verticality } from './engine/lines';
import { useAnalyticStore, type InputError } from './store/useAnalyticStore';

declare const __BUILD__: string;

/** The empty-canvas first click. RAW commands (ADR-W-029) — exactly what a student would type. */
const QUICK_COMMANDS = [
  'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
  'נתון הישר l1: y=x',
  'נתונה פרבולה קנונית שמשוואתה y^2=54x',
  'נתונה הנקודה A(2,6)',
];

/**
 * How far the pointer may travel before a press becomes a PAN rather than a click (#1101).
 *
 * A few pixels of tremor is a click. Without this threshold every press was a pan, and — because
 * pointer capture retargets the whole gesture — the `click` never reached the canvas objects
 * underneath.
 */
const DRAG_SLOP = 4;

/**
 * The size the scene is built at BEFORE the viewport has been measured (#1103).
 *
 * It is a first-paint fallback and nothing else. The real size comes from a `ResizeObserver` on the
 * drawing viewport, because a fixed nominal canvas cannot be right: `Figure` renders
 * `viewBox="0 0 W H"` at `width/height: 100%` under the default `xMidYMid meet`, so a square
 * projection meeting a 1094×674 card letterboxes to 674×674 and leaves 420px dead — by construction,
 * at every window size.
 *
 * It is not only cosmetic. `view.ts` maps pointer travel through the viewport's RENDERED rect on the
 * promise that *"the world point under the cursor stays under the cursor"*; with the world drawn into
 * a letterboxed 674 of a 1094 rect, every pixel of drag was worth 0.82 of what the arithmetic thought
 * and the wheel anchor was mis-registered by the same factor. Measuring the element the drag already
 * measures is what makes the promise true, which is why the observer watches `viewportRef` itself and
 * not some other box.
 *
 * 2-D and 3-D have always done this (`src/App.tsx`, `src3d/App3.tsx`); the D1 Workbench contract locks
 * the CARD and stopped at its edge, so what the surface did inside it drifted unmeasured.
 */
const CANVAS_FALLBACK = { w: 720, h: 720 };
/** Never build a scene smaller than this — below it the tick labels collide. Mirrors 2-D's floor. */
const CANVAS_MIN = 320;

/**
 * The locale key describing WHAT a clashing name already holds (#1046).
 *
 * The engine hands over a token (`derived:centroid`, `curve:ellipse`) and never a sentence, so the
 * description is rendered here, in the student's language, from the construct's own corpus noun.
 * An unrecognised token falls back to the generic noun rather than printing itself: a message
 * leaking `derived:centroid` at a student would be internal state, which the honesty invariants
 * forbid outright.
 */
function existingKey(error: InputError): string {
  const token = 'existing' in error ? error.existing : undefined;
  const byToken: Record<string, string> = {
    point: 'kindPoint',
    free: 'kindFree',
    segment: 'kindSegment',
    polygon: 'kindPolygon',
    'curve:line': 'kindLine',
    'curve:circle': 'kindCircle',
    'curve:parabola': 'kindParabola',
    'curve:ellipse': 'kindEllipse',
    'derived:midpoint': 'kindMidpoint',
    'derived:centroid': 'kindCentroid',
    'derived:incentre': 'kindIncentre',
    'derived:orthocentre': 'kindOrthocentre',
    'derived:circumcentre': 'kindCircumcentre',
    'derived:diagonals': 'kindDiagonalMeet',
  };
  return (token && byToken[token]) || 'kindObject';
}

export function App() {
  const { t, i18n } = useTranslation();
  const {
    lines,
    seed,
    error,
    queries,
    setQueries,
    recordLine,
    removeLine,
    replaceLine,
    clearAll,
    goToSeed,
    setError,
    notice,
    setNotice,
    name,
    setName,
    loadAudit,
    setLoadAudit,
    serialize,
    restore,
    undo,
    redo,
  } = useAnalyticStore();
  /**
   * Can we step back or forward? Read from the TEMPORAL store, as both siblings do, so a disabled
   * button means "there is nothing there" rather than a guess from the line count — clearing the
   * canvas is itself undoable, and a count-based test would grey out the one press that recovers it.
   */
  const canUndo = useStore(useAnalyticStore.temporal, (t) => t.pastStates.length > 0);
  const canRedo = useStore(useAnalyticStore.temporal, (t) => t.futureStates.length > 0);
  const [draft, setDraft] = useState('');
  /** #1251 — the LLM fallback is in flight. Owns only the spinner; the decision lives in app/fallback.ts. */
  const [thinking, setThinking] = useState(false);

  /**
   * SAVE and LOAD (#1087) — the shared envelope, the shared naming, the sibling’s own order.
   *
   * Operator, 2026-09-15: *"there is no load and save and stuff we have on other tools"*. The
   * machinery was all in `shell/save` and nothing in this product called it.
   *
   * What a save HOLDS here is the line list, which is the whole session: no position and no
   * parameter value is stored, so loading replays the lines through the real parse path. That makes
   * a save file a parser-drift net as well as a document — a saved figure that stops loading is a
   * grammar that changed under a student’s own work.
   */
  const saveFile = () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // The shared naming convention, with this product’s suffix from the docs/22 §9 registry.
    a.download = savedFileName(name, new Date(), 'analytic');
    a.click();
    URL.revokeObjectURL(url);
  };

  const onLoadFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError({ key: 'load-unreadable', detail: file.name });
        return;
      }
      /**
       * The envelope NAMES its refusal: a file from another builder says whose it is, and a file
       * from a newer version says to refresh — never a generic "could not read", which sends a
       * student to fix a file that was read perfectly well.
       */
      const env = readEnvelope(parsed, { app: ANALYTIC_APP, maxVersion: ANALYTIC_SAVE_VERSION });
      if (!env.ok) {
        setError({
          key:
            env.reason === 'wrong-app'
              ? 'load-foreign'
              : env.reason === 'newer-version'
                ? 'load-newer'
                : 'load-unreadable',
          detail: file.name,
        });
        return;
      }
      const saved = env.data as { lines?: unknown; seed?: unknown; name?: unknown };
      const savedLines = Array.isArray(saved.lines)
        ? saved.lines.filter((l): l is string => typeof l === 'string')
        : [];
      restore({
        lines: savedLines,
        seed: typeof saved.seed === 'number' ? saved.seed : 0,
        name: typeof saved.name === 'string' ? saved.name : figureNameFromFileName(file.name, 'analytic'),
      });
      // A load is a new figure, so the view it is seen through is a new view too (#1209).
      showWholeFigure();
      /**
       * A LOAD IS AUDITED, not trusted (#1087). The lines are re-parsed on the way in, and a line
       * that no longer builds is reported rather than dropped in silence — which is the whole value
       * of storing lines instead of positions.
       */
      const replayed = derive(savedLines, 0);
      setLoadAudit({
        total: savedLines.length,
        failed: replayed.faults.map((f) => ({ line: savedLines[f.index] ?? '', reason: f.code })),
      });
      // #1300 — a load REPLACES the figure, so a replay that misses it continues from the wrong one. The
      // audit's own result rides along: a file that stopped loading is the parser-drift signal this trace
      // exists to make visible.
      logAnalytic({
        kind: 'action',
        action: 'load',
        detail: `${savedLines.length} lines`,
        result: replayed.faults.length ? `${replayed.faults.length} failed` : 'ok',
      });
    });
  };

  /** The image exports — the shared rasteriser, the top row, as in every sibling (ADR-W-024). */
  const rasterCanvas = (): Promise<Blob> => {
    const svg = canvasCard.current?.querySelector('svg');
    if (!svg) return Promise.reject(new Error('no canvas'));
    return svgToPng(svg as SVGSVGElement);
  };
  const flashExport = (v: 'ok' | 'err') => {
    setExportFlash(v);
    window.setTimeout(() => setExportFlash(''), 1400);
  };
  const copyImage = async () => {
    try {
      const blob = await rasterCanvas();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashExport('ok');
    } catch {
      flashExport('err');
    }
  };
  const saveImage = async () => {
    try {
      const blob = await rasterCanvas();
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = 'figure.png';
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      flashExport('err');
    }
  };

  /**
   * WHAT THE CANVAS IS LOOKING AT (#1094) — zoom AND centre, because the operator had neither move
   * nor a zoom they could aim: *"the canvas has no zoom and move features"*.
   *
   * `centre: null` means "follow the figure": while the student has not moved the view, a drawing
   * that grows stays framed; the moment they pan, the view is theirs and a later given must not yank
   * it away. The arithmetic lives in `render/view.ts` so the invariants are testable without a
   * rendered canvas.
   */
  const [view, setView] = useState<CanvasView>(INITIAL_VIEW);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /**
   * THE MEASURED DRAWING SURFACE (#1103) — the scene is built at the size the viewport really is.
   *
   * Observing `viewportRef` and not a wrapper is deliberate: it is the same element `view.ts` reads
   * for pointer arithmetic, so the projected size and the tracked rect cannot disagree. See
   * `CANVAS_FALLBACK` for why a nominal size was wrong in both dimensions at once.
   */
  const [canvasSize, setCanvasSize] = useState(CANVAS_FALLBACK);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setCanvasSize({
        w: Math.max(CANVAS_MIN, Math.floor(r.width)),
        h: Math.max(CANVAS_MIN, Math.floor(r.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /**
   * `moved` is what separates a CLICK from a DRAG (#1101).
   *
   * #1094 captured the pointer on PRESS. Capture retargets the whole gesture to the capturing
   * element, so `click` never reached the child — and the crossing rings (#1025), which the operator
   * had validated in T46–T48, stopped responding in production while still being drawn. **A ring
   * that looks clickable and is not is worse than no ring at all.**
   *
   * So capture is deferred until the pointer has actually travelled: below the threshold the gesture
   * stays a click and passes through to whatever was under it.
   */
  const dragRef = useRef<{ x: number; y: number; view: CanvasView; moved: boolean } | null>(null);
  /**
   * The ASK lane (#1027) — the panel’s own input, and the operator’s request: *"data panel should
   * have a data entry option to query sizes and equations"*.
   *
   * The answers are STATE and the figure is not touched: an ask is evaluated against the current
   * derivation and discarded (02c R23–R27). Kept newest-first, because the question just asked is
   * the one being read.
   */
  const [askText, setAskText] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [exportFlash, setExportFlash] = useState<'' | 'ok' | 'err'>('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasCard = useRef<HTMLDivElement | null>(null);
  /**
   * THE MEASURE MENU (#1048) — what was clicked, and where to put the list.
   *
   * `screen` is viewport coordinates from the click, because the menu is positioned over the whole
   * page rather than inside the SVG: an SVG-space menu would scale with the canvas and shrink out of
   * readability at low zoom.
   */
  const [pick, setPick] = useState<{ items: Measurable[]; x: number; y: number } | null>(null);

  /**
   * ASK IT, OR TAKE IT BACK (#1118) — one writer, so a measurement can always be retired.
   *
   * Operator, playing #1048: *"it's one thing to see it, but then I want to remove it and continue
   * on."* #1048 tied the drawn height's lifetime to its ANSWER precisely so that dropping the answer
   * would drop the height; this is the half that was designed and not built.
   *
   * The QUESTION is the key. It is the sentence the student asked, it is unique to the measurement,
   * and it is what the menu offers — so clicking the same entry twice toggles, which is exactly the
   * route he described (*"maybe I click on the dot again and I can remove the line"*), and asking the
   * same thing twice stops producing a second identical row.
   */
  const toggleAsk = (sentence: string) => setQueries(toggleDrawn(queries, sentence));
  const askOnce = (sentence: string) => setQueries(askOnceAnswer(queries, sentence));
  const askRef = useRef<HTMLInputElement | null>(null);

  /**
   * CLEAR-ALL CLEARS THE SESSION, not just the store (#1107) — #146's class, third occurrence.
   *
   * The button was wired straight to the store action, which resets store state only; the drafts are
   * local React state the store has never heard of, so an unsent line and an unsent question survived
   * a clear and misrepresented a cleared session. 2-D carries the original scar (#146) and 3-D copied
   * its shape by hand — the fix has lived as a hand-written list inside each product, which is why a
   * third and fourth product reintroduced it.
   *
   * The ANSWERS need nothing here any more (#1110): they are DERIVED from `queries`, so `clearAll`
   * retires them with the lines. That is the general fix this comment used to say was still owed —
   * a reading of a figure that no longer exists cannot be rendered, because no reading is stored.
   */
  /**
   * THE VIEW BELONGS TO THE FIGURE IT WAS COMPUTED FOR (#1209).
   *
   * Pan and zoom are a transform ON TOP of the figure's own box. Replace the figure wholesale and the
   * old transform is applied to something it was never computed for — load a small figure while zoomed
   * into the corner of a large one and it lands entirely off-screen. The operator loaded a two-given
   * save and got a canvas showing grid and nothing else, while the data panel listed the figure
   * perfectly: it reads as data loss, on the student's own save.
   *
   * So every seam that REPLACES the figure resets the view, and they all come through here rather than
   * each remembering to — which is the shape `clearAll` itself records as having been reintroduced by a
   * third and fourth product.
   */
  const showWholeFigure = () => setView(INITIAL_VIEW);

  const clearSession = () => {
    logAnalytic({ kind: 'action', action: 'clear' });
    clearAll();
    setDraft('');
    setAskText('');
    showWholeFigure();
  };
  const [dataOpen, setDataOpen] = useState(true);
  /**
   * «הצג בנייה» — the medians, altitudes or bisectors that DEFINE a derived point (#1030).
   *
   * OFF by default, on the operator's ruling: three medians per derived point buries a real figure,
   * and a student asks for the method when they want it. One GLOBAL toggle rather than one per
   * point, matching how 02c R20 settled the equations toggle — the two controls should behave alike
   * rather than each inventing a scope.
   */
  const [showConstruction, setShowConstruction] = useState(false);

  const d = useMemo(() => derive(lines, seed), [lines, seed]);

  /**
   * THE FIGURE SNAPSHOT (#1300) — the sibling effect, over this product's own source of truth.
   *
   * 2-D and 3-D snapshot their fact lists with per-fact statuses. Here the session IS the line list
   * (`store/useAnalyticStore.ts`: *"lines as the source of truth"*), and the figure is replayed from it, so
   * the lines plus the seed plus the per-line faults are a complete reconstruction — nothing derived needs
   * storing, which is the same property that makes a save file a parser-drift net.
   *
   * The effect's dependency list is NOT what keeps this to one line per change — `logAnalyticFigure` dedupes
   * on the payload itself, because StrictMode's double-invoke and ordinary re-renders both re-fire this and
   * neither is a figure change. Measured: three identical snapshots per change before the dedupe.
   */
  useEffect(() => {
    logAnalyticFigure({ seed, lines, faults: d.faults, outcomes: d.outcomes });
  }, [d, lines, seed]);

  /**
   * THE ANSWERS ARE DERIVED (#1110), never stored.
   *
   * They used to be component state with exactly one writer, so nothing invalidated them: a length
   * and an area survived deleting every given AND «נקה הכל» — a stale reading presented as current
   * fact. An answer is a reading of a particular `(facts, seed)`; the moment either changes it is
   * stale or must be recomputed, and keeping it verbatim is the one option that is never right.
   *
   * So the STORE holds the QUESTIONS and this recomputes their answers from the current derivation —
   * the same shape as everything else derived here, and the shape complex already had (its `askRows`
   * come from `queries`), which is why this defect was analytic's alone.
   */
  /**
   * The family's name in the student's language — «מעגל», «ישר», «פרבולה», «אליפסה» (#1137).
   *
   * `ask` is the lane's ENGINE and holds no locale, so the wording is injected here beside `fmt` and
   * `describeCurve`, exactly as those two are. One key per family, and the internal kind is the key —
   * a family added later has no translation and shows its own name, which is visibly wrong rather
   * than silently missing.
   */
  const locusKind = useCallback((kind: string) => t(`locus.${kind}`), [t]);

  const answers = useMemo<Answer[]>(
    // #1212 removed `describeCurve` (imported now); #1137's `locusKind` stays — it is locale.
    () => queries.map((q) => ({ ...ask(d, q.sentence, fmt, locusKind), shown: q.shown })),
    [queries, d, fmt, locusKind],
  );

  /**
   * THE FRAME IS FITTED TO EVERYTHING THAT WILL BE DRAWN (#1198).
   *
   * Operator, playing round #1193 T11: *"pressing on show another config causes the image to jump
   * right and left and the entire shape is not shown."*
   *
   * `d.box` frames the FIGURE, and a traced locus is not in the figure — it is caller-owned
   * decoration handed to the renderer afterwards, the same seam as `marks` and `crossings`. So the
   * trace was projected into a frame decided without it, and measured on the operator's own figure
   * it fell outside in **4 of 6 configurations**: the tool clipped the one object he had asked to
   * see.
   *
   * Composed HERE rather than inside `derive`, because this is the only layer that holds both the
   * derivation and the answers. Putting a question's trace into the derivation would make the figure
   * depend on the questions asked about it, which is the layering (02c R24 — an ask never mutates
   * the figure) rather than a convenience.
   *
   * Only SHOWN answers count: a trace the student has collapsed is not on the canvas, and framing
   * for it would zoom out for something invisible.
   *
   * ⚠ This is HALF of #1198. The frame still lurches between configurations (measured: width varies
   * by a factor of 2.6, centre swings from +55 to −63), because it is re-fitted from nothing on
   * every press. That half is a product ruling about what «הציגו תצורה אחרת» should feel like —
   * fit once and keep it, normalise by the parameter, or clamp the movement — and the issue says so.
   */
  const drawnBox = useMemo(() => composeDrawnBox(d.figure, d.box, answers), [answers, d]);

  /**
   * The box and the view in REFS as well as in state (#1094): the wheel listener below is registered
   * once and would otherwise close over the first render's values forever.
   */
  const figureBoxRef = useRef(drawnBox);
  figureBoxRef.current = drawnBox;
  const viewRef = useRef(view);
  viewRef.current = view;

  /**
   * A FIGURE THE STUDENT BUILDS IS VISIBLE (#1225) — the third door on ADR-AG-096.
   *
   * Operator, playing T34: *"when i put MA=5 the focus on the canvas is lost and the image is not
   * centered. pressing the center button does the work but this should be automatic"*.
   *
   * #1209 gave loading and «נקה הכל» a `showWholeFigure()`. Every other `setView` is a user gesture,
   * so adding a FACT — which changes the figure — left the previous figure's transform applied to a
   * new one it was never computed for. «MA = 5» collapses M from two free DOFs to a discrete pair,
   * and the wide view computed while M roamed then showed empty paper.
   *
   * It runs on the BOX, not on every render: the effect fires only when the figure's extent actually
   * changes, so a deliberate zoom is untouched for as long as the student keeps looking at the same
   * figure. And it re-fits only when `figureIsVisible` says the figure has largely left the screen,
   * so a zoom into a vertex survives the next line. Returning `v` unchanged is a React no-op, which
   * is what keeps this from looping.
   */
  const figureBoxKey = `${drawnBox.minX},${drawnBox.minY},${drawnBox.maxX},${drawnBox.maxY}`;
  useEffect(() => {
    setView((v) => (figureIsVisible(figureBoxRef.current, v) ? v : INITIAL_VIEW));
  }, [figureBoxKey]);

  /**
   * WHEEL TO ZOOM, about the cursor (#1094).
   *
   * Registered NATIVELY and non-passively. React 18 attaches `onWheel` as a PASSIVE listener, so
   * `preventDefault()` inside it is a no-op and the page scrolls behind the canvas — the lesson 2-D
   * records at F5/REN-2, and the reason this is an effect rather than a JSX prop.
   */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const box = figureBoxRef.current;
      const v = viewRef.current;
      const anchor = toWorld(box, v, e.clientX - rect.left, e.clientY - rect.top, rect);
      setView(zoomedAt(box, v, e.deltaY < 0 ? CANVAS_ZOOM_STEP : 1 / CANVAS_ZOOM_STEP, anchor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /**
   * The builder roster, as DATA from `products.json` — `shell/` may never import a product, so the
   * list arrives from the registry and the labels resolve through THIS product's own i18n. Dev
   * swaps in `devUrl` because `npm run dev` serves every app from one origin.
   *
   * The `devOnly` clause is this product's own readmission ticket. Operator ruling (2026-09-03):
   * the analytic tool is NOT DEPLOYED until it has decent capability, so its registry entry carries
   * `enabled: false` — which is what keeps the three shipped builders from rendering a chip that
   * would 404 in production, without any of them needing to know this tool exists. Widening the
   * filter HERE, and only here, keeps the suite bar whole while developing.
   */
  const roster = useMemo(
    () =>
      registry.products
        .filter((p) => p.enabled || (import.meta.env.DEV && 'devOnly' in p && p.devOnly))
        .map((p) => ({
          id: p.id,
          label: t(p.labelKey),
          icon: p.icon,
          url: import.meta.env.DEV ? p.devUrl : p.url,
        })),
    [t],
  );

  /**
   * The submit path DISPATCHES; it does not decide (#1102).
   *
   * The decision — parse, dry-run fold, and the three "this line adds nothing" outcomes — lives in
   * `app/submit.ts`, which is what the locks call too. It used to live here, and that is precisely
   * how #1063's entailment notice went dead: #1076 added an earlier-returning arm, and the test that
   * should have caught it REPRODUCED this function instead of calling it, so it modelled a submit
   * path that no longer existed.
   */
  const submit = (raw: string) => {
    const verdict = decideSubmit(raw, lines, seed, d);
    /**
     * THE TRACE (#1300) — one line per submitted utterance, including the ones that fail.
     *
     * Logged from the verdict rather than from each branch below, so a new verdict kind cannot be added
     * without appearing here: the switch is exhaustive and this reads its result. `intermediate` marks the
     * parser step of a submission that is about to escalate, so a reader (and any future analytics) does
     * not count one utterance twice — the sibling rule, and the reason `sessionLog3` carries the flag.
     *
     * `ignored` is the ONE kind that writes nothing: it means the box was blank, so there is no utterance
     * and no student action to reconstruct — a stray Enter is not an event. Every other kind is recorded,
     * including all the refusals, which are the ones a report is usually about.
     */
    if (verdict.kind !== 'ignored') {
      logAnalytic({
        kind: 'input',
        utterance: raw,
        locale: i18n.language,
        source: 'parser',
        result: verdict.kind === 'refused' ? verdict.error.key : verdict.kind,
        ...(verdict.kind === 'refused' && verdict.error.key === 'not-handled' ? { intermediate: true } : {}),
      });
    }
    switch (verdict.kind) {
      case 'ignored':
        return;
      case 'refused':
        /**
         * THE LLM SEAM (#1251). `not-handled` means no rule matched — the one code that means "I do
         * not know this sentence" rather than "this sentence is wrong". Every other refusal is an
         * OWNED answer (a degenerate role, a reserved coordinate, a name clash) and must stand: the
         * tool understood the student and disagreed, and handing that to a model would replace a
         * correct explanation with a guess.
         */
        if (verdict.error.key === 'not-handled') {
          void tryFallback(raw, verdict.error);
          return;
        }
        setError(verdict.error);
        return;
      case 'already-known':
        setNotice(t('noticeAlreadyKnown', { detail: verdict.line }));
        setDraft('');
        return;
      case 'already-follows':
        setNotice(t('noticeAlreadyFollows', { detail: verdict.line }));
        setDraft('');
        return;
      case 'record':
        recordLine(verdict.line);
        setDraft('');
        return;
    }
  };

  /**
   * Ask the proxy to normalise a sentence this tool did not recognise (#1251).
   *
   * Everything the model returns goes back through `decideSubmit` inside `runFallback`, so this
   * function decides nothing about geometry — it owns the SPINNER and the MESSAGE, and nothing else.
   * On any outcome but a clean set of lines the student keeps the original refusal, because that
   * refusal is about words they actually wrote.
   */
  const tryFallback = async (raw: string, original: InputError) => {
    setThinking(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), LLM_TIMEOUT_MS_ANALYTIC);
    try {
      const out = await runFallback(raw, lines, seed, (utterance, context) =>
        llmParseAnalytic(utterance, context, { signal: ctl.signal }),
      );
      /**
       * THE ESCALATION'S OUTCOME (#1300) — the event that could not be answered when #1297 was triaged.
       *
       * The model's own LINES are what make this worth logging: a `source:'llm'` event without them says
       * only that a call happened, and the question a report actually asks is *what did the model say*.
       * #1297 (English canonical lines) and #1278 (English prose) are both invisible without this field.
       */
      logAnalytic({
        kind: 'input',
        utterance: raw,
        locale: i18n.language,
        source: 'llm',
        result: out.kind,
        ...(out.kind === 'lines' ? { steps: out.lines } : {}),
        ...(out.kind === 'rejected' ? { steps: [out.refusedStep] } : {}),
        ...(out.kind === 'busy' ? { why: out.why } : {}),
      });
      if (out.kind === 'lines') {
        for (const l of out.lines) recordLine(l);
        setDraft('');
        return;
      }
      if (out.kind === 'busy') {
        setError({ key: 'llm-busy', detail: raw });
        return;
      }
      // 'none' and 'rejected' alike: the student keeps the refusal about their own sentence. Naming
      // the model's rejected line would report internal state for words they never typed.
      setError(original);
    } finally {
      clearTimeout(timer);
      setThinking(false);
    }
  };

  const scene = useMemo(() => {
    // The box the VIEW is looking at (#1094) — the figure's own box moved and scaled by what the
    // student has done to it. Re-projecting rather than transforming is what keeps the grid crisp
    // and the tick labels true at every zoom; see `render/view.ts`.
    const zoomed = viewBox(drawnBox, view, { width: canvasSize.w, height: canvasSize.h });
    /**
     * The renderer cannot ask whether a value is KNOWLEDGE — that is a question about the
     * construction across configurations, and a `Figure` is one configuration (#1024). So the gate
     * is supplied here, from the same `knownCurve` the data panel uses, rather than re-decided in
     * the renderer where it would drift from the panel it must agree with.
     */
    return buildScene(d.figure, zoomed, canvasSize.w, canvasSize.h, {
      curveKnown: (id) => knownCurve(d.construction, id) !== null,
      /**
       * THE HEIGHTS TO DRAW (#1048) — one per answered point-to-line distance, carried on the answer
       * that produced it so the drawing and the number come from the same measurement.
       *
       * The label is the answer's own value, so the canvas and the panel cannot disagree. Only
       * answers that HAVE a mark contribute, which `ask` grants only when the distance is knowledge.
       */
      marks: drawnMarks(answers),
      /**
       * The מקומות גיאומטריים an answer is about (#1137) — the same `shown` lifetime as the marks
       * above, so ADR-AG-067's three gestures govern a trace without a fourth rule being invented.
       */
      loci: drawnLoci(answers),
      /**
       * The crossings a student may promote (#1025) — operator: *"when a line we draw crosses another
       * line, we need to see the dashed circle allowing us to create that point"*.
       *
       * Computed here because deciding which crossings can be NAMED is a question about the
       * construction, and each dot carries the SENTENCE its click would add rather than a point: two
       * surfaces, one grammar.
       */
      crossings: [
        ...crossingsOf(d.figure, d.construction).map((k) => ({
          id: k.id,
          x: k.x,
          y: k.y,
          sentence: crossingSentence(k, freeLetter(d.construction)),
        })),
        /**
         * A circle's CENTRE is namable the same way a crossing is (#1109) — the operator's
         * *"it should be clickable so user can assign the center with a letter"*.
         *
         * Concatenated into the same list rather than given its own handler, which is the issue's own
         * design constraint: one kind of offer, one letter source, one grammar. Each entry carries the
         * SENTENCE its click would add, so the click surface and the typing surface cannot disagree.
         */
        ...centresOf(d.figure, freeLetter(d.construction)),
      ],
    });
  }, [d, view, canvasSize, answers]);

  const errorText = error
    ? t(
        {
          'not-handled': 'errNotHandled',
          'bad-equation': 'errBadEquation',
          'out-of-scope': 'errOutOfScope',
          'reserved-coordinate': 'errReservedCoordinate',
          'bad-arity': 'errBadArity',
          'repeated-vertex': 'errRepeatedVertex',
          'degenerate-role': 'errDegenerateRole',
          'apex-not-a-vertex': 'errApexNotAVertex',
          'crossing-already-named': 'errCrossingAlreadyNamed',
          'llm-busy': 'errLlmBusy',
          'bad-operand': 'errBadOperand',
          'conflicting-restatement': 'errConflict',
          'name-kind-clash': 'errNameClash',
          // #1179 — the noun follows the KIND the statement expected, not a single point-shaped
          // sentence. `expected` is the token the engine carries; an id with no prefix (and so no
          // kind) falls to the kind-free wording rather than guessing.
          'unknown-reference':
            error.key === 'unknown-reference' && error.expected
              ? {
                  point: 'errUnknownRefPoint',
                  line: 'errUnknownRefLine',
                  circle: 'errUnknownRefCircle',
                  curve: 'errUnknownRef',
                }[error.expected]
              : 'errUnknownRef',
          'does-not-exist': 'errDoesNotExist',
          'ring-contradicts-noun': 'errRingContradictsNoun',
          'ambiguous-angle': 'errAmbiguousAngle',
          'ambiguous-shape': 'errAmbiguousShape',
          'undistinguished-diagonal': 'errNoPrincipalDiagonal',
          'already-named': 'errAlreadyNamed',
          'unsatisfiable': 'errUnsatisfiable',
          // A save file this tool will not open, named by WHICH of the three reasons (#1087).
          'load-foreign': 'errLoadForeign',
          'load-newer': 'errLoadNewer',
          'load-unreadable': 'errLoadUnreadable',
        }[error.key],
        { detail: error.detail, existing: t(existingKey(error)), holder: 'holder' in error ? (error.holder ?? '') : '' },
      )
    : null;

  // The DOF cue (02c P4 — an under-determined figure is drawn, and its openness is VISIBLE).
  // Counted from the register, not from the declarations, so an undeclared parameter is reported
  // as the freedom it is rather than silently absent (#1014).
  const register = paramRegister(d.construction);
  const freeCount = reportedDof(d.construction, d.figure.carrierDof);

  // NO `suiteActions`: AppFrame renders the language toggle AND the About button itself, using this
  // product's own `language` key. Passing a toggle here put two «English» buttons on the suite bar.
  return (
    <AppFrame
      title={t('title')}
      subtitle={t('subtitle')}
      /**
       * ONE look and ONE ORDER for the session actions in every builder (#1087).
       *
       * Operator: *"the buttons are not located in same locations"*. The sibling's own comment
       * states the rule this follows — שמור/טען FIRST, the image exports next, the manual last —
       * and this product passed no utility actions at all, so the row was simply absent.
       */
      utilityActions={
        <>
          <ToolButton onClick={saveFile} disabled={lines.length === 0}>
            💾 {t('save')}
          </ToolButton>
          <ToolButton onClick={() => fileRef.current?.click()}>📂 {t('load')}</ToolButton>
          <ToolButton onClick={() => void copyImage()} disabled={lines.length === 0}>
            {exportFlash === 'ok' ? `✓ ${t('copied')}` : exportFlash === 'err' ? '✕' : `⧉ ${t('copyImage')}`}
          </ToolButton>
          <ToolButton onClick={() => void saveImage()} disabled={lines.length === 0}>
            ⤓ {t('saveImage')}
          </ToolButton>
          <ToolButton onClick={() => setManualOpen(true)}>{t('manualButton')}</ToolButton>
        </>
      }
      banner={
        loadAudit ? (
          <Banner kind="notice" onDismiss={() => setLoadAudit(null)} dismissLabel={t('close')}>
            {loadAudit.failed.length
              ? t('loadPartial', {
                  restored: loadAudit.total - loadAudit.failed.length,
                  total: loadAudit.total,
                  lines: analyticBidi.isolateLtrRuns(loadAudit.failed.map((f) => f.line).join(' · ')),
                })
              : t('loadRestored', { total: loadAudit.total })}
          </Banner>
        ) : undefined
      }
      roster={roster}
      activeProductId="analytic"
      switcherLabel={t('switcherLabel')}
      switcherMoreLabel={t('switcherMore')}
      buildStamp={typeof __BUILD__ === 'string' ? __BUILD__ : undefined}
      about={{
        label: t('about'),
        title: t('aboutTitle'),
        body: t('aboutBody'),
        privacy: t('privacy'),
        closeLabel: t('close'),
      }}
    >
      {/*
        The load target must OUTLIVE any menu that opens it, so the input lives here and a button
        only clicks it — the sibling learned that when its overflow menu unmounted mid-click.
      */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onLoadFile}
      />
      <Workbench
        emptyOverlay={
          lines.length === 0 ? (
            <QuickChips
              title={t('emptyTitle')}
              hint={t('emptyHint')}
              commands={QUICK_COMMANDS}
              onPick={submit}
              display={(c) => analyticBidi.isolateLtrRuns(c)}
            />
          ) : null
        }
        inputZone={
          <>
            <InputArea
              value={draft}
              onChange={setDraft}
              onSubmit={() => submit(draft)}
              placeholder={t('inputPlaceholder')}
              submitLabel={t('add')}
              /* #1251 — the fallback is a network round-trip; the student sees it working. */
              busy={thinking}
              busyLabel={t('thinking')}
              symbols={SYMBOLS}
              /*
                NO compact chip strip above the input (#1105).

                Operator, 2026-09-16: *"on the input panel, I dont want to see the chips. behavior
                should be like 2d and 3d tools"*. `QUICK_COMMANDS` still feeds the empty-canvas
                `QuickChips` overlay below — the examples are there for the first click and in the
                manual, which is what the siblings do and all three of them have always done.

                This WITHDRAWS docs/28 §D9b's second half ("shrinking to a one-line strip above the
                input once a figure exists"). Analytic was not the deviation — it was the only product
                that ever implemented it, so the ruling is reversed rather than the code corrected.
              */
              /**
               * THE BIDI SEAMS, all four, as the siblings pass them (#1088).
               *
               * Operator, 2026-09-16: *"input panel needs to support bidi in the same way we have
               * for the other tools"*. Every line in this product is a Hebrew sentence carrying an
               * equation, so an unisolated LTR run does not merely look odd — it reorders the
               * equation's characters, and the student reads a formula they did not write.
               */
              quickDisplay={(c) => analyticBidi.isolateLtrRuns(c)}
              /**
               * THE PREVIEW TYPESETS WHAT IT PREVIEWS (#1215).
               *
               * Operator, 2026-09-19, on «מעגל (x-3)^2+(y-5)^2=25»: *"note the text below the textbox
               * isnt mathml"* — the preview printed `^2` while the fact row two lines below printed
               * `²`. The student saw their own sentence twice, typeset once.
               *
               * Nothing needed building. `InputArea`'s `preview` prop takes a **ReactNode**, and its
               * own comment says *"2-D's maths renderer rides the same prop at its adoption"*. 2-D
               * adopted it; this tree — where equations are the entire subject — did not, and
               * `hasMath`/`MathText` have been sitting in `shell/math.tsx` the whole time.
               *
               * The bidi previewer stays as the fallback, and it is not a lesser one: it is what
               * carries the RTL reading order while an equation is still half-typed. `hasMath` is
               * false until an exponent or a fraction completes, so early keystrokes take that path
               * exactly as before and no half-formed formula is ever half-typeset (ADR-W-060).
               *
               * **ISOLATE FIRST, THEN TYPESET — the order matters and was found by looking.** Handing
               * the raw string to `MathText` typeset it perfectly and laid it out backwards: the
               * renderer emits several `<math>` islands with text between them, and in an RTL
               * paragraph that whole sequence runs right-to-left, so «מעגל (x-3)²+(y-5)²=25» drew
               * with `=25` at the far LEFT. That is the defect this preview exists to prevent,
               * reintroduced by its own fix. The answer rows already do it in this order (#1097).
               */
              preview={(s) =>
                hasMath(s) ? <MathText text={analyticBidi.isolateLtrRuns(s, true)} /> : analyticBidi.inputPreview(s)
              }
              previewDir={(s) => analyticBidi.textDir(s)}
              boxDir={(s) => analyticBidi.textDir(s)}
            >
              {errorText && (
                <p role="alert" style={{ color: color.danger, fontSize: fs.small, margin: '8px 0 0' }}>
                  {errorText}
                </p>
              )}
              {/*
                An informational answer, never the danger colour and never `role="alert"` (#1045):
                the student restated something true, and styling that as an error would teach them
                that a correct restatement is a mistake. `role="status"` is the polite live region,
                which is also the right announcement for a screen reader.
              */}
              {notice && (
                <p role="status" style={{ color: color.muted, fontSize: fs.small, margin: '8px 0 0' }}>
                  {notice}
                </p>
              )}
            </InputArea>
            <FactList
              rows={lines.map((line, i) => ({
                id: String(i),
                /**
                 * THE GIVEN ROWS ARE MATHML TOO (#1097).
                 *
                 * Operator, 2026-09-16: *"input panel is not mathml"*. The #1082 ruling was applied
                 * to the DATA panel and not to this one, so a student typed `(x-3)^2` and read `^2`
                 * back in the one place they go to check what they told the tool.
                 *
                 * ISOLATE FIRST, then typeset: the bidi runs are decided by `shell/bidi` (the seam
                 * #1088 vindicated), and `mathHtml` escapes everything that is not a maths token, so
                 * the isolate characters ride through untouched and the Hebrew stays Hebrew.
                 *
                 * PRESENTATION ONLY. `editValueOf` below still returns the raw typed line, so ✎
                 * shows what the student wrote rather than a re-serialisation — the same rule
                 * `QuickChips`' `display` follows.
                 */
                content: <MathText text={analyticBidi.isolateLtrRuns(line)} />,
                error: d.faults.find((f) => f.index === i)?.detail,
              }))}
              emptyHint={t('factsEmpty')}
              editDir={(s) => analyticBidi.textDir(s)}
              editValueOf={(id) => lines[Number(id)] ?? ''}
              onEditCommit={(id, next) => {
                const i = Number(id);
                const trial = derive(lines.map((l, j) => (j === i ? next : l)), seed);
                if (trial.faults.some((f) => f.index === i)) return false;
                // #1300 — an edit rewrites a line in place, so a replay without it diverges silently.
                logAnalytic({ kind: 'action', action: 'edit', detail: `${i}:${next}` });
                replaceLine(i, next);
                return true;
              }}
              onDelete={(id) => {
                logAnalytic({ kind: 'action', action: 'delete', detail: lines[Number(id)] ?? id });
                removeLine(Number(id));
              }}
              footer={
                /* CLEAR-ALL MOVED to the under-canvas row (#1098) — it acts on the figure, like
                   undo/redo, and #739 made that call for complex for the same reason. What stays
                   here is the COUNT, which is about this list. */
                <span style={{ fontSize: fs.small, color: color.muted }}>
                  {t('factCount', { count: lines.length })}
                </span>
              }
              testId="analytic-facts"
            />
          </>
        }
        canvasZone={
          <>
            {/*
              THE FIGURE'S NAME, CENTRED ABOVE THE CANVAS (#1098).
              `FigureName`'s own docblock carries the operator's B3 ruling — *"the name is CENTERED
              ABOVE THE CANVAS, because it names the drawing"* — and warns that a field standardized
              in two products "drifts a third time" otherwise. #1087 mounted it in the INPUT zone and
              drifted it a fourth, in the change whose purpose was parity. Both siblings mount it as
              the first child of `canvasZone`; so does this now.
            */}
            <FigureName value={name} onChange={setName} placeholder={t('namePlaceholder')} />
          <div
            ref={viewportRef}
            /**
             * `flex: 1` + `minHeight: 0`, NOT `height: 100%` (#1106).
             *
             * The canvas card is a fixed-height flex column holding three children: the figure name,
             * this viewport, and the ADR-W-023 action row (undo · redo · clear-all). `height: 100%`
             * resolves against the CARD, so this child alone was as tall as all three and the row was
             * pushed 51px past a page that cannot scroll — present in the markup, unreachable on
             * screen. `flex: 1` means "take what is left after my siblings", which is the shape both
             * 2-D and 3-D use. `minHeight: 0` is not optional: without it a flex item refuses to
             * shrink below its content and the overflow returns.
             */
            style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, touchAction: 'none' }}
            /**
             * DRAG TO MOVE (#1094). Pointer capture so a drag that leaves the canvas keeps tracking;
             * without it the view sticks the moment the cursor crosses the edge.
             *
             * The drag's ORIGIN view is captured once and every move measured from it, rather than
             * accumulating deltas — accumulation drifts, and drift here means the drawing slides out
             * from under the cursor.
             */
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              // NO capture here (#1101) — see `dragRef`. A press is not yet a drag.
              dragRef.current = { x: e.clientX, y: e.clientY, view: viewRef.current, moved: false };
            }}
            onPointerMove={(e) => {
              const start = dragRef.current;
              if (!start) return;
              const dx = e.clientX - start.x;
              const dy = e.clientY - start.y;
              if (!start.moved) {
                // A few pixels of tremor is a click, not a pan — the threshold is what makes a dot
                // on the canvas clickable with a real hand.
                if (Math.hypot(dx, dy) < DRAG_SLOP) return;
                start.moved = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }
              const rect = e.currentTarget.getBoundingClientRect();
              setView(panned(figureBoxRef.current, start.view, dx, dy, rect));
            }}
            onPointerUp={(e) => {
              dragRef.current = null;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          >
            <Figure
              scene={scene}
              showConstruction={showConstruction}
              /* A click on a crossing ADDS ITS SENTENCE — the same line typing it would add. */
              /**
               * A click on a ring ADDS ITS SENTENCE — the same line typing it would add — and then
               * shows the solution the student actually clicked (#1096).
               *
               * A line meets a conic twice, so both rings carry the same words; without the second
               * half, clicking the right-hand crossing could land the point on the left one. The
               * seed search costs nothing here because it runs once, on a click.
               */
              /**
               * Clicking an object offers what can be MEASURED about it (#1048), as sentences the
               * student could have typed. Nothing is measured here: choosing one asks the ask lane,
               * which is the single path to an answer.
               */
              onPick={(what, screen) => {
                const items = measurablesOf(d.construction, what);
                setPick(items.length ? { items, x: screen.x, y: screen.y } : null);
              }}
              onCrossing={(sentence) => {
                // A GUARD, not a second decision: `submit` still owns whether the line is accepted
                // and what the student is told. This only asks whether jumping the configuration
                // afterwards would be meaningful, because moving the figure for a refused line
                // would be a change the student did not ask for.
                /**
                 * #1269: NO seed jump. The sentence now DENOTES the ring — a crossing on a drawn
                 * segment commits the bounded noun, and #1168’s ruling puts the point on the root
                 * inside that piece — so nothing has to move the figure to make the click look right.
                 *
                 * The jump was the defect: the seed is FIGURE-WIDE, so the configuration chosen to
                 * show the newest crossing re-rolled every crossing named before it. The operator saw
                 * exactly that — three clicks, and only the last one stayed where he put it.
                 */
                submit(sentence);
              }}
            />
            {/*
              `dir="ltr"` (#1098) — NOT a change to the shared style, which was right all along.
              `canvasClusterStyle` uses `insetInlineEnd`, and under this product's RTL page that
              resolves to the LEFT while the siblings' clusters sit right. 2-D wraps its cluster the
              same way (`src/render/Figure.tsx`), which is what made the difference measurable rather
              than a matter of taste — and why the fix is here and not in `canvasControls.ts`, where
              it would have moved the cluster in all four products.
            */}
            <div style={canvasClusterStyle} dir="ltr">
              {/* ↺ restores BOTH zoom and centre, and re-arms the auto-centre (#1094). */}
              <button type="button" style={canvasCtrlStyle} onClick={() => setView(INITIAL_VIEW)} aria-label="reset">
                ↺
              </button>
              <button
                type="button"
                style={canvasCtrlStyle}
                onClick={() => setView((v) => zoomedAt(figureBoxRef.current, v, 1 / CANVAS_ZOOM_STEP, v.centre ?? centreOf(figureBoxRef.current)))}
                aria-label="zoom out"
              >
                −
              </button>
              <button
                type="button"
                style={canvasCtrlStyle}
                onClick={() => setView((v) => zoomedAt(figureBoxRef.current, v, CANVAS_ZOOM_STEP, v.centre ?? centreOf(figureBoxRef.current)))}
                aria-label="zoom in"
              >
                +
              </button>
            </div>
          </div>

          {/*
            THE UNDER-CANVAS ROW (#1098) — the suite's row, from the suite's styles.

            `shell/frame/figureRow` states the contract in its own docblock:

              [accent alternatives-button] … product extras … [spacer] … [subtle undo/redo/clear]

            ...and exists because "Same members, three implementations — the #734 class." This
            builder never imported it, so it was the FOURTH implementation: its actions floated over
            the canvas corner, clear-all sat in the fact-list footer, and undo/redo did not exist.
            `row-parity.test.ts` asserts exactly this shape for complex and does not know this
            product exists (#1090) — widened in this change, so builder five fails there instead of
            in front of a student.
          */}
          <div style={figureRowStyle}>
            <button
              type="button"
              style={lines.length === 0 ? rowAccentOffStyle : rowAccentStyle}
              disabled={lines.length === 0}
              onClick={() => {
                /**
                 * The button asks for what it PROMISES — a figure that differs (#1084).
                 *
                 * Incrementing the seed redrew the same picture for the first few presses on the
                 * operator's own figure, while the DOF cue beside it said the figure still had
                 * freedom. When nothing differs, saying so beats redrawing in silence.
                 */
                const next = anotherConfiguration(lines, seed);
                // #1300: the seed IS the configuration, so a replay that loses this press redraws a
                // different figure from the one the report is about.
                logAnalytic({ kind: 'action', action: 'show-another', detail: next.found ? next.seed : 'none' });
                if (next.found) goToSeed(next.seed);
                else setNotice(t('noticeOnlyConfiguration'));
              }}
            >
              {t('another')}
            </button>

            {/* A product EXTRA, which the contract allows between the accent and the spacer. Offered
                only when there IS a construction to show, so the control never promises something
                the figure cannot deliver. */}
            {d.figure.construction.length > 0 && (
              <button type="button" style={rowSubtleStyle} onClick={() => setShowConstruction((v) => !v)}>
                {t(showConstruction ? 'hideConstruction' : 'showConstruction')}
              </button>
            )}

            <span style={rowSpacerStyle} />

            <button
              type="button"
              style={canUndo ? rowSubtleStyle : rowSubtleOffStyle}
              disabled={!canUndo}
              onClick={() => {
                logAnalytic({ kind: 'action', action: 'undo' }); // #1300
                undo();
              }}
            >
              {t('undo')}
            </button>
            <button
              type="button"
              style={canRedo ? rowSubtleStyle : rowSubtleOffStyle}
              disabled={!canRedo}
              onClick={() => {
                logAnalytic({ kind: 'action', action: 'redo' }); // #1300
                redo();
              }}
            >
              {t('redo')}
            </button>
            {/* Clear-all wears the danger tone over the subtle shape, and sits HERE rather than on
                the fact list's footer — the same correction #739 made for complex. */}
            <button
              type="button"
              style={lines.length > 0 ? { ...rowSubtleStyle, color: rowDangerInk } : rowSubtleOffStyle}
              disabled={lines.length === 0}
              onClick={clearSession}
            >
              {t('clearAll')}
            </button>
          </div>
        </>
        }
        dataZone={
          <DataPanel
            title={t('dataTitle')}
            open={dataOpen}
            onToggle={() => setDataOpen((v) => !v)}
            showLabel={t('dataShow')}
            hideLabel={t('dataHide')}
            status={freeCount > 0 ? t('freeDof', { count: freeCount }) : t('pinned')}
            sections={[
              {
                key: 'params',
                title: t('secParams'),
                dir: 'ltr',
                rows: register.map((p) => (
                  <span key={p.sym}><ValueRow text={domainText(p.sym, p.domain)} /></span>
                )),
              },
              {
                key: 'points',
                title: t('secPoints'),
                dir: 'ltr',
                rows: positionalOf(d.construction).map((p) => {
                  // The honesty gate (ADR-AG-003 §2): a coordinate is printed only when it is
                  // KNOWLEDGE — the same value at every seed — never one sample's number.
                  const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === p.id)?.x ?? null);
                  const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === p.id)?.y ?? null);
                  return (
                    <span key={p.id}>
                      <ValueRow text={`${p.id} = ${pointText(d, p.id, kx, ky)}`} />
                    </span>
                  );
                }),
              },
              {
                key: 'curves',
                title: t('secEquations'),
                dir: 'ltr',
                /**
                 * A CARRIER gets no row (#1078) — an operator ruling that reverses the panel half of
                 * ADR-AG-032.
                 *
                 * That ADR kept a carrier here, reasoning it was "the honest provenance of where B
                 * lives". Played, the reasoning does not survive: *"the part where it shows -x+y=0 is
                 * meaningless since the line is not really drawn and in any case there is no way to
                 * know what it belongs to"*. A curve row cannot say WHOSE carrier it is — it sits
                 * unlabelled, next to no point, for a line the student never asked to see.
                 *
                 * The information is real and this was the wrong home for it: it belongs on the POINT,
                 * which is what the coordinate rows below now say. The flag means one thing in both
                 * places — undrawn on the canvas, unlisted here.
                 */
                /**
                 * …AND A MENTIONED ONE DOES (#1250). The ruling above is about an ORPHANED row, not
                 * an undrawn one — the operator's objection was verbatim *"there is no way to know
                 * what it belongs to"*.
                 *
                 * Those two coincided until [ADR-AG-111] made a mentioned line UNDRAWN for the first
                 * time: «משוואת הצלע CE היא x-3y=0» draws only the segment, so `stated` is false, and
                 * the equation the student wrote vanished from the one place they check what the tool
                 * understood — while «משוואת הישר CE» kept its row. Same equation, same object.
                 *
                 * Operator ruling, 2026-09-19: *"if we say that a point is on a line, we dont draw the
                 * line but if we specifically mention a line, we should have its equation."* So the
                 * panel asks whether the line was MENTIONED, and the canvas keeps asking `stated`.
                 *
                 * `label.name` IS "mentioned", and not by coincidence: a line the student made the
                 * subject of a sentence is one they referred to by name, while a line minted only to
                 * hold a point (#1078's «B על הישר y=x») has nothing to call it. No second flag — one
                 * would have to be set correctly at every mint site, and the name already answers
                 * truthfully at all of them.
                 */
                rows: d.figure.curves.filter(panelListsCurve).map((c) => {
                  // The SAME honesty gate the point rows use: an equation prints only when every
                  // coefficient is invariant across the free DOFs. A parabola whose `a` is still
                  // free is drawn, and its row is open — never a sampled coefficient as fact.
                  const known = knownCurve(d.construction, c.id);
                  /**
                   * An UNNAMED curve prints no name — never its id (#1026).
                   *
                   * The fallback used to be `c.id`, which put `circle-anonq3c8qq` in front of a
                   * student inside an RTL Hebrew panel: internal state on screen, which the honesty
                   * invariants forbid and which #1029 had already caught in its other form. It was
                   * invisible while the ids read `parabola` and `ellipse` and would have become
                   * unmissable the moment content-derived ids landed. The row needs no name anyway:
                   * `curveParts` prints the equation, which is what tells two anonymous parabolas
                   * apart — and it is the student's own equation, not ours.
                   */
                  const name = c.label.name;
                  /**
                   * A curve the givens have not FIXED still has an equation, and the student wrote it
                   * (#1023). Printing a dash threw it away: «נתונה פרבולה שמשוואתה y²=2px» read as `—`
                   * on a row that could have said `y^2 - 2·p·x = 0`.
                   *
                   * It states no VALUE, so ADR-AG-003 §2 is untouched — it names the dependency, which
                   * is more than the dash said and less than a number.
                   */
                  const lead = name ? `${name}: ` : '';
                  /**
                   * THE ROW LEADS WITH THE EQUATION; THE PROPERTIES FOLD AWAY (#1212).
                   *
                   * Operator, playing T18: *"the circle equation is not an equation. under equations
                   * we should see the equation and then we can have the center and radius. these
                   * should be collapsable like i requested for the line equations"*.
                   *
                   * Same `<details>` as the ask lane's trace (#1206), and shown by the same reasoning:
                   * the centre and radius ARE what a student was given for a stated circle, so folding
                   * them shut by default would hide the givens. It is an opt-out, not a demotion.
                   *
                   * A line has no `details` and so gets no disclosure at all — its row is untouched.
                   */
                  // #1167 — the panel asks WHO occupies a described position instead of inventing a
                  // letter for it. Same function the centre ring uses, so the two cannot disagree.
                  const parts = known ? curveParts(known, (x, y) => pointAt(d.figure, x, y), { vertical: t('slopeVertical') }) : null;
                  return (
                    <span key={c.id}>
                      <ValueRow text={parts ? `${lead}${parts.equation}` : `${lead}${openCurveText(d, c.id)}`} />
                      {parts?.details && (
                        <details style={askTraceBox} open>
                          <summary style={askTraceToggle} title={t('curveDetailsToggle')}>
                            {/*
                              THE LABEL NAMES THE KIND, IN THE STUDENT'S WORD (#1214).

                              It said «נתוני העקום» — the internal category (`kind: 'curve'`) reaching
                              a student, which is the defect #1147 removed from the heading above it
                              hours earlier, reintroduced by the label #1212 added. `curveDetailsKey`
                              is total over the kinds that HAVE details, so a fifth conic cannot ship
                              a blank summary.
                            */}
                            {t(curveDetailsKey(known!.kind))}
                          </summary>
                          <div style={askTrace}>
                            <MathText text={braced(parts.details)} />
                          </div>
                        </details>
                      )}
                    </span>
                  );
                }),
              },
              {
                key: 'slopes',
                title: t('secSlopes'),
                dir: 'ltr',
                /**
                 * Every drawn segment’s SLOPE (#1078).
                 *
                 * Operator, 2026-09-15, on a figure with «AB מקביל לציר ה-x» and «BC מקביל לציר ה-y»:
                 * *"in this case, the data panel should show the slope of AB and BC"*. He is right,
                 * and it is the sharpest possible case for it: in that figure the lengths and the
                 * coordinates are all open, and the two SLOPES are the only things the givens fix.
                 * A panel that showed only lengths said "nothing is known" about a figure that knows
                 * two things.
                 *
                 * Gated exactly as every other row. A VERTICAL segment has no slope, and saying so is
                 * knowledge too — «אנכי» is an answer, not an absence, and it is what «BC מקביל לציר
                 * ה-y» tells the student.
                 */
                rows: uniqueSegments(d.figure.segments).map((seg) => {
                  const [a, b] = seg.ends;
                  const read = (f: typeof d.figure) => {
                    const p1 = f.points.find((q) => q.id === a);
                    const p2 = f.points.find((q) => q.id === b);
                    return p1 && p2 ? { dx: p2.x - p1.x, dy: p2.y - p1.y } : null;
                  };
                  // Vertical is judged on the DIRECTION, not on the quotient: dy/dx is Infinity there
                  // and `isKnowledge` would call an infinity "not finite" and print nothing.
                  // #1276: this row was RIGHT and alone — the ratio and its tolerance moved to
                  // `engine/lines` so the trace and the equation printers ask the same question.
                  const vertical = isKnowledge(d.construction, (f) => {
                    const v = read(f);
                    return v === null ? null : verticality(v.dx, v.dy);
                  });
                  if (vertical.known && vertical.value < VERTICAL_TOL) {
                    return <span key={seg.id}><ValueRow text={`${a}${b}: ${t('slopeVertical')}`} /></span>;
                  }
                  const k = isKnowledge(d.construction, (f) => {
                    const v = read(f);
                    return v === null || Math.abs(v.dx) < 1e-12 ? null : v.dy / v.dx;
                  });
                  return <span key={seg.id}><ValueRow text={`${a}${b}: ${k.known ? fmt(k.value) : '—'}`} /></span>;
                }),
              },
              {
                key: 'lengths',
                title: t('secLengths'),
                dir: 'ltr',
                /**
                 * Every drawn segment’s length (#1065).
                 *
                 * The engine had these all along — `isKnowledge` returns 10 for `|AB|` after
                 * «AB = 10» and correctly REFUSES to call `|AC|` known until «AB = AC» arrives.
                 * Nothing printed them, which is #1020’s shape for the third time in this product:
                 * a mechanism that exists, is correct, and has no caller.
                 *
                 * Gated exactly as the coordinate and equation rows are. A length that still moves
                 * with a free DOF prints `—`, never one seed’s sample.
                 */
                rows: uniqueSegments(d.figure.segments).map((s) => {
                  const [a, b] = s.ends;
                  const k = isKnowledge(d.construction, (f) => {
                    const p1 = f.points.find((q) => q.id === a);
                    const p2 = f.points.find((q) => q.id === b);
                    return p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : null;
                  });
                  return (
                    <span key={s.id}><ValueRow text={`${a}${b} = ${k.known ? fmt(k.value) : '—'}`} /></span>
                  );
                }),
              },
            ]}
          >
            {/*
              The ask lane is ALWAYS there — never behind a button, never gated on a computation
              having run (ADR-W-038, the shell's rule). What is product-shaped is the ANSWER rows,
              which is why they are this file’s and the box is not.
            */}
            <div style={{ marginTop: 10 }}>
              {answers.map((a, i) => (
                <div key={`${a.question}-${i}`} style={askRow} dir="ltr">
                  {/*
                    RETIRE THIS MEASUREMENT (#1118) — the same affordance the fact rows carry, and the
                    one that also removes the height it drew, because the drawing lives on the answer.
                  */}
                  <button
                    type="button"
                    style={askDismiss}
                    aria-label={t('askRemove')}
                    title={t('askRemove')}
                    onClick={() => setQueries(removeAnswerAt(queries, i))}
                  >
                    ✕
                  </button>
                  <div style={askAnswerCol}>
                    {/*
                      THE ANSWER ROW IS TYPESET, AND PUNCTUATED (#1117 + #1112).

                      Operator: *"we don't have MathML in the input in the data panel"* — the row said
                      `המרחק מ-A לישר l1 = 2.6` in plain glyphs while the formula directly beneath it was
                      typeset, so one line contradicted the next.

                      And *"the last one משוואת AB = -2x + y = 0 should be משוואת AB: -2x + y = 0"*. The
                      row is built as `question SEP value`, and when the VALUE is itself an equation the
                      row carries two `=` and reads as a broken statement. The separator is therefore
                      chosen from the value's CONTENT rather than from which rule answered: a value that
                      is already an equation cannot be joined to its question with another `=`. That is
                      one rule for every present and future question kind, instead of a list of the ones
                      that happen to return equations.
                    */}
                    {a.missing ? (
                      `${a.question} — ${t(a.missing.kind === 'point' ? 'askMissingPoint' : 'askMissingCurve', { name: a.missing.name })}`
                    ) : a.unreadable ? (
                      `${a.question} — ${t('askUnreadable')}`
                    ) : (
                      <MathText
                        text={analyticBidi.isolateLtrRuns(
                          /**
                           * A VERTICAL SLOPE IS AN ANSWER, NOT A FAILURE (#1223).
                           *
                           * `a.fact` is checked before the `figureIsOpen` guess, because that guess
                           * only ever chooses between two kinds of *absence* and this is neither. It
                           * reuses `slopeVertical` — the string the «שיפועים» section already prints
                           * for a vertical segment — so the two surfaces cannot come to disagree
                           * about what a vertical thing's slope is.
                           */
                          `${a.question}${a.value && a.value.includes('=') ? ':' : ' ='} ${
                            a.value ??
                            (a.fact === 'vertical'
                              ? t('slopeVertical')
                              : a.fact === 'lines-cross'
                                ? t('askLinesCross')
                                : t(figureIsOpen(d) ? 'askOpen' : 'askNoValue'))
                          }`,
                        )}
                      />
                    )}

                    {/*
                      HOW IT WAS REACHED (#1053), ON ITS OWN ROW AND FOLDABLE (#1206).

                      The formula with this figure's numbers in it. Operator, on #1053: *"we don't just
                      show the result — we show what to use to get to this result"*, at the level he
                      ruled: substituted, never worked through. Typeset as MathML like everything else
                      numeric here (#1097), and quieter than the answer, because it is the method and
                      not the result.

                      Operator, playing T1: *"having all the equations in one line doesnt look nice so we
                      should have each line on a new row. we should be able to collapse the items so if
                      user doesnt want to see them, only the equation is shown"*.

                      It sat here as a FLEX SIBLING of the answer, so the two shared one baseline however
                      the trace was styled — its own `marginTop` could never apply. It is now inside the
                      answer's column, which is what puts it on its own line; the `✕` stays beside the
                      answer's first line rather than centring against a two-line block.

                      SHOWN by default, deliberately: #1053 is an operator ruling that the method is part
                      of the answer — *"we don't just show the result — we show what to use to get to this
                      result"* — so collapsing it by default would quietly reverse that. The request is an
                      opt-out, and `<details>` gives the student one for free: keyboard-reachable, out of
                      the accessibility tree when closed, and no state for this component to hold.
                    */}
                    {a.trace && (
                      <details style={askTraceBox} open>
                        <summary style={askTraceToggle} title={t('askTraceToggle')}>
                          {t('askTraceLabel')}
                        </summary>
                        {/*
                          ONE STATEMENT, ONE ROW (#1221).

                          Operator, playing T25: *"never include more than 2 equations in a line"*.
                          The trace carried two statements joined by a comma and rendered them on one
                          line; #1125 had already established they ARE two («m = (4-0)/(3-0), y - 0 =
                          …» is why `EXPR` carries no comma), so the separator became a newline and
                          each part gets its own row.

                          Split rather than `white-space: pre-line`, deliberately: each row is then
                          typeset independently, so a fraction is found inside ITS statement rather
                          than inside a run containing two of them.
                        */}
                        <div style={askTrace}>
                          {a.trace.split('\n').map((step, k) => (
                            <div key={k}>
                              <MathText text={step} />
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              <AskLane
                value={askText}
                onChange={setAskText}
                inputRef={askRef}
                dir="auto"
                placeholder={t('askPlaceholder')}
                addLabel={t('askAdd')}
                onSubmit={(text) => {
                  // Idempotent, not a toggle (#1118) — see `askOnce`.
                  askOnce(text);
                  return true;
                }}
                palette={{
                  symbols: SYMBOLS,
                  symbolTitle: (sy) => (sy.titleKey ? t(sy.titleKey) : sy.label),
                  startCollapsed: true,
                  compact: true,
                  toggleTitle: t('paletteShow'),
                }}
              />
            </div>
          </DataPanel>
        }
      />
      {/*
        THE MEASURE MENU (#1048).

        Rendered at PAGE level rather than inside the canvas so it never scales with the zoom and
        never clips at the canvas edge. A click anywhere else closes it — a menu that needs its own
        dismiss button is one the student has to learn.
      */}
      {pick && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setPick(null)}
            aria-hidden="true"
          />
          <div style={{ ...measureMenu, left: pick.x + 6, top: pick.y + 6 }} role="menu">
            {pick.items.map((m) => (
              <button
                key={m.sentence}
                type="button"
                role="menuitem"
                style={measureItem}
                onClick={() => {
                  // The SAME path the typed lane takes — one grammar, one answer (ADR-AG-044).
                  toggleAsk(m.sentence);
                  setPick(null);
                }}
              >
                {/*
                  An entry whose DRAWING is on the canvas offers to clear it, and says so (#1118).
                  The row stays either way — the operator's ruling: the panel is a record, the canvas
                  is a view of it.
                */}
                {isDrawn(queries, m.sentence) && (
                  <span aria-hidden="true" style={{ opacity: 0.6, marginInlineEnd: 6 }}>✕</span>
                )}
                <MathText text={analyticBidi.isolateLtrRuns(m.sentence)} />
              </button>
            ))}
          </div>
        </>
      )}

      {/*
        THE MANUAL (#1087) — this product has a command catalog and had no screen showing it, so the
        only way to learn the grammar was to guess. Every entry is one the parse lock already proves
        builds, so the guide cannot advertise a sentence the tool cannot read.
      */}
      <ManualScreen
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title={t('manualTitle')}
        intro={t('manualIntro')}
        closeLabel={t('close')}
        tryHint={t('manualTry')}
        sectionCap={6}
        moreNote={t('manualMore')}
        sections={MANUAL_SECTIONS.map((section) => ({
          key: section.key,
          title: t(section.titleKey),
          entries: COMMAND_CATALOG_ANALYTIC.filter((e) => e.category === section.key).map((e) => {
            const raw = i18n.language === 'he' ? e.he : e.en;
            return {
              example: analyticBidi.isolateLtrRuns(raw),
              dir: analyticBidi.textDir(raw) as 'rtl' | 'ltr',
              onTry: () => {
                setManualOpen(false);
                submit(raw);
              },
            };
          }),
        })).filter((s) => s.entries.length > 0)}
      />
    </AppFrame>
  );
}

/**
 * One row per PAIR of endpoints (#1065).
 *
 * A polygon emits one drawn piece per side, and a student who also states «הקטע AB» would
 * otherwise see `AB` twice. The length is a property of the two points, not of how many things
 * happen to be drawn between them.
 */
function uniqueSegments(segments: readonly { id: string; ends: [string, string] }[]) {
  const seen = new Set<string>();
  return segments.filter((s) => {
    const key = [...s.ends].sort().join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/**
 * Display precision, delegated to the workspace's ONE chokepoint (#1029).
 *
 * This tree kept a private `toPrecision(10)` rounder, which is the thing `shell/format.ts` exists to
 * prevent and which broke the operator's standing two-decimal ruling (#723) the moment the tool
 * computed its first non-terminating coordinate — a centroid printed as `-1.666666667`.
 *
 * The sub-epsilon clamp stays: a derived point that lands on an axis should read `0`, not `-1e-17`
 * rounded to `-0`.
 */
function fmt(v: number): string {
  // #1120 — EXACT FORMS FIRST. The slope of `y=(4/3)x` is 4/3, and printing `1.33` states a different
  // number. The clamp and the decimal fallback live inside `fmtAnalytic`, which is this tree's one
  // display formatter so the panel and the canvas cannot disagree.
  return fmtAnalytic(v);
}

/**
 * What the givens SAY about a point, as the panel should read it (#1078).
 *
 * Operator, 2026-09-15: *"B should be something like (t,t) showing we collapsed the y based on the
 * x"*. Three answers, in order of how much the figure knows:
 *
 *  - both coordinates are knowledge → the numbers;
 *  - the point rides a LINE → the free coordinate as a symbol, and the other as the expression the
 *    line makes of it: `B = (x_B, x_B)` for `y = x`;
 *  - otherwise → the open row this always showed.
 *
 * The middle answer prints no VALUE, so it does not weaken ADR-AG-003 §2 — it names a dependency,
 * and it is strictly more honest than the dash, which said "unknown" where the truth was "unknown
 * in one coordinate and determined by it in the other".
 *
 * The component symbol is the point’s own (`x_B`), which is the convention #1032 set and the canvas
 * already prints. The operator wrote `(t,t)`; a shared `t` would say two different points on one
 * line were the same point, which is why this keeps the established form.
 */
function pointText(
  d: ReturnType<typeof derive>,
  id: string,
  kx: { known: boolean; value?: number },
  ky: { known: boolean; value?: number },
): string {
  if (kx.known && ky.known) return `(${fmt(kx.value as number)}, ${fmt(ky.value as number)})`;

  /**
   * A DISCRETE SET of positions (#1036) — «הבחן בין שני מקרים», which the corpus asks about six
   * times in the forty «lines and points» exercises.
   *
   * Asked SECOND, after the determined case and before the dependency: neither member is
   * knowledge, but the set is, and printing one member alone would be the cardinal sin while
   * printing nothing throws away the shape of the answer the exam is asking for.
   */
  const options = knownOptions(d.construction, (f) => {
    const q = f.points.find((r) => r.id === id);
    return q ? [q.x, q.y] : null;
  });
  if (options) {
    // The DRAWN one is marked, which is what connects this row to «הציגו תצורה אחרת».
    const here = d.figure.points.find((q) => q.id === id);
    return options
      .map((v) => {
        const text = `(${fmt(v[0])}, ${fmt(v[1])})`;
        const drawn = here && Math.hypot(here.x - v[0], here.y - v[1]) < 1e-6;
        return drawn ? `[${text}]` : text;
      })
      .join(' או ');
  }

  /**
   * A COORDINATE THE STUDENT WROTE IS SHOWN, EVEN WHEN IT IS NOT A NUMBER (#1226).
   *
   * Operator, playing T32 on «A(-9a,0)» / «B(41a,0)»: *"9a and 41a are still not shown on the canvas
   * or data panel which is wrong."*
   *
   * The tool holds `A.x` as `mul(neg(9), sym a)` — his own `-9a`, exactly — and `exprText` has
   * rendered it all along. The row printed `(x_A, 0)` instead: the tool's OWN symbol substituted for
   * the student's expression, which is worse than the dash it replaced. *"Everything the student
   * stated is visible on the figure"* is the invariant, and `-9a` was stated.
   *
   * This is #1023's fix for the other object kind, in its own words: *"it states no VALUE, so
   * ADR-AG-003 §2 is untouched — it names the dependency, which is more than the dash said and less
   * than a number."*
   *
   * Only a STATED point (`kind: 'point'`) with a non-numeric coordinate. A carrier point is `free`
   * and a midpoint is `derived`, so neither the `(x_B, x_B)` reading below nor the derived rows can
   * be reached by this branch — measured, not assumed.
   */
  const stated = d.construction.objects.find((o) => o.id === id);
  if (stated?.kind === 'point' && (stated.x.kind !== 'num' || stated.y.kind !== 'num')) {
    return `(${exprText(stated.x)}, ${exprText(stated.y)})`;
  }

  const on = d.construction.constraints.find(
    (k) => k.t === 'on-curve' && k.id === id,
  );
  if (on && on.t === 'on-curve') {
    // The SAME gate the curve rows use: a carrier whose coefficients still move says nothing here.
    const line = knownCurve(d.construction, on.curve);
    if (line && line.kind === 'line' && Math.abs(line.b) > 1e-12 && Math.abs(line.a) > 1e-12) {
      const slope = -line.a / line.b;
      const intercept = -line.c / line.b;
      const sx = `x_${id}`;
      const term = Math.abs(slope - 1) < 1e-12 ? sx : Math.abs(slope + 1) < 1e-12 ? `-${sx}` : `${fmt(slope)}·${sx}`;
      const tail = Math.abs(intercept) < 1e-12 ? '' : intercept > 0 ? ` + ${fmt(intercept)}` : ` - ${fmt(-intercept)}`;
      return `(${sx}, ${term}${tail})`;
    }
  }

  // One coordinate pinned and the other open — «B על ציר ה-x» — reads the same way.
  if (kx.known !== ky.known) {
    return kx.known ? `(${fmt(kx.value as number)}, y_${id})` : `(x_${id}, ${fmt(ky.value as number)})`;
  }
  return '—';
}


/**
 * A value row, rendered as MATHEMATICS (#1082).
 *
 * Operator, 2026-09-15: *"data panel should be in mathml"*, looking at `B = (x_B, -x_B + 2)` — a
 * subscript printed as an underscore and a power as a caret.
 *
 * It goes through the SHARED renderer (`shell/math`, ADR-W-040), which 2-D and 3-D already use, and
 * not through an emitter of this product's own: a second implementation beside a shared component is
 * the fork the shell exists to prevent, and this panel needs nothing the shared one lacks.
 *
 * The one adjustment is at the DISPLAY boundary: that renderer reads `x_{B}`, while the engine's
 * symbols are `x_B` and `r_O` — names they must keep, because they are what the expressions are
 * built from. The braces are added here, where the string stops being data and becomes type.
 */
const braced = (text: string): string => text.replace(/([A-Za-z])_([A-Za-z0-9]+)/g, '$1_{$2}');

const ValueRow = ({ text }: { text: string }) => <MathText text={braced(text)} />;

/**
 * The manual's sections, in teaching order (#1087).
 *
 * The CATEGORIES are the catalog's own; what this adds is the order a student meets them in, which
 * is a pedagogical choice and not a property of the grammar — points before the things built on
 * them, relations last because they are statements ABOUT a figure.
 */
const MANUAL_SECTIONS = [
  { key: 'points' as const, titleKey: 'manualPoints' },
  { key: 'lines' as const, titleKey: 'manualLines' },
  { key: 'circles' as const, titleKey: 'manualCircles' },
  { key: 'conics' as const, titleKey: 'manualConics' },
  { key: 'shapes' as const, titleKey: 'manualShapes' },
  { key: 'derived' as const, titleKey: 'manualDerived' },
  { key: 'relations' as const, titleKey: 'manualRelations' },
  { key: 'parameters' as const, titleKey: 'manualParameters' },
];

/** An answered question, reading like the inventory rows it sits under. */
/** The method line under an answer (#1053) — present but subordinate to the value it explains. */
const askTrace: CSSProperties = {
  marginTop: 2,
  fontSize: fs.small,
  color: color.muted,
};

/** The measure menu (#1048) — a small list at the click, over everything. */
const measureMenu: CSSProperties = {
  position: 'fixed',
  zIndex: 41,
  background: '#fff',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
  padding: 4,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 180,
};

const measureItem: CSSProperties = {
  textAlign: 'start',
  padding: '7px 10px',
  border: 'none',
  background: 'none',
  borderRadius: 7,
  cursor: 'pointer',
  fontSize: fs.small,
  color: color.ink,
};

const askRow: CSSProperties = {
  fontSize: 13,
  padding: '2px 0',
  opacity: 0.9,
  display: 'flex',
  // `flex-start`, not `baseline` (#1206): the row's second child is now a COLUMN that may be two
  // lines tall, and a baseline would centre the dismiss button against the whole block.
  alignItems: 'flex-start',
  gap: 6,
};

/** The answer and its derivation, stacked — what actually puts the trace on its own line (#1206). */
const askAnswerCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0, // so a long equation wraps inside the column instead of widening the panel
};

/** The disclosure around the trace. `<details>` carries the open/closed state, so nothing here does. */
const askTraceBox: CSSProperties = {
  marginTop: 1,
};

/**
 * The fold control — quiet, because the METHOD is secondary to the answer above it.
 *
 * The native disclosure marker is KEPT. Hiding it (`list-style: none`) left the label reading as inert
 * grey text with nothing to say it could be clicked — caught by looking at the rendered row, which is
 * the only way a layout change is actually judged.
 */
const askTraceToggle: CSSProperties = {
  cursor: 'pointer',
  fontSize: fs.small,
  color: color.muted,
  userSelect: 'none',
};

/** The ✕ that retires a measurement (#1118) — quiet, and never louder than the answer it removes. */
const askDismiss: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: color.muted,
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
  flex: 'none',
};

/**
 * What an UNFIXED curve row says (#1023).
 *
 * Its own equation, symbolically, when it has one — and for a circle given by its CENTRE (#1060),
 * the centre and radius it was stated with, because that IS how the student wrote it.
 *
 * Falls back to the dash only when there is nothing truthful to say, which after this is rare.
 */
function openCurveText(d: ReturnType<typeof derive>, id: string): string {
  const o = d.construction.objects.find((q) => q.id === id);
  if (o?.kind === 'curve') return `${exprText(o.curve.eq)} = 0`;
  if (o?.kind === 'circle-at') return `O(${o.centre}), r = ${exprText(o.r)}`;
  return '—';
}
