"""End-to-end test: plays the built app in headless Chromium at phone sizes.

Covers the daily board (rejected word, bonus word, hint, locking words, auto-finish, results,
streak, reload), practice, Blitz (scoring, a Sixer, skip, pause, results), the Word Book,
stats, closing sheets with the X and by swiping, a small-screen layout check, the landscape
note and the offline service worker.

Setup: pip install -r requirements.txt && python3 -m playwright install chromium
Run:   python3 scripts/build.py && python3 scripts/test_e2e.py
Screenshots land in test-results/.
"""
import functools
import http.server
import re
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'docs'
SHOTS = ROOT / 'test-results'
PHONE = {'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True}

failures = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(SITE))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}/'


def board(page):
    return page.evaluate('window.__sixes.board()')


def tiles_for(page, word):
    """Ids of unlocked tiles that spell `word` top to bottom, or None."""
    return page.evaluate("""(w) => {
      const out = [];
      for (let r = 0; r < 6; r++) {
        const el = [...document.querySelectorAll('.tile')].find(e =>
          ((+e.dataset.id / 6) | 0) === r && !e.disabled && e.firstChild.textContent === w[r]);
        if (!el) return null;
        out.push(+el.dataset.id);
      }
      return out;
    }""", word)


def spell(page, ids, wait=650):
    selected = board(page)['sel']
    for i in ids:
        if i not in selected:
            page.tap(f'.tile[data-id="{i}"]')
            page.wait_for_timeout(40)
    page.wait_for_timeout(wait)


def blitz_solve(page):
    ans = page.evaluate("""() => {
      const S = window.__sixes;
      const letters = [...document.querySelectorAll('.bt')].map(e => e.firstChild.textContent);
      const key = [...letters].sort().join('');
      const w = S.COMMON.find(x => [...x].sort().join('') === key) || [...S.VALID].find(x => [...x].sort().join('') === key);
      const used = new Set(), order = [];
      for (const ch of w) { const i = letters.findIndex((l, j) => l === ch && !used.has(j)); used.add(i); order.push(i); }
      return { w, order };
    }""")
    for i in ans['order']:
        page.tap(f'.bt[data-i="{i}"]')
        page.wait_for_timeout(30)
    return ans['w']


def score(page):
    return int(page.inner_text('#blitzScore').replace(',', ''))


def swipe(page, cdp, x, y_from, y_to, steps=8):
    """Drag one finger from (x, y_from) to (x, y_to) with real touch events."""
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y_from}]})
    for i in range(1, steps + 1):
        y = y_from + (y_to - y_from) * i / steps
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}]})
        page.wait_for_timeout(16)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


# iPhone Safari can put a scrolling area on its own layer, above positioned siblings that come
# before it. Chromium doesn't, so the test recreates that layering to catch controls it would bury.
IPHONE_LAYERING = '.sheet-body, .home-scroll { position: relative; z-index: 0; }'


def on_top(page, selector):
    """True if a tap at the center of `selector` would land on it, not on something covering it."""
    return page.evaluate("""(sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    }""", selector)


def main():
    SHOTS.mkdir(exist_ok=True)
    server, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- daily board, light mode ----------
        ctx = browser.new_context(color_scheme='light', **PHONE)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(url)
        page.wait_for_timeout(800)
        page.add_style_tag(content=IPHONE_LAYERING)
        page.screenshot(path=SHOTS / '01-home.png')
        check(re.search(r'no\. \d+', page.inner_text('#dcNo').lower()) is not None, 'home shows today\'s daily number')

        page.tap('#dailyCard')
        page.wait_for_selector('#howGo', state='visible')
        page.wait_for_timeout(450)
        check('How to play' in page.inner_text('#sheet'), 'how-to sheet opens before the first daily')
        meta = page.evaluate("document.querySelector('meta[name=theme-color][data-dim]').content")
        check(meta.upper() == '#8F9196', f'status bar color dims while a sheet is open ({meta})')
        page.screenshot(path=SHOTS / '02-how-to.png')
        check(on_top(page, '#sheetClose'), 'the X stays on top of the scrolling sheet with iPhone-style layering')
        page.tap('#sheetClose', timeout=3000)
        page.wait_for_timeout(500)
        check(page.evaluate("document.querySelector('#sheet').hidden"), 'the X closes the first-run instructions')
        check(page.evaluate("localStorage.getItem('sixes:seenIntro')") == 'true', 'closing with the X marks the instructions as seen')
        meta = page.evaluate("document.querySelector('meta[name=theme-color][data-dim]').content")
        check(meta.upper() == '#ECEEF3', f'status bar color restores when the sheet closes ({meta})')

        g = board(page)
        words = g['words']
        print('   board words:', ' '.join(words))
        col0 = page.evaluate('window.__sixes.board().grid.map(row => row[0])')
        spell(page, col0, 200)
        check('word list' in page.inner_text('#toast'), 'a non-word is rejected')
        page.wait_for_timeout(400)

        bonus = page.evaluate("""() => {
          const S = window.__sixes, G = S.board();
          const rows = G.grid.map(row => row.map(id => G.words[id % 6][(id / 6) | 0]));
          return S.COMMON.find(w => !G.words.includes(w) && [...w].every((ch, r) => rows[r].includes(ch))) || null;
        }""")
        if bonus:
            spell(page, tiles_for(page, bonus), 700)
            g = board(page)
            check(bonus in g['bonus'] and not g['locked'], f'{bonus} counts as a bonus word and locks nothing')
        else:
            print('   (no bonus word on this board)')

        page.tap('#btnHint')
        page.wait_for_timeout(300)
        g = board(page)
        check(g['hint'] and g['hint']['n'] == 1 and g['sel'][0] >= 0 and g['hints'] == 1, 'a hint reveals and selects one letter')

        for w in words[:4]:
            ids = tiles_for(page, w)
            if ids is None:
                check(False, f'tiles for {w} are on the board')
                break
            spell(page, ids)
        g = board(page)
        check(len(g['locked']) == 4, 'four words lock: ' + ' '.join(l['w'] for l in g['locked']))
        check(all(g['grid'][r][l['c']] % 6 == words.index(l['w']) for l in g['locked'] for r in range(6)),
              'locked words move into their own columns')
        page.screenshot(path=SHOTS / '03-board.png')

        spell(page, tiles_for(page, words[4]), 0)
        page.wait_for_selector('#sheetTitle', state='visible', timeout=6000)
        g = board(page)
        check(g['done'] and len(g['locked']) == 6, 'the last word fills itself in and the board completes')
        page.wait_for_timeout(600)
        page.screenshot(path=SHOTS / '04-results.png')
        page.tap('#sheetClose')
        page.wait_for_timeout(450)
        page.tap('#boardBack')
        page.wait_for_timeout(500)
        check('Results' in page.inner_text('#dcCta'), 'home card shows the solved state')
        check(page.inner_text('#dcStreak').startswith('Streak 1'), 'streak is 1: ' + page.inner_text('#dcStreak'))
        page.reload()
        page.wait_for_timeout(800)
        check('Results' in page.inner_text('#dcCta'), 'progress survives a reload')
        check(bool(page.evaluate('navigator.serviceWorker.getRegistration().then(r => !!r)')), 'service worker registers')
        check(page.evaluate("fetch('manifest.webmanifest').then(r => r.json()).then(j => j.display)") == 'standalone',
              'manifest asks for standalone display')

        # ---------- practice, Blitz, Word Book, stats: dark mode ----------
        ctx2 = browser.new_context(color_scheme='dark', **PHONE)
        pg = ctx2.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto(url)
        pg.wait_for_timeout(800)
        pg.add_style_tag(content=IPHONE_LAYERING)
        pg.screenshot(path=SHOTS / '05-home-dark.png')
        pg.tap('#practiceSeg button[data-diff="1"]')
        pg.wait_for_timeout(700)
        if pg.is_visible('#howGo'):
            pg.tap('#howGo')
            pg.wait_for_timeout(450)
        g = board(pg)
        check(g['kind'] == 'practice' and g['diff'] == 1, 'a Gentle practice board opens')
        spell(pg, tiles_for(pg, g['words'][0]))
        pg.screenshot(path=SHOTS / '06-practice-dark.png')
        pg.tap('#boardBack')
        pg.wait_for_timeout(400)

        pg.tap('#blitzCard')
        pg.wait_for_selector('#bStart', state='visible')
        pg.screenshot(path=SHOTS / '07-blitz-intro.png')
        pg.tap('#bStart')
        pg.wait_for_timeout(700)
        first = blitz_solve(pg)
        pg.wait_for_timeout(250)
        pg.screenshot(path=SHOTS / '08-blitz.png')
        pg.wait_for_timeout(500)
        check(score(pg) >= 125, f'solving {first} scores ({score(pg)})')
        for _ in range(5):
            blitz_solve(pg)
            pg.wait_for_timeout(700)
        pg.wait_for_timeout(700)
        check(score(pg) >= 1200, f'six solves in a row earn a Sixer ({score(pg)})')
        before = int(pg.inner_text('#clockSecs'))
        pg.tap('#btnSkip')
        pg.wait_for_timeout(1200)
        after = int(pg.inner_text('#clockSecs'))
        check(after <= before - 5, f'skipping costs 5 seconds ({before}s to {after}s)')
        pg.tap('#btnPause')
        pg.wait_for_selector('#bQuit', state='visible')
        pg.tap('#bQuit')
        pg.wait_for_selector('#bAgain', state='visible', timeout=4000)
        check('Longest run' in pg.inner_text('#sheet'), 'Blitz results appear')
        pg.screenshot(path=SHOTS / '09-blitz-results.png')
        pg.tap('#bHome')
        pg.wait_for_timeout(500)
        check(pg.inner_text('#blitzBest') != '—', 'Blitz best score is saved: ' + pg.inner_text('#blitzBest'))
        pg.tap('#bookCard')
        pg.wait_for_timeout(500)
        check(pg.locator('#bookList .wchip').count() > 0, 'Word Book lists found words')
        pg.screenshot(path=SHOTS / '10-word-book.png')
        pg.tap('#sheetClose')
        pg.wait_for_timeout(400)
        pg.tap('#btnStats')
        pg.wait_for_timeout(500)
        pg.screenshot(path=SHOTS / '11-stats.png')
        cdp = ctx2.new_cdp_session(pg)
        grab = pg.evaluate("(() => { const r = document.querySelector('.sheet-grab').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom + 12 }; })()")
        swipe(pg, cdp, grab['x'], grab['y'], grab['y'] + 6, steps=3)
        pg.wait_for_timeout(450)
        still = pg.evaluate("(() => { const s = document.querySelector('#sheet'); return !s.hidden && s.classList.contains('open') && !s.style.transform; })()")
        check(still, 'a small finger wobble leaves the sheet in place')
        swipe(pg, cdp, grab['x'], grab['y'], grab['y'] + 240)
        pg.wait_for_timeout(500)
        check(pg.evaluate("document.querySelector('#sheet').hidden"), 'swiping the sheet down closes it')

        # ---------- small phone and landscape ----------
        ctx3 = browser.new_context(color_scheme='light', viewport={'width': 375, 'height': 667},
                                   device_scale_factor=2, is_mobile=True, has_touch=True)
        ps = ctx3.new_page()
        ps.on('pageerror', lambda e: errors.append(str(e)))
        ps.goto(url)
        ps.wait_for_timeout(600)
        ps.evaluate("localStorage.setItem('sixes:seenIntro', 'true')")
        ps.tap('#dailyCard')
        ps.wait_for_timeout(700)
        ps.screenshot(path=SHOTS / '12-small-phone.png')
        fit = ps.evaluate("""() => ({ bottom: document.querySelector('#scr-board .actions').getBoundingClientRect().bottom,
                                      vh: innerHeight, sw: document.documentElement.scrollWidth, w: innerWidth })""")
        check(fit['bottom'] <= fit['vh'] and fit['sw'] <= fit['w'], f'board fits a 375x667 screen {fit}')
        ps.set_viewport_size({'width': 667, 'height': 375})
        ps.wait_for_timeout(300)
        if ps.evaluate("matchMedia('(pointer: coarse)').matches"):
            check(ps.is_visible('#rotateNote'), 'landscape phone shows the turn-upright note')
            ps.screenshot(path=SHOTS / '13-landscape.png')
        else:
            print('   (skipped landscape check: browser does not report a coarse pointer)')

        browser.close()
    server.shutdown()
    check(not errors, 'no console or page errors' + (f': {errors[:5]}' if errors else ''))
    print(f'\n{len(failures)} failed' if failures else '\nAll checks passed.')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
