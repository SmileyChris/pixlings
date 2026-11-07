/** What the band shows about the pixling; rewritten when it changes. */
export type PixlingsView = {
  name: string
  speciesId: string
  isShiny: boolean
  level: number
  xpInto: number
  xpNeed: number
  hat: string | null
  face: string | null
  neck: string | null
}

/** The speech bubble; `id` changes with every new line. */
export type PixlingsBubble = { text: string; id: number } | null

/** The rate-limit nap: when it ends and whether Claude is continued then. */
export type PixlingsNap = { until: number | null; isAuto: boolean; kind: string } | null

/** The minimal band's face, which follows the mood. */
export type PixlingsMood = string

/** One piece of the vitals row: its text and how it should be colored. */
export type PixlingsVital = { text: string; tone: 'good' | 'warn' | 'bad' | 'cold' | 'dim' }

/** The prompt cache as the pixling has seen it this session (lib/vitals.ts Cache). */
export type PixlingsCache = {
  lastAt: number | null
  ttl: '5m' | '1h'
  isTtlKnown: boolean
  context: number
  read: number
  written: number
  uncached: number
  coldStarts: number
  rewritten: number
  longHits?: number
  isTtlFromSwitch?: boolean
} | null

// v0.3, wave 2. Each block below belongs to one slice; a slice changes only its own block.

// --- buddy bridge and commands (W5) ---

/** The pixling's one-line personality, from a template or an adopted Buddy; null before hatching. */
export type PixlingsPersona = string | null

// --- reactions and the squad (W6) ---

/**
 * One subagent's mini while it works, and for MINI_LEAVE_MS (lib/canvas.ts) after it finishes,
 * oldest first. lib/canvas.ts `renderMini` draws one; `miniTint(label)` is its color.
 */
export type PixlingsMini = {
  agentId: string
  /** The subagent's type as the engine names it ("Explore", "general-purpose", a plugin's). */
  label: string
  /** The species of the pixling the helper works for. */
  speciesId: string
  startedAt: number
  doneAt: number | null
}

/**
 * The last short effect played over the pixling, `at` when it began: `squish` (a compaction
 * started), `relief` (it ended), `sweat` (the context crossed 85%), `thinkingCap` (plan mode
 * began), `capOff` (it ended), `highFive` (a subagent finished).
 */
export type PixlingsEffect = { kind: string; at: number } | null

// --- every surface (W7) ---

/** The room pane: which shelf is showing. */
export type PixlingsRoom = { tab: string }

// --- auto effort ---

/** The effort level in force and who decided it (named: the prompt said the level); null before the first pick. */
export type PixlingsEffortPick = { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; why: string; by: 'haiku' | 'named' | 'manual' } | null

/** Auto effort is on: Haiku judges each prompt's effort. */
export type PixlingsEffortAuto = boolean

/** Auto's last change of level, drawn as arrows until `until` (ms on the session clock). */
export type PixlingsEffortShift = { from: string; to: string; until: number } | null

/** The element each site's focus ring is on (`requestId` → `key`), so the gate draws a focused A as it rests. */
export type PixlingsGateFocus = Record<string, string | null>

declare module 'claude-code' {
  interface PluginState {
    pixlings: {
      view: PixlingsView | null
      bubble: PixlingsBubble
      nap: PixlingsNap
      hatchAt: number | null
      mood: PixlingsMood
      vitals: PixlingsVital[]
      cache: PixlingsCache
      // W5
      persona: PixlingsPersona
      isAway: boolean
      // W6
      squad: PixlingsMini[]
      isPlanning: boolean
      effect: PixlingsEffect
      // W7
      room: PixlingsRoom
      /** The room is open: the band leaves out its door to it. */
      isRoomOpen: boolean
      /** The birth time of the pixling whose nest `/pixling hatch` opened in the room; null when closed. */
      nest: number | null
      // auto effort
      effortPick: PixlingsEffortPick
      effortAuto: PixlingsEffortAuto
      effortShift: PixlingsEffortShift
      gateFocus: PixlingsGateFocus
    }
  }
}
