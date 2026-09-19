import { readdirSync, readFileSync } from 'node:fs'
import { parsePlan } from '../src/plan/schema'

const dir = 'docs/fable-context/reference-plans'
let failed = 0
for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) as { plan: unknown }
  try {
    const plan = parsePlan(raw.plan)
    console.log('ok', name, plan.style, plan.bars.length)
  } catch (error) {
    failed += 1
    console.error('FAIL', name, error instanceof Error ? error.message : error)
  }
}
if (failed) process.exit(1)
