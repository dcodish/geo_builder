import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtNum } from './engine/complex';
import { deriveScene } from './engine/model';
import { deriveLines } from './app/deriveLines';
import { v2Labels, v2Status } from './replay/scene2';
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
};

export function App() {
  const { t, i18n } = useTranslation();
  const {
    facts,
    freePos,
    seed,
    view,
    lastError,
    addLine,
    removeFact,
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
   */
  const useV2 = useMemo(
    () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('engine') === 'v2',
    [],
  );
  // The v2 engine reads the student's LINES, not the prototype's facts (S4). One utterance can lower
  // to several prototype facts, so the lines are the distinct `src` values in entry order — the store
  // does not keep them separately, and that is the last thing the cutover removes.
  const v2Lines = useMemo(() => [...new Set(facts.map((f) => f.src))], [facts]);
  const derived2 = useMemo(
    () => (useV2 ? deriveLines(v2Lines, seed, seed) : null),
    [useV2, v2Lines, seed],
  );
  const scene = useMemo(() => deriveScene(facts, freePos, seed), [facts, freePos, seed]);
  // the v2 canvas is the POLAR one: a complex number as a length and a direction, not a dot on a grid
  const polarScene = useMemo(() => (derived2 ? buildScene(derived2.points) : null), [derived2]);

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
  const rowFailed = (f: { id: string; src: string }): boolean =>
    derived2 ? v2Failed.has(f.src) : Boolean(scene.errors[f.id]);
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
            <span className="count">{t('factCount', { count: facts.length })}</span>
          </div>
          <div className="measures">
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
          </div>
          {Object.keys(scene.params).length > 0 && (
            <div className="params" dir="ltr" title={t('paramsLabel')}>
              {Object.entries(scene.params)
                .map(([n, v]) => `${n} = ${fmtNum(v)}`)
                .join('   ·   ')}
            </div>
          )}
          <ul className="facts">
            {facts.length === 0 && <li className="hint">{t('emptyHint')}</li>}
            {facts.map((f) => (
              <li key={f.id} className={rowFailed(f) ? 'fact err' : 'fact'}>
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
                {!derived2 && scene.checks[f.id] && (
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
                {derived2 && rowFailed(f) && (
                  <span className="fact-error">
                    {derived2.untranslated.find((u) => u.src === f.src)?.why}
                  </span>
                )}
                {!derived2 && scene.errors[f.id] && (
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
              {derived2.untranslated.map((u) => (
                <div key={u.factId} className="v2-skip">
                  ⚠ «{u.src}» — {u.why}
                </div>
              ))}
            </div>
          )}
          {polarScene ? (
            <PolarPlane scene={polarScene} showGrid={view === 'polar'} />
          ) : (
            <GaussPlane scene={scene} view={view} onDragFree={setFree} />
          )}
        </section>
      </main>
    </div>
  );
}
