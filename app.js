"use strict";

/* ===========================================================================
 * Word Split — daily word puzzles (vanilla JS)
 *
 * Two independent daily games, each 2 rounds (500 pts each, 1000 total):
 *   combos — find every 2-letter fill for a 5-8 letter frame (3-8 fills). Every
 *            real word that fits is a target; each fill pays floor(500/total)
 *            with the last one taking the remainder. 1:30 limit (not time-
 *            scored); a wrong guess costs 2 seconds.
 *   forks  — given a split, type the shared letters (one unique solution).
 *            Fully time-based over a 2:00 round: first 0:15 free (500), then a
 *            1:30 slide down to 200, then the final 0:15 flat at 200. Wrong
 *            guesses are free.
 *
 * Puzzles are date-seeded picks from pre-verified pools (puzzles.js), so
 * everyone gets the same fresh set each day. Results persist per day and copy
 * as a spoiler-free summary (points + times only — never the words).
 * ========================================================================= */

const ROUNDS_PER_DAY = 2;
const WRONG_PENALTY_SEC = 2;     // a wrong guess costs this much time

const COMBO_LIMIT_SEC = 90;      // 1:30 limit, not time-scored
const FORK_LIMIT_SEC = 120;      // 2:00 round, fully time-scored
const FORK_FREE_SEC = 15;        // full points within the first 0:15
const FORK_FLOOR_SEC = 105;      // 200-pt floor reached here (last 0:15 flat)

const ROUND_POINTS = 500;        // each round is worth up to this

const CONFIG = {
  combos: { name: "Combos", pool: COMBOS_POOL, limit: COMBO_LIMIT_SEC },
  forks: { name: "Forks", pool: FORKS_POOL, limit: FORK_LIMIT_SEC },
};

// --- Scoring ----------------------------------------------------------------
// Forks: solved within 0:15 -> 500; slide to 200 by 1:45; flat 200 to 2:00.
function forkScore(solved, sec) {
  if (!solved) return 0;
  if (sec <= FORK_FREE_SEC) return ROUND_POINTS;
  if (sec >= FORK_FLOOR_SEC) return 200;
  return Math.round(
    ROUND_POINTS - (ROUND_POINTS - 200) * (sec - FORK_FREE_SEC) / (FORK_FLOOR_SEC - FORK_FREE_SEC));
}
// Combos: pure completion. Each fill is worth floor(500/total); completing the
// set pays the rounding remainder, so 7 fills accrue 71+71+71+71+71+71+74=500.
function comboScore(found, total) {
  if (found >= total) return ROUND_POINTS;
  return found * Math.floor(ROUND_POINTS / total);
}

// --- Seeded RNG (mulberry32) ------------------------------------------------
function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededPick(pool, count, seedStr) {
  const rng = mulberry32(hashString(seedStr));
  const idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, count).map((i) => pool[i]);
}

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtElapsed(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// --- DOM + views ------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const views = { menu: $("#view-menu"), game: $("#view-game"), results: $("#view-results") };
function showView(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  $("#home-btn").hidden = name === "menu";
}

// --- Storage ----------------------------------------------------------------
const storageKey = (mode) => `wordsplit:${mode}:${dateKey()}`;
function loadResult(mode) {
  try { return JSON.parse(localStorage.getItem(storageKey(mode)) || "null"); }
  catch { return null; }
}
function saveResult(mode, result) {
  try { localStorage.setItem(storageKey(mode), JSON.stringify(result)); }
  catch { /* storage unavailable — game still works */ }
}

// --- Build today's puzzles --------------------------------------------------
// Combos: seeded pick of 2 frames, guaranteeing at least one has 4+ fills so a
// day is never two trivial 3-fill frames.
function pickCombos(pool, seedStr) {
  const order = seededPick(pool, pool.length, seedStr);
  const picks = order.slice(0, ROUNDS_PER_DAY);
  if (picks.every((p) => p.answers.length === 3)) {
    const alt = order.slice(ROUNDS_PER_DAY).find((p) => p.answers.length >= 4);
    if (alt) picks[picks.length - 1] = alt;
  }
  return picks;
}

function buildPuzzles(mode) {
  if (mode === "combos") {
    return pickCombos(CONFIG.combos.pool, `combos:${dateKey()}`).map((p) => {
      const [pre, suf] = p.frame.split("__");
      return {
        type: "combos",
        frame: p.frame, pre, suf,
        answers: p.answers.map((a) => a.toLowerCase()),
        found: [], solved: false,
      };
    });
  }
  const picks = seededPick(CONFIG.forks.pool, ROUNDS_PER_DAY, `forks:${dateKey()}`);
  return picks.map((p) => {
    const i = p.splitIndex;
    const w1 = p.word1.toUpperCase(), w2 = p.word2.toUpperCase();
    return {
      type: "forks",
      length: w1.length, splitIndex: i,
      top: w1.slice(i, i + 2), bottom: w2.slice(i, i + 2),
      shared: (w1.slice(0, i) + w1.slice(i + 2)).split(""),
      words: [w1, w2], solved: false,
    };
  });
}

/* ===========================================================================
 * Game state + per-puzzle loop
 *
 * Time is tracked as effective elapsed = wall clock + accumulated penalties,
 * so a wrong guess simply adds WRONG_PENALTY_SEC to your spent time.
 * ========================================================================= */
let game = null;

function startGame(mode) {
  const existing = loadResult(mode);
  if (existing) { renderResults(mode, existing, /*replay*/ true); return; }

  game = {
    mode, cfg: CONFIG[mode], puzzles: buildPuzzles(mode),
    idx: 0, results: [], puzzleStart: 0, penaltyMs: 0, tickId: null,
  };
  $("#rules-text").textContent = mode === "combos"
    ? "Type every two-letter fill that makes a real word. 1:30 per round · wrong guess −2s."
    : "Type the shared letters so both stacked letters make a real word. Faster = more points.";
  showView("game");
  showPuzzle(0);
}

function showPuzzle(i) {
  game.idx = i;
  game.penaltyMs = 0;
  const p = game.puzzles[i];
  $("#progress-pill").textContent = `Round ${i + 1} of ${ROUNDS_PER_DAY}`;
  $("#skip-btn").hidden = false;
  $("#skip-btn").textContent = "Skip round";

  const root = $("#puzzles");
  root.innerHTML = "";
  root.appendChild(p.type === "combos" ? renderCombo(p) : renderFork(p));

  game.puzzleStart = performance.now();
  updateCountdown();
  game.tickId = setInterval(tick, 200);

  const first = root.querySelector("input:not([disabled])");
  if (first) first.focus();
}

function limitSec() {
  return game.cfg.limit;
}
function elapsedMs() {
  return performance.now() - game.puzzleStart + game.penaltyMs;
}
function remainingMs() {
  return limitSec() * 1000 - elapsedMs();
}
function elapsedSec() {
  return Math.min(limitSec(), elapsedMs() / 1000);
}

function tick() {
  updateCountdown();
  if (remainingMs() <= 0) endPuzzle();
}

function updateCountdown() {
  const remaining = remainingMs();
  const el = $("#countdown");
  el.textContent = fmtClock(remaining);
  el.classList.toggle("urgent", remaining <= 15000);
}

// A wrong guess costs time: add the penalty and reflect it on the clock.
function penalize() {
  game.penaltyMs += WRONG_PENALTY_SEC * 1000;
  updateCountdown();
  if (remainingMs() <= 0) endPuzzle();
}

// Called on solve, time-out, or skip. Scores the current puzzle and advances.
function endPuzzle() {
  clearInterval(game.tickId);
  const p = game.puzzles[game.idx];
  const sec = elapsedSec();

  let result;
  if (p.type === "combos") {
    const found = p.found.length, total = p.answers.length;
    const solved = found === total;
    result = { type: "combos", solved, found, total, sec, points: comboScore(found, total) };
  } else {
    result = { type: "forks", solved: p.solved, sec, points: forkScore(p.solved, sec) };
  }
  game.results.push(result);
  showInterstitial(result);
}

function showInterstitial(result) {
  $("#skip-btn").hidden = true;
  const last = game.idx === ROUNDS_PER_DAY - 1;
  const head = result.solved
    ? `<div class="inter-mark good">Solved</div>`
    : result.points > 0
    ? `<div class="inter-mark ok">Time's up</div>`
    : `<div class="inter-mark bad">Time's up</div>`;
  const detail = result.type === "combos" && !result.solved
    ? `<div class="inter-sub">${result.found} / ${result.total} found</div>`
    : "";
  $("#puzzles").innerHTML = `
    <div class="interstitial">
      ${head}
      <div class="inter-points">+${result.points}</div>
      ${detail}
      <button id="next-btn" class="primary-btn">${last ? "See results" : "Next round →"}</button>
    </div>`;
  $("#next-btn").addEventListener("click", () => {
    if (last) finishGame();
    else showPuzzle(game.idx + 1);
  });
}

function finishGame() {
  const total = game.results.reduce((s, r) => s + r.points, 0);
  const result = {
    date: dateKey(), mode: game.mode, score: total,
    rows: game.results.map((r) => ({
      type: r.type, solved: r.solved, points: r.points, sec: r.sec,
      found: r.found, total: r.total,
    })),
    reveal: game.puzzles.map((p) =>
      p.type === "combos" ? `${p.frame}  =  ${p.answers.join(" ")}` : `${p.words[0]} / ${p.words[1]}`),
  };
  saveResult(game.mode, result);
  renderResults(game.mode, result, false);
}

/* ===========================================================================
 * Rendering — puzzles
 * ========================================================================= */
function puzzleCard() {
  const card = document.createElement("div");
  card.className = "puzzle";
  return card;
}

// --- Combos -----------------------------------------------------------------
function renderCombo(p) {
  const card = puzzleCard();
  const frame = document.createElement("div");
  frame.className = "frame";
  frame.innerHTML = `<span>${p.pre}</span><span class="blank">__</span><span>${p.suf}</span>`;
  card.appendChild(frame);

  const row = document.createElement("div");
  row.className = "combo-row";
  const input = document.createElement("input");
  input.className = "combo-input";
  input.maxLength = 2; input.autocomplete = "off"; input.spellcheck = false;
  input.placeholder = "··";
  const btn = document.createElement("button");
  btn.className = "combo-submit"; btn.textContent = "Add";
  row.append(input, btn);
  card.appendChild(row);

  const progress = document.createElement("div");
  progress.className = "progress";
  card.appendChild(progress);
  const found = document.createElement("div");
  found.className = "found-list";
  card.appendChild(found);

  const refresh = () => {
    progress.textContent = `${p.found.length} / ${p.answers.length} found`;
    found.innerHTML = p.found.map((f) => `<span class="chip found">${f}</span>`).join("");
  };
  refresh();

  const submit = () => {
    const guess = input.value.trim().toLowerCase();
    input.value = "";
    if (guess.length !== 2 || !/^[a-z]{2}$/.test(guess)) return;
    if (p.found.includes(guess)) return;
    if (p.answers.includes(guess)) {
      p.found.push(guess);
      refresh();
      if (p.found.length === p.answers.length) { p.solved = true; endPuzzle(); }
    } else {
      penalize();
      card.classList.add("shake");
      setTimeout(() => card.classList.remove("shake"), 300);
    }
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  return card;
}

// --- Forks ------------------------------------------------------------------
function renderFork(p) {
  const card = puzzleCard();
  const frame = document.createElement("div");
  frame.className = "frame";
  const cells = [];
  for (let i = 0; i < p.length; i++) {
    if (i === p.splitIndex) {
      const stack = document.createElement("span");
      stack.className = "stack";
      stack.innerHTML = `<span>${p.top}</span><span>${p.bottom}</span>`;
      frame.appendChild(stack);
    } else if (i === p.splitIndex + 1) {
      /* covered by the stack */
    } else {
      const cell = document.createElement("input");
      cell.className = "cell";
      cell.maxLength = 1; cell.autocomplete = "off"; cell.spellcheck = false;
      frame.appendChild(cell);
      cells.push(cell);
    }
  }
  card.appendChild(frame);

  const row = document.createElement("div");
  row.className = "combo-row";
  const btn = document.createElement("button");
  btn.className = "check-btn"; btn.textContent = "Check";
  row.appendChild(btn);
  card.appendChild(row);

  cells.forEach((cell, i) => {
    cell.addEventListener("input", () => {
      cell.value = cell.value.replace(/[^a-zA-Z]/g, "").toUpperCase();
      if (cell.value && i + 1 < cells.length) cells[i + 1].focus();
    });
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !cell.value && i > 0) cells[i - 1].focus();
      if (e.key === "Enter") check();
    });
  });

  const check = () => {
    const guess = cells.map((c) => c.value.toUpperCase());
    if (guess.some((g) => !g)) return;
    if (guess.join("") === p.shared.join("")) {
      p.solved = true;
      cells.forEach((c) => (c.disabled = true));
      endPuzzle();
    } else {
      // Forks: wrong guesses are free and not shown — just clear and retry.
      card.classList.add("shake");
      setTimeout(() => card.classList.remove("shake"), 300);
      cells.forEach((c) => (c.value = ""));
      cells[0].focus();
    }
  };
  btn.addEventListener("click", check);
  return card;
}

/* ===========================================================================
 * Rendering — results + share
 * ========================================================================= */
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

// A red→yellow→green gradient bar filled to `frac` of its width. The gradient
// is anchored to the full track, so a low fill reads red, a full fill green.
function scoreBar(frac) {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  return `<div class="score-bar"><div class="score-bar-fill" style="left:${pct}%"></div></div>`;
}

function resultBar(r) {
  if (r.type === "combos") return scoreBar(r.found / r.total);
  return r.solved ? scoreBar(r.points / ROUND_POINTS) : `<span class="r-x">✕</span>`;
}

function renderResults(mode, result, replay) {
  const cfg = CONFIG[mode];
  $("#results-title").textContent = replay
    ? `Today's ${cfg.name} — already played`
    : "Done!";
  $("#final-score").textContent = result.score;

  $("#result-rows").innerHTML = result.rows
    .map((r, i) =>
      `<li><span class="r-num">${NUM[i]}</span>` +
      `<span class="r-bar">${resultBar(r)}</span>` +
      `<span class="r-pts">${r.points} pts</span></li>`)
    .join("");

  $("#reveal-block").innerHTML =
    `<div>Today's answers:</div>` +
    result.reveal.map((rv, i) => `<div>${i + 1}. <span class="rv">${rv}</span></div>`).join("");

  $("#copy-btn").onclick = () => copyResults(mode, result);
  $("#copied-toast").hidden = true;
  showView("results");
}

function buildShareText(mode, result) {
  const cfg = CONFIG[mode];
  const lines = [`Word Split — ${cfg.name}`, result.date, `⭐ ${result.score} / 1000`];
  result.rows.forEach((r, i) => {
    const mark = r.type === "combos"
      ? `${r.found}/${r.total}`
      : (r.solved ? `✓ ${fmtElapsed(r.sec)}` : "✕");
    lines.push(`${NUM[i]} ${mark} · ${r.points} pts`);
  });
  return lines.join("\n");
}

async function copyResults(mode, result) {
  const text = buildShareText(mode, result);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
  }
  const toast = $("#copied-toast");
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 2000);
}

/* ===========================================================================
 * Menu + wiring
 * ========================================================================= */
function refreshMenu() {
  $("#date-label").textContent = dateKey();
  for (const mode of ["combos", "forks"]) {
    const res = loadResult(mode);
    $(`#status-${mode}`).textContent = res ? `Played today · ${res.score} / 1000` : "Not played today";
  }
}

function stopGame() {
  if (game && game.tickId) clearInterval(game.tickId);
}

function init() {
  refreshMenu();
  document.querySelectorAll(".mode-card").forEach((card) =>
    card.addEventListener("click", () => startGame(card.dataset.mode)));
  $("#home-btn").addEventListener("click", () => { stopGame(); refreshMenu(); showView("menu"); });
  $("#results-menu-btn").addEventListener("click", () => { refreshMenu(); showView("menu"); });
  $("#skip-btn").addEventListener("click", () => { if (game) endPuzzle(); });
  showView("menu");
}

document.addEventListener("DOMContentLoaded", init);
