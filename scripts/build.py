"""Build the Sixes web app into docs/, ready for GitHub Pages or any static host.

Reads src/ (the game), data/ (word lists and puzzles) and assets/fonts/, and writes:
  docs/index.html            the whole game in one file, fonts and word lists included
  docs/manifest.webmanifest  name, icons and full-screen display for Add to Home Screen
  docs/sw.js                 offline cache, renamed on every build so updates land
  docs/*.png                 Home Screen icons
  docs/.nojekyll             tells GitHub Pages to serve files as they are

Run: python3 scripts/build.py
     python3 scripts/build.py --artifact path/to/page.html   # also write a Claude artifact page
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
DATA = ROOT / 'data'
FONTS = ROOT / 'assets' / 'fonts'
OUT = ROOT / 'docs'

TITLE = 'Sixes'
DESCRIPTION = ('A word game where everything comes in sixes: a daily board of six hidden '
               'six-letter words, plus a 60-second anagram Blitz.')
LIGHT_BG, DARK_BG = '#ECEEF3', '#0E1015'
# Status bar colors while a sheet's scrim covers the page (page color under the scrim).
LIGHT_DIM, DARK_DIM = '#8F9196', '#060709'
PIP_COLORS = ['#FF5E4F', '#FF9B30', '#FFD03A', '#36CB7C', '#3F9CFF', '#9C6DFF']
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'


def read_lines(name):
    lines = (DATA / name).read_text().splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith('#')]


def load_data():
    valid = read_lines('valid.txt')
    common = set(read_lines('common.txt'))
    answers = []
    for line in read_lines('answers.txt'):
        word, zipf = line.split()
        answers.append((word, float(zipf)))
    answers.sort(key=lambda t: -t[1])          # most common first; tiers depend on this order
    puzzles = json.loads((DATA / 'puzzles.json').read_text())

    valid_set = set(valid)
    if not common <= valid_set:
        raise SystemExit(f'common.txt has words missing from valid.txt: {sorted(common - valid_set)[:10]}')
    missing = [w for w, _ in answers if w not in common]
    if missing:
        raise SystemExit(f'answers.txt has words missing from common.txt: {missing[:10]}')

    def parse_board(entry):
        words = entry.split()
        if len(words) != 6 or any(len(w) != 6 for w in words):
            raise SystemExit(f'Bad board in puzzles.json: {entry!r}')
        return words

    daily = []
    for entry in puzzles['daily']:
        level, rest = entry.split(' ', 1)
        daily.append((int(level), parse_board(rest)))
    practice = {lvl: [parse_board(e) for e in boards] for lvl, boards in puzzles['practice'].items()}

    board_words = {w for _, ws in daily for w in ws} | {w for boards in practice.values() for ws in boards for w in ws}
    not_common = sorted(board_words - common)
    if not_common:
        raise SystemExit('Puzzle words must be in common.txt (hints depend on it). Missing: '
                         + ', '.join(not_common[:20]))
    return valid, common, answers, puzzles['start'], daily, practice, board_words


def encode(valid, common, answers, start, daily, practice, board_words):
    """Pack the data compactly. src/app.js decodes this exact format."""
    table = [w for w, _ in answers]
    tiers = [sum(1 for _, z in answers if z >= 3.6), sum(1 for _, z in answers if z >= 3.0), len(table)]
    extra = sorted(board_words - set(table))   # retired answers still used by existing boards
    if extra:
        print(f'note: {len(extra)} board words are no longer in answers.txt; keeping them for old boards')
    table += extra
    if len(table) > 64 * 64:
        raise SystemExit('Too many answer words for the 2-character board encoding (max 4096).')
    index = {w: i for i, w in enumerate(table)}

    def pack(words):
        return ''.join(B64[index[w] // 64] + B64[index[w] % 64] for w in words)

    return {
        # every accepted word; common words are uppercase
        'valid': ''.join(w.upper() if w in common else w for w in valid),
        'ans': ''.join(table),
        'tiers': tiers,
        'daily': ''.join(str(level) + pack(ws) for level, ws in daily),
        'practice': {lvl: ''.join(pack(ws) for ws in boards) for lvl, boards in practice.items()},
        'start': start,
    }


def font_faces():
    def b64(name):
        return base64.b64encode((FONTS / name).read_bytes()).decode()
    return (
        '@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-display:swap;'
        'font-weight:200 800;font-stretch:75% 100%;'
        f'src:url(data:font/woff2;base64,{b64("bricolage-grotesque-latin-var.woff2")}) format("woff2")}}\n'
        '@font-face{font-family:"DM Mono";font-style:normal;font-display:swap;font-weight:400;'
        f'src:url(data:font/woff2;base64,{b64("dm-mono-latin-400.woff2")}) format("woff2")}}\n'
        '@font-face{font-family:"DM Mono";font-style:normal;font-display:swap;font-weight:500;'
        f'src:url(data:font/woff2;base64,{b64("dm-mono-latin-500.woff2")}) format("woff2")}}\n'
    )


def icon(size, scale=1.0):
    """A die face with six colored pips. `scale` < 1 leaves room for maskable icon cropping."""
    s = 1024
    im = Image.new('RGB', (s, s), '#14161D')
    d = ImageDraw.Draw(im)
    inset = int(s * (0.5 - 0.43 * scale))
    d.rounded_rectangle([inset, inset, s - inset, s - inset], radius=int(s * 0.19 * scale), fill='#1C1F29')
    r = s * 0.098 * scale
    xs = [s / 2 - s * 0.165 * scale, s / 2 + s * 0.165 * scale]
    ys = [s / 2 - s * 0.25 * scale, s / 2, s / 2 + s * 0.25 * scale]
    k = 0
    for y in ys:
        for x in xs:
            d.ellipse([x - r, y - r + s * 0.012, x + r, y + r + s * 0.012], fill='#0B0C10')
            d.ellipse([x - r, y - r, x + r, y + r], fill=PIP_COLORS[k])
            k += 1
    return im.resize((size, size), Image.LANCZOS)


SW_TEMPLATE = '''/* Sixes offline cache: answer from the cache, refresh it in the background. */
const CACHE = 'sixes-__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sixes-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const network = fetch(req).then(res => {
    if (!res || !res.ok) return res;
    const copy = res.clone();
    return caches.open(CACHE).then(cache => cache.put(req, copy)).then(() => res);
  });
  const cached = caches.open(CACHE).then(cache => cache.match(req, { ignoreSearch: true }));
  event.respondWith(cached.then(hit => hit || network));
  event.waitUntil(network.then(() => {}, () => {}));
});
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--artifact', type=Path, help='also write a page for publishing as a Claude artifact')
    args = parser.parse_args()

    data = encode(*load_data())
    data_js = 'window.SIXES_DATA=' + json.dumps(data, separators=(',', ':')) + ';'
    css = (SRC / 'app.css').read_text()
    body = (SRC / 'app.html').read_text()
    app = (SRC / 'app.js').read_text()

    OUT.mkdir(exist_ok=True)
    icons = {
        'apple-touch-icon.png': icon(180),
        'icon-192.png': icon(192),
        'icon-512.png': icon(512),
        'icon-maskable-512.png': icon(512, scale=0.78),
    }
    for name, im in icons.items():
        im.save(OUT / name, optimize=True)

    index = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{TITLE}</title>
<meta name="description" content="{DESCRIPTION}">
<meta name="theme-color" content="{LIGHT_BG}" data-dim="{LIGHT_DIM}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="{DARK_BG}" data-dim="{DARK_DIM}" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{TITLE}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="format-detection" content="telephone=no">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<style>
{font_faces()}
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
{css}
</style>
</head>
<body>
{body}
<script>{data_js}</script>
<script>
{app}
</script>
<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {{
  window.addEventListener('load', function () {{ navigator.serviceWorker.register('sw.js').catch(function () {{}}); }});
}}
if (navigator.storage && navigator.storage.persist) {{ navigator.storage.persist().catch(function () {{}}); }}
</script>
</body>
</html>
'''
    (OUT / 'index.html').write_text(index)

    manifest = {
        'name': TITLE, 'short_name': TITLE, 'description': DESCRIPTION,
        'id': './', 'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'portrait',
        'background_color': LIGHT_BG, 'theme_color': LIGHT_BG, 'categories': ['games', 'education'],
        'icons': [
            {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    (OUT / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2) + '\n')

    assets = ['./', './index.html', './manifest.webmanifest'] + [f'./{name}' for name in icons]
    digest = hashlib.sha256()
    for name in ['index.html', 'manifest.webmanifest', *icons]:
        digest.update((OUT / name).read_bytes())
    version = digest.hexdigest()[:10]
    sw = SW_TEMPLATE.replace('__VERSION__', version).replace('__ASSETS__', json.dumps(assets))
    (OUT / 'sw.js').write_text(sw)
    (OUT / '.nojekyll').write_text('')

    print(f'docs/index.html  {len(index.encode()) / 1024:.0f} KB  (cache sixes-{version})')

    if args.artifact:
        page = f'''<title>{TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{DESCRIPTION}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&family=DM+Mono:wght@400;500&display=swap">
<style>
{css}
</style>
{body}
<script>{data_js}</script>
<script>
{app}
</script>
'''
        args.artifact.write_text(page)
        print(f'{args.artifact}  {len(page.encode()) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
