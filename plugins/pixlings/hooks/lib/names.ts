// Names: the list a first egg's name comes from, and the blends every later one is made of: the
// start of one name joined to the end of another, so each pixling carries part of the one before.

export const NAMES: readonly string[] = [
  'Mochi', 'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Pip', 'Sprocket', 'Tofu', 'Noodle', 'Waffles',
  'Bean', 'Kiwi', 'Miso', 'Pickle', 'Gizmo', 'Dumpling', 'Boba', 'Chip', 'Cookie', 'Fig',
  'Juniper', 'Lumen', 'Nova', 'Orbit', 'Pebble', 'Quill', 'Rune', 'Tango', 'Echo', 'Ziggy',
  'Null', 'Sudo', 'Lambda', 'Kernel', 'Cache', 'Async', 'Regex', 'Grep', 'Bit', 'Loop',
  'Hex', 'Tux', 'Ping', 'Pong', 'Turbo', 'Wasabi', 'Yuzu', 'Mango', 'Olive', 'Clover',
]

const MAX_NAME = 24

/** A word's letters and digits, in lower case: a renamed "R2-D2" blends as "r2d2". */
const letters = (word: string): string => word.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

const words = (name: string): string[] => name.split(/\s+/).map(letters).filter(w => w.length > 0)

/** Up to and through the first vowel group; a word with no vowel is used whole. */
const startOf = (word: string): string => word.match(/^[^aeiouy]*[aeiouy]+/)?.[0] ?? word

/** From the consonants before the last vowel group to the end; a word with no vowel is used whole. */
const endOf = (word: string): string => word.match(/[^aeiouy]*[aeiouy]+[^aeiouy]*$/)?.[0] ?? word

/** The start of `start`'s first word joined to the end of `end`'s last: Mochi + Pixel is Moxel. */
export const blend = (start: string, end: string): string => {
  const head = startOf(words(start)[0] ?? '')
  let tail = endOf(words(end).at(-1) ?? '')
  // Two vowel runs meeting would read as one sound: the end's gives way.
  if (/[aeiouy]$/.test(head) && /^[aeiouy]/.test(tail)) tail = tail.replace(/^[aeiouy]+/, '') || tail
  const joined = (head + tail).slice(0, MAX_NAME) || 'pip'
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/** A name from the list this line hasn't used, or any once it has used them all. */
export const freshName = (random: () => number, used: readonly string[]): string => {
  const taken = new Set(used.map(n => n.toLowerCase()))
  const left = NAMES.filter(n => !taken.has(n.toLowerCase()))
  const pool = left.length > 0 ? left : NAMES
  return pool[Math.floor(random() * pool.length)] ?? 'Pip'
}
