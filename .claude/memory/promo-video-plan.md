---
name: promo-video-plan
description: "Parked (not priority) plan for Hebrew promotional videos for teachers — format, storyboard, pipeline, open questions (2026-09-27)"
metadata:
  node_type: memory
  type: project
  originSessionId: f7ed5a70-075c-4fed-8411-2f6e5f5c2b79
  modified: 2026-09-27T18:05:01.154Z
---

**Status: parked 2026-09-27 by the operator — "we will return to it but it's not priority now".** Nothing
built yet. Resume from the open questions at the bottom.

**Brief (operator's answers):** audience = teachers (use it themselves or promote it to their classes) ·
channels = Instagram + WhatsApp groups · language = Hebrew · voice-over yes · no music.

**Format decided:** 9:16 portrait, 1080×1920 (Reels + WhatsApp full-screen) · one ~60 s main video plus
3–4 single-idea 20–30 s clips (a series suits WhatsApp groups) · Hebrew subtitles burned in (sound-off viewing).

**Measured 2026-09-27 (Playwright, 432×768 viewport @ DPR 2.5 on the 5173 dev server):** 2-D
`ריבוע ABCD` → `נקודה G על AD` → `זווית GBA = 37` and 3-D `קובייה ABCD` → `M אמצע BB'` all built, no
refusals, figures crisp. BUT at phone width the input sits below the figure — typing and figure are never
on screen together. **Decision: record desktop-landscape, compose the portrait frame in post** (typed
line as a large caption on top, figure in the middle, subtitles below). Seen on the way: the 2-D "37°"
label overlaps its own arc (not filed — ask whether to file a polish issue).

**Draft storyboard (~60 s):**
1. 0–4 empty canvas, type «ריבוע ABCD» — VO «מה אם התלמידים שלכם יכלו פשוט *לכתוב* את השרטוט?»
2. 4–14 «נקודה G על AD» → «זווית GBA = 37», G slides — «כותבים נתון אחרי נתון, בעברית רגילה — והשרטוט נבנה ומתעדכן»
3. 14–22 press «הציגו תצורה אחרת» — «יש יותר משרטוט אחד אפשרי? לחיצה אחת מראה את האפשרות הבאה»
4. 22–34 a real bagrut question rebuilt beside the official figure — «שאלות בגרות אמיתיות — משרטטים תוך שניות»
5. 34–42 theorems surfacing — «והמשפטים הרלוונטיים עולים תוך כדי»
6. 42–52 quick cut 3-D cube + complex — «וגם גאומטריה במרחב ומספרים מרוכבים»
7. 52–60 closing card, link + «חינם, בדפדפן, בלי התקנה» — «נסו עם הכיתה שלכם — הקישור בתיאור» (verify the claims before use)

**Pipeline:** Playwright script types each line at human pace with `recordVideo` (re-runnable when the UI
changes; reuse `waitForSettle`/`dismissModal` from `scripts/visual-smoke.mjs`) → operator records VO per
scene on his phone, video is timed to the VO → Remotion (React) composes portrait layout, captions,
subtitles, end card → MP4. ffmpeg is NOT installed on the home PC yet (winget). Hebrew TTS is an external
service — ask before using it.

**Open questions for the operator:** (1) record the VO himself (recommended) or TTS? (2) the URL for the
end card; (3) which bagrut question for scene 4 — or pick one from `docs/sample questions/` via the
`exercise-sequence` agent. First deliverable once resumed: scene 2 alone, to judge the look.
