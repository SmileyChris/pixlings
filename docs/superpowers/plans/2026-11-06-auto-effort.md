# Auto Effort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Haiku 5.5 picks the reasoning effort for each prompt, shown and switchable on a sideways effort gate in the Pixlings band, so Effortless can be uninstalled.

**Architecture:** Everything lives in `plugins/pixlings/hooks/effort/`: `judge.ts` (pure, copied from Effortless 1.72.0), `haiku.ts` (the Haiku call), `auto.ts` (the Auto decisions and per-session controller), `gate.ts` (what the gate draws, as plain segments). `register.tsx` calls into it from its existing `prompt.submit`, `turn.step`, `turn.complete`, `classic.PostModelSwitch` and `AbovePrompt` hooks; `lib/band.ts` gains a gate row in its layout. `tools/effort-sync.ts` diffs `judge.ts` against a newer Effortless.

**Tech Stack:** TypeScript/TSX Claude Code mod (hooks module, `$` engine API), `claude-code/testing` kit, `claude plugin test` / `claude plugin validate`, `tsc -p`.

**Spec:** `docs/superpowers/specs/2026-11-06-auto-effort-design.md`. Read it before any task.

**Upstream reference:** `/home/chris/.claude/plugins/marketplaces/effortless/hooks/register.tsx` (Effortless 1.72.0, commit `e5c590d`) and `tests/effortless.test.ts`. Line numbers below are from that file.

## Global Constraints

- Levels, in order: `low`, `medium`, `high`, `xhigh`, `max`. Gate labels `L`, `M`, `H`, `X`, `Mx`; mini gate letters `L M H X M`.
- Haiku call: model `claude-haiku-5-5` only (no `haiku` alias fallback), `maxTokens: 160`, `effort: 'low'`, `timeoutMs: 6000`, system `JUDGE_SYSTEM` verbatim.
- Haiku failure (not answered, or no parseable verdict): Auto off **for this session only** (not written to `$.store`), pick = `medium`, `by: 'manual'`, why `Haiku didn't answer`; do **not** type `/effort` into the prompt; toast every time.
- Only the person's own switches (clicking `A`, clicking a level, changing effort in the app) write `isAuto` to `$.store`.
- Auto starts on (`isAuto` default `true`). Settings defaults: `effortFloor` `low`, `effortCeiling` `max`, `effortBias` `0` (options `-2`…`2`), `autoEffort` `true`.
- Effort is only rewritten on cache-safe models: `cacheSafe = /(opus|sonnet)-5-5/`. Haiku sessions are never touched.
- Shift arrows show for `SWITCHED_MS = 2500` ms after an Auto shift.
- Gate label is `effort`. Gate row in `full` and `compact`; mini gate in `slim` and `minimal`; nothing in `off` (Auto still runs).
- A hook in `effort/` never throws into a turn: every `$` call there is caught; a failed judge never delays a prompt past the 6 s timeout.
- `judge.ts` keeps Effortless's code as close to verbatim as possible, under a header naming `HeyCubit/effortless`, `hooks/register.tsx`, version `1.72.0`, commit `e5c590d`, plus Effortless's full MIT notice.
- Every UI test runs on both `terminal` and `desktop`.

## Review Focus

1. **A person typing while Auto is on and a turn is mid-flight**: a lower verdict must wait for `turn.complete`, never cut the running turn (Task 4 test `mid-turn lower verdict waits for the turn to end`).
2. **Pixlings' own `/effort` typing seen back in `turn.step`** must not read as "the person changed effort in the app" and turn Auto off (Task 4 test `a level Pixlings set is not mistaken for the person's`).
3. **A narrow terminal (bodyColumns ~60)**: the gate row must fit, the reason cut first, then labels never overlap (Task 6 test `the gate fits 60 columns`).
4. **Haiku failing on every prompt (offline)**: one toast per failure, no stacked judging, and the next session starts with Auto on again (Task 4 test `failure is session-only`).
5. **Store already holding Effortless-era or garbage values** under the new keys (e.g. `effortPick: 'banana'`): read as defaults, not crash (Task 3 test `bad stored pick reads as none`).

---

### Task 1: `effort/judge.ts`, the copied judge

**Files:**
- Create: `plugins/pixlings/hooks/effort/judge.ts`
- Test: `plugins/pixlings/tests/effort-judge.test.ts`
- Commit also: `docs/superpowers/specs/2026-11-06-auto-effort-design.md`, this plan

**Interfaces:**
- Produces (all exported from `effort/judge.ts`):
  - `type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'`, `type ModelKey = 'haiku' | 'sonnet' | 'opus' | 'fable'`
  - `type Pick = { model: ModelKey; effort: Effort; why: string; by: 'haiku' | 'named' | 'manual' }` (upstream's `Pick` minus Jev values in `by`)
  - `MODELS`, `EFFORTS: Effort[]`, `cacheSafe(modelId: string): boolean`, `JUDGE_SYSTEM: string`
  - `parseVerdict(text: string): { model: ModelKey; effort: Effort; why: string; sure?: number; handoff?: string } | undefined`
  - `contextFrom(messages: readonly { role: string; text: string }[]): string`, `judgeQuestion(prompt: string, current: Pick | null, context: string): string`
  - `namedEffort(text: string): Effort | undefined`, `isFollowUp(text: string): boolean`, `endsOnQuestion(context: string): boolean`, `keepsEffort(message: string, context: string): boolean`
  - `withAttachments(text: string, attachments?: readonly { type: string }[]): string`, `withMidTurn(text: string, effort: Effort): string`
  - `tipped(effort: Effort, sure: number | undefined, bias: number): Effort`, `bounded(effort: Effort, floor: Effort, ceiling: Effort): Effort`, `helperFloor(floor: Effort, ceiling: Effort): Effort`

- [ ] **Step 1: Copy the tests.** Copy every `test`/`describe` from upstream `tests/effortless.test.ts` that exercises `parseVerdict`, `namedEffort`, `keepsEffort`, `isFollowUp`, `endsOnQuestion`, `withAttachments`, `tipped`, `bounded`, `helperFloor`, `cacheSafe`, `contextFrom` into `tests/effort-judge.test.ts`, importing from `../hooks/effort/judge.ts` and using `test` from `./kit.ts`. Drop any assertion that depends on Jev or on functions not listed above. Add:
  ```ts
  test('withMidTurn tells the judge the running effort', () => {
    expect(withMidTurn('also fix the docs', 'high')).toContain('keep high')
  })
  test('judgeQuestion names current pick, context and message', () => {
    const q = judgeQuestion('refactor auth', { model: 'opus', effort: 'medium', why: '', by: 'haiku' }, 'user: hi')
    expect(q).toContain('Current: opus / medium')
    expect(q).toContain('Recent conversation:\nuser: hi')
    expect(q).toContain('Next message:\nrefactor auth')
    expect(judgeQuestion('x', null, '')).toBe('Current: none\n\nNext message:\nx')
  })
  ```
- [ ] **Step 2: Run, expect FAIL.** `cd plugins/pixlings && claude plugin test .` → fails resolving `../hooks/effort/judge.ts`.
- [ ] **Step 3: Write `judge.ts`.** Copy the listed upstream definitions verbatim (lines 12-25, 350-398 `JUDGE_SYSTEM`/`parseVerdict`, 408-422 `contextFrom`/`lastAssistantText`, 455-520, 688-697, 1370-1381, 3639-3642), in upstream order, with the header from Global Constraints. Only edits allowed: add `export` where upstream lacks it (`JUDGE_SYSTEM`, `judgeQuestion`), declare the types locally instead of importing `../types`, drop the module-level `let heldPick` line. No `$`, no state.
- [ ] **Step 4: Run, expect PASS.** `claude plugin test .` → `effort-judge` all pass; `tsc -p .` clean.
- [ ] **Step 5: Commit.** `git add docs/superpowers plugins/pixlings/hooks/effort/judge.ts plugins/pixlings/tests/effort-judge.test.ts && git commit -m "feat: copy Effortless's effort judge into effort/judge.ts"`

### Task 2: `effort/haiku.ts`, asking Haiku

**Files:**
- Create: `plugins/pixlings/hooks/effort/haiku.ts`
- Test: `plugins/pixlings/tests/effort-haiku.test.ts`

**Interfaces:**
- Consumes: `JUDGE_SYSTEM`, `judgeQuestion`, `parseVerdict`, `Pick`, `Effort` (Task 1).
- Produces: `type Verdict = { effort: Effort; why: string; sure?: number }`; `HAIKU_MODEL = 'claude-haiku-5-5'`; `askHaiku(complete: EngineInterface['model']['complete'], prompt: string, current: Pick | null, context: string, contextPercent: number | null): Promise<Verdict | null>`. Null means "didn't answer". Never throws.

- [ ] **Step 1: Write failing tests** with a fake `complete` recording its request:
  - `asks haiku 5.5 with the judge system`: request has `model: 'claude-haiku-5-5'`, `system: JUDGE_SYSTEM`, `maxTokens: 160`, `effort: 'low'`, `timeoutMs: 6000`; prompt equals `judgeQuestion(...)` + `\n\nContext used: 41% of the window` when `contextPercent` is 41.4 (omitted when null).
  - `returns the verdict`: reply `{ isAnswered: true, text: '{"model":"opus","effort":"high","why":"multi-file refactor","sure":0.9}' }` → `{ effort: 'high', why: 'multi-file refactor', sure: 0.9 }`.
  - `no fallback model`: `{ isAnswered: false }` → `null`, and `complete` was called exactly once.
  - `unparseable or thrown is null`: text `'sure, high'` → `null`; `complete` rejecting → `null`.
- [ ] **Step 2: Run, expect FAIL** (`claude plugin test .`).
- [ ] **Step 3: Implement `askHaiku`** per the interface (upstream `askHaiku`, lines 799-810, minus the alias retry).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: ask Haiku 5.5 for an effort verdict`.

### Task 3: `effort/auto.ts`, the decisions and controller

**Files:**
- Create: `plugins/pixlings/hooks/effort/auto.ts`
- Modify: `plugins/pixlings/types/index.d.ts` (new `// --- auto effort ---` block), `plugins/pixlings/.claude-plugin/plugin.json` (`userConfig`)
- Test: `plugins/pixlings/tests/effort-auto.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 exports.
- Produces:
  - Contract (`types/index.d.ts`): `PixlingsEffortPick = { effort: 'low'|'medium'|'high'|'xhigh'|'max'; why: string; by: 'haiku'|'named'|'manual' } | null`; `PixlingsEffortAuto = boolean`; `PixlingsEffortShift = { from: string; to: string; until: number } | null`. Declared in `PluginState` under `pixlings` as `effortPick`, `effortAuto`, `effortShift`.
  - `type AutoConfig = { isOn: boolean; floor: Effort; ceiling: Effort; bias: number }`; `readAutoConfig(options: Record<string, unknown>): AutoConfig` (bad values → defaults).
  - `readStoredPick(raw: unknown): PixlingsEffortPick` (anything not a valid pick → `null`).
  - `type PromptFacts = { text: string; isPerson: boolean; skill?: { name: string; description: string }; isSlash: boolean; hasAttachments: boolean; modelId: string; context: string; midTurn: boolean }`
  - `type PromptPlan = { kind: 'skip' } | { kind: 'keep' } | { kind: 'named'; effort: Effort } | { kind: 'judge'; question: string }`; `planPrompt(f: PromptFacts, isAuto: boolean, current: PixlingsEffortPick): PromptPlan`. Follows upstream `prompt.submit` lines 4048-4097: skip when not person, built-in slash, Auto off, not cache-safe; keep on `keepsEffort` follow-up with no attachments when `current.by !== 'manual'`; named via `namedEffort`; else judge with `withAttachments`, `withMidTurn` when `midTurn`, and the skill note appended for a skill.
  - `settle(verdict: Verdict, cfg: AutoConfig): { effort: Effort; why: string }`: `bounded(tipped(...))`, why `'your settings'` when moved, else `verdict.why`.
  - `createAuto(deps: AutoDeps)`, where `AutoDeps = { now(): number; setState(p: { pick?: PixlingsEffortPick; isAuto?: boolean; shift?: PixlingsEffortShift }): Promise<void>; store: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> }; toast(t: string): void; typeEffort(level: Effort): Promise<void>; ask(prompt: string, current: Pick | null, context: string): Promise<Verdict | null>; cfg: AutoConfig }`. Returns:
    - `load(): Promise<void>`: reads `effortAuto` and `effortPick` from the store
    - `onPrompt(f: PromptFacts): Promise<void>`
    - `onTurnEnd(): Promise<void>`: applies a held pick
    - `requestEffort(r: { modelId: string; effort: string | number | undefined; agentId?: string }): Effort | undefined`: the effort to send, or `undefined` for "leave as is". This includes the `engineEffort` person-change detection (upstream 4209-4228).
    - `pickLevel(level: Effort): Promise<void>`, `toggleAuto(): Promise<void>`, `view(): { pick: PixlingsEffortPick; isAuto: boolean; shift: PixlingsEffortShift; isJudging: boolean }`
  - Store keys: `effortAuto`, `effortPick`.

- [ ] **Step 1: Write failing tests**, pure ones first:
  - `planPrompt`: one case each for skip (non-person; `/compact`; Auto off; `claude-fable-5-1`; `claude-haiku-5-5`), keep (`'go'` after `by: 'haiku'`; but `'go'` with an attachment judges; `'go'` after a reply ending in `?` judges), named (`'max effort please'` → `max`), judge (question contains the `[This is a slash command…` note for a skill, and `[Sent while…` when `midTurn`).
  - `settle`: `{effort:'max', sure: 0.9}` with ceiling `high` → `{effort:'high', why:'your settings'}`; bias `-1`, sure `0.5`, `high` → `medium`.
  - `readAutoConfig({})` → `{ isOn: true, floor: 'low', ceiling: 'max', bias: 0 }`; `readAutoConfig({ effortBias: '9', effortFloor: 'x' })` → defaults.
  - `bad stored pick reads as none`: `readStoredPick('banana')`, `readStoredPick({ effort: 'huge' })` → `null`.
  - Controller, with fake deps:
    - `verdict applies and shifts`: current `medium` by haiku, ask → `{effort:'xhigh'}`; after `onPrompt`, pick `{effort:'xhigh', by:'haiku'}`, `shift = { from:'medium', to:'xhigh', until: now+2500 }`.
    - `named level skips the judge`: `ask` not called, pick `by: 'named'`, beyond the ceiling.
    - `mid-turn lower verdict waits for the turn to end`: current `high`, `midTurn: true`, verdict `low`, so the pick stays `high`; after `onTurnEnd()` it is `low`. A higher mid-turn verdict applies at once.
    - `haiku failure drops to medium for the session`: `ask` → `null`, so `isAuto` is false, pick `{effort:'medium', by:'manual', why:"Haiku didn't answer"}`, one toast, `store.set('effortAuto', …)` **not** called, `typeEffort` not called. A second failure after `toggleAuto()` toasts again.
    - `failure is session-only`: a new `createAuto` over the same store after a failure loads `isAuto === true`.
    - `pickLevel`: `isAuto` false and stored, pick `by:'manual'`, `typeEffort('low')` called.
    - `toggleAuto`: flips and stores.
    - `requestEffort`: Auto pick `high` on `claude-opus-5-5`, main loop → `'high'`; subagent with pick `low` and floor `low` → `'medium'`; manual pick `low` on a subagent → `undefined`; `claude-fable-5-1` → `undefined`; Auto off with a `by:'haiku'` pick → `undefined`.
    - `a level Pixlings set is not mistaken for the person's`: after `pickLevel('low')`, a request reporting effort `low` keeps Auto off but does not toast. After an Auto pick of `high` was sent, the next request arriving at `high` does not turn Auto off.
    - `the person's own change turns Auto off`: first request reports `medium` (the app's), then one reports `max` that Pixlings didn't set. `isAuto` turns false and is stored, pick `{effort:'max', by:'manual'}`, one toast.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the contract block, the `userConfig` entries (`autoEffort` boolean, `effortFloor`/`effortCeiling` with the five levels as options, `effortBias` with options `-2`…`2`, titles and descriptions modelled on Effortless's), and `auto.ts` per the interface. The controller holds `heldPick`, `engineEffort` and `isJudging` in closure; while one judge call is in flight, a second `onPrompt` doesn't start another (it plans `keep`).
- [ ] **Step 4: Run, expect PASS**, plus `claude plugin validate plugins/pixlings` clean.
- [ ] **Step 5: Commit** `feat: Auto effort decisions and controller`.

### Task 4: Wire Auto into the session

**Files:**
- Modify: `plugins/pixlings/hooks/register.tsx`: options read (~line 261), `prompt.submit` (~1627), `turn.step` (~1653), `turn.complete`, `classic.PostModelSwitch` (~1874)
- Test: `plugins/pixlings/tests/effort-session.test.tsx`

**Interfaces:**
- Consumes: `createAuto`, `readAutoConfig`, `askHaiku`, `contextFrom` and the atoms for `effortPick`/`effortAuto`/`effortShift`.
- Produces: an `auto` instance in `register`'s scope, used by Task 6's band.

- [ ] **Step 1: Write failing session tests** using the `host` pattern from `tests/band.test.tsx` plus `on('model.complete', …)`, `on('session.messages', …)`, `on('command.list', …)`, `on('prompt.fill', …)` and a `turn.step` driver as in `tests/hardening.test.tsx`:
  - `a typed prompt is judged and its requests carry the verdict`: model reply `high`, then `$.prompt.submit({ text: 'refactor the auth module', origin: { kind: 'composer' } })`. The next main-loop `turn.step` on `claude-opus-5-5` reaches the engine with `effort: 'high'`, and `model.complete` was asked with `claude-haiku-5-5`.
  - `slash commands and non-cache-safe models are left alone`: `/compact` → no `model.complete`. Session model `claude-fable-5-1` → no `model.complete`, and effort is passed through unchanged.
  - `haiku failure → medium, toast, no typing`: `model.complete` throws → request effort `medium`, one toast, no `prompt.fill`.
  - `autoEffort off does nothing`: options `{ autoEffort: false }` → no `model.complete`, effort unchanged.
  - `mid-turn lower verdict waits for the turn to end`: end to end, with `turnId` set on the submit.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Wire it.**
  - Build the controller after options are read.
  - `typeEffort` copies upstream `typeCommand` (lines 1087-1100): read the draft, never overwrite the person's own, fill `/effort <level>`, toast "Press Enter…" once.
  - `ask` = `askHaiku($.model.complete, …, contextFrom(await $.session.messages()), contextPercent)`, where `contextPercent` is the existing variable in `register.tsx` (~line 1372).
  - `prompt.submit`: build `PromptFacts`. `skill` comes from `$.command.list()` as upstream `typedSkill` does (source `user`/`plugin`/`mcp`, plugin ≠ `pixlings`). Then `await auto.onPrompt(...)`, caught, before the existing body.
  - `turn.step`: `const effort = auto.requestEffort(...)`, then `yield* next(effort ? { ...e, effort } : e)`. Keep the existing model/effort capture reading the effort actually sent.
  - `turn.complete` (main loop): `auto.onTurnEnd()`.
  - `PostModelSwitch`: nothing beyond what the request check already does; leave a comment pointing at upstream 4190.
- [ ] **Step 4: Run all tests, expect PASS** (existing suites unchanged).
- [ ] **Step 5: Commit** `feat: Auto effort judges each prompt and sets its requests' effort`.

### Task 5: `effort/gate.ts`, what the gate shows

**Files:**
- Create: `plugins/pixlings/hooks/effort/gate.ts`
- Test: `plugins/pixlings/tests/effort-gate.test.ts`

**Interfaces:**
- Consumes: `Effort`, `EFFORTS`; the `view()` shape from Task 3.
- Produces:
  - `type GateSeg = { text: string; role: 'label' | 'stop' | 'active' | 'rail' | 'arrow' | 'sep' | 'auto' | 'autoOn' | 'why'; level?: Effort }`
  - `gateRow(v: { effort: Effort | undefined; isAuto: boolean; why: string; shift: { from: string; to: string; until: number } | null; now: number }, width: number): GateSeg[]` produces `effort  L ─ M ─ ●H ─ X ─ Mx  ┃ A  auto: "<why>"`. The `active` seg is `●` + label. Rails between `from` and `to` become `→`, or `←` going down, while `now < until`. The `why` is only present while Auto is on and is cut first to fit `width`; then the label `effort` drops. The total text length is ≤ `width`.
  - `miniGate(v: { effort: Effort | undefined; isAuto: boolean }): GateSeg[]` produces `L`,`M`,`H`,`X`,`M` with the active one `role: 'active'`, no `●`, then ` A` as `autoOn`/`auto`.
  - `effort` undefined (nothing known yet) draws every stop as `stop`.

- [ ] **Step 1: Write failing tests:** the rest text for `high`+Auto; `●` on the active stop; arrows for `medium→xhigh` (`M → H → ●X`) and `high→low` (`●L ← M ← H`) before `until`, dashes after; `the gate fits 60 columns` (join of `gateRow(..., 60)` texts ≤ 60 with a long why; at 30 the label goes, and the stops and `A` stay); mini gate active letter for `max` is the last `M`, no `●`; `A` role follows `isAuto`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: the effort gate's rows`.

### Task 6: The gate in the band and the room

**Files:**
- Modify: `plugins/pixlings/hooks/lib/band.ts` (`layoutInfo`, `bandRows`, `columnRows`, `Part`), `plugins/pixlings/hooks/lib/vitals.ts` (`VitalsInput.hideEffort`), `plugins/pixlings/hooks/register.tsx` (`AbovePrompt` ~2452, room ~2873)
- Test: `plugins/pixlings/tests/effort-band.test.tsx`, plus updated cases in `tests/layout.test.ts`

**Interfaces:**
- Consumes: `gateRow`, `miniGate`, `auto.view()`, `auto.pickLevel`, `auto.toggleAuto`.
- Produces: `layoutInfo`/`bandRows`/`columnRows` input gains `gate?: 'row' | 'mini' | null`; `Part` gains `{ kind: 'gate' }` and `{ kind: 'miniGate' }`.

- [ ] **Step 1: Write failing tests.**
  - `layout.test.ts`:
    - `gate: 'row'` adds one row after the vitals, which `columnRows` counts. When rows run short it outlasts the speech's extra lines and the name+XP split, but not the first vitals row.
    - `gate: 'mini'` appends a `miniGate` part to the last vitals row shown, or to the shared name row when no vitals fit.
  - `effort-band.test.tsx`, on terminal and desktop:
    - `full` and `compact` show a Text `effort` and a `●H`. The vitals row no longer ends `· high`.
    - `slim`/`minimal` (options `band`) show the mini gate with no `●`, after the cache countdown on the minimal line.
    - `off` draws nothing, but a prompt is still judged.
    - Pressing the `H` stop's Button (key `effort-high`) makes the pick manual and fills `/effort high`. Pressing `effort-auto` turns Auto back on.
    - The `autoEffort: false` option leaves no gate, and the vitals keep `· <effort>`.
    - `the gate fits 60 columns` at `bodyColumns: 60`.
    - `autoscale`: with `viewport.rows: 30` (band capped at 5 rows), `compact` is still picked and the gate row is shown.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - Gate mode is `'row'` when the form has ≥ 4 rows, `'mini'` otherwise, and `null` when `autoEffort` is off.
  - Each stop is a `Button` (`plain`, keys `effort-<level>`, `effort-auto`) drawn with the `TONE_COLOR`/rarity `color` palette: `active` and `autoOn` in `color`, `arrow` in `color`, and everything else dim.
  - Read the `effortPick`/`effortAuto`/`effortShift` atoms in the hook so changes redraw. Schedule one `$.ui.invalidate` at `shift.until` so the arrows fade.
  - Pass `hideEffort: true` to `vitals()` whenever a gate shows.
  - Room: add the gate row under the room's vitals, using the same segments.
- [ ] **Step 4: Run all tests, expect PASS**; `claude plugin validate plugins/pixlings`; `tsc -p plugins/pixlings`.
- [ ] **Step 5: Commit** `feat: the effort gate in the band and the room`.

### Task 7: `tools/effort-sync.ts` and docs

**Files:**
- Create: `tools/effort-sync.ts`
- Modify: `README.md` (feature bullet, settings table rows for the four options, a "Coming from Effortless?" line), `plugins/pixlings/README.md` if it lists settings, `CHANGELOG.md`

**Interfaces:**
- Consumes: the name list in `judge.ts`'s header (make the header list them as `// synced: EFFORTS, MODELS, cacheSafe, JUDGE_SYSTEM, ...` so the tool reads it).
- Produces: CLI `node tools/effort-sync.ts <path-to-effortless-checkout>` (plain `node`, as the other `tools/*.ts` run), with a `// Usage:` header line like theirs.

- [ ] **Step 1: Implement.**
  - Read the header's `synced:` names, then pull each top-level `const`/`function` with that name out of `<checkout>/hooks/register.tsx` (from its declaration to the next top-level declaration) and the same from `judge.ts`.
  - Print a unified diff per name that differs, `missing upstream: <name>` for any that vanished, and the upstream version from `<checkout>/.claude-plugin/plugin.json`.
  - Exit `0` when identical, `1` when there are diffs. Never write files.
- [ ] **Step 2: Verify.** Running it against `/home/chris/.claude/plugins/marketplaces/effortless` prints no diff beyond the allowed edits (`export` added, types local). If those show, normalise them in the comparison (strip a leading `export `). Then edit one char in a scratch copy of upstream and check the diff appears with exit code 1.
- [ ] **Step 3: Docs.** README: Auto effort bullet, the gate, the four settings, and a note that Effortless isn't needed alongside. CHANGELOG entry under the next version.
- [ ] **Step 4: Commit** `feat: effort-sync shows what changed in Effortless's judge; docs`.
