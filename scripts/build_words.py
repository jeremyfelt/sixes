"""Build the Sixes word lists.

Writes three files to data/:
  valid.txt    every six-letter word the game accepts
  common.txt   the everyday subset, used for hints, checking boards and anagram tips
  answers.txt  words that may be hidden on a board, most common first, with Zipf frequency

Sources: the ENABLE list (downloaded once into .cache/), SCOWL via the wordlist-english
package, the naughty-words package for filtering, and wordfreq for frequencies.

Setup:  npm install && pip install -r requirements.txt
Run:    python3 scripts/build_words.py

Changing answers.txt changes which words future puzzles can use, but not the puzzles
already in data/puzzles.json.
"""
import json
import re
import urllib.request
from pathlib import Path

from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
CACHE = ROOT / '.cache'
NODE = ROOT / 'node_modules'
ENABLE_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt'

SIX = re.compile(r'^[a-z]{6}$')
ALPHA = re.compile(r'^[a-z]+$')
SCOWL_SIZES = [10, 20, 35, 40, 50, 55, 60, 70]
SCOWL_MAIN = ['english', 'american']
SCOWL_ALL = ['english', 'american', 'british', 'canadian', 'australian']

# Never accepted: slurs and explicit words. Six-letter entries from naughty-words are added below.
BLOCK = set('''faggot fucker fucked fuckin nigger niggas niggaz shitty bitchy bimbos darkie darkey honkey honkie beaner tranny
wanker wanked whores rapist raping nympho dildos pornos boners dicked cialis viagra goatse rimjob spooge punany femdom dommes feltch
gokkun sexcam nambla hentai lolita skeets spunks sexing tosser spicks chinks squaws dagoes kaffir kafirs pissed pisser shitted
cunted cuntly twatty bitchs titties boobie boobed jizzed'''.split())

# Ordinary or clinical words that appear on naughty-words. These stay valid guesses.
NAUGHTY_BUT_VALID = {'escort', 'eunuch', 'rectum', 'snatch', 'sexual', 'nudity', 'incest', 'vagina',
                     'voyeur', 'orgasm', 'sadism', 'sodomy', 'nipple', 'erotic', 'hooker'}

# Valid guesses that should never be a puzzle answer: sensitive, grim, archaic, proper-noun-like,
# or plural forms that read oddly as answers.
NOT_ANSWERS = set('''abuser afghan albino amazon autism ballsy bitchy bloody bugger boozer breast cancer carnal cervix condom crappy crotch dickey
douche erotic escort eunuch fetish fondle french fucker geisha ghetto gringo harlot heroin herpes hickey hooker incest junkie killer libido
madman midget molest murder napalm nipple nudist nudity opiate orgasm penile psycho racial racism racist rapist rectal rectum reefer retard
sadism sadist seduce senile sexier sexism sexist sexual shitty sodomy soviet stoner sucker tampon terror uterus vagina virgin virile voyeur
weirdo wiener behead kidnap gunman gunmen abduct oxford newton martin phoebe hobbit kroner salaam surrey guinea scotch mullah rabbis khakis
betcha hereof hither thence whence verily caudal casein brogan farina filial caries cation galena physic tittle cotter theism moiety
nuclei larvae genera laymen airmen madmen seamen loaves wolves hooves knives selves errata strata alumni maxima minima urinal gypped
pelvic pelvis corpse heresy satanic morgue hearse coffin casket mortal'''.split())

# Real words missing from the sources. These become valid guesses.
EXTRA_VALID = set()

# Words that look inflected but aren't.
NOT_INFLECTED = {'honest', 'priest', 'latest', 'awning'}

# Answers need at least this Zipf frequency (wordfreq's log scale; 3 is about once per million words).
MIN_ANSWER_ZIPF = 2.5


def enable_words():
    path = CACHE / 'enable1.txt'
    if not path.exists():
        CACHE.mkdir(exist_ok=True)
        print('Downloading ENABLE word list...')
        urllib.request.urlretrieve(ENABLE_URL, path)
    return [w.strip() for w in path.read_text().splitlines()]


def scowl(variant, size):
    return json.loads((NODE / 'wordlist-english' / f'{variant}-words-{size}.json').read_text())


def main():
    if not (NODE / 'wordlist-english').exists():
        raise SystemExit('Run `npm install` first (needs wordlist-english and naughty-words).')

    enable_all = enable_words()
    enable = {w for w in enable_all if SIX.match(w)}

    level_main, level_all = {}, {}
    for variant in SCOWL_ALL:
        for size in SCOWL_SIZES:
            for w in scowl(variant, size):
                if SIX.match(w):
                    level_all[w] = min(level_all.get(w, 999), size)
                    if variant in SCOWL_MAIN:
                        level_main[w] = min(level_main.get(w, 999), size)

    naughty = json.loads((NODE / 'naughty-words' / 'en.json').read_text())
    block = BLOCK | {b for b in naughty if SIX.match(b) and b not in NAUGHTY_BUT_VALID}

    every_word = set(enable_all)
    for variant in SCOWL_ALL:
        for size in SCOWL_SIZES:
            every_word |= {w for w in scowl(variant, size) if ALPHA.match(w)}

    def inflected(w):
        if w in NOT_INFLECTED:
            return None
        if w.endswith('s') and not w.endswith(('ss', 'us', 'is')):
            if w[:-1] in every_word:
                return 'plural'
            if w.endswith('es') and w[:-2] in every_word:
                return 'plural'
            if w.endswith('ies') and w[:-3] + 'y' in every_word:
                return 'plural'
        if w.endswith('ed'):
            if w[:-2] in every_word or w[:-1] in every_word:
                return 'ed'
            if w[-3] == w[-4] and w[:-3] in every_word:
                return 'ed'
            if w.endswith('ied') and w[:-3] + 'y' in every_word:
                return 'ed'
        if w.endswith('ing'):
            s = w[:-3]
            if s in every_word or s + 'e' in every_word:
                return 'ing'
            if len(s) > 1 and s[-1] == s[-2] and s[:-1] in every_word:
                return 'ing'
        if w.endswith('est'):
            s = w[:-3]
            base = (s in every_word or s + 'e' in every_word
                    or (s[-1:] == s[-2:-1] and s[:-1] in every_word)
                    or (w.endswith('iest') and w[:-4] + 'y' in every_word))
            if base and (s + 'er' in every_word or w[:-2] + 'r' in every_word):
                return 'est'
        return None

    valid = sorted((enable | set(level_all) | EXTRA_VALID) - block)
    common = {w for w in valid if level_main.get(w, 999) <= 55}

    answers = []
    for w, level in level_main.items():
        if level > 50 or (w not in enable and level > 35):
            continue
        if w in NOT_ANSWERS or w in block or inflected(w):
            continue
        z = zipf_frequency(w, 'en')
        if z >= MIN_ANSWER_ZIPF:
            answers.append((w, z))
    answers.sort(key=lambda t: -t[1])
    common = sorted(common | {w for w, _ in answers})

    DATA.mkdir(exist_ok=True)
    (DATA / 'valid.txt').write_text(
        '# Every six-letter word Sixes accepts, one per line.\n'
        '# Generated by scripts/build_words.py from ENABLE and SCOWL.\n'
        + '\n'.join(valid) + '\n')
    (DATA / 'common.txt').write_text(
        '# Everyday six-letter words, used for hints, checking boards and anagram tips.\n'
        '# Generated by scripts/build_words.py. Every word here is also in valid.txt.\n'
        + '\n'.join(common) + '\n')
    (DATA / 'answers.txt').write_text(
        '# Words that can be hidden on a board, most common first.\n'
        '# Each line: word, then its Zipf frequency from wordfreq (higher is more common).\n'
        '# Generated by scripts/build_words.py.\n'
        + '\n'.join(f'{w} {z:.2f}' for w, z in answers) + '\n')
    print(f'valid {len(valid)}  common {len(common)}  answers {len(answers)}')


if __name__ == '__main__':
    main()
