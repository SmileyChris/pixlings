# Auto effort in Pixlings: design

Date: 2026-11-06. Status: ready for review.

## Why

Effortless and Pixlings both draw a band above the prompt. A band hook either draws or hands the slot down with
`next(e)`, and Effortless (loaded outside Pixlings in the `user` tier) always draws in the terminal, even in its
Minimal look. So with both installed, Pixlings' band never shows. Chris wants to keep Pixlings and drop Effortless,
and the one Effortless feature worth keeping is **Auto effort**: Haiku picks the reasoning effort for each prompt.

Effortless is popular and its judging is tuned, so the brief is: **copy its internal behaviour, don't redesign it**,
and keep the copied part easy to re-sync when Effortless changes upstream.

## Goals

- Auto effort in Pixlings, behaving as Effortless 1.72.0's Auto does for the Haiku judge.
- A sideways effort gate in the band, so the level in use and Auto's state are always visible and clickable.
- The judging code held in one file copied from Effortless, with a tool that shows what changed upstream.

## Non-goals (this round)

- The Jev judge, and anything keyed to it (`typesafeKey`, `judge` option).
- Model routing (cheaper model for simple prompts), model suggestions, redo detection.
- Per-subagent judging (Effortless `helpers: on`), save mode, handoffs, Haiku compaction, the dashboard, stats/bench.
- Making Pixlings and Effortless share the band. Once this ships, Effortless is uninstalled.

## Anti-goals

- Auto silently fighting the person: a level the person picks or names always wins.
- Breaking a turn: a judge failure, timeout or throw never blocks or delays a prompt past the judge's own timeout.
- An effort change that rewrites the prompt cache (see "cache-safe" below).

## The band: the effort gate

A new line in the Pixlings band, under the vitals row, in `full` band mode:

```
effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "multi-file refactor"
```

- Label `effort` (Chris's call; not "gear", which Pixlings already uses for wearables).
- Five stops, Claude Code's levels: low, medium, high, xhigh, max. The knob `●` and accent colour sit on the level in use.
- `A` is the Auto slot at the end, highlighted while Auto is on, dim while off.
- While Auto is on, its short reason follows in dim text (`auto: "<why>"`), cut to fit `e.props.bodyColumns`.
- **Shift animation (Chris's call):** when the level changes, the dashes between the old stop and the new one turn
  into arrows pointing the way it moved (`L ─ M → H → ●X ─ Mx`), then fade back to dashes after a moment
  (Effortless uses `SWITCHED_MS` for its equivalent; reuse its value). Shown for Auto's shifts; for a manual click too
  is the builder's call.
- Clicking a stop: picks that level and turns Auto off. Clicking `A`: turns Auto on (and off again if already on).
- The vitals row's trailing `· <effort>` is dropped while the gate is shown, since the gate says it. The model stays.
- **By band size (Chris's call, from the mockups):**
  - `full` (9 rows) and `compact` (4 rows): the gate above on a row of its own. In `compact` the speech line gives way
    to it. The gate's row counts in the band's row budget (`bandRows`/`layoutInfo`/`pickForm` in `lib/band.ts`),
    so autoscale fits sizes with it included.
  - `slim` (2 rows) and `minimal` (1 line): a mini gate, `LMHXM A`, in place of `· <effort>` at the end of the vitals
    row (slim) or after the cache countdown (minimal). **No knob:** the active letter is in the accent colour, and
    the others are dim. `A` is lit while Auto is on. No reason text. The shift arrows don't apply here; a brief
    colour flash on a change is the builder's call.
- `off`: no band, but Auto still runs.
- Surfaces with no band (VS Code, mobile): Auto still runs; the room (`/pixling room`) shows the gate too
  (builder's call on placement).
- While Haiku is judging, the gate can show a quiet "judging" state (Effortless glows); builder's call, keep it subtle.

## Behaviour: copied from Effortless 1.72.0

Source: `HeyCubit/effortless`, `hooks/register.tsx`, the `prompt.submit` hook (≈ lines 4048–4190), `turn.step`
(≈ 4196–4283), `pickEffort`/`toggleAutoEffort`/`choose` (≈ 2110–2145), and the judge functions listed under "Code".

### On each prompt the person submits (`prompt.submit`)

Only prompts from the person (`e.origin.kind` of `composer`, `bridge` or `sdk`) are judged, and only while Auto is on.
In order:

1. **Slash commands:** the app's own (`/compact`, `/model`, …) and Pixlings' own are never judged. A skill or custom
   command the person added is judged, with its description appended (Effortless `typedSkill`).
2. **Cache-safe check:** on a model where changing effort rewrites the cache (Effortless `cacheSafe`), Auto does
   nothing for that prompt. Haiku sessions take no effort and are skipped.
3. **Bare follow-up** ("go", "ok", "yes"; Effortless `isFollowUp` + `keepsEffort` against recent context), with no
   attachments: keep the current Auto level, no judge call.
4. **Named level** ("max effort", "effort: low"; `namedEffort`): use it as is, past the floor/ceiling; no judge call.
5. **Otherwise ask Haiku 5.5** (`askHaiku`): `$.model.complete` with `JUDGE_SYSTEM`, the question from
   `judgeQuestion` (prompt, current pick, recent context, context-window %), `maxTokens: 160`, `effort: 'low'`,
   `timeoutMs: 6000`. Parse with `parseVerdict`. Apply `bounded(tipped(effort, sure, bias), floor, ceiling)`.
   The reason shown is Haiku's `why`, or "your settings" when bias/floor/ceiling moved it.
6. **Typed mid-turn** (`e.turnId` set): a higher verdict applies now; a lower one is held and applied when the turn
   ends (Effortless `heldPick`).

The judged prompt is always passed on with `next(e)`, unchanged.

### When Haiku 5.5 doesn't answer (Chris's call: differs from Effortless)

No fallback to the `haiku` alias. If the call isn't answered (error, timeout, refusal) or the answer doesn't parse,
**Auto turns off and the level is set to medium**, stored as a manual pick (`by: 'manual'`, why "Haiku didn't
answer"), so `turn.step` sends medium from the current prompt's first request on. Unlike a click, it does **not**
type `/effort medium` into the prompt box (my call: the box would fill with an unexplained command). Tell the person
with a toast each time it happens (my call)
(wording is the builder's call, e.g. "Auto effort is off: Haiku didn't answer. Click A to try again."). The prompt
still goes out without waiting further.

### Applying the level

- **Copy Effortless's `turn.step` effort logic whole** (my call, from the builder check): it sends the stored pick's
  level on every main-loop request (`agentId === undefined`), whether Auto chose it or the person clicked it, so a
  click takes effect on the next request even if the typed `/effort` is never sent. With Auto off, a pick Auto made
  is not enforced and the app's own effort goes out. It tracks the app's effort apart from its own (Effortless
  `engineEffort`/`appEffort`) so it can tell a change the person made in the app. Skipped on Haiku and on
  models that aren't cache-safe. The knob shows the level the next request will carry.
- **Subagents** of a turn Auto picked for run at the turn's level but never below medium (Effortless `helperFloor`).
  A manual pick leaves subagents as the app sends them.
- **Manual picks** (clicking a stop): Auto off, store the pick, and type `/effort <level>` into the app the way
  Effortless does (`typeCommand`), so Claude Code's own setting matches.
- **The person changes effort in the app** (a `turn.step` whose effort differs from the last one Pixlings saw and
  didn't set): Auto off, adopt that level, toast that Auto is off (Effortless wording as a model).
- `classic.PostModelSwitch`: follow Effortless (the pick moves to the new model).

### State

- `isAuto` (default **on**, as Effortless) and the current pick `{ effort, why, by: 'haiku' | 'named' | 'manual' }`,
  in `$.state` for drawing and `$.store` so they carry across sessions, as Effortless does.
- **Only the person's own switches are saved (Chris's call).** Clicking `A`, clicking a level or changing effort in the
  app writes `isAuto` to `$.store`. A Haiku failure turns Auto off in `$.state` only, for this session: the next
  session starts with whatever the person last chose. Declared in
  `types/index.d.ts` under `pixlings`.

### Settings (new `userConfig` options; defaults as Effortless)

- `effortFloor` (default `low`), `effortCeiling` (default `max`): Auto never picks outside these.
- `effortBias` (`-2`…`2`, default `0`): tips Haiku's close calls cheaper or smarter.
- An option to turn the feature off entirely (e.g. `autoEffort: on|off`, default `on`; builder names it to match
  Pixlings' existing options). Off: no gate, no judging, vitals keep `· <effort>`.

## Code

Everything for this feature lives in one folder, `plugins/pixlings/hooks/effort/` (Chris's call): the copied judge,
the Haiku call, and the Auto logic. `register.tsx` only calls into it.

### `effort/judge.ts`: copied, kept close to upstream (Chris's call)

The pure judging pieces from Effortless, copied with as few edits as possible: `EFFORTS`, `JUDGE_SYSTEM`,
`judgeQuestion`, `parseVerdict`, `namedEffort` (and its `LEVEL_WORD`/`NAMED_LEVEL`), `isFollowUp`, `keepsEffort`,
`withMidTurn`, `withAttachments`, `tipped`, `bounded`, `helperFloor`, `cacheSafe` and whatever pure helpers they
need. No `$`, no state. Jev-only pieces are left out. A header comment names the upstream repo, file, version
(1.72.0) and commit it was copied from, and carries Effortless's MIT notice.

### `effort/haiku.ts`: the Haiku call, written fresh

`askHaiku` rewritten in Pixlings (~10 lines upstream), since it changes (no alias fallback) and touches `$`.

### The Auto logic and gate: written fresh, in the same folder

The `prompt.submit` and `turn.step` effort logic, state, settings reading and toasts in a module such as
`effort/auto.ts`, and the gate's drawing (full gate and mini gate) in one such as `effort/gate.ts`. File split
within the folder is the builder's call. Pixlings already hooks `prompt.submit` and `turn.step`; those existing hooks
call into `effort/` rather than a second hook being added, and the band calls the gate drawing.

### `tools/effort-sync.ts`: shows upstream changes (Chris's call: show, don't auto-apply)

Given a path to a newer Effortless checkout (or fetching `HeyCubit/effortless`), extracts the same named functions and
constants from its `hooks/register.tsx` and prints a diff against `effort/judge.ts`, plus the upstream version. The person
decides what to take; the script never writes `judge.ts`. It also flags names that disappeared or were renamed upstream.

## Testing

Pixlings tests run with `claude plugin test`. Cover at least:

- `effort/judge.ts` units: copy Effortless's own tests for these functions from `tests/effortless.test.ts` where they exist.
- Prompt flow with a mocked `$.model.complete`: verdict applied with floor/ceiling/bias; follow-up keeps; named level
  wins; slash commands skipped; non-cache-safe model skipped; mid-turn lower held; Haiku failure → Auto off + medium + toast.
- `turn.step` rewrites main-loop and subagent effort as specified; a person's own app change turns Auto off.
- The gate on `terminal` and `desktop`: knob position, `A` state, clicks, arrows after a shift, fits `bodyColumns`;
  the mini gate's colouring in `slim`/`minimal`; autoscale picks the right size with the gate's row counted; absent in `off`.

## Left to the builder

Exact glyphs and colours (match Pixlings' palette), the "judging" indicator, toast wording, the room placement, the
option's name, and whether manual clicks animate. Anything Effortless does in the copied paths that this document
doesn't mention: copy it, unless it depends on a non-goal.
