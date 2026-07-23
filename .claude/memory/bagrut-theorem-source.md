---
name: bagrut-theorem-source
description: "Canonical source for Geo Builder's theorem-surfacing feature — the official bagrut geometry theorem list"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 88027cdc-952d-4125-8f14-2fb88bd19212
---

The authoritative theorem list for Geo Builder's theorem feature is `docs/5pts_GeometryList_Teachers.pdf` (official bagrut 5-unit, teacher version, Hebrew). **109 numbered theorems** grouped by topic (angles & parallels; triangles — general/congruence/isosceles/right; quadrilaterals — kite/trapezoid/parallelogram/rectangle/rhombus/square; midsegments; similarity & proportion incl. Thales & angle-bisector; inscribed/circumscribed circles & concurrency points; circle theorems) plus definitions, area formulas, and two appendices (demoted-to-practice; removed-from-curriculum).

The PDF is **copy-protected** — the Read tool refuses it; extract text with PyMuPDF (`python -c "import fitz; ..."`) and write to a UTF-8 file (Windows console is cp1255 and chokes on symbol chars). Plan: catalog it as `docs/07-theorem-reference.md`, **use the official theorem numbers as the engine's theorem IDs** (so surfaced theorems are citable by students), and tag each theorem by role (figure-detectable vs definition / area-formula / converse / out-of-scope). See [[architecture-decisions]].
