// Shows what changed in Effortless's judge since plugins/pixlings/hooks/effort/judge.ts was copied from it.
// Usage: node tools/effort-sync.ts <path-to-effortless-checkout>
// Exit codes: 0 in step, 1 differs (or a name is missing), 2 usage or read error (nothing was compared).
//
// Compares by name, not position: the `// synced:` line in judge.ts lists the declarations to compare, and each is
// cut out of <checkout>/hooks/register.tsx and out of judge.ts. Both sides are normalised first: a leading `export `
// goes, a `!` right after the `]` of a `return EFFORTS[...]` goes, trailing whitespace goes. Those are the only edits
// judge.ts's header allows, so anything else that shows is a real change upstream (or in the copy).
//
// A declaration is cut out lexically: from its `const`/`let`/`function`/`async function` line (with or without
// `export`) to just before the next line at column 0 that isn't a continuation (`}`, `)`, `]`, or a line starting with
// a backtick), outside any template literal. A comment, another declaration or any other statement at column 0 ends it.
// Whether a line opens or closes a template literal is decided by its backticks, not counting ones inside a `//`
// comment or a '…' or "…" string. As a guard, a declaration over MAX_LINES lines on either side is taken for a failed
// cut: it prints `extraction looks wrong for <name>` and exits 2. Doc comments above a declaration aren't compared.
// Never writes anything.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_LINES = 200
const JUDGE = join(dirname(fileURLToPath(import.meta.url)), '../plugins/pixlings/hooks/effort/judge.ts')

const normalise = (line: string): string =>
  line
    .replace(/^export\s+/, '')
    .replace(/^(\s*return EFFORTS\[.*\])!(\s*;?)$/, '$1$2')
    .replace(/\s+$/, '')

// The names listed after `// synced:` in a source's header.
const syncedNames = (src: string): string[] => {
  const m = /^\/\/\s*synced:\s*(.+)$/m.exec(src)
  return m ? m[1]!.split(',').map(s => s.trim()).filter(Boolean) : []
}

// Number of backticks on a line that open or close a template literal: an odd count flips whether the next line is
// inside one. Escaped characters, '…' and "…" strings and a trailing // comment are not counted.
const backticks = (line: string): number =>
  (
    line
      .replace(/\\./g, '')
      .replace(/'[^']*'|"[^"]*"/g, '')
      .replace(/\/\/.*$/, '')
      .match(/`/g) ?? []
  ).length

// A top-level declaration of `name`, normalised and as lines, or undefined when the source has none.
const extract = (src: string, name: string): string[] | undefined => {
  const lines = src.split('\n')
  const head = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:const|let|function)\\s+${name}\\b`)
  const start = lines.findIndex(l => head.test(l))
  if (start < 0) return undefined
  let inTemplate = false
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    if (i > start && !inTemplate && line !== '' && !/^[\s})\]`]/.test(line)) {
      end = i
      break
    }
    if (backticks(line) % 2 === 1) inTemplate = !inTemplate
  }
  const body = lines.slice(start, end).map(normalise)
  while (body.length && body[body.length - 1] === '') body.pop()
  return body
}

// Unified diff of two line lists (LCS), three lines of context.
const unified = (a: string[], b: string[], aName: string, bName: string): string => {
  const n = a.length
  const m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const ops: { t: ' ' | '-' | '+'; s: string }[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push({ t: ' ', s: a[i++]! }), j++
    else if (i < n && (j === m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) ops.push({ t: '-', s: a[i++]! })
    else ops.push({ t: '+', s: b[j++]! })
  }
  const keep = ops.map((o, k) => o.t !== ' ' || ops.slice(Math.max(0, k - 3), k + 4).some(x => x.t !== ' '))
  const out = [`--- ${aName}`, `+++ ${bName}`]
  let gap = false
  ops.forEach((o, k) => {
    if (!keep[k]) return (gap = true), undefined
    if (gap) out.push('@@')
    gap = false
    out.push(o.t + o.s)
  })
  return out.join('\n')
}

const fail = (msg: string): never => {
  console.error(msg)
  return process.exit(2)
}

const read = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return fail(`cannot read ${path}`)
  }
}

const checkout = process.argv[2]
if (!checkout) fail('Usage: node tools/effort-sync.ts <path-to-effortless-checkout>')

const upstreamSrc = read(join(checkout!, 'hooks/register.tsx'))
const ours = read(JUDGE)

const names = syncedNames(ours)
if (!names.length) fail('no "// synced:" line in judge.ts')

// Best effort: a missing or broken plugin.json only costs the version line.
let upstreamVersion = 'unknown'
try {
  const v = (JSON.parse(readFileSync(join(checkout!, '.claude-plugin/plugin.json'), 'utf8')) as { version?: unknown }).version
  if (typeof v === 'string') upstreamVersion = v
} catch {}
const heard = /^\/\/\s*Version:\s*(\S+)/m.exec(ours)?.[1]

console.log(`Effortless upstream ${upstreamVersion}; judge.ts copied from ${heard ?? 'unknown'}`)

const cuts = names.map(name => ({ name, mine: extract(ours, name), theirs: extract(upstreamSrc, name) }))
for (const { name, mine, theirs } of cuts)
  if ((mine?.length ?? 0) > MAX_LINES || (theirs?.length ?? 0) > MAX_LINES) fail(`extraction looks wrong for ${name}`)

let bad = 0
for (const { name, mine, theirs } of cuts) {
  if (!theirs) {
    console.log(`missing upstream: ${name}`)
    bad++
  } else if (!mine) {
    console.log(`missing in judge.ts: ${name}`)
    bad++
  } else if (mine.join('\n') !== theirs.join('\n')) {
    console.log(`\n${unified(mine, theirs, `judge.ts ${name}`, `upstream ${name}`)}`)
    bad++
  }
}

console.log(bad ? `\n${bad} differ` : 'in step: nothing changed in the synced names')
process.exit(bad ? 1 : 0)
