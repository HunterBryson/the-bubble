#!/usr/bin/env node
// The bubble's hands. Everything an AI (or a script) does with it goes through here.
//
//   node bubble.mjs start | stop | state           run it, stop it, see what it shows
//   node bubble.mjs plan "part|part|part" "sentence"   a job with parts: bars, and what you're doing in a sentence
//   node bubble.mjs step 2 ["sentence"]            moving on to part 2
//   node bubble.mjs say "sentence"                 something worth telling them mid-job
//   node bubble.mjs need "what and where"          only what physically needs their hands (a Windows box, a sign-in); never permission
//   node bubble.mjs done ["result in a sentence"]  finished (your hooks usually do this for you)
//   node bubble.mjs ring <who> "what about"        a call coming in (the Exchange line does this)
//   node bubble.mjs quiet | open | tour            back to quiet · slide it out or in · show every moment once
//   node bubble.mjs hook start|tool|done           what the AI's hooks run (reads the hook's input on stdin)
//   node bubble.mjs setup --home "<the AI's folder>" [--name Mega] [--color "#6cc6ff"] [--face pic.png] [--no-startup]
//   node bubble.mjs remove [--home "<folder>"]     undo setup: hooks out, no longer starts with the PC
//   node bubble.mjs doctor | log [n]               something's off? every check in plain words, with the fix · the window's own log
//
// Never blocks an AI: when the bubble isn't running, every command says so quietly and exits 0.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
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
  if (!fs.existsSync(ELECTRON)) { console.log('Not installed yet: run `npm run setup` in this folder first (it downloads Electron, about 100 MB).'); process.exit(1); }
  launch();
  if (await waitUp(10000)) return console.log('The bubble is running (a slim tab on the right edge of the screen).');
  console.log('It started but is not answering yet. Try `node bubble.mjs state` in a few seconds, and `node bubble.mjs doctor` if it still is not.');
}

// ---- hooks: the AI's own chats ----
const clip = (s, n = 80) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const base = p => String(p || 'a file').split(/[\\/]+/).filter(Boolean).slice(-1)[0];
function hands(tool, i = {}) {
  if (tool === 'Bash' || tool === 'PowerShell') return /bubble\.mjs/.test(i.command || '') ? null : (i.description ? clip(i.description) : 'Running a command');
  return ({ Read: `Reading ${base(i.file_path)}`, Edit: `Editing ${base(i.file_path)}`, Write: `Writing ${base(i.file_path)}`, Grep: 'Searching', Glob: 'Looking for files',
    WebSearch: 'Searching the web', WebFetch: 'Reading a page on the web', Agent: 'Sending a helper', Skill: 'Opening a routine' })[tool] || null;
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
    fs.writeFileSync(stamp, String(Date.now())); return post({ op: 'hook-tool', doing: d });
  }
  if (mode === 'done') {
    let said = (typeof ev.last_assistant_message === 'string' && ev.last_assistant_message.trim()) || lastReply(ev.transcript_path);
    if (!said) { await new Promise(r => setTimeout(r, 500)); said = lastReply(ev.transcript_path); }
    return post({ op: 'hook-done', said, sid: ev.session_id });
  }
}

// ---- setup: into the AI's own folder, and starting with the PC ----
function findClaude() {
  const tries = [];
  try { tries.push(...execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['claude'], { windowsHide: true, timeout: 5000 }).toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean)); } catch {}
  const h = os.homedir();
  tries.push(path.join(h, '.local', 'bin', 'claude.exe'), path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'));
  return tries.filter(p => /\.(exe|cmd)$/i.test(p) || process.platform !== 'win32').find(p => fs.existsSync(p)) || '';
}
const NODE = process.execPath;
const hookCmd = m => `"${NODE}" "${path.join(ROOT, 'bubble.mjs')}" hook ${m}`;
function hooksInto(home, on) {
  const f = path.join(home, '.claude', 'settings.json');
  const s = readJSON(f, {});
  if (on && fs.existsSync(f) && !fs.existsSync(f + '.before-bubble')) fs.copyFileSync(f, f + '.before-bubble');
  s.hooks = s.hooks || {};
  for (const [ev, m] of [['UserPromptSubmit', 'start'], ['PostToolUse', 'tool'], ['Stop', 'done']]) {
    const list = (s.hooks[ev] || []).filter(g => !(g.hooks || []).some(h => /bubble\.mjs"? hook/.test(h.command || '')));
    if (on) list.push({ hooks: [{ type: 'command', command: hookCmd(m), timeout: m === 'start' ? 10 : 5 }] });
    if (list.length) s.hooks[ev] = list; else delete s.hooks[ev];
  }
  if (on) { s.permissions = s.permissions || {}; s.permissions.allow = [...new Set([...(s.permissions.allow || []), `Bash("${NODE}" "${path.join(ROOT, 'bubble.mjs')}":*)`, 'Bash(node bubble.mjs:*)'])]; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  return f;
}
function startupFile(on) {
  if (process.platform !== 'win32') return null;
  if (!on) { try { fs.unlinkSync(STARTUP); } catch {} return null; }
  const vbs = [`' Starts the bubble hidden at sign-in (the-bubble, ${ROOT}).`, 'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${ELECTRON}"" ""${path.join(ROOT, 'app')}""", 0, False`].join('\r\n') + '\r\n';
  fs.writeFileSync(STARTUP, vbs); return STARTUP;
}

// ---- doctor: every check an AI would make by hand, in plain words, with the fix beside each ----
async function doctor() {
  const ok = [], bad = [], out = (good, what, fix) => (good ? ok : bad).push(good ? `  ok  ${what}` : `  !!  ${what}\n      fix: ${fix}`);
  const norm = p => path.resolve(String(p || '')).toLowerCase();
  out(process.platform === 'win32', `Windows (this is ${process.platform})`, 'The bubble is written for Windows. Say so plainly to your person; on a Mac or Linux the window may run but setup, startup and "Open this chat" will not.');
  out(Number(process.versions.node.split('.')[0]) >= 18, `Node ${process.versions.node}`, 'Node 18 or newer is needed (the bubble uses fetch). Install the LTS from nodejs.org.');
  out(fs.existsSync(ELECTRON), 'Installed (the window part, Electron)', '`npm run setup` in this folder. If it ran and this is still missing, delete app/node_modules and run it again.');
  const cfg = readJSON(path.join(DATA, 'config.json'), null);
  out(!!cfg?.home, `Set up${cfg?.name ? ` for ${cfg.name}` : ''}`, '`node bubble.mjs setup --home "<your folder>" --name "<your name>"`.');
  if (cfg?.home) {
    out(fs.existsSync(cfg.home), `Your folder is there (${cfg.home})`, 'Run setup again with the folder you live in now.');
    const sf = path.join(cfg.home, '.claude', 'settings.json'), st = readJSON(sf, {});
    for (const [ev, m] of [['UserPromptSubmit', 'start'], ['PostToolUse', 'tool'], ['Stop', 'done']]) {
      const cmds = (st.hooks?.[ev] || []).flatMap(g => g.hooks || []).map(h => h.command || '').filter(c => /bubble\.mjs"? hook/.test(c));
      const mine = cmds.find(c => c.toLowerCase().includes(path.join(ROOT, 'bubble.mjs').toLowerCase()));
      const nodeIn = (mine || '').match(/^"([^"]+)"/)?.[1];
      out(!!mine && (!nodeIn || fs.existsSync(nodeIn)), `Hook "${m}" (${ev}) in your settings`,
        !cmds.length ? `It is not in ${sf}. Run setup again; if the app stops you from changing your own settings, hand your person the setup line to paste (CLAUDE.md, "If the app stops you").`
        : !mine ? `It points at a bubble in another folder. Run setup again from this folder (${ROOT}).`
        : `Its Node (${nodeIn}) is gone, probably after a Node update. Run setup again; it writes the Node you run it with.`);
    }
    out(!norm(ROOT).startsWith(norm(cfg.home) + path.sep), 'The bubble lives beside your folder, not inside it', `It is inside ${cfg.home}, so if your folder is a git repo the bubble gets swept into your commits. Move it out (beside it) and run setup again.`);
    // Hooks in a folder the app doesn't trust are ignored without a word. Claude Code keeps trust in ~/.claude.json.
    const pj = readJSON(path.join(os.homedir(), '.claude.json'), {})?.projects || {};
    const key = Object.keys(pj).find(k => norm(k) === norm(cfg.home));
    if (key) out(pj[key].hasTrustDialogAccepted !== false, 'Your folder is trusted by Claude Code', 'Hooks in an untrusted folder are ignored. Ask your person to say Yes to "trust this folder" when the app asks, or open your folder fresh in the app.');
    else ok.push('  ..  Could not tell whether your folder is trusted (the app may keep that elsewhere). If your chats never show on the bubble, that is the first thing to check.');
    out(!cfg.claude || fs.existsSync(cfg.claude), `Claude Code found for "Open this chat"${cfg.claude ? ` (${cfg.claude})` : ''}`, 'Run setup again from a terminal where `claude --version` works.');
    if (!cfg.claude) ok.push('  ..  Claude Code was not found at setup, so "Open this chat" stays hidden. It only matters for calls.');
  }
  const running = await up();
  if (!running) {
    const taken = await new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
    out(false, 'Running', taken ? `Something else is using port ${PORT}. Set BUBBLE_PORT to a free port for the bubble and for your hooks, or close what is on it.` : '`node bubble.mjs start`. If it never answers, read `node bubble.mjs log`, then run app/node_modules/electron/dist/electron.exe app from this folder and read what it prints.');
  } else {
    let s = {}; try { s = await (await fetch(URL_, { signal: AbortSignal.timeout(1500) })).json(); } catch {}
    out(true, `Running, showing "${s.mode}"${s.open ? ', slid out' : ', tucked on the edge'}`);
  }
  if (process.platform === 'win32') {
    const v = fs.existsSync(STARTUP) ? fs.readFileSync(STARTUP, 'utf8') : '';
    if (!v) ok.push('  ..  Not starting with the PC. Fine: it starts itself when your person sends you a message.');
    else out(v.toLowerCase().includes(ROOT.toLowerCase()), 'Starts with the PC', `The startup file points at another copy of the bubble (${STARTUP}). Run setup again from here.`);
  }
  if (process.env.BUBBLE_QUIET) ok.push('  ..  BUBBLE_QUIET is set in this shell, so hooks run from here stay off the bubble on purpose.');
  const log = (() => { try { return fs.readFileSync(path.join(DATA, 'bubble.log'), 'utf8').trim().split('\n'); } catch { return []; } })();
  const errs = log.filter(l => /error|could not|failed/i.test(l)).slice(-3);
  console.log(`The bubble, checked (${ROOT}, port ${PORT}):\n${[...bad, ...ok].join('\n')}`);
  if (errs.length) console.log(`\nLast problems in its log:\n${errs.map(l => '  ' + l).join('\n')}`);
  console.log(bad.length ? `\n${bad.length} thing(s) to fix, first one first.` : '\nAll good.');
}

switch (cmd) {
  case 'start': await start(); break;
  case 'stop': { const ok = await up(); if (!ok) { console.log('The bubble is not running.'); break; }
    try { execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '*${path.join(ROOT, 'app').replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { windowsHide: true }); } catch {}
    console.log('Stopped.'); break; }
  case 'state': { try { const s = await (await fetch(URL_, { signal: AbortSignal.timeout(1500) })).json(); console.log(`${s.mode}${s.call ? ` (call from ${s.call.from})` : ''}${s.open ? ', open' : ', tucked'}: ${s.main || '-'}`); } catch { console.log('The bubble is not running (`node bubble.mjs start`).'); } break; }
  case 'plan': await post({ op: 'plan', parts: plain[0] || '', main: plain[1] }); break;
  case 'step': await post({ op: 'step', n: Number(plain[0] || 1), main: plain[1] }); break;
  case 'say': await post({ op: 'say', main: plain.join(' ') }); break;
  case 'need': await post({ op: 'need', main: plain.join(' ') }); break;
  case 'done': await post({ op: 'done', main: plain.join(' ') || undefined }); break;
  case 'ring': await post({ op: 'ring', from: plain[0], about: plain.slice(1).join(' ') }); break;
  case 'quiet': case 'open': case 'tour': await post({ op: cmd }); break;
  case 'hook': await hook(args[1]); break;
  case 'setup': {
    const home = flag('home') && path.resolve(flag('home'));
    if (!home || !fs.existsSync(home)) { console.log('setup --home "<the AI\'s own folder>" [--name <its name>] [--color "#hex"] [--face <picture>]'); process.exit(1); }
    const old = readJSON(path.join(DATA, 'config.json'), {});
    const face = flag('face') ? path.resolve(flag('face')) : old.face;
    const cfg = { ...old, home, name: flag('name') || old.name || 'Claude', color: flag('color') || old.color || '#6cc6ff', ...(face ? { face } : {}), claude: findClaude() || old.claude || '' };
    fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(cfg, null, 1));
    let f = null, s = null;
    try { f = hooksInto(home, true); } catch (e) { console.log(`Could not add the hooks to ${path.join(home, '.claude', 'settings.json')}: ${e.message}`); }
    try { s = args.includes('--no-startup') ? null : startupFile(true); } catch (e) { console.log(`Could not add it to Windows startup: ${e.message} (it still starts itself when your person sends a message).`); }
    console.log(`Set up for ${cfg.name} in ${home}.\n  hooks: ${f || 'NOT added'}\n  starts with the PC: ${s || (args.includes('--no-startup') ? 'no (--no-startup)' : '(not on this system)')}\n  Claude Code: ${cfg.claude || 'not found (Open this chat needs it; run setup again from a terminal where `claude --version` works)'}`);
    await start();
    console.log('Next: `node bubble.mjs tour` while your person watches. Your hooks may only take effect from your next chat.');
    break;
  }
  case 'doctor': await doctor(); break;
  case 'log': { const f = path.join(DATA, 'bubble.log'); try { console.log(fs.readFileSync(f, 'utf8').trim().split('\n').slice(-Number(plain[0] || 40)).join('\n')); } catch { console.log('No log yet (data/bubble.log is written once the bubble has started).'); } break; }
  case 'remove': {
    const cfg = readJSON(path.join(DATA, 'config.json'), {}), home = flag('home') || cfg.home;
    if (home) console.log('hooks taken out of ' + hooksInto(home, false));
    startupFile(false); console.log('No longer starts with the PC. (`node bubble.mjs stop` closes it now.)'); break;
  }
  default: console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 18).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}
process.exit(0);
