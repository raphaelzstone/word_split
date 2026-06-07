# Word Split

A daily word game inspired by the *Split Decisions* puzzles from Games Magazine.
Two independent daily games; each plays **2 rounds one after another**. The set
is the same for everyone each day. Combos use **5–8 letter** words; Forks use
**5–6 letter** words.

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

Each game is out of **1000** — two rounds worth **500** each.

- **Combos** — a 1:30 limit (not time-scored). Each fill is worth
  `floor(500 / total)`; completing the set pays the rounding remainder, so a
  7-fill frame accrues `71+71+71+71+71+71+74 = 500`. A wrong guess costs
  **2 seconds**.
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
length bounds, the combo fill-count range, `JARGON` (a curated block of
technical/foreign words), and pool size.
