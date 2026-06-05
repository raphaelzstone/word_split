"use strict";

/* ===========================================================================
 * Word Split — daily word puzzles (vanilla JS)
 *
 * Two independent daily games, each 3 puzzles played one after another with a
 * 1:30 countdown per puzzle:
 *   combos — find every 2-letter fill for a 5-9 letter frame (4-10 fills)
 *   forks  — given a split, type the shared letters (one unique solution)
 *
 * Puzzles are date-seeded picks from large pre-verified pools (puzzles.js), so
 * everyone gets the same fresh set each day. Real words are validated against
 * the full dictionary (dictionary.js). Results persist per day and copy as a
 * spoiler-free summary (points + times only — never the words).
 * ========================================================================= */

const PUZZLES_PER_DAY = 3;
const PUZZLE_SECONDS = 90;       // countdown per puzzle
const FULL_POINTS_SECONDS = 30;  // full points if solved within this

const CONFIG = {
  combos: { name: "Combos", pool: COMBOS_POOL },
  forks: { name: "Forks", pool: FORKS_POOL },
};

// --- Scoring ----------------------------------------------------------------
// 1.0 within the first 30s, sliding linearly to 0.0 at 1:30.
function timeFactor(sec) {
  if (sec <= FULL_POINTS_SECONDS) return 1;
  if (sec >= PUZZLE_SECONDS) return 0;
  return (PUZZLE_SECONDS - sec) / (PUZZLE_SECONDS - FULL_POINTS_SECONDS);
}
// Forks: solved -> 1500 (<=30s) down to a 500 floor; unsolved -> 0.
function forkScore(solved, sec) {
  return solved ? Math.round(500 + 1000 * timeFactor(sec)) : 0;
}
// Combos: 800 for completion (scaled by how many found) + 200 time bonus,
// where the time bonus only applies once you've found them all.
function comboScore(found, total, sec) {
  const completion = 800 * (found / total);
  const bonus = found === total ? 200 * timeFactor(sec) : 0;
  return Math.round(completion + bonus);
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
function buildPuzzles(mode) {
  const picks = seededPick(CONFIG[mode].pool, PUZZLES_PER_DAY, `${mode}:${dateKey()}`);
  if (mode === "combos") {
    return picks.map((p) => {
      const [pre, suf] = p.frame.split("__");
      return {
        type: "combos",
        frame: p.frame, pre, suf,
        answers: p.answers.map((a) => a.toLowerCase()),
        found: [], bonus: [], solved: false,
      };
    });
  }
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
 * ========================================================================= */
let game = null;

function startGame(mode) {
  const existing = loadResult(mode);
  if (existing) { renderResults(mode, existing, /*replay*/ true); return; }

  game = {
    mode, cfg: CONFIG[mode], puzzles: buildPuzzles(mode),
    idx: 0, results: [], puzzleStart: 0, deadline: 0, tickId: null,
  };
  $("#rules-text").textContent = mode === "combos"
    ? "Type every two-letter fill that makes a real word. 1:30 per puzzle."
    : "Type the shared letters so both stacked letters make a real word. 1:30 per puzzle.";
  showView("game");
  showPuzzle(0);
}

function showPuzzle(i) {
  game.idx = i;
  const p = game.puzzles[i];
  $("#progress-pill").textContent = `Puzzle ${i + 1} of ${PUZZLES_PER_DAY}`;
  $("#skip-btn").hidden = false;
  $("#skip-btn").textContent = "Skip puzzle";

  const root = $("#puzzles");
  root.innerHTML = "";
  root.appendChild(p.type === "combos" ? renderCombo(p) : renderFork(p));

  game.puzzleStart = performance.now();
  game.deadline = game.puzzleStart + PUZZLE_SECONDS * 1000;
  updateCountdown();
  game.tickId = setInterval(tick, 200);

  const first = root.querySelector("input:not([disabled])");
  if (first) first.focus();
}

function tick() {
  const remaining = game.deadline - performance.now();
  updateCountdown(remaining);
  if (remaining <= 0) endPuzzle();
}

function updateCountdown(remaining = game.deadline - performance.now()) {
  const el = $("#countdown");
  el.textContent = fmtClock(remaining);
  el.classList.toggle("urgent", remaining <= 15000);
}

function elapsedSec() {
  return Math.min(PUZZLE_SECONDS, (performance.now() - game.puzzleStart) / 1000);
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
    result = { solved, found, total, sec, points: comboScore(found, total, sec) };
  } else {
    result = { solved: p.solved, sec, points: forkScore(p.solved, sec) };
  }
  game.results.push(result);
  showInterstitial(result);
}

function showInterstitial(result) {
  $("#skip-btn").hidden = true;
  const last = game.idx === PUZZLES_PER_DAY - 1;
  const head = result.solved
    ? `<div class="inter-mark good">Solved</div>`
    : result.points > 0
    ? `<div class="inter-mark ok">Time's up</div>`
    : `<div class="inter-mark bad">Time's up</div>`;
  const detail = game.puzzles[game.idx].type === "combos" && !result.solved
    ? `<div class="inter-sub">${result.found} / ${result.total} found</div>`
    : "";
  $("#puzzles").innerHTML = `
    <div class="interstitial">
      ${head}
      <div class="inter-points">+${result.points}</div>
      ${detail}
      <button id="next-btn" class="primary-btn">${last ? "See results" : "Next puzzle →"}</button>
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
    rows: game.results.map((r) => ({ solved: r.solved, points: r.points, sec: r.sec })),
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
    const bonus = p.bonus.length ? ` · ${p.bonus.length} bonus` : "";
    progress.textContent = `${p.found.length} / ${p.answers.length} found${bonus}`;
    found.innerHTML =
      p.found.map((f) => `<span class="chip found">${f}</span>`).join("") +
      p.bonus.map((f) => `<span class="chip bonus">${f}</span>`).join("");
  };
  refresh();

  const submit = () => {
    const guess = input.value.trim().toLowerCase();
    input.value = "";
    if (guess.length !== 2 || !/^[a-z]{2}$/.test(guess)) return;
    if (p.found.includes(guess) || p.bonus.includes(guess)) return;
    if (p.answers.includes(guess)) {
      p.found.push(guess);
      refresh();
      if (p.found.length === p.answers.length) endPuzzle();
    } else if (WORDS.has(p.pre + guess + p.suf)) {
      p.bonus.push(guess); // a real word, just not one of the target fills
      refresh();
    } else {
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

function renderResults(mode, result, replay) {
  const cfg = CONFIG[mode];
  $("#results-title").textContent = replay
    ? `Today's ${cfg.name} — already played`
    : "Done!";
  $("#final-score").textContent = result.score;

  $("#result-rows").innerHTML = result.rows
    .map((r, i) =>
      `<li><span>${NUM[i]} ${r.solved ? "✅" : "❌"}</span>` +
      `<span class="r-pts">${r.points} pts</span>` +
      `<span class="r-time">${fmtElapsed(r.sec)}</span></li>`)
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
  const lines = [`Word Split — ${cfg.name}`, result.date, `⭐ ${result.score} pts`];
  result.rows.forEach((r, i) =>
    lines.push(`${NUM[i]} ${r.solved ? "✅" : "❌"} ${r.points} pts · ${fmtElapsed(r.sec)}`));
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
    $(`#status-${mode}`).textContent = res ? `Played today · ${res.score} pts` : "Not played today";
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
