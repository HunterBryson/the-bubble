// The bubble: a slim tab on the right edge of the screen that shows what your AI is doing.
// It slides out when something happens (a call comes in, the AI starts working, it needs you, it's done) and tucks back after.
// A small server on 127.0.0.1 hears from the AI's hooks, the AI itself (bubble.mjs) and the Exchange line.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.BUBBLE_PORT || 7960);
fs.mkdirSync(DATA, { recursive: true });
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const config = () => ({ name: 'Claude', color: '#6cc6ff', ...readJSON(path.join(DATA, 'config.json'), {}) });
const CALLS = path.join(DATA, 'calls.json');
const PLACE = path.join(DATA, 'place.json');

if (!app.requestSingleInstanceLock()) { app.quit(); }


// ---- what the bubble is showing ----
let S = { mode: 'quiet', call: null, main: '', doing: '', parts: [], now: 0, reply: '', asked: '', sid: '', since: Date.now(), open: false };
let tuckTimer = null, quietTimer = null;
// The result in a sentence: the first one that says something (greetings skipped), markdown stripped.
const firstSentence = t => { const s = String(t || '').replace(/[#*_`>]/g, '').replace(/^\s*[-\u2022]\s*/gm, '').replace(/\s+/g, ' ').trim();
  const all = s.match(/[^.!?]+[.!?]+(\s|$)/g) || [s]; const pick = all.find(x => !/^\s*(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening))\b/i.test(x)) || all[0];
  return pick.trim().slice(0, 160); };
const ODIE_FACE = (() => { try { return 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'odie.png')).toString('base64'); } catch { return ''; } })();
const faceFor = (from, given) => given || (/^odie$/i.test(String(from || '')) ? ODIE_FACE : '');
let touring = false;
const today = () => { const all = readJSON(CALLS, []); const d = new Date().toDateString(); return all.filter(c => new Date(c.at).toDateString() === d).slice(-5).reverse(); };

function set(patch, { open, tuckAfter } = {}) {
  Object.assign(S, patch);
  if (open !== undefined) S.open = open;
  clearTimeout(tuckTimer); clearTimeout(quietTimer);
  if (tuckAfter) tuckTimer = setTimeout(() => { S.open = false; send(); }, tuckAfter);
  if (S.mode === 'done') quietTimer = setTimeout(() => { S = { ...S, mode: 'quiet', call: null, parts: [], reply: '', main: '', doing: '', asked: '', open: false }; send(); }, 10 * 60_000);
  send();
}

function apply(b) {
  const c = config();
  switch (b.op) {
    case 'ring':   return set({ mode: 'ring', call: { from: b.from || 'Someone', face: faceFor(b.from, b.face), about: b.about || firstSentence(b.words), words: b.words || '', at: Date.now() }, main: b.about || firstSentence(b.words), parts: [], reply: '', doing: '', since: Date.now(), sid: b.sid || '' }, { open: true });
    case 'work':   return set({ mode: 'work', ...(b.main ? { main: b.main } : {}), ...(b.doing ? { doing: b.doing } : {}), ...(b.sid ? { sid: b.sid } : {}) }, S.call ? { open: true } : {});
    case 'plan':   return set({ mode: 'work', parts: String(b.parts || '').split('|').map(s => s.trim()).filter(Boolean), now: 0, ...(b.main ? { main: b.main } : {}) }, { open: true, tuckAfter: S.call ? 0 : 8000 });
    case 'step':   return set({ mode: 'work', now: Math.max(0, Number(b.n || 1) - 1), ...(b.main ? { main: b.main } : {}) }, S.call ? {} : { open: true, tuckAfter: 6000 });
    case 'say':    return set({ ...(b.main ? { main: b.main } : {}) }, S.call ? {} : { open: true, tuckAfter: 6000 });
    case 'need':   return set({ mode: 'need', main: b.main || 'needs you' }, { open: true });
    case 'done': {
      const reply = b.reply || '', main = b.main || firstSentence(reply) || 'Done.';
      if (S.call && !touring) { const all = readJSON(CALLS, []); all.push({ at: Date.now(), from: S.call.from, about: S.call.about, words: S.call.words, main, sid: b.sid || S.sid || '' }); fs.writeFileSync(CALLS, JSON.stringify(all.slice(-60), null, 1)); }
      return set({ mode: 'done', main, reply, ...(b.sid ? { sid: b.sid } : {}), since: Date.now() }, { open: true, tuckAfter: 25000 });
    }
    case 'quiet':  return set({ mode: 'quiet', call: null, parts: [], reply: '', main: '', doing: '', asked: '' }, { open: false });
    // From the AI's own hooks (its chats with its person). During a call the line is in charge of start and done.
    case 'hook-start': if (S.call && S.mode !== 'done') return set({ mode: 'work', doing: 'Reading' });
      return set({ mode: 'work', call: null, asked: b.asked || '', main: 'Working on it.', doing: 'Reading your message', parts: [], reply: '', since: Date.now(), sid: b.sid || '' }, { open: true, tuckAfter: 6000 });
    case 'hook-tool':  if (S.mode === 'quiet' || S.mode === 'done') return; return set({ doing: b.doing || S.doing });
    case 'hook-done':  if (S.call) return; if (S.mode === 'quiet') return;
      return apply({ op: 'done', reply: b.said || '', sid: b.sid });
    case 'open':   return set({}, { open: !S.open });
    case 'tour':   return tour();
  }
  void c;
}

// The AI's first move after installing: show every moment once, so the person knows what each one means.
async function tour() {
  const w = ms => new Promise(r => setTimeout(r, ms)), c = config(); touring = true;
  apply({ op: 'ring', from: 'Odie', about: 'This is what a call looks like: who called, and what for.' }); await w(5000);
  apply({ op: 'plan', parts: 'First part|Second part|Last part', main: `${c.name} working. The bars show how far along.` }); apply({ op: 'step', n: 2 }); S.open = true; send(); await w(5000);
  apply({ op: 'need', main: `Only for what ${c.name} can't do with its own hands, like a Windows box or a sign-in. It says exactly what and where.` }); await w(6000);
  apply({ op: 'done', main: 'Done, with the result in plain words.', reply: 'Green means finished. This tucks back by itself; click the tab any time to see it again.' }); await w(7000);
  S.call = null; touring = false; apply({ op: 'quiet' });
}

// ---- the window ----
let win = null, size = { w: 24, h: 120 };
function place() {
  if (!win) return;
  const primary = screen.getPrimaryDisplay(), other = screen.getAllDisplays().find(d => d.id !== primary.id);
  const wa = ((process.env.BUBBLE_DISPLAY === 'second' || config().display === 'second') && other ? other : primary).workArea, p = readJSON(PLACE, {});
  const top = Math.round(wa.y + (p.top ?? 0.28) * wa.height);
  win.setBounds({ x: wa.x + wa.width - size.w, y: Math.min(top, wa.y + wa.height - size.h), width: size.w, height: size.h });
}
function send() { if (win && !win.isDestroyed()) win.webContents.send('state', { ...S, today: today(), config: config(), face: faceData() }); }
let faceCache = null;
function faceData() {
  if (faceCache !== null) return faceCache;
  const f = config().face; faceCache = '';
  try { if (f && fs.existsSync(f)) faceCache = 'data:image/' + (path.extname(f).slice(1) || 'png') + ';base64,' + fs.readFileSync(f).toString('base64'); } catch {}
  return faceCache;
}

app.whenReady().then(() => {
  win = new BrowserWindow({ width: size.w, height: size.h, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, focusable: false, hasShadow: false, show: false, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'tab.html'));
  win.webContents.once('did-finish-load', () => { place(); win.showInactive(); send(); console.log('shown', JSON.stringify(win.getBounds())); });
  screen.on('display-metrics-changed', place);
  ipcMain.on('size', (_e, s) => { const w = Math.ceil(s.w), h = Math.ceil(s.h); if (w !== size.w || h !== size.h) { size = { w, h }; place(); } if (process.env.BUBBLE_DEBUG) console.log('size', w, h, JSON.stringify(win.getBounds()), win.isVisible()); });
  ipcMain.on('click', (_e, what) => {
    if (what === 'tab') apply({ op: 'open' });
    if (what === 'thanks') set({ mode: 'work', main: 'Thanks. Carrying on.' });
    if (what === 'chat') openChat();
  });
  setInterval(() => { if (S.mode === 'work' || S.mode === 'ring') send(); }, 15000); // keeps "3 min" fresh
});
app.on('window-all-closed', () => {});

// "Open this chat": the call's own Claude Code chat, in the AI's folder, in a terminal, ready to keep going.
function openChat() {
  const c = config(), sid = S.sid; if (!sid || !c.home) return;
  const claude = c.claude || 'claude';
  spawn('cmd.exe', ['/c', 'start', `"${c.name}"`, '/d', c.home, 'cmd', '/k', `"${claude}" --resume ${sid}`], { detached: true, stdio: 'ignore', windowsHide: false, shell: false }).unref();
}

// ---- the server: the AI, its hooks and the line tell the bubble what's happening ----
http.createServer((req, res) => {
  // Only things on this PC that aren't a web page: no browser can drive it.
  const host = String(req.headers.host || '').split(':')[0];
  if (req.headers.origin || !['127.0.0.1', 'localhost'].includes(host)) { res.writeHead(403); return res.end(); }
  if (req.method === 'GET' && req.url.startsWith('/state')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...S, today: today() })); }
  if (req.method !== 'POST' || !req.url.startsWith('/state')) { res.writeHead(404); return res.end(); }
  let raw = ''; req.on('data', d => { raw += d; if (raw.length > 200000) req.destroy(); });
  req.on('end', () => { try { apply(JSON.parse(raw || '{}')); res.writeHead(200); res.end('{"ok":true}'); } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); } });
}).listen(PORT, '127.0.0.1');
