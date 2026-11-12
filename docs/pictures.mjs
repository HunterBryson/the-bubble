// Makes the README's pictures from the bubble's real tab.html, so they always show what installs.
//   node docs/pictures.mjs          (Windows, with Edge or Chrome; writes docs/*.png)
// Each moment is tab.html with a stand-in for the window's bridge, fed one state, drawn by a headless browser at 2x.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const tab = fs.readFileSync(path.join(ROOT, 'app', 'tab.html'), 'utf8');
const face = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'app', 'odie.png')).toString('base64');
const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
if (!browser) { console.log('Needs Edge or Chrome.'); process.exit(1); }

const me = { name: 'Odie', color: '#f5a524', home: 'x' }, min = m => Date.now() - m * 60000;
const moments = {
  work: { mode: 'work', open: true, main: 'Comparing the three roof quotes you sent.', doing: 'Reading the third quote', parts: ['Read the quotes', 'Line them up', 'Write it up'], now: 1, asked: 'which roof quote should we take?', since: min(3) },
  done: { mode: 'done', open: true, main: 'The second quote is $1,900 less for the same shingles.', reply: 'Same 30-year shingles and the same warranty. The first one adds a gutter job you didn\'t ask for.', sid: 'x', since: min(6) },
  call: { mode: 'ring', open: true, main: 'Can you look over the plan I put up for David before Friday?', call: { from: 'Forge', about: 'Can you look over the plan I put up for David before Friday?', words: 'x' }, since: min(0) },
  need: { mode: 'need', open: true, main: 'Click Yes on the Windows box in the middle of your screen.', since: min(1) },
};
// One moment as a page of its own: tab.html, a stand-in bridge, and the state.
const page = s => tab.replace('<meta charset="utf-8">', '<meta charset="utf-8"><script>window.bubble={onState:f=>window.__set=f,size(){},click(){}}</script>')
  .replace('</script>\n', '</script>\n') + `<script>window.__set(${JSON.stringify({ reply: '', asked: '', doing: '', parts: [], now: 0, call: null, today: [], config: me, face, ...s })})</script>`;
const srcdoc = s => page(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// The hero: the bubble on the edge of a screen while someone works in another window. The window is abstract on purpose.
const lines = (n, w) => Array.from({ length: n }, (_, i) => `<i style="width:${w[i % w.length]}%"></i>`).join('');
const hero = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:720px;overflow:hidden;background:radial-gradient(1200px 700px at 30% 20%,#1d2733,#0d1117 70%);font-family:"Segoe UI",sans-serif}
.win{position:absolute;left:70px;top:60px;width:860px;height:590px;border-radius:12px;background:#161b22;box-shadow:0 0 0 1px #2b3038,0 30px 80px rgba(0,0,0,.55);overflow:hidden}
.bar{height:38px;background:#1c222b;display:flex;align-items:center;gap:8px;padding:0 14px}.bar b{width:12px;height:12px;border-radius:50%;background:#3a3f47}
.doc{padding:40px 56px}.doc h{display:block;height:22px;width:46%;border-radius:6px;background:#3a4250;margin-bottom:28px}
.doc i{display:block;height:11px;border-radius:5px;background:#272e38;margin:0 0 14px}.doc .gap{height:18px}
.task{position:absolute;left:0;right:0;bottom:0;height:44px;background:#0b0e13e6;box-shadow:0 -1px 0 #222}
iframe{position:absolute;right:0;top:150px;width:356px;height:330px;border:0;background:transparent}
</style><div class="win"><div class="bar"><b></b><b></b><b></b></div><div class="doc"><h></h>${lines(6, [92, 88, 95, 70, 90, 60])}<div class="gap"></div>${lines(5, [85, 93, 78, 90, 40])}<div class="gap"></div>${lines(4, [90, 82, 94, 55])}</div></div>
<div class="task"></div><iframe allowtransparency srcdoc="${srcdoc(moments.work)}"></iframe>`;

// The moments, side by side on a plain dark ground.
const strip = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1260px;height:310px;overflow:hidden;background:#0a0d12;display:flex;gap:24px;padding:20px 24px;box-sizing:border-box;font-family:"Segoe UI",sans-serif}
div{flex:1;position:relative;border-radius:10px;background:radial-gradient(500px 300px at 20% 10%,#1d2733,#11161d 75%);box-shadow:0 0 0 1px #222831;overflow:hidden}iframe{position:absolute;right:0;top:4px;width:356px;height:316px;border:0;background:transparent}
</style>${['call', 'work', 'done'].map(k => `<div><iframe allowtransparency srcdoc="${srcdoc(moments[k])}"></iframe></div>`).join('')}`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-pics-'));
for (const [name, html, w, h] of [['bubble', hero, 1280, 720], ['moments', strip, 1260, 310]]) {
  const f = path.join(tmp, name + '.html'), out = path.join(DOCS, name + '.png');
  fs.writeFileSync(f, html);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'profile')}`, '--force-device-scale-factor=2', `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, 'file:///' + f.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 60000 });
  console.log('wrote', out);
}
fs.rmSync(tmp, { recursive: true, force: true });
