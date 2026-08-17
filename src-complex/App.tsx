import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AppFrame } from '../shell/frame/AppFrame';
import { Banner } from '../shell/frame/Banner';
import { readEnvelope, savedFileName } from '../shell/save';
import { applySymbol, type SymbolSpec } from '../shell/symbols';
import { deriveLines } from './app/deriveLines';
import { COMPLEX_SESSION, hydrateSession, submitLine } from './app/submit';
import { v2Claims, v2Formulas, v2Knowledge, v2Labels, v2Measures, v2Status } from './replay/scene2';
import { buildScene } from './scene/scene';
import { PolarPlane } from './render/PolarPlane';
import { useComplexStore, type InputError } from './store/useComplexStore';
import { SYMBOLS } from './ui/symbols';
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
    // The shared naming convention (shell/save, per-product suffix from docs/22 §9):
    // date-stamped, so successive saves never silently overwrite each other.
    a.download = savedFileName(undefined, new Date(), 'complex');
    a.click();
    URL.revokeObjectURL(url);
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
    });
  };
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The palette applies through the shared wrap-selection core (shell/symbols, docs/28 §4a D5):
  // wrapping symbols enclose the current selection; an empty selection is a caret insert.
  const insertSymbol = (spec: SymbolSpec) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? start;
    const next = applySymbol(input, start, end, spec);
    setInput(next.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  /**
   * THE FIGURE — the student's lines, folded. One engine, no switch
   * ([ADR-CX-027](../docs/06d-decisions-complex.md#adr-cx-027)).
   *
   * `?engine=v2` selected between this and the prototype's per-fact sweeps while the foundation was
   * being played (ADR-CX-008). The cutover deleted the prototype, so the fork went with it.
   */
  const derived2 = useMemo(() => deriveLines(lines, seed, seed), [lines, seed]);
  /**
   * THE `n` STEPPER — display state, and nowhere else (ADR-CX-001 D3).
   *
   * It lives in the component: not in the store, not in the save file, not in undo, and it reaches the
   * scene as an ARGUMENT. Stepping it moves the marker around a power cycle and changes nothing about
   * the figure — the same seam rule as the polar/cartesian toggle, which the sibling products learned
   * to hold at (ADR-448 / ADR-3D-144) after learning what it costs not to.
   */
  const [stepN, setStepN] = useState(1);
  // the canvas is POLAR: a complex number as a length and a direction, not a dot on a grid
  const polarScene = useMemo(() => buildScene(derived2, { n: stepN }), [derived2, stepN]);

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
   * THE SWITCHER ROSTER — A2's registry rendered as DATA (ADR-W-021): the shell frame receives a
   * list, never a product import, and dev swaps in `devUrl` because `npm run dev` serves every app
   * from one origin. Rebuilt on language change — the labelKeys resolve through THIS product's own
   * i18n, which is what keeps the registry product-neutral.
   */
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
        <>
          <button onClick={saveFile}>💾 {t('save')}</button>
          <button onClick={() => fileRef.current?.click()}>📂 {t('load')}</button>
        </>
      }
      overflowItems={[
        {
          key: 'language',
          label: t('language'),
          onSelect: () => void i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he'),
        },
      ]}
      menuLabel={t('menuLabel')}
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
        <main>
          <section className="panel">
            <div className="input-row">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder={t('inputPlaceholder')}
                dir="ltr"
              />
              <button onClick={submit}>{t('add')}</button>
            </div>
            <div className="symbols" dir="ltr">
              {SYMBOLS.map((s) => (
                <button
                  key={s.titleKey}
                  className="sym"
                  title={t(s.titleKey)}
                  onClick={() => insertSymbol(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {lastError && (
              <Banner kind="error">{t(ERROR_KEY[lastError.key], { detail: lastError.detail })}</Banner>
            )}
            <div className="panel-actions">
              <button onClick={() => EXAMPLE_LINES.forEach((l) => submitLine(l))}>{t('example')}</button>
              <button onClick={clearAll}>{t('clearAll')}</button>
              <span className="count">{t('factCount', { count: lines.length })}</span>
            </div>
            {/*
              THE STATEMENT LIST FOLLOWS THE ACTIVE ENGINE.

              Under v2 the rows ARE the student's lines — the store's source of truth — not the
              prototype's facts. Deriving them from facts is what made every v2-only form invisible as
              well as unreachable (#658): a line the prototype refused had no row to appear in.
            */}
            <ul className="facts">
              {lines.length === 0 && <li className="hint">{t('emptyHint')}</li>}
              {
                lines.map((src, i) => {
                  const failed = v2Failed.has(src);
                  return (
                    <li key={`${i}-${src}`} className={failed ? 'fact err' : 'fact'}>
                      <code dir="ltr">{src}</code>
                      {failed && (
                        <span className="fact-error">
                          {derived2?.untranslated.find((u) => u.src === src)?.why}
                        </span>
                      )}
                      <button className="del" onClick={() => removeLine(i)} aria-label="delete">
                        ✕
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
          <section className="canvas">
            {
              /* The readings beside the canvas. It carried an `engine=v2` badge while two engines
                 existed and the operator needed to know which one drew the figure; there is one engine
                 now (ADR-CX-027), so the badge is gone and the honest state remains. */
            }
            <div className="v2-banner" dir="rtl">
                {v2Status(derived2)}
                {v2Labels(derived2).length > 0 && <div dir="ltr">{v2Labels(derived2).join('   ')}</div>}
                {derived2.points.some((p) => !p.modulusKnown || !p.argumentKnown) && (
                  <div>~ = ערך שנדגם, לא נתון — לחצו "אפשרות נוספת" כדי לראות תצורה אחרת</div>
                )}
                {v2Claims(derived2).map((c) => (
                  <div key={c} className="v2-claim">
                    {c}
                  </div>
                ))}
                {v2Measures(derived2).map((m) => (
                  <div key={m} className="v2-claim">
                    {m}
                  </div>
                ))}
                {v2Knowledge(derived2).map((k) => (
                  <div key={k} className="v2-claim">
                    {k}
                  </div>
                ))}
                {/* the formula sheet, surfaced from what the figure DOES — each row names its premises */}
                {v2Formulas(derived2, i18n.language === 'he' ? 'he' : 'en').map((f) => (
                  <div key={f} className="v2-formula" dir="ltr">
                    {f}
                  </div>
                ))}
                {/* a relation the numeric tier could not satisfy has no row of its own — tier 1 pushed
                    it down — so without this it would simply be absent from a figure that ignores it */}
                {derived2.unsatisfied.map((u) => (
                  <div key={u} className="v2-skip">
                    ✗ «{u}» — לא מתקיים בתצורה הזו
                  </div>
                ))}
                {/* a relation the engine could not EVALUATE — undecided, and said so rather than dropped */}
                {derived2.undecided.map((u) => (
                  <div key={`und-${u}`} className="v2-skip">
                    ? «{u}» — לא ניתן להכריע מהנתונים שניתנו
                  </div>
                ))}
                {derived2.untranslated.map((u) => (
                  <div key={u.factId} className="v2-skip">
                    ⚠ «{u.src}» — {u.why}
                  </div>
                ))}
            </div>
            {polarScene && (
              <>
                <PolarPlane
                  scene={polarScene}
                  showGrid={view === 'polar'}
                  labels={{
                    ratio: t('seriesRatio'),
                    limit: t('seriesLimit'),
                    closed: t('seriesClosed'),
                  }}
                />
                {polarScene.cycles.length > 0 && (
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
            {/* LEVEL 3 — figure actions under the canvas (D7): they act on the FIGURE. */}
            <div className="figure-actions">
              {/* nothing to cycle when the givens determine the figure completely (ADR-CX-020) */}
              <button onClick={nextConfig} disabled={derived2 ? !derived2.canCycle : false}>
                {t('anotherConfig')}
              </button>
              <button onClick={() => setView(view === 'cart' ? 'polar' : 'cart')}>
                {view === 'cart' ? t('viewPolar') : t('viewCart')}
              </button>
            </div>
          </section>
        </main>
      </div>
    </AppFrame>
  );
}
