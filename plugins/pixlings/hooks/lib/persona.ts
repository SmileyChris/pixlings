// The pixling's one-line personality: picked from templates, flavoured by its species and its
// rarity, with no model call. The pick is seeded (by the hatch time), so a pixling hatched before
// personalities existed gets the same one in every session.

import { speciesById } from './sprites.ts'
import type { Rarity } from './sprites.ts'

/** A shown persona stays under this; an adopted Buddy's free text is cut at `PERSONA_MAX`. */
export const TEMPLATE_MAX = 70
export const PERSONA_MAX = 280

const BY_SPECIES: Readonly<Record<string, readonly string[]>> = {
  blip: ['Cheers for every green test. Snacks on the red ones.', 'Bounces when you commit. Bounces when you don’t.'],
  duck: ['Listens to every bug story. Judges none of them. Mostly.', 'Believes any bug falls apart once said out loud.'],
  cat: ['Naps on the hot path. Purrs at clean diffs.', 'Silently judges your variable names. Loves you anyway.'],
  snail: ['Never in a hurry, never computes anything twice.', 'Carries its cache everywhere, just in case.'],
  rabbit: ['Three commits ahead and still going. Hops before it looks.', 'First one down every rabbit hole, last one out.'],
  chonk: ['Occupies the warm spot by the build. Will not be moved.', 'Round, unhurried, and heavier than any refactor.'],
  robot: ['Runs on coffee-flavored electricity and good test names.', 'Beeps politely at flaky tests. Logs everything.'],
  cactus: ['Low maintenance, high standards. Prickly about lint.', 'Thrives on neglect. Blooms on green builds.'],
  capybara: ['Unbothered by prod fires. Has a nice long soak instead.', 'Makes friends with every bug before fixing it.'],
  penguin: ['Dressed for standup. Will mention Linux within a minute.', 'Slides through merge conflicts belly first.'],
  mushroom: ['Grows quietly in the dark corners of the repo.', 'Connected underground to every module. Knows who imports whom.'],
  owl: ['Has read the docs twice. Quotes them at 2am.', 'Wide awake for the night shift, wise about the morning.'],
  axolotl: ['Smiles through every merge conflict. Regrows lost branches.', 'Never panics. A lost limb is just a refactor.'],
  turtle: ['Remembers when this was a monolith. Speaks in shell.', 'Slow to merge, quick to say “I told you so.”'],
  octopus: ['Eight arms, eight tabs, all of them doing something.', 'Squeezes through any gap in the test coverage.'],
  ghost: ['Haunts your old PRs. Still leaves review comments.', 'Walks through walls, never through failing tests.'],
  goose: ['Honks at bad code. Honks at good code, to be safe.', 'Chaotic, loyal, and very loud about missing tests.'],
  dragon: ['Hoards tokens instead of gold. Guards main with fire.', 'Sleeps on a pile of green builds. Wakes for PRs.'],
}

const BY_RARITY: Readonly<Record<Rarity, readonly string[]>> = {
  common: ['Easily delighted. A passing test is a whole party.', 'Small, loyal, and a little too proud of your commits.'],
  uncommon: ['A touch peculiar, and right about it more often than not.'],
  rare: ['Quietly brilliant. Notices the bug before you do.'],
  epic: ['Larger than life, mostly in volume.'],
  legendary: ['Ancient, unhurried, and absolutely sure of itself.'],
}

/** A seed folded into a well-spread integer, so nearby hatch times pick different lines. */
const mix = (seed: number): number => {
  let h = (Math.floor(Math.abs(seed)) % 2_147_483_647) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Every template a species can be given: its own lines, then its rarity's. */
export const personasOf = (speciesId: string): readonly string[] => {
  const species = speciesById(speciesId)
  return [...(BY_SPECIES[speciesId] ?? []), ...(species ? BY_RARITY[species.rarity] : BY_RARITY.common)]
}

/** The species' persona for this seed; the same seed always gives the same line. */
export const personaFor = (speciesId: string, seed: number): string => {
  const pool = personasOf(speciesId)
  return pool[mix(seed) % pool.length] ?? BY_RARITY.common[0]!
}

/** Free text made one tidy line: control characters dropped, whitespace folded, length capped. */
export const oneLine = (text: string, max = PERSONA_MAX): string => {
  const line = text
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}
