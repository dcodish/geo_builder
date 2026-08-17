import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtNum } from './engine/complex';
import { deriveScene } from './engine/model';
import { deriveLines } from './app/deriveLines';
import { v2Claims, v2Formulas, v2Knowledge, v2Labels, v2Measures, v2Status } from './replay/scene2';
import { buildScene } from './scene/scene';
import { PolarPlane } from './render/PolarPlane';
import { GaussPlane } from './render/GaussPlane';
import { useComplexStore, type InputError } from './store/useComplexStore';

const EXAMPLE_LINES = ['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2', 'z^5 = w^2'];

// The symbol palette (operator request 2026-08-15): wrapping symbols enclose the current
// selection; plain symbols insert at the cursor. Everything inserted parses (locked by tests).
const SYMBOLS: { label: string; titleKey: string; before: string; after?: string }[] = [
  { label: 'z̄', titleKey: 'symConj', before: 'conj(', after: ')' },
  { label: '|z|', titleKey: 'symAbs', before: '|', after: '|' },
  { label: '1/z', titleKey: 'symInv', before: '1/(', after: ')' },
  { label: 'Re', titleKey: 'symRe', before: 're(', after: ')' },
  { label: 'Im', titleKey: 'symIm', before: 'im(', after: ')' },
  { label: 'cis', titleKey: 'symCis', before: 'cis ' },
  { label: 'i', titleKey: 'symI', before: 'i' },
  { label: '°', titleKey: 'symDeg', before: '°' },
  { label: 'xⁿ', titleKey: 'symPow', before: '^' },
  { label: '·', titleKey: 'symMul', before: '*' },
  { label: 'θ', titleKey: 'symTheta', before: 'θ' },
  { label: 'α', titleKey: 'symAlpha', before: 'α' },
  { label: 'β', titleKey: 'symBeta', before: 'β' },
];

const ERROR_KEY: Record<InputError['key'], string> = {
  'not-handled': 'errNotHandled',
  'parse-error': 'errParse',
  'duplicate-name': 'errDuplicate',
  incompatible: 'errIncompatible',
  unaccounted: 'errUnaccounted',
};

export function App() {
  const { t, i18n } = useTranslation();
  const {
    lines,
    facts,
    freePos,
    seed,
    view,
    engine,
    lastError,
    addLine,
    removeFact,
    removeLine,
    setFree,
    setView,
    nextConfig,
    clearAll,
    serialize,
    hydrate,
  } = useComplexStore();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const saveFile = () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'figure-complex.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((txt) => {
      let ok = false;
      try {
        ok = hydrate(JSON.parse(txt));
      } catch {
        ok = false;
      }
      if (!ok)
        useComplexStore.setState({ lastError: { key: 'parse-error', detail: file.name } });
    });
  };
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const insertSymbol = (before: string, after = '') => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? start;
    const sel = input.slice(start, end);
    setInput(input.slice(0, start) + before + sel + after + input.slice(end));
    const caret = start + before.length + sel.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  /**
   * `?engine=v2` runs the REBUILT engine (#616): the exact log-polar solver instead of the prototype's
   * per-fact sweeps. Off by default, so prod is untouched while the foundation is played
   * (ADR-CX-008's switch). The preview surface below is temporary — S5 replaces the whole render and
   * shell layer, and this banner with it.
   *
   * The switch itself lives in the store, because the stored session is replayed through `addLine` at
   * import time and the engine has to be known before that runs (#658).
   */
  const useV2 = engine === 'v2';
  // The v2 engine reads the student's LINES — which the store owns outright, so a line the retiring
  // prototype cannot read still reaches the grammar that can (#658).
  const derived2 = useMemo(() => (useV2 ? deriveLines(lines, seed, seed) : null), [useV2, lines, seed]);
  /**
   * THE `n` STEPPER — display state, and nowhere else (ADR-CX-001 D3).
   *
   * It lives in the component: not in the store, not in the save file, not in undo, and it reaches the
   * scene as an ARGUMENT. Stepping it moves the marker around a power cycle and changes nothing about
   * the figure — the same seam rule as the polar/cartesian toggle, which the sibling products learned
   * to hold at (ADR-448 / ADR-3D-144) after learning what it costs not to.
   */
  const [stepN, setStepN] = useState(1);
  const scene = useMemo(() => deriveScene(facts, freePos, seed), [facts, freePos, seed]);
  // the v2 canvas is the POLAR one: a complex number as a length and a direction, not a dot on a grid
  const polarScene = useMemo(
    () => (derived2 ? buildScene(derived2, { n: stepN }) : null),
    [derived2, stepN],
  );

  /**
   * WHICH ENGINE'S VERDICT THE FACT LIST SHOWS.
   *
   * The canvas draws v2 while the rows were still styled by the PROTOTYPE's evaluation — and the
   * prototype is precisely what refuses `-2z1 = conj(z3)` (#607). So the figure said "built" and the
   * row said "failed", about the same line, at the same time. One surface must not contradict another
   * about the same fact; when v2 is driving the picture it must drive the verdict too.
   *
   * v2 keys its refusals by the student's LINE, so a row is red exactly when v2 could not read the
   * line that produced it.
   */
  const v2Failed = useMemo(
    () => new Set((derived2?.untranslated ?? []).map((u) => u.src)),
    [derived2],
  );
  const [calcInput, setCalcInput] = useState('');
  const submitCalc = () => {
    if (calcInput.trim() === '') return;
    if (addLine(calcInput)) setCalcInput('');
  };

  const submit = () => {
    if (input.trim() === '') return;
    if (addLine(input)) setInput('');
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="header-actions">
          <button onClick={saveFile}>{t('save')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('load')}</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={onLoadFile}
          />
          <button onClick={nextConfig}>{t('anotherConfig')}</button>
          <button onClick={() => setView(view === 'cart' ? 'polar' : 'cart')}>
            {view === 'cart' ? t('viewPolar') : t('viewCart')}
          </button>
          <button onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}>
            {t('language')}
          </button>
        </div>
      </header>
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
                onClick={() => insertSymbol(s.before, s.after)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {lastError && (
            <p className="error" role="alert">
              {t(ERROR_KEY[lastError.key], { detail: lastError.detail })}
            </p>
          )}
          <div className="panel-actions">
            <button onClick={() => EXAMPLE_LINES.forEach((l) => addLine(l))}>{t('example')}</button>
            <button onClick={clearAll}>{t('clearAll')}</button>
            <span className="count">{t('factCount', { count: useV2 ? lines.length : facts.length })}</span>
          </div>
          {/* the calculation panel reads the PROTOTYPE's scene; under v2 the polar canvas and the
              banner carry the readings instead, and a panel fed by an idle engine would print stale
              numbers next to live ones */}
          {!useV2 && <div className="measures">
            <div className="measures-title">{t('calcsLabel')}</div>
            {scene.measures.map((m) => (
              <div key={m.key} className="measure-row" dir="ltr">
                <span title={m.form ? t('calcCurrent', { value: fmtNum(m.value) }) : undefined}>
                  {m.label} = {m.form ?? fmtNum(m.value)}
                </span>
                <button className="del" onClick={() => removeFact(m.factId)} aria-label="delete">
                  ✕
                </button>
              </div>
            ))}
            <div className="input-row calc-input">
              <input
                value={calcInput}
                onChange={(e) => setCalcInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCalc()}
                placeholder={t('calcPlaceholder')}
                dir="ltr"
              />
              <button onClick={submitCalc}>{t('calc')}</button>
            </div>
          </div>}
          {!useV2 && Object.keys(scene.params).length > 0 && (
            <div className="params" dir="ltr" title={t('paramsLabel')}>
              {Object.entries(scene.params)
                .map(([n, v]) => `${n} = ${fmtNum(v)}`)
                .join('   ·   ')}
            </div>
          )}
          {/*
            THE STATEMENT LIST FOLLOWS THE ACTIVE ENGINE.

            Under v2 the rows ARE the student's lines — the store's source of truth — not the
            prototype's facts. Deriving them from facts is what made every v2-only form invisible as
            well as unreachable (#658): a line the prototype refused had no row to appear in.
          */}
          <ul className="facts">
            {useV2 && lines.length === 0 && <li className="hint">{t('emptyHint')}</li>}
            {useV2 &&
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
            {!useV2 && facts.length === 0 && <li className="hint">{t('emptyHint')}</li>}
            {!useV2 && facts.map((f) => (
              <li key={f.id} className={scene.errors[f.id] ? 'fact err' : 'fact'}>
                <code dir="ltr">{f.src}</code>
                {f.kind === 'free' && (
                  <span className="badge">
                    {t(
                      scene.points.find((p) => p.factId === f.id)?.freeName
                        ? f.implicit
                          ? 'implicitLabel'
                          : 'freeLabel'
                        : 'drivenLabel',
                    )}
                  </span>
                )}
                {scene.checks[f.id] && (
                  <span
                    className={scene.checks[f.id].ok ? 'check ok' : 'check bad'}
                    title={t(
                      scene.checks[f.id].driven
                        ? 'relDriven'
                        : scene.checks[f.id].ok
                          ? 'relOk'
                          : 'relBad',
                    )}
                  >
                    {scene.checks[f.id].ok ? '✓' : '✗'}
                  </span>
                )}
                {scene.errors[f.id] && (
                  <span className="fact-error">
                    {t(
                      scene.errors[f.id].key === 'unknown-ref' ? 'errUnknownRef' : 'errRootsOfZero',
                      { detail: scene.errors[f.id].detail },
                    )}
                  </span>
                )}
                <button className="del" onClick={() => removeFact(f.id)} aria-label="delete">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="canvas">
          {derived2 && (
            <div className="v2-banner" dir="rtl">
              <strong>engine=v2</strong> · {v2Status(derived2)}
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
          )}
          {polarScene ? (
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
          ) : (
            <GaussPlane scene={scene} view={view} onDragFree={setFree} />
          )}
        </section>
      </main>
    </div>
  );
}
