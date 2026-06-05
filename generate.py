#!/usr/bin/env python3
import random, json, sys
from collections import defaultdict

ENABLE = "/tmp/enable1.txt"
FREQ = "/tmp/count_1w.txt"
OUT_DICT = "/Users/raphaelzstone/Documents/word_split/dictionary.js"
OUT_PUZ = "/Users/raphaelzstone/Documents/word_split/puzzles.js"

COMMON_N = 50000          # top-N frequency rank counts as "in use"
MIN_LEN, MAX_LEN = 5, 9   # combos word lengths
FORK_MIN, FORK_MAX = 5, 8 # fork word lengths
COMBO_FILL_MIN, COMBO_FILL_MAX = 4, 10
POOL_PER_LEN = 200        # cap per word-length for variety
SEED = 1234

BLOCK = set("""cunt fuck fucks fucked shit shits piss pissed cock cocks dick dicks
twat slut sluts whore whores turd fart farts boob boobs prick pricks
penis vulva semen wanker bitch bitches""".split())

def load_words(path, lo, hi):
    out = set()
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            w = line.strip().lower()
            if lo <= len(w) <= hi and w.isalpha() and w.isascii():
                out.add(w)
    return out

FULL = load_words(ENABLE, MIN_LEN, MAX_LEN) - BLOCK

# common = ENABLE intersect top-N frequency
freq_rank = {}
with open(FREQ, encoding="utf-8", errors="ignore") as f:
    for i, line in enumerate(f):
        if i >= COMMON_N:
            break
        w = line.split()[0].lower()
        freq_rank[w] = i
COMMON = {w for w in FULL if w in freq_rank}

print(f"FULL(5-9)={len(FULL)}  COMMON={len(COMMON)}")

rng = random.Random(SEED)

# ---------------------------------------------------------------------------
# COMBOS: frame = word with 2 adjacent letters blanked; 4-10 common fills.
# ---------------------------------------------------------------------------
buckets = defaultdict(set)  # (prefix, i, suffix) -> set of 2-letter fills
for w in COMMON:
    for i in range(len(w) - 1):
        key = (w[:i], i, w[i+2:])
        buckets[key].add(w[i:i+2])

combos_by_len = defaultdict(list)
for (pre, i, suf), fills in buckets.items():
    if COMBO_FILL_MIN <= len(fills) <= COMBO_FILL_MAX:
        wl = len(pre) + 2 + len(suf)
        frame = pre + "__" + suf
        combos_by_len[wl].append({"frame": frame, "answers": sorted(fills)})

COMBOS = []
for wl in sorted(combos_by_len):
    lst = combos_by_len[wl]
    rng.shuffle(lst)
    COMBOS.extend(lst[:POOL_PER_LEN])
rng.shuffle(COMBOS)
print(f"COMBOS pool={len(COMBOS)} by len=" +
      ", ".join(f"{k}:{min(len(v),POOL_PER_LEN)}" for k, v in sorted(combos_by_len.items())))

# ---------------------------------------------------------------------------
# FORKS: two common words sharing all but one adjacent 2-letter split, with a
# UNIQUE shared-letter solution verified against the FULL dictionary.
# ---------------------------------------------------------------------------
# For each (len, i): pair -> set of remainders (over FULL), and common pairs per remainder.
full_pair_rems = defaultdict(lambda: defaultdict(set))   # (L,i) -> pair -> {rem}
common_rem_pairs = defaultdict(lambda: defaultdict(set))  # (L,i) -> rem -> {pair}
for w in FULL:
    L = len(w)
    if not (FORK_MIN <= L <= FORK_MAX):
        continue
    for i in range(L - 1):
        rem = w[:i] + w[i+2:]
        full_pair_rems[(L, i)][w[i:i+2]].add(rem)
for w in COMMON:
    L = len(w)
    if not (FORK_MIN <= L <= FORK_MAX):
        continue
    for i in range(L - 1):
        common_rem_pairs[(L, i)][w[:i] + w[i+2:]].add(w[i:i+2])

forks_by_len = defaultdict(list)
seen = set()
for (L, i), rem_pairs in common_rem_pairs.items():
    pr = full_pair_rems[(L, i)]
    for rem, cps in rem_pairs.items():
        if len(cps) < 2:
            continue
        cps = sorted(cps)
        for a_idx in range(len(cps)):
            for b_idx in range(a_idx + 1, len(cps)):
                T, B = cps[a_idx], cps[b_idx]
                # remainders where BOTH T and B reconstruct a FULL word
                inter = pr[T] & pr[B]
                if len(inter) == 1:  # unique solution == rem
                    w1 = rem[:i] + T + rem[i:]
                    w2 = rem[:i] + B + rem[i:]
                    sig = frozenset((w1, w2))
                    if sig in seen:
                        continue
                    seen.add(sig)
                    forks_by_len[L].append(
                        {"word1": w1.upper(), "word2": w2.upper(), "splitIndex": i})

FORKS = []
for L in sorted(forks_by_len):
    lst = forks_by_len[L]
    rng.shuffle(lst)
    FORKS.extend(lst[:POOL_PER_LEN])
rng.shuffle(FORKS)
print(f"FORKS pool={len(FORKS)} by len=" +
      ", ".join(f"{k}:{min(len(v),POOL_PER_LEN)}" for k, v in sorted(forks_by_len.items())))

print("\nSample COMBOS:")
for c in COMBOS[:6]:
    print(f"  {c['frame']:>11}  ({len(c['answers'])})  {' '.join(c['answers'])}")
print("Sample FORKS:")
for fk in FORKS[:8]:
    print(f"  {fk['word1']} / {fk['word2']}  split@{fk['splitIndex']}")

# ---------------------------------------------------------------------------
# Write runtime files
# ---------------------------------------------------------------------------
with open(OUT_DICT, "w") as f:
    f.write("// Auto-generated. Full ENABLE dictionary (public-domain, Scrabble-grade,\n")
    f.write("// no proper nouns), lengths 5-9. Used to accept any real word typed in\n")
    f.write("// Combos as a bonus. Puzzles themselves are pre-verified in puzzles.js.\n")
    f.write("const WORDS = new Set(" + json.dumps(sorted(FULL)) + ");\n")

with open(OUT_PUZ, "w") as f:
    f.write("// Auto-generated, pre-verified daily puzzle pools.\n")
    f.write("// COMBOS_POOL: frames (5-9 letter words, 2 adjacent blanks) with 4-10\n")
    f.write("//   in-use fills. FORKS_POOL: word pairs sharing all but one adjacent\n")
    f.write("//   2-letter split, each with a UNIQUE solution verified vs the full dict.\n")
    f.write("const COMBOS_POOL = " + json.dumps(COMBOS, separators=(",", ":")) + ";\n")
    f.write("const FORKS_POOL = " + json.dumps(FORKS, separators=(",", ":")) + ";\n")

import os
print(f"\ndictionary.js: {os.path.getsize(OUT_DICT)//1024} KB")
print(f"puzzles.js:    {os.path.getsize(OUT_PUZ)//1024} KB")
