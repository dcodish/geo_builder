/**
 * The 3-D canvas: a dumb SVG map over `buildScene3` output, plus view-only
 * interaction — drag to orbit, wheel to zoom, a reset-view button.
 * Orbit/zoom NEVER touch the figure (docs/20 §6.4); they live in local state,
 * outside the store and outside undo history.
 */

import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import type { PlaneDisplayMode3Map } from '../store/figureFile3';
import type { Resolved3 } from '../engine/evaluate';
import type { Construction3 } from '../engine/types';
import { HOME_CAMERA, MAX_PITCH, VIEW_PRESETS, VIEW_PRESET_ORDER, type Camera3, type ViewPreset } from './camera';
import { faceOnView, planarNormal } from '../engine/defaultView';
import { buildScene3, type SceneCrossing3 } from './scene3';
import { dragModeFor, panForZoom } from './viewGauge';
// #742 / ADR-W-024: the shared canvas corner cluster — one look in every builder.
import { CANVAS_ZOOM_STEP, canvasClusterStyle, canvasCtrlStyle } from '../../shell/frame/canvasControls';

export interface Figure3Props {
  construction: Construction3;
  resolved: Resolved3;
  width?: number;
  height?: number;
  /** Reset-view button label (i18n-injected so this component stays translation-free). */
  resetLabel?: string;
  /** id → coordinate label drawn under the point letter (the organize-your-data
   *  toggle). Knowledge only — a value identical in every sampled configuration;
   *  '?' marks a free component. Undetermined points carry no label (ADR-3D-030 Am.). */
  coordLabels?: Record<string, { text: string; kind: 'fact' | 'partial' }>;
  /** #318 + #395: per-plane patch display — 'face' draws a named plane's patch as exactly its
   *  defining polygon, 'hidden' draws no patch at all; absent = 'full' (the growing patch). */
  planeDisplay?: PlaneDisplayMode3Map;
  /** #397 (ADR-3D-108): draw the closest-point witness of every stated distance. Default true. */
  showWitnesses?: boolean;
  /** #542 (ADR-3D-185): draw the arcs of angles whose sides are OBJECTS — fed from «ארגון נתונים». */
  showObjectAngles?: boolean;
  /** #483: a determined-but-unnamed ℓ∩π crossing was clicked — the App names it through the normal
   *  submit path. Absent = the offer is not drawn at all, which keeps this component a pure view. */
  onNameCrossing?: (c: SceneCrossing3) => void;
  /** #578 (ADR-3D-211): re-letter a point by clicking it — 2-D's FR-RN-10 interaction, ported at the
   *  operator's ruling ("the same interface as the 2d tool has"). Returns the refusal so the popover can
   *  say WHY nothing happened. Absent = points are not clickable and no menu exists, so this component
   *  stays a pure view for every caller that does not wire it (the #483 contract). */
  onRenamePoint?: (from: string, to: string) => { ok: boolean; reason?: string };
  /** Localised strings for that popover (i18n-injected, like `resetLabel` — this file carries no
   *  translation layer of its own). */
  renameText?: { title: string; placeholder: string; apply: string; taken: string; bad: string };
  /** Tooltip on a crossing dot (i18n-injected, like `resetLabel` — this component stays translation-free). */
  crossingLabel?: string;
  /** #714 — labels for the named view presets (i18n-injected). Absent = the presets are not offered,
   *  which keeps this component usable without a translation layer, exactly like `resetLabel`. */
  presetLabels?: Partial<Record<ViewPreset, string>>;
}

/** #714 — one glyph per named view. Text, not icons: the control cluster is already glyph-based (↺, ±),
 *  and the accessible NAME is the i18n label on `title`/`aria-label`, never the glyph. */
const PRESET_GLYPH: Record<ViewPreset, string> = { front: '⬒', top: '⬓', side: '◧', iso: '⬔' };

/** Per-index plane patch colours (translucent — patches never occlude, docs/20 §11). */
const PLANE_COLORS = ['#0284c7', '#7c3aed', '#d97706'];

/**
 * #724 — orbit speed NORMALIZED BY CANVAS WIDTH: a full-width drag is one full turn (2π),
 * whatever the canvas size. The old fixed 0.011 rad/px felt right on the pre-unification ~700px
 * canvas (≈ 7.7 rad per sweep) but turned "jumpy" when the layout went full-width (~1100px ≈ 12
 * rad — nearly two turns per sweep). Exported pure for the lock.
 */
export const orbitStep = (width: number): number => (2 * Math.PI) / Math.max(400, width);

/** Named vectors draw in their own colour (ADR-3D-003 Am.) so tail/head read instantly. */
const VECTOR_COLOR = '#0d9488';

/** Bidi-isolate a MATH string (coordinates, equations) so the RTL document can't visually
 *  reorder it — `(0, 7, 6)` used to render as `(6 ,7 ,0)` on the canvas (LRI…PDI). */
const ltr = (s: string) => `⁦${s}⁩`;

/**
 * #549 — the canvas's BASE DIRECTION, set once at the `<svg>` root.
 *
 * The drawing is technical LTR content throughout: Latin point labels, Greek names, digits, math. SVG
 * `<text>` INHERITS the document's CSS `direction`, and the app shell is RTL Hebrew — so a trailing
 * bidi-NEUTRAL character resolved to the paragraph level and was placed visually BEFORE its letter.
 * `displayLabel` maps `A'` → `A′` (U+2032 PRIME, bidi class ET), so **every primed label** drew
 * mirrored: `′A`, `′B`, `′C` on the operator's prism.
 *
 * Set at the ROOT rather than per node, because per-node is the pattern that failed: #468/#482 wrapped
 * witnesses, line forms and coordinate labels in {@link ltr}, and each new text node has to REMEMBER to
 * opt in — which is exactly how the most common primed run on the canvas slipped through. One
 * declaration covers every current and future `<text>`. This is 2-D's `mathSvg.tsx` rule (`direction:
 * 'ltr'` on its SVG text), COPIED rather than imported — the products never share code (boundary rule 1).
 *
 * `direction` only, never `unicode-bidi: bidi-override`: a strong-RTL run (a Hebrew name, should one
 * ever be drawn) must still lay out RTL inside the LTR paragraph. The existing `ltr()` isolates stay —
 * harmless and still correct under an LTR base.
 */
const CANVAS_DIR = { direction: 'ltr' } as const;

export default function Figure3({ construction, resolved, width = 640, height = 460, resetLabel = 'reset view', coordLabels, planeDisplay, showWitnesses = true, showObjectAngles = false, onNameCrossing, onRenamePoint, renameText, crossingLabel, presetLabels }: Figure3Props) {
  /**
   * #5 — the HOME camera for THIS figure. A purely planar figure is read face-on (`planarNormal` /
   * `faceOnView`, engine/defaultView); everything else keeps the ¾ textbook view. Derived from the
   * resolved positions, so it follows the figure rather than being decided once at mount.
   *
   * NOT changed: the direction the ENGINE scores unstated placements against (#372) stays the fixed
   * default view. Orbiting is a view concern (docs/20 §6.4) and this is orbiting — letting a flat
   * figure's own plane feed back into placement scoring would make the geometry depend on the camera,
   * which is the one thing that module's header forbids.
   */
  const home = useMemo<Camera3>(() => {
    const n = planarNormal([...resolved.positions.values()]);
    if (!n) return HOME_CAMERA;
    const v = faceOnView(n, (MAX_PITCH * 180) / Math.PI);
    return { yaw: (v.yawDeg * Math.PI) / 180, pitch: (v.pitchDeg * Math.PI) / 180 };
  }, [resolved]);

  const [cam, setCam] = useState<Camera3 | null>(null); // null = "follow home" (never orbited yet)
  const [zoom, setZoom] = useState(1);
  // #533 (ADR-3D-155): PAN, in screen pixels — the third component of the view gauge, beside orbit and
  // zoom, and on exactly the same tier: local state, outside the store, outside undo (docs/20 §6.4).
  // The figure never moves; only the frame does. Under an orthographic camera a pan is a screen-space
  // TRANSLATION, so it needs nothing from the projection: `scene3.ts` stays pure and untouched, every
  // coordinate `buildScene3` emits is unchanged, and the #483 crossing hit targets translate with
  // their marks for free.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** #578: the on-canvas rename popover — which point, where (canvas px, pan included), and the note a
   *  refusal leaves. View state, like orbit/zoom/pan: outside the store and outside undo. */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [menuNote, setMenuNote] = useState('');
  const drag = useRef<{ x: number; y: number } | null>(null);
  /** #533: which gesture the current drag is — orbit (the primary, unmoved) or pan. */
  const dragMode = useRef<'orbit' | 'pan'>('orbit');
  /** #533: live pointers, so a TWO-pointer touch drag can pan while one finger still orbits. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // An UNTOUCHED camera follows the figure: build a flat triangle and it is face-on immediately, not
  // after pressing reset. Once the student orbits, the camera is theirs and the figure never moves it.
  const view = cam ?? home;

  const scene = useMemo(
    () => buildScene3(construction, resolved, view, { width, height }, zoom, planeDisplay, showWitnesses, showObjectAngles),
    [construction, resolved, view, width, height, zoom, planeDisplay, showWitnesses, showObjectAngles],
  );

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY };
    dragMode.current = dragModeFor({ button: e.button, shiftKey: e.shiftKey, pointerCount: pointers.current.size });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // a second finger landing mid-drag turns it into a pan, without needing a fresh gesture
    if (pointers.current.size > 1) dragMode.current = 'pan';
    if (dragMode.current === 'pan') {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }
    // The first drag ADOPTS the current home view and makes it the student's (#5): orbiting from
    // `null` must start where they can see the figure, not snap back to the ¾ view.
    const k = orbitStep(width); // #724: width-normalized — the old fixed rad/px went jumpy at full width
    setCam((c) => {
      const from = c ?? home;
      return {
        yaw: from.yaw - dx * k,
        pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, from.pitch + dy * k)),
      };
    });
  };
  const onPointerUp = (e?: RPointerEvent<SVGSVGElement>) => {
    if (e) pointers.current.delete(e.pointerId);
    else pointers.current.clear();
    drag.current = null;
    if (pointers.current.size === 0) dragMode.current = 'orbit';
  };
  /** Zoom by a factor about a screen point (the #533 framing math). The wheel aims at the pointer;
      the cluster's − / + buttons (#742) aim at the canvas centre. */
  const zoomAbout = (q: { x: number; y: number }, factor: number) => {
    setZoom((z) => {
      const next = Math.max(0.3, Math.min(4, z * factor));
      const r = next / z; // the ACTUAL ratio — at the clamp it is 1, so a clamped zoom pans nothing
      setPan((p) => panForZoom(q, p, r));
      return next;
    });
  };
  const zoomBy = (factor: number) => zoomAbout({ x: width / 2, y: height / 2 }, factor);
  const onWheel = (e: RWheelEvent<SVGSVGElement>) => {
    // #533: zoom ABOUT THE POINTER. Without this, `k` grows while the fit stays centred on the content
    // bbox, so zooming in magnifies about a point that may be nowhere near the solid and drives it
    // further off-canvas — the gesture that LOSES the figure. Keeping whatever is under the cursor
    // under the cursor is what turns zoom into a framing tool: q = (q − pan)·r + pan' ⇒ pan' = q − (q − pan)·r.
    const rect = e.currentTarget.getBoundingClientRect();
    zoomAbout({ x: e.clientX - rect.left, y: e.clientY - rect.top }, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  /** #578: hand the typed letter to the host and keep the popover OPEN on a refusal, with the reason —
   *  a menu that closed on failure would read as "it worked". */
  function applyRename() {
    if (!menu || !onRenamePoint || !renameText) return;
    const to = renameVal.trim().toUpperCase();
    if (!to) return;
    const res = onRenamePoint(menu.id, to);
    if (res.ok) setMenu(null);
    else setMenuNote(res.reason === 'target-taken' ? renameText.taken : renameText.bad);
  }

  return (
    <div className="relative" data-testid="figure3">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="rounded-xl border border-slate-200 bg-white touch-none cursor-grab active:cursor-grabbing select-none"
        style={CANVAS_DIR}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        // #533: a right-button drag must not end in the browser's context menu
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* #533 (ADR-3D-155): the PAN gauge, applied as ONE screen-space translation of the whole
            scene. Every child keeps the coordinates `buildScene3` emitted — including the #483
            crossing hit targets, which move with their marks for free — so panning cannot alter the
            figure, the scene, or anything derived from them. */}
        <g data-testid="pan-group" transform={`translate(${pan.x} ${pan.y})`}>
        {scene.axes.map((a) => (
          <g key={a.axis} data-testid={`axis-${a.axis}`}>
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#cbd5e1" strokeWidth={1.1} />
            <text x={a.labelX} y={a.labelY} fontSize={13} fontStyle="italic" fill="#94a3b8" textAnchor="middle" dominantBaseline="middle">
              {a.axis}
            </text>
          </g>
        ))}
        {scene.planes.map((p, i) => (
          <g key={p.name} data-testid={`plane-${p.name}`}>
            <polygon
              points={p.corners.map((c) => `${c.x},${c.y}`).join(' ')}
              fill={PLANE_COLORS[i % PLANE_COLORS.length]}
              fillOpacity={0.1}
              stroke={PLANE_COLORS[i % PLANE_COLORS.length]}
              strokeOpacity={0.35}
              strokeWidth={1}
            />
            <text
              x={p.labelX}
              y={p.labelY}
              fontSize={14}
              fill={PLANE_COLORS[i % PLANE_COLORS.length]}
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {p.name}
            </text>
          </g>
        ))}
        {scene.curves.map((cu, i) => (
          <polyline
            key={`curve-${i}`}
            points={cu.pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={cu.hidden ? '#94a3b8' : '#1e293b'}
            strokeWidth={cu.hidden ? 1.2 : 1.6}
            strokeDasharray={cu.hidden ? '7 5' : undefined}
            strokeLinecap="round"
          />
        ))}
        {scene.seams.map((s, i) => (
          <line
            key={`seam-${i}`}
            data-testid="seam"
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="#64748b"
            strokeWidth={1.2}
          />
        ))}
        {/* #397 (ADR-3D-108): the stated distance's WITNESS — dashed height/gap + its value.
            Dashed here means AUXILIARY, drawn in its own colour so it never reads as a hidden
            edge (the ADR-3D-104 lesson about dash semantics). */}
        {scene.witnesses.map((w, i) => (
          <g key={`witness-${i}`} data-testid="distance-witness">
            <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#d97706" strokeWidth={1.6} strokeDasharray="5 4" strokeLinecap="round" />
            <text x={w.labelX} y={w.labelY} fontSize={12} fill="#b45309" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
              {ltr(w.text)}
            </text>
          </g>
        ))}
        {scene.angles.map((a, i) => (
          <g key={`angle-${i}`} data-testid="plane-angle">
            <polyline
              points={a.pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#d97706"
              strokeWidth={1.5}
            />
            <text
              x={a.labelX}
              y={a.labelY}
              fontSize={13.5}
              fill="#b45309"
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {a.text}
            </text>
          </g>
        ))}
        {scene.lines.map((l) => (
          <g key={l.name} data-testid={`line-${l.name}`}>
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#475569" strokeWidth={1.5} />
            <text
              x={l.labelX}
              y={l.labelY}
              fontSize={12.5}
              fill="#475569"
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ltr(l.form)}
            </text>
          </g>
        ))}
        {scene.marks.map((m, i) => (
          <polyline
            key={i}
            points={m.pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#1e293b"
            strokeWidth={1.1}
          />
        ))}
        {scene.edges.map((e) => (
          <line
            key={e.id}
            data-testid={e.id}
            data-hidden={e.hidden ? 'true' : 'false'}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.hidden ? '#94a3b8' : '#1e293b'}
            strokeWidth={e.hidden ? 1.3 : 1.7}
            strokeDasharray={e.hidden ? '7 5' : undefined}
            strokeLinecap="round"
          />
        ))}
        {scene.vectors.map((v, vi) => (
          <g key={v.name || `arrow-${vi}`} data-testid={`vec-${v.name || `arrow-${vi}`}`}>
            {/* the vector itself, in its own colour: tail→head overlay, ARROWHEAD AT THE HEAD (`to`) */}
            <line
              x1={v.x1}
              y1={v.y1}
              x2={v.x2}
              y2={v.y2}
              stroke={VECTOR_COLOR}
              strokeWidth={2}
              strokeDasharray={v.hidden ? '7 5' : undefined}
              strokeLinecap="round"
            />
            <path
              d="M 0 0 L -9 -4.5 L -9 4.5 Z"
              transform={`translate(${v.x2} ${v.y2}) rotate(${v.angleDeg})`}
              fill={VECTOR_COLOR}
            />
            {/* #849 (ADR-3D-195): the name in textbook vector notation — the UNDERLINE ONLY. Every
                label here is a DECLARED name (`c.vectors`), never a point pair, and the arrow means
                "from A to B", which a name has no endpoints for. The direction is already carried by
                this vector's own coloured shaft and its arrowhead at the head point (ADR-3D-003 Am.),
                so an arrow over the letter was a third marking of the same fact. The underline STAYS:
                the label sits away from the shaft, and a bare italic letter beside a teal line would
                read as a point label. An UNNAMED ink arrow (#72 `חץ A'C`) draws no label. */}
            {v.name && (
              <g transform={`translate(${v.labelX} ${v.labelY})`}>
                <text
                  x={0}
                  y={0}
                  fontSize={15}
                  fontStyle="italic"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fill={VECTOR_COLOR}
                  stroke="#ffffff"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {v.name}
                </text>
                <line x1={-6} y1={9} x2={6} y2={9} stroke={VECTOR_COLOR} strokeWidth={1.2} />
              </g>
            )}
          </g>
        ))}
        {/* #483 — the OFFER: a hollow dot where a determined line∩plane crossing has no name yet.
            Hollow and in the plane palette so it reads as "available", never as an existing point;
            drawn before the real points so a named point always wins the pixels. The generous
            transparent hit target is what makes it clickable on a tablet without enlarging the mark.
            `stopPropagation` keeps the click off the orbit drag underneath. */}
        {onNameCrossing &&
          scene.crossings.map((k) => (
            <g
              key={`${k.line}|${k.plane}`}
              className="cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onNameCrossing(k);
              }}
            >
              <title>{crossingLabel}</title>
              <circle cx={k.x} cy={k.y} r={11} fill="transparent" />
              <circle cx={k.x} cy={k.y} r={4} fill="#ffffff" stroke={PLANE_COLORS[0]} strokeWidth={1.6} strokeDasharray="2.5 2" />
            </g>
          ))}
        {scene.points.map((p) => (
          <g
            key={p.id}
            className={onRenamePoint ? 'cursor-pointer' : undefined}
            // #578: the generous transparent hit ring is the #483 pattern — clickable on a tablet
            // without enlarging the dot — and `stopPropagation` keeps the click off the orbit drag.
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
            <circle cx={p.x} cy={p.y} r={3} fill="#0f172a" />
            <text
              x={p.x + p.labelDx}
              y={p.y + p.labelDy}
              fontSize={15}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill="#0f172a"
              stroke="#ffffff"
              strokeWidth={3.5}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {p.label}
            </text>
            {coordLabels?.[p.id] && (
              <text
                x={p.x + p.labelDx}
                y={p.y + p.labelDy + 13}
                fontSize={11}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fill="#0369a1"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {ltr(coordLabels[p.id].text)}
              </text>
            )}
          </g>
        ))}
        </g>
      </svg>
      {/* #578 (ADR-3D-211) — the on-canvas rename popover, 2-D's FR-RN-10 ported. PHYSICAL `left`, not
          `insetInlineStart`: the coordinate is a left-based canvas pixel, and under the Hebrew-default
          RTL a logical inset resolves to `right`, opening the menu mirrored — the exact bug 2-D records
          at its own menu (F1/REN-1). The backdrop closes it, so it can never be stranded open. */}
      {menu && onRenamePoint && renameText && (
        <>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setMenu(null)} />
          <div
            dir="ltr"
            data-testid="rename-menu"
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
              <button type="button" onClick={applyRename} style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc' }}>
                {renameText.apply}
              </button>
            </div>
            {menuNote && <div style={{ fontSize: 11, color: '#b45309' }}>{menuNote}</div>}
          </div>
        </>
      )}
      {/* #742 / ADR-W-024: the canvas corner cluster — ↺ − +, the SAME cluster every builder's
          canvas carries (shared style + step from shell/frame/canvasControls). The zoom buttons
          reuse the wheel's about-a-point math, aimed at the canvas centre; the clamp stays this
          renderer's own [0.3, 4] — an orthographic fit tolerates less range than the 2-D plane. */}
      <div style={canvasClusterStyle} dir="ltr">
        <button
          type="button"
          aria-label={resetLabel}
          title={resetLabel}
          style={canvasCtrlStyle}
          onClick={() => {
            setCam(null); // back to following the figure's own home view (#5)
            setZoom(1);
            setPan({ x: 0, y: 0 }); // #533: ONE button returns to a known-good frame — this is what
          }} //            makes free panning safe to hand a student
        >
          ↺
        </button>
        {/* #714 — the ALIGN half orbit does not give: snap to a canonical orientation. Beside ↺ because
            that is where the view controls already live and where the camera state IS; zoom and pan are
            deliberately KEPT, since a student who framed the figure did so on purpose and only asked to
            turn it. Rendered only when labels are supplied, so the component stays translation-free. */}
        {presetLabels &&
          VIEW_PRESET_ORDER.filter((k) => presetLabels[k]).map((k) => (
            <button
              key={k}
              type="button"
              style={canvasCtrlStyle}
              title={presetLabels[k]}
              aria-label={presetLabels[k]}
              onClick={() => setCam(VIEW_PRESETS[k])}
            >
              {PRESET_GLYPH[k]}
            </button>
          ))}
        <button type="button" style={canvasCtrlStyle} title="zoom out" aria-label="zoom out" onClick={() => zoomBy(1 / CANVAS_ZOOM_STEP)}>
          −
        </button>
        <button type="button" style={canvasCtrlStyle} title="zoom in" aria-label="zoom in" onClick={() => zoomBy(CANVAS_ZOOM_STEP)}>
          +
        </button>
      </div>
    </div>
  );
}
