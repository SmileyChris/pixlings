# Tiered Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the badge shelf from 16 to 18 badges and give 14 of them bronze / silver / gold tiers that count across every egg, so the shelf lasts months, not weeks.

**Architecture:** A new `lifetime` record on the pixling holds the counts tiers need; like the tics, it survives `/pixling hatch` and merges across sessions. A badge becomes a list of `steps` (one for a single badge, three for a tiered one) over a `count`; each tier reached is stored in the existing `badges` record under `id` (tier 1, so old saves keep theirs), `id:2` and `id:3`. The share card spaces its 18 icons 8px apart and draws three pips under each tiered one; text surfaces show 🥉🥈🥇.

**Tech Stack:** TypeScript run as-is by Node 24 and the Claude Code plugin runtime; tests with `claude-code/testing` via `claude plugin test plugins/pixlings`.

**Spec:** No separate spec. The decisions were made in conversation on 2026-11-06 and are listed in full under Global Constraints.

## Global Constraints

- 18 badges, in this order: hello, exterminator, dangerous, nightOwl, survivor, shipper, liftoff, centurion, onFire, lucky, absolutelyRight, bestFriends, greenThumb, collector, archmage, brainFreeze, heardItAll, regular.
- Single (one step): hello [1], survivor [1], liftoff [1], bestFriends [100].
- Tiered steps and counts:

  | id | steps | count |
  |---|---|---|
  | exterminator | 10 / 50 / 250 | `lifetime.bugsSquashed` |
  | dangerous | 10 / 50 / 200 | `lifetime.risky` |
  | nightOwl | 25 / 100 / 500 | `lifetime.nights` |
  | shipper | 50 / 250 / 1000 | `lifetime.commits` |
  | centurion | 100 / 1000 / 10000 | `lifetime.turns` |
  | onFire | 7 / 30 / 100 | `streak.best` |
  | lucky | 1 / 2 / 4 | `lifetime.shinyEggs` |
  | absolutelyRight | 25 / 100 / 500 | `tics.absolutelyRight` |
  | greenThumb | 100 / 500 / 2500 | `lifetime.testsPassed` |
  | collector | 5 / 12 / 18 | `dex.length` |
  | archmage | 25 / 50 / 99 | current level (per pixling, on purpose) |
  | brainFreeze | 10 / 50 / 200 | `lifetime.coldStarts` |
  | heardItAll | 50 / 250 / 1000 | `totalTics(tics)` |
  | regular | 100 / 500 / 2000 | `lifetime.sessions` |

- `how(n)` copy, `n` grouped with commas (1,000): Exterminator `Squash ${n} bugs (red tests → green)`; Living Dangerously `Run ${n} risky commands`; Night Owl `Work ${n} turns after midnight`; Shipper `Make ${n} commits`; Centurion `Finish ${n} turns`; On Fire `Code ${n} days in a row`; Lucky `Lay a shiny egg` for 1, else `Lay ${n} shiny eggs`; Absolutely Right `Hear "You're absolutely right" ${n} times`; Green Thumb `Pass ${n} test runs`; Collector `Discover ${n} species`; Archmage `Reach level ${n}`; Brain Freeze `Let the prompt cache go cold ${n} times`; Heard It All `Hear Claude's tics ${n} times in all`; Regular `Open ${n} sessions`. Singles keep today's text.
- New badges: Heard It All, emoji 🦜, icon `['..GGG..', '.GGGGG.', 'GGWKGGY', 'GGGGGYY', 'GGGGGY.', '.RGGG..', '.RR....']`, colors `{ G: 0x3fd07a, W: 0xffffff, K: 0x1b1424, Y: 0xffc53d, R: 0xff4d6d }`. Regular, emoji ☕, icon `['..S.S..', '.S.S...', 'MCCCCM.', 'MMMMMMM', 'MMMMM.M', 'MMMMMMM', '.MMMM..']`, colors `{ M: 0xe6e9f0, C: 0x8a5a2b, S: 0x8a90a6 }`.
- Tier names: Bronze, Silver, Gold; medals 🥉 🥈 🥇; pip colors bronze `0xb06a2c`, silver `0xc0c8d4`, gold `0xffc53d`, unreached pips `FAINT`.
- Share card: icon pitch 8px (was 9), icons at y 91, pips at y 99 on x+1, x+3, x+5; nothing below y 100 (the divider is at 101).
- "N/18 badges" counts badges, never tier keys.
- Stats on the card, the room and `/pixling` stay per pixling; only badges read `lifetime`.

## Review Focus

1. An existing veteran save upgrades: many tiers pass at once. Expect one celebration and one toast naming the first, `(+N more)`, not a burst. Test in Task 2.
2. A save from before `lifetime` with Lucky earned but no egg on the current pixling: `shinyEggs` must seed to at least 1 so Lucky shows tier 1 progress toward 2, not 0/1. Test in Task 1.
3. Two sessions open at once: lifetime counts add their gains, never double. Test in Task 1.
4. `/pixling hatch`: stats reset, lifetime and tiers carry on. Test in Task 1.
5. Card fit: 18 gold icons stay inside the right column and the pips stay above the divider. Test in Task 3.

---

### Task 1: Lifetime counts

**Files:**
- Modify: `plugins/pixlings/hooks/lib/progress.ts` (types near 9–73, `rehatch` 180, `gain` 349, `bump` 377, `revive` 383, `mergeSave` 478)
- Modify: `plugins/pixlings/types/index.d.ts` only if it restates `Pixling`
- Test: `plugins/pixlings/tests/badges.test.ts` (create)

**Interfaces:**
- Produces: `type Lifetime = { turns; commits; bugsSquashed; testsPassed; risky; nights; coldStarts; sessions; shinyEggs: number }`, `LIFETIME_KEYS: readonly (keyof Lifetime)[]`, `emptyLifetime(): Lifetime`, `Pixling.lifetime: Lifetime`. `bump(p, stat, by)` also adds `by` to `lifetime[stat]` when `stat` is a lifetime key. `gain()` adds 1 to `lifetime.shinyEggs` when `isShinyEgg`.

- [ ] **Step 1: Write the failing tests** in `tests/badges.test.ts` (copy the `seeded` helper and `T0` from `tests/v02.test.ts`):
  - `bump counts into lifetime`: `bump(p, 'commits', 3)` → `stats.commits === 3` and `lifetime.commits === 3`; `bump(p, 'pets')` leaves `lifetime` unchanged.
  - `a hatch keeps lifetime and resets stats`: p with `stats.turns 500, lifetime.turns 900` → `rehatch(p, seeded(3), T0+1)` has `stats.turns 0`, `lifetime.turns 900`.
  - `laying a shiny egg counts`: find xp where `shinyEggOf` first lays (loop `hatchedAt` until `shinyEggOf({hatchedAt, xp: 100_000})` is non-null, set xp just below its `.xp`), `gain(p, 'bugSquashed')` until `isShinyEgg` → `lifetime.shinyEggs === 1`.
  - `an old save seeds lifetime`: `revive({v:1, species:'cat', name:'Miso', stats:{turns:40, commits:7}})` → `lifetime.turns 40, commits 7, shinyEggs 0`. Same with `isShiny: true` → `shinyEggs 1`. With `badges: { lucky: 5 }` and not shiny → `shinyEggs 1`. With `lifetime: { turns: 2 }` present → `lifetime.turns 2`, other keys 0 (not reseeded from stats).
  - `two sessions add their lifetime gains`: base `lifetime.turns 10`; stored 15; ours 12 → `mergeSave(stored, base, ours).lifetime.turns === 17`. Same with a different `hatchedAt` on ours (a hatch in this session) → still 17.

- [ ] **Step 2: Run to see them fail**

Run: `claude plugin test plugins/pixlings`
Expected: the new tests fail (`lifetime` undefined); existing ones pass.

- [ ] **Step 3: Implement in `progress.ts`**
  - `hatchPixling` starts `lifetime: emptyLifetime()`; `rehatch` carries `lifetime: p.lifetime`.
  - `revive`: if `v.lifetime` is a record → `{ ...emptyLifetime(), ...numbersOf(v.lifetime) }`; else seed each key from `stats`, and `shinyEggs = max(badges.lucky ? 1 : 0, (isShiny ? 1 : 0) + (shinyEggOf(v) ? 1 : 0))`.
  - `mergeSave`: add `lifetime: moved(stored.lifetime, since?.lifetime ?? {}, ours.lifetime) as Lifetime` to `person`.

- [ ] **Step 4: Run the tests**

Run: `claude plugin test plugins/pixlings`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/pixlings/hooks/lib/progress.ts plugins/pixlings/tests/badges.test.ts
git commit -m "feat: lifetime counts that outlive a hatch, for the badges"
```

### Task 2: Tiered badges and the two new ones

**Files:**
- Modify: `plugins/pixlings/hooks/lib/badges.ts`
- Modify: `plugins/pixlings/hooks/register.tsx` (`checkBadges` 661, `badgeLine` 2141, the `/pixling` text 2767–2774)
- Modify: `plugins/pixlings/hooks/lib/room.ts` (`nextBadge` 156, shelf 579)
- Test: `plugins/pixlings/tests/badges.test.ts`, `tests/v02.test.ts:146` (the award test uses `progress`)

**Interfaces:**
- Consumes: `Pixling.lifetime` (Task 1), `totalTics` from `tics.ts`.
- Produces in `badges.ts`:
  - `Badge` loses `progress`, `how: string`; gains `steps: readonly number[]`, `count: (p: Pixling) => number`, `how: (n: number) => string`.
  - `TIERS = ['Bronze', 'Silver', 'Gold'] as const`, `MEDALS = ['🥉', '🥈', '🥇'] as const`.
  - `tierKey(id: BadgeId, tier: number): string` → `id` for 1, `` `${id}:${tier}` `` above.
  - `tierOf(b: Badge, p: Pixling): number` (0 to `steps.length`, highest key present).
  - `progressOf(b: Badge, p: Pixling): { tier: number; have: number; need: number } | null` (null once every step is reached; `have` capped at `need`).
  - `badgeTitle(b: Badge, tier: number): string` → name for a single badge, `` `${name} · ${TIERS[tier-1]}` `` for a tiered one.
  - `isTiered(b: Badge): boolean` → `steps.length > 1`.
  - `award(p, now): { pixling; earned: { badge: Badge; tier: number }[] }`: stores every step crossed, one `earned` entry per badge at its highest new tier.
  - `earnedBadges(p)` unchanged in meaning (tier ≥ 1, by tier-1 time).

- [ ] **Step 1: Write the failing tests** in `tests/badges.test.ts`:
  - `the shelf`: `BADGES.length === 18`; ids in the Global Constraints order; each `steps` matches the table (`exterminator` `[10, 50, 250]`, `hello` `[1]` …); every icon 7×7 with mapped letters.
  - `tiers are earned in turn`: lifetime.bugsSquashed 49 → `tierOf(exterminator) === 1`, `progressOf` `{ tier: 1, have: 49, need: 50 }`; 50 → key `exterminator:2` stored, earned `[{ id: 'exterminator', tier: 2 }]`; 250 → tier 3, `progressOf` null.
  - `a veteran earns every tier at once, one entry each`: lifetime.turns 12_000 on a fresh pixling → earned has one centurion entry with tier 3, and `p.badges` has `centurion`, `centurion:2`, `centurion:3`.
  - `an old badge is tier 1`: `revive({... badges: { exterminator: 5 } })` → `tierOf === 1`.
  - `Heard It All counts every tic`: tics `{ absolutelyRight: 30, delve: 20 }` → count 50, tier 1. `Lucky` with `lifetime.shinyEggs 2` → tier 2. `Regular` with `lifetime.sessions 100` → tier 1.
  - `copy`: `centurion.how(10000) === 'Finish 10,000 turns'`; `lucky.how(1) === 'Lay a shiny egg'`, `lucky.how(4) === 'Lay 4 shiny eggs'`; `badgeTitle(exterminator, 2) === 'Exterminator · Silver'`; `badgeTitle(hello, 1) === 'Hello, World'`.
  - Update `tests/v02.test.ts` award test to the new `earned` shape (`.map(e => e.badge.id)`) and set `lifetime.bugsSquashed`, not `stats`.

- [ ] **Step 2: Run to see them fail**

Run: `claude plugin test plugins/pixlings`
Expected: new tests fail.

- [ ] **Step 3: Implement `badges.ts`** with the table, copy and icons from Global Constraints. Group numbers by hand (`String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')`): the mod's environment may have no `Intl`.

- [ ] **Step 4: Move the call sites onto it**
  - `checkBadges`: line `badge` slot `` `${first.badge.emoji} ${badgeTitle(first.badge, first.tier)}` ``; toast `` `🏅 Badge: ${emoji} ${title}, ${how(steps[tier-1]).toLowerCase()}${more}. See /pixling badges` ``.
  - `badgeLine`: earned and maxed → `` `${emoji} ${name} ${MEDAL} done` ``; else `🔒`/emoji + medal so far + `xpBar(have, need, 10) have/need` + `how(need)`.
  - `/pixling` text line: earned emojis followed by their medal for tiered ones.
  - `room.ts`: `nextBadge` takes the highest `have/need` over `progressOf` (next tiers included) and returns `{ badge, have, need, tier }`; the shelf shows `` `${emoji} ${badgeTitle}` `` plus the medal, and `Next:` uses `how(need)`. "Every badge is on the shelf" stays about the 18; add `🏆 Every badge gold.` when `progressOf` is null for all.

- [ ] **Step 5: Run the tests**

Run: `claude plugin test plugins/pixlings`
Expected: all pass. Fix the hard-coded `2/16` in `tests/band.test.tsx:366` and `tests/room.test.tsx:206` to `2/18` (by `BADGES.length`).

- [ ] **Step 6: Commit**

```bash
git add plugins/pixlings/hooks plugins/pixlings/tests
git commit -m "feat: bronze, silver and gold badges, Heard It All and Regular, eighteen in all"
```

### Task 3: The share card's row

**Files:**
- Modify: `plugins/pixlings/hooks/lib/card.ts:160-164` (the row), `:183` (`shareText` count)
- Test: `plugins/pixlings/tests/card.test.ts`

**Interfaces:**
- Consumes: `tierOf`, `isTiered`, `earnedBadges` (Task 2).

- [ ] **Step 1: Write the failing tests** in `card.test.ts`:
  - `eighteen icons fit the column`: with every badge at gold, every non-background pixel of the row lies in x `[88, 232)` and y `[91, 100)`.
  - `pips show the tier`: exterminator at tier 2 → pixels (88+8+1, 99) and (88+8+3, 99) are silver `0xc0c8d4`, (88+8+5, 99) is `FAINT`; hello (single) has no pip at (89, 99).
  - `shareText counts badges, not tiers`: every tier of every badge → text contains `18/18 badges`.

- [ ] **Step 2: Run to see them fail**

Run: `claude plugin test plugins/pixlings`
Expected: the three fail.

- [ ] **Step 3: Implement** pitch 8, pips per Global Constraints, `shareText` from `earnedBadges(px).length`.

- [ ] **Step 4: Run the tests**

Run: `claude plugin test plugins/pixlings`
Expected: all pass.

- [ ] **Step 5: Look at it**

Run: `node tools/card.ts /tmp/claude-cards` and open the veteran card. The row must read at ×5 with no icon touching the divider.

- [ ] **Step 6: Commit**

```bash
git add plugins/pixlings/hooks/lib/card.ts plugins/pixlings/tests/card.test.ts
git commit -m "feat: the card holds eighteen badges, pips under the tiered ones"
```

### Task 4: Docs and the README card

**Files:**
- Modify: `README.md:79` (alt text), `:81-83` (badges section), `CHANGELOG.md` (Unreleased → New), `docs/DESIGN.md:74`
- Modify: `tools/card.ts` (the sample with every badge: give it every tier) and regenerate `docs/media/card.png` the way commit af7d92f did

- [ ] **Step 1:** README: "Eighteen badges, most in bronze, silver and gold, counted across every egg you hatch", naming Heard It All and Regular and Lucky's "lay a shiny egg"; alt text "all 18 badges, most of them gold". CHANGELOG entry in the file's voice. DESIGN: "18 badges, 14 of them in three tiers over lifetime counts".
- [ ] **Step 2:** Regenerate `docs/media/card.png`; check it by eye.
- [ ] **Step 3:** `claude plugin test plugins/pixlings` passes.
- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md docs tools/card.ts
git commit -m "docs: eighteen badges, most in three tiers"
```
