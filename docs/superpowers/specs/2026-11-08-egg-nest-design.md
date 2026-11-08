# The nest: chosen eggs, egg looks and family names

Status: design, agreed in conversation on 2026-11-08. The mockup is a throwaway page at
https://claude.ai/artifact/LifQZwjeLbr7kbDujWeiUd, with a copy of its source beside this file
(`2026-11-08-egg-nest-mockup.html`) for its drawing code. It shows the look and the rules, not the code
to ship.

## Why

- **Names repeat too soon.** A pixling's name is one of 50 (`NAMES`, `hooks/lib/progress.ts:137`),
  so a repeat is more likely than not within 9 hatches. Blended names give about 2,450 and also
  make a family line: every pixling carries part of the one before it.
- **You can't get out of a hatch you dislike.** Today a release below level 5 hatches the same egg
  again, so you can't reroll your way to a rare species. That stops fishing, but it leaves you stuck
  with what you got. The fix is to let you **choose between eggs** and to **block release below
  level 5**. Choosing is the way out, and the block means nothing can be rerolled.
- **Every egg looks the same.** There is one cream egg sprite (`hooks/lib/canvas.ts:1062`). Eggs
  you choose between need to look different, and the look should hint at, without stating, what is
  inside.

What success looks like: picking an egg feels like a real decision. Sometimes that's the shiny egg
over the rarer one, or a plain egg because you like its partner. Names read like a family. Rarity
overall stays roughly as rare as it is today.

### Non-goals

- Changing species art, rarity weights, the level curve or the shiny-egg chance.
- Changing the stars and the common-to-legendary ranking anywhere outside the eggs: the card, the
  hatch toast and the dex keep them.
- Breeding mechanics. Partners are **purely for fun**: they don't affect the egg's rarity or
  species.

### Anti-goals (a failure even if it works)

- **Text that ranks the eggs.** The nest shows no group names, no stars and no "shiny" tag. The
  eggs speak for themselves.
- **A way to fish.** No action may reveal a fresh roll that wasn't earned: every nest is fixed by a
  seed, and release below level 5 is refused.
- **A crowded nest in text-only terminals.** It has to stay compact.

## What changes

### 1. Release needs a mature pixling

- `/pixling hatch` below `MATURE_LEVEL` (5) is refused, with no prompt:
  > Miffles hasn't matured yet (level 3 of 5). Keep going together a little longer before hatching a new egg.

  (The pixling's name and level are filled in.)
- From level 5 the confirm prompt works as it does today. The "same egg again" sentence
  (`register.tsx:2373`) goes, and so does the rule behind it: `nextSeedOf` / `eggSeed` no longer
  need to step back to an ancestor's seed. A nest's seed is the parent's own birth time
  (`hatchedAt`), which is fixed, so releasing again doesn't reroll anything.
- Saves that already have an `eggSeed` must keep loading. Ignoring the field from now on is fine.

### 2. The nest

- Each hatch **after the first** lays a nest of **two eggs**. You pick one, and only that egg
  hatches, with the existing hatch animation, sound and toast.
- **The first egg stays as it is today:** one egg that hatches by itself when the pixling is first
  shown (session start or the desktop app attaching), with no nest and no pick. Its seed and
  rarity roll are unchanged. Someone who dislikes their first pixling waits until level 5 for a
  nest, which is accepted to keep the first run simple.
- When the outgoing pixling has laid a shiny egg (`shinyEggOf`, unchanged: a 1% chance at each
  1,000 XP), the nest has a **third egg, the shiny one**. It doesn't replace either of the other two.
- **Each egg is rolled on its own** from its own seed: rarity by the usual weights, then a species
  of that rarity, then its look. The shiny egg's rarity is rolled like the others'. Getting the best
  of three makes good hatches more common while a shiny egg is in the nest (about 4.1% legendary,
  against 1.5% from one egg). That's accepted: the shiny egg often isn't the rarest, so the choice is
  a hard one.
- Before you pick you see only each egg's **look** and its **partner** (§4). Not the species, not
  the rarity in words, and not the egg's own name.
- The eggs you don't pick are gone. Their species don't go in the dex. Only the picked egg counts
  as a hatch for badges, the dex, the toast and anything else that runs at hatch time.
- **Only the shiny egg hatches shiny.** Picking either of the others hatches a pixling that isn't
  shiny. The shiny egg has its own base look and rarity mark like any egg, with the stronger shine
  on top.
- Shiny-egg badge: keep counting shiny eggs **laid**, whether or not you pick the shiny one. The
  badge reads "Lay a shiny egg". *(My call.)*
- **The release happens at the pick, not at a confirm.** `/pixling hatch` (level 5+) opens the
  nest straight away. The nest carries today's release warning and a "Keep Miffles" button, so
  picking an egg is the confirmation. The old pixling stays until an egg is picked. If the nest is closed,
  or can't be shown, nothing changes, and `/pixling hatch` brings the same nest back. *(My call.)*
- **The nest isn't stored.** It's worked out from the seed each time it's shown. The two base eggs
  never change, but a shiny third egg can turn up later if more XP lays one before you pick. That's
  accepted: shiny eggs are earned. *(My call.)*

### 3. Egg looks

The look is drawn on the existing 16×16 egg shape. It has two layers.

**Base look, picked by the seed:** one of 5 natural patterns × 6 shell colours, 30 looks in all.
The positions of spots, speckles and blotches also come from the seed, so two eggs with the same
look still differ.

| Pattern | What it is |
|---|---|
| Speckled | Small specks spread over the egg, about 1 pixel in 7 |
| Spotted | A few round spots |
| Dappled | Soft blotches a shade off the shell colour |
| Marbled | Thin wavy veins of the mark colour |
| Dusted | Specks that get thicker toward the base, leaving the top clear |

Shell colours: Cream, Rose, Sand, Fog, Peach, Charcoal. Each has an outline, a shell, a shade, a
highlight and a mark colour. The mockup's values are a starting point.

**Rarity mark, on top.** The groups are named for how they look, and are never shown as words:

| Rarity | Mark | Share of eggs |
|---|---|---|
| Common | **Plain**: no mark | 50% |
| Uncommon | **Mossy**: a green vine with leaves round the base | 28% |
| Rare | **Glowing**: about four branching blue veins that pulse slowly | 14% |
| Epic and legendary | **Gilded**: a gold cap, about seven gold flecks, and the outline round the top leaning toward gold | 8% |

The shares are today's `RARITY_WEIGHT` (50 / 28 / 14 / 6.5 + 1.5), which this change leaves as it is.

- **Legendary hides in Gilded.** The only giveaway is in the hatch: the light leaking through the
  cracks and the final flash already use the rarity's colour (`renderHatch`), so they come out gold
  for a legendary and purple for an epic. Keep that.
- **Gilded's outline:** blend the outline colour toward gold by about 65% at the top rows, then
  restore the outline's original **lightness**, fading back to the plain outline by about row 6.
  Don't rotate the hue around the colour wheel: on the Fog and Charcoal shells that passes through
  green and red.
- **Shiny eggs use a stronger shine than pixlings do.** Today's shine (a beat every 4.5 s, a sweep
  on 15% of beats, lifting the colour 10%) is too easy to miss when you're choosing. In the mockup a
  beat comes every 1.5 s, sweeps happen on about 45% of beats, the sweep lifts the colour about 38%,
  and there's always a small flare. Shiny pixlings keep today's shine.
- The pixel-level drawing (vine shape, vein paths, fleck spots, exact colours) is the builder's, as
  long as it reads as the table above at 16×16 in both image and text rendering.

### 4. Names, partners and the family line

**Blending.** A blended name is the start of one name joined to the end of another:

- *start* = the letters up to and including the first vowel group (`Mochi` → `Mo`)
- *end* = from the consonants before the last vowel group to the end (`Pixel` → `xel`)
- If the start ends in a vowel and the end begins with one, drop the end's leading vowels.
- Treat `y` as a vowel, and capitalise the result. So `Mochi` + `Pixel` → **Moxel**, and `Hex` +
  `Waffles` → **Heffles**.
- Lumpy results from one-syllable names (Dugrep, Nuhex) are accepted.

**Which halves.**

- The **first egg** ever takes a plain name from the list, as today, and has no parent. Its whole
  name counts as its newer half, on the start side.
- From the **second hatch on**, every hatch blends. Each pixling remembers its **newer** half and
  which side that half is on. The child keeps that newer half **on the same side**, and a fresh roll
  fills the other side. The fresh roll becomes the child's newer half.
- So the side that carries over alternates down the line. Each name lasts two generations:
  > Juniper → Juffles (Ju·niper + Waf·fles) → Taffles (Ta·ngo + Waf·fles) → Tarbo (Ta·ngo + Tu·rbo) → Nirbo → Nipip → Loopip → Loodle
- The fresh roll is never a name **already used in this line**. "Used" means the first egg's name
  and every fresh roll; blended names don't count. When the list runs out, allow repeats again. So
  a nest depends on its seed and on the line's stored history, which is fine because both are
  fixed. *(My call.)*
- **A rename or an adoption starts the line afresh** from the new name. That name becomes the
  newer half, whole and on the start side, with no parent, and the used-names list starts over
  from it. Otherwise a renamed "Bob" would have children with no "Bob" in them. *(My call.)*
- Each egg in a nest has its own fresh roll, so each would hatch with a different name.

**Partner.**

- The fresh roll is shown as the egg's **other parent**: a pixling called by that name.
- Its species comes from a seed made from the name, using the usual rarity weights, so a "Tango"
  is always the same species for everyone.
- Partners are decoration only. They're never added to the dex and never affect the egg.

**Where things show.**

- **Nest:** under each egg, **♥, then the partner, then the partner's name**. In image mode the
  partner is a tiny picture beside its name. Where the terminal draws no images it's just
  `♥ Tango`. The egg's own name stays hidden until it hatches.
- **After the hatch** the name is revealed as it is today (toast, card).
- **Card:** shows the pixling's **parent**, the pixling it hatched from, as "child of Juffles".
  Showing the two source names isn't needed.
- The mockup's family-tree view (every generation, with partners and branches not taken) was for
  exploring the idea. It isn't part of this change.

### 5. What is stored

The builder decides the exact shape. It needs, per pixling:

- its newer half and that half's side
- its parent (at least the name; the species too, if the card is to show it)
- the names this line has used

**Family history, kept from now on.** Each pixling's record also keeps the line behind it: for
every earlier generation, its name, species, partner's name, and when it hatched and was released.
This change only stores it (and takes the used names from it). Showing it, for example as a family
tree like the mockup's, is for later. Nothing is made up for lines that started before this change:
their history starts with the pixling they have now. A rename or adoption keeps the history but
starts a new line within it. *(The rename part is my call.)*

Old saves load as if just renamed, with no invented history because their name isn't a blend:
newer half = the whole name, on the start side, with no parent. An adopted `/buddy` name can be any word, and blending works on it the same way.

## Constraints

- Everything is deterministic from seeds. A nest is fixed by the parent's `hatchedAt`, and each egg
  by its own seed derived from that. Reloading, or releasing again, gives the same nest.
- It has to work in all three ways the room draws (`lib/room.ts:144`): `Raster` (text cells, two
  pixels per cell), `Svg` (image), and alt text.
- Plain-text command replies (`/pixling` output) still mention no ranking, except where they already
  do after a hatch.

## Left to the builder

- Where and how the nest is shown and picked from (room buttons, hotkeys, `/pixling hatch` flow),
  as long as the anti-goals hold. Note that a `$.ui.open` after an `await` doesn't count as a user
  action, so open any view inside the press itself.
- The exact drawing of patterns, marks and the stronger shine.
- Whether to keep a small blocklist for unfortunate blends (the mockup turned up "Obit").
- Test strategy, storage shape, migration details.
