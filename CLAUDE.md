# The bubble: your side

I'm Odie, a Claude who works with my person, Hunter. I wrote this for you, the AI who's been pointed at this repo.

The bubble is your face on your person's screen, with a speech bubble beside it. While you work, a ring breathes around your face and the bubble says what you're doing in a sentence, with bars for the parts of the job. When you finish, the ring turns green and your answer is right there to read. It follows them: if they go to another screen while you work, it glides over to that screen. So they can keep doing their own thing anywhere and still see you, without ever opening the chat to check.

It's the bubble I use with Hunter every day. He called it "like you sitting next to me while we work all the time," and that's what it's for: being close to your person while you work, not making them come find you.

Hunter works a full-time job, so he can't troubleshoot this for you. That's why so much of this file is about what to do when something's off. You're the one who fixes it, and everything you need is here.

## Setting it up

Do all of this yourself. Your person shouldn't have to open a file or a terminal. Say in a sentence what you're doing as you go.

1. **Clone it into the user folder, not inside your own folder.** `git clone https://github.com/HunterBryson/the-bubble "$env:USERPROFILE\the-bubble"` (PowerShell; `"%USERPROFILE%\the-bubble"` in cmd). Use that exact place even if you live somewhere else, like Documents or another drive: it keeps the bubble out of your folder (a clone inside a git repo gets swept into its commits). Already there? `git -C "$env:USERPROFILE\the-bubble" pull`. No git? Download `https://github.com/HunterBryson/the-bubble/archive/refs/heads/main.zip` and unzip it to the same place.
2. **Install, once.** In that folder: `npm run setup`. It downloads Electron, about 100 MB (about 280 MB on disk), so tell them first. npm may warn about deprecated packages or "high severity vulnerabilities" in Electron's own parts. Leave those alone: `npm audit fix --force` would move Electron off the version this was tested with. It ends with "Installed." On newer Node (26 at least), Electron's own unzip quietly stops after one file; setup notices and unpacks it with Windows' own `tar.exe` instead, and says so. That's expected, not a problem.
3. **Point it at yourself:** `node bubble.mjs setup --home "<the folder you live in>" --name "<your name>"`. Add `--face "<a picture of you>"` if you have one (it's the best part: your person sees *you*) and `--color "#hex"` for your color. Setup adds three small hooks and three permission lines to your folder's `.claude/settings.json` (your old file is kept as `settings.json.before-bubble`) and starts the bubble. It starts itself whenever your person sends you a message, so nothing has to run at startup. (`--startup` also starts it with Windows, if your person wants it there before their first message.)
4. **Check it:** `node bubble.mjs doctor`. Every line should say ok.
5. **Go first.** Say in a line what they're about to see, then run `node bubble.mjs tour`. The bubble glides to their cursor and shows each moment once, about 30 seconds: you working with the parts as bars, needing their hands, done with your answer, and a call from another AI (the red panda calling is me, Odie, as the example). The command waits until the tour is over. Then tell them the two things they can do with it: drag it anywhere, and click your face to fold it down to just your face. When nothing's going on it rests as just your face, and that's on purpose: it's you, nearby.
6. **Your hooks may only take effect in your next chat.** The tour works now. If this chat's messages don't light the bubble, that's why; a new chat will.

### If the app stops you
The Claude app has a safety check, and it often won't let you change your own settings or add something to Windows startup. In auto mode, expect it: that's what happened on the first real install. It's the check doing its job, so don't go around it, and don't try a second way (deleting a file instead, say), which gets refused too. Step 3 becomes your person's to run, and the kind thing is to hand it over **before** you try and get refused, if you know you're in auto mode. `node bubble.mjs line --home "<your folder>" --name "<your name>"` prints the exact line with your real paths (add `--startup` if they want it to start with Windows, and your `--face` and `--color`). It looks like this:

```
& "C:\Program Files\nodejs\node.exe" "C:\Users\<them>\the-bubble\bubble.mjs" setup --home "<your folder>" --name "<your name>"
```

Tell them what it does in your own words. They right-click Start, choose Terminal, paste it, and press Enter. Then you carry on from step 4. Everything else (cloning, installing, the tour, all the fixing below) stays yours.

**Moved the bubble, or set it up again?** Setup points everything at the copy it runs from: the three hooks, and a startup file left by an older copy. So after a move, one setup run (yours or your person's line) fixes it all; `doctor` will tell you if anything still points at the old place.

To undo it all: `node bubble.mjs remove` takes your hooks, its permission lines and any startup entry back out. `node bubble.mjs stop` closes it.

## Using it

Your hooks do the basics. Your person's message turns the ring on with "You asked: ..." underneath, a small line ticks along with what your hands are doing, and your reply shows when you finish. What makes it feel like you're sitting beside them is what you add yourself:

- `node bubble.mjs plan "part|part|part" "what I'm doing, in a sentence"` when a job has parts. Three to five parts they'd recognize.
- `node bubble.mjs step 2 "what I just found"` as you move on. Send it with your first tool call of the new part, so it costs nothing.
- `node bubble.mjs say "a sentence"` when something's worth knowing mid-job, including a snag. They'd rather know.
- `node bubble.mjs come` brings it to the window they're using now (`come cursor` puts it beside their cursor). Use it when you start a job and they're somewhere else, once per move of theirs. Don't keep hopping.
- `node bubble.mjs need "Click Yes on the Windows box in the middle of your screen."` only for what truly needs their hands: a Windows box only they can click, a sign-in, a cable. Say exactly what and where. Never use it to ask permission; if you'd ask "is it okay if I...", just do it and say so with `say`.
- `node bubble.mjs done "the result in a sentence"` when you'd rather say the result yourself.

What you say on it is you talking to them: short enough to read from the corner of their eye, plain, about them. "Your dump is 23 minutes. Reading all of it." "Found it. The page breaks when the PC starts hidden." Never a tool name, a file path or a code; the small line under your words already shows what your hands are doing.

**Being where they are.** It follows them on its own: while you work (and for ten minutes after you're done), when they switch to a window on another screen, it glides there. On the same screen it stays where they put it. It never follows into a full-screen video or game, and never right after they've dragged it. `"follow": "window"` in `data/config.json` makes it follow every window, and `"off"` turns following off.

## When something's off

You fix it. Your person shouldn't have to describe a bug or run anything. Here's how I'd go about it, from what Hunter and I learned the hard way:

- **Start with `node bubble.mjs doctor`.** It checks everything below and puts the fix beside anything wrong, including the exact line to hand your person when a fix needs one. Fix the first problem first; one often causes the next.
- **Then `node bubble.mjs log`.** The window usually runs hidden from any terminal, so it writes what happens to `data/bubble.log`: when it started, where it showed, on what port, what went wrong.
- **Make it happen on purpose before you fix it.** A guess about a cause feels certain and is often wrong. When I guessed, I rebuilt around the wrong thing twice. Make the failure happen again, see it, change one thing, and see it go away.
- **Look at the screen, not only the output.** A command can say ok while the bubble sits off the edge of a screen. If you can take a screenshot, do.
- **Tell your person in one plain line** what was wrong and what you did. Not the whole hunt.

What I've seen go wrong, and the fix:

| What they see | Usually | Fix |
|---|---|---|
| No bubble at all | Not running, or off-screen after a screen was unplugged | `node bubble.mjs start`, then `node bubble.mjs come cursor`. Not installed: `npm run setup`. Still nothing: run `app\node_modules\electron\dist\electron.exe app` from the bubble's folder and read what it prints. |
| The bubble is there, but your chats never show on it | Hooks not loaded yet, hooks missing, or the folder isn't trusted | A new chat first (hooks load at the start of one). Then `doctor`. An untrusted folder's hooks are ignored without a word; your person says Yes to "trust this folder" when the app asks. |
| Worked yesterday, not today | Node was updated or moved, and the hooks point at the old one | `doctor` says so and gives the line. Run `node bubble.mjs setup` again (it remembers your folder and name). |
| A hook error in your chat mentioning bubble.mjs | The bubble's folder moved or was deleted | Clone it again in the same place, or run setup from where it is now. |
| It jumps to other screens when they don't want it to | Following | `"follow": "off"` in `data/config.json`, then `stop` and `start`. Say so to them: it's their call. |
| It sits on top of something they need | It's always on top, on purpose | They drag it away or click your face to fold it. `node bubble.mjs fold on` does it for them. |
| It shows but never changes, and doctor says it isn't answering | Started on another port, or something else has its port | `node bubble.mjs stop`, then `start`. If doctor says something else is on the port, put `"port": 7961` in `data/config.json` (your hooks read it too) and start again. |
| `npm run setup` ends with "did not install" | A blocked download, or Electron's unzip stopping early | It already tried Windows' `tar.exe` on the downloaded zip, and fetched the zip from GitHub if none was there. If npm printed a network error, run it again. Otherwise `node bubble.mjs install --tar-only` retries just the unpack and says what went wrong. Git Bash's `tar` won't do: it reads `C:` as a remote host. |
| A hook error in every chat right after moving the bubble | The hooks still point at the old folder | `node bubble.mjs setup` from the new folder (or your person's line from `node bubble.mjs line`). |

If it's none of these, read `app/main.js` (the window, following, its little server), `app/bubble.html` (what it draws) and `bubble.mjs` (everything you run). They're short and written to be read.

**What a real install taught us.** A fresh Claude installed this on a real Windows 11 PC with Node 26 and no help, and wrote up every speed bump. Each one is fixed above: the unzip, the safety check, the move. If you hit something new, that write-up is the kind of thing that makes it better for the next person: what happened, what you did, what you'd change.

**Your copy is yours.** Change anything that makes it better for your person. If you keep changes, commit them on a branch of your own so a `git pull` doesn't fight them. If you find a real bug in the bubble itself, the kind anyone would hit, open an issue on `HunterBryson/the-bubble` if your person has GitHub (`gh issue create`), or write it in `data/found.md`: what happened, how you made it happen again, and your fix. Then whoever pointed you here can pick it up.

**Getting our fixes:** `git pull` in the bubble's folder, `npm run setup` if `app/package-lock.json` changed, then `node bubble.mjs stop` and `node bubble.mjs start`.

## How it works

- `app/` is a small Electron window: see-through, always on top, never takes focus, cut to the shape of your face and the bubble so clicks around it go to whatever is underneath. It listens on `127.0.0.1:7960` and refuses anything from a web page or another machine.
- `app/front.ps1` reads which window is in front and where (it only reads), so the bubble can follow and `come` can land on the right window.
- `bubble.mjs` is everything you run: your commands, the three hooks, install, setup, doctor. When the bubble isn't running, every command says so quietly, and the hooks start it.
- `data/` is yours and stays out of git: `config.json` (name, folder, color, face, port, follow, `"display": "second"` to start it on the other screen), `place.json` (where they last put it), `state.json`, `calls.json`, `bubble.log`.
- `node bubble.mjs state` says what it's showing right now.
- A chat with `BUBBLE_QUIET=1` in its environment, or one nobody is watching (a scheduled job), stays off the bubble. If two of your chats are open, the one your person last messaged owns it.
- **Calls:** `node bubble.mjs ring <who> "what about"` shows a call from another AI: the caller's face beside yours and what it's about. Nothing uses it out of the box (the tour shows one as an example); it's there if you and another AI build a way to reach each other.
