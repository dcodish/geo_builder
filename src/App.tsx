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
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { freeDofs, isGeoPoint } from '@/engine';
import { CATEGORY_LABELS, CATEGORY_ORDER, COMMAND_CATALOG, parse } from '@/parser';
import { llmParse } from '@/parser/llm';
import { figureContext } from '@/parser/llmShared';
import { Figure } from '@/render';
import type { Crossing } from '@/render';
import { groupKey, introducedIds, replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { nanoid } from 'nanoid';

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
  const resample = useGeoStore((s) => s.resample);
  const seed = useGeoStore((s) => s.seed);
  const clear = useGeoStore((s) => s.clear);

  const { undo, redo } = useGeoStore.temporal.getState();
  const canUndo = useStore(useGeoStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useGeoStore.temporal, (s) => s.futureStates.length > 0);

  const [text, setText] = useState('');
  const [notUnderstood, setNotUnderstood] = useState(false);
  const [thinking, setThinking] = useState(false); // LLM fallback in flight (Phase 7)
  const [llmDropped, setLlmDropped] = useState<string[]>([]); // LLM steps the engine couldn't build
  const [showHelp, setShowHelp] = useState(true); // visible by default so supported commands are discoverable
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState(false);
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
    const r = parse(editText);
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
  async function submit(utterance: string) {
    setNotUnderstood(false);
    setLlmDropped([]);
    const r = parse(utterance);
    if (r.ok) {
      // One utterance → possibly many commands; tag them with one group id so
      // they show as a single step row, not N identical rows.
      const group = nanoid();
      r.commands.forEach((c) => execute(c, utterance, group));
      setText('');
      return;
    }
    // out of grammar → ask the LLM (using the current figure as context)
    setThinking(true);
    const ctx = figureContext(
      construction.objects.filter(isGeoPoint).map((o) => o.id),
      construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.center] : [])),
    );
    const out = await llmParse(utterance, ctx);
    setThinking(false);
    if (!out || (out.built.length === 0 && out.dropped.length === 0)) {
      setNotUnderstood(true);
      return;
    }
    // Show the LLM's decomposition as separate steps, each labelled by its
    // canonical step (its own group); report any step the engine couldn't build (ADR-023).
    out.built.forEach((g) => {
      const group = nanoid();
      g.commands.forEach((c) => execute(c, g.step, group));
    });
    setLlmDropped(out.dropped);
    if (out.built.length === 0) setNotUnderstood(true);
    setText('');
  }

  // Figure + per-fact status are derived from the fact list.
  const { construction, positions, status, lastError } = useMemo(() => replay(facts, seed), [facts, seed]);

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

  const branchId = construction.objects.find((o) => o.kind === 'intersection' || o.kind === 'on-segment-solved')?.id;
  const examples = t('examples.items', { returnObjects: true }) as string[];

  return (
    <div style={page}>
      <header style={headerRow}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('app.title')}</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>{t('app.subtitle')}</p>
        </div>
        <button type="button" style={ghost} onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}>
          {t('actions.language')}
        </button>
      </header>

      <div style={main}>
        <Figure
          construction={construction}
          positions={positions}
          width={560}
          height={560}
          highlight={highlight}
          onPickIntersection={markIntersection}
          intersectionLabel={t('actions.markIntersection')}
        />

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
                style={input}
                placeholder={t('input.placeholder')}
                value={text}
                dir={textDir(text)}
                onChange={(e) => {
                  setText(e.target.value);
                  if (notUnderstood) setNotUnderstood(false);
                  if (llmDropped.length) setLlmDropped([]);
                }}
                autoFocus
              />
              <button type="submit" style={sendBtn} disabled={!text.trim() || thinking}>
                {thinking ? t('input.loading') : t('input.send')}
              </button>
            </div>
            {thinking && <span style={{ fontSize: 12, color: '#2563eb' }}>{t('input.loading')}</span>}
            {notUnderstood && <span style={{ fontSize: 12, color: '#b45309' }}>{t('input.notUnderstood')}</span>}
            {llmDropped.length > 0 && (
              <span style={{ fontSize: 12, color: '#b45309' }} dir={textDir(llmDropped[0])}>
                {t('input.partial')}: {llmDropped.join('; ')}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0 }}
            >
              {showHelp ? t('help.hide') : t('help.show')}
            </button>
          </form>

          {showHelp && (
            <div style={helpPanel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={sectionLabel}>{t('help.title')}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {t('help.wired')} · {t('help.soon')}
                </span>
              </div>
              {CATEGORY_ORDER.map((cat) => {
                const items = COMMAND_CATALOG.filter((c) => c.category === cat);
                if (items.length === 0) return null;
                // wired first, then planned
                const ordered = [...items].sort((a, b) => Number(b.supported) - Number(a.supported));
                return (
                  <div key={cat} style={{ marginTop: 10 }}>
                    <div style={catHeading}>{he ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en}</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {ordered.map((c) => (
                        <li key={c.en} style={cmdRow}>
                          <span style={{ width: 12, color: c.supported ? '#16a34a' : '#cbd5e1', fontSize: 12 }}>
                            {c.supported ? '✓' : '○'}
                          </span>
                          {c.supported ? (
                            <button type="button" style={helpExample} onClick={() => submit(he ? c.he : c.en)} dir={textDir(he ? c.he : c.en)} title={he ? c.descHe : c.descEn}>
                              {he ? c.he : c.en}
                            </button>
                          ) : (
                            <span style={cmdSoon} dir={textDir(he ? c.he : c.en)} title={he ? c.descHe : c.descEn}>
                              {he ? c.he : c.en}
                            </span>
                          )}
                          {!c.supported && c.phase && <span style={phaseTag}>{c.phase}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

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

          {lastError && <div style={errorBanner}>⚠ {lastError}</div>}

          <div>
            <div style={sectionLabel}>{t('steps.title')}</div>
            {facts.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{t('steps.empty')}</p>
            ) : (
              <ul style={stepList}>
                {groups.map((g) => {
                  const on = g.facts.every((f) => f.enabled);
                  const anyOn = g.facts.some((f) => f.enabled);
                  const brokenFact = g.facts.find((f) => f.enabled && status[f.id] !== 'ok');
                  const state = !anyOn ? 'disabled' : brokenFact ? 'broken' : 'ok';
                  const errText = brokenFact ? (status[brokenFact.id] as string) : undefined;
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
                          <button type="button" style={factLabel(state)} onClick={() => select(g.key)} dir={textDir(label)} title={state === 'broken' ? errText : undefined}>
                            {label}
                          </button>
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
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={ghost} disabled={!canUndo} onClick={() => undo()}>{t('actions.undo')}</button>
            <button type="button" style={ghost} disabled={!canRedo} onClick={() => redo()}>{t('actions.redo')}</button>
            <button type="button" style={ghost} onClick={clear}>{t('actions.clear')}</button>
          </div>

          {(branchId || freeDofs(construction).length > 0) && (
            <button type="button" style={alt} onClick={() => (branchId ? cycleAlt(branchId) : resample())}>
              {t('actions.another')}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
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
const sidebar: React.CSSProperties = { width: 340, display: 'flex', flexDirection: 'column', gap: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
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
const helpPanel: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  background: '#fafafa',
  padding: 12,
  maxHeight: 320,
  overflowY: 'auto',
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
const cmdSoon: React.CSSProperties = {
  flex: 1,
  fontFamily: 'ui-monospace, monospace',
  fontSize: 13,
  color: '#94a3b8',
};
const phaseTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#94a3b8',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '0 4px',
};
const stepList: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const errorBanner: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#b91c1c',
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
