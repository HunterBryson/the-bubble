// The bubble: your AI's face and what it's saying, on your screen, wherever you're working.
// A ring around its face says what it's doing (breathing while it works, green when it's done), and a speech bubble
// beside it says it in words: what it's on, the parts of the job as bars, its answer when it's done. You drag it anywhere
// and it stays there; click its face to fold it down to just the face. When you move to another screen while your AI
// works, it follows you there, so you never have to go looking for it.
// A small server on 127.0.0.1 hears from the AI's hooks, the AI itself (bubble.mjs) and the Exchange line.
// It began as Odie's bubble on Hunter's glass (Nov 10, 2026) and moved here to be anyone's.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const config = () => ({ name: 'Claude', color: '#f5a524', yours: '#6cc6ff', hello: 'Hi', follow: 'screen', ...readJSON(path.join(DATA, 'config.json'), {}) });
const PORT = Number(process.env.BUBBLE_PORT || config().port || 7960);
// Its own log, because it usually starts hidden and nobody sees what it prints. `node bubble.mjs log` reads it.
const LOG = path.join(DATA, 'bubble.log');
const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}`; console.log(line);
  try { if (fs.existsSync(LOG) && fs.statSync(LOG).size > 200_000) fs.renameSync(LOG, LOG + '.old'); fs.appendFileSync(LOG, line + '\n'); } catch {} };
process.on('uncaughtException', e => log('error:', e && e.stack || e));
const CALLS = path.join(DATA, 'calls.json'), PLACE = path.join(DATA, 'place.json'), STATE = path.join(DATA, 'state.json');

// Electron's own files live in data/, so each copy of the bubble is its own app (and the one-copy lock is per folder).
app.setPath('userData', path.join(DATA, 'electron'));
// A second copy (the line or an install starting it again) leaves quietly instead of fighting over the port.
if (!app.requestSingleInstanceLock()) { log('a second copy started and left quietly (one is already running)'); app.exit(0); return; }

// ---- what the bubble is showing ----
// state: working | done | need | idle. plan/step: the job's parts and which one it's on. say: what the AI is doing, in
// its words. doing: what its hands just did (from the hooks). asked: the person's message. said: the AI's answer.
// call: a call from another AI on the Exchange line. sid: the chat that owns the bubble, so a second open chat can't talk
// over the one the person last messaged. since: when this turn started, so "Working · 3 min" survives a restart.
let S = readJSON(STATE, null) || { state: 'idle' };
let touring = false;
const one = s => String(s ?? '').replace(/\s+/g, ' ').trim(), clip = (s, n) => String(s ?? '').slice(0, n);
const firstSentence = t => { const s = one(String(t || '').replace(/[#*_`>]/g, ''));
  const all = s.match(/[^.!?]+[.!?]+(\s|$)/g) || [s]; return (all.find(x => !/^\s*(hi|hello|hey|thanks|good (morning|afternoon|evening))\b/i.test(x)) || all[0] || '').trim().slice(0, 200); };
const ODIE_FACE = (() => { try { return 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'odie.png')).toString('base64'); } catch { return ''; } })();
let faceCache = null;
function myFace() {
  if (faceCache !== null) return faceCache;
  const f = config().face; faceCache = '';
  try { if (f && fs.existsSync(f)) faceCache = 'data:image/' + (path.extname(f).slice(1).replace('jpg', 'jpeg') || 'png') + ';base64,' + fs.readFileSync(f).toString('base64'); } catch {}
  return faceCache;
}

function set(p) {
  S = { ...p, at: new Date().toISOString() };
  if (!touring) fs.writeFile(STATE, JSON.stringify(S), () => {});
  push(); watchFront();
}
function apply(b) {
  const prev = S, working = prev.state === 'working' || prev.state === 'need';
  // A hook from another chat while one chat owns the bubble: ignored (only a new message takes it over).
  if (/^hook-(tool|done)$/.test(b.op) && b.sid && prev.sid && b.sid !== prev.sid) return;
  switch (b.op) {
    case 'hook-start':
      if (prev.call && prev.state !== 'done' && prev.state !== 'idle') return set({ ...prev, doing: 'Reading' });
      // A new message keeps an unfinished plan from the same chat: the plan is the job, not the turn.
      return set({ state: 'working', sid: b.sid, since: new Date().toISOString(), asked: clip(one(b.asked), 300) || undefined, doing: 'Reading your message',
        ...(prev.plan && (prev.step || 1) <= prev.plan.length && (!b.sid || !prev.sid || b.sid === prev.sid) ? { plan: prev.plan, step: prev.step } : {}), fresh: Date.now() });
    case 'hook-tool': if (!working) return; return set({ ...prev, doing: clip(one(b.doing), 200) || prev.doing });
    case 'hook-done': if (prev.call || prev.state === 'idle') return; return apply({ op: 'done', reply: b.said, sid: b.sid });
    case 'plan': return set({ ...prev, state: 'working', since: working ? prev.since : new Date().toISOString(), plan: String(b.parts || '').split('|').map(s => clip(one(s), 80)).filter(Boolean).slice(0, 8), step: 1, ...(b.main ? { say: clip(one(b.main), 200) } : {}) });
    case 'step': return set({ ...prev, state: 'working', since: working ? prev.since : new Date().toISOString(), step: Math.max(1, Number(b.n) || 1), ...(b.main ? { say: clip(one(b.main), 200) } : {}) });
    case 'say': return set({ ...prev, state: working ? prev.state : 'working', since: working ? prev.since : new Date().toISOString(), say: clip(one(b.main), 200) });
    case 'work': return set({ ...prev, state: 'working', since: working ? prev.since : new Date().toISOString(), ...(b.main ? { say: clip(one(b.main), 200) } : {}), ...(b.doing ? { doing: clip(one(b.doing), 200) } : {}), ...(b.sid ? { sid: b.sid } : {}) });
    case 'need': return set({ ...prev, state: 'need', since: working ? prev.since : new Date().toISOString(), need: clip(one(b.main), 200) || 'needs you' });
    case 'thanks': return set({ ...prev, state: 'working', need: undefined, say: 'Thanks. Carrying on.' });
    case 'done': {
      const said = clip(String(b.reply || b.main || '').trim(), 12000);
      if (prev.call && !touring) { const all = readJSON(CALLS, []); all.push({ at: Date.now(), from: prev.call.from, about: prev.call.about, words: prev.call.words, said: firstSentence(said), sid: b.sid || prev.sid || '' }); fs.writeFileSync(CALLS, JSON.stringify(all.slice(-60), null, 1)); }
      return set({ ...prev, state: 'done', said: said || undefined, need: undefined, ...(b.sid ? { sid: b.sid } : {}), ...(prev.call ? { callDone: true } : {}) });
    }
    case 'ring': return set({ state: 'working', since: new Date().toISOString(), sid: b.sid || '', say: clip(one(b.about || firstSentence(b.words)), 200),
      call: { from: one(b.from) || 'Someone', face: b.face || (/^odie$/i.test(one(b.from)) ? ODIE_FACE : ''), about: clip(one(b.about || firstSentence(b.words)), 200), words: clip(b.words, 4000) } });
    case 'quiet': return set({ state: 'idle' });
    case 'come': return come(b.where, b.x, b.y);
    case 'fold': return js(`fold(${b.on === undefined ? 'null' : !!b.on})`);
    case 'tour': tour(); return; // runs on its own; `bubble.mjs tour` watches "touring" to know when it's over
  }
}

// The AI's first move after installing: show every moment once, so the person knows what each one means. About 30 s.
async function tour() {
  if (touring) return; touring = true;
  const w = ms => new Promise(r => setTimeout(r, ms)), c = config(), keep = S;
  await come('cursor');
  set({ state: 'working', since: new Date().toISOString(), asked: 'show me how the bubble works', say: `Hi, I'm ${c.name}. This is me, beside you while I work.`, doing: 'Reading your message' }); await w(5000);
  apply({ op: 'plan', parts: 'Look around|Do the work|Check it', main: 'When a job has parts, the bars show how far along I am.' }); apply({ op: 'step', n: 2 }); await w(5500);
  apply({ op: 'need', main: 'Only for what needs your hands, like a Windows box only you can click. I say exactly what and where.' }); await w(6000);
  apply({ op: 'done', reply: 'Green means I\'m done, with my answer right here.\n\nDrag me anywhere and I stay there. Click my face to fold me down to just my face. If you go to another screen while I work, I come with you.' }); await w(9000);
  set({ state: 'working', since: new Date().toISOString(), say: 'This is what a call from another AI looks like.', call: { from: 'Odie', face: ODIE_FACE, about: 'This is what a call from another AI looks like.', words: '' } }); await w(5000);
  touring = false; S = keep.state ? keep : { state: 'idle' }; if (S.state === 'working' && !S.since) S.state = 'idle'; push(); log('tour shown');
}

// ---- the window ----
let win = null, grab = null, grabTick = null, glide = null, rects = [];
const top = () => { if (win && !win.isDestroyed()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); } };
const js = code => { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(code).catch(() => {}); };
const push = () => { const c = config(); js(`feed(${JSON.stringify({ ...S, cfg: { name: c.name, color: c.color, yours: c.yours, hello: c.hello, face: myFace(), chat: !!(c.home && c.claude) } })})`); };
function startAt() {
  const disp = screen.getAllDisplays(), primary = screen.getPrimaryDisplay(), other = disp.find(d => d.id !== primary.id);
  const wa = (config().display === 'second' && other ? other : primary).workArea;
  const saved = readJSON(PLACE, null);
  if (saved && disp.some(d => saved.x >= d.bounds.x - 40 && saved.x < d.bounds.x + d.bounds.width - 60 && saved.y >= d.bounds.y - 10 && saved.y < d.bounds.y + d.bounds.height - 60)) return saved;
  return { x: wa.x + wa.width - 480, y: wa.y + wa.height - 330 };
}
app.whenReady().then(() => {
  win = new BrowserWindow({ ...startAt(), width: 460, height: 120, transparent: true, frame: false, resizable: false, movable: true, hasShadow: false,
    skipTaskbar: true, focusable: false, show: false, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  top();
  win.loadFile(path.join(__dirname, 'bubble.html'));
  win.webContents.on('did-finish-load', () => { if (!rects.length) win.setIgnoreMouseEvents(true, { forward: true }); win.showInactive(); push();
    log('started, shown at', JSON.stringify(win.getBounds()), `on ${screen.getAllDisplays().length} screen(s), as ${config().name}, port ${PORT}`); watchFront(); });
  win.webContents.on('render-process-gone', (_e, d) => log('error: the window crashed:', d.reason));
  // Windows can stack ordinary windows over always-on-top ones, so every few seconds it goes back on top.
  setInterval(top, 3000);
  setInterval(() => { if (S.state === 'working' || S.state === 'need') push(); }, 20000); // keeps "3 min" fresh
});
app.on('window-all-closed', () => {});
app.on('before-quit', () => { try { front && front.kill(); } catch {} });

// The page tells main its size; it grows from its top-left corner and gets nudged back if it would run off the screen.
ipcMain.on('size', (_e, w, h) => {
  if (!win || win.isDestroyed() || grab) return;
  const [x, y] = win.getPosition(), wa = screen.getDisplayNearestPoint({ x, y }).workArea;
  w = Math.max(80, Math.min(Math.round(w), 700)); h = Math.max(80, Math.min(Math.round(h), wa.height));
  win.setBounds({ x: Math.max(wa.x, Math.min(x, wa.x + wa.width - w)), y: Math.max(wa.y, Math.min(y, wa.y + wa.height - h)), width: w, height: h });
});
// The window is a rectangle, but it's cut to the shape of the face and the bubble, so clicks on the see-through corners
// go to whatever is underneath and clicks on the bubble come here.
ipcMain.on('rects', (_e, r) => { rects = Array.isArray(r) ? r : [];
  if (!win || win.isDestroyed() || !rects.length) return; const P = 10;
  try { win.setShape(rects.map(([l, t, rr, b]) => ({ x: Math.max(0, l - P), y: Math.max(0, t - P), width: rr - l + 2 * P, height: b - t + 2 * P }))); win.setIgnoreMouseEvents(false); } catch (e) { log('error: shape', e.message); } });
// Dragging: the page says start and end, and main follows the real cursor (a see-through window can't track it itself).
let placedAt = 0;
ipcMain.on('drag', (_e, k) => {
  if (!win || win.isDestroyed()) return;
  const follow = () => { if (!grab) return; const c = screen.getCursorScreenPoint(); win.setPosition(grab.wx + c.x - grab.x, grab.wy + c.y - grab.y); };
  if (k === 'start') { clearInterval(glide); const [wx, wy] = win.getPosition(), c = screen.getCursorScreenPoint(); grab = { x: c.x, y: c.y, wx, wy }; clearInterval(grabTick); grabTick = setInterval(follow, 16); return; }
  if (k === 'end' && grab) { follow(); clearInterval(grabTick); grab = null; const [x, y] = win.getPosition(); fs.writeFile(PLACE, JSON.stringify({ x, y }), () => {}); placedAt = Date.now(); }
});
ipcMain.on('click', (_e, what) => { if (what === 'thanks') apply({ op: 'thanks' }); if (what === 'chat') openChat(); });

// ---- coming to the person ----
// The front window, read by a small PowerShell helper (front.ps1) in real pixels, turned into the screen units Electron uses.
const frontOnce = () => new Promise(resolve => {
  if (process.platform !== 'win32') return resolve(null);
  const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'front.ps1'), '-skipPid', String(process.pid), '-once'], { windowsHide: true });
  let o = ''; ps.stdout.on('data', d => o += d);
  const t = setTimeout(() => { ps.kill(); resolve(null); }, 5000);
  ps.on('close', () => { clearTimeout(t); try { resolve(toDip(JSON.parse(o.trim().split(/\r?\n/).pop()))); } catch { resolve(null); } });
});
function toDip(f) {
  if (!f || !f.fg || !f.r) return null;
  const [l, t, r, b] = f.r, d = screen.screenToDipRect(null, { x: l, y: t, width: r - l, height: b - t });
  return { fg: f.fg, x1: d.x, y1: d.y, x2: d.x + d.width, y2: d.y + d.height, full: f.full };
}
// Glide to a spot, so the person sees it arrive. "front" lands inside the top-right corner of the window they're using.
async function come(where = 'front', x, y) {
  if (!win || win.isDestroyed()) return null;
  js('arrive()'); await new Promise(r => setTimeout(r, 90)); // open up first, so it lands at its full size
  const [w, h] = win.getSize(), c = screen.getCursorScreenPoint();
  let to;
  if (where === 'spot' && Number.isFinite(x) && Number.isFinite(y)) to = { x, y };
  else if (where === 'cursor') to = { x: c.x + 28, y: c.y + 20 };
  else { const f = typeof where === 'object' ? where : await frontOnce(); to = f ? { x: f.x2 - w - 28, y: f.y1 + 64 } : { x: c.x + 28, y: c.y + 20 }; }
  const wa = screen.getDisplayNearestPoint({ x: Math.round(to.x + w / 2), y: Math.round(to.y + 20) }).workArea;
  to = { x: Math.round(Math.max(wa.x, Math.min(to.x, wa.x + wa.width - w))), y: Math.round(Math.max(wa.y, Math.min(to.y, wa.y + wa.height - h))) };
  const [fx, fy] = win.getPosition(), t0 = Date.now(), ms = 420;
  clearInterval(glide);
  await new Promise(done => { glide = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    if (win && !win.isDestroyed()) win.setPosition(Math.round(fx + (to.x - fx) * e), Math.round(fy + (to.y - fy) * e));
    if (k >= 1) { clearInterval(glide); done(); }
  }, 16); });
  fs.writeFile(PLACE, JSON.stringify(to), () => {});
  return to;
}
// Following: while the AI works (and for a while after it's done), the bubble watches which window is in front. When
// the person moves to a window on another screen, it glides over to that screen. On the same screen it stays where they
// put it. It never follows into a full-screen window (a video, a game), and never within a few seconds of them dragging it.
// "follow": "screen" (the default) | "window" (every new window, even on the same screen) | "off", in data/config.json.
let front = null, lastFg = 0, idleSince = 0;
function watchFront() {
  const mode = config().follow, active = S.state === 'working' || S.state === 'need' || (S.state === 'done' && Date.now() - new Date(S.at) < 10 * 60e3);
  if (process.platform !== 'win32' || mode === 'off' || touring) return stopFront();
  if (!active) { if (!idleSince) idleSince = Date.now(); if (Date.now() - idleSince > 60e3) stopFront(); return; }
  idleSince = 0;
  if (front) return;
  front = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'front.ps1'), '-skipPid', String(process.pid)], { windowsHide: true });
  let buf = '';
  front.stdout.on('data', d => { buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop(); const l = lines.filter(Boolean).pop(); if (!l) return;
    try { moved(toDip(JSON.parse(l))); } catch {} });
  const me = front; me.on('exit', () => { if (front === me) front = null; });
}
function stopFront() { if (front) { const p = front; front = null; lastFg = 0; try { p.kill(); } catch {} } }
setInterval(watchFront, 15000);
function moved(f) {
  if (!f || !win || win.isDestroyed() || grab || touring) return;
  const changed = f.fg !== lastFg; lastFg = f.fg;
  if (!changed || f.full || Date.now() - placedAt < 4000) return;
  const [x, y] = win.getPosition(), [w] = win.getSize();
  const here = screen.getDisplayNearestPoint({ x: x + Math.round(w / 2), y: y + 20 }).id;
  const there = screen.getDisplayMatching({ x: f.x1, y: f.y1, width: Math.max(1, f.x2 - f.x1), height: Math.max(1, f.y2 - f.y1) }).id;
  if (config().follow === 'window' || here !== there) come(f);
}

// "Open this chat": a call's own Claude Code chat, in the AI's folder, in a terminal, ready to keep going.
function openChat() {
  const c = config(), sid = S.sid; if (!sid || !c.home) return;
  const q = v => String(v).replace(/"/g, '');
  spawn('cmd.exe', ['/d', '/s', '/c', `start "${q(c.name)}" /d "${q(c.home)}" cmd /k ""${q(c.claude || 'claude')}" --resume ${q(sid)}"`], { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true }).unref();
}

// ---- the server: the AI, its hooks and the line tell the bubble what's happening ----
http.createServer((req, res) => {
  // Only things on this PC that aren't a web page: no browser can drive it.
  const host = String(req.headers.host || '').split(':')[0];
  if (req.headers.origin || !['127.0.0.1', 'localhost'].includes(host)) { res.writeHead(403); return res.end(); }
  const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && req.url.startsWith('/state')) {
    const b = win && !win.isDestroyed() ? win.getBounds() : null;
    const onScreen = b ? screen.getAllDisplays().some(d => b.x + 40 < d.bounds.x + d.bounds.width && b.x + b.width - 40 > d.bounds.x && b.y + 20 < d.bounds.y + d.bounds.height && b.y + b.height - 20 > d.bounds.y) : null;
    return send(200, { ...S, touring, folded, bounds: b, onScreen, visible: !!(win && !win.isDestroyed() && win.isVisible()) });
  }
  if (req.method !== 'POST' || !req.url.startsWith('/state')) { res.writeHead(404); return res.end(); }
  let raw = ''; req.on('data', d => { raw += d; if (raw.length > 200000) req.destroy(); });
  req.on('end', async () => { try { const r = await apply(JSON.parse(raw || '{}')); send(200, { ok: true, ...(r && r.x !== undefined ? { at: r } : {}) }); } catch (e) { send(400, { error: e.message }); } });
}).on('error', e => log(`error: could not listen on ${PORT} (${e.code === 'EADDRINUSE' ? 'another program is using that port; put "port" in data/config.json' : e.message}). The bubble shows but nothing can reach it.`)).listen(PORT, '127.0.0.1');
let folded = false;
ipcMain.on('folded', (_e, f) => { folded = !!f; });
