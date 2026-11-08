// The nest: the eggs a grown pixling lays to choose from. Two, and a third when it has laid a
// shiny one. Each egg is fixed by its parent's birth time, so showing the nest again, or another
// session showing it, gives the same eggs; only a shiny egg laid meanwhile adds one.

import { eggLookOf } from './eggs.ts'
import type { EggLook } from './eggs.ts'
import { blend, freshName } from './names.ts'
import { personaFor } from './persona.ts'
import { ancestorOf, hatchPixling, rollSpecies, seededRandom, shinyEggOf, usedNames } from './progress.ts'
import type { Pixling } from './progress.ts'
import { speciesById } from './sprites.ts'
import type { Species } from './sprites.ts'

export type Egg = {
  readonly seed: number
  readonly species: Species
  /** The name it hatches with: the parent's newer half and the partner's, blended. */
  readonly name: string
  /** Its other parent: a fresh name from the list, the newer half it carries on. */
  readonly partner: string
  readonly isShiny: boolean
  readonly look: EggLook
}

/** The eggs `parent` lays: the shiny one, when there is one, always third. */
export const nestOf = (parent: Pixling): Egg[] => {
  const r = seededRandom(parent.hatchedAt)
  const seeds = [r(), r(), r()].map(x => Math.floor(x * 2 ** 31))
  const count = shinyEggOf(parent) !== null ? 3 : 2
  return seeds.slice(0, count).map((seed, i) => eggOf(parent, seed, i === 2))
}

const eggOf = (parent: Pixling, seed: number, isShiny: boolean): Egg => {
  const e = seededRandom(seed)
  const species = rollSpecies(e)
  const partner = freshName(e, usedNames(parent))
  const { newer, side } = parent.line
  const name = side === 'start' ? blend(newer, partner) : blend(partner, newer)
  return { seed, species, name, partner, isShiny, look: eggLookOf(seed, species.rarity, isShiny) }
}

/** The species a partner of this name is, the same for everyone. */
export const partnerSpecies = (name: string): Species => rollSpecies(seededRandom(hashOf(name.toLowerCase())))

const hashOf = (text: string): number => {
  let h = 0x811c9dc5
  for (const ch of text) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193)
  return h >>> 0
}

/**
 * The pixling `egg` hatches into, `parent` released at `now`: the person's badges, streak, tics and
 * lifetime counts stay; its line carries on from the partner, on the other side.
 */
export const hatchEgg = (parent: Pixling, egg: Egg, now: number): Pixling => {
  const fresh = hatchPixling(() => 0, now)
  const laid = shinyEggOf(parent) !== null ? 1 : 0
  return {
    ...fresh,
    species: egg.species.id,
    name: egg.name,
    isShiny: egg.isShiny,
    persona: personaFor(egg.species.id, now),
    egg: egg.seed,
    line: { newer: egg.partner, side: parent.line.side === 'start' ? 'end' : 'start', isStart: false },
    family: [...parent.family, ancestorOf(parent, now)],
    dex: [...new Set([...parent.dex, egg.species.id])],
    badges: parent.badges,
    streak: parent.streak,
    tics: parent.tics,
    lifetime: { ...parent.lifetime, shinyEggs: parent.lifetime.shinyEggs + laid },
    // Hatched in a session already counted: the egg's first, but no new one for the person.
    stats: { ...fresh.stats, sessions: 1 },
  }
}

/** The egg a pixling hatched from, to draw its hatch: none for a first egg or a save from before. */
export const hatchLookOf = (p: Pixling): EggLook | null => {
  const species = speciesById(p.species)
  return p.egg !== null && species ? eggLookOf(p.egg, species.rarity, p.isShiny) : null
}
