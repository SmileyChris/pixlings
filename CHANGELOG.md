# Changelog

## Unreleased

### New

- **Band sizes.** `band` takes `compact` (4 rows) and `slim` (2 rows) alongside `full` and `minimal`. Where the terminal draws images (kitty, Ghostty, iTerm2 3.5+ fullscreen), `compact`, `slim` and `minimal` draw the pixling as a sharp picture. Elsewhere `compact` is drawn as `full` and `slim` as `minimal`. A band with fewer rows than its size steps down a size instead of jumping straight to one line.
- **Calm.** Turn `calm` on and the pixling holds still while idle, working or asleep, still hopping, shaking and celebrating when something happens; it rests 30–90 s between strolls instead of 4–12 s; and the cache counts down in minutes (`⏳ cache 4m`) instead of seconds.

### Changed

- The full band still grows to fit its speech, but when it would need more rows than there is room for, it cuts the speech instead of folding to one line. `compact` and `slim` talk from their bottom row up, in lines with a bar on their right: the speech takes the vitals' rows, the name and XP share one row above it, and the band grows up only once the speech needs more rows than the picture has, up to the same limit. `minimal` wraps its speech under the start of the line.

## 0.3.0

### New

- **Bring back your Buddy.** `/pixling adopt` reads the companion Claude Code's retired `/buddy` left in `~/.claude.json` and adopts its name, personality and hatch date (the days together count from it). Only those three fields are kept, and Pixlings sends them nowhere itself; but the reply names your Buddy and its personality, and like any command's output it is part of the conversation Claude reads. With `quips: haiku`, the personality is part of each quip's request. `/pixling adopt <species>` changes its body too. `/buddy`, `/buddy pet`, `/buddy off` and `/buddy on` work as aliases.
- **Personalities.** Every pixling hatches with a one-line personality, written from templates (no model call). Old saves get one too, the same every session.
- **Six new species:** capybara, turtle, snail, penguin, goose and rabbit, fifteen in all. Each tier is now rarer than the one below it.
- **The subagent squad.** Every subagent Claude starts gets a small helper beside the pixling, tinted by agent type and carrying that agent's tools. When it finishes it jumps for joy and goes.
- **The cache guard.** Before a `/model` switch throws away a warm prompt cache that would cost more than about $0.25 to write again on the new model, the pixling asks (`cacheGuard`, on by default). It asks only about a switch you make with `/model`, the `/config` row or the model picker, never one made through the SDK, Remote Control or an IDE.
- **A model switch names the cache lifetime.** The countdown stops guessing after a `/model` switch.
- **More reactions.** Squished under a press during compaction and springing back after; sweating once the context passes 85%; a thinking cap in plan mode.
- **More vitals.** How much of a rate-limit window the last turn used (`turn +2%`), and the model and effort (`opus 5.5 · high`).
- **The room.** `/pixling room` opens a pane with the pixling, its stats, a garden of the species found and a badge shelf. It works in the terminal, the desktop app, VS Code and the mobile app, so the pixling is no longer terminal- and desktop-only.
- **A hover card.** Hover over the band for the personality, streak, badges, days together and the tics it has heard. The streak's flame and the badges you've earned are drawn in pixels, like the pixling itself.
- **Away mode.** `/pixling off` sends it away (no band, sound, voice, notifications or auto-continue; stats still count) until `/pixling on`, across sessions.
- **AI quips, opt-in.** With `quips: haiku`, red tests, API errors, big edits and saying its name now and then get a one-liner from Claude Haiku: at most one a minute, about a hundred tokens each, the cost shown beside the line. The request holds the pixling's name, species, personality and what happened in numbers, never code, prompts or files. Off by default.
- **Heckle, opt-in.** With `heckle` on, a faint `(¬_¬) #N` appears under Claude's "You're absolutely right". Only the drawing changes; the conversation is untouched.

### Fixed

- After `/clear` or a resume, a nap no longer sends "continue" into the new conversation; a nap older than six hours announces the reset instead of continuing, and retries without a reset time are quiet and stop after three.
- Two sessions open at once no longer overwrite each other's save; their changes are merged.
- Typing free text into the release dialog no longer releases the pixling; only the exact choice does.
- A save that can't be read is backed up and never overwritten; the session runs on a stand-in.
- `claude -p` and SDK runs that nothing shows hatch no egg and make no sound, voice or notification; once a surface attaches, as VS Code and the desktop app do, the pixling wakes.
- After `/clear`, the context reading starts over with the new conversation.
- Linux: a line that starts with a dash is spoken, not taken for an option of `espeak` or `spd-say`.
- Risky commands are read the way a shell reads them: quoted text, heredocs and commit messages no longer trigger the alarm, and spellings like `rm -Rf`, `rm -r --force` and `DELETE FROM schema.table` are caught. A commit that is only mentioned (`echo "git commit"`) no longer counts, and a line that commits and then tests counts both.
- The hour-long cache lifetime is learned only from two near-full hits after long pauses, unlearned by a full miss, and expires from the save after two weeks.
- The cache warning fires even when the band or the vitals are off.
- "Apologies for the confusion" is heard; "a good point to add logging" is not praise.
- A message from Remote Control cancels the nap's auto-continue, as typing does.
- The weekly limit's reset shows its day.
- The band folds into one line when it would be taller than the space it is given.
- Windows: PowerShell no longer asks to bypass the execution policy, and speech reads UTF-8.
- On the share card, the Exterminator bug shows its antennae and the bomb no longer fades into the dark background.

### Changed

- Badges, the streak and the tic counts now stay when you hatch a new egg.
- The README no longer claims the band shows in VS Code: it shows in the terminal and the desktop app; the room shows everywhere.

## 0.2.0

The vitals row (prompt cache countdown and hit rate, context, rate-limit windows), the cache warning and cold-start count, tics and the eye roll, 16 badges, the daily streak and morning recap, `/pixling share` trading cards, roaming, and the animalese voice.

## 0.1.0

The first egg: nine species, moods and reactions, cross-platform sound and notifications, the rate-limit nap with auto-continue, levels and wearables.
