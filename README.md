# Word Split

A daily word game inspired by the *Split Decisions* puzzles from Games Magazine.
Two independent daily games played one round after another. The set is the same
for everyone each day. **Combos** is **3 rounds** of 5–8 letter words; **Forks**
is **2 rounds** of 5–6 letter words. Each round's answers are revealed right
after you play it (and again at the end).

## Modes

- **Combos** — given a 5–8 letter frame with two adjacent blanks (e.g.
  `hear__`), find *every* word that fits (hearer, hearse, hearth, hearts,
  hearty). Every real word that fits is a target (3–8 of them) — there are no
  "bonus" words, and a day always has at least one frame with 4+ fills.
- **Forks** — given a *split* (two letters on top, two on bottom), type the
  shared surrounding letters so both stacked letters form a real word. Every
  Forks puzzle has exactly **one** solution, verified against the full
  dictionary. (Renamed from "Split Decisions" to avoid the trademark.)

## Scoring

Rounds are worth **500** each: Combos tops out at **1500** (3 rounds), Forks at
**1000** (2 rounds).

- **Combos** — a 1:30 round, time-adjusted. The clock costs up to **100**
  points (nothing in the first **0:15**, ramping to the full −100 over the
  middle minute, then flat for the last **0:15**); the remaining value is then
  scaled by the share of fills found: `score = (500 − time) × found/total`. So
  all fills in the first 0:15 → 500; all in the last 0:15 → 400; 3 of 4 in the
  last 0:15 → 300. A wrong guess costs **2 seconds**.
- **Forks** — fully time-based over a 2:00 round. The first **0:15** are free
  (**500**); points then slide down over the next **1:30** to a floor of
  **200**, where they stay for the final **0:15**. Miss it → 0. Wrong guesses
  are free. The clock just counts down — no live points display.

Results persist per day and copy as a spoiler-free summary (points + times only
— never the words).

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
- `puzzles.js` — pre-verified daily pools: `COMBOS_POOL` and `FORKS_POOL`. The
  app date-seeds a pick of 2 each day, so puzzles are fresh daily and identical
  for all players.

## Regenerating puzzles

Puzzles are generated offline so quality (3–8 fills, every fill a common word;
unique Forks solutions) can be verified against the complete dictionary before
shipping. The generator (`generate.py`) needs two inputs:

- ENABLE word list (e.g. `dolph/dictionary` `enable1.txt`)
- a frequency list (Norvig `count_1w.txt`) to define the "in-use" tier

Run it to overwrite `puzzles.js`. Tunables at the top: `COMMON_N` (combos
vocabulary tier) and `FORK_COMMON_N` (a tighter tier for Forks), the per-mode
length bounds, the combo fill-count range, `JARGON` (curated technical words)
and `FOREIGN` (curated non-English words, derived with the `wordfreq` library
but baked in so generation needs no extra dependency), and pool size.
