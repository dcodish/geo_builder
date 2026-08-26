import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AppFrame } from '../shell/frame/AppFrame';
import { Banner } from '../shell/frame/Banner';
import { DataPanel } from '../shell/frame/DataPanel';
import { FactList } from '../shell/frame/FactList';
import { ManualScreen } from '../shell/frame/ManualScreen';
import { Workbench } from '../shell/frame/Workbench';
import { manualSections } from './ui/manual';
import { FigureName } from '../shell/frame/FigureName';
import { InputArea } from '../shell/frame/InputArea';
import { QuickChips } from '../shell/frame/QuickChips';
import { ToolButton } from '../shell/frame/ToolButton';
// #742 / ADR-W-024: the shared canvas corner cluster — one look in every builder.
// #745: and the shared RASTERISER — one svg→png in the workspace, not one per product.
import { svgToPng } from '../shell/export/svgToPng';
import { CANVAS_ZOOM_STEP, canvasClusterStyle, canvasCtrlStyle, clampZoom } from '../shell/frame/canvasControls';
// #743: the under-canvas row's ONE look — the shell contract, replacing this tree's bare buttons.
import { figureRowStyle, rowAccentStyle, rowAccentOffStyle, rowSpacerStyle, rowSubtleStyle, rowSubtleOffStyle, rowDangerInk } from '../shell/frame/figureRow';
import { figureNameFromFileName, readEnvelope, savedFileName } from '../shell/save';
import { applySwitcherConfig, type ToolConfig } from '../shell/switcherConfig';
import { deriveLines } from './app/deriveLines';
import { COMPLEX_SESSION, editLine, hydrateSession, submitLine, toggleLine } from './app/submit';
import { v2Claims, v2Contradiction, v2Formulas, v2Freedom, v2Knowledge, v2Labels, v2Measures, whyText } from './replay/scene2';
import { buildScene } from './scene/scene';
import { PolarPlane } from './render/PolarPlane';
import { useComplexStore, type InputError } from './store/useComplexStore';
import { SYMBOLS } from './ui/symbols';
import { complexBidi } from './i18n';
import registry from '../products.json';

const EXAMPLE_LINES = ['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2', 'z^5 = w^2'];

const ERROR_KEY: Record<InputError['key'], string> = {
  'not-handled': 'errNotHandled',
  'parse-error': 'errParse',
  'duplicate-name': 'errDuplicate',
  'wrong-app': 'errWrongApp',
  'newer-version': 'errNewerVersion',
  incompatible: 'errIncompatible',
  impossible: 'errImpossible',
  unaccounted: 'errUnaccounted',
};

export function App() {
  const { t, i18n } = useTranslation();
  const {
    lines,
    disabled,
    name,
    setName,
    seed,
    view,
    lastError,
    loadAudit,
    removeLine,
    setView,
    nextConfig,
    clearAll,
    serialize,
    setLoadAudit,
  } = useComplexStore();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const saveFile = () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // The shared naming convention (shell/save, per-product suffix from docs/22 §9): the figure's
    // NAME when it has one, else date-stamped — successive saves never silently overwrite.
    a.download = savedFileName(name, new Date(), 'complex');
    a.click();
    URL.revokeObjectURL(url);
  };

  // #742 / ADR-W-024: the image exports — the top tool row's pair, the 3-D rasterize pattern
  // (App queries its own canvas svg; the renderer never knows exports exist).
  //
  // #745: the product-local svg→png copy that #742 flagged as "a shell candidate" is GONE — this now
  // calls the shared rasteriser. It is behaviour-neutral here (this renderer tags nothing, so the
  // clean-export contract is a no-op, and `sourceSize` reads the Gauss plane's viewBox exactly as the
  // inline copy read its client box) and it retires the third of three copies. No «הורידו שאלה»
  // button follows it into this tool — operator ruling, 2026-08-19: the question document is 2-D and
  // 3-D only.
  const rasterCanvas = (): Promise<Blob> => {
    const svg = canvasCard.current?.querySelector('svg');
    if (!svg) return Promise.reject(new Error('no canvas'));
    return svgToPng(svg);
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

  const onLoadFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((txt) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(txt);
      } catch {
        useComplexStore.setState({ lastError: { key: 'parse-error', detail: file.name } });
        return;
      }
      // The envelope names its refusal (shell/save): a foreign file says WHOSE it is, a future
      // file says to refresh — never a generic "parse error" about a file that was read fine.
      const env = readEnvelope(parsed, COMPLEX_SESSION);
      if (!env.ok) {
        const key =
          env.reason === 'wrong-app'
            ? ('wrong-app' as const)
            : env.reason === 'newer-version'
              ? ('newer-version' as const)
              : ('parse-error' as const);
        const detail =
          env.reason === 'wrong-app'
            ? String((parsed as { app?: unknown }).app ?? file.name)
            : file.name;
        useComplexStore.setState({ lastError: { key, detail } });
        return;
      }
      if (!hydrateSession(parsed))
        useComplexStore.setState({ lastError: { key: 'parse-error', detail: file.name } });
      // the FILENAME names the figure (the #42 rule) — any name embedded in the file is provenance
      else useComplexStore.getState().setName(figureNameFromFileName(file.name, 'complex'));
    });
  };
  const [input, setInput] = useState('');

  // the language toggle and the document-direction flip are the FRAME's now (suite-level chrome,
  // implemented once — the operator caught the per-product copies)

  /**
   * THE OPERATOR'S CURATION OVERLAY (A3, #662): fetched once, applied over the static roster.
   * DEGRADED PATH by construction — a dead or configless server answers non-200 and the switcher
   * renders the built-in registry roster; nothing here can error at the student.
   */
  const [toolConfig, setToolConfig] = useState<ToolConfig | null>(null);
  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}api/config?tool=complex`)
      .then((r) => (r.status === 200 ? (r.json() as Promise<ToolConfig>) : null))
      .then((cfg) => setToolConfig(cfg))
      .catch(() => setToolConfig(null));
  }, []);

  /**
   * THE FIGURE — the student's lines, folded. One engine, no switch
   * ([ADR-CX-027](../docs/06d-decisions-complex.md#adr-cx-027)).
   *
   * `?engine=v2` selected between this and the prototype's per-fact sweeps while the foundation was
   * being played (ADR-CX-008). The cutover deleted the prototype, so the fork went with it.
   */
  // the figure folds from the ACTIVE lines only (B5/D6): a muted statement stays in the list,
  // out of the figure — "what if I hadn't said this?" made literal
  const active = useMemo(() => lines.filter((_, i) => !disabled.includes(i)), [lines, disabled]);
  const derived2 = useMemo(() => deriveLines(active, seed, seed), [active, seed]);
  /**
   * THE `n` STEPPER — display state, and nowhere else (ADR-CX-001 D3).
   *
   * It lives in the component: not in the store, not in the save file, not in undo, and it reaches the
   * scene as an ARGUMENT. Stepping it moves the marker around a power cycle and changes nothing about
   * the figure — the same seam rule as the polar/cartesian toggle, which the sibling products learned
   * to hold at (ADR-448 / ADR-3D-144) after learning what it costs not to.
   */
  const [stepN, setStepN] = useState(1);
  // #742: the corner cluster's zoom — view state, local by design (docs/20 §6.4), never stored.
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [exportFlash, setExportFlash] = useState<'' | 'ok' | 'err'>(''); // top-row copy feedback
  const canvasCard = useRef<HTMLDivElement>(null);
  // the canvas is POLAR: a complex number as a length and a direction, not a dot on a grid
  const polarScene = useMemo(() => buildScene(derived2, { n: stepN }), [derived2, stepN]);
  /**
   * THE DATA COLUMN (B2, docs/28 §4a D1 as refined by the operator 2026-08-17): the column is
   * ALWAYS VISIBLE on wide screens — its toggle lives INSIDE it and collapses only the content;
   * on narrow screens the column hides and the launcher under the canvas opens it as the D10
   * overlay. Display state only. The honesty split stands: refusal surfaces are never in here.
   */
  const [manualOpen, setManualOpen] = useState(false); // the D9 manual SCREEN (A6) — catalog-backed
  // #722 — the enrichment layers, OFF by default (the de-clutter ruling): each S5 visualization
  // is a student's choice, made per layer with the chips under the canvas.
  const [layers, setLayers] = useState({ rings: false, angles: false, rotations: false, cycles: false, series: false });
  const [showData, setShowData] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1000px)').matches,
  );

  /**
   * WHICH LINES THE FIGURE COULD NOT USE — so a row is red exactly when the engine could not read it.
   *
   * The canvas drew v2 while the rows were styled by the PROTOTYPE's evaluation once, and the
   * prototype is precisely what refuses `-2z1 = conj(z3)` (#607): the figure said "built" and the row
   * said "failed", about the same line, at the same time. One surface must never contradict another
   * about the same statement, which is the #653 class and the reason there is now one engine to ask.
   */
  const v2Failed = useMemo(
    () => new Set(derived2.untranslated.map((u) => u.src)),
    [derived2],
  );

  const submit = () => {
    if (input.trim() === '') return;
    if (submitLine(input)) setInput('');
  };

  /**
   * THE QUICK COMMANDS (D9b + A3): the operator's curated list when one is saved, the built-in
   * examples otherwise. Big chips on the empty canvas; the compact strip above the input once a
   * figure exists — one clickable set, building with no typing.
   */
  const quickCommands = toolConfig?.quickCommands?.length ? toolConfig.quickCommands : EXAMPLE_LINES;

  /**
   * THE SWITCHER ROSTER — A2's registry rendered as DATA (ADR-W-021): the shell frame receives a
   * list, never a product import, and dev swaps in `devUrl` because `npm run dev` serves every app
   * from one origin. Rebuilt on language change — the labelKeys resolve through THIS product's own
   * i18n, which is what keeps the registry product-neutral.
   */
  const roster = useMemo(
    () =>
      applySwitcherConfig(
        registry.products
          .filter((p) => p.enabled)
          .map((p) => ({
            id: p.id,
            label: t(p.labelKey),
            icon: p.icon,
            url: import.meta.env.DEV ? p.devUrl : p.url,
          })),
        toolConfig,
      ),
    [t, toolConfig],
  );

  /**
   * THE LOAD AUDIT (ADR-242, via shell/save): what the last load could not restore, named line by
   * line with each line's own refusal reason — before this, a dropped line simply vanished and
   * `clearError()` erased even the last one's evidence.
   */
  const auditBanner = loadAudit ? (
    <Banner
      kind="notice"
      onDismiss={() => setLoadAudit(null)}
      dismissLabel={t('loadAuditDismiss')}
    >
      <div>
        {t('loadAuditTitle', {
          restored: loadAudit.total - loadAudit.failed.length,
          total: loadAudit.total,
        })}
      </div>
      {loadAudit.failed.map((f, idx) => (
        <div key={`${idx}-${f.line}`} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <code dir="ltr">{f.line}</code>
          <span>— {t(ERROR_KEY[f.reason.key], { detail: f.reason.detail })}</span>
        </div>
      ))}
    </Banner>
  ) : undefined;

  /*
   * THE LEVEL MODEL (docs/28 §4a, ruled 2026-08-17 on mockup D): a control lives at the level of
   * the thing it acts on. Level 1 (suite: the builder strip, language, About) and level 2 (tool:
   * title + שמור/טען) are the frame's. Level 3 is composed HERE: the palette with the input box,
   * row operations with the fact list, and the FIGURE actions — cycle, the view toggle — under
   * the canvas (D7, executed for complex ahead of B6).
   */
  return (
    <AppFrame
      title={t('title')}
      subtitle={t('subtitle')}
      utilityActions={
        /* ONE look for the session actions in every builder (shell/ToolButton). שמור/טען FIRST
           (the parity rule: same position in every tool); the manual rides after them. */
        <>
          <ToolButton onClick={saveFile} disabled={lines.length === 0}>
            💾 {t('save')}
          </ToolButton>
          <ToolButton onClick={() => fileRef.current?.click()}>📂 {t('load')}</ToolButton>
          {/* #742 / ADR-W-024 (operator: "3d and complex tools can have the same functionality"):
              the image exports in the TOP ROW, the one export home in every builder. */}
          <ToolButton onClick={() => void copyImage()} disabled={lines.length === 0}>
            {exportFlash === 'ok' ? `✓ ${t('copied')}` : exportFlash === 'err' ? '✕' : `⧉ ${t('copyImage')}`}
          </ToolButton>
          <ToolButton onClick={() => void saveImage()} disabled={lines.length === 0}>
            ⤓ {t('saveImage')}
          </ToolButton>
          <ToolButton onClick={() => setManualOpen(true)}>{t('manualButton')}</ToolButton>
        </>
      }
      roster={roster}
      activeProductId="complex"
      switcherLabel={t('switcherAria')}
      about={{
        label: t('menuAbout'),
        title: t('aboutTitle'),
        body: <p style={{ marginTop: 0 }}>{t('aboutLead')}</p>,
        privacy: t('privacy'),
        closeLabel: t('aboutClose'),
      }}
      buildStamp={typeof __BUILD__ !== 'undefined' ? __BUILD__ : undefined}
      banner={auditBanner}
    >
      <div className="app">
        {/* The load target must OUTLIVE the overflow menu (its items unmount on close), so the
            hidden input lives here and the menu item only clicks it. */}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={onLoadFile}
        />
        {/* THE WORKBENCH (#734): the three-zone GEOMETRY is the shell's — identical columns,
            canvas card and empty-state placement in every builder; this product passes zone
            content only. (The old per-product CSS grid retired.) */}
        <Workbench
          emptyOverlay={
            lines.length === 0 ? (
              /* #751 (ADR-W-029): these were already RAW (config / EXAMPLE_LINES, never `t()`);
                 the shared contract now also isolates them for display, as the siblings do. */
              <QuickChips
                title={t('emptyTitle')}
                hint={t('emptyHintChips')}
                commands={quickCommands}
                display={(c) => complexBidi.inputPreview(c) ?? c}
                onPick={(c) => submitLine(c)}
              />
            ) : undefined
          }
          inputZone={<>
            {/* THE SHARED INPUT AREA (B4, the shared-components rule): the box, the wrap-selection
                palette, the preview seam and the compact quick strip exist ONCE in shell/; this
                product passes its symbols, its previewer and its handlers. */}
            <InputArea
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder={t('inputPlaceholder')}
              submitLabel={t('add')}
              symbols={SYMBOLS}
              symbolTitle={(s) => (s.titleKey ? t(s.titleKey) : s.label)}
              preview={(s) => complexBidi.inputPreview(s)}
              previewDir={(s) => complexBidi.textDir(s)}
            >
              {/* No quick strip above the box (operator ruling 2026-08-18: "expensive screen
                  space") — the curated commands live on the CLEAN CANVAS (QuickChips below). */}
              {lastError && (
                <Banner kind="error">{t(ERROR_KEY[lastError.key], { detail: lastError.detail })}</Banner>
              )}
            </InputArea>
            {/*
              THE STATEMENT LIST — the SHARED chrome (B5/D6: disable + edit + delete, everywhere).
              The rows ARE the student's lines, the store's source of truth (#658's lesson); a
              toggled or edited line goes back through the acceptance gate in app/submit, so the
              list can never show a state the figure refuses.
            */}
            <FactList
              rows={lines.map((src, i) => ({
                id: String(i),
                content: <code dir="ltr">{src}</code>,
                error: v2Failed.has(src)
                  ? (() => {
                      const why = derived2?.untranslated.find((u) => u.src === src)?.why;
                      return why ? whyText(why, t) : undefined;
                    })()
                  : undefined,
                disabled: disabled.includes(i),
              }))}
              emptyHint={t('emptyHint')}
              onToggle={(id) => toggleLine(Number(id))}
              toggleLabel={t('factToggle')}
              editValueOf={(id) => lines[Number(id)]}
              onEditCommit={(id, next) => editLine(Number(id), next)}
              editLabel={t('factEdit')}
              onDelete={(id) => removeLine(Number(id))}
              deleteLabel={t('factDelete')}
              footer={
                /* #739: נקה הכל moved to the under-canvas row (the one place it lives in every
                   tool); the footer keeps the example and the count. */
                <>
                  <button onClick={() => EXAMPLE_LINES.forEach((l) => submitLine(l))}>{t('example')}</button>
                  <span className="count">{t('factCount', { count: lines.length })}</span>
                </>
              }
            />
          </>}
          canvasZone={<>
            {/* The figure's NAME, centered above the drawing it names — the SHARED component,
                one look in every builder (#42 arriving in complex). */}
            <FigureName value={name} onChange={setName} placeholder={t('namePlaceholder')} />
            {/* the empty-state chips render through the WORKBENCH's one overlay slot (#734) */}
            {
              /* THE HONESTY STRIP — always visible, never opt-in (B2's split of the old banner).
                 A violated, undecided or unread STATEMENT is the figure refusing to lie about
                 itself; hiding those behind the data toggle would be the tool hiding a broken
                 given. B6 (#671) narrowed it to REFUSALS ONLY, per the operator's ruling: the
                 freedom cue and the sampled-value legend are figure DATA and moved to the data
                 panel's head-line; the config count died outright («הציגו תצורה אחרת» already says
                 alternatives exist). The strip renders nothing when the figure holds clean. */
            }
            {(v2Contradiction(derived2, t) !== null ||
              derived2.unsatisfied.length > 0 ||
              derived2.undecided.length > 0 ||
              derived2.untranslated.length > 0) && (
              /* #716: the strip's prose follows the UI language, so its direction does too */
              <div className="v2-banner" dir={i18n.dir()}>
                {v2Contradiction(derived2, t)}
                {/* a relation the numeric tier could not satisfy has no row of its own — tier 1 pushed
                    it down — so without this it would simply be absent from a figure that ignores it */}
                {derived2.unsatisfied.map((u) => (
                  <div key={u} className="v2-skip">
                    ✗ «{u}» — {t('stripUnsatisfied')}
                  </div>
                ))}
                {/* a relation the engine could not EVALUATE — undecided, and said so rather than dropped */}
                {derived2.undecided.map((u) => (
                  <div key={`und-${u}`} className="v2-skip">
                    ? «{u}» — {t('stripUndecided')}
                  </div>
                ))}
                {derived2.untranslated.map((u) => (
                  <div key={u.factId} className="v2-skip">
                    ⚠ «{u.src}» — {whyText(u.why, t)}
                  </div>
                ))}
              </div>
            )}
            {polarScene && (
              <>
                {/* #742 / ADR-W-024: a positioned wrapper so the canvas carries the SAME corner
                    cluster as every builder — ↺ − + from the shell contract. Zoom is view state
                    (docs/20 §6.4): local, never in the store, reset by ↺. */}
                {/* the wrapper is a transparent flex conduit — same column context the svg had as
                    the card's direct child, so .gauss-plane keeps its shrink behaviour and the
                    actions row under the canvas stays above the fold */}
                <div ref={canvasCard} style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <PolarPlane
                    scene={polarScene}
                    showGrid={view === 'polar'}
                    mode={view}
                    layers={layers}
                    zoom={canvasZoom}
                    empty={lines.length === 0}
                    labels={{
                      ratio: t('seriesRatio'),
                      limit: t('seriesLimit'),
                      closed: t('seriesClosed'),
                    }}
                  />
                  <div style={canvasClusterStyle} dir="ltr">
                    <button type="button" style={canvasCtrlStyle} title={t('resetView')} aria-label={t('resetView')} onClick={() => setCanvasZoom(1)}>
                      ↺
                    </button>
                    <button type="button" style={canvasCtrlStyle} title="zoom out" aria-label="zoom out" onClick={() => setCanvasZoom((z) => clampZoom(z / CANVAS_ZOOM_STEP))}>
                      −
                    </button>
                    <button type="button" style={canvasCtrlStyle} title="zoom in" aria-label="zoom in" onClick={() => setCanvasZoom((z) => clampZoom(z * CANVAS_ZOOM_STEP))}>
                      +
                    </button>
                  </div>
                </div>
                {layers.cycles && polarScene.cycles.length > 0 && (
                  <div className="stepper" dir="rtl">
                    <span>
                      {t('stepperLabel')} = {stepN}
                    </span>
                    <button onClick={() => setStepN((n) => Math.max(1, n - 1))} title={t('stepBack')}>
                      −
                    </button>
                    <button onClick={() => setStepN((n) => n + 1)} title={t('stepForward')}>
                      +
                    </button>
                    {polarScene.cycles.map((c) => (
                      <span key={`per-${c.name}`} className="count">
                        {c.name}: {t('cyclePeriod', { count: c.period })}
                      </span>
                    ))}
                  </div>
                )}
                {polarScene.regions.map((rg) => (
                  <div key={rg.key} className="region-count" dir="rtl">
                    {t('regionCounts', {
                      label: rg.label,
                      inside: rg.counts.in,
                      on: rg.counts.on,
                      outside: rg.counts.out,
                    })}
                  </div>
                ))}
              </>
            )}
            {/* LEVEL 3 — figure actions under the canvas (D7): they act on the FIGURE.
                #743: ONE look — the shell row contract (accent alternatives at inline-start,
                spacer before the session ops), replacing this tree's bare buttons. */}
            <div className="figure-actions" style={figureRowStyle}>
              {/* nothing to cycle when the givens determine the figure completely (ADR-CX-020) */}
              <button style={(derived2 ? !derived2.canCycle : false) ? rowAccentOffStyle : rowAccentStyle} onClick={nextConfig} disabled={derived2 ? !derived2.canCycle : false}>
                {t('anotherConfig')}
              </button>
              {/* #742: the row's buttons DISABLE on an empty figure, never hide (operator ruling —
                  one row behaviour in every builder; the empty canvas is blank, so the view toggle
                  has nothing to show either). */}
              <button style={lines.length === 0 ? rowSubtleOffStyle : rowSubtleStyle} disabled={lines.length === 0} onClick={() => setView(view === 'cart' ? 'polar' : 'cart')}>
                {view === 'cart' ? t('viewPolar') : t('viewCart')}
              </button>
              {/* #722 — the ENRICHMENT layers, opt-in chips (the operator's de-clutter ruling:
                  the default canvas is points + stated elements; each S5 layer is a choice).
                  A chip renders only when the figure HAS that layer to show. */}
              {([
                ['rings', 'layerRings', (polarScene?.rings.length ?? 0) > 0],
                ['angles', 'layerAngles', (polarScene?.arcs.length ?? 0) > 0],
                ['rotations', 'layerRotations', (polarScene?.rotations.length ?? 0) > 0],
                ['cycles', 'layerCycles', (polarScene?.cycles.length ?? 0) > 0],
                ['series', 'layerSeries', (polarScene?.spirals.length ?? 0) > 0],
              ] as const).map(([key, tKey, has]) =>
                has ? (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={layers[key]}
                    className={layers[key] ? 'layer-chip on' : 'layer-chip'}
                    onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                  >
                    {t(tKey)}
                  </button>
                ) : null,
              )}
              <span style={rowSpacerStyle} />
              {/* #739: the row carries clear-all in every tool (undo/redo await store temporal —
                  the named feature gap on the issue) */}
              <button style={lines.length > 0 ? { ...rowSubtleStyle, color: rowDangerInk } : rowSubtleOffStyle} disabled={lines.length === 0} onClick={clearAll}>{t('clearAll')}</button>
              {/* the LAUNCHER — narrow screens only (CSS): opens the data overlay when the
                  always-visible column has no room to exist */}
              <button
                className="data-launcher"
                onClick={() => setShowData((s) => !s)}
                aria-expanded={showData}
              >
                {showData ? t('dataHide') : t('dataShow')}
              </button>
            </div>
          </>}
          dataZone={
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            {/* B6 (#671): the D8 SKELETON through the SHARED DataPanel — head, freedom-cue status
                line, the same sections in the same order everywhere. */}
            <DataPanel
              title={t('dataTitle')}
              open={showData}
              onToggle={() => setShowData((s) => !s)}
              showLabel={t('panelShow')}
              hideLabel={t('panelHide')}
              status={v2Freedom(derived2, t)}
              sections={[
                { key: 'points', title: t('secPoints'), rows: v2Labels(derived2, view) },
                // verdict rows word their WHY in prose, in the UI's language (#716: the engine
                // publishes codes; whyText words them) — they follow the app's direction
                { key: 'measures', title: t('secMeasures'), rows: v2Measures(derived2, t), dir: 'app' },
                { key: 'relations', title: t('secRelations'), rows: v2Claims(derived2, t), dir: 'app' },
                { key: 'ask', title: t('secAsk'), rows: v2Knowledge(derived2, t), dir: 'app' },
              ]}
            >
              {/* the formula sheet, surfaced from what the figure DOES — each row names its premises */}
              {v2Formulas(derived2, i18n.language === 'he' ? 'he' : 'en').map((f) => (
                <div key={f} className="v2-formula" dir="ltr">
                  {f}
                </div>
              ))}
            </DataPanel>
            </div>
          }
        />
      {/* THE MANUAL (A6 #665, D9): a separate SCREEN, catalog-backed — every supported sentence
          family with its real specimens; a click SUBMITS the example and returns to the tool. */}
      <ManualScreen
        open={manualOpen}
        title={t('manualTitle')}
        intro={t('manualIntro')}
        closeLabel={t('manualClose')}
        tryHint={t('manualTry')}
        sectionCap={6}
        moreNote={t('manualMore')}
        sections={manualSections(i18n.language === 'he' ? 'he' : 'en').map((s) => ({
          key: s.family,
          title: s.title,
          entries: s.entries.map((e) => {
            const raw = i18n.language === 'he' ? e.he : e.en;
            return {
              // #118 discipline: base direction from CONTENT, LTR math runs isolated inside a
              // Hebrew sentence (the kit's isolation — the operator caught «המעגל שמרכזו O
              // ורדיוסו r» reversing under a forced ltr chip).
              example: complexBidi.inputPreview(raw) ?? raw,
              dir: complexBidi.textDir(raw),
              description: i18n.language === 'he' ? e.descHe : e.descEn,
              onTry: () => {
                setManualOpen(false);
                submitLine(raw); // the RAW sentence is what the grammar reads — never the isolated form
              },
            };
          }),
        }))}
        onClose={() => setManualOpen(false)}
      />
      </div>
    </AppFrame>
  );
}
