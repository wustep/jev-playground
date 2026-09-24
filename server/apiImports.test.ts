import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Vercel runs /api/jev as Node ESM, which does not resolve an extensionless
// relative import: one missing `.js` and the function dies on cold start,
// before it has read a key, and the app quietly falls back to the stub. `tsc`
// and Vite both accept the extensionless form, so nothing else catches it.
//
// Rooted at the music modules the handler imports. The inbox and match
// modules on the same graph are not clean yet; widen ROOTS to api/jev.ts
// once they are.

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['src/planner/jev/requests.ts', 'src/planner/jev/systemOne.ts', 'src/plan/schema.ts']

/** Relative imports and re-exports that survive compilation: `import type` is erased and exempt. */
const RUNTIME_IMPORT = /^(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm

function walk(roots: readonly string[]) {
  const visited = new Set<string>()
  const extensionless: string[] = []
  const visit = (file: string) => {
    if (visited.has(file)) return
    visited.add(file)
    for (const [, spec] of readFileSync(resolve(repo, file), 'utf8').matchAll(RUNTIME_IMPORT)) {
      if (!spec.endsWith('.js')) {
        extensionless.push(`${file} → ${spec}`)
        continue
      }
      visit(relative(repo, resolve(repo, dirname(file), spec.replace(/\.js$/, '.ts'))))
    }
  }
  roots.forEach(visit)
  return { visited, extensionless }
}

describe('/api/jev import graph', () => {
  it('uses explicit .js extensions everywhere the music ops load at runtime', () => {
    const { visited, extensionless } = walk(ROOTS)
    expect(extensionless).toEqual([])
    // Guard against the walk passing because it found nothing.
    for (const file of ['src/plan/phrase.ts', 'src/plan/harmonyPhrases.ts', 'src/plan/styles.ts']) expect(visited).toContain(file)
  })
})
