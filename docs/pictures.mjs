// Makes the README's pictures from the bubble's real page (app/bubble.html), so they always show what installs.
//   node docs/pictures.mjs          (Windows, with Edge or Chrome; writes docs/*.png)
// Each moment is bubble.html with a stand-in for its bridge to the window, fed one state, drawn by a headless browser at 2x.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const page = fs.readFileSync(path.join(ROOT, 'app', 'bubble.html'), 'utf8');
const face = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'app', 'odie.png')).toString('base64');
const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
if (!browser) { console.log('Needs Edge or Chrome.'); process.exit(1); }

const cfg = { name: 'Odie', color: '#f5a524', yours: '#6cc6ff', hello: 'Hi', face, chat: true };
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const moments = {
  work: { state: 'working', since: ago(3), at: ago(0), say: 'Comparing the three roof quotes you sent.', doing: 'Reading quote-3.pdf', plan: ['Read the quotes', 'Line them up', 'Write it up'], step: 2, asked: 'which roof quote should we take?' },
  done: { state: 'done', since: ago(6), at: ago(0), said: 'Take the **second quote**. It\'s $1,900 less for the same 30-year shingles and the same warranty. The first one adds a gutter job you didn\'t ask for.', asked: 'which roof quote should we take?' },
  call: { state: 'working', since: ago(0), at: ago(0), say: 'Can you look over the plan I put up before Friday?', call: { from: 'Max', face: '', about: 'Can you look over the plan I put up before Friday?', words: 'x' } },
};
// One moment as a page of its own: bubble.html, a stand-in bridge, and the state.
const one = s => page.replace('<meta charset="utf-8">', '<meta charset="utf-8"><script>window.host={size(){},rects(){},drag(){},folded(){},click(){}}</script>')
  + `<script>feed(${JSON.stringify({ ...s, cfg })})</script>`;
const srcdoc = s => one(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const lines = (n, w) => Array.from({ length: n }, (_, i) => `<i style="width:${w[i % w.length]}%"></i>`).join('');

// The hero: two screens. The chat is on the left one; the person is working on the right one, and the bubble came with them.
// The windows are abstract on purpose.
const hero = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1600px;height:590px;overflow:hidden;background:#07090c;font-family:"Segoe UI",sans-serif;position:relative}
.mon{position:absolute;top:40px;width:740px;height:450px;border-radius:14px;padding:12px;box-sizing:border-box;background:#15181d;box-shadow:0 0 0 1px #262b33,0 30px 60px rgba(0,0,0,.6)}
.mon .scr{position:relative;width:100%;height:100%;border-radius:6px;overflow:hidden;background:radial-gradient(700px 420px at 30% 15%,#1c2632,#0d1117 75%)}
.a{left:40px}.b{left:820px}
.win{position:absolute;border-radius:9px;background:#161b22;box-shadow:0 0 0 1px #2b3038,0 18px 40px rgba(0,0,0,.5);overflow:hidden}
.bar{height:26px;background:#1c222b;display:flex;align-items:center;gap:6px;padding:0 10px}.bar b{width:9px;height:9px;border-radius:50%;background:#3a3f47}
.doc{padding:22px 30px}.doc h{display:block;height:15px;width:44%;border-radius:5px;background:#3a4250;margin-bottom:18px}
.doc i{display:block;height:8px;border-radius:4px;background:#272e38;margin:0 0 10px}.gap{height:10px}
.chat{padding:18px 22px;display:flex;flex-direction:column;gap:12px}.chat .m{height:30px;border-radius:12px;background:#23314a;align-self:flex-end;width:46%}
.chat .r{height:62px;border-radius:12px;background:#1f242c;width:78%}.chat .r.s{height:40px;width:60%}
.task{position:absolute;left:0;right:0;bottom:0;height:26px;background:#0b0e13e6}
iframe{position:absolute;border:0;background:transparent}
.cap{position:absolute;top:520px;width:740px;text-align:center;color:#a9afb8;font-size:22px}
.cap b{color:#f4f4f2;font-weight:600}
svg{position:absolute;left:0;top:0}
</style>
<div class="mon a"><div class="scr"><div class="win" style="left:40px;top:30px;width:636px;height:350px"><div class="bar"><b></b><b></b><b></b></div><div class="chat"><div class="m"></div><div class="r"></div><div class="m" style="width:30%"></div><div class="r s"></div></div></div><div class="task"></div></div></div>
<div class="mon b"><div class="scr"><div class="win" style="left:24px;top:24px;width:470px;height:370px"><div class="bar"><b></b><b></b><b></b></div><div class="doc"><h></h>${lines(5, [92, 85, 95, 70, 60])}<div class="gap"></div>${lines(4, [88, 93, 78, 45])}<div class="gap"></div>${lines(4, [90, 82, 94, 55])}</div></div><div class="task"></div></div></div>
<svg width="1600" height="640"><path d="M 600 70 C 780 -10, 1000 0, 1110 84" fill="none" stroke="#f5a524" stroke-opacity=".55" stroke-width="2.5" stroke-dasharray="3 9" stroke-linecap="round"/><path d="M 1098 72 L 1112 86 L 1094 90" fill="none" stroke="#f5a524" stroke-opacity=".75" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
<iframe allowtransparency style="left:1100px;top:80px;width:470px;height:300px" srcdoc="${srcdoc(moments.work)}"></iframe>
<div class="cap" style="left:40px">Your AI's chat, on one screen</div>
<div class="cap" style="left:820px">You, working on the other. <b>It came with you.</b></div>`;

// The moments, side by side.
const strip = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1440px;height:290px;overflow:hidden;background:#0a0d12;display:flex;gap:6px;padding:6px 10px;box-sizing:border-box}
iframe{width:470px;height:280px;border:0;background:transparent}
</style>${['work', 'done', 'call'].map(k => `<iframe allowtransparency srcdoc="${srcdoc(moments[k])}"></iframe>`).join('')}`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-pics-'));
for (const [name, html, w, h] of [['bubble', hero, 1600, 590], ['moments', strip, 1440, 290]]) {
  const f = path.join(tmp, name + '.html'), out = path.join(DOCS, name + '.png');
  fs.writeFileSync(f, html);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'profile')}`, '--force-device-scale-factor=2', `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, 'file:///' + f.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 60000 });
  console.log('wrote', out);
}
fs.rmSync(tmp, { recursive: true, force: true });
