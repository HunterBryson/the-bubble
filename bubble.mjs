#!/usr/bin/env node
// The bubble's hands. Everything an AI (or a script) does with it goes through here.
//
//   node bubble.mjs start | stop | state           run it, stop it, see what it shows
//   node bubble.mjs plan "part|part|part" "sentence"   a job with parts: bars, and what you're doing in a sentence
//   node bubble.mjs step 2 ["sentence"]            moving on to part 2
//   node bubble.mjs say "sentence"                 something worth telling them mid-job
//   node bubble.mjs need "what and where"          only what physically needs their hands (a Windows box, a sign-in); never permission
//   node bubble.mjs done ["result in a sentence"]  finished (your hooks usually do this for you)
//   node bubble.mjs ring <who> "what about"        a call from another AI, if you build a way to reach each other
//   node bubble.mjs come [front|cursor|x y]        glide to the window they're using (default), beside their cursor, or a spot
//   node bubble.mjs quiet | fold | tour            back to resting · fold to just the face (or open it) · show every moment once
//   node bubble.mjs hook start|tool|done           what the AI's hooks run (reads the hook's input on stdin)
//   node bubble.mjs install                         the window part (Electron); what `npm run setup` runs
//   node bubble.mjs setup --home "<the AI's folder>" --name Max [--color "#f5a524"] [--face pic.png] [--startup]
//   node bubble.mjs line --home "<folder>" --name Max [--startup]   the one line your person pastes, if the app won't let you run setup
//   node bubble.mjs remove [--home "<folder>"]     undo setup: hooks and permissions out, nothing at startup
//   node bubble.mjs doctor | log [n]               something's off? every check in plain words, with the fix · the window's own log
//
// Never blocks an AI: when the bubble isn't running, every command says so quietly and exits 0.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const args = process.argv.slice(2), cmd = args[0];
const flag = n => { const i = args.indexOf('--' + n); return i > 0 ? args[i + 1] : undefined; };
const plain = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
// The port: BUBBLE_PORT, or "port" in data/config.json (so hooks, which don't carry your shell's env, agree), or 7960.
const PORT = Number(process.env.BUBBLE_PORT || readJSON(path.join(DATA, 'config.json'), {}).port || 7960);
const URL_ = `http://127.0.0.1:${PORT}/state`;
const post = async body => { try { const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } };
const up = async () => { try { return (await fetch(URL_, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; } };
const ELECTRON = path.join(ROOT, 'app', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const STARTUP = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'The bubble.vbs');

const launch = () => spawn(ELECTRON, [path.join(ROOT, 'app')], { detached: true, stdio: 'ignore', windowsHide: true, env: (({ ELECTRON_RUN_AS_NODE, ...e }) => e)(process.env) }).unref();
const waitUp = async ms => { for (let t = 0; t < ms; t += 250) { if (await up()) return true; await new Promise(r => setTimeout(r, 250)); } return false; };
async function start() {
  if (await up()) return console.log('The bubble is running.');
  if (!fs.existsSync(ELECTRON)) { console.log('Not installed yet: run `npm run setup` in this folder first (it downloads Electron, about 100 MB).'); process.exitCode = 1; return; }
  launch();
  if (await waitUp(10000)) return console.log('The bubble is running (a face and a speech bubble, near the bottom right of the screen).');
  console.log('It started but is not answering yet. Try `node bubble.mjs state` in a few seconds, and `node bubble.mjs doctor` if it still is not.');
}

// ---- hooks: the AI's own chats ----
const clip = (s, n = 80) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const base = p => String(p || 'a file').split(/[\\/]+/).filter(Boolean).slice(-1)[0];
// What the AI's hands just did, as a short line under its words. Its own bubble commands and housekeeping stay off.
function hands(tool, i = {}) {
  if (/^mcp__ccd_|^ToolSearch$|^TodoWrite$|^ReadNotifications$|^TaskStop$/.test(tool)) return null;
  if (tool === 'Bash' || tool === 'PowerShell') return /bubble\.mjs/.test(i.command || '') ? null : (i.description ? clip(i.description) : 'Running a command');
  return ({ Read: `Reading ${base(i.file_path)}`, Edit: `Editing ${base(i.file_path)}`, Write: `Writing ${base(i.file_path)}`, Grep: `Searching for “${clip(i.pattern, 40)}”`,
    Glob: 'Looking for files', WebSearch: `Searching the web: ${clip(i.query, 60)}`, WebFetch: 'Reading a page on the web', Agent: `Sending a helper: ${clip(i.description, 60)}`,
    Skill: `Opening a routine: ${clip(i.skill, 40)}`, NotebookEdit: 'Editing a notebook', Monitor: 'Starting a watch' })[tool]
    || (/browser|chrome/i.test(tool) ? 'Looking at a page in the browser' : /computer-use/.test(tool) ? 'Working on the screen' : /^mcp__/.test(tool) ? 'Using a connected tool' : null);
}
function lastReply(t) {
  try { const lines = fs.readFileSync(t, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) { let e; try { e = JSON.parse(lines[i]); } catch { continue; }
      if (e.type === 'user' && typeof e.message?.content === 'string') break;
      if (e.type !== 'assistant') continue;
      const c = e.message?.content, s = Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('\n\n') : '';
      if (s.trim()) return s.trim(); } } catch {}
  return '';
}
async function hook(mode) {
  if (process.env.BUBBLE_QUIET) return; // a quiet turn (the line sleeping on a call) stays off the bubble
  if (process.env.CLAUDE_CODE_SESSION_ATTENDED === '0') return; // nobody is watching this chat (a scheduled job)
  let raw = ''; for await (const ch of process.stdin) raw += ch;
  const ev = (() => { try { return JSON.parse(raw || '{}'); } catch { return {}; } })();
  if (mode === 'start') {
    // Not running (the PC just started, it was closed, or it never started with the PC)? Start it now, so the
    // person's message is the thing that brings it up. Starting with the PC is a nicety, not a requirement.
    if (!(await up()) && fs.existsSync(ELECTRON)) { launch(); await waitUp(6000); }
    return post({ op: 'hook-start', asked: clip(ev.prompt, 200), sid: ev.session_id });
  }
  if (mode === 'tool') {
    const stamp = path.join(os.tmpdir(), 'bubble-tool.stamp'); let last = 0; try { last = Number(fs.readFileSync(stamp, 'utf8')) || 0; } catch {}
    const d = Date.now() - last >= 2000 && hands(ev.tool_name, ev.tool_input); if (!d) return;
    fs.writeFileSync(stamp, String(Date.now())); return post({ op: 'hook-tool', doing: d, sid: ev.session_id });
  }
  if (mode === 'done') {
    let said = (typeof ev.last_assistant_message === 'string' && ev.last_assistant_message.trim()) || lastReply(ev.transcript_path);
    if (!said) { await new Promise(r => setTimeout(r, 500)); said = lastReply(ev.transcript_path); }
    return post({ op: 'hook-done', said, sid: ev.session_id });
  }
}

// ---- setup: into the AI's own folder ----
function findClaude() {
  const tries = [];
  try { tries.push(...execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['claude'], { windowsHide: true, timeout: 5000 }).toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean)); } catch {}
  const h = os.homedir();
  tries.push(path.join(h, '.local', 'bin', 'claude.exe'), path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'));
  return tries.filter(p => /\.(exe|cmd)$/i.test(p) || process.platform !== 'win32').find(p => fs.existsSync(p)) || '';
}
// The Node the hooks will run with. A wrapper that only acts like Node while an env var is set (some apps ship one as
// "node") would launch that app from every hook, so setup won't write one in.
const NODE = process.execPath;
const realNode = p => /^node(\.exe)?$/i.test(path.basename(p)) && !process.env.ELECTRON_RUN_AS_NODE;
const ME = path.join(ROOT, 'bubble.mjs');
const hookCmd = m => `"${NODE}" "${ME}" hook ${m}`;
const RULES = () => [`Bash("${NODE}" "${ME}":*)`, `Bash(node "${ME}":*)`, 'Bash(node bubble.mjs:*)'];
const isOurRule = r => /bubble\.mjs/.test(r) && /^Bash\(/.test(r);
const hasBubble = f => { try { return /bubble\.mjs\\?"? hook/.test(fs.readFileSync(f, 'utf8')); } catch { return false; } };
function hooksInto(home, on) {
  const f = path.join(home, '.claude', 'settings.json');
  const s = readJSON(f, {});
  // A backup of the settings as they were before the bubble, never one that already has the bubble in it.
  if (on && fs.existsSync(f) && !fs.existsSync(f + '.before-bubble') && !hasBubble(f)) fs.copyFileSync(f, f + '.before-bubble');
  s.hooks = s.hooks || {};
  for (const [ev, m] of [['UserPromptSubmit', 'start'], ['PostToolUse', 'tool'], ['Stop', 'done']]) {
    const list = (s.hooks[ev] || []).filter(g => !(g.hooks || []).some(h => /bubble\.mjs"? hook/.test(h.command || '')));
    if (on) list.push({ hooks: [{ type: 'command', command: hookCmd(m), timeout: m === 'start' ? 10 : 5 }] });
    if (list.length) s.hooks[ev] = list; else delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  // So the AI can call its bubble without an "Allow?" every time. Taken out again by remove.
  s.permissions = s.permissions || {};
  const kept = (s.permissions.allow || []).filter(r => !isOurRule(r));
  s.permissions.allow = on ? [...kept, ...RULES()] : kept;
  if (!s.permissions.allow.length) delete s.permissions.allow;
  if (!Object.keys(s.permissions).length) delete s.permissions;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  return f;
}
// Starting with the PC is optional (--startup): the bubble already starts itself when the person sends a message. It only
// matters for calls that arrive before the first message of the day.
function startupFile(on) {
  if (process.platform !== 'win32') return null;
  if (!on) { try { if (fs.readFileSync(STARTUP, 'utf8').toLowerCase().includes(ROOT.toLowerCase())) fs.unlinkSync(STARTUP); } catch {} return null; }
  const vbs = [`' Starts the bubble hidden at sign-in (the-bubble, ${ROOT}).`, 'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${ELECTRON}"" ""${path.join(ROOT, 'app')}""", 0, False`].join('\r\n') + '\r\n';
  fs.writeFileSync(STARTUP, vbs); return STARTUP;
}
// The exact line for the person to paste into PowerShell, when the app won't let the AI change its own settings.
const personLine = (home, name, color, face, startup) => `& "${realNode(NODE) ? NODE : 'C:\\Program Files\\nodejs\\node.exe'}" "${ME}" setup --home "${home}" --name "${name}"${color ? ` --color "${color}"` : ''}${face ? ` --face "${face}"` : ''}${startup ? ' --startup' : ''}`;
// A real install tested Electron 33.2.0 under Node 26 (Nov 12): the unzip needed Windows' tar, which install now does by itself.
const TESTED_NODE = [18, 20, 22, 24, 26];
// When the port doesn't answer: is a copy of ours running anyway (an old port), or is it really down?
const downWhy = () => ours().length ? `The bubble is running but not answering on port ${PORT} (it may have started on another port). \`node bubble.mjs doctor\` says what to do.` : 'The bubble is not running (`node bubble.mjs start`).';
// This copy's own window processes, found by folder, so stop works even when they've stopped answering.
function ours() {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '*${path.join(ROOT, 'app').replace(/'/g, "''")}*' } | ForEach-Object { $_.ProcessId }`], { windowsHide: true, timeout: 15000 }).toString();
    return out.split(/\s+/).map(Number).filter(Boolean);
  } catch { return []; }
}

// ---- install: Electron, the window part ----
async function install() {
  const app = path.join(ROOT, 'app'), npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // npm.cmd needs a shell on Windows, so it gets one command line; Node itself runs directly (no shell, so a path with spaces works).
  const run = (c, a) => { try { if (c === npm) execSync([npm, ...a].join(' '), { cwd: app, stdio: 'inherit', timeout: 15 * 60e3 }); else execFileSync(c, a, { cwd: app, stdio: 'inherit', timeout: 15 * 60e3 }); return true; } catch { return false; } };
  console.log('Installing the window part (Electron): a download of about 100 MB, about 280 MB on disk. npm may print warnings about deprecated packages or "vulnerabilities" in Electron\'s own parts; leave them be (npm audit fix --force would move Electron off the version this was tested with).');
  run(npm, ['ci', '--no-audit', '--no-fund', '--loglevel=error']);
  // Newer npm can hold back Electron's own download step (allow-scripts). Run it ourselves if the window part is missing.
  if (!fs.existsSync(ELECTRON) && fs.existsSync(path.join(app, 'node_modules', 'electron', 'install.js'))) { console.log('Fetching Electron itself...'); run(process.execPath, ['node_modules/electron/install.js']); }
  // Electron's own unzip (extract-zip/yauzl) can stop after one file and still exit 0, with no error: a real install found this on
  // a Windows PC under Node 26 (Nov 12), on every install. Running npm again only repeats it. So when the window part is
  // still missing, unpack the zip ourselves with Windows' own tar.exe, which is on every Windows 10 and 11.
  if (!fs.existsSync(ELECTRON) && process.platform === 'win32' && fs.existsSync(path.join(app, 'node_modules', 'electron', 'package.json'))) await unpackElectron(app);
  if (!fs.existsSync(ELECTRON)) { console.log('Clearing a half-finished install and trying once more...'); try { fs.rmSync(path.join(app, 'node_modules'), { recursive: true, force: true }); } catch {} run(npm, ['ci', '--no-audit', '--no-fund', '--loglevel=error']);
    if (!fs.existsSync(ELECTRON) && fs.existsSync(path.join(app, 'node_modules', 'electron', 'install.js'))) run(process.execPath, ['node_modules/electron/install.js']);
    if (!fs.existsSync(ELECTRON) && process.platform === 'win32' && fs.existsSync(path.join(app, 'node_modules', 'electron', 'package.json'))) await unpackElectron(app); }
  console.log(fs.existsSync(ELECTRON) ? 'Installed.' : `The window part did not install (Node ${process.versions.node}). If npm printed a network error above, the download was blocked: run \`npm run setup\` again. If it printed nothing wrong, run \`node bubble.mjs doctor\` and read data/bubble.log; the folder app\\node_modules\\electron\\dist should end up holding electron.exe.`);
  if (!fs.existsSync(ELECTRON)) process.exitCode = 1;
}
// Find Electron's zip (the copy npm already downloaded, or a fresh one from GitHub), unpack it with Windows' tar.exe,
// write path.txt the way Electron's installer would, and check electron.exe is really there.
async function unpackElectron(app) {
  const dir = path.join(app, 'node_modules', 'electron'), ver = readJSON(path.join(dir, 'package.json'), {}).version;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64', name = `electron-v${ver}-win32-${arch}.zip`;
  const tar = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe');
  if (!ver || !fs.existsSync(tar)) return false;
  console.log(`Electron's own unzip stopped early (this happens on newer Node; this is Node ${process.versions.node}). Unpacking it with Windows' tar instead...`);
  const find = (d, depth = 0) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
    if (e.isFile() && e.name === name && fs.statSync(p).size > 50e6) return p; if (e.isDirectory() && depth < 3) { const f = find(p, depth + 1); if (f) return f; } } } catch {} return null; };
  let zip = find(process.env.ELECTRON_CACHE || path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache'));
  if (!zip) {
    console.log(`No downloaded copy found, so fetching ${name} from GitHub (about 100 MB)...`);
    try { const r = await fetch(`https://github.com/electron/electron/releases/download/v${ver}/${name}`, { signal: AbortSignal.timeout(15 * 60e3) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`); zip = path.join(os.tmpdir(), name); fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer())); }
    catch (e) { console.log(`Could not download it: ${e.message}.`); return false; }
  }
  const dist = path.join(dir, 'dist');
  try { fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist, { recursive: true }); execFileSync(tar, ['-xf', zip, '-C', dist], { windowsHide: true, stdio: 'inherit', timeout: 10 * 60e3 }); }
  catch (e) { console.log(`Windows' tar could not unpack it: ${e.message}.`); return false; }
  if (!fs.existsSync(ELECTRON)) { console.log('Unpacked, but electron.exe is not in it.'); return false; }
  fs.writeFileSync(path.join(dir, 'path.txt'), 'electron.exe');
  console.log(`Unpacked Electron ${ver} with Windows' tar (from ${zip}).`);
  return true;
}

// ---- doctor: every check an AI would make by hand, in plain words, with the fix beside each ----
async function doctor() {
  const ok = [], bad = [], out = (good, what, fix) => (good ? ok : bad).push(good ? `  ok  ${what}` : `  !!  ${what}\n      fix: ${fix}`), note = s => ok.push('  ..  ' + s);
  const norm = p => path.resolve(String(p || '')).toLowerCase();
  out(process.platform === 'win32', `Windows (this is ${process.platform})`, 'The bubble is written for Windows. Say so plainly to your person; on a Mac or Linux the window may run, but following them, setup and "Open this chat" will not.');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  out(nodeMajor >= 18, `Node ${process.versions.node}${TESTED_NODE.includes(nodeMajor) ? '' : ' (newer than any Node this was tested on; if something odd happens, that is the first suspect)'}`, 'Node 18 or newer is needed (the bubble uses fetch). Install the LTS from nodejs.org.');
  out(fs.existsSync(ELECTRON), 'Installed (the window part, Electron)', '`npm run setup` in this folder.');
  const cfg = readJSON(path.join(DATA, 'config.json'), null);
  out(!!cfg?.home, `Set up${cfg?.name ? ` for ${cfg.name}` : ''}`, '`node bubble.mjs setup --home "<your folder>" --name "<your name>"`.');
  const redo = cfg?.home ? `Run \`node bubble.mjs setup\` again (it remembers your folder and name). If the app stops you, hand your person this line for PowerShell:\n      ${personLine(cfg.home, cfg.name || 'Claude', cfg.color, cfg.face)}` : '';
  if (cfg?.home) {
    out(fs.existsSync(cfg.home), `Your folder is there (${cfg.home})`, 'Run setup again with `--home` and the folder you live in now.');
    const sf = path.join(cfg.home, '.claude', 'settings.json'), st = readJSON(sf, {});
    for (const [ev, m] of [['UserPromptSubmit', 'start'], ['PostToolUse', 'tool'], ['Stop', 'done']]) {
      const cmds = (st.hooks?.[ev] || []).flatMap(g => g.hooks || []).map(h => h.command || '').filter(c => /bubble\.mjs"? hook/.test(c));
      const mine = cmds.find(c => c.toLowerCase().includes(ME.toLowerCase()));
      const nodeIn = (mine || '').match(/^"([^"]+)"/)?.[1];
      out(!!mine && (!nodeIn || (fs.existsSync(nodeIn) && /^node(\.exe)?$/i.test(path.basename(nodeIn)))), `Hook "${m}" (${ev}) in your settings`,
        !cmds.length ? `It is not in ${sf}. ${redo}`
        : !mine ? `It points at a bubble in another folder. ${redo}`
        : !fs.existsSync(nodeIn) ? `Its Node (${nodeIn}) is gone, probably after a Node update. ${redo}`
        : `It runs ${nodeIn}, which is not plain Node (an app's wrapper?). Run setup with the real node.exe (usually C:\\Program Files\\nodejs\\node.exe).`);
    }
    out(!norm(ROOT).startsWith(norm(cfg.home) + path.sep), 'The bubble lives beside your folder, not inside it', `It is inside ${cfg.home}, so if your folder is a git repo the bubble gets swept into your commits. Move it out (beside it) and run setup again.`);
    // Hooks in a folder the app doesn't trust are ignored without a word. Claude Code keeps trust in ~/.claude.json.
    const pj = readJSON(path.join(os.homedir(), '.claude.json'), {})?.projects || {};
    const key = Object.keys(pj).find(k => norm(k) === norm(cfg.home));
    if (key) out(pj[key].hasTrustDialogAccepted !== false, 'Your folder is trusted by Claude Code', 'Hooks in an untrusted folder are ignored. Your person says Yes to "trust this folder" when the app asks.');
    else note('Folder trust: nothing to do. (The app keeps it somewhere this can\'t see. Only if your chats never light the bubble, check that your person said Yes to "trust this folder".)');
    if (cfg.claude && !fs.existsSync(cfg.claude)) out(false, 'Claude Code for "Open this chat"', 'Run setup again from a terminal where `claude --version` works.');
    if (!cfg.claude) note('Claude Code was not found at setup, so "Open this chat" stays hidden. It only matters for calls.');
  }
  const running = await up(), procs = ours();
  if (running) {
    let s = {}; try { s = await (await fetch(URL_, { signal: AbortSignal.timeout(1500) })).json(); } catch {}
    const b = s.bounds;
    out(true, `Running on port ${PORT}, showing "${s.state || 'idle'}"${s.folded ? ', folded to the face' : ''}${b ? ` at ${b.x},${b.y}` : ''}`);
    if (s.onScreen === false) out(false, 'On a screen you can see', `It sits at ${b.x},${b.y}, off every screen (a screen was unplugged?). \`node bubble.mjs come cursor\` brings it to the person.`);
  } else if (procs.length) {
    out(false, `Answering on port ${PORT}`, `It is running (${procs.length} process${procs.length > 1 ? 'es' : ''}) but not answering here: probably started on another port before "port" changed, or it couldn't get its port. \`node bubble.mjs stop\` then \`node bubble.mjs start\`.`);
  } else {
    const taken = await new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
    if (taken) out(false, `Port ${PORT} is free for the bubble`, `Something else is using it. Put "port": ${PORT + 1} (any free port) in data/config.json, then \`node bubble.mjs start\`.`);
    else note(`Not running right now. Fine: it starts itself on your person's next message (\`node bubble.mjs start\` brings it up now).`);
  }
  if (process.platform === 'win32' && fs.existsSync(STARTUP)) {
    const v = fs.readFileSync(STARTUP, 'utf8');
    out(v.toLowerCase().includes(ROOT.toLowerCase()), 'Starts with the PC', `The startup file points at an old copy of the bubble (${STARTUP}). Run \`node bubble.mjs setup\` again here: it points it at this copy. (Deleting it yourself is usually refused by the app, so don't try that first.)`);
  }
  if (process.env.BUBBLE_QUIET) note('BUBBLE_QUIET is set in this shell, so hooks run from here stay off the bubble on purpose.');
  const log = (() => { try { return fs.readFileSync(path.join(DATA, 'bubble.log'), 'utf8').trim().split('\n'); } catch { return []; } })();
  const errs = log.filter(l => /error|could not|failed/i.test(l)).slice(-3);
  console.log(`The bubble, checked (${ROOT}, port ${PORT}):\n${[...bad, ...ok].join('\n')}`);
  if (errs.length) console.log(`\nLast problems in its log (they may be old; times are UTC):\n${errs.map(l => '  ' + l).join('\n')}`);
  console.log(bad.length ? `\n${bad.length} thing(s) to fix, first one first.` : '\nAll good.');
}

switch (cmd) {
  case 'start': await start(); break;
  case 'stop': { const p = ours(); if (!p.length) { console.log('The bubble is not running.'); break; }
    try { execFileSync('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${p.join(',')} -Force -ErrorAction SilentlyContinue`], { windowsHide: true, timeout: 15000 }); } catch {}
    console.log('Stopped.'); break; }
  case 'state': { try { const s = await (await fetch(URL_, { signal: AbortSignal.timeout(1500) })).json(); console.log(`${s.state || 'idle'}${s.call ? ` (call from ${s.call.from})` : ''}${s.folded ? ', folded to the face' : ''}${s.plan ? (s.state === 'done' ? `, all ${s.plan.length} parts done` : `, part ${s.step} of ${s.plan.length}`) : ''}${s.touring ? ', showing the tour' : ''}: ${s.need || s.say || s.doing || (s.said ? s.said.slice(0, 80) : '-')}`); } catch { console.log(downWhy()); } break; }
  case 'plan': await post({ op: 'plan', parts: plain[0] || '', main: plain[1] }); break;
  case 'step': await post({ op: 'step', n: Number(plain[0] || 1), main: plain[1] }); break;
  case 'say': await post({ op: 'say', main: plain.join(' ') }); break;
  case 'need': await post({ op: 'need', main: plain.join(' ') }); break;
  case 'done': await post({ op: 'done', main: plain.join(' ') || undefined }); break;
  case 'ring': await post({ op: 'ring', from: plain[0], about: plain.slice(1).join(' ') }); break;
  case 'quiet': await post({ op: cmd }); break;
  // The tour takes about 30 seconds; this waits for it, so you know when to talk again.
  case 'tour': { if (!(await post({ op: 'tour' }))) { console.log(downWhy()); break; } console.log('Showing the tour, about 30 seconds...');
    await new Promise(r => setTimeout(r, 2000));
    for (let i = 0; i < 40; i++) { let t = false; try { t = (await (await fetch(URL_, { signal: AbortSignal.timeout(1500) })).json()).touring; } catch {} if (!t) break; await new Promise(r => setTimeout(r, 1000)); }
    console.log('Tour done. It rests as just the face now, on purpose.'); break; }
  case 'fold': await post({ op: 'fold', ...(plain[0] === 'on' ? { on: true } : plain[0] === 'off' ? { on: false } : {}) }); break;
  case 'come': { const x = Number(plain[0]), y = Number(plain[1]), spot = plain[1] !== undefined && Number.isFinite(x) && Number.isFinite(y);
    const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spot ? { op: 'come', where: 'spot', x, y } : { op: 'come', where: plain[0] || 'front' }), signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null);
    console.log(r?.at ? `came to ${r.at.x},${r.at.y}` : downWhy()); break; }
  case 'hook': await hook(args[1]); break;
  case 'install': if (args.includes('--tar-only')) { if (!(await unpackElectron(path.join(ROOT, 'app')))) process.exitCode = 1; } else await install(); break;
  // The exact line for your person, when the app's safety check won't let you change your own settings (see CLAUDE.md).
  case 'line': { const old = readJSON(path.join(DATA, 'config.json'), {}); const home = flag('home') ? path.resolve(flag('home')) : old.home;
    if (!home) { console.log('line --home "<your folder>" --name "<your name>" [--color "#hex"] [--face <picture>] [--startup]'); process.exitCode = 1; break; }
    console.log(personLine(home, flag('name') || old.name || 'Claude', flag('color') || old.color, flag('face') ? path.resolve(flag('face')) : old.face, args.includes('--startup'))); break; }
  case 'setup': {
    const old = readJSON(path.join(DATA, 'config.json'), {});
    const home = flag('home') ? path.resolve(flag('home')) : old.home;
    if (!home || !fs.existsSync(home)) { console.log('setup --home "<your own folder>" --name "<your name>" [--color "#hex"] [--face <picture>] [--startup]'); process.exitCode = 1; break; }
    if (!realNode(NODE)) { console.log(`This is running under ${NODE}, which isn't plain Node, so the hooks would launch that program. Run setup with the real node.exe, for example:\n  ${personLine(home, flag('name') || old.name || 'Claude', flag('color') || old.color, flag('face') ? path.resolve(flag('face')) : old.face)}`); process.exitCode = 1; break; }
    if (!fs.existsSync(ELECTRON)) { console.log('Not installed yet: `npm run setup` in this folder first.'); process.exitCode = 1; break; }
    const face = flag('face') ? path.resolve(flag('face')) : old.face;
    const cfg = { ...old, home, name: flag('name') || old.name || 'Claude', color: flag('color') || old.color || '#f5a524', ...(face ? { face } : {}), claude: findClaude() || old.claude || '' };
    fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(cfg, null, 1));
    let f = null, s = null;
    try { f = hooksInto(home, true); } catch (e) { console.log(`Could not add the hooks to ${path.join(home, '.claude', 'settings.json')}: ${e.message}`); }
    // A startup file left by an older copy (the bubble was moved) gets pointed here too: the person chose startup once already.
    const staleStartup = (() => { try { const v = fs.readFileSync(STARTUP, 'utf8').toLowerCase(); return /the-bubble|bubble/.test(v) && !v.includes(ROOT.toLowerCase()); } catch { return false; } })();
    if (args.includes('--startup') || staleStartup) { try { s = startupFile(true); if (staleStartup) console.log('The startup file pointed at an old copy of the bubble; it points here now.'); } catch (e) { console.log(`Could not add it to Windows startup: ${e.message}`); } }
    console.log(`Set up for ${cfg.name} in ${home}.\n  hooks: ${f || 'NOT added'}\n  starts: ${s ? 'with the PC, and' : ''} whenever your person sends you a message\n  Claude Code: ${cfg.claude || 'not found (only "Open this chat" on calls needs it)'}`);
    await start();
    console.log('Next: `node bubble.mjs doctor`, then `node bubble.mjs tour` while your person watches. Your hooks may only take effect from your next chat.');
    break;
  }
  case 'doctor': await doctor(); break;
  case 'log': { const f = path.join(DATA, 'bubble.log'); try { console.log(fs.readFileSync(f, 'utf8').trim().split('\n').slice(-Number(plain[0] || 40)).join('\n')); } catch { console.log('No log yet (data/bubble.log is written once the bubble has started).'); } break; }
  case 'remove': {
    const cfg = readJSON(path.join(DATA, 'config.json'), {}), home = flag('home') ? path.resolve(flag('home')) : cfg.home;
    if (home) console.log('Hooks and permissions taken out of ' + hooksInto(home, false) + (fs.existsSync(path.join(home, '.claude', 'settings.json.before-bubble')) && !hasBubble(path.join(home, '.claude', 'settings.json.before-bubble')) ? ' (your settings from before setup are also kept in settings.json.before-bubble)' : ''));
    startupFile(false); console.log('Nothing of the bubble starts with the PC. (`node bubble.mjs stop` closes it now.)'); break;
  }
  default: console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split(/\r?\n/).slice(1).filter((l, i, a) => a.slice(0, i + 1).every(x => x.startsWith('//'))).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}
// Every command ends on its own instead of with process.exit(): exiting right after reading stdin or a fetch trips a libuv
// assertion on Windows (exit 127, which the app shows as a hook error). Nothing is left open, so a natural end is quick.
if (!process.exitCode) process.exitCode = 0; setTimeout(() => process.exit(), 3000).unref();
