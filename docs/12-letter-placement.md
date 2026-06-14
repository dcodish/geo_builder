# Controlling where the letters land

Two independent levers decide a figure's lettering: **the order you name the
vertices** (which corner gets which letter) and **orientation** (rotate / flip,
which side the figure sits on). When neither is enough, **rename** a point after
the fact. This note is the practical guide for matching a textbook's lettering.

## 1. Naming order = the letters, going counter-clockwise from bottom-left

Every polygon template lays its vertices out the same way:

- The **first two letters** are the base, left → right along the bottom.
- The **rest continue counter-clockwise** (i.e. upward), back to the start.

So `square ABCD` / `ריבוע ABCD` draws:

```
D --------- C        A = bottom-left
|           |        B = bottom-right
|           |        C = top-right
A --------- B        D = top-left   (A→B→C→D counter-clockwise)
```

To get a *different* corner arrangement, name the vertices in the order you want
them to appear counter-clockwise from the bottom-left. The polygon is the same
shape whichever vertex you start from or whichever way you go round, so:

- `ריבוע DCBA` reverses the walk → `D` bottom-left, `C` bottom-right, `B` top-right, `A` top-left.
- `מלבן BADC`, `מלבן CDAB`, … each rotate/reflect which letter sits where.

The same base-then-CCW rule holds for triangle, rectangle, rhombus,
parallelogram, trapezoid, and quadrilateral.

## 2. Orientation = which side it sits on (labels stay upright)

The canvas controls (top-left of the figure) rotate and flip the **whole
figure** without changing the lettering — labels always stay upright:

- **⟳ / 180° / slider** — rotate.
- **⇄ / ⇅** — flip horizontal / vertical (mirror to the other side).
- **`⎯ AB`** box — type a segment's two letters to lay that segment horizontal.

Use a flip when the shape you want is the mirror of what naming order gives (e.g.
you want the "long" trapezoid leg on the right instead of the left).

## 3. Rename = the escape hatch for any arrangement

Naming order + flipping can't always reach a book's exact lettering — especially
**interior / derived points** (an intersection, a midpoint, a foot), whose
position is fixed by the construction, not by how you typed it. For those, just
relabel afterward:

```
rename E to G        שנה שם E ל-G
relabel E as G       החלף E ב-G
rename E G           שנה E ל-G
```

A rename rewrites that letter across **every** step (and the figure is
geometrically identical — only the name changes); it's undoable. It refuses to
relabel onto a letter that's already in use (that would merge two distinct
points) — free up the target letter first, or rename in two hops
(`B → Z`, then `A → B`).

## Worked example — the rectangle with interior points (book figure 2)

`A` top-left, `B` top-right, `C` bottom-right, `D` bottom-left, with `E`,`F` the
side-midpoints, `G`,`H` interior, `O` on the base:

1. Type the rectangle so the corners land right: `מלבן DABC`-style ordering, or
   type `מלבן ABCD` and **flip vertical** so `A`,`B` are on top.
2. Add the interior construction (midpoints, the diagonal/segment intersections).
   They'll auto-name (`M`, `N`, …) by construction order.
3. **Rename** them to the book's letters: `שנה שם M ל-G`, `שנה שם N ל-H`, …

Steps 1–2 get the geometry; step 3 gets the exact lettering.
