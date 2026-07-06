# 19 — Analytic-geometry tool (a sibling app): scope, corpus reading, chassis split

_Drafted 2026-07-06 from an operator question: "I want to build a similar tool for analytical geometry (line equations, coordinates), and maybe vectors — is it a different tool altogether?" This note records the **corpus reading** of the bagrut analytic-geometry question, the **shared-chassis / new-core** decision, and the **locus ↔ free-DOF bridge** that makes the existing constructive engine more reusable than a first glance suggests. Status: **PROPOSED — one decision open (§6, draw-and-verify vs. derive-the-equation). No code yet.**_

The existing tool (Geo Builder, `/geo-builder`) is **synthetic** geometry: relations → a figure, coordinates deliberately derived/sampled/non-unique. This note is about a **second, sibling tool** for **analytic** geometry: coordinates and equations as the primary objects.

---

## 1. Corpus reading — what a bagrut Q1 actually is

Source corpus: `C:\Users\User\Dropbox\Math\בגרויות\572` (35572 / 035582, 5-unit שאלון שני). Analytic geometry is **always question 1** of פרק ראשון ("גאומטריה אנליטית, וקטורים, טריגונומטריה במרחב, מספרים מרוכבים"). Sampled 2020 קיץ, 2022 חורף, 2024 חורף.

The headline finding: **Q1 is almost never "given coordinates, compute a slope." It is a locus problem driven by a parameter.** A point sweeps under a parameter, the student must find the **equation of the curve it traces** (often with **two branches**), and only then is the parameter pinned by a later given to yield concrete coordinates.

| Exam | Q1 construction | The locus ask |
|---|---|---|
| **2024 חורף** | Right triangle `ABC`, `∠BAC=90°`, `A(a,0)` (a≠0 parameter), `B` at `x=−a`, `BC ∥ x`-axis, `M` = midpoint of `BC` | "הביעו באמצעות `a` את משוואת **המקום הגאומטרי** שעליו נמצאות כל הנקודות M" → then "שרטטו את **שתי האפשרויות**"; then pin `AM=10`, `B` on `x=−2` → exact coords + a tangent circle |
| **2020 קיץ** | Triangle `OMG`, `O` = origin, `M(2,6)`, `MG` the altitude onto `OG` | "הראה כי **המקום הגאומטרי** של כל הנקודות G… נמצא על **שני ישרים**, ומצא את משוואותיהם" → a circle centred at `M` tangent to both → its equation + intersection points `P,Q` |
| **2022 חורף** | `(t,0)` is the **focus** (מוקד) of a canonical parabola and ellipse, `t` parameter | Find the parabola + ellipse equations, their intersections, show four points concyclic (conics are themselves loci — focus/directrix) |

**Stable vocabulary** (for the parser): `המקום הגאומטרי`, `מצא/הביעו את משוואת ה…`, `פרמטר`, `שתי האפשרויות`, `שרטטו את העקום`, `ראשית הצירים`, explicit `(x,y)`, `עובר דרך`, `מקביל`, `ניצב`/`אנך`, `משיק`, `חותך`, `מוקד`/`מדריך` (conics).

So the recurring shape is: **sweep a parameterised point → read off the traced curve's equation → (often) two branches → pin the parameter → exact numbers.**

## 2. Decision — a different tool (URL), shared chassis, new core

It is a **separate app** (e.g. `/geo-analytic`), a **sibling in this same repo** (shared packages — one render/parser/RTL stack, not a forked project). The student chooses "synthetic" vs "analytic" as a topic; they are different bagrut sections. The center of gravity — coordinates + equations — is genuinely different work, which is why it is a new tool rather than a mode bolted onto the existing engine.

## 3. What reuses the existing chassis (≈ free)

- The **SVG renderer** + `transform.ts` (world→screen, isotropic fit, Y-flip). Axes/grid are a small addition.
- The **bilingual RTL parser front-end** + LLM fallback + `catalog` pattern.
- The **app shell** — fact list, undo/redo, save/load `.geo.json`, image export, i18n.
- **The free-DOF sweep + branches** as the locus generator — see §5.

## 4. What is genuinely new (the bulk of the effort)

1. **Coordinate substrate** — axes, gridlines, exact given coordinates as pinned points (`A(a,0)`, `M(2,6)`), symbolic parameters (`a`, `t`). Small.
2. **Equation layer (CAS-lite)** — represent, read back, and verify `y=mx+b`, line-pairs, circle and conic equations. This is the heart of the new build and has **no analog in the existing engine**. Loci make it unavoidable: the answer to "find the locus" *is* an equation, not a picture.
3. **Conic primitives** — focus/directrix/eccentricity; canonical parabola, ellipse, hyperbola. A new object family.

## 5. The locus ↔ free-DOF bridge (why the existing engine is more reusable than it first seems)

A locus is **exactly a swept free DOF**, which the constructive engine already models:

- "all points M obtained this way" = sample the free parameter and trace the derived point → the existing `freeDofs` + sampler.
- "שתי האפשרויות" (two possibilities) = **branches** → the existing `cycleAlternative` / branch index.
- The construction generating each M ("drop the altitude, take the midpoint") = a **dependency graph** → the existing engine verbatim.

So the *figure-generation half* of a Q1 is the current engine nearly unchanged. A **locus mode** is, at minimum: don't clear the swept positions — overlay the trace of the derived point as its DOF varies (a striking visual: the student watches the curve get painted). The new work sits *on top* of this generator, not instead of it.

## 6. Open decision — the locus deliverable (blocks a real spec)

- **(a) Draw-and-verify** — the student states the construction *and* the claimed locus equation; the tool sweeps, paints the trace, and confirms the equation fits. **Small; sits directly on the existing sweep.** Consistent with the synthetic tool's "reproduce/verify, never solve" rule.
- **(b) Derive-the-equation** — the tool produces `y = …` symbolically from the construction. **A real CAS build**, and closer to "solving" than the synthetic tool has ever gone.

**Operator to decide.** Everything downstream (how big "the equation layer" is) turns on this.

## 7. Vectors / 3D — a third tool, later

In these papers **vectors live in Q2 — 3-D space**: prisms, planes (`π: 3x+my+…=0`), lines (`x⃗=(−1,5,−11)+t(…)`), `AM⃗=…`, dot products, angles between planes. That needs a **3-D engine and renderer** — a distinct, larger track, not a 2-D add-on. ~~Park it as a third tool after the 2-D analytic/locus tool.~~ **Now planned in detail: [20-space-vectors-tool.md](20-space-vectors-tool.md) (2026-07-06).**

---

**Summary:** a new tool at its own URL, sibling in this repo; reuses render + parser + shell + the free-DOF sweep; the new core is the coordinate substrate + an equation/CAS-lite layer + conic primitives. Loci — the spine of the bagrut Q1 — bridge cleanly onto the existing free-DOF machinery. Vectors/3-D is a separate third track. **Next step: operator resolves §6, then this becomes a full plan (functional requirements + a phased build order in the [09-implementation-plan](09-implementation-plan.md) style).**
