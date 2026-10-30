// A leased context can be opened with a COARSE pointer, so a touch-only CSS rule can be given a
// verdict in a REAL headless Chromium (#1903).
// Prints through process.stdout.write: the repository asks for no console logging.
//
// The unit tests prove `emulate.pointer` becomes `hasTouch` and that reticle_viewport refuses it on
// a live lease. Only a real browser can say whether the page then matches `(pointer: coarse)` and
// takes the rule behind it — the whole point of the option. Serves its own one-line page, so it
// needs no app from run-ci.sh.
//
// The rule is deliberately a touch-sized tap target: 44px is the one every mobile audit asks about,
// and before this option a lease answered every such audit with a mouse.
import { createServer } from 'node:http';
import { BrowserPool, playwrightLauncher } from '@reticlehq/server';

let pass = 0,
  fail = 0;
const say = (line) => process.stdout.write(`${line}\n`);
const chk = (label, ok, detail = '') => {
  say(`   ${ok ? '✅' : '❌'} ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const PAGE =
  '<!doctype html><title>pointer</title>' +
  '<style>button{min-height:20px}@media (pointer: coarse){button{min-height:44px}}</style>' +
  '<button id="tap">tap</button>';
const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(PAGE);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const APP = `http://127.0.0.1:${server.address().port}/`;

// The pool hands out leases, not pages; keep each page so the spec can ask it directly. The
// context options are forwarded: they are what this spec is about.
const pages = [];
const launcher = async () => {
  const browser = await playwrightLauncher({ headless: true })();
  return {
    ...browser,
    newContext: async (opts) => {
      const context = await browser.newContext(opts);
      return {
        ...context,
        newPage: async () => {
          const page = await context.newPage();
          pages.push(page);
          return page;
        },
      };
    },
  };
};
let seq = 0;
const pool = new BrowserPool(launcher, { maxContexts: 3, genSessionId: () => `ptr-${(seq += 1)}` });
const reads = (page) =>
  page.evaluate(
    `[matchMedia('(pointer: coarse)').matches, matchMedia('(pointer: fine)').matches,` +
      ` document.getElementById('tap').getBoundingClientRect().height, navigator.maxTouchPoints]`,
  );

say('\n=== a lease emulating a coarse pointer, in a real headless Chromium ===');

const mouse = await pool.acquire(APP);
const [coarseByDefault, fineByDefault, heightByDefault, touchByDefault] = await reads(pages.at(-1));
chk('a lease opened with no pointer is a mouse: (pointer: fine) matches', false === coarseByDefault && true === fineByDefault, `coarse=${coarseByDefault} fine=${fineByDefault}`);
chk('so the touch-only rule does not apply: the button stays under the 44px tap target', 44 > heightByDefault, `${heightByDefault}px`);
chk('and the page reports no touch points', 0 === touchByDefault, `maxTouchPoints=${touchByDefault}`);
await mouse.release();

const touch = await pool.acquire(APP, { emulate: { pointer: 'coarse' } });
const [coarse, fine, height, touchPoints] = await reads(pages.at(-1));
chk('a lease acquired with emulate.pointer "coarse" matches (pointer: coarse)', true === coarse && false === fine, `coarse=${coarse} fine=${fine}`);
chk('the touch-only rule applies: the 44px tap target is live', 44 === height, `${height}px`);
chk('the page reports a touch point, which is what makes the pointer coarse', 0 < touchPoints, `maxTouchPoints=${touchPoints}`);
await touch.release();

const fineLease = await pool.acquire(APP, { emulate: { pointer: 'fine' } });
const [coarseFine, fineFine, heightFine] = await reads(pages.at(-1));
chk('an explicit "fine" pointer is a mouse, and says so', false === coarseFine && true === fineFine, `coarse=${coarseFine} fine=${fineFine}`);
chk('with the touch-only rule back off', 44 > heightFine, `${heightFine}px`);
await fineLease.release();

// A pointer alongside a size: both ride on the same context, so neither may cancel the other.
const both = await pool.acquire(APP, {
  emulate: { pointer: 'coarse', viewport: { width: 390, height: 844 } },
});
const [coarseBoth, , heightBoth] = await reads(pages.at(-1));
const size = await pool.viewportOfLease(both.sessionId);
chk('a pointer and a viewport can be asked for together', true === coarseBoth && 44 === heightBoth, `coarse=${coarseBoth} ${heightBoth}px`);
chk('and the lease opened at the phone size that was asked for', 390 === size?.width && 844 === size?.height, JSON.stringify(size));
await both.release();

await pool.shutdown();
server.close();
say(`\n${fail === 0 ? '✅' : '❌'} LEASE POINTER: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
