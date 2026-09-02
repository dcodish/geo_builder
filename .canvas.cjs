const fs = require('fs');
const f = 'src3d/render/Figure3.tsx';
let s = fs.readFileSync(f, 'utf8');

// ---- 1) props
const propAnchor = `  /** #483: a determined-but-unnamed ℓ∩π crossing was clicked — the App names it through the normal
   *  submit path. Absent = the offer is not drawn at all, which keeps this component a pure view. */
  onNameCrossing?: (c: SceneCrossing3) => void;`;
if (!s.includes(propAnchor)) throw new Error('prop anchor missing');
s = s.replace(propAnchor, propAnchor + `
  /** #578 (ADR-3D-211): re-letter a point by clicking it — 2-D's FR-RN-10 interaction, ported at the
   *  operator's ruling ("the same interface as the 2d tool has"). Returns the refusal so the popover can
   *  say WHY nothing happened. Absent = points are not clickable and no menu exists, so this component
   *  stays a pure view for every caller that does not wire it (the #483 contract). */
  onRenamePoint?: (from: string, to: string) => { ok: boolean; reason?: string };
  /** Localised strings for that popover (i18n-injected, like \`resetLabel\` — this file has no translation
   *  layer of its own). */
  renameText?: { title: string; placeholder: string; apply: string; taken: string; bad: string };`);

// ---- 2) destructure the new props
const destr = s.match(/\n  onNameCrossing,\n/);
if (!destr) throw new Error('destructure anchor missing');
s = s.replace('\n  onNameCrossing,\n', '\n  onNameCrossing,\n  onRenamePoint,\n  renameText,\n');

// ---- 3) local menu state, next to pan
const stateAnchor = "  const [pan, setPan] = useState({ x: 0, y: 0 });";
if (!s.includes(stateAnchor)) throw new Error('state anchor missing');
s = s.replace(stateAnchor, stateAnchor + `
  /** #578: the on-canvas rename popover — which point, where (canvas px, pan included), and the note a
   *  refusal leaves. View state, like orbit/zoom/pan: outside the store and outside undo. */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [menuNote, setMenuNote] = useState('');`);

// ---- 4) the point hit target + click
const ptAnchor = `        {scene.points.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={3} fill="#0f172a" />`;
if (!s.includes(ptAnchor)) throw new Error('point anchor missing');
s = s.replace(ptAnchor, `        {scene.points.map((p) => (
          <g
            key={p.id}
            className={onRenamePoint ? 'cursor-pointer' : undefined}
            // #578: the generous transparent hit ring is the #483 pattern — clickable on a tablet
            // without enlarging the dot — and \`stopPropagation\` keeps the click off the orbit drag.
            onPointerDown={onRenamePoint ? (e) => e.stopPropagation() : undefined}
            onClick={
              onRenamePoint
                ? (e) => {
                    e.stopPropagation();
                    setMenu({ id: p.id, x: p.x + pan.x, y: p.y + pan.y });
                    setRenameVal('');
                    setMenuNote('');
                  }
                : undefined
            }
          >
            {onRenamePoint && <circle cx={p.x} cy={p.y} r={11} fill="transparent" />}
            <circle cx={p.x} cy={p.y} r={3} fill="#0f172a" />`);

// ---- 5) the popover, after the svg
const svgEnd = `      </svg>
      {/* #742 / ADR-W-024: the canvas corner cluster`;
if (!s.includes(svgEnd)) throw new Error('svg end anchor missing');
s = s.replace(svgEnd, `      </svg>
      {/* #578 (ADR-3D-211) — the on-canvas rename popover, 2-D's FR-RN-10 ported. PHYSICAL \`left\`, not
          \`insetInlineStart\`: the coordinate is a left-based canvas pixel, and under the Hebrew-default
          RTL a logical inset resolves to \`right\`, opening the menu mirrored — the exact bug 2-D records
          at its own menu (F1/REN-1). The backdrop closes it, so there is no way to strand it open. */}
      {menu && onRenamePoint && renameText && (
        <>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setMenu(null)} />
          <div
            dir="ltr"
            style={{
              position: 'absolute',
              left: Math.min(Math.max(menu.x + 8, 0), Math.max(0, width - 168)),
              top: Math.min(Math.max(menu.y + 8, 0), Math.max(0, height - 92)),
              background: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              zIndex: 10,
              minWidth: 150,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
              {renameText.title} {menu.id}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                data-testid="rename-input"
                value={renameVal}
                maxLength={4}
                placeholder={renameText.placeholder}
                onChange={(e) => {
                  setRenameVal(e.target.value);
                  if (menuNote) setMenuNote('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyRename();
                  if (e.key === 'Escape') setMenu(null);
                }}
                style={{ width: 64, fontSize: 13, padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 6 }}
              />
              <button
                type="button"
                onClick={applyRename}
                style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc' }}
              >
                {renameText.apply}
              </button>
            </div>
            {menuNote && <div style={{ fontSize: 11, color: '#b45309' }}>{menuNote}</div>}
          </div>
        </>
      )}
      {/* #742 / ADR-W-024: the canvas corner cluster`);

// ---- 6) applyRename, before the return
const retAnchor = `  return (
    <div className="relative" data-testid="figure3">`;
if (!s.includes(retAnchor)) throw new Error('return anchor missing');
s = s.replace(retAnchor, `  /** #578: hand the typed letter to the host and keep the popover open on a refusal, with the reason —
   *  a menu that closes on failure would read as "it worked". */
  function applyRename() {
    if (!menu || !onRenamePoint) return;
    const to = renameVal.trim().toUpperCase();
    if (!to || !renameText) return;
    const res = onRenamePoint(menu.id, to);
    if (res.ok) setMenu(null);
    else setMenuNote(res.reason === 'target-taken' ? renameText.taken : renameText.bad);
  }

` + retAnchor);

fs.writeFileSync(f, s);
console.log('canvas popover wired');
