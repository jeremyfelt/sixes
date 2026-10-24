"""Word lists and the board solver shared by the puzzle generator.

A board is six rows of six letters. Row i holds the i-th letter of each hidden word.
`count_solutions` counts the ways to split every tile into six common words, which is
how the generator makes sure a board has exactly one (or at most two) solutions.
"""
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'


def read_lines(name):
    lines = (DATA / name).read_text().splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith('#')]


def read_answers():
    out = []
    for line in read_lines('answers.txt'):
        word, zipf = line.split()
        out.append((word, float(zipf)))
    return out


VALID = read_lines('valid.txt')
COMMON = read_lines('common.txt')
ANSWERS = read_answers()          # [(word, zipf)], most common first
ANS = [w for w, _ in ANSWERS]
Z = dict(ANSWERS)


def rows_of(words):
    return [collections.Counter(w[i] for w in words) for i in range(6)]


def fits(word, rows):
    return all(rows[i][word[i]] > 0 for i in range(6))


def count_solutions(rows, candidates, cap=200):
    """Count exact covers of `rows` by words from `candidates`, stopping at `cap`."""
    found = [0]

    def rec(cands, k):
        if k == 0:
            found[0] += 1
            return
        fit = [w for w in cands if fits(w, rows)]
        best = None
        for i in range(6):
            for ch, c in rows[i].items():
                if c <= 0:
                    continue
                n = sum(1 for w in fit if w[i] == ch)
                if n == 0:
                    return
                if best is None or n < best[0]:
                    best = (n, i, ch)
        _, i, ch = best
        for w in [w for w in fit if w[i] == ch]:
            for j in range(6):
                rows[j][w[j]] -= 1
            rec(fit, k - 1)
            for j in range(6):
                rows[j][w[j]] += 1
            if found[0] >= cap:
                return

    rec(candidates, sum(rows[0].values()))
    return found[0]
