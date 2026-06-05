# Word Split

A daily word game inspired by the *Split Decisions* puzzles from Games Magazine.
Two independent daily games; each plays **3 puzzles one after another**, with a
**1:30 countdown** per puzzle. The set is the same for everyone each day.

## Modes

- **Combos** — given a 5–9 letter frame with two adjacent blanks (e.g. `cr__k`),
  find *every* in-use word that fits (creek, crook, croak, crack…). Each frame
  has 4–10 target fills.
- **Forks** — given a *split* (two letters on top, two on bottom), type the
  shared surrounding letters so both stacked letters form a real word. Every
  Forks puzzle has exactly **one** solution, verified against the full
  dictionary. (Renamed from "Split Decisions" to avoid the trademark.)

## Scoring

Each puzzle has a 1:30 limit. Full points if solved within the first 30s, then a
straight slide down to the floor at 1:30; run out of time and it auto-advances.

- **Forks:** solve → **1500** (≤30s) sliding to a **500** floor. Miss it → 0.
- **Combos:** **800** for completion, scaled by how many of the fills you find,
  plus a **200** time bonus that only kicks in once you've found them all.

Typing any other real word in Combos is accepted as a gold "bonus" chip (no
points, no penalty). Results persist per day and copy as a spoiler-free summary
(points + times only — never the words).

## Run locally

Plain HTML/CSS/JS, no build step. Serve the folder over HTTP:

```sh
python3 -m http.server 4173
# open http://localhost:4173
```

## Deploy (GitHub Pages)

Push to GitHub, then **Settings → Pages** → source = `main` branch, root folder.
Live at `https://<user>.github.io/word_split/`.

## Files

- `index.html`, `styles.css`, `app.js` — the game.
- `dictionary.js` — the full **ENABLE** word list (public-domain, Scrabble-grade,
  no proper nouns), lengths 5–9. Used to accept any real word typed in Combos.
- `puzzles.js` — pre-verified daily pools: `COMBOS_POOL` (755 frames) and
  `FORKS_POOL` (800 unique-solution pairs). The app date-seeds a pick of 3 each
  day, so puzzles are fresh daily and identical for all players.

## Regenerating puzzles / dictionary

Puzzles and the dictionary are generated offline so quality (4–10 fills; unique
Forks solutions) can be verified against the complete dictionary before
shipping. The generator (`generate.py`) needs two inputs:

- ENABLE word list (e.g. `dolph/dictionary` `enable1.txt`)
- a frequency list (Norvig `count_1w.txt`) to define the "in-use" tier

Run it to overwrite `dictionary.js` and `puzzles.js`. Tunables at the top:
`COMMON_N` (how strict "in use" is), length bounds, fill-count range, and pool
size per word length.
