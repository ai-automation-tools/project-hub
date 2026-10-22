# Routing

Three segments: `(marketing)`, `(app)` and `(export)`.

`(export)` is separate because its pages poll, and polling inside the shared layout kept
the app shell re-rendering on a timer. Splitting the segment gave it its own layout and
the shell went quiet.

## Rules

- A route that needs auth lives under `(app)`. There is no per-page guard.
- Marketing pages are static. If one needs data, it is not a marketing page.
- Never add a fourth segment to solve a styling problem.
