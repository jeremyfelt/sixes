"""Generate the daily calendar and practice boards.

Writes data/puzzles.json:
  start     date of daily No. 1
  daily     one entry per day: difficulty (1 Gentle, 2 Steady, 3 Tricky) and six words
  practice  500 boards per difficulty

Every board is checked so that its 36 tiles split into six common words in exactly one
way (Gentle) or at most two ways (Steady, Tricky).

The generator is seeded, so running it again with the same word lists rebuilds the same
calendar. Raising DAYS extends the calendar and keeps every existing day unchanged.
Changing the word lists or the seed rewrites days that players may already have played.

Run: python3 scripts/gen_puzzles.py
"""
import collections
import datetime
import json
import random

from solver import ANS, COMMON, DATA, Z, count_solutions, fits, rows_of

START = datetime.date(2026, 10, 23)
DAYS = 1100                               # through 26 Oct 2029
SEED_DAILY = 20261023
SEED_PRACTICE = 6
PRACTICE_PER_LEVEL = 500
FIRST_BOARD = ['jigsaw', 'candle', 'violin', 'bright', 'puzzle', 'forest']

# Difficulty by weekday (Monday = 0): gentle early in the week, tricky on Friday and Saturday.
WEEKDAY_LEVEL = {0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 2}

EASY = [w for w in ANS if Z[w] >= 3.6]
MEDIUM = [w for w in ANS if 3.0 <= Z[w] < 3.6]
HARD = [w for w in ANS if Z[w] < 3.0]

# How many easy / medium / hard words a board at each level mixes together.
RECIPES = {1: [(5, 1, 0)], 2: [(4, 2, 0), (3, 2, 1)], 3: [(2, 3, 1), (2, 2, 2)]}
# How many common words can be spelled from the board's rows: fewer means fewer decoys.
FORMABLE = {1: (6, 26), 2: (12, 45), 3: (18, 90)}
MAX_SOLUTIONS = {1: 1, 2: 2, 3: 2}


def ok_set(words):
    if len({w[0] for w in words}) < 6:                       # six different first letters
        return False
    if len({''.join(sorted(w)) for w in words}) < 6:          # no two words are anagrams
        return False
    for a in range(6):
        for b in range(a + 1, 6):
            if sum(x == y for x, y in zip(words[a], words[b])) > 2:
                return False
    return min(len(r) for r in rows_of(words)) >= 4           # every row has variety


def make(level, rng, recent=None, usage=None):
    for attempt in range(9000):
        relax = attempt // 1500       # 0: strict, 1: skip usage balancing, 2+: allow recent words
        e, m, h = rng.choice(RECIPES[level])

        def pick(pool, k):
            pool2 = list(pool)
            if recent and relax < 2:
                p = [w for w in pool2 if w not in recent]
                if len(p) >= k * 30:
                    pool2 = p
            if usage is not None and relax < 1:
                lo = min(usage[w] for w in pool2)
                p = [w for w in pool2 if usage[w] <= lo + 1]
                if len(p) >= k * 60:
                    pool2 = p
            return rng.sample(pool2, k)

        words = pick(EASY, e) + pick(MEDIUM, m) + (pick(HARD, h) if h else [])
        if len(set(words)) < 6 or not ok_set(words):
            continue
        rows = rows_of(words)
        cands = [w for w in COMMON if fits(w, rows)]
        lo, hi = FORMABLE[level]
        if not lo <= len(cands) <= hi:
            continue
        sols = count_solutions(rows, cands, cap=5)
        if sols < 1 or sols > MAX_SOLUTIONS[level]:
            continue
        rng.shuffle(words)
        return words, len(cands), sols
    raise RuntimeError(f'Could not build a level {level} board')


def main():
    print(f'answer tiers: easy {len(EASY)}, medium {len(MEDIUM)}, hard {len(HARD)}')
    rng = random.Random(SEED_DAILY)
    usage = collections.Counter({w: 0 for w in ANS})
    history = collections.deque(maxlen=120 * 6)               # avoid repeats within ~4 months
    daily, stats = [], collections.defaultdict(list)
    for n in range(DAYS):
        day = START + datetime.timedelta(days=n)
        level = 2 if n == 0 else WEEKDAY_LEVEL[day.weekday()]
        if n == 0:
            words = list(FIRST_BOARD)
            rows = rows_of(words)
            cands = [w for w in COMMON if fits(w, rows)]
            formable, sols = len(cands), count_solutions(rows, cands, cap=5)
        else:
            words, formable, sols = make(level, rng, recent=set(history), usage=usage)
        for w in words:
            usage[w] += 1
            history.append(w)
        daily.append(f'{level} ' + ' '.join(words))
        stats[level].append((formable, sols))
    for level, v in sorted(stats.items()):
        fs = sorted(x for x, _ in v)
        print(f'level {level}: {len(v)} days, median formable {fs[len(fs) // 2]}, '
              f'two-solution boards {sum(1 for _, s in v if s > 1)}')

    prng = random.Random(SEED_PRACTICE)
    practice = {}
    for level in (1, 2, 3):
        practice[str(level)] = [' '.join(make(level, prng)[0]) for _ in range(PRACTICE_PER_LEVEL)]

    out = {'start': START.isoformat(), 'daily': daily, 'practice': practice}
    (DATA / 'puzzles.json').write_text(json.dumps(out, indent=2) + '\n')
    last = START + datetime.timedelta(days=DAYS - 1)
    print(f'wrote {DAYS} daily boards ({START} to {last}) and {3 * PRACTICE_PER_LEVEL} practice boards')


if __name__ == '__main__':
    main()
