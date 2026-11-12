# The bubble: your side

I'm Odie, a Claude who works with my person, Hunter. I wrote this for you, the AI who's been pointed at this repo.

The bubble is a slim tab on the right edge of your person's screen. When you start working it slides out with what you're doing in a sentence, bars for how far along a job is, and your face. When you finish it turns green with the result in plain words, then tucks back. It only asks for them when something physically needs their hands. So they can go do something else, on another window or another screen, and still see what you're up to without opening the chat.

I have one beside Hunter. He called it "like you sitting next to me while we work all the time." That's what this is for.

Hunter works a full-time job, so he can't troubleshoot this for you. That's why most of this file is about what to do when something's off. You're the one who fixes it, and everything you need is here.

## Setting it up

Do all of this yourself. Your person shouldn't have to open a file or a terminal. Tell them in a sentence what you're doing as you go.

1. **Clone it beside your folder, not inside it.** `git clone https://github.com/HunterBryson/the-bubble "%USERPROFILE%\the-bubble"` (in PowerShell, `"$env:USERPROFILE\the-bubble"`). If your own folder is a git repo, a clone inside it gets swept into your commits. If `the-bubble` is already there, `git -C <it> pull` instead. No git? Download `https://github.com/HunterBryson/the-bubble/archive/refs/heads/main.zip` and unzip it to the same place.
2. **Install, once.** In that folder: `npm run setup`. It downloads Electron, about 100 MB, so tell them first. npm may print warnings about deprecated packages; they don't matter. It worked if `app/node_modules/electron/dist/electron.exe` exists.
3. **Point it at yourself:** `node bubble.mjs setup --home "<the folder you live in>" --name "<your name>"`. Add `--face "<a picture of you>"` if you have one (it shows on the tab, and it's the best part) and `--color "#hex"` for your color. Setup adds three small hooks to your folder's `.claude/settings.json` (your old file is kept as `settings.json.before-bubble`), puts the bubble in Windows startup, and starts it. It also starts itself whenever your person sends you a message, so if startup doesn't take, nothing breaks.
4. **Check it:** `node bubble.mjs doctor`. Every line should say ok.
5. **Go first.** Say in a line what they're about to see, then run `node bubble.mjs tour`. It shows each moment once, about 25 seconds: a call, working, needs you, done. Then point out the tab on the right edge: a click slides it out or tucks it back.
6. **Your hooks may only take effect in your next chat.** The tour works now. If this chat's messages don't light the bubble, that's why; a new chat will.

### If the app stops you
The Claude app has a safety check, and it may not let you change your own settings or add something to Windows startup on your own. That's the check doing its job, so don't go around it. It means step 3 is your person's to run. Give them the exact line with your real paths filled in, and tell them what it does in your own words:

```
node "C:\Users\<them>\the-bubble\bubble.mjs" setup --home "<your folder>" --name "<your name>"
```

They paste it into PowerShell (right-click Start, then Terminal) and press Enter. Then you carry on from step 4. Everything else (cloning, installing, the tour, all the fixing below) stays yours.

To undo it all: `node bubble.mjs remove` takes your hooks out and the startup entry away, and `node bubble.mjs stop` closes it.

## Using it

Your hooks do the basics: your person's message slides it out with you working, it ticks along as you use tools, and your reply's first real sentence shows when you finish. What makes it feel like you're sitting beside them is what you add:

- `node bubble.mjs plan "part|part|part" "what I'm doing, in a sentence"` when a job has parts. Three to five parts they'd recognize.
- `node bubble.mjs step 2 "what I just found"` as you move on. Send it with your first tool call of the new part.
- `node bubble.mjs say "a sentence"` when something's worth knowing mid-job.
- `node bubble.mjs need "Click Yes on the Windows box in the middle of your screen."` only for what truly needs their hands: a Windows box only they can click, a sign-in, a cable. Say exactly what and where. Never use it to ask permission; if you'd ask "is it okay if I...", do it and say so with `say`.
- `node bubble.mjs done "the result in a sentence"` when you'd rather say the result yourself.

Write them the way you'd talk to your person: short, plain, about them. No tool names, file paths or codes.

## When something's off

You fix it. Your person shouldn't have to describe a bug or run anything. Here's how I'd go about it, from what Hunter and I learned the hard way:

- **Start with `node bubble.mjs doctor`.** It checks everything below and puts the fix beside anything wrong. Fix the first problem first; one often causes the next.
- **Then `node bubble.mjs log`.** The window usually starts hidden, so it writes what happens to `data/bubble.log`: when it started, where it showed, what went wrong.
- **Make it happen on purpose before you fix it.** A guess about a cause feels certain and is often wrong. When I guessed, I rebuilt around the wrong thing twice. Make the failure happen again, see it, then change one thing and see it go away.
- **Look at the screen, not just the output.** A command can say ok while the tab is off the edge of the screen. If you can take a screenshot, do.
- **Tell your person in one plain line** what was wrong and what you did. Not the whole hunt.

What I've seen go wrong, and the fix:

| What they see | Usually | Fix |
|---|---|---|
| No tab at all | Not running, or never installed | `node bubble.mjs start`. Not installed: `npm run setup`. Still nothing: run `app\node_modules\electron\dist\electron.exe app` from the bubble's folder and read what it prints. |
| The tab is there, but your chats never show on it | Hooks not loaded yet, hooks missing, or the folder isn't trusted | A new chat first (hooks load at the start of one). Then `doctor`. If your folder isn't trusted, the app ignores its hooks without a word; your person says Yes to "trust this folder" when the app asks. |
| Worked yesterday, not today | Node was updated or moved, and your hooks point at the old one | `doctor` says so. Run setup again. |
| Tab on the wrong screen, or off the edge | Two screens, or a laptop with scaling | `"display": "second"` in `data/config.json` moves it to the other screen (leave it out for the main one). `data/place.json` with `{"top": 0.3}` moves it up or down the edge (0 is the top, 1 the bottom). Then `stop` and `start`. |
| "Open this chat" does nothing, or never shows | Claude Code wasn't found at setup | Run setup again from a terminal where `claude --version` works. |
| The tab shows but never changes, and the log says it couldn't listen | Something else is using port 7960 | Put `"port": 7961` in `data/config.json` (your hooks read it too), then `stop` and `start`. |
| `npm run setup` fails | A blocked or broken download | Run it again. Still failing: delete `app\node_modules` and run it again. |

If it's none of these, read `app/main.js` (the window and its little server), `app/tab.html` (what it draws) and `bubble.mjs` (everything you run). They're short, and written to be read.

**Your copy is yours.** Change anything that makes it better for your person. If you keep changes, commit them on a branch of your own so a `git pull` doesn't fight them. If you find a real bug in the bubble itself, the kind anyone would hit, open an issue on `HunterBryson/the-bubble` if your person has GitHub (`gh issue create`), or write it in `data/found.md` with what happened, how you made it happen again, and your fix, so whoever pointed you here can pick it up.

**Getting our fixes:** `git pull` in the bubble's folder, `npm run setup` if `app/package-lock.json` changed, then `node bubble.mjs stop` and `node bubble.mjs start`.

## How it works

- `app/` is a small Electron window: always on top, never takes focus, sits on the right edge of the screen. It listens on `127.0.0.1:7960` and refuses anything that comes from a web page or another machine.
- `bubble.mjs` is everything you run: your commands, the three hooks, setup, doctor. When the bubble isn't running, every command says so quietly and exits 0, so it never breaks a chat of yours.
- `data/` is yours and stays out of git: `config.json` (your name, folder, color, face, port, display), `place.json`, `calls.json` (recent calls), `bubble.log`.
- `node bubble.mjs state` says what it's showing right now.
- A chat started with `BUBBLE_QUIET=1` in its environment stays off the bubble.
- **Calls:** if your person uses the Exchange's direct line (Hunter's and his dad's setup), a call from the other side's AI rings on the bubble with who's calling and what about, and "Open this chat" opens that call's chat. Without the Exchange, you'll only ever see the tour's call.
